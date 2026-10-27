import { useId, useState, type ReactNode } from 'react';
import { formatJalali, parseJalali } from '../lib/date';
import { fa } from '../lib/text';
import { cx, Icon } from './kit';
import { Sheet } from './overlay';

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="field-label block">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[10px] text-gray-500 pr-4 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  ltr,
  numeric,
  multiline,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  ltr?: boolean;
  numeric?: boolean;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="input-field h-32 resize-none pt-4"
          />
        ) : (
          <input
            id={id}
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            inputMode={numeric ? 'decimal' : undefined}
            dir={ltr ? 'ltr' : undefined}
            className={cx('input-field', ltr && 'text-left')}
          />
        )
      }
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <Field label={label}>
      {(id) => <Choice id={id} label={label} value={value} onChange={onChange} options={options} className="input-field" />}
    </Field>
  );
}

/**
 * Dropdown replacement: a field-styled button that opens a bottom sheet of options
 * (the sort sheet's settings-item rows) instead of the platform's native picker.
 */
export function Choice<T extends string | number>({
  id,
  label,
  value,
  onChange,
  options,
  className,
  columns,
}: {
  id?: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  className: string;
  /** Lay short options out as a grid of chips instead of full-width rows. */
  columns?: number;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(([v]) => v === value)?.[1] ?? '';
  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <>
      <button
        id={id}
        type="button"
        aria-label={id ? undefined : label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cx(className, 'relative flex items-center justify-between gap-2 text-right')}
      >
        <span className="truncate">{current}</span>
        <Icon name="fa-chevron-down" className="text-[10px] text-gray-400 flex-shrink-0" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label={label}>
        <h2 className="text-lg font-bold text-center mb-6">{label}</h2>
        {columns ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {options.map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={v === value}
                onClick={() => pick(v)}
                className={cx(
                  'py-3 rounded-2xl text-sm font-bold border min-h-11',
                  v === value ? 'bg-[#8E3200] border-[#8E3200] text-white shadow-lg shadow-[#8E3200]/20' : 'bg-white border-[#EEE2D3] text-[#4F4839]',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {options.map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={v === value}
                onClick={() => pick(v)}
                className={cx('settings-item', v === value && 'border-[#8E3200]')}
              >
                <span className="text-sm font-bold">{l}</span>
                {v === value && <Icon name="fa-check" className="text-[#8E3200]" />}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Jalali date typed as ۱۴۰۲/۰۷/۳۰; empty allowed. */
export function JalaliField({
  label,
  value,
  onChange,
  soft,
}: {
  label: string;
  value: number | undefined;
  onChange: (ts: number | undefined) => void;
  soft?: boolean;
}) {
  const [text, setText] = useState(formatJalali(value));
  const [error, setError] = useState(false);
  return (
    <Field label={label} hint={error ? 'تاریخ را به شکل ۱۴۰۳/۰۵/۲۰ وارد کن.' : undefined}>
      {(id) => (
        <div className="relative">
          <input
            id={id}
            value={text}
            inputMode="numeric"
            placeholder="۱۴۰۳/۰۱/۱۵"
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              if (!v.trim()) {
                setError(false);
                onChange(undefined);
                return;
              }
              const ts = parseJalali(v);
              setError(ts === undefined);
              if (ts !== undefined) onChange(ts);
            }}
            className={cx(soft ? 'input-soft' : 'input-field', error && 'border-red-400')}
          />
          <Icon name="fa-calendar-days" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none" />
        </div>
      )}
    </Field>
  );
}

/**
 * "My favourite player counts": tappable counts bounded by the game's allowed range
 * (1–8 until that is filled in). Any already-picked count outside it stays visible so it can be removed.
 */
export function PlayerCountPicker({
  value,
  onChange,
  range,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  range: { min?: number; max?: number };
}) {
  const lo = Math.max(1, Math.round(range.min ?? 1));
  const hi = Math.min(lo + 11, Math.max(lo, Math.round(range.max ?? (range.min === undefined ? 8 : lo))));
  const counts = [...new Set([...Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), ...value])].sort((a, b) => a - b);
  const toggle = (n: number) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b));
  const known = range.min !== undefined || range.max !== undefined;
  return (
    <div className="space-y-2">
      <p className="field-label">تعداد موردعلاقهٔ من</p>
      <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="تعداد موردعلاقهٔ من">
        {counts.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value.includes(n)}
            onClick={() => toggle(n)}
            className={cx(
              'w-11 h-11 rounded-2xl text-sm font-bold border',
              value.includes(n) ? 'bg-[#8E3200] border-[#8E3200] text-white shadow-lg shadow-[#8E3200]/20' : 'bg-white border-[#EEE2D3] text-[#4F4839]',
            )}
          >
            {fa(n)}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 pr-4 leading-relaxed">
        {known ? `از ${fa(lo)} تا ${fa(hi)} نفر، یعنی همان تعداد مجاز بازی.` : 'تا تعداد مجاز بازی را ننوشته‌ای، از ۱ تا ۸ نفر.'} چند عدد را می‌شود با هم انتخاب کرد؛ بر اساس تجربهٔ خودت.
      </p>
    </div>
  );
}

/** Tag chips with remove buttons plus a quick-add input; suggestions are tappable. */
export function TagEditor({
  label,
  tags,
  onChange,
  suggestions = [],
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
}) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const add = (t: string) => {
    const v = t.trim().replace(/^#/, '');
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft('');
  };
  const rest = suggestions.filter((s) => !tags.includes(s));
  return (
    <div className="space-y-2">
      <p className="field-label">{label}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`حذف ${t}`}
            className="px-3 py-1.5 bg-white border border-[#EEE2D3] text-[#8E3200] text-[11px] rounded-full font-bold min-h-8"
          >
            #{t} <Icon name="fa-xmark" className="mr-1 text-[9px]" />
          </button>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(draft);
              }
            }}
            onBlur={() => {
              add(draft);
              setAdding(false);
            }}
            placeholder="برچسب..."
            className="px-3 py-1 border border-[#8E3200] rounded-full text-[11px] w-28 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 border border-dashed border-[#D7A86E] text-[#8E3200] text-[11px] rounded-full font-bold min-h-8"
          >
            + افزودن
          </button>
        )}
      </div>
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {rest.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold text-gray-500 bg-[#EEE2D3]/40 min-h-7"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** «تکمیل هوشمند» toggle card from AddEntry. */
export function AiHelperToggle({
  on,
  onChange,
  configured,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  configured: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="w-full bg-[#433520] p-5 rounded-[2rem] flex items-center justify-between shadow-lg text-right"
    >
      <span className="flex items-center gap-3">
        <span className="w-10 h-10 bg-[#8E3200] rounded-xl flex items-center justify-center text-white flex-shrink-0">
          <Icon name="fa-wand-magic-sparkles" />
        </span>
        <span>
          <span className="block text-xs font-bold text-white">تکمیل هوشمند اطلاعات</span>
          <span className="block text-[10px] text-[#D7A86E] leading-relaxed">
            {configured
              ? 'پس از ذخیره، نام و عکس برای شناسایی به هوش مصنوعی فرستاده می‌شود و پیشنهادها را قبل از اعمال می‌بینی.'
              : 'نیازمند تنظیم کلید سرویس در تنظیمات'}
          </span>
        </span>
      </span>
      <span className={cx('w-12 h-6 rounded-full relative p-1 shadow-inner flex-shrink-0 mr-2', on ? 'bg-[#8E3200]' : 'bg-white/20')}>
        <span className={cx('w-4 h-4 bg-white rounded-full absolute transition-all', on ? 'left-1' : 'right-1')} />
      </span>
    </button>
  );
}
