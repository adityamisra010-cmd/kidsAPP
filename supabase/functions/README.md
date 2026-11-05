# Edge Functions

Three scheduled functions. All of them run with the service-role key and refuse any caller that
does not present `CRON_SECRET` (header `x-cron-secret`) or the service-role key as a Bearer
token. `verify_jwt` is off for them in `supabase/config.toml` for that reason.

| Function | What it does | Schedule |
|---|---|---|
| `send-push` | Sends pending `notifications` rows to the user's devices through the Expo push API. Skips muted kinds (`notification_mutes`), holds non-urgent pushes during the school's quiet hours (IST, default 21:00–08:00) and delivers them afterwards. Schedule changes (`appointment_changed`, `substitute_assigned`, `reschedule_response`) and urgent announcements ignore both. Deletes tokens Expo reports as `DeviceNotRegistered`. | every minute |
| `reminders` | Calls `public.enqueue_reminders()`: 24 h / 1 h appointment reminders to parents (per school `reminderHoursBefore`), the therapist's 08:00 agenda (`dailyAgendaTime`), and unlogged-session reminders 24 h after the session (`logLockHours`) with an alert and notification for the coordinator. Then triggers `send-push`. Re-runs never send anything twice (dedupe keys). | every 15 minutes |
| `media-retention` | Deletes `media` rows past `expires_at` (set from the school's `videoRetentionDays`, default 180) and their files in the private `media` bucket. | daily, 03:00 IST |

Shared code is in `_shared/runtime.ts`. The SQL routine behind `reminders` is covered by
`npm run test:db`.

## Secrets

```bash
supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
supabase secrets set EXPO_ACCESS_TOKEN=...      # optional: Expo "enhanced push security" token
supabase secrets set PUSH_PRIVACY_MODE=generic  # optional: neutral push text, details stay in the app
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically on the hosted platform.

## Deploy

```bash
supabase functions deploy send-push
supabase functions deploy reminders
supabase functions deploy media-retention
```

## Schedule

### Option A: Supabase Cron (pg_cron + pg_net), recommended

Enable the `pg_cron` and `pg_net` extensions (Dashboard → Database → Extensions), store the
secret in Vault once, then create the jobs. Replace `<project-ref>`.

```sql
select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');

create or replace function public.invoke_edge_function(p_name text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
$$;
revoke execute on function public.invoke_edge_function(text) from public, anon, authenticated;

select cron.schedule('send-push',       '* * * * *',    $$ select public.invoke_edge_function('send-push') $$);
select cron.schedule('reminders',       '*/15 * * * *', $$ select public.invoke_edge_function('reminders') $$);
-- 21:30 UTC = 03:00 IST
select cron.schedule('media-retention', '30 21 * * *',  $$ select public.invoke_edge_function('media-retention') $$);
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 20;` and
remove a job with `select cron.unschedule('send-push');`.

### Option B: Dashboard

Dashboard → Integrations → Cron → "Create job" → type "Supabase Edge Function", pick the
function, set the schedule above and add the header `x-cron-secret: <CRON_SECRET>`.

### Without Edge Functions (reminders only)

`enqueue_reminders()` is plain SQL, so it can also be scheduled directly:
`select cron.schedule('reminders-sql', '*/15 * * * *', $$ select public.enqueue_reminders() $$);`
(push delivery still needs `send-push`).

## Local testing

```bash
supabase start
supabase functions serve --env-file supabase/.env   # contains CRON_SECRET=local-secret
curl -X POST http://127.0.0.1:54321/functions/v1/reminders -H 'x-cron-secret: local-secret'
```

## Not included

- An MSG91 "Send SMS" auth hook. Supabase has no native MSG91 provider; see the commented
  `[auth.hook.send_sms]` block in `supabase/config.toml` for how to wire one up.
