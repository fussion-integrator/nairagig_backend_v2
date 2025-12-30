import { PrismaClient, SubscriptionStatus, PaymentType, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPaymentData() {
  console.log('🌱 Seeding payment data...');

  try {
    // Create subscription plans
    const plans = await Promise.all([
      prisma.subscriptionPlan.upsert({
        where: { name: 'free' },
        update: {},
        create: {
          name: 'free',
          displayName: 'Free Plan',
          description: 'Basic features for getting started',
          price: 0,
          currency: 'NGN',
          billingCycle: 'MONTHLY',
          features: JSON.stringify([
            'Up to 3 job applications per month',
            'Basic profile',
            'Community access'
          ]),
          limits: JSON.stringify({
            jobApplications: 3,
            portfolioItems: 2
          }),
          isActive: true,
          trialDays: 0,
          sortOrder: 1
        }
      }),
      prisma.subscriptionPlan.upsert({
        where: { name: 'premium' },
        update: {},
        create: {
          name: 'premium',
          displayName: 'Premium Plan',
          description: 'Enhanced features for professionals',
          price: 5000,
          currency: 'NGN',
          billingCycle: 'MONTHLY',
          features: JSON.stringify([
            'Unlimited job applications',
            'Priority support',
            'Advanced analytics',
            'Featured profile',
            'Challenge participation'
          ]),
          limits: JSON.stringify({
            jobApplications: -1,
            portfolioItems: 10
          }),
          isActive: true,
          trialDays: 7,
          sortOrder: 2
        }
      }),
      prisma.subscriptionPlan.upsert({
        where: { name: 'pro' },
        update: {},
        create: {
          name: 'pro',
          displayName: 'Pro Plan',
          description: 'Advanced features for power users',
          price: 15000,
          currency: 'NGN',
          billingCycle: 'MONTHLY',
          features: JSON.stringify([
            'Everything in Premium',
            'API access',
            'White-label solutions',
            'Dedicated account manager',
            'Custom integrations'
          ]),
          limits: JSON.stringify({
            jobApplications: -1,
            portfolioItems: -1,
            apiCalls: 10000
          }),
          isActive: true,
          trialDays: 14,
          sortOrder: 3
        }
      })
    ]);

    console.log(`✅ Created ${plans.length} subscription plans`);

    // Get some users to create payment data for
    const users = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    if (users.length === 0) {
      console.log('⚠️ No users found, skipping payment data creation');
      return;
    }

    // Create payment methods for users
    const paymentMethods = [];
    for (const user of users.slice(0, 3)) {
      // Add a card payment method
      const cardMethod = await prisma.paymentMethod.create({
        data: {
          userId: user.id,
          type: 'CARD',
          provider: 'Paystack',
          cardLastFour: Math.floor(1000 + Math.random() * 9000).toString(),
          cardBrand: Math.random() > 0.5 ? 'Visa' : 'Mastercard',
          cardToken: `card_${Math.random().toString(36).substr(2, 9)}`,
          isVerified: true,
          isDefault: true,
          status: 'ACTIVE'
        }
      });

      // Add a bank account payment method
      const bankMethod = await prisma.paymentMethod.create({
        data: {
          userId: user.id,
          type: 'BANK_ACCOUNT',
          bankName: ['Access Bank', 'GTBank', 'First Bank', 'UBA'][Math.floor(Math.random() * 4)],
          bankCode: '044',
          accountNumber: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
          accountName: `${user.firstName} ${user.lastName}`,
          isVerified: Math.random() > 0.3,
          isDefault: false,
          status: 'ACTIVE'
        }
      });

      paymentMethods.push(cardMethod, bankMethod);
    }

    console.log(`✅ Created ${paymentMethods.length} payment methods`);

    // Create subscriptions for some users
    const subscriptions = [];
    for (const user of users.slice(0, 2)) {
      const plan = plans[Math.floor(Math.random() * plans.length)];
      const userPaymentMethod = paymentMethods.find(pm => pm.userId === user.id && pm.isDefault);
      
      if (userPaymentMethod) {
        const subscription = await prisma.subscription.create({
          data: {
            userId: user.id,
            planId: plan.id,
            paymentMethodId: userPaymentMethod.id,
            status: (['ACTIVE', 'TRIALING'] as SubscriptionStatus[])[Math.floor(Math.random() * 2)],
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            amount: plan.price,
            currency: plan.currency,
            billingCycle: plan.billingCycle,
            autoRenew: true,
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        });
        subscriptions.push(subscription);
      }
    }

    console.log(`✅ Created ${subscriptions.length} subscriptions`);

    // Create payment history for users
    const paymentHistories = [];
    for (const user of users.slice(0, 3)) {
      const userSubscription = subscriptions.find(s => s.userId === user.id);
      const userPaymentMethod = paymentMethods.find(pm => pm.userId === user.id && pm.isDefault);

      // Create subscription payments
      if (userSubscription && userPaymentMethod) {
        for (let i = 0; i < 3; i++) {
          const paymentHistory = await prisma.paymentHistory.create({
            data: {
              userId: user.id,
              subscriptionId: userSubscription.id,
              paymentMethodId: userPaymentMethod.id,
              amount: userSubscription.amount,
              currency: userSubscription.currency,
              type: 'SUBSCRIPTION',
              status: 'PAID',
              description: `${userSubscription.planId} subscription payment`,
              invoiceNumber: `INV-${Date.now()}-${i}`,
              gatewayProvider: 'Paystack',
              gatewayReference: `ref_${Math.random().toString(36).substr(2, 9)}`,
              paidAt: new Date(Date.now() - (i * 30 * 24 * 60 * 60 * 1000)), // Monthly payments
              createdAt: new Date(Date.now() - (i * 30 * 24 * 60 * 60 * 1000))
            }
          });
          paymentHistories.push(paymentHistory);
        }
      }

      // Create other payment types
      const otherPayments = [
        {
          type: 'PLATFORM_FEE',
          description: `Platform fee - Job #${Math.floor(1000 + Math.random() * 9000)}`,
          amount: Math.floor(2000 + Math.random() * 8000)
        },
        {
          type: 'CHALLENGE_ENTRY',
          description: 'Challenge entry fee',
          amount: Math.floor(1000 + Math.random() * 4000)
        },
        {
          type: 'PROMOTION',
          description: 'Profile promotion',
          amount: Math.floor(1500 + Math.random() * 3500)
        }
      ];

      for (const payment of otherPayments) {
        const paymentHistory = await prisma.paymentHistory.create({
          data: {
            userId: user.id,
            paymentMethodId: userPaymentMethod?.id,
            amount: payment.amount,
            currency: 'NGN',
            type: payment.type as PaymentType,
            status: (Math.random() > 0.1 ? 'PAID' : 'FAILED') as PaymentStatus,
            description: payment.description,
            invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            gatewayProvider: 'Paystack',
            gatewayReference: `ref_${Math.random().toString(36).substr(2, 9)}`,
            paidAt: Math.random() > 0.1 ? new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000) : null,
            createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
          }
        });
        paymentHistories.push(paymentHistory);
      }
    }

    console.log(`✅ Created ${paymentHistories.length} payment history records`);

    console.log('🎉 Payment data seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding payment data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedPaymentData()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default seedPaymentData;