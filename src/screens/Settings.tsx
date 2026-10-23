import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearApiKey, saveApiKey, useApiKeyHint } from '../ai/secret';
import { getSetting, setSetting, useSetting } from '../db/settings';
import { db } from '../db/db';
import { wipeAllData } from '../lib/backup';
import { deletePhotos } from '../lib/images';
import { enableReminder, disableReminder, reminderSupport } from '../lib/reminder';
import { fa } from '../lib/text';
import { BottomNav } from '../ui/BottomNav';
import { TextField } from '../ui/fields';
import { cx, Icon, Loading, PageHeader, PhotoImg, PrimaryButton, Toggle } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { HiddenInputs, usePhotoImport } from '../ui/PhotoPicker';

export default function Settings() {
  const navigate = useNavigate();
  const profile = useSetting('profile');
  const reminder = useSetting('reminder');
  const ai = useSetting('ai');
  const keyHint = useApiKeyHint('anthropic');
  const { confirm, toast } = useOverlay();
  if (!profile || !reminder || !ai || keyHint === undefined) return <Loading />;

  const toggleReminder = async (on: boolean) => {
    if (!on) {
      await disableReminder();
      return;
    }
    const outcome = await enableReminder(reminder.hour);
    if (outcome !== 'ok') toast(outcome, 'error');
  };

  const wipe = async () => {
    const first = await confirm({
      tone: 'danger',
      title: 'حذف تمام داده‌ها؟',
      message: 'همهٔ کتاب‌ها، بازی‌ها، یادداشت‌ها، جلسه‌ها و عکس‌ها از این گوشی پاک می‌شوند. اگر پشتیبان نگرفته‌ای، اول پشتیبان بگیر.',
      confirm: 'ادامه',
      cancel: 'انصراف',
    });
    if (!first) return;
    const second = await confirm({ tone: 'danger', title: 'مطمئنی؟', message: 'این کار قابل بازگشت نیست.', confirm: 'بله، همه را حذف کن', cancel: 'نه' });
    if (!second) return;
    await wipeAllData();
    toast('همهٔ داده‌ها حذف شد');
    navigate('/', { replace: true });
  };

  return (
    <div className="pb-32 page-enter">
      <header className="px-6 pt-8 pb-6 flex items-center gap-4 sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20">
        <h1 className="text-xl font-bold text-[#4F4839]">تنظیمات</h1>
      </header>
      <main className="px-6">
        <Link to="/settings/profile" className="bg-white p-6 rounded-[2.5rem] border border-[#EEE2D3] flex flex-col items-center text-center mb-8 shadow-sm">
          <div className="relative mb-4">
            <PhotoImg id={profile.photoId} placeholderIcon="fa-user" className="w-24 h-24 rounded-[2rem] border-4 border-[#FFF9F0] shadow-md" />
            <span className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#8E3200] text-white rounded-xl flex items-center justify-center shadow-lg">
              <Icon name="fa-pen" className="text-sm" />
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#4F4839]">{profile.name || 'نام خودت را بنویس'}</h2>
          <p className="text-xs text-[#8E3200] font-medium mt-1">{profile.bio || 'پروفایل فقط روی همین گوشی است.'}</p>
        </Link>

        <div className="space-y-8">
          <Group title="مجموعه">
            <Item icon="fa-chart-simple" label="آمار و گزارش‌ها" to="/stats" />
            <Item icon="fa-road" label="مسیر مطالعه من" to="/reading-path" />
            <Item icon="fa-heart" label="فهرست علاقه‌مندی" to="/wishlist" />
            <Item icon="fa-user-group" label="هم‌بازی‌ها" to="/players" />
          </Group>

          <Group title="تنظیمات اپلیکیشن">
            <div className="settings-item">
              <div className="flex items-center gap-4">
                <IconBox icon="fa-bell" />
                <div>
                  <span className="text-sm font-bold block">یادآور ملایم مطالعه</span>
                  <span className="text-[10px] text-gray-500">{reminderSupport().note}</span>
                </div>
              </div>
              <Toggle on={reminder.enabled} onChange={toggleReminder} label="یادآور مطالعه" />
            </div>
            {reminder.enabled && (
              <div className="settings-item">
                <span className="text-sm font-bold">ساعت تقریبی یادآوری</span>
                <select
                  aria-label="ساعت یادآوری"
                  value={reminder.hour}
                  onChange={(e) => setSetting('reminder', { hour: Number(e.target.value) })}
                  className="bg-[#FFF9F0] border border-[#EEE2D3] rounded-xl px-3 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {fa(h)}:۰۰
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Group>

          <Group title="پشتیبان‌گیری و داده‌ها">
            <Item icon="fa-file-zipper" label="پشتیبان‌گیری و بازیابی" to="/settings/backup" tone="tan" />
            <StorageInfo />
          </Group>

          <Group title="هوش مصنوعی">
            <Link to="/settings/ai" className={cx('settings-item', !keyHint && 'border-dashed border-[#8E3200]/40 bg-[#FFF9F0]')}>
              <div className="flex items-center gap-4">
                <div className={cx('w-10 h-10 rounded-xl flex items-center justify-center', keyHint ? 'bg-[#8E3200]/5 text-[#8E3200]' : 'bg-[#8E3200] text-white shadow-md')}>
                  <Icon name="fa-key" />
                </div>
                <div>
                  <span className="text-sm font-bold block text-[#8E3200]">تنظیم کلید سرویس AI</span>
                  <span className="text-[10px] text-[#8E3200]/80 font-medium">
                    {keyHint ? `وضعیت: تنظیم‌شده (…${keyHint})، ${ai.model}` : 'وضعیت: نیازمند تنظیم'}
                  </span>
                </div>
              </div>
              <Icon name="fa-chevron-left" className="text-[10px] text-[#8E3200]" />
            </Link>
            <div className="settings-item">
              <div className="flex items-center gap-4">
                <IconBox icon="fa-wand-magic-sparkles" dark />
                <div>
                  <span className="text-sm font-bold block">ارسال یادداشت‌ها به همراه مطالعه</span>
                  <span className="text-[10px] text-gray-500">فقط وقتی خودت درخواست بدهی</span>
                </div>
              </div>
              <Toggle on={ai.includeNotes} onChange={(v) => setSetting('ai', { includeNotes: v })} label="ارسال یادداشت‌ها" />
            </div>
          </Group>

          <div className="pt-4">
            <button
              type="button"
              onClick={wipe}
              className="w-full py-4 text-red-600 font-bold text-sm bg-red-50 rounded-2xl border border-red-100 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Icon name="fa-trash-can" />
              <span>حذف تمام داده‌ها</span>
            </button>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-[10px] text-gray-400 font-bold tracking-widest">درنگ نسخه {fa(__APP_VERSION__)} (آفلاین)</p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold text-[#8E3200] uppercase pr-4 mb-3 tracking-widest">{title}</h3>
      {children}
    </div>
  );
}

function IconBox({ icon, dark, tone }: { icon: string; dark?: boolean; tone?: 'tan' }) {
  return (
    <div
      className={cx(
        'w-10 h-10 rounded-xl flex items-center justify-center',
        dark ? 'bg-[#433520]/5 text-[#433520]' : tone === 'tan' ? 'bg-[#D7A86E]/10 text-[#8E3200]' : 'bg-[#8E3200]/5 text-[#8E3200]',
      )}
    >
      <Icon name={icon} />
    </div>
  );
}

function Item({ icon, label, to, tone }: { icon: string; label: string; to: string; tone?: 'tan' }) {
  return (
    <Link to={to} className="settings-item">
      <div className="flex items-center gap-4">
        <IconBox icon={icon} tone={tone} />
        <span className="text-sm font-bold">{label}</span>
      </div>
      <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />
    </Link>
  );
}

function StorageInfo() {
  const [info, setInfo] = useState<{ usage?: number; persisted?: boolean }>();
  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setInfo({ usage: est?.usage, persisted });
    })();
  }, []);
  if (!info) return null;
  return (
    <div className="settings-item">
      <div className="flex items-center gap-4">
        <IconBox icon="fa-database" tone="tan" />
        <div>
          <span className="text-sm font-bold block">فضای استفاده‌شده</span>
          <span className="text-[10px] text-gray-500">
            {info.usage !== undefined ? `${fa((info.usage / 1024 / 1024).toFixed(1))} مگابایت` : 'نامشخص'}،{' '}
            {info.persisted ? 'ذخیره‌سازی ماندگار فعال است' : 'ذخیره‌سازی ماندگار هنوز تأیید نشده؛ پشتیبان بگیر'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProfileSettings() {
  const navigate = useNavigate();
  const profile = useSetting('profile');
  const { toast } = useOverlay();
  const [name, setName] = useState<string>();
  const [bio, setBio] = useState<string>();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { run, busy } = usePhotoImport();
  if (!profile) return <Loading />;
  const save = async () => {
    await setSetting('profile', { name: (name ?? profile.name ?? '').trim() || undefined, bio: (bio ?? profile.bio ?? '').trim() || undefined });
    toast('ذخیره شد');
    navigate(-1);
  };
  const setPhoto = async (files: FileList | null) => {
    const [id] = await run(files);
    if (!id) return;
    const old = (await getSetting('profile')).photoId;
    await setSetting('profile', { photoId: id });
    if (old) await deletePhotos([old]);
  };
  return (
    <div className="pb-12 page-enter">
      <PageHeader title="پروفایل" />
      <main className="px-6 space-y-8 mt-4">
        <HiddenInputs onFiles={setPhoto} cameraRef={cameraRef} galleryRef={galleryRef} />
        <div className="flex flex-col items-center gap-4">
          <PhotoImg id={profile.photoId} placeholderIcon={busy ? 'fa-spinner fa-spin' : 'fa-user'} className="w-28 h-28 rounded-[2rem] border-4 border-white shadow-md" />
          <div className="flex gap-3">
            <button type="button" onClick={() => cameraRef.current?.click()} className="bg-[#8E3200] text-white px-4 py-2 rounded-xl text-xs font-bold min-h-11">
              <Icon name="fa-camera" className="ml-1" /> عکس
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} className="bg-white border border-[#EEE2D3] px-4 py-2 rounded-xl text-xs font-bold min-h-11">
              گالری
            </button>
          </div>
        </div>
        <TextField label="نام" value={name ?? profile.name ?? ''} onChange={setName} placeholder="برای سلام صفحهٔ خانه" />
        <TextField label="یک خط دربارهٔ خودت" value={bio ?? profile.bio ?? ''} onChange={setBio} placeholder="علاقه به کتاب‌های کلاسیک و بردگیم‌های استراتژیک" />
        <p className="text-[11px] text-gray-500 leading-relaxed">پروفایل فقط روی همین گوشی و در فایل پشتیبان نگه‌داری می‌شود. حساب کاربری یا سروری در کار نیست.</p>
        <PrimaryButton icon="fa-check" onClick={save}>
          ذخیره
        </PrimaryButton>
      </main>
    </div>
  );
}

export function AiSettings() {
  const ai = useSetting('ai');
  const keyHint = useApiKeyHint('anthropic');
  const { toast, confirm } = useOverlay();
  const [key, setKey] = useState('');
  const [model, setModel] = useState<string>();
  const [baseUrl, setBaseUrl] = useState<string>();
  if (!ai || keyHint === undefined) return <Loading />;

  const save = async () => {
    const url = (baseUrl ?? ai.baseUrl ?? '').trim();
    if (url) {
      try {
        if (new URL(url).protocol !== 'https:') throw new Error();
      } catch {
        toast('آدرس واسط باید با https:// شروع شود.', 'error');
        return;
      }
    }
    const m = (model ?? ai.model).trim();
    if (!/^[\w.-]{1,80}$/.test(m)) {
      toast('نام مدل معتبر نیست.', 'error');
      return;
    }
    await setSetting('ai', { model: m, baseUrl: url || undefined });
    if (key.trim()) await saveApiKey('anthropic', key);
    setKey('');
    toast('ذخیره شد');
  };

  return (
    <div className="pb-12 page-enter">
      <PageHeader title="سرویس هوش مصنوعی" />
      <main className="px-6 space-y-8 mt-4">
        <div className={cx('state-card', !keyHint && 'border-dashed border-[#8E3200]/40')}>
          <div className="w-16 h-16 bg-[#FFF9F0] rounded-full flex items-center justify-center text-[#8E3200] mx-auto mb-4">
            <Icon name="fa-key" className="text-2xl" />
          </div>
          <h2 className="text-sm font-bold">{keyHint ? `کلید تنظیم شده است (…${keyHint})` : 'نیازمند تنظیم'}</h2>
          <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            ارائه‌دهنده: Anthropic (Claude). کلید رمزنگاری‌شده فقط روی همین گوشی نگه‌داری می‌شود و در فایل پشتیبان قرار نمی‌گیرد. درخواست‌ها مستقیم از گوشی به سرویس می‌روند، فقط وقتی خودت شناسایی یا تحلیلی را شروع کنی.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="api-key" className="field-label block">
            {keyHint ? 'کلید جدید (برای تعویض)' : 'کلید API'}
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            dir="ltr"
            className="input-field text-left"
          />
          <p className="text-[10px] text-gray-500 pr-4 leading-relaxed">
            کلید را از console.anthropic.com بساز. برای امنیت بیشتر یک سقف هزینهٔ ماهانه روی کلید بگذار.
          </p>
        </div>
        <TextField label="مدل" value={model ?? ai.model} onChange={setModel} ltr hint="پیش‌فرض: claude-opus-5-5" />
        <TextField
          label="آدرس واسط (اختیاری)"
          value={baseUrl ?? ai.baseUrl ?? ''}
          onChange={setBaseUrl}
          ltr
          placeholder="https://..."
          hint="فقط اگر از یک گیت‌وی سازگار با API کلود استفاده می‌کنی. خالی = اتصال مستقیم. کلیدت به همین آدرس فرستاده می‌شود؛ فقط آدرس مورد اعتماد وارد کن."
        />
        <PrimaryButton icon="fa-check" onClick={save}>
          ذخیره
        </PrimaryButton>
        {keyHint && (
          <button
            type="button"
            onClick={async () => {
              if (await confirm({ tone: 'danger', title: 'حذف کلید؟', message: 'قابلیت‌های آنلاین تا تنظیم دوباره غیرفعال می‌شوند.', confirm: 'حذف کلید', cancel: 'انصراف' })) {
                await clearApiKey('anthropic');
                toast('کلید حذف شد');
              }
            }}
            className="w-full py-4 text-red-600 font-bold text-sm bg-red-50 rounded-2xl border border-red-100"
          >
            حذف کلید از این گوشی
          </button>
        )}
        <SavedAnswersCount />
      </main>
    </div>
  );
}

function SavedAnswersCount() {
  const [count, setCount] = useState<number>();
  useEffect(() => {
    db.aiResponses.count().then(setCount);
  }, []);
  if (!count) return null;
  return <p className="text-[11px] text-center text-gray-500">{fa(count)} پاسخ هوش مصنوعی روی گوشی ذخیره شده و آفلاین قابل مشاهده است.</p>;
}
