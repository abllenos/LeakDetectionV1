import { makeObservable, observable, action, runInAction } from 'mobx';
import { getAvailableCustomers } from '../services/interceptor';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  // Haversine distance calculation (returns distance in meters)
  // Uses raw lat/lng values directly for accuracy
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
      const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
      if (!chunkCount || parseInt(chunkCount) === 0) {
        console.log('⚠️ No customer data downloaded yet');
        runInAction(() => {
          this.nearestMeters = [];
          this.hasCustomerData = false;
          this.errorMessage = 'Customer data not downloaded. Please download customer data from Dashboard or Settings.';
        });
        return;
      }
      
      const all = await getAvailableCustomers();
      
      if (all.length === 0) {
        console.log('⚠️ No customer data available');
        runInAction(() => {
          this.nearestMeters = [];
          this.hasCustomerData = false;
          this.errorMessage = 'No customer data available. Please download customer data from Dashboard.';
        });
        return;
      }
      
      runInAction(() => {
        this.hasCustomerData = true;
      });
      
      console.log(`📦 Loaded ${all.length} customers from offline storage`);
      
      // Log first customer's raw data to see the structure
      if (all.length > 0) {
        console.log('📦 Sample raw customer data:', JSON.stringify(all[0], null, 2));
      }
      
      // Process meters using RAW lat/lng values directly
      const allMeters = [];
      
      for (let i = 0; i < all.length; i++) {
        const it = all[i];
        
        // Get raw lat/lng - use the exact field names from the data
        const rawLat = it.latitude ?? it.lat ?? it.Latitude ?? it.LAT;
        const rawLng = it.longitude ?? it.lng ?? it.Longitude ?? it.LNG ?? it.long ?? it.Long;
        
        // Skip if no coordinates
        if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) {
          continue;
        }
        
        // Parse as numbers but keep full precision
        const lat = Number(rawLat);
        const lng = Number(rawLng);
        
        // Skip invalid coordinates
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
          continue;
        }
        
        // Calculate distance using raw coordinates
        const distance = this.haversine(userLat, userLng, lat, lng);
        
        allMeters.push({
          id: it.id || it.meterNumber || it.accountNumber || i,
          meterId: it.meterNumber || it.accountNumber || it.id || '',
          meterNumber: it.meterNumber || '',
          accountNumber: it.accountNumber || '',
          address: it.address || '',
          dma: it.dma || it.DMA || '',
          // Store raw coordinates exactly as they came from data
          latitude: lat,
          longitude: lng,
          rawLatitude: rawLat,  // Keep original for debugging
          rawLongitude: rawLng, // Keep original for debugging
          distance,
        });
      }
      
      console.log(`📍 Total meters with valid coordinates: ${allMeters.length}`);

      // Sort purely by distance (closest first)
      allMeters.sort((a, b) => a.distance - b.distance);

      // Take top 3 nearest meters
      const top3 = allMeters.slice(0, 3);
      
      console.log('📍 Top 3 nearest meters (using raw lat/lng):');
      top3.forEach((m, i) => {
        const distDisplay = m.distance < 1000 
          ? `${Math.round(m.distance)}m` 
          : `${(m.distance / 1000).toFixed(2)}km`;
        console.log(`  ${i + 1}. ${m.meterNumber || m.accountNumber}`);
        console.log(`     Raw coords: ${m.rawLatitude}, ${m.rawLongitude}`);
        console.log(`     Distance: ${distDisplay}`);
        console.log(`     Address: ${m.address}`);
      });

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
