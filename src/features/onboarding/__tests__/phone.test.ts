import { RepoError } from '@/data/repository';

import { isNoMembership, signInErrorKey } from '../authErrors';
import { DEMO_PERSONAS } from '../personas';
import {
  displayPhone,
  formatCountdown,
  formatIndianMobile,
  isValidIndianMobile,
  mobileErrorKey,
  normalizeIndianMobile,
  normalizeOtp,
  secondsLeft,
  toE164,
} from '../phone';

describe('Indian mobile numbers', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['+91 98765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['(+91) 98765 43210 ', '9876543210'],
    ['98765432109999', '9876543210'],
    ['98765', '98765'],
  ])('normalises %p', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it('keeps a 10-digit number that starts with 91', () => {
    expect(normalizeIndianMobile('9123456789')).toBe('9123456789');
  });

  it('formats as 5 + 5 while typing', () => {
    expect(formatIndianMobile('')).toBe('');
    expect(formatIndianMobile('987')).toBe('987');
    expect(formatIndianMobile('98765')).toBe('98765');
    expect(formatIndianMobile('987654')).toBe('98765 4');
    expect(formatIndianMobile('9876543210')).toBe('98765 43210');
  });

  it('validates the Indian mobile range', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true);
    expect(isValidIndianMobile('6000000000')).toBe(true);
    expect(isValidIndianMobile('5876543210')).toBe(false);
    expect(isValidIndianMobile('987654321')).toBe(false);
  });

  it('explains what is wrong', () => {
    expect(mobileErrorKey('')).toBe('phone.errors.empty');
    expect(mobileErrorKey('98765')).toBe('phone.errors.length');
    expect(mobileErrorKey('1234567890')).toBe('phone.errors.start');
    expect(mobileErrorKey('9876543210')).toBeNull();
  });

  it('builds E.164 and a readable display form', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
    expect(displayPhone('+919876543210')).toBe('+91 98765 43210');
    expect(displayPhone('9876543210')).toBe('+91 98765 43210');
    expect(displayPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(displayPhone(undefined)).toBe('');
  });
});

describe('OTP helpers', () => {
  it('keeps six digits from pasted text', () => {
    expect(normalizeOtp('Your code is 123 456. Do not share.')).toBe('123456');
    expect(normalizeOtp('12a3')).toBe('123');
    expect(normalizeOtp('12345678')).toBe('123456');
  });

  it('counts down in whole seconds and formats m:ss', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
    expect(formatCountdown(30)).toBe('0:30');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(90)).toBe('1:30');
  });
});

describe('sign-in errors', () => {
  it('maps wrong password to a plain message', () => {
    expect(signInErrorKey(new RepoError('not_authenticated'), 'password')).toBe('auth:email.wrongCredentials');
    expect(signInErrorKey(new RepoError('otp_invalid'), 'otp')).toBe('errors:otp_invalid');
    expect(signInErrorKey(new Error('boom'), 'otp')).toBe('errors:unknown');
    expect(isNoMembership(new RepoError('no_membership'))).toBe(true);
    expect(isNoMembership(new RepoError('forbidden'))).toBe(false);
  });
});

describe('demo personas', () => {
  it('lists five roles in pitch order, first three primary', () => {
    expect(DEMO_PERSONAS.map((p) => p.key)).toEqual(['parent', 'therapist', 'school_admin', 'coordinator', 'platform_admin']);
    expect(DEMO_PERSONAS.map((p) => p.primary)).toEqual([true, true, true, false, false]);
  });
});
