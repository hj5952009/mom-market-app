/* ESRI v2 — 유럽 국채 위험 지수 (독일·프랑스·이탈리아·스페인). node tools/esri/esri.js [--out 경로] [--report 경로]
 *
 * 제미나이가 설계한 ESRI-100(3개 영역·'100=위기 임계선' 이중 보정)의 뼈대를 살리되, 실제로 무료로 매일 받을 수 있는
 * 공식 자료만 쓰고, 숫자를 '주장'이 아니라 '계산'으로 만들도록 고친 판이다.
 *
 * 자료 (모두 키 없이 받음)
 *  - ECB Data Portal: 10년 국채금리(IRS, 월, 마스트리히트 기준), 국가별 금융 스트레스 지수 CISS(일),
 *                     국가별 국채 스트레스 지수 SovCISS(월, 검증용 — 입력에는 쓰지 않음), 유로/달러(EXR, 일)
 *  - Eurostat: 정부부채·재정수지·이자지출(연, % GDP), 명목 GDP(연)
 *  - Yahoo Finance: VIX, MOVE, 미국 10년물 금리, 브렌트유, 나라별 대표 은행 주가(BNP·인테사·산탄데르·도이체방크)
 *
 * 구조 (월별, 나라별)
 *  ① 채권시장 스트레스 P1: 10년물 대독일 스프레드, 3개월 스프레드 변화, 나라별 CISS, 대표 은행주 12개월 낙폭
 *     → 4개 나라 과거 전체를 함께 놓은 순위(ECDF, 그 달까지 자료만)로 0~1
 *  ② 재정 취약성 F: 부채비율, 기초재정수지, 시장금리−임계금리(r*), 5년 뒤 부채비율 변화(차환 반영), 연간 총자금조달수요
 *     → 고정 기준(IMF·EU 기준선)으로 0~1. 연간 자료는 다음 해 4월(EDP 통보)부터 씀(앞을 보지 않게)
 *  ③ 글로벌 전이 P3: VIX, MOVE, 미국 10년물 3개월 변화, 브렌트 6개월 변화, 유로/달러 6개월 변동 → ECDF 0~1
 *  시장 스트레스 M = CISS식 합산 √((w∘s)ᵀC(w∘s)), s=[P1,P3], w=[0.6,0.4], C=P1·P3의 EWMA 상관(λ=0.9, 월)
 *  원시 위험 R = M × (0.5 + F)       (재정이 약할수록 같은 시장 충격이 더 위험)
 *  ESRI_T100 = 100 × R / R_위기      R_위기 = 2011~12년 이탈리아·스페인 위기 정점 R의 평균 → 100 = 그 수준
 *  ESRI_M100 = 100 / (1 + e^(−0.048(T100 − 64)))   (제미나이 정의 그대로: T100=100 ↔ 85점)
 *
 * 이번 달(공식 월 금리가 아직 없는 달)은 지난달 금리 + 이번 달 지금까지의 일별 CISS·글로벌 지표로 '잠정' 계산한다. */
'use strict';
const fs = require('fs');
const path = require('path');

