import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useUnreadCounts } from '@/data/hooks';
import { LabeledIconButton } from '@/ui';

/** Header bell: icon + "Updates", with the unread count. Opens the notifications inbox. */
export function BellButton() {
  const { t } = useTranslation('notifications');
  const { notifications } = useUnreadCounts();
  return <LabeledIconButton testID="bell" icon={Bell} label={t('bell')} badge={notifications} onPress={() => router.push('/notifications')} />;
}
