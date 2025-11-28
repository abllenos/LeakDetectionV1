import AsyncStorage from '@react-native-async-storage/async-storage';
import { preCacheCustomers } from './interceptor';

// Global download state - persists across component unmounts
let isDownloading = false;
let downloadPromise = null;
let progressCallback = null;
let completionCallback = null;

/**
 * Set callback for progress updates (called from DownloadStore)
 */
export const setProgressCallback = (callback) => {
  progressCallback = callback;
};

/**
 * Set callback for completion (success or failure)
 */
export const setCompletionCallback = (callback) => {
  completionCallback = callback;
};

/**
 * Check if a download is currently in progress
 */
export const isDownloadInProgress = () => {
  return isDownloading;
};

/**
 * Get the current download promise (for awaiting)
 */
export const getDownloadPromise = () => {
  return downloadPromise;
};

/**
 * Start customer data download - runs independently of component lifecycle
 */
export const startCustomerDownload = async (opts = {}) => {
  // If already downloading, return existing promise
  if (isDownloading && downloadPromise) {
    console.log('[DownloadService] Download already in progress, returning existing promise');
    return downloadPromise;
  }

  console.log('[DownloadService] 🚀 Starting customer download...');
  isDownloading = true;

  // Save download status to AsyncStorage
  await AsyncStorage.setItem('download_in_progress', 'true');
  await AsyncStorage.setItem('download_start_time', Date.now().toString());

  downloadPromise = new Promise(async (resolve, reject) => {
    try {
      await preCacheCustomers((progress) => {
        // Update progress
        let percent = 0;
        if (typeof progress === 'number') {
          percent = Math.round(progress);
        } else if (progress && typeof progress === 'object') {
          if (progress.percent != null) {
            percent = Math.round(progress.percent);
          } else if (progress.done != null && progress.total != null) {
            percent = Math.round((progress.done / progress.total) * 100);
          }
        }

        // Save progress to AsyncStorage so it persists across screens
        AsyncStorage.setItem('allCustomers_download_status', JSON.stringify({
          percent,
          timestamp: Date.now(),
          inProgress: true
        })).catch(() => {});

        // Call progress callback if set
        if (progressCallback) {
          progressCallback(percent);
        }
      }, opts);

      // Download complete
      isDownloading = false;
      downloadPromise = null;
      
      await AsyncStorage.setItem('download_in_progress', 'false');
      await AsyncStorage.setItem('allCustomers_download_status', JSON.stringify({
        percent: 100,
        timestamp: Date.now(),
        inProgress: false,
        completed: true
      }));

      console.log('[DownloadService] ✅ Download completed successfully');
      
      if (completionCallback) {
        completionCallback({ success: true, message: 'Client data ready' });
      }
      
      resolve(true);
    } catch (error) {
      isDownloading = false;
      downloadPromise = null;
      
      await AsyncStorage.setItem('download_in_progress', 'false');
      await AsyncStorage.setItem('allCustomers_download_status', JSON.stringify({
        percent: 0,
        timestamp: Date.now(),
        inProgress: false,
        error: true
      }));

      console.error('[DownloadService] ❌ Download failed:', error);
      
      if (completionCallback) {
        completionCallback({ success: false, message: 'Client download failed', error });
      }
      
      reject(error);
    }
  });

  return downloadPromise;
};

/**
 * Check and resume download if it was interrupted
 */
export const checkAndResumeDownload = async () => {
  try {
    const inProgress = await AsyncStorage.getItem('download_in_progress');
    if (inProgress === 'true' && !isDownloading) {
      console.log('[DownloadService] Found interrupted download, but not auto-resuming');
      // Reset the flag since we're not auto-resuming
      await AsyncStorage.setItem('download_in_progress', 'false');
    }
  } catch (error) {
    console.error('[DownloadService] Error checking download status:', error);
  }
};

export default {
  setProgressCallback,
  setCompletionCallback,
  isDownloadInProgress,
  getDownloadPromise,
  startCustomerDownload,
  checkAndResumeDownload,
};
