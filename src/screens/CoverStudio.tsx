import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAiReady } from '../ai/ui';
import { findCoverCorners } from '../ai/tasks';
import { useApiKeyHint } from '../ai/secret';
import { useBook, useGame } from '../db/queries';
import { setCover, type CoverKind } from '../lib/cover';
import { canvasToBlob, decodeImage, savePhoto, toCanvas } from '../lib/images';
import { useOnline } from '../lib/online';
import { fa } from '../lib/text';
import { defaultQuad, enhance, isUsableQuad, outputSize, sharpen, warp, type Quad } from '../lib/scan';
import { BGG_ERROR_TEXT, BGG_SECRET, BggError, fetchBggGame } from '../online/bgg';
import { chatGptUrl, COVER_ERROR_TEXT, CoverError, coverPrompt, downloadImage, parseImageLink, parseTaaghcheLink, taaghcheCoverUrl, type PromptInfo } from '../online/covers';
import { CornerEditor } from '../ui/CornerEditor';
import { ScannerCamera } from '../ui/ScannerCamera';
import { BottomAction, cx, Icon, Loading, PageHeader, PhotoImg, PrimaryButton, Spinner, Toggle } from '../ui/kit';
import { useBackToClose, useOverlay } from '../ui/overlay';
import { HiddenInputs } from '../ui/PhotoPicker';
import { NotFound } from './BookDetails';

/** Working copy of a scanned photo: big enough for a sharp 1600px cover, small enough to process quickly. */
const WORK_MAX = 2200;
const COVER_MAX = 1600;

type From = 'scan' | 'online';
type Busy = 'scan' | 'taaghche' | 'bgg' | 'link' | 'save';

type Step =
  | { kind: 'home' }
  | { kind: 'camera' }
  /** `ai`: let the AI place the corners (default: only when there's no starting outline). */
  | { kind: 'corners'; source: HTMLCanvasElement; url: string; quad?: Quad; ai?: boolean }
  | { kind: 'preview'; canvas: HTMLCanvasElement; url: string; from: From; source?: HTMLCanvasElement; sourceUrl?: string; quad?: Quad };

const EDITION_EN: Record<string, string> = {
  copy: 'a local copy with the original name and artwork',
  redesign: 'a redesign (different name or artwork, same rules)',
  original: 'the original edition',
};

async function displayUrl(canvas: HTMLCanvasElement, max = 1400) {
  return URL.createObjectURL(await canvasToBlob(toCanvas(canvas, max), 0.85));
}

async function fileToCanvas(file: Blob, max: number) {
  const bitmap = await decodeImage(file);
  try {
    return toCanvas(bitmap, max);
  } finally {
    bitmap.close();
  }
}

/**
 * One place to get a good cover: scan my own copy (straightened and cleaned up),
 * a game's box art from BGG, or any image link (ChatGPT can find one with a ready-made prompt).
 */
