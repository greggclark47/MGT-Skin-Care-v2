import { AiGateway, NoopLogSink } from '../router';
import { CircuitBreaker } from '../circuit-breaker';
import { InMemoryBudgetStore } from '../budget';
import type { ProviderAdapter } from '../adapters';
import type { ModelConfig, ProviderName, ProviderResponse } from '../types';

// Scripted adapter: each call shifts the next scripted outcome off the queue.
class ScriptedAdapter implements ProviderAdapter {
  public calls = 0;
  constructor(public readonly name: ProviderName, private script: (() => Promise<ProviderResponse> | never)[]) {}
  async complete(config: ModelConfig): Promise<ProviderResponse> {
    this.calls++;
    const next = this.script.shift();
    if (!next) throw new Error('script_exhausted');
    return next();
  }
}

function ok(text: string, provider: ProviderName, model: string): () => Promise<ProviderResponse> {
  return async () => ({ text, input_tokens: 100, output_tokens: 50, model, provider });
}
function boom(reason: string): () => Promise<ProviderResponse> {
  return async () => { throw new Error(reason); };
}

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { console.log(`  PASS  ${label}`); }
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function main() {
  console.log('\n== 1. Happy path: primary succeeds, validation passes ==');
  {
    const log = new NoopLogSink();
    const gw = new AiGateway({
      adapters: { ollama: new ScriptedAdapter('ollama', [ok(JSON.stringify({ blurb: 'A gentle hydrating formula.', cited_knowledge_ids: ['kb-1'] }), 'ollama', 'llama3.2:3b')]) },
      logSink: log,
    });
    const res = await gw.execute({ task_type: 'product_why', user_id: 'u1', system_prompt: 's', user_prompt: 'u', retrieved_knowledge_ids: ['kb-1'] });
    check('ok=true', res.ok === true, res.failure_reason);
    check('provider is primary (ollama)', res.provider === 'ollama');
    check('used_fallback=false', res.used_fallback === false);
    check('local call has zero variable-token cost', res.cost_cents === 0, res.cost_cents);
    check('one telemetry row written', log.entries.length === 1);
  }

  console.log('\n== 2. Primary hard-fails twice -> falls back to DeepSeek through Ollama ==');
  {
    const gw = new AiGateway({
      adapters: {
        ollama: new ScriptedAdapter('ollama', [boom('provider_http_500'), boom('provider_http_500'), ok(JSON.stringify({ blurb: 'Fallback copy.', cited_knowledge_ids: [] }), 'ollama', 'deepseek-r1:8b')]),
      },
    });
    const res = await gw.execute({ task_type: 'product_why', user_id: 'u2', system_prompt: 's', user_prompt: 'u', retrieved_knowledge_ids: [] });
    check('ok=true via fallback', res.ok === true, res.failure_reason);
    check('provider switched to DeepSeek through Ollama', res.provider === 'ollama' && res.model === 'deepseek-r1:8b');
    check('used_fallback=true', res.used_fallback === true);
    check('attempts counted primary retry + fallback = 3', res.attempts === 3, res.attempts);
  }

  console.log('\n== 3. Blocked term in output -> treated as failure, falls back ==');
  {
    const gw = new AiGateway({
      adapters: {
        ollama: new ScriptedAdapter('ollama', [ok(JSON.stringify({ blurb: 'This will cure your acne.', cited_knowledge_ids: [] }), 'ollama', 'llama3.2:3b'), ok(JSON.stringify({ blurb: 'Supports a clearer-looking complexion.', cited_knowledge_ids: [] }), 'ollama', 'deepseek-r1:8b')]),
      },
    });
    const res = await gw.execute({ task_type: 'product_why', user_id: 'u3', system_prompt: 's', user_prompt: 'u', retrieved_knowledge_ids: [] });
    check('compliance failure did not return to caller', res.ok === true && !/cure/.test(res.text ?? ''), res.text);
    check('served from fallback provider', res.provider === 'ollama' && res.model === 'deepseek-r1:8b');
  }

  console.log('\n== 4. Fabricated citation -> rejected ==');
  {
    const gw = new AiGateway({
      adapters: { ollama: new ScriptedAdapter('ollama', [ok(JSON.stringify({ blurb: 'Grounded claim.', cited_knowledge_ids: ['kb-does-not-exist'] }), 'ollama', 'llama3.2:3b')]) },
    });
    const res = await gw.execute({ task_type: 'product_why', user_id: 'u4', system_prompt: 's', user_prompt: 'u', retrieved_knowledge_ids: ['kb-1'] });
    check('ok=false', res.ok === false);
    check('reason names the invalid citation', (res.failure_reason ?? '').startsWith('invalid_citation:'), res.failure_reason);
  }

  console.log('\n== 5. Tier-3 without entitlement fails CLOSED and spends nothing ==');
  {
    const adapter = new ScriptedAdapter('ollama', [ok('should never be called', 'ollama', 'deepseek-r1:8b')]);
    const gw = new AiGateway({ adapters: { openai: adapter } });
    const res = await gw.execute({ task_type: 'premium_consultation', user_id: 'u5', system_prompt: 's', user_prompt: 'u', has_premium_entitlement: false });
    check('ok=false', res.ok === false);
    check('reason=premium_required', res.failure_reason === 'premium_required', res.failure_reason);
    check('no provider call made', adapter.calls === 0, adapter.calls);
  }

  console.log('\n== 6. Budget exhaustion blocks before spending ==');
  {
    const budgetStore = new InMemoryBudgetStore();
    await budgetStore.record('u6', 'tier1_copy', 999);
    const adapter = new ScriptedAdapter('ollama', [ok('never', 'ollama', 'llama3.2:3b')]);
    const gw = new AiGateway({ adapters: { openai: adapter }, budgetStore });
    const res = await gw.execute({ task_type: 'product_why', user_id: 'u6', system_prompt: 's', user_prompt: 'u' });
    check('reason=budget_exceeded', res.failure_reason === 'budget_exceeded', res.failure_reason);
    check('no provider call made', adapter.calls === 0);
  }

  console.log('\n== 7. Circuit breaker opens after 5 consecutive failures ==');
  {
    const breaker = new CircuitBreaker({ failure_threshold: 5, cooldown_ms: 60_000 });
    for (let i = 0; i < 5; i++) breaker.recordFailure('ollama', 1000);
    check('breaker open', breaker.status('ollama', 1000) === 'open');
    check('provider skipped while open', breaker.allows('ollama', 1000) === false);
    check('half-open after cooldown', breaker.status('ollama', 1000 + 60_000) === 'half_open');
    check('probe allowed in half-open', breaker.allows('ollama', 1000 + 60_000) === true);
    breaker.recordSuccess('ollama');
    check('closes again after a success', breaker.status('ollama', 1000 + 60_000) === 'closed');

    // And the router must skip an open provider entirely rather than calling it.
    const openBreaker = new CircuitBreaker({ failure_threshold: 1, cooldown_ms: 60_000 });
    openBreaker.recordFailure('ollama', Date.now());
    const primary = new ScriptedAdapter('ollama', [ok('never', 'ollama', 'llama3.2:3b')]);
    const gw = new AiGateway({
      adapters: { ollama: primary, openclaw: new ScriptedAdapter('openclaw', [ok(JSON.stringify({ blurb: 'from fallback' }), 'openclaw', 'llama3.2:3b')]) },
      breaker: openBreaker,
    });
    const res = await gw.execute({ task_type: 'product_why', user_id: 'u7', system_prompt: 's', user_prompt: 'u' });
    check('router skipped the open provider', primary.calls === 0, primary.calls);
    check('served by next provider in chain', res.provider === 'openclaw', res.provider);
  }

  console.log('\n== 8. Malformed JSON on a structured task is rejected ==');
  {
    const gw = new AiGateway({ adapters: { ollama: new ScriptedAdapter('ollama', [ok('not json at all', 'ollama', 'llama3.2:3b')]) } });
    const res = await gw.execute({ task_type: 'product_why', user_id: 'u8', system_prompt: 's', user_prompt: 'u' });
    check('ok=false', res.ok === false);
    check('reason=structured_output_not_json', res.failure_reason === 'structured_output_not_json', res.failure_reason);
  }

  console.log(failures === 0 ? '\nAI GATEWAY: ALL CHECKS PASSED' : `\nAI GATEWAY: ${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}

main();
