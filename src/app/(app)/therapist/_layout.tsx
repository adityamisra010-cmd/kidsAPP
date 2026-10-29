import { CalendarDays, Inbox, Menu, Sun, Users } from 'lucide-react-native';

import { RoleTabs } from '@/components/RoleTabs';

export default function TherapistTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: 'today', titleKey: 'common:tabs.today', icon: Sun },
        { name: 'calendar', titleKey: 'common:tabs.calendar', icon: CalendarDays },
        { name: 'caseload', titleKey: 'common:tabs.caseload', icon: Users },
        { name: 'reviews', titleKey: 'common:tabs.reviews', icon: Inbox },
        { name: 'more', titleKey: 'common:tabs.more', icon: Menu },
      ]}
    />
  );
}
