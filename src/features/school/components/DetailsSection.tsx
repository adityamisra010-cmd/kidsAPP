import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, School, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Button, Stack, Text, TextField, toast } from '@/ui';

import type { DraftField, SchoolDraft } from '../settingsDraft';
import { Section } from './fields';

export interface SectionProps {
  draft: SchoolDraft;
  update: (fn: (d: SchoolDraft) => void) => void;
  readOnly: boolean;
  errors: Partial<Record<DraftField, string>>;
}

export function DetailsSection({ draft, update, readOnly, errors }: SectionProps) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const o = draft.org;
  const err = (f: DraftField) => (errors[f] ? tr(errors[f]!) : undefined);

  const pickLogo = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!res.canceled && res.assets?.[0]?.uri) {
        const uri = res.assets[0].uri;
        update((d) => {
          d.org.logoUrl = uri;
        });
      }
    } catch {
      toast.error(tr('details.logoError'));
    }
  };

  const field = (key: 'name' | 'shortName' | 'city' | 'address' | 'phone' | 'email', extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
    <TextField
      testID={`school-${key}`}
      label={tr(`details.${key}`)}
      value={o[key]}
      editable={!readOnly}
      onChangeText={(v) =>
        update((d) => {
          d.org[key] = v;
        })
      }
      error={key === 'name' || key === 'shortName' || key === 'phone' || key === 'email' ? err(key) : undefined}
      {...extra}
    />
  );

  return (
    <Section icon={School} title={tr('details.title')} body={tr('details.body')} testID="school-details">
      <Stack gap={2}>
        <Text variant="label">{tr('details.logo')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
          {o.logoUrl ? (
            <Image source={{ uri: o.logoUrl }} style={{ width: 64, height: 64, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }} contentFit="cover" accessibilityLabel={tr('details.logo')} />
          ) : (
            <Avatar name={o.shortName || o.name || '?'} size={64} />
          )}
          {readOnly ? null : (
            <View style={{ flex: 1, gap: t.space[2] }}>
              <Button size="sm" variant="secondary" icon={ImagePlus} label={o.logoUrl ? tr('details.changeLogo') : tr('details.chooseLogo')} onPress={() => void pickLogo()} />
              {o.logoUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  label={tr('details.removeLogo')}
                  onPress={() =>
                    update((d) => {
                      d.org.logoUrl = undefined;
                    })
                  }
                />
              ) : null}
            </View>
          )}
        </View>
        {readOnly ? null : (
          <Text variant="caption" color="textMuted">
            {tr('details.logoHelp')}
          </Text>
        )}
      </Stack>
      {field('name', { required: true, autoCapitalize: 'words' })}
      {field('shortName', { required: true, helper: tr('details.shortNameHelp'), maxLength: 30 })}
      {field('address', { multiline: true, minLines: 2 })}
      {field('city', { autoCapitalize: 'words' })}
      {field('phone', { required: true, keyboardType: 'phone-pad' })}
      {field('email', { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false })}
    </Section>
  );
}
