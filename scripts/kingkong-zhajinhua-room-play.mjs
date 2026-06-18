import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const ROOM = process.env.ROOM || '984332';
const OUT = `/workspace/docs/kingkong-review/screenshots/zhajinhua-room-${ROOM}`;

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
    if (t) out[fr.url().slice(0, 120)] = t.slice(0, 1500);
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

  await vf.evaluate((room) => { window.location.hash = `#/detail?room=${room}&gameType=1`; }, ROOM);
  await page.waitForTimeout(14000);
  report.steps.push({ action: 'direct-nav-detail', text: await readAllText(page), url: vf.url() });
  await snap(page, '01-in-room');

  return { url: vueFrame(page)?.url(), cocosUrl: cocosFrame(page)?.url() };
}

async function tryBuyIn(page, report) {
  const steps = [];
  // click empty seat top
  await clickCanvas(page, 195, 280, 4000);
  await snap(page, '02-seat-click');
  steps.push({ action: 'click-seat-top', text: await readAllText(page) });

  // try +50 quick add and confirm
  for (const [name, x, y] of [
    ['plus-50', 145, 620],
    ['plus-50-alt', 195, 600],
    ['confirm', 280, 720],
    ['confirm-center', 195, 720],
  ]) {
    await clickCanvas(page, x, y, 2500);
    steps.push({ action: name, text: await readAllText(page) });
    await snap(page, `03-${name}`);
  }

  report.buyIn = steps;
}

async function exploreSeatedState(page, report) {
  const steps = [];
  await page.waitForTimeout(3000);
  await snap(page, '04-table-state');

  for (const [name, x, y] of [
    ['leave-seat', 195, 780],
    ['leave-seat-alt', 195, 820],
    ['emoji', 355, 780],
    ['menu', 35, 120],
    ['share', 355, 120],
    ['minimize', 195, 100],
    ['trophy', 35, 780],
    ['stats', 90, 780],
    ['seat-empty-left', 70, 420],
    ['seat-empty-right', 320, 420],
  ]) {
    await clickCanvas(page, x, y, 4500);
    steps.push({ action: `click-${name}`, text: await readAllText(page), url: vueFrame(page)?.url() });
    await snap(page, `05-${name}`);
  }

  report.explore = steps;
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

  report.roomResult = await enterRoom(page, report);
  await tryBuyIn(page, report);
  await exploreSeatedState(page, report);
  report.nav = nav;
  report.final = { url: vueFrame(page)?.url(), text: await readAllText(page) };

  await writeFile(path.join(OUT, 'play-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('done', report.roomResult?.url);
}

main().catch((e) => { console.error(e); process.exit(1); });
