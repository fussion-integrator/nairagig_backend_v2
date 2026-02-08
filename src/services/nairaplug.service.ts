import { prisma } from '@/config/database';

// DTO types (inline since dto file is missing)
interface SearchPostsDto {
  query?: string;
  category?: string;
  location?: string;
  tags?: string[];
  sortBy?: 'recent' | 'popular' | 'responses';
  page?: number;
  limit?: number;
}

interface CreatePostDto {
  title: string;
  content: string;
  category: string;
  location?: string;
  isUrgent?: boolean;
  tipAmount?: number;
  mentions?: string[];
}

interface UpdatePostDto {
  title?: string;
  content?: string;
  category?: string;
  location?: string;
  isUrgent?: boolean;
}

interface CreatePostResponseDto {
  content: string;
  isAnonymous?: boolean;
}

export class NairaPlugService {
  static async getPosts(searchParams: SearchPostsDto, userId?: string) {
    const { query, category, location, tags, sortBy = 'recent', page = 1, limit = 20 } = searchParams;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } }
      ];
    }
    
    if (category) where.category = category;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (tags?.length) where.tags = { hasSome: tags };

    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'popular') orderBy = { likesCount: 'desc' };
    if (sortBy === 'responses') orderBy = { responses: { _count: 'desc' } };

    const posts = await prisma.communityPost.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
        },
        _count: {
          select: { likes: true, responses: true, bookmarks: true }
        },
        likes: userId ? { where: { userId }, select: { id: true } } : false,
        bookmarks: userId ? { where: { userId }, select: { id: true } } : false
      }
    });

    const total = await prisma.communityPost.count({ where });

    return {
      posts: posts.map(post => ({
        ...post,
        isLiked: userId ? post.likes?.length > 0 : false,
        isBookmarked: userId ? post.bookmarks?.length > 0 : false,
        likes: undefined,
        bookmarks: undefined
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async getPost(id: string, userId?: string) {
    const post = await prisma.communityPost.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
        },
        responses: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            },
            _count: { select: { likes: true } },
            likes: userId ? { where: { userId }, select: { id: true } } : false
          }
        },
        _count: { select: { likes: true, responses: true, bookmarks: true } },
        likes: userId ? { where: { userId }, select: { id: true } } : false,
        bookmarks: userId ? { where: { userId }, select: { id: true } } : false
      }
    });

    if (!post) return null;

    return {
      ...post,
      isLiked: userId ? post.likes?.length > 0 : false,
      isBookmarked: userId ? post.bookmarks?.length > 0 : false,
      responses: post.responses.map(response => ({
        ...response,
        isLiked: userId ? response.likes?.length > 0 : false,
        likes: undefined
      })),
      likes: undefined,
      bookmarks: undefined
    };
  }

  static async createPost(data: CreatePostDto, authorId: string, mediaFiles?: string[]) {
    const { tipAmount, mentions, ...postData } = data;

    if (tipAmount && tipAmount > 0) {
      const wallet = await prisma.wallet.findFirst({
        where: { userId: authorId, currency: 'NGN' }
      });
      
      if (!wallet || Number(wallet.availableBalance) < tipAmount) {
        throw new Error('Insufficient balance for tip amount');
      }
    }

    const post = await prisma.$transaction(async (tx) => {
      const newPost: any = await tx.communityPost.create({
        data: {
          ...postData,
          authorId,
          tipAmount: tipAmount || 0
        } as any,
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          }
        }
      });

      if (tipAmount && tipAmount > 0) {
        await tx.wallet.update({
          where: { userId_currency: { userId: authorId, currency: 'NGN' } },
          data: {
            availableBalance: { decrement: tipAmount },
            escrowBalance: { increment: tipAmount }
          }
        });
      }

      if (mentions?.length) {
        const mentionedUsers = await tx.user.findMany({
          where: { id: { in: mentions } },
          select: { id: true, firstName: true, lastName: true }
        });

        for (const user of mentionedUsers) {
          await tx.notification.create({
            data: {
              userId: user.id,
              title: 'You were mentioned',
              message: `${(newPost as any).author?.firstName || 'Someone'} ${(newPost as any).author?.lastName || ''} mentioned you in "${newPost.title}"`,
              type: 'SYSTEM',
              data: { postId: newPost.id, mentionerName: `${(newPost as any).author?.firstName || 'Someone'} ${(newPost as any).author?.lastName || ''}` }
            }
          });
        }
      }

      return newPost;
    });

    return post;
  }

  static async updatePost(id: string, data: UpdatePostDto, userId: string) {
    const post = await prisma.communityPost.findUnique({
      where: { id },
      select: { authorId: true }
    });

    if (!post || post.authorId !== userId) {
      throw new Error('Post not found or unauthorized');
    }

    return prisma.communityPost.update({
      where: { id },
      data: data as any,
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
        }
      }
    });
  }

  static async createResponse(postId: string, data: CreatePostResponseDto, authorId?: string) {
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true, title: true }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    return prisma.postResponse.create({
      data: {
        ...data,
        postId,
        authorId: data.isAnonymous ? null : authorId
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
        }
      }
    });
  }

  static async toggleLike(type: 'post' | 'response', id: string, userId: string) {
    if (type === 'post') {
      const existing = await prisma.postLike.findFirst({
        where: { postId: id, userId }
      });

      if (existing) {
        await prisma.postLike.delete({ where: { id: existing.id } });
        return { liked: false };
      } else {
        await prisma.postLike.create({ data: { postId: id, userId } });
        return { liked: true };
      }
    } else {
      const existing = await prisma.responseLike.findFirst({
        where: { responseId: id, userId }
      });

      if (existing) {
        await prisma.responseLike.delete({ where: { id: existing.id } });
        return { liked: false };
      } else {
        await prisma.responseLike.create({ data: { responseId: id, userId } });
        return { liked: true };
      }
    }
  }

  static async toggleBookmark(postId: string, userId: string) {
    const existing = await prisma.postBookmark.findFirst({
      where: { postId, userId }
    });

    if (existing) {
      await prisma.postBookmark.delete({
        where: { id: existing.id }
      });
      return { bookmarked: false };
    } else {
      await prisma.postBookmark.create({
        data: { postId, userId }
      });
      return { bookmarked: true };
    }
  }

  static async markResponseHelpful(responseId: string, userId: string) {
    const response = await prisma.postResponse.findUnique({
      where: { id: responseId },
      include: { post: { select: { authorId: true } } }
    });

    if (!response || response.post.authorId !== userId) {
      throw new Error('Response not found or unauthorized');
    }

    return prisma.postResponse.update({
      where: { id: responseId },
      data: { isHelpful: true }
    });
  }

  static async releaseTip(postId: string, responseId: string, userId: string) {
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      include: {
        responses: {
          where: { id: responseId },
          include: { author: true }
        }
      }
    });

    if (!post || post.authorId !== userId) {
      throw new Error('Post not found or unauthorized');
    }

    if (!post.tipAmount || post.tipReleased) {
      throw new Error('No tip to release or already released');
    }

    const response = post.responses[0];
    if (!response?.authorId) {
      throw new Error('Cannot release tip to anonymous response');
    }

    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId_currency: { userId, currency: 'NGN' } },
        data: { escrowBalance: { decrement: post.tipAmount } }
      });

      await tx.wallet.upsert({
        where: { userId_currency: { userId: response.authorId!, currency: 'NGN' } },
        create: {
          userId: response.authorId!,
          availableBalance: post.tipAmount!,
          currency: 'NGN'
        },
        update: {
          availableBalance: { increment: post.tipAmount }
        }
      });

      await tx.communityPost.update({
        where: { id: postId },
        data: {
          tipReleased: true,
          tipReleasedAt: new Date(),
          tipReleasedToId: response.authorId
        }
      });

      await tx.notification.create({
        data: {
          userId: response.authorId!,
          title: 'Tip Received!',
          message: `You received a tip of ₦${post.tipAmount} for your response to "${post.title}"`,
          type: 'PAYMENT',
          data: { amount: post.tipAmount, postTitle: post.title }
        }
      });
    });

    return { success: true, amount: post.tipAmount };
  }

  static async getTrendingTags() {
    const posts = await prisma.communityPost.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      select: { tags: true }
    });

    // @ts-ignore
    // @ts-ignore
    const tagCounts: Record<string, number> = {};
    posts.forEach(post => {
      post.tags.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));
  }

  static async searchUsers(query: string) {
    return prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImageUrl: true
      },
      take: 10
    });
  }

  static async getStats() {
    const [postsCount, usersCount, tipStats] = await Promise.all([
      prisma.communityPost.count(),
      prisma.user.count(),
      prisma.communityPost.aggregate({
        where: { tipReleased: true },
        _sum: { tipAmount: true },
        _count: { tipAmount: true }
      })
    ]);

    const totalTipsOffered = await prisma.communityPost.count({
      where: { tipAmount: { gt: 0 } }
    });

    const successRate = totalTipsOffered > 0 
      ? (tipStats._count.tipAmount / totalTipsOffered) * 100 
      : 0;

    return {
      activePosts: postsCount,
      communityMembers: usersCount,
      tipsDistributed: tipStats._sum.tipAmount || 0,
      successRate: Math.round(successRate * 10) / 10
    };
  }

  static async getBookmarkedPosts(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const bookmarks = await prisma.postBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        post: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            },
            _count: { select: { likes: true, responses: true, bookmarks: true } }
          }
        }
      }
    });

    return bookmarks.map(bookmark => bookmark.post);
  }
}