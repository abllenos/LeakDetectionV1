import { makeObservable, observable, action, runInAction } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDmaCodes, submitLeakReport } from '../services/interceptor';
import { addToQueue, checkOnlineStatus } from '../services/offlineQueue';

class LeakReportStore {
  // Form fields
  leakType = '';
  location = '';
  contactName = '';
  contactNumber = '';
  landmark = '';
  leakPhotos = [];
  landmarkPhoto = null;
  pressure = 'Low';
  covering = '';
  causeOfLeak = '';
  causeOther = '';
  dma = '';
  flagProjectLeak = null;
  featuredId = '';

  // UI state
  showDmaModal = false;
  dmaOptions = [];
  dmaLoading = false;
  submitting = false;
  coveringExpanded = false;
  causeExpanded = false;

  constructor() {
    makeObservable(this, {
      // fields
      leakType: observable,
      location: observable,
      contactName: observable,
      contactNumber: observable,
      landmark: observable,
      leakPhotos: observable,
      landmarkPhoto: observable,
      pressure: observable,
      covering: observable,
      causeOfLeak: observable,
      causeOther: observable,
      dma: observable,
      flagProjectLeak: observable,
      featuredId: observable,
      showDmaModal: observable,
      dmaOptions: observable,
      dmaLoading: observable,
      submitting: observable,
      coveringExpanded: observable,
      causeExpanded: observable,

      // actions
      setLeakType: action.bound,
      setLocation: action.bound,
      setContactName: action.bound,
      setContactNumber: action.bound,
      setLandmark: action.bound,
      addLeakPhoto: action.bound,
      removeLeakPhoto: action.bound,
      setLandmarkPhoto: action.bound,
      clearLandmarkPhoto: action.bound,
      setPressure: action.bound,
      setCovering: action.bound,
      setCauseOfLeak: action.bound,
      setCauseOther: action.bound,
      setDma: action.bound,
      setFlagProjectLeak: action.bound,
      setFeaturedId: action.bound,
      setShowDmaModal: action.bound,
      setCoveringExpanded: action.bound,
      setCauseExpanded: action.bound,
      reset: action.bound,

      // async actions
      loadDmaOptions: action.bound,
      autofillContactFromUser: action.bound,
      submit: action.bound,
    });
  }

  // setters
  setLeakType(v) { this.leakType = v; }
  setLocation(v) { this.location = v; }
  setContactName(v) { this.contactName = v; }
  setContactNumber(v) { this.contactNumber = v; }
  setLandmark(v) { this.landmark = v; }
  addLeakPhoto(uri) { this.leakPhotos = [...this.leakPhotos, uri]; }
  removeLeakPhoto(index) { this.leakPhotos = this.leakPhotos.filter((_, i) => i !== index); }
  setLandmarkPhoto(uri) { this.landmarkPhoto = uri; }
  clearLandmarkPhoto() { this.landmarkPhoto = null; }
  setPressure(v) { this.pressure = v; }
  setCovering(v) { this.covering = v; }
  setCauseOfLeak(v) { this.causeOfLeak = v; }
  setCauseOther(v) { this.causeOther = v; }
  setDma(v) { this.dma = v; }
  setFlagProjectLeak(v) { this.flagProjectLeak = v; if (v === 0) this.featuredId = ''; }
  setFeaturedId(v) { this.featuredId = v; }
  setShowDmaModal(v) { this.showDmaModal = v; }
  setCoveringExpanded(v) { this.coveringExpanded = v; }
  setCauseExpanded(v) { this.causeExpanded = v; }

  reset() {
    this.leakType = '';
    this.location = '';
    this.contactName = '';
    this.contactNumber = '';
    this.landmark = '';
    this.leakPhotos = [];
    this.landmarkPhoto = null;
    this.pressure = 'Low';
    this.covering = '';
    this.causeOfLeak = '';
    this.causeOther = '';
    this.dma = '';
    this.flagProjectLeak = null;
    this.featuredId = '';
    this.showDmaModal = false;
    this.dmaOptions = [];
    this.dmaLoading = false;
    this.submitting = false;
    this.coveringExpanded = false;
    this.causeExpanded = false;
  }

