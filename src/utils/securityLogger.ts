import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';
import { Request } from 'express';

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  description: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_HIJACKING = 'SESSION_HIJACKING',
  CSRF_ATTACK = 'CSRF_ATTACK',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  SQL_INJECTION = 'SQL_INJECTION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  DATA_BREACH_ATTEMPT = 'DATA_BREACH_ATTEMPT',
  MALICIOUS_FILE_UPLOAD = 'MALICIOUS_FILE_UPLOAD',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  ACCOUNT_LOCKOUT = 'ACCOUNT_LOCKOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  EMAIL_CHANGE = 'EMAIL_CHANGE',
  TWO_FACTOR_ENABLED = 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED = 'TWO_FACTOR_DISABLED',
  API_KEY_CREATED = 'API_KEY_CREATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  ADMIN_ACTION = 'ADMIN_ACTION',
  SYSTEM_ERROR = 'SYSTEM_ERROR'
}

export enum SecuritySeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export class SecurityLogger {
  private static eventQueue: SecurityEvent[] = [];
  private static isProcessing = false;

  /**
   * Log a security event
   */
  static async logEvent(event: SecurityEvent): Promise<void> {
    // Add timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // Add to queue for batch processing
    this.eventQueue.push(event);

    // Log to console immediately for critical events
    if (event.severity === SecuritySeverity.CRITICAL || event.severity === SecuritySeverity.HIGH) {
      logger.error(`SECURITY EVENT [${event.severity}]: ${event.type} - ${event.description}`, {
        userId: event.userId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadata
      });
    } else {
      logger.warn(`Security Event [${event.severity}]: ${event.type} - ${event.description}`, {
        userId: event.userId,
        ipAddress: event.ipAddress
      });
    }

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processEventQueue();
    }
  }

  /**
   * Process queued events in batches
   */
  private static async processEventQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) return;

    this.isProcessing = true;

    try {
      const eventsToProcess = this.eventQueue.splice(0, 50); // Process up to 50 events at once

      if (eventsToProcess.length > 0) {
        await prisma.securityIncident.createMany({
          data: eventsToProcess.map(event => ({
            type: event.type,
            description: event.description,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            severity: event.severity,
            userId: event.userId,
            metadata: event.metadata,
            createdAt: event.timestamp
          }))
        });
      }
    } catch (error) {
      logger.error('Failed to process security event queue:', error);
      // Re-add events to queue for retry
      this.eventQueue.unshift(...this.eventQueue);
    } finally {
      this.isProcessing = false;

      // Process remaining events if any
      if (this.eventQueue.length > 0) {
        setTimeout(() => this.processEventQueue(), 1000);
      }
    }
  }

  /**
   * Log authentication event
   */
  static async logAuth(
    type: SecurityEventType.LOGIN_SUCCESS | SecurityEventType.LOGIN_FAILURE | SecurityEventType.LOGOUT,
    req: Request,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      type,
      severity: type === SecurityEventType.LOGIN_FAILURE ? SecuritySeverity.MEDIUM : SecuritySeverity.INFO,
      description: `User authentication: ${type}`,
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata
    });
  }

  /**
   * Log session event
   */
  static async logSession(
    type: SecurityEventType.SESSION_CREATED | SecurityEventType.SESSION_EXPIRED | SecurityEventType.SESSION_HIJACKING,
    req: Request,
    userId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const severity = type === SecurityEventType.SESSION_HIJACKING ? SecuritySeverity.CRITICAL : SecuritySeverity.INFO;
    
    await this.logEvent({
      type,
      severity,
      description: `Session event: ${type}`,
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata
    });
  }

  /**
   * Log security attack
   */
  static async logAttack(
    type: SecurityEventType.CSRF_ATTACK | SecurityEventType.XSS_ATTEMPT | SecurityEventType.SQL_INJECTION,
    req: Request,
    description: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      type,
      severity: SecuritySeverity.HIGH,
      description,
      userId: (req as any).user?.id,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata: {
        ...metadata,
        url: req.url,
        method: req.method,
        body: req.body,
        query: req.query
      }
    });
  }

  /**
   * Log unauthorized access attempt
   */
  static async logUnauthorizedAccess(
    req: Request,
    resource: string,
    requiredRole?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.UNAUTHORIZED_ACCESS,
      severity: SecuritySeverity.MEDIUM,
      description: `Unauthorized access attempt to ${resource}`,
      userId: (req as any).user?.id,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata: {
        ...metadata,
        resource,
        requiredRole,
        userRole: (req as any).user?.role
      }
    });
  }

  /**
   * Log admin action
   */
  static async logAdminAction(
    req: Request,
    action: string,
    targetUserId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.ADMIN_ACTION,
      severity: SecuritySeverity.INFO,
      description: `Admin action: ${action}`,
      userId: (req as any).user?.id,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata: {
        ...metadata,
        action,
        targetUserId
      }
    });
  }

  /**
   * Log rate limit exceeded
   */
  static async logRateLimit(
    req: Request,
    limit: number,
    window: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.RATE_LIMIT_EXCEEDED,
      severity: SecuritySeverity.MEDIUM,
      description: `Rate limit exceeded: ${limit} requests in ${window}ms`,
      userId: (req as any).user?.id,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata: {
        ...metadata,
        limit,
        window,
        endpoint: req.path
      }
    });
  }

  /**
   * Log system error
   */
  static async logSystemError(
    error: Error,
    context: string,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.SYSTEM_ERROR,
      severity: SecuritySeverity.HIGH,
      description: `System error in ${context}: ${error.message}`,
      userId: req ? (req as any).user?.id : undefined,
      ipAddress: req?.ip || 'system',
      userAgent: req?.headers['user-agent'] || 'system',
      metadata: {
        ...metadata,
        error: error.stack,
        context
      }
    });
  }

  /**
   * Get security statistics
   */
  static async getStatistics(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<any> {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'hour':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const incidents = await prisma.securityIncident.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      select: {
        type: true,
        severity: true,
        createdAt: true
      }
    });

    const stats = {
      total: incidents.length,
      bySeverity: {
        CRITICAL: incidents.filter(i => i.severity === 'CRITICAL').length,
        HIGH: incidents.filter(i => i.severity === 'HIGH').length,
        MEDIUM: incidents.filter(i => i.severity === 'MEDIUM').length,
        LOW: incidents.filter(i => i.severity === 'LOW').length,
        INFO: incidents.filter(i => i.severity === 'INFO').length
      },
      byType: {} as Record<string, number>,
      timeframe,
      startDate,
      endDate: now
    };

    // Count by type
    incidents.forEach(incident => {
      stats.byType[incident.type] = (stats.byType[incident.type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Clean up old security incidents
   */
  static async cleanup(retentionDays: number = 90): Promise<void> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      const result = await prisma.securityIncident.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          },
          severity: {
            in: ['INFO', 'LOW']
          }
        }
      });

      logger.info(`Cleaned up ${result.count} old security incidents`);
    } catch (error) {
      logger.error('Failed to cleanup security incidents:', error);
    }
  }
}

// Process queue every 5 seconds
setInterval(() => {
  SecurityLogger['processEventQueue']();
}, 5000);

// Cleanup old incidents daily
setInterval(() => {
  SecurityLogger.cleanup();
}, 24 * 60 * 60 * 1000);