export default function CoverStudio() {
  const { kind: rawKind, id } = useParams();
  const kind: CoverKind = rawKind === 'game' ? 'game' : 'book';
  const book = useBook(kind === 'book' ? id : undefined);
  const game = useGame(kind === 'game' ? id : undefined);
  const data = kind === 'book' ? book : game;
  const navigate = useNavigate();
  const { toast } = useOverlay();
  const online = useOnline();
  const ai = useAiReady();
  const [step, setStep] = useState<Step>({ kind: 'home' });
  const [busy, setBusy] = useState<Busy>();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Object URLs belong to the step that made them.
  useEffect(() => {
    return () => {
      if (step.kind === 'corners') URL.revokeObjectURL(step.url);
      if (step.kind === 'preview') URL.revokeObjectURL(step.url);
    };
  }, [step]);
  const home = useCallback(() => setStep({ kind: 'home' }), []);
  useBackToClose(step.kind !== 'home', home);

  if (data === undefined) return <Loading />;
  if (data === null) return <NotFound />;
  const copy = data.copy;
  const name = 'title' in copy ? copy.title : copy.name;

  const guard = async (label: Busy, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (e instanceof CoverError) toast(COVER_ERROR_TEXT[e.code], 'error');
      else if (e instanceof BggError) toast(BGG_ERROR_TEXT[e.code], 'error');
      else toast('این عکس قابل خواندن نبود. عکس دیگری را امتحان کن.', 'error');
    } finally {
      setBusy(undefined);
    }
  };

  const startScan = (files: FileList | null) =>
    files?.[0] &&
    guard('scan', async () => {
      const source = await fileToCanvas(files[0], WORK_MAX);
      setStep({ kind: 'corners', source, url: await displayUrl(source) });
    });

  const showPreview = async (canvas: HTMLCanvasElement, from: From) => setStep({ kind: 'preview', canvas, from, url: await displayUrl(canvas) });

  const fromTaaghche = (bookId: string) =>
    guard('taaghche', async () => {
      await showPreview(await fileToCanvas(await downloadImage(taaghcheCoverUrl(bookId)), COVER_MAX), 'online');
    });

  const fromBgg = (bggId: string) =>
    guard('bgg', async () => {
      const g = await fetchBggGame(bggId);
      if (!g.image) throw new CoverError('not_found');
      await showPreview(await fileToCanvas(await downloadImage(g.image), COVER_MAX), 'online');
    });

  const fromLink = (url: string) => {
    const taaghche = parseTaaghcheLink(url);
    if (taaghche) return fromTaaghche(taaghche);
    return guard('link', async () => {
      let blob: Blob;
      try {
        blob = await downloadImage(url);
      } catch (e) {
        // Usually the page's address instead of the image's own.
        if (e instanceof CoverError && e.code !== 'offline') {
          toast('از این لینک عکسی دریافت نشد. باید آدرس خود عکس باشد: روی عکس نگه دار و «کپی آدرس تصویر» را بزن.', 'error');
          return;
        }
        throw e;
      }
      await showPreview(await fileToCanvas(blob, COVER_MAX), 'online');
    });
  };

  // Leave the studio: first drop the step's history entry, then go back past the studio itself.
  const leave = () => {
    window.addEventListener('popstate', () => setTimeout(() => navigate(-1), 0), { once: true });
    setStep({ kind: 'home' });
  };

  const save = (canvas: HTMLCanvasElement) =>
    guard('save', async () => {
      const photoId = await savePhoto(canvas);
      await setCover(kind, copy.id, photoId);
      toast('جلد تازه ذخیره شد');
      leave();
    });

  const scanInputs = <HiddenInputs onFiles={startScan} cameraRef={cameraRef} galleryRef={galleryRef} />;

  // Camera and corner steps are the full-screen scanner from the ScannerUI design.
  if (step.kind === 'camera') {
    return (
      <>
        {scanInputs}
        <ScannerCamera
          aspect={kind === 'book' ? 2 / 3 : 1}
          title={kind === 'book' ? 'جلد را داخل کادر بگذار' : 'روی جعبه را داخل کادر بگذار'}
          hint="نور روز و بدون فلش؛ کادر لازم نیست دقیق باشد، لبه‌ها بعداً پیدا می‌شوند."
          max={WORK_MAX}
          onClose={() => window.history.back()}
          onGallery={() => galleryRef.current?.click()}
          onSystemCamera={() => cameraRef.current?.click()}
          onShot={async ({ canvas, guide }) => setStep({ kind: 'corners', source: canvas, url: await displayUrl(canvas), quad: guide, ai: true })}
        />
      </>
    );
  }

  if (step.kind === 'corners') {
    return (
      <Corners
        key={step.url}
        kind={kind}
        source={step.source}
        url={step.url}
        initial={step.quad}
        aiReady={ai.configured && online && (step.ai ?? !step.quad)}
        onClose={() => window.history.back()}
        onDone={async (quad) => {
          const canvas = flatten(step.source, quad, true);
          setStep({ kind: 'preview', canvas, from: 'scan', url: await displayUrl(canvas), source: step.source, quad });
        }}
      />
    );
  }

  return (
    <div className="pb-36 page-enter">
      {scanInputs}
      <PageHeader
        title={step.kind === 'preview' ? 'پیش‌نمایش جلد' : 'جلد باکیفیت'}
        subtitle={name}
        back={step.kind === 'home' ? 'close' : 'arrow'}
        onBack={step.kind === 'home' ? undefined : () => window.history.back()}
      />
      {step.kind === 'home' && (
        <Home
          kind={kind}
          data={data}
          online={online}
          busy={busy}
          onCamera={() => setStep({ kind: 'camera' })}
          onGallery={() => galleryRef.current?.click()}
          onTaaghche={fromTaaghche}
          onBgg={fromBgg}
          onLink={fromLink}
          onLinkBgg={() => navigate(`/games/${copy.id}/bgg`)}
        />
      )}
      {step.kind === 'preview' && (
        <Preview
          step={step}
          busy={busy}
          onSave={save}
          onRecrop={async () => {
            const source = step.source ?? step.canvas;
            // A finished image from the web starts from its full frame.
            setStep({ kind: 'corners', source, url: await displayUrl(source), quad: step.quad ?? defaultQuad(source.width, source.height, 0.02) });
          }}
          onRedo={async (enhanced) => {
            if (!step.source || !step.quad) return;
            const canvas = flatten(step.source, step.quad, enhanced);
            setStep({ ...step, canvas, url: await displayUrl(canvas) });
          }}
        />
      )}
    </div>
  );
}

