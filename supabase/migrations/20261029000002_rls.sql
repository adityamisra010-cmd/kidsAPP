-- =============================================================================
-- 20261029000002_rls.sql — Row Level Security for every table
--
-- Model (PROMPT §3)
--   * Tenant isolation: every predicate is anchored on organization_id (directly or through
--     the child / session / thread / appointment a row belongs to) AND an active membership of
--     the caller in that organization. A suspended school or membership loses access.
--   * School admin / coordinator ("org admins"): everything in their school.
--   * Therapist: FULL detail (incl. clinical + SOAP notes) for children they are assigned to
--     (child_therapists, active today). BRIEF access (About Me minus clinical, goals, recent
--     session summaries, alerts, home tasks) for a child only while they are the therapist on a
--     non-cancelled appointment for that child within [starts_at - 24h, ends_at + 24h]
--     (app.has_substitute_access). Their own sessions stay visible to them. Otherwise only the
--     child's identity row (name/photo/dob/class) for children on their own appointments, so
--     their calendar can render — nothing else.
--   * Parent: only children linked through child_guardians.
--   * Platform admin: organizations (+ cross-school counts via platform_school_summaries()).
--     No child or clinical data: every child predicate requires a school membership.
--
-- How parent safety is achieved (design choice)
--   1. Restricted data lives in tables parents have NO select policy on:
--      child_clinical (ChildProfile.clinical moved out of child_profiles), session_notes
--      (S/O/A/P), sessions / session_ratings / goal_trials / behaviour_incidents, goals
--      (staff wording + baseline), alerts, amendments, audit_log, profile_edits.
--      Staff-only threads are never readable by a parent (kind check + staff-only membership).
--   2. Parents read the parent-safe projection of that data only through SECURITY DEFINER RPCs
--      that re-check app.is_guardian_of() and return a whitelisted set of fields:
--      parent_session_snapshot(s), parent_goals, parent_progress (see *_rpc.sql). The numeric
--      score is included only when the school enables parentsSeeNumericScore.
--   We chose RPCs over security_invoker views because a view cannot hide columns per role
--   with RLS alone (RLS is row-level), and a definer view would bypass RLS entirely.
--
-- Helpers are SECURITY DEFINER + STABLE with an empty search_path, owned by the migration role
-- (table owner), so they can look up memberships without recursive RLS evaluation.
-- Writes that need extra rules (lock window, column whitelists) are enforced by triggers that
-- check `current_user in ('authenticated','anon')`: requests from the API run as those roles,
-- while SECURITY DEFINER RPCs (amend_session, assign_substitute, ...) run as the owner after
-- doing their own authorization.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Membership predicates
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role = 'platform_admin' and m.status = 'active'
  )
$$;

-- Active membership with one of the roles, in an active organization.
create or replace function app.has_role(p_org uuid, p_roles public.user_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_org is not null and exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid()
      and m.organization_id = p_org
      and m.status = 'active'
      and o.status = 'active'
      and m.role = any (p_roles)
  )
$$;

create or replace function app.is_member(p_org uuid) returns boolean
language sql stable as $$
  select app.has_role(p_org, '{school_admin,coordinator,therapist,parent}'::public.user_role[])
$$;

create or replace function app.is_staff(p_org uuid) returns boolean
language sql stable as $$
  select app.has_role(p_org, '{school_admin,coordinator,therapist}'::public.user_role[])
$$;

create or replace function app.is_org_admin(p_org uuid) returns boolean
language sql stable as $$
  select app.has_role(p_org, '{school_admin,coordinator}'::public.user_role[])
$$;

-- Any active membership, even if the school is suspended (lets users see the org row/status).
create or replace function app.belongs_to_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.organization_id = p_org and m.status = 'active'
  )
$$;

create or replace function app.is_any_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and m.status = 'active' and o.status = 'active'
      and m.role in ('school_admin', 'coordinator', 'therapist')
  )
$$;

-- True when p_user has any membership (active or invited) in p_org; optionally staff only.
create or replace function app.user_in_org(p_user uuid, p_org uuid, p_staff_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.organization_id = p_org and m.status in ('active', 'invited')
      and (not p_staff_only or m.role in ('school_admin', 'coordinator', 'therapist'))
  )
$$;

-- ---------------------------------------------------------------------------
-- Child access predicates
-- ---------------------------------------------------------------------------
create or replace function app.child_org(p_child uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.organization_id from public.children c where c.id = p_child
$$;

create or replace function app.is_guardian_of(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.child_guardians g
    where g.child_id = p_child and g.user_id = auth.uid() and app.is_member(g.organization_id)
  )
$$;

create or replace function app.is_assigned_therapist(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.child_therapists ct
    where ct.child_id = p_child
      and ct.user_id = auth.uid()
      and ct.active_from <= app.today()
      and (ct.active_to is null or ct.active_to >= app.today())
      and app.is_staff(ct.organization_id)
  )
$$;

-- Time-boxed access derived from the appointment (substitutes and one-off sessions).
create or replace function app.has_substitute_access(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.child_id = p_child
      and a.therapist_id = auth.uid()
      and a.status <> 'cancelled'
      and now() >= a.starts_at - interval '24 hours'
      and now() <= a.ends_at + interval '24 hours'
      and app.is_staff(a.organization_id)
  )
$$;

-- Clinical fields: school admin, coordinator, assigned therapists.
create or replace function app.can_view_child_clinical(p_child uuid) returns boolean
language sql stable as $$
  select app.is_org_admin(app.child_org(p_child)) or app.is_assigned_therapist(p_child)
$$;

-- Full staff detail (SOAP notes, edit history): same audience as clinical.
create or replace function app.can_view_child_full(p_child uuid) returns boolean
language sql stable as $$
  select app.can_view_child_clinical(p_child)
$$;

-- Handover-brief level: full, or within the substitute window.
create or replace function app.can_view_child_brief(p_child uuid) returns boolean
language sql stable as $$
  select app.can_view_child_full(p_child) or app.has_substitute_access(p_child)
$$;

-- Therapist is (or was replaced as) the therapist on any non-cancelled appointment of the child.
create or replace function app.has_appointment_with(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.child_id = p_child
      and (a.therapist_id = auth.uid() or a.original_therapist_id = auth.uid())
      and a.status <> 'cancelled'
      and app.is_staff(a.organization_id)
  )
$$;

-- Identity row of the child (name, photo, dob, class).
create or replace function app.can_view_child_basic(p_child uuid) returns boolean
language sql stable as $$
  select app.can_view_child_brief(p_child) or app.is_guardian_of(p_child) or app.has_appointment_with(p_child)
$$;

create or replace function app.children_in_org(p_children uuid[], p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(bool_and(c.organization_id = p_org), true) and count(c.id) = cardinality(coalesce(p_children, '{}'))
  from unnest(coalesce(p_children, '{}')) as x(id)
  left join public.children c on c.id = x.id
$$;

-- Latest video-upload consent of the caller for this child (or a child-agnostic consent).
create or replace function app.has_video_consent(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.granted from public.consents c
    where c.user_id = auth.uid() and c.kind = 'video_upload' and (c.child_id = p_child or c.child_id is null)
    order by c.at desc, c.created_at desc
    limit 1
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- Profiles: who may read whose name/phone
-- ---------------------------------------------------------------------------
create or replace function app.can_read_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    p_target = auth.uid()
    -- school admins and coordinators see every member of their school
    or exists (
      select 1 from public.memberships them
      where them.user_id = p_target and them.organization_id is not null and app.is_org_admin(them.organization_id)
    )
    -- staff see colleagues; every member sees their school's admins/coordinators
    or exists (
      select 1 from public.memberships them
      where them.user_id = p_target and them.organization_id is not null and them.status = 'active'
        and (
          (them.role in ('school_admin', 'coordinator', 'therapist') and app.is_staff(them.organization_id))
          or (them.role in ('school_admin', 'coordinator') and app.is_member(them.organization_id))
        )
    )
    -- therapists see guardians of children they can view at brief level
    or exists (
      select 1 from public.child_guardians g
      where g.user_id = p_target and app.can_view_child_brief(g.child_id)
    )
    -- parents see their children's therapists (assigned or scheduled) and co-guardians
    or exists (
      select 1 from public.child_guardians mine
      join public.child_therapists ct on ct.child_id = mine.child_id
      where mine.user_id = auth.uid() and ct.user_id = p_target and app.is_member(mine.organization_id)
    )
    or exists (
      select 1 from public.child_guardians mine
      join public.appointments a on a.child_id = mine.child_id
      where mine.user_id = auth.uid() and (a.therapist_id = p_target or a.original_therapist_id = p_target)
        and a.status <> 'cancelled' and app.is_member(mine.organization_id)
    )
    or exists (
      select 1 from public.child_guardians mine
      join public.child_guardians other on other.child_id = mine.child_id
      where mine.user_id = auth.uid() and other.user_id = p_target and app.is_member(mine.organization_id)
    )
    -- fellow members of a thread the caller can read
    or exists (
      select 1 from public.thread_members a
      join public.thread_members b on b.thread_id = a.thread_id
      where a.user_id = auth.uid() and b.user_id = p_target and app.is_member(a.organization_id)
    )
$$;

-- ---------------------------------------------------------------------------
-- Appointments / sessions
-- ---------------------------------------------------------------------------
create or replace function app.appointment_row(p_appointment uuid) returns public.appointments
language sql stable security definer set search_path = '' as $$
  select a.* from public.appointments a where a.id = p_appointment
$$;

create or replace function app.appointment_child(p_appointment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.child_id from public.appointments a where a.id = p_appointment
$$;

create or replace function app.appointment_therapist(p_appointment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.therapist_id from public.appointments a where a.id = p_appointment
$$;

-- The caller may log (create/edit) the session for this appointment.
create or replace function app.can_log_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.appointments a
    where a.id = p_appointment
      and ((a.therapist_id = auth.uid() and app.is_staff(a.organization_id)) or app.is_org_admin(a.organization_id))
  )
$$;

create or replace function app.session_child(p_session uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.child_id from public.sessions s where s.id = p_session
$$;

create or replace function app.session_locked_at(p_session uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select s.locked_at from public.sessions s where s.id = p_session
$$;

create or replace function app.can_view_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session
      and ((s.therapist_id = auth.uid() and app.is_staff(s.organization_id)) or app.can_view_child_brief(s.child_id))
  )
$$;

-- SOAP notes: author or full access (never brief-only, never parents).
create or replace function app.can_view_session_notes(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session
      and ((s.therapist_id = auth.uid() and app.is_staff(s.organization_id)) or app.can_view_child_full(s.child_id))
  )
$$;

create or replace function app.can_write_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session
      and ((s.therapist_id = auth.uid() and app.is_staff(s.organization_id)) or app.is_org_admin(s.organization_id))
  )
$$;

-- Substitute = an original therapist was replaced, or the therapist is not assigned to the child.
create or replace function app.is_substitute_for(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (a.original_therapist_id is not null and a.original_therapist_id <> a.therapist_id)
        or not exists (
          select 1 from public.child_therapists ct
          where ct.child_id = a.child_id and ct.user_id = a.therapist_id
            and ct.active_from <= (a.starts_at at time zone app.tz())::date
            and (ct.active_to is null or ct.active_to >= (a.starts_at at time zone app.tz())::date)
        )
    from public.appointments a where a.id = p_appointment
  ), false)
$$;

create or replace function app.org_settings(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.default_org_settings() || coalesce((select o.settings from public.organizations o where o.id = p_org), '{}'::jsonb)
$$;

-- ---------------------------------------------------------------------------
-- Threads, announcements, resources, home practice
-- ---------------------------------------------------------------------------
create or replace function app.is_thread_member(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.thread_members tm where tm.thread_id = p_thread and tm.user_id = auth.uid())
$$;

create or replace function app.can_read_thread_row(p_org uuid, p_kind public.thread_kind, p_child uuid, p_thread uuid)
returns boolean language sql stable as $$
  select case p_kind
    -- Staff-only threads are never visible to parents, even if somehow added as members.
    when 'staff_only' then app.is_staff(p_org) and (
      app.is_org_admin(p_org)
      or (p_child is not null and app.can_view_child_full(p_child))
      or app.is_thread_member(p_thread)
    )
    when 'care_team' then
      app.is_org_admin(p_org)
      or (p_child is not null and (app.can_view_child_full(p_child) or app.is_guardian_of(p_child)))
      or (app.is_member(p_org) and app.is_thread_member(p_thread))
    else app.is_member(p_org) and app.is_thread_member(p_thread)
  end
$$;

create or replace function app.can_read_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.can_read_thread_row(t.organization_id, t.kind, t.child_id, t.id)
    from public.threads t where t.id = p_thread
  ), false)
$$;

create or replace function app.thread_created_by(p_thread uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.created_by from public.threads t where t.id = p_thread
$$;

create or replace function app.can_read_announcement(
  p_org uuid, p_audience public.announcement_audience, p_therapy_type uuid, p_created_by uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_staff(p_org)
    or (p_created_by = auth.uid() and app.is_member(p_org))
    or (app.has_role(p_org, '{parent}') and case p_audience
      when 'everyone' then true
      when 'all_parents' then true
      when 'therapy_type' then exists (
        select 1 from public.child_guardians g
        join public.child_therapists ct on ct.child_id = g.child_id
        where g.user_id = auth.uid() and g.organization_id = p_org and ct.therapy_type_id = p_therapy_type
          and (ct.active_to is null or ct.active_to >= app.today())
      )
      else false
    end)
$$;

create or replace function app.resource_shared_with_me(p_resource uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.resource_shares rs
    where rs.resource_id = p_resource
      and app.is_member(rs.organization_id)
      and (rs.user_id = auth.uid() or (rs.child_id is not null and app.is_guardian_of(rs.child_id)))
  )
$$;

create or replace function app.task_row(p_task uuid) returns public.home_tasks
language sql stable security definer set search_path = '' as $$
  select t.* from public.home_tasks t where t.id = p_task
$$;

-- Columns other than p_allowed are unchanged between two row images.
create or replace function app.only_changed(p_old jsonb, p_new jsonb, p_allowed text[]) returns boolean
language sql immutable as $$
  select (p_old - p_allowed - 'updated_at') = (p_new - p_allowed - 'updated_at')
$$;

-- ---------------------------------------------------------------------------
-- Organization propagation + cross-tenant reference validation (triggers)
-- Callers never need to send organization_id for child/session/thread-scoped rows; if they do,
-- it must match. Referenced therapy types / staff must belong to the same school.
-- ---------------------------------------------------------------------------
create or replace function app.set_org_from_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if new.child_id is null then
    return new;
  end if;
  select c.organization_id into v_org from public.children c where c.id = new.child_id;
  if v_org is null then
    perform app.raise('validation', 'unknown child');
  end if;
  if new.organization_id is null then
    new.organization_id := v_org;
  elsif new.organization_id <> v_org then
    perform app.raise('forbidden', 'organization mismatch');
  end if;
  return new;
end
$$;

create or replace function app.set_org_from_session() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.sessions s where s.id = new.session_id;
  if v_org is null then
    perform app.raise('validation', 'unknown session');
  end if;
  if new.organization_id is null then
    new.organization_id := v_org;
  elsif new.organization_id <> v_org then
    perform app.raise('forbidden', 'organization mismatch');
  end if;
  return new;
end
$$;

create or replace function app.set_org_from_thread() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select t.organization_id into v_org from public.threads t where t.id = new.thread_id;
  if v_org is null then
    perform app.raise('validation', 'unknown thread');
  end if;
  if new.organization_id is null then
    new.organization_id := v_org;
  elsif new.organization_id <> v_org then
    perform app.raise('forbidden', 'organization mismatch');
  end if;
  return new;
end
$$;

create or replace function app.set_org_from_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select a.organization_id into v_org from public.appointments a where a.id = new.appointment_id;
  if v_org is null then
    perform app.raise('validation', 'unknown appointment');
  end if;
  if new.organization_id is null then
    new.organization_id := v_org;
  elsif new.organization_id <> v_org then
    perform app.raise('forbidden', 'organization mismatch');
  end if;
  return new;
end
$$;

-- Shared validator: therapy type and staff references must be in the row's organization.
create or replace function app.assert_refs_in_org(p_org uuid, p_therapy_type uuid, p_staff uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid;
begin
  if p_therapy_type is not null and not exists (
    select 1 from public.therapy_types tt where tt.id = p_therapy_type and tt.organization_id = p_org
  ) then
    perform app.raise('validation', 'therapy type does not belong to this school');
  end if;
  foreach v_user in array coalesce(p_staff, '{}') loop
    if v_user is not null and not app.user_in_org(v_user, p_org, true) then
      perform app.raise('validation', 'staff member does not belong to this school');
    end if;
  end loop;
end
$$;

create or replace function app.validate_child_refs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  case tg_table_name
    when 'appointments' then
      perform app.assert_refs_in_org(new.organization_id, new.therapy_type_id, array[new.therapist_id, new.original_therapist_id]);
    when 'appointment_series' then
      perform app.assert_refs_in_org(new.organization_id, new.therapy_type_id, array[new.therapist_id]);
    when 'child_therapists' then
      perform app.assert_refs_in_org(new.organization_id, new.therapy_type_id, array[new.user_id]);
    when 'goals' then
      perform app.assert_refs_in_org(new.organization_id, new.therapy_type_id, null);
    when 'child_guardians' then
      if not app.user_in_org(new.user_id, new.organization_id) then
        perform app.raise('validation', 'guardian is not a member of this school');
      end if;
    when 'home_tasks' then
      if new.goal_id is not null and not exists (
        select 1 from public.goals g where g.id = new.goal_id and g.child_id = new.child_id
      ) then
        perform app.raise('validation', 'goal does not belong to this child');
      end if;
      if new.resource_id is not null and not exists (
        select 1 from public.resources r where r.id = new.resource_id
          and (r.organization_id is null or r.organization_id = new.organization_id)
      ) then
        perform app.raise('validation', 'resource does not belong to this school');
      end if;
    else
      null;
  end case;
  return new;
end
$$;

create or replace function app.validate_org_refs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  case tg_table_name
    when 'member_therapy_types' then
      perform app.assert_refs_in_org(new.organization_id, new.therapy_type_id, array[new.user_id]);
    when 'announcements' then
      perform app.assert_refs_in_org(new.organization_id, new.therapy_type_id, null);
    when 'therapist_unavailability' then
      perform app.assert_refs_in_org(new.organization_id, null, array[new.user_id]);
    when 'resource_shares' then
      if not exists (
        select 1 from public.resources r where r.id = new.resource_id
          and (r.organization_id is null or r.organization_id = new.organization_id)
      ) then
        perform app.raise('validation', 'resource does not belong to this school');
      end if;
      if new.user_id is not null and not app.user_in_org(new.user_id, new.organization_id) then
        perform app.raise('validation', 'user is not a member of this school');
      end if;
    else
      null;
  end case;
  return new;
end
$$;

create or replace function app.goal_trials_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.goals g join public.sessions s on s.child_id = g.child_id
    where g.id = new.goal_id and s.id = new.session_id
  ) then
    perform app.raise('validation', 'goal does not belong to this child');
  end if;
  return new;
end
$$;

-- thread_members: member must belong to the school; staff-only threads accept staff only.
create or replace function app.thread_members_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind public.thread_kind;
begin
  select t.kind into v_kind from public.threads t where t.id = new.thread_id;
  if not app.user_in_org(new.user_id, new.organization_id, v_kind = 'staff_only') then
    perform app.raise('validation', case when v_kind = 'staff_only'
      then 'only staff can join a staff-only thread' else 'user is not a member of this school' end);
  end if;
  return new;
end
$$;

-- home_logs: organization and child always come from the task.
create or replace function app.home_logs_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.home_tasks;
begin
  t := app.task_row(new.task_id);
  if t.id is null then
    perform app.raise('validation', 'unknown home task');
  end if;
  if new.organization_id is not null and new.organization_id <> t.organization_id then
    perform app.raise('forbidden', 'organization mismatch');
  end if;
  new.organization_id := t.organization_id;
  new.child_id := t.child_id;
  return new;
end
$$;

-- media: retention for videos (OrgSettings.videoRetentionDays, default 180).
create or replace function app.media_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'video' and new.expires_at is null then
    new.expires_at := now() + make_interval(days => coalesce((app.org_settings(new.organization_id) ->> 'videoRetentionDays')::int, 180));
  end if;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'child_profiles', 'child_clinical', 'profile_edits', 'child_guardians', 'child_therapists', 'goals',
    'appointment_series', 'appointments', 'parent_checkins', 'home_tasks', 'alerts', 'data_requests',
    'threads', 'media', 'resource_shares', 'consents'
  ] loop
    execute format('create trigger a_set_org before insert or update of child_id, organization_id on public.%I
                    for each row execute function app.set_org_from_child()', t);
  end loop;
  foreach t in array array['session_ratings', 'goal_trials', 'behaviour_incidents', 'session_notes', 'amendments'] loop
    execute format('create trigger a_set_org before insert or update of session_id, organization_id on public.%I
                    for each row execute function app.set_org_from_session()', t);
  end loop;
  foreach t in array array['thread_members', 'messages', 'message_reads'] loop
    execute format('create trigger a_set_org before insert or update of thread_id, organization_id on public.%I
                    for each row execute function app.set_org_from_thread()', t);
  end loop;
  foreach t in array array['reschedule_requests', 'brief_acknowledgements'] loop
    execute format('create trigger a_set_org before insert or update of appointment_id, organization_id on public.%I
                    for each row execute function app.set_org_from_appointment()', t);
  end loop;
  foreach t in array array['appointments', 'appointment_series', 'child_therapists', 'goals', 'child_guardians', 'home_tasks'] loop
    execute format('create trigger b_validate_refs before insert or update on public.%I
                    for each row execute function app.validate_child_refs()', t);
  end loop;
  foreach t in array array['member_therapy_types', 'announcements', 'therapist_unavailability', 'resource_shares'] loop
    execute format('create trigger b_validate_refs before insert or update on public.%I
                    for each row execute function app.validate_org_refs()', t);
  end loop;
end
$$;

create trigger b_validate_goal before insert or update of goal_id, session_id on public.goal_trials
  for each row execute function app.goal_trials_validate();
create trigger b_validate_member before insert or update on public.thread_members
  for each row execute function app.thread_members_validate();
create trigger a_from_task before insert or update of task_id on public.home_logs
  for each row execute function app.home_logs_before_insert();
-- (b_ so it runs after a_set_org has filled organization_id)
create trigger b_media_defaults before insert on public.media
  for each row execute function app.media_before_insert();

-- ---------------------------------------------------------------------------
-- Guard triggers for API callers (column whitelists, lock window)
-- ---------------------------------------------------------------------------

-- Organizations: only the platform admin changes a school's status.
create or replace function app.organizations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.status is distinct from old.status and not app.is_platform_admin() then
    perform app.raise('forbidden', 'only the platform admin can change school status');
  end if;
  return new;
end
$$;
create trigger c_guard before update on public.organizations
  for each row execute function app.organizations_guard();

-- Appointments: org admins edit freely; the therapist may only mark attendance/completion;
-- a guardian may only cancel a future appointment ("cancelled by parent").
create or replace function app.appointments_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') or app.is_org_admin(old.organization_id) then
    return new;
  end if;
  if old.therapist_id = auth.uid() and app.is_staff(old.organization_id) then
    if not app.only_changed(to_jsonb(old), to_jsonb(new), '{attendance,late_minutes,status}')
       or new.status not in (old.status, 'completed') then
      perform app.raise('forbidden', 'therapists can only mark attendance');
    end if;
    return new;
  end if;
  if app.is_guardian_of(old.child_id) then
    if not app.only_changed(to_jsonb(old), to_jsonb(new), '{attendance,status,cancel_reason}')
       or old.status <> 'scheduled' or old.starts_at <= now()
       or new.status <> 'cancelled' or new.attendance is distinct from 'cancelled_by_parent' then
      perform app.raise('forbidden', 'parents can only cancel an upcoming appointment');
    end if;
    return new;
  end if;
  perform app.raise('forbidden');
  return null;
end
$$;
create trigger c_guard before update on public.appointments
  for each row execute function app.appointments_guard();

-- Sessions: derived fields come from the appointment; metrics/lock columns are owned by the
-- compute routines; nothing changes through the API after locked_at (use amend_session).
create or replace function app.sessions_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_api boolean := current_user in ('authenticated', 'anon');
  a public.appointments;
  v_lock_hours numeric;
begin
  if tg_op = 'DELETE' then
    if v_api and old.locked_at <= now() then
      perform app.raise('locked');
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    a := app.appointment_row(new.appointment_id);
    if a.id is null then
      perform app.raise('not_found', 'appointment');
    end if;
    new.organization_id := a.organization_id;
    new.child_id := a.child_id;
    new.therapist_id := a.therapist_id;
    new.therapy_type_id := a.therapy_type_id;
    new.date := (a.starts_at at time zone app.tz())::date;
    new.is_substitute := app.is_substitute_for(a.id);
    if v_api then
      new.created_at := now();
      new.session_score := null;
      new.goal_accuracy := null;
      new.delta_last := null;
      new.delta_rolling := null;
      new.rolling_average := null;
      new.trend := 'flat';
      new.dimension_metrics := '{}'::jsonb;
      new.incident_count := 0;
      new.amendment_count := 0;
      new.locked_at := null;
    end if;
    if new.locked_at is null then
      v_lock_hours := coalesce((app.org_settings(a.organization_id) ->> 'logLockHours')::numeric, 24);
      new.locked_at := new.created_at + v_lock_hours * interval '1 hour';
    end if;
    return new;
  end if;

  -- UPDATE
  if v_api then
    if old.locked_at <= now() then
      perform app.raise('locked');
    end if;
    new.id := old.id;
    new.organization_id := old.organization_id;
    new.client_id := old.client_id;
    new.appointment_id := old.appointment_id;
    new.child_id := old.child_id;
    new.therapist_id := old.therapist_id;
    new.therapy_type_id := old.therapy_type_id;
    new.is_substitute := old.is_substitute;
    new.date := old.date;
    new.session_score := old.session_score;
    new.goal_accuracy := old.goal_accuracy;
    new.delta_last := old.delta_last;
    new.delta_rolling := old.delta_rolling;
    new.rolling_average := old.rolling_average;
    new.trend := old.trend;
    new.dimension_metrics := old.dimension_metrics;
    new.incident_count := old.incident_count;
    new.locked_at := old.locked_at;
    new.amendment_count := old.amendment_count;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end
$$;
create trigger c_guard before insert or update or delete on public.sessions
  for each row execute function app.sessions_guard();

-- Ratings / trials / incidents / notes follow their session's lock.
create or replace function app.session_children_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_session uuid;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and new.session_id <> old.session_id then
      perform app.raise('forbidden');
    end if;
    v_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
    if app.session_locked_at(v_session) <= now() then
      perform app.raise('locked');
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
do $$
declare t text;
begin
  foreach t in array array['session_ratings', 'goal_trials', 'behaviour_incidents', 'session_notes'] loop
    execute format('create trigger c_lock_guard before insert or update or delete on public.%I
                    for each row execute function app.session_children_guard()', t);
  end loop;
end
$$;

-- Home logs: the parent edits their own unreviewed log; staff only write the review fields.
create or replace function app.home_logs_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.reviewed_by := null;
    new.review_reaction := null;
    new.review_comment := null;
    new.reviewed_at := null;
    new.use_in_next_session := false;
    return new;
  end if;
  if app.can_view_child_full(old.child_id) then
    if not app.only_changed(to_jsonb(old), to_jsonb(new),
         '{reviewed_by,review_reaction,review_comment,reviewed_at,use_in_next_session}') then
      perform app.raise('forbidden', 'staff can only review a home log');
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := coalesce(new.reviewed_at, now());
    return new;
  end if;
  if old.logged_by = auth.uid() then
    if old.reviewed_at is not null
       or not app.only_changed(to_jsonb(old), to_jsonb(new), '{outcome,difficulty,note,media_id}') then
      perform app.raise('forbidden', 'a reviewed log cannot be edited');
    end if;
    return new;
  end if;
  perform app.raise('forbidden');
  return null;
end
$$;
create trigger c_guard before insert or update on public.home_logs
  for each row execute function app.home_logs_guard();

-- Notifications: users only mark them read.
create or replace function app.notifications_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not app.only_changed(to_jsonb(old), to_jsonb(new), '{read_at}') then
    perform app.raise('forbidden', 'only read_at can be changed');
  end if;
  return new;
end
$$;
create trigger c_guard before update on public.notifications
  for each row execute function app.notifications_guard();

-- Alerts: staff acknowledge / resolve only.
create or replace function app.alerts_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if not app.only_changed(to_jsonb(old), to_jsonb(new), '{status,resolved_by,resolved_at}') then
      perform app.raise('forbidden', 'only the alert status can be changed');
    end if;
    if new.status = 'resolved' and old.status <> 'resolved' then
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    end if;
  end if;
  return new;
end
$$;
create trigger c_guard before update on public.alerts
  for each row execute function app.alerts_guard();

-- Media: API uploads are always owned by the caller.
create or replace function app.media_owner_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid();
    elsif new.owner_id <> old.owner_id or new.bucket_path <> old.bucket_path or new.organization_id <> old.organization_id then
      perform app.raise('forbidden');
    end if;
  end if;
  return new;
end
$$;
create trigger c_guard before insert or update on public.media
  for each row execute function app.media_owner_guard();

-- ---------------------------------------------------------------------------
-- Enable RLS on EVERY table in public (asserted again at the end of this file)
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- (select auth.uid()) is used so Postgres evaluates it once per statement.
-- ---------------------------------------------------------------------------

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (app.belongs_to_org(id) or app.is_platform_admin());
create policy organizations_insert on public.organizations for insert to authenticated
  with check (app.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (app.has_role(id, '{school_admin}') or app.is_platform_admin())
  with check (app.has_role(id, '{school_admin}') or app.is_platform_admin());

-- branches
create policy branches_select on public.branches for select to authenticated
  using (app.is_member(organization_id));
create policy branches_write on public.branches for all to authenticated
  using (app.has_role(organization_id, '{school_admin}'))
  with check (app.has_role(organization_id, '{school_admin}'));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (app.can_read_profile(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or (organization_id is not null and app.is_member(organization_id) and app.can_read_profile(user_id))
  );
-- No INSERT policy: memberships are created only by accept_pending_invites() / create_school(),
-- so a school admin cannot attach an arbitrary existing account to their school.
create policy memberships_update on public.memberships for update to authenticated
  using (organization_id is not null and app.has_role(organization_id, '{school_admin}'))
  with check (organization_id is not null and role <> 'platform_admin' and app.has_role(organization_id, '{school_admin}'));
create policy memberships_delete on public.memberships for delete to authenticated
  using (organization_id is not null and app.has_role(organization_id, '{school_admin}'));

-- invites
create policy invites_select on public.invites for select to authenticated
  using (app.is_org_admin(organization_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (
    app.is_org_admin(organization_id)
    and (role not in ('school_admin', 'coordinator') or app.has_role(organization_id, '{school_admin}'))
    and app.children_in_org(child_ids, organization_id)
  );
create policy invites_update on public.invites for update to authenticated
  using (app.is_org_admin(organization_id))
  with check (
    app.is_org_admin(organization_id)
    and (role not in ('school_admin', 'coordinator') or app.has_role(organization_id, '{school_admin}'))
    and app.children_in_org(child_ids, organization_id)
  );
create policy invites_delete on public.invites for delete to authenticated
  using (app.has_role(organization_id, '{school_admin}'));

-- member_therapy_types
create policy member_therapy_types_select on public.member_therapy_types for select to authenticated
  using (app.is_staff(organization_id) or user_id = (select auth.uid()));
create policy member_therapy_types_write on public.member_therapy_types for all to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

-- therapy_types
create policy therapy_types_select on public.therapy_types for select to authenticated
  using (app.is_member(organization_id));
create policy therapy_types_write on public.therapy_types for all to authenticated
  using (app.has_role(organization_id, '{school_admin}'))
  with check (app.has_role(organization_id, '{school_admin}'));

-- children
create policy children_select on public.children for select to authenticated
  using (app.is_org_admin(organization_id) or app.can_view_child_basic(id));
create policy children_insert on public.children for insert to authenticated
  with check (app.is_org_admin(organization_id));
create policy children_update on public.children for update to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));
create policy children_delete on public.children for delete to authenticated
  using (app.has_role(organization_id, '{school_admin}'));

-- child_profiles (About Me, no clinical data)
create policy child_profiles_select on public.child_profiles for select to authenticated
  using (app.can_view_child_brief(child_id) or app.is_guardian_of(child_id));
create policy child_profiles_insert on public.child_profiles for insert to authenticated
  with check (app.can_view_child_full(child_id));
create policy child_profiles_update on public.child_profiles for update to authenticated
  using (app.can_view_child_full(child_id))
  with check (app.can_view_child_full(child_id));
create policy child_profiles_delete on public.child_profiles for delete to authenticated
  using (app.is_org_admin(organization_id));

-- child_clinical (admin, coordinator, assigned therapists only)
create policy child_clinical_select on public.child_clinical for select to authenticated
  using (app.can_view_child_clinical(child_id));
create policy child_clinical_insert on public.child_clinical for insert to authenticated
  with check (app.can_view_child_clinical(child_id));
create policy child_clinical_update on public.child_clinical for update to authenticated
  using (app.can_view_child_clinical(child_id))
  with check (app.can_view_child_clinical(child_id));
create policy child_clinical_delete on public.child_clinical for delete to authenticated
  using (app.is_org_admin(organization_id));

-- profile_edits (written by trigger only)
create policy profile_edits_select on public.profile_edits for select to authenticated
  using (app.can_view_child_full(child_id));

-- child_guardians
create policy child_guardians_select on public.child_guardians for select to authenticated
  using (
    app.is_org_admin(organization_id) or user_id = (select auth.uid())
    or app.is_guardian_of(child_id) or app.can_view_child_brief(child_id)
  );
create policy child_guardians_write on public.child_guardians for all to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

-- child_therapists
create policy child_therapists_select on public.child_therapists for select to authenticated
  using (
    app.is_org_admin(organization_id) or (user_id = (select auth.uid()) and app.is_staff(organization_id))
    or app.can_view_child_brief(child_id) or app.is_guardian_of(child_id)
  );
create policy child_therapists_write on public.child_therapists for all to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

-- goal_bank (null org = global template)
create policy goal_bank_select on public.goal_bank for select to authenticated
  using (organization_id is null or app.is_staff(organization_id));
create policy goal_bank_insert on public.goal_bank for insert to authenticated
  with check (
    (organization_id is null and app.is_platform_admin())
    or (organization_id is not null and app.is_staff(organization_id))
  );
create policy goal_bank_update on public.goal_bank for update to authenticated
  using ((organization_id is null and app.is_platform_admin()) or app.is_org_admin(organization_id))
  with check ((organization_id is null and app.is_platform_admin()) or app.is_org_admin(organization_id));
create policy goal_bank_delete on public.goal_bank for delete to authenticated
  using ((organization_id is null and app.is_platform_admin()) or app.is_org_admin(organization_id));

-- goals (parents read parent-safe goals via parent_goals())
create policy goals_select on public.goals for select to authenticated
  using (app.can_view_child_brief(child_id));
create policy goals_insert on public.goals for insert to authenticated
  with check (app.can_view_child_full(child_id));
create policy goals_update on public.goals for update to authenticated
  using (app.can_view_child_full(child_id))
  with check (app.can_view_child_full(child_id));
create policy goals_delete on public.goals for delete to authenticated
  using (app.is_org_admin(organization_id));

-- appointment_series
create policy appointment_series_select on public.appointment_series for select to authenticated
  using (
    app.is_org_admin(organization_id)
    or (therapist_id = (select auth.uid()) and app.is_staff(organization_id))
    or app.can_view_child_full(child_id)
  );
create policy appointment_series_write on public.appointment_series for all to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

-- appointments
create policy appointments_select on public.appointments for select to authenticated
  using (
    app.is_org_admin(organization_id)
    or ((therapist_id = (select auth.uid()) or original_therapist_id = (select auth.uid())) and app.is_staff(organization_id))
    or app.can_view_child_full(child_id)
    or app.is_guardian_of(child_id)
  );
create policy appointments_insert on public.appointments for insert to authenticated
  with check (app.is_org_admin(organization_id));
-- Column-level rules for therapists / guardians are in app.appointments_guard().
create policy appointments_update on public.appointments for update to authenticated
  using (
    app.is_org_admin(organization_id)
    or (therapist_id = (select auth.uid()) and app.is_staff(organization_id))
    or app.is_guardian_of(child_id)
  )
  with check (
    app.is_org_admin(organization_id)
    or (therapist_id = (select auth.uid()) and app.is_staff(organization_id))
    or app.is_guardian_of(child_id)
  );
create policy appointments_delete on public.appointments for delete to authenticated
  using (app.is_org_admin(organization_id));

-- reschedule_requests (normally written through request_reschedule / resolve_reschedule)
create policy reschedule_requests_select on public.reschedule_requests for select to authenticated
  using (
    app.is_org_admin(organization_id)
    or (requested_by = (select auth.uid()) and app.is_member(organization_id))
    or app.is_guardian_of(app.appointment_child(appointment_id))
    or (app.appointment_therapist(appointment_id) = (select auth.uid()) and app.is_staff(organization_id))
  );
create policy reschedule_requests_insert on public.reschedule_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and app.is_guardian_of(app.appointment_child(appointment_id)));
create policy reschedule_requests_update on public.reschedule_requests for update to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

-- therapist_unavailability
create policy therapist_unavailability_select on public.therapist_unavailability for select to authenticated
  using (app.is_org_admin(organization_id) or (user_id = (select auth.uid()) and app.is_staff(organization_id)));
create policy therapist_unavailability_write on public.therapist_unavailability for all to authenticated
  using (app.is_org_admin(organization_id) or (user_id = (select auth.uid()) and app.is_staff(organization_id)))
  with check (app.is_org_admin(organization_id) or (user_id = (select auth.uid()) and app.is_staff(organization_id)));

-- rating_dimensions (null org = platform template)
create policy rating_dimensions_select on public.rating_dimensions for select to authenticated
  using (organization_id is null or app.is_member(organization_id));
create policy rating_dimensions_write on public.rating_dimensions for all to authenticated
  using (
    (organization_id is null and app.is_platform_admin())
    or (organization_id is not null and app.has_role(organization_id, '{school_admin}'))
  )
  with check (
    (organization_id is null and app.is_platform_admin())
    or (organization_id is not null and app.has_role(organization_id, '{school_admin}'))
  );

-- sessions (no parent access; parents use parent_session_snapshot*)
create policy sessions_select on public.sessions for select to authenticated
  using (
    (therapist_id = (select auth.uid()) and app.is_staff(organization_id))
    or app.can_view_child_brief(child_id)
  );
create policy sessions_insert on public.sessions for insert to authenticated
  with check (app.can_log_appointment(appointment_id));
create policy sessions_update on public.sessions for update to authenticated
  using ((therapist_id = (select auth.uid()) and app.is_staff(organization_id)) or app.is_org_admin(organization_id))
  with check ((therapist_id = (select auth.uid()) and app.is_staff(organization_id)) or app.is_org_admin(organization_id));

-- session_ratings / goal_trials / behaviour_incidents (brief level)
create policy session_ratings_select on public.session_ratings for select to authenticated
  using (app.can_view_session(session_id));
create policy session_ratings_write on public.session_ratings for all to authenticated
  using (app.can_write_session(session_id))
  with check (app.can_write_session(session_id));
create policy goal_trials_select on public.goal_trials for select to authenticated
  using (app.can_view_session(session_id));
create policy goal_trials_write on public.goal_trials for all to authenticated
  using (app.can_write_session(session_id))
  with check (app.can_write_session(session_id));
create policy behaviour_incidents_select on public.behaviour_incidents for select to authenticated
  using (app.can_view_session(session_id));
create policy behaviour_incidents_write on public.behaviour_incidents for all to authenticated
  using (app.can_write_session(session_id))
  with check (app.can_write_session(session_id));

-- session_notes (author or full access only)
create policy session_notes_select on public.session_notes for select to authenticated
  using (app.can_view_session_notes(session_id));
create policy session_notes_write on public.session_notes for all to authenticated
  using (app.can_write_session(session_id))
  with check (app.can_write_session(session_id));

-- amendments (written by amend_session only)
create policy amendments_select on public.amendments for select to authenticated
  using (
    app.is_org_admin(organization_id)
    or ("by" = (select auth.uid()) and app.is_staff(organization_id))
    or app.can_view_child_full(app.session_child(session_id))
  );

-- parent_checkins
create policy parent_checkins_select on public.parent_checkins for select to authenticated
  using (app.is_guardian_of(child_id) or app.can_view_child_brief(child_id));
create policy parent_checkins_insert on public.parent_checkins for insert to authenticated
  with check (submitted_by = (select auth.uid()) and app.is_guardian_of(child_id));
create policy parent_checkins_update on public.parent_checkins for update to authenticated
  using (submitted_by = (select auth.uid()))
  with check (submitted_by = (select auth.uid()) and app.is_guardian_of(child_id));

-- media (rows for objects in the private `media` bucket)
create policy media_select on public.media for select to authenticated
  using (
    (owner_id = (select auth.uid()) and app.is_member(organization_id))
    or app.is_org_admin(organization_id)
    or (child_id is not null and (app.is_guardian_of(child_id) or app.can_view_child_brief(child_id)))
  );
create policy media_insert on public.media for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and app.is_member(organization_id)
    and (
      child_id is null
      or app.can_view_child_full(child_id)
      or (app.is_guardian_of(child_id) and (kind <> 'video' or app.has_video_consent(child_id)))
    )
  );
create policy media_update on public.media for update to authenticated
  using ((owner_id = (select auth.uid()) and app.is_member(organization_id)) or app.is_org_admin(organization_id))
  with check ((owner_id = (select auth.uid()) and app.is_member(organization_id)) or app.is_org_admin(organization_id));
create policy media_delete on public.media for delete to authenticated
  using ((owner_id = (select auth.uid()) and app.is_member(organization_id)) or app.is_org_admin(organization_id));

-- resources (null org = global; audience 'staff' hidden from parents)
create policy resources_select on public.resources for select to authenticated
  using (
    (organization_id is null and (app.is_any_staff() or app.is_platform_admin() or audience <> 'staff'))
    or (organization_id is not null and (
      app.is_staff(organization_id) or (app.is_member(organization_id) and audience <> 'staff')
    ))
    or app.resource_shared_with_me(id)
  );
create policy resources_insert on public.resources for insert to authenticated
  with check (
    (organization_id is null and app.is_platform_admin())
    or (organization_id is not null and app.is_staff(organization_id))
  );
create policy resources_update on public.resources for update to authenticated
  using (
    (organization_id is null and app.is_platform_admin())
    or (organization_id is not null and (app.is_org_admin(organization_id)
        or (created_by = (select auth.uid()) and app.is_staff(organization_id))))
  )
  with check (
    (organization_id is null and app.is_platform_admin())
    or (organization_id is not null and app.is_staff(organization_id))
  );
create policy resources_delete on public.resources for delete to authenticated
  using (
    (organization_id is null and app.is_platform_admin())
    or (organization_id is not null and (app.is_org_admin(organization_id)
        or (created_by = (select auth.uid()) and app.is_staff(organization_id))))
  );

-- resource_shares
create policy resource_shares_select on public.resource_shares for select to authenticated
  using (
    app.is_staff(organization_id)
    or (user_id = (select auth.uid()) and app.is_member(organization_id))
    or (child_id is not null and app.is_guardian_of(child_id))
  );
create policy resource_shares_insert on public.resource_shares for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and app.is_staff(organization_id)
    and (child_id is null or app.can_view_child_brief(child_id))
  );
create policy resource_shares_delete on public.resource_shares for delete to authenticated
  using ((shared_by = (select auth.uid()) and app.is_staff(organization_id)) or app.is_org_admin(organization_id));

-- home_tasks
create policy home_tasks_select on public.home_tasks for select to authenticated
  using (app.is_guardian_of(child_id) or app.can_view_child_brief(child_id));
create policy home_tasks_insert on public.home_tasks for insert to authenticated
  with check (assigned_by = (select auth.uid()) and app.can_view_child_full(child_id));
create policy home_tasks_update on public.home_tasks for update to authenticated
  using (app.can_view_child_full(child_id))
  with check (app.can_view_child_full(child_id));
create policy home_tasks_delete on public.home_tasks for delete to authenticated
  using (app.is_org_admin(organization_id));

-- home_logs (column rules in app.home_logs_guard)
create policy home_logs_select on public.home_logs for select to authenticated
  using (app.is_guardian_of(child_id) or app.can_view_child_brief(child_id));
create policy home_logs_insert on public.home_logs for insert to authenticated
  with check (logged_by = (select auth.uid()) and app.is_guardian_of(child_id));
create policy home_logs_update on public.home_logs for update to authenticated
  using ((logged_by = (select auth.uid()) and app.is_guardian_of(child_id)) or app.can_view_child_full(child_id))
  with check ((logged_by = (select auth.uid()) and app.is_guardian_of(child_id)) or app.can_view_child_full(child_id));

-- threads
create policy threads_select on public.threads for select to authenticated
  using (app.can_read_thread_row(organization_id, kind, child_id, id));
create policy threads_insert on public.threads for insert to authenticated
  with check (
    app.is_staff(organization_id)
    and (child_id is null or app.is_org_admin(organization_id) or app.can_view_child_full(child_id))
  );
create policy threads_update on public.threads for update to authenticated
  using (app.is_org_admin(organization_id) or (created_by = (select auth.uid()) and app.is_staff(organization_id)))
  with check (app.is_org_admin(organization_id) or (created_by = (select auth.uid()) and app.is_staff(organization_id)));
create policy threads_delete on public.threads for delete to authenticated
  using (app.is_org_admin(organization_id));

-- thread_members
create policy thread_members_select on public.thread_members for select to authenticated
  using (app.can_read_thread(thread_id));
create policy thread_members_insert on public.thread_members for insert to authenticated
  with check (
    app.is_org_admin(organization_id)
    or (app.thread_created_by(thread_id) = (select auth.uid()) and app.is_staff(organization_id))
  );
create policy thread_members_delete on public.thread_members for delete to authenticated
  using (
    app.is_org_admin(organization_id)
    or (app.thread_created_by(thread_id) = (select auth.uid()) and app.is_staff(organization_id))
  );

-- messages (immutable once sent)
create policy messages_select on public.messages for select to authenticated
  using (app.can_read_thread(thread_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and app.can_read_thread(thread_id));

-- message_reads
create policy message_reads_select on public.message_reads for select to authenticated
  using (app.can_read_thread(thread_id));
create policy message_reads_insert on public.message_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and app.can_read_thread(thread_id));
create policy message_reads_update on public.message_reads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and app.can_read_thread(thread_id));

-- announcements
create policy announcements_select on public.announcements for select to authenticated
  using (app.can_read_announcement(organization_id, audience, therapy_type_id, created_by));
create policy announcements_write on public.announcements for all to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

-- alerts (raised by save_session / reminders; staff acknowledge / resolve)
create policy alerts_select on public.alerts for select to authenticated
  using (app.can_view_child_brief(child_id));
create policy alerts_update on public.alerts for update to authenticated
  using (app.can_view_child_full(child_id))
  with check (app.can_view_child_full(child_id));

-- notifications (inserted by SECURITY DEFINER routines only)
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- push_tokens / notification_mutes (own rows)
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notification_mutes_own on public.notification_mutes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- consents (append-only history; no update/delete policies)
create policy consents_select on public.consents for select to authenticated
  using (
    user_id = (select auth.uid())
    or (child_id is not null and app.is_org_admin(app.child_org(child_id)))
  );
create policy consents_insert on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()) and (child_id is null or app.is_guardian_of(child_id)));

-- data_requests
create policy data_requests_select on public.data_requests for select to authenticated
  using ((user_id = (select auth.uid()) and app.is_member(organization_id)) or app.is_org_admin(organization_id));
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_guardian_of(child_id));
create policy data_requests_update on public.data_requests for update to authenticated
  using (app.is_org_admin(organization_id))
  with check (app.is_org_admin(organization_id));

-- audit_log (written by triggers only)
create policy audit_log_select on public.audit_log for select to authenticated
  using (organization_id is not null and app.is_org_admin(organization_id));

-- brief_acknowledgements
create policy brief_acknowledgements_select on public.brief_acknowledgements for select to authenticated
  using ((user_id = (select auth.uid()) and app.is_member(organization_id)) or app.is_org_admin(organization_id));
create policy brief_acknowledgements_insert on public.brief_acknowledgements for insert to authenticated
  with check (user_id = (select auth.uid()) and app.appointment_therapist(appointment_id) = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants: RLS is the gate; anon gets nothing.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon;
grant execute on all functions in schema app to authenticated, service_role;

-- Fail the migration if any public table is missing RLS.
do $$
declare v_missing text;
begin
  select string_agg(c.relname, ', ') into v_missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_missing is not null then
    raise exception 'RLS not enabled on: %', v_missing;
  end if;
end
$$;
