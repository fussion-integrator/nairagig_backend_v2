import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class SearchController {
  async globalSearch(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, type, limit = 10 } = req.query;
      const userId = (req.user as any)?.id;
      
      if (!q || typeof q !== 'string') {
        throw ApiError.badRequest('Search query is required');
      }

      const searchTerm = q.trim();
      if (searchTerm.length < 2) {
        throw ApiError.badRequest('Search query must be at least 2 characters');
      }

      const results: any = {
        gigs: [],
        jobs: [],
        challenges: [],
        freelancers: [],
        categories: []
      };

      // Search Gigs (Public - no auth required)
      if (!type || type === 'gigs') {
        results.gigs = await prisma.job.findMany({
          where: {
            AND: [
              { status: 'OPEN' },
              {
                OR: [
                  { title: { contains: searchTerm, mode: 'insensitive' } },
                  { description: { contains: searchTerm, mode: 'insensitive' } }
                ]
              }
            ]
          },
          select: {
            id: true,
            title: true,
            description: true,
            budgetMin: true,
            budgetMax: true,
            createdAt: true,
            _count: { select: { applications: true } }
          },
          take: Number(limit),
          orderBy: { createdAt: 'desc' }
        });
      }

      // Protected content - require authentication
      if (userId) {
        // Search Jobs (Protected)
        if (!type || type === 'jobs') {
          results.jobs = await prisma.job.findMany({
            where: {
              AND: [
                { status: 'OPEN' },
                {
                  OR: [
                    { title: { contains: searchTerm, mode: 'insensitive' } },
                    { description: { contains: searchTerm, mode: 'insensitive' } }
                  ]
                }
              ]
            },
            select: {
              id: true,
              title: true,
              description: true,
              budgetMin: true,
              budgetMax: true,
              createdAt: true,
              client: { select: { firstName: true, lastName: true } },
              _count: { select: { applications: true } }
            },
            take: Number(limit),
            orderBy: { createdAt: 'desc' }
          });
        }

        // Search Challenges (Protected)
        if (!type || type === 'challenges') {
          results.challenges = await prisma.challenge.findMany({
            where: {
              AND: [
                { status: 'ACTIVE' },
                {
                  OR: [
                    { title: { contains: searchTerm, mode: 'insensitive' } },
                    { description: { contains: searchTerm, mode: 'insensitive' } }
                  ]
                }
              ]
            },
            select: {
              id: true,
              title: true,
              description: true,
              totalPrizePool: true,
              registrationStart: true,
              registrationEnd: true,
              _count: { select: { participants: true } }
            },
            take: Number(limit),
            orderBy: { createdAt: 'desc' }
          });
        }

        // Search Users/Freelancers (Protected - only public profile info)
        if (!type || type === 'freelancers') {
          results.freelancers = await prisma.user.findMany({
            where: {
              AND: [
                { status: 'ACTIVE' },
                { role: { in: ['FREELANCER'] } },
                {
                  OR: [
                    { firstName: { contains: searchTerm, mode: 'insensitive' } },
                    { lastName: { contains: searchTerm, mode: 'insensitive' } },
                    { title: { contains: searchTerm, mode: 'insensitive' } }
                  ]
                }
              ]
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              title: true,
              profileImageUrl: true,
              bio: true,
              hourlyRate: true,
              _count: { 
                select: { 
                  freelancerProjects: true,
                  reviewsReceived: true
                } 
              },
              reviewsReceived: {
                select: { overallRating: true },
                take: 100
              }
            },
            take: Number(limit),
            orderBy: { createdAt: 'desc' }
          });

          // Calculate average rating for each freelancer
          results.freelancers = results.freelancers.map((freelancer: any) => {
            const ratings = freelancer.reviewsReceived.map((r: any) => r.overallRating);
            const avgRating = ratings.length > 0 
              ? ratings.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.length 
              : 0;
            
            return {
              ...freelancer,
              averageRating: Math.round(avgRating * 10) / 10,
              reviewsReceived: undefined // Remove reviews array from response
            };
          });
        }

        // Search Categories (Protected)
        if (!type || type === 'categories') {
          results.categories = await prisma.category.findMany({
            where: {
              OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { description: { contains: searchTerm, mode: 'insensitive' } }
              ]
            },
            select: {
              id: true,
              name: true,
              description: true,
              icon: true,
              _count: {
                select: {
                  jobs: true
                }
              }
            },
            take: Number(limit),
            orderBy: { name: 'asc' }
          });
        }
      }

      // Calculate total results
      const totalResults = Object.values(results).reduce((sum: number, arr: any[]) => sum + arr.length, 0);

      // Track search query safely
      try {
        await prisma.searchQuery.create({
          data: {
            query: searchTerm,
            userId: userId,
            filters: {},
            results: Number(totalResults) || 0
          } as any
        });
      } catch (error) {
        // Ignore tracking errors
        logger.warn('Search tracking failed');
      }

      res.json({
        success: true,
        data: {
          query: searchTerm,
          totalResults,
          results,
          isAuthenticated: !!userId
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async searchSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { q } = req.query;
      const userId = (req.user as any)?.id;
      
      if (!q || typeof q !== 'string') {
        return res.json({ success: true, data: [] });
      }

      const searchTerm = q.trim();
      if (searchTerm.length < 2) {
        return res.json({ success: true, data: [] });
      }

      const suggestions = [];

      // Remove skill search as table doesn't exist
      // const skills = await prisma.skill.findMany({
      //   where: { name: { contains: searchTerm, mode: 'insensitive' } },
      //   select: { name: true },
      //   take: 5
      // }).catch(() => []);
      // suggestions.push(...skills.map(s => ({ type: 'skill', value: s.name })));

      // Get job title suggestions (public from gigs)
      const jobTitles = await prisma.job.findMany({
        where: {
          AND: [
            { status: 'OPEN' },
            { title: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        select: { title: true },
        distinct: ['title'],
        take: 3
      });
      suggestions.push(...jobTitles.map(j => ({ type: 'job_title', value: j.title })));

      if (userId) {
        // Get user suggestions (protected)
        const users = await prisma.user.findMany({
          where: {
            AND: [
              { status: 'ACTIVE' },
              {
                OR: [
                  { firstName: { contains: searchTerm, mode: 'insensitive' } },
                  { lastName: { contains: searchTerm, mode: 'insensitive' } }
                ]
              }
            ]
          },
          select: { firstName: true, lastName: true },
          take: 3
        });
        suggestions.push(...users.map(u => ({ 
          type: 'user', 
          value: `${u.firstName} ${u.lastName}` 
        })));
      }

      res.json({
        success: true,
        data: suggestions.slice(0, 10)
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecentSearches(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      
      if (!userId) {
        return res.json({ success: true, data: [] });
      }

      const recentSearches = await prisma.searchQuery.findMany({
        where: { userId: userId },
        select: { query: true },
        distinct: ['query'],
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      res.json({
        success: true,
        data: recentSearches.map(s => s.query)
      });
    } catch (error) {
      logger.warn('Recent searches failed');
      res.json({ success: true, data: [] });
    }
  }

  async getPopularSearches(req: Request, res: Response, next: NextFunction) {
    try {
      const popularSearches = await prisma.searchQuery.groupBy({
        by: ['query'],
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days
          }
        },
        _count: {
          query: true
        },
        orderBy: {
          _count: {
            query: 'desc'
          }
        },
        take: 10
      });

      const fallbackSearches = [
        'Web Developer', 'UI/UX Designer', 'Mobile App', 'Logo Design',
        'Content Writer', 'React Developer', 'Digital Marketing', 'Video Editor'
      ];

      res.json({
        success: true,
        data: popularSearches.length > 0 
          ? popularSearches.map(s => s.query)
          : fallbackSearches
      });
    } catch (error) {
      logger.warn('Popular searches failed');
      res.json({ 
        success: true, 
        data: ['Web Developer', 'UI/UX Designer', 'Mobile App', 'Logo Design']
      });
    }
  }

  async trackSearchClick(req: Request, res: Response, next: NextFunction) {
    try {
      const { query } = req.body;
      const userId = (req.user as any)?.id;
      
      if (!query) {
        throw ApiError.badRequest('Query is required');
      }

      await prisma.searchQuery.updateMany({
        where: {
          query: query,
          userId: userId
        },
        data: {} as any
      });

      res.json({ success: true });
    } catch (error) {
      console.warn('Click tracking failed');
      res.json({ success: true });
    }
  }
}