import { useRef, useCallback } from 'react';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { logger } from '@infrastructure/logging/frontend-logger';

const maxReconnectAttempts = 5;

export interface UseWebRTCReconnectionReturn {
  reconnectAttempts: React.MutableRefObject<number>;
  attemptReconnection: (
    sessionId: string,
    iceServers: RTCIceServer[],
    localStream: MediaStream | null,
    createPeerConnection: (
      iceServers: RTCIceServer[],
      sessionId: string,
      onRemoteStream: (stream: MediaStream) => void,
      onIceCandidate: (candidate: RTCIceCandidate) => void
    ) => RTCPeerConnection,
    startVideo: () => Promise<void>,
    setRemoteStream: (stream: MediaStream) => void,
    sendIceCandidate: (candidate: RTCIceCandidate, targetSessionId: string) => void,
    closeExistingConnection: () => void,
    setPeerConnection: (connection: RTCPeerConnection | null) => void,
    setRoomReady: (ready: boolean) => void
  ) => void;
  resetReconnectionAttempts: () => void;
}

/**
 * Hook to manage WebRTC reconnection logic with exponential backoff.
 * Handles automatic reconnection when connection fails or disconnects.
 */
export function useWebRTCReconnection(): UseWebRTCReconnectionReturn {
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const attemptReconnection = useCallback(
    (
      sessionId: string,
      iceServers: RTCIceServer[],
      localStream: MediaStream | null,
      createPeerConnection: (
        iceServers: RTCIceServer[],
        sessionId: string,
        onRemoteStream: (stream: MediaStream) => void,
        onIceCandidate: (candidate: RTCIceCandidate) => void
      ) => RTCPeerConnection,
      startVideo: () => Promise<void>,
      setRemoteStream: (stream: MediaStream) => void,
      sendIceCandidate: (candidate: RTCIceCandidate, targetSessionId: string) => void,
      closeExistingConnection: () => void,
      setPeerConnection: (connection: RTCPeerConnection | null) => void,
      setRoomReady: (ready: boolean) => void
    ): void => {
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        logger.warn('Max reconnection attempts reached', {
          sessionId,
          maxAttempts: maxReconnectAttempts,
        });
        return;
      }

      reconnectAttemptsRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000); // Max 30s

      logger.info(
        `Attempting reconnection ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`,
        {
          sessionId,
          delay,
          attempt: reconnectAttemptsRef.current,
        }
      );

      reconnectTimeoutRef.current = setTimeout(async () => {
        try {
          // Verify socket is connected before reconnecting
          if (!webSocketService.isConnected()) {
            logger.warn('Socket not connected, cannot reconnect WebRTC', { sessionId });
            return;
          }

          // Close existing connection
          closeExistingConnection();

          // Use createPeerConnection to maintain consistency with initial connection setup
          // The callbacks passed here will handle remote stream and ICE candidates
          const newPeerConnection = createPeerConnection(
            iceServers,
            sessionId,
            (stream) => {
              logger.debug('Remote stream received on reconnection', { sessionId, stream });
              setRemoteStream(stream);
            },
            (candidate) => {
              logger.debug('ICE candidate generated on reconnection', { sessionId, candidate });
              sendIceCandidate(candidate, sessionId);
            }
          );

          // Assign the new connection
          setPeerConnection(newPeerConnection);

          // Re-add tracks if local stream exists
          if (localStream) {
            localStream.getTracks().forEach((track) => {
              newPeerConnection.addTrack(track, localStream);
            });
          }

          // Reset room ready state to wait for new room ready event
          setRoomReady(false);

          // Restart video to renegotiate
          await startVideo();
        } catch (err) {
          logger.error('Reconnection attempt failed', { error: err, sessionId });
        }
      }, delay);
    },
    []
  );

  const resetReconnectionAttempts = useCallback((): void => {
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  return {
    reconnectAttempts: reconnectAttemptsRef,
    attemptReconnection,
    resetReconnectionAttempts,
  };
}
