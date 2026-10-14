/* 매일 자료 점검 — node tools/health-check.js  (GitHub Actions: .github/workflows/data-health.yml)
 * 앱과 똑같은 코드(www/js)로 Yahoo에서 지표 11개 10년치를 받아
 *   1) 끝난 장의 빈 종가를 공식 값으로 채우고(Series.fillNullCloses)
 *   2) 각 시장의 마지막으로 끝난 장까지 들어왔는지 보고(Freshness.check)
 *   3) 모델을 돌려 예측 대상일이 맞는지(기준일 = 지금쯤 있어야 할 마지막 코스피 종가) 확인한다.
 * 문제가 있으면 5분 간격으로 최대 3번 다시 해 보고, 그래도 안 되면 실패(exit 1) → GitHub가 저장소 주인에게 메일로 알림.
 * 결과는 GITHUB_STEP_SUMMARY(실행 화면)와 health.json에 남긴다. */
'use strict';
const fs = require('fs');
const path = require('path');
const W = path.join(__dirname, '..', 'www', 'js');
global.window = undefined;
const U = require(path.join(W, 'util.js')); global.MCUtil = U;
const KModel = require(path.join(W, 'model.js')); global.KModel = KModel;
const Compute = require(path.join(W, 'compute.js'));
const Series = require(path.join(W, 'series.js')); global.Series = Series;
const Fresh = require(path.join(W, 'freshness.js'));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const ATTEMPTS = +(process.env.HEALTH_ATTEMPTS || 3), GAP_MS = +(process.env.HEALTH_GAP_MS || 300000);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 데이터센터(GitHub) IP는 쿠키 없이 부르면 429를 받기 쉬워서, yfinance처럼 쿠키·crumb를 먼저 받아 둔다.
let SESSION = null;
async function session() {
  if (SESSION) return SESSION;
  SESSION = { cookie: '', crumb: '' };
  try {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const sc = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
    SESSION.cookie = sc.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    const c = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: SESSION.cookie } });
    if (c.ok) SESSION.crumb = (await c.text()).trim();
  } catch (e) { /* 쿠키 없이 진행 */ }
  return SESSION;
}
async function getJson(url) {
  const ss = await session();
  if (ss.crumb) url += '&crumb=' + encodeURIComponent(ss.crumb);
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', Cookie: ss.cookie } });
  if (r.status === 429) { await sleep(3000); }
  const j = await r.json().catch(() => null);
  if (!r.ok && !(j && j.chart)) throw new Error('HTTP ' + r.status);
  return j;
}
async function fetchOne(sym, patched) {
  let last;
  for (let a = 0; a < 3; a++) {
    const host = a % 2 ? 'query2' : 'query1';
    try {
      const base = 'https://' + host + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?';
      const j = await getJson(base + 'range=10y&interval=1d&includeAdjustedClose=true');
      await sleep(400);
      if (Series.nullCloses(j, Date.now()).length) {
        let ref = null;
        try { const rj = await getJson(base + 'range=1d&interval=1d'); ref = rj.chart.result[0].meta; } catch (e) { /* 채우지 못함 */ }
        const done = Series.fillNullCloses(j, ref, Date.now());
        if (done.length) patched[sym] = done;
      }
      const sr = KModel.parseChart(j, sym, Date.now());
      if (!sr.rows.length) throw new Error('empty series');
      return sr;
    } catch (e) { last = e; await sleep(800 * (a + 1)); }
  }
  throw last;
}

