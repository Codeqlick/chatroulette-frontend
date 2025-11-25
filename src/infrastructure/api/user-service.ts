import { apiClient } from './api-client';
import { User } from '@domain/entities/user';

export interface UpdateProfileRequest {
  name?: string;
  username?: string;
  avatar?: string | null;
  bio?: string | null;
}

export interface MatchingPreferences {
  interests: string[];
  language: string | null;
  genderPreference: string | null;
  ageRangeMin: number | null;
  ageRangeMax: number | null;
}

export interface UploadAvatarResponse {
  avatarUrl: string;
}

export interface PublicUserProfile {
  username: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  createdAt: string;
}

export interface UserStats {
  likesReceived: number;
  reputationScore: number;
  daysActive: number;
  badges: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
  }>;
  joinedDate: string;
}

export class UserService {
  async getProfile(): Promise<User> {
    const response = await apiClient.instance.get<User>('/users/me');
    return response.data;
  }

  async updateProfile(request: UpdateProfileRequest): Promise<User> {
    const response = await apiClient.instance.patch<User>('/users/me', request);
    return response.data;
  }

  async getPreferences(): Promise<MatchingPreferences> {
    const response = await apiClient.instance.get<MatchingPreferences>(
      '/users/preferences'
    );
    return response.data;
  }

  async updatePreferences(
    preferences: MatchingPreferences
  ): Promise<MatchingPreferences> {
    const response = await apiClient.instance.put<MatchingPreferences>(
      '/users/preferences',
      preferences
    );
    return response.data;
  }

  async uploadAvatar(file: File): Promise<UploadAvatarResponse> {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await apiClient.instance.post<UploadAvatarResponse>(
      '/users/me/avatar',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  async getPublicProfile(username: string): Promise<PublicUserProfile> {
    const response = await apiClient.instance.get<PublicUserProfile>(`/users/username/${username}`);
    return response.data;
  }

  async getUserStats(username: string): Promise<UserStats> {
    const response = await apiClient.instance.get<UserStats>(`/users/username/${username}/stats`);
    return response.data;
  }
}

export const userService = new UserService();

