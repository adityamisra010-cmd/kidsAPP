import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { discard, retryFailed, useOutbox } from '@/data/outbox';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Sheet } from './Sheet';
import { Text } from './Text';

/**
 * Compact sync status chip: "All changes saved" / "2 waiting to sync" / "Syncing…" / failed.
 * Tap opens a sheet listing queued items with retry/discard.
 */
export function SyncBadge({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { pending, failed, syncing, online, items } = useOutbox();
  const [open, setOpen] = useState(false);
  if (!alwaysShow && items.length === 0 && online) return null;

  const state = failed.length ? 'failed' : !online ? 'offline' : syncing || pending.length ? 'pending' : 'synced';
  const Icon = state === 'failed' ? TriangleAlert : state === 'offline' ? CloudOff : state === 'pending' ? RefreshCw : CheckCircle2;
  const color = state === 'failed' ? t.colors.danger : state === 'offline' ? t.colors.warning : state === 'pending' ? t.colors.info : t.colors.success;
  const label =
    state === 'failed'
      ? tr('common:sync.failed')
      : state === 'pending'
        ? syncing
          ? tr('common:sync.syncing')
          : tr('common:sync.pending', { count: pending.length })
        : state === 'offline'
          ? tr('common:sync.pending', { count: pending.length })
          : tr('common:sync.synced');

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceAlt, alignSelf: 'flex-start' }}
      >
        <Icon size={14} color={color} />
        <Text variant="caption" weight="medium" tint={color}>
          {label}
        </Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label} subtitle={!online ? tr('common:sync.offline') : undefined}>
        {items.length === 0 ? <Text color="textMuted">{tr('common:sync.synced')}</Text> : null}
        {items.map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], paddingVertical: t.space[2] }}>
            {i.status === 'failed' ? <TriangleAlert size={18} color={t.colors.danger} /> : <RefreshCw size={18} color={t.colors.info} />}
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{i.label}</Text>
              {i.lastError ? (
                <Text variant="caption" color="textMuted">
                  {tr(`errors:${i.lastError}`, { defaultValue: tr('errors:unknown') })}
                </Text>
              ) : null}
            </View>
            {i.status === 'failed' ? <Button size="sm" variant="ghost" label={tr('common:actions.remove')} onPress={() => void discard(i.id)} /> : null}
          </View>
        ))}
        {failed.length ? <Button label={tr('common:actions.retry')} icon={RefreshCw} onPress={() => void retryFailed()} /> : null}
      </Sheet>
    </>
  );
}

/** Thin banner when the phone is offline (real backend only; demo data is local). */
export function OfflineBanner() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { online } = useOutbox();
  const mode = useSession((s) => s.mode);
  if (online || mode === 'demo') return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.colors.warningSoft, paddingHorizontal: t.space[4], paddingVertical: t.space[2] }}>
      <CloudOff size={16} color={t.colors.warning} />
      <Text variant="caption" tint={t.colors.warning} weight="medium" style={{ flex: 1 }}>
        {tr('common:states.offlineBanner')}
      </Text>
    </View>
  );
}
