import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let server: Server;
let app: ElectronApplication;
let page: Page;
let userDataDir: string;
let baseUrl: string;
let requestBodies: Array<Record<string, unknown>> = [];

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function chunk(model: string, delta: unknown, finishReason: string | null = null): string {
  return sse({
    id: 'chatcmpl-e2e',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  });
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (data: string) => {
      raw += data;
    });
    request.on('end', () => {
      const body = raw ? (JSON.parse(raw) as { model?: string }) : {};
      requestBodies.push(body as Record<string, unknown>);
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });
      const model = body.model ?? 'e2e-model';
      response.write(chunk(model, { role: 'assistant', content: '你好，' }));
      response.write(chunk(model, { content: '我在这里。' }));
      response.write(chunk(model, {}, 'stop'));
      response.write(
        sse({
          id: 'chatcmpl-e2e-usage',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
        })
      );
      response.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(async () => {
  requestBodies = [];
  userDataDir = mkdtempSync(join(tmpdir(), 'zbot-e2e-'));
  app = await electron.launch({
    cwd: join(process.cwd(), 'apps/desktop'),
    args: ['.'],
    env: {
      ...process.env,
      ZBOT_USER_DATA_DIR: userDataDir,
      ELECTRON_ENABLE_LOGGING: '0'
    }
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText('Personal assistant')).toBeVisible();
});

test.afterEach(async () => {
  await app.close().catch(() => undefined);
  rmSync(userDataDir, { recursive: true, force: true });
});

test('streams a reply and persists explicit memory', async () => {
  await page.evaluate(
    async ({ baseUrl }) => {
      const api = (window as unknown as { zbot: any }).zbot;
      await api.providers.upsert({
        name: 'E2E model',
        kind: 'openai-compatible',
        purpose: 'general',
        model: 'e2e-model',
        baseUrl,
        apiKey: 'e2e-key',
        temperature: 0,
        maxTokens: 128,
        isDefault: true
      });
    },
    { baseUrl }
  );

  await page.getByRole('link', { name: 'Chat', exact: true }).click();
  const composer = page.getByRole('textbox', { name: '消息' });
  await composer.fill('你好');
  await composer.press('Enter');
  await expect(page.getByText('你好，我在这里。')).toBeVisible();
  await expect(page.getByText('You')).toBeVisible();

  await composer.fill('记住：用户喜欢简洁直接的界面');
  await composer.press('Enter');
  await expect(page.getByText('好的，我记住了。')).toBeVisible();

  await page.getByRole('link', { name: 'Memory', exact: true }).click();
  await expect(
    page
      .locator('article[data-memory-id]')
      .getByText('用户喜欢简洁直接的界面', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('1 条记忆')).toBeVisible();
});

test('runs local OCR and includes text in the model context', async () => {
  await page.evaluate(
    async ({ baseUrl }) => {
      const api = (window as unknown as { zbot: any }).zbot;
      await api.providers.upsert({
        name: 'E2E OCR model',
        kind: 'openai-compatible',
        purpose: 'general',
        model: 'e2e-model',
        baseUrl,
        apiKey: 'e2e-key',
        temperature: 0,
        maxTokens: 128,
        isDefault: true
      });
    },
    { baseUrl }
  );

  await page.getByRole('link', { name: 'Chat', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(
    join(process.cwd(), 'tests/fixtures/ocr-sample.png')
  );
  const composer = page.getByRole('textbox', { name: '消息' });
  await composer.fill('读一下这张图片');
  await composer.press('Enter');
  await expect(page.getByText('你好，我在这里。')).toBeVisible({ timeout: 30_000 });

  const serialized = JSON.stringify(requestBodies);
  expect(serialized).toContain('local_ocr');
  expect(serialized).toContain('OCR');
  expect(serialized).toContain('12345');
});
