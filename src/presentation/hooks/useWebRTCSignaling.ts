import { useRef, useCallback } from 'react';
import { WEBSOCKET_EVENTS, API_CONSTANTS } from '@config/constants';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { logger } from '@infrastructure/logging/frontend-logger';

const RATE_LIMIT_COOLDOWN_MS = 13000; // 13 seconds between offers (5 per minute = 12s minimum, add 1s margin)

export interface UseWebRTCSignalingReturn {
  sendOffer: (offer: RTCSessionDescriptionInit, peerConnection: RTCPeerConnection) => Promise<void>;
  sendAnswer: (answer: RTCSessionDescriptionInit, sessionId: string, peerConnection: RTCPeerConnection) => Promise<void>;
  sendIceCandidate: (candidate: RTCIceCandidate, sessionId: string) => void;
  handleOffer: (offer: RTCSessionDescriptionInit, sessionId: string, peerConnection: RTCPeerConnection, localStream: MediaStream | null, setLocalStream: (stream: MediaStream) => void, processPendingIceCandidates: () => Promise<void>, setError: (error: Error) => void) => Promise<void>;
  handleAnswer: (answer: RTCSessionDescriptionInit, sessionId: string, peerConnection: RTCPeerConnection, processPendingIceCandidates: () => Promise<void>, setError: (error: Error) => void) => Promise<void>;
  handleIceCandidate: (candidate: RTCIceCandidateInit, sessionId: string, peerConnection: RTCPeerConnection, processPendingIceCandidates: () => Promise<void>, setError: (error: Error) => void) => Promise<void>;
  processPendingIceCandidates: (peerConnection: RTCPeerConnection) => Promise<void>;
  pendingIceCandidates: React.MutableRefObject<RTCIceCandidateInit[]>;
}

/**
 * Hook to manage WebRTC signaling (offer/answer/ICE candidates).
 * Handles sending and receiving SDP offers/answers and ICE candidates via WebSocket.
 */
