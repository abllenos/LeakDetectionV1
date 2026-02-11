import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { API_BASE } from '../services/interceptor';
import { logout } from '../services/interceptor';
import { stopLocationTracking } from '../services/locationTracker';
import { forceCheckNewData } from '../services/dataChecker';
import updateChecker from '../services/updateChecker';
import VersionCheck from 'react-native-version-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { observer } from 'mobx-react-lite';
import { useSettingsStore, useOfflineStore, useDownloadStore } from '../stores/RootStore';
import MapStore from '../stores/MapStore';
import NotificationBanner from '../components/NotificationBanner';
import { useFocusEffect } from '@react-navigation/native';
import styles from '../styles/SettingsStyles';
import GisCustomerInterceptor from '../services/gisCustomerInterceptor';

const MAP_URL = 'https://davao-water.gov.ph/dcwdApps/mobileApps/reactMap/davroad.zip';
const OFFLINE_MAP_KEY = '@offline_map_enabled';

const SettingsScreen = observer(({ navigation }) => {
  const store = useSettingsStore();
  const downloadStore = useDownloadStore();
  const offlineStore = useOfflineStore();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [buildNumber, setBuildNumber] = useState('');
  const [useOfflineMap, setUseOfflineMap] = useState(false);
  const [customerCount, setCustomerCount] = useState(0);

  // Get app version on mount
  useEffect(() => {
    try {
      const version = VersionCheck.getCurrentVersion();
      const build = VersionCheck.getCurrentBuildNumber();
      setAppVersion(version || 'Unknown');
      setBuildNumber(build || 'Unknown');
    } catch (error) {
      console.log('Error getting version:', error);
      setAppVersion(Constants.expoConfig?.version || '1.0.0');
      setBuildNumber(Constants.expoConfig?.android?.versionCode || '1');
    }
  }, []);

  // Load offline map preference
  useEffect(() => {
    loadOfflineMapPreference();
  }, []);

  const loadOfflineMapPreference = async () => {
    try {
      const savedPreference = await AsyncStorage.getItem(OFFLINE_MAP_KEY);
      if (savedPreference !== null) {
        setUseOfflineMap(savedPreference === 'true');
      }
    } catch (error) {
      console.log('Error loading offline map preference:', error);
    }
  };

  const toggleOfflineMap = async (value) => {
    try {
      setUseOfflineMap(value);
      await AsyncStorage.setItem(OFFLINE_MAP_KEY, value.toString());
      console.log('Offline map preference saved:', value);
    } catch (error) {
      console.log('Error saving offline map preference:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  // Helper function to calculate remaining time before auto-logout
  const getRemainingTimeText = () => {
    if (offlineStore.isOnline) return 'N/A (Currently online)';
    if (!offlineStore.lastOnlineTime) return 'N/A';

    const OFFLINE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
    const offlineDuration = Date.now() - offlineStore.lastOnlineTime;
    const remainingMs = OFFLINE_TIMEOUT_MS - offlineDuration;

    if (remainingMs <= 0) return 'Session expired';

    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  // Check customer data status
  const checkCustomerStatus = async () => {
    const count = await GisCustomerInterceptor.getCustomerCount();
    setCustomerCount(count);
  };

  useEffect(() => {
    checkCustomerStatus();
    store.loadPreset();

    const interval = setInterval(() => {
      checkCustomerStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      checkCustomerStatus();
    }, [])
  );

  const handleLogout = () => store.setLogoutModalVisible(true);

  const confirmLogout = async () => {
    stopLocationTracking();
    await logout();
    store.setLogoutModalVisible(false);
    navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
  };

  const cancelLogout = () => store.setLogoutModalVisible(false);

  const handleDownloadMap = async () => {
    Alert.alert(
      'Download Map',
      'This will download the offline map in the background. You can continue using your device.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Download',
          onPress: async () => {
            await requestNotificationPermissions();
            await showNotification(
              '📥 Map Download Started',
              'Downloading Davao Roads offline map...'
            );

            // Start download in background
            MapStore.initializeMap(MAP_URL, showNotification);
          }
        }
      ]
    );
  };

  const handleClearMap = async () => {
    Alert.alert(
      'Clear Map Data',
      'This will delete all downloaded map files. You will need to download again to use offline maps.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await MapStore.clearMapData();
            await showNotification(
              '🗑️ Map Data Cleared',
              'All offline map data has been removed.'
            );
          }
        }
      ]
    );
  };

  const requestNotificationPermissions = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted, will show in-app progress only');
      }
    } catch (error) {
      console.log('Notifications not available:', error.message);
    }
  };

  const showNotification = async (title, body, progress = null) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { progress },
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.log('Notification not shown:', error.message);
      // Silently fail - app will still show progress in-app
    }
  };

  const getMapStatusText = () => {
    if (MapStore.isReady) return 'Downloaded';
    if (MapStore.isDownloading || MapStore.isUnzipping) return 'Downloading...';
    return 'Not Downloaded';
  };

  const getMapStatusColor = () => {
    if (MapStore.isReady) return '#d1fae5';
    if (MapStore.isDownloading || MapStore.isUnzipping) return '#fef3c7';
    return '#fee2e2';
  };

  const getMapStatusTextColor = () => {
    if (MapStore.isReady) return '#059669';
    if (MapStore.isDownloading || MapStore.isUnzipping) return '#d97706';
    return '#dc2626';
  };

  const handleClearCustomers = async () => {
    Alert.alert(
      'Clear Customer Data',
      'Are you sure you want to delete all offline customer data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await GisCustomerInterceptor.clearDatabase();
            setCustomerCount(0);
            checkCustomerStatus();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      <LinearGradient colors={["#1e5a8e", "#2d7ab8"]} style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>App configuration and preferences</Text>
        </View>
        <View style={styles.iconWrap}>
          <Ionicons name="settings" size={22} color="#fff" />
        </View>
      </LinearGradient>

      <NotificationBanner />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Offline Maps Card with download progress and controls */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="map" size={18} color="#1e5a8e" />
            <Text style={styles.cardTitle}>  Offline Maps</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Map Status:</Text>
            <View style={[styles.statusBadge, { backgroundColor: getMapStatusColor() }]}>
              <Text style={[styles.statusText, { color: getMapStatusTextColor() }]}>
                {getMapStatusText()}
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Current Mode:</Text>
            <View style={[styles.statusBadge, { backgroundColor: (offlineStore.isOnline && !useOfflineMap) ? '#d1fae5' : (useOfflineMap && MapStore.isReady ? '#d1fae5' : '#fee2e2') }]}>
              <Text style={[styles.statusText, { color: (offlineStore.isOnline && !useOfflineMap) ? '#059669' : (useOfflineMap && MapStore.isReady ? '#059669' : '#dc2626') }]}>
                {useOfflineMap && MapStore.isReady ? 'Using Offline Tiles' : (offlineStore.isOnline ? 'Using Online Tiles' : 'No Connection')}
              </Text>
            </View>
          </View>

          {/* Offline Map Toggle - Only show when map is ready */}
          {MapStore.isReady && !MapStore.isDownloading && !MapStore.isUnzipping && (
            <View style={styles.row}>
              <Text style={styles.label}>Use Offline Map</Text>
              <Switch
                value={useOfflineMap}
                onValueChange={toggleOfflineMap}
                trackColor={{ false: '#d1d1d6', true: '#34C759' }}
                thumbColor={useOfflineMap ? '#fff' : '#f4f3f4'}
                ios_backgroundColor="#d1d1d6"
              />
            </View>
          )}

          {/* Download Progress */}
          {(MapStore.isDownloading || MapStore.isUnzipping) && (
            <View style={{ marginTop: 16 }}>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${MapStore.downloadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {MapStore.statusMessage}
              </Text>

            </View>
          )}

          {/* Download Map Button */}
          {!MapStore.isDownloading && !MapStore.isUnzipping && (
            <TouchableOpacity
              style={styles.primaryBtnFull}
              onPress={handleDownloadMap}
            >
              <Ionicons name="download-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>
                {MapStore.isReady ? 'Re-download Map' : 'Download Map'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Clear Map Button */}
          <TouchableOpacity
            style={[styles.outlineBtnFullSpaced, !MapStore.isReady && { opacity: 0.5 }]}
            onPress={handleClearMap}
            disabled={!MapStore.isReady || MapStore.isDownloading || MapStore.isUnzipping}
          >
            <Text style={styles.outlineBtnText}>Clear Map Data</Text>
          </TouchableOpacity>
        </View>

        {/* Customer Data Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="people" size={18} color="#1e5a8e" />
            <Text style={styles.cardTitle}>  Customer Data</Text>
          </View>

          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.smallLabel}>Cached Records:</Text>
              <Text style={styles.valueText}>{customerCount.toLocaleString()}</Text>
            </View>
            <View>
              <Text style={styles.smallLabel}>Status:</Text>
              <Text style={styles.valueText}>
                {customerCount > 0 ? 'Downloaded' : 'Not Available'}
              </Text>
            </View>
          </View>

          {customerCount > 0 && (
            <TouchableOpacity
              style={styles.clearDataButton}
              onPress={handleClearCustomers}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.clearDataGradient}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.clearDataButtonText}>Clear Customer Data</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Offline Queue Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="cloud-offline" size={18} color="#1e5a8e" />
            <Text style={styles.cardTitle}>  Offline Queue</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Network Status:</Text>
            <View style={[styles.statusBadge, { backgroundColor: offlineStore.isOnline ? '#d1fae5' : '#fee2e2' }]}>
              <Text style={[styles.statusText, { color: offlineStore.isOnline ? '#059669' : '#dc2626' }]}>
                {offlineStore.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.smallLabel}>Pending Items:</Text>
              <Text style={styles.valueText}>{offlineStore.pendingCount}</Text>
            </View>
            <View>
              <Text style={styles.smallLabel}>Failed Items:</Text>
              <Text style={styles.valueText}>{offlineStore.failedCount}</Text>
            </View>
            <View>
              <Text style={styles.smallLabel}>Last Sync:</Text>
              <Text style={styles.valueText}>
                {offlineStore.lastSyncTime ? new Date(offlineStore.lastSyncTime).toLocaleTimeString() : 'Never'}
              </Text>
            </View>
          </View>

          {/* Auto-logout warning when offline */}
          {!offlineStore.isOnline && offlineStore.lastOnlineTime && (
            <View style={styles.offlineWarningBox}>
              <Ionicons name="warning" size={16} color="#f59e0b" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.offlineWarningTitle}>Auto-logout Timer</Text>
                <Text style={styles.offlineWarningText}>
                  You will be automatically logged out in {getRemainingTimeText()} if you remain offline. Please connect to the internet to reset the timer.
                </Text>
              </View>
            </View>
          )}

          {/* Auto-sync info when offline with pending items */}
          {!offlineStore.isOnline && offlineStore.pendingCount > 0 && (
            <View style={[styles.offlineWarningBox, { backgroundColor: '#eff6ff', borderColor: '#3b82f6' }]}>
              <Ionicons name="cloud-upload-outline" size={16} color="#3b82f6" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.offlineWarningTitle, { color: '#1e40af' }]}>Auto-Sync Enabled</Text>
                <Text style={[styles.offlineWarningText, { color: '#1e40af' }]}>
                  {offlineStore.pendingCount} item(s) will automatically sync when you reconnect to the internet.
                </Text>
              </View>
            </View>
          )}

          {offlineStore.isSyncing && (
            <View style={styles.syncProgressWrap}>
              <ActivityIndicator size="small" color="#1e5a8e" />
              <Text style={styles.syncProgressText}>Syncing... {offlineStore.syncProgress}%</Text>
            </View>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1 }]}
              onPress={() => offlineStore.startSync()}
              disabled={!offlineStore.isOnline || offlineStore.isSyncing || offlineStore.pendingCount === 0}
            >
              {offlineStore.isSyncing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sync" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Sync Now</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => offlineStore.retryFailed()}
              disabled={offlineStore.failedCount === 0 || offlineStore.isSyncing}
            >
              <Text style={styles.outlineBtnText}>Retry Failed</Text>
            </TouchableOpacity>
          </View>

          {(offlineStore.pendingCount > 0 || offlineStore.failedCount > 0) && (
            <TouchableOpacity
              style={[styles.outlineBtnFull, { borderColor: '#ef4444', marginTop: 8 }]}
              onPress={() => {
                Alert.alert(
                  'Clear Queue',
                  'Are you sure you want to clear all pending and failed items? This action cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => offlineStore.clearAllQueue()
                    }
                  ]
                );
              }}
            >
              <Text style={[styles.outlineBtnText, { color: '#ef4444' }]}>Clear Queue</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* General Settings */}
        <View style={styles.cardLight}>
          <Text style={styles.cardTitle}>General Settings</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>App Version</Text>
            <Text style={styles.metaValue}>{appVersion}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Build Number</Text>
            <Text style={styles.metaValue}>{buildNumber}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Last Updated</Text>
            <Text style={styles.metaValue}>{new Date().toLocaleDateString()}</Text>
          </View>

          {/* Check for Updates Button */}
          <TouchableOpacity
            style={[styles.outlineBtn, { marginTop: 15, borderColor: '#3b82f6', opacity: checkingUpdate ? 0.6 : 1 }]}
            disabled={checkingUpdate}
            onPress={async () => {
              setCheckingUpdate(true);
              try {
                const result = await updateChecker.checkForUpdate(true, false);
                if (result.error) {
                  Alert.alert('Error', 'Could not check for updates. Please try again later.');
                } else if (result.updateAvailable) {
                  Alert.alert(
                    '🆕 Update Available',
                    `A new version (${result.latestVersion}) is available!\n\nYour version: ${result.currentVersion}`,
                    [
                      { text: 'Later', style: 'cancel', onPress: () => updateChecker.dismissVersion(result.latestVersion) },
                      { text: 'Update', onPress: () => updateChecker.openStore() },
                    ]
                  );
                } else {
                  Alert.alert('✅ Up to Date', `You're running the latest version (${result.currentVersion}).`);
                }
              } catch (error) {
                Alert.alert('Error', 'Could not check for updates. Please try again later.');
              } finally {
                setCheckingUpdate(false);
              }
            }}
          >
            {checkingUpdate ? (
              <>
                <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 6 }} />
                <Text style={[styles.outlineBtnText, { color: '#3b82f6' }]}>Checking...</Text>
              </>
            ) : (
              <>
                <Ionicons name="refresh-outline" size={18} color="#3b82f6" style={{ marginRight: 6 }} />
                <Text style={[styles.outlineBtnText, { color: '#3b82f6' }]}>Check for Updates</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Logout Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={store.logoutModalVisible}
        onRequestClose={cancelLogout}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Icon */}
            <View style={styles.modalIconContainer}>
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                style={styles.modalIconGradient}
              >
                <Ionicons name="log-out-outline" size={40} color="#fff" />
              </LinearGradient>
            </View>

            {/* Title */}
            <Text style={styles.modalTitle}>Logout</Text>

            {/* Message */}
            <Text style={styles.modalMessage}>
              Are you sure you want to logout?{'\n'}
              You will need to login again to access the app.
            </Text>

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={cancelLogout}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmLogout}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#ef4444', '#dc2626']}
                  style={styles.modalConfirmGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.modalConfirmText}>Yes, Logout</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

export default SettingsScreen;
