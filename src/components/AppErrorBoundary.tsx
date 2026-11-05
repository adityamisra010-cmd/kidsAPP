import { router } from 'expo-router';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { reportError } from '@/lib/errorReporting';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, EmptyIllustration, Text } from '@/ui';

function Fallback({ onReset }: { onReset: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center', padding: t.space[6], gap: t.space[4] }}>
      <EmptyIllustration />
      <Text variant="title" align="center">
        {tr('common:states.errorTitle')}
      </Text>
      <Text color="textMuted" align="center">
        {tr('common:states.errorBody')}
      </Text>
      <Button
        label={tr('common:actions.retry')}
        onPress={() => {
          onReset();
          router.replace('/');
        }}
      />
    </View>
  );
}

/** Global error boundary: a crash in one screen shows a friendly retry instead of a blank app. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  override render() {
    if (this.state.error) return <Fallback onReset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
