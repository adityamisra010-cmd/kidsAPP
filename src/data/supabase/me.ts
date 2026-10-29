/** The signed-in user's own profile, push tokens, consents, privacy requests and mutes. */
import { UNMUTABLE_NOTIFICATION_KINDS, type DataRequest, type NotificationKind, type UUID } from '@/domain/types';

import type { MeRepo } from '../repository';
import type { AdapterContext } from './context';
import { compact, consentFromRow, dataRequestFromRow, profileFromRow } from './mappers';
import { done, many, single } from './query';
import type { ConsentRow, DataRequestRow, ProfileRow } from './rows';

export function createMeRepo(c: AdapterContext): MeRepo {
  const sb = c.sb;

  async function dataRequest(childId: UUID, kind: DataRequest['kind']): Promise<DataRequest> {
    const uid = c.requireUserId();
    const row = await single<DataRequestRow & { child: { full_name: string } | null }>(
      sb.from('data_requests').insert({ user_id: uid, child_id: childId, kind }).select('*, child:children(full_name)'),
      'data request',
    );
    const names = await c.names([uid]);
    return dataRequestFromRow(row, names.get(uid) ?? '', row.child?.full_name ?? '');
  }

  return {
    async updateProfile(patch) {
      const uid = c.requireUserId();
      const row = await single<ProfileRow>(
        sb
          .from('profiles')
          .update(
            compact({
              full_name: patch.fullName?.trim(),
              email: patch.email === undefined ? undefined : patch.email.trim() || null,
              avatar_url: patch.avatarUrl === undefined ? undefined : patch.avatarUrl || null,
              preferred_language: patch.preferredLanguage,
            }),
          )
          .eq('id', uid)
          .select('*'),
        'profile',
      );
      const profile = profileFromRow(row);
      c.rememberName(uid, profile.fullName);
      const user = c.getUser();
      if (user && user.profile.id === uid) c.setUser({ ...user, profile });
      return profile;
    },

    async registerPushToken(token, platform) {
      const uid = c.requireUserId();
      await done(
        sb
          .from('push_tokens')
          .upsert({ user_id: uid, token, platform, last_seen_at: c.now().toISOString() }, { onConflict: 'user_id,token' }),
      );
    },

    async listConsents() {
      const uid = c.requireUserId();
      const rows = await many<ConsentRow>(sb.from('consents').select('*').eq('user_id', uid).order('at', { ascending: false }));
      return rows.map(consentFromRow);
    },

    async recordConsent(input) {
      const uid = c.requireUserId();
      const row = await single<ConsentRow>(
        sb
          .from('consents')
          .insert({ user_id: uid, child_id: input.childId ?? null, kind: input.kind, granted: input.granted, version: input.version })
          .select('*'),
        'consent',
      );
      return consentFromRow(row);
    },

    requestDataExport: (childId) => dataRequest(childId, 'export'),
    requestDeletion: (childId) => dataRequest(childId, 'deletion'),

    async getMutedNotificationKinds() {
      const uid = c.requireUserId();
      const rows = await many<{ kind: NotificationKind }>(sb.from('notification_mutes').select('kind').eq('user_id', uid));
      return rows.map((r) => r.kind);
    },

    async setMutedNotificationKinds(kinds) {
      const uid = c.requireUserId();
      // Schedule changes can never be muted (also enforced by a check constraint).
      const wanted = [...new Set(kinds)].filter((k) => !UNMUTABLE_NOTIFICATION_KINDS.includes(k));
      let del = sb.from('notification_mutes').delete().eq('user_id', uid);
      if (wanted.length) del = del.not('kind', 'in', `(${wanted.join(',')})`);
      await done(del);
      if (wanted.length) {
        await done(
          sb
            .from('notification_mutes')
            .upsert(wanted.map((kind) => ({ user_id: uid, kind })), { onConflict: 'user_id,kind', ignoreDuplicates: true }),
        );
      }
    },
  };
}
