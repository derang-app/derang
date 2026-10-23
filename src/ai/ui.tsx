import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { AiKind, AiResponse } from '../db/types';
import { formatJalali } from '../lib/date';
import { useOnline } from '../lib/online';
import { cx, Icon, Spinner } from '../ui/kit';
import { Sheet, useOverlay } from '../ui/overlay';
import { AiError, AI_ERROR_TEXT, type AiErrorCode } from './provider';
import { useApiKeyHint } from './secret';
import { readingCompanion } from './tasks';

export function useAiReady() {
  const hint = useApiKeyHint('anthropic');
  const online = useOnline();
  return { loading: hint === undefined, configured: !!hint, online };
}

/** Runs one AI request with loading/error state and cancel support. */
export function useAiTask<T>() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<AiErrorCode>();
  const controller = useRef<AbortController | null>(null);
  const run = useCallback(async (fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setRunning(true);
    setError(undefined);
    try {
      return await fn(c.signal);
    } catch (e) {
      const code = e instanceof AiError ? e.code : 'server';
      if (code !== 'cancelled') setError(code);
      return undefined;
    } finally {
      if (controller.current === c) setRunning(false);
    }
  }, []);
  const cancel = () => {
    controller.current?.abort();
    setRunning(false);
  };
  return { running, error, run, cancel, clearError: () => setError(undefined) };
}

/** SystemStates design: "needs setup" / "offline" / generic error cards. */
export function AiStateCard({ code, onRetry }: { code: AiErrorCode | 'needs_setup'; onRetry?: () => void }) {
  const navigate = useNavigate();
  if (code === 'needs_setup' || code === 'not_configured' || code === 'auth') {
    return (
      <div className="state-card border-dashed border-[#8E3200]/40">
        <div className="w-16 h-16 bg-[#FFF9F0] rounded-full flex items-center justify-center text-[#8E3200] mx-auto mb-4">
          <Icon name="fa-key" className="text-2xl" />
        </div>
        <h3 className="text-sm font-bold text-[#4F4839]">{code === 'auth' ? 'کلید سرویس پذیرفته نشد' : 'سرویس هوش مصنوعی تنظیم نشده'}</h3>
        <p className="text-[11px] text-gray-500 mt-2 px-4 leading-relaxed">
          {code === 'auth'
            ? AI_ERROR_TEXT.auth
            : 'برای شناسایی خودکار و تحلیل‌های هوشمند، ابتدا کلید سرویس را در تنظیمات وارد کن. بقیهٔ اپ بدون آن کامل کار می‌کند.'}
        </p>
        <button type="button" onClick={() => navigate('/settings/ai')} className="bg-[#8E3200] text-white px-6 py-3 rounded-xl text-xs font-bold mt-6 min-h-11">
          انتقال به تنظیمات
        </button>
      </div>
    );
  }
  if (code === 'offline') {
    return (
      <div className="state-card">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 mx-auto mb-4">
          <Icon name="fa-plug-circle-xmark" className="text-2xl" />
        </div>
        <h3 className="text-sm font-bold text-[#4F4839]">اتصال برقرار نیست</h3>
        <p className="text-[11px] text-gray-500 mt-2 px-4 leading-relaxed">
          این قابلیت به اینترنت نیاز دارد. سایر بخش‌های اپلیکیشن طبق معمول آفلاین کار می‌کنند و پاسخ‌های قبلی ذخیره شده‌اند.
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="bg-white border border-[#EEE2D3] text-[#4F4839] px-6 py-3 rounded-xl text-xs font-bold mt-6 min-h-11">
            تلاش مجدد
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="state-card border-red-100 bg-red-50/20">
      <div className="w-16 h-16 bg-red-100/50 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
        <Icon name="fa-circle-exclamation" className="text-2xl" />
      </div>
      <h3 className="text-sm font-bold text-red-700">خطایی رخ داده است</h3>
      <p className="text-[11px] text-red-700/80 mt-2 px-4 leading-relaxed">{AI_ERROR_TEXT[code]}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="bg-white border border-red-200 text-red-600 px-6 py-3 rounded-xl text-xs font-bold mt-6 min-h-11">
          تلاش مجدد
        </button>
      )}
    </div>
  );
}

/** AI output is always visibly marked as such, with date and model. */
export function AiAnswer({ response, onDelete, dark }: { response: AiResponse; onDelete?: () => void; dark?: boolean }) {
  return (
    <article
      className={cx(
        'p-5 rounded-[1.75rem] space-y-3 border border-dashed',
        dark ? 'bg-[#433520] text-white border-[#D7A86E]/30' : 'bg-[#FFF9F0] border-[#D7A86E]/50 text-[#433520]',
      )}
    >
      <header className="flex justify-between items-center gap-2">
        <span className={cx('text-[10px] font-bold flex items-center gap-1.5', dark ? 'text-[#D7A86E]' : 'text-[#8E3200]')}>
          <Icon name="fa-wand-magic-sparkles" /> برداشت هوش مصنوعی، {response.prompt}
        </span>
        {onDelete && (
          <button type="button" aria-label="حذف این پاسخ" onClick={onDelete} className={cx('w-9 h-9 -m-2', dark ? 'text-white/40' : 'text-gray-400')}>
            <Icon name="fa-trash-can" className="text-xs" />
          </button>
        )}
      </header>
      <p className="text-[13px] leading-loose whitespace-pre-line">{response.text.replace(/\*\*/g, '')}</p>
      <p className={cx('text-[9px] ltr text-left', dark ? 'text-white/40' : 'text-gray-500')}>
        {formatJalali(response.createdAt)} · {response.model}
      </p>
    </article>
  );
}

