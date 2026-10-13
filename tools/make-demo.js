/* 데모(웹 미리보기·스크린샷) 자료 만들기 — node tools/make-demo.js
 * 1) www/demo/fixture.json : ref/fixture_result_2026-10-13.json(실제 모델 결과) 그대로 +
 *    history를 ref/holdout_daily.csv(실제 워크포워드 기록 431일)로 앞쪽을 채움(그 행들은 pUp 없음).
 * 2) www/demo/series.json  : 화면 확인용 시세. 코스피는 2025-01-02 이후 실제 종가(CSV·fixture),
 *    그 이전과 해외 지표는 고정 난수로 만든 예시 값(실제 시세 아님). */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const REF = process.env.MOMAPP_REF || path.resolve(ROOT, '..', 'ref');
const OUT = path.join(ROOT, 'www', 'demo');
fs.mkdirSync(OUT, { recursive: true });

const fx = JSON.parse(fs.readFileSync(path.join(REF, 'fixture_result_2026-10-13.json'), 'utf8'));
const csv = fs.readFileSync(path.join(REF, 'holdout_daily.csv'), 'utf8').trim().split('\n');
const head = csv.shift().split(',');
const rows = csv.map(l => { const v = l.split(','); const o = {}; head.forEach((h, i) => { o[h] = h === 'date' ? v[i] : +v[i]; }); return o; });

// ---- fixture + history
const have = new Set(fx.history.map(r => r[0]));
const extra = rows.filter(r => !have.has(r.date)).map(r => [r.date, r.prev_close, r.center, r.lo80, r.hi80, r.lo95, r.hi95, r.actual,
  (r.actual >= r.lo80 && r.actual <= r.hi80) ? 1 : 0, r.in95, null]);
let mism = 0;
for (const h of fx.history) {
  const c = rows.find(r => r.date === h[0]);
  if (c && (Math.abs(c.lo95 - h[5]) > 1 || Math.abs(c.hi95 - h[6]) > 1 || (c.in95 ? 1 : 0) !== h[9])) mism++;
}
const out = Object.assign({}, fx, {
  _demoNote: 'history 앞쪽(' + extra.length + '행)은 ref/holdout_daily.csv의 실제 워크포워드 기록(pUp 없음). 나머지는 실제 모델 결과 그대로.',
  history: extra.concat(fx.history)
});
fs.writeFileSync(path.join(OUT, 'fixture.json'), JSON.stringify(out));
console.log('fixture.json: history', out.history.length, 'rows (csv', extra.length, '+ fixture', fx.history.length, '), overlap mismatches', mism);

// ---- series
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(u) { return () => { const a = u() || 1e-9, b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }; }
function bizDays(from, to) {
  const out = []; for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 864e5) {
    const d = new Date(t), w = d.getUTCDay(); if (w && w !== 6) out.push(d.toISOString().slice(0, 10));
  } return out;
}
const r2 = x => Math.round(x * 100) / 100;

// KOSPI: 실제(2025-01-02~) + 예시(이전)
const real = new Map();
rows.forEach(r => real.set(r.date, r.actual));
fx.kospiSeries.forEach(([d, c]) => real.set(d, c));
const firstReal = rows[0].date;
const kDays = bizDays('2019-10-01', '2024-12-31');
const n0 = gauss(rng(7));
const back = []; let c = rows[0].prev_close;
for (let i = kDays.length - 1; i >= 0; i--) { back.push([kDays[i], r2(c)]); c = c / Math.exp(0.0098 * n0() + 0.0002); }
back.reverse();
const kospi = back.concat([...real.entries()].filter(([d]) => d >= firstReal).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, v]) => [d, r2(v)]));

const fDays = bizDays('2023-01-02', '2026-10-13');
function walk(seed, start, vol, drift, mr) {
  const g = gauss(rng(seed)); let v = start; const o = [];
  for (const d of fDays) { o.push([d, r2(v)]); v = mr ? v + mr.k * (mr.mean - v) + mr.s * g() : v * Math.exp(vol * g() + drift); }
  return o;
}
const tickers = {
  kospi,
  sox: walk(11, 2800, 0.021, 0.0006), ndx: walk(12, 10500, 0.0135, 0.0005), mu: walk(13, 50, 0.033, 0.0008),
  ewy: walk(14, 55, 0.016, 0.0004), hyg: walk(15, 74, 0.004, 0.0001), eem: walk(16, 38, 0.011, 0.0002),
  stoxx: walk(17, 3900, 0.011, 0.0003),
  vix: walk(18, 20, 0, 0, { mean: 19, k: 0.06, s: 1.5 }).map(([d, v]) => [d, r2(Math.max(10, v))]),
  usdkrw: walk(19, 1280, 0.0045, 0.00012),
  tnx: walk(20, 3.8, 0, 0, { mean: 4.2, k: 0.02, s: 0.06 })
};
// 마지막 날(10/13 미국 장) EWY는 그날 코스피 움직임과 비슷하게 맞춰 둔다(예시가 지나치게 어색하지 않게)
{
  const e = tickers.ewy, n = e.length, k = kospi, kn = k.length;
  const k1 = Math.log(k[kn - 1][1] / k[kn - 2][1]);
  e[n - 1][1] = r2(e[n - 2][1] * Math.exp(k1 + 0.004));
}
fs.writeFileSync(path.join(OUT, 'series.json'), JSON.stringify({
  _note: '체험용 예시 시세. 코스피 ' + firstReal + ' 이후는 실제 종가(ref/holdout_daily.csv·fixture), 그 이전과 해외 지표는 고정 난수로 만든 예시 값이에요.',
  tickers
}));
console.log('series.json: kospi', kospi.length, 'rows; foreign', fDays.length, 'rows each');
