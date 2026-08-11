import { useEffect, type ReactNode } from 'react';
import { da } from '../i18n/da';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  /** Rendered inside the middle button, e.g. "82,5". */
  format?: (value: number) => string;
  suffix?: string;
  label?: string;
  ariaLabel?: string;
  /** Optional second, coarser step shown as a long-press-free extra row. */
  bigStep?: number;
}

/**
 * The main input on the log screen: big +/- buttons so no keyboard is needed.
 * The value itself is a text field for the rare case a number is far off.
 */
export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  format = (v) => String(v),
  suffix,
  label,
  ariaLabel,
  bigStep,
}: StepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 1000) / 1000));

  return (
    <div>
      {label ? <span className="label">{label}</span> : null}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          className="btn btn-secondary w-14 shrink-0 text-2xl"
          aria-label={`${ariaLabel ?? label ?? ''} −${step}`}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <div className="flex min-h-[56px] flex-1 items-baseline justify-center gap-1 rounded-xl bg-ink-700 px-2 ring-1 ring-inset ring-ink-500">
          <span className="self-center text-3xl font-bold tabular-nums">{format(value)}</span>
          {suffix ? <span className="self-center text-sm text-slate-400">{suffix}</span> : null}
        </div>
        <button
          type="button"
          className="btn btn-secondary w-14 shrink-0 text-2xl"
          aria-label={`${ariaLabel ?? label ?? ''} +${step}`}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
      </div>
      {bigStep ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn btn-ghost h-10 min-h-[40px] flex-1 text-sm"
            onClick={() => onChange(clamp(value - bigStep))}
          >
            −{bigStep}
          </button>
          <button
            type="button"
            className="btn btn-ghost h-10 min-h-[40px] flex-1 text-sm"
            onClick={() => onChange(clamp(value + bigStep))}
          >
            +{bigStep}
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Bottom sheet — reachable with one thumb. */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={da.common.close}
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] overflow-y-auto rounded-t-3xl bg-ink-800 ring-1 ring-ink-600 safe-bottom">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-600 bg-ink-800 px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn btn-ghost px-3" onClick={onClose}>
            {da.common.close}
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 border-t border-ink-600 bg-ink-800 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div>
      {label ? <span className="label">{label}</span> : null}
      <div className="flex gap-1 rounded-xl bg-ink-700 p-1 ring-1 ring-inset ring-ink-500">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-semibold transition ${
              option.value === value ? 'bg-accent text-ink-900' : 'text-slate-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface RatingPickerProps {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
}

export function RatingPicker({ value, onChange, label }: RatingPickerProps) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(rating)}
            className={`btn h-12 flex-1 ${
              value === rating ? 'bg-accent text-ink-900' : 'bg-ink-700 text-slate-300'
            }`}
            aria-label={`${label}: ${da.rating[rating as 1 | 2 | 3 | 4 | 5]}`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl bg-ink-700 px-3 text-left ring-1 ring-inset ring-ink-500"
    >
      <span className="text-base">{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-accent' : 'bg-ink-500'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </span>
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between first:mt-0">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-ink-800 p-6 text-center text-slate-400">{children}</p>;
}
