import type { Request, Response, NextFunction } from 'express';

// Section C.5 error envelope: { error: { code, message, details?, request_id } }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId ?? 'unknown';
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, request_id: requestId },
    });
  }
  console.error(`[${requestId}] unhandled error:`, err);
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong.', request_id: requestId },
  });
}

export function requestId(req: Request, _res: Response, next: NextFunction) {
  (req as any).requestId = req.headers['x-request-id'] ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  next();
}
