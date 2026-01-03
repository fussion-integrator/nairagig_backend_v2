import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { paystackService } from '../services/paystack.service'

const prisma = new PrismaClient()

export const subscriptionController = {
  // Check wallet balance for subscription payment
  async checkWalletBalance(req: Request, res: Response) {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' })
      }

      const { planId } = req.query
      if (!planId) {
        return res.status(400).json({ success: false, message: 'Plan ID is required' })
      }

      // Get plan from database
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { name: planId as string }
      })
      
      if (!plan || !plan.isActive) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive plan' })
      }

      // Get user's current wallet balance in real-time
      const wallet = await prisma.wallet.findFirst({
        where: { 
          userId,
          currency: 'NGN'
        }
      })
      
      const walletBalance = wallet?.availableBalance || 0
      const planAmount = Number(plan.price)
      const hasWalletFunds = walletBalance >= planAmount
      
      res.json({
        success: true,
        data: {
          planAmount,
          walletBalance: Number(walletBalance),
          hasWalletFunds,
          shortfall: hasWalletFunds ? 0 : planAmount - Number(walletBalance),
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
      })
    } catch (error) {
      console.error('Check wallet balance error:', error)
      res.status(500).json({ success: false, message: 'Internal server error' })
    }
  },

  // Get subscription plans
  async getPlans(req: Request, res: Response) {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      })

      res.json({
        success: true,
        data: plans
      })
    } catch (error) {
      console.error('Get plans error:', error)
      res.status(500).json({ success: false, message: 'Internal server error' })
    }
  },

  // Get current subscription
  async getCurrentSubscription(req: Request, res: Response) {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' })
      }

      const subscription = await prisma.subscription.findFirst({
        where: { 
          userId,
          status: 'ACTIVE'
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      })

      // If no active subscription, return free plan as default
      if (!subscription) {
        const freePlan = await prisma.subscriptionPlan.findUnique({
          where: { name: 'free' }
        })
        
        return res.json({
          success: true,
          data: {
            planId: freePlan?.id,
            plan: freePlan,
            status: 'ACTIVE',
            isDefault: true,
            canAccessSponsorship: false
          }
        })
      }

      // Check if user can access sponsorship features
      const currentPlan = subscription.plan.name
      const canAccessSponsorship = ['pro', 'enterprise'].includes(currentPlan)

      res.json({
        success: true,
        data: {
          ...subscription,
          canAccessSponsorship
        }
      })
    } catch (error) {
      console.error('Get subscription error:', error)
      res.status(500).json({ success: false, message: 'Internal server error' })
    }
  },

  // Initialize subscription payment
  async initializeSubscription(req: Request, res: Response) {
    try {
      const userId = req.user?.id
      const userEmail = req.user?.email
      if (!userId || !userEmail) {
        return res.status(401).json({ success: false, message: 'Unauthorized' })
      }

      const { planId, paymentMethod } = req.body
      if (!planId) {
        return res.status(400).json({ success: false, message: 'Plan ID is required' })
      }

      // Get plan from database
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { name: planId }
      })
      
      if (!plan || !plan.isActive) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive plan' })
      }
      
      // Get user's current wallet balance in real-time
      const wallet = await prisma.wallet.findFirst({
        where: { 
          userId,
          currency: 'NGN'
        }
      })
      
      const walletBalance = wallet?.availableBalance || 0
      const planAmount = Number(plan.price)
      const hasWalletFunds = walletBalance >= planAmount
      
      // If no payment method specified and user has sufficient wallet funds, return payment options
      if (!paymentMethod && hasWalletFunds) {
        return res.json({
          success: true,
          requiresPaymentMethod: true,
          data: {
            planAmount,
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
        })
      }
      
      // Handle wallet payment
      if (paymentMethod === 'wallet') {
        if (!hasWalletFunds) {
          return res.status(400).json({ 
            success: false, 
            message: 'Insufficient wallet balance',
            data: {
              required: planAmount,
              available: Number(walletBalance),
              shortfall: planAmount - Number(walletBalance)
            }
          })
        }
        
        // Process wallet payment immediately
        const startDate = new Date()
        const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)
        
        // Create active subscription
        const subscription = await prisma.subscription.create({
          data: {
            userId,
            planId: plan.id,
            status: 'ACTIVE',
            currentPeriodStart: startDate,
            currentPeriodEnd: endDate,
            amount: plan.price,
            lastBillingDate: new Date(),
            nextBillingDate: endDate,
            metadata: {
              paymentMethod: 'wallet',
              paidAt: new Date().toISOString()
            }
          }
        })
        
        // Deduct from wallet
        await prisma.wallet.update({
          where: { id: wallet!.id },
          data: {
            availableBalance: {
              decrement: planAmount
            }
          }
        })
        
        // Create transaction record
        await prisma.transaction.create({
          data: {
            userId,
            walletId: wallet!.id,
            amount: planAmount,
            type: 'DEBIT',
            status: 'COMPLETED',
            description: `Subscription payment for ${plan.displayName}`,
            processedAt: new Date(),
            metadata: {
              subscriptionId: subscription.id,
              planId: plan.id,
              paymentMethod: 'wallet'
            }
          }
        })
        
        // Update user subscription tier
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: plan.name,
            subscriptionExpiresAt: endDate
          }
        })
        
        // Deactivate other subscriptions
        await prisma.subscription.updateMany({
          where: {
            userId,
            status: 'ACTIVE',
            id: { not: subscription.id }
          },
          data: { status: 'CANCELED' }
        })
        
        // Create payment history
        await prisma.paymentHistory.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            amount: plan.price,
            currency: 'NGN',
            type: 'SUBSCRIPTION',
            status: 'PAID',
            description: `Wallet payment for ${plan.displayName}`,
            paidAt: new Date(),
            metadata: {
              paymentMethod: 'wallet',
              walletId: wallet!.id
            }
          }
        })
        
        return res.json({
          success: true,
          message: 'Subscription activated successfully via wallet payment',
          data: {
            subscriptionId: subscription.id,
            planName: plan.name,
            status: 'ACTIVE',
            paymentMethod: 'wallet',
            amountPaid: planAmount,
            newWalletBalance: Number(walletBalance) - planAmount
          }
        })
      }
      
      // Handle Paystack payment (existing logic)
      const reference = paystackService.generateReference()
      
      const paymentData = await paystackService.initializeTransaction({
        email: userEmail,
        amount: planAmount * 100, // Convert to kobo
        reference,
        metadata: {
          userId,
          planId,
          type: 'subscription'
        },
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/subscription/callback`
      })

      // Create pending subscription record
      const startDate = new Date()
      const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)
      
      await prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: 'INCOMPLETE',
          currentPeriodStart: startDate,
          currentPeriodEnd: endDate,
          amount: plan.price,
          metadata: {
            paymentReference: reference,
            paymentMethod: 'paystack'
          }
        }
      })

      res.json({
        success: true,
        data: {
          authorization_url: paymentData.data.authorization_url,
          reference: reference,
          paymentMethod: 'paystack'
        }
      })
    } catch (error) {
      console.error('Initialize subscription error:', error)
      res.status(500).json({ 
        success: false, 
        message: 'Failed to initialize subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  // Verify subscription payment
  async verifySubscription(req: Request, res: Response) {
    try {
      const { reference } = req.params
      
      if (!reference) {
        return res.status(400).json({ success: false, message: 'Payment reference is required' })
      }
      
      // Verify payment with Paystack
      const verification = await paystackService.verifyTransaction(reference)
      
      if (!verification.status) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed'
        })
      }
      
      if (verification.data.status === 'success') {
        const { userId, planId, type } = verification.data.metadata
        
        if (type !== 'subscription') {
          return res.status(400).json({
            success: false,
            message: 'Invalid payment type'
          })
        }
        
        // Find the subscription by payment reference
        const subscription = await prisma.subscription.findFirst({
          where: {
            metadata: {
              path: ['paymentReference'],
              equals: reference
            }
          }
        })
        
        if (!subscription) {
          return res.status(404).json({
            success: false,
            message: 'Subscription not found'
          })
        }
        
        // Update subscription status
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            lastBillingDate: new Date(),
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        })

        // Deactivate other active subscriptions for this user
        await prisma.subscription.updateMany({
          where: {
            userId: subscription.userId,
            status: 'ACTIVE',
            id: { not: subscription.id }
          },
          data: { status: 'CANCELED' }
        })
        
        // Update user subscription tier
        const plan = await prisma.subscriptionPlan.findUnique({
          where: { id: subscription.planId }
        })
        
        if (plan) {
          await prisma.user.update({
            where: { id: subscription.userId },
            data: {
              subscriptionTier: plan.name,
              subscriptionExpiresAt: subscription.currentPeriodEnd
            }
          })
        }
        
        // Create payment history record
        await prisma.paymentHistory.create({
          data: {
            userId: subscription.userId,
            subscriptionId: subscription.id,
            amount: subscription.amount,
            currency: 'NGN',
            type: 'SUBSCRIPTION',
            status: 'PAID',
            description: `Subscription payment for ${plan?.displayName || 'plan'}`,
            gatewayProvider: 'PAYSTACK',
            gatewayReference: reference,
            gatewayResponse: verification.data,
            paidAt: new Date()
          }
        })

        res.json({
          success: true,
          message: 'Subscription activated successfully',
          data: {
            subscriptionId: subscription.id,
            planName: plan?.name,
            status: 'ACTIVE'
          }
        })
      } else {
        // Update subscription to failed status
        await prisma.subscription.updateMany({
          where: {
            metadata: {
              path: ['paymentReference'],
              equals: reference
            }
          },
          data: { status: 'UNPAID' }
        })
        
        res.status(400).json({
          success: false,
          message: `Payment ${verification.data.status}: ${verification.data.gateway_response || 'Payment was not successful'}`
        })
      }
    } catch (error) {
      console.error('Verify subscription error:', error)
      res.status(500).json({ 
        success: false, 
        message: 'Verification failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  // Cancel subscription
  async cancelSubscription(req: Request, res: Response) {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' })
      }

      await prisma.subscription.updateMany({
        where: {
          userId,
          status: 'ACTIVE'
        },
        data: {
          status: 'CANCELED',
          canceledAt: new Date()
        }
      })

      res.json({
        success: true,
        message: 'Subscription cancelled successfully'
      })
    } catch (error) {
      console.error('Cancel subscription error:', error)
      res.status(500).json({ success: false, message: 'Failed to cancel subscription' })
    }
  },

  // Get subscription history
  async getSubscriptionHistory(req: Request, res: Response) {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' })
      }

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 10
      const skip = (page - 1) * limit

      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where: { userId },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.subscription.count({ where: { userId } })
      ])

      res.json({
        success: true,
        data: {
          subscriptions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      })
    } catch (error) {
      console.error('Get subscription history error:', error)
      res.status(500).json({ success: false, message: 'Internal server error' })
    }
  }
}