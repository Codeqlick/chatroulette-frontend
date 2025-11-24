import { useRef, useEffect, useState, useCallback } from 'react';
import { WEBSOCKET_EVENTS } from '@config/constants';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { webrtcService } from '@infrastructure/api/webrtc-service';
import type {
  ConnectionState,
  ConnectionQuality,
} from '../components/ConnectionStatus';

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
  const maxReconnectAttempts = 5;

  // Load WebRTC configuration from backend
  useEffect(() => {
    webrtcService
      .getConfig()
      .then((config) => {
        console.log('[WebRTC] Loaded configuration from backend:', config);
        setIceServers(config.iceServers as RTCIceServer[]);
      })
      .catch((error) => {
        console.error('[WebRTC] Error loading configuration, using defaults:', error);
        // Keep default STUN servers as fallback
      });
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
      // Reset streams when sessionId is null
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }
      setRemoteStream(null);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
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

    // Create RTCPeerConnection with configuration from backend
    const configuration: RTCConfiguration = {
      iceServers: iceServers.length > 0 ? iceServers : [
        // Fallback si aún no se ha cargado la configuración
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Remote track received', event);
      if (event.streams[0]) {
        console.log('[WebRTC] Setting remote stream');
        setRemoteStream(event.streams[0]);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && sessionId) {
        console.log('[WebRTC] ICE candidate generated:', event.candidate.candidate);
        // Verify socket is connected before emitting
        if (!webSocketService.isConnected()) {
          console.warn('[WebRTC] Socket not connected, cannot send ICE candidate');
          return;
        }
        try {
          const candidatePayload = {
          sessionId,
          candidate: event.candidate.toJSON(),
          };
          console.log('[WebRTC] Socket connected:', webSocketService.isConnected());
          console.log('[WebRTC] Event name:', WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE);
          console.log('[WebRTC] Emitting ICE candidate for session:', sessionId);
          webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE, candidatePayload);
          console.log('[WebRTC] ICE candidate emitted successfully');
        } catch (err) {
          console.error('[WebRTC] Error emitting ICE candidate:', err);
        }
      } else if (!event.candidate) {
        console.log('[WebRTC] ICE gathering complete');
      }
    };

    // Reconnection function with exponential backoff
    const attemptReconnection = (): void => {
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.log('[WebRTC] Max reconnection attempts reached');
        setError(new Error('No se pudo reconectar después de varios intentos'));
        return;
      }

      reconnectAttemptsRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000); // Max 30s
      
      console.log(
        `[WebRTC] Attempting reconnection ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms`
      );

      reconnectTimeoutRef.current = setTimeout(async () => {
        try {
          // Verify socket is connected before reconnecting
          if (!webSocketService.isConnected()) {
            console.warn('[WebRTC] Socket not connected, cannot reconnect WebRTC');
            // Will retry on next state change if still disconnected
            return;
          }

          // Close existing connection
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }

          // Recreate peer connection with current configuration
          const reconnectConfiguration: RTCConfiguration = {
            iceServers: iceServers.length > 0 ? iceServers : [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          };
          const newPeerConnection = new RTCPeerConnection(reconnectConfiguration);
          peerConnectionRef.current = newPeerConnection;

          // Re-add event handlers
          newPeerConnection.ontrack = (event) => {
            console.log('[WebRTC] Remote track received on reconnection', event);
            if (event.streams[0]) {
              console.log('[WebRTC] Setting remote stream on reconnection');
              setRemoteStream(event.streams[0]);
            }
          };

          newPeerConnection.onicecandidate = (event) => {
            if (event.candidate && sessionId) {
              console.log('[WebRTC] ICE candidate generated on reconnection');
              if (!webSocketService.isConnected()) {
                console.warn('[WebRTC] Socket not connected, cannot send ICE candidate');
                return;
              }
              try {
                webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE, {
                  sessionId,
                  candidate: event.candidate.toJSON(),
                });
              } catch (err) {
                console.error('[WebRTC] Error emitting ICE candidate on reconnection:', err);
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
          console.error('[WebRTC] Reconnection attempt failed:', err);
          // Will retry on next state change if still disconnected
        }
      }, delay);
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log('[WebRTC] Connection state changed:', state);
      
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
              if (peerConnectionRef.current?.connectionState === 'failed' || 
                  peerConnectionRef.current?.connectionState === 'closed') {
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
      console.log('[WebRTC] ICE connection state changed:', state);
      
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
        case 'failed':
          setConnectionQuality('poor');
          setError(new Error(`ICE connection ${state}`));
          break;
        default:
          setConnectionQuality(null);
      }
    };

    // Listen for WebRTC events
    const handleOffer = async (...args: unknown[]): Promise<void> => {
      console.log('[WebRTC] handleOffer called with args:', args);
      const data = args[0] as {
        sessionId: string;
        offer: RTCSessionDescriptionInit;
      };
      
      if (!data || !data.sessionId || !data.offer) {
        console.warn('[WebRTC] Invalid offer data received:', data);
        return;
      }

      if (data.sessionId !== sessionId) {
        console.warn('[WebRTC] Offer sessionId mismatch:', data.sessionId, 'expected:', sessionId);
        return;
      }
      
      if (!peerConnectionRef.current) {
        console.error('[WebRTC] No peer connection available when offer received');
        return;
      }

      console.log('[WebRTC] Offer received for session:', sessionId, 'checking for local stream...');

      try {
        const peerConnection = peerConnectionRef.current;

        // Check signaling state - if we already have a local offer, we're in a race condition
        const signalingState = peerConnection.signalingState;
        console.log('[WebRTC] Current signaling state:', signalingState);

        if (signalingState === 'have-local-offer') {
          console.warn(
            '[WebRTC] Already have local offer, ignoring incoming offer to prevent race condition'
          );
          return;
        }

        if (signalingState === 'have-remote-offer') {
          console.warn(
            '[WebRTC] Already have remote offer, ignoring duplicate offer'
          );
          return;
        }

        // Auto-start video if local stream doesn't exist (use ref for current value)
        if (!localStreamRef.current) {
          console.log('[WebRTC] No local stream, getting user media...');
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });

            setLocalStream(stream);

            // Add tracks to peer connection before creating answer
            stream.getTracks().forEach((track) => {
              peerConnection.addTrack(track, stream);
              console.log('[WebRTC] Added track:', track.kind, track.id);
            });
          } catch (mediaErr) {
            console.error('[WebRTC] Failed to get user media:', mediaErr);
            setError(
              mediaErr instanceof Error
                ? mediaErr
                : new Error('Failed to get user media')
            );
            return;
          }
        } else {
          // Ensure tracks are added even if stream exists
          const existingTracks = peerConnection.getSenders();
          if (existingTracks.length === 0 && localStreamRef.current) {
            console.log('[WebRTC] Adding existing stream tracks to peer connection');
            localStreamRef.current.getTracks().forEach((track) => {
              peerConnection.addTrack(track, localStreamRef.current!);
              console.log('[WebRTC] Added existing track:', track.kind, track.id);
            });
          }
        }

        // Verify signaling state is still stable before setting remote description
        if (peerConnection.signalingState !== 'stable') {
          console.warn(
            '[WebRTC] Signaling state changed during setup, current state:',
            peerConnection.signalingState
          );
          // If we have a local offer, we should not process this remote offer
          if (peerConnection.signalingState === 'have-local-offer') {
            console.warn('[WebRTC] Skipping remote offer, we already sent our offer');
            return;
          }
        }

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );
        console.log('[WebRTC] Remote description set, creating answer...');

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('[WebRTC] Local description set, sending answer...');

        const answerDescription = peerConnection.localDescription;
        if (answerDescription) {
          // Verify socket is connected before emitting
          if (!webSocketService.isConnected()) {
            console.error('[WebRTC] Socket not connected, cannot send answer');
            setError(new Error('WebSocket no está conectado'));
            return;
          }
          
          try {
            const answerPayload = {
            sessionId: data.sessionId,
            answer: {
              type: answerDescription.type,
              sdp: answerDescription.sdp,
            },
            };
            console.log('[WebRTC] Socket connected:', webSocketService.isConnected());
            console.log('[WebRTC] Event name:', WEBSOCKET_EVENTS.VIDEO_ANSWER);
            console.log('[WebRTC] Emitting answer with payload:', { sessionId: answerPayload.sessionId, answerType: answerPayload.answer.type });
            webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_ANSWER, answerPayload);
          console.log('[WebRTC] Answer sent successfully');
          } catch (err) {
            console.error('[WebRTC] Error emitting answer:', err);
            setError(err instanceof Error ? err : new Error('Error al enviar answer'));
          }
        }
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
        setError(err instanceof Error ? err : new Error('WebRTC error'));
      }
    };

    const handleAnswer = async (...args: unknown[]): Promise<void> => {
      console.log('[WebRTC] handleAnswer called with args:', args);
      const data = args[0] as {
        sessionId: string;
        answer: RTCSessionDescriptionInit;
      };
      
      if (!data || !data.sessionId || !data.answer) {
        console.warn('[WebRTC] Invalid answer data received:', data);
        return;
      }

      if (data.sessionId !== sessionId) {
        console.warn('[WebRTC] Answer sessionId mismatch:', data.sessionId, 'expected:', sessionId);
        return;
      }
      
      if (!peerConnectionRef.current) {
        console.error('[WebRTC] No peer connection available when answer received');
        return;
      }

      console.log('[WebRTC] Answer received for session:', sessionId, 'setting remote description...');
      try {
        // Clear offer timeout since we received an answer
        if (offerTimeoutRef.current) {
          clearTimeout(offerTimeoutRef.current);
          offerTimeoutRef.current = null;
        }
        
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        console.log('[WebRTC] Remote description set from answer');
      } catch (err) {
        console.error('[WebRTC] Error handling answer:', err);
        setError(err instanceof Error ? err : new Error('WebRTC error'));
      }
    };

    const handleIceCandidate = async (...args: unknown[]): Promise<void> => {
      const data = args[0] as {
        sessionId: string;
        candidate: RTCIceCandidateInit;
      };
      
      if (!data || !data.sessionId || !data.candidate) {
        console.warn('[WebRTC] Invalid ICE candidate data received:', data);
        return;
      }
      
      if (data.sessionId !== sessionId) {
        console.warn('[WebRTC] ICE candidate sessionId mismatch:', data.sessionId, 'expected:', sessionId);
        return;
      }
      
      if (!peerConnectionRef.current) {
        console.error('[WebRTC] No peer connection available when ICE candidate received');
        return;
      }

      try {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
        console.log('[WebRTC] ICE candidate added successfully');
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
        // Don't set error for ICE candidate failures, they're often non-critical
        // But log for debugging
        if (err instanceof Error) {
          console.warn('[WebRTC] ICE candidate error details:', err.message);
        }
      }
    };

    // Listen for ROOM_READY event
    const handleRoomReady = (...args: unknown[]): void => {
      const data = args[0] as { sessionId: string };
      if (data.sessionId === sessionId) {
        console.log('[WebRTC] Room ready event received for session:', sessionId);
        setRoomReady(true);
      }
    };

    // Register WebRTC event handlers with logging
    console.log('[WebRTC] Registering WebRTC event handlers for session:', sessionId);
    webSocketService.on(WEBSOCKET_EVENTS.VIDEO_OFFER_RECEIVED, handleOffer);
    webSocketService.on(WEBSOCKET_EVENTS.VIDEO_ANSWER_RECEIVED, handleAnswer);
    webSocketService.on(
      WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE_RECEIVED,
      handleIceCandidate
    );
    webSocketService.on(WEBSOCKET_EVENTS.ROOM_READY, handleRoomReady);
    console.log('[WebRTC] WebRTC event handlers registered');

    return () => {
      // Cleanup on unmount or sessionId change
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      webSocketService.off(WEBSOCKET_EVENTS.VIDEO_OFFER_RECEIVED, handleOffer);
      webSocketService.off(WEBSOCKET_EVENTS.VIDEO_ANSWER_RECEIVED, handleAnswer);
      webSocketService.off(
        WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE_RECEIVED,
        handleIceCandidate
      );
      webSocketService.off(WEBSOCKET_EVENTS.ROOM_READY, handleRoomReady);
      
      // Clear any pending timeouts
      if (offerTimeoutRef.current) {
        clearTimeout(offerTimeoutRef.current);
        offerTimeoutRef.current = null;
      }
    };
  }, [sessionId]);

  const startVideo = useCallback(async (): Promise<void> => {
    // Prevent multiple simultaneous calls
    if (isStartingVideoRef.current) {
      console.log('[WebRTC] Already starting video, skipping duplicate call');
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
      console.log('[WebRTC] Current signaling state before starting:', signalingState);

      // If we already have a local offer, don't create another one
      if (signalingState === 'have-local-offer') {
        console.log('[WebRTC] Already have local offer, skipping offer creation');
        isStartingVideoRef.current = false;
        return;
      }

      // If we have a remote offer, we should wait for handleOffer to process it
      if (signalingState === 'have-remote-offer') {
        console.log('[WebRTC] Already have remote offer, waiting for answer creation');
        isStartingVideoRef.current = false;
        return;
      }

      // If signaling is not stable, something is in progress
      if (signalingState !== 'stable') {
        console.warn(
          '[WebRTC] Signaling state is not stable:',
          signalingState,
          '- waiting for negotiation to complete'
        );
        isStartingVideoRef.current = false;
        return;
      }

      // Stop existing stream if any
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDeviceId
          ? { deviceId: { exact: selectedVideoDeviceId } }
          : true,
        audio: selectedAudioDeviceId
          ? { deviceId: { exact: selectedAudioDeviceId } }
          : true,
      });

      setLocalStream(stream);

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
        console.log('[WebRTC] Added track to peer connection:', track.kind, track.id);
      });

      // Verify tracks were added
      const senders = peerConnection.getSenders();
      console.log('[WebRTC] Number of senders after adding tracks:', senders.length);
      if (senders.length === 0) {
        throw new Error('No tracks were added to peer connection');
      }

      // Wait for room to be ready before sending offer
      // This ensures both users are in the room
      let waitAttempts = 0;
      const maxWaitAttempts = 20; // 10 seconds max wait (20 * 500ms)
      
      while (!roomReady && waitAttempts < maxWaitAttempts) {
        console.log(`[WebRTC] Waiting for room ready... (attempt ${waitAttempts + 1}/${maxWaitAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, 500));
        waitAttempts++;
      }

      if (!roomReady) {
        console.warn('[WebRTC] Room ready timeout, proceeding anyway (partner may still be connecting)');
      } else {
        console.log('[WebRTC] Room is ready, proceeding with offer creation');
      }

      // Additional delay to ensure both users are synchronized
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify socket is connected before sending offer
      if (!webSocketService.isConnected()) {
        console.error('[WebRTC] Socket not connected, cannot send offer');
        setError(new Error('WebSocket no está conectado'));
        isStartingVideoRef.current = false;
        return;
      }

      // Double-check signaling state before creating offer (may have changed during delay)
      const currentSignalingState = peerConnection.signalingState;
      if (currentSignalingState !== 'stable') {
        console.warn(
          '[WebRTC] Signaling state changed during delay:',
          currentSignalingState,
          '- skipping offer creation'
        );
        isStartingVideoRef.current = false;
        return;
      }

      // Create and send offer
      console.log('[WebRTC] Creating offer...');
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      console.log('[WebRTC] Local description set, sending offer...');

      const offerDescription = peerConnection.localDescription;
      if (offerDescription) {
        console.log('[WebRTC] Sending offer for session:', sessionId);
        console.log('[WebRTC] Socket connected:', webSocketService.isConnected());
        console.log('[WebRTC] Event name:', WEBSOCKET_EVENTS.VIDEO_OFFER);
        console.log('[WebRTC] Offer type:', offerDescription.type);
        console.log('[WebRTC] Offer SDP length:', offerDescription.sdp?.length || 0);
        
        try {
          const offerPayload = {
          sessionId,
          offer: {
            type: offerDescription.type,
            sdp: offerDescription.sdp,
          },
          };
          console.log('[WebRTC] Emitting offer with payload:', { sessionId, offerType: offerPayload.offer.type });
          webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_OFFER, offerPayload);
        console.log('[WebRTC] Offer sent successfully');
          
          // Set timeout to retry if no answer received
          offerTimeoutRef.current = setTimeout(() => {
            if (peerConnectionRef.current?.signalingState === 'have-local-offer') {
              console.warn('[WebRTC] No answer received after 10 seconds, connection may have failed');
              // Check if we should retry
              if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                console.log('[WebRTC] Retrying offer after timeout...');
                // Reset signaling state and retry
                if (peerConnectionRef.current) {
                  try {
                    // Create a new offer to retry
                    peerConnectionRef.current.createOffer().then(async (newOffer) => {
                      await peerConnectionRef.current!.setLocalDescription(newOffer);
                      if (peerConnectionRef.current?.localDescription) {
                        webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_OFFER, {
                          sessionId,
                          offer: {
                            type: peerConnectionRef.current.localDescription.type,
                            sdp: peerConnectionRef.current.localDescription.sdp,
                          },
                        });
                        console.log('[WebRTC] Retry offer sent');
                      }
                    }).catch((err) => {
                      console.error('[WebRTC] Error creating retry offer:', err);
                    });
                  } catch (err) {
                    console.error('[WebRTC] Error retrying offer:', err);
                  }
                }
              } else {
                console.error('[WebRTC] Max retry attempts reached, giving up');
                setError(new Error('No se pudo establecer conexión WebRTC'));
              }
            }
          }, 10000);
        } catch (err) {
          console.error('[WebRTC] Error emitting offer:', err);
          setError(err instanceof Error ? err : new Error('Error al enviar offer'));
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error in startVideo:', err);
      setError(err instanceof Error ? err : new Error('Failed to start video'));
    } finally {
      isStartingVideoRef.current = false;
    }
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
        .filter(
          (device) =>
            device.kind === 'videoinput' || device.kind === 'audioinput'
        )
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Dispositivo ${device.kind === 'videoinput' ? 'de video' : 'de audio'}`,
          kind: device.kind as 'videoinput' | 'audioinput',
        }));
      
      setAvailableDevices(mediaDevices);

      // Separate physical and virtual cameras
      const videoDevices = mediaDevices.filter((d) => d.kind === 'videoinput');
      const physicalCameras = videoDevices.filter((d) => !isVirtualCamera(d.label));
      const virtualCameras = videoDevices.filter((d) => isVirtualCamera(d.label));

      console.log('[WebRTC] Found video devices:', {
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
          console.log('[WebRTC] Selected physical camera as default:', defaultVideo.label);
          }
        } 
        // If no physical cameras, fall back to virtual cameras
        else if (virtualCameras.length > 0) {
          defaultVideo = virtualCameras[0];
          if (defaultVideo) {
          console.log('[WebRTC] No physical cameras found, selected virtual camera as default:', defaultVideo.label);
          }
        }
        // If no cameras at all, use the first video device found
        else if (videoDevices.length > 0) {
          defaultVideo = videoDevices[0];
          if (defaultVideo) {
          console.log('[WebRTC] Selected first available video device as default:', defaultVideo.label);
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
      console.error('[WebRTC] Error enumerating devices:', err);
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
            audio: selectedAudioDeviceId
              ? { deviceId: { exact: selectedAudioDeviceId } }
              : true,
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
          console.error('[WebRTC] Error changing video device:', err);
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to change video device')
          );
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
            video: selectedVideoDeviceId
              ? { deviceId: { exact: selectedVideoDeviceId } }
              : true,
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
          console.error('[WebRTC] Error changing audio device:', err);
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to change audio device')
          );
        }
      }
    },
    [localStream, selectedVideoDeviceId]
  );

  // Refresh devices on mount and when permissions are granted
  useEffect(() => {
    refreshDevices().catch((err) => {
      console.error('[WebRTC] Error refreshing devices:', err);
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
    stopVideo,
    toggleVideo,
    toggleAudio,
    changeVideoDevice,
    changeAudioDevice,
    refreshDevices,
    error,
  };
}

