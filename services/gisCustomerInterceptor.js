import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { devApi } from './interceptor';

const CUSTOMER_DIR = FileSystem.documentDirectory + 'customer_data/';
const GEO_INDEX_FILE = 'geo_index.json';
const DOWNLOAD_DATE_KEY = '@customer_download_date';
const CUSTOMER_COUNT_KEY = '@customer_count';
const ENCRYPTION_KEY = 'dcwd-gis-fast-key-v1';

class GisCustomerInterceptor {
    constructor() {
        this.isInitialized = false;
    }

    async ensureDirectory() {
        const dirInfo = await FileSystem.getInfoAsync(CUSTOMER_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(CUSTOMER_DIR, { intermediates: true });
        }
    }

    async initialize() {
        await this.ensureDirectory();
        this.isInitialized = true;
        return true;
    }

    async getCustomerCount() {
        try {
            const count = await AsyncStorage.getItem(CUSTOMER_COUNT_KEY);
            return count ? parseInt(count, 10) : 0;
        } catch (error) {
            return 0;
        }
    }

    async getLastDownloadDate() {
        return await AsyncStorage.getItem(DOWNLOAD_DATE_KEY);
    }

    async clearDatabase() {
        try {
            await FileSystem.deleteAsync(CUSTOMER_DIR, { idempotent: true });
            await AsyncStorage.removeItem(DOWNLOAD_DATE_KEY);
            await AsyncStorage.removeItem(CUSTOMER_COUNT_KEY);
            await this.ensureDirectory();
            return true;
        } catch (error) {
            console.error('Error clearing customer data:', error);
            throw error;
        }
    }

    // Helper to convert string to Hex (safe for storage)
    stringToHex(str) {
        let hex = '';
        for (let i = 0; i < str.length; i++) {
            hex += str.charCodeAt(i).toString(16).padStart(4, '0');
        }
        return hex;
    }

    // Helper to convert Hex to string
    hexToString(hex) {
        let str = '';
        for (let i = 0; i < hex.length; i += 4) {
            str += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
        }
        return str;
    }

