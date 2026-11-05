import type { ImportKind, Role } from '@/domain/types';

/**
 * School admins import everything. Coordinators run scheduling, so they can import the recurring
 * schedule; creating staff, children and parent accounts stays with the admin.
 */
export function canImport(role: Role | undefined, kind: ImportKind): boolean {
  if (role === 'school_admin') return true;
  if (role === 'coordinator') return kind === 'schedule';
  return false;
}

export function canOpenImports(role: Role | undefined): boolean {
  return role === 'school_admin' || role === 'coordinator';
}

/** Where "Go to …" takes the admin after an import. */
export const LIST_ROUTE: Record<ImportKind, string> = {
  staff: '/admin/people',
  children: '/admin/people',
  parents: '/admin/people',
  schedule: '/admin/schedule',
};
