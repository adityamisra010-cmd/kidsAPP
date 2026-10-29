import { Library, Menu, School } from 'lucide-react-native';

import { RoleTabs } from '@/components/RoleTabs';

export default function PlatformTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: 'schools', titleKey: 'common:tabs.schools', icon: School },
        { name: 'templates', titleKey: 'common:tabs.templates', icon: Library },
        { name: 'more', titleKey: 'common:tabs.more', icon: Menu },
      ]}
    />
  );
}
