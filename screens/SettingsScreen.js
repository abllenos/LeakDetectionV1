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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { API_BASE } from '../services/interceptor';
import { logout, preCacheCustomers, getAvailableCustomers } from '../services/interceptor';
import { stopLocationTracking } from '../services/locationTracker';
import { forceCheckNewData } from '../services/dataChecker';
import updateChecker from '../services/updateChecker';
import VersionCheck from 'react-native-version-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { observer } from 'mobx-react-lite';
import { useSettingsStore, useOfflineStore } from '../stores/RootStore';
import NotificationBanner from '../components/NotificationBanner';
import { useFocusEffect } from '@react-navigation/native';
import styles from '../styles/SettingsStyles';

const SettingsScreen = observer(({ navigation }) => {
  const store = useSettingsStore();
  const offlineStore = useOfflineStore();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [buildNumber, setBuildNumber] = useState('');

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

  // Check if customer data is cached on mount and poll during download
  useEffect(() => {
    store.checkCachedData();
    store.loadPreset();

    const interval = setInterval(() => {
      if (store.clientLoading) store.checkCachedData();
    }, 3000);
    return () => clearInterval(interval);
  }, [store]);

  useFocusEffect(
    React.useCallback(() => {
      store.checkCachedData();
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

  const handleClearCache = () => {
    // Use the store's modal-based clear cache flow
    store.setClearCacheModalVisible(true);
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
            <Text style={styles.label}>Tiles Cached:</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{store.mapsStatus}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Current Mode:</Text>
            <View style={[styles.statusBadge, { backgroundColor: offlineStore.isOnline ? '#d1fae5' : '#fee2e2' }]}>
              <Text style={[styles.statusText, { color: offlineStore.isOnline ? '#059669' : '#dc2626' }]}> 
                {offlineStore.isOnline ? 'Using Online Tiles' : (store.cachedTiles > 0 ? 'Using Offline Tiles' : 'No Connection')}
              </Text>
            </View>
          </View>

          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.smallLabel}>Cached Tiles:</Text>
              <Text style={styles.valueText}>{store.cachedTiles}</Text>
            </View>
            <View>
              <Text style={styles.smallLabel}>Storage Used:</Text>
              <Text style={styles.valueText}>{store.storageUsed} MB</Text>
            </View>
          </View>

          {store.mapsLoading || store.mapsPaused ? (
            <View style={{ marginTop: 16 }}>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${store.updateProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {store.updateProgress}% - {store.cachedTiles.toLocaleString()} tiles ({store.storageUsed} MB)
              </Text>
              {store.mapsDownloadSpeed > 0 && (
                <Text style={styles.speedText}>{store.mapsDownloadSpeed} tiles/sec {store.mapsPaused && '(Paused)'}</Text>
              )}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.primaryBtn, store.mapsPaused && { backgroundColor: '#10b981' }]}
                  onPress={() => { if (store.mapsPaused) store.resumeMapDownload(); else store.pauseMapDownload(); }}
                >
                  <Ionicons name={store.mapsPaused ? 'play' : 'pause'} size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryBtnText}>{store.mapsPaused ? 'Resume' : 'Pause'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.outlineBtn} onPress={() => store.cancelMapDownload && store.cancelMapDownload()}>
                  <Text style={styles.outlineBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {store.updateSuccess && (<Text style={styles.successText}>Maps updated successfully ✅</Text>)}

          {!store.mapsLoading && !store.mapsPaused && !store.updateSuccess && (
            <TouchableOpacity style={styles.primaryBtnFull} onPress={() => store.startMapDownload && store.startMapDownload()}>
              <Text style={styles.primaryBtnText}>Update Maps</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.outlineBtnFullSpaced} onPress={handleClearCache}>
            <Text style={styles.outlineBtnText}>Clear Cache</Text>
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
              <Text style={styles.valueText}>{store.clientRecordCount || 0}</Text>
            </View>
            <View>
              <Text style={styles.smallLabel}>Status:</Text>
              <Text style={[styles.valueText, store.clientDataIncomplete && { color: '#f59e0b' }]}>
                {store.clientDataIncomplete ? 'Incomplete' : (store.clientRecordCount > 0 ? 'Downloaded' : 'Not Available')}
              </Text>
            </View>
          </View>

          {/* Warning for incomplete data */}
          {store.clientDataIncomplete && (
            <View style={styles.incompleteDataWarning}>
              <Ionicons name="warning" size={16} color="#f59e0b" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.incompleteDataTitle}>Data Incomplete</Text>
                <Text style={styles.incompleteDataText}>
                  Download was interrupted. Tap below to continue downloading the remaining data.
                </Text>
                <TouchableOpacity 
                  style={styles.redownloadButton}
                  onPress={() => store.clearAndRedownloadCustomerData()}
                  disabled={store.clientLoading || store.clientDeleting}
                >
                  <Ionicons name="play" size={14} color="#fff" />
                  <Text style={styles.redownloadButtonText}>Continue Download</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity 
            style={[styles.clearDataButton, store.clientDeleting && styles.clearDataButtonDisabled]} 
            onPress={() => store.clearCustomerData()}
            disabled={store.clientDeleting}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={store.clientDeleting ? ['#9ca3af', '#6b7280'] : ['#ef4444', '#dc2626']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.clearDataGradient}
            >
              {store.clientDeleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                  <Text style={styles.clearDataButtonText}>Clear Customer Data</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
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

      {/* Clear Cache Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={store.clearCacheModalVisible}
        onRequestClose={() => store.setClearCacheModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIconContainer}>
              <LinearGradient colors={[ '#f97316', '#f43f5e' ]} style={styles.modalIconGradient}>
                <Ionicons name="trash-outline" size={34} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.modalTitle}>Clear Map Cache</Text>
            <Text style={styles.modalMessage}>This will remove all offline map tiles cached on your device. You can re-download them later.</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => store.setClearCacheModalVisible(false)} disabled={store.clearingCache}>
                <Text style={styles.modalCancelText}>{store.clearingCache ? 'Please wait' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { borderColor: '#f97316' }]} onPress={store.confirmClearCache.bind(store)} disabled={store.clearingCache}>
                <LinearGradient colors={[ '#f97316', '#f43f5e' ]} style={styles.modalConfirmGradient}>
                  {store.clearingCache ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>Clear Cache</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Update Maps Modal fully removed; progress now shown in card */}
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
