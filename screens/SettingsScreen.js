import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  Switch,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { logout } from '../services/interceptor';
import { stopLocationTracking } from '../services/locationTracker';
import updateChecker from '../services/updateChecker';
import VersionCheck from 'react-native-version-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { observer } from 'mobx-react-lite';
import { useSettingsStore, useOfflineStore } from '../stores/RootStore';
import MapStore from '../stores/MapStore';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { settingsStyles as styles } from '../settingstheme';
import GisCustomerInterceptor from '../services/gisCustomerInterceptor';

const MAP_URL = 'https://davao-water.gov.ph/dcwdApps/mobileApps/reactMap/davroad.zip';
const OFFLINE_MAP_KEY = '@offline_map_enabled';

const SettingsScreen = observer(({ navigation }) => {
  const insets = useSafeAreaInsets();
  const store = useSettingsStore();
  const offlineStore = useOfflineStore();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [buildNumber, setBuildNumber] = useState('');
  const [useOfflineMap, setUseOfflineMap] = useState(false);
  const [customerCount, setCustomerCount] = useState(0);
  const [isGisDownloading, setIsGisDownloading] = useState(false);
  const [gisDownloadProgress, setGisDownloadProgress] = useState(0);
  const [gisTotalRecords, setGisTotalRecords] = useState(0);
  const [gisStatus, setGisStatus] = useState('downloading');

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
            // Start download in background
            MapStore.initializeMap(MAP_URL);
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
          }
        }
      ]
    );
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

  const startGisDownload = async () => {
    setIsGisDownloading(true);
    setGisStatus('downloading');
    try {
      const result = await GisCustomerInterceptor.downloadAndSaveCustomers((progress, totalPages, totalRecords, status) => {
        setGisDownloadProgress(progress);
        setGisTotalRecords(totalRecords);
        if (status) setGisStatus(status);
      });
      if (result.success) {
        checkCustomerStatus();
        Alert.alert('Success', 'Customer data downloaded successfully.');
      } else {
        Alert.alert('Download Error', result.error || 'Failed to download customer data.');
      }
    } catch (error) {
      Alert.alert('Download Error', 'Failed to download customer data.');
    } finally {
      setIsGisDownloading(false);
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f4f6" translucent />
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 10 }]}>
        <View>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>App configuration and preferences</Text>
        </View>
        <View style={styles.headerIcon}><Ionicons name="settings" size={22} color="#111827" /></View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Offline Maps Card with download progress and controls */}
        <View style={styles.sheet}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.detailIcon}><Ionicons name="map-outline" size={18} color="#1f3a8a" /></View>
            <Text style={styles.sheetTitle}>Offline Maps</Text>
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Map Status:</Text>
              <Text style={[styles.itemValue, { color: getMapStatusTextColor() }]}>
                {getMapStatusText()}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Current Mode:</Text>
              <Text style={[styles.itemValue, { color: (offlineStore.isOnline && !useOfflineMap) ? '#059669' : (useOfflineMap && MapStore.isReady ? '#059669' : '#dc2626') }]}>
                {useOfflineMap && MapStore.isReady ? 'Using Offline Tiles' : (offlineStore.isOnline ? 'Using Online Tiles' : 'No Connection')}
              </Text>
            </View>
          </View>

          {/* Offline Map Toggle - Only show when map is ready */}
          {MapStore.isReady && !MapStore.isDownloading && !MapStore.isUnzipping && (
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Use Offline Map</Text>
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
            <View style={styles.progressSection}>
              <Text style={styles.progressLabel}>{MapStore.statusMessage}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${MapStore.downloadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{MapStore.downloadProgress}%</Text>
            </View>
          )}

          {/* Download Map Button */}
          {!MapStore.isDownloading && !MapStore.isUnzipping && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleDownloadMap}
            >
              <Ionicons name="download-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>
                {MapStore.isReady ? 'Re-download Map' : 'Download Map'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Clear Map Button */}
          {MapStore.isReady && !MapStore.isDownloading && !MapStore.isUnzipping && (
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearMap}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                <Text style={styles.clearBtnText}>Clear Map Data</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Customer Data Card */}
        <View style={styles.sheet}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.detailIcon}><Ionicons name="people-outline" size={18} color="#1f3a8a" /></View>
            <Text style={styles.sheetTitle}>Customer Data</Text>
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Cached Records:</Text>
              <Text style={styles.itemValue}>{customerCount.toLocaleString()}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Status:</Text>
              <Text style={styles.itemValue}>
                {customerCount > 0 ? 'Downloaded' : 'Not Available'}
              </Text>
            </View>
          </View>

          {customerCount > 0 ? (
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearCustomers}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                <Text style={styles.clearBtnText}>Clear Customer Data</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={startGisDownload}
              activeOpacity={0.7}
            >
              <Ionicons name="download-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Download Customer Data</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Offline Queue Card */}
        <View style={styles.sheet}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.detailIcon}><Ionicons name="cloud-offline-outline" size={18} color="#1f3a8a" /></View>
            <Text style={styles.sheetTitle}>Offline Queue</Text>
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Network Status:</Text>
              <Text style={[styles.itemValue, { color: offlineStore.isOnline ? '#059669' : '#dc2626' }]}>
                {offlineStore.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Pending Items:</Text>
              <Text style={styles.itemValue}>{offlineStore.pendingCount}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Failed Items:</Text>
              <Text style={styles.itemValue}>{offlineStore.failedCount}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Last Sync:</Text>
              <Text style={styles.itemValue}>
                {offlineStore.lastSyncTime ? new Date(offlineStore.lastSyncTime).toLocaleTimeString() : 'Never'}
              </Text>
            </View>
          </View>

          {/* Auto-logout warning when offline */}
          {!offlineStore.isOnline && offlineStore.lastOnlineTime && (
            <View style={[styles.itemRow, { backgroundColor: '#fffbeb', borderColor: '#fcd34d', borderWidth: 1 }]}>
              <Ionicons name="warning" size={16} color="#f59e0b" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#92400e', fontSize: 13 }}>Auto-logout Timer</Text>
                <Text style={{ color: '#b45309', fontSize: 12, marginTop: 2 }}>
                  You will be automatically logged out in {getRemainingTimeText()} if you remain offline. Please connect to the internet to reset the timer.
                </Text>
              </View>
            </View>
          )}

          {/* Auto-sync info when offline with pending items */}
          {!offlineStore.isOnline && offlineStore.pendingCount > 0 && (
            <View style={[styles.itemRow, { backgroundColor: '#eff6ff', borderColor: '#3b82f6', borderWidth: 1 }]}>
              <Ionicons name="cloud-upload-outline" size={16} color="#3b82f6" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#1e40af', fontSize: 13 }}>Auto-Sync Enabled</Text>
                <Text style={{ color: '#1e40af', fontSize: 12, marginTop: 2 }}>
                  {offlineStore.pendingCount} item(s) will automatically sync when you reconnect to the internet.
                </Text>
              </View>
            </View>
          )}

          {offlineStore.isSyncing && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#1e5a8e" />
              <Text style={styles.loadingText}>Syncing... {offlineStore.syncProgress}%</Text>
            </View>
          )}

          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => offlineStore.startSync()}
              disabled={!offlineStore.isOnline || offlineStore.isSyncing || offlineStore.pendingCount === 0}
            >
              {offlineStore.isSyncing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sync" size={16} color="#fff" />
                  <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>Sync Now</Text>
                </>
              )}
            </TouchableOpacity>

            {offlineStore.failedCount > 0 && !offlineStore.isSyncing && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#f59e0b', marginTop: 8 }]}
                onPress={() => offlineStore.retryFailed()}
              >
                <Text style={styles.primaryBtnText}>Retry Failed</Text>
              </TouchableOpacity>
            )}
          </View>

          {(offlineStore.pendingCount > 0 || offlineStore.failedCount > 0) && (
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={styles.clearBtn}
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
                <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                <Text style={styles.clearBtnText}>Clear Queue</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* General Settings */}
        <View style={styles.sheet}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.detailIcon}><Ionicons name="settings-outline" size={18} color="#1f3a8a" /></View>
            <Text style={styles.sheetTitle}>General Settings</Text>
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>App Version</Text>
              <Text style={styles.itemValue}>{appVersion}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Build Number</Text>
              <Text style={styles.itemValue}>{buildNumber}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>Last Updated</Text>
              <Text style={styles.itemValue}>{new Date().toLocaleDateString()}</Text>
            </View>
          </View>

          {/* Check for Updates Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#3b82f6', marginTop: 12 }]}
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
                <Text style={[styles.primaryBtnText, { color: '#3b82f6' }]}>Checking...</Text>
              </>
            ) : (
              <>
                <Ionicons name="refresh-outline" size={18} color="#3b82f6" style={{ marginRight: 6 }} />
                <Text style={[styles.primaryBtnText, { color: '#3b82f6' }]}>Check for Updates</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <View style={{ marginHorizontal: 16, marginTop: 24 }}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
          <Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 12, fontSize: 12 }}>
            Version {appVersion}
          </Text>
        </View>
      </ScrollView>

      {/* Logout Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={store.logoutModalVisible}
        onRequestClose={cancelLogout}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '85%', alignItems: 'center' }}>
            {/* Icon */}
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="log-out-outline" size={32} color="#ef4444" />
            </View>

            {/* Title */}
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 }}>Logout</Text>

            {/* Message */}
            <Text style={{ fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 24 }}>
              Are you sure you want to logout?{'\n'}
              You will need to login again to access the app.
            </Text>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                onPress={cancelLogout}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#4b5563', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center' }}
                onPress={confirmLogout}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Yes, Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* GIS Download Progress Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isGisDownloading}
        onRequestClose={() => { }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '85%', alignItems: 'center' }}>
            <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
              <ActivityIndicator size="large" color="#1e5a8e" style={{ marginBottom: 16 }} />
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1e5a8e', marginBottom: 8 }}>
                {gisStatus === 'indexing' ? 'Building Search Index' : 'Downloading Customer Data'}
              </Text>
              <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                {gisDownloadProgress}% Complete
              </Text>
              <View style={{ width: '100%', height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${gisDownloadProgress}%`, height: '100%', backgroundColor: '#1e5a8e' }} />
              </View>
              <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 16, textAlign: 'center' }}>
                {gisStatus === 'indexing'
                  ? 'Optimizing data for offline search. This may take a moment...'
                  : (gisTotalRecords > 0 ? `Processing ${gisTotalRecords.toLocaleString()} records...` : 'Please keep the app open...')}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

export default SettingsScreen;
