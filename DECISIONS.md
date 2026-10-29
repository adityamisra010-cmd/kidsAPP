# Decisions

One line per decision: what, and why. Newest at the bottom of each section.

## Product
- **Placeholder name "My Kid's Tracker"**, package `com.mykidstracker.app`. Centralised in `src/theme/brand.ts`; rename later in one place. Package id must be final before Play Store.
- **Orange + beige theme** replaces the spec's navy/teal (owner preference). Burnt orange `#B85418` for buttons (passes WCAG AA with white text); bright orange `#F08A3C` only for highlights, never text.
- **No growth percentages for parents.** Parent views use words + arrows ("Focus: better than last time ↑"); numeric 0–100 score stays staff-only unless a school turns it on.
- **Parents request changes, they don't self-book.** "Book appointment" from the mockup became "Request a change" (2 slots + reason) because schools own the roster.
- **Five demo personas** (Parent, Therapist, Coordinator, School Admin, Platform Admin) instead of three: more useful when pitching to school heads.
- **Values 2 and 4 on every rating scale get their own anchor text**, not just 1/3/5, so every tap has a concrete description.
- **Rolling average needs 2+ previous sessions**; with only one it would just repeat "vs last session".

## Tech
- **Expo SDK 58 (RN 0.88, React 19.3)**, the latest stable at build time.
- **StyleSheet + typed theme tokens instead of NativeWind.** NativeWind v4 has no confirmed support for SDK 58 / RN 0.88 (v5 is an RC built for SDK 57), and runtime styling could not be verified without a device. A styling failure would break every screen, so we use a zero-dependency token system (`src/theme`). Tokens stay in one file, so a later move to NativeWind is mechanical.
- **React Compiler and typed routes disabled** for stability with react-hook-form and to keep typecheck independent of the dev server.
- **Video capture uses the system camera via expo-image-picker** (60 s cap) instead of a custom expo-camera screen: familiar UI for parents, fewer permissions and failure modes.
- **Sentry not bundled.** `src/lib/errorReporting.ts` is the hook-in point and stays a no-op unless `EXPO_PUBLIC_SENTRY_DSN` is set and the SDK is added. Keeps the APK free of third-party trackers by default (DPDP).
- **Release signing via a config plugin** (`plugins/withReleaseSigning.js`) reading `MYKIDS_*` env vars; keystore lives outside the repo. ABIs arm64-v8a + armeabi-v7a; native libs compressed (`useLegacyPackaging`) for a smaller APK to share.
- **JitPack stand-in (build environment only):** the v0.1.0 APK was built where jitpack.io is blocked; an unused MP3-encoder dependency of react-native-compressor was replaced by a no-op stub (video compression unaffected). Normal builds use the real library. See docs/BUILD_TROUBLESHOOTING.md.
- **Online saves go straight to the backend; the outbox is the offline fallback.** Validation problems (e.g. locked log) show on the form instead of as a failed sync later.
- **Trend slope rounded to 6 decimals** in both TS and SQL so float noise (−2.4999999…) can't flip "declining" to "steady".

## Product details decided during the build
- Parent Home shows one full check-in card (active child); other children get a compact "Also check in for …" row.
- A child's overall trend is computed per therapy type (scores across therapies are not comparable); an open score-drop alert always reads as declining.
- Logger: no ratings are pre-filled (avoids bias); planned goals from the last plan are pre-added at 0 tries and not saved unless tried; goal prompt level defaults to the session's Independence rating; "Compared to last session" defaults to "Same" when skipped.
- Logs can be written from 12 hours before the start (same rule in demo and server) and are editable by the author for 24 hours, then only amendable with a reason (author, coordinator, admin). Amendments are online-only (they are audit records).
- Substitutes must tap "I've read this" on the Handover Brief before Log is enabled. Substitutes see About Me + goals but no clinical data or family phone numbers.
- Parent wording: "Getting better / Steady / Finding it harder lately", goal status "Working on it / Getting there / Achieved"; attendance as counts; home-practice completion % is shown (a plain count). "Partly" counts as practised; "Couldn't do" uses a neutral colour.
- Video: > 61 s rejected (1 s camera tolerance); compressed copy kept in app documents until uploaded; withdrawn video consent hides the video option. Consent screen records the video choice per child (yes or no) for an audit trail.
- Reminders: parents get 24 h + 1 h reminders; therapists get one 8 AM agenda plus a reminder only when a brief must be read; anything in quiet hours (9 PM–8 AM) moves to 8 AM (or 8:30 PM the evening before). Notification content hidden on the lock screen.
- Calendar: parents see all their children by default; cancelled sessions stay in lists (struck through) but get no dot; "This and all future" changes time/therapist, not weekdays; only the session's own therapist logs it.
- Reschedule: declining requires a note; counters propose up to 2 slots the parent can accept.
- Import: day-first dates, 1:00–6:59 without AM/PM read as afternoon, duplicate rows in a file keep the first; "Did you mean …?" fixes apply to every row with that name; coordinators can import schedules only.
- Reports: "For parents" + "Last month" are the defaults (what gets handed out at meetings); parents always get the parent copy; at least 3 rating scales must stay enabled.
- Coordinators see school settings read-only; only School Admins can invite another School Admin.
- Dashboard "Remind" for unlogged sessions shows a confirmation; the server-side reminder job (`reminders` Edge Function) does the actual nudging.
