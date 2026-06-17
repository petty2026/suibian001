import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const OUT = '/workspace/docs/kingkong-review/screenshots/session-2026-06-17/logged-in';

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // 清空登录态，并设简体中文
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'zh-CN');
  });

  await page.goto(`${BASE}#/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.locator('input[type="tel"]').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input[type="tel"]').first().fill('5017252878');
  await page.locator('input[type="password"]').first().fill('qwe123');
  await page.waitForTimeout(800);
  await page.locator('.login-button:not(.login-button-disable), .login-button').first().click({ timeout: 10000 });
  await page.waitForTimeout(4000);

  const hash = await page.evaluate(() => location.hash);
  const loggedIn = !hash.includes('login');
  const summary = { hash, loggedIn, preview: await page.evaluate(() => (document.body?.innerText || '').slice(0, 300)) };

  if (loggedIn) {
    for (const [name, h] of [
      ['home', '#/base/game'],
      ['my', '#/base/my'],
      ['conversation', '#/base/service'],
      ['bill', '#/bill'],
    ]) {
      await page.goto(`${BASE}${h}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    }
  } else {
    await page.screenshot({ path: path.join(OUT, 'login-failed.png'), fullPage: true });
  }

  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
