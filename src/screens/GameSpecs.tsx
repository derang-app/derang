import { useNavigate, useParams } from 'react-router-dom';
import { SOURCE_LABEL } from '../db/provenance';
import { useGame } from '../db/queries';
import type { Source } from '../db/types';
import { fa, formatRange } from '../lib/text';
import { complexityLabel, EDITION_LABEL, INTERACTION_LABEL } from '../lib/vocab';
import { cx, Icon, Loading, PageHeader, PhotoImg } from '../ui/kit';
import { MatchBadge, NotFound } from './BookDetails';

const SOURCE_STYLE: Record<Source, string> = {
  manual: 'border-green-600 text-green-700',
  rulebook: 'border-green-600 text-green-700',
  online: 'border-blue-600 text-blue-700',
  ai_unconfirmed: 'border-[#D7A86E] text-[#8E3200]',
  ai_confirmed: 'border-[#8E3200] text-[#8E3200]',
};

/** GameDetailsFull design: player-count concepts, complexity, links, data origin. */
export default function GameSpecs() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useGame(id);
  if (data === undefined) return <Loading />;
  if (data === null) return <NotFound />;
  const { copy, work, sessions } = data;
  const p = work?.provenance ?? {};

  // "My favourite" falls back to what my sessions show, labelled as such.
  const counts = new Map<number, number>();
  for (const s of sessions) counts.set(s.playerIds.length, (counts.get(s.playerIds.length) ?? 0) + 1);
  const mostPlayed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const rows: [string, string, Source | undefined][] = [
    ['نام اصلی', work?.name ?? '', p.name],
    ['بازیکن مجاز', formatRange(work?.minPlayers, work?.maxPlayers), p.minPlayers ?? p.maxPlayers],
    ['تعداد پیشنهادی منبع', work?.recommendedPlayers.map(fa).join('، ') ?? '', p.recommendedPlayers],
    ['زمان بازی', formatRange(work?.playTimeMin, work?.playTimeMax), p.playTimeMin ?? p.playTimeMax],
    ['پیچیدگی', work?.complexity ? fa(work.complexity) : '', p.complexity],
    ['سبک‌ها', work?.tags.join('، ') ?? '', p.tags],
    ['شناسه BGG', work?.bggId ?? '', p.bggId],
  ];

  return (
    <div className="pb-24 page-enter">
      <PageHeader title="مشخصات فنی" />
      <main className="px-6 mt-4 space-y-10">
        <section className="flex gap-4">
          <PhotoImg id={copy.photoIds[0]} placeholderIcon="fa-dice" className="w-20 h-20 rounded-2xl shadow-sm flex-shrink-0" />
          <div className="flex-1 space-y-1 min-w-0">
            <h2 className="text-sm font-bold text-[#4F4839]">{copy.name}</h2>
            {work?.name && <p className="text-[11px] text-gray-500 font-medium ltr text-right">{work.name}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {copy.edition && <span className="bg-[#8E3200] text-white text-[9px] px-2 py-0.5 rounded-full font-bold">نسخه {EDITION_LABEL[copy.edition]}</span>}
              <MatchBadge status={copy.matchStatus} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">ظرفیت بازیکنان</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-2xl border border-[#EEE2D3] text-center space-y-1">
              <p className="text-[9px] text-gray-500 font-bold uppercase">مجاز</p>
              <p className="text-sm font-bold text-[#4F4839]">{work?.minPlayers !== undefined ? `${formatRange(work.minPlayers, work.maxPlayers)} نفر` : '—'}</p>
              <p className="text-[8px] text-gray-500">{p.minPlayers ? SOURCE_LABEL[p.minPlayers] : 'قوانین بازی'}</p>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-[#EEE2D3] text-center space-y-1">
              <p className="text-[9px] text-gray-500 font-bold uppercase">پیشنهادی</p>
              <p className="text-sm font-bold text-[#4F4839]">{work?.recommendedPlayers.length ? `${work.recommendedPlayers.map(fa).join('، ')} نفر` : '—'}</p>
              <p className="text-[8px] text-gray-500">{p.recommendedPlayers ? SOURCE_LABEL[p.recommendedPlayers] : 'منبع یا جامعه'}</p>
            </div>
            <div className="bg-[#8E3200] p-3 rounded-2xl text-center space-y-1 shadow-lg shadow-[#8E3200]/20">
              <p className="text-[9px] text-white/70 font-bold uppercase">محبوب من</p>
              <p className="text-sm font-bold text-white">
                {copy.favoritePlayers.length ? `${copy.favoritePlayers.map(fa).join('، ')} نفر` : mostPlayed ? `${fa(mostPlayed)} نفر` : '—'}
              </p>
              <p className="text-[8px] text-white/60">{copy.favoritePlayers.length ? 'بر اساس تجربه' : mostPlayed ? 'پرتکرارترین جلسه‌ها' : 'هنوز ثبت نشده'}</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest">پیچیدگی یادگیری</h3>
            <span className="text-[11px] font-bold text-[#8E3200]">{work?.complexity ? `${fa(work.complexity)} از ۵ (${complexityLabel(work.complexity)})` : 'ثبت نشده'}</span>
          </div>
          <div className="relative h-5 bg-white border border-[#EEE2D3] rounded-full overflow-hidden flex" role="img" aria-label={`پیچیدگی ${complexityLabel(work?.complexity)}`}>
            <div className="h-full bg-[#8E3200] rounded-full shadow-inner" style={{ width: `${((work?.complexity ?? 0) / 5) * 100}%` }} />
            <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none">
              <span className={cx('text-[8px] font-bold', work?.complexity ? 'text-white' : 'text-gray-400')}>بسیار ساده (۱)</span>
              <span className="text-[8px] text-gray-400 font-bold">خیلی پیچیده (۵)</span>
            </div>
          </div>
          {work?.interaction && <p className="text-[11px] text-gray-500 px-2">میزان تعامل: {INTERACTION_LABEL[work.interaction]}</p>}
        </section>

        <section className="space-y-4">
          <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">منابع آنلاین</h3>
          {work?.refUrl || work?.bggId ? (
            <a
              href={work.refUrl ?? `https://boardgamegeek.com/boardgame/${work.bggId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="bg-white p-5 rounded-[2rem] border border-[#EEE2D3] flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#4F4839] text-white rounded-xl flex items-center justify-center text-xs font-bold">BGG</div>
                <div>
                  <p className="text-xs font-bold text-[#4F4839]">مشاهده در BoardGameGeek</p>
                  {work.bggId && <p className="text-[10px] text-gray-500">شناسه اثر: {fa(work.bggId)}</p>}
                </div>
              </div>
              <Icon name="fa-arrow-up-right-from-square" className="text-[11px] text-[#8E3200]" />
            </a>
          ) : (
            <button type="button" onClick={() => navigate(`/games/${copy.id}/edit`)} className="w-full py-4 border-2 border-dashed border-[#D7A86E]/40 rounded-3xl text-[#8E3200] text-xs font-bold min-h-11">
              + افزودن لینک یا شناسهٔ BGG
            </button>
          )}
        </section>

        <section className="space-y-4 pb-12">
          <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">تاریخچه منشأ داده‌ها</h3>
          <div className="space-y-2">
            {rows.map(([label, value, source]) => (
              <div
                key={label}
                className={cx('flex justify-between gap-3 text-[11px] font-medium text-gray-600 px-3 border-r-2 py-1.5', source ? SOURCE_STYLE[source] : 'border-gray-200')}
              >
                <span>
                  {label}
                  {value ? `: ${value}` : ''}
                </span>
                <span className="flex-shrink-0">{value ? (source ? SOURCE_LABEL[source] : '—') : 'خالی'}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 px-2 leading-relaxed">
            قوانین ریدیزاین‌ها و کپی‌ها همان بازی اصلی است؛ نوع نسخه روی پیشنهاد بازی اثری ندارد.
          </p>
          <button type="button" onClick={() => navigate(`/games/${copy.id}/edit`)} className="w-full bg-white border border-[#EEE2D3] py-3 rounded-2xl text-xs font-bold min-h-11">
            ویرایش مشخصات
          </button>
        </section>
      </main>
    </div>
  );
}
