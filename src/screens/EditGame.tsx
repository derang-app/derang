import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { linkGameCopyToWork, updateGameCopy, updateGameWork } from '../db/games';
import { useGame, useGames } from '../db/queries';
import type { Edition, Interaction, Source } from '../db/types';
import { deletePhotos } from '../lib/images';
import { fa, formatRange, joinNames, matchesQuery, parseList, parseNum, parseRange, splitNames } from '../lib/text';
import { GAME_TAGS } from '../lib/vocab';
import { SelectField, TagEditor, TextField } from '../ui/fields';
import { BottomAction, Icon, Loading, PageHeader, PhotoImg, PrimaryButton, Stars } from '../ui/kit';
import { Sheet, useOverlay } from '../ui/overlay';
import { PhotoField } from '../ui/PhotoPicker';
import { clampComplexity, parseBgg } from './AddEntry';
import { NotFound } from './BookDetails';

export default function EditGame() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useGame(id);
  const games = useGames();
  const { toast, confirm } = useOverlay();
  const [form, setForm] = useState<Record<string, string>>();
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [edition, setEdition] = useState<Edition | ''>('');
  const [interaction, setInteraction] = useState<Interaction | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [rating, setRating] = useState<number>();
  const [owned, setOwned] = useState(true);
  const [specsSource, setSpecsSource] = useState<Source>('manual');
  const [linkOpen, setLinkOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!data || form) return;
    const { copy, work } = data;
    setForm({
      name: copy.name,
      favorite: copy.favoritePlayers.map(fa).join('، '),
      notes: copy.notes ?? '',
      workName: work?.name ?? '',
      altNames: joinNames(work?.altNames),
      allowed: formatRange(work?.minPlayers, work?.maxPlayers),
      recommended: work?.recommendedPlayers.map(fa).join('، ') ?? '',
      time: formatRange(work?.playTimeMin, work?.playTimeMax),
      complexity: work?.complexity ? fa(work.complexity) : '',
      bgg: work?.refUrl ?? work?.bggId ?? '',
    });
    setPhotoIds(copy.photoIds);
    setEdition(copy.edition ?? '');
    setInteraction(work?.interaction ?? '');
    setTags(work?.tags ?? []);
    setRating(copy.rating);
    setOwned(copy.owned);
    setSpecsSource(work?.provenance.minPlayers === 'rulebook' ? 'rulebook' : 'manual');
  }, [data, form]);

  if (data === undefined || !games || (data && !form)) return <Loading />;
  if (data === null || !form) return <NotFound />;
  const { copy, work } = data;
  const set = (k: string) => (v: string) => setForm({ ...form, [k]: v });
  const others = games.filter((g) => g.copy.workId !== copy.workId && matchesQuery(query, g.copy.name, g.work?.name, g.work?.altNames));

  const save = async () => {
    if (!form.name.trim()) {
      toast('نام بازی خالی است.', 'error');
      return;
    }
    const removed = copy.photoIds.filter((p) => !photoIds.includes(p));
    await updateGameCopy(copy.id, {
      name: form.name.trim(),
      photoIds,
      edition: edition || undefined,
      favoritePlayers: parseList(form.favorite),
      rating,
      notes: form.notes.trim() || undefined,
      owned,
    });
    const range = parseRange(form.allowed);
    const time = parseRange(form.time);
    const { bggId, refUrl } = parseBgg(form.bgg);
    // Specs and links are recorded with the origin the user chose; names are manual.
    await updateGameWork(
      copy.workId,
      {
        minPlayers: range.min,
        maxPlayers: range.max,
        recommendedPlayers: parseList(form.recommended),
        playTimeMin: time.min,
        playTimeMax: time.max,
        complexity: clampComplexity(parseNum(form.complexity)),
        interaction: interaction || undefined,
        tags,
      },
      specsSource,
    );
    await updateGameWork(copy.workId, { name: form.workName.trim() || undefined, altNames: splitNames(form.altNames), bggId, refUrl });
    await deletePhotos(removed);
    toast('تغییرات ذخیره شد');
    navigate(-1);
  };

  return (
    <div className="pb-32 page-enter">
      <PageHeader title="ویرایش بازی" back="close" end={<button type="button" onClick={save} className="text-[#8E3200] font-bold text-sm px-2 min-h-11">ذخیره</button>} />
      <main className="px-6 pt-4 space-y-10">
        <PhotoField photoIds={photoIds} onChange={setPhotoIds} hint="عکس جعبه، دفترچه یا قطعات نسخهٔ خودت" />

        <section className="space-y-6">
          <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#8E3200] pr-3">نسخهٔ من</h2>
          <TextField label="نام روی نسخهٔ من" value={form.name} onChange={set('name')} />
          <SelectField<Edition | ''>
            label="نوع نسخه"
            value={edition}
            onChange={setEdition}
            options={[
              ['', 'انتخاب نشده'],
              ['copy', 'کپی'],
              ['redesign', 'ریدیزاین'],
              ['original', 'اورجینال'],
              ['unknown', 'نامشخص'],
            ]}
          />
          <TextField label="تعداد موردعلاقهٔ من" value={form.favorite} onChange={set('favorite')} placeholder="مثلاً ۳، ۴" numeric hint="بر اساس تجربهٔ خودت؛ جدا از تعداد مجاز." />
          <div className="space-y-2">
            <p className="field-label">امتیاز شخصی</p>
            <Stars value={rating} onChange={setRating} size="text-2xl" gap="gap-2" />
          </div>
          <TextField label="یادداشت" value={form.notes} onChange={set('notes')} multiline />
          <label className="flex items-center gap-3 text-xs font-bold text-[#4F4839] px-2 min-h-11">
            <input type="checkbox" checked={!owned} onChange={(e) => setOwned(!e.target.checked)} className="w-5 h-5 accent-[#8E3200]" />
            هنوز ندارم (فهرست علاقه‌مندی)
          </label>
        </section>

        <section className="space-y-6">
          <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#D7A86E] pr-3">بازی اصلی</h2>
          <p className="text-[11px] text-gray-500 -mt-3 leading-relaxed">مشترک بین همهٔ نسخه‌های این بازی. ریدیزاین‌ها همان قوانین بازی اصلی را دارند.</p>
          <TextField label="نام اصلی بازی" value={form.workName} onChange={set('workName')} ltr placeholder="Ticket to Ride: Europe" />
          <TextField label="نام‌های جایگزین" value={form.altNames} onChange={set('altNames')} />
          <TextField label="لینک یا شناسه BGG" value={form.bgg} onChange={set('bgg')} ltr placeholder="https://boardgamegeek.com/boardgame/..." />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="بازیکن مجاز" value={form.allowed} onChange={set('allowed')} placeholder="۲-۵" numeric />
            <TextField label="پیشنهادی منبع" value={form.recommended} onChange={set('recommended')} placeholder="۴" numeric />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="زمان (دقیقه)" value={form.time} onChange={set('time')} placeholder="۳۰-۶۰" numeric />
            <TextField label="پیچیدگی (۱ تا ۵)" value={form.complexity} onChange={set('complexity')} placeholder="۲.۵" numeric hint="۱ بسیار ساده … ۵ خیلی پیچیده" />
          </div>
          <SelectField<Interaction | ''>
            label="میزان تعامل بازیکنان"
            value={interaction}
            onChange={setInteraction}
            options={[
              ['', 'ثبت نشده'],
              ['low', 'کم'],
              ['medium', 'متوسط'],
              ['high', 'زیاد'],
            ]}
          />
          <TagEditor label="سبک و ویژگی‌ها" tags={tags} onChange={setTags} suggestions={GAME_TAGS} />
          <SelectField<Source>
            label="منشأ مشخصات بالا"
            value={specsSource}
            onChange={setSpecsSource}
            options={[
              ['manual', 'ورود دستی'],
              ['rulebook', 'ورود دستی از روی دفترچه'],
              ['online', 'از منبع آنلاین'],
            ]}
          />
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="w-full py-4 border-2 border-dashed border-[#D7A86E]/40 rounded-3xl text-[#8E3200] text-xs font-bold flex items-center justify-center gap-2 min-h-11"
          >
            <Icon name="fa-link" /> این نسخه، نسخهٔ دیگری از یک بازی موجود است
          </button>
          {work && data.siblings.length > 1 && <p className="text-[10px] text-gray-500 text-center">{fa(data.siblings.length)} نسخه به این بازی اصلی متصل‌اند.</p>}
        </section>
      </main>
      <BottomAction>
        <PrimaryButton icon="fa-check" onClick={save}>
          ذخیرهٔ تغییرات
        </PrimaryButton>
      </BottomAction>

      <Sheet open={linkOpen} onClose={() => setLinkOpen(false)} label="اتصال به بازی اصلی">
        <h2 className="text-lg font-bold text-center mb-2">به کدام بازی اصلی وصل شود؟</h2>
        <p className="text-[11px] text-gray-500 text-center mb-6 leading-relaxed">مشخصات بازی اصلی انتخابی برای این نسخه هم استفاده می‌شود. نام، عکس و جلسه‌های نسخهٔ خودت دست نمی‌خورد.</p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو..." className="input-field mb-4" aria-label="جستجو" />
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {others.map((g) => (
            <button
              key={g.copy.id}
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  tone: 'info',
                  title: 'اتصال به بازی اصلی',
                  message: 'مشخصات فعلی بازی اصلیِ این نسخه کنار گذاشته می‌شود و مشخصات بازی انتخابی جای آن را می‌گیرد.',
                  confirm: 'وصل کن',
                  cancel: 'انصراف',
                });
                if (!ok) return;
                await linkGameCopyToWork(copy.id, g.copy.workId);
                setLinkOpen(false);
                toast('متصل شد');
                navigate(-1);
              }}
              className="edition-card"
            >
              <PhotoImg id={g.copy.photoIds[0]} className="w-12 h-12 rounded-xl flex-shrink-0" placeholderIcon="fa-dice" />
              <span className="flex-1 text-right">
                <span className="block text-xs font-bold">{g.copy.name}</span>
                <span className="block text-[10px] text-gray-500 ltr text-right">{g.work?.name}</span>
              </span>
              <Icon name="fa-link" className="text-[#8E3200]" />
            </button>
          ))}
          {others.length === 0 && <p className="text-center text-xs text-gray-500 py-6">بازی دیگری پیدا نشد.</p>}
        </div>
      </Sheet>
    </div>
  );
}
