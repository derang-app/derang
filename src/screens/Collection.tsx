import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authorsOf, bookTitle, useBooks, useGames, useSessions } from '../db/queries';
import type { ReadStatus } from '../db/types';
import { formatRange, fa, matchesQuery } from '../lib/text';
import { cx, Icon, Loading, PhotoImg } from '../ui/kit';
import { Sheet } from '../ui/overlay';
import { complexityLabel, EDITION_LABEL } from '../lib/vocab';

type BookFilter = 'all' | ReadStatus | 'wish';
type GameFilter = 'all' | 'unplayed' | 'wish' | 'unidentified';
type Sort = 'recent' | 'title';

const BOOK_FILTERS: [BookFilter, string][] = [
  ['all', 'همه وضعیت‌ها'],
  ['reading', 'در حال مطالعه'],
  ['read', 'خوانده شده'],
  ['unread', 'نخوانده'],
  ['wish', 'علاقه‌مندی‌ها'],
];
const GAME_FILTERS: [GameFilter, string][] = [
  ['all', 'همه بازی‌ها'],
  ['unplayed', 'بازی‌نشده'],
  ['unidentified', 'شناسایی‌نشده'],
  ['wish', 'علاقه‌مندی‌ها'],
];

/** CollectionList design, shared by the Books and Games tabs (each reached from the bottom nav). */
export default function Collection({ kind }: { kind: 'books' | 'games' }) {
  const [params, setParams] = useSearchParams();
  const books = useBooks();
  const games = useGames();
  const sessions = useSessions();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const bookFilter = (params.get('status') as BookFilter) || 'all';
  const gameFilter = (params.get('filter') as GameFilter) || 'all';

  const played = useMemo(() => new Set(sessions?.map((s) => s.gameCopyId)), [sessions]);

  const shownBooks = useMemo(() => {
    if (!books) return [];
    return books
      .filter((b) => {
        if (bookFilter === 'wish') return !b.copy.owned;
        if (!b.copy.owned) return false;
        return bookFilter === 'all' || b.copy.status === bookFilter;
      })
      .filter((b) =>
        matchesQuery(query, b.copy.title, b.work?.title, b.work?.authors, b.work?.altTitles, b.copy.translators, b.copy.publisher, b.copy.isbn),
      )
      .sort((a, b) => (sort === 'title' ? bookTitle(a).localeCompare(bookTitle(b), 'fa') : b.copy.updatedAt - a.copy.updatedAt));
  }, [books, bookFilter, query, sort]);

  const shownGames = useMemo(() => {
    if (!games) return [];
    return games
      .filter((g) => {
        if (gameFilter === 'wish') return !g.copy.owned;
        if (!g.copy.owned) return false;
        if (gameFilter === 'unplayed') return !played.has(g.copy.id);
        if (gameFilter === 'unidentified') return g.copy.matchStatus !== 'confirmed';
        return true;
      })
      .filter((g) => matchesQuery(query, g.copy.name, g.copy.brand, g.work?.name, g.work?.altNames, g.work?.tags))
      .sort((a, b) => (sort === 'title' ? a.copy.name.localeCompare(b.copy.name, 'fa') : b.copy.updatedAt - a.copy.updatedAt));
  }, [games, gameFilter, query, sort, played]);

  if (!books || !games) return <Loading />;
  const ownedBooks = books.filter((b) => b.copy.owned).length;
  const ownedGames = games.filter((g) => g.copy.owned).length;
  const total = kind === 'books' ? ownedBooks : ownedGames;
  const filters = kind === 'books' ? BOOK_FILTERS : GAME_FILTERS;
  const active = kind === 'books' ? bookFilter : gameFilter;
  const setFilter = (f: string) => {
    const next = new URLSearchParams(params);
    next.set(kind === 'books' ? 'status' : 'filter', f);
    setParams(next, { replace: true });
  };
  const addTo = `/add?type=${kind === 'books' ? 'book' : 'game'}${active === 'wish' ? '&wish=1' : ''}`;

  return (
    <div className="pb-28 page-enter">
      <header className="px-6 pt-8 pb-4 sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#4F4839]">{kind === 'books' ? `کتاب‌های من (${fa(ownedBooks)})` : `بردگیم‌های من (${fa(ownedGames)})`}</h1>
          <button
            type="button"
            aria-label="مرتب‌سازی"
            onClick={() => setSortOpen(true)}
            className="w-11 h-11 bg-white rounded-xl flex items-center justify-center text-[#D7A86E] shadow-sm"
          >
            <Icon name="fa-sliders" />
          </button>
        </div>
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`جستجو در میان ${fa(total)} مورد...`}
            aria-label="جستجو در مجموعه"
            className="w-full bg-white border border-[#EEE2D3] rounded-2xl py-3 pr-12 pl-4 text-sm focus:outline-none focus:border-[#8E3200] transition-all"
          />
          <Icon name="fa-magnifying-glass" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#D7A86E]" />
        </div>
      </header>

      <main className="px-6 pt-4">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-6">
          {filters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={active === key}
              onClick={() => setFilter(key)}
              className={cx(
                'px-4 py-2 border rounded-full text-[11px] font-bold whitespace-nowrap min-h-9',
                active === key ? 'bg-[#8E3200] text-white border-[#8E3200]' : 'bg-white border-[#EEE2D3] text-gray-500',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === 'books' ? (
          <div className="grid grid-cols-3 gap-x-4 gap-y-8">
            {shownBooks.map((b) => (
              <Link key={b.copy.id} to={`/books/${b.copy.id}`} className={cx('space-y-2 block', !b.copy.owned && 'opacity-80')}>
                <div className="relative">
                  <PhotoImg id={b.copy.photoIds[0]} placeholderIcon="fa-book" className="aspect-[3/4.5] rounded-2xl shadow-sm" alt="" />
                  <StatusDot status={b.copy.status} owned={b.copy.owned} />
                </div>
                <h3 className="text-[11px] font-bold text-[#4F4839] truncate">{bookTitle(b)}</h3>
                <p className="text-[9px] text-gray-500 truncate -mt-1">{authorsOf(b) || ' '}</p>
              </Link>
            ))}
            <AddTile to={addTo} label={active === 'wish' ? 'افزودن آرزو' : 'افزودن کتاب'} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {shownGames.map((g) => (
              <Link key={g.copy.id} to={`/games/${g.copy.id}`} className="wish-card shadow-sm">
                <div className="relative aspect-square">
                  <PhotoImg id={g.copy.photoIds[0]} placeholderIcon="fa-dice" className="w-full h-full" alt="" />
                  {!g.copy.owned && (
                    <span className="absolute top-3 left-3 bg-[#8E3200] text-white w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-lg" aria-label="علاقه‌مندی">
                      <Icon name="fa-heart" />
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-1">
                  <h3 className="text-xs font-bold text-[#4F4839] truncate">{g.copy.name}</h3>
                  <p className="text-[10px] text-gray-500 truncate">
                    {[
                      g.work?.minPlayers !== undefined ? `${formatRange(g.work.minPlayers, g.work.maxPlayers)} نفر` : '',
                      g.work?.playTimeMax ?? g.work?.playTimeMin ? `${formatRange(g.work?.playTimeMin, g.work?.playTimeMax)} دقیقه` : '',
                    ]
                      .filter(Boolean)
                      .join('، ') || 'مشخصات ثبت نشده'}
                  </p>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[9px] text-[#8E3200] font-bold">{g.copy.edition ? EDITION_LABEL[g.copy.edition] : ' '}</span>
                    {g.work?.complexity !== undefined && (
                      <span className="text-[9px] text-[#D7A86E] font-bold">{complexityLabel(g.work.complexity)}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            <AddTile to={addTo} label={active === 'wish' ? 'افزودن آرزو' : 'افزودن بازی'} square />
          </div>
        )}

        {((kind === 'books' && shownBooks.length === 0) || (kind === 'games' && shownGames.length === 0)) && (
          <p className="text-center text-xs text-gray-500 mt-8 leading-relaxed">
            {query ? `نتیجه‌ای برای «${query}» پیدا نشد.` : 'موردی در این دسته نیست.'}
          </p>
        )}
      </main>

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} label="مرتب‌سازی">
        <h2 className="text-lg font-bold text-center mb-6">مرتب‌سازی</h2>
        <div className="space-y-3">
          {(
            [
              ['recent', 'آخرین تغییرات'],
              ['title', 'الفبایی'],
            ] as [Sort, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSort(k);
                setSortOpen(false);
              }}
              className={cx('settings-item', sort === k && 'border-[#8E3200]')}
            >
              <span className="text-sm font-bold">{label}</span>
              {sort === k && <Icon name="fa-check" className="text-[#8E3200]" />}
            </button>
          ))}
          <Link to="/wishlist" className="settings-item">
            <span className="text-sm font-bold">فهرست علاقه‌مندی (کتاب و بازی)</span>
            <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
          </Link>
          <Link to="/reading-path" className="settings-item">
            <span className="text-sm font-bold">مسیر مطالعه من</span>
            <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
          </Link>
          <Link to="/players" className="settings-item">
            <span className="text-sm font-bold">هم‌بازی‌ها</span>
            <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
          </Link>
        </div>
      </Sheet>

    </div>
  );
}

function StatusDot({ status, owned }: { status: ReadStatus; owned: boolean }) {
  if (!owned) {
    return (
      <span className="absolute top-2 right-2 bg-[#8E3200] text-white w-6 h-6 rounded-full flex items-center justify-center text-[9px] shadow" title="علاقه‌مندی" aria-label="علاقه‌مندی؛ هنوز ندارم">
        <Icon name="fa-heart" />
      </span>
    );
  }
  if (status === 'unread') return null;
  // Shape + colour, so status is not conveyed by colour alone.
  return (
    <span
      className={cx(
        'absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] text-white shadow',
        status === 'reading' ? 'bg-green-600' : 'bg-[#8E3200]',
      )}
      aria-label={status === 'reading' ? 'در حال مطالعه' : 'خوانده‌شده'}
    >
      <Icon name={status === 'reading' ? 'fa-book-open' : 'fa-check'} />
    </span>
  );
}

function AddTile({ to, label, square }: { to: string; label: string; square?: boolean }) {
  return (
    <Link
      to={to}
      className={cx(
        'rounded-2xl border-2 border-dashed border-[#D7A86E]/30 flex flex-col items-center justify-center p-4 text-center',
        square ? 'aspect-[3/4] rounded-[2rem]' : 'aspect-[3/4.5]',
      )}
    >
      <Icon name="fa-plus" className="text-[#D7A86E] text-lg mb-2" />
      <span className="text-[10px] font-bold text-[#8E3200]">{label}</span>
    </Link>
  );
}
