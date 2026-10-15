/* 자료 흐름: 저장소 · 네이티브 기능 · 시세 받기 → 저장된 시세와 이어 붙이기 → 계산(Worker) → 저장.
 * 데모 모드(?demo=1 이거나 앱이 아닌 브라우저)는 묶어 둔 실제 모델 결과(demo/fixture.json)를 쓴다. */
(function (root) {
  'use strict';
  var U = root.MCUtil;

  // ================================================================ 저장소
  // 작은 값은 localStorage(JSON), 큰 값(10년 시세·모델 결과)은 IndexedDB. 실패하면 메모리에만 둔다.
  var PREFIX = 'mc.', mem = {};
  var LS = {
    get: function (k, def) {
      try { var v = root.localStorage.getItem(PREFIX + k); return v == null ? (k in mem ? mem[k] : def) : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : def; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { root.localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    }
  };
  var dbp = null, memIdb = {};
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) return resolve(null);
        var req = root.indexedDB.open('market-compass', 1);   // v1과 같은 DB: 저장된 10년 시세를 그대로 이어 쓴다
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  var IDB = {
    get: function (k) {
      return db().then(function (d) {
        if (!d) return memIdb[k];
        return new Promise(function (resolve) {
          try {
            var r = d.transaction('kv', 'readonly').objectStore('kv').get(k);
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { resolve(memIdb[k]); };
          } catch (e) { resolve(memIdb[k]); }
        });
      });
    },
    set: function (k, v) {
      memIdb[k] = v;
      return db().then(function (d) {
        if (!d) return false;
        return new Promise(function (resolve) {
          try {
            var tx = d.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(v, k);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
          } catch (e) { resolve(false); }
        });
      });
    }
  };

  // ================================================================ 네이티브 (Capacitor)
  var Cap = root.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  var plugins = {};
  function plugin(name) {
    if (!isNative || !Cap || !Cap.registerPlugin) return null;
    if (!(name in plugins)) { try { plugins[name] = Cap.registerPlugin(name); } catch (e) { plugins[name] = null; } }
    return plugins[name];
  }
  var UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
  function httpGet(url, timeoutMs) {
    var http = root.capacitorExports && root.capacitorExports.CapacitorHttp;
    if (isNative && http) {
      return http.get({ url: url, headers: { 'User-Agent': UA, Accept: 'application/json' }, connectTimeout: timeoutMs || 20000, readTimeout: timeoutMs || 20000, responseType: 'json' })
        .then(function (res) {
          var d = res.data;
          if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { /* keep */ } }
          if (res.status >= 400 && !(d && d.chart)) { var er = new Error('HTTP ' + res.status); er.status = res.status; throw er; }
          return d;
        });
    }
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok && !(j && j.chart)) throw new Error('HTTP ' + r.status); return j; });
    });
  }

  // 평일 아침 알림 1개 (월~금, id 102~106). 문구에 숫자는 넣지 않는다.
  var NOTI_IDS = [101, 102, 103, 104, 105, 106, 107];
  var Noti = {
    request: function () {
      var p = plugin('LocalNotifications'); if (!p) return Promise.resolve('unavailable');
      return p.requestPermissions().then(function (r) { return r.display; }).catch(function () { return 'denied'; });
    },
    check: function () {
      var p = plugin('LocalNotifications'); if (!p) return Promise.resolve('unavailable');
      return p.checkPermissions().then(function (r) { return r.display; }).catch(function () { return 'unknown'; });
    },
    // settings: {on, time:'08:40'}
    apply: function (settings) {
      var p = plugin('LocalNotifications'); if (!p) return Promise.resolve(false);
      return p.cancel({ notifications: NOTI_IDS.map(function (id) { return { id: id }; }) }).catch(function () { /* none */ }).then(function () {
        if (!settings.on) return true;
        var h = +settings.time.slice(0, 2), m = +settings.time.slice(3, 5);
        return p.schedule({
          notifications: [2, 3, 4, 5, 6].map(function (wd) {   // 1=일 ... 7=토
            return {
              id: 100 + wd, title: '시장 나침반', body: '오늘 코스피 예측이 준비됐어요',
              schedule: { on: { weekday: wd, hour: h, minute: m }, allowWhileIdle: true },
              smallIcon: 'ic_stat_compass', iconColor: '#7A4E08', autoCancel: true
            };
          })
        }).then(function () { return true; });
      }).catch(function () { return false; });
    },
    onTap: function (cb) {
      var p = plugin('LocalNotifications'); if (!p) return;
      try { p.addListener('localNotificationActionPerformed', function () { cb(); }); } catch (e) { /* ignore */ }
    }
  };
  // 시스템 글씨 크기: 웹뷰 자체 확대는 100%로 고정하고 배율을 직접 적용한다(차트 글씨까지 같이 커지게).
  function textZoom() {
    var p = plugin('TextZoom');
    if (!p) return Promise.resolve(null);
    return p.getPreferred().then(function (r) {
      return p.set({ value: 1 }).catch(function () { /* ignore */ }).then(function () { return r && r.value ? r.value : 1; });
    }).catch(function () { return null; });
  }
  function onBack(cb) { var p = plugin('App'); if (p) try { p.addListener('backButton', cb); } catch (e) { /* ignore */ } }
  function onResume(cb) { var p = plugin('App'); if (p) try { p.addListener('resume', cb); } catch (e) { /* ignore */ } }
  function exitApp() { var p = plugin('App'); if (p) p.exitApp(); }
  function networkStatus() {
    var p = plugin('Network');
    if (p) return p.getStatus().then(function (s) { return !!s.connected; }).catch(function () { return true; });
    return Promise.resolve(root.navigator ? root.navigator.onLine !== false : true);
  }
  // 앱 안에서 바깥 주소로 이동하면 Capacitor가 휴대폰 브라우저(내려받기)로 넘겨준다.
  function openUrl(url) { if (isNative) { root.location.href = url; return; } try { root.open(url, '_blank'); } catch (e) { root.location.href = url; } }

  var Native = { isNative: isNative, httpGet: httpGet, Noti: Noti, textZoom: textZoom, onBack: onBack, onResume: onResume, exitApp: exitApp, openUrl: openUrl };

  // ================================================================ 엔진
  var REPO = 'hj5952009/mom-market-app';
  // 새 버전 확인은 이 저장소의 Releases를 본다(2.2.1에서 잠깐 옮겼다가 2.2.2에서 되돌림).
  var RELEASE_REPO = REPO;
  var FETCH_BUDGET_MS = 30000;   // 30초 넘으면 중단 (저장된 시세가 없는 첫 실행은 60초)
  var PAYLOAD_VERSION = 3;       // v2.0.0: 저장 결과 구조가 바뀜(v1 결과는 무시하고 새로 계산, 시세는 그대로 이어 씀)
  var params = (function () { try { return new URLSearchParams(root.location.search); } catch (e) { return { get: function () { return null; } }; } })();
  var demo = !isNative || params.get('demo') === '1';
  var demoNow = null;

  function err(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function nowMs() { return demo && demoNow != null ? demoNow : Date.now(); }

  // ---------------------------------------------------------------- 계산 (Worker 우선)
  var worker = null, workerBroken = false;
  function computeOnMain(raw, now, opts) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(root.Compute.computeAll(raw, now, opts)); } catch (e) { reject(err(e.code || 'COMPUTE_FAILED', e.message)); }
      }, 30);
    });
  }
  function compute(raw, now, opts) {
    if (workerBroken || typeof root.Worker !== 'function') return computeOnMain(raw, now, opts);
    return new Promise(function (resolve, reject) {
      try { if (!worker) worker = new root.Worker('js/worker.js'); } catch (e) { workerBroken = true; return resolve(computeOnMain(raw, now, opts)); }
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
        resolve(computeOnMain(raw, now, opts));
      };
      worker.postMessage({ raw: raw, now: now, opts: opts });
    });
  }

  function loadLast() {
    if (demo) return loadDemo();
    return IDB.get('last').then(function (p) { return p && p.v === PAYLOAD_VERSION ? p : null; });
  }

  // 11개 지표 받기. 종목마다 받을 기간이 다를 수 있다(처음 10년치, 그다음 1달치).
  // query1/query2 번갈아 3번까지, 동시에 4개. state.aborted가 켜지면 남은 받기를 멈춘다.
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function chartUrl(host, sym, q) {
    return 'https://' + host + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?' + q + '&_=' + Date.now();
  }
  // 최근 종가가 빈 막대가 있으면 같은 Yahoo의 공식 값으로 채운다 (Series.fillNullCloses 설명 참고).
  function repairNulls(j, sym, host, patched) {
    var now = Date.now();
    if (!root.Series.nullCloses(j, now).length) return Promise.resolve(j);
    return httpGet(chartUrl(host, sym, 'range=1d&interval=1d'), 10000).then(function (rj) {
      var r = rj && rj.chart && rj.chart.result && rj.chart.result[0];
      return r && r.meta ? r.meta : null;
    }).catch(function () { return null; }).then(function (refMeta) {
      var done = root.Series.fillNullCloses(j, refMeta, Date.now());
      if (done.length) patched[sym] = done;
      return j;
    });
  }
  function fetchSeries(syms, rangeOf, onOne, state) {
    var out = {}, errors = {}, patched = {}, hl = null, idx = 0, hosts = ['query1', 'query2'];
    var KS = root.KModel.TICKERS.kospi;
    function one(sym) {
      var attempt = 0;
      function tryOnce() {
        if (state.aborted) return Promise.resolve();
        var host = hosts[attempt % 2];
        return httpGet(chartUrl(host, sym, 'range=' + rangeOf(sym) + '&interval=1d&includeAdjustedClose=true'), 20000).then(function (j) {
          return repairNulls(j, sym, host, patched);
        }).then(function (j) {
          var sr = root.KModel.parseChart(j, sym, Date.now());
          if (!sr.rows.length) throw new Error('empty series');
          if (sym === KS) hl = root.Series.extractHL(j, Date.now());
          out[sym] = sr; onOne(sym);
        }).catch(function (e) {
          attempt++;
          if (attempt >= 3 || state.aborted) { errors[sym] = String((e && e.message) || e); onOne(sym); return; }
          return sleep(500 * attempt).then(tryOnce);
        });
      }
      return tryOnce();
    }
    function next() { if (idx >= syms.length || state.aborted) return Promise.resolve(); var sy = syms[idx++]; return one(sy).then(next); }
    var ws = []; for (var w = 0; w < Math.min(4, syms.length); w++) ws.push(next());
    return { out: out, errors: errors, patched: patched, hl: function () { return hl; }, done: Promise.all(ws) };
  }

  // ---------------------------------------------------------------- 코스피 장중 고가·저가 (예측 달력)
  // 처음 한 번(또는 2025년 초 자료가 없으면) 2년치를 받아 두고, 그다음부터는 시세 받을 때 같이 들어온 값을 이어 붙인다.
  var HL_FROM = '2024-12-01';
  function saveHL(fresh) {
    return IDB.get('kospiHL').then(function (old) {
      var m = root.Series.mergeHL(old && old.hl, fresh, HL_FROM);
      var need = !Object.keys(m).some(function (d) { return d < '2025-01-10'; });
      if (!need) return IDB.set('kospiHL', { savedAt: Date.now(), hl: m });
      return httpGet(chartUrl('query1', root.KModel.TICKERS.kospi, 'range=2y&interval=1d'), 15000).then(function (j) {
        return root.Series.mergeHL(root.Series.extractHL(j, Date.now()), m, HL_FROM);
      }).catch(function () { return m; }).then(function (m2) { return IDB.set('kospiHL', { savedAt: Date.now(), hl: m2 }); });
    }).catch(function () { return false; });
  }
  function loadHL() {
    if (demo) return fetch('demo/kospi_hl.json').then(function (r) { return r.json(); }).then(function (x) { return x.hl || {}; }).catch(function () { return {}; });
    return IDB.get('kospiHL').then(function (x) { return (x && x.hl) || {}; }).catch(function () { return {}; });
  }

  // onProgress(done, total)
  function refresh(onProgress) {
    if (demo) return loadDemo();
    onProgress = onProgress || function () {};
    var t0 = Date.now(), T = root.KModel.TICKERS, syms = Object.keys(T).map(function (k) { return T[k]; });
    var total = syms.length, done = 0, todayK = U.kstDate(Date.now());
    onProgress(0, total);
    var cached = null, ranges = {};
    return IDB.get('series').then(function (c) {
      cached = (c && c.series) || {};
      return networkStatus();
    }).then(function (online) {
      if (!online) throw err('OFFLINE', '인터넷 연결 없음');
      syms.forEach(function (sy) { ranges[sy] = root.Series.rangeFor(cached[sy], todayK); });
      var budget = !cached[T.kospi] ? 60000 : FETCH_BUDGET_MS;
      var state = { aborted: false };
      var f = fetchSeries(syms, function (sy) { return ranges[sy]; }, function () { done++; onProgress(done, total); }, state);
      var timer;
      var timeout = new Promise(function (resolve) { timer = setTimeout(function () { state.aborted = true; resolve('timeout'); }, budget); });
      return Promise.race([f.done.then(function () { return 'done'; }), timeout]).then(function (how) {
        clearTimeout(timer); state.aborted = true;
        // 받은 것만 이어 붙인다. 10년치를 다시 받아야 하는 종목(배당 조정·빈 구간)은 한 번 더.
        var merged = {}, errors = {}, rebase = [];
        syms.forEach(function (sy) {
          var fr = f.out[sy];
          if (!fr) { errors[sy] = f.errors[sy] || (how === 'timeout' ? 'timeout' : 'failed'); return; }
          if (ranges[sy] === root.Series.FULL_RANGE) { merged[sy] = fr; return; }
          var m = root.Series.mergeIncremental(cached[sy], fr, todayK);
          if (m.rebase) rebase.push(sy); else merged[sy] = m.series;
        });
        if (!rebase.length || how === 'timeout') {
          rebase.forEach(function (sy) { errors[sy] = 'needs full reload'; });
          return { merged: merged, errors: errors, timedOut: how === 'timeout', patched: f.patched, hl: f.hl() };
        }
        var st2 = { aborted: false };
        var g = fetchSeries(rebase, function () { return root.Series.FULL_RANGE; }, function () {}, st2);
        var t2;
        var to2 = new Promise(function (resolve) { t2 = setTimeout(function () { st2.aborted = true; resolve(); }, FETCH_BUDGET_MS); });
        return Promise.race([g.done, to2]).then(function () {
          clearTimeout(t2); st2.aborted = true;
          rebase.forEach(function (sy) { if (g.out[sy]) merged[sy] = g.out[sy]; else errors[sy] = g.errors[sy] || 'timeout'; });
          var patched = f.patched; for (var k in g.patched) patched[k] = g.patched[k];
          return { merged: merged, errors: errors, timedOut: false, patched: patched, hl: g.hl() || f.hl() };
        });
      });
    }).then(function (got) {
      if (!got.merged[T.kospi]) throw err(got.timedOut ? 'TIMEOUT' : 'FETCH_FAILED', '코스피 시세를 받지 못함: ' + (got.errors[T.kospi] || ''));
      var fetchErrors = got.errors;
      var full = root.KModel.mergeSeries(got.merged, cached);   // 못 받은 종목은 저장된 시세로 (→ 미국 지표면 B2 규칙으로 미리 보기)
      var K = full[T.kospi].rows, a = K[K.length - 1], b = K[K.length - 2];
      if (!a || !b || !(a.c > 0) || Math.abs(a.c / b.c - 1) > 0.15) throw err('BAD_DATA', '코스피 최신 종가가 이상함');
      var now = Date.now();
      return compute(full, now, { fetchErrors: fetchErrors }).then(function (out) {
        var payload = { v: PAYLOAD_VERSION, computedAt: now, out: out, fetchErrors: fetchErrors, usedCached: Object.keys(fetchErrors),
          patched: got.patched || {}, fetchMs: Date.now() - t0 };
        try { payload.fresh = root.Freshness.check(full, now, { fetchErrors: fetchErrors, patched: got.patched }); } catch (e) { payload.fresh = null; }
        return Promise.all([IDB.set('last', payload), IDB.set('series', { savedAt: now, series: full }), saveHL(got.hl)]).then(function () { return payload; });
      });
    }).catch(function (e) { if (!e.code) e.code = 'FETCH_FAILED'; throw e; });
  }

  // ---------------------------------------------------------------- 새 버전 확인
  var buildInfo = null;
  function getBuild() {
    if (buildInfo) return Promise.resolve(buildInfo);
    return fetch('build.json').then(function (r) { return r.json(); }).catch(function () { return { build: 0, version: '2.5.0' }; })
      .then(function (b) { buildInfo = b; return b; });
  }
  function checkUpdate() {
    var url = 'https://api.github.com/repos/' + RELEASE_REPO + '/releases/latest';
    return getBuild().then(function (b) {
      return httpGet(url, 15000).then(function (j) {
        var tag = j && j.tag_name, m = tag && /-(\d+)$/.exec(tag), remote = m ? +m[1] : 0;
        var asset = (j.assets || []).filter(function (a) { return /\.apk$/.test(a.name); })[0];
        return { ok: true, tag: tag, newer: remote > (b.build || 0), url: asset ? asset.browser_download_url : j.html_url };
      });
    }).catch(function (e) { return { ok: false, error: String(e && e.message || e) }; });
  }

  // ---------------------------------------------------------------- 데모
  // demo/fixture.json = 실제 모델 결과(2026-10-13 저녁) + 앞쪽 기록(실제 워크포워드 431일, pUp 없음).
  // ?scenario=morning  : 같은 숫자를 아침 '확정'으로, 간밤 변화는 demo/series.json(예시 시세)으로 모델이 계산
  // ?scenario=usmissing: 미국 시세를 받지 못한 아침(B2) → 미리 보기
  // ?now=ISO           : 시각 바꾸기 (예: 지난 예측 화면)
  var demoCache = null;
  function fixtureToResult(fx) {
    var cols = fx._historyColumns;
    var r = JSON.parse(JSON.stringify(fx));
    r.history = fx.history.map(function (row) { var o = {}; cols.forEach(function (c, i) { o[c] = row[i]; }); o.in80 = !!o.in80; o.in95 = !!o.in95; return o; });
    r.kospiSeries = fx.kospiSeries.map(function (x) { return { date: x[0], close: x[1] }; });
    delete r._historyColumns; delete r._kospiSeriesNote; delete r._demoNote;
    return r;
  }
  function loadDemo() {
    var scenario = params.get('scenario') || 'evening';
    var get = function (u) { return fetch(u).then(function (r) { return r.json(); }); };
    var p = demoCache ? Promise.resolve(demoCache) : get('demo/fixture.json').then(function (fx) {
      return (scenario === 'morning' ? get('demo/series.json') : Promise.resolve(null)).then(function (s) { demoCache = { fx: fx, series: s }; return demoCache; });
    });
    return p.then(function (d) {
      var result = fixtureToResult(d.fx), pre = null;
      demoNow = params.get('now') ? Date.parse(params.get('now')) : Date.parse(result.asOf);
      if (scenario === 'morning' || scenario === 'usmissing') {
        if (!params.get('now')) demoNow = Date.parse('2026-10-14T08:45:00+09:00');
        result.asOf = new Date(demoNow - 4 * 60e3).toISOString();
      }
      if (scenario === 'morning') {
        var S = {}, T = root.KModel.TICKERS;
        // 예시 해외 시세는 2023년부터라 코스피도 같은 구간만 써야 모델이 해외 지표를 버리지 않는다
        Object.keys(d.series.tickers).forEach(function (k) {
          S[T[k]] = { rows: d.series.tickers[k].filter(function (x) { return x[0] >= '2023-01-01'; }).map(function (x) { return { d: x[0], c: x[1], a: x[1] }; }) };
        });
        var on = root.KModel.run(S, { mode: 'overnight', now: demoNow });
        result.mode = 'overnight'; result.scenarios = []; result.overnight = on.overnight;
      }
      if (scenario === 'usmissing') pre = { code: 'us_fetch_failed', symbols: ['^SOX'] };
      var fresh = null;
      try {
        // 데모: 2026-10-14 오전 실제 점검 결과와 같은 모양(마지막 날짜만 기준일로 맞춤)
        // 실제 2026-10-13 장 마감 값(10-14 오전 Yahoo에서 확인) [전날, 마지막]
        var REAL = { '^TNX': [5.24, 5.217], '^SOX': [12236.79, 12208.79], MU: [989.04, 953.19], '^IXIC': [27245.9, 27204.38], HYG: [77.29, 77.09],
          'KRW=X': [1340.84, 1334.13], EEM: [66.15, 65.74], EWY: [170.11, 166.56], '^VIX': [15.21, 15.27], '^STOXX50E': [6201.21, 6167.01] };
        var fake = {}; root.Freshness.ITEMS.forEach(function (it) {
          var dl = root.Freshness.expectedLast(it[2], demoNow), r = REAL[it[0]];
          fake[it[0]] = { rows: r ? [{ d: U.addDays(dl, -1), c: r[0] }, { d: dl, c: r[1] }] : [{ d: dl, c: null }] };
        });
        fake['^KS11'] = { rows: [{ d: result.baseDate, c: result.baseClose }] };
        fresh = root.Freshness.check(fake, demoNow, { fetchErrors: pre && pre.symbols ? pre.symbols.reduce(function (o, s) { o[s] = 'timeout'; return o; }, {}) : {},
          patched: { '^KS11': [{ d: '2026-10-13' }], EWY: [{ d: '2026-10-13' }], MU: [{ d: '2026-10-13' }] } });
      } catch (e) { fresh = null; }
      return { v: PAYLOAD_VERSION, demo: true, scenario: scenario, computedAt: Date.parse(result.asOf), fetchErrors: {}, usedCached: [], fresh: fresh, out: { result: result, previewReason: pre } };
    });
  }

  root.Data = {
    LS: LS, IDB: IDB, Native: Native,
    get demo() { return demo; }, params: params, nowMs: nowMs,
    loadLast: loadLast, refresh: refresh, loadHL: loadHL, checkUpdate: checkUpdate, getBuild: getBuild, PAYLOAD_VERSION: PAYLOAD_VERSION
  };
})(typeof window !== 'undefined' ? window : globalThis);
