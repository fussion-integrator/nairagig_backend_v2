import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { emailService } from '../services/email.service';

const prisma = new PrismaClient();

export class ReferralController {
  async generateReferralCode(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user already has a referral code
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true, firstName: true, lastName: true }
      });

      if (user?.referralCode) {
        return res.json({
          success: true,
          data: { referralCode: user.referralCode }
        });
      }

      // Generate unique referral code
      const baseCode = `${user?.firstName?.slice(0, 2) || 'NG'}${user?.lastName?.slice(0, 2) || 'GIG'}`.toUpperCase();
      const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const referralCode = `${baseCode}${randomSuffix}`;

      // Update user with referral code
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode }
      });

      res.json({
        success: true,
        data: { referralCode }
      });
    } catch (error) {
      console.error('Generate referral code error:', error);
      res.status(500).json({ error: 'Failed to generate referral code' });
    }
  }

  async processReferralSignup(req: Request, res: Response) {
    try {
      const { referralCode, newUserId } = req.body;

      if (!referralCode || !newUserId) {
        return res.status(400).json({ error: 'Referral code and new user ID required' });
      }

      // Find referrer by code
      const referrer = await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true, firstName: true, email: true }
      });

      if (!referrer) {
        return res.status(404).json({ error: 'Invalid referral code' });
      }

      // Check if new user exists and hasn't been referred before
      const newUser = await prisma.user.findUnique({
        where: { id: newUserId }
      });

      if (!newUser) {
        return res.status(404).json({ error: 'New user not found' });
      }

      // Check if referral already exists
      const existingReferral = await prisma.referral.findFirst({
        where: { refereeId: newUserId }
      });

      if (existingReferral) {
        return res.status(400).json({ error: 'User already referred' });
      }

      // Create referral record
      const referral = await prisma.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: newUserId,
          referralCode,
          status: 'PENDING',
          rewardAmount: 200, // ₦200 reward
          metadata: {
            signupDate: new Date().toISOString(),
            platform: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'web'
          }
        }
      });

      // Create pending reward for referrer
      await prisma.reward.create({
        data: {
          userId: referrer.id,
          type: 'REFERRAL',
          action: 'REFERRAL_SIGNUP',
          amount: 200,
          points: 100,
          status: 'PENDING',
          metadata: {
            referralId: referral.id,
            refereeId: newUserId,
            referralCode
          }
        }
      });

      res.json({
        success: true,
        data: { referralId: referral.id }
      });
    } catch (error) {
      console.error('Process referral signup error:', error);
      res.status(500).json({ error: 'Failed to process referral' });
    }
  }

  async getUserReferrals(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const referrals = await prisma.referral.findMany({
        where: { referrerId: userId },
        include: {
          referee: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              createdAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const stats = {
        totalReferrals: referrals.length,
        completedReferrals: referrals.filter(r => r.status === 'COMPLETED').length,
        pendingReferrals: referrals.filter(r => r.status === 'PENDING').length,
        totalEarnings: referrals.reduce((sum, r) => sum + Number(r.rewardAmount), 0),
        paidEarnings: referrals.filter(r => r.rewardPaid).reduce((sum, r) => sum + Number(r.rewardAmount), 0)
      };

      res.json({
        success: true,
        data: { referrals, stats }
      });
    } catch (error) {
      console.error('Get user referrals error:', error);
      res.status(500).json({ error: 'Failed to fetch referrals' });
    }
  }

  async getReferralChallenge(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get user's referral code
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true }
      });

      // Get all referrals
      const referrals = await prisma.referral.findMany({
        where: { referrerId: userId },
        include: {
          referee: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              createdAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Get claim history
      const claimHistory = await prisma.transaction.findMany({
        where: {
          userId,
          description: { contains: 'Referral challenge claim' },
          type: 'CREDIT',
          status: 'COMPLETED'
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const completedReferrals = referrals.filter(r => r.status === 'COMPLETED').length;
      const pendingReferrals = referrals.filter(r => r.status === 'PENDING').length;
      
      // Calculate multiplier and earnings
      const { multiplier, nextTierReferrals, nextTierMultiplier } = calculateReferralMultiplier(completedReferrals);
      
      // Calculate accumulated amount (unclaimed earnings)
      const totalClaimedAmount = claimHistory.reduce((sum, tx) => sum + Number(tx.amount), 0);
      const totalPossibleEarnings = completedReferrals * 200 * multiplier;
      const accumulatedAmount = totalPossibleEarnings - totalClaimedAmount;

      res.json({
        success: true,
        data: {
          referralCode: user?.referralCode,
          stats: {
            totalReferrals: referrals.length,
            completedReferrals,
            pendingReferrals,
            currentMultiplier: multiplier,
            nextTierReferrals,
            nextTierMultiplier,
            accumulatedAmount: Math.max(0, accumulatedAmount),
            totalClaimed: totalClaimedAmount,
            baseReward: 200
          },
          referrals: referrals.map(r => ({
            id: r.id,
            referee: {
              name: `${r.referee.firstName} ${r.referee.lastName}`,
              email: r.referee.email
            },
            status: r.status,
            rewardAmount: r.rewardAmount,
            createdAt: r.createdAt,
            completedAt: r.completedAt
          })),
          claimHistory: claimHistory.map(tx => ({
            id: tx.id,
            amount: tx.amount,
            description: tx.description,
            claimedAt: tx.createdAt
          }))
        }
      });
    } catch (error) {
      console.error('Get referral challenge error:', error);
      res.status(500).json({ error: 'Failed to fetch referral challenge data' });
    }
  }

  async claimReferralReward(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get completed referrals count
      const completedReferrals = await prisma.referral.count({
        where: {
          referrerId: userId,
          status: 'COMPLETED'
        }
      });

      if (completedReferrals === 0) {
        return res.status(400).json({ error: 'No completed referrals to claim' });
      }

      // Get previous claims
      const previousClaims = await prisma.transaction.findMany({
        where: {
          userId,
          description: { contains: 'Referral challenge claim' },
          type: 'CREDIT',
          status: 'COMPLETED'
        }
      });

      const totalClaimedAmount = previousClaims.reduce((sum, tx) => sum + Number(tx.amount), 0);
      const { multiplier } = calculateReferralMultiplier(completedReferrals);
      const totalEarnings = completedReferrals * 200 * multiplier;
      const claimableAmount = totalEarnings - totalClaimedAmount;

      if (claimableAmount <= 0) {
        return res.status(400).json({ error: 'No amount available to claim' });
      }

      // Get or create wallet
      let wallet = await prisma.wallet.findFirst({
        where: { userId }
      });

      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            availableBalance: 0,
            currency: 'NGN'
          }
        });
      }

      // Create transaction and update wallet
      await prisma.$transaction(async (tx) => {
        // Update wallet balance
        await tx.wallet.update({
          where: { id: wallet!.id },
          data: {
            availableBalance: {
              increment: claimableAmount
            },
            totalEarned: {
              increment: claimableAmount
            }
          }
        });

        // Create transaction record
        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet!.id,
            amount: claimableAmount,
            type: 'CREDIT',
            status: 'COMPLETED',
            description: `Referral challenge claim - ${completedReferrals} referrals with ${multiplier}x multiplier`,
            processedAt: new Date(),
            metadata: {
              referralCount: completedReferrals,
              multiplier,
              baseReward: 200,
              type: 'referral_challenge_claim'
            }
          }
        });
      });

      // Send notification
      await prisma.notification.create({
        data: {
          userId,
          title: 'Referral Reward Claimed!',
          message: `You've successfully claimed ₦${claimableAmount.toLocaleString()} from your referral challenge!`,
          type: 'SYSTEM'
        }
      });

      // Get user details for email
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          email: true
        }
      });

      // Send email notification
      if (user) {
        const { nextTierReferrals, nextTierMultiplier } = calculateReferralMultiplier(completedReferrals);
        
        await emailService.sendReferralRewardClaimed(user.email, {
          userName: `${user.firstName} ${user.lastName}`,
          userEmail: user.email,
          claimedAmount,
          referralCount: completedReferrals,
          multiplier,
          rewardPerReferral: 200 * multiplier,
          newBalance: Number(wallet.availableBalance) + claimableAmount,
          claimDate: new Date().toLocaleDateString(),
          nextTierReferrals,
          nextTierMultiplier,
          walletUrl: `${process.env.FRONTEND_URL}/wallet`,
          referralUrl: `${process.env.FRONTEND_URL}/challenges`
        });
      }

      res.json({
        success: true,
        data: {
          claimedAmount,
          newBalance: (Number(wallet.availableBalance) + claimableAmount),
          multiplier,
          referralCount: completedReferrals
        }
      });
    } catch (error) {
      console.error('Claim referral reward error:', error);
      res.status(500).json({ error: 'Failed to claim referral reward' });
    }
  }

  private calculateReferralMultiplier(referralCount: number) {
    // Multiplier tiers - cost-effective progression
    const tiers = [
      { min: 0, max: 2, multiplier: 1.0 },      // 0-2 referrals: 1x (₦1,000 each)
      { min: 3, max: 5, multiplier: 1.2 },      // 3-5 referrals: 1.2x (₦1,200 each)
      { min: 6, max: 10, multiplier: 1.5 },     // 6-10 referrals: 1.5x (₦1,500 each)
      { min: 11, max: 20, multiplier: 1.8 },    // 11-20 referrals: 1.8x (₦1,800 each)
      { min: 21, max: 50, multiplier: 2.0 },    // 21-50 referrals: 2x (₦2,000 each)
      { min: 51, max: 100, multiplier: 2.5 },   // 51-100 referrals: 2.5x (₦2,500 each)
      { min: 101, max: Infinity, multiplier: 3.0 } // 100+ referrals: 3x (₦3,000 each)
    ];

    const currentTier = tiers.find(tier => referralCount >= tier.min && referralCount <= tier.max);
    const nextTier = tiers.find(tier => tier.min > referralCount);

    return {
      multiplier: currentTier?.multiplier || 1.0,
      nextTierReferrals: nextTier?.min || null,
      nextTierMultiplier: nextTier?.multiplier || null
    };
  }

  async validateReferralCode(req: Request, res: Response) {
    try {
      const { code } = req.params;

      const referrer = await prisma.user.findUnique({
        where: { referralCode: code },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImageUrl: true
        }
      });

      if (!referrer) {
        return res.status(404).json({
          success: false,
          error: 'Invalid referral code'
        });
      }

      res.json({
        success: true,
        data: {
          valid: true,
          referrer: {
            name: `${referrer.firstName} ${referrer.lastName}`,
            avatar: referrer.profileImageUrl
          }
        }
      });
    } catch (error) {
      console.error('Validate referral code error:', error);
      res.status(500).json({ error: 'Failed to validate referral code' });
    }
  }

  async completeReferral(req: Request, res: Response) {
    try {
      const { referralId } = req.params;

      const referral = await prisma.referral.findUnique({
        where: { id: referralId },
        include: { referrer: true, referee: true }
      });

      if (!referral) {
        return res.status(404).json({ error: 'Referral not found' });
      }

      if (referral.status === 'COMPLETED') {
        return res.status(400).json({ error: 'Referral already completed' });
      }

      // Update referral status
      await prisma.referral.update({
        where: { id: referralId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      // Complete the reward
      await prisma.reward.updateMany({
        where: {
          userId: referral.referrerId,
          metadata: {
            path: ['referralId'],
            equals: referralId
          }
        },
        data: { status: 'COMPLETED' }
      });

      // Add bonus to referrer's wallet
      const wallet = await prisma.wallet.findFirst({
        where: { userId: referral.referrerId }
      });

      if (wallet) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            availableBalance: {
              increment: referral.rewardAmount
            },
            totalEarned: {
              increment: referral.rewardAmount
            }
          }
        });

        // Create transaction record
        await prisma.transaction.create({
          data: {
            userId: referral.referrerId,
            walletId: wallet.id,
            amount: referral.rewardAmount,
            type: 'CREDIT',
            status: 'COMPLETED',
            description: `Referral bonus for ${referral.referee.firstName} ${referral.referee.lastName}`,
            processedAt: new Date(),
            metadata: {
              referralId,
              refereeId: referral.refereeId,
              type: 'referral_bonus'
            }
          }
        });
      }

      res.json({
        success: true,
        message: 'Referral completed successfully'
      });
    } catch (error) {
      console.error('Complete referral error:', error);
      res.status(500).json({ error: 'Failed to complete referral' });
    }
  }
}

// Standalone function for calculating referral multiplier
function calculateReferralMultiplier(referralCount: number) {
  const tiers = [
    { min: 0, max: 2, multiplier: 1.0 },
    { min: 3, max: 5, multiplier: 1.2 },
    { min: 6, max: 10, multiplier: 1.5 },
    { min: 11, max: 20, multiplier: 1.8 },
    { min: 21, max: 50, multiplier: 2.0 },
    { min: 51, max: 100, multiplier: 2.5 },
    { min: 101, max: Infinity, multiplier: 3.0 }
  ];

  const currentTier = tiers.find(tier => referralCount >= tier.min && referralCount <= tier.max);
  const nextTier = tiers.find(tier => tier.min > referralCount);

  return {
    multiplier: currentTier?.multiplier || 1.0,
    nextTierReferrals: nextTier?.min || null,
    nextTierMultiplier: nextTier?.multiplier || null
  };
}