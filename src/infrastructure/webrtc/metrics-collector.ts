import { webrtcService, WebRTCMetric } from '@infrastructure/api/webrtc-service';
import { logger } from '@infrastructure/logging/frontend-logger';
import { useAuthStore } from '@application/stores/auth-store';
import { decodeJWT } from '@infrastructure/utils/jwt-utils';

interface MetricsCollectorOptions {
  sessionId: string;
  peerConnection: RTCPeerConnection;
  collectIntervalMs?: number; // Default: 5000ms (5 seconds)
  sendIntervalMs?: number; // Default: 10000ms (10 seconds)
}

interface RTCStatsReportEntry {
  type: string;
  id: string;
  timestamp: number;
  mediaType?: string;
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number;
  bytesReceived?: number;
  bytesSent?: number;
  framesPerSecond?: number;
  frameWidth?: number;
  frameHeight?: number;
  state?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  currentRoundTripTime?: number;
}

// Extended RTCStatsReportEntry for inbound-rtp
interface RTCInboundRtpStats extends RTCStatsReportEntry {
  packetsLost: number;
  packetsReceived: number;
  jitter: number;
  bytesReceived: number;
  framesPerSecond?: number;
  frameWidth?: number;
  frameHeight?: number;
}

// Extended RTCStatsReportEntry for outbound-rtp
interface RTCOutboundRtpStats extends RTCStatsReportEntry {
  bytesSent: number;
}

// Extended RTCStatsReportEntry for candidate-pair
interface RTCCandidatePairStats extends RTCStatsReportEntry {
  bytesReceived: number;
  bytesSent: number;
  currentRoundTripTime: number;
  timestamp: number;
  localCandidateId: string;
  remoteCandidateId: string;
}

/**
 * Collects WebRTC metrics periodically and sends them to the backend in batches.
 */
export class WebRTCMetricsCollector {
  private collectInterval: NodeJS.Timeout | null = null;
  private sendInterval: NodeJS.Timeout | null = null;
  private metricsBuffer: WebRTCMetric[] = [];
  private isCollecting = false;
  private lastStats: Map<string, RTCStatsReportEntry> = new Map();

  constructor(private readonly options: MetricsCollectorOptions) {}

  /**
   * Starts collecting metrics.
   */
  start(): void {
    if (this.isCollecting) {
      logger.warn('Metrics collector already started');
      return;
    }

    this.isCollecting = true;
    const collectInterval = this.options.collectIntervalMs ?? 5000;
    const sendInterval = this.options.sendIntervalMs ?? 10000;

    // Collect metrics every 5 seconds
    this.collectInterval = setInterval(() => {
      void this.collectMetrics();
    }, collectInterval);

    // Send metrics batch every 10 seconds
    this.sendInterval = setInterval(() => {
      void this.sendMetrics();
    }, sendInterval);

    logger.debug('WebRTC metrics collector started', {
      sessionId: this.options.sessionId,
      collectInterval,
      sendInterval,
    });
  }