/** Straighten the quad into a flat cover, optionally fixing light and colour. */
function flatten(source: HTMLCanvasElement, quad: Quad, enhanced: boolean) {
  const ctx = source.getContext('2d')!;
  const src = ctx.getImageData(0, 0, source.width, source.height);
  const { width, height } = outputSize(quad, COVER_MAX);
  let px = warp({ data: src.data, width: src.width, height: src.height }, quad, width, height);
  if (enhanced) px = sharpen(enhance(px));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d')!.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  return out;
}

// ---------- Home ----------

type Data = NonNullable<ReturnType<typeof useBook>> | NonNullable<ReturnType<typeof useGame>>;

/** Section heading, as on the backup screen. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold text-[#8E3200] pr-2">{children}</h2>;
}

function Home({
  kind,
  data,
  online,
  busy,
  onCamera,
  onGallery,
  onTaaghche,
  onBgg,
  onLink,
  onLinkBgg,
}: {
  kind: CoverKind;
  data: Data;
  online: boolean;
  busy?: Busy;
  onCamera: () => void;
  onGallery: () => void;
  onTaaghche: (bookId: string) => void;
  onBgg: (bggId: string) => void;
  onLink: (url: string) => void;
  onLinkBgg: () => void;
}) {
  const copy = data.copy;
  const isBook = kind === 'book';
  const cover = copy.photoIds[0];

  return (
    <main className="px-6 space-y-10 mt-4">
      {/* Current cover, framed like the identification results header. */}
      <div className="space-y-3">
        <div className="relative w-full aspect-video rounded-[2.5rem] overflow-hidden shadow-inner bg-[#EEE2D3]">
          {cover && <PhotoImg id={cover} className="absolute inset-0 opacity-50 blur-sm" />}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cx('border-2 border-white rounded-2xl relative shadow-2xl bg-white', isBook ? 'w-24 h-36' : 'w-32 h-32')}>
              <PhotoImg id={cover} placeholderIcon={isBook ? 'fa-book' : 'fa-dice'} className="w-full h-full rounded-xl" />
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <span className="bg-black/50 backdrop-blur-md text-white text-[10px] px-4 py-1.5 rounded-full font-bold">{cover ? 'جلد فعلی' : 'هنوز جلدی ندارد'}</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 text-center italic">جلد تازه اولین عکس می‌شود؛ عکس‌های قبلی در صفحهٔ ویرایش می‌مانند.</p>
      </div>

      {isBook && <TaaghcheSection title={(data as NonNullable<ReturnType<typeof useBook>>).copy.title} online={online} busy={busy === 'taaghche'} onFetch={onTaaghche} />}

      <section className="space-y-4">
        <SectionTitle>{isBook ? 'اسکن جلد یا اسکرین‌شات' : 'اسکن جعبه'}</SectionTitle>
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[#D7A86E]/30 rounded-[2.5rem] bg-white text-center">
          <div className="w-16 h-16 bg-[#FFF9F0] rounded-full flex items-center justify-center text-[#D7A86E] mb-4 text-2xl">
            <Icon name={busy === 'scan' ? 'fa-spinner fa-spin' : 'fa-crop-simple'} />
          </div>
          <p className="text-sm font-bold text-[#4F4839]">{isBook ? 'عکس از جلد کتاب' : 'عکس از روی جعبه'}</p>
          <p className="text-[10px] text-gray-400 mt-1 italic leading-relaxed">
            {isBook ? 'برای کتاب دیجیتال، اسکرین‌شات صفحهٔ کتاب را از گالری انتخاب کن' : 'لبه‌ها پیدا می‌شوند و کجی و نور اصلاح می‌شود'}
          </p>
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={onCamera}
              className="bg-[#8E3200] text-white px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#8E3200]/20 min-h-11"
            >
              <Icon name="fa-camera" /> گرفتن عکس
            </button>
            <button
              type="button"
              onClick={onGallery}
              className="bg-white border border-[#EEE2D3] text-[#4F4839] px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 min-h-11"
            >
              <Icon name="fa-images" className="text-[#D7A86E]" /> از گالری
            </button>
          </div>
        </div>
      </section>

      {!isBook && <BggSection data={data as NonNullable<ReturnType<typeof useGame>>} online={online} busy={busy === 'bgg'} onBgg={onBgg} onLinkBgg={onLinkBgg} />}

      <ChatGptSection kind={kind} data={data} online={online} busy={busy === 'link'} onFetch={onLink} />
    </main>
  );
}

