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
  async getPendingReports(
    limit?: number,
    offset?: number
  ): Promise<PendingReportsResponse> {
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
}

export const adminService = new AdminService();

