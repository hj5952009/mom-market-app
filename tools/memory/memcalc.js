/* 메모리 반도체 가격 사이클 계산 (앱의 '반도체' 탭 자료).
 * 입력: 한국은행 수출물가지수(품목별) D램·플래시메모리, 계약통화 기준 월별 지수.
 * 노트북에서 파이썬으로 만든 분석(사이클 나누기·상승률 정점·'상승률 반토막' 신호)을 그대로 옮긴 것.
 * node 전용(빌드 스크립트·단위 테스트에서 씀). 앱은 계산 결과(www/data/memory.json)만 읽는다. */
'use strict';

// ------------------------------------------------------------------ 날짜(YYYY-MM)
function ymToN(ym) { return (+ym.slice(0, 4)) * 12 + (+ym.slice(5, 7)) - 1; }
function nToYm(n) { var y = Math.floor(n / 12), m = n % 12 + 1; return y + '-' + (m < 10 ? '0' : '') + m; }
function monthsBetween(a, b) { return ymToN(b) - ymToN(a); }

/* rows: [{m:'YYYY-MM', v:number|null}] (달 순서, 빈 달 없음) → 값 있는 첫 달부터 [{m,v}] */
function clean(rows, from) {
  var out = rows.filter(function (r) { return r.m >= (from || '0000-00') && r.v != null && isFinite(r.v) && r.v > 0; });
  for (var i = 1; i < out.length; i++) {
    if (ymToN(out[i].m) !== ymToN(out[i - 1].m) + 1) throw new Error('달이 빠졌어요: ' + out[i - 1].m + ' → ' + out[i].m);
  }
  return out;
}

// 3개월 중심 이동평균(양 끝은 있는 값만)
function smooth3(v) {
  return v.map(function (_, i) {
    var a = [v[i - 1], v[i], v[i + 1]].filter(function (x) { return x !== undefined; });
    return a.reduce(function (s, x) { return s + x; }, 0) / a.length;
  });
}

/* 고점(P)·저점(T) 찾기: 3개월 평균의 ±6개월 안 최고/최저 → 같은 종류가 이어지면 더 극단인 것만
 * → 진폭 20% 미만·간격 6개월 미만이면 뒤엣것을 지우고 다시 정리(반복) → 원자료 ±2개월 안 실제 극값으로 날짜 맞춤
 * → 끝에서 6개월 안의 고점은 '진행 중'이라 확정 고점에서 뺌. */
function turningPoints(s, opt) {
  opt = opt || {};
  var W = opt.window || 6, MIN_AMP = Math.log(1 + (opt.minAmp || 0.20)), MIN_PH = opt.minPhase || 6;
  var v = s.map(function (r) { return r.v; }), sm = smooth3(v), n = v.length, pts = [];
  for (var i = 0; i < n; i++) {
    var lo = Math.max(0, i - W), hi = Math.min(n, i + W + 1), seg = sm.slice(lo, hi);
    if (sm[i] === Math.max.apply(null, seg)) pts.push([i, 'P']);
    else if (sm[i] === Math.min.apply(null, seg)) pts.push([i, 'T']);
  }
  function merge(list) {
    var out = [];
    list.forEach(function (p) {
      var last = out[out.length - 1];
      if (last && last[1] === p[1]) {
        var better = p[1] === 'P' ? sm[p[0]] > sm[last[0]] : sm[p[0]] < sm[last[0]];
        if (better) out[out.length - 1] = p;
      } else out.push(p);
    });
    return out;
  }
  var c = merge(pts), changed = true;
  while (changed) {
    changed = false;
    for (var k = 1; k < c.length; k++) {
      var a = c[k - 1], b = c[k];
      if (Math.abs(Math.log(sm[b[0]] / sm[a[0]])) < MIN_AMP || b[0] - a[0] < MIN_PH) {
        c.splice(k, 1); c = merge(c); changed = true; break;
      }
    }
  }
  var out = c.map(function (p) {
    var lo = Math.max(0, p[0] - 2), hi = Math.min(n - 1, p[0] + 2), best = lo;
    for (var j = lo; j <= hi; j++) if (p[1] === 'P' ? v[j] > v[best] : v[j] < v[best]) best = j;
    return { i: best, m: s[best].m, type: p[1], v: v[best] };
  });
  // (노트북 분석: 마지막 달과 186일 미만 차이 = 6개월 이내)
  if (out.length && out[out.length - 1].type === 'P' && (n - 1) - out[out.length - 1].i <= W) out.pop();
  return out;
}

function pctChange(v, k) { return v.map(function (x, i) { return i >= k ? x / v[i - k] - 1 : null; }); }
function r1(x) { return Math.round(x * 10) / 10; }
function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; }

function cycles(s, tps) {
  var out = [];
  for (var k = 0; k + 1 < tps.length; k++) {
    var a = tps[k], b = tps[k + 1];
    out.push({ phase: a.type === 'T' ? 'up' : 'down', start: a.m, end: b.m, months: b.i - a.i, changePct: r1((b.v / a.v - 1) * 100), done: true });
  }
  return out;
}

/* 상승기마다 '3개월 상승률이 가장 높았던 달'과 그 뒤 가격 정점까지 걸린 달 수 */
function momentum(s, tps) {
  var r3 = pctChange(s.map(function (r) { return r.v; }), 3), out = [];
  for (var k = 0; k + 1 < tps.length; k++) {
    var a = tps[k], b = tps[k + 1]; if (a.type !== 'T') continue;
    var best = a.i;
    for (var j = a.i; j <= b.i; j++) if (r3[j] != null && (r3[best] == null || r3[j] > r3[best])) best = j;
    out.push({ upcycle: a.m + '~' + b.m, peakMonth: s[best].m, peakR3Pct: r1(r3[best] * 100), lag: b.i - best });
  }
  return out;
}

/* '상승률 반토막' 신호: 가격은 오르는 중(3개월 상승률>0)인데 3개월 상승률이 최근 12개월 최고치(15% 이상)의 절반 이하인 달.
 * 신호가 처음 켜진 달마다 6·12개월 뒤 가격 변화를 모은다. (로그 상승률 기준 — 노트북 분석과 같음) */
function eventStudy(s) {
  var lv = s.map(function (r) { return Math.log(r.v); }), n = lv.length, r3 = [], mx = [], cond = [];
  for (var i = 0; i < n; i++) {
    r3.push(i >= 3 ? lv[i] - lv[i - 3] : null);
    var m = null;
    if (i >= 14) { m = -Infinity; for (var j = i - 11; j <= i; j++) m = Math.max(m, r3[j]); }
    mx.push(m);
    cond.push(r3[i] != null && m != null && r3[i] > 0 && m > Math.log(1.15) && r3[i] <= 0.5 * m);
  }
  var eps = [];
  for (var t = 0; t < n; t++) {
    if (!cond[t] || (t > 0 && cond[t - 1])) continue;
    var c6 = t + 6 < n ? Math.exp(lv[t + 6] - lv[t]) - 1 : null, c12 = t + 12 < n ? Math.exp(lv[t + 12] - lv[t]) - 1 : null;
    eps.push({ m: s[t].m, r3Pct: r1((Math.exp(r3[t]) - 1) * 100), maxPct: r1((Math.exp(mx[t]) - 1) * 100), chg6Pct: c6 == null ? null : r1(c6 * 100), chg12Pct: c12 == null ? null : r1(c12 * 100) });
  }
  var e6 = eps.filter(function (e) { return e.chg6Pct != null; }), e12 = eps.filter(function (e) { return e.chg12Pct != null; });
  return {
    episodes: eps,
    n6: e6.length, down6: e6.filter(function (e) { return e.chg6Pct < 0; }).length, median6Pct: r1(median(e6.map(function (e) { return e.chg6Pct; })) || 0),
    n12: e12.length, down12: e12.filter(function (e) { return e.chg12Pct < 0; }).length, median12Pct: r1(median(e12.map(function (e) { return e.chg12Pct; })) || 0),
    lastTrigger: eps.length ? eps[eps.length - 1].m : null,
    onNow: cond[n - 1]
  };
}

