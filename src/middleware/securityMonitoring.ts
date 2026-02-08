import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';
import crypto from 'crypto';

interface SecurityEvent {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  metadata?: any;
}

interface ThreatIntelligence {
  ip: string;
  threatLevel: number;
  lastSeen: Date;
  incidents: number;
  blocked: boolean;
}

export class SecurityMonitoring {
  private static events: SecurityEvent[] = [];
  private static threatIntel = new Map<string, ThreatIntelligence>();
  private static alertThresholds = {
    CRITICAL: 1, // Immediate alert
    HIGH: 3,     // Alert after 3 incidents in 1 hour
    MEDIUM: 10,  // Alert after 10 incidents in 1 hour
    LOW: 50      // Alert after 50 incidents in 1 hour
  };

  // Security monitoring middleware
  static monitor(req: Request, res: Response, next: NextFunction) {
    // Skip monitoring in development for localhost
    if (process.env.NODE_ENV === 'development' && 
        (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip?.startsWith('192.168.'))) {
      return next();
    }

    const startTime = Date.now();
    const clientIP = req.ip || 'unknown';
    
    // Monitor request patterns
    SecurityMonitoring.analyzeRequestPattern(req);
    
    // Monitor response
    const originalSend = res.send;
    res.send = function(data) {
      const responseTime = Date.now() - startTime;
      SecurityMonitoring.analyzeResponse(req, res, responseTime);
      return originalSend.call(this, data);
    };

    next();
  }

  // Analyze request patterns for anomalies
  static analyzeRequestPattern(req: Request) {
    const clientIP = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      // SQL injection attempts
      /(\b(union|select|insert|update|delete|drop|create|alter)\b)/i,
      // XSS attempts
      /<script|javascript:|on\w+\s*=/i,
      // Path traversal
      /\.\.\//,
      // Command injection
      /[;&|`$()]/,
      // Common attack tools
      /(sqlmap|nmap|nikto|burp|metasploit)/i
    ];

    const requestData = `${req.url} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(requestData)) {
        SecurityMonitoring.logSecurityEvent({
          type: 'MALICIOUS_REQUEST_PATTERN',
          severity: 'HIGH',
          description: `Suspicious pattern detected: ${pattern.source}`,
          userId: (req as any).user?.id,
          ipAddress: clientIP,
          userAgent,
          metadata: {
            url: req.url,
            method: req.method,
            pattern: pattern.source
          }
        });
        break;
      }
    }

    // Check for unusual request frequency
    SecurityMonitoring.checkRequestFrequency(clientIP);
    
