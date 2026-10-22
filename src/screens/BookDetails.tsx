import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CompanionSheet, useAiReady } from '../ai/ui';
import { addNote, deleteCopy, deleteNote, finishReading, setProgress, startReading, updateCopy, updateNote } from '../db/books';
import { db } from '../db/db';
import { SOURCE_LABEL } from '../db/provenance';
import { useBook } from '../db/queries';
import { getSetting, setSetting, useSetting } from '../db/settings';
import type { BookCopy, BookWork, MatchStatus, Note, NoteKind, Provenance } from '../db/types';
import { formatJalali, relativeDays } from '../lib/date';
import { fa, parseNum, percent } from '../lib/text';
import { READING_MOODS, STATUS_LABEL } from '../lib/vocab';
import { AiBanner, BackButton, cx, Icon, Loading, PhotoImg, ProgressBar, Stars } from '../ui/kit';
import { Menu, Sheet, useOverlay } from '../ui/overlay';

type Tab = 'notes' | 'work' | 'copy' | 'quotes';

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const data = useBook(id);
  const { confirm, toast } = useOverlay();
  const { configured } = useAiReady();
  const dismissed = useSetting('dismissed');
  const [tab, setTab] = useState<Tab>('notes');
  const [progressOpen, setProgressOpen] = useState(params.get('progress') === '1');
  const [reflectOpen, setReflectOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [noteEdit, setNoteEdit] = useState<{ kind: NoteKind; note?: Note } | null>(null);
  const notes = useLiveQuery(() => (id ? db.notes.where('copyId').equals(id).reverse().sortBy('createdAt') : []), [id]);
  const lastLog = useLiveQuery(async () => (id ? (await db.readingLogs.where('copyId').equals(id).sortBy('at')).pop() : undefined), [id]);

  useEffect(() => {
    if (params.get('progress') === '1') {
      params.delete('progress');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  if (data === undefined || notes === undefined || !dismissed) return <Loading />;
  if (data === null) return <NotFound />;
  const { copy, work, siblings } = data;
  const pct = copy.pageCount ? percent(copy.currentPage ?? 0, copy.pageCount) : undefined;
  const bannerKey = `companion:${copy.id}`;

  const remove = async () => {
    const ok = await confirm({
      tone: 'danger',
      title: 'مطمئنی حذف شود؟',
      message: 'این کتاب با یادداشت‌ها، سابقهٔ مطالعه و عکس‌هایش برای همیشه پاک می‌شود.',
      confirm: 'بله، حذف کن',
      cancel: 'انصراف',
    });
    if (!ok) return;
    await deleteCopy(copy.id);
    toast('حذف شد');
    navigate('/books', { replace: true });
  };

  const shownNotes = notes.filter((n) => n.kind === (tab === 'quotes' ? 'quote' : 'note'));

  return (
    <div className="pb-36 page-enter">
      <header className="fixed top-0 inset-x-app z-30 px-6 py-6 flex justify-between items-center">
        <BackButton kind="chevron" glass />
        <div className="flex gap-3">
          <button
            type="button"
            aria-label={copy.favorite ? 'برداشتن از محبوب‌ها' : 'افزودن به محبوب‌ها'}
            aria-pressed={!!copy.favorite}
            onClick={() => updateCopy(copy.id, { favorite: !copy.favorite })}
            className="w-12 h-12 glass-effect rounded-2xl flex items-center justify-center text-[#8E3200]"
          >
            <Icon name="fa-heart" regular={!copy.favorite} />
          </button>
          <Menu
            items={[
              { label: 'ویرایش اطلاعات', icon: 'fa-pen', onClick: () => navigate(`/books/${copy.id}/edit`) },
              { label: 'شناسایی با هوش مصنوعی', icon: 'fa-wand-magic-sparkles', onClick: () => navigate(`/identify/book/${copy.id}`) },
              { label: 'اثر اصلی و نسخه‌ها', icon: 'fa-book-journal-whills', onClick: () => navigate(`/works/${copy.workId}`) },
              ...(copy.owned && copy.status !== 'read'
                ? [{ label: 'تمام کردم', icon: 'fa-flag-checkered', onClick: () => setReflectOpen(true) }]
                : []),
              { label: 'حذف', icon: 'fa-trash-can', onClick: remove, danger: true },
            ]}
          />
        </div>
      </header>

      <section className="relative pt-24 pb-12 px-6 flex flex-col items-center">
        <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-[#D7A86E]/20 to-transparent -z-10" />
        <PhotoImg
          id={copy.photoIds[0]}
          full
          placeholderIcon="fa-book"
          alt={copy.title}
          className="w-48 aspect-[3/4.5] rounded-[2rem] shadow-2xl mb-8 transform -rotate-2"
        />
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-[#4F4839] leading-snug">{copy.title}</h1>
          {work?.authors.length ? <p className="text-lg text-[#8E3200] font-medium">{work.authors.join('، ')}</p> : null}
          <div className="flex items-center justify-center flex-wrap gap-2 text-sm text-gray-500">
            {work?.title && <span className="ltr">{work.title}</span>}
            {work?.title && copy.translators.length > 0 && <span className="w-1 h-1 bg-gray-300 rounded-full" />}
            {copy.translators.length > 0 && <span>ترجمه {copy.translators.join('، ')}</span>}
          </div>
          {!copy.owned && (
            <span className="inline-flex items-center gap-1 bg-[#8E3200] text-white text-[10px] px-3 py-1 rounded-full font-bold">
              <Icon name="fa-heart" /> در فهرست علاقه‌مندی؛ هنوز ندارم
            </span>
          )}
        </div>
      </section>

      <section className="px-6 grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-4 rounded-3xl border border-[#EEE2D3] text-center">
          <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase tracking-wider">صفحات</p>
          <p className="text-lg font-bold text-[#4F4839]">{copy.pageCount ? fa(copy.pageCount) : '—'}</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-[#EEE2D3] text-center">
          <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase tracking-wider">{copy.status === 'read' ? 'امتیاز من' : 'پیشرفت'}</p>
          <p className="text-lg font-bold text-[#8E3200]">
            {copy.status === 'read' ? (copy.rating ? `${fa(copy.rating)} از ۵` : '—') : pct !== undefined ? `${fa(pct)}٪` : copy.currentPage ? `ص ${fa(copy.currentPage)}` : '—'}
          </p>
        </div>
      </section>

      <section className="px-6 mb-10">
        <StatusCard
          copy={copy}
          pct={pct}
          lastLogAt={lastLog?.at}
          onProgress={() => setProgressOpen(true)}
          onFinish={() => setReflectOpen(true)}
        />
      </section>

      <section className="px-6 mb-6">
        <div className="flex gap-8 border-b border-[#EEE2D3] overflow-x-auto hide-scrollbar whitespace-nowrap" role="tablist">
          {(
            [
              ['notes', 'یادداشت‌ها'],
              ['work', 'اطلاعات اثر اصلی'],
              ['copy', 'اطلاعات نسخه من'],
              ['quotes', 'نقل‌قول‌ها'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx('pb-4 font-bold flex-shrink-0 min-h-11', tab === k ? 'text-[#8E3200] border-b-2 border-[#8E3200]' : 'text-gray-500')}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {(tab === 'notes' || tab === 'quotes') && (
        <section className="px-6 space-y-4">
          <button
            type="button"
            onClick={() => setNoteEdit({ kind: tab === 'quotes' ? 'quote' : 'note' })}
            className="w-full py-4 border-2 border-dashed border-[#D7A86E]/40 rounded-[2rem] text-[#8E3200] font-bold flex items-center justify-center gap-2 active:bg-white transition-all min-h-11"
          >
            <Icon name={tab === 'quotes' ? 'fa-quote-right' : 'fa-pen-nib'} />
            <span>{tab === 'quotes' ? 'افزودن نقل‌قول' : 'افزودن یادداشت جدید'}</span>
          </button>
          {shownNotes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNoteEdit({ kind: n.kind, note: n })}
              className="w-full text-right bg-white p-6 rounded-[2rem] border border-[#EEE2D3] shadow-sm space-y-3"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-[10px] font-bold text-[#8E3200] uppercase">
                  {[n.chapter, n.page ? `صفحه ${fa(n.page)}` : ''].filter(Boolean).join(' • ') || (n.kind === 'quote' ? 'نقل‌قول' : 'یادداشت')}
                </span>
                <span className="text-[10px] text-gray-500 italic">{relativeDays(n.createdAt)}</span>
              </div>
              <p className={cx('text-sm leading-relaxed text-[#4F4839] whitespace-pre-line', n.kind === 'quote' && 'italic border-r-2 border-[#D7A86E] pr-3')}>
                {n.text}
              </p>
              {n.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {n.tags.map((t) => (
                    <span key={t} className="px-3 py-1 bg-[#FFF9F0] text-[#8E3200] text-[10px] rounded-full font-bold">
                      #{t.replace(/\s+/g, '_')}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {shownNotes.length === 0 && (
            <p className="text-center text-xs text-gray-500 py-4">
              {tab === 'quotes' ? 'جمله‌های موردعلاقه‌ات را اینجا نگه دار.' : 'برداشت‌ها و خاطره‌های مطالعه‌ات را اینجا بنویس.'}
            </p>
          )}
        </section>
      )}

      {tab === 'work' && <WorkTab work={work} copy={copy} siblingCount={siblings.length} />}
      {tab === 'copy' && <CopyTab copy={copy} />}

      {!dismissed[bannerKey] && copy.owned && (
        <div className="fixed bottom-6 inset-x-app px-6 z-30 pb-safe">
          <AiBanner
            label="پیشنهاد خلاقانه"
            text={configured ? 'سؤال برای ثبت برداشت، ایدهٔ خلاقانه یا ارتباط با کتاب‌های دیگرت؟' : 'همراه مطالعهٔ هوش مصنوعی؛ نیازمند تنظیم'}
            onClick={() => setCompanionOpen(true)}
            onDismiss={async () => setSetting('dismissed', { ...(await getSetting('dismissed')), [bannerKey]: Date.now() })}
          />
        </div>
      )}

      <ProgressSheet open={progressOpen} onClose={() => setProgressOpen(false)} copy={copy} onFinished={() => setReflectOpen(true)} />
      <ReflectionSheet open={reflectOpen} onClose={() => setReflectOpen(false)} copy={copy} />
      <CompanionSheet open={companionOpen} onClose={() => setCompanionOpen(false)} copyId={copy.id} />
      {noteEdit && <NoteSheet copyId={copy.id} kind={noteEdit.kind} note={noteEdit.note} onClose={() => setNoteEdit(null)} />}
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-10 text-center">
      <Icon name="fa-book" className="text-5xl text-[#EEE2D3]" />
      <p className="text-sm text-gray-500">این مورد پیدا نشد؛ شاید حذف شده باشد.</p>
      <Link to="/" className="bg-[#8E3200] text-white px-6 py-3 rounded-2xl text-sm font-bold">
        بازگشت به خانه
      </Link>
    </div>
  );
}
export { NotFound };

function StatusCard({
  copy,
  pct,
  lastLogAt,
  onProgress,
  onFinish,
}: {
  copy: BookCopy;
  pct?: number;
  lastLogAt?: number;
  onProgress: () => void;
  onFinish: () => void;
}) {
  const { toast } = useOverlay();
  if (!copy.owned) {
    return (
      <div className="bg-[#FFF9F0] border-2 border-dashed border-[#D7A86E]/40 p-6 rounded-[2.5rem] space-y-4 text-center">
        <p className="text-sm text-[#4F4839]">این کتاب را هنوز نداری.</p>
        <button
          type="button"
          onClick={async () => {
            await updateCopy(copy.id, { owned: true });
            toast('به مجموعه اضافه شد');
          }}
          className="bg-[#8E3200] text-white px-6 py-3 rounded-xl text-sm font-bold min-h-11"
        >
          این کتاب را خریدم
        </button>
      </div>
    );
  }
  if (copy.status === 'unread') {
    return (
      <div className="bg-[#8E3200] p-6 rounded-[2.5rem] text-white shadow-xl shadow-[#8E3200]/20 flex justify-between items-center gap-4">
        <div>
          <h3 className="font-bold">{STATUS_LABEL.unread}</h3>
          <p className="text-xs text-white/70 mt-1">هر وقت آماده بودی شروع کن.</p>
        </div>
        <button type="button" onClick={() => startReading(copy.id)} className="bg-white text-[#8E3200] px-5 py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform min-h-11">
          شروع مطالعه
        </button>
      </div>
    );
  }
  if (copy.status === 'read') {
    return (
      <div className="bg-white border border-[#EEE2D3] p-6 rounded-[2.5rem] space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-[#4F4839] flex items-center gap-2">
            <Icon name="fa-flag-checkered" className="text-[#8E3200]" /> خوانده‌شده
          </h3>
          <span className="text-xs text-gray-500">{copy.finishedAt ? formatJalali(copy.finishedAt) : 'تاریخ ثبت نشده'}</span>
        </div>
        <Stars value={copy.rating} onChange={(v) => updateCopy(copy.id, { rating: v })} size="text-xl" gap="gap-1" />
        {copy.reflection?.text && <p className="text-sm leading-relaxed text-[#4F4839] whitespace-pre-line">«{copy.reflection.text}»</p>}
        {copy.reflection?.moods.length ? (
          <div className="flex flex-wrap gap-2">
            {copy.reflection.moods.map((m) => (
              <span key={m} className="px-3 py-1 bg-[#FFF9F0] text-[#8E3200] text-[10px] rounded-full font-bold">
                {m}
              </span>
            ))}
          </div>
        ) : null}
        <button type="button" onClick={() => startReading(copy.id)} className="text-[11px] font-bold text-[#8E3200] min-h-9">
          خواندن دوباره
        </button>
      </div>
    );
  }
  return (
    <div className="bg-[#8E3200] p-6 rounded-[2.5rem] text-white shadow-xl shadow-[#8E3200]/20">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">در حال مطالعه</h3>
        <span className="text-xs text-white/70 italic">{lastLogAt ? `آخرین ثبت: ${relativeDays(lastLogAt)}` : 'هنوز ثبتی نیست'}</span>
      </div>
      {pct !== undefined && (
        <ProgressBar value={pct} className="h-2 bg-white/20 mb-6" fill="bg-[#D7A86E] shadow-[0_0_10px_rgba(215,168,110,0.5)]" />
      )}
      <div className="flex justify-between items-center gap-3">
        <div className="text-sm font-medium">
          {copy.pageCount ? `${fa(copy.currentPage ?? 0)} از ${fa(copy.pageCount)} صفحه` : copy.currentPage ? `صفحه ${fa(copy.currentPage)}` : '—'}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onFinish} className="text-white/80 px-3 py-2 rounded-xl text-xs font-bold min-h-11">
            تمام کردم
          </button>
          <button type="button" onClick={onProgress} className="bg-white text-[#8E3200] px-5 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform min-h-11">
            ثبت پیشرفت
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressSheet({ open, onClose, copy, onFinished }: { open: boolean; onClose: () => void; copy: BookCopy; onFinished: () => void }) {
  const [page, setPage] = useState('');
  const [total, setTotal] = useState('');
  useEffect(() => {
    if (open) {
      setPage(copy.currentPage ? String(copy.currentPage) : '');
      setTotal(copy.pageCount ? String(copy.pageCount) : '');
    }
  }, [open, copy.currentPage, copy.pageCount]);
  const save = async () => {
    const n = parseNum(page);
    const t = parseNum(total);
    if (t && t !== copy.pageCount) await updateCopy(copy.id, { pageCount: Math.round(t) });
    onClose();
    if (n === undefined) return;
    const done = await setProgress(copy.id, Math.round(n));
    if (done) onFinished();
  };
  return (
    <Sheet open={open} onClose={onClose} label="ثبت پیشرفت">
      <h2 className="text-xl font-bold text-center mb-2">ثبت پیشرفت</h2>
      <p className="text-xs text-center text-gray-500 mb-8">به کدام صفحه رسیدی؟</p>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <label className="space-y-2 block">
          <span className="field-label">صفحهٔ فعلی</span>
          <input autoFocus value={page} onChange={(e) => setPage(e.target.value)} inputMode="numeric" className="input-field text-center text-lg font-bold" />
        </label>
        <label className="space-y-2 block">
          <span className="field-label">کل صفحات (اختیاری)</span>
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" className="input-field text-center text-lg" />
        </label>
      </div>
      <button type="button" onClick={save} className="w-full bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 min-h-11">
        ذخیره
      </button>
    </Sheet>
  );
}

/** EndBookReflection design: rating, a short note, moods. Skippable. */
function ReflectionSheet({ open, onClose, copy }: { open: boolean; onClose: () => void; copy: BookCopy }) {
  const [rating, setRating] = useState<number | undefined>(copy.rating);
  const [text, setText] = useState('');
  const [moods, setMoods] = useState<string[]>([]);
  const [companion, setCompanion] = useState(false);
  const { toast } = useOverlay();
  const finish = async (skipped: boolean) => {
    await finishReading(copy.id, {
      rating: skipped ? copy.rating : rating,
      reflection: skipped ? { skipped: true, moods: [] } : { skipped: false, text: text.trim() || undefined, moods },
    });
    onClose();
    toast(skipped ? 'به‌عنوان خوانده‌شده ثبت شد' : 'برداشتت ثبت شد');
  };
  return (
    <Sheet open={open} onClose={onClose} label="پایان مطالعه">
      <div className="flex flex-col items-center text-center space-y-2 mb-10">
        <div className="w-16 h-16 bg-[#8E3200] rounded-3xl flex items-center justify-center text-white text-2xl mb-4 shadow-xl shadow-[#8E3200]/20">
          <Icon name="fa-flag-checkered" />
        </div>
        <h2 className="text-2xl font-bold text-[#4F4839]">تبریک! مطالعه تمام شد.</h2>
        <p className="text-sm text-[#8E3200] font-medium">چند لحظه درنگ کن و احساست را ثبت کن.</p>
      </div>
      <div className="space-y-10">
        <div className="space-y-4 text-center">
          <p className="text-sm font-bold text-[#4F4839]">به این اثر چه امتیازی می‌دهی؟</p>
          <Stars value={rating} onChange={setRating} />
        </div>
        <div className="space-y-4">
          <div className="flex justify-between items-center pr-2">
            <p className="text-sm font-bold text-[#4F4839]">مهم‌ترین درسی که از این کتاب گرفتی چه بود؟</p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="هر چه در ذهنت مانده..."
            className="w-full bg-white border border-[#EEE2D3] rounded-2xl p-4 text-sm focus:outline-none focus:border-[#8E3200] h-32 resize-none"
          />
          <button type="button" onClick={() => setCompanion(true)} className="text-[11px] font-bold text-[#8E3200] flex items-center gap-2 min-h-9 pr-2">
            <Icon name="fa-wand-magic-sparkles" /> چند سؤال کمکی از هوش مصنوعی
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-sm font-bold text-[#4F4839] pr-2">حس کلی بعد از پایان:</p>
          <div className="flex flex-wrap gap-2">
            {READING_MOODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={moods.includes(m)}
                onClick={() => setMoods(moods.includes(m) ? moods.filter((x) => x !== m) : [...moods, m])}
                className={cx(
                  'px-4 py-2 rounded-xl text-xs font-bold min-h-9',
                  moods.includes(m) ? 'bg-[#8E3200] text-white' : 'bg-white border border-[#EEE2D3] text-gray-500',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-4 pt-6">
          <button type="button" onClick={() => finish(true)} className="flex-1 bg-white border border-[#EEE2D3] text-[#8E3200] py-4 rounded-2xl font-bold text-sm active:scale-95 transition-all">
            رد کردن
          </button>
          <button type="button" onClick={() => finish(false)} className="flex-[2] bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 active:scale-95 transition-all">
            ثبت نهایی و آرشیو
          </button>
        </div>
      </div>
      <CompanionSheet open={companion} onClose={() => setCompanion(false)} copyId={copy.id} />
    </Sheet>
  );
}

function NoteSheet({ copyId, kind, note, onClose }: { copyId: string; kind: NoteKind; note?: Note; onClose: () => void }) {
  const [text, setText] = useState(note?.text ?? '');
  const [page, setPage] = useState(note?.page ? String(note.page) : '');
  const [chapter, setChapter] = useState(note?.chapter ?? '');
  const [tags, setTags] = useState(note?.tags.join('، ') ?? '');
  const { confirm } = useOverlay();
  const save = async () => {
    if (!text.trim()) return onClose();
    const values = {
      text: text.trim(),
      page: parseNum(page),
      chapter: chapter.trim() || undefined,
      tags: tags
        .split(/[,،#\n]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (note) await updateNote(note.id, values);
    else await addNote({ copyId, kind, ...values });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} label={kind === 'quote' ? 'نقل‌قول' : 'یادداشت'}>
      <h2 className="text-xl font-bold text-center mb-6">{note ? 'ویرایش' : kind === 'quote' ? 'نقل‌قول تازه' : 'یادداشت تازه'}</h2>
      <div className="space-y-5">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'quote' ? 'جمله را همان‌طور که در کتاب آمده بنویس...' : 'برداشت، تحلیل یا خاطره‌ات...'}
          className="input-field h-40 resize-none pt-4"
        />
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-2 block">
            <span className="field-label">صفحه</span>
            <input value={page} onChange={(e) => setPage(e.target.value)} inputMode="numeric" className="input-field" />
          </label>
          <label className="space-y-2 block">
            <span className="field-label">فصل</span>
            <input value={chapter} onChange={(e) => setChapter(e.target.value)} className="input-field" />
          </label>
        </div>
        {kind === 'note' && (
          <label className="space-y-2 block">
            <span className="field-label">برچسب‌ها (با «،» جدا کن)</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="تحلیل سیاسی، نمادگرایی" className="input-field" />
          </label>
        )}
        <div className="flex gap-3 pt-2">
          {note && (
            <button
              type="button"
              onClick={async () => {
                if (await confirm({ tone: 'danger', title: 'مطمئنی حذف شود؟', message: 'این یادداشت برای همیشه پاک خواهد شد.', confirm: 'بله، حذف کن', cancel: 'انصراف' })) {
                  await deleteNote(note.id);
                  onClose();
                }
              }}
              className="px-5 py-4 rounded-2xl text-red-600 bg-red-50 font-bold text-sm min-h-11"
              aria-label="حذف"
            >
              <Icon name="fa-trash-can" />
            </button>
          )}
          <button type="button" onClick={save} className="flex-1 bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 min-h-11">
            ذخیره
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export const MATCH_LABEL: Record<MatchStatus, { label: string; icon: string; cls: string }> = {
  unidentified: { label: 'شناسایی‌نشده', icon: 'fa-circle-question', cls: 'bg-gray-100 text-gray-600' },
  suggested: { label: 'پیشنهادی (تأییدنشده)', icon: 'fa-wand-magic-sparkles', cls: 'bg-[#D7A86E]/20 text-[#8E3200]' },
  confirmed: { label: 'تأییدشده توسط من', icon: 'fa-circle-check', cls: 'bg-green-50 text-green-700' },
};

export function MatchBadge({ status }: { status: MatchStatus }) {
  const m = MATCH_LABEL[status];
  return (
    <span className={cx('inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-bold', m.cls)}>
      <Icon name={m.icon} /> {m.label}
    </span>
  );
}

export function InfoRow({ label, value, source, ltr }: { label: string; value?: string; source?: Provenance[string]; ltr?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4 py-3 border-b border-[#EEE2D3]/60 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-left">
        <span className={cx('text-sm font-bold text-[#4F4839] block', ltr && 'ltr')}>{value || <span className="text-gray-400 font-normal">نامشخص</span>}</span>
        {value && source && <span className="text-[9px] text-[#8E3200]">{SOURCE_LABEL[source]}</span>}
      </span>
    </div>
  );
}

function WorkTab({ work, copy, siblingCount }: { work?: BookWork; copy: BookCopy; siblingCount: number }) {
  const navigate = useNavigate();
  return (
    <section className="px-6 space-y-4">
      <div className="bg-white p-6 rounded-[2rem] border border-[#EEE2D3]">
        <div className="flex justify-between items-center mb-3">
          <MatchBadge status={copy.matchStatus} />
          <button type="button" onClick={() => navigate(`/works/${copy.workId}`)} className="text-xs font-bold text-[#8E3200] min-h-9">
            {siblingCount > 1 ? `${fa(siblingCount)} نسخه از این اثر` : 'نسخه‌ها و اتصال'}
          </button>
        </div>
        <InfoRow label="عنوان اصلی" value={work?.title} source={work?.provenance.title} ltr />
        <InfoRow label="نویسنده" value={work?.authors.join('، ')} source={work?.provenance.authors} />
        <InfoRow label="نام‌های دیگر" value={work?.altTitles.join('، ')} source={work?.provenance.altTitles} />
        <InfoRow label="شناسه مرجع" value={work?.refId} source={work?.provenance.refId} ltr />
        {work?.refUrl && (
          <a href={work.refUrl} target="_blank" rel="noreferrer noopener" className="flex items-center justify-between py-3 text-sm font-bold text-[#8E3200]">
            <span>مشاهدهٔ منبع مرجع</span>
            <Icon name="fa-arrow-up-right-from-square" className="text-xs" />
          </a>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => navigate(`/books/${copy.id}/edit`)} className="flex-1 bg-white border border-[#EEE2D3] py-3 rounded-2xl text-xs font-bold min-h-11">
          ویرایش دستی
        </button>
        <button type="button" onClick={() => navigate(`/identify/book/${copy.id}`)} className="flex-1 bg-[#433520] text-white py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 min-h-11">
          <Icon name="fa-wand-magic-sparkles" className="text-[#D7A86E]" /> شناسایی با AI
        </button>
      </div>
    </section>
  );
}

function CopyTab({ copy }: { copy: BookCopy }) {
  const navigate = useNavigate();
  const p = copy.provenance;
  return (
    <section className="px-6 space-y-4">
      <div className="bg-white p-6 rounded-[2rem] border border-[#EEE2D3]">
        <InfoRow label="عنوان روی کتاب" value={copy.title} source={p.title} />
        <InfoRow label="مترجم" value={copy.translators.join('، ')} source={p.translators} />
        <InfoRow label="ناشر" value={copy.publisher} source={p.publisher} />
        <InfoRow label="زبان" value={copy.language} source={p.language} />
        <InfoRow label="مشخصات انتشار" value={copy.publication} source={p.publication} />
        <InfoRow label="شابک" value={copy.isbn} source={p.isbn} ltr />
        <InfoRow label="تعداد صفحات" value={copy.pageCount ? fa(copy.pageCount) : undefined} source={p.pageCount} />
        <InfoRow label="شروع مطالعه" value={formatJalali(copy.startedAt)} />
        <InfoRow label="پایان مطالعه" value={formatJalali(copy.finishedAt)} />
      </div>
      {copy.photoIds.length > 1 && (
        <div className="flex gap-3 overflow-x-auto hide-scrollbar">
          {copy.photoIds.map((pid) => (
            <PhotoImg key={pid} id={pid} className="w-24 h-32 rounded-2xl flex-shrink-0" />
          ))}
        </div>
      )}
      <button type="button" onClick={() => navigate(`/books/${copy.id}/edit`)} className="w-full bg-white border border-[#EEE2D3] py-3 rounded-2xl text-xs font-bold min-h-11">
        ویرایش اطلاعات نسخه
      </button>
    </section>
  );
}
