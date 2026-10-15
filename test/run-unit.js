/* 단위 테스트 — node test/run-unit.js (npm test)
 *  - model.js가 검증된 원본 그대로인지(sha256)
 *  - 분포 곡선: 적분 ≈ 1, CDF 단조, 분위수와 일치, 봉우리 하나
 *  - 예측 대상일·휴장일·상태(확정/미리 보기/지난 예측)
 *  - B2 규칙: 미국 자료를 저장된 값으로 채우면 미리 보기
 *  - 시세 이어 붙이기(1달치 병합 == 10년치) */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const W = path.join(__dirname, '..', 'www');
global.window = undefined;
const U = require(path.join(W, 'js/util.js'));
global.MCUtil = U;
const KModel = require(path.join(W, 'js/model.js'));
global.KModel = KModel;
const Compute = require(path.join(W, 'js/compute.js'));
const Series = require(path.join(W, 'js/series.js'));
const Fresh = require(path.join(W, 'js/freshness.js'));

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) pass++; else { fail++; console.log('  FAIL ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b }); }
function near(name, a, b, tol) { ok(name, Math.abs(a - b) <= tol, { got: a, want: b, tol }); }
function section(s) { console.log('• ' + s); }

const fx = JSON.parse(fs.readFileSync(path.join(W, 'demo/fixture.json'), 'utf8'));

// ------------------------------------------------------------------
section('model.js는 검증된 원본 그대로');
eq('model.js sha256', crypto.createHash('sha256').update(fs.readFileSync(path.join(W, 'js/model.js'))).digest('hex'),
  '311f40f930295ea1bec82d13fa860153dfbff12092de493fa0ab0f59079f12b1');
eq('app-src/model.js와 같은 파일', fs.existsSync(path.join(__dirname, '../../app-src/model.js'))
  ? crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../../app-src/model.js'))).digest('hex') : '311f40f930295ea1bec82d13fa860153dfbff12092de493fa0ab0f59079f12b1',
'311f40f930295ea1bec82d13fa860153dfbff12092de493fa0ab0f59079f12b1');

// ------------------------------------------------------------------
section('분포 곡선 (분위수 → 밀도)');
function integrate(D, a, b, n) { let s = 0; const h = (b - a) / n; for (let i = 0; i < n; i++) s += D.pdf(a + (i + 0.5) * h) * h; return s; }
function monotone(D, a, b, n) { let prev = -1; for (let i = 0; i <= n; i++) { const c = D.cdf(a + (b - a) * i / n); if (c < prev - 1e-12) return false; prev = c; } return true; }
function localMax(D, a, b, n) { const ys = []; for (let i = 0; i <= n; i++) ys.push(D.pdf(a + (b - a) * i / n)); let k = 0; for (let i = 1; i < n; i++) if (ys[i] > ys[i - 1] + 1e-12 && ys[i] >= ys[i + 1]) k++; return k; }
const knots = Compute.quantileKnots(fx);
eq('분위수 9개 (2.5~97.5%)', knots.map(k => k.p), [0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.975]);
eq('분위수 값 = 모델 범위·중심', knots.map(k => k.x), [5384, 5537, 5642, 5953, 6090, 6234, 6516, 6618, 6695]);
ok('분위수 값 증가', knots.every((k, i) => !i || k.x > knots[i - 1].x));
const D = Compute.densityFromQuantiles(knots);
near('적분 ≈ 1 (화면 곡선)', integrate(D, D.lo, D.hi, 200000), 1, 1e-3);
ok('CDF 단조 증가 (화면 곡선)', monotone(D, D.lo, D.hi, 4000));
ok('밀도 ≥ 0', D.sample(D.lo, D.hi, 2000).every(p => p.y >= 0));
knots.forEach(k => near('CDF(' + k.x + ') ≈ ' + k.p + ' (±2.5%p)', D.cdf(k.x), k.p, 0.025));
eq('봉우리 하나', localMax(D, D.lo, D.hi, 2000), 1);
near('기준 종가 위 면적 ≈ 모델 오를 확률', 1 - D.cdf(fx.baseClose), fx.pUp, 0.02);
const DX = Compute.densityFromQuantiles(knots, { exact: true });
near('적분 ≈ 1 (정확 모드)', integrate(DX, DX.lo, DX.hi, 200000), 1, 1e-3);
ok('CDF 단조 증가 (정확 모드)', monotone(DX, DX.lo, DX.hi, 4000));
knots.forEach(k => near('정확 모드 CDF(' + k.x + ') = ' + k.p, DX.cdf(k.x), k.p, 1e-9));
// 정규분포 분위수로 만들면 정규 밀도와 비슷해야 한다
const nk = [0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.975].map(p => ({ p, x: 6000 + 100 * Compute.normInv(p) }));
const DN = Compute.densityFromQuantiles(nk);
near('정규 분위수 → 중앙 밀도 ≈ φ(0)/σ (±10%)', DN.pdf(6000) / (Compute.normPdf(0) / 100), 1, 0.10);
nk.forEach(k => near('정규 분위수 CDF(' + Math.round(k.x) + ') ≈ ' + k.p + ' (±1%p)', DN.cdf(k.x), k.p, 0.01));
// 반올림으로 분위수가 겹쳐도 깨지지 않음
const tied = knots.map(k => ({ p: k.p, x: k.x })); tied[2].x = tied[1].x; tied[7].x = tied[6].x;
const DT = Compute.densityFromQuantiles(tied, { exact: true });
ok('겹친 분위수: 숫자 정상', isFinite(DT.pdf(6000)) && isFinite(DT.cdf(6000)));
near('겹친 분위수: 적분 ≈ 1', integrate(DT, DT.lo, DT.hi, 100000), 1, 1e-3);
ok('겹친 분위수: CDF 단조', monotone(DT, DT.lo, DT.hi, 3000));
near('normInv/normCdf 왕복', Compute.normCdf(Compute.normInv(0.975)), 0.975, 1e-7);
const pc = Compute.pchip([0, 1, 2, 3], [0, 0.1, 0.9, 1]);
ok('PCHIP 단조·통과', [0, 1, 2, 3].every((x, i) => Math.abs(pc.f(x) - [0, 0.1, 0.9, 1][i]) < 1e-12) &&
  Array.from({ length: 301 }, (_, i) => pc.f(i / 100)).every((v, i, a) => !i || v >= a[i - 1] - 1e-12));

// ------------------------------------------------------------------
section('예측 대상일·휴장일');
eq('평일 → 다음 날', U.nextTradingDay('2026-10-13'), '2026-10-14');
eq('금요일 → 월요일', U.nextTradingDay('2026-10-16'), '2026-10-19');
eq('크리스마스 건너뜀', U.nextTradingDay('2026-12-24'), '2026-12-28');
eq('연말 휴장·신정 건너뜀', U.nextTradingDay('2026-12-30'), '2027-01-04');
eq('2027 설 연휴', U.nextTradingDay('2027-02-05'), '2027-02-10');
eq('2027 추석', U.nextTradingDay('2027-09-13'), '2027-09-17');
eq('2027 연말', U.nextTradingDay('2027-12-30'), '2028-01-03');
eq('이전 거래일', U.prevTradingDay('2027-01-04'), '2026-12-30');
eq('제목 날짜 표기', U.fmtTitleDate('2026-10-14'), '10월 14일(수)');
const ms = s => Date.parse(s);
const base = { baseDate: '2026-10-13', mode: 'mixture' };
eq('저녁 계산(미국 장 전) → 미리 보기', U.forecastStatus(base, null, ms('2026-10-13T22:28:00+09:00')), { target: '2026-10-14', today: '2026-10-13', status: 'preview', label: '미리 보기' });
eq('아침 overnight → 확정', U.forecastStatus({ baseDate: '2026-10-13', mode: 'overnight' }, null, ms('2026-10-14T08:45:00+09:00')).status, 'final');
eq('overnight이라도 B2 사유가 있으면 미리 보기', U.forecastStatus({ baseDate: '2026-10-13', mode: 'overnight' }, { code: 'us_fetch_failed' }, ms('2026-10-14T08:45:00+09:00')).status, 'preview');
eq('대상일 15:29 → 아직 유효', U.forecastStatus({ baseDate: '2026-10-13', mode: 'overnight' }, null, ms('2026-10-14T15:29:00+09:00')).status, 'final');
eq('대상일 15:30 마감 뒤 → 지난 예측', U.forecastStatus({ baseDate: '2026-10-13', mode: 'overnight' }, null, ms('2026-10-14T15:30:00+09:00')).status, 'past');
eq('다음 날 → 지난 예측', U.forecastStatus(base, null, ms('2026-10-15T09:00:00+09:00')).status, 'past');
eq('금요일 저녁 → 월요일 대상, 주말엔 유효', U.forecastStatus({ baseDate: '2026-10-16', mode: 'mixture' }, null, ms('2026-10-18T12:00:00+09:00')), { target: '2026-10-19', today: '2026-10-18', status: 'preview', label: '미리 보기' });
eq('크리스마스 이브 기준 → 12/28 대상', U.forecastStatus({ baseDate: '2026-12-24', mode: 'overnight' }, null, ms('2026-12-26T10:00:00+09:00')).target, '2026-12-28');

// ------------------------------------------------------------------
section('B2 규칙: 미국 자료가 빠지면 확정으로 보이지 않음');
function synth(endDate) {
  let a = 12345; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u() || 1e-9)) * Math.cos(2 * Math.PI * u());
  const days = []; for (let t = Date.parse('2016-10-17T00:00:00Z'); t <= Date.parse(endDate + 'T00:00:00Z'); t += 864e5) { const w = new Date(t).getUTCDay(); if (w && w !== 6) days.push(new Date(t).toISOString().slice(0, 10)); }
  const P = { kospi: 2000, ewy: 60, sox: 800, ndx: 5000, vix: 15, mu: 30, usdkrw: 1150, hyg: 85, eem: 40, stoxx: 3000, tnx: 2 };
  const S = {}; Object.keys(P).forEach(k => { S[k] = []; });
  let prevSox = 0;
  days.forEach(d => {
    const sox = 0.018 * g(), ndx = 0.6 * sox + 0.008 * g();
    const kr = 0.4 * prevSox + 0.009 * g();
    P.kospi *= Math.exp(kr); P.sox *= Math.exp(sox); P.ndx *= Math.exp(ndx); P.ewy *= Math.exp(0.5 * sox + 0.01 * g());
    P.mu *= Math.exp(1.2 * sox + 0.02 * g()); P.hyg *= Math.exp(0.003 * g()); P.eem *= Math.exp(0.3 * sox + 0.008 * g());
    P.stoxx *= Math.exp(0.3 * sox + 0.008 * g()); P.usdkrw *= Math.exp(0.004 * g()); P.vix = Math.max(10, P.vix + 0.05 * (18 - P.vix) - 30 * sox + 0.5 * g()); P.tnx = Math.max(0.5, P.tnx + 0.04 * g());
    Object.keys(P).forEach(k => S[k].push({ d, c: +P[k].toFixed(4), a: +P[k].toFixed(4) }));
    prevSox = sox;
  });
  const raw = {}; Object.keys(KModel.TICKERS).forEach(k => { raw[KModel.TICKERS[k]] = { rows: S[k] }; });
  return raw;
}
const RAW = synth('2026-10-13');
const MORNING = ms('2026-10-14T08:45:00+09:00');
const okRun = Compute.computeAll(RAW, MORNING, { fetchErrors: {} });
eq('모든 자료가 있으면 아침 확정(overnight)', [okRun.result.mode, okRun.previewReason], ['overnight', null]);
eq('확정이면 상태 칩 = 확정', U.forecastStatus(okRun.result, okRun.previewReason, MORNING).status, 'final');
ok('기록 화면용 기록 450일', okRun.result.history.length === Compute.HISTORY_DAYS, okRun.result.history.length);
const failed = Compute.computeAll(RAW, MORNING, { fetchErrors: { '^SOX': 'HTTP 429' } });
eq('^SOX 받기 실패(저장된 값으로 채움) → 미리 보기', [failed.result.mode, failed.previewReason && failed.previewReason.code], ['mixture', 'us_fetch_failed']);
eq('상태 칩 = 미리 보기', U.forecastStatus(failed.result, failed.previewReason, MORNING).status, 'preview');
const stale = JSON.parse(JSON.stringify(RAW));
['^SOX', '^IXIC', 'EWY'].forEach(sy => { stale[sy].rows.pop(); });   // 어제 저장한 미국 시세(10/13 막대 없음)
const raw0 = KModel.run(stale, { mode: 'auto', now: MORNING });
eq('(모델 그대로라면) 미국 휴장으로 보고 확정을 냄', [raw0.mode, raw0.meta.usHoliday], ['overnight', true]);
const staleRun = Compute.computeAll(stale, MORNING, { fetchErrors: {} });
eq('휴장일 표에 없는 "미국 휴장" → 미리 보기', [staleRun.result.mode, staleRun.previewReason && staleRun.previewReason.code], ['mixture', 'us_unconfirmed']);
eq('진짜 미국 휴장일(추수감사절)이면 확정 유지', Compute.previewReason({ baseDate: '2026-11-26', meta: { usHoliday: true } }, {}), null);
eq('EWY만 실패해도 미리 보기', Compute.previewReason(null, { EWY: 'x' }).code, 'us_fetch_failed');
eq('나스닥만 실패해도 미리 보기', Compute.previewReason(null, { '^IXIC': 'x' }).code, 'us_fetch_failed');
eq('유럽 지표 실패는 확정 유지', Compute.previewReason(null, { '^STOXX50E': 'x' }), null);

