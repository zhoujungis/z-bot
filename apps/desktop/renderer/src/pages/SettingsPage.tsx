import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  Check,
  ExternalLink,
  FolderLock,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Server,
  Trash2,
  X
} from 'lucide-react';
import type {
  AppSettings,
  AuthorizedRoot,
  ModelConfig,
  ModelConfigInput,
  ModelProviderKind,
  ModelPurpose,
  Project,
  WebSearchStatus
} from '@zbot/shared';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Toggle } from '../components/Toggle';
import { useSettingsStore } from '../stores/settingsStore';
import { cn } from '../lib/cn';

const sections = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'AI' },
  { id: 'memory', label: 'Memory' },
  { id: 'tools', label: 'Tools' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'projects', label: 'Projects' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'appearance', label: 'Appearance' }
] as const;

type SectionId = (typeof sections)[number]['id'];

const providerKinds: Array<{ value: ModelProviderKind; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'ollama', label: 'Ollama' }
];

const purposes: Array<{ value: ModelPurpose; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'fast', label: 'Fast' },
  { value: 'vision', label: 'Vision' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'embedding', label: 'Embedding' }
];

function rowTitle(title: string, description: string): React.JSX.Element {
  return (
    <div>
      <div className="text-[13px] font-medium">{title}</div>
      <div className="mt-1 max-w-[56ch] text-[11px] leading-5 text-[var(--muted)]">
        {description}
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  description
}: {
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <div className="border-b border-[var(--line)] pb-4">
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{description}</p>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
      {rowTitle(title, description)}
      <Toggle checked={checked} onCheckedChange={onChange} label={title} />
    </div>
  );
}

interface ProviderDraft {
  id?: string;
  name: string;
  kind: ModelProviderKind;
  purpose: ModelPurpose;
  model: string;
  baseUrl: string;
  apiKey: string;
  clearApiKey: boolean;
  temperature: number;
  maxTokens: string;
  isDefault: boolean;
}

function emptyProviderDraft(): ProviderDraft {
  return {
    name: 'Ollama',
    kind: 'ollama',
    purpose: 'general',
    model: '',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    clearApiKey: false,
    temperature: 0.7,
    maxTokens: '',
    isDefault: true
  };
}

function providerDraft(config: ModelConfig): ProviderDraft {
  return {
    id: config.id,
    name: config.name,
    kind: config.kind,
    purpose: config.purpose,
    model: config.model,
    baseUrl: config.baseUrl ?? '',
    apiKey: '',
    clearApiKey: false,
    temperature: config.temperature,
    maxTokens: config.maxTokens ? String(config.maxTokens) : '',
    isDefault: config.isDefault
  };
}

