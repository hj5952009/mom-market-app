/* 시세 이어 붙이기 (데이터 사용량 줄이기). 처음 한 번만 10년치를 받고, 그다음부터는 최근 1달치(range=1mo)를 받아
 * 저장된 시세 뒤에 날짜 기준으로 붙인다. 겹치는 날은 새 값이 이긴다.
 * 배당 등으로 수정종가(adjclose) 기준이 바뀌면(겹치는 날의 a/c 비율이 0.1% 넘게 다르면) 그 종목은 10년치를 다시 받는다.
 * 모델 수학과는 무관하다: 이어 붙인 결과가 10년치를 새로 받은 것과 같은 행이 되도록만 한다. */
(function (root) {
  'use strict';
  var ADJ_TOL = 0.001;
  var FULL_RANGE = '10y', INC_RANGE = '1mo';

  function addYears(ds, n) { return (+ds.slice(0, 4) + n) + ds.slice(4); }
  function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }

  // 저장된 시세가 있으면 1달치, 없거나 오래됐으면 10년치
  function rangeFor(cached, todayK) {
    var rows = cached && cached.rows;
    if (!rows || rows.length < 250) return FULL_RANGE;
    if (dayDiff(rows[rows.length - 1].d, todayK) > 20) return FULL_RANGE;
    return INC_RANGE;
  }

  // cached, fresh: parseChart 모양 {symbol, gmtoffset, tz, rows:[{d,c,a}], ...}
  // → {series, rebase}. rebase=true면 이 종목은 10년치를 다시 받아야 한다.
  function mergeIncremental(cached, fresh, todayK) {
    var old = cached && cached.rows, nw = fresh && fresh.rows;
    if (!nw || !nw.length) return { series: cached || null, rebase: false };
    if (!old || !old.length) return { series: fresh, rebase: false };
    var first = nw[0].d;
    if (old[old.length - 1].d < first) return { series: null, rebase: true, reason: 'gap' };   // 사이가 비면 이어 붙일 수 없음
    var om = {};
    for (var i = 0; i < old.length; i++) om[old[i].d] = old[i];
    var overlap = 0;
    for (var j = 0; j < nw.length; j++) {
      var o = om[nw[j].d], r = nw[j];
      if (!o) continue;
      overlap++;
      if (!(o.c > 0 && r.c > 0)) continue;
      var k = (r.a / r.c) / (o.a / o.c);
      if (Math.abs(k - 1) > ADJ_TOL) return { series: null, rebase: true, reason: 'adjclose' };
    }
    if (!overlap) return { series: null, rebase: true, reason: 'no-overlap' };
    var rows = old.filter(function (x) { return x.d < first; }).concat(nw);
    if (todayK) {   // 10년치를 새로 받았을 때와 같은 구간만 남김
      var from = addYears(todayK, -10);
      rows = rows.filter(function (x) { return x.d >= from; });
    }
    var out = {};
    for (var key in fresh) out[key] = fresh[key];
    out.rows = rows;
    return { series: out, rebase: false };
  }

  /* ------------------------------------------------------------ 빈 종가 메우기
   * Yahoo가 이미 끝난 날의 일봉 종가를 null로 내보낼 때가 있다
   * (실제 사례: 2026-10-14 오전, ^KS11의 10-13 막대가 통째로 null, EWY·MU·HYG·EEM의 10-13 종가도 null).
   * model.js는 null 막대를 버리므로 마지막 종가가 하루 전으로 밀리고, 앱은 '이미 지난 날 예측'을 계속 보여 준다.
   * 그래서 parseChart 전에 같은 Yahoo의 공식 값으로 채운다(모델 수학은 그대로).
   *   - 마지막으로 끝난 장(meta.regularMarketTime이 속한 날, 그 장이 지금 진행 중이 아닐 때) → meta.regularMarketPrice
   *   - 그 바로 앞 거래일 → range=1d 응답의 meta.chartPreviousClose (전 거래일 공식 종가)
   * 최근 LOOKBACK개 막대만 본다. 채운 값이 앞 종가와 30% 넘게 다르면 쓰지 않는다. */
  var LOOKBACK = 6, MAX_JUMP = 0.3;
  function num(x) { return typeof x === 'number' && isFinite(x); }
  function res0(j) { return j && j.chart && j.chart.result && j.chart.result[0]; }
  function dateFn(dateOf) { return dateOf || (root.KModel && root.KModel.barDate); }
  function liveFrom(meta, nowMs) {
    var reg = meta && meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
    if (reg && num(reg.start) && num(reg.end) && num(nowMs)) {
      var s = nowMs / 1000;
      if (s >= reg.start && s < reg.end) return reg.start;
    }
    return Infinity;
  }
  // → [{i, d}] 최근 막대 중 종가가 빈 것 (진행 중인 장의 막대는 제외)
  function nullCloses(j, nowMs, dateOf) {
    var r = res0(j); if (!r || !r.timestamp) return [];
    var bd = dateFn(dateOf), meta = r.meta || {}, off = num(meta.gmtoffset) ? meta.gmtoffset : 0, tz = meta.exchangeTimezoneName || null;
    var q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, close = q.close || [], ts = r.timestamp;
    var lf = liveFrom(meta, nowMs), out = [], seen = {};
    for (var i = ts.length - 1; i >= 0 && i >= ts.length - LOOKBACK; i--) {
      if (!num(ts[i]) || ts[i] >= lf) continue;
      var d = bd(ts[i], off, tz);
      if (num(close[i]) && close[i] > 0) { seen[d] = 1; continue; }
      if (!seen[d]) out.push({ i: i, d: d });
    }
    // 같은 날에 값이 있는 다른 막대가 있으면(겹친 막대) 메울 필요 없음
    return out.filter(function (x) { return !seen[x.d]; });
  }
  // ref: range=1d 응답의 meta (없으면 null). → [{d, c, src}] 채운 목록. j를 직접 고친다.
  function fillNullCloses(j, ref, nowMs, dateOf) {
    var r = res0(j); if (!r) return [];
    var miss = nullCloses(j, nowMs, dateOf); if (!miss.length) return [];
    var bd = dateFn(dateOf), meta = r.meta || {}, off = num(meta.gmtoffset) ? meta.gmtoffset : 0, tz = meta.exchangeTimezoneName || null;
    var ts = r.timestamp, ind = r.indicators = r.indicators || {};
    var q = (ind.quote && ind.quote[0]) || (ind.quote = [{}])[0];
    var close = q.close = q.close || [];
    var adjBox = ind.adjclose && ind.adjclose[0], adj = adjBox && adjBox.adjclose;
    // 날짜별 마지막 막대 위치와, 값이 있는 날짜 목록
    var dates = [];
    for (var i = 0; i < ts.length; i++) if (num(ts[i])) { var d = bd(ts[i], off, tz); if (dates[dates.length - 1] !== d) dates.push(d); }
    var lm = ref || meta, running = liveFrom(lm, nowMs) !== Infinity;
    var rmt = num(lm.regularMarketTime) ? lm.regularMarketTime : num(meta.regularMarketTime) ? meta.regularMarketTime : null;
    var rmtDate = rmt != null ? bd(rmt, off, tz) : null;
    var rmp = num(lm.regularMarketPrice) ? lm.regularMarketPrice : meta.regularMarketPrice;
    var prevDate = null;
    if (rmtDate) for (var k = dates.length - 1; k >= 0; k--) if (dates[k] < rmtDate) { prevDate = dates[k]; break; }
    var pc = ref && num(ref.chartPreviousClose) ? ref.chartPreviousClose : null;
    var done = [];
    miss.forEach(function (m) {
      var c = null, src = null;
      if (!running && m.d === rmtDate && num(rmp) && rmp > 0 && rmt >= ts[m.i]) { c = rmp; src = 'regularMarketPrice'; }
      else if (pc > 0 && m.d === prevDate) { c = pc; src = 'previousClose'; }
      if (c == null) return;
      // 앞쪽 값 있는 막대: 급변 확인과 수정종가 비율
      var p = -1; for (var t = m.i - 1; t >= 0; t--) if (num(close[t]) && close[t] > 0) { p = t; break; }
      if (p >= 0 && Math.abs(c / close[p] - 1) > MAX_JUMP) return;
      var ratio = p >= 0 && adj && num(adj[p]) && adj[p] > 0 ? adj[p] / close[p] : 1;
      close[m.i] = c;
      if (adj) adj[m.i] = c * ratio;
      done.push({ d: m.d, c: c, src: src });
    });
    return done;
  }

  /* ------------------------------------------------------------ 코스피 장중 고가·저가 (예측 달력용)
   * 모델은 종가만 쓰므로 고가·저가는 따로 모아 둔다. {d: [high, low]} */
  function extractHL(j, nowMs, dateOf) {
    var r = res0(j), out = {}; if (!r || !r.timestamp) return out;
    var bd = dateFn(dateOf), meta = r.meta || {}, off = num(meta.gmtoffset) ? meta.gmtoffset : 0, tz = meta.exchangeTimezoneName || null;
    var q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, hi = q.high || [], lo = q.low || [], ts = r.timestamp;
    var lf = liveFrom(meta, nowMs);
    for (var i = 0; i < ts.length; i++) {
      if (!num(ts[i]) || ts[i] >= lf) continue;
      if (num(hi[i]) && num(lo[i]) && hi[i] > 0 && lo[i] > 0 && hi[i] >= lo[i]) out[bd(ts[i], off, tz)] = [Math.round(hi[i] * 100) / 100, Math.round(lo[i] * 100) / 100];
    }
    return out;
  }
  function mergeHL(old, fresh, keepFrom) {
    var out = {}, k;
    for (k in (old || {})) if (!keepFrom || k >= keepFrom) out[k] = old[k];
    for (k in (fresh || {})) if (!keepFrom || k >= keepFrom) out[k] = fresh[k];
    return out;
  }

  var Series = {
    rangeFor: rangeFor, mergeIncremental: mergeIncremental, FULL_RANGE: FULL_RANGE, INC_RANGE: INC_RANGE, ADJ_TOL: ADJ_TOL,
    nullCloses: nullCloses, fillNullCloses: fillNullCloses, extractHL: extractHL, mergeHL: mergeHL
  };
  root.Series = Series;
  if (typeof module !== 'undefined' && module.exports) module.exports = Series;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
