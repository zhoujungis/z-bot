import {
  AlertCircle,
  Check,
  ChevronDown,
  LoaderCircle,
  ShieldAlert,
  Wrench,
  X
} from 'lucide-react';
import type { ToolCallView } from '@zbot/shared';
import { StatusBadge } from './StatusBadge';

const statusTone = {
  running: 'accent',
  waiting_permission: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'muted'
} as const;

function StatusIcon({ status }: { status: ToolCallView['status'] }): React.JSX.Element {
  if (status === 'running') return <LoaderCircle className="size-3.5 animate-spin" />;
  if (status === 'waiting_permission') return <ShieldAlert className="size-3.5" />;
  if (status === 'completed') return <Check className="size-3.5" />;
  if (status === 'failed') return <X className="size-3.5" />;
  return <AlertCircle className="size-3.5" />;
}

export function ToolCallCard({ toolCall }: { toolCall: ToolCallView }): React.JSX.Element {
  const hasDetails = Boolean(toolCall.argsPreview || toolCall.resultPreview || toolCall.error);
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[color-mix(in_oklch,var(--surface)_72%,transparent)]">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--nav-hover)] text-[var(--muted-strong)]">
          <Wrench className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold">{toolCall.label}</span>
            <StatusBadge tone={statusTone[toolCall.status]}>
              <StatusIcon status={toolCall.status} />
              {toolCall.status === 'running'
                ? '执行中'
                : toolCall.status === 'waiting_permission'
                  ? '等待确认'
                  : toolCall.status === 'completed'
                    ? '完成'
                    : toolCall.status === 'failed'
                      ? '失败'
                      : '取消'}
            </StatusBadge>
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">
            {toolCall.error || toolCall.summary}
          </div>
        </div>
      </div>
      {hasDetails ? (
        <details className="group border-t border-[var(--line)]">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-3.5 text-[10px] font-medium text-[var(--muted)] hover:text-[var(--ink)]">
            <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
            查看详情
          </summary>
          <div className="space-y-2 px-3.5 pb-3 font-mono text-[10px] leading-5 text-[var(--muted-strong)]">
            {toolCall.argsPreview ? (
              <div>
                <div className="mb-1 text-[var(--muted)]">ARGS</div>
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--paper-deep)] p-2">
                  {toolCall.argsPreview}
                </pre>
              </div>
            ) : null}
            {toolCall.resultPreview ? (
              <div>
                <div className="mb-1 text-[var(--muted)]">RESULT</div>
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--paper-deep)] p-2">
                  {toolCall.resultPreview}
                </pre>
              </div>
            ) : null}
            {toolCall.error ? (
              <div className="text-[var(--danger)]">{toolCall.error}</div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
