/**
 * Crash/error reporting hook-in. No third-party SDK ships by default (privacy-first, DPDP).
 * To enable Sentry later: add @sentry/react-native, set EXPO_PUBLIC_SENTRY_DSN, and initialise
 * it in `initErrorReporting`. Until then errors are only logged locally.
 */
export function initErrorReporting() {
  // Intentionally a no-op unless a reporting SDK is added (see DECISIONS.md).
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) console.warn('[error]', error, context ?? '');
}
