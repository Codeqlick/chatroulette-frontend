import { useEffect, useRef, useCallback } from 'react';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { logger } from '@infrastructure/logging/frontend-logger';
import { WEBSOCKET_EVENTS } from '@config/constants';

const ICE_RESTART_DELAY_MS = 2000; // Wait 2 seconds before ICE restart after network change

export interface UseNetworkMonitoringReturn {
  performIceRestart: (peerConnection: RTCPeerConnection, sessionId: string) => Promise<void>;
}

/**
 * Hook to monitor network changes and trigger ICE restart.
 * Detects online/offline events and connection type changes.
 */
export function useNetworkMonitoring(
  sessionId: string | null,
  peerConnection: RTCPeerConnection | null
): UseNetworkMonitoringReturn {
  const iceRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastNetworkChangeRef = useRef<number>(0);

  const performIceRestart = useCallback(
    async (targetPeerConnection: RTCPeerConnection, targetSessionId: string): Promise<void> => {
      const now = Date.now();
      // Throttle ICE restarts - don't restart more than once every 5 seconds
      if (now - lastNetworkChangeRef.current < 5000) {
        logger.debug('ICE restart throttled', { sessionId: targetSessionId });
        return;
      }
      lastNetworkChangeRef.current = now;

      if (!targetPeerConnection || targetPeerConnection.connectionState === 'closed') {
        return;
      }

      // Only restart if connection is active but having issues
      if (
        targetPeerConnection.connectionState === 'connected' ||
        targetPeerConnection.connectionState === 'connecting'
      ) {
        logger.info('Performing ICE restart due to network change', {
          sessionId: targetSessionId,
          connectionState: targetPeerConnection.connectionState,
          iceConnectionState: targetPeerConnection.iceConnectionState,
        });

        try {
          // Create new offer with iceRestart: true
          const offer = await targetPeerConnection.createOffer({ iceRestart: true });
          await targetPeerConnection.setLocalDescription(offer);

          // Send offer via WebSocket
          if (webSocketService.isConnected()) {
            const offerPayload = {
              sessionId: targetSessionId,
              offer: {
                type: offer.type,
                sdp: offer.sdp,
              },
            };
            webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_OFFER, offerPayload);
            logger.debug('ICE restart offer sent', { sessionId: targetSessionId });
          } else {
            logger.warn('Cannot send ICE restart offer: WebSocket not connected', {
              sessionId: targetSessionId,
            });
          }
        } catch (error) {
          logger.error('Error performing ICE restart', { error, sessionId: targetSessionId });
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!sessionId || !peerConnection) {
      return;
    }

    // Handle online/offline events
    const handleOnline = (): void => {
      logger.info('Network online event detected', { sessionId });
      // Clear any existing timeout
      if (iceRestartTimeoutRef.current) {
        clearTimeout(iceRestartTimeoutRef.current);
      }
      // Wait a bit before restarting to ensure network is stable
      iceRestartTimeoutRef.current = setTimeout(() => {
        void performIceRestart(peerConnection, sessionId);
      }, ICE_RESTART_DELAY_MS);
    };

    const handleOffline = (): void => {
      logger.info('Network offline event detected', { sessionId });
      // Clear any pending restart
      if (iceRestartTimeoutRef.current) {
        clearTimeout(iceRestartTimeoutRef.current);
        iceRestartTimeoutRef.current = null;
      }
    };

    // Handle connection change (if available)
    const handleConnectionChange = (): void => {
      // Check if connection API is available
      const connection = (navigator as { connection?: { type?: string; effectiveType?: string } })
        .connection ||
        (navigator as { mozConnection?: { type?: string } }).mozConnection ||
        (navigator as { webkitConnection?: { type?: string } }).webkitConnection;

      if (connection) {
        logger.info('Network connection change detected', {
          sessionId,
          type: connection.type,
          effectiveType: (connection as { effectiveType?: string }).effectiveType,
        });
        // Clear any existing timeout
        if (iceRestartTimeoutRef.current) {
          clearTimeout(iceRestartTimeoutRef.current);
        }
        // Wait a bit before restarting
        iceRestartTimeoutRef.current = setTimeout(() => {
          void performIceRestart(peerConnection, sessionId);
        }, ICE_RESTART_DELAY_MS);
      }
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Add connection change listener if available
    const connection = (navigator as {
      connection?: { addEventListener?: (event: string, handler: () => void) => void };
    }).connection ||
      (navigator as {
        mozConnection?: { addEventListener?: (event: string, handler: () => void) => void };
      }).mozConnection ||
      (navigator as {
        webkitConnection?: { addEventListener?: (event: string, handler: () => void) => void };
      }).webkitConnection;

    if (connection && typeof connection.addEventListener === 'function') {
      connection.addEventListener('change', handleConnectionChange);
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      // Type assertion for connection API which may have removeEventListener
      const connectionWithRemove = connection as {
        removeEventListener?: (event: string, handler: () => void) => void;
      };
      if (
        connectionWithRemove &&
        typeof connectionWithRemove.removeEventListener === 'function'
      ) {
        connectionWithRemove.removeEventListener('change', handleConnectionChange);
      }
      if (iceRestartTimeoutRef.current) {
        clearTimeout(iceRestartTimeoutRef.current);
        iceRestartTimeoutRef.current = null;
      }
    };
  }, [sessionId, peerConnection, performIceRestart]);

  return {
    performIceRestart,
  };
}

