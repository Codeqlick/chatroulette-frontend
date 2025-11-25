import { AxiosError } from 'axios';
import { apiClient } from './api-client';

export interface SessionDetailsResponse {
  sessionId: string;
  partner: {
    username: string;
    name: string;
    avatar: string | null;
  };
  startedAt: string;
}

export interface SessionMessagesResponse {
  messages: Array<{
    id: string;
    sessionId: string;
    senderId: string;
    senderUsername: string;
    content: string;
    timestamp: string;
    delivered: boolean;
    read: boolean;
  }>;
  total: number;
  hasMore: boolean;
}

export class SessionService {
  async getSessionDetails(sessionId: string): Promise<SessionDetailsResponse> {
    const response = await apiClient.instance.get<SessionDetailsResponse>(`/sessions/${sessionId}`);
    return response.data;
  }

  async getSessionMessages(
    sessionId: string,
    limit?: number,
    offset?: number
  ): Promise<SessionMessagesResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) {
      params.append('limit', limit.toString());
    }
    if (offset !== undefined) {
      params.append('offset', offset.toString());
    }

    const queryString = params.toString();
    const url = `/sessions/${sessionId}/messages${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.instance.get<SessionMessagesResponse>(url);
    return response.data;
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      await apiClient.instance.post(`/sessions/${sessionId}/end`);
    } catch (error) {
      // Handle 409 (SESSION_ALREADY_ENDED) as success - session is already ended
      if (error instanceof AxiosError && error.response?.status === 409) {
        // Session already ended, treat as success
        return;
      }

      // Extract error message from Axios response
      if (error instanceof AxiosError) {
        const errorMessage =
          (error.response?.data as { error?: { message?: string } })?.error?.message ||
          error.message ||
          'Error al terminar sesión';
        throw new Error(errorMessage);
      }

      // Re-throw if not an AxiosError
      throw error instanceof Error ? error : new Error('Error al terminar sesión');
    }
  }
}

export const sessionService = new SessionService();
