import Joi from 'joi';

// User validation schemas
export const userValidation = {
  createUser: Joi.object({
    email: Joi.string().email().required(),
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    username: Joi.string().alphanum().min(3).max(30).optional(),
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    role: Joi.string().valid('FREELANCER', 'CLIENT', 'ADMIN').default('FREELANCER'),
    subscriptionTier: Joi.string().valid('free', 'basic', 'premium', 'enterprise').default('free')
  }),

  updateUser: Joi.object({
    firstName: Joi.string().min(2).max(50).optional(),
    lastName: Joi.string().min(2).max(50).optional(),
    username: Joi.string().alphanum().min(3).max(30).optional(),
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    bio: Joi.string().max(500).optional(),
    title: Joi.string().max(100).optional(),
    hourlyRate: Joi.number().min(0).optional(),
    availabilityStatus: Joi.string().valid('available', 'busy', 'unavailable').optional(),
    subscriptionTier: Joi.string().valid('free', 'basic', 'premium', 'enterprise').optional(),
    role: Joi.string().valid('FREELANCER', 'CLIENT', 'ADMIN', 'SUPER_ADMIN').optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED').optional()
  }),

  suspendUser: Joi.object({
    reason: Joi.string().min(10).max(500).required()
  }),

  bulkAction: Joi.object({
    userIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    action: Joi.string().valid('suspend', 'activate', 'updateTier').required(),
    data: Joi.object({
      subscriptionTier: Joi.string().valid('free', 'basic', 'premium', 'enterprise').optional()
    }).optional()
  })
};

// Project validation schemas
export const projectValidation = {
  createProject: Joi.object({
    jobId: Joi.string().uuid().optional(),
    clientId: Joi.string().uuid().required(),
    freelancerId: Joi.string().uuid().required(),
    title: Joi.string().min(5).max(200).required(),
    description: Joi.string().max(2000).optional(),
    agreedBudget: Joi.number().min(0).required(),
    paymentSchedule: Joi.string().valid('UPFRONT', 'MILESTONE', 'COMPLETION').default('MILESTONE'),
    startDate: Joi.date().optional(),
    endDate: Joi.date().greater(Joi.ref('startDate')).optional(),
    contractTerms: Joi.string().max(5000).optional(),
    milestones: Joi.array().items(
      Joi.object({
        title: Joi.string().min(3).max(200).required(),
        description: Joi.string().max(1000).optional(),
        amount: Joi.number().min(0).required(),
        dueDate: Joi.date().optional()
      })
    ).optional()
  }),

  updateProject: Joi.object({
    title: Joi.string().min(5).max(200).optional(),
    description: Joi.string().max(2000).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    contractTerms: Joi.string().max(5000).optional(),
    progressPercentage: Joi.number().min(0).max(100).optional(),
    revisionsUsed: Joi.number().min(0).optional()
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'DISPUTED').required(),
    reason: Joi.string().max(500).optional()
  }),

  createMilestone: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(1000).optional(),
    amount: Joi.number().min(0).required(),
    dueDate: Joi.date().optional(),
    deliverables: Joi.string().max(2000).optional()
  }),

  updateMilestoneStatus: Joi.object({
    status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID').required(),
    feedback: Joi.string().max(1000).optional(),
    deliverableFiles: Joi.array().items(Joi.string()).optional()
  })
};

