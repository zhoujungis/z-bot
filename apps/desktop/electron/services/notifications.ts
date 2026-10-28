import { Notification } from 'electron';
import type { NavigationTarget } from '@zbot/shared';

export class NotificationService {
  constructor(private readonly navigate: (target: NavigationTarget) => void) {}

  isSupported(): boolean {
    return Notification.isSupported();
  }

  show(
    title: string,
    body: string,
    target?: NavigationTarget,
    iconPath?: string
  ): boolean {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({
      title,
      body,
      ...(iconPath ? { icon: iconPath } : {}),
      silent: false
    });
    if (target) {
      notification.on('click', () => this.navigate(target));
    }
    notification.show();
    return true;
  }
}
