import { useRef, useEffect, useState, useCallback } from 'react';
import { WEBSOCKET_EVENTS, API_CONSTANTS } from '@config/constants';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { webrtcService } from '@infrastructure/api/webrtc-service';
import { logger } from '@infrastructure/logging/frontend-logger';
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
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    // Fallback por defecto mientras carga la configuración
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isStartingVideoRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startVideoRef = useRef<(() => Promise<void>) | null>(null);
  const offerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const maxReconnectAttempts = 5;
  const offerRetryAttemptsRef = useRef<number>(0);
  const answerRetryAttemptsRef = useRef<number>(0);
  const lastOfferTimeRef = useRef<number>(0);
  const RATE_LIMIT_COOLDOWN_MS = 13000; // 13 segundos entre ofertas (5 por minuto = 12s mínimo, agregamos 1s de margen)

  /**
   * Calculate exponential backoff delay
   */
  const calculateBackoffDelay = useCallback((attempt: number): number => {
    const delay = API_CONSTANTS.WEBRTC_RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
    return Math.min(delay, API_CONSTANTS.WEBRTC_RETRY_MAX_DELAY_MS);
  }, []);

  /**
   * Send offer with retry logic and exponential backoff
   * Includes rate limiting to prevent exceeding server limits (5 offers per minute)
   */
  const sendOfferWithRetry = useCallback(
    async (offer: RTCSessionDescriptionInit, attempt: number = 0): Promise<void> => {
      if (!sessionId || !peerConnectionRef.current) {
        throw new Error('Session ID or peer connection not available');
      }

      if (!webSocketService.isConnected()) {
        throw new Error('WebSocket not connected');
      }

      // Rate limiting: Check if enough time has passed since last offer
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
   * Send answer with retry logic and exponential backoff
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      // Don't stop local stream - keep it for preview while searching
      return;
    }

    // Cleanup previous connection if exists
    const previousConnection = peerConnectionRef.current;
    if (previousConnection) {
      previousConnection.close();
      peerConnectionRef.current = null;
    }

    // Reset remote stream when session changes
    setRemoteStream(null);
    setError(null);

    // Create RTCPeerConnection with optimized configuration from backend
    const configuration: RTCConfiguration = {
      iceServers:
        iceServers.length > 0
          ? iceServers
          : [
              // Fallback si aún no se ha cargado la configuración
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

    // Reconnection function with exponential backoff
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

    // Listen for WebRTC events
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

        // Check signaling state - if we already have a local offer, we're in a race condition
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

        // Verify signaling state is still stable before setting remote description
        if (peerConnection.signalingState !== 'stable') {
          logger.warn('Signaling state changed during setup', {
            sessionId,
            currentState: peerConnection.signalingState,
          });
          // If we have a local offer, we should not process this remote offer
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
     * Process pending ICE candidates queue
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
      const remoteDescription = peerConnectionRef.current.remoteDescription;

      if (!remoteDescription) {
        // Remote description not set yet, queue the candidate
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, localStream, roomReady, selectedVideoDeviceId, selectedAudioDeviceId]);

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
