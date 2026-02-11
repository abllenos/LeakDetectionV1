// Helpers to handle storage-full scenarios caused by large cached datasets
const STORAGE_AUTH_KEYS = new Set(['token', 'refresh_token', 'userData', 'savedUsername', 'savedPassword', 'rememberMe']);

const isStorageFullError = (err) => {
  const msg = (err?.message || err?.toString() || '').toString();
  return /SQLITE_FULL|database or disk is full|ENOSPC|no such file or directory/i.test(msg);
};

const clearHeavyStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter((k) => {
      if (STORAGE_AUTH_KEYS.has(k)) return false;
      return (
        k.startsWith('allCustomers_') ||
        k === 'dmaCodes'
      );
    });
    if (keysToRemove.length) {
      await AsyncStorage.multiRemove(keysToRemove);
      console.log(`🧹 Cleared heavy storage keys: ${keysToRemove.length}`);
    }
  } catch (e) {
    console.warn('Failed during heavy storage cleanup:', e?.message || e);
  }
};

const safeSetItem = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (e) {
    if (isStorageFullError(e)) {
      console.warn('Storage full detected while writing', key, '- attempting cleanup and retry');
      await clearHeavyStorage();
      await AsyncStorage.setItem(key, value);
      return;
    }
    throw e;
  }
};

export const login = async (username, password) => {
  try {
    const u = (username ?? '').toString().trim();
    const p = (password ?? '').toString().trim();
    console.log('🔑 Attempting login for user:', u);
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('refresh_token');
    const { data } = await devApi.post('/admin/userlogin/login', {
      username: u,
      password: p,
    });
    console.log('📥 Login response received:', JSON.stringify(data, null, 2));
    if (data?.statusCode === 200 && data?.data?.token) {
      const { token, refreshToken } = data.data;
      await safeSetItem('token', token);
      if (refreshToken) {
        await safeSetItem('refresh_token', refreshToken);
      }
      await safeSetItem('userData', JSON.stringify(data.data));
      console.log('✅ Login successful - User:', data.data.fName, data.data.lName);
      return data.data;
    }
    console.warn('⚠️ Login failed - invalid response format:', data);
    throw new Error(data?.message || 'Login failed');
  } catch (error) {
    if (isStorageFullError(error)) {
      const friendly = new Error('Storage is full. Please clear cached data in Settings > Clear All Storage Data, then try again.');
      console.error('❌ Login error: storage full');
      throw friendly;
    }
    console.error('❌ Login error:', error?.response?.status, error?.response?.data || error.message);
    if (error?.response) {
      console.error('Full error response:', JSON.stringify(error.response, null, 2));
    }
    throw error;
  }
};

export const logout = async () => {
  const keysToRemove = ['token', 'refresh_token', 'userData'];
  await AsyncStorage.multiRemove(keysToRemove);
  console.log('✓ Cleared auth tokens (customer cache preserved)');
};

export const fetchDmaCodes = async (forceRefresh = false) => {
  try {
    if (!forceRefresh) {
      const cached = await AsyncStorage.getItem('dmaCodes');
      if (cached) {
        return JSON.parse(cached);
      }
    }
    const res = await devApi.get('/admin/dmainlet/all');
    const items = res?.data?.data?.data || [];
    const codes = items.map((it) => it.dmaCode).filter(Boolean);
    await safeSetItem('dmaCodes', JSON.stringify(codes));
    return codes;
  } catch (error) {
    console.error('Failed to fetch DMA codes:', error?.response?.data || error.message || error);
    throw error;
  }
};

// Search offline customer data
export const searchOfflineCustomers = async (searchValue) => {
  try {
    const GisCustomerInterceptor = require('./gisCustomerInterceptor').default;
    return await GisCustomerInterceptor.searchCustomers(searchValue);
  } catch (error) {
    console.error('❌ Offline search error:', error);
    return [];
  }
};

export const searchAccountOrMeter = async (searchValue, forceOffline = false) => {
  try {
    // Check if we should use offline search
    const netInfo = await import('@react-native-community/netinfo');
    const state = await netInfo.default.fetch();
    const isOnline = state.isConnected && state.isInternetReachable !== false;

    if (!isOnline || forceOffline) {
      console.log('📴 Device offline - using offline customer search');
      const offlineResults = await searchOfflineCustomers(searchValue);

      if (offlineResults.length > 0) {
        return { data: offlineResults, offline: true };
      }

      // Return empty with offline flag
      return { data: [], offline: true, message: 'No matching customer found in offline data' };
    }

    // Online search
    const res = await devApi.get('/admin/customer/SearchAccountOrMeterNumber', {
      params: { searchValue },
    });
    return res?.data;
  } catch (err) {
    // If online search fails, try offline as fallback
    console.log('⚠️ Online search failed, trying offline fallback...');
    try {
      const offlineResults = await searchOfflineCustomers(searchValue);
      if (offlineResults.length > 0) {
        return { data: offlineResults, offline: true, fallback: true };
      }
    } catch (offlineErr) {
      console.error('Offline fallback also failed:', offlineErr);
    }

    const status = err?.response?.status || err?.response?.data?.statusCode;
    const message = err?.response?.data?.message;
    if (status === 404 && message && message.toLowerCase().includes('no matching customer')) {
      return { data: [] };
    }
    console.error('searchAccountOrMeter error', err?.response?.data || err.message || err);
    throw err;
  }
};