  async loadDmaOptions() {
    this.dmaLoading = true;
    try {
      const codes = await fetchDmaCodes();
      runInAction(() => {
        this.dmaOptions = codes;
      });
    } catch (err) {
      console.error('Failed to load DMA codes:', err);
    } finally {
      runInAction(() => {
        this.dmaLoading = false;
      });
    }
  }

  async autofillContactFromUser() {
    try {
      const userDataStr = await AsyncStorage.getItem('userData');
      if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        const firstName = userData.fName || '';
        const middleName = userData.mName || '';
        const lastName = userData.lName || '';
        const fullName = `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, ' ').trim();
        const contactNum = userData.mobileNo || userData.contactNumber || userData.contactNo || userData.phoneNumber || userData.mobileNumber || '';
        runInAction(() => {
          if (fullName) this.contactName = fullName;
          if (contactNum) this.contactNumber = contactNum;
        });
      }
    } catch (err) {
      console.error('Failed to autofill contact info:', err);
    }
  }

  async submit({ meterData, coordinates, geom }) {
    if (this.submitting) return { ok: false, message: 'Already submitting' };
    this.submitting = true;
    
    try {
      const payload = {
        leakType: this.leakType,
        location: this.location,
        covering: this.covering,
        causeOfLeak: this.causeOfLeak,
        causeOther: this.causeOther,
        dma: this.dma,
        contactName: this.contactName,
        contactNumber: this.contactNumber,
        landmark: this.landmark,
        leakPhotos: this.leakPhotos,
        landmarkPhoto: this.landmarkPhoto,
        pressure: this.pressure,
        flagProjectLeak: this.flagProjectLeak,
        featuredId: this.featuredId,
        meterData,
        coordinates,
        geom,
      };
      
      // Check if online
      const isOnline = await checkOnlineStatus();
      
      if (isOnline) {
        // If online, submit directly
        console.log('[LeakReportStore] Online - submitting directly to server');
        await submitLeakReport(payload);
        
        runInAction(() => {
          this.submitting = false;
        });
        
        return { ok: true, message: 'Report submitted successfully' };
      } else {
        // If offline, add to queue
        console.log('[LeakReportStore] Offline - adding to queue');
        await addToQueue({
          type: 'leak_report',
          data: payload,
        });
        
        runInAction(() => {
          this.submitting = false;
        });
        
        return { 
          ok: true, 
          message: 'You are offline. Report saved and will be submitted when connection is restored.',
          offline: true 
        };
      }
    } catch (err) {
      console.error('[LeakReportStore] Submit error:', err);
      
      runInAction(() => {
        this.submitting = false;
      });
      
      // On error, try to save to queue as fallback
      try {
        const payload = {
          leakType: this.leakType,
          location: this.location,
          covering: this.covering,
          causeOfLeak: this.causeOfLeak,
          causeOther: this.causeOther,
          dma: this.dma,
          contactName: this.contactName,
          contactNumber: this.contactNumber,
          landmark: this.landmark,
          leakPhotos: this.leakPhotos,
          landmarkPhoto: this.landmarkPhoto,
          pressure: this.pressure,
          flagProjectLeak: this.flagProjectLeak,
          featuredId: this.featuredId,
          meterData: coordinates && coordinates.latitude ? { coordinates } : null,
          coordinates,
          geom: coordinates,
        };
        
        await addToQueue({
          type: 'leak_report',
          data: payload,
        });
        
        return { 
          ok: true, 
          message: 'Report saved offline and will be submitted when connection is restored.',
          offline: true 
        };
      } catch (queueErr) {
        console.error('[LeakReportStore] Failed to save to queue:', queueErr);
        return { ok: false, message: err?.message || 'Submission failed' };
      }
    }
  }
}

export default LeakReportStore;
