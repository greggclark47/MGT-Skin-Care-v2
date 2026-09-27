// @mgt/ai-gateway — provider-agnostic routing for local-first production workloads.
export { AiGateway, NoopLogSink } from './router';
export { gatewayFromEnv, adaptersFromEnv } from './runtime';
export { coachPromptChain, composeCoachPrompt } from './orchestration';
export type { CoachPromptContext, PromptDocument } from './orchestration';
export { OllamaAdapter, OpenAiAdapter, OpenClawAdapter } from './adapters/http-adapters';
export type { BudgetCaps, BudgetStore } from './budget';
export {checkedCents} from './budget';
export type { ProviderAdapter } from './adapters';
export type { HttpPost } from './adapters/http-adapters';
export type {
  BudgetClass, GatewayRequest, GatewayResponse, ModelConfig, ProviderName, ProviderResponse,
  RoutingLogEntry, RoutingLogSink, TaskType,
} from './types';
export const AI_GATEWAY_VERSION = '0.2.0-local-first';
