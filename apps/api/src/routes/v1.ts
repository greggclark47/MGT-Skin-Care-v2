// [GIVEN] SC-P28 router import, adaptation v1.1; original source and provenance live
// in infra/imports/sc-p28-p29. The portal mounts this behind its session boundary.
// [GIVEN] The handoff specifies an object error envelope for versioned routes.
// The local legacy middleware also uses an object envelope; preserve it separately.
// [GIVEN] Payment state is webhook-authoritative. No client confirmation route is
// defined here. Injected routers still require their own authentication and checks.

import { Router, type ErrorRequestHandler } from 'express';
import { ApiError } from '../middleware/error';
import { Fault } from '../portal/security';

export const API_V1_PREFIX = '/api/v1';

/** v1 error envelope. Scoped to the v1 router — see the header. */
export const v1ErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ApiError || err instanceof Fault) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // Keep unexpected error details out of logs and responses: driver messages can
  // contain credentials or connection strings.
  console.error('[api/v1] Unhandled request error.');
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong on our end.' },
  });
};

export interface V1Routers {
  checkout: Router;
  subscriptions: Router;
  entitlement?: Router;
}

export function createV1Router(routers: V1Routers): Router {
  const v1 = Router();

  v1.use('/checkout', routers.checkout);
  v1.use('/subscriptions', routers.subscriptions);
  if (routers.entitlement) v1.use('/entitlement', routers.entitlement);

  // Scoped 404 so an unknown /api/v1/* path answers in the v1 envelope rather than
  // falling through to the app-level `{ error: 'Not found' }`.
  v1.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } });
  });

  v1.use(v1ErrorHandler);

  return v1;
}