function TaaghcheSection({ title, online, busy, onFetch }: { title: string; online: boolean; busy: boolean; onFetch: (bookId: string) => void }) {
  const { toast } = useOverlay();
  const [link, setLink] = useState('');
  const id = parseTaaghcheLink(link);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
      const found = parseTaaghcheLink(text);
      if (found) onFetch(found);
      else toast('در متن کپی‌شده لینک کتاب طاقچه پیدا نشد', 'error');
    } catch {
      toast('دسترسی به متن کپی‌شده داده نشد؛ لینک را در کادر بچسبان', 'error');
    }
  };

  return (
    <section className="space-y-4">
      <SectionTitle>جلد از طاقچه</SectionTitle>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (id) onFetch(id);
        }}
        className="backup-card shadow-sm space-y-4"
      >
        <p className="text-[12px] leading-relaxed text-[#4F4839]">
          در اپ یا سایت طاقچه صفحهٔ کتاب را باز کن، «اشتراک‌گذاری» یا «کپی لینک» را بزن و این‌جا بچسبان. جلد اصلی ناشر با کیفیت بالا دریافت می‌شود.
        </p>
        <div className="space-y-2">
          <label htmlFor="taaghche-link" className="field-label block">
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
            className="flex-1 bg-white border border-[#EEE2D3] text-[#4F4839] py-4 rounded-2xl font-bold text-xs shadow-sm min-h-11 disabled:opacity-60"
          >
            چسباندن لینک
          </button>
          <button
            type="submit"
            disabled={!online || !id || busy}
            className="flex-[2] bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-2 min-h-11 disabled:opacity-60"
          >
            {busy ? <Spinner /> : <Icon name="fa-cloud-arrow-down" />}
            <span>دریافت جلد</span>
          </button>
        </div>
        {!online && <p className="text-[11px] text-[#8E3200] text-center">{COVER_ERROR_TEXT.offline}</p>}
      </form>
      <a
        href={`https://taaghche.com/search?q=${encodeURIComponent(title)}`}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[11px] font-bold text-[#8E3200] inline-flex items-center gap-1 min-h-9 pr-2"
      >
        پیدا کردن «{title}» در طاقچه <Icon name="fa-arrow-up-right-from-square" className="text-[9px]" />
      </a>
    </section>
  );
}

