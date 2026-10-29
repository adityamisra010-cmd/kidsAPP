-- =============================================================================
-- 20261029000004_metrics.sql — session metrics engine, save/amend RPCs, alerts
--
-- Intent
--   * public.compute_session_metrics(p_input jsonb) is a line-for-line mirror of
--     computeSessionMetrics() in src/domain/metrics.ts. Input/output use the TS shapes
--     (MetricsInput -> SessionMetrics, camelCase keys, undefined = key omitted).
--     - ratings normalised (v - 1) / 4 * 100; numeric arithmetic + round(numeric, 1), which is
--       half-away-from-zero like round() in metrics.ts;
--     - rolling window 4 previous sessions, needs >= 2; per-dimension deltas on raw 1..5 values;
--     - trend: least-squares slope over the last <= 6 values (oldest -> newest, incl. current),
--       >= 3 points, threshold +/-2.5. The slope is computed in float8 with the same operation
--       order as the JS code, so values that sit exactly on the threshold classify identically
--       (JS doubles can yield 2.4999999999999996 where exact maths gives 2.5).
--     Parity is enforced by scripts/db/run-tests.ts against src/domain/__fixtures__/metrics-cases.json.
--   * save_session(payload) — SECURITY INVOKER: the session upsert and child rows go through RLS.
--     Derived work (metrics, alerts, notifications) is done by private SECURITY DEFINER helpers
--     that only recompute from stored data, so API callers can never write metric columns.
--   * amend_session(session_id, changes, reason) — the only way to change a locked log; every
--     changed field becomes an `amendments` row.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pure maths
-- ---------------------------------------------------------------------------
create or replace function app.normalise(v numeric) returns numeric
language sql immutable as $$ select (v - 1) / 4 * 100 $$;

-- Least-squares slope with x = 0..n-1 (float8, same evaluation order as metrics.ts slope()).
create or replace function app.slope(p_values float8[]) returns float8
language plpgsql immutable as $$
declare
  n int := coalesce(cardinality(p_values), 0);
  x_mean float8;
  y_sum float8 := 0;
  y_mean float8;
  num float8 := 0;
  den float8 := 0;
  dx float8;
  i int;
begin
  if n < 2 then
    return 0;
  end if;
  x_mean := (n - 1)::float8 / 2;
  for i in 1 .. n loop
    y_sum := y_sum + p_values[i];
  end loop;
  y_mean := y_sum / n;
  for i in 0 .. n - 1 loop
    dx := i - x_mean;
    num := num + dx * (p_values[i + 1] - y_mean);
    den := den + dx * dx;
  end loop;
  if den = 0 then
    return 0;
  end if;
  return num / den;
end
$$;

-- values oldest -> newest on the 0..100 scale.
create or replace function app.trend(p_values float8[]) returns public.trend
language plpgsql immutable as $$
declare
  n int := coalesce(cardinality(p_values), 0);
  w float8[] := case when n > 6 then p_values[n - 5 : n] else coalesce(p_values, '{}') end;
  s float8;
begin
  if cardinality(w) < 3 then
    return 'flat';
  end if;
  s := app.slope(w);
  if s >= 2.5 then
    return 'up';
  end if;
  if s <= -2.5 then
    return 'down';
  end if;
  return 'flat';
end
$$;

