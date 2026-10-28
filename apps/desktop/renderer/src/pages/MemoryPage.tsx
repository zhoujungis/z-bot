import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  Brain,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import type {
  Memory,
  MemoryInput,
  MemoryType,
  Project
} from '@zbot/shared';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { formatRelative } from '../lib/format';
import { cn } from '../lib/cn';

const typeLabels: Record<MemoryType, string> = {
  user: '用户',
  project: '项目',
  event: '事件',
  task: '任务',
  global: '全局'
};

const memoryTypes: MemoryType[] = ['user', 'project', 'event', 'task', 'global'];

interface MemoryDraft {
  id?: string;
  content: string;
  type: MemoryType;
  projectId: string;
  importance: number;
  confidence: number;
  tags: string;
  expiresDate: string;
}

function emptyDraft(): MemoryDraft {
  return {
    content: '',
    type: 'user',
    projectId: '',
    importance: 0.7,
    confidence: 0.9,
    tags: '',
    expiresDate: ''
  };
}

function draftFrom(memory: Memory): MemoryDraft {
  return {
    id: memory.id,
    content: memory.content,
    type: memory.type,
    projectId: memory.projectId ?? '',
    importance: memory.importance,
    confidence: memory.confidence,
    tags: memory.tags.join(', '),
    expiresDate: memory.expiresAt
      ? new Date(memory.expiresAt).toISOString().slice(0, 10)
      : ''
  };
}

