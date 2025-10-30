import { makeObservable, observable, action } from 'mobx';

class LocationStore {
  constructor() {
    this.status = 'Requesting location permission...';
    this.errorMessage = null;
    this.currentLocation = null;
    
    makeObservable(this, {
      status: observable,
      errorMessage: observable,
      currentLocation: observable,
      setStatus: action,
      setError: action,
      setCurrentLocation: action,
      clearError: action,
      reset: action,
    });
  }

  // Actions
  setStatus(status) {
    this.status = status;
  }

  setError(message) {
    this.errorMessage = message;
    this.status = 'Error';
  }

  setCurrentLocation(location) {
    this.currentLocation = location;
  }

  clearError() {
    this.errorMessage = null;
  }

  reset() {
    this.status = 'Requesting location permission...';
    this.errorMessage = null;
    this.currentLocation = null;
  }
}

export default LocationStore;