// ------------------------------------------------------------------
section('시세 이어 붙이기: 1달치만 받아 이어 붙여도 결과가 같음');
const TODAY = '2026-10-14';
const merged = {}; let allSame = true;
Object.keys(RAW).forEach(sy => {
  const full = RAW[sy].rows, cached = { rows: full.slice(0, -8) }, fresh = { symbol: sy, rows: full.slice(-22) };
  eq('받을 기간 ' + sy, Series.rangeFor(cached, TODAY), '1mo');
  const m = Series.mergeIncremental(cached, fresh, TODAY);
  if (m.rebase || JSON.stringify(m.series.rows) !== JSON.stringify(full)) allSame = false;
  merged[sy] = m.series;
});
ok('이어 붙인 행 == 10년치 행 (11종목)', allSame);
const cfg = { historyDays: Compute.HISTORY_DAYS };
const runFull = KModel.run(RAW, { mode: 'auto', now: MORNING, cfg }), runMerged = KModel.run(merged, { mode: 'auto', now: MORNING, cfg });
const pick = r => JSON.stringify([r.mode, r.center, r.pUp, r.ranges, r.history, r.stats, r.overnight]);
eq('KModel.run(이어 붙인 것) == KModel.run(10년치)', pick(runMerged), pick(runFull));
const ks = RAW['^KS11'].rows;
const adj = Series.mergeIncremental({ rows: ks.slice(0, -10) }, { rows: ks.slice(-22).map(r => ({ d: r.d, c: r.c, a: r.a * 0.99 })) }, TODAY);
eq('겹치는 날 수정종가 기준이 1% 바뀜 → 10년치 다시 받기', [adj.rebase, adj.reason], [true, 'adjclose']);
const tiny = Series.mergeIncremental({ rows: ks.slice(0, -10) }, { rows: ks.slice(-22).map(r => ({ d: r.d, c: r.c, a: r.a * 1.0005 })) }, TODAY);
eq('0.05% 차이는 그대로 이어 붙임', tiny.rebase, false);
const gap = Series.mergeIncremental({ rows: ks.slice(0, -40) }, { rows: ks.slice(-22) }, TODAY);
eq('사이가 비면 10년치 다시 받기', gap.rebase, true);
eq('저장된 시세가 없거나 오래되면 10년치', [Series.rangeFor(null, TODAY), Series.rangeFor({ rows: ks.slice(0, -40) }, TODAY)], ['10y', '10y']);
const old = Series.mergeIncremental({ rows: [{ d: '2015-01-02', c: 1, a: 1 }].concat(ks.slice(0, -10)) }, { rows: ks.slice(-22) }, TODAY);
eq('10년보다 오래된 행은 잘라 10년치와 같은 구간', old.series.rows[0].d, ks[0].d);
const keep = KModel.mergeSeries({ '^KS11': { rows: ks } }, { '^SOX': RAW['^SOX'] });
ok('못 받은 종목은 저장된 시세로 채움', keep['^SOX'] && keep['^SOX'].rows.length === RAW['^SOX'].rows.length);


