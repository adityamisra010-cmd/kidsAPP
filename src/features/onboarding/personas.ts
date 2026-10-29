import type { DemoPersonaKey } from '@/domain/types';

export type PersonaIcon = 'parent' | 'therapist' | 'school_admin' | 'coordinator' | 'platform_admin';

export interface DemoPersona {
  key: DemoPersonaKey;
  icon: PersonaIcon;
  /** The first three are shown large; leadership/platform roles are secondary. */
  primary: boolean;
}

/**
 * Pitch order: the people a school head cares about most come first. Text lives in
 * `auth:demo.personas.<key>.{role,name,detail,try}`.
 */
export const DEMO_PERSONAS: DemoPersona[] = [
  { key: 'parent', icon: 'parent', primary: true },
  { key: 'therapist', icon: 'therapist', primary: true },
  { key: 'school_admin', icon: 'school_admin', primary: true },
  { key: 'coordinator', icon: 'coordinator', primary: false },
  { key: 'platform_admin', icon: 'platform_admin', primary: false },
];
