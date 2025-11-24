import { apiClient } from './api-client';

export interface WebRTCConfig {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

export const webrtcService = {
  async getConfig(): Promise<WebRTCConfig> {
    const response = await apiClient.instance.get<WebRTCConfig>('/webrtc/config');
    return response.data;
  },
};

