import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/ApiError';

const prisma = new PrismaClient();

export const submitContact = async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      throw ApiError.badRequest('Name, email, and message are required');
    }

    // Input sanitization and validation
    const sanitizedName = name.trim().substring(0, 100);
    const sanitizedEmail = email.trim().toLowerCase().substring(0, 255);
    const sanitizedMessage = message.trim().substring(0, 2000);
    
    if (sanitizedName.length < 2) {
      throw ApiError.badRequest('Name must be at least 2 characters long');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      throw ApiError.badRequest('Please provide a valid email address');
    }

    if (sanitizedMessage.length < 10) {
      throw ApiError.badRequest('Message must be at least 10 characters long');
    }

    // Rate limiting check - prevent spam
    const recentContacts = await prisma.contact.count({
      where: {
        email: sanitizedEmail,
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      }
    });

    if (recentContacts >= 3) {
      throw ApiError.tooManyRequests('Too many contact submissions. Please try again later.');
    }

    // Map subject to enum value
    const subjectMap: { [key: string]: string } = {
      'general': 'GENERAL',
      'support': 'SUPPORT', 
      'billing': 'BILLING',
      'partnership': 'PARTNERSHIP',
      'report': 'REPORT'
    };

    const validatedSubject = subject && subjectMap[subject] ? subjectMap[subject] : 'GENERAL';

    // Save to database
    const contact = await prisma.contact.create({
      data: {
        name: sanitizedName,
        email: sanitizedEmail,
        subject: validatedSubject as any,
        message: sanitizedMessage
      }
    });

    // Send confirmation email to user
    await emailService.sendContactConfirmation(
      sanitizedName, 
      sanitizedEmail, 
      validatedSubject, 
      sanitizedMessage, 
      contact.id
    );
    
    // Send notification email to admin
    await emailService.sendContactAdminNotification(
      sanitizedName, 
      sanitizedEmail, 
      validatedSubject, 
      sanitizedMessage, 
      contact.id
    );

    logger.info(`Contact form submitted: ${contact.id}`);

    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you within 24 hours.',
      contactId: contact.id
    });

  } catch (error) {
    logger.error('Error submitting contact form');
    
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};