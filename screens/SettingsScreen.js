import React, { useState } from 'react';
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
import { logout, preCacheCustomers, getAvailableCustomers } from '../services/api';
import { stopLocationTracking } from '../services/locationTracker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen({ navigation }) {
  const [mapsStatus, setMapsStatus] = useState('Offline Mode');
  const [cachedTiles, setCachedTiles] = useState(144);
  const [storageUsed, setStorageUsed] = useState(2.1); // MB
  const [mapsLoading, setMapsLoading] = useState(false);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  const [clearCacheModalVisible, setClearCacheModalVisible] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const [clientDataAvailable, setClientDataAvailable] = useState(true);
  const [clientRecordCount, setClientRecordCount] = useState(0);
  const [clientLoading, setClientLoading] = useState(false);
  const [downloadPreset, setDownloadPreset] = useState('normal'); // 'safe' | 'normal' | 'fast'
  const [clientDeleteModalVisible, setClientDeleteModalVisible] = useState(false);
  const [clientDeleting, setClientDeleting] = useState(false);
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [clientProgress, setClientProgress] = useState(0);
  const [clientSuccess, setClientSuccess] = useState(false);
  
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  // Check if customer data is cached on mount and poll during download
  React.useEffect(() => {
    checkCachedData();
    loadPreset();
    
    // Poll for count updates during download (very fast, just reads one key)
    const interval = setInterval(() => {
      if (clientLoading) {
        checkCachedData();
      }
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(interval);
  }, [clientLoading]);

  const loadPreset = async () => {
    try {
      const p = await AsyncStorage.getItem('download_preset');
      if (p) setDownloadPreset(p);
    } catch (e) {
      console.warn('Failed to load download preset:', e?.message || e);
    }
  };

  const checkCachedData = async () => {
    try {
      // First check if download is in progress (fast count)
      const downloadCount = await AsyncStorage.getItem('allCustomers_download_count');
      if (downloadCount) {
        const count = parseInt(downloadCount);
        console.log(`📥 Download in progress: ${count} customers downloaded`);
        setClientDataAvailable(true);
        setClientRecordCount(count);
        return;
      }
      
      // Check if download just started (manifest exists but count not yet written)
      const manifest = await AsyncStorage.getItem('allCustomers_manifest');
      if (manifest) {
        try {
          const manifestData = JSON.parse(manifest);
          if (manifestData.status === 'in-progress') {
            const pagesFetched = Array.isArray(manifestData.pagesFetched) ? manifestData.pagesFetched.length : 0;
            const estimatedRecords = pagesFetched * 50; // Approximate: 50 records per page
            console.log(`📥 Download starting: ~${estimatedRecords} customers (estimated)`);
            setClientDataAvailable(true);
            setClientRecordCount(estimatedRecords);
            return;
          }
        } catch (e) {
          console.warn('Failed to parse manifest:', e);
        }
      }
      
      // Check completed download
      const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
      const cachedCount = await AsyncStorage.getItem('allCustomers_count');
      
      if (chunkCount && cachedCount) {
        const count = parseInt(cachedCount);
        console.log(`📦 Download complete: ${count} customers available`);
        setClientDataAvailable(true);
        setClientRecordCount(count);
        return;
      }
      
      console.log('⚠️ No customer data found');
      setClientDataAvailable(false);
      setClientRecordCount(0);
    } catch (error) {
      console.error('Failed to check cache:', error);
      setClientDataAvailable(false);
      setClientRecordCount(0);
    }
  };

  const updateMaps = () => {
    // open modal to confirm and show progress
    setUpdateModalVisible(true);
    setUpdateProgress(0);
    setUpdateSuccess(false);
  };

  const startMapDownload = () => {
    setMapsLoading(true);
    setUpdateProgress(0);
    setUpdateSuccess(false);

    // simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 10; // random increments
      if (progress >= 100) progress = 100;
      setUpdateProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);
        // finalize
        setTimeout(() => {
          setCachedTiles((n) => n + 10);
          setStorageUsed((s) => +(s + 0.15).toFixed(2));
          setMapsStatus('Offline Mode');
          setMapsLoading(false);
          setUpdateSuccess(true);
        }, 500);
      }
    }, 350);
  };

  const clearCache = () => {
    // show a nicer modal confirmation for clearing cache
    setClearCacheModalVisible(true);
  };

  const confirmClearCache = () => {
    setClearingCache(true);
    setTimeout(() => {
      setCachedTiles(0);
      setStorageUsed(0);
      setMapsStatus('Offline Mode');
      setClearingCache(false);
      setClearCacheModalVisible(false);
      Alert.alert('Cache cleared', 'Offline map cache has been removed.');
    }, 800);
  };

  const cancelClearCache = () => {
    if (!clearingCache) setClearCacheModalVisible(false);
  };

  const deleteClientData = () => {
    // show improved in-app modal confirmation
    setClientDeleteModalVisible(true);
  };

  const confirmDeleteClientData = async () => {
    setClientDeleting(true);
    try {
      // Clear all customer cache
      await AsyncStorage.removeItem('allCustomers');
      await AsyncStorage.removeItem('allCustomers_timestamp');
      console.log('✓ Cleared customer cache');
      
      setClientDataAvailable(false);
      setClientDeleting(false);
      setClientLoading(false);
      setClientDeleteModalVisible(false);
      Alert.alert('Deleted', 'Offline customer data removed.');
    } catch (error) {
      console.error('Failed to delete cache:', error);
      Alert.alert('Error', 'Failed to delete offline data');
      setClientDeleting(false);
    }
  };

  const cancelDeleteClientData = () => {
    if (!clientDeleting) setClientDeleteModalVisible(false);
  };

  const downloadClientData = () => {
    // show modal to confirm and display progress
    setClientModalVisible(true);
    setClientProgress(0);
    setClientSuccess(false);
  };

  const startClientDownload = async () => {
    // Start download in background and allow user to close modal immediately
    setClientLoading(true);
    setClientProgress(0);
    setClientSuccess(false);

    // close modal so user can continue using app
    setClientModalVisible(false);

    // Fire-and-forget the preCacheCustomers but keep updating UI via callbacks/promises
    // pick options based on preset
    const presetOpts = () => {
      switch (downloadPreset) {
        case 'safe':
          return { pageSize: 500, concurrency: 2 };
        case 'fast':
          return { pageSize: 2000, concurrency: 6 };
        case 'normal':
        default:
          return { pageSize: 1000, concurrency: 4 };
      }
    };

    preCacheCustomers((progress) => {
      try {
        setClientProgress(progress);
      } catch (e) {
        // ignore setState after unmount cases
      }
    }, presetOpts())
      .then(async () => {
        setClientLoading(false);
        setClientSuccess(true);
        setClientProgress(100);
        console.log('✓ Customer data downloaded successfully (background)');
        
        // Refresh cached data count
        await checkCachedData();
        
        Alert.alert('Download complete', 'Offline client data is ready');
      })
      .catch((error) => {
        console.error('Background download failed:', error);
        setClientLoading(false);
        setClientSuccess(false);
        Alert.alert('Download Failed', error?.message || 'Failed to download customer data');
      });
  };

  const cancelClientModal = () => {
    // Allow closing the modal even when a background download is happening
    setClientModalVisible(false);
    // Do not reset progress/state here so the background download banner can continue to show
  };

  // (Download manifest/status removed - handled by Offline Meter Search Data section)

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const confirmLogout = async () => {
    // Stop location tracking
    stopLocationTracking();
    
    // Clear authentication tokens
    await logout();
    
    setLogoutModalVisible(false);
    // Navigate back to login and reset the navigation stack
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const cancelLogout = () => {
    setLogoutModalVisible(false);
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1e5a8e" translucent />
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#1e5a8e', '#2d7ab8']}
        style={styles.headerRow}
      >
        <View>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>App configuration and preferences</Text>
        </View>
        <View style={styles.iconWrap}>
          <Ionicons name="settings" size={22} color="#fff" />
        </View>
      </LinearGradient>
      
      <ScrollView contentContainerStyle={styles.container}>

        {/* Background download progress banner */}
        {clientLoading ? (
          <View style={styles.backgroundDownloadBanner}>
            <Text style={styles.bannerText}>Downloading client data... {clientProgress}%</Text>
          </View>
        ) : null}


        {/* Offline Maps Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="map" size={18} color="#1e5a8e" />
            <Text style={styles.cardTitle}>  Offline Maps</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Status:</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{mapsStatus}</Text>
            </View>
          </View>

          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.smallLabel}>Cached Tiles:</Text>
              <Text style={styles.valueText}>{cachedTiles}</Text>
            </View>
            <View>
              <Text style={styles.smallLabel}>Storage Used:</Text>
              <Text style={styles.valueText}>{storageUsed} MB</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={updateMaps} disabled={mapsLoading}>
              {mapsLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Update Maps</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.outlineBtn} onPress={clearCache}>
              <Text style={styles.outlineBtnText}>Clear Cache</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Offline Meter Search Data */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="cloud-download" size={18} color="#1e5a8e" />
            <Text style={styles.cardTitle}>  Offline Meter Search Data</Text>
          </View>

          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.smallLabel}>Status:</Text>
              <Text style={styles.valueText}>
                {clientDataAvailable 
                  ? `Available (${clientRecordCount.toLocaleString()} customers)` 
                  : 'Not available'}
              </Text>
            </View>
          </View>

          <View style={styles.actionsCol}>
            <TouchableOpacity style={styles.outlineBtnFull} onPress={deleteClientData} disabled={clientLoading || !clientDataAvailable}>
              {clientLoading && !clientDataAvailable ? <ActivityIndicator /> : <Text style={styles.outlineBtnText}>Delete Offline Client Data</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtnFull} onPress={downloadClientData} disabled={clientLoading}>
              {clientLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Download Client Data</Text>}
            </TouchableOpacity>

            {/* Download preset selector */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: '#6b7280', marginBottom: 8 }}>Download speed preset</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={async () => { setDownloadPreset('safe'); await AsyncStorage.setItem('download_preset', 'safe'); }} style={[styles.presetBtn, downloadPreset === 'safe' ? styles.presetActive : null]}>
                  <Text style={downloadPreset === 'safe' ? styles.presetTextActive : styles.presetText}>Safe</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => { setDownloadPreset('normal'); await AsyncStorage.setItem('download_preset', 'normal'); }} style={[styles.presetBtn, downloadPreset === 'normal' ? styles.presetActive : null]}>
                  <Text style={downloadPreset === 'normal' ? styles.presetTextActive : styles.presetText}>Normal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => { setDownloadPreset('fast'); await AsyncStorage.setItem('download_preset', 'fast'); }} style={[styles.presetBtn, downloadPreset === 'fast' ? styles.presetActive : null]}>
                  <Text style={downloadPreset === 'fast' ? styles.presetTextActive : styles.presetText}>Fast</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* test pagination removed */}
          </View>
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

      {/* Custom Logout Modal */}
      {/* Client Delete Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={clientDeleteModalVisible}
        onRequestClose={cancelDeleteClientData}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIconContainer}>
              <LinearGradient
                colors={[ '#ef4444', '#f97316' ]}
                style={styles.modalIconGradient}
              >
                <Ionicons name="trash" size={36} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.modalTitle}>Delete Offline Data</Text>
            <Text style={styles.modalMessage}>This will remove all downloaded client search data. The app will no longer be able to search meters offline.</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelDeleteClientData} disabled={clientDeleting}>
                <Text style={styles.modalCancelText}>{clientDeleting ? 'Please wait' : 'Cancel'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalConfirmBtn, { borderColor: '#ef4444' }]} onPress={confirmDeleteClientData} disabled={clientDeleting}>
                <LinearGradient colors={[ '#ef4444', '#f43f5e' ]} style={styles.modalConfirmGradient}>
                  {clientDeleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>Delete</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Test Pagination Modal removed */}
      {/* Client Download Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={clientModalVisible}
        onRequestClose={cancelClientModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.updateModalContainer}>
            <Text style={styles.modalTitle}>Download Client Data</Text>
            <Text style={styles.modalMessageSmall}>Download offline client search data to enable meter lookups without network access.</Text>

            <View style={styles.progressWrap}>
              {!clientSuccess ? (
                <>
                  <View style={styles.progressBarBackground}>
                    <View style={[styles.progressBarFill, { width: `${clientProgress}%`, backgroundColor: '#10b981' }]} />
                  </View>
                  <Text style={styles.progressText}>{clientProgress}%</Text>
                </>
              ) : (
                <Text style={styles.successText}>Client data downloaded ✅</Text>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelClientModal} disabled={clientLoading}>
                <Text style={styles.modalCancelText}>{clientLoading ? 'Please wait' : 'Cancel'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  if (clientSuccess) {
                    // close the modal when user taps Done
                    setClientModalVisible(false);
                    setClientProgress(0);
                    setClientSuccess(false);
                  } else {
                    startClientDownload();
                  }
                }}
                disabled={clientLoading}
              >
                <LinearGradient colors={[ '#10b981', '#059669' ]} style={styles.modalConfirmGradient}>
                  <Text style={styles.modalConfirmText}>{clientLoading ? 'Downloading...' : clientSuccess ? 'Done' : 'Download'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Clear Cache Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={clearCacheModalVisible}
        onRequestClose={cancelClearCache}
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
              <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelClearCache} disabled={clearingCache}>
                <Text style={styles.modalCancelText}>{clearingCache ? 'Please wait' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { borderColor: '#f97316' }]} onPress={confirmClearCache} disabled={clearingCache}>
                <LinearGradient colors={[ '#f97316', '#f43f5e' ]} style={styles.modalConfirmGradient}>
                  {clearingCache ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>Clear Cache</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Update Maps Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={updateModalVisible}
        onRequestClose={() => setUpdateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.updateModalContainer}>
            <Text style={styles.modalTitle}>Update Offline Maps</Text>
            <Text style={styles.modalMessageSmall}>This will download the latest offline map tiles for faster mapping when you're offline.</Text>

            {/* Progress area */}
            <View style={styles.progressWrap}>
              {!updateSuccess ? (
                <>
                  <View style={styles.progressBarBackground}>
                    <View style={[styles.progressBarFill, { width: `${updateProgress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{updateProgress}%</Text>
                </>
              ) : (
                <Text style={styles.successText}>Maps updated successfully ✅</Text>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  if (!mapsLoading) setUpdateModalVisible(false);
                }}
                disabled={mapsLoading}
              >
                <Text style={styles.modalCancelText}>{mapsLoading ? 'Please wait' : 'Cancel'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  if (updateSuccess) {
                    setUpdateModalVisible(false);
                    setUpdateProgress(0);
                    setUpdateSuccess(false);
                  } else {
                    startMapDownload();
                  }
                }}
                disabled={mapsLoading}
              >
                <LinearGradient
                  colors={['#1e5a8e', '#0f4a78']}
                  style={styles.modalConfirmGradient}
                >
                  <Text style={styles.modalConfirmText}>{mapsLoading ? 'Downloading...' : updateSuccess ? 'Done' : 'Start'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={logoutModalVisible}
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
}

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
  actionsRow: { flexDirection: 'row', marginTop: 12, gap: 10 },
  actionsCol: { marginTop: 12 },

  label: { color: '#6b7280', fontSize: 14 },
  smallLabel: { color: '#9aa5b1', fontSize: 12 },
  valueText: { fontSize: 16, color: '#111', fontWeight: '600', marginTop: 4 },

  statusBadge: { backgroundColor: '#e6f0fb', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: '#1e5a8e', fontWeight: '700' },

  primaryBtn: { backgroundColor: '#1e5a8e', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flex: 1, marginRight: 8 },
  primaryBtnFull: { backgroundColor: '#1e5a8e', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },

  outlineBtn: { borderWidth: 1.5, borderColor: '#f43f5e', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  outlineBtnFull: { borderWidth: 1.5, borderColor: '#f43f5e', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  outlineBtnText: { color: '#f43f5e', fontWeight: '700' },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  metaLabel: { color: '#6b7280' },
  metaValue: { color: '#111', fontWeight: '600' },

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
  backgroundDownloadBanner: {
    backgroundColor: '#e6fffa',
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  bannerText: { color: '#065f46', fontWeight: '700' },
  presetBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f1f5f9' },
  presetActive: { backgroundColor: '#1e5a8e' },
  presetText: { color: '#64748b', fontWeight: '700' },
  presetTextActive: { color: '#fff', fontWeight: '700' },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
  successText: { fontSize: 14, color: '#059669', fontWeight: '700', marginBottom: 6 },
});