export const getAvailableCustomers = async () => {
  try {
    const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
    console.log('📦 Checking customer data - chunk count:', chunkCount);

    if (chunkCount) {
      const chunks = parseInt(chunkCount);
      console.log(`📦 Loading ${chunks} chunks...`);
      let allCustomers = [];
      let missingChunks = [];

      for (let i = 0; i < chunks; i++) {
        const chunk = await AsyncStorage.getItem(`allCustomers_chunk_${i}`);
        if (chunk) {
          const parsedChunk = JSON.parse(chunk);
          console.log(`📦 Chunk ${i}: ${parsedChunk.length} records`);
          allCustomers = allCustomers.concat(parsedChunk);
        } else {
          console.log(`⚠️ Chunk ${i} is missing`);
          missingChunks.push(i);
        }
      }

      // Report data integrity status
      if (missingChunks.length > 0) {
        console.warn(`⚠️ DATA INCOMPLETE: ${missingChunks.length} chunks missing out of ${chunks}`);
        console.warn(`⚠️ Missing chunks: ${missingChunks.slice(0, 10).join(', ')}${missingChunks.length > 10 ? '...' : ''}`);
        console.warn('⚠️ Please re-download customer data from Settings');
      }

      if (allCustomers.length > 0) {
        console.log(`📦 Loaded ${allCustomers.length} customers from ${chunks} chunks (${missingChunks.length} missing)`);
        return allCustomers;
      } else {
        console.log('⚠️ Chunks exist but no data loaded');
      }
    }

    const manifest = await AsyncStorage.getItem('allCustomers_manifest');
    const downloadCount = await AsyncStorage.getItem('allCustomers_download_count');
    console.log('📦 Manifest:', manifest ? 'exists' : 'none');
    console.log('📦 Download count:', downloadCount);

    if (manifest) {
      const manifestData = JSON.parse(manifest);
      const pagesFetched = Array.isArray(manifestData.pagesFetched) ? manifestData.pagesFetched : [];
      if (pagesFetched.length > 0) {
        console.log(`📦 Loading ${pagesFetched.length} downloaded pages...`);
        let partialCustomers = [];
        const BATCH_SIZE = 50;
        for (let i = 0; i < pagesFetched.length; i += BATCH_SIZE) {
          const batch = pagesFetched.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map(async (pageNum) => {
            const pageKey = `allCustomers_page_${pageNum}`;
            const pageData = await AsyncStorage.getItem(pageKey);
            return pageData ? JSON.parse(pageData) : [];
          });
          const batchResults = await Promise.all(batchPromises);
          for (const result of batchResults) {
            partialCustomers = partialCustomers.concat(result);
          }
          if (pagesFetched.length > 500 && (i + BATCH_SIZE) % 500 === 0) {
            console.log(`📦 Loaded ${i + BATCH_SIZE}/${pagesFetched.length} pages...`);
          }
        }
        console.log(`📦 Loaded ${partialCustomers.length} customers from ${pagesFetched.length} pages (download in progress)`);
        return partialCustomers;
      }
    }
    console.log('📦 No customer data available yet');
    return [];
  } catch (error) {
    console.error('Failed to get available customers:', error?.message || error);
    return [];
  }
};

