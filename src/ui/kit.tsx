import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { fa } from '../lib/text';

/** Wraps async handlers so a double tap runs them once; `busy` is true while one runs. */
export function useFlight() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const wrap = useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
      async (...args: A) => {
        if (running.current) return;
        running.current = true;
        setBusy(true);
        try {
          await fn(...args);
        } finally {
          running.current = false;
          setBusy(false);
        }
      },
    [],
  );
  return { wrap, busy };
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Icon({ name, className, regular }: { name: string; className?: string; regular?: boolean }) {
  return <i aria-hidden="true" className={cx(regular ? 'fa-regular' : 'fa-solid', name, className)} />;
}

/** Shows a stored photo (thumbnail by default) or a calm placeholder. */
export function PhotoImg({
  id,
  full,
  className,
  alt = '',
  placeholderIcon = 'fa-image',
  imgClassName = 'w-full h-full object-cover',
}: {
  id?: string;
  full?: boolean;
  className?: string;
  alt?: string;
  placeholderIcon?: string;
  imgClassName?: string;
}) {
  const photo = useLiveQuery(() => (id ? db.photos.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!photo) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(full ? photo.blob : photo.thumb);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo, full]);
  return (
    <div className={cx('overflow-hidden', className)}>
      {url ? (
        <img src={url} alt={alt} className={imgClassName} draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#D7A86E]/10 text-[#D7A86E]">
          <Icon name={placeholderIcon} className="text-xl opacity-60" />
        </div>
      )}
    </div>
  );
}

type BackKind = 'arrow' | 'chevron' | 'close';
const BACK_ICON: Record<BackKind, string> = { arrow: 'fa-arrow-right', chevron: 'fa-chevron-right', close: 'fa-xmark' };

export function BackButton({
  kind = 'arrow',
  glass,
  onClick,
  label = 'بازگشت',
}: {
  kind?: BackKind;
  glass?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label={kind === 'close' ? 'بستن' : label}
      onClick={onClick ?? (() => (window.history.length > 1 ? navigate(-1) : navigate('/')))}
      className={cx(
        'w-12 h-12 rounded-2xl flex items-center justify-center text-[#4F4839] flex-shrink-0',
        glass ? 'glass-effect' : 'bg-white shadow-sm',
      )}
    >
      <Icon name={BACK_ICON[kind]} />
    </button>
  );
}

/** Sticky header: back button, centred title (optional subtitle), right-side slot. */
export function PageHeader({
  title,
  subtitle,
  back = 'arrow',
  onBack,
  end,
  align = 'center',
  className,
}: {
  title: string;
  subtitle?: string;
  back?: BackKind | false;
  onBack?: () => void;
  end?: ReactNode;
  align?: 'center' | 'start';
  className?: string;
}) {
  if (align === 'start') {
    return (
      <header className={cx('px-6 pt-8 pb-6 flex items-center gap-4 sticky top-0 bg-[#FFF9F0]/80 backdrop-blur-lg z-20', className)}>
        {back && <BackButton kind={back} onClick={onBack} />}
        <h1 className="text-xl font-bold text-[#4F4839] flex-1">{title}</h1>
        {end}
      </header>
    );
  }
  return (
    <header className={cx('px-6 pt-8 pb-4 flex justify-between items-center bg-[#FFF9F0]/80 backdrop-blur-lg sticky top-0 z-20', className)}>
      {back ? <BackButton kind={back} onClick={onBack} /> : <div className="w-12" />}
      <div className="text-center min-w-0 px-2">
        <h1 className="text-lg font-bold text-[#4F4839] truncate">{title}</h1>
        {subtitle && <p className="text-[10px] text-[#D7A86E] font-bold truncate">{subtitle}</p>}
      </div>
      {end ?? <div className="w-12" />}
    </header>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cx('text-[10px] font-bold text-[#D7A86E] uppercase tracking-widest px-2', className)}>{children}</h3>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="min-w-11 h-11 flex items-center justify-center -my-2"
    >
      <span className={cx('w-11 h-6 rounded-full relative p-1 transition-colors flex', on ? 'bg-[#8E3200]' : 'bg-gray-200')}>
        <span className={cx('w-4 h-4 bg-white rounded-full transition-all', on && 'mr-auto')} />
      </span>
    </button>
  );
}

