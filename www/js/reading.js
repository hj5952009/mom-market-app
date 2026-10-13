/* 오늘 화면·성적표의 문구와 규칙 (순수 함수).
 * 원천: specs/stocks1_daily_reading.md, specs/stats2_probability_ux.md, specs/stocks3_guardrails.md,
 *       DECISIONS.md(우선). 숫자는 모두 KModel.run() 결과 또는 스펙이 계산해 둔 값만 쓴다. */
(function (root) {
  'use strict';
  var U = root.MCUtil || (typeof require !== 'undefined' ? require('./util.js') : null);

  // stocks1 1-1 구간별 실측(2025-01-02~2026-10-13, 431거래일) — "자세히" 화면 근거 줄에만 쓴다.
  var DIR_STATS = {
    3: { n: 103, hit: 87 },
    2: { n: 60, hit: 44 },
    1: { n: 82, hit: 50 },
    0: { n: 186, hit: 101 }
  };
  var DIR_STATS_PERIOD = '2025년 1월~2026년 10월 13일 검증 기준';
  var VOL_CUT = { high: 6, veryHigh: 10 };   // 95% 폭(%) — stocks1 1-2
  var BIG_MOVE_PCT = 3;                       // stocks1 4-3
  var WIDE_W95 = 15;                          // stocks3 1.7

  // ------------------------------------------------------------------ 방향
  // stocks1: 50 쪽으로 자른 정수 퍼센트
  function upPctOf(p) { return p >= 0.5 ? Math.floor(p * 100 + 1e-9) : Math.ceil(p * 100 - 1e-9); }
  // stats2 1.3: 10번 중 N번 (50% 쪽으로 버림, 1~9)
  function upOutOf10(p) {
    var q = Math.round(p * 1000) / 1000, d = q - 0.5;
    var n = 5 + Math.sign(d) * Math.floor(Math.abs(d) * 10 + 1e-9);
    return Math.min(9, Math.max(1, n));
  }
  function dirOf(p) {
    var upPct = upPctOf(p), dir = 'flat', strength = 0;
    if (upPct >= 60) { dir = 'up'; strength = upPct >= 70 ? 3 : upPct >= 65 ? 2 : 1; }
    if (upPct <= 40) { dir = 'down'; strength = upPct <= 30 ? 3 : upPct <= 35 ? 2 : 1; }
    return { upPct: upPct, downPct: 100 - upPct, dir: dir, strength: strength };
  }
  var HEAD = {
    up: { 1: '오를 가능성이 조금 더 높아요', 2: '오를 가능성이 높은 편이에요', 3: '오를 가능성이 꽤 높아요' },
    down: { 1: '내릴 가능성이 조금 더 높아요', 2: '내릴 가능성이 높은 편이에요', 3: '내릴 가능성이 꽤 높아요' }
  };
  // DECISIONS: 60~64 → 6번, 65~69 → 7번, 70 이상 → 8번 (내릴 쪽 대칭)
  var HIT_WORD = { 1: '6번', 2: '7번', 3: '8번' };

  function dayWordOf(targetDate, todayK) {
    var n = U.dayDiff(todayK, targetDate);
    return n === 0 ? '오늘' : n === 1 ? '내일' : n < 0 ? '지난 장' : '다음 장';
  }
  // 검증 기간 길이 말 (DECISIONS 예: "지난 1년 반")
  function periodLabel(fromDate, toDate) {
    var months = Math.round(U.dayDiff(fromDate, toDate) / 30.44);
    if (months < 12) return '지난 ' + Math.max(1, months) + '개월';
    var y = Math.floor(months / 12), rest = months - y * 12;
    if (rest >= 4 && rest <= 9) return '지난 ' + y + '년 반';
    return '지난 ' + (rest > 9 ? y + 1 : y) + '년';
  }

  /**
   * 판정 카드 (ux1 카드 A + stocks1 헤드라인 + stats2 아이콘 + DECISIONS 맞힌 비율 줄)
   * ctx: {isFinal, dayWord, periodLabel, stale}
   */
  function verdict(r, ctx) {
    ctx = ctx || {};
    var d = dirOf(r.pUp), N = upOutOf10(r.pUp);
    var dayWord = ctx.dayWord || '오늘';
    var chip = d.dir === 'up' ? { cls: 'up', sym: '▲', text: '오를 쪽' }
      : d.dir === 'down' ? { cls: 'down', sym: '▼', text: '내릴 쪽' } : { cls: 'flat', sym: '◆', text: '반반' };
    var headline = d.dir === 'flat' ? dayWord + '은 방향을 알기 어려워요' : HEAD[d.dir][d.strength];
    var probLine = d.dir === 'down'
      ? '내릴 확률 ' + d.downPct + '% (10번 중 ' + (10 - N) + '번)'
      : '오를 확률 ' + d.upPct + '% (10번 중 ' + N + '번)';
    var other = Math.min(N, 10 - N);
    var iconSub = N === 5 ? '오늘 같은 날이 10번 있다면 5번쯤 오르고 5번쯤 내렸어요'
      : '그래도 10번 중 ' + other + '번은 반대로 갈 수 있어요';
    var hitLine;
    if (ctx.isFinal === false) hitLine = '미국 장이 끝난 뒤 아침에 다시 계산해요. 지금은 미리 보기예요.';
    else if (d.dir === 'flat') hitLine = '오를지 내릴지는 반반에 가까워요(방향은 알기 어려워요).';
    else hitLine = '이런 날 예측은 ' + (ctx.periodLabel || '지난 1년 반') + ' 동안 10번 중 ' + HIT_WORD[d.strength] + ' 정도 맞았어요.';
    if (ctx.stale === 'expired') headline = dayWord === '오늘' ? '오늘 예상을 아직 못 받아왔어요' : '새 예상을 아직 못 받아왔어요';
    return {
      dir: d.dir, strength: d.strength, upPct: d.upPct, downPct: d.downPct, N: N,
      chip: chip, headline: headline, probLine: probLine, iconSub: iconSub,
      iconAria: '오늘 같은 날 10번 중 ' + N + '번 오르고 ' + (10 - N) + '번 내림',
      hitLine: ctx.stale === 'expired' ? null : hitLine
    };
  }

  // ------------------------------------------------------------------ 범위
  // stats2 2.2: 오늘 종가 ±S% 고정 눈금, 넘치면 넓힘
  function scaleS(close, lo95, hi95) {
    var half = Math.max(Math.abs(lo95 / close - 1), Math.abs(hi95 / close - 1)) * 100 + 0.5;
    var steps = [10, 15, 20, 30, 50];
    for (var i = 0; i < steps.length; i++) if (half <= steps[i]) return steps[i];
    return Math.ceil(half / 10) * 10;
  }
  function xPct(v, close, S) { return 50 + (v / close - 1) * 100 * 50 / S; }

  function recentMedW95(history) {
    if (!history || history.length < 20) return null;
    return U.median(history.slice(-20).map(function (h) { return (h.hi95 - h.lo95) / h.prevClose * 100; }));
  }

  /**
   * 범위 카드 (ux1 카드 B, stats2 막대 기하, stocks1 출렁임·넓어진 이유, stocks3 1.7)
   * ctx: {baseWord('어제'|'오늘'|날짜), dayWord, prev(result.yesterday), prevWord, recentMedW95}
   */
  function rangeView(r, ctx) {
    ctx = ctx || {};
    var base = r.baseClose, R80 = r.ranges['0.8'], R95 = r.ranges['0.95'];
    var lo80 = R80[0], hi80 = R80[1], lo95 = R95[0], hi95 = R95[1];
    var pct = function (x) { return U.signPct(U.pctOf(x, base)); };
    var w95 = (hi95 - lo95) / base * 100;
    var vol = w95 >= VOL_CUT.veryHigh ? 'very_high' : w95 >= VOL_CUT.high ? 'high' : 'normal';
    var volBadge = { normal: '출렁임 평소', high: '출렁임 큼', very_high: '출렁임 매우 큼' }[vol];
    var volExplain = { normal: '하루 오르내림이 보통 수준이에요.', high: '평소보다 오르내림이 클 수 있어요.', very_high: '하루에도 크게 오르내릴 수 있어요.' }[vol];
    var volCompare = null;
    if (vol !== 'normal' && ctx.recentMedW95) {
      var q = w95 / ctx.recentMedW95;
      if (q >= 1.3) volCompare = '요즘보다도 범위가 넓은 날이에요.';
      if (q <= 0.77) volCompare = '그래도 요즘보다는 조금 잔잔한 편이에요.';
    }
    var dayWord = ctx.dayWord || '오늘', prevWord = ctx.prevWord || '어제';
    var noteLine = null, noteMore = null;
    var p = ctx.prev;
    if (p && U.isNum(p.actual)) {
      var move = (p.actual / p.prevClose - 1) * 100;
      if (p.actual < p.lo95 || p.actual > p.hi95) {
        noteLine = prevWord + ' 예상보다 크게 움직여서, ' + dayWord + '은 범위를 넓게 잡았어요.';
        noteMore = '예상이 빗나간 다음 날엔 앱이 일부러 범위를 넓혀 조심해요. 그러다 맞는 날이 이어지면 조금씩 다시 좁혀요. 범위가 넓다는 건 "크게 떨어진다"는 뜻이 아니라 "어느 쪽으로든 크게 움직일 수 있다"는 뜻이에요.';
      } else if (Math.abs(move) >= BIG_MOVE_PCT) {
        noteLine = prevWord + ' ' + U.signPct(move) + ' 크게 움직여서 ' + dayWord + ' 범위도 넓어요.';
        noteMore = '크게 움직인 다음 날은 대개 출렁임도 커요. 그래서 범위를 넓게 잡았어요. 넓은 범위는 어느 쪽으로든 움직일 수 있다는 뜻이에요.';
      }
    }
    var wideLine = w95 >= WIDE_W95 ? dayWord + '은 범위가 평소보다 넓어요. 그만큼 앞일을 내다보기 어려운 날이에요.' : null;
    var S = scaleS(base, lo95, hi95);
    var x = function (v) { return xPct(v, base, S); };
    return {
      base: base, center: r.center, lo80: lo80, hi80: hi80, lo95: lo95, hi95: hi95,
      s: { center: U.fmt10(r.center), lo80: U.fmt10(lo80), hi80: U.fmt10(hi80), lo95: U.fmt10(lo95), hi95: U.fmt10(hi95), base: U.fmtInt(base) },
      pct: { center: pct(r.center), lo80: pct(lo80), hi80: pct(hi80), lo95: pct(lo95), hi95: pct(hi95) },
      w95: w95, vol: vol, volBadge: volBadge, volExplain: volExplain, volCompare: volCompare,
      noteLine: noteLine, noteMore: noteMore, wideLine: wideLine,
      S: S, scaleNote: S !== 10 ? '범위가 아주 넓어서 눈금을 ±' + S + '%로 넓혔어요.' : null,
      geo: { lo95: x(lo95), hi95: x(hi95), lo80: x(lo80), hi80: x(hi80), center: x(r.center), base: 50 },
      aria: '10번 중 8번은 ' + U.fmt10(lo80) + '에서 ' + U.fmt10(hi80) + ' 사이에서 끝났어요. 가장 가운데 값은 ' + U.fmt10(r.center) + '. ' + (ctx.baseWord || '어제') + ' 마감은 ' + U.fmtInt(base) + '.'
    };
  }

  // stats2 2.3 라벨 겹침 규칙: 가운데 정렬 → [0,W] 안으로 → 간격 gap 미만이면 중점 기준으로 벌림
  function placeLabels(xs, widths, W, gap) {
    gap = gap == null ? 8 : gap;
    var L = xs.map(function (x, i) { return Math.min(Math.max(x - widths[i] / 2, 0), W - widths[i]); });
    if (L.length === 2) {
      var space = L[1] - (L[0] + widths[0]);
      if (space < gap) {
        var need = (gap - space) / 2;
        L[0] = L[0] - need; L[1] = L[1] + need;
        if (L[0] < 0) { L[1] += -L[0]; L[0] = 0; }
        if (L[1] + widths[1] > W) { var o = L[1] + widths[1] - W; L[1] -= o; L[0] = Math.max(0, L[0] - o); }
      }
    }
    return L;
  }

  // ------------------------------------------------------------------ 어제 예상 (stocks1 3장)
  function yesterdayCheck(rec, ctx) {
    ctx = ctx || {};
    var fmt = U.fmtInt, actual = rec.actual, verdict, big, small;
    if (actual >= rec.lo80 && actual <= rec.hi80) {
      verdict = 'IN80'; big = '예상 범위 안이었어요';
      small = '예상 ' + fmt(rec.lo80) + '~' + fmt(rec.hi80) + ', 실제 마감 ' + fmt(actual);
    } else if (actual >= rec.lo95 && actual <= rec.hi95) {
      verdict = 'IN95'; big = '넓은 범위 안이었어요';
      small = '대부분 범위(' + fmt(rec.lo80) + '~' + fmt(rec.hi80) + ')는 조금 벗어났지만, 넓게 잡은 범위(' + fmt(rec.lo95) + '~' + fmt(rec.hi95) + ') 안에서 끝났어요. 실제 마감 ' + fmt(actual);
    } else {
      var up = actual > rec.hi95, gap = Math.round(up ? actual - rec.hi95 : rec.lo95 - actual);
      verdict = 'OUT'; big = '이번엔 예상을 벗어났어요';
      small = '넓게 잡은 범위(' + fmt(rec.lo95) + '~' + fmt(rec.hi95) + ')보다 ' + gap + '포인트 더 ' + (up ? '올랐' : '내렸') + '어요. 실제 마감 ' + fmt(actual) + '.';
      if (ctx.N && ctx.miss != null) small += ' 이런 날은 20번에 1번쯤 있어요(지난 ' + ctx.N + '일 중 ' + ctx.miss + '일).';
      else small += ' 이런 날은 20번에 1번쯤 있어요.';
    }
    var dirLine = null;
    if (rec.pUp != null) {
      var d = dirOf(rec.pUp);
      if (d.dir !== 'flat' && actual !== rec.prevClose) {
        var ok = (d.dir === 'up') === (actual > rec.prevClose);
        dirLine = (d.dir === 'up' ? '오를' : '내릴') + ' 거라는 쪽' + (ok ? '도 맞았어요.' : '은 틀렸어요.');
      }
    }
    return { verdict: verdict, big: big, small: small, dirLine: dirLine };
  }

  function recentSummary(history, n) {
    n = n || 20;
    if (!history || history.length < n) return null;
    var last = history.slice(-n);
    return {
      n: n, k80: last.filter(function (h) { return h.in80; }).length, k95: last.filter(function (h) { return h.in95; }).length,
      first: last[0].date, last: last[last.length - 1].date
    };
  }

  // ------------------------------------------------------------------ 자체 점검 (stats2 4.1)
  function selfCheck(history, state, todayK) {
    state = Object.assign({ showing: false, since: null }, state || {});
    var last = (history || []).filter(function (h) { return h.actual != null; }).slice(-60);
    state.n = last.length;
    if (last.length < 60) { state.miss95 = null; return state; }
    var miss95 = last.filter(function (h) { return !h.in95; }).length;
    state.miss95 = miss95;
    var since = state.since;
    var shownDays = since ? history.filter(function (h) { return h.date > since; }).length : 0;
    if (!state.showing && miss95 >= 9) { state.showing = true; state.since = todayK; }
    else if (state.showing && miss95 <= 6 && shownDays >= 5) { state.showing = false; }
    var l120 = history.slice(-120);
    state.devFlagTooWide = l120.length === 120 && l120.every(function (h) { return h.in95; });
    var m80 = last.filter(function (h) { return !h.in80; }).length;
    state.devFlag80 = (60 - m80) <= 39;
    return state;
  }

  // ------------------------------------------------------------------ 안전장치 카드 (stocks3)
  function tierCounts(t) { var hits = Math.round(t.hit * t.n); return { n: t.n, hits: hits, miss: t.n - hits }; }
  function freqWord(share) { var k = Math.round(1 / share); return k <= 1 ? '거의 매일' : k + '일에 1번꼴'; }

  var GUARD_TEXT = {
    panic: {
      title: '어제 시장이 많이 내렸어요',
      body: '크게 내린 다음 날, 시장은 다시 오르기도 하고 더 내리기도 했어요. 지난 기록에서 39번 중 23번은 오르고 16번은 내렸어요. 놀란 날 바로 정하기보다 하루쯤 지켜본 뒤에 생각해도 늦지 않을 때가 많아요.'
    },
    chase: {
      title: '어제 시장이 많이 올랐어요',
      body: '크게 오른 다음 날에도 시장은 오르기도 하고 내리기도 했어요. 지난 기록에서 34번 중 19번은 오르고 15번은 내렸어요. 오른 값을 보고 바로 사기보다, 원래 사려던 계획이 있었는지 한 번 떠올려 보면 좋아요.'
    },
    overtrade: {
      title: '이번 주에 자주 보셨네요',
      body: '예측은 매일 나오지만, 매일 사고팔 필요는 없어요. 거래할 때마다 수수료와 세금이 나가요. 이 앱이 자신 없는 날(오를 확률 40~60%)은 맞힌 비율이 {flatHit}% 정도로, 동전 던지기와 거의 같아요.'
    }
  };
  // 오늘 화면용: 우선순위 panic(3) > chase(4) > overtrust(5). 한 화면 1개, 알겠어요 누른 날은 채워 넣지 않음.
  // input: {kospiRet1, kospiRet5, holdingDrop:{name,pct}|null, upPct, isFinal, stats, marketWord}
  // gs: {dismissedOn:{home:'YYYY-MM-DD'}, shows:{id:[dates]}}
  function guardHome(input, gs, todayK) {
    gs = gs || {};
    if (gs.dismissedOn && gs.dismissedOn.home === todayK) return null;
    var shows = gs.shows || {};
    var within7 = function (id) {
      return (shows[id] || []).filter(function (d) { return d !== todayK && U.dayDiff(d, todayK) < 7; }).length;
    };
    var cands = [];
    var drop = input.holdingDrop;
    if ((U.isNum(input.kospiRet1) && input.kospiRet1 <= -3) || drop) cands.push('panic');
    if ((U.isNum(input.kospiRet1) && input.kospiRet1 >= 3) || (U.isNum(input.kospiRet5) && input.kospiRet5 >= 8)) cands.push('chase');
    if (input.isFinal !== false && (input.upPct >= 65 || input.upPct <= 35) && input.stats && input.stats.dirTiers) cands.push('overtrust');
    for (var i = 0; i < cands.length; i++) {
      var id = cands[i];
      if ((id === 'panic' || id === 'chase') && within7(id) >= 2 && (shows[id] || []).indexOf(todayK) < 0) continue;
      var w = input.marketWord || '어제';
      if (id === 'panic') {
        var t = GUARD_TEXT.panic.title.replace('어제', w);
        if (!(U.isNum(input.kospiRet1) && input.kospiRet1 <= -3) && drop) t = '갖고 계신 종목이 많이 내렸어요';
        return { id: id, title: t, body: GUARD_TEXT.panic.body };
      }
      if (id === 'chase') return { id: id, title: GUARD_TEXT.chase.title.replace('어제', w), body: GUARD_TEXT.chase.body };
      if (id === 'overtrust') {
        var tiers = input.stats.dirTiers, strong = input.upPct >= 70 || input.upPct <= 30;
        var t70 = tierCounts(tiers[2]), t65 = tierCounts(tiers[1]);
        var first = strong
          ? '이렇게 자신 있는 날은 지난 기록에서 ' + freqWord(tiers[2].share) + '이었고, ' + t70.n + '번 중 ' + t70.hits + '번 맞고 ' + t70.miss + '번 틀렸어요.'
          : '이런 날은 지난 기록에서 ' + t65.n + '번 중 ' + t65.hits + '번 맞고 ' + t65.miss + '번 틀렸어요.';
        return { id: id, title: '오늘은 앱이 비교적 자신 있는 날이에요', body: first + ' 맞힌 날이 많아도, 틀린 날 손해가 클 수 있어요. 한 번에 모두 정하지 않아도 괜찮아요.' };
      }
    }
    return null;
  }

  // 40~60% 구간 방향 적중(%) — dirTiers와 dirHit 누적값에서 역산 (stocks3 부록과 같은 방법)
  function flatBandHit(stats) {
    if (!stats || !stats.dirTiers) return null;
    var allHits = Math.round(stats.dirHit * stats.dirN), t60 = stats.dirTiers[0], h60 = Math.round(t60.hit * t60.n);
    var n = stats.dirN - t60.n;
    return n > 0 ? { n: n, hits: allHits - h60, pct: Math.round((allHits - h60) / n * 100) } : null;
  }

  // 성적표 화면용 안전장치 (stocks3 1.5 신용·미수 → 1.2 과잉매매). 한 화면 1개.
  function guardRecord(r, gs, todayK, openDays) {
    gs = gs || {};
    if (gs.dismissedOn && gs.dismissedOn.record === todayK) return null;
    var shows = gs.shows || {};
    var lastMargin = (shows.margin || []).slice(-1)[0];
    if (!lastMargin || lastMargin === todayK || U.dayDiff(lastMargin, todayK) >= 30) {
      var lo = r.ranges['0.95'][0];
      return {
        id: 'margin', title: '빌린 돈으로 사는 건 더 조심스러워요',
        body: '증권사에서 빌린 돈(신용·미수)으로 산 주식은 값이 많이 떨어지면 증권사가 대신 팔아 버릴 수 있어요(반대매매). 지금 범위의 아래쪽 끝(' + U.fmt10(lo) + ', 기준 종가보다 ' + U.signPct(U.pctOf(lo, r.baseClose)) + ')까지 떨어져도 괜찮은 돈인지 먼저 생각해 보면 좋아요.'
      };
    }
    var recent = (openDays || []).filter(function (d) { return U.dayDiff(d, todayK) < 7; });
    var lastOver = (shows.overtrade || []).slice(-1)[0];
    if (recent.length >= 5 && (!lastOver || lastOver === todayK || U.dayDiff(lastOver, todayK) >= 7)) {
      var fb = flatBandHit(r.stats);
      return { id: 'overtrade', title: GUARD_TEXT.overtrade.title, body: GUARD_TEXT.overtrade.body.replace('{flatHit}', fb ? fb.pct : 54) };
    }
    return null;
  }

  // 레버리지·인버스 (stocks3 1.4)
  var LEV_WORDS = ['레버리지', '인버스', '곱버스', '2X', '3X', '선물인버스', 'LEVERAGE', 'INVERSE', 'BULL', 'BEAR'];
  function isLeveraged(item) {
    if (item.type === 'etf_lev') return true;
    var n = String(item.name || '').toUpperCase();
    return LEV_WORDS.some(function (w) { return n.indexOf(w.toUpperCase()) >= 0; });
  }
  function leverageCard(item, r) {
    var L = item.leverage || (/인버스/.test(item.name) ? (/2X/i.test(item.name) ? -2 : -1) : 2);
    var a = U.pctOf(r.ranges['0.95'][0], r.baseClose) * L, b = U.pctOf(r.ranges['0.95'][1], r.baseClose) * L;
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var how = L === 2 ? '코스피가 1% 움직이면 약 2% 움직이도록 만들어졌어요'
      : L === -1 ? '코스피가 1% 오르면 약 1% 내리도록(반대로) 만들어졌어요'
        : '코스피가 1% 오르면 약 2% 내리도록(반대로 두 배) 만들어졌어요';
    return {
      id: 'leverage', title: Math.abs(L) === 2 ? '이 상품은 하루에 두 배로 움직여요' : '이 상품은 코스피와 반대로 움직여요',
      body: '이 상품은 ' + how + '. 지금 앱의 범위로 계산하면 이 상품은 하루에 ' + U.signPct(lo) + ' ~ ' + U.signPct(hi) + '까지 움직일 수 있어요. 오래 갖고 있으면 코스피가 제자리여도 값이 줄어들 수 있어요.'
    };
  }

  // ------------------------------------------------------------------ SOX 시나리오 (ux1 S4)
  var SCEN_WORDS = [
    { arrow: '↓↓', text: '많이 내리면', range: '−3%보다 더' },
    { arrow: '↓', text: '조금 내리면', range: '−3%~−1%' },
    { arrow: '→', text: '비슷하면', range: '−1%~+1%' },
    { arrow: '↑', text: '조금 오르면', range: '+1%~+3%' },
    { arrow: '↑↑', text: '많이 오르면', range: '+3%보다 더' }
  ];
  function scenarioRows(r) {
    return (r.scenarios || []).map(function (s, i) {
      var w = SCEN_WORDS[i] || { arrow: '', text: s.label, range: '' };
      if (!s.n || s.pUp == null) return { arrow: w.arrow, text: w.text, range: w.range, empty: true };
      var up = upPctOf(s.pUp);
      return { arrow: w.arrow, text: w.text, range: w.range, upPct: up, n10: upOutOf10(s.pUp), lo80: U.fmt10(s.r80[0]), hi80: U.fmt10(s.r80[1]) };
    });
  }

  // ------------------------------------------------------------------ 자세히 (stocks1 2-5, DECISIONS 반올림)
  function detailMore(r, ctx) {
    ctx = ctx || {};
    var d = dirOf(r.pUp), rv = rangeView(r, ctx), st = DIR_STATS[d.strength];
    var bw = ctx.baseWord || '어제';
    var out = [];
    out.push(d.dir === 'down' ? '내릴 확률 ' + d.downPct + '%' : '오를 확률 ' + d.upPct + '%' + (d.dir === 'flat' ? ' — 50%에 가까워서 어느 쪽인지 말하기 어려워요.' : ''));
    out.push(bw + ' 마감 ' + U.fmtInt(r.baseClose) + '보다 ' + rv.pct.center + ' 정도인 ' + rv.s.center + ' 근처가 범위의 한가운데예요.');
    out.push('10번 중 8번은 ' + rv.s.lo80 + '~' + rv.s.hi80 + ' 안에서 끝났어요. (' + bw + ' 마감보다 ' + rv.pct.lo80 + '~' + rv.pct.hi80 + ')');
    out.push('크게 움직여도 20번 중 19번은 ' + rv.s.lo95 + '~' + rv.s.hi95 + ' 안이었어요. 그래도 한 달에 한 번쯤은 이 밖으로 벗어나요.');
    out.push([rv.volExplain, rv.volCompare].filter(Boolean).join(' '));
    if (rv.noteMore) out.push(rv.noteMore);
    if (ctx.isFinal !== false) {
      out.push(d.dir === 'flat'
        ? '방향을 알기 어려운 날이 ' + st.n + '번 있었고, 그중 ' + st.hit + '번 맞았어요 — 거의 동전 던지기 수준이에요. (' + DIR_STATS_PERIOD + ')'
        : '이 정도 확률이었던 날이 ' + st.n + '번 있었고, 그중 ' + st.hit + '번 방향이 맞았어요. (' + DIR_STATS_PERIOD + ')');
    }
    out.push('이 앱은 지난 자료로 계산한 통계예요. 사고팔지를 정해 드리지 않아요.');
    return out;
  }

  // ------------------------------------------------------------------ 성적표 (stats2 3장)
  function maxStreak(arr, pred) {
    var best = 0, cur = 0, end = -1, bestEnd = -1;
    for (var i = 0; i < arr.length; i++) {
      if (pred(arr[i])) { cur++; end = i; if (cur > best) { best = cur; bestEnd = end; } } else cur = 0;
    }
    return { len: best, from: best ? arr[bestEnd - best + 1].date : null, to: best ? arr[bestEnd].date : null };
  }
  function recordStats(r) {
    var st = r.stats || {}, hist = r.history || [];
    var from = st.from || '2025-01-01';
    var hold = hist.filter(function (h) { return h.date >= from && h.actual != null; });
    var N = st.holdoutN || hold.length, miss = st.miss95 != null ? st.miss95 : hold.filter(function (h) { return !h.in95; }).length;
    var in80n = st.cov80 != null ? Math.round(st.cov80 * N) : hold.filter(function (h) { return h.in80; }).length;
    var missDays = hold.filter(function (h) { return !h.in95; }).map(function (h) {
      var up = h.actual > h.hi95;
      return { date: h.date, actual: h.actual, lo95: h.lo95, hi95: h.hi95, up: up, gap: Math.round(up ? h.actual - h.hi95 : h.lo95 - h.actual) };
    }).reverse();
    var months = {};
    hold.forEach(function (h) {
      var k = h.date.slice(0, 7), m = months[k] || (months[k] = { month: k, n: 0, in80: 0, in95: 0 });
      m.n++; if (h.in80) m.in80++; if (h.in95) m.in95++;
    });
    var monthly = Object.keys(months).sort().reverse().map(function (k) { return months[k]; });
    var near1 = hold.filter(function (h) { return Math.abs(h.actual - h.center) <= 0.01 * h.center; }).length;
    var s95 = maxStreak(hold, function (h) { return !h.in95; }), s80 = maxStreak(hold, function (h) { return !h.in80; });
    var dirWrong = maxStreak(hold.filter(function (h) { return h.actual !== h.prevClose; }), function (h) {
      var predUp = h.pUp != null ? h.pUp > 0.5 : h.center > h.prevClose;
      return predUp !== (h.actual > h.prevClose);
    });
    var tiers = [];
    if (st.dirTiers) {
      tiers.push({ label: '모든 날', n: st.dirN, hit: st.dirHit, share: 1 });
      var names = ['오를 확률 60% 이상 또는 40% 이하', '65% 이상 또는 35% 이하', '70% 이상 또는 30% 이하'];
      st.dirTiers.forEach(function (t, i) { tiers.push({ label: names[i], n: t.n, hit: t.hit, share: t.share }); });
    }
    return {
      from: from, firstDate: hold.length ? hold[0].date : null, lastDate: hold.length ? hold[hold.length - 1].date : null,
      N: N, miss95: miss, in95n: N - miss, cov95: st.cov95, in80n: in80n, cov80: st.cov80, miss80: N - in80n,
      histN: hold.length, missDays: missDays, missUp: missDays.filter(function (m) { return m.up; }).length,
      missDown: missDays.filter(function (m) { return !m.up; }).length,
      monthly: monthly, near1: near1, near1Share: hold.length ? near1 / hold.length : null,
      streak95: s95, streak80: s80, dirWrong: dirWrong, tiers: tiers, flatBand: flatBandHit(st),
      width95pct: st.width95pct
    };
  }

  var Reading = {
    DIR_STATS: DIR_STATS, VOL_CUT: VOL_CUT, GUARD_TEXT: GUARD_TEXT,
    upPctOf: upPctOf, upOutOf10: upOutOf10, dirOf: dirOf, dayWordOf: dayWordOf, periodLabel: periodLabel,
    verdict: verdict, scaleS: scaleS, xPct: xPct, recentMedW95: recentMedW95, rangeView: rangeView, placeLabels: placeLabels,
    yesterdayCheck: yesterdayCheck, recentSummary: recentSummary, selfCheck: selfCheck,
    guardHome: guardHome, guardRecord: guardRecord, isLeveraged: isLeveraged, leverageCard: leverageCard, flatBandHit: flatBandHit,
    scenarioRows: scenarioRows, detailMore: detailMore, recordStats: recordStats, maxStreak: maxStreak
  };
  root.Reading = Reading;
  if (typeof module !== 'undefined' && module.exports) module.exports = Reading;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
