import { _electron as electron } from 'playwright';

const app = await electron.launch({
  cwd: 'D:/z-bot/apps/desktop',
  args: ['.'],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});

app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
app.process().stdout?.on('data', (chunk) => process.stdout.write(chunk));

const page = await app.firstWindow();
page.on('console', (message) => {
  console.log('[renderer console]', message.type(), message.text());
});
page.on('pageerror', (error) => {
  console.error('[renderer pageerror]', error);
});
await page.waitForTimeout(3000);
console.log('title:', await page.title());
console.log('url:', page.url());
console.log('body:', (await page.locator('body').innerText()).slice(0, 1200));
await app.close();
