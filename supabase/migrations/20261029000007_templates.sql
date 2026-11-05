-- =============================================================================
-- 20261029000007_templates.sql — platform templates and per-school defaults
--
-- Intent
--   * Global rating-dimension templates (organization_id = null), copied from DEFAULT_DIMENSIONS
--     in src/domain/constants.ts, anchors for every value 1..5. Seed data must not insert global
--     rows with the same keys again (unique (organization_id, key) treats null as equal).
--   * app.seed_org_defaults(org): gives a new school the default therapy types
--     (DEFAULT_THERAPY_TYPES) and its own editable copy of the dimension templates.
--     Called by create_school(); safe to call again (on conflict do nothing).
-- =============================================================================

insert into public.rating_dimensions (organization_id, key, label, parent_label, description, anchors, weight, enabled, sort_order, icon)
values
  (null, 'engagement', 'Engagement', 'Engagement', 'How much the child took part in the session activities.',
   jsonb_build_object(
     '1', 'Refused or withdrawn most of the session',
     '2', 'Joined briefly, mostly needed coaxing',
     '3', 'Participated with frequent redirection',
     '4', 'Participated well with occasional redirection',
     '5', 'Actively participated and initiated activities'), 1, true, 1, 'sparkles'),
  (null, 'attention', 'Attention / Focus', 'Focus', 'How long the child could stay with a task.',
   jsonb_build_object(
     '1', 'Could not stay on task beyond brief moments',
     '2', 'Stayed on task for very short spells with constant support',
     '3', 'Sustained attention for short blocks with redirection',
     '4', 'Sustained attention for most blocks with light support',
     '5', 'Sustained attention through full activity blocks'), 1, true, 2, 'target'),
  (null, 'regulation', 'Regulation', 'Calmness', 'How well the child stayed regulated. Energy state is recorded separately.',
   jsonb_build_object(
     '1', 'Could not be regulated',
     '2', 'Regulated only briefly with full support',
     '3', 'Regulated with significant support',
     '4', 'Regulated with light support',
     '5', 'Self-regulated or stayed regulated'), 1, true, 3, 'waves'),
  (null, 'mood', 'Mood / Affect', 'Mood', 'Overall emotional state during the session.',
   jsonb_build_object(
     '1', 'Distressed or crying most of the session',
     '2', 'Upset for long stretches',
     '3', 'Neutral or variable',
     '4', 'Mostly content',
     '5', 'Happy and settled'), 1, true, 4, 'smile'),
  (null, 'cooperation', 'Cooperation', 'Following instructions', 'How readily the child followed instructions.',
   jsonb_build_object(
     '1', 'Did not follow instructions',
     '2', 'Followed very few instructions, with full support',
     '3', 'Followed some instructions with repetition',
     '4', 'Followed most instructions with a reminder',
     '5', 'Followed instructions readily'), 1, true, 5, 'handshake'),
  (null, 'independence', 'Independence (prompt level)', 'Doing it independently', 'The most common prompt level used in the session.',
   jsonb_build_object(
     '1', 'Full physical prompt',
     '2', 'Partial physical prompt',
     '3', 'Model or gestural prompt',
     '4', 'Verbal prompt',
     '5', 'Independent'), 1, true, 6, 'footprints'),
  (null, 'communication', 'Communication / Interaction', 'Communication', 'Attempts to communicate in any mode: speech, sign, AAC, gesture.',
   jsonb_build_object(
     '1', 'No attempts',
     '2', 'Rare attempts, only with full prompting',
     '3', 'Some attempts when prompted',
     '4', 'Regular attempts, some spontaneous',
     '5', 'Frequent spontaneous attempts'), 1, true, 7, 'message-circle'),
  (null, 'transitions', 'Transitions', 'Moving between activities', 'How the child managed changes between activities.',
   jsonb_build_object(
     '1', 'Major difficulty or meltdown at transitions',
     '2', 'Difficulty at most transitions',
     '3', 'Managed with support',
     '4', 'Managed with a warning or visual cue',
     '5', 'Smooth'), 1, true, 8, 'repeat')
on conflict on constraint rating_dimensions_unique_key do nothing;

create or replace function app.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.therapy_types (organization_id, key, name, color, icon)
  values
    (p_org, 'speech', 'Speech Therapy', '#C66B4E', 'message-circle'),
    (p_org, 'occupational', 'Occupational Therapy', '#C9A227', 'hand'),
    (p_org, 'behaviour', 'Behaviour Therapy (ABA)', '#6F9A7A', 'sprout'),
    (p_org, 'special_ed', 'Special Education', '#8A6A8F', 'book-open'),
    (p_org, 'physio', 'Physiotherapy', '#5B7A99', 'activity'),
    (p_org, 'audiology', 'Audiology Support', '#4E8C8A', 'ear')
  on conflict (organization_id, name) do nothing;

  insert into public.rating_dimensions (organization_id, key, label, parent_label, description, anchors, weight, enabled, sort_order, icon)
  select p_org, d.key, d.label, d.parent_label, d.description, d.anchors, d.weight, d.enabled, d.sort_order, d.icon
  from public.rating_dimensions d
  where d.organization_id is null
  on conflict on constraint rating_dimensions_unique_key do nothing;
end
$$;

grant execute on all functions in schema app to authenticated, service_role;