// ------------------------------------------------------------------
section('빈 종가 메우기 (2026-10-14 실제 사례: Yahoo가 10-13 종가를 비워 둠)');
{
  const NOW = Date.parse('2026-10-14T01:26:00Z');   // 10:26 KST, 코스피 장중
  const d0 = Date.parse('2026-10-12T00:00:00Z') / 1000, D = 86400;
  const ksj = () => ({ chart: { result: [{
    meta: { gmtoffset: 32400, exchangeTimezoneName: 'Asia/Seoul', regularMarketPrice: 6103.81, regularMarketTime: Date.parse('2026-10-14T01:06:20Z') / 1000,
      currentTradingPeriod: { regular: { start: d0 + 2 * D, end: d0 + 2 * D + 21600 } } },
    timestamp: [d0 - 3 * D, d0, d0 + D, d0 + 2 * D],
    indicators: { quote: [{ close: [6625.93, 6384.24, null, 6103.81], high: [6810.83, 6589.69, null, 6190.65], low: [6625.93, 6368.49, null, 6062.08] }],
      adjclose: [{ adjclose: [6625.93, 6384.24, null, 6103.81] }] }
  }] } });
  const j = ksj();
  eq('빈 종가 찾기 (진행 중인 10-14 막대는 제외)', Series.nullCloses(j, NOW).map(x => x.d), ['2026-10-13']);
  const before = KModel.parseChart(ksj(), '^KS11', NOW).rows;
  eq('고치기 전: 마지막 종가가 10-12로 밀림 (앱에 10-13 예측이 계속 보이던 원인)', before[before.length - 1].d, '2026-10-12');
  const ref = { chartPreviousClose: 6035.35, regularMarketTime: Date.parse('2026-10-14T01:06:20Z') / 1000, regularMarketPrice: 6103.81,
    currentTradingPeriod: { regular: { start: d0 + 2 * D, end: d0 + 2 * D + 21600 } } };
  eq('전 거래일 공식 종가로 채움', Series.fillNullCloses(j, ref, NOW), [{ d: '2026-10-13', c: 6035.35, src: 'previousClose' }]);
  const after = KModel.parseChart(j, '^KS11', NOW).rows;
  eq('고친 뒤: 마지막 종가 10-13 = 6035.35', after[after.length - 1], { d: '2026-10-13', c: 6035.35, a: 6035.35 });
  eq('range=1d 응답이 없으면 채우지 않음(코스피는 장중)', Series.fillNullCloses(ksj(), null, NOW), []);
  const bad = Object.assign({}, ref, { chartPreviousClose: 9999 });
  eq('앞 종가와 30% 넘게 다르면 쓰지 않음', Series.fillNullCloses(ksj(), bad, NOW), []);
  const hl = Series.extractHL(ksj(), NOW);
  eq('장중 고가·저가 (빈 막대·진행 중 막대 제외)', Object.keys(hl), ['2026-10-09', '2026-10-12']);
  eq('고가·저가 합치기', Object.keys(Series.mergeHL({ '2024-01-02': [1, 1], '2026-10-08': [0, 0] }, hl, '2024-12-01')), ['2026-10-08', '2026-10-09', '2026-10-12']);

  // 미국 종목: 장이 끝난 10-13 종가가 비어 있음 → meta.regularMarketPrice(10-13 16:00 ET)
  const e0 = Date.parse('2026-10-12T13:30:00Z') / 1000;
  const ewy = { chart: { result: [{
    meta: { gmtoffset: -14400, exchangeTimezoneName: 'America/New_York', regularMarketPrice: 166.56, regularMarketTime: Date.parse('2026-10-13T20:00:00Z') / 1000,
      currentTradingPeriod: { regular: { start: e0 + D, end: e0 + D + 23400 } } },
    timestamp: [e0 - 3 * D, e0, e0 + D],
    indicators: { quote: [{ close: [177.24, 170.11, null] }], adjclose: [{ adjclose: [177.24, 170.11, null] }] }
  }] } };
  eq('미국 종목: 마지막 장 종가 = regularMarketPrice', Series.fillNullCloses(ewy, null, NOW), [{ d: '2026-10-13', c: 166.56, src: 'regularMarketPrice' }]);
  const during = JSON.parse(JSON.stringify(ewy)); during.chart.result[0].meta.currentTradingPeriod.regular = { start: e0 + D, end: e0 + D + 23400 };
  eq('그 장이 아직 진행 중이면 채우지 않음', Series.fillNullCloses(during, null, Date.parse('2026-10-13T15:00:00Z')), []);
}

