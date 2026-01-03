import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ReferralService {
  // Complete referral when user performs qualifying action
  static async completeReferralOnAction(userId: string, action: 'FIRST_JOB_APPLICATION' | 'FIRST_PROJECT_COMPLETION' | 'FIRST_PAYMENT') {
    try {
      // Find pending referral for this user
      const referral = await prisma.referral.findFirst({
        where: {
          refereeId: userId,
          status: 'PENDING'
        },
        include: { referrer: true }
      });

      if (!referral) return;

      // Complete the referral
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          metadata: {
            ...referral.metadata as any,
            completionAction: action,
            completedAt: new Date().toISOString()
          }
        }
      });

      // Complete the reward
      await prisma.reward.updateMany({
        where: {
          userId: referral.referrerId,
          metadata: {
            path: ['referralId'],
            equals: referral.id
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
            availableBalance: { increment: referral.rewardAmount },
            totalEarned: { increment: referral.rewardAmount }
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
            description: `Referral bonus - ${action.toLowerCase().replace('_', ' ')}`,
            processedAt: new Date(),
            metadata: {
              referralId: referral.id,
              refereeId: userId,
              completionAction: action
            }
          }
        });
      }

      console.log(`Referral completed for user ${userId} with action ${action}`);
    } catch (error) {
      console.error('Error completing referral:', error);
    }
  }

  // Generate unique referral code
  static generateReferralCode(firstName: string, lastName: string): string {
    const baseCode = `${firstName?.slice(0, 2) || 'NG'}${lastName?.slice(0, 2) || 'GIG'}`.toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${baseCode}${randomSuffix}`;
  }

  // Auto-generate referral code for new users
  static async ensureUserHasReferralCode(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true, firstName: true, lastName: true }
      });

      if (!user?.referralCode) {
        const referralCode = this.generateReferralCode(user?.firstName || '', user?.lastName || '');
        
        await prisma.user.update({
          where: { id: userId },
          data: { referralCode }
        });

        return referralCode;
      }

      return user.referralCode;
    } catch (error) {
      console.error('Error ensuring referral code:', error);
      return null;
    }
  }
}