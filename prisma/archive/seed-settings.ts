import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSettingsData() {
  try {
    // Get the first user for seeding
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('No users found. Please create a user first.');
      return;
    }

    console.log(`Seeding settings data for user: ${user.email}`);

    // Seed user sessions
    await prisma.userSession.createMany({
      data: [
        {
          userId: user.id,
          deviceInfo: 'Chrome on Windows',
          ipAddress: '197.210.85.123',
          location: 'Lagos, Nigeria',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          isActive: true,
          lastActiveAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
        },
        {
          userId: user.id,
          deviceInfo: 'Safari on iPhone',
          ipAddress: '197.211.45.67',
          location: 'Abuja, Nigeria',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          isActive: true,
          lastActiveAt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
        },
        {
          userId: user.id,
          deviceInfo: 'Firefox on MacOS',
          ipAddress: '197.210.85.89',
          location: 'Port Harcourt, Nigeria',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0)',
          isActive: false,
          lastActiveAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
        }
      ],
      skipDuplicates: true
    });

    // Seed login history
    await prisma.loginHistory.createMany({
      data: [
        {
          userId: user.id,
          deviceInfo: 'Chrome on Windows',
          ipAddress: '197.210.85.123',
          location: 'Lagos, Nigeria',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - 2 * 60 * 1000)
        },
        {
          userId: user.id,
          deviceInfo: 'Safari on iPhone',
          ipAddress: '197.211.45.67',
          location: 'Abuja, Nigeria',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - 60 * 60 * 1000)
        },
        {
          userId: user.id,
          deviceInfo: 'Unknown device',
          ipAddress: '102.89.23.45',
          location: 'Unknown location',
          userAgent: 'Unknown',
          status: 'FAILED',
          createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
        },
        {
          userId: user.id,
          deviceInfo: 'Firefox on MacOS',
          ipAddress: '197.210.85.89',
          location: 'Port Harcourt, Nigeria',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0)',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        },
        {
          userId: user.id,
          deviceInfo: 'Chrome on Android',
          ipAddress: '105.112.67.89',
          location: 'Ibadan, Nigeria',
          userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B)',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        }
      ],
      skipDuplicates: true
    });

    // Seed bank accounts
    await prisma.bankAccount.createMany({
      data: [
        {
          userId: user.id,
          bankName: 'GTBank',
          bankCode: '058',
          accountNumber: '0123456789',
          accountName: `${user.firstName} ${user.lastName}`,
          isDefault: true,
          isVerified: true
        },
        {
          userId: user.id,
          bankName: 'Access Bank',
          bankCode: '044',
          accountNumber: '9876543210',
          accountName: `${user.firstName} ${user.lastName}`,
          isDefault: false,
          isVerified: true
        }
      ],
      skipDuplicates: true
    });

    // Seed payment cards
    await prisma.paymentCard.createMany({
      data: [
        {
          userId: user.id,
          cardType: 'visa',
          last4: '4532',
          expiryMonth: '12',
          expiryYear: '25',
          cardToken: 'tok_visa_4532',
          isDefault: true,
          isVerified: true
        },
        {
          userId: user.id,
          cardType: 'mastercard',
          last4: '8901',
          expiryMonth: '08',
          expiryYear: '26',
          cardToken: 'tok_mc_8901',
          isDefault: false,
          isVerified: true
        },
        {
          userId: user.id,
          cardType: 'verve',
          last4: '2345',
          expiryMonth: '06',
          expiryYear: '27',
          cardToken: 'tok_verve_2345',
          isDefault: false,
          isVerified: true
        }
      ],
      skipDuplicates: true
    });

    // Seed some sample transactions for payment history
    await prisma.transaction.createMany({
      data: [
        {
          userId: user.id,
          amount: 200000,
          type: 'PAYMENT',
          status: 'COMPLETED',
          description: 'Sponsorship - Gold Tier',
          currency: 'NGN',
          gatewayProvider: 'Paystack',
          referenceId: 'ref_sponsorship_001',
          createdAt: new Date('2024-01-15')
        },
        {
          userId: user.id,
          amount: 5000,
          type: 'FEE',
          status: 'COMPLETED',
          description: 'Platform Fee - Project #1234',
          currency: 'NGN',
          gatewayProvider: 'Paystack',
          referenceId: 'ref_fee_001',
          createdAt: new Date('2024-01-10')
        },
        {
          userId: user.id,
          amount: 50000,
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
          description: 'Withdrawal to GTBank',
          currency: 'NGN',
          gatewayProvider: 'Bank Transfer',
          referenceId: 'ref_withdrawal_001',
          createdAt: new Date('2024-01-05')
        },
        {
          userId: user.id,
          amount: 10000,
          type: 'REFUND',
          status: 'COMPLETED',
          description: 'Refund - Cancelled Project',
          currency: 'NGN',
          gatewayProvider: 'Paystack',
          referenceId: 'ref_refund_001',
          createdAt: new Date('2023-12-15')
        }
      ],
      skipDuplicates: true
    });

    console.log('✅ Settings data seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding settings data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedSettingsData();