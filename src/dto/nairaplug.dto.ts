export interface CreateCommunityPostDto {
  content: string;
  categoryId: string;
  tags?: string[];
}

export interface UpdateCommunityPostDto {
  content?: string;
  categoryId?: string;
  tags?: string[];
}

export interface CreatePostResponseDto {
  postId: string;
  content: string;
}
