import { useState, useRef, useEffect, useCallback } from 'react';
import { logger } from '@infrastructure/logging/frontend-logger';

export interface UseMediaStreamReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  startLocalVideo: (
    selectedVideoDeviceId: string | null,
    selectedAudioDeviceId: string | null
  ) => Promise<void>;
  stopVideo: () => void;
  toggleVideo: (stream: MediaStream | null) => Promise<void>;
  toggleAudio: (stream: MediaStream | null) => Promise<void>;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
}

/**
 * Hook to manage local and remote media streams.
 * Handles stream creation, assignment to video elements, and track toggling.
 */
export function useMediaStream(): UseMediaStreamReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isStartingVideoRef = useRef<boolean>(false);

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

  const startLocalVideo = useCallback(
    async (
      selectedVideoDeviceId: string | null,
      selectedAudioDeviceId: string | null
    ): Promise<void> => {
      // Prevent multiple simultaneous calls
      if (isStartingVideoRef.current) {
        logger.debug('Already starting video, skipping duplicate call');
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
        throw err instanceof Error ? err : new Error('Failed to start local video');
      } finally {
        isStartingVideoRef.current = false;
      }
    },
    [localStream]
  );

  const stopVideo = useCallback((): void => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
  }, [localStream]);

  const toggleVideo = useCallback(
    async (stream: MediaStream | null): Promise<void> => {
      if (stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !isVideoEnabled;
          setIsVideoEnabled(!isVideoEnabled);
        }
      }
    },
    [isVideoEnabled]
  );

  const toggleAudio = useCallback(
    async (stream: MediaStream | null): Promise<void> => {
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !isAudioEnabled;
          setIsAudioEnabled(!isAudioEnabled);
        }
      }
    },
    [isAudioEnabled]
  );

  return {
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    localStreamRef,
    setLocalStream,
    setRemoteStream,
    startLocalVideo,
    stopVideo,
    toggleVideo,
    toggleAudio,
    isVideoEnabled,
    isAudioEnabled,
  };
}
