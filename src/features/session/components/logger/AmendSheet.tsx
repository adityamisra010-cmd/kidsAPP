// Reason sheet for amending a locked log (kept in the audit trail).
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Sheet, Text, TextField } from '@/ui';

export function AmendSheet({
  visible,
  saving,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation('session');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const empty = reason.trim().length === 0;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('logger.amend.title')}
      footer={
        <Button
          label={t('logger.amend.submit')}
          icon={Check}
          fullWidth
          loading={saving}
          testID="amend-submit"
          onPress={() => {
            setTried(true);
            if (!empty) onSubmit(reason.trim());
          }}
        />
      }
    >
      <Text color="textMuted">{t('logger.amend.body')}</Text>
      <TextField
        testID="amend-reason"
        label={t('logger.amend.reason')}
        required
        placeholder={t('logger.amend.reasonPlaceholder')}
        value={reason}
        onChangeText={setReason}
        error={tried && empty ? t('logger.amend.reasonNeeded') : undefined}
        multiline
        minLines={2}
      />
    </Sheet>
  );
}
