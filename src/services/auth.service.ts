import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '@/config/config';

export class AuthService {
  static generateTokens(userId: string) {
    const payload = { userId, type: 'access' };
    const refreshPayload = { userId, type: 'refresh', jti: crypto.randomUUID() };

    // Use config values from .env
    const accessToken = jwt.sign(payload, config.jwtSecret, { 
      expiresIn: config.jwtExpiresIn 
    });
    
    const refreshToken = jwt.sign(refreshPayload, config.jwtRefreshSecret, { 
      expiresIn: config.jwtRefreshExpiresIn 
    });

    return { accessToken, refreshToken };
  }

  static setCookies(res: any, accessToken: string, refreshToken: string) {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? undefined : 'localhost'
    };

    // Parse expiry from config (e.g., '3d' -> 3 days in ms)
    const parseExpiry = (expiry: string): number => {
      const match = expiry.match(/(\d+)([dhm])/);
      if (!match) return 15 * 60 * 1000; // default 15 minutes
      
      const [, num, unit] = match;
      const value = parseInt(num);
      
      switch (unit) {
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        default: return 15 * 60 * 1000;
      }
    };

    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: parseExpiry(config.jwtExpiresIn)
    });

    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: parseExpiry(config.jwtRefreshExpiresIn)
    });
  }

  static parseUserAgent(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }
}