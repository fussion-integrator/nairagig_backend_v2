import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import axios from 'axios';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export class WalletController {
  async getWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      let wallet = await prisma.wallet.findUnique({
        where: {
          userId_currency: {
            userId,
            currency: 'NGN'
          }
        },
        include: {
          transactions: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            currency: 'NGN'
          },
          include: {
            transactions: true
          }
        });
      }

      res.json({
        success: true,
        data: wallet
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { page = 1, limit = 20, type, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };
      if (type) where.type = type;
      if (status) where.status = status;

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: {
            wallet: true
          }
        }),
        prisma.transaction.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async createTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const {
        type,
        amount,
        currency = 'NGN',
        description,
        referenceId,
        metadata
      } = req.body;

      const wallet = await prisma.wallet.findUnique({
        where: {
          userId_currency: {
            userId,
            currency
          }
        }
      });

      if (!wallet) {
        throw ApiError.notFound('Wallet not found');
      }

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type,
          amount,
          currency,
          description,
          referenceId,
          metadata,
          status: 'PENDING'
        }
      });

      logger.info(`Transaction created: ${transaction.id} for user: ${userId}`);

      res.status(201).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const transaction = await prisma.transaction.findUnique({
        where: { id: req.params.id },
        include: {
          wallet: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!transaction) {
        throw ApiError.notFound('Transaction not found');
      }

      if (transaction.userId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const transaction = await prisma.transaction.findUnique({
        where: { id: req.params.id }
      });

      if (!transaction) {
        throw ApiError.notFound('Transaction not found');
      }

      if (transaction.userId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      const updatedTransaction = await prisma.transaction.update({
        where: { id: req.params.id },
        data: req.body
      });

      if (req.body.status === 'COMPLETED' && transaction.type === 'CREDIT') {
        const walletId = transaction.walletId || '';
        await prisma.wallet.update({
          where: { id: walletId },
          data: {
            availableBalance: {
              increment: transaction.amount
            },
            totalEarned: {
              increment: transaction.amount
            }
          }
        });
      } else if (req.body.status === 'COMPLETED' && transaction.type === 'DEBIT') {
        const walletId = transaction.walletId || '';
        await prisma.wallet.update({
          where: { id: walletId },
          data: {
            availableBalance: {
              decrement: transaction.amount
            },
            totalWithdrawn: {
              increment: transaction.amount
            }
          }
        });
      }

      res.json({
        success: true,
        data: updatedTransaction
      });
    } catch (error) {
      next(error);
    }
  }

  async getPaymentMethods(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const paymentMethods = await prisma.paymentMethod.findMany({
        where: { 
          userId,
          status: 'ACTIVE'
        },
        orderBy: { isDefault: 'desc' }
      });

      res.json({
        success: true,
        data: paymentMethods
      });
    } catch (error) {
      next(error);
    }
  }

  async addPaymentMethod(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const {
        type,
        provider,
        bankName,
        bankCode,
        accountNumber,
        accountName,
        phoneNumber,
        networkProvider,
        isDefault
      } = req.body;

      if (isDefault) {
        await prisma.paymentMethod.updateMany({
          where: { 
            userId,
            isDefault: true
          },
          data: { isDefault: false }
        });
      }

      const paymentMethod = await prisma.paymentMethod.create({
        data: {
          userId,
          type,
          provider,
          bankName,
          bankCode,
          accountNumber,
          accountName,
          phoneNumber,
          networkProvider,
          isDefault: isDefault || false
        }
      });

      res.status(201).json({
        success: true,
        data: paymentMethod
      });
    } catch (error) {
      next(error);
    }
  }

  async initializeDeposit(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { amount, currency = 'NGN' } = req.body;

      if (!amount || amount <= 0) {
        throw ApiError.badRequest('Invalid amount');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          amount,
          currency,
          description: 'Wallet funding',
          status: 'PENDING'
        }
      });

      // Initialize Paystack payment
      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: user.email,
          amount: amount * 100, // Paystack expects amount in kobo
          currency,
          reference: transaction.id,
          callback_url: `${process.env.FRONTEND_URL}/wallet?payment=success`,
          metadata: {
            userId,
            transactionId: transaction.id,
            type: 'wallet_funding'
          }
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Update transaction with Paystack reference
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          gatewayReference: paystackResponse.data.data.reference,
          gatewayProvider: 'paystack'
        }
      });

      res.json({
        success: true,
        data: {
          transactionId: transaction.id,
          paymentUrl: paystackResponse.data.data.authorization_url,
          reference: paystackResponse.data.data.reference
        }
      });
    } catch (error) {
      logger.error('Deposit initialization failed:', error);
      next(error);
    }
  }

  async initializeWithdrawal(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { amount, paymentMethodId, currency = 'NGN' } = req.body;

      if (!amount || amount <= 0) {
        throw ApiError.badRequest('Invalid amount');
      }

      // Check wallet balance
      const wallet = await prisma.wallet.findUnique({
        where: {
          userId_currency: {
            userId,
            currency
          }
        }
      });

      if (!wallet || wallet.availableBalance < amount) {
        throw ApiError.badRequest('Insufficient balance');
      }

      // Get payment method
      const paymentMethod = await prisma.paymentMethod.findFirst({
        where: {
          id: paymentMethodId,
          userId,
          status: 'ACTIVE'
        }
      });

      if (!paymentMethod) {
        throw ApiError.notFound('Payment method not found');
      }

      // Create withdrawal transaction
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount,
          currency,
          description: `Withdrawal to ${paymentMethod.bankName} - ${paymentMethod.accountNumber}`,
          status: 'PROCESSING',
          metadata: {
            paymentMethodId,
            bankName: paymentMethod.bankName,
            accountNumber: paymentMethod.accountNumber,
            accountName: paymentMethod.accountName
          }
        }
      });

      // Update wallet balance (move to pending)
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: {
            decrement: amount
          },
          pendingBalance: {
            increment: amount
          }
        }
      });

      // In production, integrate with Paystack Transfer API
      // For now, we'll mark as completed after a delay
      setTimeout(async () => {
        try {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              status: 'COMPLETED',
              processedAt: new Date()
            }
          });

          await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              pendingBalance: {
                decrement: amount
              },
              totalWithdrawn: {
                increment: amount
              }
            }
          });
        } catch (error) {
          logger.error('Withdrawal completion failed:', error);
        }
      }, 5000); // 5 second delay for demo

      res.json({
        success: true,
        data: {
          transactionId: transaction.id,
          message: 'Withdrawal initiated successfully'
        }
      });
    } catch (error) {
      logger.error('Withdrawal initialization failed:', error);
      next(error);
    }
  }
}