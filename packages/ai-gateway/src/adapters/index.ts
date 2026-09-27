import type { ModelConfig, ProviderName, ProviderResponse } from '../types';

// One adapter interface shared by local and hosted implementations (Section 0.2 row 1: keep Phase 1's adapter
// abstraction — it was the only one of the three routers that had it). Adding a provider is
// a new file here plus a config row; it is never a change to the router or to any caller.
export interface ProviderAdapter {
  readonly name: ProviderName;
  complete(config: ModelConfig, systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<ProviderResponse>;
}

// Per-million-token pricing, in CENTS, used for cost telemetry and budget enforcement.
//
// Every hosted row carries the official source and verification date. Unknown models are never
// assigned a fabricated cost; production dashboards can flag them for operator review.
export interface ModelPrice {
  /** Cents per MILLION input tokens. */
  input_cents: number;
  /** Cents per MILLION output tokens. */
  output_cents: number;
  source: string;
  /** ISO date this figure was last checked against the provider's published pricing. */
  verified_on: string;
  /**
   * Set when the provider no longer lists this model on its current pricing page. The number
   * is the last one we could source; it may still be served as a legacy model, but a build
   * routing production traffic to it is making a decision nobody took deliberately.
   */
  legacy?: true;
}

const OPENAI_PRICING = 'https://developers.openai.com/api/docs/models';

export const PRICING_PER_MTOK: Record<string, ModelPrice> = {
  'gpt-6-astra': { input_cents: 1000, output_cents: 5000, source: OPENAI_PRICING, verified_on: '2026-09-12' },
  'gpt-5.6-sol': { input_cents: 400, output_cents: 2000, source: OPENAI_PRICING, verified_on: '2026-09-12' },
  'gpt-5.6-terra': { input_cents: 200, output_cents: 1200, source: OPENAI_PRICING, verified_on: '2026-09-12' },
  'gpt-5.6-luna': { input_cents: 20, output_cents: 120, source: OPENAI_PRICING, verified_on: '2026-09-12' },
  // Local models have no per-token provider charge. Infrastructure cost is tracked separately
  // so the router can still compare local utilization with hosted escalation spend.
  'llama3.2:3b': { input_cents: 0, output_cents: 0, source: 'self-hosted Ollama', verified_on: '2026-09-12' },
  'deepseek-r1:8b': { input_cents: 0, output_cents: 0, source: 'self-hosted Ollama', verified_on: '2026-09-12' },
  'llava:latest': { input_cents: 0, output_cents: 0, source: 'self-hosted Ollama', verified_on: '2026-09-12' },
  'nomic-embed-text': { input_cents: 0, output_cents: 0, source: 'self-hosted Ollama', verified_on: '2026-09-12' },

  // ---- Legacy: still referenced by task-registry.ts, no longer on the provider's pricing page.
  // Prices below are the last sourced figures and were correct when written; they are NOT
  // re-verifiable as of 2026-09-06. Re-pointing these tasks is a product decision (conflict C2
  // locked provider assignments per task), so the registry is deliberately left alone here.
  'gpt-4o-mini': {
    input_cents: 15, output_cents: 60,
    source: 'OpenAI pricing (gpt-4o-mini no longer listed on the current pricing page)',
    verified_on: '2026-09-06', legacy: true,
  },
  'text-embedding-3-small': {
    input_cents: 2, output_cents: 0,
    source: 'OpenAI pricing (not listed on the current pricing page)',
    verified_on: '2026-09-06', legacy: true,
  },
};

export function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_MTOK[model];
  if (!pricing) return 0; // unknown model — cost shows as 0 rather than a fabricated number; the dashboard surfaces it as unpriced
  return (inputTokens / 1_000_000) * pricing.input_cents + (outputTokens / 1_000_000) * pricing.output_cents;
}

/**
 * Models whose price could not be re-verified against a live provider pricing page. Surface
 * this on the AI-economics dashboard: a cost figure derived from an unverifiable price is an
 * estimate wearing a number's clothing.
 */
export function legacyPricedModels(): string[] {
  return Object.entries(PRICING_PER_MTOK).filter(([, p]) => p.legacy).map(([m]) => m).sort();
}
