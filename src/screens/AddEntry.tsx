import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApiKeyHint } from '../ai/secret';
import { createBook } from '../db/books';
import { createGame } from '../db/games';
import type { Edition, ReadStatus } from '../db/types';
import { deletePhotos } from '../lib/images';
import { parseList, parseNum, parseRange, splitNames, toLatinDigits } from '../lib/text';
import { GAME_TAGS } from '../lib/vocab';
import { AiHelperToggle, SelectField, TagEditor, TextField } from '../ui/fields';
import { BackButton, BottomAction, cx, Icon, PrimaryButton } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { PhotoField } from '../ui/PhotoPicker';

type Kind = 'book' | 'game';
type BookState = ReadStatus | 'wish';

/** AddEntry + AddGame designs: one screen with the type switch at the top. */
export default function AddEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { confirm, toast } = useOverlay();
  const keyHint = useApiKeyHint('anthropic');
  const aiConfigured = !!keyHint;
  const [kind, setKind] = useState<Kind>(params.get('type') === 'game' ? 'game' : 'book');
  const wish = params.get('wish') === '1';
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [ai, setAi] = useState(false);
  const [saving, setSaving] = useState(false);

  // Book fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [status, setStatus] = useState<BookState>(wish ? 'wish' : 'unread');
  const [note, setNote] = useState('');

  // Game fields
  const [name, setName] = useState('');
  const [edition, setEdition] = useState<Edition | ''>('');
  const [allowed, setAllowed] = useState('');
  const [favorite, setFavorite] = useState('');
  const [time, setTime] = useState('');
  const [complexity, setComplexity] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [bgg, setBgg] = useState('');
  const [fromRulebook, setFromRulebook] = useState(false);
  const [gameWish, setGameWish] = useState(wish);

  const dirty =
    photoIds.length > 0 ||
    [title, author, pages, note, name, allowed, favorite, time, complexity, bgg].some((v) => v.trim()) ||
    tags.length > 0;

  const close = async () => {
    if (dirty) {
      const leave = await confirm({
        tone: 'warn',
        title: 'تغییرات ذخیره نشده!',
        message: 'در صورت خروج، تمام اطلاعاتی که وارد کرده‌اید از دست می‌رود.',
        confirm: 'خروج بدون ذخیره',
        cancel: 'ادامه ثبت اطلاعات',
      });
      if (!leave) return;
      await deletePhotos(photoIds);
    }
    navigate(-1);
  };

  const save = async () => {
    if (saving) return;
    const label = kind === 'book' ? title.trim() : name.trim();
    if (!label) {
      toast(kind === 'book' ? 'نام کتاب را وارد کن.' : 'نام بازی را وارد کن.', 'error');
      return;
    }
    setSaving(true);
    try {
      let to: string;
      if (kind === 'book') {
        const copy = await createBook({
          title: label,
          authors: splitNames(author),
          pageCount: parseNum(pages),
          status: status === 'wish' ? 'unread' : status,
          owned: status !== 'wish',
          photoIds,
          note,
        });
        to = ai && aiConfigured ? `/identify/book/${copy.id}` : `/books/${copy.id}`;
      } else {
        const range = parseRange(allowed);
        const t = parseRange(time);
        const { bggId, refUrl } = parseBgg(bgg);
        const copy = await createGame({
          name: label,
          edition: edition || undefined,
          owned: !gameWish,
          photoIds,
          favoritePlayers: parseList(favorite),
          minPlayers: range.min,
          maxPlayers: range.max,
          playTimeMin: t.min,
          playTimeMax: t.max,
          complexity: clampComplexity(parseNum(complexity)),
          tags,
          bggId,
          refUrl,
          specsSource: fromRulebook ? 'rulebook' : 'manual',
        });
        to = ai && aiConfigured ? `/identify/game/${copy.id}` : `/games/${copy.id}`;
      }
      toast('ذخیره شد');
      navigate(to, { replace: true });
    } catch {
      toast('ذخیره نشد. دوباره تلاش کن.', 'error');
      setSaving(false);
    }
  };

  return (
    <div className="pb-32 page-enter">
      <header className="px-6 pt-8 pb-4 flex justify-between items-center sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20">
        <BackButton kind="close" onClick={close} />
        <h1 className="text-lg font-bold text-[#4F4839]">{kind === 'book' ? 'افزودن جدید' : 'افزودن بردگیم'}</h1>
        <button type="button" onClick={save} className="text-[#8E3200] font-bold text-sm px-2 min-h-11">
          ذخیره
        </button>
      </header>

      <main className="px-6 pt-4 space-y-8">
        <div className="flex gap-4 p-1.5 bg-[#EEE2D3]/40 rounded-2xl" role="tablist">
          {(
            [
              ['book', 'fa-book', 'کتاب'],
              ['game', 'fa-dice', 'بردگیم'],
            ] as const
          ).map(([k, icon, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cx(
                'flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2',
                kind === k ? 'type-pill-active' : 'bg-transparent text-[#8E3200]',
              )}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <PhotoField photoIds={photoIds} onChange={setPhotoIds} />

        {kind === 'book' ? (
          <div className="space-y-6">
            <TextField label="عنوان کتاب" value={title} onChange={setTitle} placeholder="نام کتاب را وارد کنید..." />
            <TextField label="نویسنده / پدیدآور" value={author} onChange={setAuthor} placeholder="نام نویسنده... (اختیاری)" hint="چند نام را با «،» جدا کن." />
            <div className="grid grid-cols-2 gap-4">
              <TextField label="تعداد صفحات" value={pages} onChange={setPages} placeholder="مثلاً ۲۰۰" numeric />
              <SelectField<BookState>
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
            </div>
            <TextField label="یادداشت کوتاه" value={note} onChange={setNote} placeholder="اولین برداشت خود را بنویسید... (اختیاری)" multiline />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <TextField label="نام بازی (روی نسخهٔ من)" value={name} onChange={setName} placeholder="مثلاً تیکت تو راید..." />
              <SelectField<Edition | ''>
                label="نوع نسخه (اختیاری)"
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
            </div>
            <div className="space-y-2">
              <p className="field-label">تعداد بازیکنان</p>
              <div className="grid grid-cols-2 gap-4">
                <input aria-label="تعداد بازیکن مجاز" value={allowed} onChange={(e) => setAllowed(e.target.value)} placeholder="مجاز (مثلاً ۲-۵)" inputMode="numeric" className="input-field" />
                <input aria-label="تعداد موردعلاقهٔ من" value={favorite} onChange={(e) => setFavorite(e.target.value)} placeholder="محبوب من (مثلاً ۴)" inputMode="numeric" className="input-field" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="زمان (دقیقه)" value={time} onChange={setTime} placeholder="مثلاً ۳۰-۶۰" numeric />
              <TextField label="پیچیدگی (۱ تا ۵)" value={complexity} onChange={setComplexity} placeholder="مثلاً ۲.۵" numeric />
            </div>
            <TagEditor label="سبک و مکانیزم‌ها" tags={tags} onChange={setTags} suggestions={GAME_TAGS} />
            <TextField label="لینک یا شناسه BGG (اختیاری)" value={bgg} onChange={setBgg} placeholder="https://boardgamegeek.com/..." ltr />
            <label className="flex items-center gap-3 text-xs font-bold text-[#4F4839] px-2 min-h-11">
              <input type="checkbox" checked={fromRulebook} onChange={(e) => setFromRulebook(e.target.checked)} className="w-5 h-5 accent-[#8E3200]" />
              مشخصات را از روی دفترچهٔ بازی وارد کرده‌ام
            </label>
            <label className="flex items-center gap-3 text-xs font-bold text-[#4F4839] px-2 min-h-11">
              <input type="checkbox" checked={gameWish} onChange={(e) => setGameWish(e.target.checked)} className="w-5 h-5 accent-[#8E3200]" />
              هنوز ندارم (فهرست علاقه‌مندی)
            </label>
          </div>
        )}

        <AiHelperToggle on={ai} onChange={setAi} configured={aiConfigured} />
      </main>

      <BottomAction>
        <PrimaryButton icon="fa-check" onClick={save} disabled={saving}>
          {kind === 'book' ? 'ثبت نهایی در مجموعه' : 'ثبت نهایی بازی'}
        </PrimaryButton>
      </BottomAction>
    </div>
  );
}

export function clampComplexity(n: number | undefined) {
  if (n === undefined) return undefined;
  return Math.min(5, Math.max(1, Math.round(n * 10) / 10));
}

/** Accept a BoardGameGeek URL or a bare numeric id. */
export function parseBgg(value: string): { bggId?: string; refUrl?: string } {
  const v = toLatinDigits(value.trim());
  if (!v) return {};
  const id = v.match(/boardgamegeek\.com\/(?:boardgame|boardgameexpansion)\/(\d+)/)?.[1] ?? (/^\d+$/.test(v) ? v : undefined);
  if (/^https?:\/\//.test(v)) return { bggId: id, refUrl: v };
  return id ? { bggId: id, refUrl: `https://boardgamegeek.com/boardgame/${id}` } : { refUrl: v };
}
