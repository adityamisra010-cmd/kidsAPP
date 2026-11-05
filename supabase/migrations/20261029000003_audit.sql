-- =============================================================================
-- 20261029000003_audit.sql — audit trail and About Me edit history
--
-- Intent
--   * audit_log: one row per insert/update of clinical records (child_profiles, child_clinical,
--     goals, sessions, session_notes) and per child deletion. meta.fields lists the changed
--     columns — values are deliberately NOT copied, so the audit log never becomes a second
--     store of clinical text. Metric recomputation on sessions is not audited (derived data).
--   * profile_edits: field-level history of About Me (and clinical, prefixed "clinical.") with
--     old/new display values. Same audience as the clinical data itself (see RLS).
--   Both tables are written only by these SECURITY DEFINER triggers; no API write policies exist.
-- =============================================================================

-- snake_case -> camelCase (matches the TS field names used by the app)
create or replace function app.camel(p text) returns text
language sql immutable as $$
  select lower(left(p, 1)) || substr(replace(initcap(replace(p, '_', ' ')), ' ', ''), 2)
$$;

-- Top-level keys of a jsonb object to camelCase (RPC payloads).
create or replace function app.camel_keys(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(app.camel(e.key), e.value), '{}'::jsonb) from jsonb_each(p) e
$$;

-- Human-readable value for edit history: arrays become "a, b, c".
create or replace function app.jsonb_display(p jsonb) returns text
language sql immutable as $$
  select case jsonb_typeof(p)
    when 'array' then coalesce((
      select string_agg(e.v, ', ' order by e.ord) from jsonb_array_elements_text(p) with ordinality as e(v, ord)
    ), '')
    when 'string' then p #>> '{}'
    when 'null' then ''
    else coalesce(p::text, '')
  end
$$;

create or replace function app.set_updated_by() returns trigger
language plpgsql as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end
$$;

create trigger d_updated_by before update on public.child_profiles
  for each row execute function app.set_updated_by();
create trigger d_updated_by before update on public.child_clinical
  for each row execute function app.set_updated_by();

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_ignore text[] := array['updated_at', 'updated_by'];
  v_fields text[];
  v_meta jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'sessions' then
    -- derived columns maintained by the metrics routines
    v_ignore := v_ignore || array[
      'session_score', 'goal_accuracy', 'delta_last', 'delta_rolling', 'rolling_average', 'trend',
      'dimension_metrics', 'incident_count', 'amendment_count', 'payload_hash'
    ];
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_fields
    from jsonb_each(v_new) n
    join jsonb_each(v_old) o using (key)
    where n.value is distinct from o.value and not (n.key = any (v_ignore));
    if v_fields is null then
      return null;
    end if;
    v_meta := jsonb_build_object('fields', to_jsonb(v_fields));
    if tg_table_name = 'goals' and v_new ->> 'status' is distinct from v_old ->> 'status' then
      v_meta := v_meta || jsonb_build_object('fromStatus', v_old ->> 'status', 'toStatus', v_new ->> 'status');
    end if;
  end if;

  if tg_op = 'DELETE' and not exists (
    select 1 from public.organizations o where o.id = (v_row ->> 'organization_id')::uuid
  ) then
    return null; -- the whole school is being deleted
  end if;

  v_meta := v_meta || jsonb_strip_nulls(jsonb_build_object(
    'childId', coalesce(v_row ->> 'child_id', case when tg_table_name = 'children' then v_row ->> 'id' end),
    'sessionId', v_row ->> 'session_id'
  ));

  insert into public.audit_log (organization_id, actor_id, action, entity, entity_id, meta)
  values ((v_row ->> 'organization_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid, v_meta);
  return null;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['child_profiles', 'child_clinical', 'goals', 'sessions', 'session_notes'] loop
    execute format('create trigger z_audit after insert or update on public.%I
                    for each row execute function app.audit_row()', t);
  end loop;
end
$$;

create trigger z_audit_delete after delete on public.children
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- profile_edits (About Me + clinical field history)
-- ---------------------------------------------------------------------------
create or replace function app.record_profile_edits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text := case when tg_table_name = 'child_clinical' then 'clinical.' else '' end;
  r record;
begin
  for r in
    select n.key, o.value as old_value, n.value as new_value
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
    where n.key not in ('id', 'organization_id', 'child_id', 'created_at', 'updated_at', 'created_by', 'updated_by')
      and n.value is distinct from o.value
    order by n.key
  loop
    insert into public.profile_edits (organization_id, child_id, field, old_value, new_value, "by", at)
    values (
      new.organization_id, new.child_id, v_prefix || app.camel(r.key),
      app.jsonb_display(r.old_value), app.jsonb_display(r.new_value), auth.uid(), now()
    );
  end loop;
  return null;
end
$$;

create trigger y_profile_edits after update on public.child_profiles
  for each row execute function app.record_profile_edits();
create trigger y_profile_edits after update on public.child_clinical
  for each row execute function app.record_profile_edits();
