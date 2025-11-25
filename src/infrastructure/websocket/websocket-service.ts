import { io, Socket } from 'socket.io-client';
import { getEnv } from '@config/env.schema';
import { WEBSOCKET_EVENTS } from '@config/constants';
import { useAuthStore } from '@application/stores/auth-store';
import { isTokenExpired, isTokenExpiringSoon } from '@infrastructure/utils/jwt-utils';
import { logger } from '@infrastructure/logging/frontend-logger';

// Re-export for convenience
export { WEBSOCKET_EVENTS };

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class WebSocketService {
  private socket: Socket | null = null;
  private status: WebSocketStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private currentToken: string | null = null;

  async connect(token: string): Promise<void> {
    // If already connected with the same token, don't reconnect
    if (this.socket?.connected && this.currentToken === token) {
      return;
    }

    // Check if token is expired or expiring soon before connecting
    if (isTokenExpired(token)) {
      logger.warn('Token is expired, attempting to refresh before connecting');
      try {
        const state = useAuthStore.getState();
        if (state.isTokenExpiringSoon()) {
          await state.refreshAccessToken();
          // Get the new token after refresh
          const newState = useAuthStore.getState();
          token = newState.accessToken || token;
        }
      } catch (error) {
        logger.error('Failed to refresh token before connecting', { error });
        this.status = 'error';
        this.onStatusChange?.(this.status);
        return; // Don't attempt to connect if refresh failed
      }
    } else if (isTokenExpiringSoon(token, 5)) {
      // Token is expiring soon, try to refresh proactively
      logger.debug('Token is expiring soon, refreshing before connecting');
      try {
        const state = useAuthStore.getState();
        if (state.isTokenExpiringSoon()) {
          await state.refreshAccessToken();
          // Get the new token after refresh
          const newState = useAuthStore.getState();
          token = newState.accessToken || token;
        }
      } catch (error) {
        logger.error('Failed to refresh token before connecting', { error });
        // Continue anyway, the token might still be valid
      }
    }

    // Disconnect existing socket if it exists
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentToken = token;
    this.status = 'connecting';
    const env = getEnv();
    this.socket = io(env.VITE_WS_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this.onStatusChange?.(this.status);
    });

    this.socket.on('disconnect', () => {
      this.status = 'disconnected';
      this.onStatusChange?.(this.status);
      this.attemptReconnect();
    });

    this.socket.on('connect_error', async (error: Error) => {
      this.status = 'error';
      this.onStatusChange?.(this.status);
      
      // Check if it's an authentication error
      if (error.message.includes('Authentication') || error.message.includes('Invalid token') || error.message.includes('jwt expired')) {
        logger.warn('Authentication error detected, attempting to refresh token and reconnect');
        
        try {
          const state = useAuthStore.getState();
          // Try to refresh token
          if (state.refreshToken) {
            await state.refreshAccessToken();
            // Get new token and reconnect
            const newState = useAuthStore.getState();
            if (newState.accessToken) {
              // Disconnect current socket
              if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
              }
              // Reconnect with new token
              await this.connect(newState.accessToken);
            }
          }
        } catch (refreshError) {
          logger.error('Failed to refresh token after auth error', { error: refreshError });
          // Error is already handled in refreshAccessToken (logout, redirect)
        }
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
    this.status = 'disconnected';
    this.onStatusChange?.(this.status);
  }

  /**
   * Update the token and reconnect if necessary
   */
  async updateToken(token: string): Promise<void> {
    if (this.currentToken === token) {
      return; // Token hasn't changed
    }

    const wasConnected = this.socket?.connected ?? false;
    
    // Disconnect current socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Reconnect with new token if it was connected before
    if (wasConnected) {
      await this.connect(token);
    } else {
      this.currentToken = token;
    }
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: unknown[]) => void): void {
    this.socket?.off(event, callback);
  }

  emit(event: string, data: unknown): void {
    this.socket?.emit(event, data);
  }

  joinRoom(room: string): void {
    this.socket?.emit('join', room);
  }

  leaveRoom(room: string): void {
    this.socket?.emit('leave', room);
  }

  /**
   * Listen for error events from the server
   */
  onError(callback: (error: { code: string; message: string; eventId?: string }) => void): void {
    this.on(WEBSOCKET_EVENTS.ERROR, callback as (...args: unknown[]) => void);
  }

  /**
   * Remove error event listener
   */
  offError(callback?: (error: { code: string; message: string; eventId?: string }) => void): void {
    this.off(WEBSOCKET_EVENTS.ERROR, callback as (...args: unknown[]) => void | undefined);
  }

  /**
   * Listen for server heartbeat
   */
  onHeartbeat(callback: () => void): void {
    this.on(WEBSOCKET_EVENTS.SERVER_HEARTBEAT, callback as (...args: unknown[]) => void);
  }

  /**
   * Remove heartbeat listener
   */
  offHeartbeat(callback?: () => void): void {
    this.off(WEBSOCKET_EVENTS.SERVER_HEARTBEAT, callback as (...args: unknown[]) => void | undefined);
  }

  getStatus(): WebSocketStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  onStatusChange?: (status: WebSocketStatus) => void;

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    
    // Get current token from store
    const state = useAuthStore.getState();
    const token = state.accessToken;

    if (!token) {
      logger.warn('No access token available for reconnection');
      return;
    }

    // Check if token needs refresh before reconnecting
    setTimeout(async () => {
      try {
        await this.connect(token);
      } catch (error) {
        logger.error('Error during reconnection', { error });
      }
    }, 1000 * this.reconnectAttempts);
  }
}

export const webSocketService = new WebSocketService();

