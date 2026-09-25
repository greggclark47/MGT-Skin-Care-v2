import type { TaskConfig, TaskType } from './types';

// The fixed task registry. Ollama is the default for high-frequency work, DeepSeek is the
// local reasoning fallback, and GPT-5.6 Sol is the opt-in, entitlement-gated hosted tier.
// Every assignment is a config value, so routing can change without changing callers.
const OLLAMA_FAST = { provider: 'ollama' as const, model: 'llama3.2:3b', max_tokens: 700, temperature: 0.3 };
const DEEPSEEK_LOCAL = { provider: 'ollama' as const, model: 'deepseek-r1:8b', max_tokens: 900, temperature: 0.2 };
const OLLAMA_VISION = { provider: 'ollama' as const, model: 'llava:latest', max_tokens: 700, temperature: 0.2 };
const OPENAI_SOL = { provider: 'openai' as const, model: 'gpt-5.6-sol', max_tokens: 2000, temperature: 0.4, reasoning_effort: 'medium' as const };
const OPENAI_SOL_FALLBACK = { ...OPENAI_SOL, reasoning_effort: 'low' as const };
const OPENAI_ASTRA = { provider: 'openai' as const, model: 'gpt-6-astra', max_tokens: 3000, temperature: 0.2, reasoning_effort: 'high' as const };
const OPENCLAW = { provider: 'openclaw' as const, model: 'llama3.2:3b', max_tokens: 900, temperature: 0.3 };
const OLLAMA_EMBED = { provider: 'ollama' as const, model: 'nomic-embed-text', max_tokens: 0, temperature: 0 };

function tier1(task_type: TaskType, prompt_version: string, grounded: boolean, schema?: TaskConfig['response_schema']): TaskConfig {
  return {
    task_type, primary: OLLAMA_FAST, fallbacks: [DEEPSEEK_LOCAL, OPENCLAW, OPENAI_SOL_FALLBACK],
    budget_class: 'tier1_copy', requires_entitlement: false,
    prompt_version, timeout_ms: 8000, grounded, response_schema: schema,
  };
}

export const TASK_REGISTRY: Record<TaskType, TaskConfig> = {
  routine_narrative: tier1('routine_narrative', 'v2.0.0', true, {
    type: 'object', required: ['narrative'], properties: { narrative: { type: 'string' }, cited_knowledge_ids: { type: 'array' } },
  }),
  product_why: tier1('product_why', 'v2.0.0', true, {
    type: 'object', required: ['blurb'], properties: { blurb: { type: 'string' }, cited_knowledge_ids: { type: 'array' } },
  }),
  ingredient_tip: tier1('ingredient_tip', 'v2.0.0', true),
  coach_answer: tier1('coach_answer', 'v2.1.0', true, {
    type: 'object', required: ['excerpts'], properties: {
      excerpts: { type: 'array' }, cited_knowledge_ids: { type: 'array' },
    },
  }),

  // Intent classification for free-text coach messages. Note this only PICKS an intent —
  // the routine mutation itself runs in @mgt/domain's deterministic engines, never here
  // (Section C.4, and the "0 model-authored routine changes" KPI depends on it).
  coach_routine_command: {
    task_type: 'coach_routine_command', primary: OLLAMA_FAST, fallbacks: [DEEPSEEK_LOCAL, OPENCLAW],
    budget_class: 'tier1_copy', requires_entitlement: false,
    prompt_version: 'v2.0.0', timeout_ms: 5000, grounded: false,
    response_schema: { type: 'object', required: ['intent'], properties: { intent: { type: 'string' }, days: { type: 'number' }, target_delta_cents: { type: 'number' } } },
  },
  classify_intent: { ...tier1('classify_intent', 'v2.0.0', false), timeout_ms: 4000 },
  shopping_assistant: tier1('shopping_assistant', 'v2.0.0', true),
  support_draft: tier1('support_draft', 'v2.0.0', false),
  summarize_conversation: tier1('summarize_conversation', 'v2.0.0', false),

  vision_attributes: {
    task_type: 'vision_attributes', primary: OLLAMA_VISION, fallbacks: [],
    budget_class: 'tier2_vision', requires_entitlement: false,
    prompt_version: 'v2.0.0', timeout_ms: 15000, grounded: false,
    response_schema: { type: 'object', required: ['attributes'], properties: { attributes: { type: 'object' } } },
  },

  // Tier-3: entitlement-gated. Conflict C13 — Phase 10 documented requirePremium but never
  // enforced it; the router enforces it here and fails CLOSED.
  premium_consultation: {
    task_type: 'premium_consultation', primary: OPENAI_SOL, fallbacks: [],
    budget_class: 'tier3_premium', requires_entitlement: true,
    prompt_version: 'v2.0.0', timeout_ms: 30000, grounded: true,
  },
  routine_optimization_deep: {
    task_type: 'routine_optimization_deep', primary: OPENAI_ASTRA, fallbacks: [OPENAI_SOL],
    budget_class: 'tier3_premium', requires_entitlement: true,
    prompt_version: 'v2.1.0', timeout_ms: 60000, grounded: true,
  },
  operator_analysis: {
    task_type: 'operator_analysis', primary: OPENAI_ASTRA, fallbacks: [OPENAI_SOL],
    budget_class: 'tier3_premium', requires_entitlement: true,
    prompt_version: 'v1.0.0', timeout_ms: 60000, grounded: false,
    response_schema: {type: 'object', required: ['analysis', 'risks', 'recommendations'],
      properties: {analysis: {type: 'string'}, risks: {type: 'array'}, recommendations: {type: 'array'}}},
  },

  embed: {
    task_type: 'embed', primary: OLLAMA_EMBED,
    fallbacks: [], budget_class: 'embedding', requires_entitlement: false,
    prompt_version: 'v1.0.0', timeout_ms: 10000, grounded: false,
  },
};

export function getTaskConfig(taskType: TaskType): TaskConfig {
  const config = TASK_REGISTRY[taskType];
  if (!config) throw new Error(`unknown_task_type:${taskType}`);
  return config;
}
