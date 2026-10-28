import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  CheckSquare,
  FolderOpen,
  LoaderCircle,
  MessageSquare,
  Plus,
  SendHorizontal,
  Sparkles
} from 'lucide-react';
import type { HomeSummary, ModelConfig } from '@zbot/shared';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { formatRelative, priorityLabel, taskStatusLabel } from '../lib/format';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
  const send = useChatStore((state) => state.send);
  const submitting = useChatStore((state) => state.submitting);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [providers, setProviders] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([window.zbot.home.summary(), window.zbot.providers.list()])
      .then(([nextSummary, nextProviders]) => {
        if (!active) return;
        setSummary(nextSummary);
        setProviders(nextProviders);
        setLoading(false);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const date = new Intl.DateTimeFormat(settings.general.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date());

  const openTasks = summary?.tasks ?? [];
  const openTodos = (summary?.todos ?? []).filter((todo) => !todo.completed);
  const upcomingReminders = summary?.reminders ?? [];

  const submit = async (): Promise<void> => {
    if (!prompt.trim() || submitting) return;
    const ok = await send(prompt);
    if (ok) {
      setPrompt('');
      navigate('/chat');
    }
  };

  return (
    <div className="page-frame">
      <div className="page-inner">
        <PageHeader
          kicker={date}
          title={`${greeting()}。`}
          subtitle="今天要做的事、最近的上下文，以及 Z Bot 真正记得的信息，都会在这里汇合。"
          actions={
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/chat')}>
              <Plus className="size-4" />
              新对话
            </button>
          }
        />

        {!loading && providers.length === 0 ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[color-mix(in_oklch,var(--accent)_25%,var(--line))] bg-[var(--accent-soft)] px-5 py-4">
            <div>
              <div className="text-[13px] font-semibold">先配置一个模型</div>
              <div className="mt-1 text-[11px] text-[var(--muted-strong)]">
                支持 OpenAI-compatible、Anthropic、Google 和本地 Ollama。
              </div>
            </div>
            <Link to="/settings?section=ai" className="btn btn-primary min-h-9">
              配置 AI
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : null}

        {error ? (
          <div className="mt-8 rounded-xl border border-[color-mix(in_oklch,var(--danger)_30%,var(--line))] bg-[var(--danger-soft)] px-4 py-3 text-[12px] text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        <section className="mt-12 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-3">
              <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">今天</h2>
              <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--muted)]">
                {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                <span>{summary?.counts.openTasks ?? 0} TASKS</span>
                <span>{summary?.counts.openTodos ?? 0} TODOS</span>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-[12px] text-[var(--muted)]">正在读取本地安排…</div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {openTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate(`/tasks?task=${encodeURIComponent(task.id)}`)}
                    className="group flex w-full items-start gap-3 py-4 text-left transition-[padding] hover:px-1"
                  >
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--nav-hover)] text-[var(--muted)]">
                      {task.status === 'running' || task.status === 'waiting_permission' ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium">{task.title}</span>
                        <StatusBadge tone={task.status === 'waiting_permission' ? 'warning' : 'accent'}>
                          {taskStatusLabel(task.status)}
                        </StatusBadge>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">
                        {task.steps.filter((step) => step.status === 'completed').length} /{' '}
                        {task.steps.length} 步 · {formatRelative(task.updatedAt)}
                      </div>
                    </div>
                    <ArrowRight className="mt-1 size-3.5 text-[var(--muted-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--muted)]" />
                  </button>
                ))}

                {openTodos.slice(0, 5).map((todo) => (
                  <div key={todo.id} className="flex items-start gap-3 py-4">
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--nav-hover)] text-[var(--muted)]">
                      <CheckSquare className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">{todo.title}</div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">
                        {priorityLabel(todo.priority)}优先级
                        {todo.dueAt ? ` · ${formatRelative(todo.dueAt)}` : ''}
                      </div>
                    </div>
                    <StatusBadge tone={todo.priority === 'high' ? 'warning' : 'muted'}>
                      {priorityLabel(todo.priority)}
                    </StatusBadge>
                  </div>
                ))}

                {upcomingReminders.slice(0, 4).map((reminder) => (
                  <div key={reminder.id} className="flex items-start gap-3 py-4">
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--nav-hover)] text-[var(--muted)]">
                      <BellRing className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">{reminder.title}</div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">
                        {formatRelative(reminder.triggerAt)}
                        {reminder.repeat ? ' · 重复提醒' : ''}
                      </div>
                    </div>
                  </div>
                ))}

                {openTasks.length === 0 && openTodos.length === 0 && upcomingReminders.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-start justify-center">
                    <div className="empty-mark">
                      <Sparkles className="size-[18px]" />
                    </div>
                    <h3 className="mt-5 font-display text-[19px] font-semibold">今天还没有安排</h3>
                    <p className="mt-2 max-w-[46ch] text-[13px] leading-6 text-[var(--muted-strong)]">
                      告诉 Z Bot 要记住什么、提醒什么，或者直接问它一个问题。
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-10">
            <section>
              <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-3">
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                  最近项目
                </h2>
                <Link to="/memory" className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)]">
                  全部
                </Link>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {(summary?.projects ?? []).slice(0, 5).map((project) => (
                  <div key={project.id} className="flex items-center gap-3 py-3.5">
                    <FolderOpen className="size-4 text-[var(--muted)]" />
                    <div className="min-w-0 flex-1 truncate text-[12px] font-medium">
                      {project.name}
                    </div>
                    <span className="font-mono text-[9px] text-[var(--muted-faint)]">
                      {project.path ? 'LOCAL' : 'MEMORY'}
                    </span>
                  </div>
                ))}
                {(summary?.projects ?? []).length === 0 ? (
                  <p className="py-4 text-[12px] leading-6 text-[var(--muted)]">
                    还没有项目。Memory 可以按项目分别保存目标和决策。
                  </p>
                ) : null}
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-3">
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                  最近对话
                </h2>
                <Link to="/chat" className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)]">
                  打开 Chat
                </Link>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {(summary?.recentConversations ?? []).slice(0, 5).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => navigate(`/chat?conversation=${encodeURIComponent(conversation.id)}`)}
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                  >
                    <MessageSquare className="size-4 shrink-0 text-[var(--muted)]" />
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {conversation.title}
                    </span>
                    <span className="text-[10px] text-[var(--muted-faint)]">
                      {formatRelative(conversation.updatedAt)}
                    </span>
                  </button>
                ))}
                {(summary?.recentConversations ?? []).length === 0 ? (
                  <p className="py-4 text-[12px] leading-6 text-[var(--muted)]">
                    开始一段对话后，这里会显示最近的上下文。
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </section>

        <section className="mt-12 border-t border-[var(--line)] pt-8">
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_12px_35px_oklch(0.2_0.02_60/0.05)] focus-within:border-[var(--accent)]">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              className="min-h-[58px] flex-1 resize-none bg-transparent px-3 py-2 text-[14px] leading-6 outline-none placeholder:text-[var(--muted-faint)]"
              placeholder="你想做什么？"
              aria-label="向 Z Bot 提问"
            />
            <button
              className="btn btn-primary mb-1 min-h-10 rounded-xl px-4"
              type="button"
              disabled={!prompt.trim() || submitting}
              onClick={() => void submit()}
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <SendHorizontal className="size-4" />
              )}
              发送
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-[var(--muted)]">
            Ctrl + Space 可随时唤起 Quick Ask · 本地数据不会自动上传
          </p>
        </section>
      </div>
    </div>
  );
}