    // Fast XOR encryption/decryption
    processData(input, isEncrypt = true) {
        const key = ENCRYPTION_KEY;
        const kLen = key.length;
        const len = input.length;
        const result = new Array(len);

        for (let i = 0; i < len; i++) {
            result[i] = String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % kLen));
        }
        return result.join('');
    }

    async saveChunk(data, index) {
        await FileSystem.writeAsStringAsync(CUSTOMER_DIR + `chunk_${index}.json`, JSON.stringify(data));
    }

    async emailCustomerFiles() {
        try {
            const isAvailable = await MailComposer.isAvailableAsync();
            if (!isAvailable) {
                console.log('MailComposer is not available');
                return;
            }

            const files = await FileSystem.readDirectoryAsync(CUSTOMER_DIR);
            const attachments = files.filter(f => f.endsWith('.json')).map(f => CUSTOMER_DIR + f);

            if (attachments.length > 0) {
                await MailComposer.composeAsync({
                    recipients: ['cjescueta@gmail.com'],
                    subject: 'DCWD Customer Data Backup',
                    body: `Attached are the customer data chunks downloaded on ${new Date().toLocaleString()}.`,
                    attachments: attachments
                });
            }
        } catch (error) {
            console.error('Error sending email:', error);
        }
    }

    async checkAndPromptDownload(onDownloadStart) {
        try {
            const lastDate = await this.getLastDownloadDate();
            const count = await this.getCustomerCount();
            const today = new Date().toDateString();

            let shouldPrompt = false;
            let message = '';

            if (count === 0 || !lastDate) {
                shouldPrompt = true;
                message = 'No offline customer data found. Download now to enable offline search?';
            } else if (lastDate !== today) {
                shouldPrompt = true;
                message = 'Your customer data is outdated. Would you like to download the latest data?';
            }

            if (shouldPrompt) {
                Alert.alert(
                    'Download Customer Data',
                    message,
                    [
                        { text: 'Later', style: 'cancel' },
                        { text: 'Download', onPress: onDownloadStart }
                    ]
                );
            }
        } catch (error) {
            console.error('Error checking download date:', error);
        }
    }

    async downloadAndSaveCustomers(onProgress) {
        try {
            console.log('Starting customer download (Chunked, Name Encrypted)...');
            await this.ensureDirectory();

            // 1. Auth Check
            const token = await AsyncStorage.getItem('token');
            if (!token) throw new Error('User not authenticated');

            // 2. Get Count
            const countResponse = await devApi.get('/admin/Customer/paginate', {
                params: { pageIndex: 1, pageSize: 1, _t: Date.now() }
            });
            const countData = countResponse.data;
            const totalCount = countData.data?.count || countData.data?.totalCount || 0;

            if (totalCount === 0) return { success: true, count: 0 };

            const pageSize = 2000;
            const totalPages = Math.ceil(totalCount / pageSize);

            await this.clearDatabase();

            let currentChunk = [];
            let chunkIndex = 0;
            let processedRecords = 0;

            // 3. Download Pages
            const BATCH_SIZE = 20; // Number of concurrent requests
            let completedPages = 0;

            for (let i = 0; i < totalPages; i += BATCH_SIZE) {
                const batchPromises = [];
                const endPage = Math.min(i + BATCH_SIZE, totalPages);

                for (let page = i; page < endPage; page++) {
                    batchPromises.push(
                        (async () => {
                            try {
                                const response = await devApi.get('/admin/Customer/paginate', {
                                    params: { pageIndex: page + 1, pageSize: pageSize, _t: Date.now() }
                                });
                                return response.data?.data?.data || [];
                            } catch (e) {
                                console.error(`Error downloading page ${page + 1}:`, e);
                                return []; // Return empty on error to continue
                            }
                        })()
                    );
                }

                const batchResults = await Promise.all(batchPromises);

                for (const customers of batchResults) {
                    if (customers && customers.length > 0) {
                        // Encrypt name only while appending
                        const processedBatch = customers.map(c => ({
                            ...c,
                            name: this.stringToHex(this.processData(c.name || '', true))
                        }));

                        currentChunk = currentChunk.concat(processedBatch);
                        processedRecords += processedBatch.length;
                    }

                    if (currentChunk.length >= 2000) {
                        await this.saveChunk(currentChunk, chunkIndex++);
                        currentChunk = [];
                    }
                    completedPages++;
                }

                if (onProgress) {
                    const percent = Math.round((completedPages / totalPages) * 100);
                    onProgress(percent, totalPages, processedRecords, 'downloading');
                }
            }

            // Save remaining records
            if (currentChunk.length > 0) {
                await this.saveChunk(currentChunk, chunkIndex++);
            }

            // Update Metadata
            await AsyncStorage.setItem(DOWNLOAD_DATE_KEY, new Date().toDateString());
            await AsyncStorage.setItem(CUSTOMER_COUNT_KEY, processedRecords.toString());

            if (onProgress) {
                onProgress(100, totalPages, processedRecords, 'indexing');
            }

            // Build spatial index immediately after download
            await this.buildSpatialIndex();

            //await this.emailCustomerFiles();

            return { success: true, count: processedRecords };

        } catch (error) {
            console.error('Download interceptor error:', error);
            return { success: false, error: error.message };
        }
    }

    // Haversine formula for distance calculation
    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    async findNearestMeters(lat, lng, limit = 3) {
        try {
            await this.ensureDirectory();

            // Check if index exists
            const indexFile = CUSTOMER_DIR + GEO_INDEX_FILE;
            const indexInfo = await FileSystem.getInfoAsync(indexFile);

            if (!indexInfo.exists) {
                console.log('Index missing, building spatial index...');
                await this.buildSpatialIndex();
            }

            return await this.searchUsingIndex(lat, lng, limit);
        } catch (error) {
            console.error('Find nearest error:', error);
            return [];
        }
    }

    async searchUsingIndex(lat, lng, limit) {
        try {
            const content = await FileSystem.readAsStringAsync(CUSTOMER_DIR + GEO_INDEX_FILE);
            const index = JSON.parse(content);

            // Filter using bounding box first (fast) - approx 2km radius
            const range = 0.02;
            const candidates = [];

            for (let i = 0; i < index.length; i++) {
                const item = index[i];
                // item: [lat, lng, chunkIdx, rowIdx]
                if (Math.abs(lat - item[0]) <= range && Math.abs(lng - item[1]) <= range) {
                    const dist = this.getDistance(lat, lng, item[0], item[1]);
                    candidates.push({ item, dist });
                }
            }

            candidates.sort((a, b) => a.dist - b.dist);
            const top = candidates.slice(0, limit);

            const results = [];
            const chunksLoaded = {}; // Cache loaded chunks to minimize I/O

            for (const candidate of top) {
                const [rLat, rLng, chunkIdx, rowIdx] = candidate.item;

                if (!chunksLoaded[chunkIdx]) {
                    const chunkContent = await FileSystem.readAsStringAsync(CUSTOMER_DIR + `chunk_${chunkIdx}.json`);
                    chunksLoaded[chunkIdx] = JSON.parse(chunkContent);
                }

                const row = chunksLoaded[chunkIdx][rowIdx];
                if (row) {
                    const decryptedName = row.name ? this.processData(this.hexToString(row.name), false) : '';
                    results.push({
                        ...row,
                        name: decryptedName,
                        distance: candidate.dist,
                        latitude: rLat,
                        longitude: rLng
                    });
                }
            }

            return results;
        } catch (e) {
            console.error('Index search failed', e);
            await FileSystem.deleteAsync(CUSTOMER_DIR + GEO_INDEX_FILE, { idempotent: true });
            return [];
        }
    }

    async buildSpatialIndex() {
        console.log('Building spatial index...');
        const files = await FileSystem.readDirectoryAsync(CUSTOMER_DIR);
        const chunkFiles = files.filter(f => f.startsWith('chunk_') && f.endsWith('.json'));

        if (chunkFiles.length === 0) return;

        const index = [];

        for (const file of chunkFiles) {
            const chunkIdx = parseInt(file.replace('chunk_', '').replace('.json', ''));
            const content = await FileSystem.readAsStringAsync(CUSTOMER_DIR + file);
            const chunk = JSON.parse(content);

            for (let i = 0; i < chunk.length; i++) {
                const row = chunk[i];
                const rLat = parseFloat(row.latitude || row.lat || row.Latitude || row.LAT);
                const rLng = parseFloat(row.longitude || row.lng || row.Longitude || row.LNG);

                if (!isNaN(rLat) && !isNaN(rLng)) {
                    // Add to index: [lat, lng, chunkIdx, rowIdx]
                    index.push([rLat, rLng, chunkIdx, i]);
                }
            }
        }

        // Save index for next time
        await FileSystem.writeAsStringAsync(CUSTOMER_DIR + GEO_INDEX_FILE, JSON.stringify(index));
        console.log('Spatial index built successfully');
    }

    async searchCustomers(query) {
        if (!query || query.length < 5) return [];

        try {
            await this.ensureDirectory();
            const files = await FileSystem.readDirectoryAsync(CUSTOMER_DIR);
            const chunkFiles = files.filter(f => f.startsWith('chunk_') && f.endsWith('.json'));

            if (chunkFiles.length === 0) return [];

            const lowerQuery = query.toLowerCase();
            let results = [];

            for (const file of chunkFiles) {
                const content = await FileSystem.readAsStringAsync(CUSTOMER_DIR + file);
                const chunk = JSON.parse(content);

                for (const row of chunk) {
                    // Search only in non-encrypted fields
                    if (
                        (row.accountNumber && row.accountNumber.toLowerCase().includes(lowerQuery)) ||
                        (row.meterNumber && row.meterNumber.toLowerCase().includes(lowerQuery)) ||
                        (row.address && row.address.toLowerCase().includes(lowerQuery))
                    ) {
                        // Decrypt name only for result display
                        const decryptedName = this.processData(this.hexToString(row.name), false);
                        results.push({ ...row, name: decryptedName });

                        if (results.length >= 20) break;
                    }
                }
                if (results.length >= 20) break;
            }

            return results;
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }
}

export default new GisCustomerInterceptor();