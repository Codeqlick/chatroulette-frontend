import { apiClient } from './api-client';

export interface WebRTCConfig {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

export interface WebRTCMetric {
  timestamp?: string | undefined;
  packetLossAudio?: number | undefined;
  packetLossVideo?: number | undefined;
  jitterAudio?: number | undefined;
  jitterVideo?: number | undefined;
  rtt?: number | undefined;
  bitrateSent?: number | undefined;
  bitrateReceived?: number | undefined;
  fps?: number | undefined;
  resolution?: string | undefined;
  iceConnectionState?: string | undefined;
  usingTurn?: boolean | undefined;
  bytesSent?: number | undefined;
  bytesReceived?: number | undefined;
}

export interface RecordWebRTCMetricsRequest {
  sessionId: string;
  userId: string;
  metrics: WebRTCMetric[];
}

export interface RecordWebRTCMetricsResponse {
  recorded: number;
  timestamp: string;
}

export const webrtcService = {
  async getConfig(): Promise<WebRTCConfig> {
    const response = await apiClient.instance.get<WebRTCConfig>('/webrtc/config');
    return response.data;
  },

  async recordMetrics(request: RecordWebRTCMetricsRequest): Promise<RecordWebRTCMetricsResponse> {
    const response = await apiClient.instance.post<RecordWebRTCMetricsResponse>(
      '/webrtc/metrics',
      request
    );
    return response.data;
  },
};
