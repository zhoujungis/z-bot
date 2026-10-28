import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavigationTarget } from '@zbot/shared';
import { useSettingsStore } from '../stores/settingsStore';
import { useChatStore } from '../stores/chatStore';
import { AppShell } from './AppShell';
import { QuickAskPage } from '../pages/QuickAskPage';
import { base64Preview } from '../lib/files';

function targetPath(target: NavigationTarget): string {
  switch (target.page) {
    case 'home':
      return '/';
    case 'chat':
      return target.conversationId ? `/chat?conversation=${encodeURIComponent(target.conversationId)}` : '/chat';
    case 'tasks':
      return target.taskId ? `/tasks?task=${encodeURIComponent(target.taskId)}` : '/tasks';
    case 'memory':
      return target.memoryId ? `/memory?memory=${encodeURIComponent(target.memoryId)}` : '/memory';
    case 'settings':
      return target.section ? `/settings?section=${encodeURIComponent(target.section)}` : '/settings';
    default:
      return '/';
  }
}

export function App(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
  const load = useSettingsStore((state) => state.load);
  const handleChatEvent = useChatStore((state) => state.handleEvent);
  const addAttachment = useChatStore((state) => state.addAttachment);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribers = [
      window.zbot.chat.onEvent(handleChatEvent),
      window.zbot.events.onNavigate((target) => navigate(targetPath(target))),
      window.zbot.events.onScreenshot((payload) => {
        addAttachment(
          payload.attachment,
          base64Preview(
            payload.attachment.dataBase64,
            payload.attachment.mimeType,
            payload.attachment.kind
          )
        );
        navigate('/chat');
      }),
      window.zbot.events.onTheme(() => {
        // CSS reacts to data-theme; settings updates are loaded separately.
      })
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [handleChatEvent, addAttachment, navigate]);

  useEffect(() => {
    const apply = (): void => {
      const resolved =
        settings.appearance.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : settings.appearance.theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.appearance.theme]);

  if (location.pathname === '/quick') {
    return <QuickAskPage />;
  }

  return <AppShell />;
}
