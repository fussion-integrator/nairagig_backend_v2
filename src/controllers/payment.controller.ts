import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { paystackService } from '@/services/paystack.service';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import crypto from 'crypto';
import { config } from '@/config/config';

export class PaymentController {
  async initializePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { amount, type, metadata, paymentMethod } = req.body;

      if (!amount || amount <= 0) {
        throw ApiError.badRequest('Invalid amount');
      }

      if (!type || !['WALLET_FUNDING', 'PROJECT_PAYMENT'].includes(type)) {
        throw ApiError.badRequest('Invalid payment type');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Get user's current wallet balance in real-time
      const wallet = await prisma.wallet.findFirst({
        where: { 
          userId,
          currency: 'NGN'
        }
      });
      
      const walletBalance = wallet?.availableBalance || 0;
      const paymentAmount = Number(amount);
      const hasWalletFunds = Number(walletBalance) >= paymentAmount;
      
      // For project payments, check if user has sufficient wallet funds
      if (type === 'PROJECT_PAYMENT' && !paymentMethod && hasWalletFunds) {
        return res.json({
          success: true,
          requiresPaymentMethod: true,
          data: {
            paymentAmount,
            walletBalance: Number(walletBalance),
            hasWalletFunds,
            paymentOptions: [
              {
                method: 'wallet',
                label: 'Pay from Wallet',
                available: true,
                balance: Number(walletBalance)
              },
              {
                method: 'paystack',
                label: 'Pay with Card/Bank',
                available: true
              }
            ]
          }
        });
      }
      
      // Handle wallet payment for project payments
      if (paymentMethod === 'wallet' && type === 'PROJECT_PAYMENT') {
        if (!hasWalletFunds) {
          throw ApiError.badRequest(`Insufficient wallet balance. Required: ₦${paymentAmount.toLocaleString()}, Available: ₦${Number(walletBalance).toLocaleString()}`);
        }
        
        // Create completed transaction
        const transaction = await prisma.transaction.create({
          data: {
            userId,
            walletId: wallet!.id,
            amount: paymentAmount,
            type: 'PAYMENT',
            status: 'COMPLETED',
            description: 'Project payment from wallet',
            processedAt: new Date(),
            gatewayProvider: 'WALLET',
            metadata: {
              paymentType: type,
              paymentMethod: 'wallet',
              ...metadata
            }
          }
        });
        
        // Deduct from wallet
        await prisma.wallet.update({
          where: { id: wallet!.id },
          data: {
            availableBalance: {
              decrement: paymentAmount
            }
          }
        });
        
        // Process the payment (e.g., update project milestone)
        await this.processSuccessfulPayment(transaction);
        
        logger.info(`Wallet payment processed: ${transaction.id} for user ${userId}`);
        
        return res.json({
          success: true,
          message: 'Payment processed successfully from wallet',
          data: {
            transactionId: transaction.id,
            paymentMethod: 'wallet',
            amountPaid: paymentAmount,
            newWalletBalance: Number(walletBalance) - paymentAmount
          }
        });
      }

      // Handle Paystack payment (existing logic)
      const reference = paystackService.generateReference();
      const amountInKobo = paystackService.convertToKobo(amount);

      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          amount,
          type: type === 'WALLET_FUNDING' ? 'DEPOSIT' : 'PAYMENT',
          status: 'PENDING',
          description: type === 'WALLET_FUNDING' ? 'Wallet funding' : 'Project payment',
          referenceId: reference,
          gatewayProvider: 'PAYSTACK',
          metadata: {
            paymentType: type,
            paymentMethod: 'paystack',
            ...metadata
          }
        }
      });

      // Initialize Paystack transaction
      const paystackResponse = await paystackService.initializeTransaction({
        email: user.email,
        amount: amountInKobo,
        reference,
        callback_url: `${config.frontendUrl}/payment/callback`,
        metadata: {
          userId,
          transactionId: transaction.id,
          type,
          ...metadata
        }
      });

      logger.info(`Payment initialized: ${reference} for user ${userId}`);

      res.json({
        success: true,
        data: {
          transactionId: transaction.id,
          reference,
          authorizationUrl: paystackResponse.data.authorization_url,
          accessCode: paystackResponse.data.access_code,
          paymentMethod: 'paystack'
        }
      });
    } catch (error) {
      logger.error('Payment initialization error:', error);
      next(error);
    }
  }

  async verifyPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { reference } = req.params;

      if (!reference) {
        throw ApiError.badRequest('Payment reference is required');
      }

      // Verify with Paystack
      const paystackResponse = await paystackService.verifyTransaction(reference);

      if (!paystackResponse.status) {
        throw ApiError.badRequest('Payment verification failed');
      }

      const { data } = paystackResponse;

      // Find transaction in database
      const transaction = await prisma.transaction.findUnique({
        where: { referenceId: reference },
        include: { user: true }
      });

      if (!transaction) {
        throw ApiError.notFound('Transaction not found');
      }

      // Check if already processed
      if (transaction.status === 'COMPLETED') {
        return res.json({
          success: true,
          message: 'Payment already processed',
          data: { transaction }
        });
      }

      // Update transaction status
      const updatedTransaction = await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: data.status === 'success' ? 'COMPLETED' : 'FAILED',
          processedAt: new Date(),
          gatewayResponse: data,
          gatewayFee: paystackService.convertFromKobo(data.fees || 0),
          netAmount: paystackService.convertFromKobo(data.amount - (data.fees || 0))
        }
      });

      // Process successful payment
      if (data.status === 'success') {
        await this.processSuccessfulPayment(updatedTransaction);
      }

      logger.info(`Payment verified: ${reference} - Status: ${data.status}`);

      res.json({
        success: true,
        data: { 
          transaction: updatedTransaction,
          paymentStatus: data.status 
        }
      });
    } catch (error) {
      logger.error('Payment verification error:', error);
      next(error);
    }
  }

  async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate webhook signature
      const signature = req.headers['x-paystack-signature'] as string;
      if (!signature) {
        logger.warn('Webhook received without signature');
        throw ApiError.unauthorized('Missing webhook signature');
      }

      const hash = crypto
        .createHmac('sha512', config.paystack.secretKey)
        .update(JSON.stringify(req.body))
        .digest('hex');

      // Use constant-time comparison to prevent timing attacks
      if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
        logger.warn('Invalid webhook signature received');
        throw ApiError.unauthorized('Invalid webhook signature');
      }

      const { event, data } = req.body;
      logger.info(`Paystack webhook received: ${event}`);

      if (event === 'charge.success') {
        await this.processSuccessfulWebhookPayment(data);
      } else if (event === 'charge.failed') {
        await this.processFailedWebhookPayment(data);
      }

      res.status(200).send('OK');
    } catch (error) {
      logger.error('Webhook processing error');
      res.status(200).send('OK'); // Always return 200 to Paystack
    }
  }

  private async processSuccessfulWebhookPayment(data: any) {
    const transaction = await prisma.transaction.findUnique({
      where: { referenceId: data.reference }
    });

    if (!transaction || transaction.status === 'COMPLETED') {
      logger.info(`Transaction already processed or not found: ${data.reference}`);
      return;
    }

    // Update transaction
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        gatewayResponse: data,
        gatewayFee: paystackService.convertFromKobo(data.fees || 0),
        netAmount: paystackService.convertFromKobo(data.amount - (data.fees || 0)),
        gatewayReference: data.id?.toString()
      }
    });

    await this.processSuccessfulPayment(updatedTransaction);
    logger.info(`Webhook payment processed: ${data.reference}`);
  }

  private async processFailedWebhookPayment(data: any) {
    const transaction = await prisma.transaction.findUnique({
      where: { referenceId: data.reference }
    });

    if (!transaction) {
      logger.info(`Transaction not found for failed payment: ${data.reference}`);
      return;
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'FAILED',
        processedAt: new Date(),
        gatewayResponse: data,
        failureReason: data.gateway_response || 'Payment failed'
      }
    });

    // Create failure notification
    await prisma.notification.create({
      data: {
        userId: transaction.userId,
        type: 'PAYMENT',
        title: 'Payment Failed',
        message: `Your payment of ₦${transaction.amount.toLocaleString()} could not be processed.`,
        priority: 'NORMAL'
      }
    });

    logger.info(`Failed payment processed: ${data.reference}`);
  }

  private async processSuccessfulPayment(transaction: any) {
    const metadata = transaction.metadata as any;

    if (metadata?.paymentType === 'WALLET_FUNDING') {
      // Update wallet balance
      await prisma.wallet.upsert({
        where: { 
          userId_currency: { 
            userId: transaction.userId, 
            currency: 'NGN' 
          } 
        },
        update: {
          availableBalance: {
            increment: transaction.netAmount || transaction.amount
          },
          totalEarned: {
            increment: transaction.netAmount || transaction.amount
          },
          updatedAt: new Date()
        },
        create: {
          userId: transaction.userId,
          currency: 'NGN',
          availableBalance: transaction.netAmount || transaction.amount,
          totalEarned: transaction.netAmount || transaction.amount
        }
      });

      logger.info(`Wallet funded: ${transaction.userId} - Amount: ₦${transaction.amount}`);
    } else if (metadata?.paymentType === 'PROJECT_PAYMENT') {
      // Handle project payment
      const projectId = metadata.projectId;
      if (projectId) {
        // Update project payment status or milestone
        await prisma.project.update({
          where: { id: projectId },
          data: {
            // Add project-specific payment logic here
            updatedAt: new Date()
          }
        });

        // If it's a milestone payment
        if (metadata.milestoneId) {
          await prisma.projectMilestone.update({
            where: { id: metadata.milestoneId },
            data: {
              status: 'PAID',
              paidAt: new Date()
            }
          });
        }

        logger.info(`Project payment processed: ${projectId} - Amount: ₦${transaction.amount}`);
      }
    }

    // Create success notification
    await prisma.notification.create({
      data: {
        userId: transaction.userId,
        type: 'PAYMENT',
        title: 'Payment Successful',
        message: `Your payment of ₦${transaction.amount.toLocaleString()} has been processed successfully.`,
        priority: 'NORMAL',
        data: {
          transactionId: transaction.id,
          reference: transaction.referenceId,
          amount: transaction.amount,
          type: metadata?.paymentType || 'PAYMENT'
        }
      }
    });

    // Log transaction for audit
    logger.info(`Payment processed successfully`, {
      transactionId: transaction.id,
      userId: transaction.userId,
      amount: transaction.amount,
      reference: transaction.referenceId,
      type: metadata?.paymentType
    });
  }

  async getPaymentHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
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
          orderBy: { createdAt: 'desc' }
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

  async checkWalletBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { amount } = req.query;

      // Get user's current wallet balance in real-time
      const wallet = await prisma.wallet.findFirst({
        where: { 
          userId,
          currency: 'NGN'
        }
      });
      
      const walletBalance = wallet?.availableBalance || 0;
      const requiredAmount = amount ? Number(amount) : 0;
      const hasWalletFunds = Number(walletBalance) >= requiredAmount;
      
      res.json({
        success: true,
        data: {
          walletBalance: Number(walletBalance),
          requiredAmount,
          hasWalletFunds,
          shortfall: hasWalletFunds ? 0 : requiredAmount - Number(walletBalance),
          paymentOptions: [
            {
              method: 'wallet',
              label: 'Pay from Wallet',
              available: hasWalletFunds,
              balance: Number(walletBalance)
            },
            {
              method: 'paystack',
              label: 'Pay with Card/Bank',
              available: true
            }
          ]
        }
      });
    } catch (error) {
      next(error);
    }
  }
}