const C4 = ['DE', 'FR', 'IT', 'ES'];
const NAMES = { DE: '독일', FR: '프랑스', IT: '이탈리아', ES: '스페인' };
const BANKS = { DE: 'DBK.DE', FR: 'BNP.PA', IT: 'ISP.MI', ES: 'SAN.MC' };
const BANK_NAMES = { DE: '도이체방크', FR: 'BNP파리바', IT: '인테사상파올로', ES: '산탄데르' };
// 국채 평균 잔존만기(년): 각국 재무부·국채관리청 공개 자료 기준 대략값(차환 속도 계산용, 해마다 점검)
const WAM = { DE: 6.8, FR: 8.5, IT: 6.9, ES: 7.9 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const START = '1999-01';

// ------------------------------------------------------------------ 받기
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opts = {}, tries = 3) {
  let last;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, opts.headers || {}) });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.fatal = true; throw e; }
      return opts.json ? await r.json() : await r.text();
    } catch (e) { last = e; if (e.fatal) break; await sleep(1500 * (a + 1)); }
  }
  throw new Error(url.slice(0, 120) + ' → ' + (last && last.message));
}
// ECB: 시계열 하나 → [[기간, 값]]
async function ecb(flow, key) {
  const t = await get(`https://data-api.ecb.europa.eu/service/data/${flow}/${key}?format=csvdata&detail=dataonly`);
  const L = t.trim().split('\n'), h = L[0].split(','), iT = h.indexOf('TIME_PERIOD'), iV = h.indexOf('OBS_VALUE');
  return L.slice(1).map(l => l.replace(/\r/g, '').split(',')).filter(c => c[iV] !== '' && !isNaN(+c[iV])).map(c => [c[iT], +c[iV]]);
}
// Eurostat JSON-stat → {기간: 값}
async function eurostat(ds, q) {
  const j = await get(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${ds}?${q}`, { json: true });
  const idx = j.dimension.time.category.index, inv = {};
  Object.keys(idx).forEach(t => { inv[idx[t]] = t; });
  const out = {};
  Object.keys(j.value).forEach(i => { out[inv[i]] = j.value[i]; });
  return out;
}
// Yahoo: 쿠키·crumb (데이터센터 IP는 없으면 429)
let YS = null;
async function ysess() {
  if (YS) return YS;
  YS = { cookie: '', crumb: '' };
  try {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const sc = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
    YS.cookie = sc.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    const c = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: YS.cookie } });
    if (c.ok) YS.crumb = (await c.text()).trim();
  } catch (e) { /* 쿠키 없이 */ }
  return YS;
}
async function yahoo(sym, range, interval) {
  const s = await ysess();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}` + (s.crumb ? '&crumb=' + encodeURIComponent(s.crumb) : '');
  const j = await get(url, { json: true, headers: { Cookie: s.cookie, Accept: 'application/json' } });
  const r = j.chart.result[0], ts = r.timestamp || [], cl = r.indicators.quote[0].close || [], off = r.meta.gmtoffset || 0;
  const out = [];
  ts.forEach((t, i) => { if (cl[i] != null && cl[i] > 0) out.push([new Date((t + off) * 1000).toISOString().slice(0, 10), cl[i]]); });
  await sleep(300);
  return out;
}

// ------------------------------------------------------------------ 도구
const ym = d => d.slice(0, 7);
function addM(m, k) { const n = +m.slice(0, 4) * 12 + (+m.slice(5, 7) - 1) + k; return Math.floor(n / 12) + '-' + String(n % 12 + 1).padStart(2, '0'); }
function months(a, b) { const o = []; for (let m = a; m <= b; m = addM(m, 1)) o.push(m); return o; }
// 일별 → 월평균 / 월말
function monthlyMean(rows) { const s = {}, n = {}; rows.forEach(([d, v]) => { const m = ym(d); s[m] = (s[m] || 0) + v; n[m] = (n[m] || 0) + 1; }); const o = {}; Object.keys(s).forEach(m => { o[m] = s[m] / n[m]; }); return o; }
function monthlyLast(rows) { const o = {}; rows.forEach(([d, v]) => { o[ym(d)] = v; }); return o; }
const isNum = x => typeof x === 'number' && isFinite(x);
const clamp01 = x => Math.max(0, Math.min(1, x));
const lin = (x, a, b) => isNum(x) ? clamp01((x - a) / (b - a)) : null;
const mean = a => { const v = a.filter(isNum); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const r1 = x => isNum(x) ? Math.round(x * 10) / 10 : null, r2 = x => isNum(x) ? Math.round(x * 100) / 100 : null, r3 = x => isNum(x) ? Math.round(x * 1000) / 1000 : null;

// 확장 창 ECDF: 그 달까지 나온 값들(여러 나라 함께) 중 순위. 최소 표본 미만이면 null
class ExpandingECDF {
  constructor(minN) { this.v = []; this.minN = minN || 24; }
  add(x) { if (isNum(x)) { let lo = 0, hi = this.v.length; while (lo < hi) { const m = (lo + hi) >> 1; if (this.v[m] < x) lo = m + 1; else hi = m; } this.v.splice(lo, 0, x); } }
  rank(x) {
    if (!isNum(x) || this.v.length < this.minN) return null;
    let lo = 0, hi = this.v.length; while (lo < hi) { const m = (lo + hi) >> 1; if (this.v[m] <= x) lo = m + 1; else hi = m; }
    return lo / this.v.length;
  }
}

// ------------------------------------------------------------------ 계산
/* raw: {irs:{c:{m:v}}, ciss:{c:{m:v}}, cissDaily:{c:[[d,v]]}, bank:{c:{m:v}}, sov:{c:{m:v}}, fiscal:{c:{year:{d,nl,int,gdp}}},
 *       glob:{vix:{m:v}, move, tnx, brent, eur}, now:'YYYY-MM-DD'} */
function compute(raw) {
  const nowM = ym(raw.now);
  const lastIrs = Math.max(...C4.map(c => Object.keys(raw.irs[c]).sort().pop()).map(m => +m.replace('-', '')));
  const lastIrsM = String(lastIrs).slice(0, 4) + '-' + String(lastIrs).slice(4);
  const M = months(START, nowM);
  // 금리: 공식 월값이 없는 최근 달은 마지막 값으로(잠정)
  const irsAt = (c, m) => { if (raw.irs[c][m] != null) return raw.irs[c][m]; if (m > lastIrsM) return raw.irs[c][lastIrsM]; return null; };
  const spread = (c, m) => { const a = irsAt(c, m), b = irsAt('DE', m); return isNum(a) && isNum(b) ? (a - b) * 100 : null; };

  // 재정: 연도 Y 자료는 Y+1년 4월부터 사용
  function fiscalAt(c, m) {
    const y = +m.slice(0, 4), mm = +m.slice(5, 7), use = mm >= 4 ? y - 1 : y - 2;
    const F = raw.fiscal[c], f = F[use], fp = F[use - 1], f3 = F[use - 3];
    if (!f || !isNum(f.d) || !isNum(f.nl)) return null;
    const pb = f.nl + (f.int || 0);                       // 기초재정수지 = 재정수지 + 이자지출 (% GDP)
    const reff = fp && isNum(fp.d) && isNum(f.int) && fp.d > 0 ? f.int / fp.d * 100 : null;  // 유효 이자율(%)
    const g = f3 && isNum(f.gdp) && isNum(f3.gdp) ? (Math.pow(f.gdp / f3.gdp, 1 / 3) - 1) * 100 : null; // 3년 평균 명목성장률(%)
    return { year: use, d: f.d, nl: f.nl, int: f.int, pb, reff, g };
  }
  function vulnerability(c, m) {
    const f = fiscalAt(c, m), r = irsAt(c, m);
    if (!f || !isNum(f.g) || !isNum(r)) return null;
    const g = f.g / 100, d = f.d / 100, pb = f.pb / 100;
    const rstar = (g + pb * (1 + g) / d) * 100;           // 부채비율이 늘지 않는 최대 금리(%)
    const gap = r - rstar;
    // 5년 뒤 부채비율: 유효금리가 시장금리로 1/WAM씩 다가감(차환), 성장률·기초수지는 그대로
    let dd = f.d, re = isNum(f.reff) ? f.reff : r;
    for (let k = 0; k < 5; k++) { re = re + (r - re) / WAM[c]; dd = dd * (1 + re / 100) / (1 + g) - f.pb; }
    const dd5 = dd - f.d;
    const gfn = -f.nl + f.d / WAM[c];                      // 연간 총자금조달수요(% GDP) ≈ 적자 + 만기 도래분
    const sc = { debt: lin(f.d, 60, 150), pb: lin(-f.pb, -2, 4), gap: lin(gap, -2, 4), dd5: lin(dd5, -5, 15), gfn: lin(gfn, 10, 25) };
    return { F: mean(Object.values(sc)), sc, rstar, gap, dd5, gfn, rmkt: r, ...f };
  }

  // 글로벌 변수(월)
  const G = raw.glob, gv = {};
  M.forEach(m => {
    const p3 = addM(m, -3), p6 = addM(m, -6);
    gv[m] = {
      vix: G.vix[m], move: G.move[m],
      tnx3: isNum(G.tnx[m]) && isNum(G.tnx[p3]) ? G.tnx[m] - G.tnx[p3] : null,
      brent6: isNum(G.brent[m]) && isNum(G.brent[p6]) ? (G.brent[m] / G.brent[p6] - 1) * 100 : null,
      eur6: isNum(G.eur[m]) && isNum(G.eur[p6]) ? Math.abs(G.eur[m] / G.eur[p6] - 1) * 100 : null
    };
  });
  const gE = { vix: new ExpandingECDF(36), move: new ExpandingECDF(36), tnx3: new ExpandingECDF(36), brent6: new ExpandingECDF(36), eur6: new ExpandingECDF(36) };
  const pE = { spr: new ExpandingECDF(48), dspr: new ExpandingECDF(48), ciss: new ExpandingECDF(48), bank: new ExpandingECDF(48) };

  const out = {}; C4.forEach(c => { out[c] = []; });
  const P3 = {};
  let cov = null; // P1·P3 EWMA (나라별)
  const ew = {}; C4.forEach(c => { ew[c] = { m1: null, m3: null, v1: null, v3: null, c13: null }; });
  const LAM = 0.9;

  M.forEach(m => {
    // 이번 달 값을 먼저 기록에 넣고(그 달까지 자료) 순위 계산
    const gvals = gv[m];
    Object.keys(gE).forEach(k => gE[k].add(gvals[k]));
    const p3parts = {}; Object.keys(gE).forEach(k => { p3parts[k] = gE[k].rank(gvals[k]); });
    P3[m] = { S: mean(Object.values(p3parts)), parts: p3parts, vals: gvals };

    const rowsM = {};
    C4.forEach(c => {
      const sp = spread(c, m), sp3 = spread(c, addM(m, -3));
      const vals = { spr: c === 'DE' ? null : sp, dspr: c === 'DE' ? null : (isNum(sp) && isNum(sp3) ? sp - sp3 : null), ciss: raw.ciss[c][m], bank: raw.bankDD[c][m] };
      rowsM[c] = vals;
      Object.keys(pE).forEach(k => pE[k].add(vals[k]));
    });
    C4.forEach(c => {
      const vals = rowsM[c], parts = {};
      Object.keys(pE).forEach(k => { parts[k] = pE[k].rank(vals[k]); });
      const S1 = mean(Object.values(parts)), S3 = P3[m].S, V = vulnerability(c, m);
      let R = null, Mk = null, rho = null;
      if (isNum(S1) && isNum(S3)) {
        const e = ew[c];
        if (e.m1 === null) { e.m1 = S1; e.m3 = S3; e.v1 = 0.01; e.v3 = 0.01; e.c13 = 0; }
        else {
          e.m1 = LAM * e.m1 + (1 - LAM) * S1; e.m3 = LAM * e.m3 + (1 - LAM) * S3;
          e.v1 = LAM * e.v1 + (1 - LAM) * (S1 - e.m1) ** 2; e.v3 = LAM * e.v3 + (1 - LAM) * (S3 - e.m3) ** 2;
          e.c13 = LAM * e.c13 + (1 - LAM) * (S1 - e.m1) * (S3 - e.m3);
        }
        rho = Math.max(-1, Math.min(1, e.c13 / Math.sqrt(e.v1 * e.v3)));
        const a = 0.6 * S1, b = 0.4 * S3;
        Mk = Math.sqrt(Math.max(0, a * a + b * b + 2 * rho * a * b));
        if (V) R = Mk * (0.5 + V.F);
      }
      out[c].push({ m, S1, S3, M: Mk, rho, F: V ? V.F : null, R, parts, vals, V });
    });
  });

  // 보정: 2011~12년 위기 정점(이탈리아 2011-08~2012-01, 스페인 2012-05~2012-08의 최대 R) 평균 = 100
  const peak = (c, a, b) => Math.max(...out[c].filter(x => x.m >= a && x.m <= b && isNum(x.R)).map(x => x.R));
  const anchors = [['IT', '2011-08', '2012-01'], ['ES', '2012-05', '2012-08']].map(([c, a, b]) => ({ c, from: a, to: b, R: peak(c, a, b) }));
  const Rc = mean(anchors.map(x => x.R));
  const T = R => isNum(R) ? 100 * R / Rc : null;
  const MX = t => isNum(t) ? 100 / (1 + Math.exp(-0.048 * (t - 64))) : null;
  C4.forEach(c => out[c].forEach(x => { x.T = T(x.R); x.X = MX(x.T); }));

  // 검증: SovCISS(ECB 국채 스트레스, 입력에 안 씀)와 순위상관, 위기 구간 확인
  function spearman(a, b) {
    const rk = v => { const s = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = Array(v.length); s.forEach((p, i) => { r[p[1]] = i; }); return r; };
    const ra = rk(a), rb = rk(b), n = a.length, ma = (n - 1) / 2;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (ra[i] - ma) * (rb[i] - ma); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - ma) ** 2; }
    return sab / Math.sqrt(saa * sbb);
  }
  const valid = {};
  C4.forEach(c => {
    const pairs = out[c].filter(x => isNum(x.T) && isNum(raw.sov[c][x.m]));
    const lvl = pairs.length > 24 ? spearman(pairs.map(x => x.T), pairs.map(x => raw.sov[c][x.m])) : null;
    // 같은 달 변화끼리(12개월 변화)
    const ch = [];
    for (let i = 12; i < out[c].length; i++) { const a = out[c][i], b = out[c][i - 12]; if (isNum(a.T) && isNum(b.T) && isNum(raw.sov[c][a.m]) && isNum(raw.sov[c][b.m])) ch.push([a.T - b.T, raw.sov[c][a.m] - raw.sov[c][b.m]]); }
    valid[c] = { n: pairs.length, from: pairs.length ? pairs[0].m : null, to: pairs.length ? pairs[pairs.length - 1].m : null, rhoLevel: r3(lvl), rhoChange12: ch.length > 24 ? r3(spearman(ch.map(x => x[0]), ch.map(x => x[1]))) : null };
  });
  const EPIS = [['2008-09', '2009-03', '세계 금융위기'], ['2010-04', '2010-06', '그리스 1차 위기'], ['2011-07', '2012-08', '남유럽 재정위기'], ['2018-05', '2018-11', '이탈리아 예산 갈등'],
    ['2020-03', '2020-04', '코로나 충격'], ['2022-06', '2022-10', 'ECB 금리 인상·TPI 도입'], ['2024-06', '2024-07', '프랑스 조기 총선'], ['2025-09', '2025-10', '프랑스 예산·내각 위기']];
  const episodes = EPIS.map(([a, b, name]) => {
    const o = { from: a, to: b, name };
    C4.forEach(c => { const xs = out[c].filter(x => x.m >= a && x.m <= b && isNum(x.T)); o[c] = xs.length ? r1(Math.max(...xs.map(x => x.T))) : null; });
    return o;
  });
  return { out, P3, anchors, Rc, valid, episodes, lastIrsM, nowM };
}