// Check if customer data download is complete
export const checkCustomerDataIntegrity = async () => {
  try {
    // First check manifest
    const manifest = await AsyncStorage.getItem('allCustomers_manifest');
    if (manifest) {
      const manifestData = JSON.parse(manifest);
      console.log('📋 Manifest status:', manifestData.status);

      // If manifest says complete, verify by checking chunks
      if (manifestData.status === 'complete') {
        const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
        const totalCount = await AsyncStorage.getItem('allCustomers_count');
        if (chunkCount && totalCount) {
          return {
            complete: true,
            totalChunks: parseInt(chunkCount),
            totalRecords: parseInt(totalCount),
          };
        }
      }
    }

    const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
    if (!chunkCount || parseInt(chunkCount) === 0) {
      return { complete: false, reason: 'No data downloaded', totalChunks: 0, loadedRecords: 0 };
    }

    const chunks = parseInt(chunkCount);
    let missingChunks = [];
    let totalRecords = 0;

    // Check each chunk exists and count records
    for (let i = 0; i < chunks; i++) {
      const chunk = await AsyncStorage.getItem(`allCustomers_chunk_${i}`);
      if (chunk) {
        try {
          const parsedChunk = JSON.parse(chunk);
          totalRecords += parsedChunk.length;
        } catch (e) {
          console.warn(`⚠️ Chunk ${i} is corrupted`);
          missingChunks.push(i);
        }
      } else {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      return {
        complete: false,
        reason: `${missingChunks.length} chunks missing or corrupted`,
        missingChunks,
        totalChunks: chunks,
        loadedRecords: totalRecords,
      };
    }

    // All chunks present - mark as complete
    return {
      complete: true,
      totalChunks: chunks,
      totalRecords,
    };
  } catch (error) {
    console.error('Error checking data integrity:', error);
    return { complete: false, reason: error.message, totalChunks: 0, loadedRecords: 0 };
  }
};

export const hasRemoteDataChanged = async () => {
  try {
    const cachedCount = await AsyncStorage.getItem('allCustomers_count');
    if (!cachedCount) {
      console.log('No cached data, download needed');
      return true;
    }
    const res = await devApi.get('/admin/customer/paginate', {
      params: { page: 1, pageSize: 50 }
    });
    const firstPageData = res?.data?.data || res?.data || {};
    const remoteCount = firstPageData.count || firstPageData.totalRecords || firstPageData.total || firstPageData.totalCount || 0;
    const localCount = parseInt(cachedCount) || 0;
    console.log(`📊 Data comparison: Local=${localCount}, Remote=${remoteCount}`);
    if (remoteCount !== localCount) {
      console.log('⚠️ Remote data has changed, re-download recommended');
      return true;
    }
    console.log('✓ Remote data unchanged, using cache');
    return false;
  } catch (error) {
    console.error('Failed to check remote data:', error?.message || error);
    return false;
  }
};

export const checkForNewData = async () => {
  try {
    // Check if user is authenticated first
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      console.log('⏭️ Skipping data check - not authenticated');
      return {
        hasNewData: false,
        localCount: 0,
        remoteCount: 0,
        difference: 0,
        needsDownload: false,
        skipped: true
      };
    }

    const cachedCount = await AsyncStorage.getItem('allCustomers_count');
    const localCount = parseInt(cachedCount) || 0;
    const res = await devApi.get('/admin/customer/paginate', {
      params: { page: 1, pageSize: 50 }
    });
    const firstPageData = res?.data?.data || res?.data || {};
    const remoteCount = firstPageData.count || firstPageData.totalRecords || firstPageData.total || firstPageData.totalCount || 0;
    const difference = remoteCount - localCount;
    console.log(`📊 Data check: Local=${localCount}, Remote=${remoteCount}, Difference=${difference}`);
    return {
      hasNewData: difference > 0,
      localCount,
      remoteCount,
      difference,
      needsDownload: remoteCount !== localCount
    };
  } catch (error) {
    console.error('Failed to check for new data:', error?.message || error);
    return {
      hasNewData: false,
      localCount: 0,
      remoteCount: 0,
      difference: 0,
      needsDownload: false,
      error: error?.message || 'Unknown error'
    };
  }
};

