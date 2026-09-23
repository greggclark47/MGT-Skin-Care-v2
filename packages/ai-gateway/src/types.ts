// Core AI Gateway types (blueprint Section C.6 / E.2-E.5).
// The Gateway is an in-process LIBRARY, not a microservice — the API and workers import it.

export type ProviderName = 'ollama' | 'openclaw' | 'openai' | 'openai_compatible';

// Fixed task registry (Section E.3). Callers name a task_type; classification is NEVER an
// LLM call and never a heuristic on message content — that was the Phase 4 mistake the
// consolidation audit rejected.
export type TaskType =
  | 'routine_narrative'
  | 'product_why'
  | 'ingredient_tip'
  | 'coach_answer'
  | 'coach_routine_command'
  | 'shopping_assistant'
  | 'support_draft'
  | 'summarize_conversation'
  | 'classify_intent'
  | 'vision_attributes'
  | 'premium_consultation'
  | 'routine_optimization_deep'
  | 'operator_analysis'
  | 'embed';

export type BudgetClass = 'tier1_copy' | 'tier2_vision' | 'tier3_premium' | 'embedding';

export interface ModelConfig {
  provider: ProviderName;
  model: string;
  max_tokens: number;
  temperature: number;
  reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface TaskConfig {
  task_type: TaskType;
  primary: ModelConfig;
  fallbacks: ModelConfig[];
  budget_class: BudgetClass;
  requires_entitlement: boolean;   // Tier-3 tasks fail CLOSED without Premium (conflict C13)
  prompt_version: string;
  timeout_ms: number;
  grounded: boolean;               // if true, the validator enforces citation validity
  response_schema?: JsonSchema;    // structured-output contract, enforced by the validator
}

// Minimal JSON-schema subset — enough to enforce the response contracts the blueprint
// specifies without pulling a validation library into the dependency tree.
export interface JsonSchema {
  type: 'object';
  required: string[];
  properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'array' | 'object' }>;
}

export interface GatewayRequest {
  task_type: TaskType;
  user_id: string | null;          // null for pre-account Skin Match sessions
  system_prompt: string;
  user_prompt: string;
  retrieved_knowledge_ids?: string[]; // required for grounded tasks — the RAG result set
  has_premium_entitlement?: boolean;
  has_operator_authorization?: boolean;
  metadata?: Record<string, string>;
  // Optional caller-owned validation for contracts that depend on retrieved records, such as
  // exact reviewed excerpts. A failure moves the request to the next configured candidate.
  output_validator?: (text: string) => { ok: boolean; reason?: string };
}

export interface ProviderResponse {
  text: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
  provider: ProviderName;
}

export interface GatewayResponse {
  ok: boolean;
  text: string | null;
  parsed: unknown | null;
  provider: ProviderName | null;
  model: string | null;
  prompt_version: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  used_fallback: boolean;
  attempts: number;
  failure_reason: string | null;
}

// One row per gateway call — the `llm_routing_log` table (Section 0.2 row 1: Phase 4's
// telemetry table, extended with provider, prompt_version, fallback flag, structured-output
// failure, and cost as the audit called for).
export interface RoutingLogEntry {
  task_type: TaskType;
  user_id: string | null;
  provider: ProviderName | null;
  model: string | null;
  prompt_version: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  used_fallback: boolean;
  attempts: number;
  validation_failed: boolean;
  failure_reason: string | null;
  created_at: string;
}

export interface RoutingLogSink {
  write(entry: RoutingLogEntry): Promise<void>;
}
