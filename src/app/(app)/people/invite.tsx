// Owner: W4 (children/goals/progress/people). Optional `?role=parent|therapist|coordinator|school_admin&childId=`.
import { useLocalSearchParams } from 'expo-router';

import type { Role } from '@/domain/types';
import { InviteScreen } from '@/features/people/screens/InviteScreen';

const ROLES: Role[] = ['parent', 'therapist', 'coordinator', 'school_admin'];

export default function Screen() {
  const { role, childId } = useLocalSearchParams<{ role?: string; childId?: string }>();
  return <InviteScreen role={ROLES.find((r) => r === role)} childId={childId || undefined} />;
}
