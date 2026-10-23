import { useRef, useState } from 'react';
import type { Point, Quad } from '../lib/scan';

const CORNER_LABEL = ['گوشهٔ بالا-چپ', 'گوشهٔ بالا-راست', 'گوشهٔ پایین-راست', 'گوشهٔ پایین-چپ'];
const LOUPE = 112;
const ZOOM = 3;

/**
 * Four draggable corners over a photo, in the ScannerUI design's look: the area
 * outside the cover dimmed, a thin white outline, tan corner markers and the scan
 * line while the AI looks for the edges. Touching anywhere grabs the nearest corner,
 * so the finger never has to land exactly on a handle; a magnifier shows the edge
 * under the finger while dragging. Coordinates are in the photo's own pixels.
 */
export function CornerEditor({
  url,
  width,
  height,
  quad,
  scanning,
  onChange,
}: {
  url: string;
  width: number;
  height: number;
  quad: Quad;
  scanning?: boolean;
  onChange: (q: Quad) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const at = (e: React.PointerEvent): Point => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * width,
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) * height,
    };
  };
  const move = (i: number, p: Point) => onChange(quad.map((q, k) => (k === i ? p : q)) as Quad);

  const down = (e: React.PointerEvent) => {
    const p = at(e);
    const d = quad.map((q) => Math.hypot((q.x - p.x) / width, (q.y - p.y) / height));
    const i = d.indexOf(Math.min(...d));
    if (d[i] > 0.35) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone; the drag still follows move events over the photo.
    }
    setDrag(i);
    move(i, p);
  };

  const pts = quad.map((p) => `${p.x},${p.y}`).join(' ');
  const active = drag !== null ? quad[drag] : undefined;
  // Magnifier sits in the top corner away from the finger.
  const loupeLeft = active && active.x < width / 2;

  return (
    <div
      ref={box}
      dir="ltr"
      className="relative mx-auto select-none touch-none rounded-[2rem] overflow-hidden shadow-2xl"
      style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc(52vh * ${width / height}))` }}
      onPointerDown={down}
      onPointerMove={(e) => drag !== null && move(drag, at(e))}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
    >
      <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
        <path d={`M0 0H${width}V${height}H0Z M${pts.replace(/ /g, ' L')}Z`} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
        <polygon points={pts} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {scanning && <div className="scan-line absolute left-0 right-0 z-10 pointer-events-none" />}
      {quad.map((p, i) => (
        <span
          key={i}
          aria-label={CORNER_LABEL[i]}
          className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-4 border-[#D7A86E] pointer-events-none shadow-lg transition-transform ${
            drag === i ? 'bg-[#D7A86E]/40 scale-125' : 'bg-black/20'
          }`}
          style={{ left: `${(p.x / width) * 100}%`, top: `${(p.y / height) * 100}%` }}
        />
      ))}
      {active && box.current && (
        <Loupe url={url} point={active} width={width} height={height} box={box.current} left={!loupeLeft} />
      )}
    </div>
  );
}

function Loupe({ url, point, width, height, box, left }: { url: string; point: Point; width: number; height: number; box: HTMLElement; left: boolean }) {
  const w = box.clientWidth * ZOOM;
  const h = box.clientHeight * ZOOM;
  const x = (point.x / width) * w - LOUPE / 2;
  const y = (point.y / height) * h - LOUPE / 2;
  return (
    <div
      className="absolute top-3 rounded-full border-2 border-white/50 shadow-2xl pointer-events-none bg-gray-900"
      style={{
        width: LOUPE,
        height: LOUPE,
        [left ? 'left' : 'right']: 12,
        backgroundImage: `url("${url}")`,
        backgroundSize: `${w}px ${h}px`,
        backgroundPosition: `${-x}px ${-y}px`,
        backgroundRepeat: 'no-repeat',
      }}
    >
      <span className="absolute left-1/2 top-2 bottom-2 w-px bg-[#D7A86E]" />
      <span className="absolute top-1/2 left-2 right-2 h-px bg-[#D7A86E]" />
    </div>
  );
}
