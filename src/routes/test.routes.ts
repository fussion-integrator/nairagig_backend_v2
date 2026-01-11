import { Router } from 'express';
import { emailService } from '../services/email.service';

const router = Router();

router.post('/send-test-email', async (req, res) => {
  try {
    const { to = 'travellerasm@gmail.com' } = req.body;
    
    const result = await emailService.sendContactConfirmation(
      'Test User',
      to,
      'SMTP Test',
      'Testing SMTP connection with fixed configuration.',
      'TEST-' + Date.now()
    );

    if (result) {
      res.json({ success: true, message: 'Email sent successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send email' });
    }
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: 'Email service error',
      error: error.message 
    });
  }
});

export default router;