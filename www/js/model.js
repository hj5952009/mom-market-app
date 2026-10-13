/*
 * 엄마의 시장 나침반 — KOSPI 다음 거래일 범위 모델 (브라우저 포팅판)
 * --------------------------------------------------------------------
 * Port of ref/kospi_range_model.js (FINAL2 config) to a dependency-free
 * classic <script>. Everything is attached to `window.KModel`
 * (and `module.exports` under Node, for tests).
 *
 * Math is identical to the reference (same operation order, so results are
 * bit-for-bit equal on identical inputs — see test/model.test.js parity test):
 *   - features: ndx, sox, vix(log chg), ewyx, k1, usdkrw, hyg, eem, stoxx, mu, tnx(diff)
 *     foreign changes accumulate every session dated in [prev KOSPI day, KOSPI day)
 *   - mean: ridge WLS, decay 0.998, lambda 0.3, features clipped at 5 sd
 *   - vol: regress log|err| on 0.5*log of EWMA(0.94/0.80/0.98) of err^2, decay 0.99
 *   - ranges: last 500 standardized errors, empirical quantiles, ACI gamma 0.05
 *   - minTrain 500, smMin 150, zMin 200, records from 2019-10-01
 *
 * Deviations from the reference (all documented in DEVIATIONS below).
 *
 * Public API (see bottom of file):
 *   KModel.fetchAll(httpGet, opts)  -> Promise<{[symbol]: series}>
 *   KModel.run(rawByTicker, opts)   -> result object
 *   KModel.forecastMixture(...), KModel.forecastWithOvernight(...) (low level)
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';

  var DEVIATIONS = [
    'Only the 11 tickers the model uses are loaded. The reference skips a KOSPI day if ANY of its 24 foreign ' +
      'tickers has no bar before it; here only the 10 used foreign tickers are checked. With 10y Yahoo history ' +
      'this only affects the first few rows of 2016 (weight 0.998^2500 ~ 0.7%), so WF output is effectively identical.',
    'Bar dates: reference uses the CURRENT meta.gmtoffset for every bar. Here, bars whose local time is within ' +
      '90 min of midnight (FX: KRW=X) are dated with Intl in meta.exchangeTimezoneName, so DST changes cannot ' +
      'shift FX bars by one day. Identical to the reference while the current DST state matches the bar (e.g. Oct).',
    'In-progress bars (now inside meta.currentTradingPeriod.regular and bar ts >= its start) are dropped, so a ' +
      'half-finished KOSPI/US/FX session is never treated as a close.',
    'Overnight path: reference uses all foreign bars dated < lastKospiDate+1 calendar day. Here the cutoff is ' +
      'max(lastKospiDate+1, today in KST), so a weekend or Korean holiday after the last KOSPI day still picks ' +
      'up every completed US session (same rule the WF features use for the next KOSPI day).',
    'Mixture scenarios also report p_up (share of the bucket mixture > 0) and n; empty buckets return nulls ' +
      'instead of NaN.',
    'A missing/short foreign ticker is treated as a 0 feature (flagged in meta.missing) instead of failing.',
    'Display nesting: ACI keeps a separate alpha per level, so in the reference the 90% band sometimes pokes ' +
      'outside the 95% band (and rarely 80% outside 90%). run() widens each outer band to contain the inner ones ' +
      '(ranges, scenarios, history/yesterday bounds and their in80/in95 flags). The raw reference bands are kept in ' +
      'rangesRaw, and stats.cov* are computed on the raw bands exactly as the reference; stats.shown.cov* use the ' +
      'displayed (nested) bands. ACI updates always use the raw bands.'
  ];

  // key -> Yahoo symbol
  var TICKERS = {
    kospi: '^KS11', ewy: 'EWY', sox: '^SOX', ndx: '^IXIC', vix: '^VIX', mu: 'MU',
    usdkrw: 'KRW=X', hyg: 'HYG', eem: 'EEM', stoxx: '^STOXX50E', tnx: '^TNX'
  };
  // same relative order as the reference's foreign list
  var FOREIGN = ['ewy', 'sox', 'ndx', 'vix', 'mu', 'usdkrw', 'tnx', 'stoxx', 'hyg', 'eem'];
  // tickers whose session runs after the Seoul close; used to decide whether "tonight" is in
  var US_KEY = ['sox', 'ndx', 'ewy'];

  var CFG = {
    feats: ['ndx', 'sox', 'vix', 'ewyx', 'k1', 'usdkrw', 'hyg', 'eem', 'stoxx', 'mu', 'tnx'],
    lam: 0.3, decay: 0.998, clip: 5,
    sDecay: 0.99, smLam: 1e-4,
    qWin: 500, aci: 0.05, levels: [0.5, 0.8, 0.9, 0.95],
    minTrain: 500, smMin: 150, zMin: 200, start: '2019-10-01',
    nDraws: 500, holdoutFrom: '2025-01-01', historyDays: 60, seriesDays: 250
  };
  var LEVELS = CFG.levels;
  var SOX_BUCKETS = [
    [-1, -0.03, 'SOX -3% 이하'],
    [-0.03, -0.01, 'SOX -3%~-1%'],
    [-0.01, 0.01, 'SOX -1%~+1%'],
    [0.01, 0.03, 'SOX +1%~+3%'],
    [0.03, 1, 'SOX +3% 이상']
  ];

  // ------------------------------------------------------------------ utils
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function nowMsOf(opts) { return opts && opts.now != null ? +new Date(opts.now) : Date.now(); }
  function perfNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function addDays(d, n) {
    return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  }
  function kstDate(ms) { return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  // ------------------------------------------------------------ date helper
  var fmtCache = {};
  function tzDate(ms, tz) {
    try {
      var f = fmtCache[tz];
      if (!f) {
        f = fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
        });
      }
      var p = f.formatToParts(new Date(ms)), y, m, d;
      for (var i = 0; i < p.length; i++) {
        if (p[i].type === 'year') y = p[i].value;
        else if (p[i].type === 'month') m = p[i].value;
        else if (p[i].type === 'day') d = p[i].value;
      }
      if (y && m && d && y.length === 4) return y + '-' + m + '-' + d;
    } catch (e) { /* no Intl / unknown tz: fall through */ }
    return null;
  }
  // reference: new Date((ts+off)*1000).toISOString().slice(0,10)
  function barDate(ts, off, tz) {
    var sod = ((ts + off) % 86400 + 86400) % 86400;
    if (tz && (sod < 5400 || sod > 86400 - 5400)) {
      var d = tzDate(ts * 1000, tz);
      if (d) return d;
    }
    return new Date((ts + off) * 1000).toISOString().slice(0, 10);
  }

  // ------------------------------------------------------------ parsing
  /**
   * Parse one Yahoo v8 chart response into a compact series.
   * @returns {{symbol, gmtoffset, tz, rows:[{d,c,a}], dropped:number, lastTs:number}}
   */
  function parseChart(j, symbol, nowMs) {
    if (typeof j === 'string') j = JSON.parse(j);
    if (j && !j.chart && j.data) j = typeof j.data === 'string' ? JSON.parse(j.data) : j.data; // http wrapper
    var res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) {
      var err = j && j.chart && j.chart.error;
      throw new Error('Yahoo: no result for ' + symbol + (err ? ' (' + (err.description || err.code) + ')' : ''));
    }
    var meta = res.meta || {};
    var off = isNum(meta.gmtoffset) ? meta.gmtoffset : 0;
    var tz = typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : null;
    var ts = res.timestamp || [];
    var ind = res.indicators || {};
    var q = (ind.quote && ind.quote[0]) || {};
    var close = q.close || [];
    var adj = ind.adjclose && ind.adjclose[0] && ind.adjclose[0].adjclose ? ind.adjclose[0].adjclose : null;

    // drop bars of a session that is still running (live price, not a close)
    var liveFrom = Infinity;
    var reg = meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
    if (reg && isNum(reg.start) && isNum(reg.end) && isNum(nowMs)) {
      var nowS = nowMs / 1000;
      if (nowS >= reg.start && nowS < reg.end) liveFrom = reg.start;
    }

    var map = {}, dropped = 0, lastTs = null;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], c = close[i];
      if (!isNum(t) || !isNum(c) || !(c > 0)) continue;
      if (t >= liveFrom) { dropped++; continue; }
      var a = adj && isNum(adj[i]) && adj[i] > 0 ? adj[i] : c;
      var d = barDate(t, off, tz);
      map[d] = { d: d, c: c, a: a }; // later bar of the same date wins (reference: Map.set)
      if (lastTs === null || t > lastTs) lastTs = t;
    }
    var rows = Object.keys(map).sort().map(function (k) { return map[k]; });
    return { symbol: symbol, gmtoffset: off, tz: tz, rows: rows, dropped: dropped, lastTs: lastTs };
  }

  function toRows(v, symbol, nowMs) {
    if (!v) return null;
    if (Array.isArray(v)) v = { rows: v };
    else if (v.chart || v.data) v = parseChart(v, symbol, nowMs);
    var rows = v.rows;
    if (!Array.isArray(rows)) return null;
    // re-validate (series may come from storage)
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || typeof r.d !== 'string' || !isNum(+r.c) || !(+r.c > 0)) continue;
      var c = +r.c, a = isNum(+r.a) && +r.a > 0 ? +r.a : c;
      map[r.d.slice(0, 10)] = { d: r.d.slice(0, 10), c: c, a: a };
    }
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  // rawByTicker can be keyed by Yahoo symbol ('^KS11') or by short key ('kospi');
  // values: raw chart JSON, parsed series {rows}, or an array of {d,c,a}.
  function normalize(raw, nowMs) {
    var R = {}, missing = [], warnings = [];
    raw = raw || {};
    Object.keys(TICKERS).forEach(function (k) {
      var sym = TICKERS[k], rows = null;
      try { rows = toRows(raw[sym] || raw[k], sym, nowMs); } catch (e) { warnings.push(sym + ': ' + e.message); }
      R[k] = rows && rows.length ? rows : null;
    });
    var K = R.kospi;
    FOREIGN.forEach(function (k) {
      var A = R[k];
      // a series that starts long after the KOSPI history would wipe out most training rows
      if (A && K && (A.length < 250 || A[0].d > K[Math.min(K.length - 1, 600)].d)) {
        warnings.push(TICKERS[k] + ': history too short (' + A.length + ' rows), ignored');
        A = R[k] = null;
      }
      if (!A) missing.push(TICKERS[k]);
    });
    return { R: R, missing: missing, warnings: warnings };
  }

  // ------------------------------------------------------------ features
  function lastBefore(arr, d) {
    var lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (arr[m].d < d) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }

  // foreign changes over sessions dated in [dp, d). Returns false if a series has no bar yet.
  function foreignInto(R, d, dp, f) {
    for (var n = 0; n < FOREIGN.length; n++) {
      var k = FOREIGN[n], A = R[k];
      if (!A) { f[k] = 0; continue; }
      var j1 = lastBefore(A, d), j0 = lastBefore(A, dp);
      if (j1 < 0 || j0 < 0 || j1 < j0) return false;
      if (k === 'tnx') f[k] = A[j1].c - A[j0].c;
      else if (k === 'vix') f.vix = Math.log(A[j1].c / A[j0].c);
      else f[k] = Math.log(A[j1].a / A[j0].a);
    }
    return true;
  }
  function finishRow(R, f) {
    // EWY return minus the part already explained by yesterday's KOSPI move in USD
    f.ewyx = R.ewy ? f.ewy - (f.k1 - f.usdkrw) : 0;
    return f;
  }

  function buildFeatures(R) {
    var K = R.kospi, rows = [];
    for (var i = 6; i < K.length; i++) {
      var d = K[i].d, dp = K[i - 1].d;
      var f = { d: d, i: i, y: Math.log(K[i].c / K[i - 1].c) };
      if (!foreignInto(R, d, dp, f)) continue;
      f.k1 = Math.log(K[i - 1].c / K[i - 2].c);
      rows.push(finishRow(R, f));
    }
    return rows;
  }

  // ------------------------------------------------------------ regression
  function solve(A, b) {
    var n = b.length, i, r, c, t;
    A = A.map(function (row) { return row.slice(); }); b = b.slice();
    for (i = 0; i < n; i++) {
      var p = i;
      for (r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      t = A[i]; A[i] = A[p]; A[p] = t; t = b[i]; b[i] = b[p]; b[p] = t;
      var piv = A[i][i] || 1e-12;
      for (r = 0; r < n; r++) {
        if (r === i) continue;
        var fac = A[r][i] / piv;
        if (fac === 0) continue;
        for (c = i; c < n; c++) A[r][c] -= fac * A[i][c];
        b[r] -= fac * b[i];
      }
    }
    return b.map(function (v, k) { return v / (A[k][k] || 1e-12); });
  }

  function WLS(k, decay) {
    this.k = k; this.d = decay; this.S0 = 0; this.Sy = 0; this.n = 0;
    this.Sx = []; this.Sxy = []; this.Sxx = [];
    for (var a = 0; a < k; a++) {
      this.Sx.push(0); this.Sxy.push(0);
      var row = []; for (var b = 0; b < k; b++) row.push(0); this.Sxx.push(row);
    }
  }
  WLS.prototype.add = function (x, y) {
    var d = this.d, k = this.k;
    this.S0 = this.S0 * d + 1; this.Sy = this.Sy * d + y;
    for (var a = 0; a < k; a++) {
      this.Sx[a] = this.Sx[a] * d + x[a];
      this.Sxy[a] = this.Sxy[a] * d + x[a] * y;
      var row = this.Sxx[a];
      for (var b = 0; b <= a; b++) row[b] = row[b] * d + x[a] * x[b];
    }
    this.n++;
  };
  WLS.prototype.fit = function (lam) {
    var k = this.k, S0 = this.S0, a, b;
    var mx = this.Sx.map(function (v) { return v / S0; }), my = this.Sy / S0;
    var C = [];
    for (a = 0; a < k; a++) {
      var row = [];
      for (b = 0; b < k; b++) row.push((a >= b ? this.Sxx[a][b] : this.Sxx[b][a]) / S0 - mx[a] * mx[b]);
      C.push(row);
    }
    var cv = this.Sxy.map(function (v, i) { return v / S0 - mx[i] * my; });
    var sd = C.map(function (r, i) { return Math.sqrt(Math.max(r[i], 1e-14)); });
    for (a = 0; a < k; a++) C[a][a] += lam * C[a][a] + 1e-12;
    var bb = solve(C, cv);
    var s = 0; for (a = 0; a < k; a++) s = s + bb[a] * mx[a];
    return { b0: my - s, b: bb, mx: mx, sd: sd };
  };

  function quant(s, p) {
    if (!s.length) return NaN;
    var h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (s[hi] - s[lo]) * (h - lo);
  }
  // share of sorted values strictly greater than thr
  function shareAbove(s, thr) {
    if (!s.length) return NaN;
    var lo = 0, hi = s.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (s[m] <= thr) lo = m + 1; else hi = m; }
    return (s.length - lo) / s.length;
  }
  function sortedTail(arr, n) { return Float64Array.from(arr.slice(-n)).sort(); }

  function predictMu(m, f, feats, clip) {
    var s = 0;
    for (var a = 0; a < feats.length; a++) {
      var z = (f[feats[a]] - m.mx[a]) / m.sd[a];
      z = Math.max(-clip, Math.min(clip, z));
      s = s + m.b[a] * (m.mx[a] + z * m.sd[a]);
    }
    return m.b0 + s;
  }
  function volX(s2, s2f, s2s) { return [0.5 * Math.log(s2), 0.5 * Math.log(s2f), 0.5 * Math.log(s2s)]; }
  function predictSig(ms, sx) {
    var s = 0; for (var a = 0; a < ms.b.length; a++) s = s + ms.b[a] * sx[a];
    return Math.exp(ms.b0 + s);
  }
  function clampA(a) { return Math.min(Math.max(a, 0.0005), 0.9); }
  // widen each outer band so that 50 ⊂ 80 ⊂ 90 ⊂ 95 (input: {level: [lo, hi, ...]})
  function nest(iv, levels) {
    var o = {}, lo = Infinity, hi = -Infinity;
    levels.slice().sort(function (a, b) { return a - b; }).forEach(function (l) {
      lo = Math.min(lo, iv[l][0]); hi = Math.max(hi, iv[l][1]); o[l] = [lo, hi];
    });
    return o;
  }

  // ------------------------------------------------------------ walk-forward
  function walkForward(K, F, cfg) {
    var feats = cfg.feats, levels = cfg.levels;
    var mm = new WLS(feats.length, cfg.decay), sm = new WLS(3, cfg.sDecay);
    var s2 = null, s2f = null, s2s = null, zhist = [], out = [], alpha = {};
    levels.forEach(function (l) { alpha[l] = 1 - l; });
    var x = new Array(feats.length);
    for (var n = 0; n < F.length; n++) {
      var f = F[n], prevC = K[f.i - 1].c, mu = 0, ready = mm.n >= cfg.minTrain;
      if (ready) mu = predictMu(mm.fit(cfg.lam), f, feats, cfg.clip);
      var sig = null, sx = null;
      if (s2 !== null) {
        sx = volX(s2, s2f, s2s);
        if (sm.n >= cfg.smMin) sig = predictSig(sm.fit(cfg.smLam), sx);
      }
      if (ready && sig && zhist.length >= cfg.zMin && f.d >= cfg.start) {
        var srt = sortedTail(zhist, cfg.qWin);
        var rec = { d: f.d, i: f.i, y: f.y, mu: mu, sig: sig, prevC: prevC, iv: {}, pUp: shareAbove(srt, -mu / sig) };
        for (var li = 0; li < levels.length; li++) {
          var l = levels[li], a = clampA(alpha[l]);
          var lo = mu + sig * quant(srt, a / 2), hi = mu + sig * quant(srt, 1 - a / 2);
          var hit = f.y >= lo && f.y <= hi;
          rec.iv[l] = [lo, hi, hit];
          alpha[l] += cfg.aci * ((1 - l) - (hit ? 0 : 1));
        }
        out.push(rec);
      }
      var e = f.y - mu;
      if (ready && sig) zhist.push(e / sig);
      if (ready && sx) sm.add(sx, Math.log(Math.abs(e) + 1e-4));
      if (ready) {
        if (s2 === null) s2 = s2f = s2s = e * e + 1e-6;
        else { s2 = 0.94 * s2 + 0.06 * e * e; s2f = 0.8 * s2f + 0.2 * e * e; s2s = 0.98 * s2s + 0.02 * e * e; }
      }
      for (var c = 0; c < feats.length; c++) x[c] = f[feats[c]];
      mm.add(x, f.y);
    }
    return { out: out, state: { mm: mm, sm: sm, zhist: zhist, s2: s2, s2f: s2f, s2s: s2s, alpha: alpha } };
  }

  function stateParts(state, cfg) {
    var al = {};
    cfg.levels.forEach(function (l) { al[l] = clampA(state.alpha[l]); });
    return {
      m: state.mm.fit(cfg.lam),
      sig: predictSig(state.sm.fit(cfg.smLam), volX(state.s2, state.s2f, state.s2s)),
      zw: sortedTail(state.zhist, cfg.qWin),
      al: al
    };
  }

  function mixture(mus, zw, sig) {
    var a = new Float64Array(mus.length * zw.length), n = 0;
    for (var i = 0; i < mus.length; i++) for (var j = 0; j < zw.length; j++) a[n++] = mus[i] + sig * zw[j];
    return a.sort();
  }

  // reference tomorrow(): tonight's foreign moves unknown -> resample last 500 days' overnight rows
  function forecastMixture(K, F, cfg, state) {
    cfg = cfg || CFG;
    var n = K.length, lastC = K[n - 1].c, k1 = Math.log(lastC / K[n - 2].c);
    var P = stateParts(state, cfg), m = P.m, sig = P.sig, zw = P.zw, al = P.al;
    var draws = F.slice(-cfg.nDraws).map(function (h) { var o = {}; for (var key in h) o[key] = h[key]; o.k1 = k1; return o; });
    var mus = draws.map(function (f) { return predictMu(m, f, cfg.feats, cfg.clip); });
    var E = function (x) { return Math.round(lastC * Math.exp(x)); };
    var all = mixture(mus, zw, sig);
    var ranges = {};
    cfg.levels.forEach(function (l) { ranges[l] = [E(quant(all, al[l] / 2)), E(quant(all, 1 - al[l] / 2))]; });
    var scenarios = SOX_BUCKETS.map(function (bk) {
      var ms = [];
      for (var i = 0; i < draws.length; i++) if (draws[i].sox > bk[0] && draws[i].sox <= bk[1]) ms.push(mus[i]);
      if (!ms.length) return { label: bk[2], soxLo: bk[0], soxHi: bk[1], n: 0, pUp: null, center: null, r80: null, r95: null };
      var arr = mixture(ms, zw, sig);
      return {
        label: bk[2], soxLo: bk[0], soxHi: bk[1], n: ms.length,
        pUp: r3(shareAbove(arr, 0)),
        center: E(quant(arr, 0.5)),
        r80: [E(quant(arr, al[0.8] / 2)), E(quant(arr, 1 - al[0.8] / 2))],
        r95: [E(quant(arr, al[0.95] / 2)), E(quant(arr, 1 - al[0.95] / 2))]
      };
    });
    return {
      mode: 'mixture', baseDate: K[n - 1].d, baseClose: lastC,
      center: E(quant(all, 0.5)), pUp: shareAbove(all, 0), ranges: ranges, scenarios: scenarios,
      sig: sig, sigmaPct: r2(sig * 100)
    };
  }

  // reference tomorrowWithTonight(): tonight's US session is in -> one feature row, no mixture.
  // cutoff: foreign bars dated < cutoff are used (see DEVIATIONS). Returns null if a feature is unavailable.
  function forecastWithOvernight(R, cfg, state, cutoff) {
    cfg = cfg || CFG;
    var K = R.kospi, n = K.length, lastC = K[n - 1].c, dK = K[n - 1].d;
    cutoff = cutoff || addDays(dK, 1);
    var f = { d: cutoff };
    if (!foreignInto(R, cutoff, dK, f)) return null;
    f.k1 = Math.log(lastC / K[n - 2].c);
    finishRow(R, f);
    var P = stateParts(state, cfg);
    var mu = predictMu(P.m, f, cfg.feats, cfg.clip), sig = P.sig, zw = P.zw;
    var ranges = {};
    cfg.levels.forEach(function (l) {
      var a = P.al[l];
      ranges[l] = [Math.round(lastC * Math.exp(mu + sig * quant(zw, a / 2))),
        Math.round(lastC * Math.exp(mu + sig * quant(zw, 1 - a / 2)))];
    });
    var moves = {}, usDate = null;
    FOREIGN.forEach(function (k) {
      if (!R[k]) { moves[k] = null; return; }
      moves[k] = k === 'tnx' ? r3(f[k]) : r2((Math.exp(f[k]) - 1) * 100); // tnx: change in %p of yield
    });
    if (R.sox) { var j = lastBefore(R.sox, cutoff); usDate = j >= 0 ? R.sox[j].d : null; }
    return {
      mode: 'overnight', baseDate: dK, baseClose: lastC,
      center: Math.round(lastC * Math.exp(mu)), mu: mu, pUp: shareAbove(zw, -mu / sig),
      ranges: ranges, scenarios: [], sig: sig, sigmaPct: r2(sig * 100),
      overnight: { usDate: usDate, movesPct: moves, ewyxPct: r2(f.ewyx * 100) }
    };
  }

  // is the US session that follows the last KOSPI close already finished?
  function decideMode(R, dK, cutoff, nowMs) {
    var keys = US_KEY.filter(function (k) { return R[k]; });
    if (!keys.length) return { mode: 'mixture', reason: 'no US data' };
    var allIn = keys.every(function (k) {
      var A = R[k], j = lastBefore(A, cutoff);
      return j >= 0 && A[j].d >= dK;
    });
    if (allIn) return { mode: 'overnight', reason: 'US session after ' + dK + ' is in' };
    // 07:00 KST on dK+1 = 22:00 UTC on dK: any US session dated dK has closed by then.
    // No bar for it means a US holiday -> the overnight change is genuinely 0 (as in training).
    var usDone = Date.parse(dK + 'T22:00:00Z');
    if (nowMs >= usDone && nowMs < usDone + 4 * 864e5) return { mode: 'overnight', reason: 'US holiday on ' + dK, usHoliday: true };
    return { mode: 'mixture', reason: 'US session after ' + dK + ' not finished' };
  }

  // ------------------------------------------------------------ stats
  function holdoutStats(out, from) {
    var a = out.filter(function (r) { return r.d >= from; });
    var res = { from: from, holdoutN: a.length };
    if (!a.length) return res;
    LEVELS.forEach(function (l) {
      res['cov' + Math.round(l * 100)] = r3(a.filter(function (r) { return r.iv[l][2]; }).length / a.length);
    });
    res.miss95 = a.filter(function (r) { return !r.iv[0.95][2]; }).length;
    res.shown = {};
    LEVELS.forEach(function (l) {
      res.shown['cov' + Math.round(l * 100)] = r3(a.filter(function (r) {
        var b = nest(r.iv, LEVELS)[l]; return r.y >= b[0] && r.y <= b[1];
      }).length / a.length);
    });
    res.width95pct = r2(a.reduce(function (s, r) { return s + r.iv[0.95][1] - r.iv[0.95][0]; }, 0) / a.length * 100);
    // direction: predicted up iff pUp > 0.5; actual up iff y > 0. Ties (pUp==0.5 or y==0) are excluded.
    function tier(t) {
      var sel = a.filter(function (r) { return (r.pUp >= t || r.pUp <= 1 - t) && r.pUp !== 0.5 && r.y !== 0; });
      var hit = sel.filter(function (r) { return (r.pUp > 0.5) === (r.y > 0); }).length;
      return { thr: t, n: sel.length, share: r3(sel.length / a.length), hit: sel.length ? r3(hit / sel.length) : null };
    }
    var all = tier(0.5);
    res.dirN = all.n; res.dirHit = all.hit;
    var t60 = tier(0.6);
    res.confN60 = t60.n; res.confShare60 = t60.share; res.confHit60 = t60.hit;
    res.dirTiers = [tier(0.6), tier(0.65), tier(0.7)];
    return res;
  }

  function recView(r) {
    var E = function (x) { return Math.round(r.prevC * Math.exp(x)); };
    var nv = nest(r.iv, LEVELS), b80 = nv[0.8], b95 = nv[0.95];
    return {
      date: r.d, prevClose: r2(r.prevC),
      center: E(r.mu),
      lo80: E(b80[0]), hi80: E(b80[1]),
      lo95: E(b95[0]), hi95: E(b95[1]),
      actual: r2(r.prevC * Math.exp(r.y)),
      in80: r.y >= b80[0] && r.y <= b80[1], in95: r.y >= b95[0] && r.y <= b95[1],
      pUp: r3(r.pUp)
    };
  }

  // ------------------------------------------------------------ run
  /**
   * @param rawByTicker  {[symbol]: chartJSON | {rows} | [{d,c,a}]}
   * @param opts         {now?: ms|Date, mode?: 'auto'|'mixture'|'overnight', cfg?: partial CFG}
   */
  function run(rawByTicker, opts) {
    opts = opts || {};
    var t0 = perfNow(), nowMs = nowMsOf(opts);
    var cfg = {}, k;
    for (k in CFG) cfg[k] = CFG[k];
    if (opts.cfg) for (k in opts.cfg) cfg[k] = opts.cfg[k];

    var N = normalize(rawByTicker, nowMs), R = N.R, K = R.kospi;
    if (!K || K.length < cfg.minTrain + cfg.smMin + cfg.zMin) {
      var e1 = new Error('KOSPI(^KS11) 자료가 부족합니다 (' + (K ? K.length : 0) + '일)');
      e1.code = 'INSUFFICIENT_DATA'; throw e1;
    }
    var F = buildFeatures(R);
    var t1 = perfNow();
    var wf = walkForward(K, F, cfg), out = wf.out, state = wf.state;
    var t2 = perfNow();
    if (!out.length || state.s2 === null || state.sm.n < cfg.smMin) {
      var e2 = new Error('예측에 필요한 학습 자료가 부족합니다'); e2.code = 'INSUFFICIENT_DATA'; throw e2;
    }

    var dK = K[K.length - 1].d;
    var cutoff = addDays(dK, 1), today = kstDate(nowMs);
    if (today > cutoff) cutoff = today;
    var dec = opts.mode === 'mixture' || opts.mode === 'overnight'
      ? { mode: opts.mode, reason: 'forced' } : decideMode(R, dK, cutoff, nowMs);

    var fc = null, warnings = N.warnings.slice();
    if (dec.mode === 'overnight') {
      fc = forecastWithOvernight(R, cfg, state, cutoff);
      if (!fc) warnings.push('overnight features unavailable, fell back to mixture');
    }
    if (!fc) fc = forecastMixture(K, F, cfg, state);
    if (N.missing.length) warnings.push('missing tickers treated as 0: ' + N.missing.join(', '));
    var ageDays = (Date.parse(today) - Date.parse(dK)) / 864e5;
    if (ageDays > 5) warnings.push('last KOSPI close is ' + ageDays + ' days old');

    var last = out[out.length - 1];
    var hist = out.slice(-cfg.historyDays).map(recView);
    var ranges = nest(fc.ranges, cfg.levels), rangesRaw = {};
    cfg.levels.forEach(function (l) { rangesRaw[l] = fc.ranges[l].slice(); });
    var scenarios = fc.scenarios.map(function (s) {
      if (!s.n) return s;
      var o = {}; for (var key in s) o[key] = s[key];
      o.r95 = [Math.min(s.r95[0], s.r80[0]), Math.max(s.r95[1], s.r80[1])];
      return o;
    });

    return {
      asOf: new Date(nowMs).toISOString(),
      baseDate: fc.baseDate,
      baseClose: fc.baseClose,
      mode: fc.mode,
      center: fc.center,
      pUp: r3(fc.pUp),
      ranges: ranges,
      rangesRaw: rangesRaw,
      scenarios: scenarios,
      overnight: fc.overnight || null,
      yesterday: last.d === dK ? recView(last) : null,
      history: hist,
      stats: holdoutStats(out, cfg.holdoutFrom),
      sigmaPct: fc.sigmaPct,
      kospiSeries: K.slice(-cfg.seriesDays).map(function (r) { return { date: r.d, close: r.c }; }),
      meta: {
        version: VERSION, modeReason: dec.reason, usHoliday: !!dec.usHoliday, cutoff: cutoff,
        nKospi: K.length, nRows: F.length, nOut: out.length, firstOut: out[0].d,
        missing: N.missing, warnings: warnings,
        ms: { features: Math.round(t1 - t0), walkForward: Math.round(t2 - t1), total: Math.round(perfNow() - t0) }
      }
    };
  }

  // ------------------------------------------------------------ fetching
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout ' + ms + 'ms')); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  /**
   * Fetch the 11 tickers. httpGet(url) -> (Promise of) parsed JSON (string also accepted).
   * Resolves to {[symbol]: series}; failed symbols are omitted and listed in the non-enumerable
   * `__errors` ({symbol: message}). Rejects only if ^KS11 cannot be loaded.
   * opts: {range='10y', retries=3, concurrency=4, timeoutMs=20000, now}
   */
  function fetchAll(httpGet, opts) {
    opts = opts || {};
    var range = opts.range || '10y', retries = opts.retries || 3, conc = opts.concurrency || 4;
    var timeoutMs = opts.timeoutMs || 20000, hosts = ['query1', 'query2'];
    var syms = Object.keys(TICKERS).map(function (k) { return TICKERS[k]; });
    var out = {}, errors = {}, idx = 0;
    function one(sym) {
      var attempt = 0;
      function tryOnce() {
        var url = 'https://' + hosts[attempt % 2] + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) +
          '?range=' + range + '&interval=1d&includeAdjustedClose=true&_=' + Date.now();
        return withTimeout(httpGet(url), timeoutMs).then(function (j) {
          var s = parseChart(j, sym, opts.now != null ? nowMsOf(opts) : Date.now());
          if (!s.rows.length) throw new Error('empty series');
          out[sym] = s;
        }).catch(function (e) {
          attempt++;
          if (attempt >= retries) { errors[sym] = String((e && e.message) || e); return; }
          return sleep(500 * attempt).then(tryOnce);
        });
      }
      return tryOnce();
    }
    function worker() { if (idx >= syms.length) return Promise.resolve(); var s = syms[idx++]; return one(s).then(worker); }
    var ws = []; for (var w = 0; w < Math.min(conc, syms.length); w++) ws.push(worker());
    return Promise.all(ws).then(function () {
      Object.defineProperty(out, '__errors', { value: errors, enumerable: false });
      if (!out[TICKERS.kospi]) {
        var e = new Error('코스피 시세를 불러오지 못했습니다: ' + (errors[TICKERS.kospi] || 'unknown'));
        e.code = 'FETCH_FAILED'; e.errors = errors; throw e;
      }
      return out;
    });
  }

  // fill tickers that failed today from a cached copy (fresh wins). Both keyed by symbol.
  function mergeSeries(fresh, cached) {
    var o = {};
    Object.keys(TICKERS).forEach(function (k) {
      var s = TICKERS[k];
      if (fresh && fresh[s]) o[s] = fresh[s]; else if (cached && cached[s]) o[s] = cached[s];
    });
    return o;
  }

  var KModel = {
    VERSION: VERSION, TICKERS: TICKERS, CFG: CFG, DEVIATIONS: DEVIATIONS, SOX_BUCKETS: SOX_BUCKETS,
    fetchAll: fetchAll, run: run, mergeSeries: mergeSeries,
    // low level (tests / lead parity checks)
    parseChart: parseChart, normalize: normalize, buildFeatures: buildFeatures, walkForward: walkForward,
    forecastMixture: forecastMixture, forecastWithOvernight: forecastWithOvernight, decideMode: decideMode,
    holdoutStats: holdoutStats, nest: nest, quant: quant, shareAbove: shareAbove, lastBefore: lastBefore, WLS: WLS, solve: solve,
    barDate: barDate
  };
  root.KModel = KModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = KModel;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
