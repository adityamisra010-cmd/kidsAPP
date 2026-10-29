import { router } from 'expo-router';
import { ChevronRight, ClipboardList, Globe, HeartHandshake, Info, School, Stethoscope, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import type { DemoPersonaKey } from '@/domain/types';
import { signInDemo } from '@/state/auth-actions';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Card, errorMessageKey, Row, Screen, Stack, Text, toast } from '@/ui';

import { DEMO_PERSONAS, type DemoPersona, type PersonaIcon } from './personas';

const ICONS: Record<PersonaIcon, LucideIcon> = {
  parent: HeartHandshake,
  therapist: Stethoscope,
  school_admin: School,
  coordinator: ClipboardList,
  platform_admin: Globe,
};

function PersonaCard({
  persona,
  loading,
  disabled,
  onPress,
}: {
  persona: DemoPersona;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { t: tr } = useTranslation('auth');
  const Icon = ICONS[persona.icon];
  const p = (field: string) => tr(`demo.personas.${persona.key}.${field}`);
  const primary = persona.primary;
  return (
    <Card
      testID={`demo-persona-${persona.key}`}
      tone={primary ? 'default' : 'sunken'}
      elevated={primary}
      padding={primary ? 4 : 3}
      onPress={disabled ? undefined : onPress}
      accessibilityLabel={`${tr('demo.a11yStart', { role: p('role'), name: p('name') })}. ${p('try')}`}
      style={disabled && !loading ? { opacity: 0.6 } : undefined}
    >
      <Row gap={3} align="flex-start">
        <View style={[s.tile, primary ? s.tilePrimary : s.tileSecondary]}>
          <Icon size={primary ? 24 : 20} color={t.colors.primaryText} />
        </View>
        <Stack gap={1} flex={1}>
          <Text variant="overline" color="primaryText">
            {p('role')}
          </Text>
          <Text variant={primary ? 'heading' : 'subheading'}>{p('name')}</Text>
          <Text variant="caption" color="textMuted">
            {p('detail')}
          </Text>
          <Text variant={primary ? 'body' : 'label'} color={primary ? 'text' : 'textMuted'} style={{ marginTop: t.space[1] }}>
            {p('try')}
          </Text>
        </Stack>
        <View style={s.trailing}>
          {loading ? <ActivityIndicator color={t.colors.primary} accessibilityLabel={tr('demo.starting')} /> : <ChevronRight size={20} color={t.colors.textSubtle} />}
        </View>
      </Row>
    </Card>
  );
}

/** Demo role picker: five sample people, sign in with one tap. */
export function DemoScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [loading, setLoading] = useState<DemoPersonaKey | null>(null);

  const start = async (key: DemoPersonaKey) => {
    if (loading) return;
    setLoading(key);
    try {
      await signInDemo(key);
      router.replace('/');
    } catch (e) {
      toast.error(tr(errorMessageKey(e)));
    } finally {
      setLoading(null);
    }
  };

  const primary = DEMO_PERSONAS.filter((p) => p.primary);
  const secondary = DEMO_PERSONAS.filter((p) => !p.primary);
  const card = (p: DemoPersona) => (
    <PersonaCard key={p.key} persona={p} loading={loading === p.key} disabled={!!loading} onPress={() => void start(p.key)} />
  );

  return (
    <Screen title={tr('auth:demo.title')} subtitle={tr('auth:demo.subtitle')} back testID="demo-screen">
      <Text color="textMuted">{tr('auth:demo.intro')}</Text>
      <Stack gap={3}>{primary.map(card)}</Stack>
      <Text variant="overline" color="textMuted" style={{ marginTop: t.space[2] }}>
        {tr('auth:demo.otherRoles')}
      </Text>
      <Stack gap={3}>{secondary.map(card)}</Stack>
      <Row gap={2} align="flex-start" style={{ marginTop: t.space[2] }}>
        <Info size={16} color={t.colors.textMuted} style={{ marginTop: 2 }} />
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          {tr('auth:demo.note')}
        </Text>
      </Row>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  tile: { borderRadius: t.radius.md, alignItems: 'center', justifyContent: 'center' },
  tilePrimary: { width: 48, height: 48, backgroundColor: t.colors.primarySoft },
  tileSecondary: { width: 40, height: 40, backgroundColor: t.colors.surface },
  trailing: { minWidth: 24, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
}));
