/* 반도체 탭 — 메모리 반도체 가격을 두 모델로 본다(2.7.0에서 '이주완' 탭을 이 탭으로 정리).
 * 하위 화면 4개: 한눈에(js/semihub.js) · 사이클 모델(js/memory.js, memory.json) · 이주완 모델(js/semi.js, semi.json) · 주장 점검(이 파일, data/jw.json).
 * 주장 점검: 이주완 박사의 주장을 한국은행 통계와 회사 실적으로 확인한 결과. 판정과 설명은 앱이 쓴 것이고, 영상은 '영상 보기'로 유튜브에서 연다. */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc;
  var DATA = null, loading = null, failed = false;
  var ST = { sub: 'hub', open: {}, more: {} };

  function load() {
    if (DATA || loading) return loading;
    loading = fetch('data/jw.json').then(function (r) { return r.json(); }).then(function (d) { DATA = d; })
      .catch(function () { failed = true; }).then(function () { loading = null; });
    return loading;
  }
  function dLabel(d) { return d.slice(0, 4) + '.' + (+d.slice(5, 7)) + '.' + (+d.slice(8, 10)); }
  function badge(cat, text) { return '<span class="jwb ' + cat + '">' + esc(text || DATA.cats[cat]) + '</span>'; }
  function video(id) { return DATA.videos.filter(function (v) { return v.id === id; })[0]; }

  var SUBS = [['hub', '한눈에'], ['cycle', '사이클 모델'], ['model', '이주완 모델'], ['claims', '주장 점검']];
  var OLD = { sum: 'hub', supply: 'model', rec: 'claims' };
  function subNav() {
    return '<div class="seg sgnav jwnav" role="group" aria-label="반도체 화면">' + SUBS.map(function (x) {
      return '<button type="button" data-act="jwSub" data-s="' + x[0] + '" aria-pressed="' + (ST.sub === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ 주장 점검(맨 위 요약)
  function claimsTop(H, mounts) {
    var D = DATA, out = [];
    out.push(H.card('<div class="sghead"><div><b>' + esc(D.person) + '</b> · ' + esc(D.role) + '</div><p class="sub">' + esc(D.intro) + ' 통계는 ' + esc(D.dataTo.slice(0, 4)) + '년 ' + (+D.dataTo.slice(5, 7)) + '월까지, 실적·전망은 ' + dLabel(D.asOf) + '까지예요.</p></div>' +
      '<h3 class="sgh3">핵심 주장 세 가지</h3>' + D.big.map(function (b) {
        return '<div class="jwbig">' + badge(b.cat, b.label) + '<h3>' + esc(b.claim) + '</h3><p>' + esc(b.plain) + '</p></div>';
      }).join('')));
    var cnt = {}; D.claims.forEach(function (c) { cnt[c.cat] = (cnt[c.cat] || 0) + 1; });
    var rc = { ok: 0, no: 0, wait: 0 }; D.record.forEach(function (r) { rc[r.res]++; });
    out.push(H.card(H.head('점검 결과', '주장 ' + D.claims.length + '개 판정 · 전망 ' + D.record.length + '개 결과') +
      '<div class="jwtally">' + ['ok', 'part', 'no', 'wait', 'na'].filter(function (k) { return cnt[k]; }).map(function (k) {
        return '<div class="jwt ' + k + '"><b class="num">' + cnt[k] + '</b><small>' + esc(D.cats[k]) + '</small></div>';
      }).join('') + '</div>' +
      '<p class="note" style="margin-top:0">전망은 결과가 나온 ' + (rc.ok + rc.no) + '건 중 ' + rc.ok + '건 맞음, ' + rc.no + '건 틀림, ' + rc.wait + '건 진행 중이에요.</p>'));
    out.push(H.card(H.head(D.chart.title, D.chart.note) + H.chartBox('c-jwpv') +
      '<div class="legend"><span><i class="sw" style="background:var(--up)"></i>D램 가격 (위)</span><span><i class="sw" style="background:var(--band-1)"></i>반도체 생산</span><span><i class="sw" style="background:var(--band-3)"></i>수출 물량</span></div>' +
      '<p class="note">막대는 1년 전 같은 분기와 비교한 변화예요. 막대를 누르면 숫자가 보여요</p>'));
    mounts.push(function () { H.Ch.jwPriceVol(H.$('c-jwpv'), { rows: D.chart.rows, from: '2024-1' }); });
    return out.join('');
  }
  function moreBtn(key, open, label, sub) {
    return '<button type="button" class="card moreb" data-act="jwMore" data-k="' + key + '" aria-expanded="' + !!open + '"><b>' + esc(open ? label + ' 접기' : label + ' 보기') + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
  }
  function claimsExtra(H) {
    var D = DATA, out = [], M = ST.more;
    if (D.disc) {
      out.push(moreBtn('disc', M.disc, '회사 공시로 다시 확인한 결과', '삼성전자·SK하이닉스·마이크론 생산·재고·설비투자'));
      if (M.disc) {
        var B = D.disc.bars, mx = Math.max.apply(null, B.rows.map(function (r) { return Math.abs(r[1]); }));
        out.push(H.card(H.head(D.disc.title, D.disc.sub) +
          '<p class="jwbl">' + esc(B.label) + '</p><ul class="jwbars">' + B.rows.map(function (r) {
            var w = (Math.abs(r[1]) / mx * 50).toFixed(1);
            return '<li><span class="jwbn">' + esc(r[0]) + '</span><span class="jwbt"><i class="' + (r[1] >= 0 ? 'p' : 'n') + '" style="width:' + w + '%"></i></span><b class="num ' + (r[1] >= 0 ? '' : 'dn') + '">' + (r[1] > 0 ? '+' : r[1] < 0 ? '−' : '') + Math.abs(Math.round(r[1])) + '%</b></li>';
          }).join('') + '</ul>' +
          D.disc.points.map(function (b) { return '<div class="jwbig">' + badge(b.cat, b.label) + '<h3>' + esc(b.title) + '</h3><p>' + esc(b.plain) + '</p></div>'; }).join('')));
      }
    }
    out.push(moreBtn('terms', M.terms, '쉬운 용어와 확인한 영상', '용어 ' + D.terms.length + '개 · 영상 ' + D.videos.length + '편'));
    if (M.terms) {
      out.push(H.card(H.head('쉬운 용어', null) + '<dl class="sgterms">' + D.terms.map(function (t) { return '<div><dt>' + esc(t.t) + '</dt><dd>' + esc(t.p) + '</dd></div>'; }).join('') + '</dl>'));
      out.push(H.card(H.head('확인한 영상', null) + '<ul class="jwvids">' + D.videos.map(function (v) {
        return '<li><div><small class="num">' + dLabel(v.date) + ' · ' + esc(v.ch) + '</small><b>' + esc(v.title) + '</b></div><button type="button" class="btn ghost" data-act="jwVid" data-id="' + esc(v.id) + '">영상 보기</button></li>';
      }).join('') + '</ul>'));
    }
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
    var D = DATA, R = D.record, all = !!ST.more.rec, shown = all ? R : R.slice(0, 4);
    var resTxt = { ok: '맞음', no: '틀림', wait: '진행 중' };
    return H.card(H.head('박사의 전망, 맞았을까요?', '영상에서 말한 전망을 실제와 비교 · 최신순') +
      '<ul class="jwrec">' + shown.map(function (r) {
        return '<li><div class="jwrh"><span class="num">' + dLabel(r.when) + '</span>' + badge(r.res === 'ok' ? 'ok' : r.res, resTxt[r.res]) + '</div><b>' + esc(r.claim) + '</b><small>' + esc(r.ev) + '</small></li>';
      }).join('') + '</ul>' +
      (R.length > 4 ? '<button type="button" class="btn ghost wide" data-act="jwMore" data-k="rec">' + (all ? '접기' : '전망 ' + R.length + '개 모두 보기') + '</button>' : '') +
      '<p class="note">맞은 건 주로 실적·주가 같은 단기 전망이고, 빗나간 것에는 \'2025년 하반기 메모리 하락\'이라는 핵심 전망이 있어요</p>');
  }

  // 세 자료(주장 점검 jw.json, 이주완 모델 semi.json, 사이클 모델 memory.json)를 모두 불러온다. 다 오면 다시 그린다.
  var kicked = false;
  function ensureAll(H) {
    if (kicked) return; kicked = true;
    var ps = [load()];
    if (root.SemiPage) ps.push(root.SemiPage.load(false));
    if (root.MemoryPage) ps.push(root.MemoryPage.load(null));
    Promise.all(ps.map(function (p) { return Promise.resolve(p).catch(function () {}); })).then(function () { H.render(); });
  }

  // H: app.js가 넘겨 주는 도구 {card, head, chartBox, $, Ch, setBar, render, keep, openUrl, payload}
  function page(H) {
    H.setBar('반도체 · 메모리 가격', '', false);
    ensureAll(H);
    if (OLD[ST.sub]) ST.sub = OLD[ST.sub];
    var mounts = [], body;
    if (ST.sub === 'model' && root.SemiPage) return { html: subNav() + root.SemiPage.view(H, 'model', mounts), mounts: mounts };
    if (ST.sub === 'cycle' && root.MemoryPage) return { html: subNav() + root.MemoryPage.view(H, mounts), mounts: mounts };
    if (ST.sub === 'hub' && root.SemiHub) return { html: subNav() + root.SemiHub.view(H, mounts), mounts: mounts };
    if (!DATA) {
      if (failed) return { html: subNav() + H.card('<div class="empty"><h2>자료를 열지 못했어요</h2></div>') };
      return { html: subNav() + H.card('<div class="empty"><h2>점검 자료를 여는 중</h2></div>') };
    }
    body = claimsTop(H, mounts) + pageClaims(H) + pageRec(H) + claimsExtra(H);
    return { html: subNav() + body + '<p class="foot">판정과 설명은 앱이 쓴 것이에요 · 자료: ' + esc(DATA.sources) + '<br>통계적 참고용 · 투자 권유 아님 · ' + dLabel(DATA.asOf) + ' 기준</p>', mounts: mounts };
  }

  function onAct(act, d, H) {
    switch (act) {
      case 'jwSub': ST.sub = d.s; H.render(); root.scrollTo(0, 0); return true;
      case 'jwToggle': ST.open[d.id] = !ST.open[d.id]; H.keep(); return true;
      case 'jwMore': ST.more[d.k] = !ST.more[d.k]; H.keep(); return true;
      case 'jwAll':
        var all = DATA.claims.every(function (c) { return ST.open[c.id]; });
        DATA.claims.forEach(function (c) { ST.open[c.id] = !all; }); H.keep(); return true;
      case 'jwVid': H.openUrl('https://youtu.be/' + d.id); return true;
      case 'jwCycItem': return !!(root.MemoryPage && root.MemoryPage.onAct(act, d, H));
    }
    return false;
  }
  function setState(o) {
    for (var k in o) ST[k] = o[k];
    if (OLD[ST.sub]) { if (ST.sub === 'supply' && root.SemiPage) root.SemiPage.setState({ more: true }); ST.sub = OLD[ST.sub]; }
    if (o && o.cycItem && root.MemoryPage) root.MemoryPage.setState({ item: o.cycItem });
  }
  // 앱을 켤 때 미리 불러 둔다(예측 탭의 반도체 한 줄에 씀)
  function preload(H) { ensureAll(H); }

  root.JwPage = { page: page, onAct: onAct, load: load, setState: setState, preload: preload, data: function () { return DATA; } };
})(window);
