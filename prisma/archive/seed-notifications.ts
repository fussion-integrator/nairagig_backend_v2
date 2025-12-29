import { PrismaClient, NotificationType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedNotifications() {
  try {
    // Get all users
    const users = await prisma.user.findMany({
      select: { id: true }
    });

    if (users.length === 0) {
      console.log('No users found. Please seed users first.');
      return;
    }

    const notifications = [
      {
        title: 'Welcome to NairaGig!',
        message: 'Your account has been successfully created. Complete your profile to start earning.',
        type: NotificationType.SYSTEM,
        isRead: false,
      },
      {
        title: 'New Job Match',
        message: 'A new job matching your skills has been posted: "Full Stack Developer Needed"',
        type: NotificationType.JOB_APPLICATION,
        isRead: false,
      },
      {
        title: 'Payment Received',
        message: 'You have received ₦50,000 for completing the "E-commerce Website" project.',
        type: NotificationType.PAYMENT,
        isRead: true,
      },
      {
        title: 'New Message',
        message: 'You have a new message from John Doe regarding your proposal.',
        type: NotificationType.MESSAGE,
        isRead: false,
      },
      {
        title: 'Challenge Starting Soon',
        message: 'The "React Component Challenge" starts in 2 hours. Make sure you\'re ready!',
        type: NotificationType.CHALLENGE,
        isRead: false,
      },
      {
        title: 'Profile Views Increased',
        message: 'Your profile has been viewed 25 times this week. Keep up the great work!',
        type: NotificationType.SYSTEM,
        isRead: true,
      },
    ];

    // Create notifications for each user
    for (const user of users) {
      for (const notification of notifications) {
        await prisma.notification.create({
          data: {
            ...notification,
            userId: user.id,
          },
        });
      }
    }

    console.log(`✅ Successfully seeded ${notifications.length * users.length} notifications`);
  } catch (error) {
    console.error('❌ Error seeding notifications:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedNotifications();