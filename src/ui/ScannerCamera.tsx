import { useEffect, useRef, useState } from 'react';
import type { Quad } from '../lib/scan';
import { Icon } from './kit';

export interface Shot {
  /** The whole camera frame, at most `max` px on its long side. */
  canvas: HTMLCanvasElement;
  /** The on-screen guide frame, in the shot's pixels: a starting outline for the cover. */
  guide: Quad;
}

type State = 'starting' | 'live' | 'unavailable';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * The guide frame (screen pixels) in the captured shot's pixels. The feed is shown with
 * object-cover, so it's scaled to fill the box and cropped equally on both sides.
 */
export function guideInShot(box: Rect, frame: Rect, vw: number, vh: number, scale: number): Quad {
  const cover = Math.max(box.width / vw, box.height / vh);
  const ox = (box.width - vw * cover) / 2;
  const oy = (box.height - vh * cover) / 2;
  const w = vw * scale;
  const h = vh * scale;
  const px = (x: number) => Math.min(Math.max(((x - box.left - ox) / cover) * scale, 0), w);
  const py = (y: number) => Math.min(Math.max(((y - box.top - oy) / cover) * scale, 0), h);
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  return [
    { x: px(frame.left), y: py(frame.top) },
    { x: px(right), y: py(frame.top) },
    { x: px(right), y: py(bottom) },
    { x: px(frame.left), y: py(bottom) },
  ];
}

/**
 * Live camera in the ScannerUI design: the feed fills the screen, a rounded guide
 * frame with tan corner markers and the scan line, a white shutter, the gallery on
 * one side and the camera flip on the other. If the browser can't open the camera
 * (no permission, unsupported), it offers the phone's own camera app instead.
 */
export function ScannerCamera({
  aspect,
  title,
  hint,
  max,
  onShot,
  onGallery,
  onSystemCamera,
  onClose,
}: {
  /** Guide frame width / height. */
  aspect: number;
  title: string;
  hint: string;
  max: number;
  onShot: (shot: Shot) => void;
  onGallery: () => void;
  onSystemCamera: () => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>('starting');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [torch, setTorch] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: facing, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        const caps = s.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorch(caps?.torch ? false : undefined);
        setState('live');
      } catch {
        if (!stopped) setState('unavailable');
      }
    })();
    return () => {
      stopped = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [facing]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === undefined) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(undefined);
    }
  };

  const shoot = () => {
    const v = video.current;
    const f = frame.current;
    if (!v || !f || !v.videoWidth) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const scale = Math.min(1, max / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    onShot({ canvas, guide: guideInShot(v.getBoundingClientRect(), f.getBoundingClientRect(), vw, vh, scale) });
  };

  return (
    <div className="fixed inset-y-0 inset-x-app z-40 bg-gray-900 text-white flex flex-col overflow-hidden page-enter">
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />

      <header className="relative px-6 pt-8 pb-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
        <button type="button" aria-label="بستن" onClick={onClose} className="w-12 h-12 bg-black/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all">
          <Icon name="fa-xmark" />
        </button>
        {torch !== undefined && (
          <button
            type="button"
            aria-label="چراغ"
            aria-pressed={torch}
            onClick={toggleTorch}
            className="w-12 h-12 bg-black/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all"
          >
            <Icon name="fa-bolt" className={torch ? 'text-[#D7A86E]' : ''} />
          </button>
        )}
      </header>

      <main className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-10">
        {state === 'unavailable' ? (
          <div className="text-center space-y-4 px-2">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto text-2xl text-[#D7A86E]">
              <Icon name="fa-camera" />
            </div>
            <h2 className="text-lg font-bold">دوربین داخل اپ باز نشد</h2>
            <p className="text-xs text-white/70 leading-relaxed">اجازهٔ دوربین داده نشده یا این مرورگر پشتیبانی نمی‌کند. می‌توانی با دوربین خود گوشی عکس بگیری.</p>
            <button type="button" onClick={onSystemCamera} className="bg-[#8E3200] text-white px-6 py-3 rounded-2xl text-xs font-bold min-h-11">
              باز کردن دوربین گوشی
            </button>
          </div>
        ) : (
          <>
            <div ref={frame} className="w-full max-w-[280px] scanner-frame rounded-[2rem] relative overflow-hidden" style={{ aspectRatio: aspect }}>
              <div className="scan-line absolute left-0 right-0 z-10" />
              <div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-[#D7A86E] rounded-tr-xl" />
              <div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-[#D7A86E] rounded-tl-xl" />
              <div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-[#D7A86E] rounded-br-xl" />
              <div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-[#D7A86E] rounded-bl-xl" />
            </div>
            <div className="mt-10 text-center space-y-2 px-4">
              <h2 className="text-lg font-bold text-white">{state === 'starting' ? 'در حال باز کردن دوربین...' : title}</h2>
              <p className="text-xs text-white/70 leading-relaxed">{hint}</p>
            </div>
          </>
        )}
      </main>

      <footer className="relative px-10 pb-[max(3rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center">
        <button type="button" aria-label="از گالری" onClick={onGallery} className="w-14 h-14 rounded-2xl border-2 border-white/20 bg-white/10 flex items-center justify-center text-xl active:scale-90 transition-all">
          <Icon name="fa-images" />
        </button>
        <button
          type="button"
          aria-label="گرفتن عکس"
          onClick={shoot}
          disabled={state !== 'live'}
          className="w-20 h-20 bg-white rounded-full flex items-center justify-center shutter-btn active:scale-90 transition-all disabled:opacity-40"
        >
          <span className="w-16 h-16 border-2 border-gray-900 rounded-full flex items-center justify-center">
            <span className="w-14 h-14 bg-[#8E3200] rounded-full" />
          </span>
        </button>
        <button
          type="button"
          aria-label="چرخاندن دوربین"
          onClick={() => {
            setState('starting');
            setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
          }}
          disabled={state === 'unavailable'}
          className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-xl text-white active:rotate-180 transition-all duration-500 disabled:opacity-40"
        >
          <Icon name="fa-rotate" />
        </button>
      </footer>
    </div>
  );
}
