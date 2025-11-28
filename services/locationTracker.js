import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devApi } from './interceptor';
import { Platform } from 'react-native';

const LOCATION_TRACKING_TASK = 'background-location-tracking';
const TRACKING_INTERVAL = 30000; // 30 seconds

let trackingInterval = null;

// Get device unique identifier
const getDeviceId = async () => {
  try {
    // Try to get stored device ID first
    let deviceId = await AsyncStorage.getItem('deviceId');
    
    if (!deviceId) {
      // Generate unique device identifier based on available device info
      if (Platform.OS === 'android') {
        // On Android, use Device ID
        deviceId = Device.osBuildId || Device.osInternalBuildId || Device.modelId;
      } else {
        // On iOS, use identifierForVendor equivalent
        deviceId = Device.modelId;
      }
      
      // Fallback to a combination of device properties if nothing else available
      if (!deviceId) {
        deviceId = `${Device.brand}-${Device.modelName}-${Device.osName}-${Device.osVersion}`.replace(/\s/g, '-');
      }
      
      // Store it for future use
      await AsyncStorage.setItem('deviceId', deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.error('Failed to get device ID:', error);
    return 'unknown-device';
  }
};

// Generate UUID v4
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Save location to API
const saveLocationToAPI = async (location) => {
  try {
    const userData = await AsyncStorage.getItem('userData');
    if (!userData) return;

    const user = JSON.parse(userData);
    const deviceId = await getDeviceId();
    
    // Format location as "latitude,longitude"
    const locationString = `${location.coords.latitude},${location.coords.longitude}`;
    
    const payload = {
      ID: generateUUID(), // Unique transaction ID
      DeviceId: deviceId, // Device IMEI/Unique identifier
      Location: locationString, // "lat,lng" format
      TransactionDatetime: new Date(location.timestamp).toISOString(), // ISO 8601 datetime
    };
    
    await devApi.post('/admin/VehicleTracking/SaveLocation', payload);

    console.log('✅ Location saved:', locationString, 'Device:', deviceId);
  } catch (error) {
    console.error('❌ Failed to save location:', error.message);
  }
};

// Start tracking (called after login)
export const startLocationTracking = async () => {
  try {
    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== 'granted') {
      console.warn('⚠️ Location permission denied');
      return;
    }

    // Request background permission (only works on Android in Expo Go)
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    
    if (backgroundStatus !== 'granted') {
      console.warn('⚠️ Background location permission denied, using foreground only');
    }

    // Stop any existing tracking
    if (trackingInterval) {
      clearInterval(trackingInterval);
    }

    // Start periodic tracking
    trackingInterval = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await saveLocationToAPI(location);
      } catch (error) {
        console.error('❌ Location fetch failed:', error.message);
      }
    }, TRACKING_INTERVAL);

    // Send initial location immediately
    const initialLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await saveLocationToAPI(initialLocation);

    console.log('✅ Location tracking started');
  } catch (error) {
    console.error('❌ Failed to start location tracking:', error.message);
  }
};

// Stop tracking (called on logout)
export const stopLocationTracking = () => {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
    console.log('✅ Location tracking stopped');
  }
};

// Define background task (for true background tracking on Android/iOS)
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('❌ Background location error:', error);
    return;
  }
  
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      await saveLocationToAPI(locations[0]);
    }
  }
});

// Start background location updates (optional, for true background tracking)
export const startBackgroundLocationTracking = async () => {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    
    if (status === 'granted') {
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: TRACKING_INTERVAL,
        distanceInterval: 10, // meters
        showsBackgroundLocationIndicator: false, // Hide iOS indicator
      });
      console.log('✅ Background location tracking started');
    }
  } catch (error) {
    console.error('❌ Failed to start background tracking:', error.message);
  }
};

// Stop background location updates
export const stopBackgroundLocationTracking = async () => {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    console.log('✅ Background location tracking stopped');
  } catch (error) {
    console.error('❌ Failed to stop background tracking:', error.message);
  }
};
