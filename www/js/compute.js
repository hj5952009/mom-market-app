/* 계산 묶음 (화면과 무관한 순수 함수). Worker·메인 스레드·node 테스트에서 같이 쓴다.
 *  - computeAll: 모델 실행 + 미국 자료 B2 규칙(미리 보기 강제)
 *  - densityFromQuantiles: 모델이 낸 분위수로 내일 종가의 확률 밀도 곡선 만들기 (모델은 그대로, 앱에서 계산)
 *  - rollingHit: 기록의 롤링 적중률 */
(function (root) {
  'use strict';
  var HISTORY_DAYS = 450;                  // 기록 화면: 2025-01 이후 전부(약 430거래일)가 들어오게
  var US_SYMS = ['^SOX', '^IXIC', 'EWY'];  // model.js US_KEY와 같은 지표

  function U() { return root.MCUtil; }

  /* 미국 장 결과를 '확정'으로 써도 되는지 (B2 규칙).
   *  - 오늘 받기에 실패해 저장된 값으로 채운 미국 지표가 있으면 → 미리 보기
   *  - 모델이 '미국 휴장'으로 판단했는데 그날이 NYSE 휴장일 표에 없으면 → 미리 보기 (자료가 늦게 들어오는 중일 수 있음) */
  function previewReason(res, fetchErrors) {
    var miss = US_SYMS.filter(function (s) { return fetchErrors && fetchErrors[s]; });
    if (miss.length) return { code: 'us_fetch_failed', symbols: miss };
    if (res && res.meta && res.meta.usHoliday) {
      var hol = U() && U().US_HOLIDAYS;
      if (!hol || !hol[res.baseDate]) return { code: 'us_unconfirmed', date: res.baseDate };
    }
    return null;
  }

  // opts: {fetchErrors: {symbol: message}}
  function computeAll(raw, nowMs, opts) {
    opts = opts || {};
    var KModel = root.KModel;
    var cfg = { historyDays: HISTORY_DAYS };
    var pre = previewReason(null, opts.fetchErrors);
    var res = KModel.run(raw, { mode: pre ? 'mixture' : 'auto', now: nowMs, cfg: cfg });
    if (!pre && res.mode === 'overnight') {
      pre = previewReason(res, null);
      if (pre) res = KModel.run(raw, { mode: 'mixture', now: nowMs, cfg: cfg });
    }
    return { result: res, previewReason: pre };
  }

  // ------------------------------------------------------------------ 정규분포
  // erfc: Numerical Recipes erfcc (상대 오차 < 1.2e-7)
  function erfc(x) {
    var z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function normCdf(z) { return 0.5 * erfc(-z / Math.SQRT2); }
  function normPdf(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
  // Acklam 역함수 + Newton 한 번 (오차 ~1e-9)
  function normInv(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q, r, x;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    var e = normCdf(x) - p;
    return x - e / normPdf(x);
  }

  // ------------------------------------------------------------------ 분포 곡선
  // 모델 결과의 분위수 9개: 2.5/5/10/25/50/75/90/95/97.5% (ranges는 화면용으로 겹침을 정리한 값, center = 중앙값)
  function quantileKnots(result) {
    var R = result.ranges;
    return [
      [0.025, R['0.95'][0]], [0.05, R['0.9'][0]], [0.10, R['0.8'][0]], [0.25, R['0.5'][0]], [0.5, result.center],
      [0.75, R['0.5'][1]], [0.90, R['0.8'][1]], [0.95, R['0.9'][1]], [0.975, R['0.95'][1]]
    ].map(function (k) { return { p: k[0], x: k[1] }; });
  }

  // 단조 3차 에르미트(Fritsch–Carlson, PCHIP). xs·ys 모두 엄격히 증가해야 한다. → {f, df}
  function pchip(xs, ys) {
    var n = xs.length, h = [], dl = [], m = new Array(n), i;
    for (i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; dl[i] = (ys[i + 1] - ys[i]) / h[i]; }
    for (i = 1; i < n - 1; i++) {
      var w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]);           // 가중 조화평균 (> 0)
    }
    function endSlope(h0, h1, d0, d1) {
      if (h1 == null) return d0;
      var e = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
      if (e <= 0) e = d0 * 0.5;
      if (e > 3 * d0) e = 3 * d0;
      return e;
    }
    m[0] = endSlope(h[0], h[1], dl[0], dl[1]);
    m[n - 1] = endSlope(h[n - 2], h[n - 3], dl[n - 2], dl[n - 3]);
    function seg(x) {
      var lo = 0, hi = n - 1;
      if (x <= xs[0]) return 0;
      if (x >= xs[n - 1]) return n - 2;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      return lo;
    }
    return {
      f: function (x) {
        var k = seg(x), hh = h[k], t = (x - xs[k]) / hh, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * hh * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * hh * m[k + 1];
      },
      df: function (x) {
        var k = seg(x), hh = h[k], t = (x - xs[k]) / hh, t2 = t * t;
        return ((6 * t2 - 6 * t) * ys[k] + (3 * t2 - 4 * t + 1) * hh * m[k] + (-6 * t2 + 6 * t) * ys[k + 1] + (3 * t2 - 2 * t) * hh * m[k + 1]) / hh;
      }
    };
  }

  /* 분위수 → 연속 분포 (모델은 그대로, 앱에서 계산).
   * 모델의 50/80/90/95% 범위는 수준마다 따로 보정(ACI)돼 있어서, 9개 분위수를 단조 3차 보간으로 그대로 이으면
   * 밀도가 10%·90% 근처에서 가짜 봉우리를 만든다(정확히 지나가면서 매끄럽고 봉우리 하나인 곡선은 이 숫자들로는 없음).
   * 그래서:
   *  1) 바탕 곡선 g: 분위수 사이 구간마다 그 확률을 고르게 펴고(2.5% 밖은 지수 꼬리), 폭 bw(= 0.15 × 사분위 범위)의
   *     정규 커널로 부드럽게 한 밀도. 적분 = 1, 봉우리 하나(봉우리 하나인 밀도 ⊗ 정규 커널).
   *     CDF G는 단조이고 주어진 분위수와 ±2.5%p 안에서 맞는다(화면 기본값).
   *  2) opts.exact = true면 단조 보정까지: H = (G(x_i) → p_i)를 지나는 PCHIP(0→0·1→1 포함), F = H∘G는
   *     분위수를 정확히 지나는 단조 CDF, 밀도 f = H'(G)·g. (대신 어깨에 작은 봉우리가 생길 수 있음)
   * 반올림 때문에 같은 x가 두 번 나오면 0.5씩 밀어서 엄격히 증가하게 만든다. */
  function densityFromQuantiles(knots, opts) {
    opts = opts || {};
    var xs = [], ps = [], i;
    for (i = 0; i < knots.length; i++) {
      var x = knots[i].x;
      if (i > 0 && !(x > xs[i - 1])) x = xs[i - 1] + 0.5;
      xs.push(x); ps.push(knots[i].p);
    }
    var n = xs.length, q25 = 0, q75 = 0;
    for (i = 0; i < n; i++) { if (Math.abs(ps[i] - 0.25) < 1e-9) q25 = xs[i]; if (Math.abs(ps[i] - 0.75) < 1e-9) q75 = xs[i]; }
    var bw = opts.bw || Math.max(1, 0.15 * ((q75 - q25) || (xs[n - 1] - xs[0]) / 3));
    var pL = ps[0], pR = 1 - ps[n - 1];
    var cL = (ps[1] - ps[0]) / (xs[1] - xs[0]), cR = (ps[n - 1] - ps[n - 2]) / (xs[n - 1] - xs[n - 2]);
    var kL = cL / pL, kR = cR / pR;   // 꼬리 밀도: 끝 구간 평균 밀도에서 시작해 지수로 줄어듦(꼬리 면적 = pL, pR)
    var s2 = bw * bw;
    // 구간별 밀도 높이(c) = 구간 평균, 꼬리 크기 = 끝 구간 평균
    var c = [], tL = cL, tR = cR;
    for (i = 0; i < n - 1; i++) c.push((ps[i + 1] - ps[i]) / (xs[i + 1] - xs[i]));
    function g(x) {
      var v = 0, j;
      for (j = 0; j < n - 1; j++) v += c[j] * (normCdf((x - xs[j]) / bw) - normCdf((x - xs[j + 1]) / bw));
      // 지수 꼬리 ⊗ 정규 커널 (닫힌 꼴)
      v += tL * Math.exp(kL * (x - xs[0]) + kL * kL * s2 / 2) * normCdf((-kL * s2 - (x - xs[0])) / bw);
      v += tR * Math.exp(-kR * (x - xs[n - 1]) + kR * kR * s2 / 2) * normCdf(((x - xs[n - 1]) - kR * s2) / bw);
      return v;
    }
    var a = xs[0] - 7 / kL - 5 * bw, b = xs[n - 1] + 7 / kR + 5 * bw, N = opts.grid || 900, grid = [];
    for (i = 0; i <= N; i++) grid.push(a + (b - a) * i / N);
    grid = grid.concat(xs).sort(function (u, v) { return u - v; });
    var gv, Gc, tot;
    function integrate() {
      gv = grid.map(g); Gc = [0];
      for (var q = 1; q < grid.length; q++) Gc.push(Gc[q - 1] + (gv[q] + gv[q - 1]) / 2 * (grid[q] - grid[q - 1]));
      tot = Gc[Gc.length - 1];
      for (q = 0; q < Gc.length; q++) Gc[q] /= tot;
    }
    integrate();
    function idx(x) {
      var lo = 0, hi = grid.length - 1;
      if (x <= grid[0]) return 0;
      if (x >= grid[hi]) return hi - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (grid[mid] <= x) lo = mid; else hi = mid; }
      return lo;
    }
    function G(x) {
      if (x <= grid[0]) return 0;
      if (x >= grid[grid.length - 1]) return 1;
      var k = idx(x), t = (x - grid[k]) / (grid[k + 1] - grid[k]);
      // 사다리꼴 적분과 맞물리는 2차 보간(밀도가 구간 안에서 선형이라고 볼 때)
      var g0 = gv[k], g1 = gv[k + 1], dx = grid[k + 1] - grid[k];
      return Gc[k] + (g0 * t + (g1 - g0) * t * t / 2) * dx / tot;
    }
    var gk = xs.map(G);
    var H = !opts.exact ? { f: function (v) { return v; }, df: function () { return 1; } } : pchip([0].concat(gk, [1]), [0].concat(ps, [1]));
    function cdf(x) { return Math.min(1, Math.max(0, H.f(G(x)))); }
    function pdf(x) { return Math.max(0, H.df(G(x))) * g(x) / tot; }
    function quantile(q) {
      var lo = grid[0], hi = grid[grid.length - 1];
      for (var it = 0; it < 70; it++) { var md = (lo + hi) / 2; if (cdf(md) < q) lo = md; else hi = md; }
      return (lo + hi) / 2;
    }
    function sample(x0, x1, count) {
      var out = [];
      for (var j = 0; j <= count; j++) { var xx = x0 + (x1 - x0) * j / count; out.push({ x: xx, y: pdf(xx) }); }
      return out;
    }
    return { xs: xs, ps: ps, bw: bw, smoothErr: gk.map(function (v, j) { return v - ps[j]; }), lo: grid[0], hi: grid[grid.length - 1], cdf: cdf, pdf: pdf, quantile: quantile, sample: sample };
  }

  // ------------------------------------------------------------------ 기록
  // 롤링 적중률: 각 날까지 최근 win일 중 key(in95/in80)가 참인 비율
  function rollingHit(history, win, key) {
    var out = [], s = 0;
    for (var i = 0; i < history.length; i++) {
      s += history[i][key] ? 1 : 0;
      if (i >= win) s -= history[i - win][key] ? 1 : 0;
      if (i >= win - 1) out.push({ date: history[i].date, rate: s / win });
    }
    return out;
  }

  // ------------------------------------------------------------------ 예측 달력
  /* 방향 일치: 오를 확률 > 50%면 '오름' 예상, < 50%면 '내림' 예상. 실제는 종가가 전날 종가보다 높으면 오름.
   * 50%였거나 종가가 같았던 날은 판단하지 않음(null) — model.js holdoutStats의 방향 적중률과 같은 기준. */
  function dirMatch(h) {
    if (!h || typeof h.pUp !== 'number' || h.pUp === 0.5 || !(h.actual > 0) || h.actual === h.prevClose) return null;
    return (h.pUp > 0.5) === (h.actual > h.prevClose);
  }
  // 하루 기록 h(+ 장중 고가·저가 hl=[high, low])를 달력 한 칸 정보로
  function calDay(h, hl) {
    var d = {
      date: h.date, prevClose: h.prevClose, center: h.center, pUp: typeof h.pUp === 'number' ? h.pUp : null,
      r80: [h.lo80, h.hi80], r95: [h.lo95, h.hi95], actual: h.actual,
      in80: !!h.in80, in95: !!h.in95, dir: dirMatch(h),
      err: h.actual - h.center, errPct: (h.actual / h.center - 1) * 100, chgPct: (h.actual / h.prevClose - 1) * 100,
      high: hl ? hl[0] : null, low: hl ? hl[1] : null
    };
    // 장중 움직임이 95% 범위 안에만 머물렀는지 (고가·저가가 있을 때)
    d.intraIn95 = hl ? (hl[1] >= h.lo95 && hl[0] <= h.hi95) : null;
    return d;
  }
  // 여러 날 성적: 범위 적중률(종가가 범위 안), 방향 일치율, 중심값 ±1% 이내 비율, 평균 오차(%)
  function calStats(days) {
    var n = days.length, in95 = 0, in80 = 0, dn = 0, dh = 0, near = 0, abs = 0;
    days.forEach(function (d) {
      if (d.in95) in95++; if (d.in80) in80++;
      if (d.dir !== null) { dn++; if (d.dir) dh++; }
      if (Math.abs(d.errPct) <= 1) near++;
      abs += Math.abs(d.errPct);
    });
    return {
      n: n, in95: in95, in80: in80, dirN: dn, dirHit: dh, near1: near,
      hit95: n ? in95 / n : null, hit80: n ? in80 / n : null, dirRate: dn ? dh / dn : null,
      nearRate: n ? near / n : null, mae: n ? abs / n : null
    };
  }
  // history → {byDate, months:[{ym, stats}]} (최근 달이 앞)
  function calendarData(history, hlMap, from) {
    var byDate = {}, byMonth = {};
    (history || []).forEach(function (h) {
      if (from && h.date < from) return;
      var d = calDay(h, hlMap && hlMap[h.date]);
      byDate[h.date] = d;
      (byMonth[h.date.slice(0, 7)] = byMonth[h.date.slice(0, 7)] || []).push(d);
    });
    var months = Object.keys(byMonth).sort().reverse().map(function (ym) { return { ym: ym, stats: calStats(byMonth[ym]) }; });
    var all = [];
    Object.keys(byDate).sort().forEach(function (k) { all.push(byDate[k]); });
    return { byDate: byDate, months: months, all: calStats(all), first: all.length ? all[0].date : null, last: all.length ? all[all.length - 1].date : null };
  }

  var Compute = {
    HISTORY_DAYS: HISTORY_DAYS, US_SYMS: US_SYMS, previewReason: previewReason, computeAll: computeAll,
    normCdf: normCdf, normPdf: normPdf, normInv: normInv,
    quantileKnots: quantileKnots, densityFromQuantiles: densityFromQuantiles, pchip: pchip, rollingHit: rollingHit,
    dirMatch: dirMatch, calDay: calDay, calStats: calStats, calendarData: calendarData
  };
  root.Compute = Compute;
  if (typeof module !== 'undefined' && module.exports) module.exports = Compute;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
