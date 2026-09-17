import axios, { InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/useAuthStore';
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig';
import { snapshotAdapter } from '@/snapshot/snapshotAdapter';
import { refreshAccessTokenApi } from './authRefresh';
import {
  forceLogout,
  hasValidRefreshToken,
  isAuthApiUrl,
  isRefreshApiUrl,
} from '@/utils/authSession';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || undefined,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  // Bản demo offline đọc dữ liệu từ snapshot thay vì gọi mạng.
  adapter: SNAPSHOT_MODE ? snapshotAdapter : undefined,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string | null) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: unknown, access_token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(access_token);
    }
  });
  failedQueue = [];
};

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const access_token = useAuthStore.getState().access_token;
    if (access_token && config.headers && !isAuthApiUrl(config.url)) {
      config.headers.Authorization = `Bearer ${access_token}`;
    }
    // Let axios/browser set multipart boundary for file uploads
    if (config.data instanceof FormData && config.headers) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    if (SNAPSHOT_MODE) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest) {
      if (isAuthApiUrl(originalRequest.url)) {
        if (isRefreshApiUrl(originalRequest.url)) {
          processQueue(error, null);
          isRefreshing = false;
          forceLogout();
        }
        return Promise.reject(error);
      }

      if (originalRequest._retry) {
        forceLogout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((access_token) => {
            if (originalRequest.headers && access_token) {
              originalRequest.headers.Authorization = `Bearer ${access_token}`;
            }
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refresh_token = useAuthStore.getState().refresh_token;
      if (!hasValidRefreshToken(refresh_token)) {
        processQueue(error, null);
        isRefreshing = false;
        forceLogout();
        return Promise.reject(error);
      }

      try {
        const data = await refreshAccessTokenApi(refresh_token!);
        const { access_token, refresh_token: newRefreshToken } = data;

        useAuthStore.getState().setToken(access_token, newRefreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        processQueue(null, access_token);
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        forceLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
