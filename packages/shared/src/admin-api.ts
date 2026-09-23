import type { KnowledgeObject, KnowledgeStatus, VersionedIngredientRule } from '@mgt/domain';

// Admin console API client. Same rule as ApiClient (Section C.1): the console never talks to
// a database or a provider directly, only to the Express API, so every RBAC check and every
// audit-log write happens server-side where it cannot be skipped by a client that decides not
// to call it.
//
// Identity travels as the `x-admin-user-id` header, which is what apps/api's requireAdmin()
// resolves. That header is a development seam, not an auth scheme -- see the note on
// AdminApiClient below.

export interface AdminAuditEntryView {
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  before: unknown | null;
  after: unknown | null;
  created_at: string;
}

export interface ActiveMatrixView {
  matrix_version: string;
  rule_count: number;
  rules: VersionedIngredientRule[];
}

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export class AdminApiClient {
  // `adminUserId` is sent as x-admin-user-id. In production this endpoint must sit behind
  // real session auth and derive the admin identity server-side -- a header the browser can
  // set is an identity claim, not a credential. The server already treats an unknown id as
  // 403 and every mutation is audited against it, so the audit trail stays meaningful, but
  // the console must not be exposed publicly until that header is replaced.
  constructor(
    private baseUrl: string,
    private adminUserId: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  withIdentity(adminUserId: string): AdminApiClient {
    return new AdminApiClient(this.baseUrl, adminUserId, this.fetchImpl);
  }

  get identity(): string {
    return this.adminUserId;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'x-admin-user-id': this.adminUserId,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } }).error;
      throw new AdminApiError(res.status, err?.code ?? 'unknown', err?.message ?? res.statusText);
    }
    return json as T;
  }

  // ---- Knowledge ----

  listKnowledge(status?: KnowledgeStatus) {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<{ objects: KnowledgeObject[] }>('GET', `/admin/knowledge${q}`);
  }

  createKnowledge(input: Partial<KnowledgeObject> & { id: string; title: string }) {
    return this.request<{ object: KnowledgeObject }>('POST', '/admin/knowledge', input);
  }

  editKnowledge(id: string, patch: Partial<KnowledgeObject>) {
    return this.request<{ object: KnowledgeObject; note?: string }>('PATCH', `/admin/knowledge/${encodeURIComponent(id)}`, patch);
  }

  transitionKnowledge(id: string, to: KnowledgeStatus, reason?: string) {
    return this.request<{ object: KnowledgeObject }>('POST', `/admin/knowledge/${encodeURIComponent(id)}/transition`, { to, reason });
  }

  knowledgeAudit(id: string) {
    return this.request<{ entries: AdminAuditEntryView[] }>('GET', `/admin/knowledge/${encodeURIComponent(id)}/audit`);
  }

  // ---- Ingredient rules ----

  listIngredientRules(status?: KnowledgeStatus) {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<{ rules: VersionedIngredientRule[] }>('GET', `/admin/ingredient-rules${q}`);
  }

  // The matrix actually in force. A 503 here means the safety matrix is empty and scoring is
  // halted -- an outage, not an empty list. AdminApiError carries the code so the console can
  // say so rather than rendering a blank table.
  activeMatrix() {
    return this.request<ActiveMatrixView>('GET', '/admin/ingredient-rules/active');
  }

  writeIngredientRule(key: string, input: {
    sensitivity_ceiling_required: number;
    rationale: string;
    display_name?: string;
    triggers_avoid_flag?: string | null;
  }) {
    return this.request<{ rule: VersionedIngredientRule; note?: string }>('PUT', `/admin/ingredient-rules/${encodeURIComponent(key)}`, input);
  }

  approveIngredientRule(key: string) {
    return this.request<{ rule: VersionedIngredientRule }>('POST', `/admin/ingredient-rules/${encodeURIComponent(key)}/approve`);
  }
}
