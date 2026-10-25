import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { updateCopy, updateWork } from '../db/books';
import { deletePhotos } from '../lib/images';
import { useBook } from '../db/queries';
import type { ReadStatus } from '../db/types';
import { fa, joinNames, parseNum, safeUrl, splitNames } from '../lib/text';
import { JalaliField, SelectField, TextField } from '../ui/fields';
import { BottomAction, Loading, PageHeader, PrimaryButton, Stars, useFlight } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { PhotoField } from '../ui/PhotoPicker';
import { NotFound } from './BookDetails';

type State = ReadStatus | 'wish';

/** Full edit: "my copy" and "original work" fields kept visibly apart. */
export default function EditBook() {
  const flight = useFlight();
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useBook(id);
  const { toast } = useOverlay();
  const [form, setForm] = useState<Record<string, string>>();
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [status, setStatus] = useState<State>('unread');
  const [rating, setRating] = useState<number>();
  const [startedAt, setStartedAt] = useState<number>();
  const [finishedAt, setFinishedAt] = useState<number>();

  useEffect(() => {
    if (!data || form) return;
    const { copy, work } = data;
    setForm({
      title: copy.title,
      translators: joinNames(copy.translators),
      publisher: copy.publisher ?? '',
      language: copy.language ?? '',
      publication: copy.publication ?? '',
      isbn: copy.isbn ?? '',
      pageCount: copy.pageCount ? fa(copy.pageCount) : '',
      workTitle: work?.title ?? '',
      authors: joinNames(work?.authors),
      altTitles: joinNames(work?.altTitles),
      refUrl: work?.refUrl ?? '',
      refId: work?.refId ?? '',
    });
    setPhotoIds(copy.photoIds);
    setStatus(copy.owned ? copy.status : 'wish');
    setRating(copy.rating);
    setStartedAt(copy.startedAt);
    setFinishedAt(copy.finishedAt);
  }, [data, form]);

  if (data === undefined || (data && !form)) return <Loading />;
  if (data === null || !form) return <NotFound />;
  const { copy } = data;
  const set = (k: string) => (v: string) => setForm({ ...form, [k]: v });

  const save = flight.wrap(async () => {
    if (!form.title.trim()) {
      toast('عنوان کتاب خالی است.', 'error');
      return;
    }
    const removed = copy.photoIds.filter((p) => !photoIds.includes(p));
    await updateCopy(copy.id, {
      title: form.title.trim(),
      translators: splitNames(form.translators),
      publisher: form.publisher.trim() || undefined,
      language: form.language.trim() || undefined,
      publication: form.publication.trim() || undefined,
      isbn: form.isbn.trim() || undefined,
      pageCount: parseNum(form.pageCount),
      photoIds,
      owned: status !== 'wish',
      status: status === 'wish' ? copy.status : status,
      rating,
      startedAt,
      finishedAt,
    });
    await updateWork(copy.workId, {
      title: form.workTitle.trim() || undefined,
      authors: splitNames(form.authors),
      altTitles: splitNames(form.altTitles),
      refUrl: safeUrl(form.refUrl),
      refId: form.refId.trim() || undefined,
    });
    await deletePhotos(removed);
    toast('تغییرات ذخیره شد');
    navigate(-1);
  });

  return (
    <div className="pb-32 page-enter">
      <PageHeader title="ویرایش کتاب" back="close" end={<button type="button" onClick={save} disabled={flight.busy} className="text-[#8E3200] font-bold text-sm px-2 min-h-11">ذخیره</button>} />
      <main className="px-6 pt-4 space-y-10">
        <PhotoField photoIds={photoIds} onChange={setPhotoIds} hint="اولین عکس به‌عنوان جلد نمایش داده می‌شود" />

        <section className="space-y-6">
          <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#8E3200] pr-3">اطلاعات نسخهٔ من</h2>
          <TextField label="عنوان روی کتاب" value={form.title} onChange={set('title')} />
          <TextField label="مترجم یا مترجمان" value={form.translators} onChange={set('translators')} hint="چند نام را با «،» جدا کن. کتاب تألیفی فارسی است؟ خالی بگذار." />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="ناشر" value={form.publisher} onChange={set('publisher')} />
            <TextField label="زبان" value={form.language} onChange={set('language')} placeholder="فارسی" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="مشخصات انتشار" value={form.publication} onChange={set('publication')} placeholder="چاپ سوم، ۱۴۰۱" />
            <TextField label="تعداد صفحات" value={form.pageCount} onChange={set('pageCount')} numeric />
          </div>
          <TextField label="شابک (اختیاری)" value={form.isbn} onChange={set('isbn')} ltr placeholder="978-..." />
          <SelectField<State>
            label="وضعیت"
            value={status}
            onChange={setStatus}
            options={[
              ['unread', 'نخوانده'],
              ['reading', 'در حال مطالعه'],
              ['read', 'خوانده شده'],
              ['wish', 'هنوز ندارم (علاقه‌مندی)'],
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <JalaliField label="تاریخ شروع" value={startedAt} onChange={setStartedAt} />
            <JalaliField label="تاریخ پایان" value={finishedAt} onChange={setFinishedAt} />
          </div>
          <div className="space-y-2">
            <p className="field-label">امتیاز شخصی</p>
            <Stars value={rating} onChange={setRating} size="text-2xl" gap="gap-2" />
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#D7A86E] pr-3">اطلاعات اثر اصلی</h2>
          <p className="text-[11px] text-gray-500 -mt-3 leading-relaxed">این بخش بین همهٔ نسخه‌ها و ترجمه‌های متصل به این اثر مشترک است.</p>
          <TextField label="عنوان اصلی" value={form.workTitle} onChange={set('workTitle')} hint="برای ترجمه، عنوان به زبان اصلی؛ برای کتاب تألیفی، همان عنوان روی کتاب (خالی هم بماند همان حساب می‌شود)." />
          <TextField label="نویسنده یا نویسندگان" value={form.authors} onChange={set('authors')} />
          <TextField label="نام‌های جایگزین" value={form.altTitles} onChange={set('altTitles')} placeholder="(اختیاری)" />
          <TextField label="لینک مرجع" value={form.refUrl} onChange={set('refUrl')} ltr placeholder="https://..." />
          <TextField label="شناسهٔ مرجع" value={form.refId} onChange={set('refId')} ltr />
        </section>
      </main>
      <BottomAction>
        <PrimaryButton icon="fa-check" onClick={save} disabled={flight.busy}>
          ذخیرهٔ تغییرات
        </PrimaryButton>
      </BottomAction>
    </div>
  );
}
