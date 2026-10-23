import { useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { authorsOf, bookTitle, useBooks, useGames, useSessions } from '../db/queries';
import { useSetting } from '../db/settings';
import { DAY, relativeDays } from '../lib/date';
import { readingBars, pagesRead, periodStart } from '../lib/stats';
import { fa, percent } from '../lib/text';
import { cx, Icon, Loading, PhotoImg, ProgressBar } from '../ui/kit';
import type { BookView } from '../db/books';
import type { GameView } from '../db/games';

export default function Home() {
  const navigate = useNavigate();
  const books = useBooks();
  const games = useGames();
  const sessions = useSessions();
  const profile = useSetting('profile');
  const logs = useLiveQuery(() => db.readingLogs.where('at').above(Date.now() - 400 * DAY).toArray(), []);

  if (!books || !games || !sessions || !profile || !logs) return <Loading />;
  if (books.length === 0 && games.length === 0) return <EmptyHome />;

  const reading = books.filter((b) => b.copy.owned && b.copy.status === 'reading').sort((a, b) => b.copy.updatedAt - a.copy.updatedAt);
  const recentBooks = books.filter((b) => b.copy.owned).sort((a, b) => b.copy.updatedAt - a.copy.updatedAt).slice(0, 8);
  const gameById = new Map(games.map((g) => [g.copy.id, g]));
  const recentSessions = sessions.slice(0, 3);
  const bars = readingBars(logs, 'week');
  const weekPages = pagesRead(logs, periodStart('week'));
  const maxBar = Math.max(...bars.map((b) => b.value), 1);
  const ignored = longIgnored(books, games, sessions.map((s) => ({ id: s.gameCopyId, at: s.at })));

  return (
    <div className="pb-28 page-enter">
      <header className="px-6 pt-8 pb-4 flex justify-between items-center sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20">
        <div>
          <h1 className="text-2xl font-bold text-[#8E3200]">درنگ</h1>
          <p className="text-[10px] text-[#D7A86E] font-bold italic">مدیریت دنج کتاب و بردگیم</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="جست‌وجو"
            onClick={() => navigate('/search')}
            className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white shadow-sm text-[#D7A86E]"
          >
            <Icon name="fa-magnifying-glass" />
          </button>
          <button type="button" aria-label="پروفایل" onClick={() => navigate('/settings/profile')}>
            <PhotoImg
              id={profile.photoId}
              placeholderIcon="fa-user"
              className="w-11 h-11 rounded-2xl border-2 border-white shadow-sm"
            />
          </button>
        </div>
      </header>

      <main className="px-6 space-y-8">
        <section className="mt-4">
          <h2 className="text-2xl font-bold text-[#4F4839] leading-tight">
            {profile.name ? `سلام ${profile.name} جان،` : 'سلام،'}
          </h2>
          <p className="text-sm text-[#D7A86E] mt-1 font-medium italic">امروز زمان خوبی برای یک صفحه مطالعه است.</p>
        </section>

        {reading.length > 0 ? (
          <div className="space-y-4">
            {reading.slice(0, 3).map((b) => (
              <ContinueReading key={b.copy.id} book={b} />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/books?status=unread')}
            className="w-full bg-white p-5 rounded-[2.5rem] border border-dashed border-[#D7A86E]/40 flex items-center gap-4 text-right"
          >
            <span className="w-16 h-16 rounded-2xl bg-[#D7A86E]/10 flex items-center justify-center text-[#D7A86E] text-2xl flex-shrink-0">
              <Icon name="fa-book-open" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-[#4F4839]">کتابی در حال مطالعه نیست</span>
              <span className="block text-[11px] text-gray-500 mt-1">از کتاب‌های نخوانده‌ات یکی را شروع کن.</span>
            </span>
            <Icon name="fa-chevron-left" className="text-[#D7A86E]" />
          </button>
        )}

        <Link to="/stats" className="block bg-white p-6 rounded-[2.5rem] border border-[#EEE2D3] shadow-sm" aria-label="وضعیت مطالعه؛ رفتن به آمار">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-[#4F4839]">وضعیت مطالعه</h3>
            <span className="text-[10px] bg-[#FFF9F0] text-[#8E3200] px-3 py-1.5 rounded-full font-bold">
              {fa(weekPages)} صفحه این هفته
            </span>
          </div>
          <div className="flex items-end gap-3 h-28 mb-4 px-2" aria-hidden="true">
            {bars.map((b) => (
              <div
                key={b.label}
                className={cx(
                  'flex-1 rounded-t-xl',
                  b.current ? 'bg-[#8E3200] shadow-lg shadow-[#8E3200]/20' : 'bg-[#D7A86E]/10',
                )}
                style={{ height: `${Math.max(8, (b.value / maxBar) * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 font-bold px-2">
            {bars.map((b) => (
              <span key={b.label} className={b.current ? 'text-[#8E3200]' : undefined}>
                {b.label}
              </span>
            ))}
          </div>
        </Link>

        <section className="bg-[#8E3200] p-8 rounded-[2.5rem] text-white relative overflow-hidden shadow-xl shadow-[#8E3200]/20">
          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-1">چی بازی کنیم؟</h3>
            <p className="text-xs text-white/70 mb-6 max-w-[180px]">بهترین بازی رو برای جمعِ امروزت انتخاب کن.</p>
            <button
              type="button"
              onClick={() => navigate('/picker')}
              className="bg-[#D7A86E] text-[#4F4839] px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform"
            >
              <span>شروع انتخاب</span>
              <Icon name="fa-chevron-left" className="text-[10px]" />
            </button>
          </div>
          <Icon name="fa-chess-knight" className="absolute -bottom-6 -left-6 text-9xl text-white/5 rotate-12" />
        </section>

        {recentBooks.length > 0 && (
          <section className="-mx-6">
            <div className="flex justify-between items-center mb-4 px-6">
              <h3 className="font-bold text-[#4F4839]">کتاب‌های اخیر</h3>
              <Link to="/books" className="text-[#8E3200] text-xs font-bold px-2 py-2">
                همه
              </Link>
            </div>
            <div className="flex gap-5 overflow-x-auto pb-4 px-6 hide-scrollbar">
              {recentBooks.map((b) => (
                <Link key={b.copy.id} to={`/books/${b.copy.id}`} className="w-36 flex-shrink-0">
                  <PhotoImg
                    id={b.copy.photoIds[0]}
                    placeholderIcon="fa-book"
                    className="aspect-[3/4.5] rounded-3xl shadow-lg mb-3"
                    alt={bookTitle(b)}
                  />
                  <div className="px-1">
                    <h4 className="text-sm font-bold text-[#4F4839] truncate">{bookTitle(b)}</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">{authorsOf(b) || ' '}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {recentSessions.length > 0 && (
          <section>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#4F4839]">آخرین بازی‌ها</h3>
              <Link to="/games" className="text-[#8E3200] text-xs font-bold py-2">
                همه
              </Link>
            </div>
            <div className="space-y-4">
              {recentSessions.map((s) => {
                const g = gameById.get(s.gameCopyId);
                if (!g) return null;
                return (
                  <Link
                    key={s.id}
                    to={`/games/${g.copy.id}`}
                    className="bg-white p-4 rounded-3xl border border-[#EEE2D3] flex gap-4 items-center shadow-sm"
                  >
                    <PhotoImg id={g.copy.photoIds[0]} placeholderIcon="fa-dice" className="w-20 h-20 rounded-2xl flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="text-sm font-bold text-[#4F4839] truncate">{g.copy.name}</h4>
                        <ResultBadge result={s.result} />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">آخرین بار: {relativeDays(s.at)}</p>
                      <div className="flex items-center gap-1 mt-2 text-[10px] text-[#D7A86E]">
                        <Icon name="fa-user-group" className="text-[8px]" />
                        <span>{fa(s.playerIds.length)} نفر</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {ignored && (
          <section className="pb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#4F4839] text-lg">خیلی وقته سراغشون نرفتی...</h3>
            </div>
            <Link
              to={ignored.to}
              className="bg-[#D7A86E]/10 p-5 rounded-[2.5rem] border border-[#D7A86E]/20 flex items-center gap-4"
            >
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-[#D7A86E] text-2xl flex-shrink-0">
                <Icon name="fa-hourglass-half" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#4F4839]">{ignored.title}</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{ignored.text}</p>
              </div>
              <span className="bg-white p-3 rounded-xl text-[#8E3200] shadow-sm">
                <Icon name="fa-chevron-left" />
              </span>
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

function ContinueReading({ book }: { book: BookView }) {
  const navigate = useNavigate();
  const { copy } = book;
  const pct = copy.pageCount ? percent(copy.currentPage ?? 0, copy.pageCount) : undefined;
  return (
    <section className="bg-white p-5 rounded-[2.5rem] border border-[#EEE2D3] shadow-sm flex items-center gap-4">
      <PhotoImg id={copy.photoIds[0]} placeholderIcon="fa-book" className="w-16 h-24 rounded-2xl shadow-sm flex-shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div>
          <h3 className="text-sm font-bold text-[#4F4839] truncate">{bookTitle(book)}</h3>
          <p className="text-[10px] text-gray-500">
            {copy.currentPage ? `ادامه مطالعه از صفحه ${fa(copy.currentPage)}` : 'هنوز صفحه‌ای ثبت نشده'}
          </p>
        </div>
        {pct !== undefined && <ProgressBar value={pct} className="h-1.5 bg-[#EEE2D3]" />}
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-[#8E3200]">{pct !== undefined ? `${fa(pct)}٪ تمام شده` : ''}</span>
          <button
            type="button"
            onClick={() => navigate(`/books/${copy.id}?progress=1`)}
            className="bg-[#FFF9F0] text-[#8E3200] px-4 py-2 rounded-lg text-[11px] font-bold min-h-9"
          >
            بزن بریم
          </button>
        </div>
      </div>
    </section>
  );
}

export function ResultBadge({ result }: { result: string }) {
  const map: Record<string, [string, string]> = {
    win: ['برد', 'bg-green-50 text-green-700'],
    loss: ['باخت', 'bg-red-50 text-red-700'],
    draw: ['مساوی', 'bg-[#D7A86E]/15 text-[#8E3200]'],
    unknown: ['بدون نتیجه', 'bg-gray-100 text-gray-500'],
  };
  const [label, cls] = map[result] ?? map.unknown;
  return <span className={cx('text-[9px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap', cls)}>{label}</span>;
}

/** Pick one owned item that hasn't been touched for a while. */
function longIgnored(books: BookView[], games: GameView[], plays: { id: string; at: number }[]) {
  const now = Date.now();
  const lastPlay = new Map<string, number>();
  for (const p of plays) lastPlay.set(p.id, Math.max(lastPlay.get(p.id) ?? 0, p.at));
  const candidates: { title: string; text: string; to: string; idle: number }[] = [];
  for (const g of games) {
    if (!g.copy.owned) continue;
    const last = lastPlay.get(g.copy.id);
    const idle = now - (last ?? g.copy.createdAt);
    if (idle < (last ? 60 : 30) * DAY) continue;
    candidates.push({
      title: `بردگیم «${g.copy.name}»`,
      text: last
        ? `آخرین بار ${relativeDays(last)} بازی کردی. چطوره امروز یه دست امتحانش کنی؟`
        : 'هنوز جلسه‌ای از این بازی ثبت نکرده‌ای. شاید وقتشه.',
      to: `/games/${g.copy.id}`,
      idle,
    });
  }
  for (const b of books) {
    if (!b.copy.owned || b.copy.status !== 'unread') continue;
    const idle = now - b.copy.createdAt;
    if (idle < 90 * DAY) continue;
    candidates.push({
      title: `کتاب «${bookTitle(b)}»`,
      text: `${relativeDays(b.copy.createdAt)} به مجموعه اضافه شد و هنوز منتظر توست.`,
      to: `/books/${b.copy.id}`,
      idle,
    });
  }
  if (!candidates.length) return undefined;
  // Rotate daily among the idle items instead of always showing the oldest.
  const day = Math.floor(now / DAY);
  candidates.sort((a, b) => b.idle - a.idle);
  return candidates[day % candidates.length];
}

function EmptyHome() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col page-enter">
      <header className="px-6 pt-8 pb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#8E3200]">درنگ</h1>
        <button
          type="button"
          aria-label="تنظیمات"
          onClick={() => navigate('/settings')}
          className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center text-[#D7A86E] shadow-sm"
        >
          <Icon name="fa-gear" />
        </button>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-10 text-center space-y-8 pb-32">
        <div className="relative w-full max-w-[280px]">
          <div className="absolute inset-0 bg-[#D7A86E]/10 blur-[100px] -z-10" />
          <div className="empty-illustration space-y-4">
            <div className="flex justify-center gap-4">
              <div className="w-16 h-24 bg-white border-2 border-dashed border-[#D7A86E]/40 rounded-2xl flex items-center justify-center text-[#D7A86E]/20 rotate-[-10deg]">
                <Icon name="fa-book" className="text-2xl" />
              </div>
              <div className="w-20 h-28 bg-white border-2 border-dashed border-[#D7A86E]/60 rounded-2xl flex items-center justify-center text-[#D7A86E]/40 scale-110 shadow-xl">
                <Icon name="fa-wand-magic-sparkles" className="text-3xl" />
              </div>
              <div className="w-16 h-24 bg-white border-2 border-dashed border-[#D7A86E]/40 rounded-2xl flex items-center justify-center text-[#D7A86E]/20 rotate-[10deg]">
                <Icon name="fa-dice" className="text-2xl" />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-[#4F4839]">کتاب‌خانه تو خالیست!</h2>
          <p className="text-sm leading-relaxed text-gray-500">
            با اضافه کردن اولین کتاب یا بردگیم، «درنگ» از روی مجموعهٔ واقعی خودت برایت پیشنهاد می‌سازد.
          </p>
        </div>
        <div className="w-full space-y-4">
          <button
            type="button"
            onClick={() => navigate('/add?photo=1')}
            className="w-full bg-[#8E3200] text-white py-5 rounded-[2rem] font-bold shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-3 active:scale-95 transition-all"
          >
            <Icon name="fa-camera" />
            <span>ثبت سریع با عکس</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/add')}
            className="w-full bg-white border-2 border-[#EEE2D3] text-[#4F4839] py-5 rounded-[2rem] font-bold flex items-center justify-center gap-3 active:scale-95 transition-all"
          >
            <Icon name="fa-pen-to-square" className="text-[#D7A86E]" />
            <span>وارد کردن دستی اطلاعات</span>
          </button>
          <button type="button" onClick={() => navigate('/settings/backup')} className="text-xs font-bold text-[#8E3200] py-2">
            بازیابی از فایل پشتیبان
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#D7A86E] font-bold tracking-wide pt-4">
          <Icon name="fa-mobile-screen" />
          <span>تمام داده‌های تو به صورت آفلاین در گوشی می‌ماند</span>
        </div>
      </main>
    </div>
  );
}
