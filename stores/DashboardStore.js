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
      const userDataStr = await AsyncStorage.getItem('userData');
      if (userDataStr) {
        const user = JSON.parse(userDataStr);
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
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  async loadLeakReports() {
    this.loadingReports = true;
    try {
      // Get empId from userData
      const empId = this.userData.empId;
      if (!empId) {
        // Try to load userData first if not available
        await this.loadUserData();
      }
      
      const finalEmpId = this.userData.empId;
      if (!finalEmpId) {
        console.error('No empId available to load reports');
        runInAction(() => {
          this.loadingReports = false;
        });
        return;
      }
      
      const data = await fetchLeakReports(finalEmpId);
      runInAction(() => {
        this.leakReportsData = data;
        this.loadingReports = false;
      });
    } catch (error) {
      console.error('Failed to load leak reports:', error);
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