    // Check for bot-like behavior
    SecurityMonitoring.checkBotBehavior(req);
  }

  // Analyze response for security issues
  private static analyzeResponse(req: Request, res: Response, responseTime: number) {
    const clientIP = req.ip || 'unknown';
    
    // Monitor for error patterns that might indicate attacks
    if (res.statusCode >= 400) {
      this.updateThreatIntelligence(clientIP, 'ERROR_RESPONSE');
    }

    // Monitor for unusually slow responses (potential DoS)
    if (responseTime > 10000) { // 10 seconds
      this.logSecurityEvent({
        type: 'SLOW_RESPONSE',
        severity: 'MEDIUM',
        description: `Unusually slow response: ${responseTime}ms`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          responseTime,
          path: req.path,
          statusCode: res.statusCode
        }
      });
    }
  }

  // Check request frequency for anomalies
  static checkRequestFrequency(clientIP: string) {
    const key = `freq_${clientIP}`;
    const now = Date.now();
    const windowSize = 60000; // 1 minute
    
    // This would typically use Redis in production
    // For now, using in-memory storage
    const requests = this.getRequestHistory(key, windowSize);
    requests.push(now);
    
    if (requests.length > 100) { // More than 100 requests per minute
      this.logSecurityEvent({
        type: 'HIGH_REQUEST_FREQUENCY',
        severity: 'MEDIUM',
        description: `High request frequency: ${requests.length} requests/minute`,
        ipAddress: clientIP,
        userAgent: 'unknown',
        metadata: { requestCount: requests.length }
      });
    }
  }

  // Check for bot-like behavior
  static checkBotBehavior(req: Request) {
    const userAgent = req.headers['user-agent'] || '';
    const clientIP = req.ip || 'unknown';
    
    // Common bot indicators
    const botIndicators = [
      !userAgent, // No user agent
      userAgent.length < 10, // Very short user agent
      /bot|crawler|spider|scraper/i.test(userAgent), // Bot keywords
      !req.headers['accept-language'], // No language header
      !req.headers['accept-encoding'] // No encoding header
    ];

    const botScore = botIndicators.filter(Boolean).length;
    
    if (botScore >= 3) {
      this.logSecurityEvent({
        type: 'BOT_DETECTION',
        severity: 'LOW',
        description: `Bot-like behavior detected (score: ${botScore}/5)`,
        ipAddress: clientIP,
        userAgent,
        metadata: { botScore, indicators: botIndicators }
      });
    }
  }

  // Log security event
  static async logSecurityEvent(event: SecurityEvent) {
    this.events.push({
      ...event,
      timestamp: new Date()
    } as any);

    // Update threat intelligence
    this.updateThreatIntelligence(event.ipAddress, event.type);

    // Store in database
    try {
      await prisma.securityIncident.create({
        data: {
          type: event.type,
          description: event.description,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          severity: event.severity,
          userId: event.userId,
          metadata: event.metadata
        }
      });
    } catch (error) {
      logger.error('Failed to store security incident:', error);
    }

    // Check if alert should be triggered
    this.checkAlertThresholds(event);

    logger.warn('Security event logged', event);
  }

  // Update threat intelligence
  private static updateThreatIntelligence(ip: string, eventType: string) {
    let intel = this.threatIntel.get(ip);
    
    if (!intel) {
      intel = {
        ip,
        threatLevel: 0,
        lastSeen: new Date(),
        incidents: 0,
        blocked: false
      };
    }

    intel.incidents++;
    intel.lastSeen = new Date();
    
    // Increase threat level based on event type
    const threatScores = {
      'MALICIOUS_REQUEST_PATTERN': 10,
      'SESSION_HIJACKING': 15,
      'CSRF_ATTACK': 8,
      'RATE_LIMIT_ABUSE': 5,
      'BOT_DETECTION': 2,
      'HIGH_REQUEST_FREQUENCY': 3,
      'ERROR_RESPONSE': 1
    };

    intel.threatLevel += threatScores[eventType as keyof typeof threatScores] || 1;
    
    // Auto-block high-threat IPs
    if (intel.threatLevel > 50) {
      intel.blocked = true;
      this.blockThreatIP(ip);
    }

    this.threatIntel.set(ip, intel);
  }

  // Auto-block high-threat IPs (but not in development)
  private static async blockThreatIP(ip: string) {
    // Don't block localhost in development
    if (process.env.NODE_ENV === 'development' && 
        (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.'))) {
      logger.warn(`Would block IP ${ip} but skipping in development`);
      return;
    }

    try {
      // Log the blocking action as a security incident
      await prisma.securityIncident.create({
        data: {
          type: 'IP_BLOCKED',
          description: `IP automatically blocked due to high threat level: ${ip}`,
          ipAddress: ip,
          userAgent: 'system',
          severity: 'HIGH',
          metadata: {
            reason: 'Automated threat detection',
            blockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }
        }
      });

      logger.error(`IP automatically blocked due to high threat level: ${ip}`);
    } catch (error) {
      logger.error('Failed to log IP blocking:', error);
    }
  }

  // Check alert thresholds
  private static checkAlertThresholds(event: SecurityEvent) {
    const threshold = this.alertThresholds[event.severity];
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    const recentEvents = this.events.filter(e => 
      e.severity === event.severity && 
      (e as any).timestamp > oneHourAgo
    );

    if (recentEvents.length >= threshold) {
      this.triggerSecurityAlert(event.severity, recentEvents);
    }
  }

  // Trigger security alert
  private static async triggerSecurityAlert(severity: string, events: SecurityEvent[]) {
    const alert = {
      id: crypto.randomUUID(),
      severity,
      eventCount: events.length,
      timestamp: new Date(),
      events: events.slice(-10) // Last 10 events
    };

    // Store alert as security incident
    try {
      await prisma.securityIncident.create({
        data: {
          type: 'SECURITY_ALERT',
          description: `${events.length} ${severity} security events detected in the last hour`,
          ipAddress: 'system',
          userAgent: 'system',
          severity: severity as any,
          metadata: { 
            eventCount: events.length,
            alertId: alert.id,
            events: alert.events 
          } as any
        }
      });
    } catch (error) {
      logger.error('Failed to store security alert:', error);
    }

    // Send notifications (email, Slack, etc.)
    this.sendSecurityNotification(alert);

    logger.error('Security alert triggered', alert);
  }

  // Send security notification
  private static async sendSecurityNotification(alert: any) {
    // TODO: Implement email/Slack notifications
    logger.error(`SECURITY ALERT: ${alert.severity} - ${alert.eventCount} events detected`);
  }

  // Get request history (simplified in-memory version)
  private static requestHistory = new Map<string, number[]>();
  
  private static getRequestHistory(key: string, windowSize: number): number[] {
    const now = Date.now();
    let history = this.requestHistory.get(key) || [];
    
    // Remove old entries
    history = history.filter(timestamp => now - timestamp < windowSize);
    this.requestHistory.set(key, history);
    
    return history;
  }

  // Get security statistics
  static getSecurityStatistics() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const recentEvents = this.events.filter(e => (e as any).timestamp > oneHourAgo);
    const dailyEvents = this.events.filter(e => (e as any).timestamp > oneDayAgo);

    return {
      totalEvents: this.events.length,
      recentEvents: recentEvents.length,
      dailyEvents: dailyEvents.length,
      threatIntelEntries: this.threatIntel.size,
      blockedIPs: Array.from(this.threatIntel.values()).filter(t => t.blocked).length,
      eventsBySeverity: {
        CRITICAL: recentEvents.filter(e => e.severity === 'CRITICAL').length,
        HIGH: recentEvents.filter(e => e.severity === 'HIGH').length,
        MEDIUM: recentEvents.filter(e => e.severity === 'MEDIUM').length,
        LOW: recentEvents.filter(e => e.severity === 'LOW').length
      }
    };
  }

  // Cleanup old events and threat intelligence
  static cleanup() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // Clean old events
    this.events = this.events.filter(e => (e as any).timestamp > oneWeekAgo);
    
    // Clean old threat intelligence
    for (const [ip, intel] of this.threatIntel.entries()) {
      if (intel.lastSeen.getTime() < oneWeekAgo) {
        this.threatIntel.delete(ip);
      }
    }

    logger.info('Security monitoring cleanup completed', {
      activeEvents: this.events.length,
      threatIntelEntries: this.threatIntel.size
    });
  }
}

// Cleanup every hour
setInterval(() => SecurityMonitoring.cleanup(), 60 * 60 * 1000);