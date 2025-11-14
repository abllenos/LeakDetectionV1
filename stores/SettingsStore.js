import { makeObservable, observable, action, runInAction } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { preCacheCustomers } from '../services/interceptor';
import { forceCheckNewData } from '../services/dataChecker';
import {
  downloadTilesForArea,
  calculateTileCount,
  getCachedTileCount,
  calculateStorageUsed,
  clearTileCache,
  hasOfflineTiles,
} from '../services/offlineTileManager';

export class SettingsStore {
  // Maps
  mapsStatus = 'Checking...';
  cachedTiles = 0;
  storageUsed = 0; // MB
  mapsLoading = false;
  updateModalVisible = false;
  updateProgress = 0;
  updateSuccess = false;

  // Cache
  clearCacheModalVisible = false;
  clearingCache = false;

  // Client data
  clientDataAvailable = false;
  clientRecordCount = 0;
  clientLoading = false;
  downloadPreset = 'normal'; // 'safe' | 'normal' | 'fast'
  clientDeleteModalVisible = false;
  clientDeleting = false;
  clientModalVisible = false;
  clientProgress = 0;
  clientSuccess = false;
  isDownloadingUpdate = false;

  // Updates & logout
  logoutModalVisible = false;
  checkingUpdates = false;

  constructor() {
    makeObservable(this, {
      // Observables
      mapsStatus: observable,
      cachedTiles: observable,
      storageUsed: observable,
      mapsLoading: observable,
      updateModalVisible: observable,
      updateProgress: observable,
      updateSuccess: observable,
      clearCacheModalVisible: observable,
      clearingCache: observable,
      clientDataAvailable: observable,
      clientRecordCount: observable,
      clientLoading: observable,
      downloadPreset: observable,
      clientDeleteModalVisible: observable,
      clientDeleting: observable,
      clientModalVisible: observable,
      clientProgress: observable,
      clientSuccess: observable,
      isDownloadingUpdate: observable,
      logoutModalVisible: observable,
      checkingUpdates: observable,

      // Actions
      setMapsStatus: action,
      setCachedTiles: action,
      setStorageUsed: action,
      setMapsLoading: action,
      setUpdateModalVisible: action,
      setUpdateProgress: action,
      setUpdateSuccess: action,
      setClearCacheModalVisible: action,
      setClearingCache: action,
      setClientDataAvailable: action,
      setClientRecordCount: action,
      setClientLoading: action,
      setDownloadPreset: action,
      setClientDeleteModalVisible: action,
      setClientDeleting: action,
      setClientModalVisible: action,
      setClientProgress: action,
      setClientSuccess: action,
      setIsDownloadingUpdate: action,
      setLogoutModalVisible: action,
      setCheckingUpdates: action,
      checkCachedData: action,
      loadPreset: action,
      updateMaps: action,
      startMapDownload: action,
      clearCache: action,
      confirmClearCache: action,
      deleteClientData: action,
      confirmDeleteClientData: action,
      clearAllStorageData: action,
      confirmClearAllStorage: action,
      downloadClientData: action,
      startClientDownload: action,
      checkForDataUpdates: action,
      reset: action,
    });
  }

  // Setters
  setMapsStatus(value) {
    this.mapsStatus = value;
  }

  setCachedTiles(value) {
    this.cachedTiles = value;
  }

  setStorageUsed(value) {
    this.storageUsed = value;
  }

  setMapsLoading(value) {
    this.mapsLoading = value;
  }

  setUpdateModalVisible(value) {
    this.updateModalVisible = value;
  }

  setUpdateProgress(value) {
    this.updateProgress = value;
  }

  setUpdateSuccess(value) {
    this.updateSuccess = value;
  }

  setClearCacheModalVisible(value) {
    this.clearCacheModalVisible = value;
  }

  setClearingCache(value) {
    this.clearingCache = value;
  }

  setClientDataAvailable(value) {
    this.clientDataAvailable = value;
  }

  setClientRecordCount(value) {
    this.clientRecordCount = value;
  }

  setClientLoading(value) {
    this.clientLoading = value;
  }

  setDownloadPreset(value) {
    this.downloadPreset = value;
  }

  setClientDeleteModalVisible(value) {
    this.clientDeleteModalVisible = value;
  }

  setClientDeleting(value) {
    this.clientDeleting = value;
  }

  setClientModalVisible(value) {
    this.clientModalVisible = value;
  }

  setClientProgress(value) {
    this.clientProgress = value;
  }

  setClientSuccess(value) {
    this.clientSuccess = value;
  }

  setIsDownloadingUpdate(value) {
    this.isDownloadingUpdate = value;
  }

  setLogoutModalVisible(value) {
    this.logoutModalVisible = value;
  }

  setCheckingUpdates(value) {
    this.checkingUpdates = value;
  }

