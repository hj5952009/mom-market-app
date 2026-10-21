/* ESRI v2 계산 점검 (자료 없이): 합성 자료로 수식·보정·앞을 보지 않음을 확인한다. node tools/esri/test.js */
'use strict';
const E = require('./esri.js');
let fail = 0;
const ok = (n, c, info) => { if (!c) { fail++; console.log('FAIL ' + n + (info !== undefined ? ' → ' + JSON.stringify(info) : '')); } };
const near = (n, a, b, t) => ok(n, Math.abs(a - b) <= t, { got: a, want: b });

// 임계금리 r* = g + pb(1+g)/d — 제미나이 문서 표와 같은 값이 나와야 함
const rstar = (g, pb, d) => (g / 100 + (pb / 100) * (1 + g / 100) / (d / 100)) * 100;
near('r* 프랑스', rstar(2.8, -2.8, 114), 0.275, 0.01);
near('r* 이탈리아', rstar(2.7, 0.5, 138), 3.072, 0.01);
near('r* 독일', rstar(2.8, -0.3, 63), 2.31, 0.01);
near('r* 스페인', rstar(4.2, -0.4, 105), 3.80, 0.01);
// 로지스틱: T100=100 ↔ 85점
near('T100=100 → 85점', 100 / (1 + Math.exp(-0.048 * (100 - 64))), 84.9, 0.1);
// 기준 함수
ok('lin 경계', E.lin(60, 60, 150) === 0 && E.lin(150, 60, 150) === 1 && Math.abs(E.lin(105, 60, 150) - 0.5) < 1e-9);
// ECDF: 그 시점까지 값만
const ec = new E.ExpandingECDF(3); [1, 2, 3].forEach(x => ec.add(x));
ok('ECDF 순위', ec.rank(2) === 2 / 3 && ec.rank(10) === 1 && ec.rank(0) === 0);

// 합성 자료로 전체 계산: 2011년 이탈리아·스페인에 스트레스를 넣으면 그 근처가 100
function synth(shock) {
  const raw = { now: '2026-10-15', irs: {}, ciss: {}, bankDD: {}, sov: {}, fiscal: {}, glob: { vix: {}, move: {}, tnx: {}, brent: {}, eur: {} } };
  const ms = []; for (let y = 1998; y <= 2026; y++) for (let m = 1; m <= 12; m++) { const k = y + '-' + String(m).padStart(2, '0'); if (k <= '2026-09') ms.push(k); }
  E.C4.forEach((c, ci) => {
    raw.irs[c] = {}; raw.ciss[c] = {}; raw.bankDD[c] = {}; raw.sov[c] = {}; raw.fiscal[c] = {};
    ms.forEach((m, i) => {
      const crisis = (c === 'IT' && m >= '2011-07' && m <= '2012-01') || (c === 'ES' && m >= '2012-04' && m <= '2012-08');
      raw.irs[c][m] = 3 + ci * 0.3 + Math.sin(i / 7) * 0.2 + (crisis ? shock : 0);
      raw.ciss[c][m] = 0.1 + 0.05 * Math.sin(i / 5 + ci) + (crisis ? 0.5 : 0);
      raw.bankDD[c][m] = 10 + 5 * Math.sin(i / 3) + (crisis ? 50 : 0);
      raw.sov[c][m] = raw.ciss[c][m];
    });
    for (let y = 1995; y <= 2025; y++) raw.fiscal[c][y] = { d: 60 + ci * 25, nl: -2 - ci * 0.5, int: 2, gdp: 1000 * Math.pow(1.03, y - 1995) };
  });
  ms.forEach((m, i) => { raw.glob.vix[m] = 15 + 5 * Math.sin(i / 4); raw.glob.move[m] = 90 + 10 * Math.sin(i / 6); raw.glob.tnx[m] = 3 + Math.sin(i / 9); raw.glob.brent[m] = 70 + 10 * Math.sin(i / 8); raw.glob.eur[m] = 1.1 + 0.05 * Math.sin(i / 10); });
  return raw;
}
const R = E.compute(synth(4));
const itPeak = Math.max(...R.out.IT.filter(x => x.m >= '2011-08' && x.m <= '2012-01').map(x => x.T));
const esPeak = Math.max(...R.out.ES.filter(x => x.m >= '2012-05' && x.m <= '2012-08').map(x => x.T));
near('보정: 두 위기 정점 평균 = 100', (itPeak + esPeak) / 2, 100, 0.01);
const deMax = Math.max(...R.out.DE.filter(x => x.T != null).map(x => x.T));
ok('평상시 독일은 위기선보다 훨씬 낮음', deMax < 70, deMax);
// 앞을 보지 않음: 2020년 이후 자료를 바꿔도 2015년까지 값은 같아야 함
const raw2 = synth(4); Object.keys(raw2.irs.IT).forEach(m => { if (m >= '2020-01') raw2.irs.IT[m] += 5; });
const R2 = E.compute(raw2);
const a = R.out.IT.filter(x => x.m <= '2015-12').map(x => x.R), b = R2.out.IT.filter(x => x.m <= '2015-12').map(x => x.R);
ok('2020년 이후 자료를 바꿔도 2015년까지 원시 지수(R)는 그대로', JSON.stringify(a) === JSON.stringify(b));

console.log(fail ? fail + ' failed' : 'ESRI 점검 통과');
process.exit(fail ? 1 : 0);
