import { CalendarDays, FileText, LayoutDashboard, Menu, Users } from 'lucide-react-native';

import { RoleTabs } from '@/components/RoleTabs';

export default function AdminTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: 'dashboard', titleKey: 'common:tabs.dashboard', icon: LayoutDashboard },
        { name: 'schedule', titleKey: 'common:tabs.schedule', icon: CalendarDays },
        { name: 'people', titleKey: 'common:tabs.people', icon: Users },
        { name: 'reports', titleKey: 'common:tabs.reports', icon: FileText },
        { name: 'more', titleKey: 'common:tabs.more', icon: Menu },
      ]}
    />
  );
}
