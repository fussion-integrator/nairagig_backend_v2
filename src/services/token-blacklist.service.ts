import { prisma } from '@/config/database';
import jwt from 'jsonwebtoken';

export class TokenBlacklistService {
  private static blacklistedTokens = new Set<string>();

  static async blacklistToken(token: string) {
    const decoded = jwt.decode(token) as any;
    if (decoded?.jti) {
      this.blacklistedTokens.add(decoded.jti);
      
      // Store in database for persistence
      await prisma.blacklistedToken.create({
        data: {
          jti: decoded.jti,
          expiresAt: new Date(decoded.exp * 1000)
        }
      });
    }
  }

  static async isBlacklisted(token: string): Promise<boolean> {
    const decoded = jwt.decode(token) as any;
    if (!decoded?.jti) return false;

    // Check memory cache first
    if (this.blacklistedTokens.has(decoded.jti)) {
      return true;
    }

    // Check database
    const blacklisted = await prisma.blacklistedToken.findUnique({
      where: { jti: decoded.jti }
    });

    if (blacklisted) {
      this.blacklistedTokens.add(decoded.jti);
      return true;
    }

    return false;
  }

  static async cleanup() {
    // Remove expired tokens from memory and database
    const now = new Date();
    await prisma.blacklistedToken.deleteMany({
      where: { expiresAt: { lt: now } }
    });

    // Reload blacklist from database
    const activeTokens = await prisma.blacklistedToken.findMany({
      select: { jti: true }
    });
    
    this.blacklistedTokens.clear();
    activeTokens.forEach(token => this.blacklistedTokens.add(token.jti));
  }
}

// Cleanup expired tokens every hour
setInterval(() => {
  TokenBlacklistService.cleanup();
}, 60 * 60 * 1000);