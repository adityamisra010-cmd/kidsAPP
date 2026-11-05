import { Baby, CalendarDays, House, ListChecks, Menu } from 'lucide-react-native';

import { RoleTabs } from '@/components/RoleTabs';

export default function ParentTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: 'home', titleKey: 'common:tabs.home', icon: House },
        { name: 'calendar', titleKey: 'common:tabs.calendar', icon: CalendarDays },
        { name: 'child', titleKey: 'common:tabs.myChild', icon: Baby },
        { name: 'practice', titleKey: 'common:tabs.practice', icon: ListChecks },
        { name: 'more', titleKey: 'common:tabs.more', icon: Menu },
      ]}
    />
  );
}
