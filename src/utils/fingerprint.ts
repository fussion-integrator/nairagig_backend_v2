import crypto from 'crypto';
import { Request } from 'express';

export class FingerprintUtils {
  private static readonly FINGERPRINT_SECRET = process.env.SESSION_FINGERPRINT_SECRET || 'nairagig-fingerprint-secret-2024';

  /**
   * Generate device fingerprint with multiple factors
   */
  static generateFingerprint(req: Request): string {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.headers['accept'] || '',
      req.ip || '',
      req.headers['x-forwarded-for'] || '',
    ];
    
    const fingerprint = crypto
      .createHmac('sha256', this.FINGERPRINT_SECRET)
      .update(components.join('|'))
      .digest('hex');
    
    return fingerprint;
  }

  /**
   * Validate fingerprint match
   */
  static validateFingerprint(req: Request, storedFingerprint: string): boolean {
    if (!storedFingerprint) return true; // Allow legacy sessions
    const currentFingerprint = this.generateFingerprint(req);
    return currentFingerprint === storedFingerprint;
  }

  /**
   * Generate secure session ID
   */
  static generateSecureSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}