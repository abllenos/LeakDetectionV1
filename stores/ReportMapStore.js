import { makeObservable, observable, action, computed } from 'mobx';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { searchAccountOrMeter } from '../services/interceptor';

export class ReportMapStore {
  // Map configuration
  tileIndex = 0;
  region = {
    latitude: 7.0731,
    longitude: 125.6129,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
  marker = { latitude: 7.0731, longitude: 125.6129 };
  coordsLabel = '7.073100, 125.612900';

  // Search state
  meterNumber = '';
  searching = false;
  searchResults = [];
  showSearchResults = false;
  currentMeterDetails = null;

  // Modal state
  showSourceModal = false;
  showDragConfirmModal = false;
  nearestModalVisible = false;
  nearestCandidate = null;
  nearestSuccess = false;

  // Drag mode
  dragMode = false;
  dragPin = null;

  constructor() {
    makeObservable(this, {
      // Observables
      tileIndex: observable,
      region: observable,
      marker: observable,
      coordsLabel: observable,
      meterNumber: observable,
      searching: observable,
      searchResults: observable.ref,
      showSearchResults: observable,
      currentMeterDetails: observable.ref,
      showSourceModal: observable,
      showDragConfirmModal: observable,
      nearestModalVisible: observable,
      nearestCandidate: observable.ref,
      nearestSuccess: observable,
      dragMode: observable,
      dragPin: observable.ref,

      // Actions
      setTileIndex: action,
      setRegion: action,
      setMarker: action,
      setCoordsLabel: action,
      setMeterNumber: action,
      setSearching: action,
      setSearchResults: action,
      setShowSearchResults: action,
      setCurrentMeterDetails: action,
      setShowSourceModal: action,
      setShowDragConfirmModal: action,
      setNearestModalVisible: action,
      setNearestCandidate: action,
      setNearestSuccess: action,
      setDragMode: action,
      setDragPin: action,
      cycleTiles: action,
      updateMarkerAndLabel: action,
      initializeLocation: action,
      searchMeter: action,
      selectSearchResult: action,
      startDragMode: action,
      confirmDragLocation: action,
      cancelDragMode: action,
      confirmUseNearest: action,
      closeNearestSuccess: action,
      reset: action,
    });
  }

  // Setters
  setTileIndex(value) {
    this.tileIndex = value;
  }

  setRegion(value) {
    this.region = value;
  }

  setMarker(value) {
    this.marker = value;
  }

  setCoordsLabel(value) {
    this.coordsLabel = value;
  }

  setMeterNumber(value) {
    this.meterNumber = value;
  }

  setSearching(value) {
    this.searching = value;
  }

  setSearchResults(value) {
    this.searchResults = value;
  }

  setShowSearchResults(value) {
    this.showSearchResults = value;
  }

  setCurrentMeterDetails(value) {
    this.currentMeterDetails = value;
  }

  setShowSourceModal(value) {
    this.showSourceModal = value;
  }

  setShowDragConfirmModal(value) {
    this.showDragConfirmModal = value;
  }

  setNearestModalVisible(value) {
    this.nearestModalVisible = value;
  }

  setNearestCandidate(value) {
    this.nearestCandidate = value;
  }

  setNearestSuccess(value) {
    this.nearestSuccess = value;
  }

  setDragMode(value) {
    this.dragMode = value;
  }

  setDragPin(value) {
    this.dragPin = value;
  }

  // Complex actions
  cycleTiles() {
    this.tileIndex = (this.tileIndex + 1) % 3; // Assuming 3 tile sources
  }

  updateMarkerAndLabel(latitude, longitude) {
    this.marker = { latitude, longitude };
    this.coordsLabel = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }

  async initializeLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const nextRegion = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
        this.region = nextRegion;
        this.marker = { latitude: nextRegion.latitude, longitude: nextRegion.longitude };
        this.coordsLabel = `${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`;
        return nextRegion;
      }
    } catch (error) {
      console.error('Failed to get location:', error);
    }
    return null;
  }

  async locateMe() {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const nextRegion = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      this.region = nextRegion;
      this.marker = { latitude: nextRegion.latitude, longitude: nextRegion.longitude };
      this.coordsLabel = `${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`;
      return nextRegion;
    } catch (error) {
      console.error('Failed to locate:', error);
    }
    return null;
  }

  refresh() {
    this.marker = { latitude: this.region.latitude, longitude: this.region.longitude };
    this.coordsLabel = `${this.region.latitude.toFixed(6)}, ${this.region.longitude.toFixed(6)}`;
    return this.region;
  }

  async searchMeter() {
    if (!this.meterNumber || this.meterNumber.trim() === '') {
      Alert.alert('Search Error', 'Please enter a meter number or account number to search.');
      return null;
    }

    this.searching = true;
    this.searchResults = [];

    try {
      const response = await searchAccountOrMeter(this.meterNumber.trim());
      const data = response?.data || response?.data?.data || response;
      const results = Array.isArray(data) ? data : data ? [data] : [];
      
      if (results.length > 0) {
        const normalized = results.map(this.normalizeMeterResult);
        this.searchResults = normalized;
        this.showSearchResults = true;
        return normalized;
      } else {
        Alert.alert('No Results', 'No meter or account found matching your search.');
        return [];
      }
    } catch (error) {
      if (error.response?.data?.statusCode === 404 && error.response?.data?.message === 'No matching customer found.') {
        Alert.alert('No Results', 'No meter or account found matching your search.');
      } else {
        console.error('Search error:', error);
        let errorMessage = 'Failed to search meter. Please try again.';
        if (error.response?.status === 404) {
          errorMessage = 'Search endpoint not found. The API may have changed or is unavailable.';
        } else if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        }
        Alert.alert('Search Failed', errorMessage);
      }
      return null;
    } finally {
      this.searching = false;
    }
  }

  normalizeMeterResult(r) {
    if (!r) return null;
    
    const latitude = r.latitude || r.Latitude || r.lat || r.Lat || r.latitudeString || null;
    const longitude = r.longitude || r.Longitude || r.lng || r.Long || r.longitudeString || null;

    const parsedLat = latitude !== null && latitude !== undefined && latitude !== '' ? parseFloat(latitude) : null;
    const parsedLng = longitude !== null && longitude !== undefined && longitude !== '' ? parseFloat(longitude) : null;

    return {
      meterNumber: r.meterNumber || r.MeterNumber || r.meter_no || r.meterNo || r.meter || r.meter_no_string || '',
      accountNumber: r.accountNumber || r.AccountNumber || r.accountNo || r.account_number || r.account || r.account_no_string || '',
      address: r.address || r.Address || r.fullAddress || r.customerAddress || r.location || r.address_line || '',
      latitude: parsedLat,
      longitude: parsedLng,
      _raw: r,
    };
  }

  selectSearchResult(result) {
    this.showSearchResults = false;
    const normalized = this.normalizeMeterResult(result);

    if (normalized?.latitude && normalized?.longitude) {
      const nextRegion = {
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      this.region = nextRegion;
      this.marker = { latitude: nextRegion.latitude, longitude: nextRegion.longitude };
      this.coordsLabel = `${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`;
    }

    this.meterNumber = normalized?.meterNumber || normalized?.accountNumber || '';
    this.currentMeterDetails = normalized;

    Alert.alert(
      'Meter Found',
      `Account: ${normalized?.accountNumber || 'N/A'}\nMeter: ${normalized?.meterNumber || 'N/A'}\nAddress: ${normalized?.address || 'N/A'}`
    );

    return normalized;
  }

  startDragMode() {
    this.showSourceModal = false;
    this.showDragConfirmModal = true;
  }

  confirmStartDrag() {
    this.dragMode = true;
    this.dragPin = {
      latitude: this.region.latitude + 0.001,
      longitude: this.region.longitude + 0.001,
    };
    this.showDragConfirmModal = false;
  }

  confirmDragLocation() {
    if (this.dragPin) {
      this.coordsLabel = `${this.dragPin.latitude.toFixed(6)}, ${this.dragPin.longitude.toFixed(6)}`;
      this.dragMode = false;
      Alert.alert('Location Confirmed', 'You can now proceed to report the leak.');
    }
  }

  cancelDragMode() {
    this.dragMode = false;
    this.dragPin = null;
  }

  confirmUseNearest() {
    if (!this.nearestCandidate) return;
    
    const next = {
      latitude: this.nearestCandidate.latitude,
      longitude: this.nearestCandidate.longitude,
    };
    this.marker = next;
    this.coordsLabel = `${next.latitude.toFixed(6)}, ${next.longitude.toFixed(6)}`;
    this.nearestSuccess = true;
    
    this.currentMeterDetails = this.normalizeMeterResult({
      meterNumber: this.nearestCandidate.id || this.nearestCandidate.meterNumber || '',
      accountNumber: this.nearestCandidate.accountNumber || '',
      address: this.nearestCandidate.address || '',
      latitude: this.nearestCandidate.latitude,
      longitude: this.nearestCandidate.longitude,
      id: this.nearestCandidate.id,
    });

    return { ...next, latitudeDelta: 0.005, longitudeDelta: 0.005 };
  }

  closeNearestSuccess() {
    this.nearestModalVisible = false;
    this.nearestCandidate = null;
    this.nearestSuccess = false;
  }

  cancelNearestModal() {
    this.nearestModalVisible = false;
    this.nearestCandidate = null;
    this.nearestSuccess = false;
    return this.region;
  }

  // Handle route params (for ReportScreen)
  handleIncomingSearchResult(incoming, incomingMeter) {
    if (!incoming) return null;

    const arr = Array.isArray(incoming) ? incoming : [incoming];
    const normalized = arr.map((r) => this.normalizeMeterResult(r));
    this.searchResults = normalized;
    this.showSearchResults = true;

    const first = normalized[0];
    if (first?.latitude && first?.longitude) {
      const nextRegion = {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      this.region = nextRegion;
      this.marker = { latitude: nextRegion.latitude, longitude: nextRegion.longitude };
      this.coordsLabel = `${nextRegion.latitude.toFixed(6)}, ${nextRegion.longitude.toFixed(6)}`;
    }

    this.meterNumber = incomingMeter || first?.meterNumber || first?.accountNumber || '';
    return first;
  }

  // Handle selected meter from route params (for ReportHomeScreen)
  handleSelectedMeter(selectedMeter) {
    if (!selectedMeter) return null;

    this.meterNumber = selectedMeter.meterNumber || '';
    
    if (selectedMeter.latitude && selectedMeter.longitude) {
      const nextRegion = {
        latitude: selectedMeter.latitude,
        longitude: selectedMeter.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      this.region = nextRegion;
      return nextRegion;
    }
    
    return null;
  }

  reset() {
    this.tileIndex = 0;
    this.region = {
      latitude: 7.0731,
      longitude: 125.6129,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    this.marker = { latitude: 7.0731, longitude: 125.6129 };
    this.coordsLabel = '7.073100, 125.612900';
    this.meterNumber = '';
    this.searching = false;
    this.searchResults = [];
    this.showSearchResults = false;
    this.currentMeterDetails = null;
    this.showSourceModal = false;
    this.showDragConfirmModal = false;
    this.nearestModalVisible = false;
    this.nearestCandidate = null;
    this.nearestSuccess = false;
    this.dragMode = false;
    this.dragPin = null;
  }
}
