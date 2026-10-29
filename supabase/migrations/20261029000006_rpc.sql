-- =============================================================================
-- 20261029000006_rpc.sql — RPCs used by the app, notification triggers, cron routines
--
-- Intent
--   Small, explicit RPCs for things plain table access + RLS cannot express. Every SECURITY
--   DEFINER function re-checks authorization itself before touching data. Results are jsonb
--   with camelCase keys matching src/domain/types.ts where a TS type exists.
--
--   API (supabase.rpc(name, args)):
--     accept_pending_invites()                                   -> {accepted, organizationIds}
--     create_school(name, short_name, city, address, phone, admin_name, admin_phone)
--                                                                -> {organization, invite}   (platform admin)
--     assign_substitute(appointment_id, therapist_id)            -> Appointment               (org admin)
--     request_reschedule(appointment_id, proposed_slots, reason) -> RescheduleRequest         (guardian)
--     resolve_reschedule(request_id, action)                     -> RescheduleRequest
--         action = {type:'approve',slot} | {type:'decline',note} | {type:'counter',slots,note}
--                | {type:'accept_counter',slot}   (accept_counter: guardian; others: org admin)
--     parent_session_snapshot(session_id)                        -> ParentSessionSnapshot
--     parent_session_snapshots(child_id, limit_count)            -> ParentSessionSnapshot[] newest first
--     parent_goals(child_id)                                     -> parent-safe goals[]
--     parent_progress(child_id, since)                           -> {byTherapy, goalsSummary}
--     handover_brief(appointment_id)                             -> HandoverBrief-shaped jsonb
--     child_access(child_id)                                     -> 'full'|'brief_only'|'parent'|'none'
--     admin_dashboard(org_id, on_date)                           -> AdminDashboard counts + ids
--     platform_school_summaries()                                -> SchoolSummary[]           (platform admin)
--   Service role only (cron / Edge Functions): enqueue_reminders(p_now)
-- =============================================================================

-- Invites store phone in E.164 and email lower-case so acceptance can match exactly.
create or replace function app.invites_normalize() returns trigger
language plpgsql as $$
begin
  new.phone := app.normalize_phone(new.phone);
  new.email := lower(nullif(btrim(new.email), ''));
  return new;
end
$$;
create trigger a_normalize before insert or update of phone, email on public.invites
  for each row execute function app.invites_normalize();

create or replace function app.profiles_normalize() returns trigger
language plpgsql as $$
begin
  new.phone := app.normalize_phone(new.phone);
  new.email := lower(nullif(btrim(new.email), ''));
  return new;
end
$$;
create trigger a_normalize before insert or update of phone, email on public.profiles
  for each row execute function app.profiles_normalize();

create or replace function app.local_when(p_at timestamptz) returns text
language sql stable as $$ select to_char(p_at at time zone app.tz(), 'FMDD Mon, FMHH12:MI AM') $$;

create or replace function app.profile_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.full_name, ''), 'Staff') from public.profiles p where p.id = p_user
$$;

create or replace function app.therapy_type_name(p_type uuid) returns text
language sql stable security definer set search_path = '' as $$
  select tt.name from public.therapy_types tt where tt.id = p_type
$$;

-- ---------------------------------------------------------------------------
-- accept_pending_invites(): link the signed-in user's VERIFIED phone/email to pending invites
-- ---------------------------------------------------------------------------
create or replace function public.accept_pending_invites() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  u record;
  v_phone text;
  v_email text;
  inv public.invites;
  v_child uuid;
  v_accepted int := 0;
  v_orgs uuid[] := '{}';
begin
  if v_uid is null then
    perform app.raise('not_authenticated');
  end if;
  select au.phone, au.email, au.phone_confirmed_at, au.email_confirmed_at into u from auth.users au where au.id = v_uid;
  -- Only confirmed identifiers count: an unverified email/phone must never claim an invite.
  v_phone := case when u.phone_confirmed_at is not null then app.normalize_phone(u.phone) end;
  v_email := case when u.email_confirmed_at is not null then lower(u.email) end;
  if v_phone is null and v_email is null then
    return jsonb_build_object('accepted', 0, 'organizationIds', '[]'::jsonb);
  end if;

  insert into public.profiles (id, full_name, phone, email, created_by)
  values (v_uid, '', v_phone, v_email, v_uid)
  on conflict (id) do nothing;

  for inv in
    select i.* from public.invites i
    join public.organizations o on o.id = i.organization_id and o.status = 'active'
    where i.status = 'pending'
      and ((v_phone is not null and i.phone = v_phone) or (v_email is not null and i.email = v_email))
    order by i.created_at
    for update of i
  loop
    insert into public.memberships (user_id, organization_id, role, status, created_by)
    values (v_uid, inv.organization_id, inv.role, 'active', inv.created_by)
    on conflict on constraint memberships_unique do update set status = 'active'
      where public.memberships.status = 'invited';

    if inv.role = 'parent' then
      foreach v_child in array inv.child_ids loop
        if app.child_org(v_child) = inv.organization_id then
          insert into public.child_guardians (organization_id, child_id, user_id, relation, is_primary, created_by)
          values (
            inv.organization_id, v_child, v_uid, coalesce(nullif(inv.relation, ''), 'Guardian'),
            not exists (select 1 from public.child_guardians g where g.child_id = v_child), inv.created_by
          )
          on conflict (child_id, user_id) do nothing;
        end if;
      end loop;
    end if;

    update public.invites set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = inv.id;
    update public.profiles p set full_name = inv.full_name
    where p.id = v_uid and p.full_name = '' and coalesce(inv.full_name, '') <> '';
    insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, meta)
    values (inv.organization_id, v_uid, 'accept_invite', 'invites', inv.id, jsonb_build_object('role', inv.role));
    v_accepted := v_accepted + 1;
    v_orgs := array_append(v_orgs, inv.organization_id);
  end loop;

  return jsonb_build_object('accepted', v_accepted, 'organizationIds', to_jsonb(v_orgs));
end
$$;

-- ---------------------------------------------------------------------------
-- create_school(): platform admin creates a school + first School Admin invite
-- ---------------------------------------------------------------------------
create or replace function public.create_school(
  name text, short_name text, city text, address text, phone text, admin_name text, admin_phone text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organizations;
  v_inv public.invites;
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  if not app.is_platform_admin() then
    perform app.raise('forbidden', 'only the platform admin can create schools');
  end if;
  if coalesce(btrim(create_school.name), '') = '' or app.normalize_phone(create_school.admin_phone) is null then
    perform app.raise('validation', 'school name and admin phone are required');
  end if;

  insert into public.organizations (name, short_name, city, address, phone)
  values (
    btrim(create_school.name), coalesce(create_school.short_name, ''), coalesce(create_school.city, ''),
    coalesce(create_school.address, ''), coalesce(create_school.phone, '')
  )
  returning * into v_org;

  perform app.seed_org_defaults(v_org.id);

  insert into public.invites (organization_id, role, full_name, phone)
  values (v_org.id, 'school_admin', coalesce(create_school.admin_name, ''), create_school.admin_phone)
  returning * into v_inv;

  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, meta)
  values (v_org.id, auth.uid(), 'create_school', 'organizations', v_org.id, jsonb_build_object('inviteId', v_inv.id));

  return jsonb_build_object('organization', app.camel_keys(to_jsonb(v_org)), 'invite', app.camel_keys(to_jsonb(v_inv)));
