/**
 * Resource library seed. `school: null` = global (platform-provided). PDF/video URLs point to the
 * placeholder demo host; links point to stable public pages.
 */
import type { GoalDomain, Resource } from '@/domain/types';

const HOST = 'https://demo.mykidstracker.app/resources';

export interface ResourceSeed extends Omit<Resource, 'id' | 'organizationId' | 'createdAt'> {
  key: string;
  school: 'anvaya' | 'sahaj' | null;
  daysAgo: number;
  /** Shares: child key + staff key who shared it. */
  shares?: { child: string; by: string; note: string }[];
}

const d = (...domains: GoalDomain[]) => domains;

export const RESOURCES: ResourceSeed[] = [
  { key: 'visual-schedule-pack', school: null, daysAgo: 120, title: 'Visual schedule starter pack', description: 'Printable picture cards for morning, school and bedtime routines, with a first–then board.', kind: 'pdf', url: `${HOST}/visual-schedule-starter-pack.pdf`, tags: ['visual supports', 'routines', 'printable'], therapyTypeKeys: ['behaviour', 'special_ed', 'speech'], domains: d('behaviour', 'communication'), ageBand: '3-6', audience: 'all' },
  { key: 'first-50-words', school: null, daysAgo: 110, title: 'First words: 50 everyday words to model at home', description: 'A simple list of useful first words in English and Hindi, with ideas for when to use them during the day.', kind: 'pdf', url: `${HOST}/first-50-words-en-hi.pdf`, tags: ['first words', 'language', 'home ideas'], therapyTypeKeys: ['speech'], domains: d('communication'), ageBand: '0-3', audience: 'parents', shares: [{ child: 'myra', by: 'riya', note: 'Please stick this on the fridge and use 2–3 words a day.' }] },
  { key: 'cdc-milestones', school: null, daysAgo: 100, title: 'Developmental milestones checklist', description: 'What most children do by each age, from 2 months to 5 years (CDC).', kind: 'link', url: 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html', tags: ['milestones', 'development'], therapyTypeKeys: [], domains: d('communication', 'gross_motor', 'social'), ageBand: '0-3', audience: 'all' },
  { key: 'asha-speech-dev', school: null, daysAgo: 95, title: 'Speech and language development: what to expect', description: 'Plain-language guide to how speech and language develop, from ASHA.', kind: 'link', url: 'https://www.asha.org/public/speech/development/', tags: ['speech', 'language', 'parents'], therapyTypeKeys: ['speech'], domains: d('communication'), ageBand: '3-6', audience: 'parents' },
  { key: 'sensory-diet', school: null, daysAgo: 90, title: 'Sensory diet ideas for home', description: 'Calming and alerting activities you can do with things already at home (pillows, blankets, atta dough).', kind: 'pdf', url: `${HOST}/sensory-diet-at-home.pdf`, tags: ['sensory', 'regulation', 'home ideas'], therapyTypeKeys: ['occupational'], domains: d('sensory'), ageBand: '3-6', audience: 'all', shares: [{ child: 'arnav', by: 'neha', note: 'Heavy-work ideas on page 2 work really well for Arnav.' }] },
  { key: 'handwriting-warmups', school: null, daysAgo: 80, title: 'Handwriting warm-ups (5-minute video)', description: 'Hand and finger warm-ups to do before homework.', kind: 'video', url: `${HOST}/handwriting-warmups.mp4`, tags: ['handwriting', 'fine motor'], therapyTypeKeys: ['occupational', 'special_ed'], domains: d('fine_motor'), ageBand: '6-10', audience: 'all' },
  { key: 'pecs-at-home', school: null, daysAgo: 70, title: 'Using picture cards (PECS) at home', description: 'A 5-minute video showing how to set up picture-card requests at snack time.', kind: 'video', url: `${HOST}/pecs-at-home.mp4`, tags: ['PECS', 'AAC', 'requesting'], therapyTypeKeys: ['speech'], domains: d('communication'), ageBand: '3-6', audience: 'parents', shares: [{ child: 'rahul', by: 'lakshmi', note: 'This is the snack-time routine we use in session.' }] },
  { key: 'udid-guide', school: null, daysAgo: 60, title: 'UDID card and disability benefits: a parent guide', description: 'How to apply for the Unique Disability ID (UDID) card and which benefits it unlocks.', kind: 'link', url: 'https://www.swavlambancard.gov.in/', tags: ['UDID', 'benefits', 'government schemes'], therapyTypeKeys: [], domains: [], audience: 'parents' },
  { key: 'anvaya-handbook', school: 'anvaya', daysAgo: 150, title: 'Anvaya parent handbook 2026', description: 'Timings, attendance and make-up policy, contact numbers and what to bring for sessions.', kind: 'pdf', url: `${HOST}/anvaya-parent-handbook-2026.pdf`, tags: ['policies', 'handbook'], therapyTypeKeys: [], domains: [], audience: 'parents' },
  { key: 'anvaya-toilet', school: 'anvaya', daysAgo: 45, title: 'Toilet training with picture cards', description: 'Step-by-step routine with printable toilet cards (Hindi + English).', kind: 'pdf', url: `${HOST}/toilet-training-picture-cards.pdf`, tags: ['toileting', 'self-care', 'visual supports'], therapyTypeKeys: ['special_ed', 'occupational'], domains: d('self_care'), ageBand: '3-6', audience: 'all', shares: [{ child: 'tara', by: 'neha', note: 'Start with the 2-hourly routine on page 3.' }] },
  { key: 'anvaya-bubbles', school: 'anvaya', daysAgo: 20, title: 'Bubble-request game (demo video)', description: 'Watch how we wait for 2-word requests during bubble play.', kind: 'video', url: `${HOST}/bubble-request-game.mp4`, tags: ['requesting', 'play'], therapyTypeKeys: ['speech'], domains: d('communication'), ageBand: '6-10', audience: 'all', shares: [{ child: 'aarav', by: 'riya', note: 'This is exactly what we do in session — pause and wait 5 seconds.' }] },
  { key: 'anvaya-staff-protocol', school: 'anvaya', daysAgo: 200, title: 'Seizure response protocol (staff)', description: 'Steps for staff if a child has a seizure during a session. Read with each child’s individual plan.', kind: 'pdf', url: `${HOST}/anvaya-seizure-protocol.pdf`, tags: ['safety', 'protocol'], therapyTypeKeys: [], domains: [], audience: 'staff' },
  { key: 'sahaj-handbook', school: 'sahaj', daysAgo: 140, title: 'Sahaj family handbook', description: 'Session timings, parking, fee and make-up policy and who to call.', kind: 'pdf', url: `${HOST}/sahaj-family-handbook.pdf`, tags: ['policies', 'handbook'], therapyTypeKeys: [], domains: [], audience: 'parents' },
  { key: 'sahaj-deepavali', school: 'sahaj', daysAgo: 10, title: 'Sensory-friendly Deepavali tips', description: 'Ear defenders, quiet rooms and visual stories to make the festival easier for your child.', kind: 'pdf', url: `${HOST}/sensory-friendly-deepavali.pdf`, tags: ['festivals', 'sensory'], therapyTypeKeys: ['occupational', 'behaviour'], domains: d('sensory', 'behaviour'), audience: 'parents' },
];