export function SettingsPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const initialSection = sections.find((section) => section.id === params.get('section'))?.id;
  const [section, setSection] = useState<SectionId>(initialSection ?? 'general');
  const settings = useSettingsStore((state) => state.settings);
  const saveSettings = useSettingsStore((state) => state.save);
  const saving = useSettingsStore((state) => state.saving);
  const storeError = useSettingsStore((state) => state.error);
  const info = useSettingsStore((state) => state.info);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [providers, setProviders] = useState<ModelConfig[]>([]);
  const [providerOpen, setProviderOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ModelConfig | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);

  const [roots, setRoots] = useState<AuthorizedRoot[]>([]);
  const [rootOpen, setRootOpen] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const [rootLabel, setRootLabel] = useState('');
  const [rootWrite, setRootWrite] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectWatch, setProjectWatch] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [webStatus, setWebStatus] = useState<WebSearchStatus | null>(null);
  const [webKey, setWebKey] = useState('');
  const [webBusy, setWebBusy] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    const requested = sections.find((item) => item.id === params.get('section'))?.id;
    if (requested) setSection(requested);
  }, [params]);

  useEffect(() => {
    void window.zbot.providers.list().then(setProviders).catch(() => setProviders([]));
    void window.zbot.roots.list().then(setRoots).catch(() => setRoots([]));
    void window.zbot.projects.list().then(setProjects).catch(() => setProjects([]));
    void window.zbot.webSearch.status().then(setWebStatus).catch(() => setWebStatus(null));
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings),
    [draft, settings]
  );

  const selectSection = (id: SectionId): void => {
    setSection(id);
    setParams({ section: id });
    setSaved(false);
  };

  const patch = (next: AppSettings): void => {
    setDraft(next);
    setSaved(false);
  };

  const save = async (): Promise<void> => {
    setLocalError(null);
    try {
      await saveSettings(draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const openProvider = (provider: ModelConfig | null): void => {
    setEditingProvider(provider);
    setProviderNotice(null);
    setProviderOpen(true);
  };

  const deleteProvider = async (provider: ModelConfig): Promise<void> => {
    if (!window.confirm(`删除模型配置“${provider.name}”？API Key 也会被移除。`)) return;
    try {
      await window.zbot.providers.remove(provider.id);
      setProviders(await window.zbot.providers.list());
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const addRoot = async (): Promise<void> => {
    if (!rootPath.trim()) return;
    setRootError(null);
    try {
      await window.zbot.roots.add({
        path: rootPath.trim(),
        label: rootLabel.trim() || rootPath.split(/[\\/]/).filter(Boolean).at(-1) || 'Directory',
        allowWrite: rootWrite
      });
      setRootOpen(false);
      setRootPath('');
      setRootLabel('');
      setRootWrite(false);
      setRoots(await window.zbot.roots.list());
    } catch (error) {
      setRootError(error instanceof Error ? error.message : String(error));
    }
  };

  const removeRoot = async (root: AuthorizedRoot): Promise<void> => {
    if (!window.confirm(`撤销对“${root.path}”的访问授权？`)) return;
    try {
      await window.zbot.roots.remove(root.id);
      setRoots(await window.zbot.roots.list());
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const openProject = (project: Project | null): void => {
    setProjectId(project?.id ?? null);
    setProjectName(project?.name ?? '');
    setProjectPath(project?.path ?? '');
    setProjectDescription(project?.description ?? '');
    setProjectWatch(project?.watchEnabled ?? false);
    setProjectError(null);
    setProjectOpen(true);
  };

  const saveProject = async (): Promise<void> => {
    if (!projectName.trim()) return;
    setProjectError(null);
    try {
      await window.zbot.projects.upsert({
        ...(projectId ? { id: projectId } : {}),
        name: projectName.trim(),
        path: projectPath.trim() || null,
        description: projectDescription.trim(),
        watchEnabled: projectWatch
      });
      setProjectOpen(false);
      setProjects(await window.zbot.projects.list());
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    }
  };

  const removeProject = async (project: Project): Promise<void> => {
    if (!window.confirm(`删除项目“${project.name}”？其记忆会保留，但不再关联项目。`)) return;
    try {
      await window.zbot.projects.remove(project.id);
      setProjects(await window.zbot.projects.list());
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const saveWebKey = async (): Promise<void> => {
    if (!webKey.trim()) return;
    setWebBusy(true);
    setLocalError(null);
    try {
      const status = await window.zbot.webSearch.setKey(webKey.trim());
      setWebStatus(status);
      setWebKey('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setWebBusy(false);
    }
  };

  const error = localError ?? storeError;

  return (
    <div className="page-frame">
      <div className="page-inner">
        <PageHeader
          kicker="Configuration"
          title="Settings"
          subtitle="模型、记忆、权限和隐私边界都保存在本地。密钥不会回传到界面或日志。"
          actions={
            <div className="flex items-center gap-2">
              {saved ? (
                <span className="flex items-center gap-1 text-[11px] text-[var(--success)]">
                  <Check className="size-3.5" />
                  已保存
                </span>
              ) : null}
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving}
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                保存设置
              </button>
            </div>
          }
        />

        {error ? (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-[color-mix(in_oklch,var(--danger)_30%,var(--line))] bg-[var(--danger-soft)] px-4 py-3 text-[12px] text-[var(--danger)]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-11 grid gap-12 lg:grid-cols-[190px_1fr]">
          <nav aria-label="Settings sections" className="space-y-1 text-[13px]">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectSection(item.id)}
                className={cn(
                  'flex min-h-9 w-full items-center rounded-lg px-3 text-left transition-colors',
                  section === item.id
                    ? 'bg-[var(--nav-active)] font-semibold'
                    : 'text-[var(--muted-strong)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]'
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section className="min-w-0">
            {section === 'general' ? (
              <>
                <SectionHeading title="General" description="应用启动与窗口行为" />
                <div className="divide-y divide-[var(--line)]">
                  <ToggleRow
                    title="开机启动"
                    description="登录 Windows 后在托盘运行。"
                    checked={draft.general.launchAtLogin}
                    onChange={(checked) =>
                      patch({ ...draft, general: { ...draft.general, launchAtLogin: checked } })
                    }
                  />
                  <ToggleRow
                    title="关闭窗口时最小化到托盘"
                    description="继续接收提醒；从托盘菜单可完全退出。"
                    checked={draft.general.minimizeToTray}
                    onChange={(checked) =>
                      patch({ ...draft, general: { ...draft.general, minimizeToTray: checked } })
                    }
                  />
                  <ToggleRow
                    title="启动时隐藏主窗口"
                    description="适合开机启动后只驻留托盘。"
                    checked={draft.general.startMinimized}
                    onChange={(checked) =>
                      patch({ ...draft, general: { ...draft.general, startMinimized: checked } })
                    }
                  />
                </div>
              </>
            ) : null}

            {section === 'ai' ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <SectionHeading
                    title="AI"
                    description="支持多个用途与 Provider。API Key 使用 Windows 安全存储加密。"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary mt-1 shrink-0"
                    onClick={() => openProvider(null)}
                  >
                    <Plus className="size-4" />
                    添加模型
                  </button>
                </div>

                <div className="mt-5 divide-y divide-[var(--line)]">
                  {providers.map((provider) => (
                    <div key={provider.id} className="flex items-start gap-4 py-4">
                      <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--nav-hover)] text-[var(--muted)]">
                        <Server className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium">{provider.name}</span>
                          <StatusBadge tone={provider.isDefault ? 'accent' : 'muted'}>
                            {provider.purpose}
                          </StatusBadge>
                          {provider.apiKeyConfigured ? (
                            <StatusBadge tone="success">
                              <KeyRound className="size-3" />
                              已配置密钥
                            </StatusBadge>
                          ) : null}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                          {provider.kind} · {provider.model}
                          {provider.baseUrl ? ` · ${provider.baseUrl}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openProvider(provider)}
                          className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
                          aria-label="编辑模型"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteProvider(provider)}
                          className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                          aria-label="删除模型"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {providers.length === 0 ? (
                    <div className="flex min-h-[180px] flex-col items-start justify-center">
                      <div className="empty-mark">
                        <Server className="size-4" />
                      </div>
                      <h3 className="mt-4 text-[14px] font-semibold">还没有模型配置</h3>
                      <p className="mt-1 max-w-[52ch] text-[11px] leading-5 text-[var(--muted)]">
                        可以先连接本地 Ollama，或配置任意 OpenAI-compatible 端点。
                      </p>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {section === 'memory' ? (
              <>
                <SectionHeading
                  title="Memory"
                  description="控制长期记忆的提取与默认生命周期。明确说“记住……”始终可用。"
                />
                <div className="divide-y divide-[var(--line)]">
                  <ToggleRow
                    title="允许助理自动调用 remember"
                    description="关闭后，只有用户明确要求或手动新增记忆时才会写入。"
                    checked={draft.memory.autoExtract}
                    onChange={(checked) =>
                      patch({ ...draft, memory: { ...draft.memory, autoExtract: checked } })
                    }
                  />
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle(
                      '默认过期天数',
                      '留空表示长期保留。过期记忆会被归档，不再参与普通检索。'
                    )}
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={draft.memory.defaultExpiryDays ?? ''}
                      onChange={(event) =>
                        patch({
                          ...draft,
                          memory: {
                            ...draft.memory,
                            defaultExpiryDays: event.target.value
                              ? Number(event.target.value)
                              : null
                          }
                        })
                      }
                      className="field w-[120px]"
                      placeholder="长期"
                    />
                  </div>
                </div>
              </>
            ) : null}

            {section === 'tools' ? (
              <>
                <SectionHeading
                  title="Tools"
                  description="网页搜索、浏览器和文件工具的运行边界。"
                />
                <div className="divide-y divide-[var(--line)]">
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('Web 搜索 Provider', '搜索 API 需要单独的密钥。')}
                    <select
                      className="field w-[150px]"
                      value={draft.tools.webSearchProvider}
                      onChange={(event) =>
                        patch({
                          ...draft,
                          tools: {
                            ...draft.tools,
                            webSearchProvider: event.target.value as 'tavily' | 'brave'
                          }
                        })
                      }
                    >
                      <option value="tavily">Tavily</option>
                      <option value="brave">Brave</option>
                    </select>
                  </div>
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('搜索返回数量', '每次搜索最多返回多少个结果。')}
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={draft.tools.webSearchMaxResults}
                      onChange={(event) =>
                        patch({
                          ...draft,
                          tools: {
                            ...draft.tools,
                            webSearchMaxResults: Number(event.target.value)
                          }
                        })
                      }
                      className="field w-[100px]"
                    />
                  </div>
                  <ToggleRow
                    title="启用浏览器工具"
                    description="允许读取动态网页；点击和输入仍会请求确认。"
                    checked={draft.tools.browserEnabled}
                    onChange={(checked) =>
                      patch({ ...draft, tools: { ...draft.tools, browserEnabled: checked } })
                    }
                  />
                  <ToggleRow
                    title="本地 OCR"
                    description="使用 Windows 内置 OCR 提取图片文字；需要系统安装中英文 OCR 语言组件。OCR 文本会作为不可信资料送入模型。"
                    checked={draft.tools.ocrEnabled}
                    onChange={(checked) =>
                      patch({ ...draft, tools: { ...draft.tools, ocrEnabled: checked } })
                    }
                  />
                  <div className="py-5">
                    <div className="flex items-center gap-2">
                      {rowTitle('Web 搜索 API Key', '密钥加密保存在本地，不会回显。')}
                      {webStatus?.configured ? (
                        <StatusBadge tone="success">
                          <Check className="size-3" />
                          已配置
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">未配置</StatusBadge>
                      )}
                    </div>
                    <div className="mt-3 flex max-w-[520px] gap-2">
                      <input
                        type="password"
                        value={webKey}
                        onChange={(event) => setWebKey(event.target.value)}
                        placeholder={
                          webStatus?.configured ? '输入新密钥以替换现有值' : '输入搜索 API Key'
                        }
                        className="field flex-1"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!webKey.trim() || webBusy}
                        onClick={() => void saveWebKey()}
                      >
                        {webBusy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                        保存密钥
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {section === 'permissions' ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <SectionHeading
                    title="Permissions"
                    description="文件访问被限制在这些目录内。删除、移动等操作仍会逐次确认。"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary mt-1 shrink-0"
                    onClick={() => setRootOpen(true)}
                  >
                    <Plus className="size-4" />
                    添加目录
                  </button>
                </div>
                <div className="mt-5 divide-y divide-[var(--line)]">
                  {roots.map((root) => (
                    <div key={root.id} className="flex items-start gap-4 py-4">
                      <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--nav-hover)] text-[var(--muted)]">
                        <FolderLock className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-medium">{root.label}</span>
                          <StatusBadge tone={root.allowWrite ? 'warning' : 'muted'}>
                            {root.allowWrite ? '可写（仍需确认）' : '只读'}
                          </StatusBadge>
                        </div>
                        <div className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">
                          {root.path}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeRoot(root)}
                        className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                        aria-label="撤销目录授权"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {roots.length === 0 ? (
                    <div className="py-8 text-[12px] leading-6 text-[var(--muted)]">
                      还没有授权目录。文件工具在添加目录之前不会读取任何本地文件。
                    </div>
                  ) : null}
                </div>
                <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[11px] leading-5 text-[var(--muted-strong)]">
                  Z Bot 默认拒绝 Windows、Program Files、浏览器凭据和系统凭据目录。文件写入、移动和删除都需要明确确认。
                </div>
              </>
            ) : null}

            {section === 'projects' ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <SectionHeading
                    title="Projects"
                    description="按项目保存目标、决策和上下文。项目路径只是元数据，文件访问仍由 Permissions 控制。"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary mt-1 shrink-0"
                    onClick={() => openProject(null)}
                  >
                    <Plus className="size-4" />
                    添加项目
                  </button>
                </div>
                <div className="mt-5 divide-y divide-[var(--line)]">
                  {projects.map((project) => (
                    <div key={project.id} className="flex items-start gap-4 py-4">
                      <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--nav-hover)] text-[var(--muted)]">
                        <FolderLock className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium">{project.name}</span>
                          {project.watchEnabled ? (
                            <StatusBadge tone="muted">停滞提醒</StatusBadge>
                          ) : null}
                        </div>
                        {project.description ? (
                          <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--muted-strong)]">
                            {project.description}
                          </div>
                        ) : null}
                        {project.path ? (
                          <div className="mt-1 break-all font-mono text-[10px] text-[var(--muted)]">
                            {project.path}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openProject(project)}
                          className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
                          aria-label="编辑项目"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeProject(project)}
                          className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                          aria-label="删除项目"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {projects.length === 0 ? (
                    <div className="py-8 text-[12px] leading-6 text-[var(--muted)]">
                      还没有项目。添加项目后，Memory 可以按项目过滤，Home 也会显示最近项目。
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {section === 'notifications' ? (
              <>
                <SectionHeading
                  title="Notifications"
                  description="只在值得打扰时使用 Windows 系统通知。"
                />
                <div className="divide-y divide-[var(--line)]">
                  <ToggleRow
                    title="启用系统通知"
                    description="关闭后所有提醒和任务通知都会静音。"
                    checked={draft.notifications.enabled}
                    onChange={(checked) =>
                      patch({
                        ...draft,
                        notifications: { ...draft.notifications, enabled: checked }
                      })
                    }
                  />
                  <ToggleRow
                    title="提醒通知"
                    description="Reminder 到期时发送通知并支持点击跳转。"
                    checked={draft.notifications.reminders}
                    onChange={(checked) =>
                      patch({
                        ...draft,
                        notifications: { ...draft.notifications, reminders: checked }
                      })
                    }
                  />
                  <ToggleRow
                    title="任务完成 / 失败通知"
                    description="主窗口不可见时，Agent 任务结束会通知你。"
                    checked={draft.notifications.taskUpdates}
                    onChange={(checked) =>
                      patch({
                        ...draft,
                        notifications: { ...draft.notifications, taskUpdates: checked }
                      })
                    }
                  />
                  <ToggleRow
                    title="项目停滞提醒"
                    description="仅为开启“停滞提醒”的项目计算最近活动；每个停滞周期最多提醒一次。"
                    checked={draft.notifications.projectInactivity}
                    onChange={(checked) =>
                      patch({
                        ...draft,
                        notifications: { ...draft.notifications, projectInactivity: checked }
                      })
                    }
                  />
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle(
                      '停滞阈值',
                      '项目在指定天数内没有文件、对话、记忆或任务活动时提醒。'
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        className="field w-[90px]"
                        value={draft.notifications.projectInactivityDays}
                        onChange={(event) =>
                          patch({
                            ...draft,
                            notifications: {
                              ...draft.notifications,
                              projectInactivityDays: Number(event.target.value)
                            }
                          })
                        }
                      />
                      <span className="text-[11px] text-[var(--muted)]">天</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {section === 'privacy' ? (
              <>
                <SectionHeading
                  title="Privacy"
                  description="本地优先。Z Bot 不启用 telemetry，也不会把数据发送到自有服务器。"
                />
                <div className="divide-y divide-[var(--line)]">
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('日志级别', '调试日志也只记录元数据，敏感字段会脱敏。')}
                    <select
                      className="field w-[140px]"
                      value={draft.privacy.logLevel}
                      onChange={(event) =>
                        patch({
                          ...draft,
                          privacy: {
                            ...draft.privacy,
                            logLevel: event.target.value as 'info' | 'debug'
                          }
                        })
                      }
                    >
                      <option value="info">info</option>
                      <option value="debug">debug</option>
                    </select>
                  </div>
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('日志保留天数', '启动或保存设置时清理更早的本地日志。')}
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      className="field w-[110px]"
                      value={draft.privacy.retentionDays}
                      onChange={(event) =>
                        patch({
                          ...draft,
                          privacy: {
                            ...draft.privacy,
                            retentionDays: Number(event.target.value)
                          }
                        })
                      }
                    />
                  </div>
                  <div className="py-5">
                    <div className="text-[13px] font-medium">本地数据</div>
                    <div className="mt-2 break-all font-mono text-[10px] leading-5 text-[var(--muted)]">
                      {info?.dataDir ?? '—'}
                      <br />
                      {info?.databasePath ?? '—'}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      <StatusBadge tone={info?.safeStorageAvailable ? 'success' : 'danger'}>
                        {info?.safeStorageAvailable ? '安全存储可用' : '安全存储不可用'}
                      </StatusBadge>
                      <span className="text-[var(--muted)]">
                        密钥使用 Windows DPAPI 加密，不写入日志。
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary mt-4"
                      onClick={() => void window.zbot.app.openDataDir()}
                    >
                      <ExternalLink className="size-4" />
                      打开数据目录
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {section === 'shortcuts' ? (
              <>
                <SectionHeading
                  title="Shortcuts"
                  description="系统级快捷键在应用运行期间可用。"
                />
                <div className="divide-y divide-[var(--line)]">
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('Quick Ask', '从任意应用唤起一个小型输入窗口。')}
                    <kbd className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px]">
                      Ctrl + Space
                    </kbd>
                  </div>
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('截图', '截取主屏幕并附加到 Chat。')}
                    <kbd className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px]">
                      Ctrl + Shift + Z
                    </kbd>
                  </div>
                </div>
              </>
            ) : null}

            {section === 'appearance' ? (
              <>
                <SectionHeading
                  title="Appearance"
                  description="跟随 Windows 主题或固定明暗模式。"
                />
                <div className="divide-y divide-[var(--line)]">
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('主题', '系统模式会随 Windows 明暗设置切换。')}
                    <select
                      className="field w-[150px]"
                      value={draft.appearance.theme}
                      onChange={(event) =>
                        patch({
                          ...draft,
                          appearance: {
                            ...draft.appearance,
                            theme: event.target.value as AppSettings['appearance']['theme']
                          }
                        })
                      }
                    >
                      <option value="system">跟随系统</option>
                      <option value="light">浅色</option>
                      <option value="dark">深色</option>
                    </select>
                  </div>
                  <div className="flex min-h-[74px] items-center justify-between gap-6 py-4">
                    {rowTitle('密度', '紧凑模式减少面板内边距。')}
                    <select
                      className="field w-[150px]"
                      value={draft.appearance.density}
                      onChange={(event) =>
                        patch({
                          ...draft,
                          appearance: {
                            ...draft.appearance,
                            density: event.target.value as 'comfortable' | 'compact'
                          }
                        })
                      }
                    >
                      <option value="comfortable">舒适</option>
                      <option value="compact">紧凑</option>
                    </select>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>

      <Dialog.Root open={projectOpen} onOpenChange={setProjectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.12_0.01_60/0.48)] backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-float)] outline-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="font-display text-[20px] font-semibold">
                  {projectId ? '编辑项目' : '添加项目'}
                </Dialog.Title>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  用于组织 Project Memory，不会自动授予文件访问权限。
                </p>
              </div>
              <Dialog.Close asChild>
                <button
                  className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)]"
                  aria-label="关闭"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="project-name">
                  名称
                </label>
                <input
                  id="project-name"
                  className="field"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="例如 NanoBrowser"
                />
              </div>
              <div>
                <label className="label" htmlFor="project-path">
                  项目目录（可选）
                </label>
                <div className="flex gap-2">
                  <input
                    id="project-path"
                    className="field flex-1 font-mono text-[11px]"
                    value={projectPath}
                    onChange={(event) => setProjectPath(event.target.value)}
                    placeholder="D:\Projects\NanoBrowser"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      void window.zbot.app.chooseDirectory().then((path) => {
                        if (path) setProjectPath(path);
                      });
                    }}
                  >
                    选择
                  </button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="project-description">
                  描述
                </label>
                <textarea
                  id="project-description"
                  className="field min-h-[100px] resize-y"
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="项目目标、技术栈、当前状态…"
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--line)] p-3">
                {rowTitle(
                  '项目停滞提醒',
                  '根据项目文件、对话、记忆和任务活动判断是否停滞。'
                )}
                <Toggle
                  checked={projectWatch}
                  onCheckedChange={setProjectWatch}
                  label="项目停滞提醒"
                />
              </div>
              {projectError ? (
                <div className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-[11px] text-[var(--danger)]">
                  {projectError}
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="btn btn-secondary" type="button">
                  取消
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!projectName.trim()}
                onClick={() => void saveProject()}
              >
                保存项目
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ProviderDialog
        open={providerOpen}
        onOpenChange={setProviderOpen}
        provider={editingProvider}
        busy={providerBusy}
        notice={providerNotice}
        onBusy={setProviderBusy}
        onNotice={setProviderNotice}
        onSaved={async () => {
          setProviders(await window.zbot.providers.list());
          setProviderOpen(false);
          setProviderNotice(null);
        }}
        onError={setLocalError}
      />

      <Dialog.Root open={rootOpen} onOpenChange={setRootOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.12_0.01_60/0.48)] backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(540px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-float)] outline-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="font-display text-[20px] font-semibold">
                  添加授权目录
                </Dialog.Title>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  文件工具只能访问这里列出的绝对路径。
                </p>
              </div>
              <Dialog.Close asChild>
                <button className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)]" aria-label="关闭">
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="root-path">
                  目录
                </label>
                <div className="flex gap-2">
                  <input
                    id="root-path"
                    className="field flex-1"
                    value={rootPath}
                    onChange={(event) => setRootPath(event.target.value)}
                    placeholder="D:\Downloads"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      void window.zbot.app.chooseDirectory().then((path) => {
                        if (!path) return;
                        setRootPath(path);
                        if (!rootLabel) {
                          setRootLabel(path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Directory');
                        }
                      });
                    }}
                  >
                    选择
                  </button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="root-label">
                  标签
                </label>
                <input
                  id="root-label"
                  className="field"
                  value={rootLabel}
                  onChange={(event) => setRootLabel(event.target.value)}
                  placeholder="Downloads"
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--line)] p-3">
                {rowTitle(
                  '允许写入',
                  '写入、移动和删除仍需逐次确认。关闭时该目录只能读取。'
                )}
                <Toggle checked={rootWrite} onCheckedChange={setRootWrite} label="允许写入" />
              </div>
              {rootError ? (
                <div className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-[11px] text-[var(--danger)]">
                  {rootError}
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="btn btn-secondary" type="button">
                  取消
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!rootPath.trim()}
                onClick={() => void addRoot()}
              >
                添加目录
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function ProviderDialog({
  open,
  onOpenChange,
  provider,
  busy,
  notice,
  onBusy,
  onNotice,
  onSaved,
  onError
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  provider: ModelConfig | null;
  busy: boolean;
  notice: string | null;
  onBusy(value: boolean): void;
  onNotice(value: string | null): void;
  onSaved(): Promise<void>;
  onError(value: string | null): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ProviderDraft>(emptyProviderDraft());

  useEffect(() => {
    if (!open) return;
    setDraft(provider ? providerDraft(provider) : emptyProviderDraft());
    onNotice(null);
  }, [open, provider, onNotice]);

  const input = (): ModelConfigInput => ({
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    kind: draft.kind,
    purpose: draft.purpose,
    model: draft.model.trim(),
    baseUrl: draft.baseUrl.trim() || null,
    ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
    ...(draft.clearApiKey ? { clearApiKey: true } : {}),
    temperature: draft.temperature,
    maxTokens: draft.maxTokens ? Number(draft.maxTokens) : null,
    isDefault: draft.isDefault
  });

  const valid = Boolean(draft.name.trim() && draft.model.trim() && !busy);

  const save = async (): Promise<void> => {
    if (!valid) return;
    onBusy(true);
    onError(null);
    try {
      await window.zbot.providers.upsert(input());
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onBusy(false);
    }
  };

  const test = async (): Promise<void> => {
    if (!valid) return;
    onBusy(true);
    onNotice(null);
    onError(null);
    try {
      const result = await window.zbot.providers.test(input());
      onNotice(`${result.ok ? '连接成功' : '连接失败'} · ${result.latencyMs} ms · ${result.message}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.12_0.01_60/0.48)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-40px)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-float)] outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-[20px] font-semibold">
                {provider ? '编辑模型' : '添加模型'}
              </Dialog.Title>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Provider 与 Bot Runtime 解耦。配置会加密保存。
              </p>
            </div>
            <Dialog.Close asChild>
              <button className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)]" aria-label="关闭">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="provider-name">
                名称
              </label>
              <input
                id="provider-name"
                className="field"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="My model"
              />
            </div>
            <div>
              <label className="label" htmlFor="provider-kind">
                Provider
              </label>
              <select
                id="provider-kind"
                className="field"
                value={draft.kind}
                onChange={(event) => {
                  const kind = event.target.value as ModelProviderKind;
                  setDraft({
                    ...draft,
                    kind,
                    baseUrl:
                      draft.baseUrl ||
                      (kind === 'ollama' ? 'http://127.0.0.1:11434/v1' : '')
                  });
                }}
              >
                {providerKinds.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="provider-purpose">
                用途
              </label>
              <select
                id="provider-purpose"
                className="field"
                value={draft.purpose}
                onChange={(event) =>
                  setDraft({ ...draft, purpose: event.target.value as ModelPurpose })
                }
              >
                {purposes.map((purpose) => (
                  <option key={purpose.value} value={purpose.value}>
                    {purpose.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="provider-model">
                模型 ID
              </label>
              <input
                id="provider-model"
                className="field font-mono text-[12px]"
                value={draft.model}
                onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                placeholder="例如 llama3.2 或 gpt-4.1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="provider-base-url">
                Base URL
              </label>
              <input
                id="provider-base-url"
                className="field font-mono text-[12px]"
                value={draft.baseUrl}
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                placeholder={
                  draft.kind === 'ollama'
                    ? 'http://127.0.0.1:11434/v1'
                    : 'https://…/v1（OpenAI-compatible 必填）'
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="provider-api-key">
                API Key
                {provider?.apiKeyConfigured ? '（已配置，留空保持不变）' : ''}
              </label>
              <input
                id="provider-api-key"
                type="password"
                autoComplete="off"
                className="field font-mono text-[12px]"
                value={draft.apiKey}
                onChange={(event) =>
                  setDraft({ ...draft, apiKey: event.target.value, clearApiKey: false })
                }
                placeholder="sk-…"
              />
              {provider?.apiKeyConfigured ? (
                <label className="mt-2 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={draft.clearApiKey}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        clearApiKey: event.target.checked,
                        apiKey: event.target.checked ? '' : draft.apiKey
                      })
                    }
                  />
                  清除已保存的密钥
                </label>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="provider-temperature">
                Temperature {draft.temperature.toFixed(2)}
              </label>
              <input
                id="provider-temperature"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={draft.temperature}
                onChange={(event) =>
                  setDraft({ ...draft, temperature: Number(event.target.value) })
                }
                className="w-full accent-[var(--accent)]"
              />
            </div>
            <div>
              <label className="label" htmlFor="provider-max-tokens">
                Max tokens（可选）
              </label>
              <input
                id="provider-max-tokens"
                type="number"
                min={1}
                max={1_000_000}
                className="field"
                value={draft.maxTokens}
                onChange={(event) => setDraft({ ...draft, maxTokens: event.target.value })}
                placeholder="使用模型默认值"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--line)] p-3 sm:col-span-2">
              <div>
                <div className="text-[12px] font-medium">设为该用途的默认模型</div>
                <div className="mt-1 text-[10px] text-[var(--muted)]">
                  每个用途可以有一个默认项。
                </div>
              </div>
              <Toggle
                checked={draft.isDefault}
                onCheckedChange={(checked) => setDraft({ ...draft, isDefault: checked })}
                label="设为默认"
              />
            </div>
          </div>

          {notice ? (
            <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--muted-strong)]">
              {notice}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary mr-auto"
              disabled={!valid}
              onClick={() => void test()}
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              测试连接
            </button>
            <Dialog.Close asChild>
              <button className="btn btn-secondary" type="button">
                取消
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!valid}
              onClick={() => void save()}
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              保存模型
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
