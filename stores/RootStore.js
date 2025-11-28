import { createContext, useContext } from 'react';
import AuthStore from './AuthStore';
import DashboardStore from './DashboardStore';
import DownloadStore from './DownloadStore';
import LocationStore from './LocationStore';
import LeakReportStore from './LeakReportStore';
import NearestMetersStore from './NearestMetersStore';
import { ReportMapStore } from './ReportMapStore';
import { SettingsStore } from './SettingsStore';
import OfflineStore from './OfflineStore';
import DraftsStore from './DraftsStore';

class RootStore {
  constructor() {
    this.authStore = new AuthStore();
    this.dashboardStore = new DashboardStore();
    this.downloadStore = new DownloadStore();
    this.locationStore = new LocationStore();
    this.leakReportStore = new LeakReportStore();
    this.nearestMetersStore = new NearestMetersStore();
    this.reportMapStore = new ReportMapStore();
    this.settingsStore = new SettingsStore();
    this.offlineStore = new OfflineStore();
    this.draftsStore = new DraftsStore();
  }

  reset() {
    this.authStore.reset();
    this.dashboardStore.reset();
    this.downloadStore.reset();
    this.locationStore.reset();
    this.leakReportStore.reset();
    this.nearestMetersStore.reset();
    this.reportMapStore.reset();
    this.settingsStore.reset();
    // Don't reset offline store to preserve queue
    // Don't reset drafts store to preserve drafts
  }
}

// Create a singleton instance
const rootStore = new RootStore();

// Create React context
const StoreContext = createContext(rootStore);

// Custom hook to use stores
export const useStores = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStores must be used within StoreProvider');
  }
  return context;
};

// Individual store hooks for convenience
export const useAuthStore = () => useStores().authStore;
export const useDashboardStore = () => useStores().dashboardStore;
export const useDownloadStore = () => useStores().downloadStore;
export const useLocationStore = () => useStores().locationStore;
export const useLeakReportStore = () => useStores().leakReportStore;
export const useNearestMetersStore = () => useStores().nearestMetersStore;
export const useReportMapStore = () => useStores().reportMapStore;
export const useSettingsStore = () => useStores().settingsStore;
export const useOfflineStore = () => useStores().offlineStore;
export const useDraftsStore = () => useStores().draftsStore;

export { StoreContext, rootStore };
export default RootStore;
