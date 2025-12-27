import { prisma } from '@/config/database';

export class UserService {
  static async generateUniqueReferralCode(firstName: string): Promise<string> {
    let referralCode: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      const namePrefix = firstName?.substring(0, 3).toUpperCase() || 'USR';
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      referralCode = `${namePrefix}${randomSuffix}`;

      const existingUser = await prisma.user.findUnique({
        where: { referralCode }
      });

      if (!existingUser) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      // Fallback to UUID-based code
      referralCode = `REF${Date.now().toString().slice(-6)}`;
    }

    return referralCode;
  }

  static async createUserWithReferralCode(userData: any) {
    const referralCode = await this.generateUniqueReferralCode(userData.firstName);
    
    return await prisma.user.create({
      data: {
        ...userData,
        referralCode
      }
    });
  }
}