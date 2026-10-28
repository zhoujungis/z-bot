import { NavLink, Route, Routes } from 'react-router-dom';
import {
  Brain,
  CheckSquare,
  Home,
  MessageSquare,
  Settings as SettingsIcon,
  X,
  type LucideIcon
} from 'lucide-react';
import { HomePage } from '../pages/HomePage';
import { ChatPage } from '../pages/ChatPage';
import { TasksPage } from '../pages/TasksPage';
import { MemoryPage } from '../pages/MemoryPage';
import { SettingsPage } from '../pages/SettingsPage';
import { PermissionDialog } from '../components/PermissionDialog';
import { LogoMark } from '../components/LogoMark';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { cn } from '../lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
];

function MemoryToast(): React.JSX.Element | null {
  const memory = useChatStore((state) => state.memoryNotice);
  const clear = useChatStore((state) => state.clearMemoryNotice);
  if (!memory) return null;
  return (
    <div className="fixed bottom-6 right-6 z-40 flex max-w-[340px] items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3.5 shadow-[var(--shadow-float)]">
      <div className="mt-0.5 size-2 shrink-0 rounded-full bg-[var(--success)]" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold">已写入长期记忆</div>
        <div className="mt-1 line-clamp-3 text-[11px] leading-5 text-[var(--muted-strong)]">
          {memory.content}
        </div>
      </div>
      <button
        type="button"
        onClick={clear}
        className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
        aria-label="关闭记忆提示"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function AppShell(): React.JSX.Element {
  const settings = useSettingsStore((state) => state.settings);
  const info = useSettingsStore((state) => state.info);

  return (
    <div
      className={cn(
        'app-surface flex h-screen w-screen overflow-hidden',
        settings.appearance.density === 'compact' && 'density-compact'
      )}
    >
      <aside className="flex w-[224px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--nav-bg)]">
        <div className="drag-region flex h-[76px] items-center gap-3 px-6">
          <div className="grid size-9 place-items-center rounded-[11px] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
            <LogoMark className="size-[22px]" />
          </div>
          <div>
            <div className="font-display text-[16px] font-semibold tracking-[-0.02em]">
              Z Bot
            </div>
            <div className="text-[11px] text-[var(--muted)]">Personal assistant</div>
          </div>
        </div>

        <nav aria-label="Main navigation" className="mt-2 flex flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium transition-[background-color,color,transform] duration-150',
                  isActive
                    ? 'bg-[var(--nav-active)] text-[var(--ink)]'
                    : 'text-[var(--muted-strong)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]'
                )
              }
            >
              <item.icon className="size-[17px] stroke-[1.8]" aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-6 pb-5">
          <div className="mb-4 h-px bg-[var(--line)]" />
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-[var(--success)] opacity-30" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--success)]" />
            </span>
            <span>Local runtime</span>
          </div>
          <div className="mt-2 font-mono text-[10px] text-[var(--muted)]">
            v{info?.version ?? '0.1.0'}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <PermissionDialog />
      <MemoryToast />
    </div>
  );
}
