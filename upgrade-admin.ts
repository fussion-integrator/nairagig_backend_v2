import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function upgradeAdminToSuperAdmin() {
  try {
    // Update the admin user to SUPER_ADMIN role
    const updatedAdmin = await prisma.admin.update({
      where: {
        email: 'fussion.integration@gmail.com'
      },
      data: {
        role: 'SUPER_ADMIN',
        updatedAt: new Date()
      }
    })

    console.log('✅ Admin upgraded to SUPER_ADMIN:', updatedAdmin)
  } catch (error) {
    console.error('❌ Error upgrading admin:', error)
  } finally {
    await prisma.$disconnect()
  }
}

upgradeAdminToSuperAdmin()