/** Same row as «اتصال BoardGameGeek» in settings. */
function BggSection({
  data,
  online,
  busy,
  onBgg,
  onLinkBgg,
}: {
  data: NonNullable<ReturnType<typeof useGame>>;
  online: boolean;
  busy: boolean;
  onBgg: (id: string) => void;
  onLinkBgg: () => void;
}) {
  const token = useApiKeyHint(BGG_SECRET);
  const bggId = data.work?.bggId;
  const ready = !!(bggId && token);
  return (
    <section className="space-y-4">
      <SectionTitle>تصویر جعبه از BoardGameGeek</SectionTitle>
      <button
        type="button"
        disabled={busy || (ready && !online)}
        onClick={() => (ready ? onBgg(bggId!) : onLinkBgg())}
        className={cx('settings-item disabled:opacity-60', !ready && 'border-dashed border-[#8E3200]/40 bg-[#FFF9F0]')}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#4F4839] text-white text-[10px] font-bold flex-shrink-0">BGG</div>
          <div>
            <span className="text-sm font-bold block">{ready ? 'دریافت تصویر اصلی جعبه' : token ? 'اول بازی را در BGG پیدا کن' : 'تنظیم اتصال BGG'}</span>
            <span className="text-[10px] text-[#8E3200]/80 font-medium">
              {ready ? (online ? 'تصویر باکیفیت بازی ثبت‌شده در BGG' : COVER_ERROR_TEXT.offline) : token ? 'این بازی هنوز به BGG وصل نشده' : 'وضعیت: نیازمند تنظیم'}
            </span>
          </div>
        </div>
        {busy ? <Spinner /> : <Icon name="fa-chevron-left" className="text-[10px] text-gray-400" />}
      </button>
    </section>
  );
}

function promptInfo(kind: CoverKind, data: Data): PromptInfo {
  if (kind === 'book') {
    const { copy, work } = data as NonNullable<ReturnType<typeof useBook>>;
    return {
      kind,
      title: copy.title,
      originalTitle: work?.title,
      authors: work?.authors,
      translators: copy.translators,
      publisher: copy.publisher,
      publication: copy.publication,
      isbn: copy.isbn,
    };
  }
  const { copy, work } = data as NonNullable<ReturnType<typeof useGame>>;
  return { kind, title: copy.name, originalTitle: work?.name, edition: copy.edition ? EDITION_EN[copy.edition] : undefined, refUrl: work?.refUrl };
}

