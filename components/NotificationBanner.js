// NotificationBanner.js
import React from 'react';
import { observer } from 'mobx-react-lite';
import { View, Text, StyleSheet } from 'react-native';
import notificationStore from '../stores/NotificationStore';

const NotificationBanner = observer(() => {
  if (notificationStore.notifications.length === 0) return null;
  const notif = notificationStore.notifications[0];
  return (
    <View style={[styles.banner, notif.type === 'error' ? styles.error : styles.info]}>
      <Text style={styles.text}>{notif.message}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    padding: 12,
    position: 'absolute',
    top: 0,
    zIndex: 100,
    alignItems: 'center',
  },
  info: {
    backgroundColor: '#2196F3',
  },
  error: {
    backgroundColor: '#F44336',
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default NotificationBanner;
