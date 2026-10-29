-- =============================================================================
-- 20261029000001_schema.sql — core schema for My Kid's Tracker
--
-- Intent
--   Multi-tenant data model for special schools / child-development centres. Every row that
--   belongs to a school carries `organization_id` and is protected by RLS (next migration).
--   Naming contract with src/domain/types.ts: tables are snake_case plurals, columns are the
--   snake_case form of the camelCase TS fields, nested objects marked "jsonb" are jsonb columns.
--   View types (AppointmentView, SessionSummary, ChildSummary, ...) are not tables.
--
-- Deliberate differences from types.ts (the TS shape is assembled by the adapter):
--   * ChildProfile.clinical lives in its own table `child_clinical` (diagnosis text[],
--     medical_notes, allergies, medications) so RLS can hide it from parents and from
--     therapists who are not assigned. `child_profiles` has no `clinical` column.
--   * SessionLog is split across sessions / session_ratings / goal_trials /
--     behaviour_incidents / session_notes. SessionMetrics is denormalised onto `sessions`
--     (session_score, goal_accuracy, delta_last, delta_rolling, rolling_average, trend,
--     dimension_metrics jsonb = SessionMetrics.dimensions, incident_count).
--   * Columns whose TS names are SQL reserved words are kept and must be quoted in SQL:
--     therapist_unavailability."from"/"to", profile_edits."by", amendments."by".
--   * Extra columns not in types.ts: sessions.client_id (idempotent offline retries),
--     sessions.payload_hash, amendments.session_id, media.child_id + media.mime_type,
--     notifications.organization_id/payload/dedupe_key/push_status/pushed_at/push_error,
--     invites.accepted_by/accepted_at, child_profiles.id/organization_id,
--     consents.organization_id, data_requests.note.
--   * message_reads is a per-member read watermark (thread_id, user_id, last_read_at).
--
-- Every table: id uuid pk default gen_random_uuid(), created_at, updated_at (trigger),
-- created_by default auth.uid().
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Private schema for helpers (RLS predicates, triggers, internal routines). It is NOT listed in
-- the API's exposed schemas, so nothing in it is callable over PostgREST.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums (one per union type in src/domain/types.ts)
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('platform_admin', 'school_admin', 'coordinator', 'therapist', 'parent');
create type public.app_language as enum ('en', 'hi');
create type public.org_status as enum ('active', 'suspended');
create type public.membership_status as enum ('active', 'invited', 'suspended');
create type public.invite_status as enum ('pending', 'accepted', 'revoked');
create type public.child_status as enum ('active', 'inactive');
create type public.gender as enum ('male', 'female', 'other');
create type public.communication_mode as enum ('verbal', 'limited_verbal', 'non_verbal');
create type public.goal_domain as enum (
  'communication', 'fine_motor', 'gross_motor', 'self_care', 'social', 'behaviour', 'cognition', 'sensory'
);
create type public.goal_status as enum ('not_started', 'emerging', 'progressing', 'mastered', 'maintenance', 'paused');
create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled');
create type public.attendance as enum ('present', 'late', 'absent', 'cancelled_by_school', 'cancelled_by_parent');
create type public.reschedule_status as enum ('pending', 'approved', 'declined', 'countered');
create type public.regulation_state as enum ('under', 'regulated', 'over');
create type public.compared_to_last as enum ('much_worse', 'worse', 'same', 'better', 'much_better');
create type public.trend as enum ('up', 'flat', 'down');
create type public.incident_type as enum ('meltdown', 'aggression', 'self_injury', 'elopement', 'refusal', 'other');
create type public.amendment_entity as enum ('session', 'session_notes', 'goal_trial');
create type public.sleep_quality as enum ('good', 'ok', 'poor');
create type public.checkin_mood as enum ('happy', 'okay', 'upset');
create type public.home_task_status as enum ('active', 'completed', 'archived');
create type public.home_log_outcome as enum ('done', 'partly', 'could_not');
create type public.home_log_difficulty as enum ('easy', 'ok', 'hard');
create type public.review_reaction as enum ('great_job', 'good_effort', 'try_next_time', 'lets_discuss');
create type public.media_kind as enum ('video', 'image', 'pdf', 'other');
create type public.upload_status as enum ('queued', 'uploading', 'uploaded', 'failed');
create type public.resource_kind as enum ('pdf', 'image', 'video', 'link');
create type public.resource_audience as enum ('staff', 'parents', 'all');
create type public.age_band as enum ('0-3', '3-6', '6-10', '10+');
create type public.thread_kind as enum ('care_team', 'staff_only', 'direct');
create type public.announcement_audience as enum ('everyone', 'all_parents', 'all_staff', 'therapy_type');
create type public.alert_kind as enum ('score_drop', 'incident_spike', 'unlogged_session', 'declining_trend');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');
create type public.notification_kind as enum (
  'appointment_reminder', 'appointment_changed', 'substitute_assigned', 'reschedule_request',
  'reschedule_response', 'session_summary', 'home_task_assigned', 'home_log_submitted',
  'home_log_feedback', 'unlogged_session', 'child_alert', 'new_message', 'announcement', 'daily_agenda'
);
create type public.push_status as enum ('pending', 'sent', 'skipped', 'failed');
create type public.device_platform as enum ('android', 'ios', 'web');
create type public.consent_kind as enum ('data_processing', 'video_upload');
create type public.data_request_kind as enum ('export', 'deletion');
create type public.data_request_status as enum ('open', 'in_progress', 'done');

