/* 이주완 페이지 — 이주완 박사의 메모리 반도체 주장을 한국은행 통계와 회사 실적으로 확인한 결과(data/jw.json).
 * 하위 화면: 요약 · 모델 · 공급 · 사이클 · 주장 · 기록. 판정과 설명은 앱이 쓴 것이고, 영상은 '영상 보기'로 유튜브에서 연다.
 * '모델'·'공급'은 js/semi.js가 그린다(매일 자동으로 새로 계산되는 공급 모델 자료 semi.json).
 * '사이클'은 js/memory.js가 그린다(D램·낸드 수출가격으로 본 가격 사이클, memory.json). */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc;
  var DATA = null, loading = null, failed = false;
  var ST = { sub: 'sum', open: {} };
  var LIVE = [['MU', '마이크론'], ['^SOX', 'SOX(미국 반도체)'], ['^KS11', '코스피']];

  function load() {
    if (DATA || loading) return loading;
    loading = fetch('data/jw.json').then(function (r) { return r.json(); }).then(function (d) { DATA = d; })
      .catch(function () { failed = true; }).then(function () { loading = null; });
    return loading;
  }
  function dLabel(d) { return d.slice(0, 4) + '.' + (+d.slice(5, 7)) + '.' + (+d.slice(8, 10)); }
  function mdLabel(d) { return (+d.slice(5, 7)) + '월 ' + (+d.slice(8, 10)) + '일'; }
  function badge(cat, text) { return '<span class="jwb ' + cat + '">' + esc(text || DATA.cats[cat]) + '</span>'; }
  function video(id) { return DATA.videos.filter(function (v) { return v.id === id; })[0]; }

  // 앱 시세 자료에서 지표 최신 값·변화 (성상현 탭과 같은 방식)
  function live(sym, P) {
    var F = P && P.fresh; if (!F) return null;
    var it = F.items.filter(function (x) { return x.sym === sym; })[0];
    if (!it || it.value == null) return null;
    var ch = it.prev ? (it.value / it.prev - 1) * 100 : null;
    return { v: it.value >= 1000 ? U.fmtInt(it.value) : it.value.toFixed(2), c: ch == null ? '' : U.signPct(ch), up: ch > 0 };
  }

  function subNav() {
    return '<div class="seg sgnav jwnav" role="group" aria-label="이주완 화면">' + [['sum', '요약'], ['model', '모델'], ['supply', '공급'], ['cycle', '사이클'], ['claims', '주장'], ['rec', '기록']].map(function (x) {
      return '<button type="button" data-act="jwSub" data-s="' + x[0] + '" aria-pressed="' + (ST.sub === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ 요약
  function pageSum(H, P, mounts) {
    var D = DATA, out = [];
    out.push(H.card('<div class="sghead"><div><b>' + esc(D.person) + '</b> · ' + esc(D.role) + '</div><p class="sub">' + esc(D.intro) + ' 통계는 ' + esc(D.dataTo.slice(0, 4)) + '년 ' + (+D.dataTo.slice(5, 7)) + '월까지, 실적·전망은 ' + dLabel(D.asOf) + '까지예요.</p></div>'));
    out.push(H.card(H.head('한눈에 보기', '박사의 핵심 주장 세 가지') + D.big.map(function (b) {
      return '<div class="jwbig">' + badge(b.cat, b.label) + '<h3>' + esc(b.claim) + '</h3><p>' + esc(b.plain) + '</p></div>';
    }).join('')));
    var cnt = {}; D.claims.forEach(function (c) { cnt[c.cat] = (cnt[c.cat] || 0) + 1; });
    out.push(H.card(H.head('주장 ' + D.claims.length + '개 점검 결과', null) +
      '<div class="jwtally">' + ['ok', 'part', 'no', 'wait', 'na'].filter(function (k) { return cnt[k]; }).map(function (k) {
        return '<div class="jwt ' + k + '"><b class="num">' + cnt[k] + '</b><small>' + esc(D.cats[k]) + '</small></div>';
      }).join('') + '</div>' +
      '<button type="button" class="btn ghost wide" data-act="jwSub" data-s="claims">주장 하나씩 보기</button>'));
    if (D.disc) {
      var B = D.disc.bars, mx = Math.max.apply(null, B.rows.map(function (r) { return Math.abs(r[1]); }));
      out.push(H.card(H.head(D.disc.title, D.disc.sub) +
        '<p class="jwbl">' + esc(B.label) + '</p><ul class="jwbars">' + B.rows.map(function (r) {
          var w = (Math.abs(r[1]) / mx * 50).toFixed(1);
          return '<li><span class="jwbn">' + esc(r[0]) + '</span><span class="jwbt"><i class="' + (r[1] >= 0 ? 'p' : 'n') + '" style="width:' + w + '%"></i></span><b class="num ' + (r[1] >= 0 ? '' : 'dn') + '">' + (r[1] > 0 ? '+' : r[1] < 0 ? '−' : '') + Math.abs(Math.round(r[1])) + '%</b></li>';
        }).join('') + '</ul>' +
        D.disc.points.map(function (b) { return '<div class="jwbig">' + badge(b.cat, b.label) + '<h3>' + esc(b.title) + '</h3><p>' + esc(b.plain) + '</p></div>'; }).join('')));
    }
    out.push(H.card(H.head(D.chart.title, D.chart.note) + H.chartBox('c-jwpv') +
      '<div class="legend"><span><i class="sw" style="background:var(--up)"></i>D램 가격 (위)</span><span><i class="sw" style="background:var(--band-1)"></i>반도체 생산</span><span><i class="sw" style="background:var(--band-3)"></i>수출 물량</span></div>' +
      '<p class="note">막대는 1년 전 같은 분기와 비교한 변화예요. 막대를 누르면 숫자가 보여요</p>'));
    mounts.push(function () { H.Ch.jwPriceVol(H.$('c-jwpv'), { rows: D.chart.rows, from: '2024-1' }); });
    var lv = LIVE.map(function (x) { var L = live(x[0], P); return L ? '<li><b>' + esc(x[1]) + '</b><span class="sgv num"><b>' + esc(L.v) + '</b><small class="' + (L.up ? 'up-t' : 'down-t') + '">' + esc(L.c) + '</small></span></li>' : ''; }).join('');
    out.push(H.card(H.head('메모리 가격, 꺾였나요?', '지금 나온 신호를 양쪽으로 나눠 봤어요') +
      '<div class="jwsig"><div><h3 class="dn">꺾일 수 있다는 신호</h3><ul>' + D.signals.peak.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' +
      '<div><h3 class="upc">아직 오른다는 신호</h3><ul>' + D.signals.up.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div></div>' +
      (lv ? '<div class="sglives"><small>앱 시세로 본 반도체 관련 지표 (전날 대비)</small><ul class="jwlive">' + lv + '</ul></div>' : '')));
    out.push(H.card(H.head('앞으로 이걸 보면 돼요', '누구 말이 맞는지 가려 줄 일정') + '<ul class="jwwatch">' + D.watch.map(function (w) {
      return '<li><div class="jwd num">' + (w.date ? esc(mdLabel(w.date)) : '수시로') + '</div><div><b>' + esc(w.what) + '</b><small>' + esc(w.look) + '</small></div></li>';
    }).join('') + '</ul>'));
    out.push(H.card(H.head('쉬운 용어', null) + '<dl class="sgterms">' + D.terms.map(function (t) { return '<div><dt>' + esc(t.t) + '</dt><dd>' + esc(t.p) + '</dd></div>'; }).join('') + '</dl>'));
    out.push(H.card(H.head('확인한 영상', null) + '<ul class="jwvids">' + D.videos.map(function (v) {
      return '<li><div><small class="num">' + dLabel(v.date) + ' · ' + esc(v.ch) + '</small><b>' + esc(v.title) + '</b></div><button type="button" class="btn ghost" data-act="jwVid" data-id="' + esc(v.id) + '">영상 보기</button></li>';
    }).join('') + '</ul>'));
    return out.join('');
  }

  // ------------------------------------------------------------------ 주장 점검
  function claimRow(c) {
    var open = !!ST.open[c.id], v = video(c.v);
    var head = '<button type="button" class="sp-h" data-act="jwToggle" data-id="' + c.id + '" aria-expanded="' + open + '">' +
      '<span class="sp-m">' + badge(c.cat, c.label) + ' <span class="num">' + dLabel(c.when) + '</span>' + (v ? ' · ' + esc(v.ch) : '') + '</span>' +
      '<span class="sp-t">' + esc(c.claim) + '</span></button>';
    if (!open) return '<li class="sp">' + head + '</li>';
    return '<li class="sp open">' + head + '<div class="sp-b"><div class="sgbox"><b>쉽게 말하면</b><p>' + esc(c.plain) + '</p></div>' +
      '<h3 class="sgh3">근거</h3><ul class="sgdots">' + c.ev.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
      (v ? '<div class="sp-act"><button type="button" class="btn ghost" data-act="jwVid" data-id="' + esc(v.id) + '">이 영상 보기</button></div>' : '') + '</div></li>';
  }
  function pageClaims(H) {
    var D = DATA;
    return H.card(H.head('주장 하나씩 점검', '누르면 쉬운 설명과 근거가 열려요') +
      '<div class="legend jwleg">' + ['part', 'no', 'wait', 'na'].map(function (k) { return '<span>' + badge(k) + '</span>'; }).join('') + '</div>' +
      '<ul class="splist">' + D.claims.map(claimRow).join('') + '</ul>' +
      '<button type="button" class="btn ghost wide" data-act="jwAll">' + (Object.keys(ST.open).filter(function (k) { return ST.open[k]; }).length === D.claims.length ? '모두 접기' : '모두 펼치기') + '</button>');
  }

  // ------------------------------------------------------------------ 예측 기록
  function pageRec(H) {
    var D = DATA, R = D.record, c = { ok: 0, no: 0, wait: 0 };
    R.forEach(function (r) { c[r.res]++; });
    var done = c.ok + c.no;
    var resTxt = { ok: '맞음', no: '틀림', wait: '진행 중' };
    return H.card(H.head('박사의 예측, 맞았을까요?', '영상에서 말한 전망을 실제와 비교했어요') +
      '<div class="jwtally"><div class="jwt ok"><b class="num">' + c.ok + '</b><small>맞음</small></div><div class="jwt no"><b class="num">' + c.no + '</b><small>틀림</small></div><div class="jwt wait"><b class="num">' + c.wait + '</b><small>진행 중</small></div></div>' +
      '<p class="note">결과가 나온 ' + done + '건 중 ' + c.ok + '건이 맞았어요. 맞은 건 주로 실적·주가 같은 단기 전망이고, 빗나간 것에는 \'2025년 하반기 메모리 하락\'이라는 핵심 전망이 있어요</p>') +
      H.card('<ul class="jwrec">' + R.map(function (r) {
        return '<li><div class="jwrh"><span class="num">' + dLabel(r.when) + '</span>' + badge(r.res === 'ok' ? 'ok' : r.res, resTxt[r.res]) + '</div><b>' + esc(r.claim) + '</b><small>' + esc(r.ev) + '</small></li>';
      }).join('') + '</ul>');
  }

  // H: app.js가 넘겨 주는 도구 {card, head, chartBox, $, Ch, setBar, render, keep, openUrl, payload}
  function page(H) {
    H.setBar('이주완 · 반도체 주장 점검', '', false);
    if (!DATA) {
      if (failed) return { html: H.card('<div class="empty"><h2>자료를 열지 못했어요</h2></div>') };
      load().then(H.render);
      return { html: H.card('<div class="empty"><h2>점검 자료를 여는 중</h2></div>') };
    }
    var mounts = [], body;
    if ((ST.sub === 'model' || ST.sub === 'supply') && root.SemiPage) return { html: subNav() + root.SemiPage.view(H, ST.sub, mounts), mounts: mounts };
    if (ST.sub === 'cycle' && root.MemoryPage) return { html: subNav() + root.MemoryPage.view(H, mounts), mounts: mounts };
    if (ST.sub === 'claims') body = pageClaims(H);
    else if (ST.sub === 'rec') body = pageRec(H);
    else body = pageSum(H, H.payload, mounts);
    return { html: subNav() + body + '<p class="foot">판정과 설명은 앱이 쓴 것이에요 · 자료: ' + esc(DATA.sources) + '<br>통계적 참고용 · 투자 권유 아님 · ' + dLabel(DATA.asOf) + ' 기준</p>', mounts: mounts };
  }

  function onAct(act, d, H) {
    switch (act) {
      case 'jwSub': ST.sub = d.s; H.render(); root.scrollTo(0, 0); return true;
      case 'jwToggle': ST.open[d.id] = !ST.open[d.id]; H.keep(); return true;
      case 'jwAll':
        var all = DATA.claims.every(function (c) { return ST.open[c.id]; });
        DATA.claims.forEach(function (c) { ST.open[c.id] = !all; }); H.keep(); return true;
      case 'jwVid': H.openUrl('https://youtu.be/' + d.id); return true;
      case 'jwCycItem': return !!(root.MemoryPage && root.MemoryPage.onAct(act, d, H));
    }
    return false;
  }
  function setState(o) { for (var k in o) ST[k] = o[k]; if (o && o.cycItem && root.MemoryPage) root.MemoryPage.setState({ item: o.cycItem }); }

  root.JwPage = { page: page, onAct: onAct, load: load, setState: setState };
})(window);