  // Complex actions
  async checkCachedData() {
    try {
      // Check offline map tiles status
      const tilesAvailable = await hasOfflineTiles();
      if (tilesAvailable) {
        const tileCount = await getCachedTileCount();
        const storage = await calculateStorageUsed();
        
        runInAction(() => {
          this.cachedTiles = tileCount;
          this.storageUsed = parseFloat(storage.toFixed(2));
          this.mapsStatus = 'Offline Tiles Available';
        });
        
        console.log(`📍 Offline maps: ${tileCount} tiles, ${storage.toFixed(2)} MB`);
      } else {
        runInAction(() => {
          this.cachedTiles = 0;
          this.storageUsed = 0;
          this.mapsStatus = 'No Offline Tiles';
        });
        
        console.log('📍 No offline maps available');
      }
      
      // Check completed download FIRST (existing data)
      const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
      const cachedCount = await AsyncStorage.getItem('allCustomers_count');
      
      if (chunkCount && cachedCount) {
        const count = parseInt(cachedCount);
        console.log(`📦 Download complete: ${count} customers available`);
        runInAction(() => {
          this.clientDataAvailable = true;
          this.clientRecordCount = count;
        });
        return;
      }
      
      // If no completed download, check if download is in progress (fast count)
      const downloadCount = await AsyncStorage.getItem('allCustomers_download_count');
      if (downloadCount) {
        const count = parseInt(downloadCount);
        console.log(`📥 Download in progress: ${count} customers downloaded`);
        runInAction(() => {
          this.clientDataAvailable = true;
          this.clientRecordCount = count;
        });
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
            runInAction(() => {
              this.clientDataAvailable = true;
              this.clientRecordCount = estimatedRecords;
            });
            return;
          }
        } catch (e) {
          console.warn('Failed to parse manifest:', e);
        }
      }
      
