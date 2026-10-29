# My Kid's Tracker (working name)

An Android app for special schools and child development centres in India. It replaces Excel sheets, WhatsApp and phone calls for therapy schedules, session records and parent home practice.

- **Every session is scored the same way by every therapist.** There are 8 dimensions, each with written descriptions for scores 1–5, plus goal trials. The app compares each session with the last one and with the 4-session average.
- **Substitutes get a one-screen Handover Brief** before the session, so continuity doesn't depend on reading old notes.
- **Parents see the next appointment, a plain-language session summary and this week's home tasks**, and can log practice with a short video.
- **Admins import their existing Excel sheets**, manage schedules and substitutes, and export PDF progress reports.

Placeholder brand: orange and beige, "My Kid's Tracker". Rebrand in `src/theme/brand.json` and `assets/brand/` (see [Rebranding](#rebranding)).

---

## Quick start

```bash
npm install
npx expo start            # dev server (needs a development build; see below)
npm run check             # typecheck + lint + unit tests
npm run test:db           # Postgres RLS + metrics parity tests (local Postgres, no Docker)
npm run build:apk         # signed release APK at dist/mykids-tracker-v0.1.0.apk
```

Requirements: Node 22+, JDK 17 and the Android SDK (`ANDROID_HOME`) for APK builds, and Postgres server binaries for `test:db` (`initdb`, `pg_ctl`; any recent version).

The app uses native modules (SQLite, video compression, notifications), so use a **development build**, not Expo Go:

```bash
npx expo run:android      # builds and installs a debug build on a connected phone/emulator
```

## Demo Mode (no backend needed)

The app runs fully on seeded, realistic data when no Supabase credentials are set. Tap **Try the demo** on the welcome screen and pick a role:

| Role | Person | What to try |
|---|---|---|
| Parent | Priya Sharma, mother of Aarav (8) and Anaya (5) | Next session, plain-language summary of the last session, log home practice with a video, message the care team |
| Therapist | Riya Menon, Speech Therapist | Today's sessions, read a Handover Brief (one session is a substitute session), log a session, review parent videos |
| School Admin | Sunita Bansal, Centre Head | Dashboard, schedule, substitutes, Excel import, PDF reports, school settings |
| Coordinator | Dr. Meera Iyer, Clinical Lead | Alerts, cover for a therapist on leave, reschedule requests |
| Platform Admin | Kabir Anand | All partner schools at a glance, global templates |

How the demo behaves:
- **Anvaya Child Development Centre** (Noida) and **Sahaj Therapy & Learning Centre** (Bengaluru) are fictional.
- Data is generated relative to today, so there are always sessions "today".
- Changes last until the app restarts. You can switch roles from **More → Switch demo role**, and data entered as one role is visible to the others. For example, log a session as Riya, then switch to Priya to see the parent summary.
- Demo sign-in shortcuts: phone code `123456`, staff password `Demo@1234`.

## Environment variables

Copy `.env.example` to `.env`.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Real backend. If empty, the app is demo-only. |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional crash reporting (no SDK is bundled by default; see `src/lib/errorReporting.ts`) |
| `ANDROID_PACKAGE` | Override the Android application id (default `com.mykidstracker.app`) |
| `GOOGLE_SERVICES_JSON` | Path to Firebase `google-services.json` for remote push (FCM) |
| `MYKIDS_KEYSTORE_PATH`, `MYKIDS_KEYSTORE_PASSWORD`, `MYKIDS_KEY_ALIAS`, `MYKIDS_KEY_PASSWORD` | Release signing (see [Signing](#signing)) |

Never put the Supabase **service_role** key in the app or in `.env`.

## Connecting the real backend (Supabase)

1. Create a Supabase project in the **Mumbai (ap-south-1)** region.
2. Install the Supabase CLI. Then run `supabase login`, then `supabase link --project-ref <ref>`.
3. Push the schema, security rules, metrics functions and storage buckets:
   ```bash
   supabase db push
   ```
4. Optional demo data: run `npm run seed:sql` (regenerates `supabase/seed.sql` so "today" has sessions), then run it in the SQL editor or with `psql`. Upload `assets/demo/practice-1..3.mp4` to the `media` bucket at the paths listed in the file's header. Demo logins then work on the real backend (staff password `Demo@1234`). `npm run test:db:seed` checks the seed loads cleanly against the migrations.
5. Deploy the Edge Functions and their schedules (see `supabase/functions/README.md`):
   - `send-push`
   - `reminders`
   - `media-retention`
6. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` and rebuild the app.
7. **SMS login codes.** Configure MSG91 or Twilio under Auth → Providers → Phone. Indian business SMS needs DLT registration (sender ID plus an approved template). While DLT is pending, use the `[auth.sms.test_otp]` numbers in `supabase/config.toml` or staff email sign-in.

Security model:
- Every table has row-level security keyed on `organization_id`.
- Parents read session data only through security-checked database functions (`parent_session_snapshot(s)`, `parent_goals`, `parent_progress`). These never return internal notes.
- Clinical data lives in a separate `child_clinical` table.
- `npm run test:db` proves that schools are isolated from each other, that parents and therapists only see what they should, that logs lock after 24 hours, and that the SQL metrics match the TypeScript metrics.

## Building the APK

```bash
source /path/to/keystore.env      # signing variables, kept outside the repo
npm run build:apk
```

The script runs `expo prebuild --platform android --clean` and then `./gradlew assembleRelease`. It copies the result to `dist/mykids-tracker-v0.1.0.apk` and prints the package name, version, minimum SDK and signer. The build contains ARM 64-bit and 32-bit code (all real phones, including older budget models) and needs Android 8.0 (API 26) or newer.

Gradle needs JDK 17 (React Native's Gradle plugin compiles with a Java 17 toolchain). The script picks up `/usr/lib/jvm/java-17*` automatically.

**Restricted networks.** If Maven Central rate-limits you (HTTP 429) or JitPack is blocked, see `docs/BUILD_TROUBLESHOOTING.md`.

### Signing

Release builds are signed with the keystore given by the `MYKIDS_*` variables. The keystore must **never** be committed (`*.keystore` and `*.jks` are gitignored). Without the variables, the build falls back to the debug key.

Create a release key:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore mykids-release.keystore -alias mykids \
  -keyalg RSA -keysize 2048 -validity 10000
```

**Back it up in two places**, for example a password manager plus an encrypted drive. Every future update on the Play Store must be signed with the same key. If you lose it, you can't update the app.

v0.1.0 is signed with a **demo key** meant for pitching. Create the real key on your own machine before the Play Store release.

## Project layout

```
src/app/            Expo Router routes (thin): (auth)/, (app)/parent|therapist|admin|platform tabs, shared screens
src/features/       Feature screens and logic: session (logger, brief), calendar, children, goals, progress,
                    practice, checkins, resources, messages, notifications, home, today, dashboard, platform,
                    reports, import, school, onboarding, account, push
src/ui/             Design system (Screen, Text, Card, Button, Chip, Sheet, pickers, states…)
src/theme/          Tokens (light/dark), brand.json, makeStyles
src/domain/         Types, constants (rating scales, chips), metrics engine, pure derivations
src/data/           Repository contract, Demo adapter, Supabase adapter, offline outbox, query client
src/i18n/           English + Hindi (one namespace per feature; Hindi is machine-drafted, marked for review)
supabase/           Migrations (schema, RLS, metrics, storage, RPCs), Edge Functions, config
scripts/            build-apk.sh, test-db.sh, brand asset generator, seed generator
CSV_TEMPLATES/      Excel/CSV import templates + column guide
docs/               CONVENTIONS.md, BUILD_TROUBLESHOOTING.md
```

Docs: [DECISIONS.md](DECISIONS.md), [PROGRESS.md](PROGRESS.md), [TEST_PLAN.md](TEST_PLAN.md), [PRIVACY_NOTES.md](PRIVACY_NOTES.md), [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Rebranding

1. Edit `src/theme/brand.json`: app name, tagline, colours, support email, privacy URL, Android package.
   The Android package can't change after the first Play Store release.
2. Replace the images in `assets/brand/`, or regenerate the placeholders with `python3 scripts/generate-brand-assets.py assets/brand`.
3. Adjust the colour tokens in `src/theme/tokens.ts` if needed. Every screen reads colours from there.

## Offline behaviour

- Session logs, parent practice logs and check-ins are saved to an on-device SQLite queue when the phone is offline, then synced in order when it reconnects.
- The sync badge shows what is waiting, and failed items can be retried.
- Videos are compressed on the phone to 720p and at most 60 seconds, then uploaded in the background. There is an optional "Wi-Fi only" setting.
