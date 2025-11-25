import { apiClient } from './api-client';

export interface CreateLikeRequest {
  likedUserId?: string;
  likedUsername?: string;
}

export interface CreateLikeResponse {
  id: string;
  sessionId: string;
  likerId: string;
  likedUserId: string;
  createdAt: string;
}

export interface LikeStatusResponse {
  hasLiked: boolean;
}

export interface SessionLikesResponse {
  likes: Array<{
    id: string;
    sessionId: string;
    likerId: string;
    likedUserId: string;
    createdAt: string;
  }>;
}

export class LikeService {
  async likeUser(sessionId: string, likedUserId?: string, likedUsername?: string): Promise<CreateLikeResponse> {
    const body: CreateLikeRequest = {};
    if (likedUserId) {
      body.likedUserId = likedUserId;
    } else if (likedUsername) {
      body.likedUsername = likedUsername;
    } else {
      throw new Error('Either likedUserId or likedUsername must be provided');
    }
    const response = await apiClient.instance.post<CreateLikeResponse>(
      `/sessions/${sessionId}/like`,
      body
    );
    return response.data;
  }

  async getLikeStatus(sessionId: string): Promise<LikeStatusResponse> {
    const response = await apiClient.instance.get<LikeStatusResponse>(
      `/sessions/${sessionId}/like/status`
    );
    return response.data;
  }

  async getSessionLikes(sessionId: string): Promise<SessionLikesResponse> {
    const response = await apiClient.instance.get<SessionLikesResponse>(
      `/sessions/${sessionId}/likes`
    );
    return response.data;
  }

  async unlikeUser(sessionId: string): Promise<void> {
    await apiClient.instance.delete(`/sessions/${sessionId}/like`);
  }
}

export const likeService = new LikeService();

