import { makeObservable, observable, action, runInAction } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { preCacheCustomers, checkCustomerDataIntegrity, resumeCustomerDownload } from '../services/interceptor';
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
  mapsPaused = false;
  mapsCancelled = false; // Track if download was cancelled
  mapsDownloadSpeed = 0; // tiles per second
  updateModalVisible = false;
  updateProgress = 0;
  updateSuccess = false;

  // Cache
  clearCacheModalVisible = false;
  clearingCache = false;

  // Client data
  clientDataAvailable = false;
  clientRecordCount = 0;
  clientDataIncomplete = false; // NEW: Track if data has missing chunks
  clientMissingChunks = 0; // NEW: Number of missing chunks
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
      mapsPaused: observable,
      mapsCancelled: observable,
      mapsDownloadSpeed: observable,
      updateModalVisible: observable,
      updateProgress: observable,
      updateSuccess: observable,
      clearCacheModalVisible: observable,
      clearingCache: observable,
      clientDataAvailable: observable,
      clientRecordCount: observable,
      clientDataIncomplete: observable,
      clientMissingChunks: observable,
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
      setMapsPaused: action,
      setMapsDownloadSpeed: action,
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
      pauseMapDownload: action,
      resumeMapDownload: action,
      cancelMapDownload: action,
      clearCache: action,
      confirmClearCache: action,
      deleteClientData: action,
      confirmDeleteClientData: action,
      clearCustomerData: action,
      confirmClearCustomerData: action,
      resumeCustomerDataDownload: action,
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

  setMapsPaused(value) {
    this.mapsPaused = value;
  }

  setMapsDownloadSpeed(value) {
    this.mapsDownloadSpeed = value;
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
      console.log('🔍 SettingsStore: Checking cached data...');

      // Don't override values if map download is in progress
      if (this.mapsLoading) {
        console.log('🔍 Map download in progress, skipping cached data check for maps');
      } else {
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
      }

      // Check customer data integrity first
      const integrityCheck = await checkCustomerDataIntegrity();
      console.log('📊 Customer data integrity:', integrityCheck);

      if (!integrityCheck.complete && integrityCheck.missingChunks) {
        console.warn(`⚠️ Customer data incomplete: ${integrityCheck.missingChunks.length} chunks missing`);
        runInAction(() => {
          this.clientDataAvailable = true;
          this.clientDataIncomplete = true;
          this.clientMissingChunks = integrityCheck.missingChunks.length;
          this.clientRecordCount = integrityCheck.loadedRecords || 0;
        });
        return;
      }

      if (integrityCheck.complete) {
        console.log(`✅ Customer data complete: ${integrityCheck.totalRecords} records`);
        runInAction(() => {
          this.clientDataAvailable = true;
          this.clientDataIncomplete = false;
          this.clientMissingChunks = 0;
          this.clientRecordCount = integrityCheck.totalRecords;
        });
        return;
      }

      // Fallback to checking manifest/chunk metadata
      const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
      const cachedCount = await AsyncStorage.getItem('allCustomers_count');
      const manifest = await AsyncStorage.getItem('allCustomers_manifest');

      console.log(`📊 Customer data check - chunks: ${chunkCount}, count: ${cachedCount}, manifest exists: ${!!manifest}`);

      if (manifest) {
        try {
          const manifestData = JSON.parse(manifest);
          console.log(`📋 Manifest status: ${manifestData.status}, totalRecords: ${manifestData.totalRecords}`);

          if (manifestData.status === 'complete' && manifestData.totalRecords) {
            console.log(`✅ Download complete: ${manifestData.totalRecords} customers available`);
            runInAction(() => {
              this.clientDataAvailable = true;
              this.clientDataIncomplete = false;
              this.clientMissingChunks = 0;
              this.clientRecordCount = manifestData.totalRecords;
            });
            return;
          }

          if (manifestData.status === 'in-progress') {
            const recordsSoFar = manifestData.totalRecords || 0;
            console.log(`📥 Download in progress: ${recordsSoFar} customers downloaded`);
            runInAction(() => {
              this.clientDataAvailable = true;
              this.clientRecordCount = recordsSoFar;
            });
            return;
          }
        } catch (e) {
          console.warn('Failed to parse manifest:', e);
        }
      }

      // Fallback to old metadata keys
      if (chunkCount && cachedCount) {
        const count = parseInt(cachedCount);
        console.log(`📦 Fallback: ${count} customers from legacy metadata`);
        runInAction(() => {
          this.clientDataAvailable = true;
          this.clientRecordCount = count;
        });
        return;
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
    // If paused, just show modal to resume; otherwise reset
    if (!this.mapsPaused) {
      this.updateProgress = 0;
      this.updateSuccess = false;
    }
  }

  async startMapDownload() {
    // Check if download is already complete
    const metadata = await AsyncStorage.getItem('offline_tiles_metadata');
    if (metadata) {
      try {
        const data = JSON.parse(metadata);
        const expectedTiles = calculateTileCount();

        // If we have all tiles downloaded, don't re-download
        if (data.totalTiles >= expectedTiles && data.downloadComplete === true) {
          console.log(`[OfflineMaps] Download already complete: ${data.totalTiles} tiles`);
          this.updateSuccess = true;
          this.updateProgress = 100;
          Alert.alert(
            'Already Downloaded',
            `Offline maps are already downloaded (${data.totalTiles} tiles).`,
            [{ text: 'OK' }]
          );
          return;
        }
      } catch (e) {
        console.warn('[OfflineMaps] Failed to parse metadata, proceeding with download');
      }
    }

    this.mapsLoading = true;
    this.mapsPaused = false;
    this.mapsCancelled = false; // Reset cancelled flag
    this.updateProgress = 0;
    this.updateSuccess = false;
    this.mapsDownloadSpeed = 0;
    this.mapsStatus = 'Downloading...';

    try {
      const totalTiles = calculateTileCount();
      console.log(`[OfflineMaps] Starting download of ${totalTiles} tiles for Davao City...`);
      let lastUpdate = Date.now();
      let lastCount = 0;
      await downloadTilesForArea(
        async (progress) => {
          // Calculate download speed (tiles per second)
          const now = Date.now();
          const timeDiff = (now - lastUpdate) / 1000; // seconds
          if (timeDiff >= 1) { // Update speed every second
            const tilesDiff = progress.current - lastCount;
            runInAction(() => {
              this.mapsDownloadSpeed = Math.round(tilesDiff / timeDiff);
            });
            lastUpdate = now;
            lastCount = progress.current;
          }

          // Update progress with real-time values from download progress
          runInAction(() => {
            this.updateProgress = progress.percentage;
            // Use successCount directly for real-time tile count
            this.cachedTiles = progress.successCount || 0;
            // Calculate storage: average tile ~15KB, convert to MB
            this.storageUsed = parseFloat(((progress.successCount || 0) * 15 / 1024).toFixed(2));
          });
        },
        () => this.mapsPaused, // Pass pause check function
        () => this.mapsCancelled // Pass cancel check function
      );

      // Check if download was cancelled
      if (this.mapsCancelled) {
        console.log('[OfflineMaps] Download was cancelled');
        // State already updated in cancelMapDownload, just return
        return;
      }

      // Final update - only if not cancelled
      const tileCount = await getCachedTileCount();
      const storage = await calculateStorageUsed();
      this.cachedTiles = tileCount;
      this.storageUsed = parseFloat(storage.toFixed(2));
      this.mapsStatus = tileCount > 0 ? 'Offline Tiles Available' : 'No Offline Tiles';
      this.mapsLoading = false;
      this.mapsPaused = false;
      this.mapsDownloadSpeed = 0;
      this.updateSuccess = true;
      console.log(`[OfflineMaps] Download complete: ${tileCount} tiles, ${storage.toFixed(2)} MB`);
    } catch (error) {
      console.error('[OfflineMaps] Download failed:', error);
      this.mapsStatus = 'Download Failed';
      this.mapsLoading = false;
      this.mapsPaused = false;
      this.mapsDownloadSpeed = 0;
      Alert.alert('Download Failed', 'Failed to download offline maps. Please try again.');
    }
  }

  pauseMapDownload() {
    this.mapsPaused = true;
    this.mapsStatus = 'Paused';
    console.log('[OfflineMaps] Download paused');
  }

  resumeMapDownload() {
    this.mapsPaused = false;
    this.mapsStatus = 'Downloading...';
    console.log('[OfflineMaps] Download resumed');
  }

  async cancelMapDownload() {
    console.log('[OfflineMaps] Canceling download...');
    this.mapsCancelled = true; // Signal download to stop
    this.mapsLoading = false;
    this.mapsPaused = false;
    this.mapsDownloadSpeed = 0;
    this.updateProgress = 0;

    // Update status based on current cache
    const tileCount = await getCachedTileCount();
    const storage = await calculateStorageUsed();
    this.cachedTiles = tileCount;
    this.storageUsed = parseFloat(storage.toFixed(2));

    // Remove completion flag so download can be resumed
    const metadata = await AsyncStorage.getItem('offline_tiles_metadata');
    if (metadata) {
      try {
        const data = JSON.parse(metadata);
        data.downloadComplete = false; // Mark as incomplete
        await AsyncStorage.setItem('offline_tiles_metadata', JSON.stringify(data));
      } catch (e) {
        console.warn('[OfflineMaps] Failed to update metadata after cancel');
      }
    }

    if (tileCount > 0) {
      this.mapsStatus = 'Offline Tiles Available (Partial)';
    } else {
      this.mapsStatus = 'No Offline Tiles';
    }

    console.log('[OfflineMaps] Download canceled');
  }

  clearCache() {
    this.clearCacheModalVisible = true;
  }

  async confirmClearCache() {
    console.log('[OfflineMaps] Starting cache clear...');
    runInAction(() => {
      this.clearingCache = true;
    });

    try {
      const success = await clearTileCache();
      console.log('[OfflineMaps] Clear cache result:', success);

      runInAction(() => {
        if (success) {
          this.cachedTiles = 0;
          this.storageUsed = 0;
          this.mapsStatus = 'No Offline Tiles';
        }
        this.clearingCache = false;
        this.clearCacheModalVisible = false;
      });

      if (success) {
        Alert.alert('Cache Cleared', 'Offline map cache has been removed.');
      } else {
        Alert.alert('Error', 'Failed to clear tile cache.');
      }
    } catch (error) {
      console.error('[OfflineMaps] Clear cache error:', error);
      runInAction(() => {
        this.clearingCache = false;
        this.clearCacheModalVisible = false;
      });
      Alert.alert('Error', 'Failed to clear tile cache: ' + (error?.message || 'Unknown error'));
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

  async clearCustomerData() {
    Alert.alert(
      'Clear Customer Data',
      'This will remove all cached customer data. You can re-download it from the dashboard when needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => this.confirmClearCustomerData()
        }
      ]
    );
  }

  async confirmClearCustomerData() {
    this.clientDeleting = true;
    try {
      console.log('🗑️ Clearing all customer data chunks...');

      // Get all storage keys
      const allKeys = await AsyncStorage.getAllKeys();

      // Filter customer-related keys
      const customerKeys = allKeys.filter(key =>
        key.startsWith('allCustomers_chunk_') ||
        key === 'allCustomers_manifest' ||
        key === 'allCustomers_count' ||
        key === 'allCustomers_timestamp' ||
        key === 'allCustomers_chunks' ||
        key === 'allCustomers_download_count' ||
        key === 'allCustomers' // Legacy single-file storage
      );

      console.log(`📦 Found ${customerKeys.length} customer data keys to remove`);

      if (customerKeys.length > 0) {
        await AsyncStorage.multiRemove(customerKeys);
        console.log('✅ All customer data cleared successfully');
      }

      runInAction(() => {
        this.clientDataAvailable = false;
        this.clientRecordCount = 0;
        this.clientDeleting = false;
      });

      Alert.alert(
        'Success',
        `Cleared ${customerKeys.length} customer data items. You can re-download from the dashboard.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('❌ Failed to clear customer data:', error);
      runInAction(() => {
        this.clientDeleting = false;
      });
      Alert.alert('Error', 'Failed to clear customer data: ' + error.message);
    }
  }

  // Resume downloading incomplete customer data (continues from where it left off)
  async resumeCustomerDataDownload() {
    console.log('🔄 Starting customer data resume process...');
    this.clientLoading = true;
    this.clientProgress = 0;

    try {
      runInAction(() => {
        this.clientDataIncomplete = false;
        this.clientMissingChunks = 0;
      });

      // Resume download from where it left off
      console.log('📥 Resuming customer data download...');
      await resumeCustomerDownload(
        (progress) => {
          try {
            const percentage = typeof progress === 'object' ? progress.percentage : progress;
            runInAction(() => {
              this.clientProgress = percentage || 0;
            });
            console.log(`📊 Resume progress: ${percentage}% (${progress.current || 0} records)`);
          } catch (e) {
            // Ignore setState after unmount
          }
        }
      );

      runInAction(() => {
        this.clientLoading = false;
        this.clientSuccess = true;
        this.clientProgress = 100;
      });

      console.log('✓ Customer data download resumed and completed successfully');
      await this.checkCachedData();
      Alert.alert('Download Complete', 'Customer data download completed successfully!');

    } catch (error) {
      console.error('❌ Failed to resume customer data download:', error);
      runInAction(() => {
        this.clientLoading = false;
        this.clientSuccess = false;
      });
      Alert.alert('Download Error', error.message || 'Failed to resume download. Please try again.');
      // Refresh to show updated status
      await this.checkCachedData();
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
