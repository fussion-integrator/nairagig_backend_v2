import { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { NairaPlugService } from '../services/nairaplug.service';

// Validation schemas
const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  category: z.enum(['JOBS', 'HOUSING', 'MARKETPLACE', 'SERVICES', 'TRANSPORT', 'SOCIAL', 'OTHERS']),
  location: z.string().optional(),
  isUrgent: z.boolean().default(false),
  tipAmount: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional()
});

const createResponseSchema = z.object({
  content: z.string().min(1).max(2000),
  isAnonymous: z.boolean().default(false)
});

const searchSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sortBy: z.enum(['recent', 'popular', 'responses']).default('recent'),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(20)
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/nairaplug');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed'));
    }
  }
});

export const uploadMiddleware = upload.array('media', 3);

export async function getPosts(req: Request, res: Response) {
  try {
    console.log('getPosts called with query:', req.query);
    
    const searchParams = searchSchema.parse({
      ...req.query,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags]) : undefined
    });

    console.log('Parsed search params:', searchParams);
    
    const result = await NairaPlugService.getPosts(searchParams, req.user?.id);
    console.log('Service returned:', result);
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching posts:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    res.status(500).json({ error: 'Failed to fetch posts', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function getPost(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const post = await NairaPlugService.getPost(id, req.user?.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
}

export async function createPost(req: Request, res: Response) {
  try {
    const validatedData = createPostSchema.parse(req.body);
    const mediaFiles = (req.files as Express.Multer.File[])?.map(file => file.filename) || [];
    
    const post = await NairaPlugService.createPost(validatedData, req.user!.id, mediaFiles);
    res.status(201).json(post);
  } catch (error: any) {
    console.error('Error creating post:', error);
    if (error.message === 'Insufficient balance for tip amount') {
      return res.status(400).json({ error: error.message, code: 'INSUFFICIENT_BALANCE' });
    }
    res.status(500).json({ error: 'Failed to create post' });
  }
}

export async function updatePost(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const post = await NairaPlugService.updatePost(id, req.body, req.user!.id);
    res.json(post);
  } catch (error: any) {
    console.error('Error updating post:', error);
    if (error.message === 'Post not found or unauthorized') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update post' });
  }
}

export async function createResponse(req: Request, res: Response) {
  try {
    const { id: postId } = req.params;
    const validatedData = createResponseSchema.parse(req.body);
    
    const response = await NairaPlugService.createResponse(postId, validatedData, req.user?.id);
    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error creating response:', error);
    if (error.message === 'Post not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create response' });
  }
}

export async function togglePostLike(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await NairaPlugService.toggleLike('post', id, req.user!.id);
    res.json(result);
  } catch (error) {
    console.error('Error toggling post like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
}

export async function toggleResponseLike(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await NairaPlugService.toggleLike('response', id, req.user!.id);
    res.json(result);
  } catch (error) {
    console.error('Error toggling response like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
}

export async function toggleBookmark(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await NairaPlugService.toggleBookmark(id, req.user!.id);
    res.json(result);
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    res.status(500).json({ error: 'Failed to toggle bookmark' });
  }
}

export async function markResponseHelpful(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const response = await NairaPlugService.markResponseHelpful(id, req.user!.id);
    res.json(response);
  } catch (error: any) {
    console.error('Error marking response helpful:', error);
    if (error.message === 'Response not found or unauthorized') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to mark response helpful' });
  }
}

export async function releaseTip(req: Request, res: Response) {
  try {
    const { postId, responseId } = req.params;
    const result = await NairaPlugService.releaseTip(postId, responseId, req.user!.id);
    res.json(result);
  } catch (error: any) {
    console.error('Error releasing tip:', error);
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('No tip') || error.message.includes('anonymous')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to release tip' });
  }
}

export async function getTrendingTags(req: Request, res: Response) {
  try {
    const tags = await NairaPlugService.getTrendingTags();
    res.json(tags);
  } catch (error) {
    console.error('Error fetching trending tags:', error);
    res.status(500).json({ error: 'Failed to fetch trending tags' });
  }
}

export async function searchUsers(req: Request, res: Response) {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    const users = await NairaPlugService.searchUsers(q);
    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
}

export async function getStats(req: Request, res: Response) {
  try {
    const stats = await NairaPlugService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

export async function getBookmarkedPosts(req: Request, res: Response) {
  try {
    const posts = await NairaPlugService.getBookmarkedPosts(req.user!.id);
    res.json(posts);
  } catch (error) {
    console.error('Error fetching bookmarked posts:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarked posts' });
  }
}