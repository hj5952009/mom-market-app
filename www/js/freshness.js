/* 자료 신선도 점검: 지표 11개가 '지금쯤 있어야 할 마지막 장'까지 들어왔는지 본다.
 * 시장마다 그 나라 시각·휴장일로 '마지막으로 끝난 장'을 계산해 받은 시세의 마지막 날짜와 비교한다.
 *  - fresh  : 최신
 *  - late   : 늦음 (있어야 할 날 자료가 없음) → 앱은 10분 뒤 다시 받고, 매일 점검(GitHub Actions)은 실패로 알림
 *  - lag1   : 하루 늦음이지만 허용 (유로스톡스50·환율은 Yahoo 일봉이 하루씩 빠지는 일이 있어 경고만)
 *  - cached : 이번에 받지 못해 저장된 값 사용
 * 앱(브라우저·Worker)과 node(점검 스크립트)에서 같이 쓴다. 모델 계산과는 무관. */
(function (root) {
  'use strict';
  var U = root.MCUtil || (typeof require === 'function' ? require('./util.js') : null);

  // 유렉스(유로스톡스50) 휴장일
  var EU_HOLIDAYS = {
    '2025-12-24': 1, '2025-12-25': 1, '2025-12-26': 1, '2025-12-31': 1,
    '2026-01-01': 1, '2026-04-03': 1, '2026-04-06': 1, '2026-05-01': 1, '2026-12-24': 1, '2026-12-25': 1, '2026-12-31': 1,
    '2027-01-01': 1, '2027-03-26': 1, '2027-03-29': 1, '2027-12-24': 1, '2027-12-31': 1
  };
  function weekday(d) { var w = U.dowOf(d); return w !== 0 && w !== 6; }
  // settle: 그 장 일봉이 확정됐다고 볼 현지 시각(분). tol: 허용하는 늦은 장 수.
  var MARKETS = {
    krx: { name: '한국', tz: 'Asia/Seoul', settle: 16 * 60 + 10, tol: 0, open: function (d) { return U.isTradingDay(d); } },
    us: { name: '미국', tz: 'America/New_York', settle: 16 * 60 + 30, tol: 0, open: function (d) { return weekday(d) && !U.US_HOLIDAYS[d]; } },
    eu: { name: '유럽', tz: 'Europe/Berlin', settle: 18 * 60, tol: 1, open: function (d) { return weekday(d) && !EU_HOLIDAYS[d]; } },
    // 환율 일봉은 런던 날짜 기준, 오늘 막대는 늘 진행 중 → 어제(평일)까지가 확정
    fx: { name: '외환', tz: 'Europe/London', settle: 24 * 60, tol: 1, open: function (d) { return weekday(d) && d.slice(5) !== '12-25' && d.slice(5) !== '01-01'; } }
  };
  var ITEMS = [
    ['^KS11', '코스피', 'krx'], ['^SOX', 'SOX(미국 반도체)', 'us'], ['^IXIC', '나스닥', 'us'], ['EWY', 'EWY(한국 ETF)', 'us'],
    ['MU', '마이크론', 'us'], ['^VIX', 'VIX(변동성)', 'us'], ['^TNX', '미국 10년물 금리', 'us'], ['HYG', 'HYG(하이일드)', 'us'],
    ['EEM', 'EEM(신흥국)', 'us'], ['^STOXX50E', '유로스톡스50', 'eu'], ['KRW=X', '원/달러 환율', 'fx']
  ];

  var fmts = {};
  function local(ms, tz) {
    var f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
    var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, min: (+p.hour % 24) * 60 + (+p.minute) };
  }
  // 지금 시각에 이미 끝나 일봉이 있어야 할 마지막 장 날짜
  function expectedLast(market, nowMs) {
    var M = MARKETS[market], L = local(nowMs, M.tz), d = L.date;
    if (M.open(d) && L.min >= M.settle) return d;
    d = U.addDays(d, -1);
    for (var i = 0; i < 15 && !M.open(d); i++) d = U.addDays(d, -1);
    return d;
  }
  // a < b 사이에 그 시장의 장이 몇 번 있었나 (a 다음 날 ~ b)
  function sessionsBetween(market, a, b) {
    var M = MARKETS[market], n = 0, d = U.addDays(a, 1);
    for (var i = 0; i < 40 && d <= b; i++, d = U.addDays(d, 1)) if (M.open(d)) n++;
    return n;
  }

  /* series: {symbol: {rows:[{d,c}]}}, opts: {fetchErrors, patched}
   * → {items:[{sym, name, market, last, value, prev, expected, behind, status, patched}], ok, late:[sym], summary} */
  function check(series, nowMs, opts) {
    opts = opts || {};
    var fe = opts.fetchErrors || {}, pt = opts.patched || {};
    var items = ITEMS.map(function (it) {
      var sym = it[0], rows = series && series[sym] && series[sym].rows, last = rows && rows.length ? rows[rows.length - 1] : null;
      var exp = expectedLast(it[2], nowMs);
      var behind = last ? sessionsBetween(it[2], last.d, exp) : 99;
      var status = !last ? 'late' : behind === 0 ? 'fresh' : behind <= MARKETS[it[2]].tol ? 'lag1' : 'late';
      if (fe[sym] && status !== 'late') status = 'cached';
      return {
        sym: sym, name: it[1], market: it[2], last: last ? last.d : null, value: last ? last.c : null,
        prev: rows && rows.length > 1 ? rows[rows.length - 2].c : null,
        expected: exp, behind: behind, status: status, patched: (pt[sym] || []).map(function (x) { return x.d; }), error: fe[sym] || null
      };
    });
    var late = items.filter(function (x) { return x.status === 'late'; }).map(function (x) { return x.sym; });
    var cached = items.filter(function (x) { return x.status === 'cached'; }).map(function (x) { return x.sym; });
    var nPatched = items.filter(function (x) { return x.patched.length; }).length;
    return { at: nowMs, items: items, ok: !late.length && !cached.length, late: late, cached: cached, nPatched: nPatched };
  }

  // 미국 장 마감(16:00 ET)이 한국 시각으로 언제인지 → {date, hour}
  function usCloseKst(usDate) {
    var t = Date.parse(usDate + 'T20:00:00Z');
    if (local(t, 'America/New_York').min !== 16 * 60) t += 3600e3;   // 서머타임이 아니면 21:00Z
    var k = local(t, 'Asia/Seoul');
    return { date: k.date, hour: Math.floor(k.min / 60) };
  }

  var Fresh = { usCloseKst: usCloseKst, MARKETS: MARKETS, ITEMS: ITEMS, EU_HOLIDAYS: EU_HOLIDAYS, local: local, expectedLast: expectedLast, sessionsBetween: sessionsBetween, check: check };
  root.Freshness = Fresh;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fresh;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
