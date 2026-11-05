# Engineering conventions

Read this before writing app code. It keeps parallel work consistent.

## Stack
Expo SDK 58 · React Native 0.88 · React 19.3 · TypeScript strict · Expo Router (routes in `src/app/`) ·
TanStack Query · Zustand · i18next · react-hook-form + zod · react-native-svg · lucide-react-native icons ·
react-native-calendars · react-native-gifted-charts. **No NativeWind** (see DECISIONS.md): style with theme tokens.

## Folder map
- `src/app/` route files only. Keep them thin: `export default function Screen() { return <FeatureScreen …/> }`.
- `src/features/<area>/` screens, feature components, `queries.ts` (TanStack hooks), pure helpers + tests.
- `src/components/` cross-feature components (cards used by several screens). Each file states its owner.
- `src/ui/` design system (import from `@/ui`). `src/theme/` tokens + `makeStyles` + `useTheme`.
- `src/domain/` types, constants, metrics (pure). `src/data/` repository contract, adapters, outbox, query client.
- `src/state/` Zustand stores (`useSession`, `useActive`, `usePreferences`) and `auth-actions.ts`.
- `src/i18n/locales/{en,hi}/<namespace>.json` translations.

## Data
- Screens never import adapters. Use `useRepo()` from `@/data` and wrap calls in TanStack hooks:
  `useQuery({ queryKey: key('appointments', 'list', filter), queryFn: () => repo.appointments.list(filter) })`.
- Query keys MUST start with a `KeyRoot` (see `src/data/queryClient.ts`). After mutations call
  `invalidate('sessions', 'dashboards', …)` for every area the write affects.
- Shared read hooks: `src/data/hooks.ts` (`useOrg`, `useTherapyTypes`, `useRatingDimensions`, `useMembers`,
  `useChildren`, `useChildDetail`, `useGoals`, `useAppointment`, `useUpcoming`, `useUnreadCounts`).
- Active user/role/school/child: `useActive()` / `useRequiredActive()` from `@/state/session`.
- Writes that must survive no-network (session logs, home logs, check-ins, video uploads) go through the outbox:
  `registerOutboxHandler(kind, handler)` once at module load, `enqueue(kind, payload, label)` from the screen.
  Show `<SyncBadge />` where those writes happen.
- Errors are `RepoError` with a `code`; show `t('errors:<code>')`. `ErrorState` / `QueryView` do this for you.

## UI rules (calm, accessible, premium)
- Use `@/ui` building blocks: `Screen`, `Text`, `Stack`/`Row`, `Card`, `Button`, `Chip`/`ChipGroup`, `Badge`,
  `Avatar`, `ListItem`, `SectionHeader`, `SegmentedControl`, `Stepper`, `ProgressBar`, `SwitchRow`,
  `TextField`/`FormTextField`, `DateField`/`TimeField`, `Sheet`, `toast`, `confirm`, `QueryView`,
  `SkeletonList`, `EmptyState`, `ErrorState`, `TrendIndicator`, `Delta`, `Sparkline`, `SyncBadge`, `Icon`.
- Colours ONLY from `useTheme().colors` / `makeStyles`. Never hard-code hex (therapy-type colours come from data).
- Touch targets ≥ 48dp. Body text 16 (parent views never smaller than 16 for content).
- **Icons always come with words.** Icon-only allowed for back/close (`IconOnlyButton`). Header actions use
  `LabeledIconButton`. Status = icon + word, never colour alone.
- Every interactive element has an accessibility label/role. Respect font scaling (don't fix heights on text).
- Loading → skeletons; empty → `EmptyState` with a clear next action; errors → `ErrorState` with retry.
- Motion subtle and only via reanimated; check `useTheme().reduceMotion`. No bouncing/confetti (one restrained
  "Goal mastered" moment is allowed).
- Illustrations only in empty states. Light + dark must both look right (tokens handle it).
- Parents never see the 0–100 Session Score unless `org.settings.parentsSeeNumericScore`. Use words + arrows.
- Indian context: names, ₹ not needed, dates like "Mon, 24 May", times "10:30 AM". Use `src/lib/dates.ts` helpers.

## i18n
- Every user-facing string uses `t()`. Your namespace(s) are listed in your brief; write keys in BOTH
  `en/<ns>.json` and `hi/<ns>.json` (machine-drafted Hindi is fine; keep the `_review` marker).
- Cross-namespace: `t('common:actions.save')`. Chips/dimensions/therapy types: `chipLabel`, `vocabLabel`,
  `therapyTypeLabel`, `dimensionText` from `@/i18n/labels`.
- Plain, warm, practical language. No hype ("seamless", "unlock", "elevate"). No forced Hinglish.

## Code
- TypeScript strict, no `any` (justify in a comment if truly unavoidable). Small files (< ~350 lines).
- Pure logic in `.ts` helpers with Jest tests (`src/features/<area>/__tests__/`). RNTL v14: `await render(...)`.
- Keep web-safe: guard native-only APIs (`Platform.OS !== 'web'`) or use `.web.ts` stubs.
- Checks: `npx tsc --noEmit`, `npx eslint <your paths>`, `npx jest <your paths>`.
