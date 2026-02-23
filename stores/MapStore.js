import { makeAutoObservable, runInAction } from 'mobx';
import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync } from 'fflate';

class MapStore {
    downloadProgress = 0;
    isDownloading = false;
    isUnzipping = false;
    isReady = false;
    error = null;
    mapTilesPath = null;
    statusMessage = 'Initializing...';

    constructor() {
        makeAutoObservable(this);
        this.checkExistingMap();
    }

    setDownloadProgress(progress) {
        this.downloadProgress = progress;
    }

    setIsDownloading(value) {
        this.isDownloading = value;
    }

    setIsUnzipping(value) {
        this.isUnzipping = value;
    }

    setIsReady(value) {
        this.isReady = value;
    }

    setError(error) {
        this.error = error;
    }

    setMapTilesPath(path) {
        this.mapTilesPath = path;
    }

    setStatusMessage(message) {
        this.statusMessage = message;
    }

    async checkExistingMap() {
        try {
            const mapDir = `${FileSystem.documentDirectory}offline_maps/`;
            const extractedPath = `${mapDir}davroad/davroad/`;

            const dirInfo = await FileSystem.getInfoAsync(extractedPath);
            if (dirInfo.exists) {
                console.log('Found existing map on startup');
                runInAction(() => {
                    this.setMapTilesPath(extractedPath);
                    this.setIsReady(true);
                    this.setStatusMessage('Map ready');
                });
            }
        } catch (error) {
            console.log('No existing map found:', error);
        }
    }

    async initializeMap(mapUrl = 'https://davao-water.gov.ph/dcwdApps/mobileApps/reactMap/davroad.zip', notificationCallback = null) {
        try {
            this.setError(null);
            this.setIsReady(false);
            this.setStatusMessage('Checking for existing map...');

            const mapDir = `${FileSystem.documentDirectory}offline_maps/`;
            const zipPath = `${mapDir}davroad.zip`;
            const extractPath = `${mapDir}davroad/`;
            const extractedPath = `${mapDir}davroad/davroad/`;

            // Check if map already exists
            const dirInfo = await FileSystem.getInfoAsync(extractPath);
            if (dirInfo.exists) {
                console.log('Davao Roads map already exists, re-downloading...');
                // Delete old map before re-downloading
                await FileSystem.deleteAsync(extractPath, { idempotent: true });
            }

            // Create directory if it doesn't exist
            await FileSystem.makeDirectoryAsync(mapDir, { intermediates: true });

            // Download map with background notification support
            await this.downloadMap(mapUrl, zipPath, notificationCallback);

            // Notify extraction start
            if (notificationCallback) {
                await notificationCallback(
                    '📦 Extracting Map',
                    'Unpacking map files...'
                );
            }

            // Unzip map
            await this.unzipMap(zipPath, extractPath, notificationCallback);

            // Clean up zip file
            await FileSystem.deleteAsync(zipPath, { idempotent: true });

            runInAction(() => {
                this.setMapTilesPath(extractedPath);
                this.setIsReady(true);
                this.setStatusMessage('Map ready!');
            });

            // Notify completion
            if (notificationCallback) {
                await notificationCallback(
                    '✅ Map Ready',
                    'Offline map downloaded and ready to use!'
                );
            }

        } catch (error) {
            console.error('Map initialization error:', error);
            runInAction(() => {
                this.setError(error.message);
                this.setStatusMessage(`Error: ${error.message}`);
                this.setIsReady(false);
            });

            // Notify error
            if (notificationCallback) {
                await notificationCallback(
                    '❌ Download Failed',
                    error.message
                );
            }
        }
    }

