import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const OUT = '/workspace/docs/kingkong-review/screenshots/zhajinhua-flows';

const vueFrame = (page) => page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/vue'));
const cocosFrame = (page) => page.frames().find((f) => /prod-broadgame-client\.api987\.com\/\?time=/.test(f.url()));

async function snap(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function readAllText(page) {
  const out = {};
  for (const fr of page.frames()) {
    if (!fr.url().includes('prod-broadgame')) continue;
    const t = await fr.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
    if (t) out[fr.url().slice(0, 100)] = t.slice(0, 1200);
  }
  return out;
}

async function clickCanvas(page, x, y, wait = 5000) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(wait);
}

async function tapKeypad(page, digits) {
  const xs = [100, 195, 290];
  const ys = [520, 570, 620, 670];
  const layout = {
    '1': [0, 0], '2': [1, 0], '3': [2, 0],
    '4': [0, 1], '5': [1, 1], '6': [2, 1],
    '7': [0, 2], '8': [1, 2], '9': [2, 2],
    '0': [1, 3],
  };
  for (const d of digits.split('')) {
    const [xi, yi] = layout[d] || [1, 1];
    await clickCanvas(page, xs[xi], ys[yi], 600);
  }
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

async function tryBuyInConfirm(page) {
  // +50 then confirm - scan common positions
  await clickCanvas(page, 145, 640, 1500);
  await clickCanvas(page, 195, 640, 1500);
  await clickCanvas(page, 280, 730, 2000);
  await clickCanvas(page, 195, 730, 2000);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    deviceScaleFactor: 2,
  })).newPage();

  const report = { flows: {} };

  await loginAndEnterZhajinhua(page);
  await snap(page, 'A1-join-lobby');
  report.flows.entry = { url: vueFrame(page)?.url(), text: await readAllText(page) };

  // === FLOW A: 创建房间 ===
  const createFlow = [];
  await clickCanvas(page, 50, 50, 800);
  await clickCanvas(page, 195, 400, 8000);
  createFlow.push({ step: 'click-create', text: await readAllText(page) });
  await snap(page, 'A2-create-keypad');

  // type random 6 digit room
  await tapKeypad(page, '984332');
  await page.waitForTimeout(3000);
  createFlow.push({ step: 'input-984332', url: vueFrame(page)?.url(), text: await readAllText(page) });
  await snap(page, 'A3-create-after-input');

  // try confirm if still on keypad
  await clickCanvas(page, 195, 650, 8000);
  createFlow.push({ step: 'try-confirm', url: vueFrame(page)?.url(), text: await readAllText(page) });
  await snap(page, 'A4-create-result');
  report.flows.createRoom = createFlow;

  // === FLOW B: 加入房间 984332 ===
  await vueFrame(page)?.evaluate(() => { window.location.hash = '#/join?gameType=1&jumpType=friend'; });
  await page.waitForTimeout(6000);
  await snap(page, 'B1-join-lobby-reset');

  await clickCanvas(page, 195, 560, 8000);
  await snap(page, 'B2-join-keypad');
  await tapKeypad(page, '984332');
  await page.waitForTimeout(4000);
  await snap(page, 'B3-join-after-input');

  const vf = vueFrame(page);
  if (!vf?.url().includes('room=984332')) {
    await vf?.evaluate(() => { window.location.hash = '#/detail?room=984332&gameType=1'; });
    await page.waitForTimeout(14000);
  }
  await snap(page, 'B4-in-room-table');
  report.flows.joinRoom = { url: vueFrame(page)?.url(), text: await readAllText(page) };

  // === FLOW C: 坐下（点空座 + 带入）===
  const sitFlow = [];
  await clickCanvas(page, 195, 280, 5000);
  sitFlow.push({ step: 'click-seat-top', text: await readAllText(page) });
  await snap(page, 'C1-buyin-modal');

  await tryBuyInConfirm(page);
  sitFlow.push({ step: 'buyin-plus50-confirm', text: await readAllText(page) });
  await snap(page, 'C2-after-buyin');

  // try other empty seats if not seated
  await clickCanvas(page, 320, 420, 4000);
  await snap(page, 'C3-click-seat-right');
  await tryBuyInConfirm(page);
  await snap(page, 'C4-seated-attempt');
  report.flows.sitDown = sitFlow;

  // === FLOW D: 站起/离座 ===
  const standFlow = [];
  // 离座 button area (bottom center, user's screenshot)
  for (const [name, x, y] of [
    ['leave-seat-main', 195, 800],
    ['leave-seat-btn', 195, 760],
    ['leave-seat-low', 195, 820],
    ['own-avatar', 195, 700],
  ]) {
    await clickCanvas(page, x, y, 4000);
    standFlow.push({ step: name, url: vueFrame(page)?.url(), text: await readAllText(page) });
    await snap(page, `D-${name}`);
  }
  report.flows.standUp = standFlow;

  // === Extra captures ===
  await clickCanvas(page, 70, 420, 3000);
  await snap(page, 'E1-profile-card');
  await clickCanvas(page, 195, 100, 3000);
  await snap(page, 'E2-minimize-hint');
  await clickCanvas(page, 355, 780, 3000);
  await snap(page, 'E3-emoji-click');

  report.final = { url: vueFrame(page)?.url(), text: await readAllText(page) };
  await writeFile(path.join(OUT, 'flow-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('saved to', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
