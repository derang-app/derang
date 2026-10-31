import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApiKeyHint } from '../ai/secret';
import { createBook } from '../db/books';
import { saveErrorText, saveWithTimeout } from '../db/db';
import { createGame } from '../db/games';
import type { Edition, Interaction, ReadStatus } from '../db/types';
import { deletePhotos, importPhoto } from '../lib/images';
import { useOnline } from '../lib/online';
import { takeSharedImage } from '../lib/share';
import { fa, formatRange, joinNames, parseList, parseNum, parseRange, safeUrl, splitNames, toLatinDigits } from '../lib/text';
import { COVER_ERROR_TEXT, CoverError, downloadImage, parseTaaghcheLink, taaghcheCoverUrl } from '../online/covers';
import { fetchTaaghcheBook, taaghcheBookUrl, taaghchePublication } from '../online/taaghche';
import { BGG_ERROR_TEXT, BGG_SECRET, BggError, fetchBggGame } from '../online/bgg';
import { GAME_TAGS } from '../lib/vocab';
import { AiHelperToggle, JalaliField, PlayerCountPicker, SelectField, TagEditor, TextField } from '../ui/fields';
import { BackButton, BottomAction, cx, Icon, PrimaryButton, Spinner, Stars } from '../ui/kit';
import { useOverlay } from '../ui/overlay';
import { PhotoField } from '../ui/PhotoPicker';

type Kind = 'book' | 'game';
type BookState = ReadStatus | 'wish';
/** Book fields that can be filled from a Taaghche link. */
type BookFields = { title: string; author: string; translator: string; publisher: string; publication: string; pages: string; refUrl: string };
/** Game fields that can be filled from a BoardGameGeek link. */
type GameFields = { name: string; workName: string; allowed: string; recommended: string; time: string; complexity: string; brand: string; bgg: string };

