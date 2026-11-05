import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { digitsOnly } from '@/features/onboarding/phone';
import { BRAND } from '@/theme/brand';

export async function openPrivacyPolicy(): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(BRAND.privacyPolicyUrl);
  } catch {
    await Linking.openURL(BRAND.privacyPolicyUrl).catch(() => undefined);
  }
}

export function telUrl(phone: string): string {
  const d = digitsOnly(phone);
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${d}`;
}

export function callPhone(phone: string): Promise<void> {
  return Linking.openURL(telUrl(phone)).catch(() => undefined);
}

export function sendEmail(email: string, subject?: string): Promise<void> {
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return Linking.openURL(`mailto:${email}${q}`).catch(() => undefined);
}

export function appVersion(): { version: string; build: string | null } {
  return {
    version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.1.0',
    build: Application.nativeBuildVersion ?? null,
  };
}
