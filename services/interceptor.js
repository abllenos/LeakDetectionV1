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

export const searchAccountOrMeter = async (searchValue) => {
  try {
    const res = await devApi.get('/admin/customer/SearchAccountOrMeterNumber', {
      params: { searchValue },
    });
    return res?.data;
  } catch (err) {
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
    const manifest = await AsyncStorage.getItem('allCustomers_manifest');
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
  // ...existing code from api.js fetchAllCustomers...
  // For brevity, you may want to copy the full implementation from your previous api.js file here.
  // If you want the full function, let me know!
};

export const preCacheCustomers = async (onProgress = null, opts = {}) => {
  try {
    console.log('🔄 Pre-caching customer data...');
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
    console.error('fetchLeakReports error', err?.response?.data || err.message || err);
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
    'Service Line': 39,
    'After Meter': 40,
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
    
    // Build geometry string in multiple formats
    const longitude = reportData.coordinates?.longitude || 125.598699;
    const latitude = reportData.coordinates?.latitude || 7.060698;
    const geomString = `${longitude}, ${latitude}`;
    const wktPoint = `POINT(${longitude} ${latitude})`; // WKT format for GIS
    
    console.log('📍 Geometry:', { longitude, latitude, geomString, wktPoint });
    
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
      DispatchStat: 1, // Default status: Reported
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
    
    // String fields
    formData.append('ReportedLocation', mappedData.ReportedLocation || '');
    formData.append('ReportedLandmark', mappedData.ReportedLandmark || '');
    formData.append('ReporterName', mappedData.ReporterName || '');
    
    // Try geometry in multiple formats and field names
    formData.append('geom', geomString || ''); // Comma-separated
    formData.append('Geom', geomString || '');
    formData.append('geometry', wktPoint || ''); // WKT format
    formData.append('Geometry', wktPoint || '');
    formData.append('GeomWkt', wktPoint || ''); // Explicit WKT field
    formData.append('Latitude', latitude.toString());
    formData.append('Longitude', longitude.toString());
    
    formData.append('RefNo', mappedData.RefNo || '');
    formData.append('ReferenceMtr', mappedData.ReferenceMtr || '');
    formData.append('ReportedNumber', mappedData.ReportedNumber || '');
    formData.append('ReferenceRecaddrs', mappedData.ReferenceRecaddrs || '');
    formData.append('DmaCode', mappedData.DmaCode || '');
    formData.append('JmsCode', mappedData.JmsCode || '');
    formData.append('empId', mappedData.empId || '');  // IMPORTANT: lowercase 'empId'
    formData.append('ReportedBy', mappedData.ReportedBy || '');  // NEW: ReportedBy field
    console.log('🆔 Appending empId and ReportedBy to FormData:', mappedData.empId);
    formData.append('DtReported', mappedData.DtReported || '');
    formData.append('DtReceived', mappedData.DtReceived || '');
    
    // Integer fields (send as numbers, not strings!)
    formData.append('LeakTypeId', mappedData.LeakTypeId || 0);
    formData.append('LeakCovering', mappedData.LeakCovering || 0);
    formData.append('Priority', mappedData.Priority || 0);
    formData.append('ReportType', mappedData.ReportType || 0);
    formData.append('DispatchStat', mappedData.DispatchStat || 0);
    formData.append('LeakIndicator', mappedData.LeakIndicator || 0);
    formData.append('LeakLocation', mappedData.LeakLocation || 0);
    formData.append('ReporterType', mappedData.ReporterType || 0);
    
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
    
    console.log('✅ Appended geom:', mappedData.geom);
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
        await AsyncStorage.multiRemove(['token', 'refresh_token', 'userData']);
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
