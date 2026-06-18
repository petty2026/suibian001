import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const OUT = '/workspace/docs/kingkong-review/screenshots/niuniu-flows';

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
    if (t) out[fr.url().slice(0, 100)] = t.slice(0, 800);
  }
  return out;
}

async function loginAndEnterNiuniu(page) {
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

async function clickCanvas(page, x, y, wait = 6000) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(wait);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();
  const nav = [];
  page.on('framenavigated', (f) => { if (f.url().includes('prod-broadgame')) nav.push({ t: Date.now(), url: f.url() }); });

  const report = { flows: {} };

  await loginAndEnterNiuniu(page);
  report.flows.entry = { url: vueFrame(page)?.url(), text: await readAllText(page) };
  await snap(page, '00-join-entry');

  // === FLOW A: 创建房间 ===
  const flowA = { steps: [] };
  await clickCanvas(page, 50, 50, 1000); // dismiss tooltip area
  await clickCanvas(page, 195, 400, 8000);
  flowA.steps.push({ action: 'click-创建房间', url: vueFrame(page)?.url(), text: await readAllText(page), nav: nav.slice(-5) });
  await snap(page, 'A1-after-create-click');

  // try common confirm buttons
  for (const [label, y] of [['确定', 650], ['确认', 650], ['创建', 500], ['开始', 700]]) {
    await clickCanvas(page, 195, y, 3000);
    const t = await readAllText(page);
    if (Object.values(t).some((v) => v.includes(label) || v.length > 100)) {
      flowA.steps.push({ action: `click-${label}`, text: t });
      await snap(page, `A2-${label}`);
    }
  }

  // === FLOW B: 加入房间 ===
  await vueFrame(page)?.evaluate(() => { window.location.hash = '#/join?gameType=2&jumpType=friend'; });
  await page.waitForTimeout(4000);
  await clickCanvas(page, 195, 560, 8000);
  const flowB = { steps: [] };
  flowB.steps.push({ action: 'click-加入房间', url: vueFrame(page)?.url(), text: await readAllText(page) });
  await snap(page, 'B1-after-join-click');

  // try typing room number in canvas - use keyboard
  await page.keyboard.type('904949');
  await page.waitForTimeout(1000);
  await clickCanvas(page, 195, 650, 5000);
  flowB.steps.push({ action: 'input-room-904949+confirm', url: vueFrame(page)?.url(), text: await readAllText(page), nav: nav.slice(-8) });
  await snap(page, 'B2-join-attempt');

  // try clicking number pad areas if visible
  for (const y of [520, 560, 600, 640]) {
    await clickCanvas(page, 195, y, 2000);
  }
  flowB.steps.push({ action: 'join-interactions', url: vueFrame(page)?.url(), text: await readAllText(page) });
  await snap(page, 'B3-join-final');

  report.flows.createRoom = flowA;
  report.flows.joinRoom = flowB;

  // === FLOW C: 在房间玩游戏 ===
  nav.length = 0;
  await vueFrame(page)?.evaluate(() => { window.location.hash = '#/detail?room=904949&gameType=1'; });
  await page.waitForTimeout(12000);
  const flowC = {
    url: vueFrame(page)?.url(),
    cocosUrl: cocosFrame(page)?.url(),
    text: await readAllText(page),
    nav: nav.slice(-10),
  };
  await snap(page, 'C1-in-room');
  await page.waitForTimeout(5000);
  await snap(page, 'C2-in-room-delay');

  // try in-room clicks (common game UI areas)
  for (const [name, x, y] of [['center', 195, 420], ['bottom-action', 195, 750], ['top-menu', 350, 80]]) {
    await clickCanvas(page, x, y, 4000);
    await snap(page, `C3-click-${name}`);
  }
  flowC.afterClicks = { text: await readAllText(page), url: vueFrame(page)?.url() };
  report.flows.inRoom = flowC;

  report.allNav = nav;
  await writeFile(path.join(OUT, 'flow-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('done', Object.keys(report.flows));
}

main().catch((e) => { console.error(e); process.exit(1); });
