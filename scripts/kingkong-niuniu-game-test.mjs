import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const OUT = '/workspace/docs/kingkong-review/screenshots/niuniu-game-test';

async function snap(page, frame, name) {
  await page.screenshot({ path: path.join(OUT, `${name}-page.png`), fullPage: true });
  if (frame) {
    try { await frame.locator('body').screenshot({ path: path.join(OUT, `${name}-frame.png`) }); } catch (_) {}
  }
}

function vueFrame(page) {
  return page.frames().find((f) => f.url().includes('prod-broadgame-client.api987.com/vue'));
}

async function readFrame(page) {
  const f = vueFrame(page);
  if (!f) return { error: 'no vue frame' };
  return f.evaluate(() => {
    const all = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const fonts = [...new Set([...document.querySelectorAll('*')].slice(0, 500).map((el) => {
      const s = getComputedStyle(el);
      return s.fontFamily;
    }).filter(Boolean))].slice(0, 15);
    return {
      hash: location.hash,
      url: location.href,
      title: document.title,
      text: all.slice(0, 1500),
      fonts,
      buttons: [...document.querySelectorAll('button, a, div, span')].filter((el) => {
        const t = (el.textContent || '').trim();
        return t && t.length <= 12 && t.length >= 2 && el.children.length === 0;
      }).slice(0, 50).map((el) => t.trim()),
    };
  }).catch(() => ({ url: f.url(), text: '' }));
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'zh-CN');
  });
  await page.goto(`${BASE}#/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="tel"]').first().fill('5017252878');
  await page.locator('input[type="password"]').first().fill('qwe123');
  await page.locator('.login-button').first().click();
  await page.waitForTimeout(4000);
}

async function enterNiuniu(page) {
  await page.goto(`${BASE}#/base/game`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.locator('.second-tab-item:has-text("牌局")').click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator('.game-card').filter({ hasText: '牛牛' }).first().click({ force: true });
  await page.waitForTimeout(12000);
}

async function clickInFrame(page, labels) {
  const f = vueFrame(page);
  if (!f) return null;
  for (const label of labels) {
    const loc = f.locator(`text=${label}`).first();
    if (await loc.count()) {
      await loc.click({ force: true });
      await page.waitForTimeout(5000);
      return label;
    }
  }
  return null;
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
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  })).newPage();

  const nav = [];
  page.on('framenavigated', (f) => {
    if (f.url().includes('prod-broadgame') || f.url().includes('miniapp')) nav.push(f.url());
  });

  const report = { steps: [], nav: [] };

  await login(page);
  await enterNiuniu(page);
  report.steps.push({ step: 'entry', ...(await readFrame(page)), h5hash: await page.evaluate(() => location.hash) });
  await snap(page, vueFrame(page), '01-join-entry');

  // Try create room
  const createClicked = await clickInFrame(page, ['创建房间', 'Create']);
  report.steps.push({ step: 'create-room-click', clicked: createClicked, ...(await readFrame(page)) });
  await snap(page, vueFrame(page), '02-create-room');

  // Back if needed
  await clickInFrame(page, ['返回', '取消', '关闭']);
  await page.waitForTimeout(2000);

  // Try join room
  const joinClicked = await clickInFrame(page, ['加入房间', 'Join']);
  report.steps.push({ step: 'join-room-click', clicked: joinClicked, ...(await readFrame(page)) });
  await snap(page, vueFrame(page), '03-join-room');

  // Try input room number if visible
  const f = vueFrame(page);
  if (f) {
    const inputs = await f.locator('input').all();
    for (let i = 0; i < inputs.length; i++) {
      const ph = await inputs[i].getAttribute('placeholder').catch(() => '');
      report.steps.push({ step: `input-${i}`, placeholder: ph });
    }
    if (inputs.length) {
      await inputs[0].fill('123456').catch(() => {});
      await page.waitForTimeout(1000);
      await clickInFrame(page, ['确定', '加入', '确认', '进入']);
      report.steps.push({ step: 'join-with-code', ...(await readFrame(page)) });
      await snap(page, vueFrame(page), '04-join-with-code');
    }
  }

  // Navigate to home lobby and click 牛牛 hex icon
  const vf = vueFrame(page);
  if (vf) {
    await vf.evaluate(() => { window.location.hash = '#/home'; });
    await page.waitForTimeout(4000);
    report.steps.push({ step: 'home-lobby', ...(await readFrame(page)) });
    await snap(page, vueFrame(page), '05-home-lobby');
    await clickInFrame(page, ['牛牛']);
    await page.waitForTimeout(5000);
    report.steps.push({ step: 'home-click-niuniu', ...(await readFrame(page)) });
    await snap(page, vueFrame(page), '06-home-niuniu');
  }

  // Check if auto-entered detail room
  await vf?.evaluate(() => { window.location.hash = '#/join?gameType=2&jumpType=friend'; }).catch(() => {});
  await page.waitForTimeout(3000);
  await clickInFrame(page, ['创建房间']);
  await page.waitForTimeout(8000);
  report.steps.push({ step: 'create-from-join', ...(await readFrame(page)) });
  await snap(page, vueFrame(page), '07-after-create');

  // Collect all frame URLs including cocos
  report.nav = [...new Set(nav)];
  report.allFrames = page.frames().map((fr) => fr.url()).filter((u) => u.includes('prod-broadgame') || u.includes('cocos'));

  // Font audit across frames
  const fontAudit = [];
  for (const fr of page.frames()) {
    if (!fr.url().includes('prod-broadgame')) continue;
    const audit = await fr.evaluate(() => {
      const sample = [...document.querySelectorAll('body, div, span, button, p, h1, h2, h3, label')].slice(0, 80);
      const families = new Map();
      for (const el of sample) {
        const ff = getComputedStyle(el).fontFamily;
        const fs = getComputedStyle(el).fontSize;
        families.set(ff, (families.get(ff) || 0) + 1);
      }
      return Object.fromEntries(families);
    }).catch(() => ({}));
    fontAudit.push({ url: fr.url().slice(0, 100), fonts: audit });
  }
  report.fontAudit = fontAudit;

  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ steps: report.steps.length, nav: report.nav.slice(-8), fontAudit }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
