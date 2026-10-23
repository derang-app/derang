import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { identifyBook, identifyGame, type BookSuggestion, type GameSuggestion, type IdentifyData } from '../ai/tasks';
import { AiStateCard, useAiReady, useAiTask } from '../ai/ui';
import { linkCopyToWork, updateCopy, updateWork } from '../db/books';
import { db } from '../db/db';
import { linkGameCopyToWork, updateGameCopy, updateGameWork } from '../db/games';
import { isManual } from '../db/provenance';
import type { AiResponse, Provenance, Source } from '../db/types';
import { fa, formatRange, normalizeForSearch } from '../lib/text';
import { GAME_TAGS } from '../lib/vocab';
import { BackButton, BottomAction, cx, Icon, Loading, PhotoImg } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { NotFound } from './BookDetails';

type Kind = 'book' | 'game';

interface FieldChoice {
  key: string;
  label: string;
  target: 'copy' | 'work';
  value: unknown;
  display: string;
  current: string;
  currentSource?: Source;
}

/**
 * AIProcessing + AIIdentification designs. Suggestions are only applied after review:
 * every field is opt-in, manual values are unticked by default, and the result is
 * saved either as confirmed or as an unconfirmed suggestion.
 */
export default function Identify() {
  const { kind, id } = useParams() as { kind: Kind; id: string };
  const navigate = useNavigate();
  const { configured, loading } = useAiReady();
  const task = useAiTask<AiResponse>();
  const { toast } = useOverlay();
  const [responseId, setResponseId] = useState<string>();
  const [chosen, setChosen] = useState(0);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const subject = useLiveQuery(async () => {
    if (kind === 'book') {
      const copy = await db.bookCopies.get(id);
      return copy ? { name: copy.title, photoIds: copy.photoIds, copy, work: await db.bookWorks.get(copy.workId) } : null;
    }
    const copy = await db.gameCopies.get(id);
    return copy ? { name: copy.name, photoIds: copy.photoIds, copy, work: await db.gameWorks.get(copy.workId) } : null;
  }, [kind, id]);
  // The latest saved identification for this item (also viewable offline).
  const saved = useLiveQuery(
    async () =>
      (await db.aiResponses.where('targetId').equals(id).filter((r) => r.kind === (kind === 'book' ? 'identify_book' : 'identify_game')).sortBy('createdAt')).pop() ?? null,
    [id, kind],
  );
  const response = (responseId ? (saved?.id === responseId ? saved : undefined) : saved) ?? undefined;
  const data = response?.data as IdentifyData<BookSuggestion | GameSuggestion> | undefined;

  const start = async () => {
    const r = await task.run((signal) => (kind === 'book' ? identifyBook(id, signal) : identifyGame(id, signal)));
    if (r) {
      setResponseId(r.id);
      setChosen(0);
      setPicked({});
    }
  };

  // Run automatically the first time (the user opened this screen to identify).
  useEffect(() => {
    if (subject && configured && saved === null && !task.running && !task.error) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, configured, saved]);

  const libraryMatches = useLiveQuery(async () => {
    const candidate = data?.candidates[chosen];
    if (!candidate) return [];
    const name = kind === 'book' ? (candidate as BookSuggestion).originalTitle : (candidate as GameSuggestion).originalName;
    if (!name) return [];
    const n = normalizeForSearch(name);
    if (kind === 'book') {
      const works = await db.bookWorks.filter((w) => !!w.title && normalizeForSearch(w.title) === n).toArray();
      return works.filter((w) => w.id !== subject?.copy.workId).map((w) => ({ id: w.id, label: w.title! }));
    }
    const works = await db.gameWorks.filter((w) => !!w.name && normalizeForSearch(w.name) === n).toArray();
    return works.filter((w) => w.id !== subject?.copy.workId).map((w) => ({ id: w.id, label: w.name! }));
  }, [data, chosen, kind, subject?.copy.workId]);

  const fields = useMemo<FieldChoice[]>(() => {
    const c = data?.candidates[chosen];
    if (!c || !subject) return [];
    const copy = subject.copy as unknown as Record<string, unknown> & { provenance: Provenance };
    const work = (subject.work ?? { provenance: {} }) as unknown as Record<string, unknown> & { provenance: Provenance };
    const show = (v: unknown) => (Array.isArray(v) ? v.join('، ') : v === undefined || v === null ? '' : typeof v === 'number' ? fa(v) : String(v));
    const list: FieldChoice[] = [];
    const add = (key: string, label: string, target: 'copy' | 'work', value: unknown, displayOverride?: string) => {
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return;
      const holder = target === 'copy' ? copy : work;
      list.push({ key, label, target, value, display: displayOverride ?? show(value), current: show(holder[key]), currentSource: holder.provenance[key] });
    };
    if (kind === 'book') {
      const b = c as BookSuggestion;
      add('title', 'عنوان اصلی اثر', 'work', b.originalTitle);
      add('authors', 'نویسنده', 'work', b.authors);
      add('translators', 'مترجم', 'copy', b.translators);
      add('publisher', 'ناشر', 'copy', b.publisher);
      add('language', 'زبان', 'copy', b.language);
      add('publication', 'مشخصات انتشار', 'copy', b.publication);
      add('isbn', 'شابک', 'copy', b.isbn);
      add('pageCount', 'تعداد صفحات', 'copy', b.pageCount);
    } else {
      const g = c as GameSuggestion;
      add('name', 'نام بازی اصلی', 'work', g.originalName);
      add('altNames', 'نام‌های دیگر', 'work', g.altNames);
      add('bggId', 'شناسه BGG', 'work', g.bggId);
      add('minPlayers', 'حداقل بازیکن مجاز', 'work', g.minPlayers);
      add('maxPlayers', 'حداکثر بازیکن مجاز', 'work', g.maxPlayers);
      add('playTimeMin', 'حداقل زمان (دقیقه)', 'work', g.playTimeMin);
      add('playTimeMax', 'حداکثر زمان (دقیقه)', 'work', g.playTimeMax);
      add('complexity', 'پیچیدگی (۱ تا ۵)', 'work', g.complexity === null ? null : Math.min(5, Math.max(1, g.complexity)));
      add('tags', 'سبک', 'work', g.tags.filter((t) => (GAME_TAGS as readonly string[]).includes(t)));
    }
    return list;
  }, [data, chosen, subject, kind]);

  const isPicked = (f: FieldChoice) => picked[f.key] ?? (!f.current || !isManual(f.currentSource));

  if (subject === undefined || loading || saved === undefined) return <Loading />;
  if (subject === null) return <NotFound />;
  const back = kind === 'book' ? `/books/${id}` : `/games/${id}`;

  const apply = async (source: Source) => {
    const copyPatch: Record<string, unknown> = {};
    const workPatch: Record<string, unknown> = {};
    for (const f of fields) if (isPicked(f)) (f.target === 'copy' ? copyPatch : workPatch)[f.key] = f.value;
    if (kind === 'book') {
      await updateCopy(id, { ...copyPatch, matchStatus: source === 'ai_confirmed' ? 'confirmed' : 'suggested' }, source);
      if (Object.keys(workPatch).length) await updateWork(subject.copy.workId, workPatch, source);
    } else {
      await updateGameCopy(id, { matchStatus: source === 'ai_confirmed' ? 'confirmed' : 'suggested' }, source);
      if (workPatch.bggId) workPatch.refUrl = `https://boardgamegeek.com/boardgame/${workPatch.bggId}`;
      if (Object.keys(workPatch).length) await updateGameWork(subject.copy.workId, workPatch, source);
    }
    toast(source === 'ai_confirmed' ? 'اطلاعات تأیید و ثبت شد' : 'به‌عنوان پیشنهاد تأییدنشده ذخیره شد');
    navigate(back, { replace: true });
  };

  const linkExisting = async (workId: string) => {
    if (kind === 'book') {
      await linkCopyToWork(id, workId);
      await updateCopy(id, { matchStatus: 'confirmed' });
    } else {
      await linkGameCopyToWork(id, workId);
      await updateGameCopy(id, { matchStatus: 'confirmed' });
    }
    toast('به اثر موجود متصل شد');
    navigate(back, { replace: true });
  };

  // Processing screen
  if (task.running) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center overflow-hidden page-enter" role="status">
        <div className="relative flex items-center justify-center mb-16">
          <div className="absolute w-64 h-64 border border-[#D7A86E]/20 rounded-full orbit">
            <div className="absolute -top-1 left-1/2 w-2 h-2 bg-[#8E3200] rounded-full" />
          </div>
          <div className="absolute w-48 h-48 border border-[#D7A86E]/10 rounded-full orbit" style={{ animationDirection: 'reverse', animationDuration: '7s' }}>
            <div className="absolute top-1/2 -left-1 w-1.5 h-1.5 bg-[#D7A86E] rounded-full" />
          </div>
          <div className="w-32 h-32 bg-white rounded-[2.5rem] shadow-2xl flex items-center justify-center ai-glow relative z-10 border border-[#EEE2D3]">
            <Icon name="fa-wand-magic-sparkles" className="text-5xl text-[#8E3200]" />
          </div>
        </div>
        <div className="text-center space-y-6 px-10">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[#4F4839]">کمی صبر کنید...</h1>
            <p className="text-sm text-[#8E3200] font-medium italic">هوش مصنوعی در حال تحلیل اطلاعات اثر است.</p>
          </div>
          <div className="flex justify-center gap-2">
            <div className="w-2 h-2 bg-[#8E3200] rounded-full loading-dot dot-1" />
            <div className="w-2 h-2 bg-[#8E3200] rounded-full loading-dot dot-2" />
            <div className="w-2 h-2 bg-[#8E3200] rounded-full loading-dot" />
          </div>
          <div className="pt-8 flex flex-col items-center gap-2">
            <div className="bg-white px-4 py-2 rounded-2xl border border-[#EEE2D3] flex items-center gap-2 shadow-sm">
              <Icon name="fa-cloud-arrow-up" className="text-[#D7A86E] text-xs" />
              <span className="text-[11px] font-bold text-gray-600">
                {subject.photoIds.length ? `ارسال نام و ${fa(Math.min(3, subject.photoIds.length))} عکس برای شناسایی...` : 'ارسال نام برای شناسایی...'}
              </span>
            </div>
            <p className="text-[10px] text-gray-500">نیاز به اتصال اینترنت برای دریافت اطلاعات اثر</p>
          </div>
        </div>
        <div className="fixed bottom-12 inset-x-app flex justify-center">
          <button type="button" onClick={task.cancel} className="text-[#8E3200] text-sm font-bold bg-white px-8 py-3 rounded-2xl border border-[#EEE2D3] shadow-sm active:scale-95 transition-all min-h-11">
            انصراف
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-36 page-enter">
      <header className="px-6 pt-8 pb-4 flex justify-between items-center bg-[#FFF9F0]/80 backdrop-blur-lg sticky top-0 z-20">
        <BackButton kind="close" onClick={() => navigate(back, { replace: true })} />
        <div className="text-center">
          <h1 className="text-lg font-bold text-[#4F4839]">نتایج شناسایی</h1>
          <p className="text-[10px] text-[#8E3200] font-bold">پیشنهاد هوش مصنوعی؛ قبل از اعمال بررسی کن</p>
        </div>
        <div className="w-12" />
      </header>

      <main className="px-6 space-y-8 mt-4">
        <div className="relative w-full aspect-video rounded-[2.5rem] overflow-hidden shadow-inner bg-[#EEE2D3]">
          {subject.photoIds[0] && <PhotoImg id={subject.photoIds[0]} className="absolute inset-0 opacity-50 blur-sm" />}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-28 h-36 border-2 border-white rounded-2xl relative shadow-2xl bg-white">
              <PhotoImg id={subject.photoIds[0]} placeholderIcon={kind === 'book' ? 'fa-book' : 'fa-dice'} className="w-full h-full rounded-xl" />
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <span className="bg-black/50 backdrop-blur-md text-white text-[10px] px-4 py-1.5 rounded-full font-bold">{subject.name}</span>
          </div>
        </div>

        {!configured ? (
          <AiStateCard code="needs_setup" />
        ) : task.error ? (
          <AiStateCard code={task.error} onRetry={start} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <div className="bg-[#D7A86E]/10 p-5 rounded-[2rem] border border-[#D7A86E]/20">
              <div className="flex items-center gap-3 mb-2">
                <Icon name={data.status === 'clear' ? 'fa-circle-check' : 'fa-magnifying-glass-chart'} className="text-[#8E3200]" />
                <h2 className="text-sm font-bold text-[#8E3200]">
                  {data.status === 'clear' ? 'یک گزینهٔ روشن پیدا شد' : data.status === 'ambiguous' ? 'به نظر می‌رسد چند گزینه مشابه وجود دارد' : 'اطلاعات کافی نبود'}
                </h2>
              </div>
              <p className="text-[12px] leading-relaxed text-[#433520]">{data.message}</p>
              {data.needs && (
                <p className="text-[12px] leading-relaxed text-[#8E3200] mt-2">
                  <Icon name="fa-camera" className="ml-1" /> {data.needs}
                </p>
              )}
            </div>

            <div className="space-y-4">
              {data.candidates.map((c, i) => {
                const title = kind === 'book' ? (c as BookSuggestion).originalTitle ?? (c as BookSuggestion).copyTitle : (c as GameSuggestion).originalName;
                const sub =
                  kind === 'book'
                    ? [(c as BookSuggestion).authors.join('، '), (c as BookSuggestion).publisher, (c as BookSuggestion).translators.length ? `ترجمه ${(c as BookSuggestion).translators.join('، ')}` : '']
                    : [formatRange((c as GameSuggestion).minPlayers ?? undefined, (c as GameSuggestion).maxPlayers ?? undefined) && `${formatRange((c as GameSuggestion).minPlayers ?? undefined, (c as GameSuggestion).maxPlayers ?? undefined)} نفر`];
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={chosen === i}
                    onClick={() => {
                      setChosen(i);
                      setPicked({});
                    }}
                    className={cx('w-full text-right p-4 rounded-3xl flex gap-4 items-start border-2', chosen === i ? 'match-card-active' : 'bg-white border-[#EEE2D3] opacity-80')}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="text-sm font-bold text-[#4F4839] ltr text-right">{title || 'بدون عنوان مشخص'}</h3>
                        <span className={cx('text-[9px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap', i === 0 ? 'bg-[#8E3200] text-white' : 'bg-[#EEE2D3] text-[#8E3200]')}>
                          {i === 0 ? 'گزینهٔ اول' : 'سایر احتمالات'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">{sub.filter(Boolean).join('، ')}</p>
                      <p className="text-[11px] text-[#433520] mt-2 leading-relaxed">
                        <span className="font-bold text-[#8E3200]">مبنا: </span>
                        {c.basis}
                      </p>
                    </div>
                    {chosen === i && <Icon name="fa-circle-dot" className="text-[#8E3200] mt-1" />}
                  </button>
                );
              })}
            </div>

            {libraryMatches && libraryMatches.length > 0 && (
              <div className="bg-white border border-[#EEE2D3] p-5 rounded-[2rem] space-y-3">
                <p className="text-xs font-bold text-[#4F4839]">این اثر در مجموعه‌ات وجود دارد:</p>
                {libraryMatches.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => linkExisting(w.id)}
                    className="w-full flex items-center justify-between bg-[#FFF9F0] p-3 rounded-2xl text-xs font-bold text-[#8E3200] min-h-11"
                  >
                    <span className="ltr">{w.label}</span>
                    <span>
                      <Icon name="fa-link" className="ml-1" /> اتصال این نسخه
                    </span>
                  </button>
                ))}
              </div>
            )}

            {fields.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">کدام اطلاعات اعمال شود؟</h3>
                <div className="bg-white rounded-[2rem] border border-[#EEE2D3] divide-y divide-[#EEE2D3]/60">
                  {fields.map((f) => (
                    <label key={f.key} className="flex items-start gap-3 p-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPicked(f)}
                        onChange={(e) => setPicked({ ...picked, [f.key]: e.target.checked })}
                        className="w-5 h-5 accent-[#8E3200] mt-0.5 flex-shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[10px] text-gray-500">{f.label}</span>
                        <span className="block text-sm font-bold text-[#4F4839] break-words">{f.display}</span>
                        {f.current && f.current !== f.display && (
                          <span className="block text-[10px] text-[#8E3200] mt-0.5">
                            مقدار فعلی: {f.current}
                            {isManual(f.currentSource) ? ' (ورود دستی خودت؛ پیش‌فرض حفظ می‌شود)' : ''}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {kind === 'game' && (
              <button
                type="button"
                onClick={() => {
                  const c = data.candidates[chosen] as GameSuggestion | undefined;
                  navigate(`/games/${id}/bgg?q=${encodeURIComponent(c?.bggId ?? c?.originalName ?? subject.name)}`);
                }}
                className="w-full py-4 bg-[#4F4839] text-white rounded-3xl text-xs font-bold flex items-center justify-center gap-2 min-h-11"
              >
                <Icon name="fa-cloud-arrow-down" />
                <span>بررسی همین گزینه در BoardGameGeek</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(kind === 'book' ? `/books/${id}/edit` : `/games/${id}/edit`)}
              className="w-full py-4 border-2 border-dashed border-[#D7A86E]/40 rounded-3xl text-[#8E3200] text-xs font-bold flex items-center justify-center gap-2 min-h-11"
            >
              <Icon name="fa-pen" />
              <span>هیچ‌کدام درست نیست، خودم وارد می‌کنم</span>
            </button>
            <button type="button" onClick={start} className="w-full text-xs font-bold text-gray-500 py-2 min-h-11">
              <Icon name="fa-rotate" className="ml-1" /> شناسایی دوباره (مثلاً بعد از افزودن عکس شناسنامه یا دفترچه)
            </button>
          </>
        )}
      </main>

      {data && fields.length > 0 && !task.error && (
        <BottomAction>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => apply('ai_unconfirmed')}
              className="flex-1 bg-white border border-[#EEE2D3] text-[#4F4839] py-4 rounded-2xl font-bold text-xs shadow-sm min-h-11"
            >
              ذخیره به‌عنوان پیشنهاد
            </button>
            <button
              type="button"
              onClick={() => apply('ai_confirmed')}
              className="flex-[2] bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-2 min-h-11"
            >
              <span>تأیید و تکمیل اطلاعات</span>
              <Icon name="fa-arrow-left" />
            </button>
          </div>
        </BottomAction>
      )}
    </div>
  );
}
