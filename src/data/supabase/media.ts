/**
 * Media in the PRIVATE `media` bucket: `{org_id}/{child_id}/{uuid}.{ext}` plus a public.media row.
 * Playback only through short-lived signed URLs (10 minutes); never public links.
 *
 * The storage policy needs the child in the path. MediaRepo.upload's input has no child yet, so
 * callers may pass `childId` (see SupabaseMediaUploadInput); otherwise a parent's only linked child
 * is used, and anything ambiguous is a validation error rather than a guess.
 */
import { uuid } from '@/lib/id';
import type { Media, UUID } from '@/domain/types';

import { RepoError, type MediaRepo } from '../repository';
import type { AdapterContext } from './context';
import { toRepoError } from './errors';
import { mediaFromRow } from './mappers';
import { maybe, single } from './query';
import type { ConsentRow, MediaRow } from './rows';

export const MEDIA_BUCKET = 'media';
export const SIGNED_URL_SECONDS = 600;

export type MediaUploadInput = Parameters<MediaRepo['upload']>[0];
/** Upload input plus the child the file belongs to (required by the bucket's path policy). */
export type SupabaseMediaUploadInput = MediaUploadInput & { childId?: UUID };

export type FileReader = (localUri: string) => Promise<ArrayBuffer>;

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export function extensionFor(mimeType: string, localUri: string): string {
  const known = EXT_BY_MIME[mimeType.toLowerCase()];
  if (known) return known;
  const m = /\.([a-z0-9]{2,5})(?:\?.*)?$/i.exec(localUri);
  return m ? m[1].toLowerCase() : 'bin';
}

export function mediaPath(orgId: UUID, childId: UUID, id: UUID, ext: string): string {
  return `${orgId}/${childId}/${id}.${ext}`;
}

async function resolveChild(c: AdapterContext, explicit?: UUID): Promise<UUID> {
  if (explicit) return explicit;
  if (c.isParent()) {
    const ids = await c.guardianChildIds();
    if (ids.length === 1) return ids[0];
  }
  throw new RepoError('validation', 'Which child is this file for? (childId is required)');
}

/** Latest video-upload consent of the caller for this child (or a child-agnostic one). */
async function hasVideoConsent(c: AdapterContext, childId: UUID): Promise<boolean> {
  const row = await maybe<Pick<ConsentRow, 'granted'>>(
    c.sb
      .from('consents')
      .select('granted')
      .eq('user_id', c.requireUserId())
      .eq('kind', 'video_upload')
      .or(`child_id.eq.${childId},child_id.is.null`)
      .order('at', { ascending: false })
      .limit(1),
  );
  return !!row?.granted;
}

export async function uploadMedia(
  c: AdapterContext,
  readFile: FileReader,
  input: SupabaseMediaUploadInput,
  onProgress?: (p: number) => void,
): Promise<Media> {
  const orgId = c.requireOrg();
  const childId = await resolveChild(c, input.childId);
  if (c.isParent() && input.kind === 'video' && !(await hasVideoConsent(c, childId))) {
    throw new RepoError('consent_required', 'Video upload consent has not been given');
  }
  const report = (p: number) => {
    try {
      onProgress?.(p);
    } catch {
      // progress is best effort
    }
  };
  const id = uuid();
  const path = mediaPath(orgId, childId, id, extensionFor(input.mimeType, input.localUri));
  report(0);
  let body: ArrayBuffer;
  try {
    body = await readFile(input.localUri);
  } catch (e) {
    throw new RepoError('validation', `Could not read the file to upload: ${e instanceof Error ? e.message : String(e)}`);
  }
  report(0.15);
  const { error } = await c.sb.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: input.mimeType, upsert: false });
  if (error) throw toRepoError(error);
  report(0.9);

  const settings = await c.orgSettings(orgId);
  const expiresAt =
    input.kind === 'video' ? new Date(c.now().getTime() + settings.videoRetentionDays * 86_400_000).toISOString() : null;
  try {
    const row = await single<MediaRow>(
      c.sb
        .from('media')
        .insert({
          id,
          organization_id: orgId,
          owner_id: c.requireUserId(),
          child_id: childId,
          bucket_path: path,
          kind: input.kind,
          mime_type: input.mimeType,
          duration_s: input.durationS ?? null,
          size_bytes: input.sizeBytes || body.byteLength,
          expires_at: expiresAt,
          upload_status: 'uploaded',
        })
        .select('*'),
      'media',
    );
    report(1);
    return mediaFromRow(row);
  } catch (e) {
    // No row → the object would be an orphan; remove it now (the nightly sweep is the backstop).
    await c.sb.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
    throw e;
  }
}

export function createMediaRepo(c: AdapterContext, readFile: FileReader): MediaRepo {
  return {
    upload: (input: SupabaseMediaUploadInput, onProgress) => uploadMedia(c, readFile, input, onProgress),

    async playbackUrl(mediaId) {
      const row = await single<Pick<MediaRow, 'bucket_path'>>(c.sb.from('media').select('bucket_path').eq('id', mediaId), 'media');
      const { data, error } = await c.sb.storage.from(MEDIA_BUCKET).createSignedUrl(row.bucket_path, SIGNED_URL_SECONDS);
      if (error || !data?.signedUrl) throw error ? toRepoError(error) : new RepoError('not_found', 'media file not found');
      return data.signedUrl;
    },

    async get(mediaId) {
      return mediaFromRow(await single<MediaRow>(c.sb.from('media').select('*').eq('id', mediaId), 'media'));
    },
  };
}
