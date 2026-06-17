import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BASE = 'https://kingkong.ac/mobile.html';
const OUT = '/workspace/docs/kingkong-review/screenshots/session-2026-06-17';
const VIEWPORT = { width: 390, height: 844 };

const routes = [
  { name: '01-home', hash: '#/base/game', label: '首页' },
  { name: '02-login', hash: '#/login', label: '登录' },
  { name: '03-community', hash: '#/base/community', label: 'Community Tab' },
  { name: '04-conversation-guest', hash: '#/base/service', label: 'Conversation(未登录)' },
  { name: '05-my-guest', hash: '#/base/my', label: 'My(未登录)' },
  { name: '06-setting', hash: '#/setting', label: '设置' },
];

async function snap(page, file, fullPage = true) {
  await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage });
}

async function getPageSummary(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('*')].filter(el => {
      const t = (el.textContent || '').trim();
      return t === '首页' || t === 'Home' || t === '社区' || t === 'Community';
    }).length;
    const title = document.title;
    const hash = location.hash;
    const bodyText = (document.body?.innerText || '').slice(0, 800);
    const bottomNav = (document.body?.innerText || '').match(/(首页|Home|社区|Community|会话|Conversation|我的|My)/g)?.slice(0, 8) || [];
    return { title, hash, tabsHint: tabs, bottomNavSample: bottomNav, bodyPreview: bodyText.replace(/\s+/g, ' ').slice(0, 400) };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const results = [];

  // 先设简体中文
  await page.goto(`${BASE}#/setting/language`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const zhOption = page.locator('text=简体中文').first();
  if (await zhOption.count()) {
    await zhOption.click();
    await page.waitForTimeout(1500);
  }
  await snap(page, '00-language-zh');

  for (const route of routes) {
    await page.goto(`${BASE}${route.hash}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    const summary = await getPageSummary(page);
    await snap(page, route.name);
    results.push({ ...route, ...summary });
  }

  // 点底部 Tab（若存在）
  await page.goto(`${BASE}#/base/game`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  for (const [tabText, file] of [
    ['社区', '07-tab-community'],
    ['会话', '08-tab-conversation'],
    ['我的', '09-tab-my'],
    ['首页', '10-tab-home-back'],
  ]) {
    const tab = page.locator(`text=${tabText}`).last();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(2500);
      results.push({ name: file, hash: await page.evaluate(() => location.hash), label: `点击${tabText}`, ...(await getPageSummary(page)) });
      await snap(page, file);
    }
  }

  await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log(JSON.stringify({ out: OUT, routes: results.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
