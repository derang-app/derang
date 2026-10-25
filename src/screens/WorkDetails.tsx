import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { detachCopy, linkCopyToWork } from '../db/books';
import { db } from '../db/db';
import { bookTitle, useBooks } from '../db/queries';
import { fa, matchesQuery } from '../lib/text';
import { STATUS_LABEL } from '../lib/vocab';
import { cx, Icon, Loading, PageHeader, PhotoImg } from '../ui/kit';
import { Sheet, useOverlay } from '../ui/overlay';
import { NotFound } from './BookDetails';

/** WorkDetails design: the original work and every copy/translation I have of it. */
export default function WorkDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useOverlay();
  const data = useLiveQuery(async () => {
    if (!id) return null;
    const work = await db.bookWorks.get(id);
    if (!work) return null;
    const copies = await db.bookCopies.where('workId').equals(id).toArray();
    const ids = copies.map((c) => c.id);
    const noteCount = await db.notes.where('copyId').anyOf(ids).count();
    return { work, copies, noteCount };
  }, [id]);
  const books = useBooks();
  const [linkOpen, setLinkOpen] = useState(false);
  const [query, setQuery] = useState('');

  if (data === undefined || !books) return <Loading />;
  if (data === null) return <NotFound />;
  const { work, copies, noteCount } = data;
  const title = work.title || copies[0]?.title || 'اثر بی‌نام';
  const candidates = books.filter((b) => b.copy.workId !== work.id && matchesQuery(query, b.copy.title, b.work?.title, b.work?.authors));

  return (
    <div className="pb-12 page-enter">
      <PageHeader title="اطلاعات اثر اصلی" />
      <main className="px-6 mt-6 space-y-10">
        <section className="text-center space-y-4">
          <div className="w-32 h-44 bg-[#D7A86E]/10 rounded-2xl mx-auto flex items-center justify-center text-[#D7A86E]">
            <Icon name="fa-book-journal-whills" className="text-5xl" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#4F4839]">{copies[0]?.title ?? title}</h2>
            {work.title && work.title !== copies[0]?.title ? (
              <p dir="auto" className="text-sm text-[#8E3200] font-medium">{work.title}</p>
            ) : !work.title && copies.some((c) => c.translators.length) ? (
              <p className="text-xs text-gray-500">عنوان اصلی ثبت نشده</p>
            ) : null}
            {work.authors.length > 0 && <p className="text-xs text-gray-500 mt-1">نویسنده: {work.authors.join('، ')}</p>}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold text-[#8E3200] uppercase tracking-widest px-2">نسخه‌های موجود در مجموعه شما</h3>
          <div className="space-y-3">
            {copies.map((c, i) => (
              <div key={c.id} className={cx('edition-card', i === 0 && 'border-[#8E3200]/40 bg-[#FFF9F0]')}>
                <button type="button" onClick={() => navigate(`/books/${c.id}`)} className="flex items-center gap-4 flex-1 text-right">
                  <PhotoImg id={c.photoIds[0]} placeholderIcon="fa-image" className="w-12 h-16 rounded-lg flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-[#4F4839] truncate">
                      {c.title}
                      {c.translators.length ? `، ترجمه ${c.translators.join('، ')}` : ''}
                    </span>
                    <span className="block text-[10px] text-gray-500">
                      {[c.publisher, c.owned ? STATUS_LABEL[c.status] : 'علاقه‌مندی'].filter(Boolean).join('، ')}
                    </span>
                  </span>
                </button>
                {copies.length > 1 ? (
                  <button
                    type="button"
                    aria-label="جدا کردن این نسخه"
                    onClick={async () => {
                      if (await confirm({ tone: 'info', title: 'جدا کردن نسخه', message: 'این نسخه هویت جداگانه‌ای می‌گیرد. یادداشت‌ها و سابقه‌اش دست نمی‌خورد.', confirm: 'جدا کن', cancel: 'انصراف' })) {
                        await detachCopy(c.id);
                        toast('جدا شد');
                      }
                    }}
                    className="text-gray-400 w-11 h-11"
                  >
                    <Icon name="fa-link-slash" />
                  </button>
                ) : (
                  <Icon name="fa-chevron-left" className="text-[#D7A86E]" />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="w-full py-4 border-2 border-dashed border-[#D7A86E]/40 rounded-3xl text-[#8E3200] text-xs font-bold flex items-center justify-center gap-2 min-h-11"
          >
            <Icon name="fa-link" /> اتصال ترجمه یا نسخهٔ دیگری از همین اثر
          </button>
          <p className="text-[10px] text-gray-500 text-center px-6 leading-relaxed">
            نسخه‌های متصل یک هویت مشترک دارند، اما سابقهٔ مطالعه، امتیاز و یادداشت‌های هر نسخه جدا می‌ماند.
          </p>
        </section>

        <section className="bg-white p-6 rounded-[2.5rem] border border-[#EEE2D3] space-y-6 shadow-sm">
          <h3 className="text-xs font-bold text-[#4F4839] text-center border-b border-gray-100 pb-4">آمار کلی این اثر</h3>
          <div className="grid grid-cols-2 gap-8 text-center">
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">کل یادداشت‌ها</p>
              <p className="text-xl font-bold text-[#8E3200]">{fa(noteCount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">دفعات مطالعهٔ کامل</p>
              <p className="text-xl font-bold text-[#8E3200]">{fa(copies.filter((c) => c.status === 'read').length)}</p>
            </div>
          </div>
        </section>
      </main>

      <Sheet open={linkOpen} onClose={() => setLinkOpen(false)} label="اتصال نسخه">
        <h2 className="text-lg font-bold text-center mb-2">کدام کتاب نسخهٔ دیگری از «{title}» است؟</h2>
        <p className="text-[11px] text-gray-500 text-center mb-6">کتاب انتخابی به همین اثر وصل می‌شود.</p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو..." className="input-field mb-4" aria-label="جستجو" />
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {candidates.map((b) => (
            <button
              key={b.copy.id}
              type="button"
              onClick={async () => {
                await linkCopyToWork(b.copy.id, work.id);
                setLinkOpen(false);
                toast('متصل شد');
              }}
              className="edition-card"
            >
              <PhotoImg id={b.copy.photoIds[0]} className="w-10 h-14 rounded-lg flex-shrink-0" placeholderIcon="fa-book" />
              <span className="flex-1 text-right">
                <span className="block text-xs font-bold">{bookTitle(b)}</span>
                <span className="block text-[10px] text-gray-500">{b.work?.authors.join('، ')}</span>
              </span>
              <Icon name="fa-link" className="text-[#8E3200]" />
            </button>
          ))}
          {candidates.length === 0 && <p className="text-center text-xs text-gray-500 py-6">کتاب دیگری پیدا نشد.</p>}
        </div>
      </Sheet>
    </div>
  );
}
