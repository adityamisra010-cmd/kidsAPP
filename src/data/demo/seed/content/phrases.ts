/**
 * Text banks for generated notes. Placeholders: {name} {he} {He} {his} {His} {him} {goal} {goalParent}
 * {strategy} {strategyParent} {task} {therapist} {regular} {avoid}.
 */
import type { HomeLogDifficulty, HomeLogOutcome, ReviewReaction } from '@/domain/types';

export const WORKED_LABELS: Record<string, string> = {
  visual_schedule: 'the visual schedule',
  first_then: 'the first–then board',
  timer: 'the visual timer',
  movement_break: 'movement breaks',
  reinforcer_choice: 'letting {him} choose the reward',
  modelling: 'modelling',
  short_tasks: 'short tasks',
  quiet_room: 'the quiet room',
  parent_present: 'having a parent in the room',
  song_cue: 'song cues',
  hand_over_hand: 'hand-over-hand help',
  choice_of_two: 'a choice of two',
};

export const NOT_WORKED_LABELS: Record<string, string> = {
  long_tasks: 'long tasks',
  noisy_room: 'the noisy room',
  verbal_only_instructions: 'spoken-only instructions',
  waiting_turns: 'waiting for turns',
  new_material: 'new materials',
  tablet_reinforcer: 'the tablet as a reward',
  group_activity: 'the group activity',
  touch_prompts: 'touch prompts',
};

export const WORKED_TEXT = [
  'Started with 5 minutes of movement before table work.',
  'Kept each task under 4 minutes and alternated with a preferred activity.',
  'Offered two choices for every activity — fewer refusals.',
  '',
  '',
];

export const NOT_WORKED_TEXT = ['Corridor noise during the second half.', 'Introduced a new worksheet too early.', '', '', ''];

export const SUBJECTIVE_GENERIC = [
  "{Relation} reports {he} practised '{task}' at home most days this week.",
  '{Relation} says {he} has been using more words at home.',
  'Class teacher reports a calm week in class.',
  '{Relation} mentions a family function over the weekend — late nights.',
  '{Relation} reports {he} has been sleeping better since last week.',
  '',
  '',
];

export const ASSESSMENT = {
  good: [
    'Good session — {name} responded well to {strategy}. Clear gains in {goal}.',
    'Best session in recent weeks; {strategy} is helping {him} stay with tasks for longer.',
    '{name} is generalising {goal} with less prompting. Ready to fade prompts further.',
  ],
  steady: [
    'Steady session, in line with recent weeks. {goal} still needs prompting.',
    'Consistent effort. {strategy} continues to work; generalisation still limited.',
    'Settled after a slow start. Performance similar to the last few sessions.',
  ],
  hard: [
    'Harder session — {name} was {state} and needed more support. {avoid} made it worse.',
    'Lower engagement today; likely tiredness. Shortened tasks and used {strategy}.',
    'Dysregulated for the first half; recovered after a break. Monitor over the next sessions.',
  ],
  substitute: [
    'Covered as substitute; followed the Handover Brief. {strategy} worked as noted by {regular}.',
    'First session with {name} as substitute. Took 10 minutes to warm up; {strategy} helped.',
  ],
};

export const PLAN = [
  'Continue {goal}: aim for 10 trials using {strategy}. Start with a 5-minute movement warm-up.',
  'Target {goal}. Fade to the next prompt level; keep {strategy}. Avoid {avoid}.',
  'Repeat today’s plan for {goal}; add one new example to check generalisation.',
  'Probe {goal} at the start (cold probe), then teaching trials with {strategy}.',
];