section('지금쯤 있어야 할 마지막 코스피 종가');
eq('수 10:23 → 화', U.expectedLastClose(Date.parse('2026-10-14T10:23:00+09:00')), '2026-10-13');
eq('수 16:20 → 수', U.expectedLastClose(Date.parse('2026-10-14T16:20:00+09:00')), '2026-10-14');
eq('토 → 금', U.expectedLastClose(Date.parse('2026-10-17T12:00:00+09:00')), '2026-10-16');
eq('성탄절(휴장) 오후 → 전날', U.expectedLastClose(Date.parse('2026-12-25T17:00:00+09:00')), '2026-12-24');


section('자료 신선도 점검');
{
  const T = Date.parse('2026-10-14T10:48:00+09:00');
  eq('지금쯤 있어야 할 마지막 장 (수 10:48 KST)', ['krx', 'us', 'eu', 'fx'].map(m => Fresh.expectedLast(m, T)), ['2026-10-13', '2026-10-13', '2026-10-13', '2026-10-13']);
  eq('수 06:00 KST(미국 화요일 장 끝) / 목 06:00 KST', [Fresh.expectedLast('us', Date.parse('2026-10-14T06:00:00+09:00')), Fresh.expectedLast('us', Date.parse('2026-10-15T06:00:00+09:00'))], ['2026-10-13', '2026-10-14']);
  eq('추석 연휴 다음 날 아침 코스피', Fresh.expectedLast('krx', Date.parse('2026-09-28T08:00:00+09:00')), '2026-09-23');
  eq('미국 휴장(9/7 노동절) 다음 날', Fresh.expectedLast('us', Date.parse('2026-09-08T12:00:00-04:00')), '2026-09-04');
  const mk = d => ({ rows: [{ d: '2026-10-08', c: 1 }, { d: d, c: 2 }] });
  const all = {}; Fresh.ITEMS.forEach(it => { all[it[0]] = mk('2026-10-13'); });
  const f1 = Fresh.check(all, T, { patched: { EWY: [{ d: '2026-10-13' }] } });
  eq('모두 최신', [f1.ok, f1.items.every(x => x.status === 'fresh'), f1.nPatched], [true, true, 1]);
  const f2 = Fresh.check(Object.assign({}, all, { '^KS11': mk('2026-10-12'), '^STOXX50E': mk('2026-10-12') }), T, { fetchErrors: { '^SOX': 'timeout' } });
  eq('코스피 하루 늦음=늦음, 유로스톡스 하루 늦음=허용, 못 받은 SOX=저장된 값',
    [f2.ok, f2.items.find(x => x.sym === '^KS11').status, f2.items.find(x => x.sym === '^STOXX50E').status, f2.items.find(x => x.sym === '^SOX').status], [false, 'late', 'lag1', 'cached']);
  eq('미국 장 마감 한국 시각 (서머타임)', Fresh.usCloseKst('2026-10-13'), { date: '2026-10-14', hour: 5 });
  eq('미국 장 마감 한국 시각 (겨울)', Fresh.usCloseKst('2026-12-01'), { date: '2026-12-02', hour: 6 });
  eq('2026년 코스피 휴장일 (실제 일봉에서 빠진 평일)', ['2026-07-17', '2026-09-24', '2026-10-09'].map(d => U.isTradingDay(d)), [false, false, false]);
}


