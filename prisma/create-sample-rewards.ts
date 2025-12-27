import { PrismaClient, RewardType, RewardStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function createSampleRewards() {
  console.log('Creating sample rewards for testing...');

  // Get the first user (you can replace with your actual user ID)
  const user = await prisma.user.findFirst();
  
  if (!user) {
    console.log('No users found. Please create a user first.');
    return;
  }

  console.log(`Creating rewards for user: ${user.firstName} ${user.lastName}`);

  // Create sample rewards
  const sampleRewards = [
    {
      userId: user.id,
      type: RewardType.ONBOARDING,
      action: 'profile_complete',
      amount: 2000,
      points: 200,
      status: RewardStatus.COMPLETED,
      claimedAt: new Date(),
      metadata: { completionPercentage: 85 }
    },
    {
      userId: user.id,
      type: RewardType.ACTIVITY,
      action: 'daily_login',
      amount: 100,
      points: 10,
      status: RewardStatus.COMPLETED,
      claimedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      metadata: { streak: 1 }
    },
    {
      userId: user.id,
      type: RewardType.REFERRAL,
      action: 'friend_referral',
      amount: 5000,
      points: 500,
      status: RewardStatus.COMPLETED,
      claimedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      metadata: { refereeId: 'sample-referee-id' }
    },
    {
      userId: user.id,
      type: RewardType.ACTIVITY,
      action: 'daily_login',
      amount: 100,
      points: 10,
      status: RewardStatus.PENDING,
      metadata: { streak: 2 }
    }
  ];

  // Create rewards
  for (const reward of sampleRewards) {
    await prisma.reward.create({ data: reward });
  }

  // Create or update user reward stats
  await prisma.userRewardStats.upsert({
    where: { userId: user.id },
    update: {
      totalEarned: 7100,
      totalPoints: 710,
      lifetimeEarned: 7100,
      monthlyEarned: 7100,
      weeklyEarned: 7100,
      lastRewardAt: new Date()
    },
    create: {
      userId: user.id,
      totalEarned: 7100,
      totalPoints: 710,
      lifetimeEarned: 7100,
      monthlyEarned: 7100,
      weeklyEarned: 7100,
      lastRewardAt: new Date()
    }
  });

  console.log('Sample rewards created successfully!');
}

createSampleRewards()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });