import assert from 'node:assert/strict';
import { OpenAiAdapter, OpenClawAdapter, type HttpPost } from '../adapters/http-adapters';
import { getTaskConfig } from '../task-registry';
import { AiGateway } from '../router';
import { InMemoryBudgetStore } from '../budget';

async function main() {
  const premium = getTaskConfig('premium_consultation').primary;
  const deep = getTaskConfig('routine_optimization_deep').primary;
  assert.equal(premium.model, 'gpt-5.6-sol');
  assert.equal(premium.reasoning_effort, 'medium');
  assert.equal(deep.model, 'gpt-6-astra');
  assert.equal(deep.reasoning_effort, 'high');

  let seen: {url: string; body: any; headers: Record<string, string>} | undefined;
  const post: HttpPost = async (url, headers, body) => {
    seen = {url, headers, body};
    return {status: 'completed', model: deep.model,
      output: [{type: 'reasoning'}, {type: 'message', content: [{type: 'output_text', text: 'Reviewed answer'}]}],
      usage: {input_tokens: 200, output_tokens: 120}};
  };
  const adapter = new OpenAiAdapter('test-key', 'https://api.openai.com/v1', post);
  const response = await adapter.complete(deep, 'system instructions', 'user request', new AbortController().signal);
  assert.equal(seen?.url, 'https://api.openai.com/v1/responses');
  assert.equal(seen?.body.reasoning.effort, 'high');
  assert.equal(seen?.body.max_output_tokens, 3000);
  assert.equal(seen?.body.store, false);
  assert.equal(seen?.body.instructions, 'system instructions');
  assert.equal(seen?.body.input, 'user request');
  assert.equal(response.text, 'Reviewed answer');
  assert.equal(response.output_tokens, 120);
  assert.equal(response.model, deep.model);

  let localUrl = '';
  const local = new OpenClawAdapter('http://127.0.0.1:11434/v1', 'ollama', async (url) => {
    localUrl = url;
    return {choices: [{message: {content: 'local answer'}}], usage: {prompt_tokens: 10, completion_tokens: 4}};
  }, 'openai-completions');
  assert.equal((await local.complete(getTaskConfig('product_why').fallbacks[2], 's', 'u', new AbortController().signal)).text, 'local answer');
  assert.equal(localUrl, 'http://127.0.0.1:11434/v1/chat/completions');

  let nativeUrl = '';
  const native = new OpenClawAdapter('http://ollama:11434', 'ollama', async (url, headers, body) => {
    nativeUrl = url;
    assert.deepEqual(headers, {});
    assert.equal((body as {stream?: boolean}).stream, false);
    return {message: {content: 'native local answer'}, prompt_eval_count: 8, eval_count: 3};
  });
  const nativeResponse = await native.complete(getTaskConfig('product_why').fallbacks[2], 's', 'u', new AbortController().signal);
  assert.equal(nativeResponse.text, 'native local answer');
  assert.equal(nativeUrl, 'http://ollama:11434/api/chat');

  let calls = 0;
  const gateway = new AiGateway({adapters: {openai: {
    name: 'openai', async complete(config) {
      calls++;
      return {text: 'Reviewed answer', provider: 'openai', model: config.model, input_tokens: 200, output_tokens: 120};
    },
  }}, budgetStore: new InMemoryBudgetStore()});
  const request = {task_type: 'routine_optimization_deep' as const, user_id: 'account', system_prompt: 's',
    user_prompt: 'u', has_premium_entitlement: true};
  assert.equal((await gateway.execute({...request, has_premium_entitlement: false})).failure_reason, 'premium_required');
  assert.equal(calls, 0);
  const routed = await gateway.execute(request);
  assert.equal(routed.ok, true);
  assert.equal(routed.model, 'gpt-6-astra');
  assert.ok(routed.cost_cents > 0);
  console.log('OpenAI Responses adapter, local OpenClaw, entitlement and complex model routing passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
