import nodemailer from 'nodemailer';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import fs from 'fs';
import path from 'path';

interface EmailOptions {
  to: string | string[];
  subject: string;
  template: string;
  data: Record<string, any>;
  cc?: string | string[];
  bcc?: string | string[];
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'hello@nairagig.com',
        pass: 'Skiesinger1128@@'
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  private async loadTemplate(templateName: string): Promise<string> {
    try {
      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
      return fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
      logger.error(`Failed to load email template: ${templateName}`, error);
      throw new Error(`Email template not found: ${templateName}`);
    }
  }

  private replaceVariables(template: string, data: Record<string, any>): string {
    let result = template;
    
    // Replace all {{variable}} placeholders
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, data[key] || '');
    });

    // Add default variables
    result = result.replace(/{{currentYear}}/g, new Date().getFullYear().toString());
    result = result.replace(/{{companyName}}/g, 'NairaGig');
    result = result.replace(/{{supportEmail}}/g, 'contact@nairagig.com');
    result = result.replace(/{{websiteUrl}}/g, 'https://nairagig.com');

    return result;
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const template = await this.loadTemplate(options.template);
      const htmlContent = this.replaceVariables(template, options.data);

      const mailOptions = {
        from: {
          name: 'NairaGig Security Team',
          address: 'hello@nairagig.com'
        },
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: htmlContent,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        headers: {
          'X-Priority': '3',
          'X-MSMail-Priority': 'Normal',
          'Importance': 'normal',
          'X-Mailer': 'NairaGig Email Service',
          'List-Unsubscribe': '<mailto:unsubscribe@nairagig.com>',
          'Authentication-Results': 'nairagig.com; spf=pass; dkim=pass',
          'X-Spam-Status': 'No'
        }
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${options.to}`, { messageId: result.messageId });
      return true;
    } catch (error) {
      logger.error('Failed to send email', error);
      return false;
    }
  }

  // Contact form emails
  async sendContactConfirmation(name: string, email: string, subject: string, message: string, contactId: string) {
    return this.sendEmail({
      to: email,
      subject: 'Thank you for contacting NairaGig',
      template: 'contact-confirmation',
      data: { name, subject, message, contactId }
    });
  }

  async sendContactAdminNotification(name: string, email: string, subject: string, message: string, contactId: string) {
    return this.sendEmail({
      to: 'contact@nairagig.com',
      subject: `New Contact Form Submission - ${subject}`,
      template: 'contact-admin-notification',
      data: { name, email, subject, message, contactId }
    });
  }

  // Authentication emails
  async sendWelcomeEmail(firstName: string, lastName: string, email: string, authProvider: string, role: string) {
    return this.sendEmail({
      to: email,
      subject: 'Welcome to NairaGig - Your Freelance Journey Begins!',
      template: 'welcome',
      data: { 
        firstName, 
        lastName, 
        email, 
        authProvider, 
        role,
        registrationDate: new Date().toLocaleDateString()
      }
    });
  }

  async sendLoginAlert(firstName: string, email: string, loginTime: string, location: string, deviceInfo: string, ipAddress: string, authProvider: string) {
    return this.sendEmail({
      to: email,
      subject: 'New Login Alert - NairaGig Security',
      template: 'login-alert',
      data: { firstName, loginTime, location, deviceInfo, ipAddress, authProvider }
    });
  }

  async sendAccountActivation(firstName: string, email: string, progressPercentage: number, activationLink: string, daysLeft: number) {
    const getStatusIcon = (completed: boolean) => completed ? '✅' : '⭕';
    
    return this.sendEmail({
      to: email,
      subject: 'Complete Your NairaGig Profile - Unlock Premium Features',
      template: 'account-activation',
      data: { 
        firstName, 
        progressPercentage,
        activationLink,
        daysLeft,
        profilePhotoStatus: getStatusIcon(false), // These would be calculated based on actual profile data
        skillsStatus: getStatusIcon(false),
        bioStatus: getStatusIcon(false),
        portfolioStatus: getStatusIcon(false),
        verificationStatus: getStatusIcon(false)
      }
    });
  }

  async sendTwoFactorSetup(firstName: string, email: string, qrCodeUrl: string, manualCode: string, setupUrl: string) {
    return this.sendEmail({
      to: email,
      subject: 'Secure Your Account with 2FA - NairaGig',
      template: 'two-factor-setup',
      data: { firstName, qrCodeUrl, manualCode, setupUrl }
    });
  }

  async sendAccountVerification(firstName: string, email: string) {
    return this.sendEmail({
      to: email,
      subject: '🎉 Account Verified - Welcome to Trusted Status!',
      template: 'account-verified',
      data: { firstName }
    });
  }

  async sendAccountActivation(firstName: string, email: string) {
    return this.sendEmail({
      to: email,
      subject: 'Account Activated - Welcome to Full Access!',
      template: 'account-activated',
      data: { firstName }
    });
  }

  async sendAdminMessage(firstName: string, email: string, messageData: {
    subject: string;
    message: string;
    adminName: string;
    sentDate: string;
    actionRequired?: boolean;
  }) {
    return this.sendEmail({
      to: email,
      subject: `Admin Message: ${messageData.subject}`,
      template: 'admin-message',
      data: { 
        firstName,
        subject: messageData.subject,
        message: messageData.message,
        adminName: messageData.adminName,
        sentDate: messageData.sentDate,
        actionRequired: messageData.actionRequired || false
      }
    });
  }

  async sendAccountRestoration(firstName: string, email: string, restorationData: {
    restorationDate: string;
    referenceId: string;
    accountStatus: string;
  }) {
    return this.sendEmail({
      to: email,
      subject: 'Great News: Your NairaGig Account Has Been Restored',
      template: 'account-restored',
      data: { 
        firstName,
        restorationDate: restorationData.restorationDate,
        referenceId: restorationData.referenceId,
        accountStatus: restorationData.accountStatus
      }
    });
  }

  async sendAccountPermanentDeletion(email: string, deletionData: {
    deletionDate: string;
    referenceId: string;
    originalDeletionDate: string;
    retentionPeriod: string;
  }) {
    return this.sendEmail({
      to: email,
      subject: 'Final Notice: NairaGig Account Permanently Deleted',
      template: 'account-permanently-deleted',
      data: { 
        deletionDate: deletionData.deletionDate,
        referenceId: deletionData.referenceId,
        originalDeletionDate: deletionData.originalDeletionDate,
        retentionPeriod: deletionData.retentionPeriod
      }
    });
  }

  async sendAccountDeletion(firstName: string, email: string, deletionData: {
    deletionDate: string;
    referenceId: string;
    retentionPeriod: string;
    appealDeadline: string;
    permanentDeletionDate: string;
  }) {
    return this.sendEmail({
      to: email,
      subject: 'Account Status Update - NairaGig',
      template: 'account-deleted',
      data: { 
        firstName,
        deletionDate: deletionData.deletionDate,
        referenceId: deletionData.referenceId,
        retentionPeriod: deletionData.retentionPeriod,
        appealDeadline: deletionData.appealDeadline,
        permanentDeletionDate: deletionData.permanentDeletionDate
      }
    });
  }

  async sendAccountSuspension(firstName: string, email: string, suspensionData: {
    reason: string;
    duration: string;
    referenceId: string;
    reviewDate: string;
    violationDetails: string;
    policySection: string;
    reviewPeriod: string;
    appealDeadline: string;
    appealUrl: string;
    accountBalance: string;
  }) {
    return this.sendEmail({
      to: email,
      subject: 'Important: Account Suspension Notice - NairaGig',
      template: 'account-suspended',
      data: { 
        firstName,
        suspensionReason: suspensionData.reason,
        suspensionDate: new Date().toLocaleDateString(),
        suspensionDuration: suspensionData.duration,
        referenceId: suspensionData.referenceId,
        reviewDate: suspensionData.reviewDate,
        violationDetails: suspensionData.violationDetails,
        policySection: suspensionData.policySection,
        reviewPeriod: suspensionData.reviewPeriod,
        appealDeadline: suspensionData.appealDeadline,
        appealUrl: suspensionData.appealUrl,
        accountBalance: suspensionData.accountBalance
      }
    });
  }

  // Job-related emails
  async sendJobApplicationReceived(clientEmail: string, clientName: string, jobTitle: string, freelancerName: string) {
    return this.sendEmail({
      to: clientEmail,
      subject: `New Application for "${jobTitle}"`,
      template: 'job-application-received',
      data: { clientName, jobTitle, freelancerName }
    });
  }

  async sendJobApplicationStatus(freelancerEmail: string, freelancerName: string, jobTitle: string, applicationStatus: string, statusData: any) {
    const statusConfig = {
      'ACCEPTED': { icon: '✅', color: '#16a34a', class: 'accepted' },
      'REJECTED': { icon: '❌', color: '#dc2626', class: 'rejected' },
      'PENDING': { icon: '⏳', color: '#f59e0b', class: 'pending' }
    };
    
    const config = statusConfig[applicationStatus as keyof typeof statusConfig] || statusConfig.PENDING;
    
    return this.sendEmail({
      to: freelancerEmail,
      subject: `Application Update: ${jobTitle}`,
      template: 'job-application-status',
      data: {
        freelancerName,
        jobTitle,
        applicationStatus,
        statusIcon: config.icon,
        statusColor: config.color,
        statusClass: config.class,
        updateDate: new Date().toLocaleDateString(),
        ...statusData
      }
    });
  }

  async sendJobAwarded(freelancerEmail: string, freelancerName: string, jobTitle: string, amount: string, clientName: string) {
    return this.sendEmail({
      to: freelancerEmail,
      subject: `Congratulations! You've been awarded "${jobTitle}"`,
      template: 'job-awarded',
      data: { freelancerName, jobTitle, amount, clientName }
    });
  }

  async sendJobCompleted(recipientEmail: string, projectData: {
    projectTitle: string;
    completionDate: string;
    clientName: string;
    freelancerName: string;
    totalValue: string;
    projectDuration: string;
    isFreelancer?: boolean;
    isClient?: boolean;
  }) {
    return this.sendEmail({
      to: recipientEmail,
      subject: `Project Completed: ${projectData.projectTitle}`,
      template: 'job-completed',
      data: projectData
    });
  }

  async sendJobCancelled(recipientEmail: string, recipientName: string, cancellationData: {
    jobTitle: string;
    jobCategory: string;
    jobBudget: string;
    cancellationReason: string;
    cancellationDate: string;
    isClient?: boolean;
    isFreelancer?: boolean;
  }) {
    return this.sendEmail({
      to: recipientEmail,
      subject: `Job Cancelled: ${cancellationData.jobTitle}`,
      template: 'job-cancelled',
      data: { recipientName, ...cancellationData }
    });
  }

  async sendJobDeadlineReminder(recipientEmail: string, recipientName: string, deadlineData: {
    projectTitle: string;
    deadlineDate: string;
    timeRemaining: string;
    progressPercentage: number;
    isUrgent?: boolean;
    isFreelancer?: boolean;
    isClient?: boolean;
  }) {
    return this.sendEmail({
      to: recipientEmail,
      subject: `Deadline Reminder: ${deadlineData.projectTitle}`,
      template: 'job-deadline-reminder',
      data: { recipientName, ...deadlineData }
    });
  }

  async sendJobQuestionReceived(clientEmail: string, clientName: string, questionData: {
    jobTitle: string;
    questionText: string;
    freelancerName: string;
    questionDate: string;
    isPublic: boolean;
  }) {
    return this.sendEmail({
      to: clientEmail,
      subject: `New Question: ${questionData.jobTitle}`,
      template: 'job-question-received',
      data: { clientName, ...questionData }
    });
  }

  async sendJobReviewRequest(recipientEmail: string, recipientName: string, reviewData: {
    projectTitle: string;
    partnerName: string;
    completionDate: string;
    projectValue: string;
    isClient?: boolean;
    isFreelancer?: boolean;
  }) {
    return this.sendEmail({
      to: recipientEmail,
      subject: `Please Review: ${reviewData.projectTitle}`,
      template: 'job-review-request',
      data: { recipientName, ...reviewData }
    });
  }

  // Payment emails
  async sendPaymentReceived(email: string, amount: string, projectTitle: string, paymentMethod: string) {
    return this.sendEmail({
      to: email,
      subject: 'Payment Received - NairaGig',
      template: 'payment-received',
      data: { amount, projectTitle, paymentMethod }
    });
  }

  // Challenge emails
  async sendChallengeRegistration(email: string, challengeTitle: string, submissionDeadline: string) {
    return this.sendEmail({
      to: email,
      subject: `Challenge Registration Confirmed - ${challengeTitle}`,
      template: 'challenge-registration',
      data: { challengeTitle, registrationDate: new Date().toLocaleDateString(), submissionDeadline }
    });
  }

  // Security emails
  async sendSecurityAlert(email: string, activity: string, location: string) {
    return this.sendEmail({
      to: email,
      subject: 'Security Alert - NairaGig Account Activity',
      template: 'security-alert',
      data: { activity, location, timestamp: new Date().toLocaleString() }
    });
  }

  // Project & Payment emails
  async sendProjectStarted(to: string, data: {
    recipientName: string;
    projectTitle: string;
    partnerName: string;
    isClient: boolean;
    startDate: string;
    expectedCompletion: string;
    totalBudget: string;
    milestones?: Array<{
      title: string;
      amount: string;
      dueDate: string;
    }>;
    projectUrl: string;
  }) {
    const subject = `🚀 Project Started: ${data.projectTitle}`;
    const template = 'project-started';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendMilestoneSubmitted(to: string, data: {
    recipientName: string;
    projectTitle: string;
    milestoneTitle: string;
    milestoneAmount: string;
    submissionDate: string;
    description?: string;
    freelancerName?: string;
    isClient: boolean;
    deliverables?: Array<{
      name: string;
      description?: string;
    }>;
    reviewDeadline?: string;
    reviewUrl?: string;
    projectUrl: string;
    messageUrl?: string;
  }) {
    const subject = `📤 Milestone Submitted: ${data.milestoneTitle}`;
    const template = 'milestone-submitted';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendMilestoneApproved(to: string, data: {
    recipientName: string;
    projectTitle: string;
    milestoneTitle: string;
    milestoneAmount: string;
    approvalDate: string;
    approvalNotes?: string;
    clientFeedback?: string;
    clientName?: string;
    isFreelancer: boolean;
    paymentAmount?: string;
    processingFee?: string;
    netAmount?: string;
    paymentETA?: string;
    paymentMethod?: string;
    transactionId?: string;
    hasNextMilestone: boolean;
    nextMilestoneTitle?: string;
    nextMilestoneDue?: string;
    nextMilestoneAmount?: string;
    projectUrl: string;
    portfolioUrl?: string;
    reviewUrl?: string;
  }) {
    const subject = `✅ Milestone Approved: ${data.milestoneTitle}`;
    const template = 'milestone-approved';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendPaymentReceivedConfirmation(to: string, data: {
    recipientName: string;
    projectTitle: string;
    freelancerName: string;
    totalAmount: string;
    milestoneTitle?: string;
    paymentType?: string;
    paymentDate: string;
    baseAmount: string;
    platformFee?: string;
    platformFeePercent?: string;
    processingFee?: string;
    taxes?: string;
    taxRate?: string;
    paymentMethod: string;
    transactionId: string;
    referenceNumber?: string;
    hasNextMilestone: boolean;
    nextMilestoneTitle?: string;
    nextMilestoneDue?: string;
    nextMilestoneAmount?: string;
    projectUrl: string;
    receiptUrl: string;
    billingUrl: string;
  }) {
    const subject = `💰 Payment Received: ${data.projectTitle}`;
    const template = 'payment-received';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendWithdrawalProcessed(to: string, data: {
    recipientName: string;
    withdrawalAmount: string;
    requestedAmount: string;
    processingFee: string;
    requestDate: string;
    processedDate: string;
    bankName: string;
    accountName: string;
    maskedAccountNumber: string;
    transactionReference: string;
    expectedArrival: string;
    balanceBefore: string;
    remainingBalance: string;
    hasEarningsWaiting: boolean;
    pendingEarnings?: string;
    earningsUrl: string;
    withdrawalHistoryUrl: string;
    bankAccountsUrl: string;
  }) {
    const subject = `💸 Withdrawal Processed: ₦${data.withdrawalAmount}`;
    const template = 'withdrawal-processed';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendPaymentFailed(to: string, data: {
    recipientName: string;
    projectTitle: string;
    milestoneTitle?: string;
    paymentType?: string;
    paymentAmount: string;
    attemptDate: string;
    failureReason: string;
    failureDetails?: string;
    paymentMethod: string;
    cardDetails?: string;
    bankDetails?: string;
    transactionId: string;
    isInsufficientFunds: boolean;
    isCardDeclined: boolean;
    isNetworkError: boolean;
    isGenericError: boolean;
    projectImpact?: string;
    deadlineWarning?: string;
    retryPaymentUrl: string;
    paymentMethodsUrl: string;
    supportUrl: string;
  }) {
    const subject = `❌ Payment Failed: ${data.projectTitle}`;
    const template = 'payment-failed';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  // Challenge emails
  async sendChallengeRegistrationConfirmation(email: string, participantName: string, challengeTitle: string, challengeDescription: string, prizePool: string, deadline: string, challengeId: string) {
    return this.sendEmail({
      to: email,
      subject: `🏆 Registration Confirmed: ${challengeTitle}`,
      template: 'challenge-registration',
      data: {
        participantName,
        challengeTitle,
        challengeDescription,
        prizePool,
        registrationDate: new Date().toLocaleDateString(),
        submissionDeadline: new Date(deadline).toLocaleDateString(),
        challengeUrl: `https://nairagig.com/challenges/${challengeId}`
      }
    });
  }

  async sendChallengeCancelled(email: string, participantName: string, challengeTitle: string, challengeDescription: string, challengeId: string) {
    return this.sendEmail({
      to: email,
      subject: `❌ Challenge Withdrawal Confirmed: ${challengeTitle}`,
      template: 'challenge-cancelled',
      data: {
        participantName,
        challengeTitle,
        challengeDescription,
        cancellationDate: new Date().toLocaleDateString(),
        cancellationReason: 'Participant withdrawal',
        challengesUrl: 'https://nairagig.com/challenges'
      }
    });
  }

  // Dispute emails
  async sendDisputeCreated(email: string, recipientName: string, disputerName: string, disputeTitle: string, disputeDescription: string, disputeId: string, projectTitle: string) {
    return this.sendEmail({
      to: email,
      subject: `🚨 Dispute Raised: ${disputeTitle}`,
      template: 'dispute-created',
      data: {
        recipientName,
        disputerName,
        disputeTitle,
        disputeDescription,
        projectTitle,
        disputeDate: new Date().toLocaleDateString(),
        disputeUrl: `https://nairagig.com/disputes/${disputeId}`
      }
    });
  }

  async sendDisputeResponse(email: string, recipientName: string, responderName: string, disputeTitle: string, responseMessage: string, disputeId: string) {
    return this.sendEmail({
      to: email,
      subject: `💬 New Response: ${disputeTitle}`,
      template: 'dispute-response',
      data: {
        recipientName,
        responderName,
        disputeTitle,
        responseMessage,
        responseDate: new Date().toLocaleDateString(),
        disputeUrl: `https://nairagig.com/disputes/${disputeId}`
      }
    });
  }

  // Support emails
  async sendSupportTicketCreated(adminEmail: string, userName: string, userEmail: string, subject: string, message: string, category: string, priority: string, ticketId: string) {
    return this.sendEmail({
      to: adminEmail,
      subject: `🎫 New Support Ticket: ${subject}`,
      template: 'support-ticket-created',
      data: {
        userName,
        userEmail,
        ticketSubject: subject,
        ticketMessage: message,
        category,
        priority,
        ticketId,
        createdDate: new Date().toLocaleDateString(),
        ticketUrl: `https://admin.nairagig.com/support/${ticketId}`
      }
    });
  }

  // Administrative emails
  async sendRefundProcessed(email: string, refundData: {
    recipientName: string;
    refundAmount: string;
    originalAmount: string;
    refundReason: string;
    processedDate: string;
    refundMethod: string;
    transactionId: string;
    originalTransactionId: string;
    expectedArrival: string;
  }) {
    return this.sendEmail({
      to: email,
      subject: `💰 Refund Processed: ₦${refundData.refundAmount}`,
      template: 'refund-processed',
      data: refundData
    });
  }

  // Administrative emails
  async sendFeatureAccessGranted(email: string, userName: string, featureData: {
    featureName: string;
    featureDescription: string;
    accessLevel: string;
    grantedDate: string;
    featureUrl: string;
  }) {
    return this.sendEmail({
      to: email,
      subject: `🎉 Feature Access Granted: ${featureData.featureName}`,
      template: 'feature-access-granted',
      data: {
        userName,
        ...featureData,
        benefits: [
          'Enhanced platform capabilities',
          'Priority support access',
          'Advanced analytics'
        ]
      }
    });
  }

  // System reminder emails
  async sendPaymentReminder(email: string, clientName: string, paymentData: {
    projectTitle: string;
    milestoneTitle: string;
    amount: string;
    dueDate: string;
    daysOverdue: number;
  }) {
    return this.sendEmail({
      to: email,
      subject: `💳 Payment Reminder: ${paymentData.projectTitle}`,
      template: 'payment-reminder',
      data: {
        clientName,
        ...paymentData,
        urgencyLevel: paymentData.daysOverdue > 7 ? 'High' : 'Medium',
        paymentUrl: 'https://nairagig.com/billing/payments'
      }
    });
  }

  // Review emails
  async sendReviewReceived(to: string, data: {
    recipientName: string;
    reviewerName: string;
    projectTitle: string;
    reviewDate: string;
    reviewType: string;
    starRating: string;
    overallRating: string;
    qualityRating?: string;
    communicationRating?: string;
    timelinessRating?: string;
    detailedRatings?: boolean;
    reviewComment?: string;
    reviewUrl: string;
  }) {
    const subject = `⭐ New Review Received: ${data.projectTitle}`;
    const template = 'review-received';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendReviewRequest(to: string, data: {
    recipientName: string;
    requesterName: string;
    projectTitle: string;
    completionDate: string;
    projectValue: string;
    projectDuration: string;
    isForFreelancer: boolean;
    reviewDeadline?: string;
    reviewUrl: string;
  }) {
    const subject = `⭐ Review Request: ${data.projectTitle}`;
    const template = 'review-request';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendReviewDispute(to: string, data: {
    recipientName: string;
    projectTitle: string;
    disputerName: string;
    disputeDate: string;
    disputeId: string;
    disputeStatus: string;
    reviewerName: string;
    originalRating: string;
    reviewDate: string;
    reviewComment?: string;
    disputeReason?: string;
    disputeDetails?: string;
    resolutionTimeframe: string;
    isDisputer: boolean;
    disputeUrl: string;
  }) {
    const subject = `⚖️ Review Dispute: ${data.projectTitle}`;
    const template = 'review-dispute';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }
  // System & Security emails
  async sendSecurityAlertAdvanced(to: string, data: {
    userName: string;
    alertType: string;
    eventDateTime: string;
    location: string;
    deviceInfo: string;
    ipAddress: string;
    eventDescription: string;
    riskLevel?: string;
    riskColor?: string;
    actionRequired?: boolean;
    requiredActions?: string[];
    securityUrl: string;
  }) {
    const subject = `🚨 Security Alert: ${data.alertType}`;
    const template = 'security-alert';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendVerificationStatus(to: string, data: {
    userName: string;
    verificationStatus: string;
    verificationType: string;
    submissionDate: string;
    reviewDate: string;
    referenceNumber?: string;
    isApproved: boolean;
    isRejected: boolean;
    isPending: boolean;
    rejectionReason?: string;
    additionalNotes?: string;
    documentsReceived?: string;
    expectedCompletion?: string;
    currentStage?: string;
    verificationUrl: string;
    resubmitUrl?: string;
  }) {
    const subject = `🔍 Verification Update: ${data.verificationStatus}`;
    const template = 'verification-status';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendNewsletter(to: string, data: {
    recipientName: string;
    newsletterTitle: string;
    newsletterSubtitle: string;
    introMessage: string;
    platformStats?: {
      totalJobs: string;
      totalFreelancers: string;
      totalEarnings: string;
      completedProjects: string;
    };
    features: Array<{
      icon: string;
      title: string;
      description: string;
      ctaText?: string;
      ctaUrl?: string;
    }>;
    spotlightSection?: {
      title: string;
      content: string;
      ctaText?: string;
      ctaUrl?: string;
    };
    tips?: string[];
    upcomingEvents?: Array<{
      title: string;
      date: string;
      description: string;
    }>;
    mainCtaText: string;
    mainCtaUrl: string;
    unsubscribeUrl: string;
    preferencesUrl: string;
  }) {
    const subject = data.newsletterTitle;
    const template = 'newsletter';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendMaintenanceNotice(to: string, data: {
    userName: string;
    maintenanceType: string;
    startTime: string;
    endTime: string;
    duration: string;
    maintenanceStatus: string;
    maintenanceDate: string;
    timezone: string;
    isRecurring?: boolean;
    recurringSchedule?: string;
    maintenanceDescription: string;
    improvements?: string[];
    serviceAvailability: string;
    affectedServices?: string[];
    unaffectedServices?: string[];
    alternativeAccess?: string;
    statusPageUrl: string;
  }) {
    const subject = `🔧 Maintenance Notice: ${data.maintenanceType}`;
    const template = 'maintenance-notice';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  async sendTwoFactorCode(
    userName: string,
    email: string,
    verificationCode: string,
    loginTime: string,
    location: string,
    deviceInfo: string
  ) {
    const template = await this.loadTemplate('two-factor-code');
    const html = this.replaceVariables(template, {
      userName,
      verificationCode,
      loginTime,
      location,
      deviceInfo,
      securityUrl: `${process.env.FRONTEND_URL}/settings/security`
    });

    const mailOptions = {
      from: {
        name: 'NairaGig Security',
        address: 'hello@nairagig.com'
      },
      to: email,
      subject: 'Your NairaGig Verification Code',
      html,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    };

    const result = await this.transporter.sendMail(mailOptions);
    logger.info(`2FA code sent to ${email}`, { messageId: result.messageId });
    return true;
  }

  async sendFeatureAnnouncement(to: string, data: {
    userName: string;
    featureName: string;
    featureDescription: string;
    launchDate: string;
    availability: string;
    benefits?: Array<{
      icon: string;
      title: string;
      description: string;
    }>;
    steps: string[];
    videoUrl?: string;
    targetAudience?: string[];
    limitations?: string[];
    feedback?: {
      message: string;
      surveyUrl?: string;
    };
    featureUrl: string;
    helpUrl: string;
    feedbackUrl: string;
  }) {
    const subject = `🚀 New Feature: ${data.featureName}`;
    const template = 'feature-announcement';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data
    });
  }

  // Admin invitation email
  async sendAdminInvitation(data: {
    to: string;
    role: string;
    invitedBy: string;
    inviteUrl: string;
  }) {
    return this.sendEmail({
      to: data.to,
      subject: 'You\'re Invited to Join NairaGig Admin Team',
      template: 'admin-invitation',
      data: {
        email: data.to,
        role: data.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin',
        invitedBy: data.invitedBy,
        inviteUrl: data.inviteUrl
      }
    });
  }

  // Referral reward claim email
  async sendReferralRewardClaimed(to: string, data: {
    userName: string;
    userEmail: string;
    claimedAmount: number;
    referralCount: number;
    multiplier: number;
    rewardPerReferral: number;
    newBalance: number;
    claimDate: string;
    nextTierReferrals?: number;
    nextTierMultiplier?: number;
    walletUrl: string;
    referralUrl: string;
  }) {
    const subject = `🎉 Referral Reward Claimed: ₦${data.claimedAmount.toLocaleString()}`;
    const template = 'referral-reward-claimed';
    
    return this.sendEmail({
      to,
      subject,
      template,
      data: {
        ...data,
        unsubscribeUrl: `${process.env.FRONTEND_URL}/settings/notifications`,
        privacyUrl: `${process.env.FRONTEND_URL}/privacy`,
        supportEmail: 'contact@nairagig.com'
      }
    });
  }
}

export const emailService = new EmailService();
export { EmailService };