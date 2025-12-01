
import React, { useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Alert } from 'react-native';
import { observer } from 'mobx-react-lite';
import { useAuthStore } from '../stores/RootStore';
import { startLocationTracking } from '../services/locationTracker';
import styles from '../styles/LoginStyles';

const LoginScreen = observer(({ navigation }) => {
  const authStore = useAuthStore();

  // Load saved credentials on mount
  useEffect(() => {
    authStore.loadSavedCredentials();
  }, []);

  const handleLogin = async () => {
    console.log('=== handleLogin called ===');
    console.log('userId:', authStore.userId);
    console.log('password:', authStore.password ? '***' : '(empty)');
    
    if (!authStore.userId || !authStore.password) {
      Alert.alert('Missing fields', 'Please enter your user ID and password.');
      return;
    }
    
    try {
      console.log('Calling authStore.handleLogin...');
      await authStore.handleLogin();
      console.log('authStore.handleLogin completed successfully');
      
      // Start background location tracking silently
      try {
        console.log('Starting location tracking...');
        startLocationTracking();
      } catch (trackingError) {
        console.warn('Location tracking failed to start:', trackingError);
        // Continue anyway - location tracking is optional
      }
      
      // Small delay to allow stores to settle
      await new Promise(resolve => setTimeout(resolve, 150));
      
      console.log('Navigating to MainTabs...');
      try {
        navigation.replace('MainTabs');
      } catch (navError) {
        console.error('Navigation error:', navError);
        // Fallback: try regular navigate instead of replace
        navigation.navigate('MainTabs');
      }
    } catch (error) {
      console.error('Login error in handleLogin:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Invalid credentials';
      Alert.alert('Login Failed', errorMessage);
    }
  };

  return (
    <LinearGradient
      colors={['#1e5a8e', '#2d7ab8', '#3a8ec9']}
      style={styles.gradient}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card Container */}
          <View style={styles.card}>
            {/* Logo */}
            <Image
              source={require('../assets/DCWD LOGO.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            {/* Welcome Text */}
            <Text style={styles.welcomeText}>WELCOME BACK</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            {/* User ID Input */}
            <View style={[
              styles.inputContainer,
              authStore.focusedField === 'userId' && styles.inputContainerFocused
            ]}>
              <Ionicons 
                name="person-outline" 
                size={20} 
                color={authStore.focusedField === 'userId' ? '#1e5a8e' : '#9aa5b1'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="User ID"
                placeholderTextColor="#9aa5b1"
                value={authStore.userId}
                onChangeText={authStore.setUserId}
                autoCapitalize="none"
                onFocus={() => authStore.setFocusedField('userId')}
                onBlur={() => authStore.setFocusedField(null)}
              />
            </View>

            {/* Password Input */}
            <View style={[
              styles.inputContainer,
              authStore.focusedField === 'password' && styles.inputContainerFocused
            ]}>
              <Ionicons 
                name="lock-closed-outline" 
                size={20} 
                color={authStore.focusedField === 'password' ? '#1e5a8e' : '#9aa5b1'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9aa5b1"
                value={authStore.password}
                onChangeText={authStore.setPassword}
                secureTextEntry={!authStore.showPassword}
                autoCapitalize="none"
                onFocus={() => authStore.setFocusedField('password')}
                onBlur={() => authStore.setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => authStore.toggleShowPassword()}>
                <Ionicons 
                  name={authStore.showPassword ? 'eye-outline' : 'eye-off-outline'} 
                  size={20} 
                  color="#9aa5b1" 
                />
              </TouchableOpacity>
            </View>

            {/* Remember Me Checkbox */}
            <TouchableOpacity 
              style={styles.rememberMeContainer}
              onPress={() => authStore.toggleRememberMe()}
              activeOpacity={0.7}
            >
              <View style={styles.checkbox}>
                {authStore.rememberMe && (
                  <Ionicons name="checkmark" size={16} color="#1e5a8e" />
                )}
              </View>
              <Text style={styles.rememberMeText}>Remember Me</Text>
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity 
              style={styles.loginButton}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#1e5a8e', '#2d7ab8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                <Text style={styles.loginButtonText}>{authStore.loading ? 'Signing in...' : 'LOGIN'}</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>© DAVAO CITY WATER DISTRICT 2025</Text>
            <Text style={styles.versionText}>
              ver. {Constants.expoConfig?.version || '1.0.0'}
              { (Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber) ? ` (b.${Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber})` : '' }
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
});

export default LoginScreen;
