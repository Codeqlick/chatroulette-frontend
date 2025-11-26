import { useState, useEffect } from 'react';
import { webrtcService } from '@infrastructure/api/webrtc-service';
import { logger } from '@infrastructure/logging/frontend-logger';

/**
 * Hook to load and manage WebRTC configuration (ICE servers).
 * Provides fallback STUN servers if backend configuration fails to load.
 */
export function useWebRTCConfig(): RTCIceServer[] {
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    // Fallback STUN servers while loading configuration
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  useEffect(() => {
    webrtcService
      .getConfig()
      .then((config) => {
        logger.debug('Loaded WebRTC configuration from backend', { config });
        setIceServers(config.iceServers as RTCIceServer[]);
      })
      .catch((error) => {
        logger.error('Error loading WebRTC configuration, using defaults', { error });
        // Keep default STUN servers as fallback
      });
  }, []);

  return iceServers;
}
