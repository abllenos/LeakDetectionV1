import React from 'react';
import { View, Text } from 'react-native';
import styles from '../styles/HomeStyles';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LeakDetection</Text>
      <Text>Welcome to your Expo React Native app!</Text>
    </View>
  );
}
