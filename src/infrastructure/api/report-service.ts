import { apiClient } from './api-client';

export type ReportCategory = 'spam' | 'inappropriate_content' | 'harassment' | 'other';

export interface CreateReportRequest {
  sessionId: string;
  category: ReportCategory;
  description?: string | null;
}

export interface CreateReportResponse {
  report: {
    id: string;
    sessionId: string | null;
    reporterId: string;
    reportedUserId: string;
    category: ReportCategory;
    description: string | null;
    status: string;
    createdAt: string;
  };
}

export interface CreateUserReportRequest {
  category: ReportCategory;
  description?: string | null;
}

export interface CreateUserReportResponse {
  report: {
    id: string;
    sessionId: string | null;
    reporterId: string;
    reportedUserId: string;
    category: ReportCategory;
    description: string | null;
    status: string;
    createdAt: string;
  };
}

export class ReportService {
  async createReport(request: CreateReportRequest): Promise<CreateReportResponse> {
    const response = await apiClient.instance.post<CreateReportResponse>(
      '/reports',
      request
    );
    return response.data;
  }

  async createUserReport(username: string, request: CreateUserReportRequest): Promise<CreateUserReportResponse> {
    const response = await apiClient.instance.post<CreateUserReportResponse>(
      `/reports/user/${encodeURIComponent(username)}`,
      request
    );
    return response.data;
  }
}

export const reportService = new ReportService();

