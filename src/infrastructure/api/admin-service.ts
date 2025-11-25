import { apiClient } from './api-client';

export interface PendingReport {
  id: string;
  sessionId: string;
  reporterId: string;
  reportedUserId: string;
  category: string;
  description: string | null;
  status: string;
  createdAt: string;
  reporter?: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  };
  reportedUser?: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
    isBanned: boolean;
  };
}

export interface AdminStats {
  users: {
    total: number;
    active: number;
    banned: number;
    verified: number;
  };
  sessions: {
    total: number;
    active: number;
    ended: number;
  };
  reports: {
    total: number;
    pending: number;
    resolved: number;
    dismissed: number;
  };
  messages: {
    total: number;
    today: number;
  };
}

export interface UserListItem {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string | null;
  role: string;
  isBanned: boolean;
  emailVerified: boolean;
  createdAt: string;
  stats: {
    sessionsCount: number;
    reportsReceived: number;
    reportsSent: number;
    messagesCount: number;
  };
}

export interface GetUsersResponse {
  users: UserListItem[];
  total: number;
  hasMore: boolean;
}

export interface UserDetails {
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    avatar: string | null;
    bio: string | null;
    role: string;
    isBanned: boolean;
    banReason: string | null;
    bannedAt: string | null;
    bannedUntil: string | null;
    bannedBy: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  };
  stats: {
    sessionsTotal: number;
    sessionsActive: number;
    reportsReceived: number;
    reportsSent: number;
    messagesCount: number;
    likesGiven: number;
    likesReceived: number;
  };
  recentSessions: Array<{
    id: string;
    partnerId: string;
    partnerName: string;
    partnerUsername: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
  }>;
  banHistory: Array<{
    reason: string;
    bannedAt: string;
    bannedUntil: string | null;
    bannedBy: string | null;
  }>;
  unbanPayments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }>;
}

export interface BanUserRequest {
  reason: string;
  bannedUntil?: string;
}

export interface BanUserResponse {
  user: {
    id: string;
    isBanned: boolean;
    banReason: string | null;
    bannedAt: string | null;
    bannedUntil: string | null;
  };
  sessionsEnded: number;
}

export interface UnbanUserResponse {
  user: {
    id: string;
    isBanned: boolean;
    banReason: string | null;
    bannedAt: string | null;
    bannedUntil: string | null;
  };
}

export interface ReportHistoryItem {
  id: string;
  sessionId: string | null;
  reporterId: string;
  reportedUserId: string;
  category: string;
  description: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reporter?: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  };
  reportedUser?: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
    isBanned: boolean;
  };
}

export interface GetReportsHistoryResponse {
  reports: ReportHistoryItem[];
  total: number;
  hasMore: boolean;
}

export interface ActiveSession {
  id: string;
  user1: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  };
  user2: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  };
  startedAt: string;
  duration: number;
}

export interface GetActiveSessionsResponse {
  sessions: ActiveSession[];
  total: number;
  hasMore: boolean;
}

export interface EndSessionRequest {
  reason?: string;
}

export interface EndSessionResponse {
  session: {
    id: string;
    status: string;
    endedAt: string;
    endedBy: string;
  };
}

export interface AuditLog {
  id: string;
  eventType: string;
  userId?: string;
  adminId?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface GetAuditLogsResponse {
  logs: AuditLog[];
  total: number;
  hasMore: boolean;
}

export interface AdvancedStats {
  period: 'day' | 'week' | 'month';
  startDate: string;
  endDate: string;
  trends: {
    newUsers: Array<{ date: string; count: number }>;
    reports: Array<{ date: string; count: number }>;
    sessions: Array<{ date: string; count: number }>;
    messages: Array<{ date: string; count: number }>;
  };
  distribution: {
    reportsByCategory: Array<{ category: string; count: number }>;
    userStatus: {
      active: number;
      banned: number;
      verified: number;
    };
  };
  topReportedUsers: Array<{
    userId: string;
    name: string;
    username: string;
    reportsCount: number;
  }>;
  activityByHour: Array<{ hour: number; count: number }>;
}

export interface PendingReportsResponse {
  reports: PendingReport[];
  total: number;
  hasMore: boolean;
}

export interface ReviewReportRequest {
  status: 'RESOLVED' | 'DISMISSED';
}

export interface ReviewReportResponse {
  report: {
    id: string;
    status: string;
    reviewedAt: string;
    reviewedBy: string;
  };
}

export class AdminService {
  async getPendingReports(limit?: number, offset?: number): Promise<PendingReportsResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) {
      params.append('limit', limit.toString());
    }
    if (offset !== undefined) {
      params.append('offset', offset.toString());
    }