export const fetchAllCustomers = async (forceRefresh = false, onProgress = null, opts = {}) => {
  const BATCH_SIZE = 5000; // Download 5000 records per batch
  const CHUNK_SIZE = 5000; // Save to AsyncStorage every 5,000 records
  const API_URL = 'https://api.davao-water.gov.ph/dcwd-gis/api/v1/admin/customer/all';

  try {
    console.log('📥 Starting batched customer data download...');

    // Check if user is authenticated
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required. Please log in first.');
    }

    // Check if we already have cached data and not forcing refresh
    if (!forceRefresh) {
      const manifest = await AsyncStorage.getItem('allCustomers_manifest');
      if (manifest) {
        const manifestData = JSON.parse(manifest);
        if (manifestData.status === 'complete') {
          console.log('✅ Using cached customer data:', manifestData.totalRecords, 'records');
          return true;
        }
      }
    }

    // Initialize download
    let currentChunkData = [];
    let currentChunkIndex = 0;
    let totalRecords = 0;
    let currentPage = 1;
    let hasMore = true;
    let estimatedTotal = 0;

    // Mark download as in progress
    await safeSetItem('allCustomers_manifest', JSON.stringify({
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      batchSize: BATCH_SIZE,
    }));

    while (hasMore) {
      try {
        const offset = (currentPage - 1) * BATCH_SIZE;
        console.log(`📦 Fetching batch ${currentPage} (offset: ${offset})...`);

        // Fetch batch from API with pagination
        const response = await devApi.get(API_URL, {
          params: {
            limit: BATCH_SIZE,
            offset: offset,
            page: currentPage,
          },
          timeout: 120000, // 2 minute timeout per batch
        });

        const batchData = response?.data?.data || response?.data || [];
        const records = Array.isArray(batchData) ? batchData : (batchData.records || batchData.customers || []);

        // Try to get total count from response
        if (currentPage === 1) {
          estimatedTotal = response?.data?.total || response?.data?.count || response?.data?.totalRecords || 280000;
          console.log(`📊 Estimated total records: ${estimatedTotal}`);
        }

        console.log(`✅ Batch ${currentPage} received: ${records.length} records`);

        if (records.length === 0) {
          hasMore = false;
          console.log('📊 No more records to fetch');
          break;
        }

        // Handle API returning all data at once (no pagination support)
        if (currentPage === 1 && records.length > 50000) {
          console.log(`📊 API returned ${records.length} records in single response - saving in chunks...`);
          let chunkIndex = 0;
          for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            const chunk = records.slice(i, i + CHUNK_SIZE);
            await safeSetItem(`allCustomers_chunk_${chunkIndex}`, JSON.stringify(chunk));
            chunkIndex++;

            // Update progress
            if (onProgress) {
              onProgress({
                current: i + chunk.length,
                total: records.length,
                percentage: Math.round(((i + chunk.length) / records.length) * 100),
              });
            }
          }

          await safeSetItem('allCustomers_chunks', chunkIndex.toString());
          await safeSetItem('allCustomers_count', records.length.toString());
          await safeSetItem('allCustomers_timestamp', new Date().toISOString());
          await safeSetItem('allCustomers_manifest', JSON.stringify({
            status: 'complete',
            completedAt: new Date().toISOString(),
            totalRecords: records.length,
            totalChunks: chunkIndex,
          }));
          console.log(`✅ All ${records.length} customer records saved in ${chunkIndex} chunks`);
          return true;
        }

        // Add records to current chunk buffer
        for (const record of records) {
          currentChunkData.push(record);
          totalRecords++;

          // Save chunk when buffer is full
          if (currentChunkData.length >= CHUNK_SIZE) {
            console.log(`💾 Saving chunk ${currentChunkIndex} (${currentChunkData.length} records)...`);
            await safeSetItem(`allCustomers_chunk_${currentChunkIndex}`, JSON.stringify(currentChunkData));

            // Update chunk count immediately after saving
            await safeSetItem('allCustomers_chunks', (currentChunkIndex + 1).toString());
            await safeSetItem('allCustomers_count', totalRecords.toString());

            currentChunkIndex++;
            currentChunkData = [];
          }
        }

        // Report progress - use batch-based progress since we don't know actual total
        if (onProgress) {
          // If we got less than BATCH_SIZE, we're on the last batch
          const isLastBatch = records.length < BATCH_SIZE;
          let percentage;

          if (isLastBatch) {
            percentage = 100; // We're done!
          } else if (estimatedTotal > 0 && estimatedTotal > totalRecords) {
            // Use estimated total if available and reasonable
            percentage = Math.min(95, Math.round((totalRecords / estimatedTotal) * 100));
          } else {
            // Fallback: increment by smaller amounts per batch
            percentage = Math.min(95, currentPage * 2);
          }

          onProgress({
            current: totalRecords,
            total: estimatedTotal || totalRecords,
            batch: currentPage,
            percentage,
          });
        }

        // Check if we received less than batch size (indicates last page)
        if (records.length < BATCH_SIZE) {
          hasMore = false;
          console.log('📊 Last batch received');
        } else {
          currentPage++;
          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 300));
        }

      } catch (batchError) {
        console.error(`❌ Error fetching batch ${currentPage}:`, batchError.message);

        // Save any remaining data in buffer
        if (currentChunkData.length > 0) {
          console.log(`💾 Saving partial chunk ${currentChunkIndex} (${currentChunkData.length} records) before stopping...`);
          await safeSetItem(`allCustomers_chunk_${currentChunkIndex}`, JSON.stringify(currentChunkData));
          await safeSetItem('allCustomers_chunks', (currentChunkIndex + 1).toString());
          await safeSetItem('allCustomers_count', totalRecords.toString());
          currentChunkIndex++;
        }

        // Update manifest as partial
        await safeSetItem('allCustomers_manifest', JSON.stringify({
          status: 'partial',
          partialAt: new Date().toISOString(),
          totalRecords,
          totalChunks: currentChunkIndex,
          lastBatch: currentPage,
          error: batchError.message,
        }));

        if (totalRecords > 0) {
          console.warn(`⚠️ Download stopped with ${totalRecords} records saved. Can be resumed.`);
          throw new Error(`Download interrupted at ${totalRecords} records. You can continue downloading later.`);
        } else {
          throw batchError;
        }
      }
    }

    // Save any remaining data in buffer
    if (currentChunkData.length > 0) {
      console.log(`💾 Saving final chunk ${currentChunkIndex} (${currentChunkData.length} records)...`);
      await safeSetItem(`allCustomers_chunk_${currentChunkIndex}`, JSON.stringify(currentChunkData));
      currentChunkIndex++;
    }

    console.log(`✅ Download complete: ${totalRecords} total customers in ${currentChunkIndex} chunks`);

    // Save final metadata
    await safeSetItem('allCustomers_chunks', currentChunkIndex.toString());
    await safeSetItem('allCustomers_count', totalRecords.toString());
    await safeSetItem('allCustomers_timestamp', new Date().toISOString());
    await safeSetItem('allCustomers_manifest', JSON.stringify({
      status: 'complete',
      completedAt: new Date().toISOString(),
      totalRecords,
      totalChunks: currentChunkIndex,
      batches: currentPage,
    }));

    if (onProgress) {
      onProgress({ current: totalRecords, total: totalRecords, percentage: 100 });
    }

    console.log('💾 Customer data cached successfully');
    return true;

  } catch (error) {
    console.error('❌ fetchAllCustomers error:', error.message || error);

    // Mark as failed in manifest
    await safeSetItem('allCustomers_manifest', JSON.stringify({
      status: 'failed',
      failedAt: new Date().toISOString(),
      error: error.message,
    }));

    // Provide user-friendly error messages
    if (error.response?.status === 401) {
      throw new Error('Session expired. Please log out and log in again.');
    } else if (error.message?.includes('Authentication required')) {
      throw error;
    } else if (isStorageFullError(error)) {
      throw new Error('Storage is full. Please clear some space and try again.');
    }

    throw error;
  }
};