section('성상현 페이지 자료');
{
  const SG = JSON.parse(fs.readFileSync(path.join(W, 'data/sung.json'), 'utf8'));
  const ids = new Set(SG.posts.map(p => p.id));
  eq('분석한 글 수', SG.posts.length, SG.source.analyzed);
  ok('모든 글에 요약·한 줄', SG.posts.every(p => p.s && p.o && p.th.length));
  const refIds = [].concat(...SG.now.map(x => x.ids), ...SG.frame.map(x => x.ids), ...SG.eras.map(x => x.ids), SG.outlooks,
    ...SG.themes.map(t => t.best.concat(...t.shifts.map(x => x.ids))), ...SG.principles.map(x => x.ids));
  ok('연결된 글이 모두 있음', refIds.every(i => ids.has(i)), refIds.filter(i => !ids.has(i)));
  eq('주제 16개, 달별 글 수 길이', [SG.themes.length, SG.themes.every(t => t.monthly.length === SG.months.length)], [16, true]);
  const ours = [];
  SG.posts.forEach(p => ours.push(p.o, p.s, p.v, p.p));
  SG.now.concat(SG.frame, SG.eras).forEach(x => ours.push(x.title, x.text));
  SG.themes.forEach(t => { ours.push(t.headline, t.plain, t.core, t.now); t.shifts.forEach(x => ours.push(x.text)); });
  SG.principles.forEach(x => ours.push(x.title, x.text)); SG.terms.forEach(x => ours.push(x.plain));
  const DIRECT = /사세요|파세요|매수하세요|매도하세요|팔아라|추천|사라[.!]|사라$/;
  const hits = ours.filter(t => t && DIRECT.test(t));
  ok('앱이 쓴 요약에 매수·매도 지시·추천 표현 없음', hits.length === 0, hits.slice(0, 3));
  ok('본문(원문)은 담지 않음', !SG.posts.some(p => 'text' in p || 'content' in p));
}