    const queryString = params.toString();
    const url = `/admin/reports/pending${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.instance.get<PendingReportsResponse>(url);
    return response.data;
  }

  async reviewReport(
    reportId: string,
    request: ReviewReportRequest
  ): Promise<ReviewReportResponse> {
    const response = await apiClient.instance.post<ReviewReportResponse>(
      `/admin/reports/${reportId}/review`,
      request
    );
    return response.data;
  }

  async getStats(): Promise<AdminStats> {
    const response = await apiClient.instance.get<AdminStats>('/admin/stats');
    return response.data;
  }

  async getUsers(params?: {
    limit?: number;
    offset?: number;
    search?: string;
    isBanned?: boolean;
    emailVerified?: boolean;
    role?: 'USER' | 'ADMIN';
  }): Promise<GetUsersResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params?.offset !== undefined) queryParams.append('offset', params.offset.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.isBanned !== undefined) queryParams.append('isBanned', params.isBanned.toString());
    if (params?.emailVerified !== undefined)
      queryParams.append('emailVerified', params.emailVerified.toString());
    if (params?.role) queryParams.append('role', params.role);

    const queryString = queryParams.toString();
    const url = `/admin/users${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.instance.get<GetUsersResponse>(url);
    return response.data;
  }

  async getUserDetails(userId: string): Promise<UserDetails> {
    const response = await apiClient.instance.get<UserDetails>(`/admin/users/${userId}`);
    return response.data;
  }

  async banUser(userId: string, request: BanUserRequest): Promise<BanUserResponse> {
    const response = await apiClient.instance.post<BanUserResponse>(
      `/admin/users/${userId}/ban`,
      request
    );
    return response.data;
  }

  async unbanUser(userId: string): Promise<UnbanUserResponse> {
    const response = await apiClient.instance.post<UnbanUserResponse>(
      `/admin/users/${userId}/unban`,
      {}
    );
    return response.data;
  }

  async getReportsHistory(params?: {
    limit?: number;
    offset?: number;
    status?: 'PENDING' | 'RESOLVED' | 'DISMISSED';
    category?: 'SPAM' | 'INAPPROPRIATE_CONTENT' | 'HARASSMENT' | 'OTHER';
    reportedUserId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<GetReportsHistoryResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params?.offset !== undefined) queryParams.append('offset', params.offset.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.reportedUserId) queryParams.append('reportedUserId', params.reportedUserId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const queryString = queryParams.toString();
    const url = `/admin/reports/history${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.instance.get<GetReportsHistoryResponse>(url);
    return response.data;
  }

  async getActiveSessions(params?: {
    limit?: number;
    offset?: number;
  }): Promise<GetActiveSessionsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params?.offset !== undefined) queryParams.append('offset', params.offset.toString());

    const queryString = queryParams.toString();
    const url = `/admin/sessions/active${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.instance.get<GetActiveSessionsResponse>(url);
    return response.data;
  }

  async endSession(sessionId: string, reason?: string): Promise<EndSessionResponse> {
    const response = await apiClient.instance.post<EndSessionResponse>(
      `/admin/sessions/${sessionId}/end`,
      { reason }
    );
    return response.data;
  }

  async getAuditLogs(params?: {
    limit?: number;
    offset?: number;
    eventType?: string;
    userId?: string;
    adminId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<GetAuditLogsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params?.offset !== undefined) queryParams.append('offset', params.offset.toString());
    if (params?.eventType) queryParams.append('eventType', params.eventType);
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.adminId) queryParams.append('adminId', params.adminId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const queryString = queryParams.toString();
    const url = `/admin/audit-logs${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.instance.get<GetAuditLogsResponse>(url);
    return response.data;
  }

  async getAdvancedStats(period: 'day' | 'week' | 'month' = 'week'): Promise<AdvancedStats> {
    const response = await apiClient.instance.get<AdvancedStats>(
      `/admin/stats/advanced?period=${period}`
    );
    return response.data;
  }
}

export const adminService = new AdminService();
