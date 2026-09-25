import type {
  GatewayRequest, GatewayResponse, ModelConfig, ProviderName,
  RoutingLogSink, TaskConfig,
} from './types';
import { getTaskConfig } from './task-registry';
import { CircuitBreaker } from './circuit-breaker';
import { DEFAULT_BUDGET_CAPS, InMemoryBudgetStore, isWithinBudget, type BudgetCaps, type BudgetStore } from './budget';
import { validate } from './validator';
import { estimateCostCents, PRICING_PER_MTOK, type ProviderAdapter } from './adapters';

export interface RouterOptions {
  adapters: Partial<Record<ProviderName, ProviderAdapter>>;
  logSink?: RoutingLogSink;
  budgetStore?: BudgetStore;
  budgetCaps?: BudgetCaps;
  breaker?: CircuitBreaker;
  now?: () => number;
}

export class NoopLogSink implements RoutingLogSink {
  entries: any[] = [];
  async write(entry: any) { this.entries.push(entry); }
}

// The router (Section C.6). Order of operations, and why each step is where it is:
//   1. entitlement gate  — Tier-3 must fail closed BEFORE any spend (conflict C13)
//   2. budget gate       — refuse before calling a provider, not after paying for it
//   3. chain build       — primary + fallbacks, minus any provider the breaker has open
//   4. per-candidate     — timeout + ONE retry, then move to the next provider
//   5. validate          — a schema/blocked-term/citation failure is a FALLBACK trigger,
//                          not a returned response: a response that fails compliance is
//                          treated exactly like a provider outage
//   6. telemetry         — one row per call regardless of outcome
export class AiGateway {
  private breaker: CircuitBreaker;
  private budgetStore: BudgetStore;
  private budgetCaps: BudgetCaps;
  private logSink: RoutingLogSink;
  private now: () => number;

  constructor(private options: RouterOptions) {
    this.breaker = options.breaker ?? new CircuitBreaker();
    this.budgetStore = options.budgetStore ?? new InMemoryBudgetStore();
    this.budgetCaps = options.budgetCaps ?? DEFAULT_BUDGET_CAPS;
    this.logSink = options.logSink ?? new NoopLogSink();
    this.now = options.now ?? (() => Date.now());
  }

  get configured(): boolean {
    return Object.keys(this.options.adapters).length > 0;
  }

