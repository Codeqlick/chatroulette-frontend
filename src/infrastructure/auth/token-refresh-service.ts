/**
 * Token Refresh Service
 * 
 * Servicio que monitorea la expiración de tokens y los refresca automáticamente
 * antes de que expiren para evitar errores de autenticación.
 */

import { useAuthStore } from '@application/stores/auth-store';
import { logger } from '@infrastructure/logging/frontend-logger';

export class TokenRefreshService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs = 60 * 1000; // Check every minute
  private isRefreshing = false;

  /**
   * Inicia el servicio de monitoreo de tokens
   */
  start(): void {
    // Stop any existing interval
    this.stop();

    logger.info('Starting token refresh monitoring');

    // Check immediately
    this.checkAndRefresh().catch((error) => {
      logger.error('Error in initial check', { error });
    });

    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkAndRefresh().catch((error) => {
        logger.error('Error in periodic check', { error });
      });
    }, this.checkIntervalMs);
  }

  /**
   * Detiene el servicio de monitoreo
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped token refresh monitoring');
    }
  }

  /**
   * Verifica si el token está próximo a expirar y lo refresca si es necesario
   */
  private async checkAndRefresh(): Promise<void> {
    // Don't refresh if already refreshing
    if (this.isRefreshing) {
      return;
    }

    const state = useAuthStore.getState();

    // Only check if user is authenticated
    if (!state.isAuthenticated || !state.accessToken) {
      return;
    }

    // Check if token is expiring soon
    if (state.isTokenExpiringSoon()) {
      logger.debug('Token is expiring soon, refreshing');
      
      this.isRefreshing = true;
      try {
        await state.refreshAccessToken();
        logger.debug('Token refreshed successfully');
      } catch (error) {
        logger.error('Failed to refresh token', { error });
        // Error is already handled in refreshAccessToken (logout, redirect)
      } finally {
        this.isRefreshing = false;
      }
    }
  }

  /**
   * Verifica si el servicio está activo
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

export const tokenRefreshService = new TokenRefreshService();