-- Mirror of computeSessionMetrics(input: MetricsInput): SessionMetrics.
create or replace function public.compute_session_metrics(p_input jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  c_rolling_window constant int := 4;
  c_rolling_min constant int := 2;
  c_trend_window constant int := 6;
  v_ratings jsonb := coalesce(p_input -> 'ratings', '{}'::jsonb);
  v_trials jsonb := coalesce(p_input -> 'goalTrials', '[]'::jsonb);
  v_incidents jsonb := coalesce(p_input -> 'incidents', '[]'::jsonb);
  v_dims jsonb := coalesce(p_input -> 'dimensions', '[]'::jsonb);
  v_prev jsonb := coalesce(p_input -> 'previous', '[]'::jsonb); -- newest first
  v_last jsonb := coalesce(p_input -> 'previous', '[]'::jsonb) -> 0;
  d jsonb;
  t jsonb;
  v_key text;
  v_val numeric;
  v_weight numeric;
  v_total numeric := 0;
  v_weights numeric := 0;
  v_score numeric;
  v_att numeric;
  v_accs numeric[] := '{}';
  v_goal_acc numeric;
  v_pool numeric[];
  v_rolling numeric;
  v_series float8[];
  v_prev_vals numeric[];
  v_last_val numeric;
  v_rolling_dim numeric;
  v_dim_series float8[];
  v_dimensions jsonb := '{}'::jsonb;
begin
  -- sessionScore(): weighted mean of enabled, weighted (> 0), rated dimensions
  for d in select e.value from jsonb_array_elements(v_dims) with ordinality as e(value, ord) order by e.ord loop
    if not coalesce((d ->> 'enabled')::boolean, false) then
      continue;
    end if;
    v_weight := (d ->> 'weight')::numeric;
    if v_weight is null or v_weight <= 0 then
      continue;
    end if;
    v_val := (v_ratings ->> (d ->> 'key'))::numeric;
    if v_val is null then
      continue;
    end if;
    v_total := v_total + app.normalise(v_val) * v_weight;
    v_weights := v_weights + v_weight;
  end loop;
  v_score := case when v_weights = 0 then 0 else round(v_total / v_weights, 1) end;

  -- goalAccuracy(): mean of per-goal rounded accuracies, goals with attempted > 0
  for t in select e.value from jsonb_array_elements(v_trials) as e(value) loop
    v_att := (t ->> 'attempted')::numeric;
    if v_att is null or v_att <= 0 then
      continue;
    end if;
    v_accs := v_accs || round(least((t ->> 'successful')::numeric, v_att) / v_att * 100, 1);
  end loop;
  if cardinality(v_accs) > 0 then
    v_goal_acc := round((select sum(x) from unnest(v_accs) as x) / cardinality(v_accs), 1);
  end if;

  -- rolling average of up to 4 previous scores (needs >= 2), rounded
  select array_agg((e.value ->> 'sessionScore')::numeric order by e.ord) into v_pool
  from jsonb_array_elements(v_prev) with ordinality as e(value, ord)
  where e.ord <= c_rolling_window;
  if coalesce(cardinality(v_pool), 0) >= c_rolling_min then
    v_rolling := round((select sum(x) from unnest(v_pool) as x) / cardinality(v_pool), 1);
  end if;

  -- score series for the trend: up to 5 previous (oldest -> newest) + current
  select array_agg((e.value ->> 'sessionScore')::float8 order by e.ord desc) into v_series
  from jsonb_array_elements(v_prev) with ordinality as e(value, ord)
  where e.ord <= c_trend_window - 1;
  v_series := coalesce(v_series, '{}'::float8[]) || v_score::float8;

  -- per-dimension deltas and trends (enabled + rated; weight not required, as in metrics.ts)
  for d in select e.value from jsonb_array_elements(v_dims) with ordinality as e(value, ord) order by e.ord loop
    if not coalesce((d ->> 'enabled')::boolean, false) then
      continue;
    end if;
    v_key := d ->> 'key';
    v_val := (v_ratings ->> v_key)::numeric;
    if v_val is null then
      continue;
    end if;
    -- previous values of this dimension across ALL previous sessions, newest first, non-null
    select array_agg((e.value -> 'ratings' ->> v_key)::numeric order by e.ord) into v_prev_vals
    from jsonb_array_elements(v_prev) with ordinality as e(value, ord)
    where (e.value -> 'ratings' ->> v_key) is not null;
    v_prev_vals := coalesce(v_prev_vals, '{}'::numeric[]);
    v_last_val := (v_last -> 'ratings' ->> v_key)::numeric;
    v_rolling_dim := null;
    if cardinality(v_prev_vals) >= c_rolling_min then
      v_rolling_dim := (select sum(x) from unnest(v_prev_vals[1 : c_rolling_window]) as x)
                       / least(cardinality(v_prev_vals), c_rolling_window);
    end if;
    select array_agg(app.normalise(u.x)::float8 order by u.ord desc) into v_dim_series
    from unnest(v_prev_vals[1 : c_trend_window - 1]) with ordinality as u(x, ord);
    v_dim_series := coalesce(v_dim_series, '{}'::float8[]) || app.normalise(v_val)::float8;

    v_dimensions := v_dimensions || jsonb_build_object(v_key, jsonb_strip_nulls(jsonb_build_object(
      'value', v_val,
      'deltaLast', round(v_val - v_last_val, 1),
      'deltaRolling', round(v_val - v_rolling_dim, 1),
      'trend', app.trend(v_dim_series)
    )));
  end loop;

  return jsonb_strip_nulls(jsonb_build_object(
    'sessionScore', v_score,
    'goalAccuracy', v_goal_acc,
    'deltaLast', case when v_last is not null then round(v_score - (v_last ->> 'sessionScore')::numeric, 1) end,
    'deltaRolling', case when v_rolling is not null then round(v_score - v_rolling, 1) end,
    'rollingAverage', v_rolling,
    'trend', app.trend(v_series),
    'dimensions', v_dimensions,
    'incidentCount', jsonb_array_length(v_incidents)
  ));
end
$$;
comment on function public.compute_session_metrics(jsonb) is
  'Pure mirror of computeSessionMetrics() in src/domain/metrics.ts (MetricsInput -> SessionMetrics).';

-- ---------------------------------------------------------------------------
-- Loading inputs from stored data
-- ---------------------------------------------------------------------------
create or replace function app.dimensions_for_org(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('key', d.key, 'weight', d.weight, 'enabled', d.enabled) order by d.sort_order, d.key)
     from public.rating_dimensions d where d.organization_id = p_org),
    (select jsonb_agg(jsonb_build_object('key', d.key, 'weight', d.weight, 'enabled', d.enabled) order by d.sort_order, d.key)
     from public.rating_dimensions d where d.organization_id is null),
    '[]'::jsonb
  )
$$;

create or replace function app.session_ratings_json(p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(r.dimension_key, r.value), '{}'::jsonb)
  from public.session_ratings r where r.session_id = p_session
$$;

-- Previous sessions: same child + therapy type, strictly earlier by appointment start, newest first.
-- 24 is far more than the 4/6-session windows need; it only matters when a dimension was
-- skipped in many recent sessions.
create or replace function app.previous_sessions(p_session uuid, p_limit int default 24)
returns table (id uuid, session_score numeric, delta_rolling numeric, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.session_score, p.delta_rolling, pa.starts_at
  from public.sessions s
  join public.appointments a on a.id = s.appointment_id
  join public.sessions p on p.child_id = s.child_id and p.therapy_type_id = s.therapy_type_id and p.id <> s.id
  join public.appointments pa on pa.id = p.appointment_id
  where s.id = p_session
    and p.session_score is not null
    and (pa.starts_at, p.created_at, p.id) < (a.starts_at, s.created_at, s.id)
  order by pa.starts_at desc, p.created_at desc, p.id desc
  limit p_limit
$$;

create or replace function app.session_metrics_input(p_session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ratings', app.session_ratings_json(s.id),
    'goalTrials', coalesce((
      select jsonb_agg(jsonb_build_object('goalId', t.goal_id, 'attempted', t.attempted, 'successful', t.successful) order by t.created_at, t.id)
      from public.goal_trials t where t.session_id = s.id
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object('type', i.type, 'antecedentTags', to_jsonb(i.antecedent_tags)) order by i.created_at, i.id)
      from public.behaviour_incidents i where i.session_id = s.id
    ), '[]'::jsonb),
    'dimensions', app.dimensions_for_org(s.organization_id),
    'previous', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sessionScore', p.session_score,
        'ratings', app.session_ratings_json(p.id),
        'deltaRolling', p.delta_rolling
      ) order by p.ord)
      from app.previous_sessions(s.id) with ordinality as p(id, session_score, delta_rolling, starts_at, ord)
    ), '[]'::jsonb)
  )
  from public.sessions s where s.id = p_session
