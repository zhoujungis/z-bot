import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchAtLogin: false,
    minimizeToTray: true,
    startMinimized: false,
    language: 'zh-CN'
  },
  notifications: {
    enabled: true,
    reminders: true,
    taskUpdates: true,
    projectInactivity: false,
    projectInactivityDays: 7
  },
  memory: {
    autoExtract: true,
    defaultExpiryDays: null
  },
  appearance: {
    theme: 'system',
    density: 'comfortable'
  },
  tools: {
    webSearchProvider: 'tavily',
    webSearchMaxResults: 5,
    browserEnabled: true,
    ocrEnabled: true
  },
  privacy: {
    logLevel: 'info',
    retentionDays: 30
  }
};

export function mergeSettings(input: unknown, defaults: AppSettings = DEFAULT_SETTINGS): AppSettings {
  const value = input && typeof input === 'object' ? (input as Partial<AppSettings>) : {};
  return {
    general: { ...defaults.general, ...(value.general ?? {}) },
    notifications: { ...defaults.notifications, ...(value.notifications ?? {}) },
    memory: { ...defaults.memory, ...(value.memory ?? {}) },
    appearance: { ...defaults.appearance, ...(value.appearance ?? {}) },
    tools: { ...defaults.tools, ...(value.tools ?? {}) },
    privacy: { ...defaults.privacy, ...(value.privacy ?? {}) }
  };
}
