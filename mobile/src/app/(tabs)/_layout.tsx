// The four tabs along the bottom, as on the website: Groups, Friends, Activity, Account.
import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { myName, myProfile, unreadCount, useStore } from '@/lib/store';
import { Icon } from '@/ui/icons';
import { Avatar } from '@/ui/kit';
import { F, useTheme } from '@/ui/theme';

export default function TabsLayout(){
  const {c} = useTheme();
  useStore();
  const n = unreadCount(), photo = myProfile()?.avatar_url;
  return (
    <Tabs screenOptions={{headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted,
      tabBarStyle: {backgroundColor: c.surface, borderTopColor: c.line, ...(Platform.OS === 'web' ? {height: 66, paddingTop: 6, paddingBottom: 8} : null)}, tabBarLabelStyle: {fontFamily: F.semi, fontSize: 12, lineHeight: 16},
      sceneStyle: {backgroundColor: c.bg}}}>
      <Tabs.Screen name="index" options={{title: 'Groups', tabBarIcon: ({color}) => <Icon name="users" size={22} color={color as string} />}} />
      <Tabs.Screen name="friends" options={{title: 'Friends', tabBarIcon: ({color}) => <Icon name="user" size={22} color={color as string} />}} />
      <Tabs.Screen name="activity" options={{title: 'Activity', tabBarBadge: n ? (n > 99 ? '99+' : n) : undefined,
        tabBarBadgeStyle: {backgroundColor: c.cta, color: c.ctaInk, fontFamily: F.bold, fontSize: 11},
        tabBarIcon: ({color}) => <Icon name="activity" size={22} color={color as string} />}} />
      <Tabs.Screen name="account" options={{title: 'Account',
        tabBarIcon: ({color, size}) => photo ? <Avatar name={myName()} url={photo} size={24} /> : <Icon name="circle-user" size={22} color={color as string} />}} />
    </Tabs>
  );
}
