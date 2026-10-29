// Phone notifications in the Android and iPhone app: ask permission, get this phone's Expo push token,
// and save it so the "notify" function can reach it. Tapping a notification opens the expense or group.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { takeLink } from './pending';
import { sb } from './supabase';

export type PushStatus = 'on' | 'off' | 'blocked' | 'unsupported' | 'install';
const KEY = 'evenly.pushToken';
const projectId = () => Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

// Show notifications that arrive while Evenly is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false}),
});
Notifications.addNotificationResponseReceivedListener(r => { const url = r.notification.request.content.data?.url; if (typeof url === 'string') takeLink(url); });
// Opened by tapping a notification while the app was closed.
Notifications.getLastNotificationResponseAsync().then(r => { const url = r?.notification.request.content.data?.url; if (typeof url === 'string') takeLink(url); }).catch(() => {});

export async function pushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || !projectId()) return 'unsupported';
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && !perm.canAskAgain) return 'blocked';
  return perm.granted && (await AsyncStorage.getItem(KEY)) ? 'on' : 'off';
}

export async function enablePush(userId: string){
  if (!Device.isDevice || !projectId()) throw new Error('This phone can’t get notifications from Evenly.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', {name: 'Expenses and reminders', importance: AndroidImportance.HIGH});
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Notifications are blocked. Allow them for Evenly in your phone’s settings.');
  const {data: token} = await Notifications.getExpoPushTokenAsync({projectId: projectId()});
  // A phone used by someone else before: replace their entry with yours.
  await sb.from('push_tokens').delete().eq('token', token);
  const {error} = await sb.from('push_tokens').insert({user_id: userId, token, platform: Platform.OS});
  if (error && !/duplicate/i.test(error.message)) throw error;
  await AsyncStorage.setItem(KEY, token);
}

export async function disablePush(){
  const token = await AsyncStorage.getItem(KEY);
  if (token) await sb.from('push_tokens').delete().eq('token', token);
  await AsyncStorage.removeItem(KEY);
}
