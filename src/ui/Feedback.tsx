import { CheckCircle2, Info, TriangleAlert } from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Text } from './Text';

// ---------------------------------------------------------------------------
// Toast: `toast.success('Saved')`, `toast.info(...)`, `toast.error(...)`
// ---------------------------------------------------------------------------

type ToastKind = 'success' | 'info' | 'error';
interface ToastState {
  current: { id: number; kind: ToastKind; message: string } | null;
  show: (kind: ToastKind, message: string) => void;
  hide: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (kind, message) => set({ current: { id: Date.now(), kind, message } }),
  hide: () => set({ current: null }),
}));

export const toast = {
  success: (m: string) => useToastStore.getState().show('success', m),
  info: (m: string) => useToastStore.getState().show('info', m),
  error: (m: string) => useToastStore.getState().show('error', m),
};

export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(hide, current.kind === 'error' ? 5000 : 3000);
    return () => clearTimeout(timer);
  }, [current, hide]);
  if (!current) return null;
  const Icon = current.kind === 'success' ? CheckCircle2 : current.kind === 'error' ? TriangleAlert : Info;
  const color = current.kind === 'success' ? t.colors.success : current.kind === 'error' ? t.colors.danger : t.colors.info;
  return (
    <Animated.View
      key={current.id}
      entering={t.reduceMotion ? undefined : FadeInDown.duration(200)}
      exiting={t.reduceMotion ? undefined : FadeOutDown.duration(150)}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 84 }}
    >
      <Pressable
        onPress={hide}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 14,
          borderRadius: t.radius.md,
          backgroundColor: t.scheme === 'dark' ? t.colors.surfaceAlt : t.colors.text,
          ...t.elevation(2),
        }}
      >
        <Icon size={20} color={color} />
        <Text variant="label" tint={t.scheme === 'dark' ? t.colors.text : t.colors.bg} style={{ flex: 1 }}>
          {current.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog: `if (await confirm({ title, body, confirmLabel, destructive })) …`
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}
interface ConfirmState {
  open: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  ask: (o: ConfirmOptions) => Promise<boolean>;
  close: (v: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: null,
  ask: (o) => new Promise<boolean>((resolve) => set({ open: { ...o, resolve } })),
  close: (v) => {
    get().open?.resolve(v);
    set({ open: null });
  },
}));

export const confirm = (o: ConfirmOptions) => useConfirmStore.getState().ask(o);

export function ConfirmHost() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const open = useConfirmStore((s) => s.open);
  const close = useConfirmStore((s) => s.close);
  return (
    <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={{ flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'center', padding: t.space[6] }}>
        {open ? (
          <View accessibilityViewIsModal style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.xl, padding: t.space[5], gap: t.space[3] }}>
            <Text variant="heading" accessibilityRole="header">
              {open.title}
            </Text>
            {open.body ? <Text color="textMuted">{open.body}</Text> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.space[2], marginTop: t.space[2], flexWrap: 'wrap' }}>
              <Button label={open.cancelLabel ?? tr('common:actions.cancel')} variant="ghost" onPress={() => close(false)} />
              <Button
                label={open.confirmLabel ?? tr('common:actions.confirm')}
                variant={open.destructive ? 'danger' : 'primary'}
                onPress={() => close(true)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
