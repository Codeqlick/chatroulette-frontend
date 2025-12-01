import { useRef, useEffect, useState, useCallback } from 'react';
import { WEBSOCKET_EVENTS, API_CONSTANTS } from '@config/constants';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { webrtcService } from '@infrastructure/api/webrtc-service';
import { logger } from '@infrastructure/logging/frontend-logger';
import { WebRTCMetricsCollector } from '@infrastructure/webrtc/metrics-collector';
import type { ConnectionState, ConnectionQuality } from '../components/ConnectionStatus';

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
}

/**
 * Detecta si un dispositivo es una cámara virtual común
 * @param deviceLabel - El nombre/etiqueta del dispositivo
 * @returns true si es una cámara virtual, false si es física
 */
function isVirtualCamera(deviceLabel: string): boolean {
  if (!deviceLabel) {
    return false;
  }

  const lowerLabel = deviceLabel.toLowerCase();

  // Lista de patrones comunes de cámaras virtuales
  const virtualCameraPatterns = [
    'obs virtual',
    'obs-camera',
    'manycam',
    'camo studio',
    'camo virtual',
    'xsplit vcam',
    'vcam',
    'virtual camera',
    'virtualcam',
    'droidcam',
    'ivcam',
    'epoccam',
    'nvidia broadcast',
    'nvidia rtx',
    'logitech capture',
    'screen capture',
    'screen recorder',
  ];

  return virtualCameraPatterns.some((pattern) => lowerLabel.includes(pattern));
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  connectionState: ConnectionState;
  connectionQuality: ConnectionQuality | null;
  availableDevices: MediaDevice[];
  selectedVideoDeviceId: string | null;
  selectedAudioDeviceId: string | null;
  startVideo: () => Promise<void>;
  startLocalVideo: () => Promise<void>;
  stopVideo: () => void;
  toggleVideo: () => Promise<void>;
  toggleAudio: () => Promise<void>;
  changeVideoDevice: (deviceId: string) => Promise<void>;
  changeAudioDevice: (deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  error: Error | null;
}

/**
 * Custom React hook for managing WebRTC peer-to-peer video/audio connections.
 *
 * This hook handles:
 * - Creating and managing RTCPeerConnection instances
 * - Handling WebRTC signaling (offer/answer/ICE candidates) via WebSocket
 * - Managing local and remote media streams
 * - Automatic reconnection with exponential backoff
 * - Connection quality monitoring
 * - Device enumeration and selection
 * - Rate limiting for offer/answer to prevent server overload
 *
 * The hook uses refs extensively to avoid stale closures in event handlers
 * and to maintain state across re-renders without causing infinite loops.
 *
 * @param sessionId - The session ID for the current chat session, or null if not in a session
 * @returns UseWebRTCReturn object with all WebRTC state and control functions
 */
export function useWebRTC(sessionId: string | null): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDevice[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  // ICE servers are loaded from backend, but we use Google STUN as fallback
  // This ensures connectivity even if backend config hasn't loaded yet
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const metricsCollectorRef = useRef<WebRTCMetricsCollector | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isStartingVideoRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startVideoRef = useRef<(() => Promise<void>) | null>(null);
  const iceRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastNetworkChangeRef = useRef<number>(0);
  const WEBRTC_CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
  const ICE_RESTART_DELAY_MS = 2000; // Wait 2 seconds before ICE restart after network change
  const offerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const maxReconnectAttempts = 5;
  const offerRetryAttemptsRef = useRef<number>(0);
  const answerRetryAttemptsRef = useRef<number>(0);
  const lastOfferTimeRef = useRef<number>(0);
  // Rate limiting: Server allows 5 offers per minute (12s minimum between offers)
  // We add 1s margin to account for network latency and timing variations
  const RATE_LIMIT_COOLDOWN_MS = 13000;

  /**
   * Calculates exponential backoff delay for retry attempts.
   *
   * The delay doubles with each attempt (exponential backoff) to avoid
   * overwhelming the server with rapid retries while still attempting
   * to recover from transient failures.
   *
   * @param attempt - The current retry attempt number (0-indexed)
   * @returns The delay in milliseconds, capped at the maximum delay
   */
  const calculateBackoffDelay = useCallback((attempt: number): number => {
    const delay = API_CONSTANTS.WEBRTC_RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
    return Math.min(delay, API_CONSTANTS.WEBRTC_RETRY_MAX_DELAY_MS);
  }, []);

  /**
   * Sends a WebRTC offer with retry logic and exponential backoff.
   *
   * This function implements:
   * - Rate limiting: Ensures at least 13 seconds between offers (server limit: 5/min)
   * - Retry logic: Automatically retries on failure with exponential backoff
   * - Error handling: Logs errors and resets retry counter on success
   *
   * The rate limiting prevents exceeding server limits and reduces unnecessary
   * network traffic during connection issues.
   *
   * @param offer - The RTCSessionDescriptionInit offer to send
   * @param attempt - The current retry attempt (defaults to 0 for first attempt)
   * @throws {Error} If session ID or peer connection is not available
   * @throws {Error} If WebSocket is not connected
   */
  const sendOfferWithRetry = useCallback(
    async (offer: RTCSessionDescriptionInit, attempt: number = 0): Promise<void> => {
      if (!sessionId || !peerConnectionRef.current) {
        throw new Error('Session ID or peer connection not available');
      }

      if (!webSocketService.isConnected()) {
        throw new Error('WebSocket not connected');
      }

      // Rate limiting: Ensure we don't exceed server limit of 5 offers per minute
      // Only apply rate limiting on the first attempt (not retries)
      const now = Date.now();
      const timeSinceLastOffer = now - lastOfferTimeRef.current;

      if (timeSinceLastOffer < RATE_LIMIT_COOLDOWN_MS && attempt === 0) {
        const waitTime = RATE_LIMIT_COOLDOWN_MS - timeSinceLastOffer;
        logger.debug(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before sending offer`, {
          sessionId,
        });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      try {
        const offerPayload = {
          sessionId,
          offer: {
            type: offer.type,
            sdp: offer.sdp,
          },
        };

        logger.debug(
          `Sending offer (attempt ${attempt + 1}/${API_CONSTANTS.WEBRTC_RETRY_MAX_ATTEMPTS})`,
          { sessionId }
        );
        webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_OFFER, offerPayload);
        logger.debug('Offer sent successfully', { sessionId });
        lastOfferTimeRef.current = Date.now(); // Update last offer time
        offerRetryAttemptsRef.current = 0; // Reset on success
      } catch (err) {
        logger.error(`Error sending offer (attempt ${attempt + 1})`, {
          error: err,
          sessionId,
          attempt,
        });

        if (attempt < API_CONSTANTS.WEBRTC_RETRY_MAX_ATTEMPTS - 1) {
          const delay = calculateBackoffDelay(attempt);
          logger.debug(`Retrying offer in ${delay}ms...`, { sessionId, attempt, delay });
          offerRetryAttemptsRef.current = attempt + 1;

          await new Promise((resolve) => setTimeout(resolve, delay));
          return sendOfferWithRetry(offer, attempt + 1);
        } else {
          offerRetryAttemptsRef.current = 0; // Reset after max attempts
          throw err;
        }
      }
    },
    [sessionId, calculateBackoffDelay]
  );

  /**
   * Sends a WebRTC answer with retry logic and exponential backoff.
   *
   * Similar to sendOfferWithRetry, but for answers. Answers are sent in response
   * to offers received from the remote peer.
   *
   * @param answer - The RTCSessionDescriptionInit answer to send
   * @param targetSessionId - The session ID to send the answer to
   * @param attempt - The current retry attempt (defaults to 0 for first attempt)
   * @throws {Error} If peer connection is not available
   * @throws {Error} If WebSocket is not connected
   */
  const sendAnswerWithRetry = useCallback(
    async (
      answer: RTCSessionDescriptionInit,
      targetSessionId: string,
      attempt: number = 0
    ): Promise<void> => {
      if (!peerConnectionRef.current) {
        throw new Error('Peer connection not available');
      }

      if (!webSocketService.isConnected()) {
        throw new Error('WebSocket not connected');
      }

      try {
        const answerPayload = {
          sessionId: targetSessionId,
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
        };

        logger.debug(
          `Sending answer (attempt ${attempt + 1}/${API_CONSTANTS.WEBRTC_RETRY_MAX_ATTEMPTS})`,
          { sessionId: targetSessionId }
        );
        webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_ANSWER, answerPayload);
        logger.debug('Answer sent successfully', { sessionId: targetSessionId });
        answerRetryAttemptsRef.current = 0; // Reset on success
      } catch (err) {
        logger.error(`Error sending answer (attempt ${attempt + 1})`, {
          error: err,
          sessionId,
          attempt,
        });

        if (attempt < API_CONSTANTS.WEBRTC_RETRY_MAX_ATTEMPTS - 1) {
          const delay = calculateBackoffDelay(attempt);
          logger.debug(`Retrying answer in ${delay}ms...`, { sessionId, attempt, delay });
          answerRetryAttemptsRef.current = attempt + 1;

          await new Promise((resolve) => setTimeout(resolve, delay));
          return sendAnswerWithRetry(answer, targetSessionId, attempt + 1);
        } else {
          answerRetryAttemptsRef.current = 0; // Reset after max attempts
          throw err;
        }
      }
    },
    [calculateBackoffDelay, sessionId]
  );

  // Load WebRTC configuration from backend
  useEffect(() => {
    webrtcService
      .getConfig()
      .then((config) => {
        logger.debug('Loaded configuration from backend', { config, sessionId });
        setIceServers(config.iceServers as RTCIceServer[]);
      })
      .catch((error) => {
        logger.error('Error loading configuration, using defaults', { error, sessionId });
        // Keep default STUN servers as fallback
      });
    // iceServers is set inside this effect, so including it would cause infinite loop
  }, [sessionId]);

  // Update localStreamRef when localStream changes
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Assign local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    } else if (localVideoRef.current && !localStream) {
      localVideoRef.current.srcObject = null;
    }
  }, [localStream]);

  // Assign remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    } else if (remoteVideoRef.current && !remoteStream) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!sessionId) {
      // When sessionId is null, keep local stream but clean up peer connection
      // This allows showing local video while searching for a match
      setRemoteStream(null);
      // Stop metrics collector
      if (metricsCollectorRef.current) {
        void metricsCollectorRef.current.stop();
        metricsCollectorRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      // Don't stop local stream - keep it for preview while searching
      return;
    }

    // Cleanup previous connection if exists
    const previousConnection = peerConnectionRef.current;
    const previousCollector = metricsCollectorRef.current;
    // Clear any existing connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (previousCollector) {
      void previousCollector.stop();
      metricsCollectorRef.current = null;
    }
    if (previousConnection) {
      previousConnection.close();
      peerConnectionRef.current = null;
    }

    // Reset remote stream when session changes
    setRemoteStream(null);
    setError(null);

    // Create RTCPeerConnection with optimized configuration
    // These settings reduce connection setup time and improve reliability
    const configuration: RTCConfiguration = {
      iceServers:
        iceServers.length > 0
          ? iceServers
          : [
              // Fallback STUN servers if backend config hasn't loaded yet
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
      // Optimize connection configuration for faster setup and better performance
      bundlePolicy: 'max-bundle', // Reduce number of transports (saves resources)
      rtcpMuxPolicy: 'require', // Require RTCP multiplexing (reduces ports needed)
      iceCandidatePoolSize: 10, // Pre-gather ICE candidates (faster connection)
    };

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;

    // Set connection timeout: if connection doesn't establish in 30s, fail it
    // This prevents users from waiting indefinitely when connection is impossible
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
        setError(
          new Error('La conexión tardó demasiado en establecerse. Por favor, intenta nuevamente.')
        );
        setConnectionState('failed');
        // Close the connection
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
        setError(
          new Error('La conexión tardó demasiado en establecerse. Por favor, intenta nuevamente.')
        );
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
        setRemoteStream(event.streams[0]);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && sessionId) {
        logger.debug('ICE candidate generated', {
          candidate: event.candidate.candidate,
          sessionId,
        });
        // Verify socket is connected before emitting
        if (!webSocketService.isConnected()) {
          logger.warn('Socket not connected, cannot send ICE candidate', { sessionId });
          return;
        }
        try {
          const candidatePayload = {
            sessionId,
            candidate: event.candidate.toJSON(),
          };
          logger.debug('Socket connected, emitting ICE candidate', {
            sessionId,
            isConnected: webSocketService.isConnected(),
            eventName: WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE,
          });
          webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE, candidatePayload);
          logger.debug('ICE candidate emitted successfully', { sessionId });
        } catch (err) {
          logger.error('Error emitting ICE candidate', { error: err, sessionId });
        }
      } else if (!event.candidate) {
        logger.debug('ICE gathering complete', { sessionId });
      }
    };

    /**
     * Attempts to reconnect the WebRTC connection with exponential backoff.
     *
     * This function is called automatically when the connection fails or disconnects.
     * It recreates the peer connection and renegotiates the session.
     *
     * The exponential backoff prevents rapid reconnection attempts that could
     * overwhelm the server or user's network.
     */
    const attemptReconnection = (): void => {
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        logger.warn('Max reconnection attempts reached', {
          sessionId,
          maxAttempts: maxReconnectAttempts,
        });
        setError(new Error('No se pudo reconectar después de varios intentos'));
        return;
      }

      reconnectAttemptsRef.current += 1;
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);

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
            // Will retry on next state change if still disconnected
            return;
          }

          // Close existing connection
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }

          // Recreate peer connection with optimized configuration
          const reconnectConfiguration: RTCConfiguration = {
            iceServers:
              iceServers.length > 0
                ? iceServers
                : [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                  ],
            // Optimize connection configuration
            bundlePolicy: 'max-bundle', // Reduce number of transports
            rtcpMuxPolicy: 'require', // Require RTCP multiplexing
            iceCandidatePoolSize: 10, // Pre-gather ICE candidates
          };
          const newPeerConnection = new RTCPeerConnection(reconnectConfiguration);
          peerConnectionRef.current = newPeerConnection;

          // Re-add event handlers
          newPeerConnection.ontrack = (event) => {
            logger.debug('Remote track received on reconnection', { sessionId, event });
            if (event.streams[0]) {
              logger.debug('Setting remote stream on reconnection', { sessionId });
              setRemoteStream(event.streams[0]);
            }
          };

          newPeerConnection.onicecandidate = (event) => {
            if (event.candidate && sessionId) {
              logger.debug('ICE candidate generated on reconnection', { sessionId });
              if (!webSocketService.isConnected()) {
                logger.warn('Socket not connected, cannot send ICE candidate', { sessionId });
                return;
              }
              try {
                webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE, {
                  sessionId,
                  candidate: event.candidate.toJSON(),
                });
              } catch (err) {
                logger.error('Error emitting ICE candidate on reconnection', {
                  error: err,
                  sessionId,
                });
              }
            }
          };

          // Re-add tracks if local stream exists
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
              newPeerConnection.addTrack(track, localStreamRef.current!);
            });
          }

          // Reset room ready state to wait for new room ready event
          setRoomReady(false);

          // Restart video to renegotiate
          if (startVideoRef.current) {
            await startVideoRef.current();
          }
        } catch (err) {
          logger.error('Reconnection attempt failed', { error: err, sessionId });
          // Will retry on next state change if still disconnected
        }
      }, delay);
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
          reconnectAttemptsRef.current = 0; // Reset on successful connection
          // Clear connection timeout
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          // Clear any pending reconnect
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          break;
        case 'disconnected':
          setConnectionState('disconnected');
          // Attempt reconnection if we have a session
          if (sessionId && reconnectAttemptsRef.current < maxReconnectAttempts) {
            // Will be called after startVideo is defined
            setTimeout(() => {
              if (peerConnectionRef.current?.connectionState === 'disconnected') {
                attemptReconnection();
              }
            }, 1000);
          }
          break;
        case 'failed':
        case 'closed':
          setConnectionState('failed');
          setError(new Error(`WebRTC connection ${state}`));
          // Clear connection timeout
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          // Attempt reconnection if we have a session
          if (sessionId && reconnectAttemptsRef.current < maxReconnectAttempts) {
            setTimeout(() => {
              if (
                peerConnectionRef.current?.connectionState === 'failed' ||
                peerConnectionRef.current?.connectionState === 'closed'
              ) {
                attemptReconnection();
              }
            }, 1000);
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
                if (report.bytesReceived) {
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
          // Automatically attempt reconnection for disconnected state
          if (sessionId && reconnectAttemptsRef.current < maxReconnectAttempts) {
            logger.info('Connection disconnected, attempting automatic reconnection', {
              sessionId,
            });
            attemptReconnection();
          }
          break;
        case 'failed':
          setConnectionQuality('poor');
          setConnectionState('failed');
          setError(new Error(`ICE connection ${state}`));
          // Automatically attempt reconnection for failed state
          if (sessionId && reconnectAttemptsRef.current < maxReconnectAttempts) {
            logger.info('Connection failed, attempting automatic reconnection', { sessionId });
            attemptReconnection();
          }
          break;
        default:
          setConnectionQuality(null);
      }
    };

    /**
     * Handles incoming WebRTC offer from the remote peer.
     *
     * This function:
     * 1. Validates the offer data
     * 2. Checks signaling state to prevent race conditions
     * 3. Gets user media if not already available
     * 4. Sets remote description
     * 5. Creates and sends an answer
     *
     * Race condition prevention: If we already have a local offer, we ignore
     * the incoming offer to prevent both peers from trying to be the offerer.
     */
    const handleOffer = async (...args: unknown[]): Promise<void> => {
      logger.debug('handleOffer called', { sessionId, argsCount: args.length });
      const data = args[0] as {
        sessionId: string;
        offer: RTCSessionDescriptionInit;
      };

      if (!data || !data.sessionId || !data.offer) {
        logger.warn('Invalid offer data received', { sessionId, data });
        return;
      }

      if (data.sessionId !== sessionId) {
        logger.warn('Offer sessionId mismatch', { received: data.sessionId, expected: sessionId });
        return;
      }

      if (!peerConnectionRef.current) {
        logger.error('No peer connection available when offer received', { sessionId });
        return;
      }

      logger.debug('Offer received, checking for local stream', { sessionId });

      try {
        const peerConnection = peerConnectionRef.current;

        // Check signaling state to prevent race conditions
        // If we already have a local offer, both peers tried to be the offerer
        // In this case, we ignore the incoming offer and wait for our offer to be answered
        const signalingState = peerConnection.signalingState;
        logger.debug('Current signaling state', { sessionId, signalingState });

        if (signalingState === 'have-local-offer') {
          logger.warn(
            'Already have local offer, ignoring incoming offer to prevent race condition',
            { sessionId }
          );
          return;
        }

        if (signalingState === 'have-remote-offer') {
          logger.warn('Already have remote offer, ignoring duplicate offer', { sessionId });
          return;
        }

        // Auto-start video if local stream doesn't exist (use ref for current value)
        if (!localStreamRef.current) {
          logger.debug('No local stream, getting user media', { sessionId });
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });

            setLocalStream(stream);

            // Add tracks to peer connection before creating answer
            stream.getTracks().forEach((track) => {
              peerConnection.addTrack(track, stream);
              logger.debug('Added track', { sessionId, kind: track.kind, trackId: track.id });
            });
          } catch (mediaErr) {
            logger.error('Failed to get user media', { error: mediaErr, sessionId });
            setError(mediaErr instanceof Error ? mediaErr : new Error('Failed to get user media'));
            return;
          }
        } else {
          // Ensure tracks are added even if stream exists
          const existingTracks = peerConnection.getSenders();
          if (existingTracks.length === 0 && localStreamRef.current) {
            logger.debug('Adding existing stream tracks to peer connection', { sessionId });
            localStreamRef.current.getTracks().forEach((track) => {
              peerConnection.addTrack(track, localStreamRef.current!);
              logger.debug('Added existing track', {
                sessionId,
                kind: track.kind,
                trackId: track.id,
              });
            });
          }
        }

        // Double-check signaling state before setting remote description
        // The state might have changed during async operations (e.g., getting user media)
        if (peerConnection.signalingState !== 'stable') {
          logger.warn('Signaling state changed during setup', {
            sessionId,
            currentState: peerConnection.signalingState,
          });
          // If we now have a local offer (race condition), don't process this remote offer
          if (peerConnection.signalingState === 'have-local-offer') {
            logger.warn('Skipping remote offer, we already sent our offer', { sessionId });
            return;
          }
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        logger.debug('Remote description set, creating answer', { sessionId });

        // Process any pending ICE candidates now that remote description is set
        await processPendingIceCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        logger.debug('Local description set, sending answer', { sessionId });

        const answerDescription = peerConnection.localDescription;
        if (answerDescription) {
          try {
            await sendAnswerWithRetry(answerDescription, data.sessionId);
          } catch (err) {
            logger.error('Failed to send answer after retries', { error: err, sessionId });
            setError(err instanceof Error ? err : new Error('Error al enviar answer'));
          }
        }
      } catch (err) {
        logger.error('Error handling offer', { error: err, sessionId });
        setError(err instanceof Error ? err : new Error('WebRTC error'));
      }
    };

    /**
     * Handles incoming WebRTC answer from the remote peer.
     *
     * This function:
     * 1. Validates the answer data
     * 2. Sets the remote description from the answer
     * 3. Processes any pending ICE candidates
     *
     * The answer is sent in response to our offer, completing the WebRTC negotiation.
     */
    const handleAnswer = async (...args: unknown[]): Promise<void> => {
      logger.debug('handleAnswer called', { sessionId, argsCount: args.length });
      const data = args[0] as {
        sessionId: string;
        answer: RTCSessionDescriptionInit;
      };

      if (!data || !data.sessionId || !data.answer) {
        logger.warn('Invalid answer data received', { sessionId, data });
        return;
      }

      if (data.sessionId !== sessionId) {
        logger.warn('Answer sessionId mismatch', { received: data.sessionId, expected: sessionId });
        return;
      }

      if (!peerConnectionRef.current) {
        logger.error('No peer connection available when answer received', { sessionId });
        return;
      }

      logger.debug('Answer received, setting remote description', { sessionId });
      try {
        // Clear offer timeout since we received an answer
        if (offerTimeoutRef.current) {
          clearTimeout(offerTimeoutRef.current);
          offerTimeoutRef.current = null;
        }

        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        logger.debug('Remote description set from answer', { sessionId });

        // Process any pending ICE candidates now that remote description is set
        await processPendingIceCandidates();
      } catch (err) {
        logger.error('Error handling answer', { error: err, sessionId });
        setError(err instanceof Error ? err : new Error('WebRTC error'));
      }
    };

    /**
     * Processes the queue of pending ICE candidates.
     *
     * ICE candidates can arrive before the remote description is set.
     * This function processes all queued candidates once the remote description
     * is available, ensuring no candidates are lost during the negotiation phase.
     */
    const processPendingIceCandidates = async (): Promise<void> => {
      if (!peerConnectionRef.current || pendingIceCandidatesRef.current.length === 0) {
        return;
      }

      const remoteDescription = peerConnectionRef.current.remoteDescription;
      if (!remoteDescription) {
        // Still no remote description, keep candidates in queue
        return;
      }

      logger.debug(`Processing ${pendingIceCandidatesRef.current.length} pending ICE candidates`, {
        sessionId,
      });

      const candidates = [...pendingIceCandidatesRef.current];
      pendingIceCandidatesRef.current = []; // Clear queue

      for (const candidate of candidates) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          logger.debug('Pending ICE candidate added successfully', { sessionId });
        } catch (err) {
          logger.error('Error adding pending ICE candidate', { error: err, sessionId });
          if (err instanceof Error) {
            logger.warn('Pending ICE candidate error details', { sessionId, message: err.message });
          }
        }
      }
    };

    /**
     * Handles incoming ICE candidate from the remote peer.
     *
     * ICE candidates are network paths discovered during WebRTC negotiation.
     * If the remote description isn't set yet, candidates are queued and processed later.
     *
     * This queuing mechanism prevents errors when candidates arrive before
     * the remote description is set (which can happen due to network timing).
     */
    const handleIceCandidate = async (...args: unknown[]): Promise<void> => {
      const data = args[0] as {
        sessionId: string;
        candidate: RTCIceCandidateInit;
      };

      if (!data || !data.sessionId || !data.candidate) {
        logger.warn('Invalid ICE candidate data received', { sessionId, data });
        return;
      }

      if (data.sessionId !== sessionId) {
        logger.warn('ICE candidate sessionId mismatch', {
          received: data.sessionId,
          expected: sessionId,
        });
        return;
      }

      if (!peerConnectionRef.current) {
        logger.error('No peer connection available when ICE candidate received', { sessionId });
        return;
      }

      // Check if remote description is set
      // ICE candidates can only be added after remote description is set
      const remoteDescription = peerConnectionRef.current.remoteDescription;

      if (!remoteDescription) {
        // Remote description not set yet, queue the candidate for later processing
        // This prevents errors when candidates arrive before the offer/answer exchange completes
        logger.debug('Remote description not set, queueing ICE candidate', { sessionId });
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      // Remote description is set, add candidate immediately
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        logger.debug('ICE candidate added successfully', { sessionId });
      } catch (err) {
        logger.error('Error adding ICE candidate', { error: err, sessionId });
        // If it fails, try queueing it (might be a timing issue)
        if (err instanceof Error && err.message.includes('remote description')) {
          logger.debug('Queueing ICE candidate due to remote description error', { sessionId });
          pendingIceCandidatesRef.current.push(data.candidate);
        } else if (err instanceof Error) {
          logger.warn('ICE candidate error details', { sessionId, message: err.message });
        }
      }
    };

    // Listen for ROOM_READY event
    const handleRoomReady = (...args: unknown[]): void => {
      const data = args[0] as { sessionId: string };
      if (data.sessionId === sessionId) {
        logger.debug('Room ready event received', { sessionId });
        setRoomReady(true);
      }
    };

    // Register WebRTC event handlers with logging
    logger.debug('Registering WebRTC event handlers', { sessionId });
    webSocketService.on(WEBSOCKET_EVENTS.VIDEO_OFFER_RECEIVED, handleOffer);
    webSocketService.on(WEBSOCKET_EVENTS.VIDEO_ANSWER_RECEIVED, handleAnswer);
    webSocketService.on(WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE_RECEIVED, handleIceCandidate);
    webSocketService.on(WEBSOCKET_EVENTS.ROOM_READY, handleRoomReady);
    logger.debug('WebRTC event handlers registered', { sessionId });

    return () => {
      // Cleanup on unmount or sessionId change
      if (metricsCollectorRef.current) {
        logger.debug('Stopping metrics collector in cleanup', { sessionId });
        void metricsCollectorRef.current.stop();
        metricsCollectorRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Clear pending ICE candidates queue
      pendingIceCandidatesRef.current = [];
      reconnectAttemptsRef.current = 0;
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      webSocketService.off(WEBSOCKET_EVENTS.VIDEO_OFFER_RECEIVED, handleOffer);
      webSocketService.off(WEBSOCKET_EVENTS.VIDEO_ANSWER_RECEIVED, handleAnswer);
      webSocketService.off(WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE_RECEIVED, handleIceCandidate);
      webSocketService.off(WEBSOCKET_EVENTS.ROOM_READY, handleRoomReady);

      // Clear any pending timeouts
      if (offerTimeoutRef.current) {
        clearTimeout(offerTimeoutRef.current);
        offerTimeoutRef.current = null;
      }
    };
    // iceServers is used indirectly through attemptReconnection, but including it would cause
    // the effect to re-run every time iceServers changes, which is not desired.
    // The effect should only run when sessionId or sendAnswerWithRetry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sendAnswerWithRetry]);

  const startLocalVideo = useCallback(async (): Promise<void> => {
    // Prevent multiple simultaneous calls
    if (isStartingVideoRef.current) {
      logger.debug('Already starting video, skipping duplicate call', { sessionId: null });
      return;
    }

    isStartingVideoRef.current = true;

    try {
      // Stop existing stream if any
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true,
        audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true,
      });

      setLocalStream(stream);
      logger.debug('Local video started (preview mode, no session)');
    } catch (err) {
      logger.error('Error starting local video', { error: err });
      setError(err instanceof Error ? err : new Error('Failed to start local video'));
    } finally {
      isStartingVideoRef.current = false;
    }
  }, [localStream, selectedVideoDeviceId, selectedAudioDeviceId]);

  const startVideo = useCallback(async (): Promise<void> => {
    // Prevent multiple simultaneous calls
    if (isStartingVideoRef.current) {
      logger.debug('Already starting video, skipping duplicate call', { sessionId });
      return;
    }

    isStartingVideoRef.current = true;
    setConnectionState('connecting');
    setConnectionQuality(null);

    try {
      // Verify sessionId is set
      if (!sessionId) {
        setError(new Error('Session ID is required to start video'));
        isStartingVideoRef.current = false;
        return;
      }

      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) {
        setError(new Error('Peer connection not initialized'));
        isStartingVideoRef.current = false;
        return;
      }

      // Check signaling state before creating offer
      const signalingState = peerConnection.signalingState;
      logger.debug('Current signaling state before starting', { sessionId, signalingState });

      // If we already have a local offer, don't create another one
      if (signalingState === 'have-local-offer') {
        logger.debug('Already have local offer, skipping offer creation', { sessionId });
        isStartingVideoRef.current = false;
        return;
      }

      // If we have a remote offer, we should wait for handleOffer to process it
      if (signalingState === 'have-remote-offer') {
        logger.debug('Already have remote offer, waiting for answer creation', { sessionId });
        isStartingVideoRef.current = false;
        return;
      }

      // If signaling is not stable, something is in progress
      if (signalingState !== 'stable') {
        logger.warn('Signaling state is not stable, waiting for negotiation to complete', {
          sessionId,
          signalingState,
        });
        isStartingVideoRef.current = false;
        return;
      }

      // Stop existing stream if any
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true,
        audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true,
      });

      setLocalStream(stream);

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
        logger.debug('Added track to peer connection', {
          sessionId,
          kind: track.kind,
          trackId: track.id,
        });
      });

      // Verify tracks were added
      const senders = peerConnection.getSenders();
      logger.debug('Number of senders after adding tracks', { sessionId, count: senders.length });
      if (senders.length === 0) {
        throw new Error('No tracks were added to peer connection');
      }

      // Wait for room to be ready before sending offer
      // This ensures both users are in the room
      let waitAttempts = 0;
      const maxWaitAttempts = 20; // 10 seconds max wait (20 * 500ms)

      while (!roomReady && waitAttempts < maxWaitAttempts) {
        logger.debug(`Waiting for room ready`, {
          sessionId,
          attempt: waitAttempts + 1,
          maxAttempts: maxWaitAttempts,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        waitAttempts++;
      }

      if (!roomReady) {
        logger.warn('Room ready timeout, proceeding anyway (partner may still be connecting)', {
          sessionId,
        });
      } else {
        logger.debug('Room is ready, proceeding with offer creation', { sessionId });
      }

      // Random delay to prevent both users from creating offers simultaneously
      // This helps avoid race conditions where both users try to be the offerer
      const randomDelay = 500 + Math.random() * 1000; // 500-1500ms
      logger.debug(
        `Waiting ${Math.round(randomDelay)}ms before creating offer to avoid race condition`,
        { sessionId, delay: Math.round(randomDelay) }
      );
      await new Promise((resolve) => setTimeout(resolve, randomDelay));

      // Verify socket is connected before sending offer
      if (!webSocketService.isConnected()) {
        logger.error('Socket not connected, cannot send offer', { sessionId });
        setError(new Error('WebSocket no está conectado'));
        isStartingVideoRef.current = false;
        return;
      }

      // Double-check signaling state before creating offer (may have changed during delay)
      const currentSignalingState = peerConnection.signalingState;
      if (currentSignalingState !== 'stable') {
        logger.warn('Signaling state changed during delay, skipping offer creation', {
          sessionId,
          currentState: currentSignalingState,
        });
        isStartingVideoRef.current = false;
        return;
      }

      // Create and send offer
      logger.debug('Creating offer', { sessionId });
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      logger.debug('Local description set, sending offer', { sessionId });

      const offerDescription = peerConnection.localDescription;
      if (offerDescription) {
        logger.debug('Sending offer', {
          sessionId,
          isConnected: webSocketService.isConnected(),
          eventName: WEBSOCKET_EVENTS.VIDEO_OFFER,
          offerType: offerDescription.type,
          sdpLength: offerDescription.sdp?.length || 0,
        });

        try {
          await sendOfferWithRetry(offerDescription);

          // Set timeout to retry if no answer received (using exponential backoff)
          offerTimeoutRef.current = setTimeout(() => {
            if (peerConnectionRef.current?.signalingState === 'have-local-offer') {
              logger.warn('No answer received after 10 seconds, connection may have failed', {
                sessionId,
              });
              // Check if we should retry
              if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                logger.info('Retrying offer after timeout', { sessionId });
                // Reset signaling state and retry
                if (peerConnectionRef.current) {
                  try {
                    // Create a new offer to retry
                    peerConnectionRef.current
                      .createOffer()
                      .then(async (newOffer) => {
                        await peerConnectionRef.current!.setLocalDescription(newOffer);
                        if (peerConnectionRef.current?.localDescription) {
                          // Use retry logic for the retry attempt
                          sendOfferWithRetry(peerConnectionRef.current.localDescription).catch(
                            (err) => {
                              logger.error('Error retrying offer', { error: err, sessionId });
                            }
                          );
                        }
                      })
                      .catch((err) => {
                        logger.error('Error creating retry offer', { error: err, sessionId });
                      });
                  } catch (err) {
                    logger.error('Error retrying offer', { error: err, sessionId });
                  }
                }
              } else {
                logger.error('Max retry attempts reached, giving up', { sessionId });
                setError(new Error('No se pudo establecer conexión WebRTC'));
              }
            }
          }, 10000);
        } catch (err) {
          logger.error('Failed to send offer after retries', { error: err, sessionId });
          setError(err instanceof Error ? err : new Error('Error al enviar offer'));
        }
      }
    } catch (err) {
      logger.error('Error in startVideo', { error: err, sessionId });
      setError(err instanceof Error ? err : new Error('Failed to start video'));
    } finally {
      isStartingVideoRef.current = false;
    }
  }, [
    sessionId,
    localStream,
    roomReady,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    sendOfferWithRetry,
  ]);

  // Store startVideo in ref for reconnection
  useEffect(() => {
    startVideoRef.current = startVideo;
  }, [startVideo]);

  const stopVideo = useCallback((): void => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (sessionId) {
      webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_END, { sessionId });
    }
  }, [localStream, sessionId]);

  const toggleVideo = async (): Promise<void> => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    } else if (!isVideoEnabled) {
      await startVideo();
    }
  };

  const toggleAudio = async (): Promise<void> => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mediaDevices: MediaDevice[] = devices
        .filter((device) => device.kind === 'videoinput' || device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label:
            device.label || `Dispositivo ${device.kind === 'videoinput' ? 'de video' : 'de audio'}`,
          kind: device.kind as 'videoinput' | 'audioinput',
        }));

      setAvailableDevices(mediaDevices);

      // Separate physical and virtual cameras
      const videoDevices = mediaDevices.filter((d) => d.kind === 'videoinput');
      const physicalCameras = videoDevices.filter((d) => !isVirtualCamera(d.label));
      const virtualCameras = videoDevices.filter((d) => isVirtualCamera(d.label));

      logger.debug('Found video devices', {
        total: videoDevices.length,
        physical: physicalCameras.length,
        virtual: virtualCameras.length,
        physicalDevices: physicalCameras.map((d) => d.label),
        virtualDevices: virtualCameras.map((d) => d.label),
      });

      // Set default video device if not already set
      // Prioritize physical cameras over virtual ones
      if (!selectedVideoDeviceId) {
        let defaultVideo: MediaDevice | undefined;

        // First, try to find a physical camera
        if (physicalCameras.length > 0) {
          defaultVideo = physicalCameras[0];
          if (defaultVideo) {
            logger.debug('Selected physical camera as default', { label: defaultVideo.label });
          }
        }
        // If no physical cameras, fall back to virtual cameras
        else if (virtualCameras.length > 0) {
          defaultVideo = virtualCameras[0];
          if (defaultVideo) {
            logger.debug('No physical cameras found, selected virtual camera as default', {
              label: defaultVideo.label,
            });
          }
        }
        // If no cameras at all, use the first video device found
        else if (videoDevices.length > 0) {
          defaultVideo = videoDevices[0];
          if (defaultVideo) {
            logger.debug('Selected first available video device as default', {
              label: defaultVideo.label,
            });
          }
        }

        if (defaultVideo) {
          setSelectedVideoDeviceId(defaultVideo.deviceId);
        }
      }

      // Set default audio device if not already set
      if (!selectedAudioDeviceId) {
        const audioDevices = mediaDevices.filter((d) => d.kind === 'audioinput');
        const defaultAudio = audioDevices.find((d) => d.kind === 'audioinput');
        if (defaultAudio) {
          setSelectedAudioDeviceId(defaultAudio.deviceId);
        }
      }
    } catch (err) {
      logger.error('Error enumerating devices', { error: err });
    }
  }, [selectedVideoDeviceId, selectedAudioDeviceId]);

  const changeVideoDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      setSelectedVideoDeviceId(deviceId);
      if (localStream && peerConnectionRef.current) {
        try {
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.stop();
          }

          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
            audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true,
          });

          const newVideoTrack = newStream.getVideoTracks()[0];
          if (newVideoTrack && peerConnectionRef.current) {
            const sender = peerConnectionRef.current
              .getSenders()
              .find((s) => s.track && s.track.kind === 'video');
            if (sender) {
              await sender.replaceTrack(newVideoTrack);
            }

            // Update local stream
            if (localStream && videoTrack) {
              localStream.removeTrack(videoTrack);
              localStream.addTrack(newVideoTrack);
            } else {
              setLocalStream(newStream);
            }

            // Stop unused audio track from new stream if we already have one
            if (localStream) {
              newStream.getAudioTracks().forEach((track) => track.stop());
            }
          }
        } catch (err) {
          logger.error('Error changing video device', { error: err, deviceId });
          setError(err instanceof Error ? err : new Error('Failed to change video device'));
        }
      }
    },
    [localStream, selectedAudioDeviceId]
  );

  const changeAudioDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      setSelectedAudioDeviceId(deviceId);
      if (localStream && peerConnectionRef.current) {
        try {
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.stop();
          }

          const newStream = await navigator.mediaDevices.getUserMedia({
            video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true,
            audio: { deviceId: { exact: deviceId } },
          });

          const newAudioTrack = newStream.getAudioTracks()[0];
          if (newAudioTrack && peerConnectionRef.current) {
            const sender = peerConnectionRef.current
              .getSenders()
              .find((s) => s.track && s.track.kind === 'audio');
            if (sender) {
              await sender.replaceTrack(newAudioTrack);
            }

            // Update local stream
            if (localStream && audioTrack) {
              localStream.removeTrack(audioTrack);
              localStream.addTrack(newAudioTrack);
            } else {
              setLocalStream(newStream);
            }

            // Stop unused video track from new stream if we already have one
            if (localStream) {
              newStream.getVideoTracks().forEach((track) => track.stop());
            }
          }
        } catch (err) {
          logger.error('Error changing audio device', { error: err, deviceId });
          setError(err instanceof Error ? err : new Error('Failed to change audio device'));
        }
      }
    },
    [localStream, selectedVideoDeviceId]
  );

  // Refresh devices on mount and when permissions are granted
  useEffect(() => {
    refreshDevices().catch((err) => {
      logger.error('Error refreshing devices', { error: err });
    });
  }, [refreshDevices]);

  // ICE restart on network changes
  useEffect(() => {
    if (!sessionId || !peerConnectionRef.current) {
      return;
    }

    const performIceRestart = async (): Promise<void> => {
      const now = Date.now();
      // Throttle ICE restarts - don't restart more than once every 5 seconds
      if (now - lastNetworkChangeRef.current < 5000) {
        logger.debug('ICE restart throttled', { sessionId });
        return;
      }
      lastNetworkChangeRef.current = now;

      const peerConnection = peerConnectionRef.current;
      if (!peerConnection || peerConnection.connectionState === 'closed') {
        return;
      }

      // Only restart if connection is active but having issues
      if (
        peerConnection.connectionState === 'connected' ||
        peerConnection.connectionState === 'connecting'
      ) {
        logger.info('Performing ICE restart due to network change', {
          sessionId,
          connectionState: peerConnection.connectionState,
          iceConnectionState: peerConnection.iceConnectionState,
        });

        try {
          // Create new offer with iceRestart: true
          const offer = await peerConnection.createOffer({ iceRestart: true });
          await peerConnection.setLocalDescription(offer);

          // Send offer via WebSocket
          if (webSocketService.isConnected()) {
            const offerPayload = {
              sessionId,
              offer: {
                type: offer.type,
                sdp: offer.sdp,
              },
            };
            webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_OFFER, offerPayload);
            logger.debug('ICE restart offer sent', { sessionId });
          } else {
            logger.warn('Cannot send ICE restart offer: WebSocket not connected', { sessionId });
          }
        } catch (error) {
          logger.error('Error performing ICE restart', { error, sessionId });
        }
      }
    };

    // Handle online/offline events
    const handleOnline = (): void => {
      logger.info('Network online event detected', { sessionId });
      // Clear any existing timeout
      if (iceRestartTimeoutRef.current) {
        clearTimeout(iceRestartTimeoutRef.current);
      }
      // Wait a bit before restarting to ensure network is stable
      iceRestartTimeoutRef.current = setTimeout(() => {
        void performIceRestart();
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
      const connection =
        (navigator as { connection?: { type?: string; effectiveType?: string } }).connection ||
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
          void performIceRestart();
        }, ICE_RESTART_DELAY_MS);
      }
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Add connection change listener if available
    const connection =
      (
        navigator as {
          connection?: { addEventListener?: (event: string, handler: () => void) => void };
        }
      ).connection ||
      (
        navigator as {
          mozConnection?: { addEventListener?: (event: string, handler: () => void) => void };
        }
      ).mozConnection ||
      (
        navigator as {
          webkitConnection?: { addEventListener?: (event: string, handler: () => void) => void };
        }
      ).webkitConnection;

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
      if (connectionWithRemove && typeof connectionWithRemove.removeEventListener === 'function') {
        connectionWithRemove.removeEventListener('change', handleConnectionChange);
      }
      if (iceRestartTimeoutRef.current) {
        clearTimeout(iceRestartTimeoutRef.current);
        iceRestartTimeoutRef.current = null;
      }
    };
  }, [sessionId, iceServers]);

  return {
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    isVideoEnabled,
    isAudioEnabled,
    connectionState,
    connectionQuality,
    availableDevices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    startVideo,
    startLocalVideo,
    stopVideo,
    toggleVideo,
    toggleAudio,
    changeVideoDevice,
    changeAudioDevice,
    refreshDevices,
    error,
  };
}
