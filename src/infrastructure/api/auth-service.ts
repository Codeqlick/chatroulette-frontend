import { apiClient } from './api-client';
import { User } from '@domain/entities/user';

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  username: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    username: string;
    email: string;
    name: string;
    avatar: string | null;
    role: 'USER' | 'ADMIN';
  };
}

export interface RefreshTokenResponse {
  accessToken: string;
}

export class AuthService {
  async register(request: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.instance.post<AuthResponse>(
      '/auth/register',
      request
    );
    return response.data;
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.instance.post<AuthResponse>(
      '/auth/login',
      request
    );
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.instance.get<User>('/users/me');
    return response.data;
  }

  async sendVerificationEmail(): Promise<void> {
    await apiClient.instance.post('/auth/send-verification-email');
  }

  async verifyEmail(token: string): Promise<{ verified: boolean; message: string }> {
    const response = await apiClient.instance.get<{ verified: boolean; message: string }>(
      `/auth/verify-email?token=${encodeURIComponent(token)}`
    );
    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await apiClient.instance.post<RefreshTokenResponse>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data;
  }
}

export const authService = new AuthService();

