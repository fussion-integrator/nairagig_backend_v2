import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedWalletData() {
  console.log('🌱 Seeding wallet data...');

  try {
    // Get users without wallets
    const users = await prisma.user.findMany({
      where: {
        wallets: {
          none: {}
        }
      },
      take: 10
    });

    console.log(`Found ${users.length} users without wallets`);

    // Create wallets for users
    for (const user of users) {
      const totalEarned = Math.floor(Math.random() * 500000) + 10000; // Random earnings between 10k-510k
      const availableBalance = Math.floor(totalEarned * 0.3); // 30% available
      const pendingBalance = Math.floor(totalEarned * 0.1); // 10% pending
      const totalWithdrawn = totalEarned - availableBalance - pendingBalance;

      await prisma.wallet.create({
        data: {
          userId: user.id,
          availableBalance,
          pendingBalance,
          escrowBalance: 0,
          totalEarned,
          totalWithdrawn,
          currency: 'NGN',
          status: 'ACTIVE',
          isVerified: true
        }
      });

      console.log(`✅ Created wallet for user ${user.firstName} ${user.lastName} with ₦${totalEarned.toLocaleString()} total earned`);
    }

    console.log('🎉 Wallet data seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding wallet data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedWalletData()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default seedWalletData;