async function once() {
  const now = Date.now(), raw = {}, errors = {}, patched = {};
  for (const it of Fresh.ITEMS) {
    try { raw[it[0]] = await fetchOne(it[0], patched); } catch (e) { errors[it[0]] = String(e.message || e); }
  }
  const fresh = Fresh.check(raw, now, { fetchErrors: errors, patched });
  const problems = [];
  Object.keys(errors).forEach(s => problems.push(s + ' 받기 실패: ' + errors[s]));
  fresh.items.filter(x => x.status === 'late').forEach(x => problems.push(x.name + ' 늦음: 마지막 ' + x.last + ', 있어야 할 날 ' + x.expected));
  let res = null;
  if (raw['^KS11']) {
    try {
      const out = Compute.computeAll(raw, now, { fetchErrors: errors });
      const r = out.result, st = U.forecastStatus(r, out.previewReason, now), expK = U.expectedLastClose(now);
      res = { baseDate: r.baseDate, target: st.target, status: st.label, mode: r.mode, center: r.center, pUp: r.pUp,
        r80: r.ranges['0.8'], r95: r.ranges['0.95'], previewReason: out.previewReason, usDate: r.overnight && r.overnight.usDate,
        cov95: r.stats.cov95, holdoutN: r.stats.holdoutN };
      if (r.baseDate !== expK) problems.push('예측 기준일이 ' + r.baseDate + ' (있어야 할 마지막 코스피 종가 ' + expK + ')');
      if (out.previewReason && out.previewReason.code === 'us_fetch_failed') problems.push('미국 지표를 받지 못해 미리 보기로 계산됨');
    } catch (e) { problems.push('모델 계산 실패: ' + (e.message || e)); }
  } else problems.push('코스피를 받지 못해 계산하지 못함');
  return { at: new Date(now).toISOString(), kst: U.fmtWhen ? U.kstDate(now) + ' ' + U.fmtTime(now) : '', ok: !problems.length, problems, fresh, result: res };
}

function markdown(h) {
  const L = [];
  L.push('## ' + (h.ok ? '✅ 자료 정상' : '❌ 자료 문제') + ' — ' + h.kst + ' (KST)');
  if (h.problems.length) { L.push(''); h.problems.forEach(p => L.push('- ' + p)); }
  L.push('', '| 지표 | 마지막 장 | 있어야 할 장 | 값 | 상태 |', '|---|---|---|---:|---|');
  h.fresh.items.forEach(x => L.push('| ' + x.name + ' | ' + (x.last || '–') + ' | ' + x.expected + ' | ' + (x.value == null ? '–' : (+x.value).toFixed(2)) + ' | ' +
    ({ fresh: '최신', lag1: '하루 늦음(허용)', late: '**늦음**', cached: '**받기 실패**' })[x.status] + (x.patched.length ? ' · 빈칸 채움 ' + x.patched.join(',') : '') + ' |'));
  if (h.result) {
    const r = h.result;
    L.push('', '**예측** ' + r.target + ' (' + r.status + ', ' + r.mode + (r.usDate ? ', 미국 ' + r.usDate + ' 장 반영' : '') + ') — 중심 ' + r.center +
      ', 오를 확률 ' + Math.round(r.pUp * 100) + '%, 80% ' + r.r80.join('~') + ', 95% ' + r.r95.join('~') +
      ' · 검증 ' + r.holdoutN + '일 95% 적중 ' + (r.cov95 * 100).toFixed(1) + '%');
  }
  return L.join('\n') + '\n';
}

(async () => {
  let h;
  for (let a = 1; a <= ATTEMPTS; a++) {
    h = await once();
    console.log(markdown(h));
    if (h.ok || a === ATTEMPTS) break;
    console.log('문제가 있어 ' + Math.round(GAP_MS / 60000) + '분 뒤 다시 확인합니다 (' + a + '/' + ATTEMPTS + ')');
    await sleep(GAP_MS);
  }
  fs.writeFileSync(path.join(process.cwd(), 'health.json'), JSON.stringify(h, null, 1));
  // GitHub 실행 화면의 알림(annotation)으로도 남긴다 (메일·API에서 바로 보임)
  if (process.env.GITHUB_ACTIONS) {
    const one = s => String(s).replace(/\r?\n/g, ' ').replace(/%/g, '%25');
    if (h.ok) console.log('::notice title=자료 정상::' + one(h.fresh.items.map(x => x.sym + ' ' + x.last).join(', ') + (h.result ? ' → 예측 ' + h.result.target + ' ' + h.result.status : '')));
    h.problems.slice(0, 9).forEach(p => console.log('::error title=자료 문제::' + one(p)));
    const pt = h.fresh.items.filter(x => x.patched.length);
    if (pt.length) console.log('::warning title=빈 종가 채움::' + one(pt.map(x => x.sym + ' ' + x.patched.join(',')).join(', ')));
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(h));
  process.exit(h.ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
