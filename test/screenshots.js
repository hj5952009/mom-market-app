/* 데모 모드 화면을 360×800에서 찍는다 — node test/screenshots.js
 * 크롬: PLAYWRIGHT_BROWSERS_PATH(기본 /opt/pw-browsers)의 chromium을 직접 지정. 콘솔 오류가 하나라도 있으면 실패. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const WWW = path.join(__dirname, '..', 'www');
const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function findChrome() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort();
  for (const d of dirs.reverse()) { const p = path.join(base, d, 'chrome-linux', 'chrome'); if (fs.existsSync(p)) return p; }
  throw new Error('chromium not found under ' + base);
}

const SHOTS = [
  // [file, query, opts]
  ['01_today', 'tab=today'], ['01_today_x1.3', 'tab=today&scale=1.3'], ['01_today_x1.56', 'tab=today&scale=1.3&big=1'],
  ['02_today_morning', 'tab=today&scenario=morning'], ['02_today_morning_x1.3', 'tab=today&scenario=morning&scale=1.3'],
  ['03_holdings', 'tab=holdings'], ['03_holdings_x1.3', 'tab=holdings&scale=1.3'],
  ['04_record', 'tab=record'], ['04_record_x1.3', 'tab=record&scale=1.3'],
  ['05_more', 'tab=more'], ['05_more_x1.3', 'tab=more&scale=1.3'],
  ['06_range_detail', 'page=range'], ['06_range_detail_x1.3', 'page=range&scale=1.3'],
  ['07_holding_detail', 'tab=holdings&page=holding&id=0'], ['07_holding_detail_x1.3', 'tab=holdings&page=holding&id=2&scale=1.3'],
  ['08_trust', 'tab=record&page=trust'], ['09_misses', 'tab=record&page=misses'],
  ['10_settings', 'tab=more&page=settings'], ['10_settings_x1.3', 'tab=more&page=settings&scale=1.3&big=1'],
  ['11_glossary', 'tab=more&page=glossary'], ['12_term_sheet', 'tab=today&sheet=term&id=vix', { viewportOnly: true }],
  ['13_add_sheet', 'tab=holdings&sheet=add', { viewportOnly: true }], ['13_add_sheet_x1.3', 'tab=holdings&sheet=add&scale=1.3', { viewportOnly: true }],
  ['14_time_sheet', 'tab=more&page=settings&sheet=time', { viewportOnly: true }],
  ['15_worry', 'tab=holdings&page=worry'], ['16_tip', 'tab=more&page=tip&id=tip_after_big_drop'],
  ['17_onboarding_1', 'ob=1&obstep=0', { viewportOnly: true }], ['17_onboarding_2', 'ob=1&obstep=1', { viewportOnly: true }],
  ['17_onboarding_3', 'ob=1&obstep=2', { viewportOnly: true }], ['17_onboarding_3_x1.3', 'ob=1&obstep=2&scale=1.3', { viewportOnly: true }],
  ['18_loading_first', 'tab=today&loading=1', { viewportOnly: true }],
  ['19_offline_nocache', 'tab=today&error=offline&nocache=1', { viewportOnly: true }],
  ['20_offline_cached', 'tab=today&error=offline', { viewportOnly: true }],
  ['21_today_expired', 'tab=today&now=2026-10-16T10:00:00%2B09:00'],
  ['22_today_weekend', 'tab=today&now=2026-10-17T10:00:00%2B09:00', { viewportOnly: true }],
  ['23_today_market_open', 'tab=today&scenario=morning&now=2026-10-14T10:30:00%2B09:00', { viewportOnly: true }]
];

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(WWW, u === '/' ? 'index.html' : u);
    if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox', '--font-render-hinting=none'] });
  const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const problems = [];
  for (const [name, q, opts = {}] of SHOTS) {
    if (only && !only.test(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
    const shot = opts.viewportOnly ? '' : '&shot=1';
    await page.goto(`http://127.0.0.1:${port}/index.html?demo=1&${q}${shot}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    // 가로 넘침·잘림 검사
    const lay = await page.evaluate(() => {
      const W = document.documentElement.clientWidth, bad = [];
      document.querySelectorAll('#app *, #onboarding *, #sheet-root *').forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        const cs = getComputedStyle(el); if (cs.position === 'fixed') return;
        if (r.right > W + 1 || r.left < -1) bad.push((el.className || el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' ' + (el.textContent || '').trim().slice(0, 30));
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && cs.whiteSpace !== 'nowrap' && el.children.length === 0)
          bad.push('clip ' + (el.className || el.tagName) + ' ' + (el.textContent || '').trim().slice(0, 30));
      });
      return { scrollW: document.documentElement.scrollWidth, W, bad: bad.slice(0, 12) };
    });
    if (lay.scrollW > lay.W + 1) problems.push(name + ': horizontal scroll ' + lay.scrollW);
    if (lay.bad.length) problems.push(name + ': ' + lay.bad.join(' | '));
    if (errs.length) problems.push(name + ': console → ' + errs.join(' | '));
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !opts.viewportOnly });
    await ctx.close();
    process.stdout.write('.');
  }
  await browser.close(); server.close();
  console.log('\nscreenshots →', OUT);
  if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
  console.log('no console errors, no horizontal overflow');
})().catch(e => { console.error(e); process.exit(2); });
