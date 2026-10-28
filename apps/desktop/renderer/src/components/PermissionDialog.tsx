import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { StatusBadge } from './StatusBadge';

const riskTone = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger'
} as const;

const riskLabel = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重风险'
} as const;

export function PermissionDialog(): React.JSX.Element {
  const request = useChatStore((state) => state.pendingPermission);
  const respond = useChatStore((state) => state.respondPermission);

  return (
    <Dialog.Root open={Boolean(request)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.12_0.01_60/0.48)] backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-float)] outline-none"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          aria-describedby="permission-description"
        >
          {request ? (
            <>
              <div className="flex items-start gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--warning-soft)] text-[var(--warning)]">
                  <ShieldCheck className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Dialog.Title className="font-display text-[19px] font-semibold tracking-[-0.02em]">
                      {request.title}
                    </Dialog.Title>
                    <StatusBadge tone={riskTone[request.risk]}>
                      <AlertTriangle className="size-3" />
                      {riskLabel[request.risk]}
                    </StatusBadge>
                  </div>
                  <p
                    id="permission-description"
                    className="mt-1.5 break-words text-[12px] leading-5 text-[var(--muted-strong)]"
                  >
                    {request.description}
                  </p>
                </div>
              </div>

              {request.operations.length > 0 ? (
                <div className="mt-5 max-h-[260px] overflow-auto rounded-xl border border-[var(--line)] bg-[var(--paper-deep)]">
                  {request.operations.map((operation, index) => (
                    <div
                      key={`${operation.action}-${index}`}
                      className="border-b border-[var(--line)] px-4 py-3 last:border-b-0"
                    >
                      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
                        {operation.action}
                      </div>
                      {operation.from ? (
                        <div className="mt-1 break-all font-mono text-[10px] leading-5 text-[var(--muted-strong)]">
                          FROM {operation.from}
                        </div>
                      ) : null}
                      {operation.to ? (
                        <div className="break-all font-mono text-[10px] leading-5 text-[var(--ink)]">
                          TO {operation.to}
                        </div>
                      ) : null}
                      {operation.detail ? (
                        <div className="mt-1 text-[11px] text-[var(--muted)]">
                          {operation.detail}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void respond('deny')}
                >
                  拒绝
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void respond('allow_once')}
                >
                  允许一次
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => void respond('allow_scope')}
                >
                  允许此类操作
                </button>
              </div>
              <p className="mt-3 text-right text-[10px] text-[var(--muted)]">
                “允许此类操作”仅适用于当前工具和范围
              </p>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