// ------------------------------------------------------------------ 실행
async function main() {
  const args = process.argv.slice(2), outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'esri.json';
  const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
  const now = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 한국 날짜
  const raw = { now, irs: {}, ciss: {}, cissDaily: {}, bankDD: {}, bankDaily: {}, sov: {}, fiscal: {}, glob: {} };
  const errors = [];
  const step = async (name, f) => { try { await f(); } catch (e) { errors.push(name + ': ' + e.message); } };

  for (const c of C4) {
    await step('금리 ' + c, async () => { raw.irs[c] = Object.fromEntries(await ecb('IRS', `M.${c}.L.L40.CI.0000.EUR.N.Z`)); });
    await step('CISS ' + c, async () => { const d = await ecb('CISS', `D.${c}.Z0Z.4F.EC.SS_CIN.IDX`); raw.ciss[c] = monthlyMean(d); raw.cissDaily[c] = d.slice(-260); });
    await step('SovCISS ' + c, async () => { raw.sov[c] = Object.fromEntries(await ecb('CISS', `M.${c}.Z0Z.4F.EC.SOV_CI.IDX`)); });
    await step('재정 ' + c, async () => {
      const [debt, nl, intr, gdp] = await Promise.all([
        eurostat('gov_10dd_edpt1', `geo=${c}&na_item=GD&sector=S13&unit=PC_GDP`),
        eurostat('gov_10dd_edpt1', `geo=${c}&na_item=B9&sector=S13&unit=PC_GDP`),
        eurostat('gov_10a_main', `geo=${c}&na_item=D41PAY&sector=S13&unit=PC_GDP`),
        eurostat('nama_10_gdp', `geo=${c}&na_item=B1GQ&unit=CP_MEUR`)]);
      const F = {}; Object.keys(debt).forEach(y => { F[+y] = { d: debt[y], nl: nl[y], int: intr[y], gdp: gdp[y] }; });
      raw.fiscal[c] = F;
    });
    await step('은행주 ' + c, async () => {
      const mon = await yahoo(BANKS[c], 'max', '1mo'), last = monthlyLast(mon), ks = Object.keys(last).sort(), dd = {};
      ks.forEach((m, i) => { const w = ks.slice(Math.max(0, i - 12), i + 1).map(k => last[k]); dd[m] = -(last[m] / Math.max(...w) - 1) * 100; });
      raw.bankDD[c] = dd;
      raw.bankDaily[c] = (await yahoo(BANKS[c], '1y', '1d')).slice(-260);
    });
  }
  await step('글로벌', async () => {
    const [vix, move, tnx, brent] = await Promise.all([yahoo('^VIX', 'max', '1mo'), yahoo('^MOVE', 'max', '1mo'), yahoo('^TNX', 'max', '1mo'), yahoo('BZ=F', 'max', '1mo')]);
    const eur = await ecb('EXR', 'D.USD.EUR.SP00.A');
    raw.glob = { vix: monthlyLast(vix), move: monthlyLast(move), tnx: monthlyLast(tnx), brent: monthlyLast(brent), eur: monthlyLast(eur) };
    raw.globDaily = {};
    for (const [k, s] of [['vix', '^VIX'], ['move', '^MOVE'], ['tnx', '^TNX'], ['brent', 'BZ=F']]) raw.globDaily[k] = (await yahoo(s, '1y', '1d')).slice(-260);
    raw.globDaily.eur = eur.slice(-260);
  });
  ann('notice', '자료 수: ' + C4.map(c => c + ' irs ' + Object.keys(raw.irs[c] || {}).length + ' ciss ' + Object.keys(raw.ciss[c] || {}).length + ' fis ' + Object.keys(raw.fiscal[c] || {}).length + ' bank ' + Object.keys(raw.bankDD[c] || {}).length + ' sov ' + Object.keys(raw.sov[c] || {}).length).join(' / ') + ' · vix ' + Object.keys(raw.glob.vix || {}).length + ' eur ' + Object.keys(raw.glob.eur || {}).length);
  // 꼭 있어야 하는 자료가 빠지면 실패
  const has = o => o && Object.keys(o).length > 12;
  const need = C4.every(c => has(raw.irs[c]) && has(raw.ciss[c]) && has(raw.fiscal[c]) && has(raw.bankDD[c])) && has(raw.glob.vix);
  if (!need) { console.error('필수 자료 누락:\n' + errors.join('\n')); ann('error', '필수 자료 누락: ' + errors.join(' | ')); process.exit(1); }
  C4.forEach(c => { if (!raw.sov[c]) raw.sov[c] = {}; });

  const R = compute(raw);
  const json = buildJson(raw, R, errors);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(json));
  const rep = report(json);
  if (reportPath) fs.writeFileSync(reportPath, rep);
  console.log(rep);
  if (errors.length) { console.log('경고:\n' + errors.join('\n')); ann('warning', errors.join(' | ')); }
  ann('notice', C4.map(c => c + ' ' + json.countries[c].latest.t100 + '(' + json.countries[c].latest.regime + ')').join(', ') + ' · Rc=' + json.calibration.Rcrisis + ' · ' + C4.map(c => c + ' ρ=' + json.countries[c].valid.rhoLevel).join(' '));
}

