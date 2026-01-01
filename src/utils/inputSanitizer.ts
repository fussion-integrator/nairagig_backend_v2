import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

export class InputSanitizer {
  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  static sanitizeHtml(input: string): string {
    if (typeof input !== 'string') return '';
    
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
      ALLOW_DATA_ATTR: false,
      FORBID_SCRIPT: true,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'iframe'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
    });
  }

  /**
   * Sanitize plain text input
   */
  static sanitizeText(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>.*?<\/object>/gi, '')
      .replace(/<embed[^>]*>.*?<\/embed>/gi, '')
      .replace(/<applet[^>]*>.*?<\/applet>/gi, '')
      .replace(/<form[^>]*>.*?<\/form>/gi, '')
      .replace(/<input[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/style\s*=/gi, '')
      .replace(/expression\s*\(/gi, '')
      .trim();
  }

  /**
   * Sanitize email input
   */
  static sanitizeEmail(email: string): string {
    if (typeof email !== 'string') return '';
    
    const sanitized = email.toLowerCase().trim();
    return validator.isEmail(sanitized) ? sanitized : '';
  }

  /**
   * Sanitize URL input
   */
  static sanitizeUrl(url: string): string {
    if (typeof url !== 'string') return '';
    
    const sanitized = url.trim();
    
    // Allow only http and https protocols
    if (!validator.isURL(sanitized, { 
      protocols: ['http', 'https'],
      require_protocol: true 
    })) {
      return '';
    }
    
    return sanitized;
  }

  /**
   * Sanitize phone number
   */
  static sanitizePhone(phone: string): string {
    if (typeof phone !== 'string') return '';
    
    // Remove all non-digit characters except + at the beginning
    const sanitized = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    
    return validator.isMobilePhone(sanitized) ? sanitized : '';
  }

  /**
   * Sanitize numeric input
   */
  static sanitizeNumber(input: any): number | null {
    if (typeof input === 'number' && !isNaN(input)) return input;
    if (typeof input === 'string' && validator.isNumeric(input)) {
      return parseFloat(input);
    }
    return null;
  }

  /**
   * Sanitize integer input
   */
  static sanitizeInteger(input: any): number | null {
    if (typeof input === 'number' && Number.isInteger(input)) return input;
    if (typeof input === 'string' && validator.isInt(input)) {
      return parseInt(input, 10);
    }
    return null;
  }

  /**
   * Sanitize boolean input
   */
  static sanitizeBoolean(input: any): boolean {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      const lower = input.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    if (typeof input === 'number') return input !== 0;
    return false;
  }

  /**
   * Sanitize object recursively
   */
  static sanitizeObject(obj: any, schema?: Record<string, string>): any {
    if (obj === null || obj === undefined) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, schema));
    }
    
    if (typeof obj !== 'object') {
      return this.sanitizeText(String(obj));
    }
    
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeText(key);
      
      if (schema && schema[key]) {
        // Apply specific sanitization based on schema
        switch (schema[key]) {
          case 'email':
            sanitized[sanitizedKey] = this.sanitizeEmail(value as string);
            break;
          case 'url':
            sanitized[sanitizedKey] = this.sanitizeUrl(value as string);
            break;
          case 'phone':
            sanitized[sanitizedKey] = this.sanitizePhone(value as string);
            break;
          case 'number':
            sanitized[sanitizedKey] = this.sanitizeNumber(value);
            break;
          case 'integer':
            sanitized[sanitizedKey] = this.sanitizeInteger(value);
            break;
          case 'boolean':
            sanitized[sanitizedKey] = this.sanitizeBoolean(value);
            break;
          case 'html':
            sanitized[sanitizedKey] = this.sanitizeHtml(value as string);
            break;
          default:
            sanitized[sanitizedKey] = this.sanitizeText(value as string);
        }
      } else {
        // Default sanitization
        if (typeof value === 'string') {
          sanitized[sanitizedKey] = this.sanitizeText(value);
        } else if (typeof value === 'object') {
          sanitized[sanitizedKey] = this.sanitizeObject(value, schema);
        } else {
          sanitized[sanitizedKey] = value;
        }
      }
    }
    
    return sanitized;
  }

  /**
   * Validate and sanitize SQL-like input to prevent injection
   */
  static sanitizeSqlInput(input: string): string {
    if (typeof input !== 'string') return '';
    
    // Remove common SQL injection patterns
    return input
      .replace(/('|(\\')|(;)|(\\)|(--)|(\s*(union|select|insert|update|delete|drop|create|alter|exec|execute)\s+)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Sanitize file name
   */
  static sanitizeFileName(fileName: string): string {
    if (typeof fileName !== 'string') return '';
    
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 255);
  }

  /**
   * Sanitize search query
   */
  static sanitizeSearchQuery(query: string): string {
    if (typeof query !== 'string') return '';
    
    return query
      .replace(/[<>\"'%;()&+]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  /**
   * Validate and sanitize JSON input
   */
  static sanitizeJson(input: string): any {
    if (typeof input !== 'string') return null;
    
    try {
      const parsed = JSON.parse(input);
      return this.sanitizeObject(parsed);
    } catch {
      return null;
    }
  }
}

/**
 * Middleware for automatic input sanitization
 */
export const sanitizeInputMiddleware = (schema?: Record<string, string>) => {
  return (req: any, res: any, next: any) => {
    if (req.body && typeof req.body === 'object') {
      req.body = InputSanitizer.sanitizeObject(req.body, schema);
    }
    
    if (req.query && typeof req.query === 'object') {
      req.query = InputSanitizer.sanitizeObject(req.query, schema);
    }
    
    if (req.params && typeof req.params === 'object') {
      req.params = InputSanitizer.sanitizeObject(req.params, schema);
    }
    
    next();
  };
};