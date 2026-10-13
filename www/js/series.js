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

  var Series = { rangeFor: rangeFor, mergeIncremental: mergeIncremental, FULL_RANGE: FULL_RANGE, INC_RANGE: INC_RANGE, ADJ_TOL: ADJ_TOL };
  root.Series = Series;
  if (typeof module !== 'undefined' && module.exports) module.exports = Series;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
