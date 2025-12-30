import { prisma } from '@/config/database';

export async function getDefaultSubscriptionTier(): Promise<string | null> {
  try {
    // Try to find existing free tier
    let tier = await prisma.sponsorshipTier.findUnique({
      where: { name: 'free' }
    });

    // Create if doesn't exist
    if (!tier) {
      tier = await prisma.sponsorshipTier.create({
        data: {
          name: 'free',
          displayName: 'Free Tier',
          price: 0,
          benefits: ['Basic features'],
          isActive: true
        }
      });
    }

    return tier.name;
  } catch (error) {
    console.error('Error getting default subscription tier:', error);
    return null; // Return null if tier creation fails
  }
}