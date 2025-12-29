declare namespace Express {
  interface Request {
    user?: {
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      role: string;
      status: string;
      profileImageUrl?: string;
    };
  }
}