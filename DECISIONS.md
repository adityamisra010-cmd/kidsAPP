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
