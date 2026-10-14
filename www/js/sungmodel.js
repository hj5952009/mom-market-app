/* 성상현 관점 모델 (베타·실험) — 블로그 글의 증시 관점 점수를 날마다 지수로 만들고,
 * 기존 코스피 모델(model.js, 수정하지 않음)의 '오를 확률'에 더했을 때 예측이 나아지는지 그 전 자료로만 검증한다.
 *
 * 1) 글 점수: 글마다 앞으로 1~4주 증시에 대한 관점 stance(-2~+2)와 관련도 rel(0~2)을 미리 매겨 두었다(sung.json posts[].st).
 * 2) 관점 지수 S(D): 예측 대상일 D 아침 08:30(한국 시각) 전에 쓴 글만 쓴다. rel=2는 무게 1, rel=1은 0.5,
 *    오래된 글일수록 무게가 줄어든다(반감기 7일). S = 무게 평균 stance. 무게 합이 0.5보다 작으면 지수 없음.
 *    보조 지수 T(D): 같은 방식으로 글의 전체 톤(긍정 +1 / 중립 0 / 경계 -1)을 평균.
 * 3) 검증(워크포워드): 날마다 그 전 날들만으로 로지스틱 회귀를 다시 맞춘다.
 *      기준:   P(오름) = σ(a + b·logit(모델 오를 확률))           ← 모델 확률만 다시 보정
 *      +관점:  P(오름) = σ(a + b·logit(모델 오를 확률) + c·S)      ← 성상현 관점을 더함
 *    두 확률로 방향 적중률·브라이어 점수를 비교한다. 처음 MIN_TRAIN일은 학습만 한다.
 * 4) 지수와 그 뒤 1일·5일·20일 코스피 수익률의 상관도 본다(겹치는 구간은 유효 표본 수를 h로 나눠 t값 계산).
 * 브라우저·node 공용. 모델 수학(model.js)과 무관하다. */
