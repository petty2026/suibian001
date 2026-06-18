import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const OUT = '/workspace/docs/kingkong-review/screenshots/niuniu-game-test';

async function snap(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const vf = page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/vue'));
  if (vf) {
    try { await vf.locator('body').screenshot({ path: path.join(OUT, `${name}-frame.png`) }); } catch (_) {}
  }
  const cocos = page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/?time'));
  if (cocos) {
    try { await cocos.locator('body').screenshot({ path: path.join(OUT, `${name}-cocos.png`) }); } catch (_) {}
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();
  const nav = [];
  page.on('framenavigated', (f) => { if (f.url().includes('prod-broadgame')) nav.push(f.url()); });

  const report = { flows: [] };

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
  nav.length = 0;
  await page.locator('.game-card').filter({ hasText: '牛牛' }).first().click({ force: true });
  await page.waitForTimeout(15000);
  report.flows.push({ step: 'after-entry', nav: [...nav], hash: await page.frames().find(f=>f.url().includes('vue'))?.url() });
  await snap(page, '01-join-lobby');

  const vf = () => page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/vue'));

  // Coordinate click: 创建房间 button ~ center-top of main area (y~420)
  await page.mouse.click(195, 420);
  await page.waitForTimeout(8000);
  report.flows.push({ step: 'click-create-coords', nav: [...nav], vueUrl: vf()?.url() });
  await snap(page, '02-after-create-click');

  // Coordinate click: 加入房间 button ~ y~560
  await vf()?.evaluate(() => { window.location.hash = '#/join?gameType=2&jumpType=friend'; });
  await page.waitForTimeout(4000);
  await page.mouse.click(195, 560);
  await page.waitForTimeout(8000);
  report.flows.push({ step: 'click-join-coords', nav: [...nav], vueUrl: vf()?.url() });
  await snap(page, '03-after-join-click');

  // Check detail room auto redirect from earlier sessions
  await vf()?.evaluate(() => { window.location.hash = '#/detail?room=904949&gameType=1'; });
  await page.waitForTimeout(8000);
  report.flows.push({ step: 'detail-room', nav: [...nav], vueUrl: vf()?.url() });
  await snap(page, '04-detail-room');

  // Font audit
  const fonts = {};
  for (const fr of page.frames()) {
    if (!fr.url().includes('prod-broadgame')) continue;
    const f = await fr.evaluate(() => {
      const map = {};
      for (const el of document.querySelectorAll('*')) {
        const ff = getComputedStyle(el).fontFamily;
        if (ff) map[ff] = (map[ff] || 0) + 1;
      }
      return map;
    }).catch(() => ({}));
    fonts[fr.url().slice(0, 90)] = f;
  }
  report.fonts = fonts;
  report.allNav = [...new Set(nav)];

  await writeFile(path.join(OUT, 'flow-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