-- ---------------------------------------------------------------------------
-- Small shared helpers used by defaults and triggers
-- ---------------------------------------------------------------------------

-- All schools are in India; dates ("today", session date) are computed in IST.
create or replace function app.tz() returns text
language sql immutable as $$ select 'Asia/Kolkata'::text $$;

create or replace function app.today() returns date
language sql stable as $$ select (now() at time zone app.tz())::date $$;

-- Mirrors DEFAULT_ORG_SETTINGS in src/domain/constants.ts.
create or replace function app.default_org_settings() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'reminderHoursBefore', jsonb_build_array(24, 1),
    'dailyAgendaTime', '08:00',
    'quietHours', jsonb_build_object('start', '21:00', 'end', '08:00'),
    'videoRetentionDays', 180,
    'parentsSeeNumericScore', false,
    'workingHours', jsonb_build_object('start', '08:30', 'end', '17:30', 'days', jsonb_build_array(1, 2, 3, 4, 5, 6)),
    'holidays', '[]'::jsonb,
    'checkinEnabled', true,
    'alertDropThreshold', 15,
    'alertIncidentThreshold', 3,
    'logLockHours', 24
  )
$$;

-- Stable error contract for the app: message = RepoErrorCode, SQLSTATE = PT<http status> so
-- PostgREST also returns a meaningful HTTP status.
create or replace function app.raise(p_code text, p_detail text default null) returns void
language plpgsql volatile as $$
begin
  raise exception using
    message = p_code,
    detail = coalesce(p_detail, p_code),
    errcode = case p_code
      when 'not_authenticated' then 'PT401'
      when 'forbidden' then 'PT403'
      when 'not_found' then 'PT404'
      when 'conflict' then 'PT409'
      when 'validation' then 'PT422'
      when 'locked' then 'PT423'
      when 'consent_required' then 'PT428'
      else 'P0001'
    end;
end
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Tenancy & people
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  short_name text not null default '',
  city text not null default '',
  address text not null default '',
  phone text not null default '',
  email text,
  logo_url text,
  status public.org_status not null default 'active',
  settings jsonb not null default app.default_org_settings() check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
comment on table public.organizations is 'Schools / centres (tenants). settings = OrgSettings jsonb.';

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  email text,
  avatar_url text,
  preferred_language public.app_language not null default 'en',
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
comment on table public.profiles is 'One row per auth user (id = auth.users.id). Created by trigger on sign-up.';

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  role public.user_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  -- platform_admin is the only role without a school.
  constraint memberships_org_matches_role check ((role = 'platform_admin') = (organization_id is null)),
  constraint memberships_unique unique nulls not distinct (user_id, organization_id, role)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.user_role not null check (role <> 'platform_admin'),
  full_name text not null default '',
  phone text,
  email text,
  child_ids uuid[] not null default '{}',
  relation text,
  status public.invite_status not null default 'pending',
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint invites_contact check (phone is not null or email is not null)
);

