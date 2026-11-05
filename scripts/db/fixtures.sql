-- =============================================================================
-- Test fixtures for scripts/db/run-tests.ts (NOT demo data; see supabase/seed.sql for that).
--
-- Two schools ('a' and 'b') with the same shape, so every tenant table has rows in both and
-- the isolation test is never vacuous. Ids are readable: test.id('a', n) =
-- 'a0000000-0000-4000-8000-<n padded to 12>'. Keep in sync with ID in run-tests.ts.
--
--   n  0  organization          21 speech therapy type     31 child1   32 child2   33 child3 (A only)
--   n  1  school_admin           2 coordinator             3 t1 (assigned child1, lead)
--   n  4  t2 (substitute, appt 42 in 2h)   5 t3 (assigned child2)   8 t4 (appt 43 in 3 days)
--   n  6  p1 guardian child1     7 p2 guardian child2      9/10 invite targets (A only)
--   appointments: 41 child1/t1 -2d (logged = session 51)   42 child1/t2 +2h substitute
--                 43 child1/t4 +3d   44 child2/t3 -1d (session 52)   45 child1/t1 -1d (unlogged)
--                 46 child1/t3 +1h CANCELLED   47 child2/t3 ended 30h ago (unlogged)
--                 48 child1/t1 +5d (parent cancel test)   100..107 child3/t1 (integration)
-- =============================================================================

create schema if not exists test;

