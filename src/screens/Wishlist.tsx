import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { wishlistSuggest } from '../ai/tasks';
import { AiAnswer, AiStateCard, AiThinking, useAiReady, useAiTask } from '../ai/ui';
import { db } from '../db/db';
import { authorsOf, bookTitle, useBooks, useGames } from '../db/queries';
import type { AiResponse } from '../db/types';
import { AiBanner, ChipButton, Icon, Loading, PageHeader, PhotoImg } from '../ui/kit';
import { Sheet } from '../ui/overlay';

type Filter = 'all' | 'books' | 'games';

/** Wishlist design: things I don't own yet, clearly apart from the collection. */
export default function Wishlist() {
  const books = useBooks();
  const games = useGames();
  const [filter, setFilter] = useState<Filter>('all');
  const [aiOpen, setAiOpen] = useState(false);
  const { configured, online } = useAiReady();
  const task = useAiTask<AiResponse>();
  const saved = useLiveQuery(async () => (await db.aiResponses.where('kind').equals('wishlist_suggest').sortBy('createdAt')).reverse(), []);
  if (!books || !games || !saved) return <Loading />;
  const wishBooks = books.filter((b) => !b.copy.owned);
  const wishGames = games.filter((g) => !g.copy.owned);

  return (
    <div className="pb-40 page-enter">
      <header className="px-6 pt-8 pb-6 sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20">
        <PageHeader title="لیست آرزوها" className="!p-0 !static !bg-transparent mb-6" />
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
          <ChipButton active={filter === 'all'} onClick={() => setFilter('all')}>
            همه
          </ChipButton>
          <ChipButton active={filter === 'books'} onClick={() => setFilter('books')}>
            کتاب‌ها
          </ChipButton>
          <ChipButton active={filter === 'games'} onClick={() => setFilter('games')}>
            بردگیم‌ها
          </ChipButton>
        </div>
      </header>
      <main className="px-6 grid grid-cols-2 gap-4">
        {filter !== 'games' &&
          wishBooks.map((b) => (
            <Link key={b.copy.id} to={`/books/${b.copy.id}`} className="wish-card shadow-sm">
              <div className="relative aspect-[3/4]">
                <PhotoImg id={b.copy.photoIds[0]} placeholderIcon="fa-book" className="w-full h-full" />
                <span className="absolute top-3 left-3 bg-[#8E3200] text-white w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-lg">
                  <Icon name="fa-heart" />
                </span>
              </div>
              <div className="p-4 space-y-1">
                <h3 className="text-xs font-bold text-[#4F4839] truncate">{bookTitle(b)}</h3>
                <p className="text-[10px] text-gray-500 truncate">{authorsOf(b) || ' '}</p>
                <span className="text-[9px] text-[#8E3200] font-bold block pt-1">کتاب</span>
              </div>
            </Link>
          ))}
        {filter !== 'books' &&
          wishGames.map((g) => (
            <Link key={g.copy.id} to={`/games/${g.copy.id}`} className="wish-card shadow-sm">
              <div className="relative aspect-[3/4]">
                <PhotoImg id={g.copy.photoIds[0]} placeholderIcon="fa-dice" className="w-full h-full" />
                <span className="absolute top-3 left-3 bg-[#8E3200] text-white w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-lg">
                  <Icon name="fa-heart" />
                </span>
              </div>
              <div className="p-4 space-y-1">
                <h3 className="text-xs font-bold text-[#4F4839] truncate">{g.copy.name}</h3>
                <p className="text-[10px] text-gray-500 truncate">{g.work?.tags.slice(0, 2).join('، ') || ' '}</p>
                <span className="text-[9px] text-[#8E3200] font-bold block pt-1">بردگیم</span>
              </div>
            </Link>
          ))}
        <Link
          to={`/add?type=${filter === 'games' ? 'game' : 'book'}&wish=1`}
          className="border-2 border-dashed border-[#D7A86E]/30 rounded-[2rem] flex flex-col items-center justify-center p-6 text-center space-y-2 aspect-[3/5]"
        >
          <span className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-[#D7A86E] shadow-sm">
            <Icon name="fa-plus" />
          </span>
          <p className="text-[11px] font-bold text-[#4F4839]">افزودن آرزوی جدید</p>
          <p className="text-[9px] text-gray-500 italic">موردی که هنوز نداری</p>
        </Link>
      </main>

      <div className="fixed bottom-6 inset-x-app px-6 z-30 pb-safe">
        <AiBanner
          label="پیشنهاد هوشمند"
          text={configured ? 'بر اساس کتاب‌هایی که خوانده‌ای و امتیازهایت، چه کتابی به این فهرست بیاید؟' : 'پیشنهاد هوش مصنوعی؛ نیازمند تنظیم'}
          onClick={() => setAiOpen(true)}
        />
      </div>

      <Sheet open={aiOpen} onClose={() => setAiOpen(false)} label="پیشنهاد هوشمند">
        <h2 className="text-lg font-bold text-center mb-2">پیشنهاد برای فهرست علاقه‌مندی</h2>
        <p className="text-[11px] text-gray-500 text-center mb-6 leading-relaxed">فهرست کتاب‌های خوانده‌شده، امتیازها و برداشت‌هایت فقط با زدن دکمه فرستاده می‌شود.</p>
        <div className="space-y-4">
          {!configured ? (
            <AiStateCard code="needs_setup" />
          ) : task.running ? (
            <AiThinking label="در حال فکر کردن..." onCancel={task.cancel} />
          ) : (
            <>
              {task.error && <AiStateCard code={task.error} />}
              <button
                type="button"
                disabled={!online}
                onClick={() => task.run((s) => wishlistSuggest(s))}
                className="w-full bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm disabled:opacity-50 min-h-11"
              >
                {online ? 'پیشنهاد بده' : 'اینترنت لازم است'}
              </button>
            </>
          )}
          {saved.map((r) => (
            <AiAnswer key={r.id} response={r} onDelete={() => db.aiResponses.delete(r.id)} />
          ))}
        </div>
      </Sheet>
    </div>
  );
}