create table public.therapy_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null default 'custom',
  name text not null,
  color text not null default '#5B7A99',
  icon text not null default 'circle',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (organization_id, name)
);

-- Which therapy types a staff member is qualified for (Member.therapyTypeIds).
create table public.member_therapy_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  therapy_type_id uuid not null references public.therapy_types (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (user_id, therapy_type_id)
);

-- ---------------------------------------------------------------------------
-- Children
-- ---------------------------------------------------------------------------
create table public.children (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  full_name text not null check (length(btrim(full_name)) > 0),
  preferred_name text,
  dob date not null,
  gender public.gender,
  photo_url text,
  class_group text,
  status public.child_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
-- Natural key used by CSV import idempotency (name + DOB + school).
create unique index children_natural_key on public.children (organization_id, lower(btrim(full_name)), dob);

-- "About Me" (no clinical data here; see child_clinical).
create table public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null unique references public.children (id) on delete cascade,
  communication_mode public.communication_mode not null default 'verbal',
  comm_tools text[] not null default '{}',
  comm_notes text not null default '',
  reinforcers text[] not null default '{}',
  reinforcers_notes text not null default '',
  triggers text[] not null default '{}',
  triggers_notes text not null default '',
  calming text[] not null default '{}',
  calming_notes text not null default '',
  sensory_notes text not null default '',
  dos text[] not null default '{}',
  donts text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid()
);

-- ChildProfile.clinical (restricted: school admin, coordinator, assigned therapists).
create table public.child_clinical (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null unique references public.children (id) on delete cascade,
  diagnosis text[] not null default '{}',
  medical_notes text not null default '',
  allergies text not null default '',
  medications text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid()
);

-- Field-level edit history of About Me / clinical (written by trigger only).
create table public.profile_edits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  field text not null,
  old_value text not null default '',
  new_value text not null default '',
  "by" uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.child_guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  relation text not null default 'Guardian',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (child_id, user_id)
);

create table public.child_therapists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  therapy_type_id uuid not null references public.therapy_types (id) on delete restrict,
  is_lead boolean not null default false,
  active_from date not null default app.today(),
  active_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (child_id, user_id, therapy_type_id),
  check (active_to is null or active_to >= active_from)
);

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create table public.goal_bank (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade, -- null = global
  domain public.goal_domain not null,
  therapy_type_key text not null,
  staff_text text not null,
  parent_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  therapy_type_id uuid not null references public.therapy_types (id) on delete restrict,
  domain public.goal_domain not null,
  staff_text text not null,
  parent_text text not null default '',
  baseline text not null default '',
  mastery_rule jsonb not null default '{"accuracy": 80, "consecutiveSessions": 3}'::jsonb,
  status public.goal_status not null default 'not_started',
  start_date date not null default app.today(),
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create table public.appointment_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id),
  therapy_type_id uuid not null references public.therapy_types (id),
  rrule text not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  start_date date not null,
  end_date date not null,
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (end_date >= start_date)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  series_id uuid references public.appointment_series (id) on delete set null,
  child_id uuid not null references public.children (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id),
  original_therapist_id uuid references public.profiles (id),
  therapy_type_id uuid not null references public.therapy_types (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text,
  status public.appointment_status not null default 'scheduled',
  attendance public.attendance,
  late_minutes integer check (late_minutes is null or late_minutes >= 0),
  makeup_of_id uuid references public.appointments (id) on delete set null,
  was_rescheduled boolean not null default false,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (ends_at > starts_at)
);

create table public.reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  requested_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  proposed_slots jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_slots) = 'array'),
  reason text not null default '',
  status public.reschedule_status not null default 'pending',
  resolution jsonb,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.therapist_unavailability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  "from" date not null,
  "to" date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check ("to" >= "from")
);

