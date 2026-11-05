import { Screen, Text } from '@/ui';

/** Temporary screen used while a feature is being built. Should not ship. */
export function Placeholder({ title, back = true }: { title: string; back?: boolean }) {
  return (
    <Screen title={title} back={back}>
      <Text color="textMuted">Coming soon.</Text>
    </Screen>
  );
}
