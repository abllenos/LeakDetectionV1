import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = 'app_notifications';

export const pushNotification = async (notif) => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = [{ id: Date.now(), read: false, createdAt: new Date().toISOString(), ...notif }, ...list];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    console.error('pushNotification error', err);
    throw err;
  }
};

export const fetchNotifications = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('fetchNotifications error', err);
    return [];
  }
};

export const markAllRead = async () => {
  try {
    const list = await fetchNotifications();
    const next = list.map((n) => ({ ...n, read: true }));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    console.error('markAllRead error', err);
    return [];
  }
};

export const clearNotifications = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return [];
  } catch (err) {
    console.error('clearNotifications error', err);
    return [];
  }
};

export const requestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.log('Notifications not available:', error.message);
    return false;
  }
};

export const showNotification = async (title, body, progress = null) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { progress },
      },
      trigger: null,
    });
  } catch (error) {
    console.log('Notification not shown:', error.message);
  }
};
