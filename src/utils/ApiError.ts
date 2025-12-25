export class ApiError extends Error {
  public statusCode: number;
  public errors?: any;

  constructor(statusCode: number, message: string, errors?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = 'ApiError';
  }

  static badRequest(message: string, errors?: any): ApiError {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message: string = 'Not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string, errors?: any): ApiError {
    return new ApiError(409, message, errors);
  }

  static tooManyRequests(message: string = 'Too many requests'): ApiError {
    return new ApiError(429, message);
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError(500, message);
  }
}