/** AddEntry + AddGame designs: one screen with the type switch at the top. */
export default function AddEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { confirm, toast } = useOverlay();
  const keyHint = useApiKeyHint('anthropic');
  const bggHint = useApiKeyHint(BGG_SECRET);
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
  const [language, setLanguage] = useState('');
  const [isbn, setIsbn] = useState('');
  const [startedAt, setStartedAt] = useState<number>();
  const [finishedAt, setFinishedAt] = useState<number>();
  const [rating, setRating] = useState<number>();
  const [workTitle, setWorkTitle] = useState('');
  const [altTitles, setAltTitles] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [refId, setRefId] = useState('');
  /** What Taaghche filled in, to tell its values apart from the user's own at save time. */
  const [taaghche, setTaaghche] = useState<{ id: string; fields: Partial<BookFields> }>();

  // Game fields
  const [name, setName] = useState('');
  const [edition, setEdition] = useState<Edition | ''>('');
  const [allowed, setAllowed] = useState('');
  const [brand, setBrand] = useState('');
  const [favorite, setFavorite] = useState<number[]>([]);
  const [time, setTime] = useState('');
  const [complexity, setComplexity] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [bgg, setBgg] = useState('');
  const [workName, setWorkName] = useState('');
  const [altNames, setAltNames] = useState('');
  const [recommended, setRecommended] = useState('');
  const [interaction, setInteraction] = useState<Interaction | ''>('');
  const [gameRating, setGameRating] = useState<number>();
  const [gameNotes, setGameNotes] = useState('');
  const [fromRulebook, setFromRulebook] = useState(false);
  const [gameWish, setGameWish] = useState(wish);
  /** What BGG filled in, to tell its values apart from the user's own at save time. */
  const [bggImport, setBggImport] = useState<{ fields: Partial<GameFields>; tags: string[] }>();
  // An original copy carries the original game's name, so it doubles as the work name
  // instead of asking for it twice. The field comes back if a different name was typed.
  const sameName = edition === 'original' && (!workName.trim() || workName.trim() === name.trim());

  const dirty =
    photoIds.length > 0 ||
    [
      title, author, pages, note, translator, publisher, publication, language, isbn, workTitle, altTitles, refUrl, refId,
      name, brand, allowed, time, complexity, bgg, workName, altNames, recommended, gameNotes,
    ].some((v) => v.trim()) ||
    [startedAt, finishedAt, rating, gameRating].some((v) => v !== undefined) ||
    favorite.length > 0 ||
    !!interaction ||
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
        const current: BookFields = { title, author, translator, publisher, publication, pages, refUrl };
        const fromTaaghche = (k: keyof BookFields) => !!taaghche?.fields[k] && taaghche.fields[k] === current[k];
        const copy = await saveWithTimeout(() => createBook({
          title: label,
          authors: splitNames(author),
          translators: splitNames(translator),
          publisher: publisher.trim(),
          publication: publication.trim(),
          language: language.trim(),
          isbn: isbn.trim(),
          pageCount: parseNum(pages),
          startedAt,
          finishedAt,
          rating,
          workTitle,
          altTitles: splitNames(altTitles),
          refUrl: safeUrl(refUrl),
          refId: refId.trim(),
          status: status === 'wish' ? 'unread' : status,
          owned: status !== 'wish',
          photoIds,
          note,
          online: [
            ...(['title', 'publisher', 'publication', 'refUrl'] as const).filter(fromTaaghche),
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
        const current: GameFields = { name, workName, allowed, recommended, time, complexity, brand, bgg };
        const fromBgg = (k: keyof GameFields) => !!bggImport?.fields[k] && bggImport.fields[k] === current[k];
        const copy = await saveWithTimeout(() => createGame({
          name: label,
          edition: edition || undefined,
          brand,
          owned: !gameWish,
          photoIds,
          favoritePlayers: favorite,
          rating: gameRating,
          notes: gameNotes,
          workName: sameName ? label : workName,
          altNames: splitNames(altNames),
          recommendedPlayers: parseList(recommended),
          minPlayers: range.min,
          maxPlayers: range.max,
          playTimeMin: t.min,
          playTimeMax: t.max,
          complexity: clampComplexity(parseNum(complexity)),
          interaction: interaction || undefined,
          tags,
          bggId,
          refUrl,
          specsSource: fromRulebook ? 'rulebook' : 'manual',
          online: [
            ...(fromBgg('allowed') ? ['minPlayers', 'maxPlayers'] : []),
            ...(fromBgg('recommended') ? ['recommendedPlayers'] : []),
            ...(fromBgg('time') ? ['playTimeMin', 'playTimeMax'] : []),
            ...(fromBgg('complexity') ? ['complexity'] : []),
            ...(fromBgg('brand') ? ['brand'] : []),
            ...(fromBgg('workName') && !sameName ? ['name'] : []),
            ...(bggImport?.tags.length && bggImport.tags.every((t) => tags.includes(t)) ? ['tags'] : []),
          ],
          confirmed: fromBgg('bgg'),
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
          <LinkImport
            source={TAAGHCHE_SOURCE}
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
                refUrl: taaghcheBookUrl(id),
              };
              // Fill only what's still empty; anything the user already typed wins.
              const fill = (v: string, set: (s: string) => void, next?: string) => !v.trim() && next && set(next);
              fill(title, setTitle, fields.title);
              fill(author, setAuthor, fields.author);
              fill(translator, setTranslator, fields.translator);
              fill(publisher, setPublisher, fields.publisher);
              fill(publication, setPublication, fields.publication);
              fill(pages, setPages, fields.pages);
              fill(refUrl, setRefUrl, fields.refUrl);
              setTaaghche({ id, fields });
              toast(cover.status === 'fulfilled' ? 'جلد و مشخصات از طاقچه آمد' : 'مشخصات آمد، ولی جلد دریافت نشد.', cover.status === 'fulfilled' ? undefined : 'error');
            }}
          />
        )}

        {kind === 'game' &&
          (bggHint ? (
            <LinkImport
              source={BGG_SOURCE}
              done={bggImport?.fields.workName}
              onImport={async (id, signal) => {
                const g = await fetchBggGame(id, signal);
                // The box art is a nice-to-have: the details are worth keeping without it.
                let photo: string | undefined;
                if (g.image) {
                  try {
                    photo = await importPhoto(await downloadImage(g.image, signal));
                  } catch (e) {
                    if ((e as Error).name === 'AbortError') throw e;
                  }
                }
                if (signal.aborted) {
                  if (photo) await deletePhotos([photo]);
                  return;
                }
                if (photo) setPhotoIds((ids) => [photo, ...ids]);
                const fields: Partial<GameFields> = {
                  name: g.name,
                  workName: g.name,
                  allowed: formatRange(g.minPlayers, g.maxPlayers),
                  recommended: g.bestPlayers.map((n) => fa(n)).join('، '),
                  time: formatRange(g.playTimeMin, g.playTimeMax),
                  complexity: g.weight !== undefined ? fa(g.weight) : '',
                  // The original publisher; for a local copy or redesign the user replaces it with what's on the box.
                  brand: g.publishers[0] ?? '',
                  bgg: g.url,
                };
                // Fill only what's still empty; anything the user already typed wins.
                const fill = (v: string, set: (s: string) => void, next?: string) => !v.trim() && next && set(next);
                fill(name, setName, fields.name);
                fill(workName, setWorkName, fields.workName);
                fill(allowed, setAllowed, fields.allowed);
                fill(recommended, setRecommended, fields.recommended);
                fill(time, setTime, fields.time);
                fill(complexity, setComplexity, fields.complexity);
                fill(brand, setBrand, fields.brand);
                fill(bgg, setBgg, fields.bgg);
                setTags((t) => [...new Set([...t, ...g.tags])]);
                setBggImport({ fields, tags: g.tags });
                toast(photo || !g.image ? 'مشخصات از BGG آمد' : 'مشخصات آمد، ولی عکس جعبه دریافت نشد.', photo || !g.image ? undefined : 'error');
              }}
            />
          ) : (
            bggHint === null && (
              <button type="button" onClick={() => navigate('/settings/bgg')} className="backup-card shadow-sm w-full flex items-center gap-3 text-right">
                <div className="w-10 h-10 rounded-full bg-[#FFF9F0] text-[#D7A86E] flex items-center justify-center flex-shrink-0">
                  <Icon name="fa-link" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#4F4839]">از لینک BoardGameGeek</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">برای پر شدن خودکار مشخصات و عکس جعبه، اول توکن BGG را در تنظیمات وارد کن.</p>
                </div>
                <Icon name="fa-chevron-left" className="text-[#D7A86E] mr-auto" />
              </button>
            )
          ))}

        <PhotoField photoIds={photoIds} onChange={setPhotoIds} />

        {kind === 'book' ? (
          <div className="space-y-10">
            <section className="space-y-6">
              <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#8E3200] pr-3">اطلاعات نسخهٔ من</h2>
              <TextField label="عنوان روی کتاب" value={title} onChange={setTitle} placeholder="نام کتاب را وارد کنید..." />
              <TextField label="مترجم یا مترجمان" value={translator} onChange={setTranslator} placeholder="(اختیاری)" hint="چند نام را با «،» جدا کن. کتاب تألیفی فارسی است؟ خالی بگذار." />
              <div className="grid grid-cols-2 gap-4">
                <TextField label="ناشر" value={publisher} onChange={setPublisher} placeholder="(اختیاری)" />
                <TextField label="زبان" value={language} onChange={setLanguage} placeholder="فارسی" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="مشخصات انتشار" value={publication} onChange={setPublication} placeholder="چاپ سوم، ۱۴۰۱" />
                <TextField label="تعداد صفحات" value={pages} onChange={setPages} placeholder="مثلاً ۲۰۰" numeric />
              </div>
              <TextField label="شابک (اختیاری)" value={isbn} onChange={setIsbn} ltr placeholder="978-..." />
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
              <div className="grid grid-cols-2 gap-4">
                <JalaliField label="تاریخ شروع" value={startedAt} onChange={setStartedAt} />
                <JalaliField label="تاریخ پایان" value={finishedAt} onChange={setFinishedAt} />
              </div>
              <div className="space-y-2">
                <p className="field-label">امتیاز شخصی</p>
                <Stars value={rating} onChange={setRating} size="text-2xl" gap="gap-2" />
              </div>
              <TextField label="یادداشت کوتاه" value={note} onChange={setNote} placeholder="اولین برداشت خود را بنویسید... (اختیاری)" multiline />
            </section>

            <section className="space-y-6">
              <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#D7A86E] pr-3">اطلاعات اثر اصلی</h2>
              <TextField label="نویسنده یا نویسندگان" value={author} onChange={setAuthor} placeholder="(اختیاری)" hint="چند نام را با «،» جدا کن." />
              <TextField label="عنوان اصلی" value={workTitle} onChange={setWorkTitle} placeholder="(اختیاری)" hint="برای ترجمه، عنوان به زبان اصلی؛ برای کتاب تألیفی، خالی بماند همان عنوان روی کتاب حساب می‌شود." />
              <TextField label="نام‌های جایگزین" value={altTitles} onChange={setAltTitles} placeholder="(اختیاری)" />
              <TextField label="لینک مرجع" value={refUrl} onChange={setRefUrl} ltr placeholder="https://..." />
              <TextField label="شناسهٔ مرجع" value={refId} onChange={setRefId} ltr />
            </section>
          </div>
        ) : (
          <div className="space-y-10">
            <section className="space-y-6">
              <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#8E3200] pr-3">نسخهٔ من</h2>
              <TextField
                label="نام بازی (روی نسخهٔ من)"
                value={name}
                onChange={setName}
                placeholder="مثلاً تیکت تو راید..."
                hint={sameName ? 'نسخهٔ اورجینال است؛ همین نام، نام اصلی بازی هم ثبت می‌شود.' : undefined}
              />
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
              <TextField label="برند / ناشر" value={brand} onChange={setBrand} placeholder="(اختیاری) نامی که روی جعبه آمده" />
              <PlayerCountPicker value={favorite} onChange={setFavorite} range={parseRange(allowed)} />
              <div className="space-y-2">
                <p className="field-label">امتیاز شخصی</p>
                <Stars value={gameRating} onChange={setGameRating} size="text-2xl" gap="gap-2" />
              </div>
              <TextField label="یادداشت" value={gameNotes} onChange={setGameNotes} placeholder="(اختیاری)" multiline />
              <label className="flex items-center gap-3 text-xs font-bold text-[#4F4839] px-2 min-h-11">
                <input type="checkbox" checked={gameWish} onChange={(e) => setGameWish(e.target.checked)} className="w-5 h-5 accent-[#8E3200]" />
                هنوز ندارم (فهرست علاقه‌مندی)
              </label>
            </section>

            <section className="space-y-6">
              <h2 className="text-sm font-bold text-[#4F4839] border-r-4 border-[#D7A86E] pr-3">بازی اصلی</h2>
              {!sameName && <TextField label="نام اصلی بازی" value={workName} onChange={setWorkName} ltr placeholder="Ticket to Ride: Europe" />}
              <TextField label="نام‌های جایگزین" value={altNames} onChange={setAltNames} placeholder="(اختیاری)" />
              <TextField label="لینک یا شناسه BGG (اختیاری)" value={bgg} onChange={setBgg} placeholder="https://boardgamegeek.com/..." ltr />
              <div className="grid grid-cols-2 gap-4">
                <TextField label="بازیکن مجاز" value={allowed} onChange={setAllowed} placeholder="مثلاً ۲-۵" numeric />
                <TextField label="پیشنهادی منبع" value={recommended} onChange={setRecommended} placeholder="مثلاً ۴" numeric />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="زمان (دقیقه)" value={time} onChange={setTime} placeholder="مثلاً ۳۰-۶۰" numeric />
                <TextField label="پیچیدگی (۱ تا ۵)" value={complexity} onChange={setComplexity} placeholder="مثلاً ۲.۵" numeric hint="۱ بسیار ساده … ۵ خیلی پیچیده" />
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
              <TagEditor label="سبک و مکانیزم‌ها" tags={tags} onChange={setTags} suggestions={GAME_TAGS} />
              <label className="flex items-center gap-3 text-xs font-bold text-[#4F4839] px-2 min-h-11">
                <input type="checkbox" checked={fromRulebook} onChange={(e) => setFromRulebook(e.target.checked)} className="w-5 h-5 accent-[#8E3200]" />
                مشخصات را از روی دفترچهٔ بازی وارد کرده‌ام
              </label>
            </section>
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

/** What a link card imports from: Taaghche for books, BoardGameGeek for games. */
interface LinkSource {
  /** Card title, e.g. «از لینک طاقچه». */
  title: string;
  /** What the card fills in, shown until something is imported. */
  blurb: string;
  button: string;
  placeholder: string;
  /** What the link points at, for «… پیدا نشد». */
  noun: string;
  /** Shown when the typed text isn't a link this source understands. */
  invalid: string;
  parse: (text: string) => string | undefined;
  errorText: (e: unknown) => string;
}

const TAAGHCHE_SOURCE: LinkSource = {
  title: 'از لینک طاقچه',
  blurb: 'جلد، نویسنده، مترجم، ناشر و تعداد صفحه خودکار پر می‌شود.',
  button: 'دریافت از طاقچه',
  placeholder: 'https://taaghche.com/book/…',
  noun: 'کتاب طاقچه',
  invalid: 'این لینک کتاب طاقچه نیست؛ باید شبیه taaghche.com/book/… باشد.',
  parse: parseTaaghcheLink,
  errorText: (e) => (e instanceof CoverError ? COVER_ERROR_TEXT[e.code] : 'دریافت از طاقچه ممکن نشد.'),
};

const BGG_SOURCE: LinkSource = {
  title: 'از لینک BoardGameGeek',
  blurb: 'عکس جعبه، نام اصلی، برند، تعداد بازیکن، زمان، پیچیدگی و سبک خودکار پر می‌شود.',
  button: 'دریافت از BGG',
  placeholder: 'https://boardgamegeek.com/boardgame/…',
  noun: 'بازی BGG',
  invalid: 'این لینک بازی BGG نیست؛ باید شبیه boardgamegeek.com/boardgame/… یا فقط شناسهٔ عددی باشد.',
  parse: (text) => parseBgg(text).bggId,
  errorText: (e) => (e instanceof BggError ? BGG_ERROR_TEXT[e.code] : e instanceof CoverError ? COVER_ERROR_TEXT[e.code] : BGG_ERROR_TEXT.bad_response),
};

/** Paste a link at the top of the form to fill in the details and the cover/box art. */
function LinkImport({
  source,
  shared,
  done,
  onImport,
}: {
  source: LinkSource;
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
  const id = source.parse(link);
  const notFound = `در متن کپی‌شده لینک ${source.noun} پیدا نشد`;

  const run = async (refId: string) => {
    if (busy) return;
    setBusy(true);
    abort.current = new AbortController();
    try {
      await onImport(refId, abort.current.signal);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      toast(source.errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Shared from another app: fetch right away. A timer, so StrictMode's double mount only runs it once.
  useEffect(() => {
    if (!shared) return;
    const found = source.parse(shared);
    const t = setTimeout(() => (found ? run(found) : toast(notFound.replace('کپی‌شده', 'به‌اشتراک‌گذاشته'), 'error')), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
      const found = source.parse(text);
      if (found) run(found);
      else toast(notFound, 'error');
    } catch {
      toast('دسترسی به متن کپی‌شده داده نشد؛ لینک را در کادر بچسبان', 'error');
    }
  };

  return (
    <form
      // Apps share a sentence around the link, which a type="url" check would reject.
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
          <p className="text-sm font-bold text-[#4F4839]">{source.title}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed truncate">
            {done ? `«${done}» دریافت شد؛ هر چیزی را می‌توانی پایین‌تر عوض کنی.` : source.blurb}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="import-link" className="sr-only">
          {source.title}
        </label>
        <input
          id="import-link"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={source.placeholder}
          dir="ltr"
          className="input-field text-left"
        />
        {link.trim() && !id && <p className="text-[10px] text-[#8E3200] pr-4 leading-relaxed">{source.invalid}</p>}
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
          <span>{source.button}</span>
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
