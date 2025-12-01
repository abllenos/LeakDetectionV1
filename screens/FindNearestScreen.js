import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';
import { useLocationStore } from '../stores/RootStore';
import styles from '../styles/FindNearestStyles';

const FindNearestScreen = observer(({ navigation }) => {
  const locationStore = useLocationStore();

  useEffect(() => {
    findNearestMeters();
  }, []);

  const findNearestMeters = async () => {
    try {
      locationStore.setStatus('Requesting location permission...');
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (permissionStatus !== 'granted') {
        locationStore.setError('Permission denied');
        Alert.alert(
          'Permission Required',
          'Location permission is required to find nearest meters.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }

      locationStore.setStatus('Getting your location...');
      
      // Get single high-accuracy GPS reading
      const loc = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.BestForNavigation,
      });
      
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      };
      
      console.log(`📍 GPS location: ${coords.latitude}, ${coords.longitude} (accuracy: ${loc.coords.accuracy?.toFixed(1)}m)`);

      locationStore.setCurrentLocation(coords);
      locationStore.setStatus('Finding nearest meters...');
      
      // Small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 800));

      // Navigate to the nearest meters screen with coordinates
      navigation.replace('NearestMeters', { coordinates: coords });

    } catch (err) {
      console.warn('Failed to get location:', err);
      locationStore.setError('Unable to get current location');
      Alert.alert(
        'Location Error',
        'Unable to get your current location. Please try again.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={['#1e5a8e', '#2d7ab8']} style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconWrapper}>
            <LinearGradient 
              colors={['#3b82f6', '#2563eb']} 
              style={styles.iconCircle}
            >
              <Ionicons name="navigate" size={48} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Finding Nearest Meters</Text>
          <Text style={styles.subtitle}>{locationStore.status}</Text>

          <ActivityIndicator 
            size="large" 
            color="#fff" 
            style={{ marginTop: 24 }} 
          />

          <View style={styles.steps}>
            <View style={styles.step}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.stepText}>Getting GPS coordinates</Text>
            </View>
            <View style={styles.step}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.stepText}>Searching nearby meters</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
});

export default FindNearestScreen;
