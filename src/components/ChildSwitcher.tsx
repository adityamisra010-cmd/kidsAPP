// Owner: W1 (onboarding/account). Parent child switcher chip row (hidden with one child).
import { useChildren } from '@/data/hooks';
import { switchChild } from '@/state/auth-actions';
import { useSession } from '@/state/session';
import { Chip, Row } from '@/ui';

export function ChildSwitcher() {
  const activeChildId = useSession((s) => s.activeChildId);
  const q = useChildren();
  const list = q.data ?? [];
  if (list.length < 2) return null;
  return (
    <Row gap={2} wrap>
      {list.map((c) => (
        <Chip key={c.child.id} label={c.child.preferredName ?? c.child.fullName.split(' ')[0]} selected={c.child.id === activeChildId} onPress={() => switchChild(c.child.id)} />
      ))}
    </Row>
  );
}
