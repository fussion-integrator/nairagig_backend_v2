import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/content-creator';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed for video field'));
      }
    } else if (file.fieldname === 'thumbnail') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for thumbnail field'));
      }
    } else {
      cb(new Error('Unexpected field'));
    }
  }
});

export const uploadMiddleware = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const submitContent = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, description, contentType, contentRights } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!contentRights || contentRights !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'You must agree to content rights to submit content'
      });
    }

    if (!files?.video || files.video.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Video file is required'
      });
    }

    const videoFile = files.video[0];
    const thumbnailFile = files.thumbnail?.[0];

    // Save video file record
    const videoFileRecord = await prisma.file.create({
      data: {
        uploadedBy: userId,
        originalName: videoFile.originalname,
        fileName: videoFile.filename,
        filePath: videoFile.path,
        fileSize: BigInt(videoFile.size),
        mimeType: videoFile.mimetype,
        fileExtension: path.extname(videoFile.originalname),
        fileCategory: 'OTHER',
        visibility: 'PRIVATE'
      }
    });

    // Save thumbnail file record if provided
    let thumbnailFileRecord = null;
    if (thumbnailFile) {
      thumbnailFileRecord = await prisma.file.create({
        data: {
          uploadedBy: userId,
          originalName: thumbnailFile.originalname,
          fileName: thumbnailFile.filename,
          filePath: thumbnailFile.path,
          fileSize: BigInt(thumbnailFile.size),
          mimeType: thumbnailFile.mimetype,
          fileExtension: path.extname(thumbnailFile.originalname),
          fileCategory: 'OTHER',
          visibility: 'PRIVATE'
        }
      });
    }

    const post = await prisma.contentCreatorPost.create({
      data: {
        userId,
        title,
        description,
        videoFileId: videoFileRecord.id,
        thumbnailFileId: thumbnailFileRecord?.id,
        contentType,
        contentRights: true,
        status: 'PENDING'
      }
    });

    // Create milestones
    await prisma.contentMilestone.createMany({
      data: [
        {
          postId: post.id,
          milestoneType: 'VIEWS_100',
          targetValue: 100,
          rewardAmount: 100
        },
        {
          postId: post.id,
          milestoneType: 'REACTIONS_MILESTONE',
          targetValue: 1,
          rewardAmount: 5
        },
        {
          postId: post.id,
          milestoneType: 'COMMENTS_MILESTONE',
          targetValue: 1,
          rewardAmount: 10
        }
      ]
    });

    // Send email to admins
    const adminEmails = ['hello@nairagig.com', 'fussion.integration@gmail.com'];
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: adminEmails.join(','),
      subject: 'New Content Creator Submission - NairaGig',
      html: `
        <h2>New Content Creator Submission</h2>
        <p><strong>Title:</strong> ${title}</p>
        <p><strong>Description:</strong> ${description}</p>
        <p><strong>Content Type:</strong> ${contentType}</p>
        <p><strong>Video File:</strong> ${videoFile.originalname}</p>
        <p><strong>File Size:</strong> ${(videoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
        <p><strong>Submitted by:</strong> ${req.user?.firstName} ${req.user?.lastName}</p>
        <p><strong>User Email:</strong> ${req.user?.email}</p>
        <p>Please review and publish this content on social media platforms.</p>
        <p><strong>Download Link:</strong> <a href="${process.env.API_BASE_URL || 'http://localhost:3000'}/uploads/content-creator/${videoFile.filename}">Download Video</a></p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Content submitted successfully',
      data: { postId: post.id }
    });
  } catch (error) {
    console.error('Submit content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit content'
    });
  }
};

export const getUserPosts = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const posts = await prisma.contentCreatorPost.findMany({
      where: { userId },
      include: {
        milestones: true,
        videoFile: true,
        thumbnailFile: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: posts
    });
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch posts'
    });
  }
};

export const updatePostMetrics = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { views, reactions, comments, publishedUrls } = req.body;

    const post = await prisma.contentCreatorPost.update({
      where: { id: postId },
      data: {
        views: views || 0,
        reactions: reactions || 0,
        comments: comments || 0,
        publishedUrls: publishedUrls || null,
        status: publishedUrls ? 'PUBLISHED' : 'APPROVED'
      }
    });

    // Check and complete milestones
    const milestones = await prisma.contentMilestone.findMany({
      where: { postId, isCompleted: false }
    });

    let totalEarnings = 0;

    for (const milestone of milestones) {
      let currentValue = 0;
      let shouldComplete = false;

      switch (milestone.milestoneType) {
        case 'VIEWS_100':
          currentValue = views || 0;
          shouldComplete = currentValue >= milestone.targetValue;
          break;
        case 'REACTIONS_MILESTONE':
          currentValue = reactions || 0;
          shouldComplete = currentValue > 0;
          break;
        case 'COMMENTS_MILESTONE':
          currentValue = comments || 0;
          shouldComplete = currentValue > 0;
          break;
      }

      if (shouldComplete && !milestone.isCompleted) {
        await prisma.contentMilestone.update({
          where: { id: milestone.id },
          data: {
            currentValue,
            isCompleted: true,
            completedAt: new Date()
          }
        });

        // Calculate earnings based on milestone type
        let earnings = 0;
        if (milestone.milestoneType === 'VIEWS_100') {
          earnings = milestone.rewardAmount;
        } else if (milestone.milestoneType === 'REACTIONS_MILESTONE') {
          earnings = currentValue * milestone.rewardAmount;
        } else if (milestone.milestoneType === 'COMMENTS_MILESTONE') {
          earnings = currentValue * milestone.rewardAmount;
        }

        totalEarnings += earnings;
      }
    }

    // Update total earnings
    if (totalEarnings > 0) {
      await prisma.contentCreatorPost.update({
        where: { id: postId },
        data: {
          totalEarnings: {
            increment: totalEarnings
          }
        }
      });

      // Add to user wallet
      await prisma.wallet.upsert({
        where: {
          userId_currency: {
            userId: post.userId,
            currency: 'NGN'
          }
        },
        create: {
          userId: post.userId,
          availableBalance: totalEarnings,
          currency: 'NGN'
        },
        update: {
          availableBalance: {
            increment: totalEarnings
          },
          totalEarned: {
            increment: totalEarnings
          }
        }
      });
    }

    res.json({
      success: true,
      message: 'Post metrics updated successfully',
      data: { earnings: totalEarnings }
    });
  } catch (error) {
    console.error('Update post metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update post metrics'
    });
  }
};

export const getPostStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const stats = await prisma.contentCreatorPost.aggregate({
      where: { userId },
      _sum: {
        views: true,
        reactions: true,
        comments: true,
        totalEarnings: true
      },
      _count: {
        id: true
      }
    });

    const pendingPosts = await prisma.contentCreatorPost.count({
      where: { userId, status: 'PENDING' }
    });

    const publishedPosts = await prisma.contentCreatorPost.count({
      where: { userId, status: 'PUBLISHED' }
    });

    res.json({
      success: true,
      data: {
        totalPosts: stats._count.id || 0,
        pendingPosts,
        publishedPosts,
        totalViews: stats._sum.views || 0,
        totalReactions: stats._sum.reactions || 0,
        totalComments: stats._sum.comments || 0,
        totalEarnings: stats._sum.totalEarnings || 0
      }
    });
  } catch (error) {
    console.error('Get post stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post statistics'
    });
  }
};