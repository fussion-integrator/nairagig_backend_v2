import { PrismaClient, AdminRole, AdminStatus, Permission } from '@prisma/client';

const prisma = new PrismaClient();

async function setupInitialAdmin() {
  try {
    console.log('🔧 Setting up initial admin system...');

    // Check if super admin already exists
    const existingSuperAdmin = await prisma.admin.findFirst({
      where: { 
        email: 'fussion.integration@gmail.com',
        role: AdminRole.SUPER_ADMIN 
      }
    });

    if (existingSuperAdmin) {
      console.log('✅ Super admin already exists');
      return;
    }

    // Create super admin
    const superAdmin = await prisma.admin.create({
      data: {
        email: 'fussion.integration@gmail.com',
        firstName: 'Super',
        lastName: 'Admin',
        role: AdminRole.SUPER_ADMIN,
        status: AdminStatus.ACTIVE,
        activatedAt: new Date()
      }
    });

    // Grant all permissions to super admin
    const allPermissions = Object.values(Permission);
    await prisma.adminPermission.createMany({
      data: allPermissions.map(permission => ({
        adminId: superAdmin.id,
        permission
      }))
    });

    console.log('✅ Super admin created successfully');
    console.log(`📧 Email: ${superAdmin.email}`);
    console.log(`🆔 ID: ${superAdmin.id}`);
    console.log(`🔑 Permissions: ${allPermissions.length} granted`);

  } catch (error) {
    console.error('❌ Error setting up admin system:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  setupInitialAdmin()
    .then(() => {
      console.log('🎉 Admin system setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

export { setupInitialAdmin };