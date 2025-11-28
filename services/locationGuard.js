import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

// Davao City bounds (production)
const ALLOWED_BOUNDS = {
  name: 'Davao City',
  minLat: 6.9679,
  maxLat: 7.4135,
  minLon: 125.2244,
  maxLon: 125.6862,
};

// Bukidnon bounds (for testing - uncomment to test)
// const ALLOWED_BOUNDS = {
//   name: 'Bukidnon',
//   minLat: 7.4000,   // Southern boundary
//   maxLat: 8.5000,   // Northern boundary
//   minLon: 124.5000, // Western boundary
//   maxLon: 125.5000, // Eastern boundary
// };

/**
 * Check if coordinates are within allowed bounds
 */
export const isWithinAllowedArea = (latitude, longitude) => {
  return (
    latitude >= ALLOWED_BOUNDS.minLat &&
    latitude <= ALLOWED_BOUNDS.maxLat &&
    longitude >= ALLOWED_BOUNDS.minLon &&
    longitude <= ALLOWED_BOUNDS.maxLon
  );
};

/**
 * Get current location with permission check
 * Returns: { success: boolean, location?: {latitude, longitude}, error?: string, errorType?: string }
 */
export const getCurrentLocationForGuard = async () => {
  try {
    // Check if location services are enabled
    const serviceEnabled = await Location.hasServicesEnabledAsync();
    if (!serviceEnabled) {
      return {
        success: false,
        error: 'Location services are disabled. Please enable GPS/Location in your device settings to use this app.',
        errorType: 'SERVICE_DISABLED',
      };
    }

    // Check permission status
    const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
    
    let finalStatus = existingStatus;
    
    // If not determined, request permission
    if (existingStatus !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      finalStatus = status;
    }

    // If permission denied
    if (finalStatus !== 'granted') {
      return {
        success: false,
        error: 'Location permission is required to use this app. Please grant location access in your device settings.',
        errorType: 'PERMISSION_DENIED',
      };
    }

    // Get current location with high accuracy
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      maximumAge: 30000, // Accept location up to 30 seconds old
    });

    return {
      success: true,
      location: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
    };
  } catch (error) {
    console.error('[LocationGuard] Error getting location:', error);
    return {
      success: false,
      error: 'Failed to get your location. Please ensure GPS is enabled and try again.',
      errorType: 'LOCATION_ERROR',
    };
  }
};

/**
 * Verify user is in allowed area
 * Returns: { allowed: boolean, message?: string, errorType?: string }
 */
export const verifyLocationAccess = async () => {
  console.log('[LocationGuard] Verifying location access...');
  
  const locationResult = await getCurrentLocationForGuard();
  
  if (!locationResult.success) {
    return {
      allowed: false,
      message: locationResult.error,
      errorType: locationResult.errorType,
    };
  }

  const { latitude, longitude } = locationResult.location;
  console.log(`[LocationGuard] User location: ${latitude}, ${longitude}`);
  
  const withinArea = isWithinAllowedArea(latitude, longitude);
  
  if (!withinArea) {
    console.log(`[LocationGuard] User is OUTSIDE allowed area (${ALLOWED_BOUNDS.name})`);
    return {
      allowed: false,
      message: `This app is restricted to ${ALLOWED_BOUNDS.name} area only. Your current location is outside the allowed service area.`,
      errorType: 'OUTSIDE_AREA',
      location: { latitude, longitude },
    };
  }

  console.log(`[LocationGuard] User is within allowed area (${ALLOWED_BOUNDS.name})`);
  return {
    allowed: true,
    location: { latitude, longitude },
  };
};

/**
 * Show appropriate alert based on error type
 */
export const showLocationErrorAlert = (errorType, message, onRetry) => {
  switch (errorType) {
    case 'SERVICE_DISABLED':
      Alert.alert(
        'Location Required',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Open Settings', 
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }
          },
          { text: 'Retry', onPress: onRetry },
        ]
      );
      break;
      
    case 'PERMISSION_DENIED':
      Alert.alert(
        'Permission Required',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Open Settings', 
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }
          },
          { text: 'Retry', onPress: onRetry },
        ]
      );
      break;
      
    case 'OUTSIDE_AREA':
      Alert.alert(
        'Access Restricted',
        message,
        [
          { text: 'Retry', onPress: onRetry },
        ]
      );
      break;
      
    default:
      Alert.alert(
        'Location Error',
        message,
        [
          { text: 'Retry', onPress: onRetry },
        ]
      );
  }
};

/**
 * Get the name of the allowed area
 */
export const getAllowedAreaName = () => ALLOWED_BOUNDS.name;

/**
 * Get the bounds of the allowed area (for debugging/display)
 */
export const getAllowedBounds = () => ({ ...ALLOWED_BOUNDS });