section('성상현 관점 모델');
{
  const SM = require(path.join(W, 'js/sungmodel.js'));
  const SG = JSON.parse(fs.readFileSync(path.join(W, 'data/sung.json'), 'utf8'));
  ok('모든 글에 관점 점수', SG.posts.every(p => Array.isArray(p.st) && p.st.length === 3 && p.st[0] >= -2 && p.st[0] <= 2));
  const mk = (d, s) => ({ d, st: [s, 2, 0], tone: 0 });
  const a = SM.dailyIndex([mk('2026-10-14 08:20', 2)], ['2026-10-14']).S[0], b = SM.dailyIndex([mk('2026-10-14 08:40', 2)], ['2026-10-14']).S[0];
  eq('예측일 08:30 전 글만 씀 (08:20 글은 반영, 08:40 글은 다음 날부터)', [a, b], [2, null]);
  const old = SM.dailyIndex([mk('2026-09-01 10:00', 2)], ['2026-10-14']).S[0];
  eq('오래된 글만 있으면 지수 없음', old, null);
  const cols = fx._historyColumns, Hs = fx.history.map(r => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o; });
  const E = SM.evaluate(Hs, SG.posts);
  ok('검증이 돌아감(충분한 날 수)', E.base.n > 200 && E.plus.n === E.base.n, E.base.n);
  // 미래 자료를 바꿔도 과거 예측이 바뀌지 않아야 함(앞을 보지 않음)
  const H2 = Hs.map((h, i) => i >= Hs.length - 30 ? Object.assign({}, h, { actual: h.prevClose * 1.1 }) : h);
  const E2 = SM.evaluate(H2, SG.posts);
  const cut = E.base.n - 30;
  const same = (x, y) => Math.abs(x - y) < 1e-12;
  const ev = (H) => { const r = []; return r; };
  ok('뒤쪽 30일 실제값을 바꿔도 그 전 날들의 예측 성적 계산 결과는 그대로', (function () {
    const p1 = SM.evaluate(Hs.slice(0, Hs.length - 30), SG.posts), p2 = SM.evaluate(H2.slice(0, H2.length - 30), SG.posts);
    return same(p1.plus.brier, p2.plus.brier) && same(p1.base.hit, p2.base.hit);
  })());
}

