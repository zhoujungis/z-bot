import { Check, Circle, LoaderCircle, Minus, X } from 'lucide-react';
import type { Task } from '@zbot/shared';
import { cn } from '../lib/cn';
import { formatDuration, taskStatusLabel } from '../lib/format';
import { StatusBadge } from './StatusBadge';

function StepIcon({ status }: { status: Task['steps'][number]['status'] }): React.JSX.Element {
  if (status === 'completed') return <Check className="size-3.5" />;
  if (status === 'running') return <LoaderCircle className="size-3.5 animate-spin" />;
  if (status === 'failed') return <X className="size-3.5" />;
  if (status === 'skipped') return <Minus className="size-3.5" />;
  return <Circle className="size-3.5" />;
}

export function TaskSteps({ task, compact = false }: { task: Task; compact?: boolean }): React.JSX.Element {
  return (
    <div className={cn('space-y-4', compact && 'space-y-2')}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          tone={
            task.status === 'completed'
              ? 'success'
              : task.status === 'failed'
                ? 'danger'
                : task.status === 'waiting_permission'
                  ? 'warning'
                  : 'accent'
          }
        >
          {taskStatusLabel(task.status)}
        </StatusBadge>
        {task.stats.totalTokens > 0 ? (
          <span className="font-mono text-[10px] text-[var(--muted)]">
            {task.stats.totalTokens.toLocaleString()} tokens
          </span>
        ) : null}
        {task.stats.durationMs > 0 ? (
          <span className="font-mono text-[10px] text-[var(--muted)]">
            {formatDuration(task.stats.durationMs)}
          </span>
        ) : null}
      </div>

      <ol className="space-y-0" aria-label="任务步骤">
        {task.steps.map((step, index) => (
          <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < task.steps.length - 1 ? (
              <span className="absolute left-[9px] top-5 h-full w-px bg-[var(--line)]" />
            ) : null}
            <span
              className={cn(
                'relative z-10 mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full border',
                step.status === 'completed' &&
                  'border-[color-mix(in_oklch,var(--success)_40%,var(--line))] bg-[var(--success-soft)] text-[var(--success)]',
                step.status === 'running' &&
                  'border-[color-mix(in_oklch,var(--accent)_40%,var(--line))] bg-[var(--accent-soft)] text-[var(--accent)]',
                step.status === 'failed' &&
                  'border-[color-mix(in_oklch,var(--danger)_40%,var(--line))] bg-[var(--danger-soft)] text-[var(--danger)]',
                (step.status === 'pending' || step.status === 'skipped') &&
                  'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]'
              )}
            >
              <StepIcon status={step.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium leading-5">{step.title}</div>
              {step.detail ? (
                <div className="mt-0.5 break-words text-[11px] leading-5 text-[var(--muted)]">
                  {step.detail}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {task.error ? (
        <div className="rounded-lg border border-[color-mix(in_oklch,var(--danger)_25%,var(--line))] bg-[var(--danger-soft)] px-3 py-2 text-[11px] text-[var(--danger)]">
          {task.error}
        </div>
      ) : null}
    </div>
  );
}