-- ---------------------------------------------------------------------------
-- Session logging
-- ---------------------------------------------------------------------------
create table public.rating_dimensions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade, -- null = platform template
  key text not null,
  label text not null,
  parent_label text not null default '',
  description text not null default '',
  anchors jsonb not null default '{}'::jsonb, -- {"1": "...", ..., "5": "..."}
  weight numeric not null default 1 check (weight >= 0),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  icon text not null default 'circle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint rating_dimensions_unique_key unique nulls not distinct (organization_id, key)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid unique,
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  -- Derived from the appointment by trigger (callers cannot spoof them).
  child_id uuid not null references public.children (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id),
  therapy_type_id uuid not null references public.therapy_types (id),
  is_substitute boolean not null default false,
  date date not null,
  -- Logger input
  actual_minutes integer not null default 0 check (actual_minutes >= 0),
  started_late boolean not null default false,
  regulation_state public.regulation_state not null default 'regulated',
  breaks_count integer not null default 0 check (breaks_count >= 0),
  compared_to_last public.compared_to_last not null default 'same',
  worked_tags text[] not null default '{}',
  worked_text text not null default '',
  not_worked_tags text[] not null default '{}',
  not_worked_text text not null default '',
  -- Denormalised SessionMetrics (written only by compute routines, never by API callers)
  session_score numeric(5, 1),
  goal_accuracy numeric(5, 1),
  delta_last numeric(5, 1),
  delta_rolling numeric(5, 1),
  rolling_average numeric(5, 1),
  trend public.trend not null default 'flat',
  dimension_metrics jsonb not null default '{}'::jsonb,
  incident_count integer not null default 0,
  -- Locking / amendments
  locked_at timestamptz not null,
  amendment_count integer not null default 0,
  payload_hash text, -- md5 of the last SessionInput applied (idempotent replays after lock)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.session_ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  dimension_key text not null,
  value smallint not null check (value between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (session_id, dimension_key)
);

create table public.goal_trials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  attempted integer not null default 0 check (attempted >= 0),
  successful integer not null default 0 check (successful >= 0),
  prompt_level smallint not null default 3 check (prompt_level between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (session_id, goal_id)
);

create table public.behaviour_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  type public.incident_type not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  antecedent_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- SOAP notes. subjective/objective/assessment/plan_next are INTERNAL; parent_summary is the only
-- parent-visible text and reaches parents only through the parent_session_snapshot RPCs.
create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  subjective text not null default '',
  objective text not null default '',
  assessment text not null default '',
  plan_next text not null default '',
  plan_goal_ids uuid[] not null default '{}',
  parent_summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  entity public.amendment_entity not null,
  entity_id uuid not null,
  field text not null,
  old_value text not null default '',
  new_value text not null default '',
  reason text not null check (length(btrim(reason)) > 0),
  "by" uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.parent_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid unique,
  child_id uuid not null references public.children (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  date date not null default app.today(),
  sleep public.sleep_quality not null,
  ate_breakfast boolean not null,
  mood public.checkin_mood not null,
  change_flag boolean not null default false,
  change_note text not null default '',
  submitted_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Media & resources (before home practice, which references them)
-- ---------------------------------------------------------------------------
-- Rows describe objects in the private `media` bucket; bucket_path = '{org_id}/{child_id}/{uuid}.mp4'.
create table public.media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  child_id uuid references public.children (id) on delete cascade,
  bucket_path text not null unique,
  kind public.media_kind not null,
  mime_type text,
  duration_s numeric check (duration_s is null or duration_s >= 0),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  expires_at timestamptz,
  upload_status public.upload_status not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade, -- null = global
  title text not null,
  description text not null default '',
  kind public.resource_kind not null,
  url text not null, -- external link, or object path in the private `resources` bucket
  tags text[] not null default '{}',
  therapy_type_keys text[] not null default '{}',
  domains public.goal_domain[] not null default '{}',
  age_band public.age_band,
  audience public.resource_audience not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.resource_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  child_id uuid references public.children (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  shared_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  note text,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (child_id is not null or user_id is not null)
);

-- ---------------------------------------------------------------------------
-- Home practice
-- ---------------------------------------------------------------------------
create table public.home_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  assigned_by uuid not null default auth.uid() references public.profiles (id),
  title text not null,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  frequency_per_week integer not null default 3 check (frequency_per_week between 1 and 14),
  duration_minutes integer not null default 10 check (duration_minutes > 0),
  resource_id uuid references public.resources (id) on delete set null,
  demo_media_id uuid references public.media (id) on delete set null,
  active_from date not null default app.today(),
  active_to date not null default (app.today() + 28),
  status public.home_task_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (active_to >= active_from)
);

