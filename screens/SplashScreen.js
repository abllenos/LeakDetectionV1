import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Animated, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Constants from 'expo-constants';
import { observer } from 'mobx-react-lite';
import { useAuthStore } from '../stores/RootStore';
import { startLocationTracking } from '../services/locationTracker';
import { verifyLocationAccess, showLocationErrorAlert, getAllowedAreaName } from '../services/locationGuard';

const { width, height } = Dimensions.get('window');
const AnimatedPath = Animated.createAnimatedComponent(Path);

const SplashScreen = observer(({ navigation }) => {
  const authStore = useAuthStore();
  const [locationStatus, setLocationStatus] = useState('checking'); // 'checking', 'allowed', 'denied'
  const [statusMessage, setStatusMessage] = useState('Verifying location...');
  const wave1Anim = useRef(new Animated.Value(0)).current;
  const wave2Anim = useRef(new Animated.Value(0)).current;
  const wave3Anim = useRef(new Animated.Value(0)).current;

  const checkLocationAndAuth = async () => {
    setLocationStatus('checking');
    setStatusMessage('Verifying location...');
    
    // First, verify location access
    console.log('[SplashScreen] Checking location access...');
    const locationResult = await verifyLocationAccess();
    
    if (!locationResult.allowed) {
      console.log('[SplashScreen] Location access denied:', locationResult.errorType);
      setLocationStatus('denied');
      setStatusMessage(locationResult.message);
      
      // Show alert with retry option
      showLocationErrorAlert(
        locationResult.errorType,
        locationResult.message,
        () => checkLocationAndAuth() // Retry callback
      );
      return;
    }
    
    console.log('[SplashScreen] Location verified, checking authentication...');
    setLocationStatus('allowed');
    setStatusMessage('Location verified. Checking login...');
    
    // Location is allowed, now check authentication
    try {
      const isAuthenticated = await authStore.checkAutoLogin();
      if (isAuthenticated) {
        console.log('[SplashScreen] User authenticated, navigating to MainTabs');
        setStatusMessage('Welcome back!');
        // Start location tracking for authenticated users
        try {
          startLocationTracking();
        } catch (trackingError) {
          console.warn('Location tracking failed to start:', trackingError);
        }
        // Navigate after brief delay
        setTimeout(() => {
          navigation.replace('MainTabs');
        }, 1500);
      } else {
        console.log('[SplashScreen] No valid session found, navigating to Login');
        setStatusMessage('Please log in');
        // Navigate to Login
        setTimeout(() => {
          navigation.replace('Login');
        }, 1500);
      }
    } catch (error) {
      console.error('[SplashScreen] Auth check error:', error);
      setStatusMessage('Please log in');
      // Navigate to Login on error
      setTimeout(() => {
        navigation.replace('Login');
      }, 2000);
    }
  };

  useEffect(() => {
    // Start location and auth check
    checkLocationAndAuth();

    // Create wave animations with different speeds
    const createWaveAnimation = (animValue, duration) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Start animations with different speeds for each wave
    createWaveAnimation(wave1Anim, 3000).start();
    createWaveAnimation(wave2Anim, 4000).start();
    createWaveAnimation(wave3Anim, 5000).start();
  }, []);

  // Interpolate animation values for wave movement
  const wave1Offset = wave1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
  });

  const wave2Offset = wave2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -15],
  });

  const wave3Offset = wave3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 10],
  });

  return (
    <View style={styles.container}>
      {/* Top Section with Logo and Title */}
      <View style={styles.content}>
        <Image
          source={require('../assets/DCWD LOGO.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>DCWD LEAK DETECTION APP</Text>
        
        {/* Status indicator */}
        <View style={styles.statusContainer}>
          {locationStatus === 'checking' && (
            <ActivityIndicator size="small" color="#1e5a8e" style={{ marginBottom: 8 }} />
          )}
          {locationStatus === 'allowed' && (
            <Text style={styles.statusIcon}>✓</Text>
          )}
          {locationStatus === 'denied' && (
            <Text style={[styles.statusIcon, { color: '#ef4444' }]}>✗</Text>
          )}
          <Text style={[
            styles.statusText,
            locationStatus === 'denied' && { color: '#ef4444' }
          ]}>
            {statusMessage}
          </Text>
        </View>
      </View>

      {/* Wave Design at Bottom */}
      <View style={styles.waveContainer}>
        {/* First wave - dark blue */}
        <Animated.View style={[styles.waveLayer, { transform: [{ translateY: wave1Offset }] }]}>
          <Svg height="200" width={width * 2} viewBox={`0 0 ${width * 2} 200`} style={{ position: 'absolute', bottom: 0 }}>
            <Path
              d={`M0,80 C${width * 0.2},60 ${width * 0.3},100 ${width * 0.5},90 C${width * 0.7},80 ${width * 0.8},70 ${width},80 C${width * 1.2},90 ${width * 1.3},60 ${width * 1.5},70 C${width * 1.7},80 ${width * 1.8},90 ${width * 2},80 L${width * 2},200 L0,200 Z`}
              fill="#1e5a8e"
              opacity="0.8"
            />
          </Svg>
        </Animated.View>
        
        {/* Second wave - medium blue */}
        <Animated.View style={[styles.waveLayer, { transform: [{ translateY: wave2Offset }] }]}>
          <Svg height="200" width={width * 2} viewBox={`0 0 ${width * 2} 200`} style={{ position: 'absolute', bottom: 0 }}>
            <Path
              d={`M0,100 C${width * 0.15},85 ${width * 0.35},115 ${width * 0.5},105 C${width * 0.65},95 ${width * 0.85},110 ${width},100 C${width * 1.15},90 ${width * 1.35},105 ${width * 1.5},95 C${width * 1.65},85 ${width * 1.85},100 ${width * 2},100 L${width * 2},200 L0,200 Z`}
              fill="#4a8ec2"
              opacity="0.7"
            />
          </Svg>
        </Animated.View>
        
        {/* Third wave - light blue */}
        <Animated.View style={[styles.waveLayer, { transform: [{ translateY: wave3Offset }] }]}>
          <Svg height="200" width={width * 2} viewBox={`0 0 ${width * 2} 200`} style={{ position: 'absolute', bottom: 0 }}>
            <Path
              d={`M0,130 C${width * 0.25},120 ${width * 0.4},140 ${width * 0.5},130 C${width * 0.6},120 ${width * 0.75},135 ${width},130 C${width * 1.25},125 ${width * 1.4},140 ${width * 1.5},130 C${width * 1.6},120 ${width * 1.75},135 ${width * 2},130 L${width * 2},200 L0,200 Z`}
              fill="#a8d5f7"
              opacity="0.6"
            />
          </Svg>
        </Animated.View>
      </View>

      {/* Footer Text */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© DAVAO CITY WATER DISTRICT 2025</Text>
        <Text style={styles.versionText}>
          ver. {Constants.expoConfig?.version || '2.0.0'}
          {(Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber) ? ` (b.${Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber})` : ''}
        </Text>
      </View>
    </View>
  );
});

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 80, // add space above the wave
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e3a5f',
    textAlign: 'center',
    letterSpacing: 1,
  },
  statusContainer: {
    marginTop: 30,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statusIcon: {
    fontSize: 24,
    color: '#10b981',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  waveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    overflow: 'hidden',
    zIndex: 1,
  },
  waveLayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: 200,
  },
  wave: {
    position: 'absolute',
    bottom: 0,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    width: '100%',
    alignItems: 'center',
    zIndex: 10,
  },
  footerText: {
    fontSize: 12,
    color: '#1e3a5f',
    fontWeight: '600',
  },
  versionText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
});