create or replace function test.id(p text, n int) returns uuid
language sql immutable as $$
  select (p || '0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

create or replace function test.phone(p text, n int) returns text
language sql immutable as $$
  select '+91' || case p when 'a' then '91' else '92' end || lpad(n::text, 8, '0')
$$;

create or replace function test.seed_school(p text) returns void
language plpgsql as $$
declare
  v_org uuid := test.id(p, 0);
  v_speech uuid := test.id(p, 21);
  v_child1 uuid := test.id(p, 31);
  v_child2 uuid := test.id(p, 32);
  u int;
  v_name text;
begin
  insert into public.organizations (id, name, short_name, city, address, phone)
  values (v_org, 'School ' || upper(p), upper(p), case p when 'a' then 'Noida' else 'Bengaluru' end, 'Main Road', '+911200000000');
  insert into public.therapy_types (id, organization_id, key, name, color, icon)
  values (v_speech, v_org, 'speech', 'Speech Therapy', '#C66B4E', 'message-circle');
  perform app.seed_org_defaults(v_org);
  insert into public.branches (id, organization_id, name) values (test.id(p, 90), v_org, 'Main centre');

  -- people
  foreach u in array array[1, 2, 3, 4, 5, 6, 7, 8] loop
    v_name := case u
      when 1 then 'Admin' when 2 then 'Coordinator' when 3 then 'Therapist One' when 4 then 'Therapist Two'
      when 5 then 'Therapist Three' when 6 then 'Parent One' when 7 then 'Parent Two' else 'Therapist Four' end
      || ' ' || upper(p);
    insert into auth.users (id, phone, phone_confirmed_at, raw_user_meta_data)
    values (test.id(p, u), substr(test.phone(p, u), 2), now(), jsonb_build_object('full_name', v_name));
    insert into public.memberships (user_id, organization_id, role)
    values (test.id(p, u), v_org, (case u when 1 then 'school_admin' when 2 then 'coordinator'
                                            when 6 then 'parent' when 7 then 'parent' else 'therapist' end)::public.user_role);
  end loop;
  insert into public.member_therapy_types (organization_id, user_id, therapy_type_id)
  select v_org, test.id(p, x), v_speech from unnest(array[3, 4, 5, 8]) x;

  insert into public.invites (organization_id, role, full_name, phone, child_ids, relation, created_by)
  values (v_org, 'therapist', 'New Therapist ' || upper(p), test.phone(p, 77), '{}', null, test.id(p, 1));

  -- children
  insert into public.children (id, organization_id, branch_id, full_name, preferred_name, dob, gender, class_group)
  values
    (v_child1, v_org, test.id(p, 90), 'Child One ' || upper(p), 'One', '2018-04-12', 'male', 'Sunflower'),
    (v_child2, v_org, test.id(p, 90), 'Child Two ' || upper(p), 'Two', '2017-09-03', 'female', 'Lotus');
  insert into public.child_profiles (child_id, communication_mode, comm_tools, reinforcers, triggers, calming, dos, donts)
  values
    (v_child1, 'limited_verbal', '{pecs}', '{bubbles,music}', '{loud_sounds}', '{deep_pressure}',
     '{"Give a 2-minute warning before transitions"}', '{"Do not touch without telling him first"}'),
    (v_child2, 'verbal', '{speech}', '{praise}', '{waiting}', '{counting}', '{}', '{}');
  update public.child_profiles set reinforcers = '{bubbles,music,swing}' where child_id = v_child1; -- -> profile_edits
  insert into public.child_clinical (child_id, diagnosis, medical_notes, allergies, medications)
  values
    (v_child1, '{autism}', 'CLINICAL-SECRET-' || p, 'peanuts', 'none'),
    (v_child2, '{adhd}', 'CLINICAL-SECRET-' || p, 'none', 'none');
  insert into public.child_guardians (child_id, user_id, relation, is_primary)
  values (v_child1, test.id(p, 6), 'Mother', true), (v_child2, test.id(p, 7), 'Father', true);
  insert into public.child_therapists (child_id, user_id, therapy_type_id, is_lead, active_from)
  values (v_child1, test.id(p, 3), v_speech, true, current_date - 60),
         (v_child2, test.id(p, 5), v_speech, true, current_date - 60);

  -- goals
  insert into public.goal_bank (organization_id, domain, therapy_type_key, staff_text, parent_text)
  values (v_org, 'communication', 'speech', 'Requests using 2-word phrases', 'Asks for things with two words');
  insert into public.goals (id, child_id, therapy_type_id, domain, staff_text, parent_text, baseline, status, start_date)
  values
    (test.id(p, 61), v_child1, v_speech, 'communication', 'STAFF-GOAL-TEXT requests with PECS', 'Asks for things using pictures', 'BASELINE-SECRET', 'progressing', current_date - 50),
    (test.id(p, 62), v_child2, v_speech, 'communication', 'STAFF-GOAL-TEXT turn taking', 'Takes turns in a game', 'BASELINE-SECRET', 'emerging', current_date - 50);

  -- calendar
  insert into public.appointment_series (id, organization_id, child_id, therapist_id, therapy_type_id, rrule, start_time, duration_minutes, start_date, end_date)
  values (test.id(p, 85), v_org, v_child1, test.id(p, 3), v_speech, 'FREQ=WEEKLY;BYDAY=MO,WE,FR', '10:30', 45, current_date - 60, current_date + 60);
  insert into public.appointments (id, child_id, therapist_id, original_therapist_id, therapy_type_id, starts_at, ends_at, status, series_id)
  values
    (test.id(p, 41), v_child1, test.id(p, 3), null, v_speech, now() - interval '2 days', now() - interval '2 days' + interval '45 minutes', 'scheduled', test.id(p, 85)),
    (test.id(p, 42), v_child1, test.id(p, 4), test.id(p, 3), v_speech, now() + interval '2 hours', now() + interval '2 hours 45 minutes', 'scheduled', test.id(p, 85)),
    (test.id(p, 43), v_child1, test.id(p, 8), null, v_speech, now() + interval '3 days', now() + interval '3 days 45 minutes', 'scheduled', null),
    (test.id(p, 44), v_child2, test.id(p, 5), null, v_speech, now() - interval '1 day', now() - interval '1 day' + interval '45 minutes', 'scheduled', null),
    (test.id(p, 45), v_child1, test.id(p, 3), null, v_speech, now() - interval '1 day', now() - interval '1 day' + interval '45 minutes', 'scheduled', test.id(p, 85)),
    (test.id(p, 46), v_child1, test.id(p, 5), null, v_speech, now() + interval '1 hour', now() + interval '1 hour 45 minutes', 'cancelled', null),
    (test.id(p, 47), v_child2, test.id(p, 5), null, v_speech, now() - interval '31 hours', now() - interval '30 hours', 'scheduled', null),
    (test.id(p, 48), v_child1, test.id(p, 3), null, v_speech, now() + interval '5 days', now() + interval '5 days 45 minutes', 'scheduled', test.id(p, 85));
  insert into public.reschedule_requests (id, appointment_id, requested_by, proposed_slots, reason)
  values (test.id(p, 86), test.id(p, 43), test.id(p, 6), jsonb_build_array(now() + interval '4 days'), 'Family function');
  insert into public.therapist_unavailability (user_id, organization_id, "from", "to", reason)
  values (test.id(p, 8), v_org, current_date + 3, current_date + 3, 'Leave');

  -- sessions (written directly; derived fields come from the guard trigger)
  insert into public.sessions (id, client_id, appointment_id, actual_minutes, regulation_state, compared_to_last, worked_tags, worked_text, not_worked_tags, not_worked_text)
  values
    (test.id(p, 51), gen_random_uuid(), test.id(p, 41), 45, 'regulated', 'better', '{visual_schedule,first_then}', 'WORKED-SECRET', '{noisy_room}', 'NOT-WORKED-SECRET'),
    (test.id(p, 52), gen_random_uuid(), test.id(p, 44), 40, 'over', 'same', '{timer}', '', '{}', '');
  insert into public.session_ratings (session_id, dimension_key, value)
  select test.id(p, 51), d.key, 4 from public.rating_dimensions d where d.organization_id = v_org
  union all
  select test.id(p, 52), d.key, 3 from public.rating_dimensions d where d.organization_id = v_org;
  insert into public.goal_trials (session_id, goal_id, attempted, successful, prompt_level)
  values (test.id(p, 51), test.id(p, 61), 10, 7, 3), (test.id(p, 52), test.id(p, 62), 8, 4, 2);
  insert into public.behaviour_incidents (session_id, type, duration_seconds, antecedent_tags)
  values (test.id(p, 51), 'refusal', 60, '{demand}'), (test.id(p, 52), 'meltdown', 120, '{transition}');
  insert into public.session_notes (session_id, subjective, objective, assessment, plan_next, plan_goal_ids, parent_summary)
  values
    (test.id(p, 51), 'SOAP-SUBJECTIVE-SECRET', 'SOAP-OBJECTIVE-SECRET', 'SOAP-ASSESSMENT-SECRET', 'SOAP-PLAN-SECRET use first-then board', array[test.id(p, 61)], 'Parent summary ' || p),
    (test.id(p, 52), 'SOAP-SUBJECTIVE-SECRET', 'SOAP-OBJECTIVE-SECRET', 'SOAP-ASSESSMENT-SECRET', 'SOAP-PLAN-SECRET', '{}', 'Parent summary 2 ' || p);
  perform app.apply_session_metrics(test.id(p, 51));
  perform app.apply_session_metrics(test.id(p, 52));
  update public.appointments set status = 'completed', attendance = 'present' where id in (test.id(p, 41), test.id(p, 44));
  insert into public.amendments (session_id, entity, entity_id, field, old_value, new_value, reason, "by")
  values (test.id(p, 52), 'session', test.id(p, 52), 'actualMinutes', '45', '40', 'Typo', test.id(p, 5));

  -- parent side
  insert into public.parent_checkins (child_id, appointment_id, date, sleep, ate_breakfast, mood, submitted_by)
  values (v_child1, test.id(p, 42), current_date, 'ok', true, 'happy', test.id(p, 6));
  insert into public.consents (user_id, child_id, kind, granted, version, at)
  values (test.id(p, 6), v_child1, 'data_processing', true, '2026-10', now() - interval '10 days'),
         (test.id(p, 6), v_child1, 'video_upload', true, '2026-10', now() - interval '10 days');
  insert into public.data_requests (user_id, child_id, kind) values (test.id(p, 6), v_child1, 'export');
  insert into public.media (id, organization_id, owner_id, child_id, bucket_path, kind, mime_type, duration_s, size_bytes)
  values (test.id(p, 83), v_org, test.id(p, 6), v_child1, v_org || '/' || v_child1 || '/' || test.id(p, 83) || '.mp4', 'video', 'video/mp4', 42, 4000000);
  insert into public.resources (id, organization_id, title, kind, url, audience)
  values (test.id(p, 84), v_org, 'Staff-only protocol ' || p, 'pdf', v_org || '/' || test.id(p, 84) || '.pdf', 'staff'),
         (test.id(p, 88), v_org, 'Parent guide ' || p, 'pdf', v_org || '/' || test.id(p, 88) || '.pdf', 'parents');
  insert into public.resource_shares (organization_id, resource_id, child_id, shared_by, note)
  values (v_org, test.id(p, 88), v_child1, test.id(p, 3), 'Try this at home');
  insert into public.home_tasks (id, child_id, goal_id, assigned_by, title, steps, frequency_per_week, duration_minutes, resource_id)
  values (test.id(p, 81), v_child1, test.id(p, 61), test.id(p, 3), 'Picture requests at snack time', '["Show two pictures", "Wait for a point"]', 5, 10, test.id(p, 88));
  insert into public.home_logs (id, task_id, logged_by, outcome, difficulty, note, media_id)
  values (test.id(p, 82), test.id(p, 81), test.id(p, 6), 'done', 'ok', 'Went well', test.id(p, 83));

  -- messaging
  insert into public.threads (id, organization_id, child_id, kind, title, created_by)
  values (test.id(p, 71), v_org, v_child1, 'care_team', 'Care team', test.id(p, 2)),
         (test.id(p, 72), v_org, v_child1, 'staff_only', 'Staff only', test.id(p, 2));
  insert into public.thread_members (thread_id, user_id)
  values (test.id(p, 71), test.id(p, 6)), (test.id(p, 71), test.id(p, 3)),
         (test.id(p, 72), test.id(p, 3)), (test.id(p, 72), test.id(p, 2));
  insert into public.messages (thread_id, sender_id, body)
  values (test.id(p, 71), test.id(p, 6), 'Hello from parent ' || p),
         (test.id(p, 72), test.id(p, 3), 'STAFF-ONLY-SECRET ' || p);
  insert into public.message_reads (thread_id, user_id) values (test.id(p, 71), test.id(p, 6));
  insert into public.announcements (organization_id, title, body, audience, created_by)
  values (v_org, 'Holiday ' || p, 'School closed on Friday', 'everyone', test.id(p, 1)),
         (v_org, 'Staff meeting ' || p, 'Staff only', 'all_staff', test.id(p, 1));
  insert into public.alerts (id, child_id, kind, payload, message)
  values (test.id(p, 87), v_child1, 'score_drop', '{}', 'ALERT-SECRET ' || p);
  insert into public.push_tokens (user_id, token, platform) values (test.id(p, 6), 'ExponentPushToken[' || p || ']', 'android');
  insert into public.notification_mutes (user_id, kind) values (test.id(p, 6), 'announcement');
  insert into public.brief_acknowledgements (user_id, appointment_id) values (test.id(p, 4), test.id(p, 42));

  -- storage objects
  insert into storage.objects (bucket_id, name, owner, owner_id)
  values ('media', v_org || '/' || v_child1 || '/' || test.id(p, 83) || '.mp4', test.id(p, 6), test.id(p, 6)::text),
         ('resources', v_org || '/' || test.id(p, 84) || '.pdf', test.id(p, 1), test.id(p, 1)::text),
         ('resources', v_org || '/' || test.id(p, 88) || '.pdf', test.id(p, 1), test.id(p, 1)::text),
         ('avatars', v_org || '/' || v_child1 || '/photo.jpg', test.id(p, 1), test.id(p, 1)::text),
         ('org-assets', v_org || '/logo.png', test.id(p, 1), test.id(p, 1)::text);
end
$$;

select test.seed_school('a');
select test.seed_school('b');

-- Platform admin
insert into auth.users (id, phone, phone_confirmed_at, raw_user_meta_data)
values ('f0000000-0000-4000-8000-000000000001', '919000000001', now(), '{"full_name": "Platform Owner"}');
insert into public.memberships (user_id, organization_id, role)
values ('f0000000-0000-4000-8000-000000000001', null, 'platform_admin');

-- Invite targets in school A: user 9 (verified phone) and user 10 (unverified phone).
insert into auth.users (id, phone, phone_confirmed_at, raw_user_meta_data)
values (test.id('a', 9), '919100000009', now(), '{}'), (test.id('a', 10), '919100000010', null, '{}');
insert into public.invites (organization_id, role, full_name, phone, child_ids, relation, created_by)
values (test.id('a', 0), 'parent', 'Grandma Nine', '+91 91000 00009', array[test.id('a', 32)], 'Grandparent', test.id('a', 1)),
       (test.id('a', 0), 'parent', 'Uncle Ten', '9100000010', array[test.id('a', 32)], 'Guardian', test.id('a', 1));

-- Integration child for the save_session metric parity run (school A only)
insert into public.children (id, organization_id, full_name, dob) values (test.id('a', 33), test.id('a', 0), 'Child Three A', '2019-01-20');
insert into public.child_therapists (child_id, user_id, therapy_type_id, is_lead, active_from)
values (test.id('a', 33), test.id('a', 3), test.id('a', 21), true, current_date - 60);
insert into public.goals (id, child_id, therapy_type_id, domain, staff_text, parent_text)
values (test.id('a', 63), test.id('a', 33), test.id('a', 21), 'communication', 'Labels 10 common objects', 'Names everyday things');
insert into public.appointments (id, child_id, therapist_id, therapy_type_id, starts_at, ends_at)
select test.id('a', n), test.id('a', 33), test.id('a', 3), test.id('a', 21),
       now() - make_interval(days => 2 * (108 - n)), now() - make_interval(days => 2 * (108 - n)) + interval '45 minutes'
from generate_series(100, 107) n;
