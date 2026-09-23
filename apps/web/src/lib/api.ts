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
    const json = await res.json();
    if (!res.ok) throw new ApiError(json as ApiErrorShape, res.status);
    return json as T;
  }

  private async get<T>(path: string, token?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (!res.ok) throw new ApiError(json as ApiErrorShape, res.status);
    return json as T;
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
      `/api/cart/${sessionId}/price?premium=${premium}`,
    );
  }

  routineCommand(sessionId: string, text: string) {
    return this.post<{ routine: Routine; explanation: string }>('/api/coach/routine-command', { session_id: sessionId, text });
  }

  startCheckout(sessionId: string) {
    return this.post<{ order_id: string; client_secret: string; total_cents: number }>('/api/checkout/session', { session_id: sessionId });
  }

  orderStatus(orderId: string) {
    return this.get<{ status: string }>(`/api/checkout/orders/${orderId}/status`);
  }
}

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  constructor(payload: ApiErrorShape, public status: number) {
    super(payload?.error?.message ?? 'Request failed');
    this.code = payload?.error?.code ?? 'unknown';
    this.requestId = payload?.error?.request_id ?? 'unknown';
  }
}