$$;

-- Recompute from stored data and write the denormalised columns.
create or replace function app.apply_session_metrics(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_m jsonb;
begin
  v_m := public.compute_session_metrics(app.session_metrics_input(p_session));
  update public.sessions set
    session_score = (v_m ->> 'sessionScore')::numeric,
    goal_accuracy = (v_m ->> 'goalAccuracy')::numeric,
    delta_last = (v_m ->> 'deltaLast')::numeric,
    delta_rolling = (v_m ->> 'deltaRolling')::numeric,
    rolling_average = (v_m ->> 'rollingAverage')::numeric,
    trend = (v_m ->> 'trend')::public.trend,
    dimension_metrics = coalesce(v_m -> 'dimensions', '{}'::jsonb),
    incident_count = coalesce((v_m ->> 'incidentCount')::int, 0)
  where id = p_session;
  return v_m;
end
$$;

-- A late (offline) or amended log changes the windows of the sessions after it.
create or replace function app.recompute_following(p_session uuid, p_max int default 6) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select n.id
    from public.sessions s
    join public.appointments a on a.id = s.appointment_id
    join public.sessions n on n.child_id = s.child_id and n.therapy_type_id = s.therapy_type_id and n.id <> s.id
    join public.appointments na on na.id = n.appointment_id
    where s.id = p_session and (na.starts_at, n.created_at, n.id) > (a.starts_at, s.created_at, s.id)
    order by na.starts_at, n.created_at, n.id
    limit p_max
  loop
    perform app.apply_session_metrics(r.id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Notification helpers (the only way rows reach other users' inboxes)
-- ---------------------------------------------------------------------------
create or replace function app.notify(
  p_user uuid, p_org uuid, p_kind public.notification_kind, p_title text, p_body text,
  p_route text default null, p_payload jsonb default '{}'::jsonb, p_dedupe text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  if p_user is null or p_user = auth.uid() then
    return 0; -- nobody to notify / do not notify the actor
  end if;
  insert into public.notifications (organization_id, user_id, kind, title, body, route, payload, dedupe_key)
  values (p_org, p_user, p_kind, p_title, coalesce(p_body, ''), p_route, coalesce(p_payload, '{}'::jsonb), p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end
$$;

create or replace function app.notify_guardians(
  p_child uuid, p_kind public.notification_kind, p_title text, p_body text,
  p_route text default null, p_payload jsonb default '{}'::jsonb, p_dedupe text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_sent integer := 0;
begin
  for r in
    select g.user_id, g.organization_id from public.child_guardians g
    where g.child_id = p_child and exists (
      select 1 from public.memberships m
      where m.user_id = g.user_id and m.organization_id = g.organization_id and m.status = 'active'
    )
  loop
    v_sent := v_sent + app.notify(r.user_id, r.organization_id, p_kind, p_title, p_body, p_route, p_payload, p_dedupe);
  end loop;
  return v_sent;
end
$$;

-- Coordinators of the school (school admins when there is no coordinator).
create or replace function app.notify_coordinators(
  p_org uuid, p_kind public.notification_kind, p_title text, p_body text,
  p_route text default null, p_payload jsonb default '{}'::jsonb, p_dedupe text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_role public.user_role := 'coordinator';
  v_sent integer := 0;
begin
  if not exists (
    select 1 from public.memberships m where m.organization_id = p_org and m.role = 'coordinator' and m.status = 'active'
  ) then
    v_role := 'school_admin';
  end if;
  for r in
    select m.user_id from public.memberships m where m.organization_id = p_org and m.role = v_role and m.status = 'active'
  loop
    v_sent := v_sent + app.notify(r.user_id, p_org, p_kind, p_title, p_body, p_route, p_payload, p_dedupe);
  end loop;
  return v_sent;
end
$$;

create or replace function app.child_display_name(p_child uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(c.preferred_name, ''), split_part(c.full_name, ' ', 1)) from public.children c where c.id = p_child
$$;

create or replace function app.notify_session_summary(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_type text;
begin
  select * into s from public.sessions where id = p_session;
  select tt.name into v_type from public.therapy_types tt where tt.id = s.therapy_type_id;
  perform app.notify_guardians(
    s.child_id, 'session_summary', 'New session summary',
    format('%s''s %s session on %s', app.child_display_name(s.child_id), v_type, to_char(s.date, 'FMDD Mon')),
    '/session/' || s.id,
    jsonb_build_object('sessionId', s.id, 'childId', s.child_id, 'therapyTypeId', s.therapy_type_id),
    'session_summary:' || s.id
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Alerts (checkAlerts in metrics.ts)
-- ---------------------------------------------------------------------------
create or replace function app.raise_alert(
  p_org uuid, p_child uuid, p_session uuid, p_kind public.alert_kind, p_payload jsonb, p_message text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if exists (
    select 1 from public.alerts a
    where a.child_id = p_child and a.kind = p_kind and a.payload ->> 'sessionId' = p_session::text
  ) then
    return null;
  end if;
  insert into public.alerts (organization_id, child_id, kind, payload, message)
  values (p_org, p_child, p_kind, p_payload || jsonb_build_object('sessionId', p_session), p_message)
  returning id into v_id;
  perform app.notify_coordinators(
    p_org, 'child_alert', format('%s needs attention', app.child_display_name(p_child)), p_message,
    '/child/' || p_child, jsonb_build_object('alertId', v_id, 'childId', p_child, 'kind', p_kind), 'alert:' || v_id
  );
  return v_id;
end
$$;

-- score_drop: this session AND the previous one each >= alertDropThreshold below their rolling
-- average. incident_spike: incident count >= alertIncidentThreshold. Returns kinds newly raised.
create or replace function app.check_session_alerts(p_session uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_settings jsonb;
  v_drop numeric;
  v_incidents int;
  v_prev_id uuid;
  v_prev_delta numeric;
  v_type text;
  v_name text;
  v_raised text[] := '{}';
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    return v_raised;
  end if;
  v_settings := app.org_settings(s.organization_id);
  v_drop := coalesce((v_settings ->> 'alertDropThreshold')::numeric, 15);
  v_incidents := coalesce((v_settings ->> 'alertIncidentThreshold')::int, 3);
  select p.id, p.delta_rolling into v_prev_id, v_prev_delta from app.previous_sessions(p_session, 1) p;
  select tt.name into v_type from public.therapy_types tt where tt.id = s.therapy_type_id;
  v_name := app.child_display_name(s.child_id);

  if s.delta_rolling is not null and s.delta_rolling <= -v_drop
     and v_prev_delta is not null and v_prev_delta <= -v_drop then
    if app.raise_alert(
      s.organization_id, s.child_id, s.id, 'score_drop',
      jsonb_build_object(
        'sessionIds', jsonb_build_array(v_prev_id, s.id), 'drop', abs(s.delta_rolling),
        'previousDrop', abs(v_prev_delta), 'therapyTypeId', s.therapy_type_id
      ),
      format('%s: %s score was %s points below the recent average for two sessions in a row.',
             v_name, v_type, abs(s.delta_rolling))
    ) is not null then
      v_raised := v_raised || 'score_drop'::text;
    end if;
  end if;

  if s.incident_count >= v_incidents then
    if app.raise_alert(
      s.organization_id, s.child_id, s.id, 'incident_spike',
      jsonb_build_object('sessionIds', jsonb_build_array(s.id), 'incidentCount', s.incident_count, 'therapyTypeId', s.therapy_type_id),
      format('%s: %s behaviour incidents in one %s session.', v_name, s.incident_count, v_type)
    ) is not null then
      v_raised := v_raised || 'incident_spike'::text;
    end if;
  end if;
  return v_raised;
end
$$;

-- ---------------------------------------------------------------------------
-- Goal mastery suggestion (masteryMet in metrics.ts). Never changes goal status.
-- ---------------------------------------------------------------------------
create or replace function app.goal_accuracies(p_goal uuid) returns numeric[]
language sql stable security definer set search_path = '' as $$
  -- trialAccuracy() per session where the goal was attempted, oldest -> newest
  select coalesce(array_agg(round(least(t.successful, t.attempted)::numeric / t.attempted * 100, 1)
                            order by ap.starts_at, s.created_at, s.id), '{}')
  from public.goal_trials t
  join public.sessions s on s.id = t.session_id
  join public.appointments ap on ap.id = s.appointment_id
  where t.goal_id = p_goal and t.attempted > 0
$$;

create or replace function app.mastery_met(p_accuracies numeric[], p_rule jsonb) returns boolean
language plpgsql immutable as $$
declare
  n int := coalesce((p_rule ->> 'consecutiveSessions')::int, 3);
  v_req numeric := coalesce((p_rule ->> 'accuracy')::numeric, 80);
  len int := coalesce(cardinality(p_accuracies), 0);
  i int;
begin
  if len < n then
    return false;
  end if;
  for i in len - n + 1 .. len loop
    if p_accuracies[i] < v_req then
      return false;
    end if;
  end loop;
  return true;
end
$$;

create or replace function app.goal_mastery_suggested(p_goal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select g.status not in ('mastered', 'maintenance') and app.mastery_met(app.goal_accuracies(g.id), g.mastery_rule)
  from public.goals g where g.id = p_goal
$$;

create or replace function app.mastery_suggestions(p_session uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(t.goal_id order by t.goal_id), '{}')
  from public.goal_trials t
  where t.session_id = p_session and t.attempted > 0 and app.goal_mastery_suggested(t.goal_id)
$$;

-- ---------------------------------------------------------------------------
-- Session RPC plumbing
-- ---------------------------------------------------------------------------
create or replace function app.mark_appointment_logged(p_appointment uuid) returns void
language sql security definer set search_path = '' as $$
  update public.appointments
  set status = 'completed', attendance = coalesce(attendance, 'present')
  where id = p_appointment and status <> 'cancelled'
$$;

create or replace function app.session_result(p_session uuid, p_created boolean, p_alerts text[], p_mastery uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sessionId', s.id,
    'appointmentId', s.appointment_id,
    'created', p_created,
    'date', s.date,
    'isSubstitute', s.is_substitute,
    'lockedAt', s.locked_at,
    'amendmentCount', s.amendment_count,
    'metrics', jsonb_strip_nulls(jsonb_build_object(
      'sessionScore', s.session_score,
      'goalAccuracy', s.goal_accuracy,
      'deltaLast', s.delta_last,
      'deltaRolling', s.delta_rolling,
      'rollingAverage', s.rolling_average,
      'trend', s.trend,
      'dimensions', s.dimension_metrics,
      'incidentCount', s.incident_count
    )),
    'alertsRaised', to_jsonb(coalesce(p_alerts, '{}')),
    'masterySuggestedGoalIds', to_jsonb(coalesce(p_mastery, '{}'))
  )
  from public.sessions s where s.id = p_session
$$;

create or replace function app.jsonb_text_array(p jsonb) returns text[]
language sql immutable as $$
  select case when jsonb_typeof(p) = 'array' then array(select jsonb_array_elements_text(p)) else '{}'::text[] end
$$;

create or replace function app.enum_ok(p_value text, p_allowed text[]) returns boolean
language sql immutable as $$ select p_value is not null and p_value = any (p_allowed) $$;

-- Validates a SessionInput-shaped payload (fields that are present). Raises 'validation'.
create or replace function app.validate_session_input(p jsonb, p_partial boolean) returns void
language plpgsql as $$
declare e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    perform app.raise('validation', 'payload must be an object');
  end if;
  if p ? 'ratings' then
    if jsonb_typeof(p -> 'ratings') <> 'object' then
      perform app.raise('validation', 'ratings must be an object');
    end if;
    if exists (
      select 1 from jsonb_each(p -> 'ratings') r
      where jsonb_typeof(r.value) <> 'null'
        and (jsonb_typeof(r.value) <> 'number' or (r.value #>> '{}') not in ('1', '2', '3', '4', '5'))
    ) then
      perform app.raise('validation', 'ratings must be integers 1..5');
    end if;
  end if;
  if p ? 'goalTrials' then
    if jsonb_typeof(p -> 'goalTrials') <> 'array' then
      perform app.raise('validation', 'goalTrials must be an array');
    end if;
    for e in select x.value from jsonb_array_elements(p -> 'goalTrials') as x(value) loop
      if coalesce(e ->> 'goalId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or coalesce((e ->> 'attempted')::numeric, 0) < 0 or coalesce((e ->> 'successful')::numeric, 0) < 0
         or coalesce(e ->> 'promptLevel', '3') not in ('1', '2', '3', '4', '5') then
        perform app.raise('validation', 'invalid goal trial');
      end if;
    end loop;
    if (select count(*) <> count(distinct x.value ->> 'goalId') from jsonb_array_elements(p -> 'goalTrials') as x(value)) then
      perform app.raise('validation', 'duplicate goal in goalTrials');
    end if;
  end if;
  if p ? 'incidents' then
    if jsonb_typeof(p -> 'incidents') <> 'array' or exists (
      select 1 from jsonb_array_elements(p -> 'incidents') as x(value)
      where not app.enum_ok(x.value ->> 'type', enum_range(null::public.incident_type)::text[])
    ) then
      perform app.raise('validation', 'invalid incident');
    end if;
  end if;
  if p ? 'regulationState' and not app.enum_ok(p ->> 'regulationState', enum_range(null::public.regulation_state)::text[]) then
    perform app.raise('validation', 'invalid regulationState');
  end if;
  if p ? 'comparedToLast' and not app.enum_ok(p ->> 'comparedToLast', enum_range(null::public.compared_to_last)::text[]) then
    perform app.raise('validation', 'invalid comparedToLast');
  end if;
  if not p_partial and coalesce(btrim(p -> 'notes' ->> 'planNext'), '') = '' then
    perform app.raise('validation', 'notes.planNext (plan for next session) is required');
  end if;
  if p_partial and p -> 'notes' ? 'planNext' and coalesce(btrim(p -> 'notes' ->> 'planNext'), '') = '' then
    perform app.raise('validation', 'notes.planNext cannot be emptied');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- save_session(payload SessionInput) — idempotent on clientId, RLS applies
-- ---------------------------------------------------------------------------
create or replace function public.save_session(payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_payload jsonb := save_session.payload;
  v_notes jsonb;
  v_client uuid;
  v_appt_id uuid;
  a public.appointments;
  v_existing public.sessions;
  v_session uuid;
  v_created boolean := false;
  v_hash text;
  v_alerts text[];
begin
  if v_uid is null then
    perform app.raise('not_authenticated');
  end if;
  perform app.validate_session_input(v_payload, false);
  begin
    v_client := (v_payload ->> 'clientId')::uuid;
    v_appt_id := (v_payload ->> 'appointmentId')::uuid;
  exception when invalid_text_representation then
    perform app.raise('validation', 'clientId and appointmentId must be uuids');
  end;
  if v_client is null or v_appt_id is null then
    perform app.raise('validation', 'clientId and appointmentId are required');
  end if;
  v_notes := coalesce(v_payload -> 'notes', '{}'::jsonb);
  v_hash := md5(v_payload::text);

  -- The appointment must be visible to the caller (RLS) and theirs to log (or an org admin's).
  select * into a from public.appointments where id = v_appt_id;
  if a.id is null then
    perform app.raise('not_found', 'appointment');
  end if;
  if not app.can_log_appointment(a.id) then
    perform app.raise('forbidden');
  end if;
  if a.status = 'cancelled' then
    perform app.raise('validation', 'the appointment was cancelled');
  end if;
  if a.starts_at > now() + interval '12 hours' then
    perform app.raise('validation', 'the session has not started yet');
  end if;

  -- Upsert by clientId (offline retries), falling back to the appointment (edit from another device).
  select * into v_existing from public.sessions where client_id = v_client;
  if v_existing.id is not null and v_existing.appointment_id <> v_appt_id then
    perform app.raise('conflict', 'clientId already used for another appointment');
  end if;
  if v_existing.id is null then
    select * into v_existing from public.sessions where appointment_id = v_appt_id;
  end if;

  if v_existing.id is not null then
    if v_existing.locked_at <= now() then
      if v_existing.payload_hash = v_hash then
        -- replay of an already-applied save: idempotent success
        return app.session_result(v_existing.id, false, '{}', app.mastery_suggestions(v_existing.id));
      end if;
      perform app.raise('locked', 'this log is locked; use amend_session with a reason');
    end if;
    update public.sessions set
      actual_minutes = coalesce((v_payload ->> 'actualMinutes')::int, actual_minutes),
      started_late = coalesce((v_payload ->> 'startedLate')::boolean, started_late),
      regulation_state = coalesce((v_payload ->> 'regulationState')::public.regulation_state, regulation_state),
      breaks_count = coalesce((v_payload ->> 'breaksCount')::int, breaks_count),
      compared_to_last = coalesce((v_payload ->> 'comparedToLast')::public.compared_to_last, compared_to_last),
      worked_tags = app.jsonb_text_array(v_payload -> 'workedTags'),
      worked_text = coalesce(v_payload ->> 'workedText', ''),
      not_worked_tags = app.jsonb_text_array(v_payload -> 'notWorkedTags'),
      not_worked_text = coalesce(v_payload ->> 'notWorkedText', ''),
      payload_hash = v_hash
    where id = v_existing.id;
    if not found then
      perform app.raise('forbidden');
    end if;
    v_session := v_existing.id;
  else
    begin
      insert into public.sessions (
        client_id, appointment_id, actual_minutes, started_late, regulation_state, breaks_count,
        compared_to_last, worked_tags, worked_text, not_worked_tags, not_worked_text, payload_hash
      ) values (
        v_client, v_appt_id,
        coalesce((v_payload ->> 'actualMinutes')::int, round(extract(epoch from a.ends_at - a.starts_at) / 60)::int),
        coalesce((v_payload ->> 'startedLate')::boolean, false),
        coalesce((v_payload ->> 'regulationState')::public.regulation_state, 'regulated'),
        coalesce((v_payload ->> 'breaksCount')::int, 0),
        coalesce((v_payload ->> 'comparedToLast')::public.compared_to_last, 'same'),
        app.jsonb_text_array(v_payload -> 'workedTags'),
        coalesce(v_payload ->> 'workedText', ''),
        app.jsonb_text_array(v_payload -> 'notWorkedTags'),
        coalesce(v_payload ->> 'notWorkedText', ''),
        v_hash
      ) returning id into v_session;
    exception when unique_violation then
      perform app.raise('conflict', 'a session already exists for this appointment');
    end;
    v_created := true;
  end if;

  -- Child rows are replaced wholesale (the logger always sends the full form).
  delete from public.session_ratings where session_id = v_session;
  insert into public.session_ratings (session_id, dimension_key, value)
  select v_session, r.key, (r.value #>> '{}')::smallint
  from jsonb_each(coalesce(v_payload -> 'ratings', '{}'::jsonb)) r
  where jsonb_typeof(r.value) = 'number';

  delete from public.goal_trials where session_id = v_session;
  insert into public.goal_trials (session_id, goal_id, attempted, successful, prompt_level, note)
  select v_session, (e.value ->> 'goalId')::uuid,
         coalesce((e.value ->> 'attempted')::int, 0), coalesce((e.value ->> 'successful')::int, 0),
         coalesce((e.value ->> 'promptLevel')::smallint, 3), nullif(e.value ->> 'note', '')
  from jsonb_array_elements(coalesce(v_payload -> 'goalTrials', '[]'::jsonb)) as e(value);

  delete from public.behaviour_incidents where session_id = v_session;
  insert into public.behaviour_incidents (session_id, type, duration_seconds, antecedent_tags)
  select v_session, (e.value ->> 'type')::public.incident_type, (e.value ->> 'durationSeconds')::int,
         app.jsonb_text_array(e.value -> 'antecedentTags')
  from jsonb_array_elements(coalesce(v_payload -> 'incidents', '[]'::jsonb)) with ordinality as e(value, ord)
  order by e.ord;

  insert into public.session_notes (session_id, subjective, objective, assessment, plan_next, plan_goal_ids, parent_summary)
  values (
    v_session,
    coalesce(v_notes ->> 'subjective', ''),
    coalesce(v_notes ->> 'objective', ''),
    coalesce(v_notes ->> 'assessment', ''),
    btrim(v_notes ->> 'planNext'),
    app.jsonb_text_array(v_notes -> 'planGoalIds')::uuid[],
    coalesce(v_notes ->> 'parentSummary', '')
  )
  on conflict (session_id) do update set
    subjective = excluded.subjective,
    objective = excluded.objective,
    assessment = excluded.assessment,
    plan_next = excluded.plan_next,
    plan_goal_ids = excluded.plan_goal_ids,
    parent_summary = excluded.parent_summary;

  perform app.apply_session_metrics(v_session);
  perform app.recompute_following(v_session);
  v_alerts := app.check_session_alerts(v_session);
  perform app.mark_appointment_logged(v_appt_id);
  if v_created then
    perform app.notify_session_summary(v_session);
  end if;
  return app.session_result(v_session, v_created, v_alerts, app.mastery_suggestions(v_session));
end
$$;
comment on function public.save_session(jsonb) is
  'Upsert a SessionInput (idempotent on clientId), compute metrics, raise alerts, notify. Returns {sessionId, created, lockedAt, metrics, alertsRaised, masterySuggestedGoalIds, ...}.';

-- ---------------------------------------------------------------------------
-- amend_session(session_id, changes, reason) — changes after (or before) the lock, audited
-- ---------------------------------------------------------------------------
create or replace function app.record_amendment(
  p_org uuid, p_session uuid, p_entity public.amendment_entity, p_entity_id uuid,
  p_field text, p_old text, p_new text, p_reason text
) returns void language sql security definer set search_path = '' as $$
  insert into public.amendments (organization_id, session_id, entity, entity_id, field, old_value, new_value, reason, "by", at)
  values (p_org, p_session, p_entity, p_entity_id, p_field, coalesce(p_old, ''), coalesce(p_new, ''), p_reason, auth.uid(), now())
$$;

create or replace function app.trial_text(p_attempted int, p_successful int, p_prompt int, p_note text) returns text
language sql immutable as $$
  select case when p_attempted is null then '' else
    format('%s/%s, prompt %s', p_successful, p_attempted, p_prompt) || coalesce(' (' || nullif(p_note, '') || ')', '')
  end
$$;

create or replace function app.incidents_canonical(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(x.v order by x.v::text), '[]'::jsonb) from (
    select jsonb_build_object(
      'type', e.value ->> 'type',
      'durationSeconds', (e.value ->> 'durationSeconds')::int,
      'antecedentTags', coalesce((select jsonb_agg(t order by t) from jsonb_array_elements_text(coalesce(e.value -> 'antecedentTags', '[]'::jsonb)) t), '[]'::jsonb)
    ) as v
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) as e(value)
  ) x
$$;

create or replace function app.incidents_text(p jsonb) returns text
language sql immutable as $$
  select case when jsonb_array_length(p) = 0 then 'none' else
    jsonb_array_length(p)::text || ': ' || (select string_agg(e.value ->> 'type', ', ') from jsonb_array_elements(p) as e(value))
  end
$$;

create or replace function public.amend_session(session_id uuid, changes jsonb, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session_id uuid := amend_session.session_id;
  v_changes jsonb := coalesce(amend_session.changes, '{}'::jsonb);
  v_reason text := btrim(coalesce(amend_session.reason, ''));
  s public.sessions;
  v_notes_id uuid;
  v_count int := 0;
  v_rows int;
  v_old text;
  v_new text;
  v_old_json jsonb;
  v_new_json jsonb;
  v_tid uuid;
  m record;
  r record;
  v_alerts text[];
begin
  if v_uid is null then
    perform app.raise('not_authenticated');
  end if;
  select * into s from public.sessions where id = v_session_id for update;
  if s.id is null then
    perform app.raise('not_found', 'session');
  end if;
  if not ((s.therapist_id = v_uid and app.is_staff(s.organization_id)) or app.is_org_admin(s.organization_id)) then
    perform app.raise('forbidden');
  end if;
  if v_reason = '' then
    perform app.raise('validation', 'a reason is required for an amendment');
  end if;
  perform app.validate_session_input(v_changes, true);

  -- 1. Scalar session fields
  for m in
    select * from (values
      ('actualMinutes', 'actual_minutes', 'integer'),
      ('startedLate', 'started_late', 'boolean'),
      ('regulationState', 'regulation_state', 'public.regulation_state'),
      ('breaksCount', 'breaks_count', 'integer'),
      ('comparedToLast', 'compared_to_last', 'public.compared_to_last'),
      ('workedTags', 'worked_tags', 'text[]'),
      ('workedText', 'worked_text', 'text'),
      ('notWorkedTags', 'not_worked_tags', 'text[]'),
      ('notWorkedText', 'not_worked_text', 'text')
    ) as x(jkey, col, typ)
  loop
    continue when not (v_changes ? m.jkey) or jsonb_typeof(v_changes -> m.jkey) = 'null';
    if m.typ = 'text[]' then
      execute format('select array_to_string(%I, '', '') from public.sessions where id = $1', m.col) into v_old using s.id;
      v_new := array_to_string(app.jsonb_text_array(v_changes -> m.jkey), ', ');
      execute format('update public.sessions set %I = $1 where id = $2 and %I is distinct from $1', m.col, m.col)
        using app.jsonb_text_array(v_changes -> m.jkey), s.id;
    else
      execute format('select %I::text from public.sessions where id = $1', m.col) into v_old using s.id;
      v_new := v_changes ->> m.jkey;
      execute format('update public.sessions set %I = $1::%s where id = $2 and %I is distinct from $1::%s', m.col, m.typ, m.col, m.typ)
        using v_new, s.id;
    end if;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      perform app.record_amendment(s.organization_id, s.id, 'session', s.id, m.jkey, v_old, v_new, v_reason);
      v_count := v_count + 1;
    end if;
  end loop;

  -- 2. Ratings (merge; null removes a rating)
  if jsonb_typeof(v_changes -> 'ratings') = 'object' then
    for r in select e.key, e.value from jsonb_each(v_changes -> 'ratings') e order by e.key loop
      select sr.value::text into v_old from public.session_ratings sr where sr.session_id = s.id and sr.dimension_key = r.key;
      v_new := case when jsonb_typeof(r.value) = 'null' then null else r.value #>> '{}' end;
      continue when v_old is not distinct from v_new;
      if v_new is null then
        delete from public.session_ratings where session_id = s.id and dimension_key = r.key;
      else
        insert into public.session_ratings (session_id, dimension_key, value)
        values (s.id, r.key, v_new::smallint)
        on conflict (session_id, dimension_key) do update set value = excluded.value;
      end if;
      perform app.record_amendment(s.organization_id, s.id, 'session', s.id, 'ratings.' || r.key, v_old, v_new, v_reason);
      v_count := v_count + 1;
    end loop;
  end if;

  -- 3. Goal trials (full list replaces the old one; one amendment per goal changed)
  if jsonb_typeof(v_changes -> 'goalTrials') = 'array' then
    for r in
      with newt as (
        select (e.value ->> 'goalId')::uuid as goal_id,
               coalesce((e.value ->> 'attempted')::int, 0) as attempted,
               coalesce((e.value ->> 'successful')::int, 0) as successful,
               coalesce((e.value ->> 'promptLevel')::int, 3) as prompt_level,
               nullif(e.value ->> 'note', '') as note
        from jsonb_array_elements(v_changes -> 'goalTrials') as e(value)
      ),
      oldt as (select * from public.goal_trials t where t.session_id = s.id)
      select coalesce(n.goal_id, o.goal_id) as goal_id, o.id as old_id,
             o.attempted as o_att, o.successful as o_suc, o.prompt_level::int as o_pl, o.note as o_note,
             n.goal_id as n_goal, n.attempted as n_att, n.successful as n_suc, n.prompt_level as n_pl, n.note as n_note
      from newt n full join oldt o on o.goal_id = n.goal_id
      order by 1
    loop
      if r.n_goal is null then
        delete from public.goal_trials where id = r.old_id;
        perform app.record_amendment(s.organization_id, s.id, 'goal_trial', r.old_id, 'goalTrials.' || r.goal_id,
          app.trial_text(r.o_att, r.o_suc, r.o_pl, r.o_note), '', v_reason);
        v_count := v_count + 1;
      elsif r.old_id is null then
        insert into public.goal_trials (session_id, goal_id, attempted, successful, prompt_level, note)
        values (s.id, r.n_goal, r.n_att, r.n_suc, r.n_pl, r.n_note) returning id into v_tid;
        perform app.record_amendment(s.organization_id, s.id, 'goal_trial', v_tid, 'goalTrials.' || r.goal_id,
          '', app.trial_text(r.n_att, r.n_suc, r.n_pl, r.n_note), v_reason);
        v_count := v_count + 1;
      elsif (r.o_att, r.o_suc, r.o_pl, r.o_note) is distinct from (r.n_att, r.n_suc, r.n_pl, r.n_note) then
        update public.goal_trials set attempted = r.n_att, successful = r.n_suc, prompt_level = r.n_pl, note = r.n_note
        where id = r.old_id;
        perform app.record_amendment(s.organization_id, s.id, 'goal_trial', r.old_id, 'goalTrials.' || r.goal_id,
          app.trial_text(r.o_att, r.o_suc, r.o_pl, r.o_note), app.trial_text(r.n_att, r.n_suc, r.n_pl, r.n_note), v_reason);
        v_count := v_count + 1;
      end if;
    end loop;
  end if;

  -- 4. Behaviour incidents (full list replaces the old one)
  if jsonb_typeof(v_changes -> 'incidents') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('type', i.type, 'durationSeconds', i.duration_seconds, 'antecedentTags', to_jsonb(i.antecedent_tags))
                    order by i.created_at, i.id), '[]'::jsonb)
      into v_old_json from public.behaviour_incidents i where i.session_id = s.id;
    v_new_json := v_changes -> 'incidents';
    if app.incidents_canonical(v_old_json) <> app.incidents_canonical(v_new_json) then
      delete from public.behaviour_incidents where session_id = s.id;
      insert into public.behaviour_incidents (session_id, type, duration_seconds, antecedent_tags)
      select s.id, (e.value ->> 'type')::public.incident_type, (e.value ->> 'durationSeconds')::int,
             app.jsonb_text_array(e.value -> 'antecedentTags')
      from jsonb_array_elements(v_new_json) with ordinality as e(value, ord)
      order by e.ord;
      perform app.record_amendment(s.organization_id, s.id, 'session', s.id, 'incidents',
        app.incidents_text(v_old_json), app.incidents_text(v_new_json), v_reason);
      v_count := v_count + 1;
    end if;
  end if;

  -- 5. Notes (partial)
  if jsonb_typeof(v_changes -> 'notes') = 'object' then
    insert into public.session_notes (session_id) values (s.id) on conflict (session_id) do nothing;
    select n.id into v_notes_id from public.session_notes n where n.session_id = s.id;
    for m in
      select * from (values
        ('subjective', 'subjective'), ('objective', 'objective'), ('assessment', 'assessment'),
        ('planNext', 'plan_next'), ('parentSummary', 'parent_summary'), ('planGoalIds', 'plan_goal_ids')
      ) as x(jkey, col)
    loop
      continue when not (v_changes -> 'notes' ? m.jkey) or jsonb_typeof(v_changes -> 'notes' -> m.jkey) = 'null';
      if m.col = 'plan_goal_ids' then
        execute 'select array_to_string(plan_goal_ids, '', '') from public.session_notes where id = $1' into v_old using v_notes_id;
        v_new := array_to_string(app.jsonb_text_array(v_changes -> 'notes' -> m.jkey), ', ');
        update public.session_notes set plan_goal_ids = app.jsonb_text_array(v_changes -> 'notes' -> m.jkey)::uuid[]
        where id = v_notes_id and plan_goal_ids is distinct from app.jsonb_text_array(v_changes -> 'notes' -> m.jkey)::uuid[];
      else
        execute format('select %I from public.session_notes where id = $1', m.col) into v_old using v_notes_id;
        v_new := v_changes -> 'notes' ->> m.jkey;
        execute format('update public.session_notes set %I = $1 where id = $2 and %I is distinct from $1', m.col, m.col)
          using v_new, v_notes_id;
      end if;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        perform app.record_amendment(s.organization_id, s.id, 'session_notes', v_notes_id, 'notes.' || m.jkey, v_old, v_new, v_reason);
        v_count := v_count + 1;
      end if;
    end loop;
  end if;

  if v_count = 0 then
    return app.session_result(s.id, false, '{}', app.mastery_suggestions(s.id));
  end if;
  update public.sessions set amendment_count = amendment_count + v_count where id = s.id;
  perform app.apply_session_metrics(s.id);
  perform app.recompute_following(s.id);
  v_alerts := app.check_session_alerts(s.id);
  return app.session_result(s.id, false, v_alerts, app.mastery_suggestions(s.id));
end
$$;
comment on function public.amend_session(uuid, jsonb, text) is
  'Change a session log (required after locked_at). Each changed field is recorded in amendments with the reason.';
