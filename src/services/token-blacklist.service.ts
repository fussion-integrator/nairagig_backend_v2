import jwt from 'jsonwebtoken';

// BlacklistedToken model doesn't exist - using in-memory store
export class TokenBlacklistService {
  private static blacklistedTokens = new Set<string>();

  static async blacklistToken(token: string) {
    const decoded = jwt.decode(token) as any;
    if (decoded?.jti) {
      this.blacklistedTokens.add(decoded.jti);
    }
  }

  static async isBlacklisted(token: string): Promise<boolean> {
    const decoded = jwt.decode(token) as any;
    if (!decoded?.jti) return false;
    return this.blacklistedTokens.has(decoded.jti);
  }

  static async cleanup() {
    // Cleanup handled by token expiry
  }
}