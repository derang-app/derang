import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx, Icon } from './kit';

/** Bottom sheet (reflection-card styling) over a warm dark backdrop. */
export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  useEscape(open, onClose);
  useBackToClose(open, onClose);
  useScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end animate-fade-in" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="بستن" className="absolute inset-0 bg-[#433520]/80" onClick={onClose} />
      <div className="relative reflection-card w-full max-w-[480px] mx-auto animate-slide-up max-h-[92vh] overflow-y-auto overscroll-contain pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="w-16 h-1 bg-[#EEE2D3] rounded-full mx-auto mb-6 -mt-4" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

let overlayIds = 0;
const openOverlays = new Set<number>();

// An overlay entry can be left behind when an action navigates while it closes (e.g. a menu item).
// Landing on such an entry later would make one back press do nothing, so skip past it.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const id = window.history.state?.overlay;
    if (id !== undefined && !openOverlays.has(id)) window.history.back();
  });
}

/**
 * Android back (gesture or button) closes the overlay instead of leaving the page:
 * opening adds a history entry, back pops it. Closing in-app removes the entry again.
 */
function useBackToClose(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  const entry = useRef<number | undefined>(undefined);
  const active = useRef(false);
  useEffect(() => {
    if (!open) return;
    active.current = true;
    // Reuse the entry if this is the same overlay re-running its effect (React StrictMode).
    if (entry.current === undefined || window.history.state?.overlay !== entry.current) {
      entry.current = ++overlayIds;
      window.history.pushState({ ...window.history.state, overlay: entry.current }, '');
    }
    const id = entry.current;
    openOverlays.add(id);
    const onPop = () => {
      if (window.history.state?.overlay !== id) {
        openOverlays.delete(id);
        close.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      active.current = false;
      window.removeEventListener('popstate', onPop);
      setTimeout(() => {
        if (active.current) return;
        openOverlays.delete(id);
        entry.current = undefined;
        // Closed in-app (not by back): drop our entry, unless something else was pushed on top.
        if (window.history.state?.overlay === id) window.history.back();
      }, 0);
    };
  }, [open]);
}

let scrollLocks = 0;

/** Keep the page behind a sheet from scrolling. */
function useScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
    return () => {
      if (--scrollLocks === 0) document.body.style.overflow = '';
    };
  }, [open]);
}

type Tone = 'danger' | 'success' | 'warn' | 'info';

interface DialogSpec {
  tone: Tone;
  icon?: string;
  title: string;
  message?: string;
  confirm: string;
  cancel?: string;
}

const TONE: Record<Tone, { box: string; icon: string; button: string }> = {
  danger: {
    box: 'bg-red-50 text-red-500',
    icon: 'fa-trash-can',
    button: 'flex-1 py-3 bg-red-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-red-500/20',
  },
  success: {
    box: 'bg-green-50 text-green-500',
    icon: 'fa-check-double',
    button: 'w-full py-4 bg-[#8E3200] text-white rounded-[2rem] text-sm font-bold shadow-xl shadow-[#8E3200]/20',
  },
  warn: {
    box: 'bg-[#FFF9F0] border-2 border-[#D7A86E] text-[#D7A86E]',
    icon: 'fa-file-pen',
    button: 'w-full py-4 bg-[#8E3200] text-white rounded-[2rem] text-sm font-bold shadow-xl shadow-[#8E3200]/20',
  },
  info: {
    box: 'bg-[#FFF9F0] text-[#8E3200]',
    icon: 'fa-circle-info',
    button: 'flex-1 py-3 bg-[#8E3200] text-white rounded-2xl text-xs font-bold shadow-lg shadow-[#8E3200]/20',
  },
};