export const PARENT_SUMMARY = {
  good: [
    '{name} had a lovely session today! {He} worked on {goalParent} and did really well. {StrategyParent} helped {him} a lot. Keep going with "{task}" at home.',
    'What a great day for {name}! {He} stayed focused and joined in happily. We practised {goalParent} — {he} needed less help than last time.',
    '{name} was cheerful and busy today. {He} worked on {goalParent} and we could see real progress. Thank you for practising at home — it shows!',
  ],
  steady: [
    '{name} worked steadily today on {goalParent}. {He} needed some help but kept trying. Please keep going with "{task}" this week.',
    'A good, steady session. {name} practised {goalParent} and enjoyed the breaks in between. Little and often at home is perfect.',
    '{name} settled in well and worked on {goalParent}. Some parts were easy, some still need help — that is normal at this stage.',
  ],
  hard: [
    'Today was a harder day for {name} — {he} seemed {stateParent}. That is okay; every child has days like this. We used {strategyParent} to help {him} settle. If anything has changed at home, please let us know.',
    '{name} found today a bit difficult and needed more breaks. We kept tasks short and ended on a happy note. Let us know if {he} slept poorly or is unwell.',
  ],
  substitute: [
    '{therapist} took today’s session while {regular} is away. {name} adjusted well and worked on {goalParent}.',
  ],
};

export const STATE_PARENT: Record<string, string> = { under: 'tired and low on energy', over: 'restless and very active', regulated: 'a little unsettled' };

type LogKey = `${HomeLogOutcome}:${HomeLogDifficulty}`;

export const PARENT_LOG_NOTES: Partial<Record<LogKey, string[]>> & { south: string[] } = {
  'done:easy': [
    'Did it happily after {his} bath. Asked for "more" twice on {his} own!',
    'Very easy today, {he} was in a good mood.',
    'Did it with didi watching — {he} loved the attention.',
    'Finished all the steps without any help today.',
  ],
  'done:ok': [
    'Took some time to settle but did all the steps.',
    'Did it before dinner. Needed reminders for step 3.',
    'Done, but only after I promised the park in the evening.',
    'Papa did it with {him} today. Went well.',
  ],
  'done:hard': ['Done, but it was a struggle — lots of crying at the start.', 'We finished, but {he} needed my help for every step.'],
  'partly:ok': ['Did half, then wanted to go and play.', 'Managed 3 steps, got distracted by the TV.', 'Started well, lost interest after 5 minutes.'],
  'partly:hard': ['Aaj thoda cranky tha, only did a little.', 'Hard today — {he} kept pushing the things away.', 'Has a cold, did only the first two steps.'],
  'partly:easy': ['Did the easy part quickly, refused the last step.'],
  'could_not:hard': [
    'Had fever since morning, so we skipped.',
    'Guests at home, could not manage today.',
    '{He} had a meltdown after school, so we did not try.',
    'Power cut in the evening, could not do it.',
  ],
  'could_not:ok': ['Travelling to Nani’s house today, will do tomorrow.'],
  south: ['Ajji helped today — {he} did it with her in the evening.', 'Did it after coming back from the park, nice and calm.', 'Tried in Kannada words like you said — worked better!'],
};

export const REVIEW_COMMENTS: Record<ReviewReaction, string[]> = {
  great_job: [
    'Lovely work! Next time, wait 3 seconds before helping so {name} gets a chance to try first.',
    'Brilliant — this is exactly how we do it in session.',
    'Wonderful! I can see the progress. Keep it going.',
  ],
  good_effort: ['Good effort! Try it before meals when {he} is more alert.', 'Nice! Keep it short — stopping while it is fun is perfect.'],
  try_next_time: ['Thanks for trying. Next time, show the timer first and break it into 2 steps.', 'Try sitting face to face so {he} can see your mouth.'],
  lets_discuss: ['Let’s talk about this at pickup on Thursday — I’ll show you a simpler version.', 'I’d like to adjust this task; let’s discuss in the next session.'],
};

export type Pronouns = { he: string; his: string; him: string };

export const pronouns = (gender: 'male' | 'female'): Pronouns =>
  gender === 'male' ? { he: 'he', his: 'his', him: 'him' } : { he: 'she', his: 'her', him: 'her' };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Fills {placeholders}; {He}/{His}/{StrategyParent}/{Relation} are capitalised forms. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (vars[key] != null) return vars[key];
    const lower = key[0].toLowerCase() + key.slice(1);
    if (vars[lower] != null) return cap(vars[lower]);
    return '';
  });
}
