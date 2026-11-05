/**
 * /resources: parents see what was shared with them + school picks; everyone else sees the library.
 */
import { useActive } from '@/state/session';

import { ParentResources } from './ParentResources';
import { StaffLibrary } from './StaffLibrary';

export function ResourceLibraryScreen() {
  const role = useActive()?.role;
  return role === 'parent' ? <ParentResources /> : <StaffLibrary />;
}
