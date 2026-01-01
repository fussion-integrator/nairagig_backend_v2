const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's job matches
router.get('/matches', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10, minScore = 70 } = req.query;
    const userId = req.user.id;
    
    const matches = await prisma.jobMatch.findMany({
      where: {
        userId,
        matchScore: {
          gte: parseInt(minScore)
        }
      },
      orderBy: [
        { matchScore: 'desc' },
        { postedDate: 'desc' }
      ],
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });
    
    const total = await prisma.jobMatch.count({
      where: {
        userId,
        matchScore: {
          gte: parseInt(minScore)
        }
      }
    });
    
    res.json({
      matches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching job matches:', error);
    res.status(500).json({ error: 'Failed to fetch job matches' });
  }
});

// Update user job preferences
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = req.body;
    
    const updatedPreferences = await prisma.userJobPreferences.upsert({
      where: { userId },
      update: preferences,
      create: {
        userId,
        ...preferences
      }
    });
    
    res.json(updatedPreferences);
  } catch (error) {
    console.error('Error updating job preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get user job preferences
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const preferences = await prisma.userJobPreferences.findUnique({
      where: { userId }
    });
    
    res.json(preferences || {});
  } catch (error) {
    console.error('Error fetching job preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Manual job scout trigger (for testing)
router.post('/scout', authenticate, async (req, res) => {
  try {
    // Only allow admins or for development
    if (process.env.NODE_ENV === 'production' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const { scoutJobs } = require('../scripts/job-scout');
    
    // Run job scout in background
    scoutJobs().catch(console.error);
    
    res.json({ message: 'Job scout started' });
  } catch (error) {
    console.error('Error starting job scout:', error);
    res.status(500).json({ error: 'Failed to start job scout' });
  }
});

// Get job scout statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stats = await prisma.jobMatch.groupBy({
      by: ['source'],
      where: { userId },
      _count: {
        id: true
      },
      _avg: {
        matchScore: true
      }
    });
    
    const totalMatches = await prisma.jobMatch.count({
      where: { userId }
    });
    
    const highScoreMatches = await prisma.jobMatch.count({
      where: {
        userId,
        matchScore: {
          gte: 80
        }
      }
    });
    
    res.json({
      totalMatches,
      highScoreMatches,
      sourceBreakdown: stats,
      lastUpdate: await prisma.jobMatch.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      })
    });
  } catch (error) {
    console.error('Error fetching job scout stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;