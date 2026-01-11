import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkInvitations() {
  try {
    console.log('🔍 Checking AdminInvitation table...');
    
    const allInvitations = await prisma.adminInvitation.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('📧 All invitations:', allInvitations.length);
    allInvitations.forEach(inv => {
      console.log(`- ${inv.email} | ${inv.role} | ${inv.status} | ${inv.createdAt}`);
    });
    
    const pendingInvitations = await prisma.adminInvitation.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('⏳ Pending invitations:', pendingInvitations.length);
    pendingInvitations.forEach(inv => {
      console.log(`- ${inv.email} | ${inv.role} | Expires: ${inv.expiresAt}`);
    });
    
    const travellerInvite = await prisma.adminInvitation.findUnique({
      where: { email: 'travellerasm@gmail.com' }
    });
    
    console.log('🎯 travellerasm@gmail.com invite:', travellerInvite);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkInvitations();