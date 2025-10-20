import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  StyleSheet, 
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login } from '../services/api';
import { Alert } from 'react-native';
import { startLocationTracking } from '../services/locationTracker';

export default function LoginScreen({ navigation }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load saved credentials on mount
  useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const savedUserId = await AsyncStorage.getItem('rememberedUserId');
      const savedPassword = await AsyncStorage.getItem('rememberedPassword');
      const remembered = await AsyncStorage.getItem('rememberMe');
      
      if (remembered === 'true' && savedUserId && savedPassword) {
        setUserId(savedUserId);
        setPassword(savedPassword);
        setRememberMe(true);
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  };

  const handleLogin = async () => {
    if (!userId || !password) {
      Alert.alert('Missing fields', 'Please enter your user ID and password.');
      return;
    }
    setLoading(true);
    try {
      const userData = await login(userId, password);
      
      // Save credentials if Remember Me is checked
      if (rememberMe) {
        await AsyncStorage.setItem('rememberedUserId', userId);
        await AsyncStorage.setItem('rememberedPassword', password);
        await AsyncStorage.setItem('rememberMe', 'true');
      } else {
        // Clear saved credentials if Remember Me is unchecked
        await AsyncStorage.removeItem('rememberedUserId');
        await AsyncStorage.removeItem('rememberedPassword');
        await AsyncStorage.removeItem('rememberMe');
      }
      
      // Start background location tracking silently
      startLocationTracking();
      
      navigation.replace('MainTabs');
    } catch (error) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    } finally {
      setLoading(false);
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
              focusedField === 'userId' && styles.inputContainerFocused
            ]}>
              <Ionicons 
                name="person-outline" 
                size={20} 
                color={focusedField === 'userId' ? '#1e5a8e' : '#9aa5b1'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="User ID"
                placeholderTextColor="#9aa5b1"
                value={userId}
                onChangeText={setUserId}
                autoCapitalize="none"
                onFocus={() => setFocusedField('userId')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {/* Password Input */}
            <View style={[
              styles.inputContainer,
              focusedField === 'password' && styles.inputContainerFocused
            ]}>
              <Ionicons 
                name="lock-closed-outline" 
                size={20} 
                color={focusedField === 'password' ? '#1e5a8e' : '#9aa5b1'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9aa5b1"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons 
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
                  size={20} 
                  color="#9aa5b1" 
                />
              </TouchableOpacity>
            </View>

            {/* Remember Me Checkbox */}
            <TouchableOpacity 
              style={styles.rememberMeContainer}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <View style={styles.checkbox}>
                {rememberMe && (
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
                <Text style={styles.loginButtonText}>{loading ? 'Signing in...' : 'LOGIN'}</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>© DAVAO CITY WATER DISTRICT 2021</Text>
            <Text style={styles.versionText}>
              ver. {Constants.expoConfig?.version || '1.0.0'}
              { (Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber) ? ` (b.${Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber})` : '' }
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1e3a5f',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  inputContainerFocused: {
    borderColor: '#1e5a8e',
    backgroundColor: '#fff',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#1e5a8e',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  rememberMeText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#1e5a8e',
    fontSize: 13,
    fontWeight: '600',
  },
  loginButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#1e5a8e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  versionText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
});
