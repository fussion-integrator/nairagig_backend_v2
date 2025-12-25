import axios from 'axios';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';

interface PaystackInitializeData {
  email: string;
  amount: number; // in kobo
  reference?: string;
  callback_url?: string;
  metadata?: any;
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message: string;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: any;
    log: any;
    fees: number;
    fees_split: any;
    authorization: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      channel: string;
      card_type: string;
      bank: string;
      country_code: string;
      brand: string;
      reusable: boolean;
      signature: string;
    };
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      customer_code: string;
      phone: string;
      metadata: any;
      risk_action: string;
    };
    plan: any;
    split: any;
    order_id: any;
    paidAt: string;
    createdAt: string;
    requested_amount: number;
    pos_transaction_data: any;
    source: any;
    fees_breakdown: any;
  };
}

export class PaystackService {
  private readonly baseURL = 'https://api.paystack.co';
  private readonly secretKey = config.paystack.secretKey;

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initializeTransaction(data: PaystackInitializeData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/transaction/initialize`,
        data,
        { headers: this.getHeaders() }
      );

      logger.info(`Paystack transaction initialized: ${data.reference}`);
      return response.data;
    } catch (error: any) {
      logger.error('Paystack initialization error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Payment initialization failed');
    }
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    try {
      const response = await axios.get(
        `${this.baseURL}/transaction/verify/${reference}`,
        { headers: this.getHeaders() }
      );

      logger.info(`Paystack transaction verified: ${reference}`);
      return response.data;
    } catch (error: any) {
      logger.error('Paystack verification error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Payment verification failed');
    }
  }

  async listTransactions(params?: { 
    perPage?: number; 
    page?: number; 
    customer?: string; 
    status?: string; 
    from?: string; 
    to?: string; 
  }) {
    try {
      const queryParams = new URLSearchParams(params as any).toString();
      const response = await axios.get(
        `${this.baseURL}/transaction?${queryParams}`,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Paystack list transactions error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch transactions');
    }
  }

  generateReference(): string {
    return `nairagig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  convertToKobo(amount: number): number {
    return Math.round(amount * 100);
  }

  convertFromKobo(amount: number): number {
    return amount / 100;
  }
}

export const paystackService = new PaystackService();