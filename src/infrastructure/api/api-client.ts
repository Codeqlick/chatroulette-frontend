import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getEnv } from '@config/env.schema';
import { authService } from './auth-service';
import { webSocketService } from '../websocket/websocket-service';
import { useAuthStore } from '@application/stores/auth-store';

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

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle errors and refresh tokens
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Skip refresh for auth endpoints to avoid infinite loops
        if (originalRequest?.url?.includes('/auth/')) {
        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
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
            const response = await authService.refreshToken(refreshToken);
            const newAccessToken = response.accessToken;

            // Update tokens in localStorage and store
            localStorage.setItem('accessToken', newAccessToken);
            const state = useAuthStore.getState();
            useAuthStore.setState({
              ...state,
              accessToken: newAccessToken,
            });

            // Update WebSocket token
            webSocketService.updateToken(newAccessToken);

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
            // Refresh failed, clear tokens and redirect to login
            this.failedQueue.forEach(({ reject }) => {
              reject(refreshError);
            });
            this.failedQueue = [];
            this.isRefreshing = false;

            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            return Promise.reject(refreshError);
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

