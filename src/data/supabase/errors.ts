/**
 * Maps PostgREST / Postgres / Auth / Storage / network failures to RepoError codes.
 *
 * Contract with the database: app.raise(code) raises with message = RepoErrorCode and
 * SQLSTATE PT<http status> (PT401, PT403, PT404, PT409, PT422, PT423, PT428), see *_schema.sql.
 * Everything else is classified by SQLSTATE, PostgREST code, HTTP status or message.
 */
import { RepoError, type RepoErrorCode } from '../repository';

const REPO_CODES: ReadonlySet<string> = new Set<RepoErrorCode>([
  'not_authenticated',
  'forbidden',
  'not_found',
  'validation',
  'conflict',
  'locked',
  'offline',
  'otp_invalid',
  'otp_expired',
  'no_membership',
  'consent_required',
  'unknown',
]);

/** SQLSTATE / PostgREST codes → RepoError codes. */
const CODE_MAP: Record<string, RepoErrorCode> = {
  // app.raise()
  PT401: 'not_authenticated',
  PT403: 'forbidden',
  PT404: 'not_found',
  PT409: 'conflict',
  PT422: 'validation',
  PT423: 'locked',
  PT428: 'consent_required',
  // Postgres
  '42501': 'forbidden', // insufficient_privilege / RLS violation
  '23505': 'conflict', // unique_violation
  '23P01': 'conflict', // exclusion_violation
  '23503': 'validation', // foreign_key_violation
  '23502': 'validation', // not_null_violation
  '23514': 'validation', // check_violation
  '22P02': 'validation', // invalid_text_representation (bad uuid / enum)
  '22007': 'validation', // invalid_datetime_format
  '22008': 'validation', // datetime_field_overflow
  '22003': 'validation', // numeric_value_out_of_range
  '22023': 'validation', // invalid_parameter_value
  '22001': 'validation', // string_data_right_truncation
  // PostgREST
  PGRST116: 'not_found', // .single() matched 0 (or several) rows
  PGRST301: 'forbidden', // JWT could not be decoded / is invalid
  PGRST302: 'not_authenticated', // anonymous access disabled
  PGRST303: 'not_authenticated', // JWT expired / claims invalid
  PGRST202: 'not_found', // function not found
  PGRST204: 'validation', // column not found
  PGRST100: 'validation', // bad query string
  PGRST102: 'validation', // bad request body
};

const STATUS_MAP: Record<number, RepoErrorCode> = {
  400: 'validation',
  401: 'not_authenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'validation',
  415: 'validation',
  422: 'validation',
  423: 'locked',
  428: 'consent_required',
};

const NETWORK_RE = /network request failed|failed to fetch|fetch failed|networkerror|network error|load failed|timed? ?out|econn|enotfound|eai_again|socket hang up|aborted/i;

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  details?: unknown;
  hint?: unknown;
  originalError?: unknown;
  __isAuthError?: unknown;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function asObject(e: unknown): ErrorLike | null {
  return e && typeof e === 'object' ? (e as ErrorLike) : null;
}

function isNetworkError(e: ErrorLike, status: number | undefined): boolean {
  const name = str(e.name);
  if (name === 'AuthRetryableFetchError' || name === 'FunctionsFetchError') return true;
  if (status === 0) return true;
  const text = `${name} ${str(e.message)}`;
  if (name === 'TypeError' || name === 'FetchError' || name === 'AbortError') return NETWORK_RE.test(text) || name === 'AbortError';
  if (name === 'StorageUnknownError') {
    const inner = asObject(e.originalError);
    return !!inner && NETWORK_RE.test(`${str(inner.name)} ${str(inner.message)}`);
  }
  // PostgREST wraps fetch failures as { message: 'TypeError: Network request failed', code: '' }.
  return str(e.code) === '' && NETWORK_RE.test(str(e.message)) && /error/i.test(str(e.message));
}

/** Supabase Auth (GoTrue) error codes → RepoError codes. */
function authCode(code: string, message: string, status: number | undefined): RepoErrorCode | null {
  switch (code) {
    case 'otp_expired':
      // GoTrue uses otp_expired for both a wrong and an expired code ("Token has expired or is
      // invalid"). A mistyped code is far more common, so only a pure "expired" maps to expired.
      return /invalid/i.test(message) ? 'otp_invalid' : 'otp_expired';
    case 'invalid_credentials':
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'bad_jwt':
    case 'no_authorization':
    case 'user_not_found':
      return 'not_authenticated';
    case 'email_not_confirmed':
    case 'phone_not_confirmed':
    case 'user_banned':
    case 'not_admin':
      return 'forbidden';
    case 'validation_failed':
    case 'email_address_invalid':
    case 'weak_password':
    case 'bad_json':
      return 'validation';
    case 'request_timeout':
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
      return 'offline';
    case 'conflict':
    case 'phone_exists':
    case 'email_exists':
    case 'user_already_exists':
      return 'conflict';
    default:
      break;
  }
  if (/token has expired or is invalid|invalid otp|otp.*invalid/i.test(message)) return 'otp_invalid';
  if (/expired/i.test(message) && /otp|token|code/i.test(message)) return 'otp_expired';
  if (/invalid login credentials/i.test(message)) return 'not_authenticated';
  if (/invalid phone|phone number.*invalid|unable to validate phone/i.test(message)) return 'validation';
  if (status === 429) return 'unknown';
  return null;
}

/** Normalises anything thrown by supabase-js (or returned in `{ error }`) into a RepoError. */
export function toRepoError(e: unknown, fallbackStatus?: number): RepoError {
  if (e instanceof RepoError) return e;
  const err = asObject(e);
  if (!err) return new RepoError('unknown', typeof e === 'string' ? e : undefined);

  const message = str(err.message);
  const code = str(err.code);
  const status = typeof err.status === 'number' ? err.status : fallbackStatus;
  const details: Record<string, unknown> = {};
  if (code) details.code = code;
  if (str(err.details)) details.details = str(err.details);
  if (str(err.hint)) details.hint = str(err.hint);
  if (status != null) details.status = status;
  const make = (c: RepoErrorCode) => new RepoError(c, message || c, Object.keys(details).length ? details : undefined);

  if (isNetworkError(err, status)) return make('offline');

  const isAuth = err.__isAuthError === true || /^Auth/.test(str(err.name));
  if (isAuth) {
    if (/SessionMissing|InvalidToken|RefreshToken/i.test(str(err.name))) return make('not_authenticated');
    const mapped = authCode(code, message, status);
    if (mapped) return make(mapped);
  }

  // app.raise(): the message IS the code (P0001 fallback, or PT4xx with a custom detail).
  if (REPO_CODES.has(message)) {
    const c = message as RepoErrorCode;
    return new RepoError(c, str(err.details) || c, Object.keys(details).length ? details : undefined);
  }
  if (code && CODE_MAP[code]) return make(CODE_MAP[code]);
  if (/row-level security/i.test(message)) return make('forbidden');
  if (/\blocked\b/i.test(message)) return make('locked');

  // Storage errors carry the HTTP status as a number or a string statusCode.
  const statusNum = status ?? (str(err.statusCode) ? Number(err.statusCode) : undefined);
  if (statusNum != null && STATUS_MAP[statusNum]) return make(STATUS_MAP[statusNum]);
  if (/jwt expired|invalid jwt|not authenticated/i.test(message)) return make('not_authenticated');
  return make('unknown');
}
