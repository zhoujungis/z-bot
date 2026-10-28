import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

function copyOcrData(): Plugin {
  return {
    name: 'copy-ocr-data',
    closeBundle() {
      const source = resolve(__dirname, '../../node_modules/@tesseract.js-data');
      const target = resolve(__dirname, 'out/main/tessdata');
      if (!existsSync(source)) return;
      mkdirSync(target, { recursive: true });
      cpSync(source, target, { recursive: true });
    }
  };
}

const workspacePackages = [
  '@zbot/shared',
  '@zbot/database',
  '@zbot/model',
  '@zbot/memory',
  '@zbot/tools',
  '@zbot/bot-core'
];

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: workspacePackages }),
      copyOcrData()
    ],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'electron/main/index.ts'),
        output: {
          entryFileNames: 'index.js',
          format: 'cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@zbot/shared', 'zod'] })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
        output: {
          entryFileNames: 'index.js',
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'renderer/index.html')
      }
    }
  }
});
