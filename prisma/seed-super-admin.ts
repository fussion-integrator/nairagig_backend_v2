import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createSuperAdmin() {
  try {
    const email = 'fussion.integration@gmail.com';
    const password = 'SuperAdmin@2024!';
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log('✅ Super admin user already exists');
      
      // Update to ensure SUPER_ADMIN role
      await prisma.user.update({
        where: { email },
        data: {
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          isVerified: true
        }
      });
      
      console.log('✅ Updated existing user to SUPER_ADMIN role');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create super admin user (without password field since it's not in schema)
    const superAdmin = await prisma.user.create({
      data: {
        email,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        authProvider: 'LOCAL',
        emailVerifiedAt: new Date(),
        isVerified: true,
        twoFactorAuth: false,
        loginAlerts: true,
        profileVisibility: 'private'
      }
    });

    console.log('🎉 Super admin account created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Temp Password: Use OAuth or set via admin panel');
    console.log('👤 User ID:', superAdmin.id);
    console.log('🛡️ Role:', superAdmin.role);
    
    console.log('\n⚠️  NOTE: This user uses OAuth authentication (Google/LinkedIn/Apple)');
    
  } catch (error) {
    console.error('❌ Error creating super admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();