end
$$;

-- ---------------------------------------------------------------------------
-- assign_substitute(): coordinator / school admin reassigns one appointment
-- ---------------------------------------------------------------------------
create or replace function public.assign_substitute(appointment_id uuid, therapist_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_appt uuid := assign_substitute.appointment_id;
  v_new uuid := assign_substitute.therapist_id;
  a public.appointments;
  v_prev uuid;
  v_original uuid;
  v_child text;
  v_type text;
  v_sub text;
  v_when text;
  v_today boolean;
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  select * into a from public.appointments where id = v_appt for update;
  if a.id is null or not app.is_member(a.organization_id) then
    perform app.raise('not_found', 'appointment');
  end if;
  if not app.is_org_admin(a.organization_id) then
    perform app.raise('forbidden', 'only coordinators and school admins assign substitutes');
  end if;
  if a.status <> 'scheduled' then
    perform app.raise('validation', 'only scheduled appointments can be reassigned');
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = v_new and m.organization_id = a.organization_id and m.status = 'active'
      and m.role in ('therapist', 'coordinator', 'school_admin')
  ) then
    perform app.raise('validation', 'the substitute must be an active staff member of this school');
  end if;
  if v_new = a.therapist_id then
    return app.camel_keys(to_jsonb(a));
  end if;

  v_prev := a.therapist_id;
  v_original := coalesce(a.original_therapist_id, a.therapist_id);
  perform set_config('app.suppress_appointment_notify', 'on', true);
  update public.appointments
  set therapist_id = v_new,
      original_therapist_id = case when v_new = v_original then null else v_original end
  where id = a.id
  returning * into a;
  perform set_config('app.suppress_appointment_notify', 'off', true);

  v_child := app.child_display_name(a.child_id);
  v_type := app.therapy_type_name(a.therapy_type_id);
  v_sub := app.profile_name(v_new);
  v_when := app.local_when(a.starts_at);
  v_today := (a.starts_at at time zone app.tz())::date = app.today();

  if v_new <> v_original then
    -- The substitute gets time-boxed brief access automatically (app.has_substitute_access).
    perform app.notify(
      v_new, a.organization_id, 'substitute_assigned', 'You are covering a session',
      format('%s – %s on %s. Please read the Handover Brief before the session.', v_child, v_type, v_when),
      '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id, 'briefRequired', true),
      'substitute:' || a.id || ':' || v_new
    );
    perform app.notify_guardians(
      a.child_id, 'substitute_assigned', 'Therapist change',
      case when v_today then format('Today''s session will be taken by %s.', v_sub)
           else format('The %s session on %s will be taken by %s.', v_type, v_when, v_sub) end,
      '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id, 'therapistId', v_new)
    );
  else
    perform app.notify_guardians(
      a.child_id, 'appointment_changed', 'Therapist change',
      format('%s will take the %s session on %s as usual.', v_sub, v_type, v_when),
      '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id, 'therapistId', v_new)
    );
    perform app.notify(
      v_new, a.organization_id, 'appointment_changed', 'Session back with you',
      format('%s – %s on %s is back on your schedule.', v_child, v_type, v_when),
      '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id)
    );
  end if;
  if v_prev <> v_new then
    perform app.notify(
      v_prev, a.organization_id, 'appointment_changed', 'Session reassigned',
      format('%s – %s on %s has been reassigned to %s.', v_child, v_type, v_when, v_sub),
      '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id)
    );
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, meta)
  values (a.organization_id, auth.uid(), 'assign_substitute', 'appointments', a.id,
          jsonb_build_object('from', v_prev, 'to', v_new, 'original', v_original));
  return app.camel_keys(to_jsonb(a));
end
$$;

-- ---------------------------------------------------------------------------
-- Reschedule requests
-- ---------------------------------------------------------------------------
create or replace function app.parse_slots(p jsonb, p_max int) returns timestamptz[]
language plpgsql stable as $$
declare
  v timestamptz[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < 1 or jsonb_array_length(p) > p_max then
    perform app.raise('validation', format('propose 1 to %s time slots', p_max));
  end if;
  begin
    select array_agg((e #>> '{}')::timestamptz order by o) into v from jsonb_array_elements(p) with ordinality as x(e, o);
  exception when others then
    perform app.raise('validation', 'slots must be ISO timestamps');
  end;
  if exists (select 1 from unnest(v) s where s <= now()) then
    perform app.raise('validation', 'slots must be in the future');
  end if;
  return v;
end
$$;

create or replace function app.reschedule_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.camel_keys(to_jsonb(r)) || jsonb_build_object('requestedByName', app.profile_name(r.requested_by))
  from public.reschedule_requests r where r.id = p_id
$$;

create or replace function public.request_reschedule(appointment_id uuid, proposed_slots jsonb, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  a public.appointments;
  v_slots timestamptz[];
  v_id uuid;
begin
  if v_uid is null then
    perform app.raise('not_authenticated');
  end if;
  select * into a from public.appointments where id = request_reschedule.appointment_id;
  if a.id is null or not app.is_guardian_of(a.child_id) then
    perform app.raise('not_found', 'appointment');
  end if;
  if a.status <> 'scheduled' or a.starts_at <= now() then
    perform app.raise('validation', 'only upcoming appointments can be rescheduled');
  end if;
  v_slots := app.parse_slots(request_reschedule.proposed_slots, 2);
  if exists (select 1 from public.reschedule_requests r where r.appointment_id = a.id and r.status in ('pending', 'countered')) then
    perform app.raise('conflict', 'a reschedule request is already open for this appointment');
  end if;

  insert into public.reschedule_requests (organization_id, appointment_id, requested_by, proposed_slots, reason, created_by)
  values (a.organization_id, a.id, v_uid, to_jsonb(v_slots), coalesce(btrim(request_reschedule.reason), ''), v_uid)
  returning id into v_id;

  perform app.notify_coordinators(
    a.organization_id, 'reschedule_request', 'Reschedule request',
    format('%s – %s on %s. %s', app.child_display_name(a.child_id), app.therapy_type_name(a.therapy_type_id),
           app.local_when(a.starts_at), coalesce(btrim(request_reschedule.reason), '')),
    '/reschedule/' || v_id, jsonb_build_object('requestId', v_id, 'appointmentId', a.id), 'reschedule_request:' || v_id
  );
  return app.reschedule_json(v_id);
end
$$;

create or replace function app.move_appointment(p_appointment uuid, p_slot timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.suppress_appointment_notify', 'on', true);
  update public.appointments
  set starts_at = p_slot, ends_at = p_slot + (ends_at - starts_at), was_rescheduled = true
  where id = p_appointment;
  perform set_config('app.suppress_appointment_notify', 'off', true);
end
$$;

create or replace function public.resolve_reschedule(request_id uuid, action jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_action jsonb := coalesce(resolve_reschedule.action, '{}'::jsonb);
  v_type text := resolve_reschedule.action ->> 'type';
  r public.reschedule_requests;
  a public.appointments;
  v_slot timestamptz;
  v_slots timestamptz[];
  v_note text := nullif(btrim(coalesce(resolve_reschedule.action ->> 'note', '')), '');
  v_resolution jsonb;
  v_status public.reschedule_status;
  v_child text;
  v_type_name text;
begin
  if v_uid is null then
    perform app.raise('not_authenticated');
  end if;
  select * into r from public.reschedule_requests where id = resolve_reschedule.request_id for update;
  if r.id is null or not app.is_member(r.organization_id) then
    perform app.raise('not_found', 'reschedule request');
  end if;
  select * into a from public.appointments where id = r.appointment_id for update;
  v_child := app.child_display_name(a.child_id);
  v_type_name := app.therapy_type_name(a.therapy_type_id);

  if v_type in ('approve', 'decline', 'counter') then
    if not app.is_org_admin(r.organization_id) then
      perform app.raise('forbidden');
    end if;
    if r.status not in ('pending', 'countered') then
      perform app.raise('conflict', 'this request has already been resolved');
    end if;
  elsif v_type = 'accept_counter' then
    if not app.is_guardian_of(a.child_id) then
      perform app.raise('forbidden');
    end if;
    if r.status <> 'countered' then
      perform app.raise('conflict', 'there is no counter-proposal to accept');
    end if;
  else
    perform app.raise('validation', 'action.type must be approve, decline, counter or accept_counter');
  end if;

  if v_type = 'approve' or v_type = 'accept_counter' then
    begin
      v_slot := (v_action ->> 'slot')::timestamptz;
    exception when others then
      perform app.raise('validation', 'slot must be an ISO timestamp');
    end;
    if v_slot is null or v_slot <= now() then
      perform app.raise('validation', 'slot must be in the future');
    end if;
    if v_type = 'accept_counter' and not exists (
      select 1 from jsonb_array_elements_text(coalesce(r.resolution -> 'counterSlots', '[]'::jsonb)) s where s::timestamptz = v_slot
    ) then
      perform app.raise('validation', 'slot is not one of the proposed times');
    end if;
    perform app.move_appointment(a.id, v_slot);
    v_status := 'approved';
    v_resolution := coalesce(r.resolution, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('chosenSlot', v_slot, 'note', v_note));
    perform app.notify(
      a.therapist_id, a.organization_id, 'appointment_changed', 'Session moved',
      format('%s – %s moved to %s.', v_child, v_type_name, app.local_when(v_slot)),
      '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id)
    );
    if v_type = 'approve' then
      perform app.notify_guardians(
        a.child_id, 'reschedule_response', 'Reschedule approved',
        format('%s''s %s session is now on %s.', v_child, v_type_name, app.local_when(v_slot)),
        '/appointment/' || a.id, jsonb_build_object('requestId', r.id, 'appointmentId', a.id, 'status', 'approved')
      );
    else
      perform app.notify_coordinators(
        a.organization_id, 'reschedule_response', 'Parent accepted a new time',
        format('%s – %s moved to %s.', v_child, v_type_name, app.local_when(v_slot)),
        '/reschedule/' || r.id, jsonb_build_object('requestId', r.id, 'appointmentId', a.id, 'status', 'approved')
      );
    end if;
  elsif v_type = 'decline' then
    v_status := 'declined';
    v_resolution := jsonb_strip_nulls(jsonb_build_object('note', v_note));
    perform app.notify_guardians(
      a.child_id, 'reschedule_response', 'Reschedule not possible',
      coalesce(v_note, format('The %s session on %s stays as planned.', v_type_name, app.local_when(a.starts_at))),
      '/appointment/' || a.id, jsonb_build_object('requestId', r.id, 'appointmentId', a.id, 'status', 'declined')
    );
  else -- counter
    v_slots := app.parse_slots(v_action -> 'slots', 2);
    v_status := 'countered';
    v_resolution := jsonb_strip_nulls(jsonb_build_object('counterSlots', to_jsonb(v_slots), 'note', v_note));
    perform app.notify_guardians(
      a.child_id, 'reschedule_response', 'The school suggested other times',
      format('Please choose a new time for %s''s %s session.', v_child, v_type_name),
      '/reschedule/' || r.id, jsonb_build_object('requestId', r.id, 'appointmentId', a.id, 'status', 'countered')
    );
  end if;

  update public.reschedule_requests
  set status = v_status, resolution = v_resolution, resolved_by = v_uid, resolved_at = now()
  where id = r.id;
  return app.reschedule_json(r.id);
end
$$;

-- ---------------------------------------------------------------------------
-- Parent-safe reads (the ONLY way parents see session data)
-- ---------------------------------------------------------------------------
create or replace function app.org_dimensions(p_org uuid)
returns setof public.rating_dimensions language sql stable security definer set search_path = '' as $$
  select d.* from public.rating_dimensions d
  where d.organization_id = p_org
     or (d.organization_id is null and not exists (select 1 from public.rating_dimensions x where x.organization_id = p_org))
$$;

-- ParentSessionSnapshot. Never includes SOAP notes, worked/not-worked text, incidents or
-- (unless the school enables parentsSeeNumericScore) the 0..100 score.
create or replace function app.parent_snapshot_json(p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'sessionId', s.id,
    'childId', s.child_id,
    'date', s.date,
    'therapyTypeId', s.therapy_type_id,
    'therapyTypeName', tt.name,
    'therapyTypeColor', tt.color,
    'therapistName', coalesce(p.full_name, ''),
    'isSubstitute', s.is_substitute,
    'highlights', coalesce((
      select jsonb_agg(h.obj order by h.rk) from (
        select jsonb_build_object(
                 'key', d.key,
                 'label', coalesce(nullif(d.parent_label, ''), d.label),
                 'icon', d.icon,
                 'value', (s.dimension_metrics -> d.key ->> 'value')::int,
                 'change', case
                   when (s.dimension_metrics -> d.key ->> 'deltaLast')::numeric >= 1 then 'better'
                   when (s.dimension_metrics -> d.key ->> 'deltaLast')::numeric <= -1 then 'harder'
                   else 'same' end
               ) as obj,
               row_number() over (
                 order by array_position(array['attention', 'mood', 'engagement', 'communication'], d.key) nulls last, d.sort_order
               ) as rk
        from app.org_dimensions(s.organization_id) d
        where d.enabled and s.dimension_metrics ? d.key
      ) h where h.rk <= 4
    ), '[]'::jsonb),
    'overall', case when s.delta_last >= 5 then 'better' when s.delta_last <= -5 then 'harder' else 'same' end,
    'sessionScore', case when coalesce((app.org_settings(s.organization_id) ->> 'parentsSeeNumericScore')::boolean, false)
                         then s.session_score end,
    'parentSummary', coalesce(n.parent_summary, ''),
    'goalsWorkedOn', coalesce((
      select jsonb_agg(jsonb_build_object('goalId', g.id, 'parentText', g.parent_text) order by g.created_at, g.id)
      from public.goal_trials t join public.goals g on g.id = t.goal_id
      where t.session_id = s.id
    ), '[]'::jsonb)
  ))
  from public.sessions s
  join public.therapy_types tt on tt.id = s.therapy_type_id
  left join public.profiles p on p.id = s.therapist_id
  left join public.session_notes n on n.session_id = s.id
  where s.id = p_session
$$;

create or replace function public.parent_session_snapshot(session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_child uuid := app.session_child(parent_session_snapshot.session_id);
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  if v_child is null or not (app.is_guardian_of(v_child) or app.can_view_child_full(v_child)) then
    perform app.raise('not_found', 'session');
  end if;
  return app.parent_snapshot_json(parent_session_snapshot.session_id);
end
$$;

create or replace function public.parent_session_snapshots(child_id uuid, limit_count int default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_child uuid := parent_session_snapshots.child_id;
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  if not (app.is_guardian_of(v_child) or app.can_view_child_full(v_child)) then
    perform app.raise('not_found', 'child');
  end if;
  return coalesce((
    select jsonb_agg(app.parent_snapshot_json(x.id) order by x.date desc, x.starts_at desc)
    from (
      select s.id, s.date, a.starts_at
      from public.sessions s join public.appointments a on a.id = s.appointment_id
      where s.child_id = v_child
      order by s.date desc, a.starts_at desc
      limit greatest(1, least(coalesce(parent_session_snapshots.limit_count, 20), 200))
    ) x
  ), '[]'::jsonb);
end
$$;

create or replace function app.parent_goal_status(p public.goal_status) returns text
language sql immutable as $$
  select case p
    when 'not_started' then 'working_on_it' when 'emerging' then 'working_on_it'
    when 'progressing' then 'getting_there'
    when 'mastered' then 'achieved' when 'maintenance' then 'achieved'
    else 'paused' end
$$;

-- Goals in parent-friendly wording (no staff_text / baseline / mastery rule).
create or replace function public.parent_goals(child_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_child uuid := parent_goals.child_id;
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  if not (app.is_guardian_of(v_child) or app.can_view_child_brief(v_child)) then
    perform app.raise('not_found', 'child');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', g.id, 'childId', g.child_id, 'therapyTypeId', g.therapy_type_id, 'therapyTypeName', tt.name,
      'therapyTypeColor', tt.color, 'domain', g.domain, 'parentText', g.parent_text, 'status', g.status,
      'parentStatus', app.parent_goal_status(g.status), 'startDate', g.start_date, 'masteredAt', g.mastered_at
    )) order by g.start_date, g.created_at)
    from public.goals g join public.therapy_types tt on tt.id = g.therapy_type_id
    where g.child_id = v_child
  ), '[]'::jsonb);
end
$$;

-- Per therapy type: dimension trends (words + arrows) and recent 1..5 values; goal counts by domain.
create or replace function public.parent_progress(child_id uuid, since date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_child uuid := parent_progress.child_id;
  v_since date := coalesce(parent_progress.since, app.today() - 90);
  v_org uuid := app.child_org(parent_progress.child_id);
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  if v_org is null or not (app.is_guardian_of(v_child) or app.can_view_child_full(v_child)) then
    perform app.raise('not_found', 'child');
  end if;
  return jsonb_build_object(
    'childId', v_child,
    'since', v_since,
    'byTherapy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'therapyTypeId', tt.id, 'therapyTypeName', tt.name, 'therapyTypeColor', tt.color,
        'sessionsCount', (select count(*) from public.sessions s where s.child_id = v_child and s.therapy_type_id = tt.id and s.date >= v_since),
        'dimensions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'key', d.key, 'label', coalesce(nullif(d.parent_label, ''), d.label), 'icon', d.icon,
            'trend', coalesce((
              select s.dimension_metrics -> d.key ->> 'trend' from public.sessions s
              join public.appointments a on a.id = s.appointment_id
              where s.child_id = v_child and s.therapy_type_id = tt.id and s.dimension_metrics ? d.key
              order by a.starts_at desc limit 1
            ), 'flat'),
            'recent', coalesce((
              select jsonb_agg(x.v order by x.starts_at) from (
                select (s.dimension_metrics -> d.key ->> 'value')::int as v, a.starts_at
                from public.sessions s join public.appointments a on a.id = s.appointment_id
                where s.child_id = v_child and s.therapy_type_id = tt.id and s.dimension_metrics ? d.key
                order by a.starts_at desc limit 4
              ) x
            ), '[]'::jsonb)
          ) order by d.sort_order)
          from app.org_dimensions(v_org) d where d.enabled
        ), '[]'::jsonb)
      ) order by tt.name)
      from public.therapy_types tt
      where tt.id in (select s.therapy_type_id from public.sessions s where s.child_id = v_child and s.date >= v_since)
    ), '[]'::jsonb),
    'goalsSummary', coalesce((
      select jsonb_agg(jsonb_build_object('domain', x.domain, 'achieved', x.achieved, 'inProgress', x.in_progress) order by x.domain)
      from (
        select g.domain,
               count(*) filter (where g.status in ('mastered', 'maintenance')) as achieved,
               count(*) filter (where g.status in ('not_started', 'emerging', 'progressing')) as in_progress
        from public.goals g where g.child_id = v_child group by g.domain
      ) x
    ), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- child_access(): ChildDetail.access for the caller
-- ---------------------------------------------------------------------------
create or replace function public.child_access(child_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when app.can_view_child_full(child_access.child_id) then 'full'
    when app.has_substitute_access(child_access.child_id) then 'brief_only'
    when app.is_guardian_of(child_access.child_id) then 'parent'
    else 'none'
  end
$$;

-- ---------------------------------------------------------------------------
-- Handover Brief
-- ---------------------------------------------------------------------------
create or replace function app.session_summary_json(p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', s.id, 'appointmentId', s.appointment_id, 'childId', s.child_id, 'date', s.date,
    'therapyTypeId', s.therapy_type_id, 'therapyTypeName', tt.name, 'therapyTypeColor', tt.color,
    'therapistName', app.profile_name(s.therapist_id), 'isSubstitute', s.is_substitute,
    'sessionScore', s.session_score, 'goalAccuracy', s.goal_accuracy, 'deltaLast', s.delta_last,
    'deltaRolling', s.delta_rolling, 'trend', s.trend, 'ratings', app.session_ratings_json(s.id),
    'incidentCount', s.incident_count, 'comparedToLast', s.compared_to_last,
    'parentSummary', coalesce(n.parent_summary, '')
  ))
  from public.sessions s
  join public.therapy_types tt on tt.id = s.therapy_type_id
  left join public.session_notes n on n.session_id = s.id
  where s.id = p_session
$$;

create or replace function app.goal_with_stats_json(p_goal uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.camel_keys(to_jsonb(g)) || jsonb_strip_nulls(jsonb_build_object(
    'lastAccuracy', (
      select round(least(t.successful, t.attempted)::numeric / t.attempted * 100, 1)
      from public.goal_trials t join public.sessions s on s.id = t.session_id join public.appointments a on a.id = s.appointment_id
      where t.goal_id = g.id and t.attempted > 0 order by a.starts_at desc limit 1
    ),
    'lastPromptLevel', (
      select t.prompt_level
      from public.goal_trials t join public.sessions s on s.id = t.session_id join public.appointments a on a.id = s.appointment_id
      where t.goal_id = g.id and t.attempted > 0 order by a.starts_at desc limit 1
    ),
    'sessionsTracked', (select count(*) from public.goal_trials t where t.goal_id = g.id and t.attempted > 0),
    'masterySuggested', app.goal_mastery_suggested(g.id)
  ))
  from public.goals g where g.id = p_goal
$$;

create or replace function public.handover_brief(appointment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  a public.appointments;
  v_clinical boolean;
  v_prev uuid;
  v_recent uuid[];
  v_profile jsonb;
begin
  if v_uid is null then
    perform app.raise('not_authenticated');
  end if;
  select * into a from public.appointments where id = handover_brief.appointment_id;
  if a.id is null then
    perform app.raise('not_found', 'appointment');
  end if;
  -- Assigned therapists / org admins always; anyone else only inside the substitute window.
  if not app.can_view_child_brief(a.child_id) then
    perform app.raise('forbidden', 'the brief is available from 24 hours before the session');
  end if;
  v_clinical := app.can_view_child_clinical(a.child_id);

  -- Last 3 sessions of this therapy type before this appointment, newest first.
  select array_agg(x.id order by x.starts_at desc) into v_recent from (
    select s.id, sa.starts_at from public.sessions s join public.appointments sa on sa.id = s.appointment_id
    where s.child_id = a.child_id and s.therapy_type_id = a.therapy_type_id and sa.starts_at < a.starts_at
    order by sa.starts_at desc limit 3
  ) x;
  v_prev := v_recent[1];

  select app.camel_keys(to_jsonb(cp) - 'id' - 'organization_id' - 'created_at' - 'created_by')
    into v_profile from public.child_profiles cp where cp.child_id = a.child_id;
  v_profile := coalesce(v_profile, jsonb_build_object('childId', a.child_id));
  if v_clinical then
    v_profile := v_profile || coalesce((
      select jsonb_build_object('clinical', jsonb_build_object(
        'diagnosis', to_jsonb(cc.diagnosis), 'medicalNotes', cc.medical_notes,
        'allergies', cc.allergies, 'medications', cc.medications))
      from public.child_clinical cc where cc.child_id = a.child_id
    ), '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'appointment', app.camel_keys(to_jsonb(a)) || jsonb_strip_nulls(jsonb_build_object(
      'childName', (select c.full_name from public.children c where c.id = a.child_id),
      'childPhotoUrl', (select c.photo_url from public.children c where c.id = a.child_id),
      'therapistName', app.profile_name(a.therapist_id),
      'originalTherapistName', case when a.original_therapist_id is not null then app.profile_name(a.original_therapist_id) end,
      'therapyTypeName', (select tt.name from public.therapy_types tt where tt.id = a.therapy_type_id),
      'therapyTypeColor', (select tt.color from public.therapy_types tt where tt.id = a.therapy_type_id),
      'therapyTypeIcon', (select tt.icon from public.therapy_types tt where tt.id = a.therapy_type_id),
      'isSubstitute', app.is_substitute_for(a.id)
    )),
    'child', (select app.camel_keys(to_jsonb(c)) from public.children c where c.id = a.child_id),
    'profile', v_profile,
    'planForToday', (
      select jsonb_build_object('text', n.plan_next, 'goalIds', to_jsonb(n.plan_goal_ids),
                                'byName', app.profile_name(s.therapist_id), 'date', s.date)
      from public.sessions s join public.session_notes n on n.session_id = s.id where s.id = v_prev
    ),
    'goals', coalesce((
      select jsonb_agg(app.goal_with_stats_json(g.id) order by g.start_date, g.created_at)
      from public.goals g
      where g.child_id = a.child_id and g.therapy_type_id = a.therapy_type_id
        and g.status in ('not_started', 'emerging', 'progressing', 'maintenance')
    ), '[]'::jsonb),
    'recentSessions', coalesce((
      select jsonb_agg(app.session_summary_json(x.id) order by x.ord) from unnest(v_recent) with ordinality as x(id, ord)
    ), '[]'::jsonb),
    'whatWorked', coalesce((
      select jsonb_agg(w.tag order by w.first_seen) from (
        select t.tag, min(x.ord * 1000 + t.pos) as first_seen
        from unnest(v_recent) with ordinality as x(id, ord)
        join public.sessions s on s.id = x.id
        cross join lateral unnest(s.worked_tags) with ordinality as t(tag, pos)
        group by t.tag
      ) w
    ), '[]'::jsonb),
    'whatDidnt', coalesce((
      select jsonb_agg(w.tag order by w.first_seen) from (
        select t.tag, min(x.ord * 1000 + t.pos) as first_seen
        from unnest(v_recent) with ordinality as x(id, ord)
        join public.sessions s on s.id = x.id
        cross join lateral unnest(s.not_worked_tags) with ordinality as t(tag, pos)
        group by t.tag
      ) w
    ), '[]'::jsonb),
    'todaysCheckin', (
      select app.camel_keys(to_jsonb(pc)) from public.parent_checkins pc
      where pc.child_id = a.child_id
        and (pc.appointment_id = a.id or pc.date = (a.starts_at at time zone app.tz())::date)
      order by (pc.appointment_id = a.id) desc, pc.created_at desc limit 1
    ),
    'openHomeTasks', coalesce((
      select jsonb_agg(app.camel_keys(to_jsonb(ht)) || jsonb_build_object('assignedByName', app.profile_name(ht.assigned_by))
                       order by ht.active_from desc)
      from public.home_tasks ht
      where ht.child_id = a.child_id and ht.status = 'active' and ht.active_to >= app.today()
    ), '[]'::jsonb),
    'latestParentFeedback', (
      select app.camel_keys(to_jsonb(hl)) || jsonb_build_object(
        'taskTitle', (select ht.title from public.home_tasks ht where ht.id = hl.task_id),
        'loggedByName', app.profile_name(hl.logged_by))
      from public.home_logs hl where hl.child_id = a.child_id order by hl.created_at desc limit 1
    ),
    'activeAlerts', coalesce((
      select jsonb_agg(app.camel_keys(to_jsonb(al)) order by al.created_at desc)
      from public.alerts al where al.child_id = a.child_id and al.status in ('open', 'acknowledged')
    ), '[]'::jsonb),
    'mustAcknowledge', a.therapist_id = v_uid and (
      app.is_substitute_for(a.id)
      or not exists (select 1 from public.sessions s where s.child_id = a.child_id and s.therapist_id = v_uid)
    ),
    'acknowledged', exists (
      select 1 from public.brief_acknowledgements b where b.appointment_id = a.id and b.user_id = v_uid
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Dashboards
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard(org_id uuid, on_date date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_org uuid := admin_dashboard.org_id;
  v_date date := coalesce(admin_dashboard.on_date, app.today());
  v_day_start timestamptz := v_date::timestamp at time zone app.tz();
  v_week_start date := date_trunc('week', v_date::timestamp)::date; -- Monday
  v_ws timestamptz := v_week_start::timestamp at time zone app.tz();
  v_we timestamptz := (v_week_start + 7)::timestamp at time zone app.tz();
  v_lock numeric := coalesce((app.org_settings(admin_dashboard.org_id) ->> 'logLockHours')::numeric, 24);
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  if not app.is_org_admin(v_org) then
    perform app.raise('forbidden');
  end if;
  return jsonb_build_object(
    'date', v_date,
    'today', (
      select jsonb_build_object(
        'scheduled', count(*) filter (where a.status <> 'cancelled'),
        'completed', count(*) filter (where a.status = 'completed'),
        'logged', count(*) filter (where s.id is not null),
        'unlogged', count(*) filter (where a.status <> 'cancelled' and s.id is null and a.ends_at < now()
                                     and (a.attendance is null or a.attendance in ('present', 'late'))),
        'cancelled', count(*) filter (where a.status = 'cancelled')
      )
      from public.appointments a left join public.sessions s on s.appointment_id = a.id
      where a.organization_id = v_org and a.starts_at >= v_day_start and a.starts_at < v_day_start + interval '1 day'
    ),
    'week', jsonb_build_object(
      'weekStart', v_week_start,
      'attendanceRate', (
        select coalesce(round(100.0 * count(*) filter (where a.attendance in ('present', 'late'))
                              / nullif(count(*), 0), 1), 0)
        from public.appointments a
        where a.organization_id = v_org and a.starts_at >= v_ws and a.starts_at < v_we
          and a.attendance is not null and a.attendance <> 'cancelled_by_school'
      ),
      'homePracticeRate', (
        select coalesce(least(100, round(100.0 * (
                 (select count(*) filter (where l.outcome = 'done') + 0.5 * count(*) filter (where l.outcome = 'partly')
                  from public.home_logs l where l.organization_id = v_org and l.created_at >= v_ws and l.created_at < v_we)
               ) / nullif(sum(t.frequency_per_week), 0), 1)), 0)
        from public.home_tasks t
        where t.organization_id = v_org and t.status = 'active'
          and t.active_from < v_week_start + 7 and t.active_to >= v_week_start
      ),
      'loggingCompliance', coalesce((
        select jsonb_agg(jsonb_build_object(
          'therapistId', x.therapist_id, 'name', app.profile_name(x.therapist_id),
          'logged', x.logged, 'due', x.due,
          'percent', case when x.due = 0 then 100 else round(100.0 * x.logged / x.due, 1) end
        ) order by app.profile_name(x.therapist_id))
        from (
          select a.therapist_id, count(*) as due, count(s.id) as logged
          from public.appointments a left join public.sessions s on s.appointment_id = a.id
          where a.organization_id = v_org and a.starts_at >= v_ws and a.starts_at < v_we and a.ends_at < now()
            and a.status <> 'cancelled' and (a.attendance is null or a.attendance in ('present', 'late'))
          group by a.therapist_id
        ) x
      ), '[]'::jsonb)
    ),
    'childrenNeedingAttention', coalesce((
      select jsonb_agg(x.obj order by x.at desc) from (
        select distinct on (al.child_id)
          jsonb_build_object('childId', al.child_id, 'childName', c.full_name, 'reason', al.message,
                             'alertId', al.id, 'kind', al.kind) as obj,
          al.created_at as at
        from public.alerts al join public.children c on c.id = al.child_id
        where al.organization_id = v_org and al.status in ('open', 'acknowledged')
        order by al.child_id, al.created_at desc
      ) x
    ), '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object('childId', c.id, 'childName', c.full_name, 'reason', 'declining_trend', 'trend', 'down'))
      from public.children c
      where c.organization_id = v_org and c.status = 'active'
        and not exists (select 1 from public.alerts al where al.child_id = c.id and al.status in ('open', 'acknowledged'))
        and (select s.trend from public.sessions s join public.appointments a on a.id = s.appointment_id
             where s.child_id = c.id order by a.starts_at desc limit 1) = 'down'
    ), '[]'::jsonb),
    'unloggedAppointmentIds', coalesce((
      select jsonb_agg(a.id order by a.starts_at)
      from public.appointments a
      where a.organization_id = v_org and a.status <> 'cancelled'
        and (a.attendance is null or a.attendance in ('present', 'late'))
        and a.ends_at < now() - v_lock * interval '1 hour' and a.ends_at > now() - interval '14 days'
        and not exists (select 1 from public.sessions s where s.appointment_id = a.id)
    ), '[]'::jsonb),
    'upcomingSubstitutionIds', coalesce((
      select jsonb_agg(a.id order by a.starts_at)
      from public.appointments a
      where a.organization_id = v_org and a.status = 'scheduled' and a.original_therapist_id is not null
        and a.starts_at >= now() and a.starts_at < now() + interval '7 days'
    ), '[]'::jsonb),
    'needsSubstituteIds', coalesce((
      select jsonb_agg(a.id order by a.starts_at)
      from public.appointments a
      where a.organization_id = v_org and a.status = 'scheduled' and a.original_therapist_id is null
        and a.starts_at >= now() and a.starts_at < now() + interval '14 days'
        and exists (
          select 1 from public.therapist_unavailability u
          where u.user_id = a.therapist_id and u.organization_id = v_org
            and (a.starts_at at time zone app.tz())::date between u."from" and u."to"
        )
    ), '[]'::jsonb),
    'pendingRescheduleIds', coalesce((
      select jsonb_agg(r.id order by r.created_at)
      from public.reschedule_requests r where r.organization_id = v_org and r.status = 'pending'
    ), '[]'::jsonb),
    'workload', coalesce((
      select jsonb_agg(jsonb_build_object('therapistId', m.user_id, 'name', app.profile_name(m.user_id),
                                          'sessionsThisWeek', (
        select count(*) from public.appointments a
        where a.organization_id = v_org and a.therapist_id = m.user_id and a.status <> 'cancelled'
          and a.starts_at >= v_ws and a.starts_at < v_we
      )) order by app.profile_name(m.user_id))
      from public.memberships m
      where m.organization_id = v_org and m.role = 'therapist' and m.status = 'active'
    ), '[]'::jsonb)
  );
end
$$;

-- Platform admin: counts only, never child-level data.
create or replace function public.platform_school_summaries() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_month_start date := date_trunc('month', app.today()::timestamp)::date;
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated');
  end if;
  if not app.is_platform_admin() then
    perform app.raise('forbidden');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'organization', app.camel_keys(to_jsonb(o)),
      'activeChildren', (select count(*) from public.children c where c.organization_id = o.id and c.status = 'active'),
      'staffCount', (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'
                     and m.role in ('school_admin', 'coordinator', 'therapist')),
      'sessionsThisMonth', (select count(*) from public.sessions s where s.organization_id = o.id and s.date >= v_month_start),
      'activeParentsPercent', (
        select coalesce(round(100.0 * count(*) filter (where
                 exists (select 1 from auth.users au where au.id = m.user_id and au.last_sign_in_at > now() - interval '30 days')
                 or exists (select 1 from public.home_logs l where l.logged_by = m.user_id and l.created_at > now() - interval '30 days')
                 or exists (select 1 from public.parent_checkins pc where pc.submitted_by = m.user_id and pc.created_at > now() - interval '30 days')
                 or exists (select 1 from public.messages ms where ms.sender_id = m.user_id and ms.created_at > now() - interval '30 days')
               ) / nullif(count(*), 0), 1), 0)
        from public.memberships m where m.organization_id = o.id and m.role = 'parent' and m.status = 'active'
      ),
      'lastActivityAt', (
        select max(x.at) from (
          select max(s.created_at) as at from public.sessions s where s.organization_id = o.id
          union all select max(l.created_at) from public.home_logs l where l.organization_id = o.id
          union all select max(ms.created_at) from public.messages ms where ms.organization_id = o.id
        ) x
      )
    ) order by o.name)
    from public.organizations o
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- Notification triggers
-- ---------------------------------------------------------------------------
create or replace function app.on_home_task_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify_guardians(
    new.child_id, 'home_task_assigned', 'New home activity',
    format('%s: %s (%s× a week)', app.child_display_name(new.child_id), new.title, new.frequency_per_week),
    '/home-practice/' || new.id, jsonb_build_object('taskId', new.id, 'childId', new.child_id),
    'home_task:' || new.id
  );
  return null;
end
$$;
create trigger z_notify after insert on public.home_tasks
  for each row execute function app.on_home_task_insert();

create or replace function app.on_home_log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.home_tasks := app.task_row(new.task_id);
  r record;
begin
  if tg_op = 'INSERT' then
    for r in
      select distinct u.user_id from (
        select ct.user_id from public.child_therapists ct
        where ct.child_id = new.child_id and (ct.active_to is null or ct.active_to >= app.today())
        union select v_task.assigned_by
      ) u where u.user_id is not null
    loop
      perform app.notify(
        r.user_id, new.organization_id, 'home_log_submitted', 'New home practice log',
        format('%s – %s: %s%s', app.child_display_name(new.child_id), v_task.title, replace(new.outcome::text, '_', ' '),
               case when new.media_id is not null then ' (video)' else '' end),
        '/reviews/' || new.id, jsonb_build_object('logId', new.id, 'taskId', new.task_id, 'childId', new.child_id),
        'home_log:' || new.id
      );
    end loop;
  elsif old.reviewed_at is null and new.reviewed_at is not null then
    perform app.notify(
      new.logged_by, new.organization_id, 'home_log_feedback', 'Feedback from the therapist',
      coalesce(nullif(new.review_comment, ''), format('Feedback on "%s"', v_task.title)),
      '/home-practice/' || new.task_id,
      jsonb_build_object('logId', new.id, 'taskId', new.task_id, 'reaction', new.review_reaction),
      'home_log_feedback:' || new.id
    );
  end if;
  return null;
end
$$;
create trigger z_notify after insert or update of reviewed_at on public.home_logs
  for each row execute function app.on_home_log_change();

create or replace function app.on_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.threads;
  r record;
  v_sender text := app.profile_name(new.sender_id);
begin
  select * into t from public.threads where id = new.thread_id;
  for r in
    select distinct u.user_id from (
      select tm.user_id from public.thread_members tm where tm.thread_id = t.id
      union
      select g.user_id from public.child_guardians g where t.kind = 'care_team' and g.child_id = t.child_id
      union
      select ct.user_id from public.child_therapists ct
      where t.kind in ('care_team', 'staff_only') and ct.child_id = t.child_id
        and (ct.active_to is null or ct.active_to >= app.today())
    ) u
    where u.user_id <> new.sender_id
  loop
    perform app.notify(
      r.user_id, new.organization_id, 'new_message', v_sender,
      left(coalesce(nullif(new.body, ''), 'Sent an attachment'), 140),
      '/messages/' || t.id, jsonb_build_object('threadId', t.id, 'messageId', new.id)
    );
  end loop;
  return null;
end
$$;
create trigger z_notify after insert on public.messages
  for each row execute function app.on_message_insert();

create or replace function app.on_announcement_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select distinct m.user_id from public.memberships m
    where m.organization_id = new.organization_id and m.status = 'active'
      and case new.audience
        when 'everyone' then true
        when 'all_parents' then m.role = 'parent'
        when 'all_staff' then m.role in ('school_admin', 'coordinator', 'therapist')
        else m.role in ('school_admin', 'coordinator', 'therapist') or (m.role = 'parent' and exists (
          select 1 from public.child_guardians g join public.child_therapists ct on ct.child_id = g.child_id
          where g.user_id = m.user_id and g.organization_id = new.organization_id and ct.therapy_type_id = new.therapy_type_id
            and (ct.active_to is null or ct.active_to >= app.today())
        ))
      end
  loop
    perform app.notify(
      r.user_id, new.organization_id, 'announcement', new.title, left(new.body, 200),
      '/announcements/' || new.id, jsonb_build_object('announcementId', new.id, 'urgent', new.urgent),
      'announcement:' || new.id
    );
  end loop;
  return null;
end
$$;
create trigger z_notify after insert on public.announcements
  for each row execute function app.on_announcement_insert();

-- Time change or cancellation made directly on the table (RPCs send their own messages).
create or replace function app.on_appointment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_body text;
  v_child text := app.child_display_name(new.child_id);
  v_type text := app.therapy_type_name(new.therapy_type_id);
begin
  if coalesce(current_setting('app.suppress_appointment_notify', true), 'off') = 'on' then
    return null;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    v_body := format('%s''s %s session on %s has been cancelled.', v_child, v_type, app.local_when(old.starts_at));
  elsif new.starts_at <> old.starts_at or new.ends_at <> old.ends_at then
    v_body := format('%s''s %s session moved from %s to %s.', v_child, v_type, app.local_when(old.starts_at), app.local_when(new.starts_at));
  else
    return null;
  end if;
  perform app.notify_guardians(new.child_id, 'appointment_changed', 'Schedule change', v_body,
    '/appointment/' || new.id, jsonb_build_object('appointmentId', new.id));
  perform app.notify(new.therapist_id, new.organization_id, 'appointment_changed', 'Schedule change', v_body,
    '/appointment/' || new.id, jsonb_build_object('appointmentId', new.id));
  return null;
end
$$;
create trigger z_notify after update of starts_at, ends_at, status on public.appointments
  for each row execute function app.on_appointment_change();

-- ---------------------------------------------------------------------------
-- Cron routine (called by the `reminders` Edge Function with the service role)
--   * appointment reminders per OrgSettings.reminderHoursBefore (each appointment gets the
--     reminder of the smallest window it falls into; dedupe keys make re-runs harmless)
--   * therapist daily agenda at OrgSettings.dailyAgendaTime (IST), sent once per day
--   * unlogged sessions: attended/unmarked, ended > logLockHours ago, no session → therapist push
--     + `unlogged_session` alert and coordinator notification
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_reminders(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  a record;
  t record;
  v_hours int[];
  v_bucket int;
  v_local timestamp := p_now at time zone app.tz();
  v_agenda time;
  v_lock numeric;
  v_alert uuid;
  v_reminders int := 0;
  v_agendas int := 0;
  v_unlogged int := 0;
  v_alerts int := 0;
begin
  for o in select org.id, app.org_settings(org.id) as s from public.organizations org where org.status = 'active' loop
    -- 1. Appointment reminders
    v_hours := array(
      select h::int from jsonb_array_elements_text(coalesce(o.s -> 'reminderHoursBefore', '[]'::jsonb)) h
      where h ~ '^\d+$' and h::int > 0 order by 1
    );
    if cardinality(v_hours) > 0 then
      for a in
        select ap.* from public.appointments ap
        where ap.organization_id = o.id and ap.status = 'scheduled'
          and ap.starts_at > p_now and ap.starts_at <= p_now + make_interval(hours => v_hours[cardinality(v_hours)])
      loop
        select min(h) into v_bucket from unnest(v_hours) h where a.starts_at <= p_now + make_interval(hours => h);
        v_reminders := v_reminders + app.notify_guardians(
          a.child_id, 'appointment_reminder', 'Upcoming session',
          format('%s''s %s session %s at %s with %s.',
                 app.child_display_name(a.child_id), app.therapy_type_name(a.therapy_type_id),
                 case (a.starts_at at time zone app.tz())::date - v_local::date
                   when 0 then 'today' when 1 then 'tomorrow'
                   else 'on ' || to_char(a.starts_at at time zone app.tz(), 'FMDD Mon') end,
                 to_char(a.starts_at at time zone app.tz(), 'FMHH12:MI AM'), app.profile_name(a.therapist_id)),
          '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id, 'hoursBefore', v_bucket),
          'reminder:' || a.id || ':' || v_bucket
        );
      end loop;
    end if;

    -- 2. Therapist daily agenda (window of 4 hours after the configured time)
    v_agenda := coalesce(nullif(o.s ->> 'dailyAgendaTime', ''), '08:00')::time;
    if v_local::time >= v_agenda and v_local::time < v_agenda + interval '4 hours' then
      for t in
        select ap.therapist_id, count(*) as n, min(ap.starts_at) as first_at
        from public.appointments ap
        where ap.organization_id = o.id and ap.status = 'scheduled'
          and (ap.starts_at at time zone app.tz())::date = v_local::date
        group by ap.therapist_id
      loop
        v_agendas := v_agendas + app.notify(
          t.therapist_id, o.id, 'daily_agenda', 'Today''s sessions',
          format('You have %s session%s today. First at %s.', t.n, case when t.n = 1 then '' else 's' end,
                 to_char(t.first_at at time zone app.tz(), 'FMHH12:MI AM')),
          '/today', jsonb_build_object('date', v_local::date, 'count', t.n), 'agenda:' || v_local::date
        );
      end loop;
    end if;

    -- 3. Unlogged sessions
    v_lock := coalesce((o.s ->> 'logLockHours')::numeric, 24);
    for a in
      select ap.* from public.appointments ap
      where ap.organization_id = o.id and ap.status <> 'cancelled'
        and (ap.attendance is null or ap.attendance in ('present', 'late'))
        and ap.ends_at <= p_now - v_lock * interval '1 hour'
        and ap.ends_at > p_now - interval '7 days'
        and not exists (select 1 from public.sessions s where s.appointment_id = ap.id)
    loop
      v_unlogged := v_unlogged + app.notify(
        a.therapist_id, o.id, 'unlogged_session', 'Session not logged',
        format('%s – %s on %s has not been logged yet.', app.child_display_name(a.child_id),
               app.therapy_type_name(a.therapy_type_id), app.local_when(a.starts_at)),
        '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id), 'unlogged:' || a.id
      );
      if not exists (
        select 1 from public.alerts al where al.kind = 'unlogged_session' and al.payload ->> 'appointmentId' = a.id::text
      ) then
        insert into public.alerts (organization_id, child_id, kind, payload, message)
        values (o.id, a.child_id, 'unlogged_session',
                jsonb_build_object('appointmentId', a.id, 'therapistId', a.therapist_id, 'therapyTypeId', a.therapy_type_id),
                format('%s – %s on %s was not logged by %s.', app.child_display_name(a.child_id),
                       app.therapy_type_name(a.therapy_type_id), app.local_when(a.starts_at), app.profile_name(a.therapist_id)))
        returning id into v_alert;
        v_alerts := v_alerts + 1;
        perform app.notify_coordinators(
          o.id, 'unlogged_session', 'Unlogged session',
          format('%s – %s on %s has not been logged by %s.', app.child_display_name(a.child_id),
                 app.therapy_type_name(a.therapy_type_id), app.local_when(a.starts_at), app.profile_name(a.therapist_id)),
          '/appointment/' || a.id, jsonb_build_object('appointmentId', a.id, 'alertId', v_alert),
          'unlogged-coordinator:' || a.id
        );
      end if;
    end loop;
  end loop;

  return jsonb_build_object('reminders', v_reminders, 'agendas', v_agendas, 'unlogged', v_unlogged, 'alerts', v_alerts);
end
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing for anon; cron routine for service_role only.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- Service-role-only routines (cron / Edge Functions).
revoke execute on function public.enqueue_reminders(timestamptz) from authenticated;
revoke execute on function public.orphaned_media_objects(int) from authenticated;
grant execute on all functions in schema app to authenticated, service_role;
