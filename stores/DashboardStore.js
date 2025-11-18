import { makeObservable, observable, action, computed, runInAction, toJS } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLeakReports } from '../services/interceptor';

class DashboardStore {
  leakReportsData = null;
  loadingReports = true;
  userData = { name: 'User', avatar: 'U' };

  constructor() {
    makeObservable(this, {
      leakReportsData: observable,
      loadingReports: observable,
      userData: observable,
      loadUserData: action.bound,
      loadLeakReports: action.bound,
      totalReports: computed,
      reportedCount: computed,
      dispatchedCount: computed,
      repairedCount: computed,
      scheduledCount: computed,
      turnoverCount: computed,
      afterCount: computed,
      notFoundCount: computed,
      userName: computed,
      userAvatar: computed,
      recentReports: computed,
    });
  }

  async loadUserData() {
    try {
      console.log('[DashboardStore] Loading user data from AsyncStorage...');
      const userDataStr = await AsyncStorage.getItem('userData');
      
      if (!userDataStr) {
        console.warn('[DashboardStore] No userData found in AsyncStorage');
        return;
      }
      
      console.log('[DashboardStore] User data found, parsing...');
      const user = JSON.parse(userDataStr);
      console.log('[DashboardStore] User data parsed:', {
        empId: user.empId,
        fName: user.fName,
        lName: user.lName,
        username: user.username
      });
      
      const firstName = user.fName || user.firstName || '';
      const middleName = user.mName || user.middleName || '';
      const lastName = user.lName || user.lastName || '';
      
      let userName = firstName;
      if (middleName) {
        userName += ` ${middleName[0]}.`;
      }
      if (lastName) {
        userName += ` ${lastName}`;
      }
      
      if (!userName.trim()) {
        userName = user.username || user.empId || 'User';
      }
      
      runInAction(() => {
        this.userData = {
          name: userName.trim(),
          avatar: firstName ? firstName[0].toUpperCase() : 'U',
          empId: user.empId || user.employeeId || user.id || user.userId,
          fullData: user,
        };
      });
      
      console.log('[DashboardStore] User data loaded:', {
        name: this.userData.name,
        empId: this.userData.empId
      });
    } catch (error) {
      console.error('[DashboardStore] Failed to load user data:', error);
    }
  }

  async loadLeakReports() {
    this.loadingReports = true;
    try {
      console.log('[DashboardStore] Starting to load leak reports...');
      
      // Get empId from userData
      const empId = this.userData.empId;
      console.log('[DashboardStore] Current empId from userData:', empId);
      
      if (!empId) {
        console.log('[DashboardStore] No empId found, loading user data first...');
        // Try to load userData first if not available
        await this.loadUserData();
      }
      
      const finalEmpId = this.userData.empId;
      console.log('[DashboardStore] Final empId:', finalEmpId);
      
      if (!finalEmpId) {
        console.error('[DashboardStore] No empId available to load reports');
        runInAction(() => {
          this.loadingReports = false;
        });
        return;
      }
      
      console.log('[DashboardStore] Fetching leak reports for empId:', finalEmpId);
      const data = await fetchLeakReports(finalEmpId);
      console.log('[DashboardStore] Leak reports received:', {
        totalCount: data?.totalCount,
        reportsLength: data?.reports?.length,
        reportedCount: data?.reportedCount,
        dispatchedCount: data?.dispatchedCount,
        repairedCount: data?.repairedCount
      });
      
      runInAction(() => {
        this.leakReportsData = data;
        this.loadingReports = false;
      });
      console.log('[DashboardStore] Leak reports loaded successfully');
    } catch (error) {
      console.error('[DashboardStore] Failed to load leak reports:', error);
      console.error('[DashboardStore] Error details:', error?.response?.data || error?.message);
      runInAction(() => {
        this.loadingReports = false;
      });
    }
  }

  // Computed values
  get totalReports() {
    return this.leakReportsData?.totalCount || 0;
  }

  get reportedCount() {
    return this.leakReportsData?.reportedCount || 0;
  }

  get dispatchedCount() {
    return this.leakReportsData?.dispatchedCount || 0;
  }

  get repairedCount() {
    return this.leakReportsData?.repairedCount || 0;
  }

  get scheduledCount() {
    return this.leakReportsData?.scheduledCount || 0;
  }

  get turnoverCount() {
    return this.leakReportsData?.turnoverCount || 0;
  }

  get afterCount() {
    return this.leakReportsData?.afterCount || 0;
  }

  get notFoundCount() {
    return this.leakReportsData?.notFoundCount || 0;
  }

  get userName() {
    return this.userData.name || 'User';
  }

  get userAvatar() {
    return this.userData.avatar || 'U';
  }

  get recentReports() {
    return (this.leakReportsData?.reports || []).slice(0, 5);
  }

  reset() {
    this.leakReportsData = null;
    this.loadingReports = true;
  }
}

export default DashboardStore;
