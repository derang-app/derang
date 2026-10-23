import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApiKeyHint } from '../ai/secret';
import { db } from '../db/db';
import { linkGameCopyToWork, updateGameCopy, updateGameWork } from '../db/games';
import { isManual, SOURCE_LABEL } from '../db/provenance';
import { useGame } from '../db/queries';
import type { GameWork } from '../db/types';
import { useOnline } from '../lib/online';
import { fa, formatRange } from '../lib/text';
import { BGG_ERROR_TEXT, BGG_SECRET, BggError, fetchBggGame, searchBgg, type BggGame, type BggSearchHit } from '../online/bgg';
import { BottomAction, Icon, Loading, PageHeader, PhotoImg, Spinner } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { NotFound } from './BookDetails';

interface Field {
  key: keyof GameWork;
  label: string;
  value: unknown;
  display: string;
  current: string;
  manual: boolean;
}

function show(v: unknown) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? fa(x) : x)).join('، ');
  if (typeof v === 'number') return fa(v);
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Look a game up on BoardGameGeek and apply its data to the original game, field by
 * field. Online data is stored with the "online source" origin and never replaces
 * values I typed unless I tick them.
 */
export default function BggLookup() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const data = useGame(id);
  const token = useApiKeyHint(BGG_SECRET);
  const online = useOnline();
  const { toast } = useOverlay();
  const [query, setQuery] = useState<string>();
  const [hits, setHits] = useState<BggSearchHit[]>();
  const [game, setGame] = useState<BggGame>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(undefined);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof BggError ? BGG_ERROR_TEXT[e.code] : BGG_ERROR_TEXT.bad_response);
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const open = async (bggId: string) => {
    const g = await run(() => fetchBggGame(bggId));
    if (g) {
      setGame(g);
      setPicked({});
    }
  };
  const search = async (q: string) => {
    setGame(undefined);
    const r = await run(() => searchBgg(q));
    if (r) setHits(r);
  };

  // Start from the stored BGG id, otherwise search by the best name we have.
  const initial = params.get('q') || data?.work?.name || data?.copy.name || '';
  useEffect(() => {
    if (!data || !token || query !== undefined) return;
    setQuery(initial);
    if (data.work?.bggId && !params.get('q')) open(data.work.bggId);
    else if (/^\d{1,9}$/.test(initial.trim())) open(initial.trim());
    else if (initial) search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, token]);

  // Another original game in my collection already linked to this BGG id?
  const existing = useLiveQuery(
    async () => (game ? (await db.gameWorks.where('bggId').equals(game.id).toArray()).filter((w) => w.id !== data?.copy.workId) : []),
    [game?.id, data?.copy.workId],
  );

  const fields = useMemo<Field[]>(() => {
    if (!game || !data) return [];
    const w = data.work;
    const list: Field[] = [];
    const add = (key: keyof GameWork, label: string, value: unknown) => {
      if (value === undefined || (Array.isArray(value) && !value.length)) return;
      const cur = w?.[key];
      list.push({ key, label, value, display: show(value), current: show(cur), manual: isManual(w?.provenance[key]) && show(cur) !== '' });
    };
    add('name', 'نام اصلی', game.name);
    add('altNames', 'نام‌های دیگر', game.altNames);
    add('minPlayers', 'حداقل بازیکن مجاز', game.minPlayers);
    add('maxPlayers', 'حداکثر بازیکن مجاز', game.maxPlayers);
    add('recommendedPlayers', 'تعداد پیشنهادی جامعهٔ BGG («بهترین»)', game.bestPlayers);
    add('playTimeMin', 'حداقل زمان (دقیقه)', game.playTimeMin);
    add('playTimeMax', 'حداکثر زمان (دقیقه)', game.playTimeMax);
    add('complexity', `پیچیدگی (وزن BGG از ۵، ${fa(game.weightVotes)} رأی)`, game.weight);
    if (game.tags.length) add('tags', 'سبک (از دسته‌بندی‌های BGG)', [...new Set([...(w?.tags ?? []), ...game.tags])]);
    return list.filter((f) => f.display !== f.current);
  }, [game, data]);

  if (data === undefined || token === undefined) return <Loading />;
  if (data === null) return <NotFound />;
  const isPicked = (f: Field) => picked[f.key] ?? !f.manual;

  const apply = async () => {
    if (!game) return;
    const patch: Partial<GameWork> = {};
    for (const f of fields) if (isPicked(f)) (patch as Record<string, unknown>)[f.key] = f.value;
    await updateGameWork(data.copy.workId, patch, 'online');
    // Linking to this BGG entry is my own choice, so the link itself is manual.
    await updateGameWork(data.copy.workId, { bggId: game.id, refUrl: game.url }, 'manual');
    await updateGameCopy(data.copy.id, { matchStatus: 'confirmed' });
    toast('اطلاعات BGG ثبت شد');
    navigate(`/games/${data.copy.id}/specs`, { replace: true });
  };

  const linkTo = async (workId: string) => {
    await linkGameCopyToWork(data.copy.id, workId);
    await updateGameCopy(data.copy.id, { matchStatus: 'confirmed' });
    toast('به بازی اصلیِ موجود متصل شد');
    navigate(`/games/${data.copy.id}`, { replace: true });
  };

  return (
    <div className="pb-36 page-enter">
      <PageHeader title="BoardGameGeek" subtitle={data.copy.name} back="close" />
      <main className="px-6 space-y-6 mt-2">
        {!token ? (
          <div className="state-card border-dashed border-[#8E3200]/40">
            <div className="w-16 h-16 bg-[#FFF9F0] rounded-full flex items-center justify-center text-[#8E3200] mx-auto mb-4">
              <Icon name="fa-key" className="text-2xl" />
            </div>
            <h3 className="text-sm font-bold">اتصال به BGG نیازمند تنظیم است</h3>
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">BoardGameGeek برای هر درخواست توکن شخصی می‌خواهد. ورود دستی لینک و مشخصات همیشه کار می‌کند.</p>
            <button type="button" onClick={() => navigate('/settings/bgg')} className="bg-[#8E3200] text-white px-6 py-3 rounded-xl text-xs font-bold mt-6 min-h-11">
              تنظیم توکن BGG
            </button>
          </div>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (query) search(query);
              }}
              className="relative"
            >
              <input
                type="search"
                value={query ?? ''}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="نام بازی به انگلیسی یا شناسهٔ BGG..."
                aria-label="جستجو در BGG"
                dir="auto"
                className="w-full bg-white border border-[#EEE2D3] rounded-2xl py-3 pr-12 pl-24 text-sm focus:outline-none focus:border-[#8E3200]"
              />
              <Icon name="fa-magnifying-glass" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#D7A86E]" />
              <button
                type="submit"
                disabled={!online || busy}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-[#8E3200] text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 min-h-9"
              >
                جستجو
              </button>
            </form>
            {query && /^\d{1,9}$/.test(query.trim()) && (
              <button type="button" onClick={() => open(query.trim())} className="w-full text-xs font-bold text-[#8E3200] min-h-9">
                باز کردن مستقیم شناسهٔ {fa(query.trim())}
              </button>
            )}
            <p className="text-[10px] text-gray-500 leading-relaxed">نام فارسی معمولاً در BGG نیست؛ اگر نتیجه‌ای نیامد نام انگلیسی بازی را بنویس.</p>

            {!online && <p className="text-xs text-[#8E3200] text-center">{BGG_ERROR_TEXT.offline}</p>}
            {error && <div className="bg-red-50 border border-red-100 text-red-800 text-xs p-4 rounded-2xl leading-relaxed">{error}</div>}
            {busy && <Spinner className="py-6" />}

            {!busy && !game && hits && (
              <div className="space-y-3">
                {hits.length === 0 && <p className="text-xs text-gray-500 text-center py-6">نتیجه‌ای پیدا نشد.</p>}
                {hits.map((h) => (
                  <button key={h.id} type="button" onClick={() => open(h.id)} className="edition-card">
                    <span className="w-10 h-10 bg-[#4F4839] text-white rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0">BGG</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold ltr text-right truncate">{h.name}</span>
                      <span className="block text-[10px] text-gray-500">
                        {[h.year ? fa(h.year) : '', h.expansion ? 'افزونه' : '', `شناسه ${fa(h.id)}`].filter(Boolean).join('، ')}
                      </span>
                    </span>
                    <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
                  </button>
                ))}
              </div>
            )}

            {!busy && game && (
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-[2rem] border border-[#EEE2D3] flex gap-4">
                  <div className="flex flex-col gap-2 items-center flex-shrink-0">
                    <PhotoImg id={data.copy.photoIds[0]} placeholderIcon="fa-dice" className="w-16 h-16 rounded-2xl" />
                    <span className="text-[9px] text-gray-500">نسخهٔ من</span>
                  </div>
                  {game.thumbnail && (
                    <div className="flex flex-col gap-2 items-center flex-shrink-0">
                      <img src={game.thumbnail} alt="" referrerPolicy="no-referrer" className="w-16 h-16 rounded-2xl object-cover" />
                      <span className="text-[9px] text-gray-500">تصویر BGG</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold ltr text-right">{game.name}</h2>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {[game.year ? fa(game.year) : '', game.minPlayers ? `${formatRange(game.minPlayers, game.maxPlayers)} نفر` : '', `شناسه ${fa(game.id)}`].filter(Boolean).join('، ')}
                    </p>
                    <a href={game.url} target="_blank" rel="noreferrer noopener" className="text-[11px] font-bold text-[#8E3200] inline-flex items-center gap-1 mt-2 min-h-9">
                      مشاهده در BGG <Icon name="fa-arrow-up-right-from-square" className="text-[9px]" />
                    </a>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed -mt-3">
                  عکس نسخهٔ خودت عوض نمی‌شود؛ تصویر BGG فقط برای مقایسه نمایش داده می‌شود.
                </p>

                {existing && existing.length > 0 && (
                  <div className="bg-[#FFF9F0] border border-[#D7A86E]/40 p-5 rounded-[2rem] space-y-3">
                    <p className="text-xs font-bold">این بازی اصلی قبلاً در مجموعه‌ات هست (مثلاً با نسخهٔ دیگری).</p>
                    {existing.map((w) => (
                      <button key={w.id} type="button" onClick={() => linkTo(w.id)} className="w-full bg-white p-3 rounded-2xl text-xs font-bold text-[#8E3200] flex justify-between items-center min-h-11">
                        <span className="ltr">{w.name ?? game.name}</span>
                        <span>
                          <Icon name="fa-link" className="ml-1" /> اتصال این نسخه به آن
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">کدام اطلاعات ثبت شود؟</h3>
                  {fields.length === 0 ? (
                    <p className="text-xs text-gray-500 px-2">همهٔ اطلاعات با داده‌های فعلی یکی است؛ فقط اتصال به BGG ثبت می‌شود.</p>
                  ) : (
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
                            <span className="block text-sm font-bold break-words" dir="auto">
                              {f.display}
                            </span>
                            {f.current && (
                              <span className="block text-[10px] text-[#8E3200] mt-0.5">
                                فعلی: {f.current}
                                {f.manual ? ` (${SOURCE_LABEL.manual}؛ پیش‌فرض حفظ می‌شود)` : ''}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-500 px-2 leading-relaxed">مقدارهای انتخاب‌شده با منشأ «منبع آنلاین» ذخیره می‌شوند و بعداً هم قابل ویرایش‌اند.</p>
                </div>
                <button type="button" onClick={() => setGame(undefined)} className="w-full text-xs font-bold text-gray-500 min-h-11">
                  این نیست؛ برگرد به نتایج
                </button>
              </div>
            )}
          </>
        )}
        <p className="text-[10px] text-center text-gray-400 pt-4">
          Powered by{' '}
          <a href="https://boardgamegeek.com" target="_blank" rel="noreferrer noopener" className="underline">
            BoardGameGeek
          </a>
        </p>
      </main>
      {game && !busy && (
        <BottomAction>
          <button
            type="button"
            onClick={apply}
            className="w-full bg-[#8E3200] text-white py-5 rounded-[2.5rem] font-bold shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
          >
            <Icon name="fa-check" />
            <span>اتصال به این بازی و ثبت اطلاعات</span>
          </button>
        </BottomAction>
      )}
    </div>
  );
}
