import { useRef, useState, useEffect, useCallback } from 'react';
import { logger } from '@infrastructure/logging/frontend-logger';
import { WebRTCMetricsCollector } from '@infrastructure/webrtc/metrics-collector';
import type { ConnectionState, ConnectionQuality } from '../components/ConnectionStatus';

const WEBRTC_CONNECTION_TIMEOUT_MS = 30000; // 30 seconds

export interface UsePeerConnectionReturn {
  peerConnection: RTCPeerConnection | null;
  connectionState: ConnectionState;
  connectionQuality: ConnectionQuality | null;
  setConnectionState: (state: ConnectionState) => void;
  setConnectionQuality: (quality: ConnectionQuality | null) => void;
  createPeerConnection: (iceServers: RTCIceServer[], sessionId: string, onRemoteStream: (stream: MediaStream) => void, onIceCandidate: (candidate: RTCIceCandidate) => void) => RTCPeerConnection;
  cleanup: () => void;
}

/**
 * Hook to manage RTCPeerConnection lifecycle.
 * Handles creation, state management, connection timeout, and metrics collection.
 */
export function usePeerConnection(sessionId: string | null): UsePeerConnectionReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const metricsCollectorRef = useRef<WebRTCMetricsCollector | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const createPeerConnection = useCallback(
    (
      iceServers: RTCIceServer[],
      sessionId: string,
      onRemoteStream: (stream: MediaStream) => void,
      onIceCandidate: (candidate: RTCIceCandidate) => void
    ): RTCPeerConnection => {
      // Cleanup previous connection if exists
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (metricsCollectorRef.current) {
        void metricsCollectorRef.current.stop();
        metricsCollectorRef.current = null;
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      // Create RTCPeerConnection with optimized configuration
      const configuration: RTCConfiguration = {
        iceServers:
          iceServers.length > 0
            ? iceServers
            : [
                // Fallback if configuration not loaded yet
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
              ],
        // Optimize connection configuration
        bundlePolicy: 'max-bundle', // Reduce number of transports
        rtcpMuxPolicy: 'require', // Require RTCP multiplexing
        iceCandidatePoolSize: 10, // Pre-gather ICE candidates
      };

      const peerConnection = new RTCPeerConnection(configuration);
      peerConnectionRef.current = peerConnection;

      // Set connection timeout - if connection doesn't establish in 30s, fail it
      connectionTimeoutRef.current = setTimeout(() => {
        if (
          peerConnectionRef.current &&
          peerConnectionRef.current.connectionState !== 'connected' &&
          peerConnectionRef.current.connectionState !== 'connecting'
        ) {
          logger.warn('WebRTC connection timeout: connection not established within 30 seconds', {
            sessionId,
            connectionState: peerConnectionRef.current.connectionState,
            iceConnectionState: peerConnectionRef.current.iceConnectionState,
          });
          setConnectionState('failed');
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        } else if (
          peerConnectionRef.current &&
          peerConnectionRef.current.connectionState === 'connecting'
        ) {
          // Still connecting after 30s - consider it a timeout
          logger.warn('WebRTC connection timeout: still connecting after 30 seconds', {
            sessionId,
            connectionState: peerConnectionRef.current.connectionState,
            iceConnectionState: peerConnectionRef.current.iceConnectionState,
          });
          setConnectionState('failed');
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
      }, WEBRTC_CONNECTION_TIMEOUT_MS);

      // Start metrics collector
      const metricsCollector = new WebRTCMetricsCollector({
        sessionId,
        peerConnection,
        collectIntervalMs: 5000, // Collect every 5 seconds
        sendIntervalMs: 10000, // Send batch every 10 seconds
      });
      metricsCollectorRef.current = metricsCollector;
      metricsCollector.start();

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        logger.debug('Remote track received', { sessionId, event });
        if (event.streams[0]) {
          logger.debug('Setting remote stream', { sessionId });
          onRemoteStream(event.streams[0]);
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && sessionId) {
          logger.debug('ICE candidate generated', {
            candidate: event.candidate.candidate,
            sessionId,
          });
          onIceCandidate(event.candidate);
        } else if (!event.candidate) {
          logger.debug('ICE gathering complete', { sessionId });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        logger.debug('Connection state changed', { sessionId, state });

        // Map WebRTC connection state to our ConnectionState
        switch (state) {
          case 'connecting':
          case 'new':
            setConnectionState('connecting');
            break;
          case 'connected':
            setConnectionState('connected');
            // Clear connection timeout
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
            break;
          case 'disconnected':
            setConnectionState('disconnected');
            break;
          case 'failed':
          case 'closed':
            setConnectionState('failed');
            // Clear connection timeout
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
            break;
          default:
            setConnectionState('disconnected');
        }
      };

      // Handle ICE connection state changes and quality
      peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        logger.debug('ICE connection state changed', { sessionId, state });

        // Determine connection quality based on ICE connection state
        switch (state) {
          case 'connected':
            setConnectionQuality('good');
            break;
          case 'checking':
          case 'completed':
            // Check stats to determine quality
            peerConnection.getStats().then((stats) => {
              let hasVideo = false;
              let hasAudio = false;
              let totalBytesReceived = 0;

              stats.forEach((report) => {
                if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                  hasVideo = true;
                  if ('bytesReceived' in report && typeof report.bytesReceived === 'number') {
                    totalBytesReceived += report.bytesReceived;
                  }
                }
                if (report.type === 'inbound-rtp' && report.mediaType === 'audio') {
                  hasAudio = true;
                }
              });

              // Simple quality heuristic based on data received
              if (hasVideo && totalBytesReceived > 100000) {
                // More than 100KB received suggests good connection
                setConnectionQuality('good');
              } else if (hasVideo || hasAudio) {
                setConnectionQuality('medium');
              } else {
                setConnectionQuality('poor');
              }
            });
            break;
          case 'disconnected':
            setConnectionQuality('poor');
            setConnectionState('disconnected');
            break;
          case 'failed':
            setConnectionQuality('poor');
            setConnectionState('failed');
            break;
          default:
            setConnectionQuality(null);
        }
      };

      return peerConnection;
    },
    []
  );

  const cleanup = useCallback((): void => {
    if (metricsCollectorRef.current) {
      void metricsCollectorRef.current.stop();
      metricsCollectorRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setConnectionState('disconnected');
    setConnectionQuality(null);
  }, []);

  // Cleanup when sessionId changes or component unmounts
  useEffect(() => {
    if (!sessionId) {
      cleanup();
    }
    return cleanup;
  }, [sessionId, cleanup]);

  return {
    peerConnection: peerConnectionRef.current,
    connectionState,
    connectionQuality,
    setConnectionState,
    setConnectionQuality,
    createPeerConnection,
    cleanup,
  };
}

