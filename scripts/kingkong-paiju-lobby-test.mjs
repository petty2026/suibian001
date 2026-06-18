import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const OUT = '/workspace/docs/kingkong-review/screenshots/paiju-lobby-test';

async function snap(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function bodyPreview(page, len = 500) {
  return page.evaluate((n) => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, n), len);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    locale: 'zh-CN',
  })).newPage();

  const log = [];

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'zh-CN');
  });

  // login
  await page.goto(`${BASE}#/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="tel"]').first().fill('5017252878');
  await page.locator('input[type="password"]').first().fill('qwe123');
  await page.waitForTimeout(500);
  await page.locator('.login-button').first().click();
  await page.waitForTimeout(4000);
  log.push({ step: 'login', hash: await page.evaluate(() => location.hash), preview: await bodyPreview(page, 200) });
  await snap(page, '01-after-login');

  // go home
  await page.goto(`${BASE}#/base/game`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await snap(page, '02-home');

  // switch to 传统模式
  const classic = page.locator('text=传统模式').first();
  if (await classic.count()) {
    await classic.click();
    await page.waitForTimeout(2000);
    log.push({ step: 'click-classic-mode', preview: await bodyPreview(page, 300) });
    await snap(page, '03-classic-mode');
  }

  // click 牌局 category
  const paiju = page.locator('text=牌局').first();
  if (await paiju.count()) {
    await paiju.click();
    await page.waitForTimeout(2000);
    log.push({ step: 'click-paiju-tab', preview: await bodyPreview(page, 300) });
    await snap(page, '04-paiju-category');
  }

  // try click game cards
  for (const game of ['牛牛', '炸金花', '三公', '十三水']) {
    const card = page.locator(`text=${game}`).first();
    if (await card.count()) {
      await card.click();
      await page.waitForTimeout(5000);
      const info = await page.evaluate(() => ({
        hash: location.hash,
        href: location.href,
        title: document.title,
        hasIframe: !!document.querySelector('iframe'),
        iframeSrc: document.querySelector('iframe')?.src || null,
      }));
      const preview = await bodyPreview(page, 600);
      const hasLobbyTitle = preview.includes('金刚牌局') || preview.includes('好友组局') || preview.includes('世界大战');
      log.push({ step: `click-${game}`, info, preview, hasLobbyTitle });
      await snap(page, `05-click-${game}`);
      if (hasLobbyTitle) break;
      // go back if possible
      const back = page.locator('text=返回, .back, [class*="back"]').first();
      if (await back.count()) {
        await back.click().catch(() => {});
        await page.waitForTimeout(1500);
      } else {
        await page.goBack().catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
  }

  // check all frames
  const frames = page.frames().map((f) => ({ url: f.url(), name: f.name() }));
  log.push({ step: 'frames', frames });

  await writeFile(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
  await browser.close();
  console.log(JSON.stringify(log, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
