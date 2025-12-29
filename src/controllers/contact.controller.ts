import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { emailService } from '../services/email.service';

const prisma = new PrismaClient();

export const submitContact = async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Map subject to enum value
    const subjectMap: { [key: string]: string } = {
      'general': 'GENERAL',
      'support': 'SUPPORT', 
      'billing': 'BILLING',
      'partnership': 'PARTNERSHIP',
      'report': 'REPORT'
    };

    // Save to database
    const contact = await prisma.contact.create({
      data: {
        name,
        email,
        subject: (subjectMap[subject] || 'GENERAL') as any,
        message
      }
    });

    // Send confirmation email to user
    await emailService.sendContactConfirmation(name, email, subject, message, contact.id);
    
    // Send notification email to admin
    await emailService.sendContactAdminNotification(name, email, subject, message, contact.id);

    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you within 24 hours.',
      contactId: contact.id
    });

  } catch (error) {
    console.error('Error submitting contact:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};