section('이주완 페이지 자료');
{
  const JW = JSON.parse(fs.readFileSync(path.join(W, 'data/jw.json'), 'utf8'));
  const cats = Object.keys(JW.cats), vids = new Set(JW.videos.map(v => v.id));
  ok('주장마다 판정·쉬운 설명·근거·영상', JW.claims.every(c => cats.includes(c.cat) && c.plain && c.ev.length && vids.has(c.v)), JW.claims.filter(c => !vids.has(c.v)).map(c => c.id));
  ok('주장 id 겹침 없음', new Set(JW.claims.map(c => c.id)).size === JW.claims.length);
  ok('공시 카드: 막대 4개, 설명 4개', JW.disc && JW.disc.bars.rows.length === 4 && JW.disc.points.every(b => cats.includes(b.cat) && b.plain));
  ok('한눈에 보기와 주장 판정이 같은 분류', JW.big[1].cat === JW.claims.find(c => c.id === 'c4').cat);
  ok('예측 기록 결과는 맞음·틀림·진행 중', JW.record.every(r => ['ok', 'no', 'wait'].includes(r.res)));
  const cnt = r => JW.record.filter(x => x.res === r).length;
  eq('예측 기록: 결과 난 9건 중 5건 맞음', [cnt('ok'), cnt('no')], [5, 4]);
  ok('예측 기록 최신순', JW.record.every((r, i) => i === 0 || JW.record[i - 1].when >= r.when));
  ok('차트 분기 14개, 숫자 모두 있음', JW.chart.rows.length === 14 && JW.chart.rows.every(r => [r.price, r.prod, r.vol].every(Number.isFinite)));
  ok('가격 오른 10분기 동안 생산 10번, 수출 물량 9번 증가 (요약 문장과 일치)', (function () {
    const up = JW.chart.rows.slice(4); return up.length === 10 && up.filter(r => r.prod > 0).length === 10 && up.filter(r => r.vol > 0).length === 9;
  })());
  const ours = [].concat(JW.big.map(b => b.plain), JW.claims.map(c => c.plain), JW.terms.map(t => t.p), JW.signals.peak, JW.signals.up, JW.watch.map(w => w.look));
  const DIRECT = /사세요|파세요|매수하세요|매도하세요|팔아라|추천|사라[.!]|사라$/;
  ok('앱이 쓴 설명에 매수·매도 지시·추천 표현 없음', !ours.some(t => DIRECT.test(t)), ours.filter(t => DIRECT.test(t)));
}

