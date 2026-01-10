import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '@/types/auth';
import { EncryptionService } from '@/utils/encryption';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export class BillingController {
  // Bank Accounts
  async getBankAccounts(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;

      const accounts = await prisma.bankAccount.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' }
      });

      const decryptedAccounts = accounts.map(account => {
        try {
          return {
            ...account,
            accountNumber: EncryptionService.decrypt(account.accountNumber).slice(-4).padStart(10, '*'),
            accountName: EncryptionService.decrypt(account.accountName)
          }
        } catch (error) {
          console.error('Decryption error for account:', account.id, error)
          return {
            ...account,
            accountNumber: '****' + account.accountNumber.slice(-4),
            accountName: 'Encrypted Data'
          }
        }
      });

      res.json({
        success: true,
        data: decryptedAccounts,
      });
    } catch (error) {
      console.error('getBankAccounts error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bank accounts',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async addBankAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { bankName, accountNumber, accountName, bankCode } = req.body;

      const account = await prisma.bankAccount.create({
        data: {
          userId: userId!,
          bankName,
          accountNumber: EncryptionService.encrypt(accountNumber),
          accountName: EncryptionService.encrypt(accountName),
          bankCode,
          isVerified: true
        }
      });

      res.status(201).json({
        success: true,
        data: {
          ...account,
          accountNumber: accountNumber.slice(-4).padStart(10, '*'),
          accountName: accountName
        },
        message: 'Bank account added successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to add bank account',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateBankAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { bankName, accountNumber, accountName, bankCode, isDefault } = req.body;

      // If setting as default, unset other defaults
      if (isDefault) {
        await prisma.bankAccount.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false }
        });
      }

      const account = await prisma.bankAccount.update({
        where: { id, userId },
        data: { bankName, accountNumber, accountName, bankCode, isDefault }
      });

      res.json({
        success: true,
        data: account,
        message: 'Bank account updated successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update bank account',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deleteBankAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      await prisma.bankAccount.update({
        where: { id, userId },
        data: { status: 'INACTIVE' }
      });

      res.json({
        success: true,
        message: 'Bank account removed successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to remove bank account',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Payment Cards
  async getPaymentCards(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;

      const cards = await prisma.paymentCard.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' }
      });

      const sanitizedCards = cards.map(card => ({
        ...card,
        cardToken: undefined
      }));

      res.json({
        success: true,
        data: sanitizedCards,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment cards',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async addPaymentCard(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { cardNumber, expiryDate, cvv, cardholderName } = req.body;

      const last4 = cardNumber.slice(-4);
      const cardType = this.getCardType(cardNumber);
      const [expiryMonth, expiryYear] = expiryDate.split('/');

      const card = await prisma.paymentCard.create({
        data: {
          userId: userId!,
          cardType,
          last4,
          expiryMonth,
          expiryYear,
          cardToken: EncryptionService.encrypt(cardNumber),
          isVerified: true
        }
      });

      res.status(201).json({
        success: true,
        data: {
          ...card,
          cardToken: undefined
        },
        message: 'Payment card added successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to add payment card',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updatePaymentCard(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { expiryDate, isDefault } = req.body;

      // If setting as default, unset other defaults
      if (isDefault) {
        await prisma.paymentCard.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false }
        });
      }

      const updateData: any = { isDefault };
      if (expiryDate) {
        const [expiryMonth, expiryYear] = expiryDate.split('/');
        updateData.expiryMonth = expiryMonth;
        updateData.expiryYear = expiryYear;
      }

      const card = await prisma.paymentCard.update({
        where: { id, userId },
        data: updateData
      });

      res.json({
        success: true,
        data: card,
        message: 'Payment card updated successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update payment card',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deletePaymentCard(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      await prisma.paymentCard.update({
        where: { id, userId },
        data: { status: 'INACTIVE' }
      });

      res.json({
        success: true,
        message: 'Payment card removed successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to remove payment card',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Payment History
  async getPaymentHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where: { userId },
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.transaction.count({ where: { userId } })
      ]);

      const formattedTransactions = transactions.map(tx => ({
        id: tx.id,
        date: tx.createdAt.toISOString().split('T')[0],
        description: tx.description || `${tx.type} - ${tx.referenceId}`,
        amount: tx.amount.toString(),
        status: tx.status.toLowerCase(),
        method: tx.gatewayProvider || 'Bank Transfer'
      }));

      res.json({
        success: true,
        data: formattedTransactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get Banks from Paystack
  async getBanks(req: AuthenticatedRequest, res: Response) {
    try {
      const response = await fetch('https://api.paystack.co/bank', {
        headers: {
          'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json() as any;
      
      if (!data.status) {
        throw new Error('Failed to fetch banks from Paystack');
      }

      res.json({
        success: true,
        data: data.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch banks',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Verify Bank Account
  async verifyBankAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const { accountNumber, bankCode } = req.body;

      // Validate input
      if (!accountNumber || !bankCode) {
        return res.status(400).json({
          success: false,
          message: 'Account number and bank code are required'
        });
      }

      // Validate account number format (Nigerian account numbers are 10 digits)
      if (!/^\d{10}$/.test(accountNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Account number must be exactly 10 digits'
        });
      }

      // Check if Paystack secret key is configured
      if (!process.env.PAYSTACK_SECRET_KEY) {
        console.error('PAYSTACK_SECRET_KEY not configured');
        return res.status(500).json({
          success: false,
          message: 'Payment service not configured'
        });
      }

      console.log('Verifying account:', { accountNumber, bankCode });
      console.log('Using Paystack key:', process.env.PAYSTACK_SECRET_KEY?.substring(0, 20) + '...');
      console.log('Key type:', process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST');

      const url = `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json() as any;
      
      console.log('Paystack response:', {
        status: response.status,
        ok: response.ok,
        data: data
      });
      
      if (!response.ok) {
        console.error('Paystack API error:', data);
        return res.status(400).json({
          success: false,
          message: data.message || 'Unable to verify account details. Please check account number and bank selection.'
        });
      }

      if (!data.status) {
        console.error('Paystack verification failed:', data);
        return res.status(400).json({
          success: false,
          message: data.message || 'Account verification failed'
        });
      }

      res.json({
        success: true,
        data: {
          accountName: data.data.account_name,
          accountNumber: data.data.account_number
        }
      });
    } catch (error) {
      console.error('Account verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify account',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Verify Card BIN
  async verifyCardBin(req: AuthenticatedRequest, res: Response) {
    try {
      const { cardNumber } = req.body;

      if (!cardNumber) {
        return res.status(400).json({
          success: false,
          message: 'Card number is required'
        });
      }

      // Extract first 6 digits
      const bin = cardNumber.replace(/\s/g, '').substring(0, 6);
      
      if (bin.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Invalid card number'
        });
      }

      const url = `https://api.paystack.co/decision/bin/${bin}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json() as any;
      
      if (!response.ok || !data.status) {
        return res.status(400).json({
          success: false,
          message: data.message || 'Unable to verify card'
        });
      }

      res.json({
        success: true,
        data: {
          cardType: data.data.card_type,
          brand: data.data.brand,
          bank: data.data.bank,
          country: data.data.country_name
        }
      });
    } catch (error) {
      console.error('Card verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify card',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private getCardType(cardNumber: string): string {
    const number = cardNumber.replace(/\s/g, '');
    if (number.startsWith('4')) return 'visa';
    if (number.startsWith('5') || number.startsWith('2')) return 'mastercard';
    if (number.startsWith('506') || number.startsWith('507') || number.startsWith('508') || number.startsWith('627')) return 'verve';
    return 'unknown';
  }

  async processPayment(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { projectId, milestoneId, amount, paymentMethod, cardId } = req.body;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          freelancer: { select: { firstName: true, lastName: true, email: true } }
        }
      });
      if (!project) throw new Error('Project not found');

      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          userId: userId!,
          type: 'PAYMENT',
          amount: parseFloat(amount),
          status: 'COMPLETED',
          description: `Payment for ${project.title}`,
          referenceId: `PAY-${Date.now()}`,
          gatewayProvider: paymentMethod
        }
      });

      // Send payment received email to client
      await emailService.sendPaymentReceivedConfirmation(
        user.email!,
        {
          recipientName: user.firstName,
          projectTitle: project.title,
          freelancerName: `${project.freelancer.firstName} ${project.freelancer.lastName}`,
          totalAmount: amount,
          milestoneTitle: milestoneId ? 'Milestone Payment' : undefined,
          paymentType: milestoneId ? 'Milestone' : 'Project',
          paymentDate: new Date().toLocaleDateString(),
          baseAmount: amount,
          paymentMethod: paymentMethod,
          transactionId: transaction.referenceId,
          hasNextMilestone: false,
          projectUrl: `${process.env.FRONTEND_URL}/projects/${projectId}`,
          receiptUrl: `${process.env.FRONTEND_URL}/billing/receipts/${transaction.id}`,
          billingUrl: `${process.env.FRONTEND_URL}/billing/history`
        }
      );

      res.json({ success: true, data: transaction });
    } catch (error) {
      logger.error('Payment processing error:', error);
      
      // Send payment failed email
      if (req.user?.id) {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (user) {
          await emailService.sendPaymentFailed(
            user.email!,
            {
              recipientName: user.firstName,
              projectTitle: req.body.projectTitle || 'Unknown Project',
              paymentAmount: req.body.amount || '0',
              attemptDate: new Date().toLocaleDateString(),
              failureReason: error instanceof Error ? error.message : 'Payment processing failed',
              paymentMethod: req.body.paymentMethod || 'Unknown',
              transactionId: `FAIL-${Date.now()}`,
              isInsufficientFunds: false,
              isCardDeclined: true,
              isNetworkError: false,
              isGenericError: true,
              retryPaymentUrl: `${process.env.FRONTEND_URL}/projects/${req.body.projectId}/payment`,
              paymentMethodsUrl: `${process.env.FRONTEND_URL}/billing/payment-methods`,
              supportUrl: `${process.env.FRONTEND_URL}/support`
            }
          );
        }
      }

      res.status(500).json({
        success: false,
        message: 'Payment processing failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async processWithdrawal(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { amount, bankAccountId } = req.body;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!bankAccount) throw new Error('Bank account not found');

      const processingFee = parseFloat(amount) * 0.01; // 1% processing fee
      const netAmount = parseFloat(amount) - processingFee;

      // Create withdrawal transaction
      const transaction = await prisma.transaction.create({
        data: {
          userId: userId!,
          type: 'WITHDRAWAL',
          amount: parseFloat(amount),
          status: 'COMPLETED',
          description: `Withdrawal to ${bankAccount.bankName}`,
          referenceId: `WTH-${Date.now()}`,
          gatewayProvider: 'Bank Transfer'
        }
      });

      // Send withdrawal processed email
      await emailService.sendWithdrawalProcessed(
        user.email!,
        {
          recipientName: user.firstName,
          withdrawalAmount: netAmount.toString(),
          requestedAmount: amount,
          processingFee: processingFee.toString(),
          requestDate: new Date().toLocaleDateString(),
          processedDate: new Date().toLocaleDateString(),
          bankName: bankAccount.bankName,
          accountName: EncryptionService.decrypt(bankAccount.accountName),
          maskedAccountNumber: '****' + EncryptionService.decrypt(bankAccount.accountNumber).slice(-4),
          transactionReference: transaction.referenceId,
          expectedArrival: '1-3 business days',
          balanceBefore: '0', // Would need to calculate from wallet
          remainingBalance: '0', // Would need to calculate from wallet
          hasEarningsWaiting: false,
          earningsUrl: `${process.env.FRONTEND_URL}/earnings`,
          withdrawalHistoryUrl: `${process.env.FRONTEND_URL}/billing/withdrawals`,
          bankAccountsUrl: `${process.env.FRONTEND_URL}/billing/bank-accounts`
        }
      );

      res.json({ success: true, data: transaction });
    } catch (error) {
      logger.error('Withdrawal processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Withdrawal processing failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async processRefund(req: AuthenticatedRequest, res: Response) {
    try {
      const { transactionId, refundAmount, reason } = req.body;

      // Mock refund processing
      const refund = {
        id: `refund_${Date.now()}`,
        originalTransactionId: transactionId,
        refundAmount: parseFloat(refundAmount),
        reason,
        status: 'PROCESSED',
        processedAt: new Date()
      };

      res.json({ success: true, data: refund });
    } catch (error) {
      logger.error('Refund processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Refund processing failed'
      });
    }
  }

  async detectSuspiciousTransaction(req: AuthenticatedRequest, res: Response) {
    try {
      const { transactionId, reason } = req.body;

      // Mock suspicious transaction flagging
      const flag = {
        id: `flag_${Date.now()}`,
        transactionId,
        reason,
        flaggedAt: new Date(),
        status: 'FLAGGED'
      };

      res.json({ success: true, data: flag });
    } catch (error) {
      logger.error('Transaction flagging error:', error);
      res.status(500).json({
        success: false,
        message: 'Transaction flagging failed'
      });
    }
  }
}