import { makeObservable, observable, action, runInAction } from 'mobx';

class DownloadStore {
  constructor() {
    this.downloading = false;
    this.progress = null;
    this.statusMsg = '';
    this.statusBadge = null;
    
    makeObservable(this, {
      downloading: observable,
      progress: observable,
      statusMsg: observable,
      statusBadge: observable,
      setDownloading: action,
      setProgress: action,
      setStatusMsg: action,
      setStatusBadge: action,
      startDownload: action,
      updateProgress: action,
      completeDownload: action,
      failDownload: action,
      clearStatusMsg: action,
      reset: action,
    });
  }

  // Actions
  setDownloading(value) {
    this.downloading = value;
  }

  setProgress(value) {
    this.progress = value;
  }

  setStatusMsg(msg) {
    this.statusMsg = msg;
  }

  setStatusBadge(badge) {
    this.statusBadge = badge;
  }

  startDownload(message = 'Starting download...') {
    this.downloading = true;
    this.progress = 0;
    this.statusMsg = message;
  }

  updateProgress(progressValue, message = '') {
    // Accept either a number (0-100) or an object { current, total }
    if (typeof progressValue === 'number') {
      this.progress = progressValue;
    } else if (progressValue && typeof progressValue === 'object') {
      this.progress = progressValue;
    }
    if (message) {
      this.statusMsg = message;
    }
  }

  completeDownload(message = 'Download complete') {
    this.downloading = false;
    this.progress = 100;
    this.statusMsg = message;
  }

  failDownload(errorMessage = 'Download failed') {
    this.downloading = false;
    this.progress = null;
    this.statusMsg = errorMessage;
  }

  clearStatusMsg() {
    this.statusMsg = '';
  }

  reset() {
    this.downloading = false;
    this.progress = null;
    this.statusMsg = '';
    this.statusBadge = null;
  }
}

export default DownloadStore;
