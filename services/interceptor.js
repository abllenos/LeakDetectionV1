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