function ChatGptSection({ kind, data, online, busy, onFetch }: { kind: CoverKind; data: Data; online: boolean; busy: boolean; onFetch: (url: string) => void }) {
  const { toast } = useOverlay();
  const [show, setShow] = useState(false);
  const [link, setLink] = useState('');
  const url = parseImageLink(link);
  const prompt = coverPrompt(promptInfo(kind, data));

  const open = async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      copied = false;
    }
    window.open(chatGptUrl(prompt), '_blank', 'noopener');
    toast(copied ? 'متن کپی شد؛ اگر در ChatGPT خالی بود، Paste کن' : 'متن پایین را دستی کپی کن', copied ? 'ok' : 'error');
    if (!copied) setShow(true);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
      const found = parseImageLink(text);
      if (found) onFetch(found);
      else toast('در متن کپی‌شده لینکی پیدا نشد', 'error');
    } catch {
      toast('دسترسی به متن کپی‌شده داده نشد؛ لینک را در کادر بچسبان', 'error');
    }
  };

  return (
    <section className="space-y-4">
      <SectionTitle>جلد از لینک عکس</SectionTitle>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (url) onFetch(url);
        }}
        className="backup-card shadow-sm space-y-4"
      >
        <ol className="space-y-3 text-[12px] leading-relaxed text-[#4F4839] list-[persian] pr-5">
          <li>متن آماده با مشخصات این {kind === 'book' ? 'کتاب' : 'بازی'} کپی می‌شود و ChatGPT باز می‌شود.</li>
          <li>ChatGPT {kind === 'book' ? 'جلد همین چاپ' : 'تصویر جعبه'} را در سایت‌ها پیدا می‌کند و لینک خود عکس را می‌دهد.</li>
          <li>لینک را کپی کن و این‌جا بچسبان. لینک عکس از هر سایت دیگری هم کار می‌کند.</li>
        </ol>
        <button
          type="button"
          onClick={open}
          className="w-full bg-white border border-[#EEE2D3] text-[#4F4839] py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 min-h-11"
        >
          <Icon name="fa-copy" className="text-[#D7A86E]" />
          <span>کپی متن و باز کردن ChatGPT</span>
        </button>
        <div className="space-y-2">
          <label htmlFor="image-link" className="field-label block">
            لینک عکس جلد
          </label>
          <input
            id="image-link"
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…/cover.jpg"
            dir="ltr"
            className="input-field text-left"
          />
          {link.trim() && !url && <p className="text-[10px] text-[#8E3200] pr-4 leading-relaxed">لینک باید با https:// شروع شود.</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={paste}
            disabled={!online || busy}
            className="flex-1 bg-white border border-[#EEE2D3] text-[#4F4839] py-4 rounded-2xl font-bold text-xs shadow-sm min-h-11 disabled:opacity-60"
          >
            چسباندن لینک
          </button>
          <button
            type="submit"
            disabled={!online || !url || busy}
            className="flex-[2] bg-[#8E3200] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-2 min-h-11 disabled:opacity-60"
          >
            {busy ? <Spinner /> : <Icon name="fa-cloud-arrow-down" />}
            <span>دریافت جلد</span>
          </button>
        </div>
        {!online && <p className="text-[11px] text-[#8E3200] text-center">{COVER_ERROR_TEXT.offline}</p>}
      </form>
      <button type="button" onClick={() => setShow((s) => !s)} className="w-full text-xs font-bold text-gray-500 py-2 min-h-11">
        <Icon name={show ? 'fa-chevron-up' : 'fa-chevron-down'} className="ml-1" /> {show ? 'پنهان کردن متن درخواست' : 'دیدن متن درخواست'}
      </button>
      {show && (
        <textarea
          readOnly
          value={prompt}
          dir="ltr"
          onFocus={(e) => e.currentTarget.select()}
          className="input-soft h-56 resize-none leading-relaxed text-left"
          aria-label="متن درخواست برای ChatGPT"
        />
      )}
    </section>
  );
}

// ---------- Corners (scanner) ----------