export function Stars({
  value,
  onChange,
  size = 'text-3xl',
  gap = 'gap-4',
}: {
  value?: number;
  onChange?: (v: number | undefined) => void;
  size?: string;
  gap?: string;
}) {
  const v = value ?? 0;
  if (!onChange) {
    return (
      <div className={cx('flex', gap, size)} aria-label={`امتیاز ${fa(v)} از ۵`} role="img">
        {[1, 2, 3, 4, 5].map((i) => (
          <Icon key={i} name="fa-star" className={i <= v ? 'text-[#D7A86E]' : 'text-gray-300'} />
        ))}
      </div>
    );
  }
  return (
    <div className={cx('flex justify-center', gap, size)} role="radiogroup" aria-label="امتیاز">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={v === i}
          aria-label={`${fa(i)} ستاره`}
          onClick={() => onChange(v === i ? undefined : i)}
          className="min-w-11 min-h-11 flex items-center justify-center"
        >
          <Icon name="fa-star" regular={i > v} className={i <= v ? 'text-[#D7A86E]' : 'text-[#EEE2D3]'} />
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className, fill = 'bg-[#8E3200]' }: { value: number; className?: string; fill?: string }) {
  return (
    <div
      className={cx('relative rounded-full overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cx('absolute inset-y-0 right-0 rounded-full', fill)} style={{ width: `${value}%` }} />
    </div>
  );
}

/** Banner used for AI suggestions and companion actions (dark #433520 card). */
export function AiBanner({
  label,
  text,
  onClick,
  onDismiss,
  className,
}: {
  label: string;
  text: string;
  onClick?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div className={cx('bg-[#433520] text-white p-4 rounded-3xl shadow-2xl flex items-center gap-4 border border-[#D7A86E]/10', className)}>
      <button type="button" onClick={onClick} className="flex-1 flex items-center gap-4 text-right min-h-11">
        <span className="w-10 h-10 bg-[#8E3200] rounded-2xl flex items-center justify-center text-xl shadow-lg flex-shrink-0">
          <Icon name="fa-wand-magic-sparkles" className="text-[#D7A86E]" />
        </span>
        <span className="flex-1">
          <span className="block text-[9px] text-[#D7A86E] font-bold uppercase tracking-widest">{label}</span>
          <span className="block text-xs font-medium leading-relaxed">{text}</span>
        </span>
      </button>
      {onDismiss && (
        <button type="button" aria-label="بستن" onClick={onDismiss} className="text-white/40 p-2 min-w-11 min-h-11">
          <Icon name="fa-xmark" />
        </button>
      )}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className,
  icon,
  iconEnd,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  icon?: string;
  iconEnd?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'w-full bg-[#8E3200] text-white py-5 rounded-[2.5rem] font-bold shadow-xl shadow-[#8E3200]/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50',
        className,
      )}
    >
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {iconEnd && <Icon name={iconEnd} />}
    </button>
  );
}

/** Fixed bottom action area with the design's cream fade. */
export function BottomAction({ children }: { children: ReactNode }) {
  return (
    <div className="hide-on-keyboard fixed bottom-0 inset-x-app p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#FFF9F0] via-[#FFF9F0] to-transparent z-30">
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx('flex justify-center gap-2', className)} role="status" aria-label="در حال بارگذاری">
      <div className="w-2 h-2 bg-[#8E3200] rounded-full loading-dot dot-1" />
      <div className="w-2 h-2 bg-[#8E3200] rounded-full loading-dot dot-2" />
      <div className="w-2 h-2 bg-[#8E3200] rounded-full loading-dot" />
    </div>
  );
}

/** Placeholder while local data loads; the dots appear only if it takes noticeably long, so quick loads don't flash. */
export function Loading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, []);
  return <div className="min-h-[60vh] flex items-center justify-center">{show && <Spinner />}</div>;
}

export function ChipButton({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap min-h-9 transition-colors',
        active ? 'bg-[#8E3200] text-white' : 'bg-white border border-[#EEE2D3] text-gray-500',
        className,
      )}
    >
      {children}
    </button>
  );
}
