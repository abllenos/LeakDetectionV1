import { makeObservable, observable, action, runInAction } from 'mobx';
import { getAvailableCustomers } from '../services/interceptor';

class NearestMetersStore {
  nearestMeters = [];
  selectedMeter = null;
  loading = false;
  dragPin = null;
  pinReady = false;
  dragMode = false;

  constructor() {
    makeObservable(this, {
      nearestMeters: observable,
      selectedMeter: observable,
      loading: observable,
      dragPin: observable,
      pinReady: observable,
      dragMode: observable,

      setNearestMeters: action.bound,
      setSelectedMeter: action.bound,
      setLoading: action.bound,
      setDragPin: action.bound,
      setPinReady: action.bound,
      setDragMode: action.bound,
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

  reset() {
    this.nearestMeters = [];
    this.selectedMeter = null;
    this.loading = false;
    this.dragPin = null;
    this.pinReady = false;
    this.dragMode = false;
  }

  // Haversine distance calculation
  toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  haversine(a, b) {
    const R = 6371e3; // Earth's radius in meters
    const lat1 = this.toRad(a.latitude);
    const lat2 = this.toRad(b.latitude);
    const dLat = this.toRad(b.latitude - a.latitude);
    const dLon = this.toRad(b.longitude - a.longitude);

    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  }

  async fetchNearest(coordinates) {
    if (!coordinates) return;
    this.loading = true;
    try {
      const all = await getAvailableCustomers();
      const allMeters = all.map((it, idx) => {
        const lat = parseFloat(it.latitude || it.lat);
        const lng = parseFloat(it.longitude || it.lng);
        const distance = this.haversine(
          { latitude: coordinates.latitude, longitude: coordinates.longitude },
          { latitude: lat, longitude: lng }
        );
        return {
          id: it.id || it.meterNumber || it.accountNumber || idx,
          meterId: it.meterNumber || it.accountNumber || it.id || '',
          accountNumber: it.accountNumber || '',
          address: it.address || '',
          dma: it.dma || it.DMA || '',
          latitude: lat,
          longitude: lng,
          distance,
          _raw: it,
        };
      });

      const sorted = allMeters
        .filter(m => !isNaN(m.latitude) && !isNaN(m.longitude))
        .sort((a, b) => a.distance - b.distance);

      // Take top 3 nearest meters (allow duplicates at same location)
      const top3 = sorted.slice(0, 3);

      runInAction(() => {
        this.nearestMeters = top3;
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