export function useWebRTCSignaling(sessionId: string | null): UseWebRTCSignalingReturn {
  const lastOfferTimeRef = useRef<number>(0);
  const offerRetryAttemptsRef = useRef<number>(0);
  const answerRetryAttemptsRef = useRef<number>(0);
  const offerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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
  const sendOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, peerConnection: RTCPeerConnection): Promise<void> => {
      if (!sessionId || !peerConnection) {
        throw new Error('Session ID or peer connection not available');
      }

      if (!webSocketService.isConnected()) {
        throw new Error('WebSocket not connected');
      }

      // Rate limiting: Check if enough time has passed since last offer
      const now = Date.now();
      const timeSinceLastOffer = now - lastOfferTimeRef.current;

      if (timeSinceLastOffer < RATE_LIMIT_COOLDOWN_MS && offerRetryAttemptsRef.current === 0) {
        const waitTime = RATE_LIMIT_COOLDOWN_MS - timeSinceLastOffer;
        logger.debug(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before sending offer`, {
          sessionId,
        });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      const sendOfferWithRetry = async (attempt: number = 0): Promise<void> => {
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
          lastOfferTimeRef.current = Date.now();
          offerRetryAttemptsRef.current = 0;
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
            return sendOfferWithRetry(attempt + 1);
          } else {
            offerRetryAttemptsRef.current = 0;
            throw err;
          }
        }
      };

      await sendOfferWithRetry(0);
    },
    [sessionId, calculateBackoffDelay]
  );

  /**
   * Send answer with retry logic and exponential backoff
   */
  const sendAnswer = useCallback(
    async (
      answer: RTCSessionDescriptionInit,
      targetSessionId: string,
      peerConnection: RTCPeerConnection
    ): Promise<void> => {
      if (!peerConnection) {
        throw new Error('Peer connection not available');
      }

      if (!webSocketService.isConnected()) {
        throw new Error('WebSocket not connected');
      }

      const sendAnswerWithRetry = async (attempt: number = 0): Promise<void> => {
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
          answerRetryAttemptsRef.current = 0;
        } catch (err) {
          logger.error(`Error sending answer (attempt ${attempt + 1})`, {
            error: err,
            sessionId: targetSessionId,
            attempt,
          });

          if (attempt < API_CONSTANTS.WEBRTC_RETRY_MAX_ATTEMPTS - 1) {
            const delay = calculateBackoffDelay(attempt);
            logger.debug(`Retrying answer in ${delay}ms...`, { sessionId: targetSessionId, attempt, delay });
            answerRetryAttemptsRef.current = attempt + 1;

            await new Promise((resolve) => setTimeout(resolve, delay));
            return sendAnswerWithRetry(attempt + 1);
          } else {
            answerRetryAttemptsRef.current = 0;
            throw err;
          }
        }
      };

      await sendAnswerWithRetry(0);
    },
    [calculateBackoffDelay]
  );

  /**
   * Send ICE candidate via WebSocket
   */
  const sendIceCandidate = useCallback(
    (candidate: RTCIceCandidate, targetSessionId: string): void => {
      if (!targetSessionId) {
        logger.warn('Cannot send ICE candidate: sessionId not available');
        return;
      }

      if (!webSocketService.isConnected()) {
        logger.warn('Socket not connected, cannot send ICE candidate', { sessionId: targetSessionId });
        return;
      }

      try {
        const candidatePayload = {
          sessionId: targetSessionId,
          candidate: candidate.toJSON(),
        };
        logger.debug('Emitting ICE candidate', {
          sessionId: targetSessionId,
          isConnected: webSocketService.isConnected(),
          eventName: WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE,
        });
        webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_ICE_CANDIDATE, candidatePayload);
        logger.debug('ICE candidate emitted successfully', { sessionId: targetSessionId });
      } catch (err) {
        logger.error('Error emitting ICE candidate', { error: err, sessionId: targetSessionId });
      }
    },
    []
  );

  /**
   * Process pending ICE candidates queue
   */
  const processPendingIceCandidates = useCallback(
    async (peerConnection: RTCPeerConnection): Promise<void> => {
      if (!peerConnection || pendingIceCandidatesRef.current.length === 0) {
        return;
      }

      const remoteDescription = peerConnection.remoteDescription;
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
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          logger.debug('Pending ICE candidate added successfully', { sessionId });
        } catch (err) {
          logger.error('Error adding pending ICE candidate', { error: err, sessionId });
          if (err instanceof Error) {
            logger.warn('Pending ICE candidate error details', { sessionId, message: err.message });
          }
        }
      }
    },
    [sessionId]
  );

  /**
   * Handle incoming offer
   */
  const handleOffer = useCallback(
    async (
      offer: RTCSessionDescriptionInit,
      targetSessionId: string,
      peerConnection: RTCPeerConnection,
      localStream: MediaStream | null,
      setLocalStream: (stream: MediaStream) => void,
      processPendingCandidates: () => Promise<void>,
      setError: (error: Error) => void
    ): Promise<void> => {
      logger.debug('handleOffer called', { sessionId: targetSessionId });

      if (targetSessionId !== sessionId) {
        logger.warn('Offer sessionId mismatch', { received: targetSessionId, expected: sessionId });
        return;
      }

      if (!peerConnection) {
        logger.error('No peer connection available when offer received', { sessionId });
        return;
      }

      logger.debug('Offer received, checking for local stream', { sessionId });

      try {
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

        // Auto-start video if local stream doesn't exist
        if (!localStream) {
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
          if (existingTracks.length === 0 && localStream) {
            logger.debug('Adding existing stream tracks to peer connection', { sessionId });
            localStream.getTracks().forEach((track) => {
              peerConnection.addTrack(track, localStream);
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
          if (peerConnection.signalingState === 'have-local-offer') {
            logger.warn('Skipping remote offer, we already sent our offer', { sessionId });
            return;
          }
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        logger.debug('Remote description set, creating answer', { sessionId });

        // Process any pending ICE candidates now that remote description is set
        await processPendingCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        logger.debug('Local description set, sending answer', { sessionId });

        const answerDescription = peerConnection.localDescription;
        if (answerDescription) {
          try {
            await sendAnswer(answerDescription, targetSessionId, peerConnection);
          } catch (err) {
            logger.error('Failed to send answer after retries', { error: err, sessionId });
            setError(err instanceof Error ? err : new Error('Error al enviar answer'));
          }
        }
      } catch (err) {
        logger.error('Error handling offer', { error: err, sessionId });
        setError(err instanceof Error ? err : new Error('WebRTC error'));
      }
    },
    [sessionId, sendAnswer]
  );

  /**
   * Handle incoming answer
   */
  const handleAnswer = useCallback(
    async (
      answer: RTCSessionDescriptionInit,
      targetSessionId: string,
      peerConnection: RTCPeerConnection,
      processPendingCandidates: () => Promise<void>,
      setError: (error: Error) => void
    ): Promise<void> => {
      logger.debug('handleAnswer called', { sessionId: targetSessionId });

      if (targetSessionId !== sessionId) {
        logger.warn('Answer sessionId mismatch', { received: targetSessionId, expected: sessionId });
        return;
      }

      if (!peerConnection) {
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

        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        logger.debug('Remote description set from answer', { sessionId });

        // Process any pending ICE candidates now that remote description is set
        await processPendingCandidates();
      } catch (err) {
        logger.error('Error handling answer', { error: err, sessionId });
        const error = err instanceof Error ? err : new Error('WebRTC error');
        setError(error);
      }
    },
    [sessionId]
  );

  /**
   * Handle incoming ICE candidate
   */
  const handleIceCandidate = useCallback(
    async (
      candidate: RTCIceCandidateInit,
      targetSessionId: string,
      peerConnection: RTCPeerConnection,
      processPendingCandidates: () => Promise<void>,
      setError: (error: Error) => void
    ): Promise<void> => {
      if (targetSessionId !== sessionId) {
        logger.warn('ICE candidate sessionId mismatch', {
          received: targetSessionId,
          expected: sessionId,
        });
        return;
      }

      if (!peerConnection) {
        logger.error('No peer connection available when ICE candidate received', { sessionId });
        return;
      }

      // Check if remote description is set
      const remoteDescription = peerConnection.remoteDescription;

      if (!remoteDescription) {
        // Remote description not set yet, queue the candidate
        logger.debug('Remote description not set, queueing ICE candidate', { sessionId });
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      // Remote description is set, add candidate immediately
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        logger.debug('ICE candidate added successfully', { sessionId });
        // Process any pending candidates that might have been queued earlier
        await processPendingCandidates();
      } catch (err) {
        logger.error('Error adding ICE candidate', { error: err, sessionId });
        // If it fails, try queueing it (might be a timing issue)
        if (err instanceof Error && err.message.includes('remote description')) {
          logger.debug('Queueing ICE candidate due to remote description error', { sessionId });
          pendingIceCandidatesRef.current.push(candidate);
        } else if (err instanceof Error) {
          logger.warn('ICE candidate error details', { sessionId, message: err.message });
          // Set error for critical failures
          const error = new Error(`Failed to add ICE candidate: ${err.message}`);
          setError(error);
        }
      }
    },
    [sessionId]
  );

  return {
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    processPendingIceCandidates,
    pendingIceCandidates: pendingIceCandidatesRef,
  };
}