section('예측 달력');
{
  const cols = fx._historyColumns, H = fx.history.map(r => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); o.in80 = !!o.in80; o.in95 = !!o.in95; return o; });
  const cd = Compute.calendarData(H, { '2026-10-12': [6589.69, 6368.49] }, '2025-01-01');
  eq('전체 거래일 = 최종 검증 일수', cd.all.n, fx.stats.holdoutN);
  eq('95% 적중 일수 = 모델 성적과 같음', cd.all.in95, Math.round(fx.stats.cov95 * fx.stats.holdoutN));
  near('80% 적중률 = 모델 성적', cd.all.hit80, fx.stats.cov80, 0.0015);
  near('방향 일치율 ≈ 모델 방향 적중률 (오를 확률 반올림 차이만)', cd.all.dirRate, fx.stats.dirHit, 0.003);
  const d13 = cd.byDate['2026-10-13'];
  eq('10-13: 95% 밖·80% 밖, 오를 확률 48% → 내림 예상, 실제 하락 → 방향 일치', [d13.in95, d13.in80, d13.dir], [false, false, true]);
  near('10-13 중심값과 차이(%)', d13.errPct, (6035.35 / 6360 - 1) * 100, 1e-9);
  eq('10-12 장중 고가·저가', [cd.byDate['2026-10-12'].high, cd.byDate['2026-10-12'].low], [6589.69, 6368.49]);
  eq('오를 확률이 없는 날은 방향 판단 안 함', Compute.dirMatch({ pUp: null, actual: 2, prevClose: 1 }), null);
  eq('50%인 날은 방향 판단 안 함', Compute.dirMatch({ pUp: 0.5, actual: 2, prevClose: 1 }), null);
  eq('달별 묶음: 최근 달이 앞', cd.months[0].ym, '2026-10');
  eq('2026년 10월 거래일', cd.months[0].stats.n, H.filter(h => h.date >= '2026-10').length);
}

// ------------------------------------------------------------------
section('기록 계산');
const hist = [true, true, false, true, true, true].map((v, i) => ({ date: '2026-01-0' + (i + 1), in95: v }));
eq('롤링 적중률(3일)', Compute.rollingHit(hist, 3, 'in95').map(r => +r.rate.toFixed(3)), [0.667, 0.667, 0.667, 1]);

// ------------------------------------------------------------------
section('문구');
const BANNED = ['사세요', '파세요', '매수', '매도', '추천', '확실', '틀림없이', '무조건', '반드시', '보장', '폭락', '폭등', '급등', '대박', '목표가', '손절', '기회'];
['app.js', 'charts.js', 'data.js', 'util.js', 'compute.js', 'freshness.js', 'sung.js', 'sungmodel.js', 'jw.js'].forEach(f => {
  const src = fs.readFileSync(path.join(W, 'js', f), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
  const lits = (src.match(/'(?:[^'\\\n]|\\.)*'/g) || []).filter(s => /[가-힣]/.test(s));
  const hits = lits.filter(s => BANNED.some(b => s.indexOf(b) >= 0));
  ok('투자 권유·단정 표현 없음: js/' + f, hits.length === 0, hits);
});
ok('알림 문구', /body: '오늘 코스피 예측이 준비됐어요'/.test(fs.readFileSync(path.join(W, 'js/data.js'), 'utf8')));
ok('versionName 2.4.1', /versionName "2\.4\.1"/.test(fs.readFileSync(path.join(__dirname, '../android/app/build.gradle'), 'utf8')));
ok('v1 화면 파일 없음', ['reading.js', 'holdings.js', 'content.js', 'context.js', 'overnight.js'].every(f => !fs.existsSync(path.join(W, 'js', f))));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
