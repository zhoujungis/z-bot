import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@zbot/shared';
import type { AppInfo, AppSettings } from '@zbot/shared';

interface SettingsState {
  settings: AppSettings;
  info: AppInfo | null;
  loaded: boolean;
  saving: boolean;
  error: string | null;
  load(): Promise<void>;
  save(settings: AppSettings): Promise<AppSettings>;
  refreshInfo(): Promise<void>;
  clearError(): void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  info: null,
  loaded: false,
  saving: false,
  error: null,
  async load() {
    try {
      const [settings, info] = await Promise.all([
        window.zbot.settings.get(),
        window.zbot.app.info()
      ]);
      set({ settings, info, loaded: true, error: null });
    } catch (error) {
      set({ error: message(error), loaded: true });
    }
  },
  async save(settings) {
    set({ saving: true, error: null });
    try {
      const updated = await window.zbot.settings.update(settings);
      set({ settings: updated, saving: false });
      return updated;
    } catch (error) {
      set({ saving: false, error: message(error) });
      throw error;
    }
  },
  async refreshInfo() {
    try {
      set({ info: await window.zbot.app.info() });
    } catch (error) {
      set({ error: message(error) });
    }
  },
  clearError() {
    set({ error: null });
  }
}));

export function useSettings(): AppSettings {
  return useSettingsStore((state) => state.settings);
}
