/**
 * Live smoke test of the Supabase adapter against a real project. Skipped unless
 * SUPABASE_LIVE_URL + SUPABASE_LIVE_KEY are set (never runs in CI by default).
 *   SUPABASE_LIVE_URL=… SUPABASE_LIVE_KEY=<publishable key> npx jest src/data/supabase/__live__
 */
import { createClient } from '@supabase/supabase-js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';

import { uuid } from '@/lib/id';

import { createRepositoryFromClient } from '../index';

const url = process.env.SUPABASE_LIVE_URL;
const key = process.env.SUPABASE_LIVE_KEY;
const live = url && key ? describe : describe.skip;

// The jest-expo environment replaces fetch with a React Native stub; use a real HTTP client
// (through HTTPS_PROXY when one is set) so this test talks to the network.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
const realFetch = ((input: string, init?: Record<string, unknown>) =>
  nodeFetch(input, { ...(init ?? {}), agent } as never)) as unknown as typeof fetch;
const client = () => createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: realFetch } });

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k) };
};

live('Supabase adapter (live project)', () => {
  jest.setTimeout(60_000);

  it('signs in a therapist and loads Today, a brief, caseload and progress', async () => {
    const sb = client();
    const repo = createRepositoryFromClient(sb, { store: memory(), readFile: async () => new ArrayBuffer(0) });
    const user = await repo.auth.signInWithPassword('riya@anvaya.demo', 'Demo@1234');
    const m = user.memberships[0];
    repo.setContext({ userId: user.profile.id, role: m.role, organizationId: m.organizationId });
    expect(m.role).toBe('therapist');

    const today = await repo.dashboards.therapistToday();
    expect(today.appointments.length).toBeGreaterThan(0);
    const brief = await repo.sessions.brief(today.appointments[0].id);
    expect(brief.child.fullName).toBeTruthy();
    const kids = await repo.children.list({ therapistId: user.profile.id });
    expect(kids.length).toBeGreaterThan(0);
    const progress = await repo.progress.staff(kids[0].child.id);
    expect(progress.sessions.length).toBeGreaterThan(0);
    const queue = await repo.homePractice.reviewQueue();
    expect(Array.isArray(queue)).toBe(true);
    console.log(`today=${today.appointments.length} caseload=${kids.length} sessions=${progress.sessions.length} reviews=${queue.length} brief=${brief.child.fullName}`);
  });

  it('saves a session log (metrics computed server-side) and reads it back', async () => {
    const repo = createRepositoryFromClient(client(), { store: memory(), readFile: async () => new ArrayBuffer(0) });
    const user = await repo.auth.signInWithPassword('riya@anvaya.demo', 'Demo@1234');
    const m = user.memberships[0];
    repo.setContext({ userId: user.profile.id, role: m.role, organizationId: m.organizationId });
    const today = await repo.dashboards.therapistToday();
    const target = today.appointments.find((a) => !a.sessionId && !a.briefRequired);
    if (!target) return; // everything already logged today
    const dims = await repo.org.listRatingDimensions(m.organizationId!);
    const ratings = Object.fromEntries(dims.filter((d) => d.enabled).map((d) => [d.key, 4])) as Record<string, 4>;
    const log = await repo.sessions.save({
      clientId: uuid(),
      appointmentId: target.id,
      actualMinutes: 45,
      startedLate: false,
      regulationState: 'regulated',
      ratings,
      goalTrials: [],
      incidents: [],
      breaksCount: 0,
      comparedToLast: 'same',
      workedTags: ['visual_schedule'],
      workedText: '',
      notWorkedTags: [],
      notWorkedText: '',
      notes: { subjective: '', objective: 'Live test', assessment: '', planNext: 'Continue plan.', planGoalIds: [], parentSummary: 'A settled session.' },
    });
    expect(log.metrics.sessionScore).toBe(75);
    const back = await repo.sessions.get(log.id);
    expect(back.notes.planNext).toBe('Continue plan.');
    console.log(`saved session score=${log.metrics.sessionScore} deltaLast=${log.metrics.deltaLast} trend=${log.metrics.trend}`);
  });

  it('signs in a school admin and loads the dashboard and people', async () => {
    const sb = client();
    const repo = createRepositoryFromClient(sb, { store: memory(), readFile: async () => new ArrayBuffer(0) });
    const user = await repo.auth.signInWithPassword('sunita@anvaya.demo', 'Demo@1234');
    const m = user.memberships[0];
    repo.setContext({ userId: user.profile.id, role: m.role, organizationId: m.organizationId });
    const dash = await repo.dashboards.admin();
    const members = await repo.org.listMembers(m.organizationId!);
    expect(members.length).toBeGreaterThan(5);
    console.log(`admin: scheduled=${dash.today.scheduled} attention=${dash.childrenNeedingAttention.length} members=${members.length}`);
  });
});
