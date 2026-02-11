import { makeObservable, observable, action, runInAction } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GisCustomerInterceptor from '../services/gisCustomerInterceptor';

class GisCustomerStore {
    // Customer download state
    showDownloadPrompt = false;
    downloadProgress = 0;
    downloadedRecords = 0;
    isDownloading = false;
    downloadComplete = false;
    newCustomersAvailable = 0;
    resumeDownload = false; // Flag to indicate if we should resume an incomplete download

    // Offline data status
    customerDataCount = 0;
    customerDataStatus = 'unknown'; // 'unknown', 'none', 'partial', 'complete'

    // UI state
    initialLoadComplete = false;

    constructor() {
        makeObservable(this, {
            showDownloadPrompt: observable,
            downloadProgress: observable,
            downloadedRecords: observable,
            isDownloading: observable,
            downloadComplete: observable,
            newCustomersAvailable: observable,
            resumeDownload: observable,
            customerDataCount: observable,
            customerDataStatus: observable,
            initialLoadComplete: observable,
            setShowDownloadPrompt: action.bound,
            setDownloadProgress: action.bound,
            setDownloadedRecords: action.bound,
            setIsDownloading: action.bound,
            setDownloadComplete: action.bound,
            setNewCustomersAvailable: action.bound,
            setResumeDownload: action.bound,
            setCustomerDataCount: action.bound,
            setCustomerDataStatus: action.bound,
            setInitialLoadComplete: action.bound,
            checkCustomerDataStatus: action.bound,
            checkForUpdates: action.bound,
            startDownload: action.bound,
        });
    }

    setShowDownloadPrompt(show) {
        this.showDownloadPrompt = show;
    }

    setDownloadProgress(progress) {
        this.downloadProgress = progress;
    }

    setDownloadedRecords(count) {
        this.downloadedRecords = count;
    }

    setIsDownloading(downloading) {
        this.isDownloading = downloading;
    }

    setDownloadComplete(complete) {
        this.downloadComplete = complete;
    }

    setNewCustomersAvailable(count) {
        this.newCustomersAvailable = count;
    }

    setResumeDownload(resume) {
        this.resumeDownload = resume;
    }

    setCustomerDataCount(count) {
        this.customerDataCount = count;
    }

    setCustomerDataStatus(status) {
        this.customerDataStatus = status;
    }

    setInitialLoadComplete(complete) {
        this.initialLoadComplete = complete;
    }

    async checkCustomerDataStatus() {
        try {
            const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
            const totalCount = await AsyncStorage.getItem('allCustomers_count');
            const manifest = await AsyncStorage.getItem('allCustomers_manifest');

            if (!chunkCount || parseInt(chunkCount) === 0) {
                runInAction(() => {
                    this.customerDataCount = 0;
                    this.customerDataStatus = 'none';
                });
                return;
            }

            const count = parseInt(totalCount) || 0;
            let status = 'partial';

            if (manifest) {
                const manifestData = JSON.parse(manifest);
                if (manifestData.status === 'complete') {
                    status = 'complete';
                }
            }

            runInAction(() => {
                this.customerDataCount = count;
                this.customerDataStatus = status;
            });

            console.log(`[GisCustomerStore] Customer data status: ${status}, count: ${count}`);
        } catch (error) {
            console.error('[GisCustomerStore] Error checking customer data status:', error);
            runInAction(() => {
                this.customerDataStatus = 'unknown';
            });
        }
    }

    async checkForUpdates() {
        await GisCustomerInterceptor.checkAndPromptDownload(() => {
            this.startDownload();
        });
    }

    async startDownload() {
        if (this.isDownloading) return;

        runInAction(() => {
            this.isDownloading = true;
            this.downloadProgress = 0;
            this.downloadedRecords = 0;
            this.downloadComplete = false;
        });

        const result = await GisCustomerInterceptor.downloadAndSaveCustomers((percent, totalPages, processedRecords) => {
            runInAction(() => {
                this.downloadProgress = percent;
                this.downloadedRecords = processedRecords;
            });
        });

        runInAction(() => {
            this.isDownloading = false;
            if (result.success) {
                this.downloadComplete = true;
                this.checkCustomerDataStatus();
            }
        });
    }
}

export default GisCustomerStore;
