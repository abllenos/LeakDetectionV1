import { createContext, useContext } from 'react';
import AuthStore from './AuthStore';
import DashboardStore from './DashboardStore';
import DownloadStore from './DownloadStore';
import LocationStore from './LocationStore';

class RootStore {
  constructor() {
    this.authStore = new AuthStore();
    this.dashboardStore = new DashboardStore();
    this.downloadStore = new DownloadStore();
    this.locationStore = new LocationStore();
  }

  reset() {
    this.authStore.reset();
    this.dashboardStore.reset();
    this.downloadStore.reset();
    this.locationStore.reset();
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

export { StoreContext, rootStore };
export default RootStore;