  /**
   * Stops collecting metrics and sends any remaining buffered metrics.
   */
  async stop(): Promise<void> {
    if (!this.isCollecting) {
      return;
    }

    this.isCollecting = false;

    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }

    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }

    // Send any remaining metrics before stopping
    await this.sendMetrics();

    logger.debug('WebRTC metrics collector stopped', { sessionId: this.options.sessionId });
  }

  /**
   * Collects metrics from the peer connection using getStats().
   */
  private async collectMetrics(): Promise<void> {
    try {
      const stats = await this.options.peerConnection.getStats();
      const metric = this.extractMetrics(stats);
      if (metric) {
        this.metricsBuffer.push(metric);
        logger.debug('Collected WebRTC metric', {
          sessionId: this.options.sessionId,
          metric,
        });
      }
    } catch (error) {
      logger.error('Error collecting WebRTC metrics', { error, sessionId: this.options.sessionId });
    }
  }

  /**
   * Extracts relevant metrics from RTCStatsReport.
   */
  private extractMetrics(stats: RTCStatsReport): WebRTCMetric | null {
    const metric: WebRTCMetric = {
      timestamp: new Date().toISOString(),
    };

    let audioInboundRtp: RTCInboundRtpStats | null = null;
    let videoInboundRtp: RTCInboundRtpStats | null = null;
    let audioOutboundRtp: RTCOutboundRtpStats | null = null;
    let videoOutboundRtp: RTCOutboundRtpStats | null = null;
    let candidatePair: RTCCandidatePairStats | null = null;
    let usingTurn = false;

    stats.forEach((report) => {
      const entry = report as unknown as RTCStatsReportEntry;

      // Inbound RTP stats (received)
      if (entry.type === 'inbound-rtp') {
        if (entry.mediaType === 'audio') {
          audioInboundRtp = entry as RTCInboundRtpStats;
        } else if (entry.mediaType === 'video') {
          videoInboundRtp = entry as RTCInboundRtpStats;
        }
      }

      // Outbound RTP stats (sent)
      if (entry.type === 'outbound-rtp') {
        if (entry.mediaType === 'audio') {
          audioOutboundRtp = entry as RTCOutboundRtpStats;
        } else if (entry.mediaType === 'video') {
          videoOutboundRtp = entry as RTCOutboundRtpStats;
        }
      }

      // Candidate pair stats (connection info)
      if (entry.type === 'candidate-pair' && entry.state === 'succeeded') {
        candidatePair = entry as RTCCandidatePairStats;
        // Check if using relay (TURN)
        if (entry.localCandidateId && entry.remoteCandidateId) {
          const localCandidate = stats.get(entry.localCandidateId) as unknown as RTCStatsReportEntry;
          const remoteCandidate = stats.get(entry.remoteCandidateId) as unknown as RTCStatsReportEntry;
          if (
            localCandidate?.candidateType === 'relay' ||
            remoteCandidate?.candidateType === 'relay'
          ) {
            usingTurn = true;
          }
        }
      }
    });

    // Extract audio metrics
    if (audioInboundRtp) {
      const audioRtp = audioInboundRtp as RTCInboundRtpStats;
      metric.packetLossAudio =
        audioRtp.packetsLost !== undefined &&
        audioRtp.packetsReceived !== undefined &&
        audioRtp.packetsReceived > 0
          ? audioRtp.packetsLost / (audioRtp.packetsLost + audioRtp.packetsReceived)
          : undefined;
      metric.jitterAudio = audioRtp.jitter;
      if (audioRtp.bytesReceived !== undefined) {
        metric.bytesReceived = (metric.bytesReceived ?? 0) + audioRtp.bytesReceived;
      }
    }

    if (audioOutboundRtp) {
      const audioOut = audioOutboundRtp as RTCOutboundRtpStats;
      if (audioOut.bytesSent !== undefined) {
        metric.bytesSent = (metric.bytesSent ?? 0) + audioOut.bytesSent;
      }
    }

    // Extract video metrics
    if (videoInboundRtp) {
      const videoRtp = videoInboundRtp as RTCInboundRtpStats;
      metric.packetLossVideo =
        videoRtp.packetsLost !== undefined &&
        videoRtp.packetsReceived !== undefined &&
        videoRtp.packetsReceived > 0
          ? videoRtp.packetsLost / (videoRtp.packetsLost + videoRtp.packetsReceived)
          : undefined;
      metric.jitterVideo = videoRtp.jitter;
      metric.fps = videoRtp.framesPerSecond;
      if (videoRtp.frameWidth !== undefined && videoRtp.frameHeight !== undefined) {
        metric.resolution = `${videoRtp.frameWidth}x${videoRtp.frameHeight}`;
      }
      if (videoRtp.bytesReceived !== undefined) {
        metric.bytesReceived = (metric.bytesReceived ?? 0) + videoRtp.bytesReceived;
      }
    }

    if (videoOutboundRtp) {
      const videoOut = videoOutboundRtp as RTCOutboundRtpStats;
      if (videoOut.bytesSent !== undefined) {
        metric.bytesSent = (metric.bytesSent ?? 0) + videoOut.bytesSent;
      }
    }

    // Extract connection metrics
    if (candidatePair) {
      const pair = candidatePair as RTCCandidatePairStats;
      metric.rtt =
        pair.currentRoundTripTime !== undefined ? pair.currentRoundTripTime * 1000 : undefined; // Convert to ms

      // Calculate bitrate from bytes sent/received
      const lastStats = this.lastStats.get('candidate-pair') as RTCCandidatePairStats | undefined;
      if (lastStats && pair.timestamp && lastStats.timestamp) {
        const timeDelta = (pair.timestamp - lastStats.timestamp) / 1000; // seconds
        if (timeDelta > 0) {
          if (pair.bytesReceived !== undefined && lastStats.bytesReceived !== undefined) {
            const bytesDelta = pair.bytesReceived - lastStats.bytesReceived;
            metric.bitrateReceived = (bytesDelta * 8) / timeDelta; // bits per second
          }
          if (pair.bytesSent !== undefined && lastStats.bytesSent !== undefined) {
            const bytesDelta = pair.bytesSent - lastStats.bytesSent;
            metric.bitrateSent = (bytesDelta * 8) / timeDelta; // bits per second
          }
        }
      }
    }

    // ICE connection state
    metric.iceConnectionState = this.options.peerConnection.iceConnectionState;
    metric.usingTurn = usingTurn;

    // Store current stats for next calculation
    if (candidatePair) {
      this.lastStats.set('candidate-pair', candidatePair as RTCStatsReportEntry);
    }

    // Only return metric if it has at least one meaningful value
    if (
      metric.packetLossAudio !== undefined ||
      metric.packetLossVideo !== undefined ||
      metric.jitterAudio !== undefined ||
      metric.jitterVideo !== undefined ||
      metric.rtt !== undefined ||
      metric.bitrateSent !== undefined ||
      metric.bitrateReceived !== undefined ||
      metric.fps !== undefined ||
      metric.resolution !== undefined
    ) {
      return metric;
    }

    return null;
  }

  /**
   * Sends buffered metrics to the backend.
   */
  private async sendMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    const metricsToSend = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      const authState = useAuthStore.getState();
      if (!authState.isAuthenticated || !authState.accessToken) {
        logger.warn('Cannot send metrics: user not authenticated');
        // Put metrics back in buffer to retry later
        this.metricsBuffer.unshift(...metricsToSend);
        return;
      }

      // Extract userId from JWT token
      const tokenPayload = decodeJWT(authState.accessToken);
      if (!tokenPayload || !tokenPayload.userId) {
        logger.warn('Cannot send metrics: userId not found in token');
        // Put metrics back in buffer to retry later
        this.metricsBuffer.unshift(...metricsToSend);
        return;
      }

      await webrtcService.recordMetrics({
        sessionId: this.options.sessionId,
        userId: tokenPayload.userId,
        metrics: metricsToSend,
      });

      logger.debug('Sent WebRTC metrics batch', {
        sessionId: this.options.sessionId,
        count: metricsToSend.length,
      });
    } catch (error) {
      logger.error('Error sending WebRTC metrics', {
        error,
        sessionId: this.options.sessionId,
        count: metricsToSend.length,
      });
      // Put metrics back in buffer to retry later (with limit to prevent memory issues)
      if (this.metricsBuffer.length < 100) {
        this.metricsBuffer.unshift(...metricsToSend);
      }
    }
  }
}

