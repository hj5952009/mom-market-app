/* 자료 흐름: 시세 받기 → 저장된 시세와 합치기 → 계산(Worker) → 저장. 데모 모드는 묶어 둔 결과를 쓴다. */
(function (root) {
  'use strict';
  var U = root.MCUtil, Store = root.Store, Native = root.Native;
  var REPO = 'hj5952009/mom-market-app';
  var FETCH_BUDGET_MS = 30000;   // ux1 4-2: 30초 넘으면 중단

  var params = (function () { try { return new URLSearchParams(root.location.search); } catch (e) { return { get: function () { return null; } }; } })();
  var demo = !Native.isNative || params.get('demo') === '1';
  var demoData = null, demoNow = null;

  function err(code, message, extra) { var e = new Error(message || code); e.code = code; if (extra) Object.assign(e, extra); return e; }
  function nowMs() { return demo && demoNow != null ? demoNow : Date.now(); }

  // ---------------------------------------------------------------- 계산 (Worker 우선)
  var worker = null, workerBroken = false;
  function computeOnMain(raw, now) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {   // 진행 표시가 한 번 그려지도록 양보
        try { resolve(root.Compute.computeAll(raw, now)); } catch (e) { reject(err(e.code || 'COMPUTE_FAILED', e.message)); }
      }, 50);
    });
  }
  function compute(raw, now) {
    if (workerBroken || typeof root.Worker !== 'function') return computeOnMain(raw, now);
    return new Promise(function (resolve, reject) {
      try { if (!worker) worker = new root.Worker('js/worker.js'); } catch (e) { workerBroken = true; return resolve(computeOnMain(raw, now)); }
      var done = false;
      worker.onmessage = function (e) {
        done = true;
        if (e.data && e.data.ok) resolve(e.data.out);
        else reject(err((e.data && e.data.error && e.data.error.code) || 'COMPUTE_FAILED', e.data && e.data.error && e.data.error.message));
      };
      worker.onerror = function (ev) {
        if (done) return; done = true;
        if (ev && ev.preventDefault) ev.preventDefault();
        workerBroken = true; try { worker.terminate(); } catch (x) { /* ignore */ } worker = null;
        resolve(computeOnMain(raw, now));
      };
      worker.postMessage({ raw: raw, now: now });
    });
  }

  // ---------------------------------------------------------------- 실제 갱신
  function loadLast() {
    if (demo) return loadDemo();
    return Store.IDB.get('last').then(function (p) { return p || null; });
  }

  // onProgress(stage 1..3, percent 0..100, slow:boolean)
  function refresh(onProgress) {
    if (demo) return loadDemo(true);
    onProgress = onProgress || function () {};
    var t0 = Date.now(), total = Object.keys(root.KModel.TICKERS).length, done = 0;
    onProgress(1, 0);
    var slowTimer = setTimeout(function () { onProgress(1, Math.round(done / total * 60), true); }, 10000);
    var get = function (url) {
      return Native.httpGet(url, 20000).then(function (j) { done++; onProgress(1, Math.round(done / total * 60)); return j; });
    };
    var cachedP = Store.IDB.get('series');
    return Native.networkStatus().then(function (online) {
      if (!online) throw err('OFFLINE', '인터넷 연결 없음');
      var budget = new Promise(function (_, reject) { setTimeout(function () { reject(err('TIMEOUT', '30초 안에 시세를 받지 못함')); }, FETCH_BUDGET_MS); });
      return Promise.race([root.KModel.fetchAll(get, { range: '10y', retries: 3, concurrency: 4, timeoutMs: 20000 }), budget]);
    }).then(function (fresh) {
      clearTimeout(slowTimer);
      var fetchErrors = fresh.__errors || {};
      return cachedP.then(function (cached) {
        var merged = root.KModel.mergeSeries(fresh, cached && cached.series);
        var K = merged[root.KModel.TICKERS.kospi].rows, a = K[K.length - 1], b = K[K.length - 2];
        if (!a || !b || !(a.c > 0) || Math.abs(a.c / b.c - 1) > 0.15) throw err('BAD_DATA', '코스피 최신 종가가 이상함');
        onProgress(2, 60);
        var p = 60, anim = setInterval(function () { p = Math.min(95, p + 3); onProgress(2, p); }, 250);
        var now = Date.now();
        return compute(merged, now).then(function (out) {
          clearInterval(anim); onProgress(3, 97);
          var payload = {
            v: 1, computedAt: now, out: out, fetchErrors: fetchErrors,
            usedCached: Object.keys(fetchErrors), fetchMs: Date.now() - t0
          };
          return Promise.all([Store.IDB.set('last', payload), Store.IDB.set('series', { savedAt: now, series: merged })]).then(function () {
            onProgress(3, 100); return payload;
          });
        }, function (e) { clearInterval(anim); throw e; });
      });
    }).catch(function (e) {
      clearTimeout(slowTimer);
      if (!e.code) e.code = 'FETCH_FAILED';
      throw e;
    });
  }

  // ---------------------------------------------------------------- 종목 시세 (stocks2 §2-1, §1-3)
  function chartUrl(sym, range) {
    return 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=' + range + '&interval=1d&includeAdjustedClose=true';
  }
  function fetchRows(sym, range) {
    return Native.httpGet(chartUrl(sym, range || '2y'), 20000).then(function (j) { return root.Holdings.parseRows(j); });
  }
  function swapSuffix(sym) { return /\.KS$/.test(sym) ? sym.replace(/\.KS$/, '.KQ') : /\.KQ$/.test(sym) ? sym.replace(/\.KQ$/, '.KS') : null; }
  // 하루 한 번만 받는다. kospiLast: 코스피 마지막 거래일(10일 이상 뒤처지면 접미사를 바꿔 다시 시도)
  function holdingRows(sym, kospiLast) {
    if (demo) return Promise.resolve(demoHoldingRows(sym));
    var today = U.kstDate(Date.now()), key = 'h:' + sym;
    return Store.IDB.get(key).then(function (c) {
      if (c && c.day === today && c.rows && c.rows.length) return { rows: c.rows, name: c.name, day: c.day, symbol: sym };
      var tooOld = function (rows) { return !rows.length || (kospiLast && U.dayDiff(rows[rows.length - 1].d, kospiLast) >= 10); };
      return fetchRows(sym).catch(function () { return null; }).then(function (p) {
        if (p && !tooOld(p.rows)) return p;
        var alt = swapSuffix(sym);
        if (!alt) return p;
        return fetchRows(alt).then(function (q) { if (q && !tooOld(q.rows)) { q.movedTo = alt; return q; } return p; }).catch(function () { return p; });
      }).then(function (p) {
        if (!p) {
          if (c && c.rows) return { rows: c.rows, name: c.name, day: c.day, symbol: sym, stale: true };
          return null;
        }
        var symbol = p.movedTo || sym;
        var rec = { day: today, rows: p.rows, name: p.name };
        return Store.IDB.set('h:' + symbol, rec).then(function () { return { rows: p.rows, name: p.name, day: today, symbol: symbol, movedTo: p.movedTo || null }; });
      });
    });
  }
  // "목록에 없어요" 6자리 번호 찾기 (stocks2 §1-2)
  function lookupCode(code, kospiLast) {
    if (demo) return Promise.resolve(null);
    var tryOne = function (sym) {
      return fetchRows(sym, '1mo').then(function (p) {
        if (!p.rows.length) return null;
        if (kospiLast && U.dayDiff(p.rows[p.rows.length - 1].d, kospiLast) >= 10) return null;
        return { symbol: sym, name: p.name || code, close: p.rows[p.rows.length - 1].c, date: p.rows[p.rows.length - 1].d };
      }).catch(function () { return null; });
    };
    return tryOne(code + '.KS').then(function (r) { return r || tryOne(code + '.KQ'); });
  }

  // ---------------------------------------------------------------- 새 버전 확인 (DECISIONS)
  var buildInfo = null;
  function getBuild() {
    if (buildInfo) return Promise.resolve(buildInfo);
    return fetch('build.json').then(function (r) { return r.json(); }).catch(function () { return { build: 0, version: '1.0.0' }; })
      .then(function (b) { buildInfo = b; return b; });
  }
  function checkUpdate() {
    var url = 'https://api.github.com/repos/' + REPO + '/releases/latest';
    return getBuild().then(function (b) {
      return Native.httpGet(url, 15000).then(function (j) {
        var tag = j && j.tag_name, m = tag && /-(\d+)$/.exec(tag), remote = m ? +m[1] : 0;
        var asset = (j.assets || []).filter(function (a) { return /\.apk$/.test(a.name); })[0];
        return { ok: true, tag: tag, newer: remote > (b.build || 0), url: asset ? asset.browser_download_url : j.html_url, page: j.html_url, local: b };
      });
    }).catch(function (e) { return { ok: false, error: String(e && e.message || e) }; });
  }

  // ---------------------------------------------------------------- 데모
  function fixtureToResult(fx) {
    var cols = fx._historyColumns;
    var toObj = function (row) { var o = {}; cols.forEach(function (c, i) { o[c] = row[i]; }); o.in80 = !!o.in80; o.in95 = !!o.in95; return o; };
    var r = JSON.parse(JSON.stringify(fx));
    r.history = fx.history.map(toObj);
    r.kospiSeries = fx.kospiSeries.map(function (x) { return { date: x[0], close: x[1] }; });
    delete r._historyColumns; delete r._kospiSeriesNote;
    return r;
  }
  function seriesRows(arr) { return arr ? arr.map(function (x) { return { d: x[0], c: x[1], a: x[2] != null ? x[2] : x[1] }; }) : null; }
  function loadDemo() {
    var p = demoData ? Promise.resolve(demoData) : Promise.all([
      fetch('demo/fixture.json').then(function (r) { return r.json(); }),
      fetch('demo/series.json').then(function (r) { return r.json(); })
    ]).then(function (a) { demoData = { fixture: a[0], series: a[1] }; return demoData; });
    return p.then(function (d) {
      var result = fixtureToResult(d.fixture);
      var scenario = params.get('scenario') || 'evening';
      var S = {}; Object.keys(d.series.tickers).forEach(function (k) { S[k] = seriesRows(d.series.tickers[k]); });
      demoNow = params.get('now') ? Date.parse(params.get('now')) : Date.parse(result.asOf);
      var brief = null;
      if (scenario === 'morning') {
        // 체험용: 같은 예측 숫자를 '아침 확정' 상태로 보여 주고, 간밤 요약은 예시 시세로 만든다.
        if (!params.get('now')) demoNow = Date.parse('2026-10-14T08:45:00+09:00');
        result.mode = 'overnight'; result.scenarios = []; result.asOf = new Date(demoNow - 4 * 60e3).toISOString();
        var F = root.KModel.buildFeatures(S);
        var ch = root.Overnight.computeOvernightChanges(S, F, demoNow, result.pUp);
        brief = root.Overnight.overnightBrief(ch); brief.usDate = ch.usDate; brief.cutoff = ch.cutoff;
      }
      var ctx = root.Context.MC.compute({ kospi: S.kospi, usdkrw: S.usdkrw, tnx: S.tnx, vix: S.vix });
      var abd = root.Context.MC.afterBigDrop(S.kospi, -0.04, 10);
      var tail = function (A, n) { return A.slice(-n).map(function (r) { return { d: r.d, c: r.c }; }); };
      demoData.kospiRows = S.kospi;
      return {
        v: 1, demo: true, scenario: scenario, computedAt: Date.parse(result.asOf), fetchErrors: {}, usedCached: [],
        out: { result: result, brief: brief, ctx: ctx, afterBigDrop: abd, kospi2y: tail(S.kospi, 560), usdkrwTail: tail(S.usdkrw, 10), ndxTail: tail(S.ndx, 10) }
      };
    });
  }
  // 체험용 종목 시세: 실제 코스피(+예시 앞부분)에 종목별 고정 난수를 섞어 만든 예시 (숫자는 화면 확인용)
  function demoHoldingRows(sym) {
    var K = demoData && demoData.kospiRows; if (!K) return null;
    var seed = 0; for (var i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) >>> 0;
    var rnd = function () { seed = (seed + 0x6D2B79F5) >>> 0; var t = seed; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    var norm = function () { var u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    var item = root.Holdings.CATALOG.filter(function (c) { return c.symbol === sym; })[0] || { type: 'stock' };
    var beta = { stock: 1.2, etf_kr: 1.0, etf_lev: item.leverage || 2, etf_us: 0.25, bond: 0.02, cash: 0 }[item.type];
    if (beta == null) beta = 1;
    var idio = { stock: 0.018, etf_kr: 0.004, etf_lev: 0.004, etf_us: 0.009, bond: 0.0008, cash: 0.0001 }[item.type] || 0.01;
    var start = { stock: 70000, etf_kr: 40000, etf_lev: 20000, etf_us: 20000, bond: 100000, cash: 50000 }[item.type] || 10000;
    var rows = [], c = start, KK = K.slice(-500);
    for (var j = 0; j < KK.length; j++) {
      if (j > 0) c = c * Math.exp(beta * Math.log(KK[j].c / KK[j - 1].c) + idio * norm());
      rows.push({ d: KK[j].d, c: Math.round(c * 100) / 100, a: Math.round(c * 100) / 100, v: 1000 });
    }
    return { rows: rows, name: item.name, day: U.kstDate(nowMs()), symbol: sym, demo: true };
  }

  root.Engine = {
    get demo() { return demo; }, params: params, nowMs: nowMs,
    loadLast: loadLast, refresh: refresh, holdingRows: holdingRows, lookupCode: lookupCode, checkUpdate: checkUpdate, getBuild: getBuild
  };
})(typeof window !== 'undefined' ? window : globalThis);