function DialogView({ spec, onResult }: { spec: DialogSpec; onResult: (ok: boolean) => void }) {
  const tone = TONE[spec.tone];
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  useEscape(true, () => onResult(false));
  useBackToClose(true, () => onResult(false));
  useScrollLock(true);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-8 animate-fade-in" role="alertdialog" aria-modal="true" aria-label={spec.title}>
      <div className="absolute inset-0 bg-[#433520]/60" onClick={() => onResult(false)} />
      <div className="relative dialog-card space-y-6">
        <div className={cx('w-16 h-16 rounded-3xl flex items-center justify-center text-2xl mx-auto shadow-inner', tone.box)}>
          <Icon name={spec.icon ?? tone.icon} />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-[#4F4839]">{spec.title}</h3>
          {spec.message && <p className="text-xs text-gray-500 leading-relaxed px-2 whitespace-pre-line">{spec.message}</p>}
        </div>
        {spec.tone === 'warn' ? (
          <div className="flex flex-col gap-2">
            <button ref={confirmRef} type="button" className={tone.button} onClick={() => onResult(false)}>
              {spec.cancel ?? 'ادامه ثبت اطلاعات'}
            </button>
            <button type="button" className="w-full py-3 text-xs font-bold text-red-500" onClick={() => onResult(true)}>
              {spec.confirm}
            </button>
          </div>
        ) : spec.cancel ? (
          <div className="flex gap-3">
            <button type="button" className="flex-1 py-3 text-xs font-bold text-gray-500 min-h-11" onClick={() => onResult(false)}>
              {spec.cancel}
            </button>
            <button ref={confirmRef} type="button" className={tone.button} onClick={() => onResult(true)}>
              {spec.confirm}
            </button>
          </div>
        ) : (
          <button ref={confirmRef} type="button" className={tone.button} onClick={() => onResult(true)}>
            {spec.confirm}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface OverlayApi {
  confirm: (spec: Partial<DialogSpec> & { title: string; confirm: string }) => Promise<boolean>;
  toast: (message: string, tone?: 'ok' | 'error') => void;
}

const OverlayContext = createContext<OverlayApi | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<{ spec: DialogSpec; resolve: (ok: boolean) => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error'; id: number } | null>(null);

  const confirm = useCallback<OverlayApi['confirm']>(
    (spec) =>
      new Promise((resolve) => {
        setDialog({ spec: { tone: 'info', ...spec } as DialogSpec, resolve });
      }),
    [],
  );
  const showToast = useCallback<OverlayApi['toast']>((message, tone = 'ok') => {
    const id = Date.now();
    setToast({ message, tone, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3200);
  }, []);

  return (
    <OverlayContext.Provider value={{ confirm, toast: showToast }}>
      {children}
      {dialog && (
        <DialogView
          spec={dialog.spec}
          onResult={(ok) => {
            dialog.resolve(ok);
            setDialog(null);
          }}
        />
      )}
      {toast &&
        createPortal(
          <div className="fixed top-6 inset-x-app px-6 z-[70] pointer-events-none animate-fade-in" role="status" aria-live="polite">
            <div
              className={cx(
                'mx-auto w-fit max-w-full px-5 py-3 rounded-2xl text-xs font-bold shadow-xl flex items-center gap-2',
                toast.tone === 'ok' ? 'bg-[#433520] text-white' : 'bg-red-600 text-white',
              )}
            >
              <Icon name={toast.tone === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'} className="text-[#D7A86E]" />
              <span>{toast.message}</span>
            </div>
          </div>,
          document.body,
        )}
    </OverlayContext.Provider>
  );
}

export function useOverlay() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('OverlayProvider missing');
  return ctx;
}

/** Popup menu for the "⋮" button. */
export function Menu({
  items,
  className,
  buttonClassName,
}: {
  items: { label: string; icon: string; onClick: () => void; danger?: boolean }[];
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const hide = useCallback(() => setOpen(false), []);
  useBackToClose(open, hide);
  return (
    <div className={cx('relative', className)}>
      <button
        type="button"
        aria-label="گزینه‌های بیشتر"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName ?? 'w-12 h-12 glass-effect rounded-2xl flex items-center justify-center text-[#4F4839]'}
      >
        <Icon name="fa-ellipsis-vertical" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-14 z-50 w-56 bg-white rounded-3xl border border-[#EEE2D3] shadow-2xl p-2 animate-fade-in">
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cx(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-right active:bg-[#FCF8F2]',
                  it.danger ? 'text-red-500' : 'text-[#4F4839]',
                )}
              >
                <Icon name={it.icon} className={it.danger ? '' : 'text-[#D7A86E] w-4'} />
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
