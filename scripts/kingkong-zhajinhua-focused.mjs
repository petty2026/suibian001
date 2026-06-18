import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const ROOM = process.env.ROOM || '984332';
const OUT = '/workspace/docs/kingkong-review/screenshots/zhajinhua-flows';

const vueFrame = (page) => page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/vue'));
const cocosFrame = (page) => page.frames().find((f) => /prod-broadgame-client\.api987\.com\/\?time=/.test(f.url()));

async function snap(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function clickInCocos(page, rx, ry, wait = 5000) {
  const cf = cocosFrame(page);
  if (!cf) {
    await page.mouse.click(rx * 390, ry * 844, { wait });
    await page.waitForTimeout(wait);
    return false;
  }
  const canvas = cf.locator('canvas').first();
  const box = await canvas.boundingBox().catch(() => null);
  if (!box) {
    await page.mouse.click(rx * 390, ry * 844);
    await page.waitForTimeout(wait);
    return false;
  }
  await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry);
  await page.waitForTimeout(wait);
  return true;
}

async function loginAndEnterZhajinhua(page) {
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
  if (await page.locator('text=接受').count()) {
    await page.locator('text=接受').first().click({ force: true }).catch(() => {});
  }
  await page.locator('.second-tab-item:has-text("牌局")').click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator('.game-card').filter({ hasText: '炸金花' }).first().click({ force: true });
  await page.waitForTimeout(12000);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    deviceScaleFactor: 2,
  })).newPage();

  const report = {};

  await loginAndEnterZhajinhua(page);
  await snap(page, 'F1-join-page');

  // 创建房间
  await clickInCocos(page, 0.5, 0.48, 8000);
  await snap(page, 'F2-create-keypad');

  // 回到 join 并进房
  await vueFrame(page)?.evaluate(() => { window.location.hash = '#/join?gameType=1&jumpType=friend'; });
  await page.waitForTimeout(5000);
  await vueFrame(page)?.evaluate((room) => { window.location.hash = `#/detail?room=${room}&gameType=1`; }, ROOM);
  await page.waitForTimeout(15000);
  await snap(page, 'F3-room-entry');

  // 关闭 H5 tooltip if visible
  await page.locator('text=点击此按钮').count().then(async (c) => {
    if (c) await page.mouse.click(360, 120);
  });
  await page.waitForTimeout(1000);
  await snap(page, 'F4-room-table');

  // 点顶部空座 (relative coords on canvas)
  await clickInCocos(page, 0.5, 0.32, 5000);
  await snap(page, 'F5-seat-buyin');

  // +50 & 确定区域
  await clickInCocos(page, 0.38, 0.78, 1500);
  await clickInCocos(page, 0.72, 0.88, 3000);
  await snap(page, 'F6-after-buyin');

  // 点底部自己位置 / 离座
  await clickInCocos(page, 0.5, 0.88, 4000);
  await snap(page, 'F7-leave-seat-click');

  await clickInCocos(page, 0.5, 0.92, 4000);
  await snap(page, 'F8-after-leave');

  report.url = vueFrame(page)?.url();
  await writeFile(path.join(OUT, 'focused-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('done', report.url);
}

main().catch((e) => { console.error(e); process.exit(1); });
