import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@zbot/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@zbot/database': resolve(__dirname, 'packages/database/src/index.ts'),
      '@zbot/model': resolve(__dirname, 'packages/model/src/index.ts'),
      '@zbot/memory': resolve(__dirname, 'packages/memory/src/index.ts'),
      '@zbot/tools': resolve(__dirname, 'packages/tools/src/index.ts'),
      '@zbot/bot-core': resolve(__dirname, 'packages/bot-core/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/desktop/electron/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html']
    }
  }
});