function Corners({
  kind,
  source,
  url,
  initial,
  aiReady,
  onClose,
  onDone,
}: {
  kind: CoverKind;
  source: HTMLCanvasElement;
  url: string;
  initial?: Quad;
  aiReady: boolean;
  onClose: () => void;
  onDone: (quad: Quad) => Promise<void>;
}) {
  const { toast } = useOverlay();
  const { width, height } = source;
  const [quad, setQuad] = useState<Quad>(() => initial ?? defaultQuad(width, height));
  const [status, setStatus] = useState<'finding' | 'found' | 'manual'>(aiReady ? 'finding' : 'manual');
  const [advice, setAdvice] = useState<string>();
  const [working, setWorking] = useState(false);
  const touched = useRef(false);

  // Let the AI place the corners; my own drags always win over a late answer.
  useEffect(() => {
    if (!aiReady) return;
    const controller = new AbortController();
    (async () => {
      try {
        const small = toCanvas(source, 1024);
        const result = await findCoverCorners(await canvasToBlob(small, 0.8), small.width, small.height, kind, controller.signal);
        const sx = width / small.width;
        const sy = height / small.height;
        const pts = [result.topLeft, result.topRight, result.bottomRight, result.bottomLeft];
        const q = pts.every(Boolean) ? (pts.map((p) => ({ x: Math.min(Math.max(p!.x * sx, 0), width), y: Math.min(Math.max(p!.y * sy, 0), height) })) as Quad) : undefined;
        if (result.advice || result.glare) setAdvice(result.advice ?? 'بازتاب نور روی جلد دیده می‌شود؛ اگر نتیجه خوب نبود، با زاویهٔ کمی متفاوت دوباره عکس بگیر.');
        if (result.found && q && isUsableQuad(q, width, height)) {
          if (!touched.current) setQuad(q);
          setStatus('found');
        } else setStatus('manual');
      } catch {
        if (!controller.signal.aborted) setStatus('manual');
      }
    })();
    return () => controller.abort();
  }, [aiReady, source, width, height, kind]);

  const done = async () => {
    if (!isUsableQuad(quad, width, height)) {
      toast('گوشه‌ها روی هم افتاده‌اند؛ هر دایره را روی یک گوشهٔ جلد بگذار.', 'error');
      return;
    }
    setWorking(true);
    // Let the spinner paint before the pixel work.
    await new Promise((r) => setTimeout(r, 30));
    try {
      await onDone(quad);
    } finally {
      setWorking(false);
    }
  };

  const what = kind === 'book' ? 'جلد' : 'روی جعبه';
  return (
    <div className="fixed inset-y-0 inset-x-app z-40 bg-gray-900 text-white flex flex-col overflow-hidden page-enter">
      <img src={url} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md pointer-events-none" />

      <header className="relative px-6 pt-8 pb-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
        <button type="button" aria-label="بستن" onClick={onClose} className="w-12 h-12 bg-black/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all">
          <Icon name="fa-xmark" />
        </button>
        <button
          type="button"
          aria-label="کل کادر"
          onClick={() => {
            touched.current = true;
            setQuad(defaultQuad(width, height, 0.02));
          }}
          className="w-12 h-12 bg-black/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all"
        >
          <Icon name="fa-expand" />
        </button>
      </header>

      <main className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-6">
        <CornerEditor
          url={url}
          width={width}
          height={height}
          quad={quad}
          scanning={status === 'finding'}
          onChange={(q) => {
            touched.current = true;
            setQuad(q);
          }}
        />
        <div className="mt-8 text-center space-y-2 px-4" role="status">
          <h2 className="text-lg font-bold text-white">
            {status === 'finding' ? `در حال پیدا کردن لبه‌های ${what}...` : status === 'found' ? 'لبه‌ها پیدا شد' : `گوشه‌های ${what} را مشخص کن`}
          </h2>
          <p className="text-xs text-white/70 leading-relaxed">
            {status === 'manual' ? 'هر دایره را روی یک گوشه بکش.' : 'اگر دقیق نیست، دایره‌ها را روی گوشه‌ها بکش.'}
          </p>
          {advice && <p className="text-xs text-[#D7A86E] leading-relaxed">{advice}</p>}
        </div>
      </main>

      <footer className="relative px-10 pb-[max(3rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center">
        <button type="button" aria-label="عکس دیگر" onClick={onClose} className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-xl text-white active:scale-90 transition-all">
          <Icon name="fa-camera-rotate" />
        </button>
        <button
          type="button"
          aria-label="صاف کن"
          onClick={done}
          disabled={working}
          className="w-20 h-20 bg-white rounded-full flex items-center justify-center shutter-btn active:scale-90 transition-all disabled:opacity-60"
        >
          <span className="w-16 h-16 border-2 border-gray-900 rounded-full flex items-center justify-center">
            <span className="w-14 h-14 bg-[#8E3200] rounded-full flex items-center justify-center text-white text-lg">
              <Icon name={working ? 'fa-spinner fa-spin' : 'fa-check'} />
            </span>
          </span>
        </button>
        <span className="w-14" />
      </footer>
    </div>
  );
}

