import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateWalletEarnings() {
  console.log('🌱 Updating wallet earnings...');

  try {
    // Get all wallets
    const wallets = await prisma.wallet.findMany({
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    console.log(`Found ${wallets.length} wallets to update`);

    // Update wallets with earnings data
    for (const wallet of wallets) {
      const totalEarned = Math.floor(Math.random() * 500000) + 50000; // Random earnings between 50k-550k
      const availableBalance = Math.floor(totalEarned * 0.25); // 25% available
      const pendingBalance = Math.floor(totalEarned * 0.05); // 5% pending
      const totalWithdrawn = Math.floor(totalEarned * 0.7); // 70% withdrawn

      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance,
          pendingBalance,
          totalEarned,
          totalWithdrawn
        }
      });

      console.log(`✅ Updated wallet for ${wallet.user.firstName} ${wallet.user.lastName} - Total: ₦${totalEarned.toLocaleString()}, Available: ₦${availableBalance.toLocaleString()}`);
    }

    console.log('🎉 Wallet earnings update completed successfully!');
  } catch (error) {
    console.error('❌ Error updating wallet earnings:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  updateWalletEarnings()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default updateWalletEarnings;