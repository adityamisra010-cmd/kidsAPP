import { router } from 'expo-router';
import { MessageSquareText, PlayCircle, RefreshCw, School, Smartphone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable } from 'react-native';

import { adoptProfileLanguage } from '@/features/account/language';
import { requestOtp, verifyOtp } from '@/state/auth-actions';
import { BRAND } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Row, Screen, Stack, Text, toast } from '@/ui';

import { isNoMembership, signInErrorKey } from './authErrors';
import { OtpInput } from './OtpInput';
import { displayPhone, formatCountdown, mobileErrorKey, OTP_LENGTH, RESEND_SECONDS, toE164 } from './phone';
import { PhoneField } from './PhoneField';
import { useResendTimer } from './useResendTimer';

type Step = 'phone' | 'code' | 'no_school';

/** Phone + OTP sign-in (primary method for parents and staff). */
export function PhoneScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const timer = useResendTimer(RESEND_SECONDS);
  const e164 = toE164(digits);

  // Hardware back on the code step returns to the number, not out of sign-in.
  useEffect(() => {
    if (step === 'phone') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('phone');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const sendCode = async (resend = false) => {
    const errKey = mobileErrorKey(digits);
    if (errKey) {
      setPhoneError(tr(`auth:${errKey}`));
      return;
    }
    setPhoneError(undefined);
    setBusy(true);
    try {
      await requestOtp(e164);
      setCode('');
      setCodeError(undefined);
      setStep('code');
      timer.restart();
      if (resend) toast.success(tr('auth:otp.resent'));
    } catch (e) {
      if (isNoMembership(e)) setStep('no_school');
      else if (resend) setCodeError(tr(signInErrorKey(e, 'otp')));
      else setPhoneError(tr(signInErrorKey(e, 'otp')));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setCodeError(undefined);
    try {
      const user = await verifyOtp(e164, value);
      adoptProfileLanguage(user);
      router.replace('/');
    } catch (e) {
      if (isNoMembership(e)) setStep('no_school');
      else {
        setCodeError(tr(signInErrorKey(e, 'otp')));
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const back = () => (step === 'phone' ? (router.canGoBack() ? router.back() : router.replace('/welcome')) : setStep('phone'));

  if (step === 'no_school') {
    return (
      <Screen title={tr('auth:phone.title')} back onBack={back}>
        <Card tone="sunken" padding={5}>
          <Stack gap={3}>
            <School size={28} color={t.colors.primaryText} />
            <Text variant="heading" accessibilityRole="header">
              {tr('auth:noSchool.title')}
            </Text>
            <Text color="textMuted">{tr('auth:noSchool.body', { phone: displayPhone(e164), appName: BRAND.appName })}</Text>
          </Stack>
        </Card>
        <Button label={tr('auth:noSchool.tryAnother')} icon={Smartphone} variant="secondary" size="lg" fullWidth onPress={() => setStep('phone')} />
        <Button label={tr('auth:noSchool.tryDemo')} icon={PlayCircle} variant="ghost" fullWidth onPress={() => router.replace('/demo')} />
      </Screen>
    );
  }

  if (step === 'code') {
    return (
      <Screen title={tr('auth:phone.title')} back onBack={back}>
        <Stack gap={2} style={{ marginTop: t.space[2] }}>
          <Text variant="title" accessibilityRole="header">
            {tr('auth:otp.heading')}
          </Text>
          <Text color="textMuted">{tr('auth:otp.sentTo', { phone: displayPhone(e164) })}</Text>
          <Pressable accessibilityRole="button" onPress={() => setStep('phone')} hitSlop={8} style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Text variant="label" color="primaryText" weight="semibold">
              {tr('auth:otp.changeNumber')}
            </Text>
          </Pressable>
        </Stack>

        <OtpInput
          label={tr('auth:otp.a11yLabel')}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (codeError) setCodeError(undefined);
          }}
          onComplete={(v) => void verify(v)}
          error={!!codeError}
          disabled={busy}
        />
        {codeError ? (
          <Text variant="label" color="danger" align="center" accessibilityLiveRegion="polite">
            {codeError}
          </Text>
        ) : (
          <Row gap={2} justify="center">
            <MessageSquareText size={16} color={t.colors.textMuted} />
            <Text variant="caption" color="textMuted">
              {tr('auth:otp.autoRead')}
            </Text>
          </Row>
        )}

        <Button testID="otp-verify" label={tr('auth:otp.verify')} size="lg" fullWidth loading={busy} disabled={code.length !== OTP_LENGTH} onPress={() => void verify()} />

        {timer.left > 0 ? (
          <Text variant="label" color="textMuted" align="center" accessibilityLiveRegion="polite">
            {tr('auth:otp.resendIn', { time: formatCountdown(timer.left) })}
          </Text>
        ) : (
          <Button label={tr('auth:otp.resend')} icon={RefreshCw} variant="ghost" disabled={busy} onPress={() => void sendCode(true)} style={{ alignSelf: 'center' }} />
        )}
      </Screen>
    );
  }

  return (
    <Screen title={tr('auth:phone.title')} back onBack={back}>
      <Stack gap={2} style={{ marginTop: t.space[2] }}>
        <Text variant="title" accessibilityRole="header">
          {tr('auth:phone.heading')}
        </Text>
        <Text color="textMuted">{tr('auth:phone.intro')}</Text>
      </Stack>
      <PhoneField
        label={tr('auth:phone.label')}
        digits={digits}
        onChangeDigits={(d) => {
          setDigits(d);
          if (phoneError) setPhoneError(undefined);
        }}
        error={phoneError}
        onSubmit={() => void sendCode()}
        editable={!busy}
      />
      <Button testID="phone-send" label={tr('auth:phone.send')} size="lg" fullWidth loading={busy} disabled={digits.length !== 10} onPress={() => void sendCode()} />
      <Pressable accessibilityRole="link" onPress={() => router.replace('/email')} hitSlop={8} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="label" color="primaryText" weight="semibold" align="center">
          {tr('auth:phone.useEmail')}
        </Text>
      </Pressable>
    </Screen>
  );
}
