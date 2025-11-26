import { apiClient } from './api-client';

export interface WebRTCConfig {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

export interface WebRTCMetric {
  timestamp?: string;
  packetLossAudio?: number;
  packetLossVideo?: number;
  jitterAudio?: number;
  jitterVideo?: number;
  rtt?: number;
  bitrateSent?: number;
  bitrateReceived?: number;
  fps?: number;
  resolution?: string;
  iceConnectionState?: string;
  usingTurn?: boolean;
  bytesSent?: number;
  bytesReceived?: number;
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
