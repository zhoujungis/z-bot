import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userDataDir = mkdtempSync(join(tmpdir(), 'zbot-packaged-'));
const app = await electron.launch({
  executablePath: 'D:/z-bot/release/win-unpacked/Z Bot.exe',
  args: [],
  env: { ...process.env, ZBOT_USER_DATA_DIR: userDataDir }
});

const page = await app.firstWindow();
page.on('pageerror', (error) => console.error('[pageerror]', error));
await page.waitForTimeout(2500);
console.log('title:', await page.title());
console.log('body:', (await page.locator('body').innerText()).slice(0, 400));
console.log('zbot api:', await page.evaluate(() => Boolean(window.zbot)));
await app.close();
rmSync(userDataDir, { recursive: true, force: true });
