import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, AuthResponse } from '@infrastructure/api/auth-service';
import { User } from '@domain/entities/user';
import { useChatStore } from './chat-store';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  setAuth: (auth: AuthResponse) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
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
      register: async (email: string, password: string, name: string) => {
        // Limpiar estado de chat antes de registrar
        useChatStore.getState().clearSession();
        
        const response = await authService.register({ email, password, name });
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
      },
      setAuth: (auth: AuthResponse) => {
        set({
          user: auth.user as User,
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          isAuthenticated: true,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        console.log('[AuthStore] State rehydrated');
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

