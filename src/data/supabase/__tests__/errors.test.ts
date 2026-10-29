import { RepoError } from '../../repository';
import { toRepoError } from '../errors';

const code = (e: unknown, status?: number) => toRepoError(e, status).code;

describe('toRepoError', () => {
  it('passes RepoError through unchanged', () => {
    const e = new RepoError('locked', 'x');
    expect(toRepoError(e)).toBe(e);
  });

  it('maps app.raise() SQLSTATEs (PT4xx) and keeps the detail as message', () => {
    expect(code({ code: 'PT401', message: 'not_authenticated' })).toBe('not_authenticated');
    expect(code({ code: 'PT403', message: 'forbidden', details: 'only coordinators' })).toBe('forbidden');
    expect(code({ code: 'PT404', message: 'not_found' })).toBe('not_found');
    expect(code({ code: 'PT409', message: 'conflict' })).toBe('conflict');
    expect(code({ code: 'PT422', message: 'validation' })).toBe('validation');
    const locked = toRepoError({ code: 'PT423', message: 'locked', details: 'this log is locked; use amend_session with a reason' });
    expect(locked.code).toBe('locked');
    expect(locked.message).toMatch(/amend_session/);
    expect(code({ code: 'PT428', message: 'consent_required' })).toBe('consent_required');
  });

  it('maps a P0001 whose message is a RepoErrorCode', () => {
    expect(code({ code: 'P0001', message: 'no_membership' })).toBe('no_membership');
  });

  it('maps Postgres and PostgREST codes', () => {
    expect(code({ code: '42501', message: 'new row violates row-level security policy for table "children"' })).toBe('forbidden');
    expect(code({ code: 'PGRST301', message: 'JWSError' })).toBe('forbidden');
    expect(code({ code: 'PGRST303', message: 'JWT expired' })).toBe('not_authenticated');
    expect(code({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe('not_found');
    expect(code({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe('conflict');
    expect(code({ code: '23503', message: 'insert or update violates foreign key constraint' })).toBe('validation');
    expect(code({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe('validation');
  });

  it('recognises network failures as offline', () => {
    expect(code({ message: 'TypeError: Network request failed', details: '', hint: '', code: '' }, 0)).toBe('offline');
    expect(code({ message: 'TypeError: Network request failed', code: '' })).toBe('offline');
    expect(code(Object.assign(new TypeError('Network request failed')))).toBe('offline');
    expect(code({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe('offline');
    expect(code({ name: 'StorageUnknownError', message: 'x', originalError: new TypeError('Network request failed') })).toBe('offline');
  });

  it('maps Supabase Auth errors', () => {
    const authErr = (c: string, message: string, status = 400) => ({ __isAuthError: true, name: 'AuthApiError', code: c, message, status });
    expect(code(authErr('otp_expired', 'Token has expired or is invalid', 403))).toBe('otp_invalid');
    expect(code(authErr('otp_expired', 'Token has expired', 403))).toBe('otp_expired');
    expect(code(authErr('invalid_credentials', 'Invalid login credentials'))).toBe('not_authenticated');
    expect(code(authErr('validation_failed', 'Invalid phone number format'))).toBe('validation');
    expect(code({ __isAuthError: true, name: 'AuthSessionMissingError', message: 'Auth session missing!' })).toBe('not_authenticated');
  });

  it('falls back to the HTTP status (storage errors)', () => {
    expect(code({ name: 'StorageApiError', message: 'The object exceeded the maximum allowed size', status: 413, statusCode: '413' })).toBe('validation');
    expect(code({ name: 'StorageApiError', message: 'new row violates row-level security policy', status: 403 })).toBe('forbidden');
    expect(code({ name: 'StorageApiError', message: 'Object not found', statusCode: '404' })).toBe('not_found');
  });

  it('returns unknown for anything else', () => {
    expect(code({ code: 'XX000', message: 'internal error' })).toBe('unknown');
    expect(code('boom')).toBe('unknown');
    expect(code(null)).toBe('unknown');
  });
});
