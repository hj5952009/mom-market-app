/* 데모 모드 화면을 360×800에서 찍는다 — node test/screenshots.js [이름 정규식]
 * 탭 3개 × 글씨 1.0/1.3 × 라이트/다크(전체 페이지) + 간밤 모드·첫 실행 안내·툴팁 등.
 * 검사: 콘솔 오류·경고 0, 가로 넘침 0, 화면 밖으로 나간 요소 0, 차트 글자끼리 겹침 0, 차트 글자가 화면 밖 0.
 * 크롬: PLAYWRIGHT_BROWSERS_PATH(기본 /opt/pw-browsers)의 chromium을 직접 지정. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const WWW = path.join(__dirname, '..', 'www');
const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChrome() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort();
  for (const d of dirs.reverse()) { const p = path.join(base, d, 'chrome-linux', 'chrome'); if (fs.existsSync(p)) return p; }
  throw new Error('chromium not found under ' + base);
}

const SHOTS = [];
const TABS = [['01_predict', 'tab=predict'], ['02_record', 'tab=record'], ['03_info', 'tab=info'], ['09_cal', 'tab=cal'], ['11_sung_sum', 'tab=sung']];
for (const [name, q] of TABS) for (const theme of ['light', 'dark']) for (const sc of ['1.0', '1.3']) {
  SHOTS.push([`${name}_${theme}_x${sc}`, `${q}&scale=${sc}`, { theme }]);
}
SHOTS.push(['02_record_period1m_light_x1.0', 'tab=record&period=1m', { theme: 'light', viewportOnly: true }]);
SHOTS.push(['02_record_periodall_dark_x1.3', 'tab=record&period=all&scale=1.3', { theme: 'dark' }]);
SHOTS.push(['04_predict_overnight_light_x1.0', 'tab=predict&scenario=morning&scale=1.0', { theme: 'light' }]);
SHOTS.push(['04_predict_overnight_light_x1.3', 'tab=predict&scenario=morning&scale=1.3', { theme: 'light' }]);
SHOTS.push(['04_predict_overnight_dark_x1.0', 'tab=predict&scenario=morning&scale=1.0', { theme: 'dark' }]);
SHOTS.push(['05_predict_usmissing_light_x1.0', 'tab=predict&scenario=usmissing', { theme: 'light', viewportOnly: true }]);
SHOTS.push(['06_predict_past_light_x1.0', 'tab=predict&now=2026-10-14T16:10:00%2B09:00', { theme: 'light', viewportOnly: true }]);
SHOTS.push(['07_notice_light_x1.0', 'tab=predict&notice=1', { theme: 'light', viewportOnly: true }]);
SHOTS.push(['07_notice_dark_x1.3', 'tab=predict&notice=1&scale=1.3', { theme: 'dark', viewportOnly: true }]);
SHOTS.push(['08_tooltip_fan_light_x1.0', 'tab=predict', { theme: 'light', viewportOnly: true, tap: ['#c-fan', 0.95, 0.5] }]);
SHOTS.push(['08_tooltip_bands_dark_x1.3', 'tab=record&scale=1.3', { theme: 'dark', viewportOnly: true, tap: ['#c-bands', 0.55, 0.4] }]);
SHOTS.push(['08_tooltip_density_light_x1.3', 'tab=predict&scale=1.3', { theme: 'light', viewportOnly: true, tap: ['#c-dens', 0.7, 0.5] }]);
SHOTS.push(['08_tooltip_ladder_dark_x1.0', 'tab=predict', { theme: 'dark', viewportOnly: true, tap: ['#c-ladder', 0.5, 0.6] }]);
SHOTS.push(['11_sung_theme_light_x1.0', 'tab=sung&sg=theme&sgt=5', { theme: 'light' }]);
SHOTS.push(['11_sung_theme_dark_x1.3', 'tab=sung&sg=theme&sgt=1&scale=1.3', { theme: 'dark' }]);
SHOTS.push(['11_sung_posts_light_x1.0', 'tab=sung&sg=posts&sgopen=224440720546', { theme: 'light', viewportOnly: true }]);
SHOTS.push(['11_sung_learn_light_x1.0', 'tab=sung&sg=learn', { theme: 'light' }]);
SHOTS.push(['08_tooltip_heat_light_x1.0', 'tab=sung', { theme: 'light', viewportOnly: true, scrollTo: '#c-sgheat', tap: ['#c-sgheat', 0.9, 0.3] }]);
SHOTS.push(['10_info_fresh_usmissing_light_x1.0', 'tab=info&scenario=usmissing', { theme: 'light' }]);
SHOTS.push(['09_cal_day1012_light_x1.0', 'tab=cal&day=2026-10-12', { theme: 'light' }]);
SHOTS.push(['09_cal_pending_light_x1.0', 'tab=cal&day=2026-10-14', { theme: 'light', viewportOnly: true }]);
SHOTS.push(['09_cal_month0726_dark_x1.0', 'tab=cal&day=2026-07-31', { theme: 'dark', viewportOnly: true }]);
SHOTS.push(['08_tooltip_day_light_x1.3', 'tab=cal&day=2026-10-12&scale=1.3', { theme: 'light', viewportOnly: true, tap: ['#c-day', 0.6, 0.75] }]);
SHOTS.push(['08_tooltip_fanhist_light_x1.3', 'tab=predict&scale=1.3', { theme: 'light', viewportOnly: true, tap: ['#c-fan', 0.3, 0.5] }]);

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
  if (!only) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const problems = [];
  for (const [name, q, opts = {}] of SHOTS) {
    if (only && !only.test(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: +(process.env.DSF || 1), locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: opts.theme || 'light', hasTouch: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
    await page.goto(`http://127.0.0.1:${port}/index.html?demo=1&${q}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    if (opts.tap) {
      const [sel, fx, fy] = opts.tap;
      const el = await page.$(sel);
      await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
      const b = await el.boundingBox();
      await page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy);
      await page.waitForTimeout(150);
    }
    // 전체 페이지 캡처에서는 고정된 아래 탭이 중간에 찍히므로 문서 맨 아래로 옮겨 찍는다(앱 코드는 그대로)
    if (!opts.viewportOnly) await page.addStyleTag({ content: 'body{position:relative}.tabs{position:absolute!important}' });
    const lay = await page.evaluate(() => {
      const W = document.documentElement.clientWidth, bad = [];
      document.querySelectorAll('body *').forEach(el => {
        if (el.closest('[hidden]') || el.closest('svg') && el.tagName !== 'svg') return;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        if (r.right > W + 0.5 || r.left < -0.5) bad.push('out ' + (el.id || el.className || el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' ' + (el.textContent || '').trim().slice(0, 30));
        const cs = getComputedStyle(el);
        if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') bad.push('clip ' + (el.className || el.tagName) + ' ' + (el.textContent || '').trim().slice(0, 30));
      });
      // 차트 글자: 화면 밖, 서로 겹침
      document.querySelectorAll('.chart svg').forEach(svg => {
        const ts = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim()).map(t => ({ t: t.textContent, r: t.getBoundingClientRect() }));
        ts.forEach(a => { if (a.r.right > W + 0.5 || a.r.left < -0.5) bad.push('svg text off-screen "' + a.t + '" ' + Math.round(a.r.left) + '..' + Math.round(a.r.right)); });
        for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
          const a = ts[i].r, b = ts[j].r;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 1 && oy > 2) bad.push(svg.parentElement.id + ' text overlap "' + ts[i].t + '" × "' + ts[j].t + '"');
        }
      });
      return { scrollW: document.documentElement.scrollWidth, W, bad: bad.slice(0, 15) };
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
  console.log('no console errors, no horizontal overflow, no clipped or overlapping chart labels');
})().catch(e => { console.error(e); process.exit(2); });
