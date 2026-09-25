import type { SkinProfileInput, Routine, ProfileVector, AvoidFlags } from '@mgt/domain';

// One API client shared by web and mobile (Section C.1: "no separate business logic per
// platform"). Every call goes to the Express API — the clients never call external
// billing or analysis services directly (Section C.1's first rule).

export interface SkinMatchResult {
  session_id: string;
  profile_vector: ProfileVector;
  avoid_flags: AvoidFlags;
  rules_version: string;
  routine: Routine;
}

export interface ApiErrorShape {
  error: { code: string; message: string; details?: unknown; request_id: string };
}

export class ApiClient {
  constructor(private baseUrl: string, private fetchImpl: typeof fetch = fetch) {}

  private async post<T>(path: string, body: unknown, token?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return this.readResponse<T>(res);
  }

  private async get<T>(path: string, token?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return this.readResponse<T>(res);
  }

  private async readResponse<T>(res: Response): Promise<T> {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      if (!res.ok) throw new ApiError(null, res.status);
      throw new ApiError({ error: {
        code: 'invalid_response', message: 'The platform returned an unreadable response.', request_id: 'unknown',
      } }, res.status);
    }
    if (!res.ok) throw new ApiError(payload, res.status);
    return payload as T;
  }

  // Pre-account: no token needed. The returned session_id is what binds the anonymous
  // Skin Match to a user at signup (Section C.5's session_token pattern).
  completeSkinMatch(input: SkinProfileInput, sessionId?: string): Promise<SkinMatchResult> {
    return this.post('/api/skin-match/complete', { ...input, session_id: sessionId });
  }

  buildCart(sessionId: string, routine: Routine) {
    return this.post<{ cart: unknown }>('/api/cart/from-routine', { session_id: sessionId, routine });
  }

  priceCart(sessionId: string, premium = false) {
    return this.get<{ pricing: { total_cents: number; subtotal_cents: number; shipping_cents: number } }>(
      `/api/cart/${encodeURIComponent(sessionId)}/price?premium=${premium}`,
    );
  }

  routineCommand(sessionId: string, text: string) {
    return this.post<{ routine: Routine; explanation: string }>('/api/coach/routine-command', { session_id: sessionId, text });
  }

  startCheckout(sessionId: string) {
    return this.post<{ order_id: string; client_secret: string; total_cents: number }>('/api/checkout/session', { session_id: sessionId });
  }

  orderStatus(orderId: string) {
    return this.get<{ status: string }>(`/api/checkout/orders/${encodeURIComponent(orderId)}/status`);
  }
}

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  constructor(payload: unknown, public status: number) {
    const record = payload !== null && typeof payload === 'object'
      ? payload as Record<string, unknown> : {};
    const envelope = record.error !== null && typeof record.error === 'object'
      ? record.error as Record<string, unknown> : {};
    super(typeof envelope.message === 'string' ? envelope.message : 'Request failed');
    this.code = typeof envelope.code === 'string' ? envelope.code
      : typeof record.error === 'string' ? record.error : 'unknown';
    this.requestId = typeof envelope.request_id === 'string' ? envelope.request_id : 'unknown';
  }
}