export function AiThinking({ label, onCancel }: { label: string; onCancel?: () => void }) {
  return (
    <div className="bg-white rounded-[2rem] border border-[#EEE2D3] p-6 flex flex-col items-center gap-4 text-center" role="status">
      <div className="w-16 h-16 bg-white rounded-[1.5rem] shadow-xl flex items-center justify-center ai-glow border border-[#EEE2D3]">
        <Icon name="fa-wand-magic-sparkles" className="text-2xl text-[#8E3200]" />
      </div>
      <p className="text-xs font-bold text-[#4F4839]">{label}</p>
      <Spinner />
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-[#8E3200] text-xs font-bold bg-white px-6 py-2 rounded-2xl border border-[#EEE2D3] min-h-11">
          انصراف
        </button>
      )}
    </div>
  );
}

const COMPANION: { kind: Extract<AiKind, 'reflection_questions' | 'creative_idea' | 'connections'>; label: string; hint: string; icon: string }[] = [
  { kind: 'reflection_questions', label: 'کمک به ثبت برداشت', hint: 'چند سؤال کوتاه از روی یادداشت‌هایت', icon: 'fa-feather-pointed' },
  { kind: 'creative_idea', label: 'ایده یا فعالیت خلاقانه', hint: 'از دل همین کتاب و یادداشت‌ها', icon: 'fa-lightbulb' },
  { kind: 'connections', label: 'ارتباط با کتاب‌های دیگرم', hint: 'میان کتاب‌های خوانده‌شده، با مبنای پیشنهاد', icon: 'fa-diagram-project' },
];

/** Reading companion for one book: actions plus previously saved answers (offline). */
export function CompanionSheet({ open, onClose, copyId }: { open: boolean; onClose: () => void; copyId: string }) {
  const { configured, online } = useAiReady();
  const task = useAiTask<AiResponse>();
  const { confirm } = useOverlay();
  const history = useLiveQuery(
    () =>
      db.aiResponses
        .where('targetId')
        .equals(copyId)
        .filter((r) => r.kind !== 'identify_book')
        .reverse()
        .sortBy('createdAt'),
    [copyId],
  );
  return (
    <Sheet open={open} onClose={onClose} label="همراه مطالعه">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#8E3200] rounded-3xl flex items-center justify-center text-white text-xl mb-3 mx-auto shadow-xl shadow-[#8E3200]/20">
          <Icon name="fa-wand-magic-sparkles" />
        </div>
        <h2 className="text-xl font-bold">همراه مطالعه</h2>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed px-4">
          اطلاعات این کتاب و یادداشت‌هایت فقط وقتی یکی از گزینه‌ها را بزنی برای هوش مصنوعی فرستاده می‌شود.
        </p>
      </div>
      <div className="space-y-4">
        {!configured ? (
          <AiStateCard code="needs_setup" />
        ) : task.running ? (
          <AiThinking label="هوش مصنوعی در حال فکر کردن است..." onCancel={task.cancel} />
        ) : (
          <>
            {!online && <AiStateCard code="offline" />}
            {task.error && task.error !== 'offline' && <AiStateCard code={task.error} />}
            <div className="space-y-3">
              {COMPANION.map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  disabled={!online}
                  onClick={() => task.run((signal) => readingCompanion(c.kind, copyId, signal))}
                  className="settings-item disabled:opacity-50"
                >
                  <span className="flex items-center gap-4">
                    <span className="w-10 h-10 bg-[#8E3200]/5 text-[#8E3200] rounded-xl flex items-center justify-center">
                      <Icon name={c.icon} />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{c.label}</span>
                      <span className="block text-[10px] text-gray-500">{c.hint}</span>
                    </span>
                  </span>
                  <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
                </button>
              ))}
            </div>
          </>
        )}
        {history && history.length > 0 && (
          <div className="space-y-3 pt-4">
            <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">پاسخ‌های ذخیره‌شده</h3>
            {history.map((r) => (
              <AiAnswer
                key={r.id}
                response={r}
                onDelete={async () => {
                  if (await confirm({ tone: 'danger', title: 'مطمئنی حذف شود؟', message: 'این پاسخ هوش مصنوعی پاک می‌شود.', confirm: 'بله، حذف کن', cancel: 'انصراف' }))
                    await db.aiResponses.delete(r.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