export function MemoryPage(): React.JSX.Element {
  const [params] = useSearchParams();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryType | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<MemoryDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(params.get('memory'));

  const search = async (
    nextQuery = query,
    nextType = typeFilter,
    nextProject = projectFilter
  ): Promise<void> => {
    setLoading(true);
    try {
      const input = {
        ...(nextQuery.trim() ? { query: nextQuery.trim() } : {}),
        ...(nextType !== 'all' ? { types: [nextType] } : {}),
        ...(nextProject ? { projectId: nextProject } : {}),
        limit: 100
      };
      const next = nextQuery.trim()
        ? await window.zbot.memory.search(input)
        : await window.zbot.memory.list(input);
      setMemories(next);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([window.zbot.projects.list(), window.zbot.memory.list({ limit: 100 })])
      .then(([nextProjects, nextMemories]) => {
        setProjects(nextProjects);
        setMemories(nextMemories);
        setLoading(false);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, typeFilter, projectFilter]);

  useEffect(() => {
    if (!highlight) return;
    const element = document.querySelector<HTMLElement>(
      `[data-memory-id="${CSS.escape(highlight)}"]`
    );
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = window.setTimeout(() => setHighlight(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlight, memories]);

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );

  const openCreate = (): void => {
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (memory: Memory): void => {
    setDraft(draftFrom(memory));
    setDialogOpen(true);
  };

  const save = async (): Promise<void> => {
    if (!draft.content.trim()) return;
    setSaving(true);
    try {
      const input: MemoryInput = {
        ...(draft.id ? { id: draft.id } : {}),
        type: draft.type,
        content: draft.content.trim(),
        projectId: draft.projectId || null,
        importance: draft.importance,
        confidence: draft.confidence,
        tags: draft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        expiresAt: draft.expiresDate
          ? new Date(`${draft.expiresDate}T23:59:59`).getTime()
          : null
      };
      await window.zbot.memory.upsert(input);
      setDialogOpen(false);
      await search();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (memory: Memory): Promise<void> => {
    if (!window.confirm('永久删除这条记忆？此操作不能撤销。')) return;
    try {
      await window.zbot.memory.remove(memory.id);
      await search();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  };

  const clearAll = async (): Promise<void> => {
    if (!window.confirm('永久清空全部 Memory？对话记录不会被删除。')) return;
    if (!window.confirm('这是不可撤销的操作。确认继续？')) return;
    try {
      await window.zbot.memory.clear();
      await search();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    }
  };

  return (
    <div className="page-frame">
      <div className="page-inner">
        <PageHeader
          kicker="Personal context"
          title="Memory"
          subtitle="长期记忆独立于聊天记录。你始终可以查看、修改和真正删除它。"
          actions={
            <button type="button" onClick={openCreate} className="btn btn-primary">
              <Plus className="size-4" />
              新增记忆
            </button>
          }
        />

        <div className="mt-9 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field pl-10"
              placeholder="搜索记忆、项目或过去说过的话"
              aria-label="搜索记忆"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as MemoryType | 'all')}
            className="field w-auto"
            aria-label="按类型筛选"
          >
            <option value="all">全部类型</option>
            {memoryTypes.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="field w-auto max-w-[180px]"
            aria-label="按项目筛选"
          >
            <option value="">全部项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-[color-mix(in_oklch,var(--danger)_30%,var(--line))] bg-[var(--danger-soft)] px-4 py-3 text-[12px] text-[var(--danger)]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            <span>{memories.length} 条记忆</span>
          </div>
          {memories.length > 0 ? (
            <button
              type="button"
              onClick={() => void clearAll()}
              className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--danger)]"
            >
              清空全部
            </button>
          ) : null}
        </div>

        {!loading && memories.length === 0 ? (
          <div className="grid min-h-[320px] place-items-center">
            <div className="max-w-[420px] text-center">
              <div className="empty-mark mx-auto">
                <Brain className="size-[19px]" />
              </div>
              <h2 className="mt-5 font-display text-[18px] font-semibold">
                {query || typeFilter !== 'all' || projectFilter
                  ? '没有匹配的记忆'
                  : 'Memory 还是空的'}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-[var(--muted-strong)]">
                {query || typeFilter !== 'all' || projectFilter
                  ? '尝试更换搜索词或筛选条件。'
                  : '对 Z Bot 说“记住……”，这条信息就会进入本地记忆库，并在之后的对话中被检索。'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {memories.map((memory) => (
              <article
                key={memory.id}
                data-memory-id={memory.id}
                className={cn(
                  'group px-2 py-5 transition-colors',
                  highlight === memory.id && 'bg-[var(--accent-soft)]'
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={memory.type === 'project' ? 'accent' : 'neutral'}>
                    {typeLabels[memory.type]}
                  </StatusBadge>
                  {memory.projectId ? (
                    <span className="text-[10px] text-[var(--muted)]">
                      {projectNames.get(memory.projectId) ?? '项目记忆'}
                    </span>
                  ) : null}
                  <span className="font-mono text-[9px] text-[var(--muted-faint)]">
                    {Math.round(memory.importance * 100)}% importance ·{' '}
                    {Math.round(memory.confidence * 100)}% confidence
                  </span>
                  <span className="ml-auto text-[10px] text-[var(--muted)]">
                    {formatRelative(memory.updatedAt)}
                  </span>
                </div>
                <p className="mt-2.5 max-w-[78ch] whitespace-pre-wrap text-[13px] leading-6">
                  {memory.content}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {memory.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--nav-hover)] px-2 py-0.5 text-[9px] text-[var(--muted-strong)]"
                    >
                      #{tag}
                    </span>
                  ))}
                  {memory.expiresAt ? (
                    <span className="text-[9px] text-[var(--warning)]">
                      过期于 {new Date(memory.expiresAt).toLocaleDateString('zh-CN')}
                    </span>
                  ) : null}
                  <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEdit(memory)}
                      className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
                      aria-label="编辑记忆"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(memory)}
                      className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      aria-label="删除记忆"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.12_0.01_60/0.48)] backdrop-blur-[2px]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-float)] outline-none"
            aria-describedby="memory-dialog-description"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="font-display text-[20px] font-semibold tracking-[-0.02em]">
                  {draft.id ? '编辑记忆' : '新增记忆'}
                </Dialog.Title>
                <p
                  id="memory-dialog-description"
                  className="mt-1 text-[11px] text-[var(--muted)]"
                >
                  记忆会参与后续对话检索，也可能被模型编辑或删除。
                </p>
              </div>
              <Dialog.Close asChild>
                <button
                  className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
                  aria-label="关闭"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="memory-content">
                  内容
                </label>
                <textarea
                  id="memory-content"
                  value={draft.content}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  className="field min-h-[120px] resize-y"
                  placeholder="用户偏好、项目决策、重要事件…"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="memory-type">
                    类型
                  </label>
                  <select
                    id="memory-type"
                    className="field"
                    value={draft.type}
                    onChange={(event) =>
                      setDraft({ ...draft, type: event.target.value as MemoryType })
                    }
                  >
                    {memoryTypes.map((type) => (
                      <option key={type} value={type}>
                        {typeLabels[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="memory-project">
                    项目
                  </label>
                  <select
                    id="memory-project"
                    className="field"
                    value={draft.projectId}
                    onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}
                  >
                    <option value="">无项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="memory-importance">
                    重要度 {Math.round(draft.importance * 100)}%
                  </label>
                  <input
                    id="memory-importance"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={draft.importance}
                    onChange={(event) =>
                      setDraft({ ...draft, importance: Number(event.target.value) })
                    }
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="memory-confidence">
                    置信度 {Math.round(draft.confidence * 100)}%
                  </label>
                  <input
                    id="memory-confidence"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={draft.confidence}
                    onChange={(event) =>
                      setDraft({ ...draft, confidence: Number(event.target.value) })
                    }
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="memory-tags">
                    标签（逗号分隔）
                  </label>
                  <input
                    id="memory-tags"
                    value={draft.tags}
                    onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                    className="field"
                    placeholder="偏好, UI"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="memory-expiry">
                    过期日期（可选）
                  </label>
                  <input
                    id="memory-expiry"
                    type="date"
                    value={draft.expiresDate}
                    onChange={(event) => setDraft({ ...draft, expiresDate: event.target.value })}
                    className="field"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="btn btn-secondary" type="button">
                  取消
                </button>
              </Dialog.Close>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!draft.content.trim() || saving}
                onClick={() => void save()}
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                保存记忆
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