  async execute(request: GatewayRequest): Promise<GatewayResponse> {
    const config = getTaskConfig(request.task_type);
    const started = this.now();

    const fail = async (reason: string, attempts: number): Promise<GatewayResponse> => {
      const response: GatewayResponse = {
        ok: false, text: null, parsed: null, provider: null, model: null,
        prompt_version: config.prompt_version, latency_ms: this.now() - started,
        input_tokens: 0, output_tokens: 0, cost_cents: 0,
        used_fallback: false, attempts, failure_reason: reason,
      };
      await this.log(request, config, response, false);
      return response;
    };

    // 1. Entitlement — fails closed. Conflict C13: Phase 10 documented this gate but never
    // enforced it, so a free user could reach a hosted-priced task.
    if (config.requires_entitlement && request.has_premium_entitlement !== true && request.has_operator_authorization !== true) {
      return fail('premium_required', 0);
    }

    // 2. Budget — checked before spending, never after.
    if (!(await isWithinBudget(this.budgetStore, this.budgetCaps, request.user_id, config.budget_class))) {
      return fail('budget_exceeded', 0);
    }

    // 3. Candidate chain, skipping providers whose breaker is open.
    const chain: ModelConfig[] = [config.primary, ...config.fallbacks]
      .filter((m) => this.breaker.allows(m.provider, this.now()));
    if (chain.length === 0) return fail('all_providers_unavailable', 0);

    let attempts = 0;
    // Two kinds of reason, deliberately kept apart. A SUBSTANTIVE failure (provider error,
    // schema violation, blocked term, fabricated citation) is what an operator needs to see
    // in llm_routing_log. A SKIP reason (no adapter configured, breaker open) is bookkeeping
    // about our own config. If a later skip overwrote an earlier substantive failure, every
    // compliance rejection would surface as "no_adapter:..." and the alerting on it would be
    // worthless — so substantive reasons always win when both exist.
    let substantiveReason: string | null = null;
    let skipReason: string | null = null;

    for (let i = 0; i < chain.length; i++) {
      const modelConfig = chain[i];
      const hosted = modelConfig.provider === 'openai' || modelConfig.provider === 'openai_compatible';
      if (hosted && (!request.user_id || (request.has_premium_entitlement !== true && request.has_operator_authorization !== true))) {
        skipReason = skipReason ?? 'hosted_entitlement_required';
        continue;
      }
      const adapter = this.options.adapters[modelConfig.provider];
      if (!adapter) { skipReason = skipReason ?? `no_adapter:${modelConfig.provider}`; continue; }

      // 4. Timeout + one retry against this provider before moving on.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!(await isWithinBudget(this.budgetStore, this.budgetCaps, request.user_id, config.budget_class))) {
          return fail('budget_exceeded', attempts);
        }
        let reservation: string | null = null;
        if (hosted) {
          const price = PRICING_PER_MTOK[modelConfig.model];
          if (!price || price.legacy || price.input_cents <= 0 || price.output_cents <= 0) {
            return fail('hosted_model_unpriced', attempts);
          }
          // Conservative text estimate, not a guarantee of the provider's final bill.
          const inputEstimate = Buffer.byteLength(request.system_prompt + request.user_prompt, 'utf8') + 1024;
          const reservedCost = estimateCostCents(modelConfig.model, inputEstimate, modelConfig.max_tokens);
          reservation = await this.budgetStore.reserve(request.user_id!, config.budget_class, reservedCost, this.budgetCaps.per_user_daily_cents[config.budget_class]);
          if (!reservation) return fail('budget_exceeded', attempts);
        }
        attempts++;
        let receivedResponse = false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.timeout_ms);
        try {
          const providerResponse = await adapter.complete(modelConfig, request.system_prompt, request.user_prompt, controller.signal);
          receivedResponse = true;
          clearTimeout(timer);

          // 5. Validate. A compliance failure is a fallback trigger, not a response.
          const validUsage = Number.isSafeInteger(providerResponse.input_tokens) && providerResponse.input_tokens > 0
            && Number.isSafeInteger(providerResponse.output_tokens) && providerResponse.output_tokens >= 0;
          if (hosted && (!validUsage || providerResponse.model !== modelConfig.model)) {
            // Keep the hold when billing cannot be reconciled; never replay this response.
            throw new Error('provider_usage_unverifiable');
          }
          const cost = estimateCostCents(modelConfig.model, providerResponse.input_tokens, providerResponse.output_tokens);
          if (reservation) await this.budgetStore.settle(reservation, cost);
          else if (request.user_id) await this.budgetStore.record(request.user_id, config.budget_class, cost);

          const callerValidation = request.output_validator?.(providerResponse.text);
          if (callerValidation && !callerValidation.ok) {
            substantiveReason = callerValidation.reason ?? 'caller_validation_failed';
            await this.log(request, config, {
              ok: false, text: providerResponse.text, parsed: null,
              provider: providerResponse.provider, model: providerResponse.model,
              prompt_version: config.prompt_version, latency_ms: this.now() - started,
              input_tokens: providerResponse.input_tokens, output_tokens: providerResponse.output_tokens,
              cost_cents: cost, used_fallback: i > 0, attempts, failure_reason: substantiveReason,
            }, true);
            break;
          }

          const validation = validate(providerResponse.text, config, request.retrieved_knowledge_ids ?? []);

          if (!validation.ok) {
            substantiveReason = validation.failure_reason ?? 'validation_failed';
            await this.log(request, config, {
              ok: false, text: providerResponse.text, parsed: null,
              provider: providerResponse.provider, model: providerResponse.model,
              prompt_version: config.prompt_version, latency_ms: this.now() - started,
              input_tokens: providerResponse.input_tokens, output_tokens: providerResponse.output_tokens,
              cost_cents: cost, used_fallback: i > 0, attempts, failure_reason: substantiveReason,
            }, true);
            break; // do not retry the same provider on a validation failure — go to fallback
          }

          this.breaker.recordSuccess(modelConfig.provider);
          const response: GatewayResponse = {
            ok: true, text: providerResponse.text, parsed: validation.parsed,
            provider: providerResponse.provider, model: providerResponse.model,
            prompt_version: config.prompt_version, latency_ms: this.now() - started,
            input_tokens: providerResponse.input_tokens, output_tokens: providerResponse.output_tokens,
            cost_cents: cost, used_fallback: i > 0, attempts, failure_reason: null,
          };
          await this.log(request, config, response, false);
          return response;
        } catch (err) {
          clearTimeout(timer);
          // Accounting and telemetry failures must never replay an already completed inference.
          if (receivedResponse) throw err;
          substantiveReason = substantiveReason ?? (err instanceof Error ? err.message : 'provider_error');
          this.breaker.recordFailure(modelConfig.provider, this.now());
        }
      }
    }

    return fail(substantiveReason ?? skipReason ?? 'no_attempt', attempts);
  }

  private async log(request: GatewayRequest, config: TaskConfig, response: GatewayResponse, validationFailed: boolean): Promise<void> {
    await this.logSink.write({
      task_type: request.task_type, user_id: request.user_id,
      provider: response.provider, model: response.model,
      prompt_version: config.prompt_version, latency_ms: response.latency_ms,
      input_tokens: response.input_tokens, output_tokens: response.output_tokens,
      cost_cents: response.cost_cents, used_fallback: response.used_fallback,
      attempts: response.attempts, validation_failed: validationFailed,
      failure_reason: response.failure_reason,
      created_at: new Date(this.now()).toISOString(),
    });
  }
}
