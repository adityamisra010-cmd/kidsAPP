/**
 * Indian mobile numbers. Invites go out by SMS OTP, so only mobiles (10 digits starting 6–9) are
 * accepted. Everything is stored as E.164 `+91XXXXXXXXXX`.
 */

/** Returns `+91XXXXXXXXXX`, or null when the input is not a valid Indian mobile number. */
export function normaliseIndianPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Only digits, spaces, dashes, dots, brackets and one leading + are allowed.
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (!digits.startsWith('91')) return null;
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('091')) {
    digits = digits.slice(3);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export function isValidIndianMobile(input: string): boolean {
  return normaliseIndianPhone(input) !== null;
}

/** `+919876543210` → `+91 98765 43210`. Other values are returned unchanged. */
export function formatIndianPhone(phone: string | undefined): string {
  if (!phone) return '';
  const n = normaliseIndianPhone(phone);
  if (!n) return phone;
  const d = n.slice(3);
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

/** `tel:` link for the dialler. */
export function telLink(phone: string): string {
  return `tel:${normaliseIndianPhone(phone) ?? phone.replace(/[^\d+]/g, '')}`;
}