// ---------- Preview ----------

function Preview({
  step,
  busy,
  onSave,
  onRecrop,
  onRedo,
}: {
  step: Extract<Step, { kind: 'preview' }>;
  busy?: Busy;
  onSave: (canvas: HTMLCanvasElement) => void;
  onRecrop: () => void;
  onRedo: (enhanced: boolean) => void;
}) {
  const [enhanced, setEnhanced] = useState(true);
  const { width, height } = step.canvas;
  const small = Math.max(width, height) < 800;
  return (
    <main className="px-6 space-y-8 mt-4">
      <div className="space-y-3">
        <img
          src={step.url}
          alt="پیش‌نمایش جلد"
          className="mx-auto rounded-[2rem] shadow-2xl bg-white"
          style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc(55vh * ${width / height}))` }}
        />
        <p className="text-[10px] text-gray-500 text-center">
          {fa(width)}×{fa(height)} پیکسل
        </p>
      </div>

      {(small || step.from !== 'scan') && (
        <div className="bg-[#D7A86E]/10 p-5 rounded-[2rem] border border-[#D7A86E]/20">
          <div className="flex items-center gap-3 mb-2">
            <Icon name={small ? 'fa-triangle-exclamation' : 'fa-circle-info'} className="text-[#8E3200]" />
            <h2 className="text-sm font-bold text-[#8E3200]">{small ? 'تصویر کوچک است' : 'تصویر از منبع آنلاین'}</h2>
          </div>
          <p className="text-[12px] leading-relaxed text-[#433520]">
            {small
              ? 'روی صفحه کمی تار دیده می‌شود. اگر منبع دیگری با کیفیت بهتر هست، آن را امتحان کن.'
              : 'اگر حاشیه یا پس‌زمینه دارد، «برش و صاف کردن» را بزن.'}
          </p>
        </div>
      )}

      {step.from === 'scan' && (
        <div className="settings-item">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#433520]/5 text-[#433520]">
              <Icon name="fa-wand-magic-sparkles" />
            </div>
            <div>
              <span className="text-sm font-bold block">اصلاح خودکار نور و رنگ</span>
              <span className="text-[10px] text-gray-500">برای اسکرین‌شات معمولاً لازم نیست</span>
            </div>
          </div>
          <Toggle
            on={enhanced}
            onChange={(v) => {
              setEnhanced(v);
              onRedo(v);
            }}
            label="اصلاح خودکار نور و رنگ"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onRecrop}
        className="w-full py-4 border-2 border-dashed border-[#D7A86E]/40 rounded-3xl text-[#8E3200] text-xs font-bold flex items-center justify-center gap-2 min-h-11"
      >
        <Icon name="fa-crop-simple" />
        <span>{step.from === 'scan' ? 'تنظیم دوبارهٔ لبه‌ها' : 'برش و صاف کردن'}</span>
      </button>

      <BottomAction>
        <PrimaryButton onClick={() => onSave(step.canvas)} disabled={!!busy} icon={busy ? 'fa-spinner fa-spin' : 'fa-check'}>
          ذخیره به‌عنوان جلد
        </PrimaryButton>
      </BottomAction>
    </main>
  );
}
