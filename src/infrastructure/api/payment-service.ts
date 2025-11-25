import { apiClient } from './api-client';

export interface CreateUnbanPaymentResponse {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

export interface ConfirmUnbanPaymentResponse {
  userId: string;
  paymentIntentId: string;
  status: string;
}

export interface PaymentHistoryItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export class PaymentService {
  async createUnbanPayment(): Promise<CreateUnbanPaymentResponse> {
    const response = await apiClient.instance.post<CreateUnbanPaymentResponse>('/payments/unban');
    return response.data;
  }

  async confirmUnbanPayment(paymentIntentId: string): Promise<ConfirmUnbanPaymentResponse> {
    const response = await apiClient.instance.post<ConfirmUnbanPaymentResponse>('/payments/unban/confirm', {
      paymentIntentId,
    });
    return response.data;
  }

  async getPaymentHistory(): Promise<PaymentHistoryItem[]> {
    const response = await apiClient.instance.get<{ payments: PaymentHistoryItem[] }>('/payments/history');
    return response.data.payments;
  }
}

export const paymentService = new PaymentService();

