import { apiClient } from './api-client';

export interface StartMatchingResponse {
  status: 'searching';
  estimatedTime: number;
}

export interface MatchingStatusResponse {
  status: 'searching' | 'matched';
  sessionId?: string;
  matchedAt?: string;
  startedAt?: string;
  estimatedTime?: number;
}

export class MatchingService {
  async start(): Promise<StartMatchingResponse> {
    const response = await apiClient.instance.post<StartMatchingResponse>(
      '/matching/start'
    );
    return response.data;
  }

  async stop(): Promise<void> {
    await apiClient.instance.post('/matching/stop');
  }

  async getStatus(): Promise<MatchingStatusResponse> {
    const response = await apiClient.instance.get<MatchingStatusResponse>(
      '/matching/status'
    );
    return response.data;
  }
}

export const matchingService = new MatchingService();

