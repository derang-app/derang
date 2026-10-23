import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { authorsOf, bookTitle, useBooks, useGames } from '../db/queries';
import { matchesQuery, normalizeForSearch } from '../lib/text';
import { BackButton, Icon, Loading, PhotoImg } from '../ui/kit';

/** Global search across books, games, notes and quotes (Persian-normalized). */
export default function Search() {
  const navigate = useNavigate();
  const books = useBooks();
  const games = useGames();
  const notes = useLiveQuery(() => db.notes.toArray(), []);
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    if (!books || !games || !notes || !normalizeForSearch(q)) return null;
    return {
      books: books.filter((b) =>
        matchesQuery(q, b.copy.title, b.work?.title, b.work?.authors, b.work?.altTitles, b.copy.translators, b.copy.publisher, b.copy.isbn),
      ),
      games: games.filter((g) => matchesQuery(q, g.copy.name, g.work?.name, g.work?.altNames, g.work?.tags, g.copy.notes)),
      notes: notes.filter((n) => matchesQuery(q, n.text, n.tags, n.chapter)),
    };
  }, [q, books, games, notes]);

  if (!books || !games || !notes) return <Loading />;
  const bookById = new Map(books.map((b) => [b.copy.id, b]));
  const empty = results && !results.books.length && !results.games.length && !results.notes.length;

  return (
    <div className="pb-24 page-enter">
      <header className="px-6 pt-8 pb-4 sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex-1 relative">
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="کتاب، بازی، نویسنده، یادداشت..."
              aria-label="جستجو"
              className="w-full bg-white border border-[#8E3200] rounded-2xl py-3 pr-10 pl-10 text-sm focus:outline-none transition-all shadow-md"
            />
            <Icon name="fa-magnifying-glass" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E3200]" />
            {q && (
              <button type="button" aria-label="پاک کردن" onClick={() => setQ('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-9 h-9">
                <Icon name="fa-circle-xmark" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="px-6 pt-4 space-y-8">
        {!results && <p className="text-xs text-gray-500 text-center pt-10">«ی» و «ي»، «ک» و «ك»، فاصله و نیم‌فاصله فرقی نمی‌کنند.</p>}
        {empty && (
          <div className="pt-10 flex flex-col items-center text-center space-y-6">
            <div className="relative w-40 h-40">
              <div className="absolute inset-0 bg-[#D7A86E]/5 rounded-full blur-2xl" />
              <div className="relative flex items-center justify-center h-full">
                <Icon name="fa-magnifying-glass" className="text-6xl text-[#EEE2D3]" />
                <Icon name="fa-face-frown" className="text-2xl text-[#D7A86E] absolute bottom-6 right-8" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-[#4F4839]">نتیجه‌ای برای «{q}» یافت نشد</h2>
              <p className="text-xs text-gray-500 leading-relaxed px-8">جستجو هیچ کتاب، بردگیم یا یادداشتی را شامل نشد. کلمات دیگری را امتحان کن.</p>
            </div>
            <button type="button" onClick={() => navigate(`/add`)} className="bg-white p-4 rounded-2xl border border-[#EEE2D3] flex items-center justify-between w-full text-sm font-bold">
              <span>افزودن «{q}» به مجموعه</span>
              <Icon name="fa-arrow-left" className="text-[10px] text-gray-400" />
            </button>
          </div>
        )}
        {results && results.books.length > 0 && (
          <Section title="کتاب‌ها">
            {results.books.map((b) => (
              <Link key={b.copy.id} to={`/books/${b.copy.id}`} className="edition-card">
                <PhotoImg id={b.copy.photoIds[0]} placeholderIcon="fa-book" className="w-10 h-14 rounded-lg flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate">{bookTitle(b)}</span>
                  <span className="block text-[11px] text-gray-500 truncate">
                    {[authorsOf(b), b.copy.owned ? '' : 'علاقه‌مندی'].filter(Boolean).join('، ')}
                  </span>
                </span>
              </Link>
            ))}
          </Section>
        )}
        {results && results.games.length > 0 && (
          <Section title="بردگیم‌ها">
            {results.games.map((g) => (
              <Link key={g.copy.id} to={`/games/${g.copy.id}`} className="edition-card">
                <PhotoImg id={g.copy.photoIds[0]} placeholderIcon="fa-dice" className="w-12 h-12 rounded-xl flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate">{g.copy.name}</span>
                  <span className="block text-[11px] text-gray-500 truncate ltr text-right">{g.work?.name}</span>
                </span>
              </Link>
            ))}
          </Section>
        )}
        {results && results.notes.length > 0 && (
          <Section title="یادداشت‌ها و نقل‌قول‌ها">
            {results.notes.map((n) => {
              const b = bookById.get(n.copyId);
              return (
                <Link key={n.id} to={`/books/${n.copyId}`} className="block bg-white p-4 rounded-2xl border border-[#EEE2D3]">
                  <p className="text-[10px] font-bold text-[#8E3200] mb-1">{b ? bookTitle(b) : ''}</p>
                  <p className="text-xs leading-relaxed line-clamp-3">{n.text}</p>
                </Link>
              );
            })}
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-bold text-[#8E3200] uppercase tracking-widest px-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
