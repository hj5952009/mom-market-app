/* 내 종목 — specs/stocks2_holdings.md (카탈로그 §1-4, 계산 §2, 카드 문구 §3, 걱정 배너 §4, JS §5).
 * 바꾼 점(이유): 빼기 부호 '−', 채권 ※ 문구의 '보장'(stocks3 4.2 금지어)을 '약속'으로. */
(function (root) {
  'use strict';
  var U = root.MCUtil || (typeof require !== 'undefined' ? require('./util.js') : null);

  // ------------------------------------------------------------------ 카탈로그 (54개 심볼 + 펀드·예금 분류 6개)
  var S = function (group, name, symbol) { return { id: symbol.slice(0, 6), name: name, symbol: symbol, type: 'stock', group: group }; };
  var CATALOG = [
    S('반도체·전자', '삼성전자', '005930.KS'), S('반도체·전자', '삼성전자우', '005935.KS'), S('반도체·전자', 'SK하이닉스', '000660.KS'),
    S('반도체·전자', 'LG전자', '066570.KS'), S('반도체·전자', 'SK스퀘어', '402340.KS'),
    S('자동차', '현대차', '005380.KS'), S('자동차', '기아', '000270.KS'), S('자동차', '현대모비스', '012330.KS'),
    S('배터리·화학', 'LG에너지솔루션', '373220.KS'), S('배터리·화학', '삼성SDI', '006400.KS'), S('배터리·화학', 'LG화학', '051910.KS'),
    S('배터리·화학', 'POSCO홀딩스', '005490.KS'), S('배터리·화학', '포스코퓨처엠', '003670.KS'), S('배터리·화학', 'SK이노베이션', '096770.KS'),
    S('금융', 'KB금융', '105560.KS'), S('금융', '신한지주', '055550.KS'), S('금융', '하나금융지주', '086790.KS'),
    S('금융', '우리금융지주', '316140.KS'), S('금융', '삼성생명', '032830.KS'), S('금융', '카카오뱅크', '323410.KS'),
    S('인터넷·통신', 'NAVER', '035420.KS'), S('인터넷·통신', '카카오', '035720.KS'), S('인터넷·통신', 'SK텔레콤', '017670.KS'),
    S('바이오', '삼성바이오로직스', '207940.KS'), S('바이오', '셀트리온', '068270.KS'),
    S('중공업·방산·에너지', '한화에어로스페이스', '012450.KS'), S('중공업·방산·에너지', 'HD현대중공업', '329180.KS'),
    S('중공업·방산·에너지', '두산에너빌리티', '034020.KS'), S('중공업·방산·에너지', '한국전력', '015760.KS'),
    S('생활·기타', '삼성물산', '028260.KS'), S('생활·기타', 'KT&G', '033780.KS'), S('생활·기타', '대한항공', '003490.KS'),
    S('코스닥', '알테오젠', '196170.KQ'), S('코스닥', '에코프로비엠', '247540.KQ'), S('코스닥', '에코프로', '086520.KQ'),
    S('코스닥', 'HLB', '028300.KQ'), S('코스닥', '레인보우로보틱스', '277810.KQ'), S('코스닥', '삼천당제약', '000250.KQ'),
    { id: '069500', name: 'KODEX 200', symbol: '069500.KS', type: 'etf_kr', desc: '코스피200' },
    { id: '102110', name: 'TIGER 200', symbol: '102110.KS', type: 'etf_kr', desc: '코스피200' },
    { id: '229200', name: 'KODEX 코스닥150', symbol: '229200.KS', type: 'etf_kr', desc: '코스닥150' },
    { id: '091160', name: 'KODEX 반도체', symbol: '091160.KS', type: 'etf_kr', desc: '반도체' },
    { id: '279530', name: 'KODEX 고배당주', symbol: '279530.KS', type: 'etf_kr', desc: '고배당' },
    { id: '122630', name: 'KODEX 레버리지', symbol: '122630.KS', type: 'etf_lev', leverage: 2 },
    { id: '114800', name: 'KODEX 인버스', symbol: '114800.KS', type: 'etf_lev', leverage: -1 },
    { id: '252670', name: 'KODEX 200선물인버스2X', symbol: '252670.KS', type: 'etf_lev', leverage: -2 },
    { id: '360750', name: 'TIGER 미국S&P500', symbol: '360750.KS', type: 'etf_us', ref: 'spx', hedged: false },
    { id: '379800', name: 'KODEX 미국S&P500', symbol: '379800.KS', type: 'etf_us', ref: 'spx', hedged: false },
    { id: '133690', name: 'TIGER 미국나스닥100', symbol: '133690.KS', type: 'etf_us', ref: 'ndx', hedged: false },
    { id: '379810', name: 'KODEX 미국나스닥100', symbol: '379810.KS', type: 'etf_us', ref: 'ndx', hedged: false },
    { id: '458730', name: 'TIGER 미국배당다우존스', symbol: '458730.KS', type: 'etf_us', ref: 'spx', hedged: false },
    { id: '114260', name: 'KODEX 국고채3년', symbol: '114260.KS', type: 'bond' },
    { id: '273130', name: 'KODEX 종합채권(AA-이상)액티브', symbol: '273130.KS', type: 'bond' },
    { id: '459580', name: 'KODEX CD금리액티브(합성)', symbol: '459580.KS', type: 'cash', parking: true },
    { id: 'fund_kr', name: '국내 주식형 펀드', symbol: null, proxy: '069500.KS', type: 'fund_kr', proxyLabel: '코스피200을 따라가는 상품 기준' },
    { id: 'fund_us', name: '해외 주식형 펀드 — 미국', symbol: null, proxy: '360750.KS', type: 'fund_global', ref: 'spx', proxyLabel: '미국 S&P500 상품 기준' },
    { id: 'fund_global', name: '해외 주식형 펀드 — 그 밖의 나라', symbol: null, type: 'fund_global' },
    { id: 'fund_bond', name: '채권형 펀드', symbol: null, proxy: '273130.KS', type: 'bond', proxyLabel: '비슷한 채권 상품 기준' },
    { id: 'fund_mixed', name: '주식·채권 혼합형 펀드', symbol: null, type: 'fund_mixed' },
    { id: 'deposit', name: '예금·적금', symbol: null, type: 'cash' }
  ];
  CATALOG.forEach(function (c) { c.chosung = U.chosung(c.name); });
  var STOCK_GROUPS = ['반도체·전자', '자동차', '배터리·화학', '금융', '인터넷·통신', '바이오', '중공업·방산·에너지', '생활·기타', '코스닥'];
  var TYPE_LABEL = { stock: '주식', etf_kr: 'ETF', etf_lev: 'ETF', etf_us: 'ETF', bond: '채권', cash: '예금', fund_kr: '펀드', fund_global: '펀드', fund_mixed: '펀드' };
  function typeLabel(item) {
    if (item.type === 'bond') return item.symbol ? 'ETF' : '펀드';
    if (item.type === 'cash') return item.parking ? 'ETF' : '예금';
    return TYPE_LABEL[item.type] || '';
  }
  function search(q, list) {
    list = list || CATALOG;
    q = String(q || '').trim().replace(/\s+/g, '');
    if (!q) return list;
    var up = q.toUpperCase();
    return list.filter(function (c) {
      var n = c.name.replace(/\s+/g, '').toUpperCase();
      if (n.indexOf(up) >= 0) return true;
      if (U.isChosungQuery(q)) return c.chosung.replace(/\s+/g, '').indexOf(q) >= 0;
      return (c.symbol || '').indexOf(q) === 0;
    });
  }

  // ------------------------------------------------------------------ Yahoo 응답 → {d,c,a,v}
  function parseRows(j) {
    if (typeof j === 'string') j = JSON.parse(j);
    if (j && !j.chart && j.data) j = typeof j.data === 'string' ? JSON.parse(j.data) : j.data;
    var res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) throw new Error('no result');
    var meta = res.meta || {}, off = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 32400;
    var ts = res.timestamp || [], q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
    var adj = res.indicators && res.indicators.adjclose && res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose;
    var map = {};
    for (var i = 0; i < ts.length; i++) {
      var c = q.close && q.close[i];
      if (!(typeof c === 'number' && c > 0)) continue;
      var d = new Date((ts[i] + off) * 1000).toISOString().slice(0, 10);
      var a = adj && adj[i] > 0 ? adj[i] : c, v = q.volume && typeof q.volume[i] === 'number' ? q.volume[i] : null;
      map[d] = { d: d, c: c, a: a, v: v };
    }
    var rows = Object.keys(map).sort().map(function (k) { return map[k]; });
    return { rows: rows, name: meta.longName || meta.shortName || null, symbol: meta.symbol || null, currency: meta.currency || null };
  }

  // ------------------------------------------------------------------ stocks2 §5 계산
  var Z80 = 1.2816;
  function quantile(sorted, p) { if (!sorted.length) return NaN; var h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo); }
  function roundMove(x) {
    if (!(x > 0)) return null;
    if (x < 1) return Math.max(0.1, Math.round(x * 10) / 10);
    if (x < 3) return Math.round(x * 2) / 2;
    return Math.round(x);
  }
  var fmt = function (x) { return String(+x.toFixed(1)); };
  var signed = function (x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x)); };
  var manwon = function (w) { return U.fmtInt(Math.round(w / 10000)) + '만 원'; };

  function alignedReturns(rows, kospi, krx) {
    if (krx === undefined) krx = true;
    var kIdx = new Map(kospi.map(function (x, i) { return [x.d, i]; }));
    var out = [];
    for (var j = 5; j < rows.length; j++) {
      var cur = rows[j], prev = rows[j - 1];
      var i = kIdx.get(cur.d);
      if (i == null || i < 1 || kospi[i - 1].d !== prev.d) continue;
      if (cur.v === 0) continue;
      var pa = prev.a > 0 ? prev.a : prev.c, ca = cur.a > 0 ? cur.a : cur.c;
      if (krx && Math.abs(ca / pa - 1) > 0.305) continue;
      out.push({ d: cur.d, ri: Math.log(ca / pa), rm: Math.log(kospi[i].c / kospi[i - 1].c) });
    }
    return out;
  }
  function fit(R) {
    var n = R.length, mi = 0, mm = 0, x, k;
    for (k = 0; k < n; k++) { x = R[k]; mi += x.ri; mm += x.rm; } mi /= n; mm /= n;
    var sii = 0, smm = 0, sim = 0;
    for (k = 0; k < n; k++) { x = R[k]; var a = x.ri - mi, b = x.rm - mm; sii += a * a; smm += b * b; sim += a * b; }
    var beta = sim / smm, alpha = mi - beta * mm;
    var see = 0; for (k = 0; k < n; k++) { x = R[k]; var e = x.ri - alpha - beta * x.rm; see += e * e; }
    return { n: n, beta: beta, sdI: Math.sqrt(sii / (n - 1)), sdM: Math.sqrt(smm / (n - 1)), sdE: Math.sqrt(see / Math.max(n - 2, 1)), r2: 1 - see / sii };
  }
  var adjBeta = function (b, type) { return type === 'stock' ? 0.67 * b + 0.33 : b; };

  function holdingStats(rows, kospi, wfOut, o) {
    var type = o.type, krx = o.krx === undefined ? true : o.krx;
    var kLastIdx = kospi.length - 1, lastD = rows.length ? rows[rows.length - 1].d : '';
    var lag = 0; for (var i = kLastIdx; i >= 0 && kospi[i].d > lastD; i--) lag++;
    if (lag > 5) return { status: 'stale', lastDate: lastD };
    var R = alignedReturns(rows, kospi, krx);
    var win = R.slice(-250), n = win.length;
    if (n < 60) return { status: 'too_short', nDays: n, lastDate: lastD };
    var absSorted = win.map(function (x) { return Math.abs(x.ri); }).sort(function (a, b) { return a - b; });
    var lastRi = R[R.length - 1].ri;
    var base = {
      nDays: n, lastDate: lastD,
      dailyVolPct: 100 * fit(win).sdI,
      move80Pct: 100 * quantile(absSorted, 0.8),
      bigMoveDays: win.filter(function (x) { return Math.abs(Math.expm1(x.ri)) >= 0.10; }).length,
      lastRetPct: 100 * Math.expm1(lastRi), lastRetDate: R[R.length - 1].d,
      daysAsBadAsLast: win.slice(0, -1).filter(function (x) { return x.ri <= lastRi; }).length
    };
    if (n < 120) return Object.assign({ status: 'vol_only' }, base);
    var f = fit(win), h1 = fit(win.slice(0, n >> 1)), h2 = fit(win.slice(n >> 1));
    var stats = Object.assign({ status: 'ok' }, base, {
      beta: f.beta, betaAdj: adjBeta(f.beta, type),
      residVolPct: 100 * f.sdE, kospiVolPct: 100 * f.sdM, r2: f.r2,
      betaRange: [Math.min(h1.beta, h2.beta), Math.max(h1.beta, h2.beta)],
      betaStable: Math.abs(h1.beta - h2.beta) <= 0.5 && f.r2 >= 0.10,
      calibK: 1.1, calibHit: null, calibN: 0
    });
    var wf = new Map((wfOut || []).map(function (q) { return [q.d, q]; }));
    var ratios = [];
    for (var t = Math.max(120, R.length - 370); t < R.length; t++) {
      var w = wf.get(R[t].d); if (!w || !w.iv[0.8]) continue;
      var past = R.slice(Math.max(0, t - 250), t); if (past.length < 120) continue;
      var p = fit(past);
      var H = (w.iv[0.8][1] - w.iv[0.8][0]) / 2;
      var raw = Math.hypot(adjBeta(p.beta, type) * H, Z80 * p.sdE);
      ratios.push(Math.abs(R[t].ri) / raw);
    }
    if (ratios.length >= 120) {
      var last = ratios.slice(-250).sort(function (a, b) { return a - b; });
      stats.calibK = Math.min(2.0, Math.max(0.7, quantile(last, 0.8)));
      var hits = 0, cnt = 0;
      for (var u = ratios.length - 120; u < ratios.length; u++) {
        var prior = ratios.slice(Math.max(0, u - 250), u); if (prior.length < 60) continue;
        var kq = quantile(prior.slice().sort(function (a, b) { return a - b; }), 0.8);
        hits += ratios[u] <= kq ? 1 : 0; cnt++;
      }
      if (cnt >= 60) { stats.calibHit = hits / cnt; stats.calibN = cnt; }
    }
    return stats;
  }

  // 모델 history(지수 값) → stocks2가 쓰는 wfOut 모양(로그수익률 80% 범위)
  function wfOutFromHistory(history) {
    return (history || []).map(function (h) {
      return { d: h.date, iv: { 0.8: [Math.log(h.lo80 / h.prevClose), Math.log(h.hi80 / h.prevClose)] } };
    });
  }

  function holdingCard(h) {
    var name = h.name, type = h.type, beta = h.beta, dailyVolPct = h.dailyVolPct;
    var kospiLo80Pct = h.kospiLo80Pct, kospiHi80Pct = h.kospiHi80Pct;
    var status = h.status || 'ok', betaAdj = h.betaAdj != null ? h.betaAdj : beta, residVolPct = h.residVolPct != null ? h.residVolPct : null;
    var kospiVolPct = h.kospiVolPct != null ? h.kospiVolPct : null, r2 = h.r2 != null ? h.r2 : null, betaRange = h.betaRange || null;
    var betaStable = h.betaStable !== false, calibK = h.calibK != null ? h.calibK : 1.1, calibHit = h.calibHit != null ? h.calibHit : null;
    var calibN = h.calibN || 0, nDays = h.nDays != null ? h.nDays : 250, move80Pct = h.move80Pct != null ? h.move80Pct : null;
    var bigMoveDays = h.bigMoveDays || 0, desc = h.desc || null, leverage = h.leverage != null ? h.leverage : null;
    var ref = h.ref || 'spx', hedged = !!h.hedged, parking = !!h.parking, proxyLabel = h.proxyLabel || null;
    var overnight = h.overnight || null, amountWon = h.amountWon || null, dayWord = h.dayWord || '내일';
    var lines = [];
    var N = name + U.josa(name, '은', '는');
    var idxName = ref === 'ndx' ? '나스닥' : 'S&P500';
    var push = function () { for (var i = 0; i < arguments.length; i++) if (arguments[i]) lines.push(arguments[i]); };

    if (status === 'stale') return { title: name, kind: 'status', lines: ['최근 거래 자료가 없어요.', '거래가 멈췄거나 자료가 늦게 들어오는 중일 수 있어요. 거래하시는 증권사 앱에서 한번 확인해 보세요.'] };
    if (status === 'too_short') return { title: name, kind: 'status', lines: ['상장된 지 얼마 안 돼서 계산할 자료가 아직 부족해요.'] };
    if (status === 'nodata') return { title: name, kind: 'status', lines: ['아직 시세를 받아오지 못했어요.', '인터넷이 연결되면 다시 받아 올게요.'] };

    var H = (kospiHi80Pct - kospiLo80Pct) / 2;
    var se = residVolPct != null ? residVolPct : Math.sqrt(Math.max(dailyVolPct * dailyVolPct - Math.pow(beta * (kospiVolPct || 0), 2), 0.25 * dailyVolPct * dailyVolPct));
    var linkedX = function () { return Math.min(30, calibK * Math.hypot(betaAdj * H, Z80 * se)); };
    // 검수 S11: '보통 ±X%'가 매일 그만큼 움직인다는 뜻으로 읽히지 않게 '10번 중 8번은 이 안'을 같은 줄에 붙인다.
    var moveLine = function (x, suffix) { return dayWord + '은 10번 중 8번은 ±' + fmt(roundMove(x)) + '% 안에서 움직일 수 있어요.' + (suffix || ''); };
    var hitLine = function () {
      return calibHit != null
        ? '(코스피 범위를 옮겨 본 숫자예요 · 지난 ' + calibN + '일 실제로 이 안에 든 날: 10번 중 ' + Math.round(calibHit * 10) + '번)'
        : '(코스피 범위를 옮겨 본 숫자예요)';
    };
    var amountLine = function (x) { return amountWon ? '넣어 두신 ' + manwon(amountWon) + ' 기준으로는 대략 ±' + manwon(amountWon * roundMove(x) / 100) + '이에요.' : null; };
    var betaLine = function (subj) {
      var a = fmt(Math.abs(beta)), s = subj ? ', ' + subj : '';
      if (beta <= -0.3) return '코스피가 1% 오를 때' + s + ' 보통 ' + a + '% 내렸어요.';
      if (Math.abs(beta) < 0.3) return '지난 1년' + s + ' 코스피와 거의 따로 움직였어요.';
      if (beta >= 0.9 && beta <= 1.1) return '코스피가 1% 움직일 때' + s + ' 보통 1% 안팎으로 비슷하게 움직였어요.';
      return '코스피가 1% 움직일 때' + s + ' 보통 ' + a + '% 움직였어요.';
    };
    var extras = function () {
      var L = [];
      if (status === 'ok' && !betaStable && betaRange) L.push('이 숫자는 기간에 따라 많이 달라졌어요(' + fmt(betaRange[0]) + '~' + fmt(betaRange[1]) + '). 대략으로만 봐 주세요.');
      if (status === 'ok' && nDays < 200) L.push('자료가 1년이 안 돼요(약 ' + Math.max(1, Math.round(nDays / 21)) + '개월). 숫자를 대략으로 봐 주세요.');
      if (status === 'ok' && calibHit != null && calibHit < 0.65) L.push('이 종목은 범위를 벗어난 날이 많았어요. 숫자를 더 넉넉하게 봐 주세요.');
      return L;
    };
    var x;

    if (type === 'stock') {
      if (status === 'vol_only') {
        x = Math.min(30, 1.1 * (move80Pct != null ? move80Pct : Z80 * dailyVolPct));
        push(moveLine(x), '(지난 움직임을 기준으로 잡은 숫자예요)', amountLine(x),
          '상장된 지 얼마 안 돼 코스피와의 관계는 아직 계산하지 않았어요.',
          '※ ' + name + '의 예측이 아니에요. 회사 소식이 있는 날은 이 범위를 벗어날 수 있어요.');
        return { title: name, kind: 'stock_new', lines: lines, x: x };
      }
      var volatile = (kospiVolPct && dailyVolPct / kospiVolPct >= 1.8) || (r2 != null && r2 < 0.15);
      x = linkedX();
      if (!volatile) {
        push.apply(null, [moveLine(x), hitLine(), betaLine(N) + ' (지난 1년)', amountLine(x)].concat(extras(),
          ['※ 코스피 예측을 옮겨 본 숫자예요. ' + name + ' 자체의 예측이 아니에요. 회사 소식이 있는 날은 이 범위를 벗어날 수 있어요.']));
        return { title: name, kind: 'stock_large', lines: lines, x: x };
      }
      push.apply(null, [moveLine(x),
        N + ' 코스피보다 회사 자체 소식(실적·임상·계약 등)에 더 크게 움직여 온 종목이에요.',
        Math.abs(beta) >= 0.3 && beta > 0 ? '코스피가 1% 움직일 때 보통 ' + fmt(beta) + '% 움직였지만, 회사 소식의 영향이 훨씬 컸어요.' : betaLine(N),
        bigMoveDays >= 1 ? '지난 1년 동안 하루에 10% 넘게 움직인 날이 ' + bigMoveDays + '번 있었어요.' : null,
        calibHit != null ? '(지난 ' + calibN + '일 이 범위 안에 든 날: 10번 중 ' + Math.round(calibHit * 10) + '번)' : null,
        amountLine(x)].concat(extras(), ['※ 코스피와 다르게 움직이는 날이 많아요. 이 숫자는 ' + name + '의 예측이 아니에요.']));
      return { title: name, kind: 'stock_volatile', lines: lines, x: x };
    }

    if (type === 'etf_kr' || type === 'fund_kr') {
      x = linkedX();
      var descLine = {
        '코스피200': '코스피 대표 종목 200개를 묶어 따라가는 상품이라, 코스피와 거의 같이 움직여요.',
        '코스닥150': '코스닥 대표 종목 150개를 따라가는 상품이에요. 코스닥은 코스피와 다르게 움직이는 날도 있어요.',
        '반도체': '반도체 회사들을 묶은 상품이에요. 코스피보다 반도체 업황에 더 민감해요.',
        '고배당': '배당을 많이 주는 회사들을 묶은 상품이에요.' + (beta < 0.9 ? ' 보통 코스피보다 덜 출렁였어요.' : '')
      }[desc];
      if (type === 'fund_kr') {
        push(moveLine(x, ' (코스피200을 따라가는 상품 기준)'),
          '국내 주식형 펀드는 대체로 코스피와 같은 방향으로 움직여요. 다만 펀드마다 담은 회사가 달라 차이가 날 수 있어요.',
          '펀드 가격(기준가)은 보통 하루 늦게 바뀌어 보여요. 오늘 시장 움직임이 다음 날 기준가에 반영돼요.',
          amountLine(x), '※ 실제 펀드가 아니라 비슷한 상품으로 계산한 숫자예요.');
        return { title: name, kind: 'fund_kr', lines: lines, x: x };
      }
      push.apply(null, [moveLine(x), descLine, betaLine(), '여러 회사에 나눠 담겨 있어서, 한 회사 소식에는 덜 흔들려요.', amountLine(x)].concat(extras(),
        ['※ 코스피 예측을 옮겨 본 숫자예요. 예측은 틀릴 수 있어요.']));
      return { title: name, kind: 'etf_kr', lines: lines, x: x };
    }

    if (type === 'etf_lev') {
      x = linkedX();
      var what = { 2: '코스피200 하루 움직임의 약 2배로 움직이도록 만든 상품이에요.', '-1': '코스피200이 내리면 오르고, 오르면 내리도록 만든 상품이에요.', '-2': '코스피200이 내리면 약 2배로 오르고, 오르면 약 2배로 내리도록 만든 상품이에요.' }[leverage];
      var note = leverage > 0
        ? "※ '하루' 기준 2배라서, 여러 날이 지나면 코스피 수익의 정확히 2배와 달라질 수 있어요. 오르내림이 반복되면 차이가 쌓여요."
        : "※ '하루' 기준 " + (leverage === -2 ? '반대 2배' : '반대') + '라서, 여러 날이 지나면 정확히 ' + (leverage === -2 ? '반대 2배가' : '반대가') + ' 되지 않을 수 있어요. 오르내림이 반복되면 차이가 쌓여요.';
      push(moveLine(x), what,
        beta < 0 ? '코스피가 1% 오를 때 보통 ' + fmt(-beta) + '% 내렸어요.' : '코스피가 1% 움직일 때 보통 ' + fmt(beta) + '% 움직였어요.',
        amountLine(x), note);
      return { title: name, kind: 'etf_lev', lines: lines, x: x };
    }

    if (type === 'etf_us' || (type === 'fund_global' && move80Pct != null)) {
      var tag = type === 'fund_global' ? ' (' + (proxyLabel || '미국 S&P500 상품 기준') + ')' : '';
      push('미국 주식(' + idxName + ')을 담은 상품이라, 코스피 예측과는 관계가 적어요.', '가격은 주로 전날 밤 미국 시장과 원/달러 환율을 따라 움직여요.');
      if (overnight && overnight.idxPct != null) {
        push(hedged
          ? '어젯밤 미국 ' + idxName + ' ' + signed(overnight.idxPct) + '% — 오늘 가격에 대체로 반영돼요. (환율 영향은 줄여 둔 상품이에요)'
          : '어젯밤 미국 ' + idxName + ' ' + signed(overnight.idxPct) + '%' + (overnight.fxPct != null ? ', 원/달러 환율 ' + signed(overnight.fxPct) + '%' : '') + ' — 오늘 가격에 대체로 반영돼요.');
      }
      push('지난 1년, 10일 중 8일은 하루 ±' + fmt(roundMove(move80Pct)) + '% 안쪽으로 움직였어요.' + tag,
        hedged ? null : '환율이 오르면(원화 약세) 이 상품엔 보탬이 되고, 내리면 반대로 작용해요.',
        type === 'fund_global' ? '해외 시장 움직임은 하루 이틀 늦게 기준가에 반영되기도 해요.' : null,
        '※ 미국 시장 소식을 따로 확인해 보는 게 더 도움이 돼요.');
      return { title: name, kind: 'etf_us', lines: lines };
    }
    if (type === 'fund_global') {
      push('담은 나라의 주식시장과 환율을 따라 움직여요. 코스피 예측과는 관계가 적어요.', '어느 나라 펀드인지 알려 주시면 회준님이 맞는 설명으로 바꿔 드릴 수 있어요.');
      return { title: name, kind: 'fund_global', lines: lines };
    }
    if (type === 'fund_mixed') {
      push('주식과 채권을 섞은 펀드라 코스피보다 덜 움직여요.', '주식 비중이 높을수록 코스피와 비슷하게 움직여요.');
      return { title: name, kind: 'fund_mixed', lines: lines };
    }
    if (type === 'bond') {
      push('채권형은 하루 움직임이 아주 작아요. 코스피와는 거의 같이 움직이지 않아요.',
        move80Pct != null ? '지난 1년, 10일 중 8일은 하루 ±' + fmt(roundMove(move80Pct)) + '% 안쪽이었어요.' + (proxyLabel ? ' (비슷한 채권 상품 기준)' : '') : null,
        '주로 금리에 따라 천천히 움직여요. 금리가 오르면 조금 내리고, 금리가 내리면 조금 올라요.',
        '※ 원금을 약속하는 상품은 아니에요. 그래도 코스피 예측이 나쁜 날에도 영향은 작은 편이에요.');
      return { title: name, kind: 'bond', lines: lines };
    }
    if (type === 'cash' && parking) {
      push('CD금리만큼 매일 조금씩 쌓이는 상품이라, 코스피와 거의 관계없어요.', '하루 움직임이 0.01% 정도로 아주 작아요.', '※ ETF라서 예금자보호 대상은 아니에요.');
      return { title: name, kind: 'cash_parking', lines: lines };
    }
    push('예금·적금은 코스피와 관계없어요.',
      '약속된 이자가 정해져 있어서, 시장이 흔들려도 만기까지 두면 원금과 약정 이자는 그대로예요.',
      '중간에 깨면 이자가 줄어들 수 있어요.',
      '한 금융회사에 1인당 원금과 이자를 합쳐 1억 원까지 보호돼요(2025년 9월 1일부터. 은행·저축은행은 예금보험공사, 새마을금고·신협·농협·수협 등은 각 기금).');
    return { title: name, kind: 'cash', lines: lines };
  }

  // 걱정 배너 (§4-1). holdings: [{name, stats, rows}]
  function worryTrigger(o) {
    var holdings = o.holdings || [];
    if (o.pUp <= 0.35 || o.kospiCenterPct <= -1.5 || o.kospi3dPct <= -7) return { show: true, fact: null };
    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i], s = h.stats;
      if (!s || s.lastRetPct == null) continue;
      if (s.lastRetPct <= -Math.max(5, 2.5 * s.dailyVolPct)) {
        var ld = s.lastRetDate || s.lastDate;
        var md = (+ld.slice(5, 7)) + '월 ' + (+ld.slice(8, 10)) + '일';
        var fact = md + ', ' + h.name + U.josa(h.name, '이', '가') + ' ' + signed(s.lastRetPct) + '% 내렸어요. '
          + (s.daysAsBadAsLast > 0 ? '지난 1년 동안 하루에 이만큼 이상 내린 날은 ' + s.daysAsBadAsLast + '번 있었어요.' : '지난 1년 중 가장 크게 내린 날이에요.');
        return { show: true, fact: fact };
      }
    }
    for (var j = 0; j < holdings.length; j++) {
      var r = holdings[j].rows;
      if (r && r.length > 21 && (r[r.length - 1].c / r[r.length - 21].c - 1) * 100 <= -15) return { show: true, fact: null };
    }
    return { show: false };
  }

  // 카드 머리 줄: 마지막 종가와 전 거래일 대비
  function priceLine(rows) {
    if (!rows || rows.length < 2) return null;
    var a = rows[rows.length - 1], b = rows[rows.length - 2], p = (a.c / b.c - 1) * 100;
    return { date: a.d, close: a.c, pct: p, dir: Math.abs(p) < 0.05 ? 'flat' : p > 0 ? 'up' : 'down' };
  }

  var Holdings = {
    CATALOG: CATALOG, STOCK_GROUPS: STOCK_GROUPS, typeLabel: typeLabel, search: search, parseRows: parseRows,
    alignedReturns: alignedReturns, fit: fit, holdingStats: holdingStats, holdingCard: holdingCard, wfOutFromHistory: wfOutFromHistory,
    worryTrigger: worryTrigger, priceLine: priceLine, roundMove: roundMove, quantile: quantile
  };
  root.Holdings = Holdings;
  if (typeof module !== 'undefined' && module.exports) module.exports = Holdings;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
