import { makeObservable, observable, action, runInAction } from 'mobx';
import GisCustomerInterceptor from '../services/gisCustomerInterceptor';

class NearestMetersStore {
  nearestMeters = [];
  selectedMeter = null;
  loading = false;
  dragPin = null;
  pinReady = false;
  dragMode = false;
  errorMessage = null; // New: to show error messages
  hasCustomerData = false; // New: track if customer data is available

  constructor() {
    makeObservable(this, {
      nearestMeters: observable,
      selectedMeter: observable,
      loading: observable,
      dragPin: observable,
      pinReady: observable,
      dragMode: observable,
      errorMessage: observable,
      hasCustomerData: observable,

      setNearestMeters: action.bound,
      setSelectedMeter: action.bound,
      setLoading: action.bound,
      setDragPin: action.bound,
      setPinReady: action.bound,
      setDragMode: action.bound,
      setErrorMessage: action.bound,
      setHasCustomerData: action.bound,
      reset: action.bound,

      fetchNearest: action.bound,
      startPinpoint: action.bound,
      confirmPinDrag: action.bound,
    });
  }

  setNearestMeters(meters) {
    this.nearestMeters = meters;
  }

  setSelectedMeter(meter) {
    this.selectedMeter = meter;
  }

  setLoading(v) {
    this.loading = v;
  }

  setDragPin(coord) {
    this.dragPin = coord;
  }

  setPinReady(v) {
    this.pinReady = v;
  }

  setDragMode(v) {
    this.dragMode = v;
  }

  setErrorMessage(msg) {
    this.errorMessage = msg;
  }

  setHasCustomerData(v) {
    this.hasCustomerData = v;
  }

  reset() {
    this.nearestMeters = [];
    this.selectedMeter = null;
    this.loading = false;
    this.dragPin = null;
    this.pinReady = false;
    this.dragMode = false;
    this.errorMessage = null;
    this.hasCustomerData = false;
  }

  async fetchNearest(coordinates) {
    if (!coordinates) return;

    this.loading = true;
    this.errorMessage = null;

    try {
      const userLat = coordinates.latitude;
      const userLng = coordinates.longitude;

      console.log(`📍 User location: ${userLat}, ${userLng}`);

      // Check if customer data has been downloaded
      const count = await GisCustomerInterceptor.getCustomerCount();
      if (count === 0) {
        console.log('⚠️ No customer data downloaded yet');
        runInAction(() => {
          this.nearestMeters = [];
          this.hasCustomerData = false;
          this.errorMessage = 'Customer data not downloaded. Please download customer data from Dashboard or Settings.';
        });
        return;
      }

      runInAction(() => {
        this.hasCustomerData = true;
      });

      console.log(`📦 Searching nearest meters in ${count} records...`);

      const top3 = await GisCustomerInterceptor.findNearestMeters(userLat, userLng, 3);

      console.log('📍 Top 3 nearest meters:', top3.length);

      const formattedMeters = top3.map((m, i) => ({
        id: m.id || m.meterNumber || m.accountNumber || i,
        meterId: m.meterNumber || m.accountNumber || m.id || '',
        meterNumber: m.meterNumber || '',
        accountNumber: m.accountNumber || '',
        address: m.address || '',
        dma: m.dma || m.DMA || '',
        latitude: m.latitude,
        longitude: m.longitude,
        distance: m.distance,
      }));

      console.log('📍 Top 3 nearest meters (using raw lat/lng):');
      formattedMeters.forEach((m, i) => {
        const distDisplay = m.distance < 1000
          ? `${Math.round(m.distance)}m`
          : `${(m.distance / 1000).toFixed(2)}km`;
        console.log(`  ${i + 1}. ${m.meterNumber || m.accountNumber} - ${distDisplay}`);
      });

      runInAction(() => {
        this.nearestMeters = formattedMeters;
      });
    } catch (err) {
      console.warn('fetchNearest failed', err);
      runInAction(() => {
        this.nearestMeters = [];
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  startPinpoint(coordinates, nearestMeters) {
    let baseLat = coordinates.latitude;
    let baseLng = coordinates.longitude;
    if (nearestMeters.length > 0) {
      baseLat = nearestMeters[0].latitude;
      baseLng = nearestMeters[0].longitude;
    }
    // Offset the drag pin by a larger amount to make it clearly visible
    // 0.003 degrees ≈ 333 meters offset - enough to see at default zoom
    this.dragPin = {
      latitude: baseLat + 0.003,
      longitude: baseLng + 0.003,
    };
    this.pinReady = true;
    this.dragMode = true;
  }

  confirmPinDrag(coord) {
    this.dragPin = coord;
    this.dragMode = false;
    this.pinReady = false;
  }
}

export default NearestMetersStore;