    async downloadMap(url, destination, notificationCallback = null) {
        this.setIsDownloading(true);
        this.setStatusMessage('Downloading map...');

        try {
            console.log('Starting download from:', url);

            let lastNotificationProgress = 0;

            const downloadResumable = FileSystem.createDownloadResumable(
                url,
                destination,
                {},
                (downloadProgress) => {
                    const progress = Math.round(
                        (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
                    );

                    runInAction(() => {
                        this.setDownloadProgress(progress);
                        this.setStatusMessage(`Downloading: ${progress}%`);
                    });

                    // Send notification every 10% progress
                    // if (notificationCallback && progress >= lastNotificationProgress + 10) {
                    //     lastNotificationProgress = progress;
                    //     notificationCallback(
                    //         '📥 Downloading Map',
                    //         `Progress: ${progress}%`,
                    //         progress
                    //     );
                    // }

                    const now = new Date();
                    const time = now.toLocaleTimeString();
                    console.log(`[${time}] Download progress: ${progress}%`);
                }
            );

            const downloadResult = await downloadResumable.downloadAsync();

            if (!downloadResult) {
                throw new Error('Download failed - no result returned');
            }

            console.log('Download complete:', downloadResult.uri);

            runInAction(() => {
                this.setIsDownloading(false);
                this.setStatusMessage('Download complete');
            });

        } catch (error) {
            console.error('Download error:', error);
            runInAction(() => {
                this.setIsDownloading(false);
            });

            // Try to clean up partial download
            try {
                await FileSystem.deleteAsync(destination, { idempotent: true });
            } catch (cleanupError) {
                console.error('Cleanup error:', cleanupError);
            }

            throw new Error(`Download failed: ${error.message}`);
        }
    }

    async unzipMap(zipPath, extractPath, notificationCallback = null) {
        runInAction(() => {
            this.setIsUnzipping(true);
            this.setStatusMessage('Reading zip file...');
        });

        try {
            console.log('Starting fflate extraction...');
            console.log('Zip file:', zipPath);
            console.log('Extract to:', extractPath);

            await FileSystem.makeDirectoryAsync(extractPath, { intermediates: true });

            // Get file size
            const fileInfo = await FileSystem.getInfoAsync(zipPath);
            const fileSize = fileInfo.size ?? 0;
            console.log('Zip file size:', fileSize, 'bytes');

            // Read in ~10MB chunks to avoid OOM, decode directly into a single buffer
            const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB raw bytes per chunk
            const zipBytes = new Uint8Array(fileSize);
            let written = 0;

            const startRead = Date.now();
            while (written < fileSize) {
                const readLen = Math.min(CHUNK_SIZE, fileSize - written);
                const b64Chunk = await FileSystem.readAsStringAsync(zipPath, {
                    encoding: FileSystem.EncodingType.Base64,
                    position: written,
                    length: readLen,
                });

                // Decode base64 chunk directly into the pre-allocated buffer
                const raw = atob(b64Chunk);
                for (let i = 0; i < raw.length; i++) {
                    zipBytes[written + i] = raw.charCodeAt(i);
                }
                written += raw.length;

                const pct = Math.round((written / fileSize) * 100);

                runInAction(() => {
                    this.setStatusMessage(`Reading zip: ${pct}%`);
                });
                console.log(`Read ${pct}% (${written}/${fileSize})`);
            }
            console.log(`Zip read in ${Date.now() - startRead}ms`);

            // Decompress with fflate (much faster than JSZip)
            runInAction(() => {
                this.setStatusMessage('Decompressing...');
            });

            const startDecompress = Date.now();
            const extracted = unzipSync(zipBytes);
            const filenames = Object.keys(extracted);
            console.log(`Decompressed ${filenames.length} entries in ${Date.now() - startDecompress}ms`);

            // Write files in large batches
            const batchSize = 150;
            let processed = 0;
            const createdDirs = new Set();

            for (let i = 0; i < filenames.length; i += batchSize) {
                const batch = filenames.slice(i, Math.min(i + batchSize, filenames.length));

                await Promise.all(
                    batch.map(async (filename) => {
                        if (filename.endsWith('/')) return;

                        const fileData = extracted[filename];
                        if (!fileData || fileData.length === 0) return;

                        const filePath = `${extractPath}${filename}`;
                        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

                        if (dirPath && !createdDirs.has(dirPath)) {
                            createdDirs.add(dirPath);
                            await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
                        }

                        // Convert Uint8Array → base64 for writing
                        let binary = '';
                        const len = fileData.length;
                        const chunkLen = 8192;
                        for (let j = 0; j < len; j += chunkLen) {
                            const slice = fileData.subarray(j, Math.min(j + chunkLen, len));
                            binary += String.fromCharCode.apply(null, slice);
                        }

                        await FileSystem.writeAsStringAsync(filePath, btoa(binary), {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                    })
                );

                processed += batch.length;
                const pct = Math.round((processed / filenames.length) * 100);

                runInAction(() => {
                    this.setStatusMessage(`Writing files: ${pct}% (${processed}/${filenames.length})`);
                });
            }

            console.log('Extraction complete');
            runInAction(() => {
                this.setIsUnzipping(false);
                this.setStatusMessage('Extraction complete');
            });
        } catch (error) {
            console.error('Unzip error:', error);
            runInAction(() => {
                this.setIsUnzipping(false);
                this.setError(error.message);
            });
            throw new Error(`Unzip failed: ${error.message}`);
        }
    }

    async clearMapData() {
        try {
            const mapDir = `${FileSystem.documentDirectory}offline_maps/`;
            await FileSystem.deleteAsync(mapDir, { idempotent: true });

            runInAction(() => {
                this.setIsDownloading(false);
                this.setIsUnzipping(false);
                this.setIsReady(false);
                this.setMapTilesPath(null);
                this.setDownloadProgress(0);
                this.setStatusMessage('Map data cleared');
                this.setError(null);
            });

            console.log('Map data cleared successfully');
        } catch (error) {
            console.error('Clear data error:', error);
            runInAction(() => {
                this.setError(error.message);
                this.setIsDownloading(false);
                this.setIsUnzipping(false);
            });
        }
    }
}

export default new MapStore();