// Resume downloading missing customer data (continues from where it left off)
export const resumeCustomerDownload = async (onProgress = null, opts = {}) => {
  const BATCH_SIZE = 5000;
  const CHUNK_SIZE = 5000;
  const API_URL = 'https://api.davao-water.gov.ph/dcwd-gis/api/v1/admin/customer/all';

  try {
    console.log('🔄 Resuming customer data download...');

    // Check authentication
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required. Please log in first.');
    }

    // Check current download status
    const integrityCheck = await checkCustomerDataIntegrity();
    console.log('📊 Current integrity status:', integrityCheck);

    if (integrityCheck.complete) {
      console.log('✅ Data already complete, no resume needed');
      if (onProgress) onProgress({ current: integrityCheck.totalRecords, percentage: 100 });
      return true;
    }

    // Get how many records we already have
    const existingRecords = integrityCheck.loadedRecords || 0;
    // This was the bug: it was using the total declared chunks, not the count of chunks actually present.
    const numPresentChunks = (integrityCheck.totalChunks || 0) - (integrityCheck.missingChunks?.length || 0);
    const existingChunks = numPresentChunks;
    const estimatedTotal = 280000; // Estimated total

    console.log(`📊 Resuming from: ${existingRecords} records, ${existingChunks} chunks`);

    // Calculate starting point
    let currentChunkIndex = existingChunks;
    let totalRecords = existingRecords;
    let currentChunkData = [];

    // Calculate API offset - we need to start from exactly where we left off
    const startOffset = existingRecords;
    let currentPage = Math.floor(startOffset / BATCH_SIZE) + 1;
    let hasMore = true;

    console.log(`📥 Starting from page ${currentPage}, offset ${startOffset}...`);

    // Update manifest to show resuming
    await safeSetItem('allCustomers_manifest', JSON.stringify({
      status: 'resuming',
      resumedAt: new Date().toISOString(),
      resumedFromRecords: existingRecords,
      resumedFromChunks: existingChunks,
    }));

    while (hasMore) {
      try {
        const offset = (currentPage - 1) * BATCH_SIZE;
        console.log(`📦 Fetching batch ${currentPage} (offset: ${offset})...`);

        const response = await devApi.get(API_URL, {
          params: {
            limit: BATCH_SIZE,
            offset: offset,
            page: currentPage,
          },
          timeout: 120000, // 2 minute timeout
        });

        const batchData = response?.data?.data || response?.data || [];
        const records = Array.isArray(batchData) ? batchData : (batchData.records || batchData.customers || []);

        console.log(`✅ Batch ${currentPage} received: ${records.length} records`);

        if (records.length === 0) {
          hasMore = false;
          console.log('📊 No more records to fetch');
          break;
        }

        // Add records to buffer and save chunks when full
        for (const record of records) {
          currentChunkData.push(record);
          totalRecords++;

          if (currentChunkData.length >= CHUNK_SIZE) {
            console.log(`💾 Saving chunk ${currentChunkIndex} (${currentChunkData.length} records)...`);
            await safeSetItem(`allCustomers_chunk_${currentChunkIndex}`, JSON.stringify(currentChunkData));
            await safeSetItem('allCustomers_chunks', (currentChunkIndex + 1).toString());
            await safeSetItem('allCustomers_count', totalRecords.toString());
            currentChunkIndex++;
            currentChunkData = [];
          }
        }

        // Report progress - use batch-based detection for completion
        if (onProgress) {
          const isLastBatch = records.length < BATCH_SIZE;
          let percentage;

          if (isLastBatch) {
            percentage = 100;
          } else if (estimatedTotal > 0 && estimatedTotal > totalRecords) {
            percentage = Math.min(95, Math.round((totalRecords / estimatedTotal) * 100));
          } else {
            percentage = Math.min(95, currentPage * 2);
          }

          onProgress({
            current: totalRecords,
            total: estimatedTotal || totalRecords,
            percentage,
            resumed: true,
          });
        }

        // Check if last batch
        if (records.length < BATCH_SIZE) {
          hasMore = false;
          console.log('📊 Last batch received');
        } else {
          currentPage++;
          await new Promise(resolve => setTimeout(resolve, 300));
        }

      } catch (batchError) {
        console.error(`❌ Error fetching batch ${currentPage}:`, batchError.message);

        // Save remaining buffer
        if (currentChunkData.length > 0) {
          console.log(`💾 Saving partial chunk ${currentChunkIndex} before stopping...`);
          await safeSetItem(`allCustomers_chunk_${currentChunkIndex}`, JSON.stringify(currentChunkData));
          await safeSetItem('allCustomers_chunks', (currentChunkIndex + 1).toString());
          await safeSetItem('allCustomers_count', totalRecords.toString());
          currentChunkIndex++;
        }

        // Update manifest as partial
        await safeSetItem('allCustomers_manifest', JSON.stringify({
          status: 'partial',
          partialAt: new Date().toISOString(),
          totalRecords,
          totalChunks: currentChunkIndex,
        }));

        throw new Error(`Download paused at ${totalRecords} records. You can continue later.`);
      }
    }

    // Save remaining data
    if (currentChunkData.length > 0) {
      console.log(`💾 Saving final chunk ${currentChunkIndex} (${currentChunkData.length} records)...`);
      await safeSetItem(`allCustomers_chunk_${currentChunkIndex}`, JSON.stringify(currentChunkData));
      currentChunkIndex++;
    }

    console.log(`✅ Resume complete: ${totalRecords} total customers in ${currentChunkIndex} chunks`);

    // Save final metadata
    await safeSetItem('allCustomers_chunks', currentChunkIndex.toString());
    await safeSetItem('allCustomers_count', totalRecords.toString());
    await safeSetItem('allCustomers_timestamp', new Date().toISOString());
    await safeSetItem('allCustomers_manifest', JSON.stringify({
      status: 'complete',
      completedAt: new Date().toISOString(),
      totalRecords,
      totalChunks: currentChunkIndex,
      resumed: true,
    }));

    if (onProgress) {
      onProgress({ current: totalRecords, total: totalRecords, percentage: 100 });
    }

    return true;

  } catch (error) {
    console.error('❌ resumeCustomerDownload error:', error.message || error);
    throw error;
  }
};