/* 지금 국면 판단(규칙). 모두 지수 자체로만 정한다.
 *  상승기: 3개월 상승률이 최근 2달 연속 0 이하 → 'turning'(꺾이는 중), 상승률이 이번 사이클 최고의 절반 이하 → 'late'(상승 후반·둔화), 아니면 'up'
 *  하락기: 3개월 상승률 < 0 → 'down', 아니면 'bottom'(바닥 다지기) */
function phase(cur) {
  var r = cur.r3Pct, rPrev = cur.r3PrevPct;
  if (cur.lastTp.type === 'T') {
    if (r <= 0 && rPrev <= 0) return { code: 'turning', label: '꺾이는 중', text: '가격 상승이 멈추고 두 달째 3개월 전보다 낮아요' };
    if (cur.peakR3Pct > 0 && r <= cur.peakR3Pct / 2) return { code: 'late', label: '상승 후반 · 속도 둔화', text: '가격은 아직 오르지만 오르는 속도가 정점의 절반 아래로 줄었어요' };
    return { code: 'up', label: '상승 중', text: '가격이 빠르게 오르고 있어요' };
  }
  if (r < 0) return { code: 'down', label: '하락 중', text: '가격이 3개월 전보다 낮아요' };
  return { code: 'bottom', label: '바닥 다지기', text: '하락이 멈추고 다시 오르기 시작했어요' };
}

function analyze(rows, from) {
  var s = clean(rows, from), v = s.map(function (r) { return r.v; }), n = s.length;
  var tps = turningPoints(s), cyc = cycles(s, tps), mom = momentum(s, tps), ev = eventStudy(s);
  var r3 = pctChange(v, 3), yoy = pctChange(v, 12), last = tps[tps.length - 1];
  var cur = { month: s[n - 1].m, value: v[n - 1], r3Pct: r1(r3[n - 1] * 100), r3PrevPct: r1(r3[n - 2] * 100), yoyPct: r1(yoy[n - 1] * 100),
    lastTp: { m: last.m, type: last.type, v: last.v }, monthsSinceTp: n - 1 - last.i, sinceTpPct: r1((v[n - 1] / last.v - 1) * 100) };
  if (last.type === 'T') {
    var best = last.i; for (var j = last.i; j < n; j++) if (r3[j] != null && (r3[best] == null || r3[j] > r3[best])) best = j;
    cur.peakR3Month = s[best].m; cur.peakR3Pct = r1(r3[best] * 100); cur.monthsSincePeakR3 = n - 1 - best;
    cyc.push({ phase: 'up', start: last.m, end: cur.month, months: cur.monthsSinceTp, changePct: cur.sinceTpPct, done: false });
  } else {
    cyc.push({ phase: 'down', start: last.m, end: cur.month, months: cur.monthsSinceTp, changePct: cur.sinceTpPct, done: false });
  }
  var ups = cyc.filter(function (c) { return c.phase === 'up' && c.done; }), downs = cyc.filter(function (c) { return c.phase === 'down' && c.done; });
  var stats = {
    nUp: ups.length,
    upMonthsMedian: median(ups.map(function (c) { return c.months; })), upMonthsMax: Math.max.apply(null, ups.map(function (c) { return c.months; })),
    upChangeMedianPct: r1(median(ups.map(function (c) { return c.changePct; }))), upChangeMaxPct: Math.max.apply(null, ups.map(function (c) { return c.changePct; })),
    downMonthsMedian: median(downs.map(function (c) { return c.months; })), downChangeMedianPct: r1(median(downs.map(function (c) { return c.changePct; }))),
    lagMedian: median(mom.map(function (m) { return m.lag; })), lagMin: Math.min.apply(null, mom.map(function (m) { return m.lag; })), lagMax: Math.max.apply(null, mom.map(function (m) { return m.lag; }))
  };
  return { turningPoints: tps.map(function (t) { return { m: t.m, type: t.type }; }), cycles: cyc, momentum: mom, event: ev, stats: stats, current: cur, phase: phase(cur),
    series: s.map(function (r, i) { return [r.m, Math.round(r.v * 100) / 100, r3[i] == null ? null : r1(r3[i] * 100)]; }) };
}

module.exports = { analyze: analyze, turningPoints: turningPoints, eventStudy: eventStudy, phase: phase, ymToN: ymToN, nToYm: nToYm, monthsBetween: monthsBetween, clean: clean };
