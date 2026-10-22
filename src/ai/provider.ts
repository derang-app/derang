import type { z } from 'zod';

// Provider-neutral AI interface. The app only talks to this; swapping vendors
// means adding another implementation and registering it in getProvider().

export type Part = { type: 'text'; text: string } | { type: 'image'; mediaType: 'image/jpeg' | 'image/png'; base64: string };

export interface AiRequest {
  system: string;
  parts: Part[];
  maxTokens?: number;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  text(req: AiRequest, signal?: AbortSignal): Promise<string>;
  json<T>(req: AiRequest, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T>;
}

export type AiErrorCode = 'not_configured' | 'offline' | 'auth' | 'rate_limit' | 'region' | 'refused' | 'bad_output' | 'cancelled' | 'server';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const AI_ERROR_TEXT: Record<AiErrorCode, string> = {
  not_configured: 'سرویس هوش مصنوعی تنظیم نشده است. کلید را در تنظیمات وارد کن.',
  offline: 'اتصال اینترنت برقرار نیست. بقیهٔ بخش‌های اپ آفلاین کار می‌کنند.',
  auth: 'کلید سرویس پذیرفته نشد. کلید را در تنظیمات بررسی کن.',
  rate_limit: 'سرویس فعلاً شلوغ است یا سقف استفاده پر شده. کمی بعد دوباره تلاش کن.',
  region: 'سرویس از این شبکه در دسترس نیست. اگر از واسط یا VPN استفاده می‌کنی، آدرس آن را در تنظیمات بررسی کن.',
  refused: 'سرویس به این درخواست پاسخ نداد.',
  bad_output: 'پاسخ سرویس قابل استفاده نبود. دوباره تلاش کن.',
  cancelled: 'درخواست لغو شد.',
  server: 'خطای سرویس هوش مصنوعی. کمی بعد دوباره تلاش کن.',
};