export const preCacheCustomers = async (onProgress = null, opts = {}) => {
  try {
    console.log('🔄 Pre-caching customer data...');

    // Clear any corrupted old customer data first
    console.log('🧹 Clearing old customer data chunks...');
    const keys = await AsyncStorage.getAllKeys();
    const chunkKeys = keys.filter(k => k.startsWith('allCustomers_chunk_'));
    if (chunkKeys.length > 0) {
      await AsyncStorage.multiRemove(chunkKeys);
      console.log(`🧹 Removed ${chunkKeys.length} old chunks`);
    }

    // Also clear metadata
    await AsyncStorage.multiRemove(['allCustomers_chunks', 'allCustomers_count', 'allCustomers_manifest', 'allCustomers_timestamp']);

    await fetchAllCustomers(true, onProgress, opts);
    console.log('✓ Customer data pre-cached successfully');
    return true;
  } catch (err) {
    console.warn('Failed to pre-cache customers:', err.message || err);
    return false;
  }
};

export const fetchNearestMeters = async (lat, lng, count = 3) => {
  try {
    const res = await devApi.get('/admin/customer/NearestMeters', {
      params: { lat, lng, count },
    });
    const data = res?.data?.data || res?.data || [];
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    const status = err?.response?.status || err?.response?.data?.statusCode;
    const message = err?.response?.data?.message;
    if (status === 404 && message && message.toLowerCase().includes('no')) {
      return [];
    }
    console.error('fetchNearestMeters error', err?.response?.data || err.message || err);
    throw err;
  }
};

export const fetchLeakReports = async (empId) => {
  try {
    let employeeId = empId;
    if (!employeeId) {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const user = JSON.parse(userData);
        employeeId = user.empId;
      }
    }
    if (!employeeId) {
      console.warn('⚠️ No empId found for fetching leak reports');
      return {
        reports: [],
        reportedCount: 0,
        dispatchedCount: 0,
        repairedCount: 0,
        scheduledCount: 0,
        turnoverCount: 0,
        afterCount: 0,
        notFoundCount: 0,
        totalCount: 0
      };
    }
    console.log('📋 Fetching leak reports for empId:', empId);
    // Try fetching all reports without filters
    const res = await devApi.get(`/admin/GetLeakReports/mobile/user/${empId}`, {
      params: {
        limit: 1000, // Request more records
        includeAll: true // Try to get all statuses
      }
    });
    const responseData = res?.data?.data || res?.data || {};
    console.log('✅ Full API Response:', JSON.stringify(res.data, null, 2));

    // Debug: Log first report structure to find coordinate fields
    if (responseData.reports && responseData.reports.length > 0) {
      console.log('📍 First report keys:', Object.keys(responseData.reports[0]));
      console.log('📍 First report full data:', JSON.stringify(responseData.reports[0], null, 2));
    }

    console.log('✅ Leak reports fetched:', {
      totalCount: responseData.totalCount || 0,
      reportedCount: responseData.reportedCount || 0,
      dispatchedCount: responseData.dispatchedCount || 0,
      repairedCount: responseData.repairedCount || 0,
      reportsArrayLength: (responseData.reports || []).length
    });
    return {
      reports: responseData.reports || [],
      reportedCount: responseData.reportedCount || 0,
      dispatchedCount: responseData.dispatchedCount || 0,
      repairedCount: responseData.repairedCount || 0,
      scheduledCount: responseData.scheduledCount || 0,
      turnoverCount: responseData.turnoverCount || 0,
      afterCount: responseData.afterCount || 0,
      notFoundCount: responseData.notFoundCount || 0,
      totalCount: responseData.totalCount || 0
    };
  } catch (err) {
    // Handle 404 silently - it usually means no reports found for this user
    const status = err?.response?.status;
    if (status === 404) {
      console.log('📋 No leak reports found for user (404 response)');
    } else {
      console.error('fetchLeakReports error', err?.response?.data || err.message || err);
    }
    return {
      reports: [],
      reportedCount: 0,
      dispatchedCount: 0,
      repairedCount: 0,
      scheduledCount: 0,
      turnoverCount: 0,
      afterCount: 0,
      notFoundCount: 0,
      totalCount: 0
    };
  }
};

