import { makeObservable, observable, action, runInAction } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDmaCodes, submitLeakReport } from '../services/interceptor';

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
        meterData,
        coordinates,
        geom,
      };
      await submitLeakReport(payload);
      runInAction(() => {
        this.submitting = false;
      });
      return { ok: true };
    } catch (err) {
      runInAction(() => {
        this.submitting = false;
      });
      return { ok: false, message: err?.message || 'Submission failed' };
    }
  }
}

export default LeakReportStore;
