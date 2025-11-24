import { apiClient } from './api-client';

export interface BlockUserResponse {
  blockedUser: {
    id: string;
    blockerId: string;
    blockedId: string;
    createdAt: string;
  };
}

export interface BlockedUser {
  id: string;
  name: string;
  avatar: string | null;
  blockedAt: string;
}

export interface GetBlockedUsersResponse {
  blockedUsers: BlockedUser[];
}

export class BlockService {
  async blockUser(userId: string): Promise<BlockUserResponse> {
    const response = await apiClient.instance.post<BlockUserResponse>(
      `/users/${userId}/block`
    );
    return response.data;
  }

  async unblockUser(userId: string): Promise<void> {
    await apiClient.instance.delete(`/users/${userId}/block`);
  }

  async getBlockedUsers(): Promise<GetBlockedUsersResponse> {
    const response = await apiClient.instance.get<GetBlockedUsersResponse>(
      '/users/me/blocked'
    );
    return response.data;
  }
}

export const blockService = new BlockService();

