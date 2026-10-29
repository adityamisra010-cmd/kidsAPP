/**
 * media-retention — deletes parent practice videos (and other media) past their retention date.
 *
 * Schedule: daily at 03:00 IST (see ../README.md).
 *
 * `media.expires_at` is set on upload from the school's videoRetentionDays (default 180 days).
 * For every expired row: remove the object from the private `media` bucket through the Storage
 * API (deleting storage.objects rows directly would orphan the file), then delete the row.
 * home_logs.media_id / home_tasks.demo_media_id are cleared by their ON DELETE SET NULL keys.
 * Rows are only deleted once their object is confirmed gone, so a failed run is simply retried.
 *
 * Second pass: files with no `media` row (public.orphaned_media_objects, service role only) —
 * e.g. a child deleted on a deletion request (its media rows cascade) or an abandoned upload
 * older than a day — are removed from the bucket too.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
 */
import { adminClient, chunk, json, rejectUnlessCron } from '../_shared/runtime.ts';

const BUCKET = 'media';
const BATCH = 1000;

interface ExpiredMedia {
  id: string;
  bucket_path: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  const db = adminClient();
  const { data, error } = await db
    .from('media')
    .select('id, bucket_path')
    .lt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);
  const expired = (data ?? []) as ExpiredMedia[];

  let deletedObjects = 0;
  let deletedRows = 0;
  const errors: string[] = [];

  for (const group of chunk(expired, 100)) {
    const { data: removed, error: removeError } = await db.storage.from(BUCKET).remove(group.map((m) => m.bucket_path));
    if (removeError) {
      errors.push(removeError.message);
      continue;
    }
    deletedObjects += removed?.length ?? 0;
    // remove() succeeds for paths that no longer exist, so every row in the group can go.
    const { error: deleteError, count } = await db
      .from('media')
      .delete({ count: 'exact' })
      .in('id', group.map((m) => m.id));
    if (deleteError) errors.push(deleteError.message);
    else deletedRows += count ?? 0;
  }

  // Orphaned files (no media row any more).
  let orphansRemoved = 0;
  const { data: orphanRows, error: orphanError } = await db.rpc('orphaned_media_objects', { p_limit: BATCH });
  if (orphanError) {
    errors.push(orphanError.message);
  } else {
    const orphans = ((orphanRows ?? []) as { name: string }[]).map((o) => o.name);
    for (const group of chunk(orphans, 100)) {
      const { data: removed, error: removeError } = await db.storage.from(BUCKET).remove(group);
      if (removeError) errors.push(removeError.message);
      else orphansRemoved += removed?.length ?? 0;
    }
  }

  return json({ expired: expired.length, deletedObjects, deletedRows, orphansRemoved, errors }, errors.length ? 207 : 200);
});
