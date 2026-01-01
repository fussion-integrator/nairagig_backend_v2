import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { paystackService } from '../services/paystack.service'

const prisma = new PrismaClient()

export const subscriptionController = {
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
            isDefault: true
          }
        })
      }

      res.json({
        success: true,
        data: subscription
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

      const { planId } = req.body
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
      
      // Initialize Paystack payment
      const paymentData = await paystackService.initializeTransaction({
        email: userEmail,
        amount: Number(plan.price) * 100, // Convert to kobo
        metadata: {
          userId,
          planId,
          type: 'subscription'
        },
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/subscription/callback`
      })

      // Create pending subscription record
      const startDate = new Date()
      const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
      
      await prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: 'INCOMPLETE',
          currentPeriodStart: startDate,
          currentPeriodEnd: endDate,
          amount: plan.price,
          metadata: {
            paymentReference: paymentData.reference
          }
        }
      })

      res.json({
        success: true,
        data: {
          authorization_url: paymentData.data.authorization_url,
          reference: paymentData.data.reference
        }
      })
    } catch (error) {
      console.error('Initialize subscription error:', error)
      res.status(500).json({ success: false, message: 'Failed to initialize subscription' })
    }
  },

  // Verify subscription payment
  async verifySubscription(req: Request, res: Response) {
    try {
      const { reference } = req.params
      
      // Verify payment with Paystack
      const verification = await paystackService.verifyTransaction(reference)
      
      if (verification.data.status === 'success') {
        const { userId, planId } = verification.data.metadata
        
        // Update subscription status
        await prisma.subscription.updateMany({
          where: { 
            metadata: {
              path: ['paymentReference'],
              equals: reference
            },
            userId: parseInt(userId)
          },
          data: {
            status: 'ACTIVE'
          }
        })

        // Deactivate other subscriptions
        await prisma.subscription.updateMany({
          where: {
            userId: parseInt(userId),
            status: 'ACTIVE',
            NOT: {
              metadata: {
                path: ['paymentReference'],
                equals: reference
              }
            }
          },
          data: { status: 'CANCELED' }
        })

        res.json({
          success: true,
          message: 'Subscription activated successfully'
        })
      } else {
        res.status(400).json({
          success: false,
          message: 'Payment verification failed'
        })
      }
    } catch (error) {
      console.error('Verify subscription error:', error)
      res.status(500).json({ success: false, message: 'Verification failed' })
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