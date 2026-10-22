import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { AiError, type AiProvider, type AiRequest, type Part } from './provider';

function toContent(parts: Part[]): Anthropic.Beta.BetaContentBlockParam[] {
  // Images first, then text, as recommended for vision prompts.
  const images = parts.filter((p) => p.type === 'image');
  const texts = parts.filter((p) => p.type === 'text');
  return [
    ...images.map((p) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: p.mediaType, data: p.base64 },
    })),
    ...texts.map((p) => ({ type: 'text' as const, text: p.text })),
  ];
}

function mapError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new AiError('cancelled', 'cancelled');
  if (error instanceof Anthropic.AuthenticationError) return new AiError('auth', error.message);
  if (error instanceof Anthropic.PermissionDeniedError) return new AiError('region', error.message);
  if (error instanceof Anthropic.RateLimitError) return new AiError('rate_limit', error.message);
  if (error instanceof Anthropic.APIConnectionError) return new AiError('offline', error.message);
  if (error instanceof Anthropic.APIError) return new AiError('server', error.message);
  return new AiError('server', String(error));
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';
  private client: Anthropic;
  private customBase: boolean;

  constructor(
    apiKey: string,
    readonly model: string,
    baseUrl?: string,
  ) {
    this.customBase = !!baseUrl;
    // The key is the user's own and stays on their device; requests go straight
    // from the phone to the API (or the gateway they configured).
    this.client = new Anthropic({ apiKey, baseURL: baseUrl || undefined, dangerouslyAllowBrowser: true, maxRetries: 1 });
  }

  /** Server-side refusal fallback; skipped behind custom gateways that may not support the beta. */
  private fallback() {
    return this.customBase ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
  }

  async text(req: AiRequest, signal?: AbortSignal): Promise<string> {
    try {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          output_config: { effort: 'medium' },
          messages: [{ role: 'user', content: toContent(req.parts) }],
          ...this.fallback(),
        },
        { signal },
      );
      if (response.stop_reason === 'refusal') throw new AiError('refused', 'refusal');
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!text) throw new AiError('bad_output', 'empty');
      return text;
    } catch (error) {
      throw mapError(error);
    }
  }

  async json<T>(req: AiRequest, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
          messages: [{ role: 'user', content: toContent(req.parts) }],
          ...this.fallback(),
        },
        { signal },
      );
      if (response.stop_reason === 'refusal') throw new AiError('refused', 'refusal');
      if (response.parsed_output == null) throw new AiError('bad_output', 'unparsed');
      return response.parsed_output as T;
    } catch (error) {
      throw mapError(error);
    }
  }
}
