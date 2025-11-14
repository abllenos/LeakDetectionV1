import { makeObservable, observable, action, runInAction } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login, logout } from '../services/interceptor';

class AuthStore {
  constructor() {
    this.userId = '';
    this.password = '';
    this.showPassword = false;
    this.rememberMe = false;
    this.focusedField = null;
    this.loading = false;
    this.userData = null;
    this.isAuthenticated = false;
    
    makeObservable(this, {
      userId: observable,
      password: observable,
      showPassword: observable,
      rememberMe: observable,
      focusedField: observable,
      loading: observable,
      userData: observable,
      isAuthenticated: observable,
      setUserId: action,
      setPassword: action,
      toggleShowPassword: action,
      toggleRememberMe: action,
      setFocusedField: action,
      handleLogin: action,
      handleLogout: action,
      loadSavedCredentials: action,
      checkAutoLogin: action,
    });
  }

  // Actions
  setUserId = (value) => {
    this.userId = value;
  }

  setPassword = (value) => {
    this.password = value;
  }

  toggleShowPassword = () => {
    this.showPassword = !this.showPassword;
  }

  toggleRememberMe = () => {
    this.rememberMe = !this.rememberMe;
  }
  
  setFocusedField = (field) => {
    this.focusedField = field;
  }

  async loadSavedCredentials() {
    try {
      const [savedUserId, savedPassword, remembered] = await Promise.all([
        AsyncStorage.getItem('rememberedUserId'),
        AsyncStorage.getItem('rememberedPassword'),
        AsyncStorage.getItem('rememberMe'),
      ]);

      runInAction(() => {
        if (remembered === 'true' && savedUserId && savedPassword) {
          this.userId = savedUserId;
          this.password = savedPassword;
          this.rememberMe = true;
        }
      });
    } catch (error) {
      console.error('Failed to load saved credentials:', error);
    }
  }

  async checkAutoLogin() {
    try {
      console.log('[AuthStore] Checking for auto-login...');
      const [token, userData] = await Promise.all([
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('userData'),
      ]);

      if (token && userData) {
        console.log('[AuthStore] Valid token found, auto-login successful');
        runInAction(() => {
          this.userData = JSON.parse(userData);
          this.isAuthenticated = true;
        });
        return true;
      } else {
        console.log('[AuthStore] No valid token found');
        return false;
      }
    } catch (error) {
      console.error('[AuthStore] Auto-login check error:', error);
      return false;
    }
  }

  async handleLogin() {
    this.loading = true;
    try {
      console.log('[AuthStore] Starting login...');
      const userData = await login(this.userId, this.password);
      console.log('[AuthStore] Login API successful, userData:', userData);
      
      runInAction(() => {
        this.userData = userData;
        this.isAuthenticated = true;
      });

      // Save credentials if Remember Me is checked
      if (this.rememberMe) {
        await AsyncStorage.multiSet([
          ['rememberedUserId', this.userId],
          ['rememberedPassword', this.password],
          ['rememberMe', 'true'],
        ]);
      } else {
        await AsyncStorage.multiRemove(['rememberedUserId', 'rememberedPassword', 'rememberMe']);
      }

      // Small delay to ensure AsyncStorage writes complete
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('[AuthStore] Login completed successfully');
      
      return true;
    } catch (error) {
      console.error('[AuthStore] Login error:', error);
      throw error;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async handleLogout() {
    try {
      await logout();
      runInAction(() => {
        this.userData = null;
        this.isAuthenticated = false;
        this.password = '';
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  reset() {
    this.userId = '';
    this.password = '';
    this.showPassword = false;
    this.rememberMe = false;
    this.focusedField = null;
    this.loading = false;
  }
}

export default AuthStore;
