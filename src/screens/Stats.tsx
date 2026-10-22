import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { readingInsight } from '../ai/tasks';
import { AiAnswer, AiStateCard, AiThinking, useAiReady, useAiTask } from '../ai/ui';
import { db } from '../db/db';
import { useBooks, useSessions } from '../db/queries';
import type { AiResponse } from '../db/types';
import { finishedIn, pagesRead, periodStart, readingBars, sessionsIn, winStats, type Period } from '../lib/stats';
import { fa } from '../lib/text';
import { cx, Icon, Loading, PageHeader } from '../ui/kit';

const PERIOD_LABEL: Record<Period, string> = { week: 'هفتگی', month: 'ماهانه', year: 'سالانه' };
const PERIOD_NAME: Record<Period, string> = { week: 'این هفته', month: 'این ماه', year: 'امسال' };

export default function Stats() {
  const [period, setPeriod] = useState<Period>('week');
  const books = useBooks();
  const sessions = useSessions();
  const logs = useLiveQuery(() => db.readingLogs.toArray(), []);
  const lastInsight = useLiveQuery(async () => (await db.aiResponses.where('kind').anyOf('reading_insight', 'picker_explain').sortBy('createdAt')).reverse().slice(0, 3), []);
  const { configured, online } = useAiReady();
  const task = useAiTask<AiResponse>();

  if (!books || !sessions || !logs || !lastInsight) return <Loading />;
  const from = periodStart(period);
  const finished = finishedIn(books.map((b) => b.copy), from);
  const played = sessionsIn(sessions, from);
  const pages = pagesRead(logs, from);
  const bars = readingBars(logs, period);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const wins = winStats(played);
  const decided = wins.wins + wins.losses + wins.draws;
  const facts = `کتاب‌های تمام‌شده: ${finished.length} (${finished.map((b) => b.title).join('، ') || '—'})\nصفحات خوانده‌شده: ${pages}\nجلسه‌های بازی: ${played.length}`;

  // Donut: win share as a conic gradient; legend carries the numbers so colour isn't the only cue.
  const winDeg = decided ? (wins.wins / played.length) * 360 : 0;
  const lossDeg = decided ? (wins.losses / played.length) * 360 : 0;

  return (
    <div className="pb-24 page-enter">
      <PageHeader title="آمار و گزارش‌ها" />
      <main className="px-6 space-y-8">
        <div className="flex bg-[#EEE2D3]/40 p-1.5 rounded-2xl" role="tablist">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cx('flex-1 py-2 rounded-xl font-bold text-xs min-h-9', period === p ? 'bg-white text-[#8E3200] shadow-sm' : 'text-gray-600')}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="stat-card flex flex-col items-center text-center">
            <div className="w-10 h-10 bg-[#8E3200]/10 rounded-xl flex items-center justify-center text-[#8E3200] mb-3">
              <Icon name="fa-book-open" className="text-sm" />
            </div>
            <p className="text-2xl font-bold text-[#4F4839]">{fa(finished.length)}</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">کتاب تمام شده</p>
          </div>
          <div className="stat-card flex flex-col items-center text-center">
            <div className="w-10 h-10 bg-[#D7A86E]/10 rounded-xl flex items-center justify-center text-[#8E3200] mb-3">
              <Icon name="fa-dice" className="text-sm" />
            </div>
            <p className="text-2xl font-bold text-[#4F4839]">{fa(played.length)}</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">جلسه بازی</p>
          </div>
        </div>

        <section className="stat-card space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-[#4F4839] text-sm">روند مطالعه (صفحات)</h3>
            <span className="text-[10px] text-[#8E3200] font-bold">مجموع: {fa(pages)} صفحه</span>
          </div>
          <div className="flex items-end gap-2 h-40 px-1">
            {bars.map((b) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end" title={`${b.label}: ${fa(b.value)} صفحه`}>
                <div
                  className={cx('w-full rounded-t-lg', b.current ? 'bg-[#8E3200] shadow-lg shadow-[#8E3200]/20' : b.value ? 'bg-[#D7A86E]' : 'bg-[#EEE2D3]')}
                  style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
                />
                <span className={cx('text-[8px] font-bold whitespace-nowrap', b.current ? 'text-[#8E3200]' : 'text-gray-500')}>{b.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500">صفحه‌ها از روی «ثبت پیشرفت» شمرده می‌شوند.</p>
        </section>

        <section className="stat-card">
          <h3 className="font-bold text-[#4F4839] text-sm mb-6">توزیع نتایج بازی‌های من</h3>
          {played.length === 0 ? (
            <p className="text-xs text-gray-500">در {PERIOD_NAME[period]} جلسه‌ای ثبت نشده است.</p>
          ) : (
            <div className="flex items-center gap-8">
              <div
                className="relative w-32 h-32 rounded-full flex-shrink-0"
                style={{ background: `conic-gradient(#8E3200 0 ${winDeg}deg, #D7A86E ${winDeg}deg ${winDeg + lossDeg}deg, #E5E7EB ${winDeg + lossDeg}deg 360deg)` }}
                role="img"
                aria-label={`برد ${fa(wins.wins)}، باخت ${fa(wins.losses)}`}
              >
                <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center flex-col">
                  <span className="text-xl font-bold text-[#4F4839]">{decided ? `${fa(wins.rate)}٪` : '—'}</span>
                  <span className="text-[9px] text-gray-500 font-bold">برد</span>
                </div>
              </div>
              <div className="flex-1 space-y-4">
                {(
                  [
                    ['برد', wins.wins, 'bg-[#8E3200]'],
                    ['باخت', wins.losses, 'bg-[#D7A86E]'],
                    ['مساوی / بی‌نتیجه', wins.draws + wins.unknown, 'bg-gray-200'],
                  ] as const
                ).map(([label, n, dot]) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cx('w-2.5 h-2.5 rounded-full', dot)} />
                      <span className="text-xs text-[#4F4839]">
                        {label} ({fa(n)})
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#4F4839]">{fa(Math.round((n / played.length) * 100))}٪</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          {task.running ? (
            <AiThinking label="در حال نوشتن برداشت..." onCancel={task.cancel} />
          ) : !configured ? (
            <AiStateCard code="needs_setup" />
          ) : (
            <>
              {task.error && <AiStateCard code={task.error} />}
              <button
                type="button"
                disabled={!online}
                onClick={() => task.run((signal) => readingInsight(PERIOD_NAME[period], facts, signal))}
                className="w-full bg-[#433520] p-6 rounded-[2.5rem] text-white space-y-2 text-right disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <Icon name="fa-lightbulb" className="text-[#D7A86E]" />
                  <span className="font-bold text-sm">برداشت هوشمند از {PERIOD_NAME[period]}</span>
                </span>
                <span className="block text-xs leading-relaxed text-white/75">
                  {online ? 'همین آمار و کتاب‌های خوانده‌شده برای هوش مصنوعی فرستاده می‌شود.' : 'برای این بخش اینترنت لازم است.'}
                </span>
              </button>
            </>
          )}
          {lastInsight.map((r) => (
            <AiAnswer key={r.id} response={r} onDelete={() => db.aiResponses.delete(r.id)} />
          ))}
        </section>
      </main>
    </div>
  );
}
