import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { observer } from 'mobx-react-lite';
import { useSettingsStore, useOfflineStore } from '../stores/RootStore';
import NotificationBanner from '../components/NotificationBanner';
import { useFocusEffect } from '@react-navigation/native';

const SettingsScreen = observer(({ navigation }) => {
  const store = useSettingsStore();
  const offlineStore = useOfflineStore();

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
    Alert.alert(
      'Clear Map Cache',
      'This will remove all offline map tiles cached on your device. You can re-download them later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear Cache', 
          style: 'destructive',
          onPress: () => store.confirmClearCache && store.confirmClearCache()
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
              <Text style={styles.progressText}>{store.updateProgress}%</Text>
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
              <Text style={styles.valueText}>{store.clientRecordCount > 0 ? 'Downloaded' : 'Not Available'}</Text>
            </View>
          </View>

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
            <Text style={styles.metaValue}>{Constants.expoConfig?.version || '1.0.0'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Build Number</Text>
            <Text style={styles.metaValue}>{Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber || '1'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Last Updated</Text>
            <Text style={styles.metaValue}>{new Date().toLocaleDateString()}</Text>
          </View>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f4f8' },
  container: { padding: 16, paddingBottom: 40, paddingTop: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
  },
  title: { fontSize: 19, fontWeight: '700', color: '#fff' },
  subtitle: { color: 'rgba(255,255,255,0.85)', marginTop: 2, fontSize: 13 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },
  cardLight: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111' },

  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  actionsRow: { flexDirection: 'row', marginTop: 16, gap: 12 },
  actionsCol: { marginTop: 12 },

  label: { color: '#6b7280', fontSize: 14 },
  smallLabel: { color: '#9aa5b1', fontSize: 12 },
  valueText: { fontSize: 16, color: '#111', fontWeight: '600', marginTop: 4 },

  statusBadge: { backgroundColor: '#e6f0fb', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: '#1e5a8e', fontWeight: '700' },

  primaryBtn: { backgroundColor: '#1e5a8e', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flex: 1, marginRight: 8 },
  primaryBtnFull: { backgroundColor: '#1e5a8e', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtnFull: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 15,
  },

  outlineBtn: { borderWidth: 1.5, borderColor: '#f43f5e', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  outlineBtnFull: { borderWidth: 1.5, borderColor: '#f43f5e', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  outlineBtnFullSpaced: { borderWidth: 1.5, borderColor: '#f43f5e', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  outlineBtnText: { color: '#f43f5e', fontWeight: '700' },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  metaLabel: { color: '#6b7280' },
  metaValue: { color: '#111', fontWeight: '600' },

  clearDataButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  clearDataButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.1,
  },
  clearDataGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  clearDataButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  clearConfirmRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
    letterSpacing: 0.5,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconContainer: {
    marginBottom: 16,
  },
  modalIconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  modalConfirmGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  /* Modern modal button styles */
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  modalPrimaryButton: {
    flex: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#1e5a8e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  modalPrimaryGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  modalPauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#fbbf24',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  modalResumeButton: {
    backgroundColor: '#10b981',
    shadowColor: '#059669',
  },
  modalPauseButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  /* Download controls */
  downloadingControls: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  pauseButtonActive: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  pauseButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400e',
  },
  pauseButtonTextActive: {
    color: '#065f46',
  },
  updateModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalMessageSmall: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 12,
  },
  progressWrap: { width: '100%', alignItems: 'center', marginBottom: 12 },
  progressBarBackground: { width: '100%', height: 12, backgroundColor: '#eef2ff', borderRadius: 8, overflow: 'hidden' },
  progressBarFill: { height: 12, backgroundColor: '#6366f1' },
  progressText: { marginTop: 8, fontSize: 13, color: '#374151', fontWeight: '600' },
  speedText: { marginTop: 4, fontSize: 12, color: '#6b7280', fontWeight: '500' },
  successText: { fontSize: 14, color: '#059669', fontWeight: '700', marginBottom: 6 },
  syncProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
  },
  syncProgressText: {
    fontSize: 14,
    color: '#1e5a8e',
    fontWeight: '600',
  },
  offlineWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  offlineWarningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
  },
  offlineWarningText: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 18,
  },
});

export default SettingsScreen;
