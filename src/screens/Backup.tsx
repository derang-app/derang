import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { BackupError, backupFileName, createBackup, parseBackup, restoreBackup, BACKUP_EXT, type ParsedBackup } from '../lib/backup';
import { formatJalali } from '../lib/date';
import { fa } from '../lib/text';
import { Icon, PageHeader, Spinner } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { setSetting } from '../db/settings';

function size(bytes: number) {
  return bytes > 1024 * 1024 ? `${fa((bytes / 1024 / 1024).toFixed(1))} مگابایت` : `${fa(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

/** Save or share the backup file; sharing lets Android send it to Drive, Telegram, etc. */
async function deliver(blob: Blob, name: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], name, { type: 'application/zip' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export default function Backup() {
  const navigate = useNavigate();
  const { toast, confirm } = useOverlay();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'read' | 'restore'>();
  const [file, setFile] = useState<File>();
  const [parsed, setParsed] = useState<ParsedBackup>();
  const [error, setError] = useState<string>();
  const [safety, setSafety] = useState(true);
  const lastBackup = useLiveQuery(async () => ((await db.kv.get('lastBackupAt'))?.value as number | undefined) ?? null, []);
  const counts = useLiveQuery(async () => ({ books: await db.bookCopies.count(), games: await db.gameCopies.count(), photos: await db.photos.count() }), []);

  const exportNow = async () => {
    setBusy('export');
    try {
      const blob = await createBackup(__APP_VERSION__);
      const how = await deliver(blob, backupFileName());
      await db.kv.put({ key: 'lastBackupAt', value: Date.now() });
      toast(how === 'shared' ? 'فایل پشتیبان فرستاده شد' : 'فایل پشتیبان دانلود شد');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('ساخت پشتیبان انجام نشد.', 'error');
    } finally {
      setBusy(undefined);
    }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setParsed(undefined);
    setError(undefined);
    setBusy('read');
    try {
      setParsed(await parseBackup(f));
    } catch (e) {
      setError(e instanceof BackupError ? e.message : 'فایل قابل خواندن نیست.');
    } finally {
      setBusy(undefined);
    }
  };

  const restore = async () => {
    if (!parsed) return;
    const ok = await confirm({
      tone: 'danger',
      icon: 'fa-triangle-exclamation',
      title: 'جایگزینی همهٔ داده‌ها؟',
      message: 'تمام اطلاعات فعلی این گوشی حذف و با محتوای فایل جایگزین می‌شود.',
      confirm: 'تأیید و بازیابی',
      cancel: 'انصراف',
    });
    if (!ok) return;
    setBusy('restore');
    try {
      if (safety && (counts?.books || counts?.games)) {
        await deliver(await createBackup(__APP_VERSION__), backupFileName().replace(BACKUP_EXT, `_before-restore${BACKUP_EXT}`));
      }
      await restoreBackup(parsed);
      await setSetting('dismissed', {});
      toast('بازیابی کامل شد');
      navigate('/', { replace: true });
    } catch (e) {
      toast((e as Error).name === 'AbortError' ? 'بازیابی لغو شد؛ داده‌ها دست نخورد.' : 'بازیابی انجام نشد؛ داده‌های فعلی دست نخورده‌اند.', 'error');
    } finally {
      setBusy(undefined);
    }
  };

  const c = parsed?.manifest.counts ?? {};
  return (
    <div className="pb-12 page-enter">
      <PageHeader title="بازیابی و پشتیبان" align="start" />
      <main className="px-6 space-y-10">
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-[#8E3200] uppercase pr-2">گرفتن پشتیبان</h2>
          <div className="backup-card shadow-sm space-y-4">
            <p className="text-[12px] leading-relaxed text-[#4F4839]">
              همهٔ کتاب‌ها، بازی‌ها، یادداشت‌ها، جلسه‌ها، عکس‌ها و پاسخ‌های ذخیره‌شدهٔ هوش مصنوعی در یک فایل {BACKUP_EXT} ذخیره می‌شوند. کلید سرویس هوش مصنوعی در فایل نیست.
            </p>
            {counts && (
              <p className="text-[11px] text-gray-500">
                {fa(counts.books)} کتاب • {fa(counts.games)} بازی • {fa(counts.photos)} عکس
                {lastBackup ? ` • آخرین پشتیبان: ${formatJalali(lastBackup)}` : ' • هنوز پشتیبان نگرفته‌ای'}
              </p>
            )}
            <button
              type="button"
              onClick={exportNow}
              disabled={!!busy}
              className="w-full bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-2 disabled:opacity-60 min-h-11"
            >
              {busy === 'export' ? <Spinner /> : <Icon name="fa-cloud-arrow-up" />}
              <span>ساخت و ذخیرهٔ فایل پشتیبان</span>
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-[#8E3200] uppercase pr-2">انتخاب فایل پشتیبان</h2>
          <input ref={inputRef} type="file" accept={`${BACKUP_EXT},.zip,application/zip,application/octet-stream`} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-[#D7A86E]/40 rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center space-y-4 bg-white active:bg-[#FFF9F0] transition-colors"
          >
            <div className="w-16 h-16 bg-[#FFF9F0] rounded-full flex items-center justify-center text-[#D7A86E] text-2xl shadow-inner">
              {busy === 'read' ? <Spinner /> : <Icon name="fa-file-import" />}
            </div>
            <div>
              <p className="text-sm font-bold text-[#4F4839]">فایل {BACKUP_EXT} را انتخاب کنید</p>
              <p className="text-[10px] text-gray-500 mt-1 italic">قبل از هر تغییری، فایل بررسی و محتوایش نمایش داده می‌شود</p>
            </div>
          </button>
        </section>

        {error && (
          <section className="bg-red-50 border border-red-100 p-6 rounded-[2rem] space-y-2">
            <div className="flex items-center gap-3 text-red-700">
              <Icon name="fa-circle-xmark" />
              <h3 className="text-sm font-bold">فایل معتبر نیست</h3>
            </div>
            <p className="text-[12px] leading-relaxed text-red-800/80">{error}</p>
          </section>
        )}

        {parsed && file && (
          <>
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-[#8E3200] uppercase tracking-widest px-2">جزئیات فایل شناسایی شده</h3>
              <div className="backup-card shadow-md border-[#8E3200]/20">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-[#8E3200] text-white rounded-2xl flex items-center justify-center text-xl shadow-lg flex-shrink-0">
                    <Icon name="fa-file-zipper" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#4F4839] truncate ltr text-right">{file.name}</p>
                    <p className="text-[10px] text-[#8E3200] font-medium">
                      ساخته‌شده {formatJalali(parsed.manifest.createdAt)} • نسخهٔ قالب {fa(parsed.manifest.version)} • {size(parsed.sizeBytes)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 py-3 border-t border-gray-100 text-center">
                  <div>
                    <p className="text-[10px] text-gray-500">کتاب‌ها</p>
                    <p className="text-sm font-bold text-[#4F4839]">{fa(c.bookCopies ?? 0)}</p>
                  </div>
                  <div className="border-r border-gray-100">
                    <p className="text-[10px] text-gray-500">بردگیم‌ها</p>
                    <p className="text-sm font-bold text-[#4F4839]">{fa(c.gameCopies ?? 0)}</p>
                  </div>
                  <div className="border-r border-gray-100">
                    <p className="text-[10px] text-gray-500">عکس‌ها</p>
                    <p className="text-sm font-bold text-[#4F4839]">{fa(parsed.photos.length)}</p>
                  </div>
                </div>
                <div className="mt-2 bg-green-50 text-green-700 p-2 rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold">
                  <Icon name="fa-circle-check" />
                  <span>فایل معتبر است و آماده بازیابی می‌باشد</span>
                </div>
              </div>
            </section>

            <section className="bg-red-50 border border-red-100 p-6 rounded-[2rem] space-y-3">
              <div className="flex items-center gap-3 text-red-700">
                <Icon name="fa-triangle-exclamation" />
                <h3 className="text-sm font-bold">هشدار جایگزینی داده‌ها</h3>
              </div>
              <p className="text-[12px] leading-relaxed text-red-800/80">
                با تأیید نهایی، اطلاعات فعلی این گوشی ({fa(counts?.books ?? 0)} کتاب، {fa(counts?.games ?? 0)} بازی) حذف شده و با محتوای این فایل پشتیبان جایگزین می‌شود.
              </p>
              <label className="flex items-center gap-3 text-xs font-bold text-red-900/80 min-h-11">
                <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} className="w-5 h-5 accent-[#8E3200]" />
                قبل از بازیابی، از داده‌های فعلی یک پشتیبان بگیر
              </label>
            </section>

            <button
              type="button"
              onClick={restore}
              disabled={!!busy}
              className="w-full bg-[#8E3200] text-white py-5 rounded-[2.5rem] font-bold shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {busy === 'restore' ? <Spinner /> : <Icon name="fa-cloud-arrow-down" />}
              <span>تأیید و بازیابی نهایی</span>
            </button>
          </>
        )}
      </main>
    </div>
  );
}
