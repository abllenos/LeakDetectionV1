import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.leakdetection.app';
const LAST_UPDATE_CHECK_KEY = '@lastUpdateCheck';
const DISMISSED_VERSION_KEY = '@dismissedUpdateVersion';

/**
 * Check for app updates from Google Play Store
 * Uses a simple version comparison approach
 */
class UpdateChecker {
  constructor() {
    this.currentVersion = Application.nativeApplicationVersion || '1.0.0';
    this.checkInterval = 24 * 60 * 60 * 1000; // Check once per day
  }

  /**
   * Compare two version strings (e.g., "1.2.3" vs "1.2.4")
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Fetch the latest version from Google Play Store
   * Note: This scrapes the Play Store page - for production, consider using your own API
   */
  async fetchLatestVersion() {
    try {
      // Method 1: Scrape Google Play Store page
      const response = await fetch(PLAY_STORE_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Play Store page');
      }
      
      const html = await response.text();
      
      // Extract version from the Play Store HTML
      // The version is usually in a pattern like [["X.X.X"]]
      const versionMatch = html.match(/\[\[\["(\d+\.\d+\.?\d*)"\]\]/);
      
      if (versionMatch && versionMatch[1]) {
        return versionMatch[1];
      }
      
      // Alternative pattern
      const altMatch = html.match(/Current Version.*?>([\d.]+)</i);
      if (altMatch && altMatch[1]) {
        return altMatch[1];
      }
      
      return null;
    } catch (error) {
      console.log('Update check failed:', error.message);
      return null;
    }
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
  openPlayStore() {
    if (Platform.OS === 'android') {
      // Try to open in Play Store app first
      Linking.openURL(`market://details?id=com.leakdetection.app`).catch(() => {
        // Fall back to web URL
        Linking.openURL(PLAY_STORE_URL);
      });
    }
  }

  /**
   * Show update alert to user
   */
  showUpdateAlert(latestVersion, forceUpdate = false) {
    const buttons = forceUpdate
      ? [{ text: 'Update Now', onPress: () => this.openPlayStore() }]
      : [
          {
            text: 'Later',
            style: 'cancel',
            onPress: () => this.dismissVersion(latestVersion),
          },
          { text: 'Update', onPress: () => this.openPlayStore() },
        ];

    Alert.alert(
      '🆕 Update Available',
      `A new version (${latestVersion}) of LeakDetection is available!\n\nYour version: ${this.currentVersion}\n\nUpdate now for the latest features and improvements.`,
      buttons,
      { cancelable: !forceUpdate }
    );
  }

  /**
   * Main method: Check for updates and notify user if available
   * @param {boolean} force - Skip time check and force update check
   * @param {boolean} silent - Don't show "up to date" message
   */
  async checkForUpdate(force = false, silent = true) {
    try {
      // Skip if not enough time has passed (unless forced)
      if (!force && !(await this.shouldCheckForUpdate())) {
        console.log('Skipping update check - checked recently');
        return { updateAvailable: false, skipped: true };
      }

      // Record that we're checking
      await this.recordUpdateCheck();

      // Fetch latest version
      const latestVersion = await this.fetchLatestVersion();
      
      if (!latestVersion) {
        console.log('Could not determine latest version');
        return { updateAvailable: false, error: 'Could not fetch version' };
      }

      console.log(`Current: ${this.currentVersion}, Latest: ${latestVersion}`);

      // Compare versions
      const comparison = this.compareVersions(latestVersion, this.currentVersion);
      
      if (comparison > 0) {
        // New version available
        const isDismissed = await this.isVersionDismissed(latestVersion);
        
        if (!isDismissed || force) {
          this.showUpdateAlert(latestVersion);
        }
        
        return { 
          updateAvailable: true, 
          currentVersion: this.currentVersion,
          latestVersion 
        };
      } else {
        // Up to date
        if (!silent) {
          Alert.alert(
            '✅ Up to Date',
            `You're running the latest version (${this.currentVersion}).`
          );
        }
        return { 
          updateAvailable: false, 
          currentVersion: this.currentVersion,
          latestVersion 
        };
      }
    } catch (error) {
      console.log('Update check error:', error);
      return { updateAvailable: false, error: error.message };
    }
  }
}

// Export singleton instance
const updateChecker = new UpdateChecker();

export default updateChecker;
export { UpdateChecker };