create table public.home_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid unique,
  task_id uuid not null references public.home_tasks (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade, -- copied from the task
  logged_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  outcome public.home_log_outcome not null,
  difficulty public.home_log_difficulty not null,
  note text not null default '',
  media_id uuid references public.media (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_reaction public.review_reaction,
  review_comment text,
  reviewed_at timestamptz,
  use_in_next_session boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Messaging, announcements, alerts, notifications
-- ---------------------------------------------------------------------------
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid references public.children (id) on delete cascade,
  kind public.thread_kind not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (kind <> 'care_team' or child_id is not null)
);

create table public.thread_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (thread_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- Read watermark per member and thread (Message.readBy is derived from it).
create table public.message_reads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (thread_id, user_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  body text not null default '',
  audience public.announcement_audience not null default 'everyone',
  therapy_type_id uuid references public.therapy_types (id) on delete set null,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (audience <> 'therapy_type' or therapy_type_id is not null)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  kind public.alert_kind not null,
  payload jsonb not null default '{}'::jsonb,
  message text not null default '',
  status public.alert_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text not null default '',
  route text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dedupe_key text, -- e.g. 'reminder:<appointment>:24' so cron jobs never notify twice
  push_status public.push_status not null default 'pending',
  pushed_at timestamptz,
  push_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  token text not null,
  platform public.device_platform not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (user_id, token)
);

create table public.notification_mutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.notification_kind not null
    -- UNMUTABLE_NOTIFICATION_KINDS: schedule changes can never be muted.
    check (kind not in ('appointment_changed', 'substitute_assigned', 'reschedule_response')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (user_id, kind)
);

-- ---------------------------------------------------------------------------
-- Consent, privacy requests, audit
-- ---------------------------------------------------------------------------
-- Append-only consent history: the latest row per (user, child, kind) is the current state.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade, -- from child
  child_id uuid references public.children (id) on delete cascade,
  kind public.consent_kind not null,
  granted boolean not null,
  at timestamptz not null default now(),
  version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  kind public.data_request_kind not null,
  status public.data_request_status not null default 'open',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid, -- no FK: audit rows outlive accounts
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- "I've read this" on the Handover Brief.
create table public.brief_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (user_id, appointment_id)
);

-- ---------------------------------------------------------------------------
-- Indexes (PROMPT §5 + foreign keys used by RLS predicates and common queries)
-- ---------------------------------------------------------------------------
create index appointments_therapist_starts on public.appointments (therapist_id, starts_at);
create index appointments_child_starts on public.appointments (child_id, starts_at);
create index appointments_org_starts on public.appointments (organization_id, starts_at);
create index appointments_original_therapist on public.appointments (original_therapist_id) where original_therapist_id is not null;
create index appointments_series on public.appointments (series_id);
create index sessions_child_type_created on public.sessions (child_id, therapy_type_id, created_at desc);
create index sessions_child_type_date on public.sessions (child_id, therapy_type_id, date desc);
create index sessions_therapist on public.sessions (therapist_id, date desc);
create index sessions_org_date on public.sessions (organization_id, date desc);

create index memberships_user on public.memberships (user_id);
create index memberships_org_role on public.memberships (organization_id, role);
create index invites_org on public.invites (organization_id, status);
create index invites_phone on public.invites (phone) where status = 'pending';
create index invites_email on public.invites (lower(email)) where status = 'pending';
create index branches_org on public.branches (organization_id);
create index therapy_types_org on public.therapy_types (organization_id);
create index member_therapy_types_org on public.member_therapy_types (organization_id, therapy_type_id);
create index children_org on public.children (organization_id, status);
create index child_profiles_org on public.child_profiles (organization_id);
create index child_clinical_org on public.child_clinical (organization_id);
create index profile_edits_child on public.profile_edits (child_id, at desc);
create index child_guardians_user on public.child_guardians (user_id);
create index child_guardians_org on public.child_guardians (organization_id);
create index child_therapists_user on public.child_therapists (user_id);
create index child_therapists_child on public.child_therapists (child_id);
create index child_therapists_org on public.child_therapists (organization_id);
create index goal_bank_org on public.goal_bank (organization_id);
create index goals_child on public.goals (child_id, therapy_type_id);
create index goals_org on public.goals (organization_id);
create index appointment_series_org on public.appointment_series (organization_id);
create index appointment_series_child on public.appointment_series (child_id);
create index reschedule_requests_appointment on public.reschedule_requests (appointment_id);
create index reschedule_requests_org_status on public.reschedule_requests (organization_id, status);
create index therapist_unavailability_user on public.therapist_unavailability (user_id, "from");
create index therapist_unavailability_org on public.therapist_unavailability (organization_id);
create index rating_dimensions_org on public.rating_dimensions (organization_id, sort_order);
create index session_ratings_org on public.session_ratings (organization_id);
create index goal_trials_goal on public.goal_trials (goal_id);
create index goal_trials_org on public.goal_trials (organization_id);
create index behaviour_incidents_session on public.behaviour_incidents (session_id);
create index behaviour_incidents_org on public.behaviour_incidents (organization_id);
create index session_notes_org on public.session_notes (organization_id);
create index amendments_session on public.amendments (session_id, at);
create index amendments_org on public.amendments (organization_id);
create index parent_checkins_child on public.parent_checkins (child_id, date desc);
create index parent_checkins_appointment on public.parent_checkins (appointment_id);
create index parent_checkins_org on public.parent_checkins (organization_id);
create index media_child on public.media (child_id);
create index media_owner on public.media (owner_id);
create index media_org on public.media (organization_id);
create index media_expires on public.media (expires_at) where expires_at is not null;
create index resources_org on public.resources (organization_id);
create index resource_shares_child on public.resource_shares (child_id);
create index resource_shares_user on public.resource_shares (user_id);
create index resource_shares_resource on public.resource_shares (resource_id);
create index resource_shares_org on public.resource_shares (organization_id);
create index home_tasks_child on public.home_tasks (child_id, status);
create index home_tasks_org on public.home_tasks (organization_id);
create index home_logs_task on public.home_logs (task_id, created_at desc);
create index home_logs_child on public.home_logs (child_id, created_at desc);
create index home_logs_unreviewed on public.home_logs (organization_id, created_at) where reviewed_at is null;
create index threads_child on public.threads (child_id);
create index threads_org on public.threads (organization_id);
create index thread_members_user on public.thread_members (user_id);
create index thread_members_org on public.thread_members (organization_id);
create index messages_thread_created on public.messages (thread_id, created_at desc);
create index messages_org on public.messages (organization_id);
create index message_reads_user on public.message_reads (user_id);
create index message_reads_org on public.message_reads (organization_id);
create index announcements_org on public.announcements (organization_id, created_at desc);
create index alerts_child on public.alerts (child_id, status);
create index alerts_org_status on public.alerts (organization_id, status);
create index notifications_user_created on public.notifications (user_id, created_at desc);
create index notifications_org on public.notifications (organization_id);
create index notifications_push_pending on public.notifications (created_at) where push_status = 'pending';
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index consents_user on public.consents (user_id, kind, at desc);
create index consents_child on public.consents (child_id);
create index data_requests_org on public.data_requests (organization_id, status);
create index data_requests_user on public.data_requests (user_id);
create index audit_log_org_at on public.audit_log (organization_id, at desc);
create index audit_log_entity on public.audit_log (entity, entity_id);
create index brief_ack_appointment on public.brief_acknowledgements (appointment_id);
create index brief_ack_org on public.brief_acknowledgements (organization_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger on every table that has the column
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()',
      t.table_name
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Profile row for every new auth user
-- ---------------------------------------------------------------------------
-- Indian numbers are stored in E.164 (+91XXXXXXXXXX). auth.users.phone has no '+'.
create or replace function app.normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null or regexp_replace(p, '\D', '', 'g') = '' then null
    when length(regexp_replace(p, '\D', '', 'g')) = 10 then '+91' || regexp_replace(p, '\D', '', 'g')
    else '+' || regexp_replace(p, '\D', '', 'g')
  end
$$;

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone, email, created_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    app.normalize_phone(new.phone),
    lower(new.email),
    new.id
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
