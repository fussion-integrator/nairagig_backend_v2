import { PrismaClient, RewardType, BadgeCategory, BadgeRarity, LeaderboardType, LeaderboardPeriod } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRewards() {
  console.log('Seeding reward configurations...');

  // Reward Configurations
  const rewardConfigs = [
    // Onboarding Rewards
    {
      action: 'profile_complete',
      type: RewardType.ONBOARDING,
      amount: 2000,
      points: 200,
      description: 'Complete your profile (70%+ completion)',
      conditions: { minCompletionPercentage: 70 },
      limits: { perUser: 1 }
    },
    {
      action: 'first_job_post',
      type: RewardType.ONBOARDING,
      amount: 5000,
      points: 500,
      description: 'Post your first job',
      conditions: {},
      limits: { perUser: 1 }
    },
    {
      action: 'first_gig_complete',
      type: RewardType.ONBOARDING,
      amount: 5000,
      points: 500,
      description: 'Complete your first gig',
      conditions: {},
      limits: { perUser: 1 }
    },
    {
      action: 'friend_referral',
      type: RewardType.REFERRAL,
      amount: 5000,
      points: 500,
      description: 'Successful friend referral',
      conditions: {},
      limits: {}
    },
    {
      action: 'referred_signup',
      type: RewardType.ONBOARDING,
      amount: 2000,
      points: 200,
      description: 'Welcome bonus for referred users',
      conditions: {},
      limits: { perUser: 1 }
    },
    {
      action: 'daily_login',
      type: RewardType.ACTIVITY,
      amount: 100,
      points: 10,
      description: 'Daily login bonus',
      conditions: {},
      limits: { daily: 1 }
    }
  ];

  for (const config of rewardConfigs) {
    await prisma.rewardConfig.upsert({
      where: { action: config.action },
      update: config,
      create: config
    });
  }

  // Badges
  const badges = [
    {
      name: 'welcome',
      title: 'Welcome to NairaGig',
      description: 'Completed your first profile setup',
      category: BadgeCategory.ACHIEVEMENT,
      icon: '🎉',
      color: '#10B981',
      rarity: BadgeRarity.COMMON,
      criteria: { achievement: 'profile_complete', minValue: 1 }
    },
    {
      name: 'referrer',
      title: 'Community Builder',
      description: 'Referred 5 friends to NairaGig',
      category: BadgeCategory.ACHIEVEMENT,
      icon: '👥',
      color: '#7C3AED',
      rarity: BadgeRarity.UNCOMMON,
      criteria: { achievement: 'friend_referral', minValue: 5 }
    }
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { name: badge.name },
      update: badge,
      create: badge
    });
  }

  // Leaderboards
  const leaderboards = [
    {
      name: 'monthly_points',
      title: 'Monthly Points Leaders',
      description: 'Top point earners this month',
      type: LeaderboardType.POINTS,
      period: LeaderboardPeriod.MONTHLY,
      isActive: true
    },
    {
      name: 'all_time_referrals',
      title: 'All-Time Referral Champions',
      description: 'Most successful referrals of all time',
      type: LeaderboardType.REFERRALS,
      period: LeaderboardPeriod.ALL_TIME,
      isActive: true
    }
  ];

  for (const leaderboard of leaderboards) {
    await prisma.leaderboard.upsert({
      where: { name: leaderboard.name },
      update: leaderboard,
      create: leaderboard
    });
  }

  console.log('Reward system seeded successfully!');
}

seedRewards()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });