import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const ROOM = '501813';
const OUT = '/workspace/docs/kingkong-review/screenshots/zhajinhua-room-501813';

const vueFrame = (page) => page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/vue'));
const cocosFrame = (page) => page.frames().find((f) => /prod-broadgame-client\.api987\.com\/\?time=/.test(f.url()));

async function snap(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}-page.png`), fullPage: true });
  const vf = vueFrame(page);
  if (vf) try { await vf.locator('body').screenshot({ path: path.join(OUT, `${name}-vue.png`) }); } catch (_) {}
  const cf = cocosFrame(page);
  if (cf) try { await cf.locator('body').screenshot({ path: path.join(OUT, `${name}-cocos.png`) }); } catch (_) {}
}

async function readAllText(page) {
  const out = {};
  for (const fr of page.frames()) {
    if (!fr.url().includes('prod-broadgame')) continue;
    const t = await fr.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
    if (t) out[fr.url().slice(0, 120)] = t.slice(0, 1200);
  }
  return out;
}

async function clickCanvas(page, x, y, wait = 5000) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(wait);
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

async function enterRoom(page, report) {
  const vf = vueFrame(page);
  if (!vf) return { error: 'no vue frame' };

  // Join via room number keypad
  await clickCanvas(page, 195, 560, 8000);
  report.steps.push({ action: 'click-加入房间', text: await readAllText(page), url: vf.url() });
  await snap(page, '01-join-keypad');

  for (const d of ROOM.split('')) {
    const col = (Number(d) - 1) % 3;
    const row = Math.floor(Number(d === '0' ? 9 : Number(d) - 1) / 3);
    const xs = [100, 195, 290];
    const ys = [520, 570, 620, 670];
    const xi = Number(d) === 0 ? 1 : col;
    const yi = Number(d) === 0 ? 3 : row;
    await clickCanvas(page, xs[xi] ?? 195, ys[yi] ?? 620, 800);
  }
  report.steps.push({ action: `input-room-${ROOM}`, text: await readAllText(page), url: vf.url() });
  await snap(page, '02-after-room-input');

  // Fallback: direct hash navigation
  if (!vf.url().includes(`room=${ROOM}`)) {
    await vf.evaluate((room) => { window.location.hash = `#/detail?room=${room}&gameType=1`; }, ROOM);
    await page.waitForTimeout(12000);
    report.steps.push({ action: 'direct-nav-detail', text: await readAllText(page), url: vueFrame(page)?.url() });
    await snap(page, '03-direct-detail');
  } else {
    await page.waitForTimeout(8000);
    await snap(page, '03-in-room');
  }

  return { url: vueFrame(page)?.url(), cocosUrl: cocosFrame(page)?.url() };
}

async function playInRoom(page, report) {
  const interactions = [];

  // Wait for Cocos table to render
  await page.waitForTimeout(8000);
  await snap(page, '04-table-loaded');

  const seatClicks = [
    ['seat-top', 195, 300],
    ['seat-left', 70, 420],
    ['seat-right', 320, 420],
    ['seat-bottom-left', 70, 620],
    ['seat-bottom-right', 320, 620],
    ['seat-center-msg', 195, 450],
  ];

  for (const [name, x, y] of seatClicks) {
    await clickCanvas(page, x, y, 6000);
    interactions.push({ action: `click-${name}`, text: await readAllText(page), url: vueFrame(page)?.url() });
    await snap(page, `05-${name}`);
  }

  // Menu / share / stats icons from screenshot
  for (const [name, x, y] of [
    ['menu', 35, 120],
    ['share', 355, 120],
    ['trophy', 35, 780],
    ['stats', 90, 780],
    ['minimize', 195, 100],
  ]) {
    await clickCanvas(page, x, y, 4000);
    interactions.push({ action: `click-${name}`, text: await readAllText(page), url: vueFrame(page)?.url() });
    await snap(page, `06-${name}`);
  }

  // Try common in-game action areas (bet/fold/call)
  for (const [name, x, y] of [
    ['action-bottom-center', 195, 760],
    ['action-bottom-left', 80, 760],
    ['action-bottom-right', 310, 760],
  ]) {
    await clickCanvas(page, x, y, 4000);
    interactions.push({ action: `click-${name}`, text: await readAllText(page) });
    await snap(page, `07-${name}`);
  }

  report.inRoom = { interactions, finalText: await readAllText(page), finalUrl: vueFrame(page)?.url() };
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

  const nav = [];
  page.on('framenavigated', (f) => {
    if (f.url().includes('prod-broadgame')) nav.push({ t: Date.now(), url: f.url() });
  });

  const report = { room: ROOM, steps: [], nav: [] };

  await loginAndEnterZhajinhua(page);
  report.entry = { url: vueFrame(page)?.url(), text: await readAllText(page) };
  await snap(page, '00-zhajinhua-join');

  const roomResult = await enterRoom(page, report);
  report.roomResult = roomResult;

  await playInRoom(page, report);
  report.nav = nav;

  await writeFile(path.join(OUT, 'play-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('done', report.roomResult?.url || report.roomResult?.error);
}

main().catch((e) => { console.error(e); process.exit(1); });
