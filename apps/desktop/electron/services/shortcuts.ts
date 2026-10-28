import { globalShortcut } from 'electron';
import type { AppLogger } from './logger';

export interface ShortcutActions {
  quickAsk(): void;
  screenshot(): void;
}

export function registerShortcuts(actions: ShortcutActions, logger: AppLogger): void {
  const shortcuts: Array<[string, () => void]> = [
    ['CommandOrControl+Space', actions.quickAsk],
    ['CommandOrControl+Shift+Z', actions.screenshot]
  ];
  for (const [accelerator, handler] of shortcuts) {
    try {
      const registered = globalShortcut.register(accelerator, handler);
      if (!registered) {
        logger.warn({ accelerator }, 'global shortcut registration failed');
      }
    } catch (error) {
      logger.warn({ accelerator, error: String(error) }, 'global shortcut registration error');
    }
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}
