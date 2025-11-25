import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getEnv } from '@config/env.schema';
import { useAuthStore } from '@application/stores/auth-store';
import { useBanStore } from '@application/stores/ban-store';
import { isTokenExpiringSoon } from '@infrastructure/utils/jwt-utils';

export class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  constructor() {
    const env = getEnv();
    this.client = axios.create({
      baseURL: env.VITE_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests and refresh proactively if needed
    this.client.interceptors.request.use(
      async (config) => {
        // Skip token check for auth endpoints
        if (config.url?.includes('/auth/')) {
          return config;
        }

        const token = localStorage.getItem('accessToken');
        if (!token) {
          return config;
        }

        // Check if token is expiring soon and refresh proactively
        if (isTokenExpiringSoon(token, 5)) {
          const state = useAuthStore.getState();
          if (state.isTokenExpiringSoon()) {
            try {
              // Try to refresh - if another refresh is in progress, this will wait or fail gracefully
              await state.refreshAccessToken();
              // Get the new token after refresh
              const newToken = useAuthStore.getState().accessToken || token;
              config.headers.Authorization = `Bearer ${newToken}`;
            } catch (error) {
              // Refresh failed or is in progress, use current token
              // If token is actually expired, the request will fail and trigger reactive refresh
              config.headers.Authorization = `Bearer ${token}`;
            }
          } else {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } else {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Handle errors and refresh tokens
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Skip refresh for auth endpoints to avoid infinite loops
        // Don't redirect on auth endpoint errors - let components handle them
        if (originalRequest?.url?.includes('/auth/')) {
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest?._retry) {
          if (this.isRefreshing) {
            // If already refreshing, queue this request
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then(() => {
                const token = localStorage.getItem('accessToken');
                if (token && originalRequest) {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                }
                return this.client(originalRequest);
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) {
            // No refresh token, redirect to login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            return Promise.reject(error);
          }

          try {
            // Use the refresh method from auth store which handles all updates
            await useAuthStore.getState().refreshAccessToken();
            
            // Get the new token after refresh
            const newState = useAuthStore.getState();
            const newAccessToken = newState.accessToken;

            if (!newAccessToken) {
              throw new Error('Failed to get new access token after refresh');
            }

            // Retry queued requests
            this.failedQueue.forEach(({ resolve }) => {
              resolve();
            });
            this.failedQueue = [];
            this.isRefreshing = false;

            // Retry original request with new token
            if (originalRequest) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed - error is already handled in refreshAccessToken (logout, redirect)
            this.failedQueue.forEach(({ reject }) => {
              reject(refreshError);
            });
            this.failedQueue = [];
            this.isRefreshing = false;
            
            return Promise.reject(refreshError);
          }
        }

        if (error.response?.status === 403) {
          const errorPayload = (error.response.data as { error?: { message?: string; details?: Record<string, string> } })?.error;
          const message = errorPayload?.message ?? '';
          if (message.toLowerCase().includes('banned')) {
            const details = errorPayload?.details;
            useBanStore
              .getState()
              .setBanInfo({
                details: {
                  reason: details?.reason,
                  bannedAt: details?.bannedAt,
                  bannedUntil: details?.bannedUntil,
                },
              });

            if (typeof window !== 'undefined' && window.location.pathname !== '/banned') {
              window.location.href = '/banned';
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  get instance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient();

