/** Organisations, settings, therapy types, rating dimensions, people, memberships, consents, invites. */
import { CONSENT_VERSION, DEFAULT_DIMENSIONS, DEFAULT_ORG_SETTINGS, DEFAULT_THERAPY_TYPES } from '@/domain/constants';
import type { Membership, Organization, Profile } from '@/domain/types';
import { stableId } from '@/lib/id';

import { demoPhone } from '../../rng';
import { GOAL_BANK } from '../content/goalBank';
import { holidaysAround } from '../content/calendar';
import { at, ids, minutesAgo, type Build } from './context';

const PLATFORM_ADMIN: Profile = {
  id: ids.platformAdmin(),
  fullName: 'Kabir Anand',
  phone: '+919800000005',
  email: 'kabir@mykidstracker.demo',
  preferredLanguage: 'en',
  title: 'Platform Admin',
};

export function buildPeople(b: Build): void {
  const st = b.store;
  st.profiles.push(PLATFORM_ADMIN);
  st.memberships.push({ id: stableId('membership:platform:kabir'), userId: PLATFORM_ADMIN.id, organizationId: null, role: 'platform_admin', status: 'active' });
  st.credentials.push({ email: PLATFORM_ADMIN.email!, userId: PLATFORM_ADMIN.id });
  st.personas.push({ key: 'platform_admin', userId: PLATFORM_ADMIN.id });

  // Global (platform template) dimensions.
  for (const d of DEFAULT_DIMENSIONS) st.dimensions.push({ ...d, id: ids.dimension('global', d.key), organizationId: null });
  for (const g of GOAL_BANK) {
    st.goalBank.push({ id: ids.bank(g.key), organizationId: null, domain: g.domain, therapyTypeKey: g.type, staffText: g.staff, parentText: g.parent });
  }

  for (const s of b.schools) {
    const orgId = ids.org(s.key);
    const org: Organization = {
      id: orgId,
      name: s.name,
      shortName: s.shortName,
      city: s.city,
      address: s.address,
      phone: s.phone,
      email: s.email,
      status: 'active',
      settings: {
        ...DEFAULT_ORG_SETTINGS,
        parentsSeeNumericScore: s.parentsSeeNumericScore,
        holidays: holidaysAround(b.today, s.region),
      },
      createdAt: at(b, s.key === 'anvaya' ? -420 : -300, '10:00'),
    };
    st.organizations.push(org);

    const usedTypes = new Set<string>(s.children.flatMap((c) => c.therapies.map((t) => t.type)));
    for (const tt of DEFAULT_THERAPY_TYPES) {
      st.therapyTypes.push({ id: ids.therapyType(s.key, tt.key), organizationId: orgId, key: tt.key, name: tt.name, color: tt.color, icon: tt.icon, active: usedTypes.has(tt.key) });
    }
    for (const d of DEFAULT_DIMENSIONS) st.dimensions.push({ ...d, id: ids.dimension(s.key, d.key), organizationId: orgId });

    for (const p of s.staff) {
      const userId = ids.staff(s.key, p.key);
      st.profiles.push({ id: userId, fullName: p.fullName, phone: p.phone ?? demoPhone(`${s.key}:${p.key}`), email: p.email, preferredLanguage: 'en', title: p.title });
      st.memberships.push(membership(userId, orgId, p.role));
      st.credentials.push({ email: p.email, userId });
      if (p.persona) st.personas.push({ key: p.persona, userId });
      for (const q of p.qualifications ?? []) st.qualifications.push({ organizationId: orgId, userId, therapyTypeId: ids.therapyType(s.key, q) });
    }

    for (const p of s.parents) {
      const userId = ids.parent(s.key, p.key);
      st.profiles.push({ id: userId, fullName: p.fullName, phone: p.phone ?? demoPhone(`${s.key}:${p.key}`), preferredLanguage: p.language ?? 'en' });
      st.memberships.push(membership(userId, orgId, 'parent'));
      if (p.persona) st.personas.push({ key: p.persona, userId });
      if (p.noConsent) continue;
      const children = s.children.filter((c) => c.guardians.some((g) => g.parent === p.key));
      for (const c of children) {
        const childId = ids.child(s.key, c.key);
        for (const kind of ['data_processing', 'video_upload'] as const) {
          st.consents.push({ id: stableId(`consent:${userId}:${childId}:${kind}`), userId, childId, kind, granted: true, at: at(b, -150, '19:30'), version: CONSENT_VERSION });
        }
        if (p.withdrewVideoConsent) {
          st.consents.push({ id: stableId(`consent:${userId}:${childId}:video_upload:withdrawn`), userId, childId, kind: 'video_upload', granted: false, at: at(b, -18, '21:05'), version: CONSENT_VERSION });
        }
      }
    }
  }

  buildInvites(b);
}

function membership(userId: string, organizationId: string, role: Membership['role']): Membership {
  return { id: stableId(`membership:${organizationId}:${userId}`), userId, organizationId, role, status: 'active' };
}

function buildInvites(b: Build): void {
  const anvaya = ids.org('anvaya');
  const sahaj = ids.org('sahaj');
  b.store.invites.push(
    { id: stableId('invite:anvaya:farah'), organizationId: anvaya, role: 'therapist', fullName: 'Farah Khan', phone: demoPhone('invite:farah'), email: 'farah@anvaya.demo', childIds: [], status: 'pending', createdAt: minutesAgo(b, 60 * 26), createdBy: ids.staff('anvaya', 'sunita') },
    { id: stableId('invite:anvaya:gaurav'), organizationId: anvaya, role: 'parent', fullName: 'Gaurav Kapoor', phone: demoPhone('invite:gaurav'), childIds: [ids.child('anvaya', 'myra')], relation: 'Father', status: 'pending', createdAt: minutesAgo(b, 60 * 50), createdBy: ids.staff('anvaya', 'meera') },
    { id: stableId('invite:anvaya:old'), organizationId: anvaya, role: 'parent', fullName: 'Priya Sharma', phone: '+919800000001', childIds: [ids.child('anvaya', 'aarav'), ids.child('anvaya', 'anaya')], relation: 'Mother', status: 'accepted', createdAt: at(b, -160, '11:00'), createdBy: ids.staff('anvaya', 'sunita') },
    { id: stableId('invite:sahaj:rakesh'), organizationId: sahaj, role: 'parent', fullName: 'Rakesh Shetty', phone: demoPhone('invite:rakesh'), childIds: [ids.child('sahaj', 'lavanya')], relation: 'Father', status: 'pending', createdAt: minutesAgo(b, 60 * 72), createdBy: ids.staff('sahaj', 'shalini') },
  );
}
