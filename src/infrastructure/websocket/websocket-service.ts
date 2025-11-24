import { io, Socket } from 'socket.io-client';
import { getEnv } from '@config/env.schema';
import { WEBSOCKET_EVENTS } from '@config/constants';
import { useAuthStore } from '@application/stores/auth-store';

// Re-export for convenience
export { WEBSOCKET_EVENTS };

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class WebSocketService {
  private socket: Socket | null = null;
  private status: WebSocketStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private currentToken: string | null = null;

  connect(token: string): void {
    // If already connected with the same token, don't reconnect
    if (this.socket?.connected && this.currentToken === token) {
      return;
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

    this.socket.on('connect_error', (error: Error) => {
      this.status = 'error';
      this.onStatusChange?.(this.status);
      // Check if it's an authentication error
      if (error.message.includes('Authentication') || error.message.includes('Invalid token')) {
        console.warn('WebSocket authentication error, will attempt to refresh token');
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
  updateToken(token: string): void {
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
      this.connect(token);
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
      console.warn('No access token available for WebSocket reconnection');
      return;
    }

    setTimeout(() => {
      this.connect(token);
    }, 1000 * this.reconnectAttempts);
  }
}

export const webSocketService = new WebSocketService();

