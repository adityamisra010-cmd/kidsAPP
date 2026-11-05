import { RepoError } from '@/data/repository';

/** Maps a sign-in failure to an i18n key. Wrong email/password gets its own plain message. */
export function signInErrorKey(error: unknown, method: 'otp' | 'password'): string {
  if (!(error instanceof RepoError)) return 'errors:unknown';
  if (method === 'password' && (error.code === 'not_authenticated' || error.code === 'validation')) {
    return 'auth:email.wrongCredentials';
  }
  if (method === 'otp' && error.code === 'validation') return 'auth:phone.errors.start';
  return `errors:${error.code}`;
}

export function isNoMembership(error: unknown): boolean {
  return error instanceof RepoError && error.code === 'no_membership';
}
