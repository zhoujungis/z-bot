import { cn } from '../lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)]',
  accent: 'border-[color-mix(in_oklch,var(--accent)_30%,var(--line))] bg-[var(--accent-soft)] text-[var(--accent)]',
  success: 'border-[color-mix(in_oklch,var(--success)_30%,var(--line))] bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'border-[color-mix(in_oklch,var(--warning)_35%,var(--line))] bg-[var(--warning-soft)] text-[var(--warning)]',
  danger: 'border-[color-mix(in_oklch,var(--danger)_30%,var(--line))] bg-[var(--danger-soft)] text-[var(--danger)]',
  muted: 'border-transparent bg-[var(--nav-hover)] text-[var(--muted)]'
};

export function StatusBadge({
  children,
  tone = 'neutral',
  className
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex min-h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold tracking-[0.02em]',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
