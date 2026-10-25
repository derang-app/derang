import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApiKeyHint } from '../ai/secret';
import { createBook } from '../db/books';
import { saveErrorText, saveWithTimeout } from '../db/db';
import { createGame } from '../db/games';
import type { Edition, ReadStatus } from '../db/types';
import { deletePhotos, importPhoto } from '../lib/images';
import { useOnline } from '../lib/online';
import { takeSharedImage } from '../lib/share';
import { fa, joinNames, parseList, parseNum, parseRange, safeUrl, splitNames, toLatinDigits } from '../lib/text';
import { COVER_ERROR_TEXT, CoverError, downloadImage, parseTaaghcheLink, taaghcheCoverUrl } from '../online/covers';
import { fetchTaaghcheBook, taaghcheBookUrl, taaghchePublication } from '../online/taaghche';
import { GAME_TAGS } from '../lib/vocab';
import { AiHelperToggle, SelectField, TagEditor, TextField } from '../ui/fields';
import { BackButton, BottomAction, cx, Icon, PrimaryButton, Spinner } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { PhotoField } from '../ui/PhotoPicker';

type Kind = 'book' | 'game';
type BookState = ReadStatus | 'wish';
/** Book fields that can be filled from a Taaghche link. */
type BookFields = { title: string; author: string; translator: string; publisher: string; publication: string; pages: string };

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
  // An image shared along with the text (see lib/share). With a Taaghche link the publisher's
  // cover comes from Taaghche instead, so the image is only kept when there's no link.
  useEffect(() => {
    if (params.get('image') !== '1') return;
    const t = setTimeout(async () => {
      const blob = await takeSharedImage();
      if (!blob || parseTaaghcheLink(params.get('share') ?? '')) return;
      try {
        const id = await importPhoto(blob);
        setPhotoIds((ids) => [...ids, id]);
      } catch {
        toast('عکس به‌اشتراک‌گذاشته قابل خواندن نبود.', 'error');
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [ai, setAi] = useState(false);
  const [saving, setSaving] = useState(false);

  // Book fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [status, setStatus] = useState<BookState>(wish ? 'wish' : 'unread');
  const [note, setNote] = useState('');
  const [translator, setTranslator] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publication, setPublication] = useState('');
  /** What Taaghche filled in, to tell its values apart from the user's own at save time. */
  const [taaghche, setTaaghche] = useState<{ id: string; fields: Partial<BookFields> }>();

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
    [title, author, pages, note, translator, publisher, publication, name, allowed, favorite, time, complexity, bgg].some((v) => v.trim()) ||
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
        const current: BookFields = { title, author, translator, publisher, publication, pages };
        const fromTaaghche = (k: keyof BookFields) => !!taaghche?.fields[k] && taaghche.fields[k] === current[k];
        const copy = await saveWithTimeout(() => createBook({
          title: label,
          authors: splitNames(author),
          translators: splitNames(translator),
          publisher: publisher.trim(),
          publication: publication.trim(),
          pageCount: parseNum(pages),
          status: status === 'wish' ? 'unread' : status,
          owned: status !== 'wish',
          photoIds,
          note,
          refUrl: taaghche ? taaghcheBookUrl(taaghche.id) : undefined,
          online: [
            ...(taaghche ? ['refUrl'] : []),
            ...(['title', 'publisher', 'publication'] as const).filter(fromTaaghche),
            ...(fromTaaghche('author') ? ['authors'] : []),
            ...(fromTaaghche('translator') ? ['translators'] : []),
            ...(fromTaaghche('pages') ? ['pageCount'] : []),
          ],
        }));
        to = ai && aiConfigured ? `/identify/book/${copy.id}` : `/books/${copy.id}`;
      } else {
        const range = parseRange(allowed);
        const t = parseRange(time);
        const { bggId, refUrl } = parseBgg(bgg);
        const copy = await saveWithTimeout(() => createGame({
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
        }));
        to = ai && aiConfigured ? `/identify/game/${copy.id}` : `/games/${copy.id}`;
      }
      toast('ذخیره شد');
      navigate(to, { replace: true });
    } catch (e) {
      toast(saveErrorText(e), 'error');
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

        {kind === 'book' && (
          <TaaghcheImport
            shared={params.get('share') ?? undefined}
            done={taaghche?.fields.title}
            onImport={async (id, signal) => {
              // Cover and details are independent: either one is worth keeping on its own.
              const [cover, details] = await Promise.allSettled([downloadImage(taaghcheCoverUrl(id), signal).then(importPhoto), fetchTaaghcheBook(id, signal)]);
              if (signal.aborted) {
                if (cover.status === 'fulfilled') await deletePhotos([cover.value]);
                return;
              }
              if (cover.status === 'fulfilled') setPhotoIds((ids) => [cover.value, ...ids]);
              if (details.status === 'rejected') {
                if (cover.status === 'rejected') throw details.reason;
                toast('جلد اضافه شد، ولی مشخصات کتاب از طاقچه نیامد.', 'error');
                return;
              }
              const b = details.value;
              const fields: Partial<BookFields> = {
                title: b.title,
                author: joinNames(b.authors),
                translator: joinNames(b.translators),
                publisher: b.publisher ?? '',
                publication: taaghchePublication(b),
                pages: b.pages ? fa(b.pages) : '',
              };
              // Fill only what's still empty; anything the user already typed wins.
              const fill = (v: string, set: (s: string) => void, next?: string) => !v.trim() && next && set(next);
              fill(title, setTitle, fields.title);
              fill(author, setAuthor, fields.author);
              fill(translator, setTranslator, fields.translator);
              fill(publisher, setPublisher, fields.publisher);
              fill(publication, setPublication, fields.publication);
              fill(pages, setPages, fields.pages);
              setTaaghche({ id, fields });
              toast(cover.status === 'fulfilled' ? 'جلد و مشخصات از طاقچه آمد' : 'مشخصات آمد، ولی جلد دریافت نشد.', cover.status === 'fulfilled' ? undefined : 'error');
            }}
          />
        )}

        <PhotoField photoIds={photoIds} onChange={setPhotoIds} />

        {kind === 'book' ? (
          <div className="space-y-6">
            <TextField label="عنوان کتاب" value={title} onChange={setTitle} placeholder="نام کتاب را وارد کنید..." />
            <TextField label="نویسنده / پدیدآور" value={author} onChange={setAuthor} placeholder="نام نویسنده... (اختیاری)" hint="چند نام را با «،» جدا کن." />
            <TextField label="مترجم" value={translator} onChange={setTranslator} placeholder="(اختیاری)" hint="کتاب تألیفی فارسی است؟ خالی بگذار." />
            {(taaghche || publisher || publication) && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <TextField label="ناشر" value={publisher} onChange={setPublisher} placeholder="(اختیاری)" />
                  <TextField label="مشخصات انتشار" value={publication} onChange={setPublication} placeholder="(اختیاری)" />
                </div>
              </>
            )}
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

/** Same card as «جلد از طاقچه» in the cover studio, but it also fills in the book's details. */
function TaaghcheImport({
  shared,
  done,
  onImport,
}: {
  /** Text shared to Derang from another app (see lib/share). */
  shared?: string;
  done?: string;
  onImport: (id: string, signal: AbortSignal) => Promise<void>;
}) {
  const { toast } = useOverlay();
  const online = useOnline();
  const [link, setLink] = useState(shared ?? '');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController>(undefined);
  useEffect(() => () => abort.current?.abort(), []);
  const id = parseTaaghcheLink(link);

  const run = async (bookId: string) => {
    if (busy) return;
    setBusy(true);
    abort.current = new AbortController();
    try {
      await onImport(bookId, abort.current.signal);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      toast(e instanceof CoverError ? COVER_ERROR_TEXT[e.code] : 'دریافت از طاقچه ممکن نشد.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Shared from Taaghche: fetch right away. A timer, so StrictMode's double mount only runs it once.
  useEffect(() => {
    if (!shared) return;
    const found = parseTaaghcheLink(shared);
    const t = setTimeout(() => (found ? run(found) : toast('در متن به‌اشتراک‌گذاشته لینک کتاب طاقچه پیدا نشد', 'error')), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
      const found = parseTaaghcheLink(text);
      if (found) run(found);
      else toast('در متن کپی‌شده لینک کتاب طاقچه پیدا نشد', 'error');
    } catch {
      toast('دسترسی به متن کپی‌شده داده نشد؛ لینک را در کادر بچسبان', 'error');
    }
  };

  return (
    <form
      // The Taaghche app shares a sentence around the link, which a type="url" check would reject.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (id) run(id);
      }}
      className="backup-card shadow-sm space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#FFF9F0] text-[#D7A86E] flex items-center justify-center flex-shrink-0">
          <Icon name={done ? 'fa-circle-check' : 'fa-link'} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#4F4839]">از لینک طاقچه</p>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed truncate">
            {done ? `«${done}» دریافت شد؛ هر چیزی را می‌توانی پایین‌تر عوض کنی.` : 'جلد، نویسنده، مترجم، ناشر و تعداد صفحه خودکار پر می‌شود.'}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="taaghche-link" className="sr-only">
          لینک کتاب در طاقچه
        </label>
        <input
          id="taaghche-link"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://taaghche.com/book/…"
          dir="ltr"
          className="input-field text-left"
        />
        {link.trim() && !id && <p className="text-[10px] text-[#8E3200] pr-4 leading-relaxed">این لینک کتاب طاقچه نیست؛ باید شبیه taaghche.com/book/… باشد.</p>}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={paste}
          disabled={!online || busy}
          className="flex-1 bg-white border border-[#EEE2D3] text-[#4F4839] py-3 rounded-2xl font-bold text-xs shadow-sm min-h-11 disabled:opacity-60"
        >
          چسباندن لینک
        </button>
        <button
          type="submit"
          disabled={!online || !id || busy}
          className="flex-[2] bg-[#8E3200] text-white py-3 rounded-2xl font-bold text-xs shadow-lg shadow-[#8E3200]/20 flex items-center justify-center gap-2 min-h-11 disabled:opacity-60"
        >
          {busy ? <Spinner /> : <Icon name="fa-cloud-arrow-down" />}
          <span>دریافت از طاقچه</span>
        </button>
      </div>
      {!online && <p className="text-[11px] text-[#8E3200] text-center">{COVER_ERROR_TEXT.offline}</p>}
    </form>
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
  if (/^https?:\/\//i.test(v)) return { bggId: id, refUrl: safeUrl(v) };
  return id ? { bggId: id, refUrl: `https://boardgamegeek.com/boardgame/${id}` } : {};
}
