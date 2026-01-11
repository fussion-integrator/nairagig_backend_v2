export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AdminApiResponse<T = any> extends ApiResponse<T> {
  timestamp?: string;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const createSuccessResponse = <T>(
  data: T,
  message?: string,
  pagination?: any
): ApiResponse<T> => ({
  success: true,
  data,
  message,
  pagination
});

export const createErrorResponse = (
  error: string,
  statusCode: number = 500
): ApiResponse => ({
  success: false,
  error
});

export const handleControllerError = (error: any, defaultMessage: string = 'Internal server error') => {
  console.error('Controller error:', error);
  
  if (error instanceof ApiError) {
    return createErrorResponse(error.message);
  }
  
  if (error.code === 'P2002') {
    return createErrorResponse('Resource already exists');
  }
  
  if (error.code === 'P2025') {
    return createErrorResponse('Resource not found');
  }
  
  return createErrorResponse(error.message || defaultMessage);
};