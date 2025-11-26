import { useState, useCallback, useEffect } from 'react';
import { logger } from '@infrastructure/logging/frontend-logger';

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
}

/**
 * Detects if a device is a common virtual camera
 * @param deviceLabel - The device name/label
 * @returns true if it's a virtual camera, false if it's physical
 */
function isVirtualCamera(deviceLabel: string): boolean {
  if (!deviceLabel) {
    return false;
  }

  const lowerLabel = deviceLabel.toLowerCase();

  // List of common virtual camera patterns
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

export interface UseMediaDevicesReturn {
  availableDevices: MediaDevice[];
  selectedVideoDeviceId: string | null;
  selectedAudioDeviceId: string | null;
  setSelectedVideoDeviceId: (deviceId: string | null) => void;
  setSelectedAudioDeviceId: (deviceId: string | null) => void;
  refreshDevices: () => Promise<void>;
}

/**
 * Hook to manage media devices (cameras and microphones).
 * Handles device enumeration, selection, and prioritizes physical cameras over virtual ones.
 */
export function useMediaDevices(): UseMediaDevicesReturn {
  const [availableDevices, setAvailableDevices] = useState<MediaDevice[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);

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

  // Refresh devices on mount and when permissions are granted
  useEffect(() => {
    refreshDevices().catch((err) => {
      logger.error('Error refreshing devices', { error: err });
    });
  }, [refreshDevices]);

  return {
    availableDevices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    setSelectedVideoDeviceId,
    setSelectedAudioDeviceId,
    refreshDevices,
  };
}
