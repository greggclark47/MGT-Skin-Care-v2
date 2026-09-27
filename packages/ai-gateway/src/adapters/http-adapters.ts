import type { ModelConfig, ProviderName, ProviderResponse } from '../types';
import type { ProviderAdapter } from './index';

// HTTP transport is injected so adapters are testable without network access and so the
// API key source stays the caller's concern (env in prod, fixture in tests).
export type HttpPost = (url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) => Promise<any>;

export const defaultHttpPost: HttpPost = async (url, headers, body, signal) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  if (!res.ok) throw new Error(`provider_http_${res.status}`);
  return res.json();
};

export class OpenAiAdapter implements ProviderAdapter {
  readonly name: ProviderName;
  constructor(protected apiKey: string, protected baseUrl = 'https://api.openai.com/v1', protected post: HttpPost = defaultHttpPost, name: ProviderName = 'openai') {
    this.name = name;
  }
  async complete(config: ModelConfig, systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<ProviderResponse> {
    const json = await this.post(`${this.baseUrl.replace(/\/$/, '')}/responses`, {
      authorization: `Bearer ${this.apiKey}`,
    }, {
      model: config.model, max_output_tokens: config.max_tokens,
      reasoning: { effort: config.reasoning_effort ?? 'medium' },
      instructions: systemPrompt, input: userPrompt, store: false,
    }, signal);
    const text = Array.isArray(json.output)
      ? json.output.flatMap((item: any) => item.type === 'message' && Array.isArray(item.content)
        ? item.content.filter((part: any) => part.type === 'output_text' && typeof part.text === 'string').map((part: any) => part.text)
        : []).join('')
      : '';
    if (json.status !== 'completed' || !text) throw new Error('provider_response_incomplete');
    return {
      text,
      input_tokens: json.usage?.input_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? 0,
      model: json.model ?? '', provider: this.name,
    };
  }
}

export class OllamaAdapter implements ProviderAdapter {
  readonly name: ProviderName = 'ollama';
  constructor(private baseUrl = 'http://127.0.0.1:11434', private post: HttpPost = defaultHttpPost) {}
  async complete(config: ModelConfig, systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<ProviderResponse> {
    const json = await this.post(`${this.baseUrl.replace(/\/$/, '')}/api/chat`, {},
      {
        model: config.model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        stream: false,
        keep_alive: '10m',
        options: { num_predict: config.max_tokens, temperature: config.temperature },
      },
      signal,
    );
    return {
      text: json.message?.content ?? json.response ?? '',
      input_tokens: json.prompt_eval_count ?? 0,
      output_tokens: json.eval_count ?? 0,
      model: config.model, provider: this.name,
    };
  }
}

// OpenClaw is an optional orchestration adapter. Native mode talks directly to Ollama;
// the compatibility mode is explicit so enabling it does not introduce a second paid provider.
export type OpenClawApiMode = 'ollama' | 'openai-completions';

export class OpenClawAdapter extends OpenAiAdapter {
  constructor(
    baseUrl = 'http://127.0.0.1:11434',
    apiKey = 'ollama',
    post: HttpPost = defaultHttpPost,
    private apiMode: OpenClawApiMode = 'ollama',
  ) {
    super(apiKey, baseUrl, post, 'openclaw');
  }
  async complete(config: ModelConfig, systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<ProviderResponse> {
    if (this.apiMode === 'ollama') {
      const json = await this.post(`${this.baseUrl.replace(/\/$/, '')}/api/chat`, {}, {
        model: config.model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        stream: false,
        keep_alive: '10m',
        options: { num_predict: config.max_tokens, temperature: config.temperature },
      }, signal);
      return {
        text: json.message?.content ?? json.response ?? '',
        input_tokens: json.prompt_eval_count ?? 0,
        output_tokens: json.eval_count ?? 0,
        model: config.model, provider: this.name,
      };
    }
    const json = await this.post(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      authorization: `Bearer ${this.apiKey}`,
    }, {
      model: config.model, max_tokens: config.max_tokens, temperature: config.temperature,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    }, signal);
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      input_tokens: json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.completion_tokens ?? 0,
      model: config.model, provider: this.name,
    };
  }
}
