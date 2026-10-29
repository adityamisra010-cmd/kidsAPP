# Progress

Build order: Phase 1 (pitch APK first), then Phase 2. Everything below is on branch `feat/mykids-tracker-v0.1`.

| Milestone | Status | Known gaps |
|---|---|---|
| M0 Scaffold | Done | — |
| M1 Auth, tenancy, roles, RLS | Done | Phone OTP needs MSG91/Twilio + DLT approval before real use; Expo push token needs an EAS projectId + FCM `google-services.json`. |
| M2 Seed data | Done | Demo adapter + `supabase/seed.sql` (same dataset, about 13.9k rows; `npm run test:db:seed` verifies it loads and scopes correctly). Regenerate before seeding. |
| M3 Child profile, goals, goal bank | Done | — |
| M4 Calendar & appointments | Done | Series are summarised from occurrences (no `getSeries` API yet); calendar month/day names are English in Hindi mode. |
| M5 Session Logger, metrics, Handover Brief | Done | — |
| M6 Progress views | Done | Charts verified on web build only; check on a phone. |
| M7 Home Practice loop | Done | Therapists attach a library resource as the demo (no in-app recording for task demos yet). |
| M8 Messaging, announcements, notifications | Done | Local reminders work without a server; remote push needs FCM + deployed `send-push`. |
| M9 Dashboards | Done | Dashboard "Remind" relies on the `reminders` Edge Function (no per-click push API). |
| M10 Reports, exports, CSV/XLSX import | Done | Logo upload to storage not wired (logo stays on the device in Supabase mode). |
| M11 Polish (Hindi, a11y, dark mode) | Done | Hindi is machine-drafted (`_review` marker): needs a native reviewer. |
| M12 APK | Done | Built with a demo signing key; create the real key before Play Store. |
| M13 Handover docs | Done | README, TEST_PLAN, PRIVACY_NOTES, CSV_TEMPLATES, DECISIONS, docs/. |

## Verification
- `npm run check`: typecheck, lint and 814 unit/component tests pass.
- `npm run test:db`: 247 database checks pass (tenant isolation, parent/therapist scoping, log lock + amendments, storage policies, metric parity SQL ↔ TypeScript).
- Web build walkthrough of every role (screenshots reviewed), including a full session log saved end to end.
- Release APK built, signed and inspected with `aapt`/`apksigner`.

## Honest gaps
- **Not run on a physical phone or emulator** in the build environment (no hardware virtualisation). Run TEST_PLAN.md on a real device.
- **Supabase (test project)**: migrations applied, demo data loaded and the adapter verified live (staff sign-in, Today, brief, caseload, progress, reviews, admin dashboard, saving a session with server-side metrics; RLS checks for parents/anonymous). Not yet verified live: parent phone sign-in (phone provider disabled on the project), Edge Functions (not deployed), real SMS/push. The test project is in Tokyo (ap-northeast-1); production should be a new project in Mumbai (ap-south-1).
- Real SMS OTP, FCM push and Sentry are configured by env vars but untested without accounts.
- Hindi strings need human review.
