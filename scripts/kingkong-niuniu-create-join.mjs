import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = '/workspace/docs/kingkong-review/screenshots/niuniu-game-test';
const BASE = 'https://kingkong.ac/mobile.html';

async function setup(page) {
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lang', 'zh-CN'); });
  await page.goto(`${BASE}#/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="tel"]').first().fill('5017252878');
  await page.locator('input[type="password"]').first().fill('qwe123');
  await page.locator('.login-button').first().click();
  await page.waitForTimeout(4000);
  await page.goto(`${BASE}#/base/game`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.locator('.second-tab-item:has-text("牌局")').click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator('.game-card').filter({ hasText: '牛牛' }).first().click({ force: true });
  await page.waitForTimeout(12000);
}

const vf = (page) => page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/vue'));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();
  const nav = [];
  page.on('framenavigated', (f) => { if (f.url().includes('prod-broadgame')) nav.push(f.url()); });

  await setup(page);
  await page.mouse.click(50, 50);
  await page.waitForTimeout(1000);

  // Create room
  nav.length = 0;
  await page.mouse.click(195, 420);
  await page.waitForTimeout(10000);
  console.log('CREATE', vf(page)?.url(), nav.slice(-5));
  await vf(page)?.locator('body').screenshot({ path: `${OUT}/08-create-room-result.png` }).catch(() => {});

  // Join room
  await vf(page)?.evaluate(() => { window.location.hash = '#/join?gameType=2&jumpType=friend'; });
  await page.waitForTimeout(3000);
  nav.length = 0;
  await page.mouse.click(195, 560);
  await page.waitForTimeout(8000);
  console.log('JOIN', vf(page)?.url(), nav.slice(-5));
  await vf(page)?.locator('body').screenshot({ path: `${OUT}/09-join-room-result.png` }).catch(() => {});

  // Read visible text from all frames after join click
  for (const fr of page.frames()) {
    const t = await fr.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
    if (t) console.log('TEXT', fr.url().slice(0, 80), t.slice(0, 200));
  }

  await browser.close();
}

main();
