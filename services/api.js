import AsyncStorage from '@react-native-async-storage/async-storage';
import { devApi, API_BASE } from './interceptor';

// Helpers to handle storage-full scenarios caused by large cached datasets
const STORAGE_AUTH_KEYS = new Set(['token', 'refresh_token', 'userData', 'savedUsername', 'savedPassword', 'rememberMe']);

const isStorageFullError = (err) => {
  const msg = (err?.message || err?.toString() || '').toString();
  return /SQLITE_FULL|database or disk is full|ENOSPC|no such file or directory/i.test(msg);
};

const clearHeavyStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    // Remove large cache keys while preserving auth-related keys
    const keysToRemove = keys.filter((k) => {
      if (STORAGE_AUTH_KEYS.has(k)) return false;
      // Target our large offline caches and progress markers
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
      // Retry once after cleanup
      await AsyncStorage.setItem(key, value);
      return;
    }
    throw e;
  }
};

// (pause/resume feature removed per user request)

// Login helper
export const login = async (username, password) => {
  try {
    // Defensive trim (LoginScreen also trims, but ensure here too)
    const u = (username ?? '').toString().trim();
    const p = (password ?? '').toString().trim();
    console.log('🔑 Attempting login for user:', u);
    
    // Clear any existing tokens before login to prevent conflicts
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('refresh_token');
    
    const { data } = await devApi.post('/admin/userlogin/login', {
      username: u,
      password: p,
    });
    
    console.log('📥 Login response received:', JSON.stringify(data, null, 2));
    
    if (data?.statusCode === 200 && data?.data?.token) {
      const { token, refreshToken } = data.data;
      // Use safe setters that auto-clean when storage is full
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
    // If storage is full, surface a clearer message
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

// Logout helper
export const logout = async () => {
  // Clear auth tokens but PRESERVE customer data cache
  const keysToRemove = ['token', 'refresh_token', 'userData'];
  
  // DO NOT clear customer cache on logout:
  // - allCustomers_timestamp
  // - allCustomers_count
  // - allCustomers_chunks
  // - allCustomers_chunk_* keys
  // - allCustomers_manifest
  // - allCustomers_download_status
  
  await AsyncStorage.multiRemove(keysToRemove);
  console.log('✓ Cleared auth tokens (customer cache preserved)');
};

/**
 * Fetch DMA codes from the server and return an array of dmaCode strings.
 * By default this will read from a simple AsyncStorage cache unless forceRefresh=true.
 *
 * Example response shape (trimmed): { data: { data: [ { dmaCode: 'CB-01E', ... }, ... ] } }
 */
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

  // Cache the result for future calls (use safe setter to tolerate low space)
  await safeSetItem('dmaCodes', JSON.stringify(codes));

    return codes;
  } catch (error) {
    console.error('Failed to fetch DMA codes:', error?.response?.data || error.message || error);
    throw error;
  }
};

// Search account or meter number helper
export const searchAccountOrMeter = async (searchValue) => {
  try {
    const res = await devApi.get('/admin/customer/SearchAccountOrMeterNumber', {
      params: { searchValue },
    });
    // API may return data in res.data.data or res.data; normalize
    return res?.data;
  } catch (err) {
    // If the API explicitly returns 404 with "No matching customer found.", treat as empty result
    const status = err?.response?.status || err?.response?.data?.statusCode;
    const message = err?.response?.data?.message;
    if (status === 404 && message && message.toLowerCase().includes('no matching customer')) {
      // Return an empty 'data' shape so callers can handle 'no results' without exceptions
      return { data: [] };
    }

    // Unexpected error - surface for debugging
    console.error('searchAccountOrMeter error', err?.response?.data || err.message || err);
    throw err;
  }
};

/**
 * Get all available customer data including partial downloads
 * This reads from chunks (completed download) OR per-page storage (in-progress download)
 * Returns immediately with whatever data is available
 */
export const getAvailableCustomers = async () => {
  try {
    // First check if we have completed chunks (preferred)
    const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
    if (chunkCount) {
      const chunks = parseInt(chunkCount);
      let allCustomers = [];
      
      for (let i = 0; i < chunks; i++) {
        const chunk = await AsyncStorage.getItem(`allCustomers_chunk_${i}`);
        if (chunk) {
          allCustomers = allCustomers.concat(JSON.parse(chunk));
        }
      }
      
      if (allCustomers.length > 0) {
        console.log(`📦 Loaded ${allCustomers.length} customers from completed chunks`);
        return allCustomers;
      }
    }

    // Fallback: check for partial download (per-page storage)
    // Read ALL downloaded pages for nearest meters functionality
    const manifest = await AsyncStorage.getItem('allCustomers_manifest');
    if (manifest) {
      const manifestData = JSON.parse(manifest);
      const pagesFetched = Array.isArray(manifestData.pagesFetched) ? manifestData.pagesFetched : [];
      
      if (pagesFetched.length > 0) {
        console.log(`📦 Loading ${pagesFetched.length} downloaded pages...`);
        let partialCustomers = [];
        
        // Read pages in parallel batches for better performance
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
          
          // Log progress for large datasets
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

/**
 * Check if remote customer data has changed by comparing total record count
 * Returns true if data should be re-downloaded
 */
export const hasRemoteDataChanged = async () => {
  try {
    // Get cached record count
    const cachedCount = await AsyncStorage.getItem('allCustomers_count');
    if (!cachedCount) {
      console.log('No cached data, download needed');
      return true; // No cache, needs download
    }

    // Fetch first page to get remote total count
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
    return false; // On error, assume cache is fine
  }
};

/**
 * Check for new data and return details about the change
 * Returns { hasNewData: boolean, localCount: number, remoteCount: number, difference: number }
 */
export const checkForNewData = async () => {
  try {
    const cachedCount = await AsyncStorage.getItem('allCustomers_count');
    const localCount = parseInt(cachedCount) || 0;

    // Fetch first page to get remote total count
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

/**
 * Fetch all customers from the database with chunked download and caching
 * Downloads data in smaller chunks to prevent crashes
 */
export const fetchAllCustomers = async (forceRefresh = false, onProgress = null, opts = {}) => {
  try {
    // Check cache first unless forceRefresh is true
    if (!forceRefresh) {
      const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
      const cacheTime = await AsyncStorage.getItem('allCustomers_timestamp');
      
      if (chunkCount && cacheTime) {
        // Check if remote data has changed
        const dataChanged = await hasRemoteDataChanged();
        
        if (!dataChanged) {
          console.log('📦 Using cached customer data (remote unchanged)');
          
          // Load from chunks
          const chunks = parseInt(chunkCount);
          let allCustomers = [];
          
          for (let i = 0; i < chunks; i++) {
            const chunk = await AsyncStorage.getItem(`allCustomers_chunk_${i}`);
            if (chunk) {
              allCustomers = allCustomers.concat(JSON.parse(chunk));
            }
          }
          
          console.log(`📦 Loaded ${allCustomers.length} customers from cache`);
          if (onProgress) onProgress(100);
          return allCustomers;
        } else {
          console.log('🔄 Remote data changed, re-downloading...');
        }
      }
    }
    
    console.log('🌐 Fetching customer data using pagination...');
    
    // Helper function for per-page storage key (defined at function scope)
    const perPageKey = (p) => `allCustomers_page_${p}`;
    
    let allCustomers = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalRecords = 0;
    let pagesCount = 0;
    let recordsStored = 0;
  // Options: pageSize (records per page) and concurrency (parallel page requests)
  const DEFAULT_PAGE_SIZE = 5000; // Increased from 1000 to reduce total pages
  const DEFAULT_CONCURRENCY = 100; // Increased to 100 for maximum parallel downloads
  const pageSize = opts.pageSize || DEFAULT_PAGE_SIZE; // Request records per page
  const concurrency = opts.concurrency || DEFAULT_CONCURRENCY;
    
    console.log(`📋 Requesting pageSize=${pageSize}, concurrency=${concurrency}`);
    
    // Try different pagination parameter formats
    console.log('Attempting pagination request against /admin/customer/paginate...');
    let firstPageRes;

    try {
      // Preferred: GET /admin/customer/paginate?page=1&pageSize={pageSize}
      firstPageRes = await devApi.get('/admin/customer/paginate', {
        params: {
          page: 1,
          pageSize: pageSize,
        }
      });
    } catch (err1) {
      console.log('GET /admin/customer/paginate (page&pageSize) failed:', err1?.response?.status, err1?.response?.data || err1.message);
      try {
        // Fallback: older param names
        firstPageRes = await devApi.get('/admin/customer/paginate', {
          params: {
            page: 1,
            limit: pageSize,
          }
        });
      } catch (err2) {
        console.log('GET /admin/customer/paginate (page&limit) failed:', err2?.response?.status, err2?.response?.data || err2.message);
        try {
          // Try offset/limit style
          firstPageRes = await devApi.get('/admin/customer/paginate', {
            params: {
              offset: 0,
              limit: pageSize,
            }
          });
        } catch (err3) {
          console.log('GET /admin/customer/paginate (offset&limit) failed:', err3?.response?.status, err3?.response?.data || err3.message);
          try {
            // Some servers expect POST body
            console.log('Trying POST /admin/customer/paginate with body { page:1, pageSize }');
            firstPageRes = await devApi.post('/admin/customer/paginate', { page: 1, pageSize });
          } catch (errPost) {
            console.log('POST /admin/customer/paginate failed:', errPost?.response?.status, errPost?.response?.data || errPost.message);
            console.log('All pagination formats failed, falling back to /all endpoint');
            // Fallback to the old /all endpoint
            firstPageRes = await devApi.get('/admin/customer/all');
          }
        }
      }
    }
    
    const firstPageData = firstPageRes?.data?.data || firstPageRes?.data || {};
    
  // Check if this is a paginated response or full response
  const isPaginated = firstPageData.pageIndex !== undefined || firstPageData.count !== undefined || firstPageData.pageSize !== undefined;
    
    if (!isPaginated) {
      // This is the /all endpoint - we got everything in one request
      console.log('📦 Using /all endpoint (no pagination)');
      
      // Try different data structures
      let data = firstPageRes?.data?.data || firstPageRes?.data || [];
      
      // If data is an object with a data property, extract it
      if (!Array.isArray(data) && data.data) {
        data = data.data;
      }
      
      // Convert to array if needed
      allCustomers = Array.isArray(data) ? data : [data];
      
      totalRecords = allCustomers.length;
      totalPages = 1;
      console.log(`📊 Total: ${totalRecords} customers (single request)`);
      
      // Update progress as we process
      if (onProgress && totalRecords > 0) {
        onProgress(50); // Show 50% when data received
      }
    } else {
      // Paginated response
  // Adjust to the paginate response shape: { pageIndex, pageSize, count, data: [...] }
  totalRecords = firstPageData.count || firstPageData.totalRecords || firstPageData.total || 0;
  const respPageSize = firstPageData.pageSize || pageSize;
  totalPages = Math.ceil(totalRecords / respPageSize);

  console.log(`📊 Total: ${totalRecords} customers across ${totalPages} pages`);
  console.log(`📋 Backend pageSize=${respPageSize} (requested=${pageSize})`);
  
  if (respPageSize < pageSize) {
    console.warn(`⚠️ Backend is using smaller pageSize (${respPageSize}) than requested (${pageSize})`);
  }

  // Add first page data (many APIs put the array under data.data)
  const firstPageCustomers = firstPageData.data || firstPageData.customers || firstPageData.records || [];

  // store first page immediately (if not already stored)
  pagesCount = 0;
  recordsStored = 0;
  try {
    const existingFirst = await AsyncStorage.getItem(perPageKey(1));
    if (!existingFirst) {
      try {
        await AsyncStorage.setItem(perPageKey(1), JSON.stringify(firstPageCustomers));
      } catch (e) {
        if (isStorageFullError(e)) {
          console.warn('Storage full while writing page 1');
          const err = new Error('Storage is full. Please clear storage in Settings > Clear All Storage Data, then try again.');
          err.code = 'STORAGE_FULL';
          throw err;
        }
        throw e;
      }
      pagesCount = 1;
      recordsStored = Array.isArray(firstPageCustomers) ? firstPageCustomers.length : 0;
    } else {
      // resume: count already stored records
      const arr = JSON.parse(existingFirst) || [];
      pagesCount = 1;
      recordsStored = Array.isArray(arr) ? arr.length : 0;
      console.log('Resuming: found existing page 1 stored with', recordsStored, 'records');
    }
  } catch (e) {
    console.warn('Failed to access/write page 1 storage:', e?.message || e);
    if (e?.code === 'STORAGE_FULL' || isStorageFullError(e)) {
      throw e; // bubble up with friendly message
    }
    // still treat page 1 as fetched in memory
    pagesCount = 1;
    recordsStored = Array.isArray(firstPageCustomers) ? firstPageCustomers.length : 0;
  }
    }
    
    // Report initial progress
    if (onProgress) {
      const percent = isPaginated ? Math.round((currentPage / totalPages) * 100) : 50;
      onProgress(percent);
    }
    
    // Track fetched count across both paginated and non-paginated flows
    let fetchedCount = pagesCount; // may be >1 if some pages present
    
    // Fetch remaining pages in parallel batches (only if paginated)
    if (isPaginated && totalPages > 1) {
      console.log(`➡️ Fetching remaining ${totalPages - 1} pages with concurrency=${concurrency}...`);

      // helper to fetch a single page with GET then POST fallback and a simple retry
      const fetchPage = async (pageNum) => {
        const tryGet = async () => {
          return await devApi.get('/admin/customer/paginate', {
            params: { page: pageNum, pageSize },
          });
        };

        const tryPost = async () => {
          return await devApi.post('/admin/customer/paginate', { page: pageNum, pageSize });
        };

        // try GET, then POST, with one retry for transient failures
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await tryGet();
            return r;
          } catch (gErr) {
            // try POST fallback
            try {
              const rpost = await tryPost();
              return rpost;
            } catch (pErr) {
              // if last attempt, rethrow
              if (attempt === 1) throw pErr;
              // otherwise wait a short backoff then retry
              await new Promise((res) => setTimeout(res, 150 * (attempt + 1)));
            }
          }
        }
      };

      // Build list of page numbers to fetch (we already have page 1)
      const pagesToFetch = [];
      for (let p = 2; p <= totalPages; p++) {
        try {
          const existing = await AsyncStorage.getItem(perPageKey(p));
          if (existing) {
            // resume: skip fetching this page
            pagesCount++;
            const arr = JSON.parse(existing) || [];
            recordsStored += Array.isArray(arr) ? arr.length : 0;
            console.log(`Skipping already-stored page ${p} (records=${Array.isArray(arr) ? arr.length : 0})`);
          } else {
            pagesToFetch.push(p);
          }
        } catch (e) {
          // if storage check fails, queue the page to fetch
          pagesToFetch.push(p);
        }
      }

      // Create a manifest so downloads can be resumed and UI can read progress
      const manifestKey = 'allCustomers_manifest';
      const statusKey = 'allCustomers_download_status';
      const manifest = {
        totalPages,
        totalRecords,
        pagesFetched: [],
        startedAt: Date.now(),
        status: 'in-progress',
      };
      try {
        // if an existing manifest exists, merge pagesFetched
        const existing = await AsyncStorage.getItem(manifestKey);
        if (existing) {
          const ex = JSON.parse(existing);
          if (ex) {
            if (Array.isArray(ex.pagesFetched)) {
              manifest.pagesFetched = ex.pagesFetched;
            } else if (typeof ex.pagesFetched === 'number') {
              // older format: pagesFetched was a count; we can't know which pages, so keep array empty but record count in log
              console.warn('Manifest.pagesFetched is a number (old format). Resetting to empty array to resume safely.');
              manifest.pagesFetched = [];
            }
          }
        }
        // ensure pagesFetched includes any pages we detected already stored
        // ensure pagesFetched is an array before using includes/push
        if (!Array.isArray(manifest.pagesFetched)) manifest.pagesFetched = [];
        for (let p = 1; p <= totalPages; p++) {
          try {
            const e = await AsyncStorage.getItem(perPageKey(p));
            if (e) {
              if (!manifest.pagesFetched.includes(p)) manifest.pagesFetched.push(p);
            }
          } catch (e) { /* ignore */ }
        }
        await AsyncStorage.setItem(manifestKey, JSON.stringify(manifest));
      } catch (e) {
        console.warn('Failed to write manifest:', e?.message || e);
      }

      // helper to update download status for UI
      const writeStatus = async () => {
        try {
          const pagesFetchedCount = Array.isArray(manifest.pagesFetched) ? manifest.pagesFetched.length : (typeof manifest.pagesFetched === 'number' ? manifest.pagesFetched : 0);
          const percent = totalPages > 0 ? Math.round((pagesFetchedCount / totalPages) * 100) : 0;
          const payload = { percent, recordsStored, totalRecords, pagesFetched: pagesFetchedCount, totalPages, status: manifest.status };
          await AsyncStorage.setItem(statusKey, JSON.stringify(payload));
          
          // Also write a simple count for fast UI access
          await AsyncStorage.setItem('allCustomers_download_count', String(recordsStored));
        } catch (e) {
          // ignore
        }
      };

      // Throttling/backoff: adjust concurrency when errors occur
      let concurrencyAdjust = Math.max(1, concurrency);
      let lastStatusUpdate = 0; // Track records count at last status write

      // Process in batches of size 'concurrencyAdjust'
      for (let i = 0; i < pagesToFetch.length; i += concurrencyAdjust) {
        const batch = pagesToFetch.slice(i, i + concurrencyAdjust);

        // For each page in batch, try fetch with retries and handle 429 specially
        const pagePromises = batch.map(async (p) => {
          const maxAttempts = 3;
          let attempt = 0;
          let lastErr = null;
          while (attempt < maxAttempts) {
            attempt++;
            try {
              const res = await fetchPage(p);
              return { page: p, res };
            } catch (err) {
              lastErr = err;
              const status = err?.response?.status;
              // if 429, increase backoff and reduce concurrency for next batches
              if (status === 429) {
                console.warn(`Received 429 for page ${p}, backing off and reducing concurrency`);
                concurrencyAdjust = Math.max(1, Math.floor(concurrencyAdjust / 2));
                await new Promise((r) => setTimeout(r, 1000 * attempt));
              } else {
                // transient network error: small backoff
                await new Promise((r) => setTimeout(r, 300 * attempt));
              }
            }
          }
          return { page: p, err: lastErr };
        });

        const results = await Promise.all(pagePromises);

        // If any failed in this batch, reduce concurrency for subsequent batches
        let batchHadError = false;
        for (const r of results) {
          if (r.err) {
            batchHadError = true;
            console.error(`Page ${r.page} failed after retries:`, r.err?.response?.data || r.err.message || r.err);
            // rethrow to let caller know (we could instead continue and mark manifest.failed)
            throw new Error(`Failed to fetch page ${r.page}: ${r.err?.message || 'unknown'}`);
          }

          const pageRes = r.res;
          const pageData = pageRes?.data?.data || pageRes?.data || {};
          const pageCustomers = pageData.data || pageData.customers || pageData.records || [];

          // write this page to per-page storage immediately
          try {
            await AsyncStorage.setItem(perPageKey(r.page), JSON.stringify(pageCustomers));
          } catch (e) {
            if (isStorageFullError(e)) {
              console.warn(`Storage full while writing page ${r.page}`);
              const err = new Error('Storage is full. Please clear storage in Settings > Clear All Storage Data, then try again.');
              err.code = 'STORAGE_FULL';
              throw err;
            }
            console.warn(`Failed to write page ${r.page} to storage:`, e?.message || e);
          }

          // update manifest (ensure array)
          if (!Array.isArray(manifest.pagesFetched)) manifest.pagesFetched = [];
          if (!manifest.pagesFetched.includes(r.page)) manifest.pagesFetched.push(r.page);
          try { await AsyncStorage.setItem(manifestKey, JSON.stringify(manifest)); } catch (e) { /* ignore */ }

          fetchedCount++;
          const added = Array.isArray(pageCustomers) ? pageCustomers.length : 0;
          recordsStored += added;

          // Update progress per page fetched
          const pagesFetchedCountNow = Array.isArray(manifest.pagesFetched) ? manifest.pagesFetched.length : (typeof manifest.pagesFetched === 'number' ? manifest.pagesFetched : 0);
          const percent = Math.round((pagesFetchedCountNow / totalPages) * 100);
          
          // Only log and write status every 1000 records to improve performance
          if (recordsStored - lastStatusUpdate >= 1000 || pagesFetchedCountNow === totalPages) {
            console.log(`📥 Progress: ${percent}% (Page ${pagesFetchedCountNow}/${totalPages}) - ${recordsStored} records`);
            if (onProgress) onProgress(percent, recordsStored, totalRecords);
            await writeStatus();
            lastStatusUpdate = recordsStored;
          }
        }

        if (batchHadError) {
          // reduce concurrency for next batches
          concurrencyAdjust = Math.max(1, Math.floor(concurrencyAdjust / 2));
        }

        // small delay between batches to be friendly to the server
        await new Promise((res) => setTimeout(res, 80));
      }

      // finalize manifest
      manifest.status = 'complete';
      manifest.completedAt = Date.now();
      try { await AsyncStorage.setItem(manifestKey, JSON.stringify(manifest)); } catch (e) { /* ignore */ }
      await writeStatus();
    }
    
    console.log(`✓ Downloaded pages: ${fetchedCount}/${totalPages}, stored records: ${recordsStored}`);

    // Now assemble pages into storage chunks to keep the same cache shape used elsewhere
    const STORAGE_CHUNK_SIZE = 5000;
    let currentChunk = [];
    let storageChunksCount = 0;
    let totalProcessed = 0;

    for (let p = 1; p <= totalPages; p++) {
      try {
        const pageStr = await AsyncStorage.getItem(perPageKey(p));
        const pageArr = pageStr ? JSON.parse(pageStr) : [];

        for (const rec of pageArr) {
          currentChunk.push(rec);
          if (currentChunk.length >= STORAGE_CHUNK_SIZE) {
            // flush chunk
            try {
              await AsyncStorage.setItem(`allCustomers_chunk_${storageChunksCount}`, JSON.stringify(currentChunk));
            } catch (e) {
              if (isStorageFullError(e)) {
                console.warn(`Storage full while writing chunk ${storageChunksCount}`);
                const err = new Error('Storage is full. Please clear storage in Settings > Clear All Storage Data, then try again.');
                err.code = 'STORAGE_FULL';
                throw err;
              }
              throw e;
            }
            storageChunksCount++;
            totalProcessed += currentChunk.length;
            currentChunk = [];

            // progress callback
            const percent = Math.round((totalProcessed / totalRecords) * 100);
            if (onProgress) onProgress(percent, totalProcessed, totalRecords);
          }
        }
      } catch (e) {
        console.warn(`Failed reading page ${p} during chunking:`, e?.message || e);
      }
    }

    // flush remaining
    if (currentChunk.length > 0) {
      try {
        await AsyncStorage.setItem(`allCustomers_chunk_${storageChunksCount}`, JSON.stringify(currentChunk));
      } catch (e) {
        if (isStorageFullError(e)) {
          console.warn(`Storage full while writing final chunk ${storageChunksCount}`);
          const err = new Error('Storage is full. Please clear storage in Settings > Clear All Storage Data, then try again.');
          err.code = 'STORAGE_FULL';
          throw err;
        }
        throw e;
      }
      totalProcessed += currentChunk.length;
      storageChunksCount++;
      if (onProgress) onProgress(Math.round((totalProcessed / totalRecords) * 100), totalProcessed, totalRecords);
    }

    // Store metadata
    try { await AsyncStorage.setItem('allCustomers_count', String(totalProcessed)); } catch (e) {
      if (isStorageFullError(e)) { const err = new Error('Storage is full when writing metadata.'); err.code = 'STORAGE_FULL'; throw err; } else { throw e; }
    }
    try { await AsyncStorage.setItem('allCustomers_chunks', String(storageChunksCount)); } catch (e) {
      if (isStorageFullError(e)) { const err = new Error('Storage is full when writing metadata.'); err.code = 'STORAGE_FULL'; throw err; } else { throw e; }
    }
    try { await AsyncStorage.setItem('allCustomers_timestamp', Date.now().toString()); } catch (e) {
      if (isStorageFullError(e)) { const err = new Error('Storage is full when writing metadata.'); err.code = 'STORAGE_FULL'; throw err; } else { throw e; }
    }

    console.log(`✓ Cached ${totalProcessed} customers in ${storageChunksCount} chunks`);

    // Cleanup per-page keys AND manifest (download is complete)
    try {
      const keysToRemove = ['allCustomers_manifest', 'allCustomers_download_status', 'allCustomers_download_count'];
      for (let p = 1; p <= totalPages; p++) keysToRemove.push(perPageKey(p));
      if (keysToRemove.length) await AsyncStorage.multiRemove(keysToRemove);
      console.log('✓ Cleaned up per-page storage and manifest');
    } catch (e) {
      console.warn('Failed to cleanup per-page keys:', e?.message || e);
    }

    // Build return array by reading chunked storage (keeping backward compatibility)
    let allCustomersArr = [];
    for (let i = 0; i < storageChunksCount; i++) {
      try {
        const chunkStr = await AsyncStorage.getItem(`allCustomers_chunk_${i}`);
        if (chunkStr) {
          const chunkArr = JSON.parse(chunkStr);
          allCustomersArr = allCustomersArr.concat(chunkArr);
        }
      } catch (e) {
        console.warn(`Failed to read chunk ${i} for return:`, e?.message || e);
      }
    }

    if (onProgress) onProgress(100, totalProcessed, totalProcessed);
    return allCustomersArr;
  } catch (err) {
    if (err?.code === 'STORAGE_FULL' || isStorageFullError(err)) {
      console.error('fetchAllCustomers aborted: storage full');
      // Write a status flag best-effort
      try {
        const statusKey = 'allCustomers_download_status';
        const payload = { status: 'error', reason: 'storage-full' };
        await AsyncStorage.setItem(statusKey, JSON.stringify(payload));
      } catch (_) {}
      // Surface friendly error
      throw new Error('Storage is full. Please clear storage in Settings > Clear All Storage Data, then try again.');
    }
    console.error('fetchAllCustomers error', err?.response?.data || err.message || err);
    
    // If network fails, try to use cached data even if expired
    try {
      const chunkCount = await AsyncStorage.getItem('allCustomers_chunks');
      if (chunkCount) {
        console.log('⚠️ Using cached data from chunks due to error');
        const chunks = parseInt(chunkCount);
        let allCustomers = [];
        
        for (let i = 0; i < chunks; i++) {
          const chunk = await AsyncStorage.getItem(`allCustomers_chunk_${i}`);
          if (chunk) {
            allCustomers = allCustomers.concat(JSON.parse(chunk));
          }
        }
        
        console.log(`📦 Loaded ${allCustomers.length} customers from cache`);
        return allCustomers;
      }
    } catch (cacheErr) {
      console.error('Failed to load from cache:', cacheErr.message);
    }
    
    throw err;
  }
};

/**
 * Pre-cache all customers in the background with progress updates
 * Call this after login to prepare data for NearestMeters screen
 */
export const preCacheCustomers = async (onProgress = null, opts = {}) => {
  try {
  console.log('🔄 Pre-caching customer data...');
    await fetchAllCustomers(true, onProgress, opts); // Force refresh with progress and options
    console.log('✓ Customer data pre-cached successfully');
    return true;
  } catch (err) {
    console.warn('Failed to pre-cache customers:', err.message || err);
    return false;
  }
};

/**
 * Fetch nearest meters around a coordinate.
 * NOTE: This assumes the backend exposes an endpoint like
 *   GET /admin/customer/NearestMeters?lat={lat}&lng={lng}&count={count}
 * If your backend uses a different path or request payload, provide the details
 * and I'll wire it to the exact API.
 */
export const fetchNearestMeters = async (lat, lng, count = 3) => {
  try {
    const res = await devApi.get('/admin/customer/NearestMeters', {
      params: { lat, lng, count },
    });

    // Normalization: backend may return array in res.data.data or res.data
    const data = res?.data?.data || res?.data || [];
    // If API returns object with code/message for no results, return []
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    // Treat explicit 404/no-results gracefully
    const status = err?.response?.status || err?.response?.data?.statusCode;
    const message = err?.response?.data?.message;
    if (status === 404 && message && message.toLowerCase().includes('no')) {
      return [];
    }
    console.error('fetchNearestMeters error', err?.response?.data || err.message || err);
    throw err;
  }
};

/**
 * Fetch leak reports for the current user
 * Returns reports with statistics (reported, dispatched, repaired, etc.)
 */
export const fetchLeakReports = async (empId) => {
  try {
    // Get empId from stored user data if not provided
    let employeeId = empId;
    if (!employeeId) {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const user = JSON.parse(userData);
        employeeId = user.empId || user.employeeId || user.id;
      }
    }

    if (!employeeId) {
      console.warn('⚠️ No employee ID found for fetching leak reports');
      // Return empty structure instead of throwing
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

    console.log('📋 Fetching leak reports for employee:', employeeId);
    
    const res = await devApi.get(`/admin/GetLeakReports/mobile/user/${employeeId}`);
    
    const responseData = res?.data?.data || res?.data || {};
    
    console.log('✅ Leak reports fetched:', {
      totalCount: responseData.totalCount || 0,
      reportedCount: responseData.reportedCount || 0,
      dispatchedCount: responseData.dispatchedCount || 0,
      repairedCount: responseData.repairedCount || 0
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
    console.error('fetchLeakReports error', err?.response?.data || err.message || err);
    // Return empty structure on error instead of throwing
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

/**
 * Submit a new leak report
 */
export const submitLeakReport = async (reportData) => {
  try {
    console.log('📤 Submitting leak report:', reportData);
    
    const res = await devApi.post('/admin/leak-report', reportData);
    
    console.log('✅ Leak report submitted successfully');
    
    return res?.data;
  } catch (err) {
    console.error('submitLeakReport error', err?.response?.data || err.message || err);
    throw err;
  }
};
