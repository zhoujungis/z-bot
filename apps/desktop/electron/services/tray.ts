import { Menu, Tray, nativeImage } from 'electron';
import type { NavigationTarget } from '@zbot/shared';
import { resourcePath } from '../window-manager';
import type { AppLogger } from './logger';

export interface TrayActions {
  open(): void;
  quickAsk(): void;
  navigate(target: NavigationTarget): void;
  quit(): void;
}

export function createTray(actions: TrayActions, logger: AppLogger): Tray {
  let image = nativeImage.createFromPath(resourcePath('tray-icon.png'));
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(resourcePath('icon.png'));
  }
  if (image.isEmpty()) {
    image = nativeImage.createEmpty();
    logger.warn('tray icon missing; using an empty image');
  } else {
    image = image.resize({ width: 16, height: 16 });
  }

  const tray = new Tray(image);
  tray.setToolTip('Z Bot');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Z Bot', click: actions.open },
      { label: 'Quick Ask', accelerator: 'Ctrl+Space', click: actions.quickAsk },
      { label: 'New Chat', click: () => actions.navigate({ page: 'chat' }) },
      { label: 'Memory', click: () => actions.navigate({ page: 'memory' }) },
      { label: 'Settings', click: () => actions.navigate({ page: 'settings' }) },
      { type: 'separator' },
      { label: 'Quit', click: actions.quit }
    ])
  );
  tray.on('click', actions.open);
  tray.on('double-click', actions.quickAsk);
  return tray;
}
