/**
 * Resource library. `resources.url` is either an external link or an object path in the private
 * `resources` bucket; paths are turned into short-lived signed URLs (one batched call per list).
 */
import type { Resource, ResourceShare, UUID } from '@/domain/types';

import { RepoError, type ResourcesRepo } from '../repository';
import type { AdapterContext } from './context';
import { compact, resourceFromRow, resourceShareFromRow } from './mappers';
import { ilikeAny, many, searchTerm, single } from './query';
import type { ResourceRow, ResourceShareRow } from './rows';

export const RESOURCES_BUCKET = 'resources';
/** Resource links are opened from lists that may sit in the query cache for a while. */
export const RESOURCE_URL_SECONDS = 3600;

export function isStoragePath(url: string): boolean {
  return !!url && !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

/** Resources with storage paths replaced by signed URLs (unsignable paths are left as-is). */
export async function withSignedUrls(c: AdapterContext, rows: ResourceRow[]): Promise<Resource[]> {
  const paths = [...new Set(rows.map((r) => r.url).filter(isStoragePath))];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await c.sb.storage.from(RESOURCES_BUCKET).createSignedUrls(paths, RESOURCE_URL_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) signed.set(d.path, d.signedUrl);
  }
  return rows.map((r) => resourceFromRow(r, signed.get(r.url) ?? r.url));
}

export function createResourcesRepo(c: AdapterContext): ResourcesRepo {
  const sb = c.sb;

  async function sharesWithNames(rows: ResourceShareRow[]): Promise<ResourceShare[]> {
    const names = await c.names(rows.map((r) => r.shared_by));
    return rows.map((r) => resourceShareFromRow(r, names.get(r.shared_by) ?? ''));
  }

  return {
    async list(filter) {
      const org = c.orgOrNull();
      let q = sb.from('resources').select('*');
      if (filter?.kind) q = q.eq('kind', filter.kind);
      if (filter?.therapyTypeKey) q = q.contains('therapy_type_keys', [filter.therapyTypeKey]);
      if (filter?.domain) q = q.contains('domains', [filter.domain]);
      const term = searchTerm(filter?.search);
      if (term) q = q.or(ilikeAny(['title', 'description'], term));
      const rows = await many<ResourceRow>(q.order('title').limit(1000));
      // RLS already hides staff-only material from parents; keep this school's + global items.
      return withSignedUrls(c, rows.filter((r) => r.organization_id == null || r.organization_id === org));
    },

    async get(id) {
      const [r] = await withSignedUrls(c, [await single<ResourceRow>(sb.from('resources').select('*').eq('id', id), 'resource')]);
      return r;
    },

    async create(input) {
      const row = await single<ResourceRow>(
        sb
          .from('resources')
          .insert(
            compact({
              organization_id: c.requireOrg(),
              title: input.title.trim(),
              description: input.description?.trim() ?? '',
              kind: input.kind,
              url: input.url.trim(),
              tags: input.tags ?? [],
              therapy_type_keys: input.therapyTypeKeys ?? [],
              domains: input.domains ?? [],
              age_band: input.ageBand ?? null,
              audience: input.audience,
            }),
          )
          .select('*'),
        'resource',
      );
      return (await withSignedUrls(c, [row]))[0];
    },

    async share(resourceId, target, note) {
      if (!target.childId && !target.userId) throw new RepoError('validation', 'Share with a child or a person');
      const row = await single<ResourceShareRow>(
        sb
          .from('resource_shares')
          .insert({
            organization_id: c.requireOrg(),
            resource_id: resourceId,
            child_id: target.childId ?? null,
            user_id: target.userId ?? null,
            shared_by: c.requireUserId(),
            note: note?.trim() || null,
          })
          .select('*'),
        'share',
      );
      return (await sharesWithNames([row]))[0];
    },

    async forParent(childId) {
      const uid = c.requireUserId();
      const org = c.orgOrNull();
      const [shares, resources] = await Promise.all([
        many<ResourceShareRow>(sb.from('resource_shares').select('*').or(`child_id.eq.${childId},user_id.eq.${uid}`).order('at', { ascending: false })),
        many<ResourceRow>(sb.from('resources').select('*').neq('audience', 'staff').order('title').limit(1000)),
      ]);
      const shareByResource = new Map<UUID, ResourceShareRow>();
      for (const s of shares) if (!shareByResource.has(s.resource_id)) shareByResource.set(s.resource_id, s);
      const sharedIds = [...shareByResource.keys()];
      // Shared items can be staff-audience rows that RLS exposes only through the share.
      const missing = sharedIds.filter((id) => !resources.some((r) => r.id === id));
      const extra = missing.length ? await many<ResourceRow>(sb.from('resources').select('*').in('id', missing)) : [];
      const visible = [...resources, ...extra].filter(
        (r) => shareByResource.has(r.id) || (r.audience === 'parents' && (r.organization_id == null || r.organization_id === org)),
      );
      const [signed, shareList] = await Promise.all([withSignedUrls(c, visible), sharesWithNames([...shareByResource.values()])]);
      const shareMap = new Map(shareList.map((s) => [s.resourceId, s]));
      return signed
        .map((r) => ({ ...r, share: shareMap.get(r.id) }))
        .sort((a, b) => Number(!!b.share) - Number(!!a.share) || (b.share?.at ?? '').localeCompare(a.share?.at ?? '') || a.title.localeCompare(b.title));
    },
  };
}
