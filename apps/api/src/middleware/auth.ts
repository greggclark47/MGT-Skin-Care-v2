import type { Request, Response, NextFunction } from 'express';
import { ApiError } from './error';

// One contract, attaching req.user / req.userId / req.token / req.supabase — replacing the
// three incompatible contracts found in Section 0.2's audit. The actual Supabase JWT
// verification call is a CREATE item for SC-P1's engineering track; this is the interface
// every route module is written against starting now, so nothing downstream has to change
// when the real verifier lands.
export interface AuthedRequest extends Request {
  userId: string;
  user: { id: string; email: string | null };
  token: string;
  supabase: unknown; // user-scoped Supabase client, injected by the real verifier
}

export type JwtVerifier = (token: string) => Promise<{ id: string; email: string | null }>;

export function requireAuth(verify: JwtVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new ApiError(401, 'unauthenticated', 'Missing or malformed Authorization header.'));
    }
    const token = header.slice('Bearer '.length);
    try {
      const user = await verify(token);
      (req as AuthedRequest).user = user;
      (req as AuthedRequest).userId = user.id;
      (req as AuthedRequest).token = token;
      next();
    } catch {
      next(new ApiError(401, 'unauthenticated', 'Invalid or expired token.'));
    }
  };
}

export function requireEntitlement(getEntitlement: (userId: string) => Promise<{ premium: boolean }>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const userId = (req as AuthedRequest).userId;
    const entitlement = await getEntitlement(userId);
    if (!entitlement.premium) {
      return next(new ApiError(402, 'premium_required', 'This feature requires an active Premium subscription.'));
    }
    next();
  };
}
