import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

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
            balance: {
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
}