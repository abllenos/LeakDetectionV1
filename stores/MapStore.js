import { makeAutoObservable, runInAction } from 'mobx';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';

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
        this.setIsUnzipping(true);
        this.setStatusMessage('Starting extraction...');

        try {
            console.log('Starting extraction...');
            console.log('Zip file:', zipPath);
            console.log('Extract to:', extractPath);

            // Create extract directory
            await FileSystem.makeDirectoryAsync(extractPath, { intermediates: true });

            // Read file info first to check size
            const fileInfo = await FileSystem.getInfoAsync(zipPath);
            console.log('Zip file size:', fileInfo.size, 'bytes');

            // Reduce chunk size to prevent memory issues
            const chunkSize = 1024 * 1024 * 5; // 5MB chunks (reduced from 10MB)
            let offset = 0;
            const chunks = [];

            let lastNotificationProgress = 0;

            // Phase 1: Read file in chunks (0-100% of reading phase)
            console.log('Phase 1: Reading zip file...');
            while (offset < fileInfo.size) {
                const readSize = Math.min(chunkSize, fileInfo.size - offset);

                const base64Chunk = await FileSystem.readAsStringAsync(zipPath, {
                    encoding: FileSystem.EncodingType.Base64,
                    position: offset,
                    length: readSize
                });

                const binaryString = atob(base64Chunk);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                chunks.push(bytes);

                offset += readSize;
                const readProgress = Math.round((offset / fileInfo.size) * 100);

                runInAction(() => {
                    this.setStatusMessage(`Reading zip file: ${readProgress}%`);
                });

                // Send notification every 10% progress for reading
                // if (notificationCallback && readProgress >= lastNotificationProgress + 10) {
                //     lastNotificationProgress = readProgress;
                //     await notificationCallback(
                //         '📦 Reading Zip File',
                //         `Progress: ${readProgress}%`
                //     );
                // }

                const now = new Date();
                const time = now.toLocaleTimeString();
                console.log(`[${time}] Read progress: ${readProgress}% (${offset}/${fileInfo.size} bytes)`);

                // Force garbage collection hint by nullifying old references
                if (chunks.length > 20) {
                    console.log('Memory management: Assembling chunks...');
                    const tempBuffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
                    let tempOffset = 0;
                    for (const chunk of chunks) {
                        tempBuffer.set(chunk, tempOffset);
                        tempOffset += chunk.length;
                    }
                    chunks.length = 0;
                    chunks.push(tempBuffer);
                }
            }

            // Assemble all chunks into final buffer
            console.log('Assembling final buffer...');
            runInAction(() => {
                this.setStatusMessage('Assembling zip data...');
            });

            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const zipBuffer = new Uint8Array(totalLength);
            let bufferOffset = 0;
            for (const chunk of chunks) {
                zipBuffer.set(chunk, bufferOffset);
                bufferOffset += chunk.length;
            }
            chunks.length = 0; // Clear chunks array

            console.log('Loading zip with JSZip...');
            runInAction(() => {
                this.setStatusMessage('Processing zip file...');
            });

            if (notificationCallback) {
                await notificationCallback(
                    '📦 Processing Zip',
                    'Loading zip structure...'
                );
            }

            const zip = new JSZip();
            const zipData = await zip.loadAsync(zipBuffer);

            console.log('Extracting files...');

            // Phase 2: Extract files (0-100% of extraction phase)
            const files = Object.keys(zipData.files);
            let processed = 0;
            const batchSize = 50;

            lastNotificationProgress = 0;

            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, Math.min(i + batchSize, files.length));

                await Promise.all(
                    batch.map(async (filename) => {
                        const file = zipData.files[filename];

                        if (!file.dir) {
                            const content = await file.async('base64');
                            const filePath = `${extractPath}${filename}`;

                            const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
                            if (dirPath) {
                                await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
                            }

                            await FileSystem.writeAsStringAsync(filePath, content, {
                                encoding: FileSystem.EncodingType.Base64
                            });
                        }
                    })
                );

                processed += batch.length;
                const extractProgress = Math.round((processed / files.length) * 100);

                runInAction(() => {
                    this.setStatusMessage(`Extracting files: ${extractProgress}% (${processed}/${files.length} files)`);
                });

                // Send notification every 10% progress for extraction
                // if (notificationCallback && extractProgress >= lastNotificationProgress + 10) {
                //     lastNotificationProgress = extractProgress;
                //     await notificationCallback(
                //         '📦 Extracting Files',
                //         `Progress: ${extractProgress}%`
                //     );
                // }

                const now = new Date();
                const time = now.toLocaleTimeString();
                console.log(`[${time}] Extraction progress: ${extractProgress}% (${processed}/${files.length} files)`);
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