function regime(t) { return !isNum(t) ? null : t >= 100 ? '위기' : t >= 76 ? '고위험' : t >= 51 ? '주의' : '정상'; }
function buildJson(raw, R, errors) {
  const countries = {};
  C4.forEach(c => {
    const rows = R.out[c], last = rows[rows.length - 1], lastOff = rows.filter(x => x.m <= R.lastIrsM).pop();
    const L = (x) => x && {
      month: x.m, t100: r1(x.T), m100: r1(x.X), regime: regime(x.T), P1: r3(x.S1), P3: r3(x.S3), F: r3(x.F), M: r3(x.M), rho: r2(x.rho),
      parts: { spr: r3(x.parts.spr), dspr: r3(x.parts.dspr), ciss: r3(x.parts.ciss), bank: r3(x.parts.bank) },
      vals: { spr: r1(x.vals.spr), dspr: r1(x.vals.dspr), ciss: r3(x.vals.ciss), bank: r1(x.vals.bank) },
      fiscal: x.V && { year: x.V.year, debt: r1(x.V.d), balance: r1(x.V.nl), interest: r1(x.V.int), pb: r1(x.V.pb), reff: r2(x.V.reff), g: r2(x.V.g), rmkt: r2(x.V.rmkt), rstar: r2(x.V.rstar), gap: r2(x.V.gap), dd5: r1(x.V.dd5), gfn: r1(x.V.gfn), sc: Object.fromEntries(Object.entries(x.V.sc).map(([k, v]) => [k, r3(v)])) }
    };
    countries[c] = {
      name: NAMES[c], bank: BANK_NAMES[c], wam: WAM[c],
      latest: L(last), official: L(lastOff),
      monthly: rows.filter(x => isNum(x.T)).map(x => [x.m, r1(x.T), r3(x.S1), r3(x.F), r3(x.S3)]),
      sov: Object.entries(raw.sov[c]).filter(([m]) => m >= START).map(([m, v]) => [m, r3(v)]),
      daily: { ciss: (raw.cissDaily[c] || []).map(([d, v]) => [d, r3(v)]), bank: (raw.bankDaily[c] || []).map(([d, v]) => [d, r2(v)]) },
      cissPct: (() => { const all = Object.values(raw.ciss[c]).filter(isNum).sort((a, b) => a - b), d = raw.cissDaily[c] || [], v = d.length ? d[d.length - 1][1] : null; if (!isNum(v)) return null; let k = 0; while (k < all.length && all[k] <= v) k++; return r3(k / all.length); })(),
      valid: R.valid[c]
    };
  });
  const gl = R.P3[R.nowM];
  return {
    v: 1, model: 'ESRI v2', generatedAt: new Date().toISOString(), asOf: raw.now, lastOfficialMonth: R.lastIrsM, nowMonth: R.nowM,
    calibration: { Rcrisis: r3(R.Rc), anchors: R.anchors.map(a => ({ c: a.c, from: a.from, to: a.to, R: r3(a.R) })), gamma: 0.048, theta: 64 },
    weights: { P1: 0.6, P3: 0.4, F: 'R = M × (0.5 + F)' },
    countries, episodes: R.episodes,
    global: {
      latest: { month: R.nowM, P3: r3(gl.S), parts: Object.fromEntries(Object.entries(gl.parts).map(([k, v]) => [k, r3(v)])), vals: Object.fromEntries(Object.entries(gl.vals).map(([k, v]) => [k, r2(v)])) },
      monthly: Object.keys(R.P3).filter(m => isNum(R.P3[m].S)).map(m => [m, r3(R.P3[m].S)]),
      daily: Object.fromEntries(Object.entries(raw.globDaily || {}).map(([k, rows]) => [k, rows.map(([d, v]) => [d, r2(v)])]))
    },
    // 제미나이 문서가 '2026년 10월 실측'이라고 적은 값(비교용)
    gemini: { DE: { y10: 3.43, t100: 35.4, m100: 24.8, rstar: 2.31 }, FR: { y10: 4.79, t100: 90.4, m100: 78.6, rstar: 0.28 }, IT: { y10: 4.50, t100: 71.8, m100: 59.4, rstar: 3.07 }, ES: { y10: 4.03, t100: 51.3, m100: 38.2, rstar: 3.80 } },
    warnings: errors
  };
}
function report(j) {
  const L = [];
  L.push(`# ESRI v2 결과 (${j.asOf}, 공식 월 금리 마지막: ${j.lastOfficialMonth})`, '');
  L.push(`보정: R_위기 = ${j.calibration.Rcrisis} (` + j.calibration.anchors.map(a => `${a.c} ${a.from}~${a.to} 최대 R ${a.R}`).join(', ') + ')', '');
  L.push('| 나라 | 이번 달(잠정) T100 | 점수 | 등급 | 공식 마지막 달 T100 | P1 | P3 | F | r* | 시장금리 | 5년 부채변화 | SovCISS 순위상관(수준/12개월변화) |', '|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|');
  C4.forEach(c => { const x = j.countries[c], a = x.latest, o = x.official, f = a.fiscal || {}; L.push(`| ${x.name} | ${a.t100} | ${a.m100} | ${a.regime} | ${o ? o.t100 + ' (' + o.month + ')' : '–'} | ${a.P1} | ${a.P3} | ${a.F} | ${f.rstar} | ${f.rmkt} | ${f.dd5} | ${x.valid.rhoLevel} / ${x.valid.rhoChange12} (n=${x.valid.n}) |`); });
  L.push('', '## 위기 구간 최고값 (T100)', '| 구간 | 이름 | 독일 | 프랑스 | 이탈리아 | 스페인 |', '|---|---|---:|---:|---:|---:|');
  j.episodes.forEach(e => L.push(`| ${e.from}~${e.to} | ${e.name} | ${e.DE} | ${e.FR} | ${e.IT} | ${e.ES} |`));
  return L.join('\n') + '\n';
}

const ann = (lvl, msg) => { if (process.env.GITHUB_ACTIONS) console.log('::' + lvl + ' title=ESRI::' + String(msg).replace(/\r?\n/g, ' ⏎ ').replace(/%/g, '%25').slice(0, 3000)); };
if (require.main === module) main().catch(e => { console.error(e); ann('error', (e && e.stack) || e); process.exit(2); });
module.exports = { compute, buildJson, report, ExpandingECDF, lin, C4 };
