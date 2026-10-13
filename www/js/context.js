/* 요즘 시장 이야기 카드 — specs/macro2_context_glossary.md §1, §4 (계산 MC.compute 그대로 + 문장 만들기).
 * 시세 데이터만 쓴다. R.kospi / R.usdkrw / R.tnx / R.vix ({d,c} 오름차순). */
(function (root) {
  'use strict';
  var U = root.MCUtil || (typeof require !== 'undefined' ? require('./util.js') : null);

  var MC = (function () {
    var addDays = function (ds, n) { var t = new Date(ds + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    var addMonths = function (ds, n) { var t = new Date(ds + 'T00:00:00Z'); var day = t.getUTCDate(); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + n); var last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(day, last)); return t.toISOString().slice(0, 10); };
    var idxOnOrBefore = function (rows, ds) { var lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { var m = (lo + hi) >> 1; if (rows[m].d <= ds) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
    var median = function (a) { if (!a.length) return NaN; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    var mean = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
    var sd = function (a) { var m = mean(a); return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1)); };
    var pct = function (a, b) { return (a / b - 1) * 100; };

    function kospiBlock(K) {
      var n = K.length, D = K[n - 1].d, C = K[n - 1].c;
      var at = function (ds) { var i = idxOnOrBefore(K, ds); return i >= 0 ? K[i] : null; };
      var w = at(addDays(D, -7)), m = at(addMonths(D, -1)), y0 = at(addDays(D.slice(0, 4) + '-01-01', -1));
      var tradingDaysThisYear = K.filter(function (r) { return r.d.indexOf(D.slice(0, 4)) === 0; }).length;
      var tenY = K.filter(function (r) { return r.d >= addMonths(D, -120); });
      var hi = tenY.reduce(function (b, r) { return r.c > b.c ? r : b; }, tenY[0]);
      var lr = [], sr = [], i;
      for (i = 1; i < n; i++) { lr.push(Math.log(K[i].c / K[i - 1].c)); sr.push(K[i].c / K[i - 1].c - 1); }
      // RV20/MAR20을 미끄럼 합으로 (스펙 식과 같은 값, 10년치에서 빠르게)
      var rv = [], mar = [];
      for (i = 20; i <= lr.length; i++) { rv.push(sd(lr.slice(i - 20, i))); mar.push(mean(sr.slice(i - 20, i).map(Math.abs))); }
      var rvWin = rv.slice(-1260), marWin = mar.slice(-1260);
      var enough = rvWin.length >= 250;
      var volRatio = enough ? rv[rv.length - 1] / median(rvWin) : null;
      var lastR = sr[sr.length - 1];
      var sr5y = sr.slice(-1260);
      // 작년 한 해 (올해 거래일 5일 미만일 때)
      var yPrev = at(addDays(String(+D.slice(0, 4) - 1) + '-01-01', -1));
      return {
        D: D, close: C, lastRetPct: lastR * 100, lastRetPts: C - K[n - 2].c,
        chg1w: w ? pct(C, w.c) : null, chg1m: m ? pct(C, m.c) : null,
        chgYtd: (y0 && tradingDaysThisYear >= 5) ? pct(C, y0.c) : null,
        chgLastYear: (tradingDaysThisYear < 5 && y0 && yPrev) ? pct(y0.c, yPrev.c) : null,
        high10y: hi.c, high10yDate: hi.d, ddHigh: pct(C, hi.c),
        volRatio: volRatio, volYears: Math.round(rvWin.length / 252),
        mar20Pct: mar[mar.length - 1] * 100,
        mar20Pts: Math.round(mar[mar.length - 1] * C / 10) * 10,
        marUsualPct: enough ? median(marWin) * 100 : null,
        bigDays20: sr.slice(-20).filter(function (x) { return Math.abs(x) >= 0.03; }).length,
        k5: sr5y.filter(function (x) { return Math.abs(x) >= Math.abs(lastR); }).length
      };
    }
    function fxBlock(F, D) {
      var i = idxOnOrBefore(F, D); if (i < 0) return null;
      var win = F.slice(Math.max(0, i - 251), i + 1).map(function (r) { return r.c; });
      var fx = F[i].c, avg = mean(win), wi = idxOnOrBefore(F, addDays(F[i].d, -7)), w = wi >= 0 ? F[wi] : null;
      return { fx: fx, fxAvg1y: avg, fxDiff: pct(fx, avg), isHi1y: fx >= Math.max.apply(null, win), isLo1y: fx <= Math.min.apply(null, win), fxChg1w: w ? pct(fx, w.c) : null, asOf: F[i].d };
    }
    function rateBlock(T, D) {
      var norm = function (v) { return v > 20 ? v / 10 : v; };
      var i = idxOnOrBefore(T, D); if (i < 0) return null;
      var y = norm(T[i].c), j = idxOnOrBefore(T, addMonths(T[i].d, -1));
      var tenY = T.filter(function (r) { return r.d >= addMonths(T[i].d, -120) && r.d <= T[i].d; }).map(function (r) { return norm(r.c); });
      return { y: y, yChg1m: j >= 0 ? y - norm(T[j].c) : null, yPct10y: tenY.filter(function (v) { return v <= y; }).length / tenY.length * 100, asOf: T[i].d };
    }
    function vixBlock(V, D) { var i = idxOnOrBefore(V, D); return i < 0 ? null : { v: V[i].c, asOf: V[i].d }; }
    var volLevel = function (r) { return r == null ? null : r < 0.8 ? 'calm' : r < 1.3 ? 'normal' : r < 1.75 ? 'elevated' : r < 2.5 ? 'high' : 'extreme'; };
    var volMultipleLabel = function (r) { var L = volLevel(r); if (L === 'elevated') return '1.5배'; if (L === 'high') return '2배'; if (L === 'extreme') return Math.max(3, Math.round(r)) + '배'; return null; };
    function pickHeadline(k, fx) {
      var L = volLevel(k.volRatio);
      if (Math.abs(k.lastRetPct) >= 5) return 'bigday';
      if (k.chg1w != null && Math.abs(k.chg1w) >= 7) return 'bigweek';
      if (L === 'high' || L === 'extreme') return 'vol';
      if (k.ddHigh <= -20) return 'farFromHigh';
      if (k.ddHigh >= -3) return 'nearHigh';
      if (fx && Math.abs(fx.fxDiff) >= 5) return 'fx';
      if (L === 'calm') return 'calm';
      return 'default';
    }
    function compute(o) {
      var k = kospiBlock(o.kospi);
      var f = o.usdkrw ? fxBlock(o.usdkrw, k.D) : null;
      var t = o.tnx ? rateBlock(o.tnx, k.D) : null;
      var v = o.vix ? vixBlock(o.vix, k.D) : null;
      return { kospi: k, fx: f, rate: t, vix: v, volLevel: volLevel(k.volRatio), volMultiple: volMultipleLabel(k.volRatio), headlineId: pickHeadline(k, f) };
    }
    function afterBigDrop(K, threshold, years) {
      threshold = threshold == null ? -0.04 : threshold; years = years || 10;
      var from = addMonths(K[K.length - 1].d, -12 * years);
      var sr = [], i; for (i = 1; i < K.length; i++) if (K[i].d >= from) sr.push(K[i].c / K[i - 1].c - 1);
      var ev = []; for (i = 0; i < sr.length - 1; i++) if (sr[i] <= threshold) ev.push(sr[i + 1]);
      if (ev.length < 10) return null;
      var up = ev.filter(function (x) { return x > 0; }).length;
      return {
        n: ev.length, up: up, upPct: Math.round(up / ev.length * 100),
        again: ev.filter(function (x) { return x <= threshold; }).length, worstNextPct: Math.min.apply(null, ev) * 100,
        baseUpPct: Math.round(sr.filter(function (x) { return x > 0; }).length / sr.length * 100), years: years
      };
    }
    return { compute: compute, afterBigDrop: afterBigDrop, volLevel: volLevel, volMultipleLabel: volMultipleLabel, addDays: addDays };
  })();

  // ------------------------------------------------------------------ 문장 (macro2 §4 templates)
  var VOL_ORDER = ['calm', 'normal', 'elevated', 'high', 'extreme'];
  var VOL_TEXT = {
    calm: '요즘 코스피는 평소보다 잔잔하게 움직이고 있어요.',
    normal: '요즘 코스피의 출렁임은 평소와 비슷해요.',
    elevated: '요즘 코스피는 평소보다 조금 크게, 1.5배 정도 출렁이고 있어요.',
    high: '요즘 코스피는 평소의 2배 정도로 크게 출렁이고 있어요.',
    extreme: '요즘 코스피는 평소의 {N}배 정도로 아주 크게 출렁이고 있어요.'
  };
  var BANDS = { '1w': { flat: 1, small: 3, mid: 7 }, '1m': { flat: 2, small: 5, mid: 10 }, ytd: { flat: 3, small: 10, mid: 20 } };
  function periodWord(chg, band) {
    var b = BANDS[band], a = Math.abs(chg);
    if (a < b.flat) return '거의 제자리였어요';
    var size = a < b.small ? 'small' : a < b.mid ? 'mid' : 'big';
    var W = { up: { small: '조금 올랐어요', mid: '꽤 올랐어요', big: '크게 올랐어요' }, down: { small: '조금 내렸어요', mid: '꽤 내렸어요', big: '크게 내렸어요' } };
    return W[chg >= 0 ? 'up' : 'down'][size];
  }
  function volText(level, ratio) { return VOL_TEXT[level].replace('{N}', String(Math.max(3, Math.round(ratio)))); }
  function fxLevel(diff) { return diff <= -5 ? 'fx_much_low' : diff <= -2 ? 'fx_low' : diff < 2 ? 'fx_flat' : diff < 5 ? 'fx_high' : 'fx_much_high'; }
  function fxText(f) {
    var fx = U.fmtInt(f.fx), avg = U.fmtInt(f.fxAvg1y), d = U.signPct(f.fxDiff);
    return {
      fx_much_low: '원/달러 환율은 ' + fx + '원으로, 지난 1년 평균(' + avg + '원)보다 꽤 낮아요(' + d + ').',
      fx_low: '원/달러 환율은 ' + fx + '원으로, 지난 1년 평균(' + avg + '원)보다 조금 낮아요(' + d + ').',
      fx_flat: '원/달러 환율은 ' + fx + '원으로, 지난 1년 평균(' + avg + '원)과 비슷해요.',
      fx_high: '원/달러 환율은 ' + fx + '원으로, 지난 1년 평균(' + avg + '원)보다 조금 높아요(' + d + ').',
      fx_much_high: '원/달러 환율은 ' + fx + '원으로, 지난 1년 평균(' + avg + '원)보다 꽤 높아요(' + d + ').'
    }[fxLevel(f.fxDiff)];
  }
  function dowWord(ds) { return U.DOW[U.dowOf(ds)]; }

  function headlineOf(c) {
    var k = c.kospi, id = c.headlineId, text, sub = null;
    var CTX = '이럴 때는 하루 숫자만 보기보다 한 달·1년 흐름을 함께 보면 전체 그림이 잘 보여요.';
    if (id === 'bigday') {
      text = U.fmtDateLong(k.D).replace(' (', '(') + ' 코스피가 하루에 ' + Math.abs(k.lastRetPct).toFixed(1) + '% ' + (k.lastRetPct >= 0 ? '올랐' : '떨어졌') + '어요. 최근 5년 동안 이만큼 움직인 날은 ' + k.k5 + '번 있었어요.';
      sub = CTX;
    } else if (id === 'bigweek') {
      text = '코스피가 지난 한 주 동안 ' + Math.abs(k.chg1w).toFixed(1) + '% ' + (k.chg1w >= 0 ? '올랐' : '내렸') + '어요.'; sub = CTX;
    } else if (id === 'vol') {
      text = volText(c.volLevel, k.volRatio); sub = CTX;
    } else if (id === 'farFromHigh') {
      text = '코스피는 ' + U.fmtDateMD(k.high10yDate) + '의 최고치(' + U.fmtInt(k.high10y) + ')보다 ' + Math.abs(k.ddHigh).toFixed(1) + '% 낮은 곳에 있어요.';
      if (k.chgYtd != null) sub = '올해 들어서는 ' + periodWord(k.chgYtd, 'ytd') + '(' + U.signPct(k.chgYtd) + ').';
    } else if (id === 'nearHigh') {
      text = '코스피가 최근 10년 중 가장 높은 수준 근처에 있어요.'; sub = '높은 곳에서는 작은 소식에도 크게 움직일 수 있어요.';
    } else if (id === 'fx') {
      text = fxText(c.fx);
    } else if (id === 'calm') {
      text = VOL_TEXT.calm;
    } else {
      text = '지난 한 주 코스피는 ' + periodWord(k.chg1w || 0, '1w') + '(' + U.signPct(k.chg1w || 0) + '). 출렁임은 평소와 비슷해요.';
    }
    return { id: id, text: text, sub: sub };
  }

  // 주간 고정 (macro2 §1.5). lock: {weekKey, id, text, sub, date, volLevel}
  function isoWeekKey(ds) {
    var d = new Date(ds + 'T00:00:00Z'), day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    var firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    var week = 1 + Math.round(((d - firstThu) / 864e5 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return d.getUTCFullYear() + '-W' + (week < 10 ? '0' : '') + week;
  }
  function lockedHeadline(c, lock) {
    var fresh = headlineOf(c), wk = isoWeekKey(c.kospi.D);
    var volJump = lock && lock.volLevel && c.volLevel && Math.abs(VOL_ORDER.indexOf(lock.volLevel) - VOL_ORDER.indexOf(c.volLevel)) >= 2;
    var newBig = fresh.id === 'bigday' && (!lock || lock.id !== 'bigday' || lock.date !== c.kospi.D);
    if (!lock || lock.weekKey !== wk || newBig || volJump) {
      return { headline: fresh, lock: { weekKey: wk, id: fresh.id, text: fresh.text, sub: fresh.sub, date: c.kospi.D, volLevel: c.volLevel }, locked: false };
    }
    return { headline: { id: lock.id, text: lock.text, sub: lock.sub }, lock: lock, locked: lock.date !== c.kospi.D, lockedDate: lock.date };
  }

  // 숫자 행 (§1.6) + 펼침 긴 문장 (§1.3)
  function rows(c) {
    var k = c.kospi, out = [];
    var per = [];
    if (k.chg1w != null) per.push({ k: '1주', v: k.chg1w });
    if (k.chg1m != null) per.push({ k: '1달', v: k.chg1m });
    if (k.chgYtd != null) per.push({ k: '올해', v: k.chgYtd });
    else if (k.chgLastYear != null) per.push({ k: '작년', v: k.chgLastYear });
    var long = [];
    if (k.chg1w != null) long.push('지난 한 주 동안 코스피는 ' + periodWord(k.chg1w, '1w') + '(' + U.signPct(k.chg1w) + ').');
    if (k.chg1m != null) long.push('지난 한 달 동안 코스피는 ' + periodWord(k.chg1m, '1m') + '(' + U.signPct(k.chg1m) + ').');
    if (k.chgYtd != null) long.push('올해 들어 코스피는 ' + periodWord(k.chgYtd, 'ytd') + '(' + U.signPct(k.chgYtd) + ').');
    else if (k.chgLastYear != null) long.push('작년 한 해 코스피는 ' + periodWord(k.chgLastYear, 'ytd') + '(' + U.signPct(k.chgLastYear) + ').');
    if (k.ddHigh >= -3) long.push('최근 10년 중 가장 높은 수준 근처예요.');
    else if (k.ddHigh <= -10) long.push(U.fmtDateFull(k.high10yDate).replace(/ \(.\)$/, '') + '에 기록한 최근 10년 최고치(' + U.fmtInt(k.high10y) + ')보다 ' + Math.abs(k.ddHigh).toFixed(1) + '% 낮은 곳에 있어요.');
    out.push({ id: 'kospi', term: 'kospi', label: '코스피', value: U.fmtInt(k.close), periods: per, high: { value: U.fmtInt(k.high10y), date: k.high10yDate, dd: k.ddHigh }, long: long });

    if (c.volLevel) {
      var vl = [volText(c.volLevel, k.volRatio)];
      if (['elevated', 'high', 'extreme'].indexOf(c.volLevel) >= 0 && k.marUsualPct != null)
        vl.push('요즘은 하루에 보통 ±' + k.mar20Pct.toFixed(1) + '%(약 ' + U.fmtInt(k.mar20Pts) + '포인트)씩 움직여요. 평소엔 ±' + k.marUsualPct.toFixed(1) + '% 정도였어요.');
      if (k.bigDays20 >= 3) vl.push('최근 한 달(20거래일) 동안 3% 넘게 움직인 날이 ' + k.bigDays20 + '번 있었어요.');
      if (['high', 'extreme'].indexOf(c.volLevel) >= 0) vl.push("이렇게 출렁임이 클 때는 앱의 '내일 범위'도 그만큼 넓어져요.");
      out.push({
        id: 'vol', term: 'volatility', label: '출렁임',
        value: c.volMultiple ? '평소의 약 ' + c.volMultiple : { calm: '평소보다 잔잔', normal: '평소와 비슷' }[c.volLevel],
        long: vl, info: "'평소'는 최근 " + (k.volYears >= 5 ? 5 : Math.max(1, k.volYears)) + "년 동안의 보통 수준(가운데 값)이에요. '출렁임'은 최근 20거래일 동안 하루 등락이 얼마나 컸는지를 잰 거예요."
      });
    }
    if (c.fx) {
      var f = c.fx, lv = fxLevel(f.fxDiff), fl = [fxText(f)];
      if (lv === 'fx_high' || lv === 'fx_much_high') fl.push('달러가 비싸고 원화 값은 낮아졌다는 뜻이에요.');
      if (lv === 'fx_low' || lv === 'fx_much_low') fl.push('원화 값이 올라 달러가 싸졌다는 뜻이에요.');
      if (f.isHi1y) fl.push('지난 1년 중 가장 높은 수준이에요.');
      else if (f.isLo1y) fl.push('지난 1년 중 가장 낮은 수준이에요.');
      if (f.fxChg1w != null && Math.abs(f.fxChg1w) >= 2) fl.push('지난 한 주 동안 ' + U.signPct(f.fxChg1w) + ' 움직여 평소보다 빠르게 변했어요.');
      var fxWord = { fx_much_low: '1년 평균보다 꽤 낮음', fx_low: '1년 평균보다 조금 낮음', fx_flat: '1년 평균과 비슷', fx_high: '1년 평균보다 조금 높음', fx_much_high: '1년 평균보다 꽤 높음' }[lv];
      out.push({ id: 'fx', term: 'fx', label: '환율', value: U.fmtInt(f.fx) + '원 · ' + fxWord, long: fl, info: "'1년 평균'은 최근 252거래일 종가의 평균이에요." });
    }
    if (c.rate) {
      var t = c.rate, y = t.y.toFixed(2);
      var rl = [t.yPct10y >= 80 ? '미국 10년 국채 금리는 ' + y + '%로, 지난 10년 중 높은 편이에요.' : t.yPct10y >= 20 ? '미국 10년 국채 금리는 ' + y + '%로, 지난 10년 중 중간쯤이에요.' : '미국 10년 국채 금리는 ' + y + '%로, 지난 10년 중 낮은 편이에요.'];
      if (t.yChg1m != null && t.yChg1m >= 0.25) rl.push('한 달 새 ' + t.yChg1m.toFixed(2) + '%p 올랐어요. 금리가 빠르게 오르면 주식에는 부담이 되는 경우가 많아요.');
      if (t.yChg1m != null && t.yChg1m <= -0.25) rl.push('한 달 새 ' + Math.abs(t.yChg1m).toFixed(2) + '%p 내렸어요.');
      out.push({ id: 'rate', term: 'govbond', label: '미국 금리', value: y + '% · 10년 중 ' + (t.yPct10y >= 80 ? '높은 편' : t.yPct10y >= 20 ? '중간쯤' : '낮은 편'), long: rl, info: "'지난 10년 중'은 최근 10년 동안의 금리 가운데 지금이 어디쯤인지를 본 거예요." });
    }
    if (c.vix) {
      var v = c.vix.v, vs = v.toFixed(1);
      var vt = v < 15 ? '미국 불안지수는 ' + vs + '로, 투자자들이 차분한 편이에요.' : v < 20 ? '미국 불안지수는 ' + vs + '로, 보통 수준이에요.' : v < 30 ? '미국 불안지수는 ' + vs + '로, 불안해하는 사람이 늘어난 상태예요.' : '미국 불안지수는 ' + vs + '로, 불안이 아주 큰 상태예요.';
      out.push({ id: 'vix', term: 'vix', label: '불안지수', value: vs + ' · ' + (v < 15 ? '차분한 편' : v < 20 ? '보통' : v < 30 ? '불안한 편' : '매우 불안'), long: [vt], info: '20 아래면 차분, 30 위면 불안이 큰 상태로 흔히 봐요.' });
    }
    return out;
  }

  // ------------------------------------------------------------------ 상식 카드 고르기 (§6 rotation)
  function pickTip(c, todayK, firstWeek, lastShown) {
    var k = c && c.kospi, f = c && c.fx;
    var trig = [];
    if (firstWeek) trig.push('tip_overnight_us');
    if (f && (Math.abs(f.fxDiff) >= 5 || (f.fxChg1w != null && Math.abs(f.fxChg1w) >= 2))) trig.push('tip_fx_foreigners');
    if (k && k.lastRetPct <= -4) trig.push('tip_after_big_drop');
    if (k && (Math.abs(k.lastRetPts) >= 200 || Math.abs(k.lastRetPct) >= 3)) trig.push('tip_points_vs_percent');
    var order = ['tip_overnight_us', 'tip_fx_foreigners', 'tip_after_big_drop', 'tip_points_vs_percent', 'tip_semiconductor'];
    trig.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    lastShown = lastShown || {};
    for (var i = 0; i < trig.length; i++) {
      var last = lastShown[trig[i]];
      if (!last || last === todayK || U.dayDiff(last, todayK) >= 3) return trig[i];
    }
    var wk = +isoWeekKey(todayK).slice(-2);
    return order[wk % 5];
  }

  var Context = { MC: MC, headlineOf: headlineOf, lockedHeadline: lockedHeadline, rows: rows, periodWord: periodWord, isoWeekKey: isoWeekKey, pickTip: pickTip, fxLevel: fxLevel };
  root.Context = Context;
  if (typeof module !== 'undefined' && module.exports) module.exports = Context;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
