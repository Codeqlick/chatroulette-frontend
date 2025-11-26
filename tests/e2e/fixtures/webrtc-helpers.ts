import { type Page } from '@playwright/test';

/**
 * Helper functions for WebRTC E2E tests.
 */

/**
 * Waits for a WebRTC peer connection to be established.
 */
export async function waitForWebRTCConnection(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      // Check if RTCPeerConnection exists and is connected
      const connectionState = (window as { peerConnection?: RTCPeerConnection }).peerConnection
        ?.connectionState;
      return connectionState === 'connected';
    },
    { timeout }
  );
}

/**
 * Waits for video element to have a stream.
 */
export async function waitForVideoStream(
  page: Page,
  selector: string,
  timeout = 30000
): Promise<void> {
  await page.waitForFunction(
    (sel: string) => {
      const video = document.querySelector(sel) as HTMLVideoElement | null;
      return video !== null && video.srcObject !== null && video.readyState >= 2; // HAVE_CURRENT_DATA
    },
    selector,
    { timeout }
  );
}

/**
 * Checks if WebRTC connection is using TURN (relay).
 */
export async function isUsingTURN(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const connection = (window as { peerConnection?: RTCPeerConnection }).peerConnection;
    if (!connection) {
      return false;
    }

    // This would require getStats() to check candidate types
    // For now, return false as a placeholder
    return false;
  });
}

/**
 * Gets WebRTC connection state.
 */
export async function getConnectionState(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const connection = (window as { peerConnection?: RTCPeerConnection }).peerConnection;
    return connection?.connectionState ?? null;
  });
}

/**
 * Gets ICE connection state.
 */
export async function getICEConnectionState(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const connection = (window as { peerConnection?: RTCPeerConnection }).peerConnection;
    return connection?.iceConnectionState ?? null;
  });
}

/**
 * Mocks media devices for testing.
 */
export async function mockMediaDevices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Mock getUserMedia to return a fake stream

    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      // Create a canvas-based video stream
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = '30px Arial';
        ctx.fillText('Test Video', 10, 50);
      }

      const stream = canvas.captureStream(30); // 30 FPS

      // Add audio track if requested
      if (constraints?.audio) {
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const destination = audioContext.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        const audioTrack = destination.stream.getAudioTracks()[0];
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }
      }

      return stream;
    };
  });
}
