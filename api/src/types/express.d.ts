import 'express';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
