import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const completePhoneVerification = async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Check if user already has phone verified
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true, phoneVerifiedAt: true, createdAt: true }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.phoneVerifiedAt) {
      return res.status(400).json({ error: 'Phone already verified' });
    }

    // Update user with verified phone
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        phoneNumber,
        phoneVerifiedAt: new Date()
      }
    });

    // Check if user is eligible for verification bonus (existing user)
    const accountAge = Date.now() - existingUser.createdAt.getTime();
    const isExistingUser = accountAge > 24 * 60 * 60 * 1000; // Account older than 1 day

    let bonusAmount = 0;
    if (isExistingUser) {
      bonusAmount = 100; // ₦100 bonus for existing users

      // Add bonus to wallet
      await prisma.wallet.upsert({
        where: { 
          userId_currency: {
            userId,
            currency: 'NGN'
          }
        },
        update: {
          availableBalance: { increment: bonusAmount }
        },
        create: {
          userId,
          availableBalance: bonusAmount,
          currency: 'NGN'
        }
      });

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId,
          type: 'CREDIT',
          amount: bonusAmount,
          description: 'Phone verification bonus',
          status: 'COMPLETED',
          referenceId: `phone_bonus_${userId}_${Date.now()}`
        }
      });
    }

    res.json({
      success: true,
      message: 'Phone verification completed successfully',
      bonus: bonusAmount > 0 ? {
        amount: bonusAmount,
        message: `Congratulations! You've earned ₦${bonusAmount} for completing your profile.`
      } : null,
      user: {
        id: updatedUser.id,
        phoneNumber: updatedUser.phoneNumber,
        phoneVerified: !!updatedUser.phoneVerifiedAt
      }
    });

  } catch (error) {
    console.error('Phone verification completion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePhoneNumber = async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Check if new phone number is already used by another user
    const existingPhoneUser = await prisma.user.findFirst({
      where: {
        phoneNumber,
        id: { not: userId },
        phoneVerifiedAt: { not: null }
      }
    });

    if (existingPhoneUser) {
      return res.status(400).json({ error: 'Phone number already in use' });
    }

    // Update user with new phone number and reset verification
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        phoneNumber,
        phoneVerifiedAt: new Date() // Immediately verify since Firebase already verified it
      }
    });

    res.json({
      success: true,
      message: 'Phone number updated successfully',
      user: {
        id: updatedUser.id,
        phoneNumber: updatedUser.phoneNumber,
        phoneVerified: !!updatedUser.phoneVerifiedAt
      }
    });

  } catch (error) {
    console.error('Phone number update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVerificationStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        phoneNumber: true,
        phoneVerifiedAt: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const accountAge = Date.now() - user.createdAt.getTime();
    const isExistingUser = accountAge > 24 * 60 * 60 * 1000;

    res.json({
      phoneVerified: !!user.phoneVerifiedAt,
      phoneNumber: user.phoneNumber,
      eligibleForBonus: isExistingUser && !user.phoneVerifiedAt,
      bonusAmount: isExistingUser && !user.phoneVerifiedAt ? 100 : 0
    });

  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};