      console.log('⚠️ No customer data found');
      runInAction(() => {
        this.clientDataAvailable = false;
        this.clientRecordCount = 0;
      });
    } catch (error) {
      console.error('Failed to check cache:', error);
      runInAction(() => {
        this.clientDataAvailable = false;
        this.clientRecordCount = 0;
      });
    }
  }

  async loadPreset() {
    try {
      const p = await AsyncStorage.getItem('download_preset');
      if (p) this.downloadPreset = p;
    } catch (e) {
      console.warn('Failed to load download preset:', e?.message || e);
    }
  }

  async savePreset(preset) {
    try {
      this.downloadPreset = preset;
      await AsyncStorage.setItem('download_preset', preset);
    } catch (e) {
      console.warn('Failed to save download preset:', e?.message || e);
    }
  }

  updateMaps() {
    this.updateModalVisible = true;
    this.updateProgress = 0;
    this.updateSuccess = false;
  }

  async startMapDownload() {
    this.mapsLoading = true;
    this.updateProgress = 0;
    this.updateSuccess = false;
    this.mapsStatus = 'Downloading...';

    try {
      const totalTiles = calculateTileCount();
      console.log(`[OfflineMaps] Starting download of ${totalTiles} tiles for Davao City...`);
      
      await downloadTilesForArea((progress) => {
        this.updateProgress = progress.percentage;
        console.log(`[OfflineMaps] Progress: ${progress.current}/${progress.total} (${progress.percentage}%)`);
      });
      
      // Update stats
      const tileCount = await getCachedTileCount();
      const storage = await calculateStorageUsed();
      
      this.cachedTiles = tileCount;
      this.storageUsed = parseFloat(storage.toFixed(2));
      this.mapsStatus = 'Offline Tiles Available';
      this.mapsLoading = false;
      this.updateSuccess = true;
      
      console.log(`[OfflineMaps] Download complete: ${tileCount} tiles, ${storage.toFixed(2)} MB`);
    } catch (error) {
      console.error('[OfflineMaps] Download failed:', error);
      this.mapsStatus = 'Download Failed';
      this.mapsLoading = false;
      Alert.alert('Download Failed', 'Failed to download offline maps. Please try again.');
    }
  }

  clearCache() {
    this.clearCacheModalVisible = true;
  }

  async confirmClearCache() {
    this.clearingCache = true;
    
    try {
      const success = await clearTileCache();
      
      if (success) {
        this.cachedTiles = 0;
        this.storageUsed = 0;
        this.mapsStatus = 'No Offline Tiles';
        Alert.alert('Cache Cleared', 'Offline map cache has been removed.');
      } else {
        Alert.alert('Error', 'Failed to clear tile cache.');
      }
    } catch (error) {
      console.error('[OfflineMaps] Clear cache error:', error);
      Alert.alert('Error', 'Failed to clear tile cache.');
    } finally {
      this.clearingCache = false;
      this.clearCacheModalVisible = false;
    }
  }

  deleteClientData() {
    this.clientDeleteModalVisible = true;
  }

  async confirmDeleteClientData() {
    this.clientDeleting = true;
    try {
      await AsyncStorage.removeItem('allCustomers');
      await AsyncStorage.removeItem('allCustomers_timestamp');
      console.log('✓ Cleared customer cache');
      
      this.clientDataAvailable = false;
      this.clientDeleting = false;
      this.clientLoading = false;
      this.clientDeleteModalVisible = false;
      Alert.alert('Deleted', 'Offline customer data removed.');
    } catch (error) {
      console.error('Failed to delete cache:', error);
      Alert.alert('Error', 'Failed to delete offline data');
      this.clientDeleting = false;
    }
  }

  clearAllStorageData() {
    Alert.alert(
      'Clear All Data',
      'This will remove ALL cached data including offline customer data, download progress, and settings. Your login credentials will be preserved. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: () => this.confirmClearAllStorage()
        }
      ]
    );
  }

  async confirmClearAllStorage() {
    try {
      console.log('🗑️ Clearing all AsyncStorage data...');
      
      const allKeys = await AsyncStorage.getAllKeys();
      console.log(`📦 Found ${allKeys.length} storage keys`);
      
      const keysToPreserve = ['savedUsername', 'savedPassword', 'rememberMe', 'authToken', 'refreshToken', 'userData'];
      const keysToRemove = allKeys.filter(key => !keysToPreserve.includes(key));
      
      console.log(`🔒 Preserving ${keysToPreserve.length} authentication keys`);
      console.log(`🗑️ Removing ${keysToRemove.length} data keys`);
      
      await AsyncStorage.multiRemove(keysToRemove);
      
      console.log('✅ Storage cleared successfully');
      
      this.clientDataAvailable = false;
      this.clientRecordCount = 0;
      this.clientLoading = false;
      this.clientProgress = 0;
      this.cachedTiles = 0;
      this.storageUsed = 0;
      
      Alert.alert(
        'Success', 
        `Cleared ${keysToRemove.length} storage items. Your login credentials are preserved.`,
        [{ text: 'OK', onPress: () => this.checkCachedData() }]
      );
    } catch (error) {
      console.error('❌ Failed to clear storage:', error);
      Alert.alert('Error', 'Failed to clear storage data: ' + error.message);
    }
  }

  async downloadClientData() {
    // Check if there's existing data
    const cachedCount = await AsyncStorage.getItem('allCustomers_count');
    this.isDownloadingUpdate = !!(cachedCount && parseInt(cachedCount) > 0);
    
    this.clientModalVisible = true;
    this.clientProgress = 0;
    this.clientSuccess = false;
  }

  async startClientDownload() {
    this.clientLoading = true;
    this.clientProgress = 0;
    this.clientSuccess = false;
    this.clientModalVisible = false;

    const presetOpts = () => {
      switch (this.downloadPreset) {
        case 'safe':
          return { pageSize: 500, concurrency: 2 };
        case 'fast':
          return { pageSize: 2000, concurrency: 6 };
        case 'normal':
        default:
          return { pageSize: 1000, concurrency: 4 };
      }
    };

    try {
      await preCacheCustomers(
        (progress) => {
          try {
            // Extract percentage from progress object
            const percentage = typeof progress === 'object' ? progress.percentage : progress;
            this.clientProgress = percentage || 0;
            console.log(`📊 Client download progress: ${percentage}% (${progress.current || 0} records)`);
          } catch (e) {
            // Ignore setState after unmount
          }
        },
        presetOpts()
      );
      
      this.clientLoading = false;
      this.clientSuccess = true;
      this.clientProgress = 100;
      this.isDownloadingUpdate = false;
      console.log('✓ Customer data downloaded successfully (background)');
      
      await this.checkCachedData();
      Alert.alert('Download complete', 'Offline client data is ready');
    } catch (error) {
      console.error('Background download failed:', error);
      this.clientLoading = false;
      this.clientSuccess = false;
      Alert.alert('Download Failed', error?.message || 'Failed to download customer data');
    }
  }

  async checkForDataUpdates() {
    this.checkingUpdates = true;
    try {
      console.log('🔍 Manually checking for data updates...');
      const result = await forceCheckNewData();
      
      if (result) {
        Alert.alert(
          result.title,
          result.message,
          [
            { text: 'Later', style: 'cancel' },
            { 
              text: 'Download Now', 
              onPress: () => this.downloadClientData()
            }
          ]
        );
      } else {
        Alert.alert(
          'No Updates',
          'Your customer data is up to date!',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      Alert.alert(
        'Check Failed',
        'Failed to check for updates. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      this.checkingUpdates = false;
    }
  }

  reset() {
    this.mapsStatus = 'Checking...';
    this.cachedTiles = 0;
    this.storageUsed = 0;
    this.mapsLoading = false;
    this.updateModalVisible = false;
    this.updateProgress = 0;
    this.updateSuccess = false;
    this.clearCacheModalVisible = false;
    this.clearingCache = false;
    this.clientDataAvailable = false;
    this.clientRecordCount = 0;
    this.clientLoading = false;
    this.downloadPreset = 'normal';
    this.clientDeleteModalVisible = false;
    this.clientDeleting = false;
    this.clientModalVisible = false;
    this.clientProgress = 0;
    this.clientSuccess = false;
    this.isDownloadingUpdate = false;
    this.logoutModalVisible = false;
    this.checkingUpdates = false;
  }
}
