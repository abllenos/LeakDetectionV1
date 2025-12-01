import VersionCheck from 'react-native-version-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const LAST_UPDATE_CHECK_KEY = '@lastUpdateCheck';
const DISMISSED_VERSION_KEY = '@dismissedUpdateVersion';

/**
 * Update Checker using react-native-version-check
 * More reliable than scraping Play Store HTML
 */
class UpdateChecker {
  constructor() {
    this.checkInterval = 24 * 60 * 60 * 1000; // Check once per day
    this.currentVersion = null;
    this.latestVersion = null;
    this.updateNeeded = false;
  }

  /**
   * Get current app version
   */
  getCurrentVersion() {
    return VersionCheck.getCurrentVersion();
  }

  /**
   * Check if enough time has passed since last check
   */
  async shouldCheckForUpdate() {
    try {
      const lastCheck = await AsyncStorage.getItem(LAST_UPDATE_CHECK_KEY);
      if (!lastCheck) return true;
      
      const timeSinceLastCheck = Date.now() - parseInt(lastCheck, 10);
      return timeSinceLastCheck >= this.checkInterval;
    } catch {
      return true;
    }
  }

  /**
   * Check if user has dismissed this version's update prompt
   */
  async isVersionDismissed(version) {
    try {
      const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
      return dismissed === version;
    } catch {
      return false;
    }
  }

  /**
   * Mark a version's update prompt as dismissed
   */
  async dismissVersion(version) {
    try {
      await AsyncStorage.setItem(DISMISSED_VERSION_KEY, version);
    } catch (error) {
      console.log('Failed to save dismissed version:', error);
    }
  }

  /**
   * Record that we checked for updates
   */
  async recordUpdateCheck() {
    try {
      await AsyncStorage.setItem(LAST_UPDATE_CHECK_KEY, Date.now().toString());
    } catch (error) {
      console.log('Failed to record update check:', error);
    }
  }

  /**
   * Open the Play Store to the app's page
   */
  openStore() {
    VersionCheck.getStoreUrl({ packageName: 'com.leakdetection.app' })
      .then(url => {
        VersionCheck.openStore({ packageName: 'com.leakdetection.app' });
      })
      .catch(err => {
        console.log('Error opening store:', err);
      });
  }

  /**
   * Main method: Check for updates
   * @param {boolean} force - Skip time check and force update check
   * @param {boolean} silent - Don't return "up to date" status
   * @returns {Object} - { updateAvailable, currentVersion, latestVersion, error }
   */
  async checkForUpdate(force = false, silent = true) {
    try {
      // Skip if not enough time has passed (unless forced)
      if (!force && !(await this.shouldCheckForUpdate())) {
        console.log('[UpdateChecker] Skipping - checked recently');
        return { updateAvailable: false, skipped: true };
      }

      // Record that we're checking
      await this.recordUpdateCheck();

      // Get current version
      this.currentVersion = VersionCheck.getCurrentVersion();
      console.log('[UpdateChecker] Current version:', this.currentVersion);

      // Check if update is needed
      const updateInfo = await VersionCheck.needUpdate({
        packageName: 'com.leakdetection.app',
        depth: 2, // Compare major.minor.patch
      });

      this.latestVersion = updateInfo.latestVersion;
      this.updateNeeded = updateInfo.isNeeded;

      console.log('[UpdateChecker] Latest version:', this.latestVersion);
      console.log('[UpdateChecker] Update needed:', this.updateNeeded);

      if (this.updateNeeded) {
        // Check if user already dismissed this version
        const isDismissed = await this.isVersionDismissed(this.latestVersion);
        
        return {
          updateAvailable: true,
          currentVersion: this.currentVersion,
          latestVersion: this.latestVersion,
          storeUrl: updateInfo.storeUrl,
          isDismissed: isDismissed && !force,
        };
      } else {
        return {
          updateAvailable: false,
          currentVersion: this.currentVersion,
          latestVersion: this.latestVersion,
        };
      }
    } catch (error) {
      console.log('[UpdateChecker] Error:', error.message);
      return { 
        updateAvailable: false, 
        error: error.message,
        currentVersion: this.currentVersion || VersionCheck.getCurrentVersion(),
      };
    }
  }
}

// Export singleton instance
const updateChecker = new UpdateChecker();

export default updateChecker;
export { UpdateChecker };