// Helper function to generate reference number (e.g., 202510BB1F)
const generateRefNo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${year}${month}${random}`;
};

// Helper function to map leak type to ID
const getLeakTypeId = (leakType) => {
  const typeMap = {
    'Mainline': 38,
    'Serviceline': 39,
    'Service Line': 39,  // Support both formats
    'After Meter': 40,
    'Unidentified': 38,  // Default to mainline for unidentified
    'Others': 38,        // Default to mainline for others
  };
  return typeMap[leakType] || 38; // Default to Mainline
};

// Helper function to map covering to ID
const getCoveringId = (covering) => {
  const coveringMap = {
    'Concrete': 1,
    'Asphalt': 2,
    'Soil': 3,
    'Gravel': 4,
  };
  return coveringMap[covering] || 3; // Default to Soil
};

export const submitLeakReport = async (reportData) => {
  try {
    console.log('📤 Submitting leak report:', reportData);

    // Get user data for reporter info
    const userData = await AsyncStorage.getItem('userData');
    const user = userData ? JSON.parse(userData) : {};

    console.log('🔍 Extracting meter data:', {
      meterNumber: reportData.meterData?.meterNumber,
      accountNumber: reportData.meterData?.accountNumber,
      processed: (reportData.meterData?.accountNumber || '').replace(/\D/g, '').slice(-6)
    });

    // Build geometry string - coordinates is the LEAK location (may differ from meter)
    const longitude = reportData.coordinates?.longitude || 125.598699;
    const latitude = reportData.coordinates?.latitude || 7.060698;
    const geomString = `${longitude}, ${latitude}`;
    const wktPoint = `POINT(${longitude} ${latitude})`; // WKT format for GIS

    // Log meter vs leak location for debugging
    console.log('📍 Leak Location (Geom):', { longitude, latitude, geomString });
    if (reportData.meterCoordinates) {
      console.log('🚰 Meter Location (Reference):', {
        latitude: reportData.meterCoordinates.latitude,
        longitude: reportData.meterCoordinates.longitude,
      });
    }
    if (reportData.leakLocationMethod) {
      console.log('📍 Leak location method:', reportData.leakLocationMethod);
    }

    // Map frontend fields to backend expected fields
    const mappedData = {
      // Required fields
      RefNo: generateRefNo(), // Generate reference number
      ReportedLocation: reportData.landmark || reportData.location || '',
      ReportedLandmark: reportData.landmark || '',
      ReferenceMtr: reportData.meterData?.meterNumber || '',
      ReportedNumber: reportData.contactNumber || '',
      ReferenceRecaddrs: (reportData.meterData?.accountNumber || '').replace(/\D/g, '').slice(-6), // Remove non-digits, take last 6
      DmaCode: reportData.dma || '',
      JmsCode: reportData.dma || '', // Use DMA code as JMS code fallback
      ReporterName: `${user.fName || ''} ${user.mName || ''} ${user.lName || ''}`.trim() || reportData.contactName || '', // Use logged-in user's full name
      EmpId: user.empId || user.employeeId || '', // Add employee ID who created the report

      // Optional fields
      LeakTypeId: getLeakTypeId(reportData.leakType),
      geom: geomString, // IMPORTANT: lowercase 'geom' (database column name)
      LeakCovering: getCoveringId(reportData.covering),
      Priority: 2, // Default priority
      ReportType: 1, // Default report type
      DispatchStat: 0, // Default status: Pending (0=Pending, changed from web)
      LeakIndicator: 1, // Add leak indicator (required by backend)
      LeakLocation: reportData.location === 'Surface' ? 1 : 2, // 1=Surface, 2=Non-Surface
      DtReported: new Date().toISOString(), // Add timestamp
      DtReceived: new Date().toISOString(), // Add received timestamp
      ReporterType: 1, // Add reporter type (1=Mobile)
      empId: user.empId || user.employeeId || '', // IMPORTANT: lowercase 'empId'
      ReportedBy: user.empId || user.employeeId || '', // NEW: ReportedBy field
    };

    console.log('📋 Mapped data for submission:', mappedData);

    // Use FormData (multipart/form-data) as backend expects
    const formData = new FormData();

    // String fields - use camelCase to match backend model
    formData.append('ReportedLocation', mappedData.ReportedLocation || '');
    formData.append('ReportedLandmark', mappedData.ReportedLandmark || '');
    formData.append('ReporterName', mappedData.ReporterName || '');
    formData.append('Geom', geomString || '');
    formData.append('RefNo', mappedData.RefNo || '');
    formData.append('ReferenceMtr', mappedData.ReferenceMtr || '');
    formData.append('ReportedNumber', mappedData.ReportedNumber || '');
    formData.append('ReferenceRecaddrs', mappedData.ReferenceRecaddrs || '');
    formData.append('DmaCode', mappedData.DmaCode || '');
    formData.append('JmsCode', mappedData.JmsCode || '');
    formData.append('ReportedBy', mappedData.ReportedBy || '');
    formData.append('DtReported', mappedData.DtReported || '');
    formData.append('DtReceived', mappedData.DtReceived || '');
    formData.append('LeakTypeId', mappedData.LeakTypeId || 0);
    formData.append('LeakCovering', mappedData.LeakCovering || 0);
    formData.append('Priority', mappedData.Priority || 0);
    formData.append('ReportType', mappedData.ReportType || 0);
    formData.append('DispatchStat', 0); // Always 0 (Pending) - status changed from web only
    formData.append('LeakIndicator', mappedData.LeakIndicator || 0);
    formData.append('LeakLocation', mappedData.LeakLocation || 0);
    formData.append('ReporterType', mappedData.ReporterType || 0);

    console.log('📤 DispatchStat being sent:', 0, '(Pending)');

    // Image files - properly format for React Native FormData
    if (reportData.leakPhotos && reportData.leakPhotos.length > 0) {
      reportData.leakPhotos.forEach((photoUri, index) => {
        if (photoUri) {
          const fileName = photoUri.split('/').pop();
          const fileType = fileName.split('.').pop();
          const fieldName = index === 0 ? 'LeakImage1' : 'LeakImage2';
          formData.append(fieldName, {
            uri: photoUri,
            name: fileName || `leak_photo_${index + 1}.jpg`,
            type: `image/${fileType === 'png' ? 'png' : 'jpeg'}`,
          });
          console.log(`📸 Appended ${fieldName}:`, fileName);
        }
      });
    }

    if (reportData.landmarkPhoto) {
      const fileName = reportData.landmarkPhoto.split('/').pop();
      const fileType = fileName.split('.').pop();
      formData.append('LandmarkImage', {
        uri: reportData.landmarkPhoto,
        name: fileName || 'landmark_photo.jpg',
        type: `image/${fileType === 'png' ? 'png' : 'jpeg'}`,
      });
      console.log('📸 Appended LandmarkImage:', fileName);
    }

    console.log('✅ FormData prepared with camelCase field names to match backend model');

    // Log all FormData entries for debugging
    console.log('📋 FormData contents being sent:');
    if (formData._parts) {
      formData._parts.forEach(([key, value]) => {
        if (typeof value === 'object' && value.uri) {
          console.log(`  ${key}: [FILE] ${value.name}`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      });
    }

    console.log('📤 Sending FormData to backend (multipart/form-data)');

    try {
      const res = await devApi.post(
        '/admin/LeakDetection/LeakDetectionReport',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      console.log('✅ Leak report submitted successfully');
      console.log('📥 Submission Response:', JSON.stringify(res?.data, null, 2));
      return res?.data;
    } catch (error) {
      console.error('❌ Submission failed:', error?.response?.data || error.message);
      throw error;
    }
  } catch (err) {
    console.error('submitLeakReport error', err?.response?.data || err.message || err);
    throw err;
  }
};
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { handleSessionExpiry } from './autoLogout';

// API Base URL
export const API_BASE = 'https://dev-api.davao-water.gov.ph/dcwd-gis/api/v1';

// Create axios instance
export const devApi = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'LeakDetectionApp/1.0',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Token refresh state
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token);
  });
  failedQueue = [];
};

// Request interceptor - auto-attach token
devApi.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
devApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      error.response?.data?.message === 'Token Expired' &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return devApi(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refresh_token');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          token: refreshToken
        });

        const newToken = data.accessToken || data.token;
        await AsyncStorage.setItem('token', newToken);

        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        return devApi(originalRequest);
      } catch (err) {
        processQueue(err, null);
        console.log('[Interceptor] 🔒 Token refresh failed - triggering session expiry');
        await AsyncStorage.multiRemove(['token', 'refresh_token', 'userData']);
        // Trigger auto-logout due to session expiry
        handleSessionExpiry();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    // Also handle direct 401 errors (not just Token Expired message)
    if (error.response?.status === 401 && !originalRequest._retry) {
      console.log('[Interceptor] 🔒 Unauthorized (401) - triggering session expiry');
      await AsyncStorage.multiRemove(['token', 'refresh_token', 'userData']);
      handleSessionExpiry();
    }

    return Promise.reject(error);
  }
);
