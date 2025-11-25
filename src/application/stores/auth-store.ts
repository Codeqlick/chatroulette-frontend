import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, AuthResponse } from '@infrastructure/api/auth-service';
import { User } from '@domain/entities/user';
import { useChatStore } from './chat-store';
import { isTokenExpiringSoon, isTokenExpired } from '@infrastructure/utils/jwt-utils';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { logger } from '@infrastructure/logging/frontend-logger';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, username: string) => Promise<void>;
  logout: () => void;
  setAuth: (auth: AuthResponse) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  refreshAccessToken: () => Promise<void>;
  isTokenExpiringSoon: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,
      setHasHydrated: (hasHydrated: boolean) => {
        set({ _hasHydrated: hasHydrated });
      },
      login: async (email: string, password: string) => {
        // Limpiar estado de chat antes de iniciar sesión
        useChatStore.getState().clearSession();

        const response = await authService.login({ email, password });
        set({
          user: response.user as User,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          isAuthenticated: true,
        });
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
      },
      register: async (email: string, password: string, name: string, username: string) => {
        // Limpiar estado de chat antes de registrar
        useChatStore.getState().clearSession();

        const response = await authService.register({ email, password, name, username });
        set({
          user: response.user as User,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          isAuthenticated: true,
        });
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
      },
      logout: () => {
        // Limpiar estado de chat al cerrar sesión
        useChatStore.getState().clearSession();

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');

        // Disconnect WebSocket
        webSocketService.disconnect();
      },
      setAuth: (auth: AuthResponse) => {
        set({
          user: auth.user as User,
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          isAuthenticated: true,
        });
        // Also update localStorage to keep them in sync
        localStorage.setItem('accessToken', auth.accessToken);
        localStorage.setItem('refreshToken', auth.refreshToken);
      },
      refreshAccessToken: async () => {
        const state = get();
        const refreshToken = state.refreshToken;

        if (!refreshToken) {
          logger.error('No refresh token available');
          // No refresh token, logout user
          get().logout();
          return;
        }

        try {
          const response = await authService.refreshToken(refreshToken);
          const newAccessToken = response.accessToken;

          // Update state
          set({
            accessToken: newAccessToken,
          });

          // Update localStorage
          localStorage.setItem('accessToken', newAccessToken);

          // Update WebSocket token if connected
          if (webSocketService.isConnected() || webSocketService.getStatus() === 'connecting') {
            webSocketService.updateToken(newAccessToken).catch((error) => {
              logger.error('Error updating WebSocket token', { error });
            });
          }

          logger.debug('Token refreshed successfully');
        } catch (error) {
          logger.error('Error refreshing token', { error });
          // Refresh failed, logout user
          get().logout();
          // Redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          throw error;
        }
      },
      isTokenExpiringSoon: (): boolean => {
        const state = get();
        const accessToken = state.accessToken;

        if (!accessToken) {
          return true; // No token means we need to authenticate
        }

        // Check if token is expired
        if (isTokenExpired(accessToken)) {
          return true;
        }

        // Check if token is expiring soon (within 5 minutes)
        return isTokenExpiringSoon(accessToken, 5);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state: AuthState) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        logger.debug('State rehydrated');
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// Hook to check if store is hydrated
export const useAuthHydrated = (): boolean => {
  return useAuthStore((state) => state._hasHydrated);
};
