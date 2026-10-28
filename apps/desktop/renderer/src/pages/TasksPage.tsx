import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Square,
  Wrench
} from 'lucide-react';
import type { ChatEvent, Task } from '@zbot/shared';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { TaskSteps } from '../components/TaskSteps';
import { formatDuration, formatRelative, taskStatusLabel } from '../lib/format';
import { cn } from '../lib/cn';

function statusTone(task: Task): 'accent' | 'success' | 'warning' | 'danger' | 'muted' {
  if (task.status === 'completed') return 'success';
  if (task.status === 'failed') return 'danger';
  if (task.status === 'waiting_permission') return 'warning';
  if (task.status === 'cancelled' || task.status === 'paused') return 'muted';
  return 'accent';
}

function mergeTask(tasks: Task[], task: Task): Task[] {
  const existing = tasks.findIndex((item) => item.id === task.id);
  if (existing < 0) return [task, ...tasks];
  return tasks.map((item, index) => (index === existing ? task : item));
}

export function TasksPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('task'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const next = await window.zbot.tasks.list();
      setTasks(next);
      setError(null);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const requested = params.get('task');
    if (requested) setSelectedId(requested);
  }, [params]);

  useEffect(() => {
    const unsubscribe = window.zbot.chat.onEvent((event: ChatEvent) => {
      if (event.type === 'chat.task') {
        setTasks((current) => mergeTask(current, event.task));
        setSelectedId((current) => current ?? event.task.id);
      }
      if (event.type === 'chat.done' || event.type === 'chat.error') {
        void load();
      }
    });
    return unsubscribe;
  }, []);

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null;
  const running = selected
    ? ['pending', 'running', 'waiting_permission', 'paused'].includes(selected.status)
    : false;

  const select = (id: string): void => {
    setSelectedId(id);
    setParams({ task: id });
  };

  const cancel = async (): Promise<void> => {
    if (!selected) return;
    try {
      await window.zbot.tasks.cancel(selected.id);
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    }
  };

  return (
    <div className="page-frame">
      <div className="page-inner">
        <PageHeader
          kicker="Execution"
          title="Tasks"
          subtitle="复杂请求会变成可观察、可停止、可验证的任务。模型说完成不算完成，工具结果才算。"
          actions={
            <button type="button" onClick={() => void load()} className="btn btn-secondary">
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
              刷新
            </button>
          }
        />

        {error ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-[color-mix(in_oklch,var(--danger)_30%,var(--line))] bg-[var(--danger-soft)] px-4 py-3 text-[12px] text-[var(--danger)]">
            <AlertCircle className="size-4" />
            {error}
          </div>
        ) : null}

        {tasks.length === 0 && !loading ? (
          <div className="mt-12 grid min-h-[340px] place-items-center border-y border-[var(--line)]">
            <div className="max-w-[430px] text-center">
              <div className="empty-mark mx-auto">
                <ListChecks className="size-[19px]" />
              </div>
              <h2 className="mt-5 font-display text-[18px] font-semibold">还没有任务</h2>
              <p className="mt-2 text-[13px] leading-6 text-[var(--muted-strong)]">
                当你要求整理文件或执行多步操作时，步骤、权限和结果会出现在这里。
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid min-h-[460px] gap-8 lg:grid-cols-[280px_1fr]">
            <aside>
              <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-3">
                <span className="font-display text-[15px] font-semibold">历史</span>
                {loading ? <LoaderCircle className="size-3.5 animate-spin text-[var(--muted)]" /> : null}
              </div>
              <div className="max-h-[620px] overflow-y-auto">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => select(task.id)}
                    className={cn(
                      'flex w-full flex-col gap-1.5 border-b border-[var(--line)] px-2 py-3.5 text-left transition-colors',
                      task.id === selected?.id ? 'bg-[var(--nav-active)]' : 'hover:bg-[var(--nav-hover)]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[12px] font-medium">{task.title}</span>
                      <StatusBadge tone={statusTone(task)}>{taskStatusLabel(task.status)}</StatusBadge>
                    </div>
                    <span className="text-[10px] text-[var(--muted)]">
                      {formatRelative(task.updatedAt)} · {task.steps.length} 步
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="min-w-0">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-[22px] font-semibold tracking-[-0.025em]">
                          {selected.title}
                        </h2>
                        <StatusBadge tone={statusTone(selected)}>
                          {taskStatusLabel(selected.status)}
                        </StatusBadge>
                      </div>
                      <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-[12px] leading-6 text-[var(--muted-strong)]">
                        {selected.prompt}
                      </p>
                    </div>
                    {running ? (
                      <button className="btn btn-secondary" type="button" onClick={() => void cancel()}>
                        <Square className="size-3.5 fill-current" />
                        停止任务
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_220px]">
                    <div>
                      <div className="mb-4 text-[11px] font-semibold text-[var(--muted-strong)]">
                        执行步骤
                      </div>
                      <TaskSteps task={selected} />
                    </div>

                    <aside className="h-fit rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold">
                        <Wrench className="size-3.5 text-[var(--muted)]" />
                        统计
                      </div>
                      <dl className="space-y-3 text-[11px]">
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--muted)]">Model</dt>
                          <dd className="max-w-[130px] truncate text-right font-mono text-[9px]">
                            {selected.stats.model ?? '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--muted)]">Tokens</dt>
                          <dd className="font-mono text-[10px]">
                            {selected.stats.totalTokens.toLocaleString()}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--muted)]">Tool calls</dt>
                          <dd className="font-mono text-[10px]">{selected.stats.toolCalls}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--muted)]">Duration</dt>
                          <dd className="font-mono text-[10px]">
                            {formatDuration(selected.stats.durationMs)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-[var(--muted)]">Retries</dt>
                          <dd className="font-mono text-[10px]">{selected.stats.retries}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 border-t border-[var(--line)] pt-3 text-[10px] leading-5 text-[var(--muted)]">
                        每一步的完成状态和验证结果来自工具，而不是模型自述。
                      </div>
                    </aside>
                  </div>
                </>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
