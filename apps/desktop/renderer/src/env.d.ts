/// <reference types="vite/client" />

import type { ZBotApi } from '@zbot/shared';

declare global {
  interface Window {
    zbot: ZBotApi;
  }
}

export {};
