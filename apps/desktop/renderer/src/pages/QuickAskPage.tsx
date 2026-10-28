import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Brain, CheckSquare, Clock3, LoaderCircle, MessageSquare, X } from 'lucide-react';
import type { ChatEvent, PermissionRequest } from '@zbot/shared';
import { cn } from '../lib/cn';
import { StatusBadge } from '../components/StatusBadge';
import { LogoMark } from '../components/LogoMark';

type QuickAction = 'ask' | 'remember' | 'todo' | 'reminder';

const actions: Array<{ id: QuickAction; label: string; icon: typeof MessageSquare }> = [
  { id: 'ask', label: 'Ask', icon: MessageSquare },
  { id: 'remember', label: 'Remember', icon: Brain },
  { id: 'todo', label: 'Todo', icon: CheckSquare },
  { id: 'reminder', label: 'Reminder', icon: Clock3 }
];

export function QuickAskPage(): React.JSX.Element {
  const [text, setText] = useState('');
  const [action, setAction] = useState<QuickAction>('ask');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const awaitingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const unsubscribe = window.zbot.chat.onEvent((event: ChatEvent) => {
      if (
        event.type === 'chat.started' &&
        awaitingRef.current &&
        !requestIdRef.current
      ) {
        requestIdRef.current = event.requestId;
        setConversationId(event.conversationId);
      }
      const requestId = requestIdRef.current;
      if (!requestId || !('requestId' in event) || event.requestId !== requestId) return;

      switch (event.type) {
        case 'chat.delta':
          setAnswer((value) => value + event.delta);
          break;
        case 'chat.permission':
          setPermission(event.request);
          break;
        case 'chat.done':
          setBusy(false);
          awaitingRef.current = false;
          requestIdRef.current = null;
          setPermission(null);
          break;
        case 'chat.error':
          setBusy(false);
          awaitingRef.current = false;
          requestIdRef.current = null;
          setError(event.error.message);
          break;
        case 'chat.cancelled':
          setBusy(false);
          awaitingRef.current = false;
          requestIdRef.current = null;
          setPermission(null);
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [answer, permission]);

  const send = async (): Promise<void> => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setAnswer('');
    setError(null);
    setPermission(null);
    requestIdRef.current = null;
    awaitingRef.current = true;
    try {
      const result = await window.zbot.chat.send({
        ...(conversationId ? { conversationId } : {}),
        content: text.trim(),
        attachments: [],
        ...(action !== 'ask' ? { quickAction: action } : {})
      });
      setConversationId(result.conversationId);
      if (!requestIdRef.current) requestIdRef.current = result.requestId;
    } catch (sendError) {
      awaitingRef.current = false;
      setBusy(false);
      setError(
        (sendError instanceof Error ? sendError.message : String(sendError)).replace(
          /^Error invoking remote method '[^']+':\s*/i,
          ''
        )
      );
    }
  };

  const respond = async (decision: 'allow_once' | 'allow_scope' | 'deny'): Promise<void> => {
    if (!permission) return;
    try {
      await window.zbot.permissions.respond({ requestId: permission.id, decision });
      setPermission(null);
    } catch (respondError) {
      setError(respondError instanceof Error ? respondError.message : String(respondError));
    }
  };

  const openInMain = async (): Promise<void> => {
    await window.zbot.app.navigate({
      page: 'chat',
      ...(conversationId ? { conversationId } : {})
    });
    window.close();
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-float)]">
      <div className="drag-region flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-6 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)]">
            <LogoMark className="size-4" />
          </div>
          <span className="text-[12px] font-semibold">Quick Ask</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Ctrl + Space
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className="no-drag grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
          aria-label="关闭 Quick Ask"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {answer ? (
          <div className="whitespace-pre-wrap text-[13px] leading-6">{answer}</div>
        ) : busy ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
            <LoaderCircle className="size-3.5 animate-spin" />
            正在处理…
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center">
            <div className="page-kicker">Personal context</div>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted-strong)]">
              快速提问、记住一件事、创建待办或提醒。复杂操作会在主窗口里继续。
            </p>
          </div>
        )}

        {permission ? (
          <div className="mt-4 rounded-xl border border-[color-mix(in_oklch,var(--warning)_35%,var(--line))] bg-[var(--warning-soft)] p-3">
            <div className="flex items-center gap-2">
              <StatusBadge tone="warning">需要确认</StatusBadge>
              <span className="text-[11px] font-semibold">{permission.title}</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--muted-strong)]">
              {permission.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-secondary min-h-8 px-3 text-[11px]" type="button" onClick={() => void respond('deny')}>
                拒绝
              </button>
              <button className="btn btn-secondary min-h-8 px-3 text-[11px]" type="button" onClick={() => void respond('allow_once')}>
                允许一次
              </button>
              <button className="btn btn-primary min-h-8 px-3 text-[11px]" type="button" onClick={() => void respond('allow_scope')}>
                允许此类操作
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-[color-mix(in_oklch,var(--danger)_25%,var(--line))] bg-[var(--danger-soft)] px-3 py-2 text-[11px] text-[var(--danger)]">
            {error}
          </div>
        ) : null}
      </div>

      {answer && !busy ? (
        <button
          type="button"
          onClick={() => void openInMain()}
          className="mx-4 mb-1 flex items-center gap-1.5 self-start text-[11px] font-semibold text-[var(--accent)] hover:underline"
        >
          在主窗口中打开
          <ArrowUpRight className="size-3" />
        </button>
      ) : null}

      <div className="shrink-0 border-t border-[var(--line)] p-3">
        <div className="mb-2 flex gap-1.5">
          {actions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAction(item.id)}
              className={cn(
                'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition-colors',
                action === item.id
                  ? 'border-[color-mix(in_oklch,var(--accent)_28%,var(--line))] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]'
              )}
            >
              <item.icon className="size-3" />
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 focus-within:border-[var(--accent)]">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={
              action === 'remember'
                ? '要记住什么？'
                : action === 'todo'
                  ? '创建一个待办…'
                  : action === 'reminder'
                    ? '什么时候提醒你什么？'
                    : '问 Z Bot…'
            }
            rows={2}
            className="min-h-[52px] flex-1 resize-none bg-transparent px-2 py-1 text-[13px] leading-6 outline-none placeholder:text-[var(--muted-faint)]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !text.trim()}
            className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] disabled:opacity-40"
            aria-label="发送"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ArrowUpRight className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
