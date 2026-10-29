/**
 * Indian mobile number + OTP helpers (pure). Parents type or paste numbers in many shapes:
 * "98765 43210", "+91 98765-43210", "098765 43210". We keep 10 digits and send E.164.
 */

export const INDIA_DIAL_CODE = '+91';
export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 30;

export function digitsOnly(input: string): string {
  return input.replace(/\D+/g, '');
}

/** Normalises typed or pasted input to at most 10 national digits. */
export function normalizeIndianMobile(input: string): string {
  let d = digitsOnly(input);
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

/** "9876543210" → "98765 43210" (also formats partial input while typing). */
export function formatIndianMobile(digits: string): string {
  const d = digitsOnly(digits).slice(0, 10);
  return d.length <= 5 ? d : `${d.slice(0, 5)} ${d.slice(5)}`;
}

/** Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9. */
export function isValidIndianMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

/** i18n key (in the `auth` namespace) describing what is wrong, or null when valid. */
export function mobileErrorKey(digits: string): string | null {
  if (digits.length === 0) return 'phone.errors.empty';
  if (digits.length !== 10) return 'phone.errors.length';
  if (!isValidIndianMobile(digits)) return 'phone.errors.start';
  return null;
}

export function toE164(digits: string): string {
  return `${INDIA_DIAL_CODE}${digits}`;
}

/** "+919876543210" or "9876543210" → "+91 98765 43210". Other numbers are returned unchanged. */
export function displayPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  const d = digitsOnly(phone);
  const national = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 10 ? d : null;
  return national ? `${INDIA_DIAL_CODE} ${formatIndianMobile(national)}` : phone;
}

/** Keeps only digits, capped at the OTP length (handles pasted "Your code is 123 456"). */
export function normalizeOtp(input: string): string {
  return digitsOnly(input).slice(0, OTP_LENGTH);
}

/** Whole seconds left until `endsAt` (never negative). */
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** 25 → "0:25", 90 → "1:30". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