(function (root) {
  'use strict';
  var HALF_LIFE = 7, CUTOFF = '08:30', MIN_W = 0.5, MIN_TRAIN = 120, L2 = 1.0;

  function dayNum(ds) { return Date.parse(ds.slice(0, 10) + 'T00:00:00Z') / 864e5; }
  // 'YYYY-MM-DD HH:MM'(한국 시각) → 일 단위 실수
  function tNum(dt) { return dayNum(dt) + ((+dt.slice(11, 13) || 0) * 60 + (+dt.slice(14, 16) || 0)) / 1440; }

  /* posts: [{d:'YYYY-MM-DD HH:MM', st:[stance, rel, kr], tone}], dates: ['YYYY-MM-DD'] (오름차순)
   * → {S:[...], T:[...], W:[...]} (지수 없으면 null) */
  function dailyIndex(posts, dates) {
    var P = posts.filter(function (p) { return p.st; }).map(function (p) {
      return { t: tNum(p.d), s: p.st[0], w: p.st[1] === 2 ? 1 : p.st[1] === 1 ? 0.5 : 0, tone: p.tone || 0, any: p.st[1] >= 0 };
    }).sort(function (a, b) { return a.t - b.t; });
    var lam = Math.LN2 / HALF_LIFE, cut = (+CUTOFF.slice(0, 2) * 60 + +CUTOFF.slice(3, 5)) / 1440;
    var S = [], T = [], W = [];
    dates.forEach(function (ds) {
      var t0 = dayNum(ds) + cut, sw = 0, ss = 0, tw = 0, ts = 0;
      for (var i = 0; i < P.length && P[i].t < t0; i++) {
        var age = t0 - P[i].t; if (age > 60) continue;
        var k = Math.exp(-lam * age);
        sw += P[i].w * k; ss += P[i].w * k * P[i].s;
        tw += k; ts += k * P[i].tone;
      }
      S.push(sw >= MIN_W ? ss / sw : null); T.push(tw >= MIN_W ? ts / tw : null); W.push(sw);
    });
    return { S: S, T: T, W: W };
  }

  // ------------------------------------------------------------ 로지스틱 회귀 (뉴턴법, 약한 L2, 절편 제외)
  function sig(z) { return 1 / (1 + Math.exp(-z)); }
  function logit(p) { p = Math.min(0.995, Math.max(0.005, p)); return Math.log(p / (1 - p)); }
  function solve(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (r = 0; r < n; r++) if (r !== c) { var f = M[r][c] / M[c][c]; for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map(function (r, i) { return r[n] / M[i][i]; });
  }
  function fitLogit(X, y) {
    var d = X[0].length, w = []; for (var j = 0; j < d; j++) w.push(0);
    for (var it = 0; it < 30; it++) {
      var g = w.map(function (v, j) { return j ? L2 * v : 0; }), H = [];
      for (j = 0; j < d; j++) { H.push([]); for (var k = 0; k < d; k++) H[j].push(j === k && j ? L2 : 0); }
      for (var i = 0; i < X.length; i++) {
        var z = 0; for (j = 0; j < d; j++) z += w[j] * X[i][j];
        var p = sig(z), r = p - y[i], q = p * (1 - p);
        for (j = 0; j < d; j++) { g[j] += r * X[i][j]; for (k = 0; k < d; k++) H[j][k] += q * X[i][j] * X[i][k]; }
      }
      var step = solve(H, g); if (!step) break;
      var mx = 0; for (j = 0; j < d; j++) { w[j] -= step[j]; mx = Math.max(mx, Math.abs(step[j])); }
      if (mx < 1e-8) break;
    }
    return w;
  }
  function pred(w, x) { var z = 0; for (var j = 0; j < w.length; j++) z += w[j] * x[j]; return sig(z); }

  // ------------------------------------------------------------ 검증
  function corrT(x, y, h) {
    var n = x.length; if (n < 10) return null;
    var mx = 0, my = 0, i; for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0; for (i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    var r = sxy / Math.sqrt(sxx * syy), ne = Math.max(3, n / (h || 1)), t = r * Math.sqrt((ne - 2) / Math.max(1e-12, 1 - r * r));
    return { r: r, n: n, nEff: Math.round(ne), t: t, p: pNorm(t) };
  }
  // 양측 p값(정규 근사)
  function pNorm(t) { var x = Math.abs(t) / Math.SQRT2, a = 1 / (1 + 0.3275911 * x); var e = a * (0.254829592 + a * (-0.284496736 + a * (1.421413741 + a * (-1.453152027 + a * 1.061405429)))) * Math.exp(-x * x); return e; }

  /* history: [{date, prevClose, actual, pUp, center}] (model.js 결과의 history, 오름차순), posts: sung.json posts
   * → 검증 결과 + 오늘 쓸 계수 */
  function evaluate(history, posts, opts) {
    opts = opts || {};
    var dates = history.map(function (h) { return h.date; });
    var ix = dailyIndex(posts, dates);
    var rows = [];
    history.forEach(function (h, i) {
      if (ix.S[i] == null || !(h.actual > 0) || typeof h.pUp !== 'number' || h.actual === h.prevClose) return;
      rows.push({ i: i, date: h.date, y: h.actual > h.prevClose ? 1 : 0, lp: logit(h.pUp), pUp: h.pUp, S: ix.S[i], T: ix.T[i] == null ? 0 : ix.T[i] });
    });
    var out = { base: [], plus: [], tone: [], days: [] };
    for (var k = MIN_TRAIN; k < rows.length; k++) {
      var tr = rows.slice(0, k), r = rows[k], y = tr.map(function (q) { return q.y; });
      var wb = fitLogit(tr.map(function (q) { return [1, q.lp]; }), y);
      var wp = fitLogit(tr.map(function (q) { return [1, q.lp, q.S]; }), y);
      var wt = fitLogit(tr.map(function (q) { return [1, q.lp, q.T]; }), y);
      out.base.push(pred(wb, [1, r.lp])); out.plus.push(pred(wp, [1, r.lp, r.S])); out.tone.push(pred(wt, [1, r.lp, r.T]));
      out.days.push(r);
    }
    function score(P) {
      var n = P.length, hit = 0, brier = 0, ll = 0;
      for (var j = 0; j < n; j++) {
        var yy = out.days[j].y, p = P[j];
        if ((p > 0.5) === (yy === 1)) hit++;
        brier += (p - yy) * (p - yy); ll -= yy ? Math.log(Math.max(1e-9, p)) : Math.log(Math.max(1e-9, 1 - p));
      }
      return { n: n, hit: n ? hit / n : null, brier: n ? brier / n : null, logloss: n ? ll / n : null };
    }
    var raw = { n: out.days.length, hit: 0 };
    out.days.forEach(function (d) { if ((d.pUp > 0.5) === (d.y === 1)) raw.hit++; }); raw.hit = raw.n ? raw.hit / raw.n : null;
    // 같은 날 두 예측이 갈린 날의 맞힘 수(부호 검정)
    var plusWins = 0, baseWins = 0;
    out.days.forEach(function (d, j) {
      var a = (out.base[j] > 0.5) === (d.y === 1), b = (out.plus[j] > 0.5) === (d.y === 1);
      if (b && !a) plusWins++; if (a && !b) baseWins++;
    });
    var disc = plusWins + baseWins, signZ = disc ? (plusWins - baseWins) / Math.sqrt(disc) : 0;
    // 지수와 앞으로의 코스피 수익률
    var fwd = function (h) {
      var xs = [], ys = [];
      history.forEach(function (q, i) {
        if (ix.S[i] == null || i + h - 1 >= history.length) return;
        var end = history[i + h - 1].actual; if (!(end > 0) || !(q.prevClose > 0)) return;
        xs.push(ix.S[i]); ys.push(Math.log(end / q.prevClose));
      });
      return corrT(xs, ys, h);
    };
    var resid = (function () {
      var xs = [], ys = [];
      history.forEach(function (q, i) { if (ix.S[i] == null || !(q.actual > 0) || !(q.center > 0)) return; xs.push(ix.S[i]); ys.push(Math.log(q.actual / q.center)); });
      return corrT(xs, ys, 1);
    })();
    // 오늘 쓸 계수: 모든 날로 다시 맞춤
    var all = rows, yA = all.map(function (q) { return q.y; });
    var wFinal = all.length > 20 ? fitLogit(all.map(function (q) { return [1, q.lp, q.S]; }), yA) : null;
    var wBase = all.length > 20 ? fitLogit(all.map(function (q) { return [1, q.lp]; }), yA) : null;
    var series = dates.map(function (d, i) { return [d, ix.S[i] == null ? null : Math.round(ix.S[i] * 1000) / 1000]; });
    return {
      params: { halfLife: HALF_LIFE, cutoff: CUTOFF, minTrain: MIN_TRAIN, l2: L2 },
      period: out.days.length ? [out.days[0].date, out.days[out.days.length - 1].date] : null,
      raw: raw, base: score(out.base), plus: score(out.plus), tone: score(out.tone),
      duel: { plusWins: plusWins, baseWins: baseWins, z: signZ, p: pNorm(signZ) },
      fwd1: fwd(1), fwd5: fwd(5), fwd20: fwd(20), resid: resid,
      coef: wFinal, coefBase: wBase, meanS: rows.length ? rows.reduce(function (a, q) { return a + q.S; }, 0) / rows.length : null, series: series
    };
  }

  // 오늘의 관점 지수와 '관점 반영' 오를 확률
  // pBase: 모델 확률만 다시 보정한 값(비교 기준), pPlus: 관점까지 더한 값 → 관점의 몫 = pPlus − pBase
  function today(posts, dateStr, pUp, coef, coefBase) {
    var ix = dailyIndex(posts, [dateStr]);
    var S = ix.S[0];
    return { S: S, weight: ix.W[0], pBase: coefBase ? pred(coefBase, [1, logit(pUp)]) : null, pPlus: S == null || !coef ? null : pred(coef, [1, logit(pUp), S]) };
  }

  var SungModel = { dailyIndex: dailyIndex, evaluate: evaluate, today: today, fitLogit: fitLogit, corrT: corrT, logit: logit, sig: sig, HALF_LIFE: HALF_LIFE, MIN_TRAIN: MIN_TRAIN };
  root.SungModel = SungModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = SungModel;
})(typeof window !== 'undefined' ? window : globalThis);
