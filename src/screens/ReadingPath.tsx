import { Link } from 'react-router-dom';
import { bookTitle, useBooks } from '../db/queries';
import { DAY, formatDayMonth, formatMonthYear } from '../lib/date';
import { fa } from '../lib/text';
import { cx, Icon, Loading, PageHeader, PhotoImg } from '../ui/kit';

/** ReadingPath design: a calm timeline of finished books, grouped by Jalali month. */
export default function ReadingPath() {
  const books = useBooks();
  if (!books) return <Loading />;
  const finished = books
    .filter((b) => b.copy.status === 'read' && b.copy.finishedAt)
    .sort((a, b) => b.copy.finishedAt! - a.copy.finishedAt!);
  const undated = books.filter((b) => b.copy.status === 'read' && !b.copy.finishedAt);

  const groups: { label: string; items: typeof finished }[] = [];
  for (const b of finished) {
    const label = formatMonthYear(b.copy.finishedAt!);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(b);
    else groups.push({ label, items: [b] });
  }

  // Gentle, factual encouragement: no streaks, no targets imposed.
  const recent = finished.filter((b) => b.copy.finishedAt! > Date.now() - 90 * DAY).length;
  const encouragement =
    finished.length === 0
      ? undefined
      : recent > 0
        ? `در سه ماه گذشته ${fa(recent)} کتاب را تمام کرده‌ای. هر صفحه‌ای که خواندی بخشی از همین مسیر است.`
        : `تا امروز ${fa(finished.length)} کتاب در این مسیر ثبت شده. هر وقت آماده بودی، کتاب بعدی منتظر توست.`;

  return (
    <div className="pb-24 page-enter">
      <PageHeader title="مسیر مطالعه من" />
      <main className="px-6 relative">
        {finished.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Icon name="fa-road" className="text-5xl text-[#EEE2D3]" />
            <p className="text-sm text-gray-500 leading-relaxed px-6">وقتی کتابی را تمام کنی، اینجا روی مسیر مطالعه‌ات می‌نشیند.</p>
          </div>
        ) : (
          <>
            <div className="timeline-line" />
            {groups.map((g, gi) => (
              <div key={g.label}>
                <div className="relative py-4 pr-12">
                  <span className={cx('text-[10px] px-3 py-1 rounded-full font-bold', gi === 0 ? 'bg-[#8E3200] text-white' : 'bg-[#EEE2D3] text-[#8E3200]')}>{g.label}</span>
                </div>
                {g.items.map((b, i) => (
                  <div key={b.copy.id} className="relative pr-12 pb-8">
                    <div className="timeline-dot" style={{ top: 24, backgroundColor: gi === 0 && i === 0 ? '#8E3200' : undefined }} />
                    <Link to={`/books/${b.copy.id}`} className="bg-white p-5 rounded-[2rem] border border-[#EEE2D3] shadow-sm flex gap-4">
                      <PhotoImg id={b.copy.photoIds[0]} placeholderIcon="fa-book" className="w-12 h-16 rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-1 min-w-0">
                        <p className="text-[10px] text-[#8E3200] font-bold">تمام شده در {formatDayMonth(b.copy.finishedAt!)}</p>
                        <h3 className="text-xs font-bold text-[#4F4839] truncate">{bookTitle(b)}</h3>
                        {b.copy.rating ? (
                          <div className="flex gap-1 text-[9px]" aria-label={`امتیاز ${fa(b.copy.rating)} از ۵`}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Icon key={s} name="fa-star" className={s <= b.copy.rating! ? 'text-[#D7A86E]' : 'text-gray-300'} />
                            ))}
                          </div>
                        ) : null}
                        {b.copy.reflection?.text && <p className="text-[11px] text-gray-600 line-clamp-2">«{b.copy.reflection.text}»</p>}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            ))}
            {encouragement && (
              <div className="relative pr-12 pb-12 mt-4">
                <div className="bg-[#433520] p-6 rounded-[2.5rem] text-white space-y-3 shadow-xl">
                  <div className="flex items-center gap-2">
                    <Icon name="fa-seedling" className="text-[#D7A86E]" />
                    <h3 className="text-xs font-bold">ادامهٔ مسیر</h3>
                  </div>
                  <p className="text-[11px] leading-relaxed text-white/85">{encouragement}</p>
                </div>
              </div>
            )}
          </>
        )}
        {undated.length > 0 && (
          <p className="text-[11px] text-gray-500 text-center pb-8">
            {fa(undated.length)} کتاب خوانده‌شده تاریخ پایان ندارد؛ از صفحهٔ ویرایش می‌توانی تاریخ را اضافه کنی.
          </p>
        )}
      </main>
    </div>
  );
}
