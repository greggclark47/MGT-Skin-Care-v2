import { AiGateway } from './router';
import { OllamaAdapter, OpenAiAdapter, OpenClawAdapter, type OpenClawApiMode } from './adapters/http-adapters';
import type { ProviderAdapter, RoutingLogSink } from './index';
import type { ProviderName } from './types';
import type { BudgetCaps, BudgetStore } from './budget';

export interface GatewayRuntime {
  gateway: AiGateway;
  adapters: Partial<Record<ProviderName, ProviderAdapter>>;
}

function baseUrl(value: string | undefined, fallback: string): string {
  return (value || fallback).replace(/\/$/, '');
}

// Runtime wiring is deliberately configuration-only. Ollama is always the first local
// option, DeepSeek is selected by the task registry as the local reasoning tier, and hosted
// providers are opt-in fallbacks for work that needs them.
export function adaptersFromEnv(env: NodeJS.ProcessEnv): Partial<Record<ProviderName, ProviderAdapter>> {
  const adapters: Partial<Record<ProviderName, ProviderAdapter>> = {};
  const ollama = baseUrl(env.OLLAMA_BASE_URL, 'http://127.0.0.1:11434');

  if (env.OLLAMA_ENABLED !== 'false') adapters.ollama = new OllamaAdapter(ollama);

  if (env.OPENCLAW_ENABLED === 'true') {
    const apiMode: OpenClawApiMode = env.OPENCLAW_API_MODE === 'openai-completions' ? 'openai-completions' : 'ollama';
    adapters.openclaw = new OpenClawAdapter(
      baseUrl(env.OPENCLAW_BASE_URL, ollama),
      env.OPENCLAW_API_KEY || 'ollama',
      undefined,
      apiMode,
    );
  }

  if (env.OPENAI_API_KEY) {
    adapters.openai = new OpenAiAdapter(env.OPENAI_API_KEY, env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  }

  return adapters;
}

export function gatewayFromEnv(env: NodeJS.ProcessEnv, logSink?: RoutingLogSink, budgetStore?: BudgetStore, budgetCaps?: BudgetCaps): GatewayRuntime {
  const adapters = adaptersFromEnv(env);
  return { adapters, gateway: new AiGateway({ adapters, logSink, budgetStore, budgetCaps }) };
}
