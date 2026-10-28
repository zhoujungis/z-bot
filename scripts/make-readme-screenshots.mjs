import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userData = mkdtempSync(join(tmpdir(), 'zbot-readme-'));
mkdirSync('docs', { recursive: true });

function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function chunk(delta, finish = null) {
  return sse({
    id: 'readme-demo',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'demo-model',
    choices: [{ index: 0, delta, finish_reason: finish }]
  });
}

const server = createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    response.write(chunk({ role: 'assistant', content: '今天你的重点是发布 Z Bot。' }));
    response.write(chunk({ content: ' 我建议先检查安装包和 MSI，再确认 NanoBrowser 的回归状态。' }));
    response.write(chunk({}, 'stop'));
    response.end('data: [DONE]\n\n');
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/v1`;

const app = await electron.launch({
  cwd: join(process.cwd(), 'apps/desktop'),
  args: ['.'],
  env: { ...process.env, ZBOT_USER_DATA_DIR: userData }
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'light';
});

const now = Date.now();
await page.evaluate(
  async ({ now, baseUrl }) => {
    const api = window.zbot;
    await api.settings.update({
      ...(await api.settings.get()),
      appearance: { theme: 'light', density: 'comfortable' }
    });
    await api.projects.upsert({
      name: 'NanoBrowser',
      path: 'D:\\Projects\\NanoBrowser',
      description: '轻量浏览器项目',
      watchEnabled: true
    });
    await api.projects.upsert({
      name: 'NanoHermes',
      path: 'D:\\Projects\\NanoHermes',
      description: '专业编程 Agent',
      watchEnabled: false
    });
    await api.projects.upsert({
      name: 'Z Bot',
      path: 'D:\\z-bot',
      description: '本地优先私人 AI 助理',
      watchEnabled: true
    });
    await api.todos.upsert({ title: '发布 Z Bot v0.1', priority: 'high', dueAt: now + 86_400_000 });
    await api.todos.upsert({ title: '检查 NanoBrowser 回归', priority: 'medium' });
    await api.todos.upsert({ title: '整理本周项目笔记', priority: 'low' });
    await api.reminders.upsert({
      title: '跟进发布状态',
      triggerAt: now + 3_600_000,
      enabled: true
    });
    await api.memory.upsert({
      type: 'user',
      content: '用户喜欢简洁、直接、有上下文的回答。',
      importance: 0.9,
      confidence: 0.95,
      tags: ['偏好', 'UI']
    });
    await api.memory.upsert({
      type: 'project',
      content: 'Z Bot 采用 Electron + React + TypeScript，保持本地优先。',
      importance: 0.85,
      confidence: 0.95,
      tags: ['架构']
    });
    await api.providers.upsert({
      name: 'Demo model',
      kind: 'openai-compatible',
      purpose: 'general',
      model: 'demo-model',
      baseUrl,
      apiKey: 'demo-key',
      temperature: 0.2,
      maxTokens: 256,
      isDefault: true
    });
  },
  { now, baseUrl }
);

await page.getByRole('link', { name: 'Chat', exact: true }).click();
const composer = page.getByRole('textbox', { name: '消息' });
await composer.fill('帮我总结一下今天的安排');
await composer.press('Enter');
await page.getByText('今天你的重点是发布 Z Bot。').waitFor({ timeout: 15_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/chat.png' });

await page.getByRole('link', { name: 'Home', exact: true }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/home.png' });

await page.getByRole('link', { name: 'Memory', exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/memory.png' });

await app.close();
server.close();
rmSync(userData, { recursive: true, force: true });
console.log('screenshots written to docs/');