// Wallet validation schemas
export const walletValidation = {
  createTransaction: Joi.object({
    userId: Joi.string().uuid().required(),
    walletId: Joi.string().uuid().optional(),
    type: Joi.string().valid('DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'REFUND', 'FEE', 'BONUS', 'PENALTY').required(),
    amount: Joi.number().min(0.01).required(),
    currency: Joi.string().length(3).default('NGN'),
    description: Joi.string().max(500).optional(),
    relatedEntityType: Joi.string().max(50).optional(),
    relatedEntityId: Joi.string().uuid().optional(),
    gatewayProvider: Joi.string().valid('paystack', 'flutterwave', 'stripe').optional(),
    metadata: Joi.object().optional()
  }),

  updateTransactionStatus: Joi.object({
    status: Joi.string().valid('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED').required(),
    gatewayResponse: Joi.object().optional(),
    failureReason: Joi.string().max(500).optional()
  }),

  addPaymentMethod: Joi.object({
    type: Joi.string().valid('BANK_ACCOUNT', 'CARD', 'MOBILE_MONEY', 'CRYPTO').required(),
    provider: Joi.string().max(50).optional(),
    bankName: Joi.string().max(100).optional(),
    bankCode: Joi.string().max(10).optional(),
    accountNumber: Joi.string().max(20).optional(),
    accountName: Joi.string().max(100).optional(),
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    networkProvider: Joi.string().max(50).optional(),
    isDefault: Joi.boolean().default(false)
  })
};

// Challenge validation schemas
export const challengeValidation = {
  createChallenge: Joi.object({
    title: Joi.string().min(5).max(200).required(),
    description: Joi.string().min(50).max(5000).required(),
    requirements: Joi.string().min(20).max(3000).required(),
    judgingCriteria: Joi.string().max(2000).optional(),
    category: Joi.string().min(3).max(100).required(),
    difficultyLevel: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT').default('INTERMEDIATE'),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    totalPrizePool: Joi.number().min(0).required(),
    currency: Joi.string().length(3).default('NGN'),
    winnerDistribution: Joi.object().optional(),
    registrationStart: Joi.date().required(),
    registrationEnd: Joi.date().greater(Joi.ref('registrationStart')).required(),
    submissionStart: Joi.date().greater(Joi.ref('registrationStart')).required(),
    submissionEnd: Joi.date().greater(Joi.ref('submissionStart')).required(),
    judgingEnd: Joi.date().greater(Joi.ref('submissionEnd')).required(),
    maxParticipants: Joi.number().min(1).optional(),
    minParticipants: Joi.number().min(1).default(1),
    entryFee: Joi.number().min(0).default(0),
    isTeamChallenge: Joi.boolean().default(false),
    maxTeamSize: Joi.number().min(1).default(1),
    submissionFormat: Joi.string().max(100).optional(),
    visibility: Joi.string().valid('PUBLIC', 'PRIVATE', 'INVITE_ONLY').default('PUBLIC'),
    starterFiles: Joi.array().items(Joi.string()).optional(),
    referenceMaterials: Joi.array().items(Joi.string()).optional()
  }),

  updateChallenge: Joi.object({
    title: Joi.string().min(5).max(200).optional(),
    description: Joi.string().min(50).max(5000).optional(),
    requirements: Joi.string().min(20).max(3000).optional(),
    judgingCriteria: Joi.string().max(2000).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    registrationEnd: Joi.date().optional(),
    submissionEnd: Joi.date().optional(),
    judgingEnd: Joi.date().optional(),
    maxParticipants: Joi.number().min(1).optional(),
    visibility: Joi.string().valid('PUBLIC', 'PRIVATE', 'INVITE_ONLY').optional()
  }),

  joinChallenge: Joi.object({
    teamName: Joi.string().max(100).optional(),
    paymentReference: Joi.string().max(100).optional()
  }),

  submitToChallenge: Joi.object({
    title: Joi.string().max(200).optional(),
    description: Joi.string().max(2000).optional(),
    submissionUrl: Joi.string().uri().optional(),
    repositoryUrl: Joi.string().uri().optional(),
    demoUrl: Joi.string().uri().optional(),
    files: Joi.array().items(Joi.string()).optional(),
    images: Joi.array().items(Joi.string().uri()).optional(),
    videos: Joi.array().items(Joi.string().uri()).optional()
  })
};

// File validation schemas
export const fileValidation = {
  uploadFile: Joi.object({
    fileCategory: Joi.string().valid('PROFILE_IMAGE', 'PORTFOLIO', 'PROJECT_FILE', 'MESSAGE_ATTACHMENT', 'DOCUMENT', 'OTHER').optional(),
    visibility: Joi.string().valid('PUBLIC', 'PRIVATE', 'RESTRICTED').default('PRIVATE'),
    relatedEntityType: Joi.string().max(50).optional(),
    relatedEntityId: Joi.string().uuid().optional()
  })
};

// Notification validation schemas
export const notificationValidation = {
  createNotification: Joi.object({
    userId: Joi.string().uuid().required(),
    type: Joi.string().valid('JOB_APPLICATION', 'JOB_AWARDED', 'PROJECT_UPDATE', 'MESSAGE', 'PAYMENT', 'CHALLENGE', 'SYSTEM', 'MARKETING').required(),
    title: Joi.string().min(3).max(200).required(),
    message: Joi.string().min(10).max(1000).required(),
    actionUrl: Joi.string().uri().optional(),
    actionText: Joi.string().max(100).optional(),
    relatedEntityType: Joi.string().max(50).optional(),
    relatedEntityId: Joi.string().uuid().optional(),
    channels: Joi.array().items(Joi.string().valid('IN_APP', 'EMAIL', 'PUSH', 'SMS')).default(['IN_APP']),
    priority: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'URGENT').default('NORMAL'),
    data: Joi.object().optional(),
    expiresAt: Joi.date().optional()
  }),

  markAsRead: Joi.object({
    notificationIds: Joi.array().items(Joi.string().uuid()).min(1).required()
  })
};