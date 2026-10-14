/* 성상현 페이지 (베타) — 블로그 '매크로 비욘드'(성상현) 글 1,170개를 앱이 분석·요약한 자료(data/sung.json)를 보여 준다.
 * 원문은 옮기지 않고, 요약은 앱이 쓴 것이며, 원문은 '원문 보기'로 블로그에서 연다.
 * 하위 화면: 요약 · 주제 · 글 · 원칙·용어 */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc;
  var DATA = null, loading = null, failed = false;
  var SHORT = ['연준', '금리·채권', '물가', '재정·부채', '달러·환율', 'AI·반도체', '빅테크', '유가·원자재', '고용·경기', '중국·신흥국', '한국 증시', '자산배분', '투자 마인드', '금·대체자산', '신용·유동성', '지정학·정책'];
  var MODEL_NAMES = { '^TNX': '미국 10년물 금리', '^SOX': 'SOX(미국 반도체)', MU: '마이크론', '^IXIC': '나스닥', 'KRW=X': '원/달러 환율', EEM: 'EEM(신흥국)', HYG: 'HYG(하이일드)', '^KS11': '코스피', EWY: 'EWY(한국 ETF)', '^VIX': 'VIX(변동성)' };
  var ST = { sub: 'sum', theme: 5, q: '', cat: -1, kind: -1, th: -1, sort: 'new', fav: false, limit: 30, open: {}, termQ: '' };
  var FAV_KEY = 'mc.sungFav';

  function favs() { try { return JSON.parse(root.localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } }
  function setFavs(a) { try { root.localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch (e) { /* 메모리만 */ } }
  function load() {
    if (DATA || loading) return loading;
    loading = fetch('data/sung.json').then(function (r) { return r.json(); }).then(function (d) {
      DATA = d; d.byId = {}; d.posts.forEach(function (p) { d.byId[p.id] = p; });
    }).catch(function () { failed = true; }).then(function () { loading = null; });
    return loading;
  }
  function url(id) { return DATA.source.url + '/' + id; }
  function ymLabel(ym) { return ym.slice(0, 4) + '년 ' + (+ym.slice(5, 7)) + '월'; }
  function dLabel(d) { return d.slice(0, 4) + '.' + (+d.slice(5, 7)) + '.' + (+d.slice(8, 10)); }

  // 글 링크 칩(관련 글)
  function refs(ids) {
    return '<div class="srefs">' + ids.map(function (id) {
      var p = DATA.byId[id]; if (!p) return '';
      return '<button type="button" class="sref" data-act="sgPost" data-id="' + id + '"><span class="num">' + dLabel(p.d) + '</span>' + esc(p.o) + '</button>';
    }).join('') + '</div>';
  }
  function postRow(p, open) {
    var fav = favs().indexOf(p.id) >= 0;
    var head = '<button type="button" class="sp-h" data-act="sgToggle" data-id="' + p.id + '" aria-expanded="' + !!open + '">' +
      '<span class="sp-m"><span class="num">' + dLabel(p.d) + '</span> · ' + esc(DATA.cats[p.c]) + (p.val >= 5 ? ' · <b class="sp-star">핵심</b>' : '') + '</span>' +
      '<span class="sp-t">' + esc(p.o) + '</span><span class="sp-tt">' + esc(p.t) + '</span></button>';
    if (!open) return '<li class="sp">' + head + '</li>';
    var body = '<div class="sp-b"><p>' + esc(p.s) + '</p>' +
      (p.v ? '<p class="sp-v"><b>관점</b> ' + esc(p.v) + '</p>' : '') +
      (p.p ? '<p class="sp-v"><b>원칙</b> ' + esc(p.p) + '</p>' : '') +
      '<div class="sp-tags">' + p.th.map(function (t) { return '<button type="button" class="tag" data-act="sgTheme" data-t="' + t + '">' + esc(SHORT[t]) + '</button>'; }).join('') + '</div>' +
      '<div class="sp-act"><button type="button" class="btn ghost" data-act="sgOpen" data-id="' + p.id + '">원문 보기</button>' +
      '<button type="button" class="btn ghost" data-act="sgFav" data-id="' + p.id + '" aria-pressed="' + fav + '">' + (fav ? '★ 저장됨' : '☆ 저장') + '</button></div></div>';
    return '<li class="sp open">' + head + body + '</li>';
  }

  // 앱 시세 자료에서 지표 최신 값·변화
  function live(sym, P) {
    var F = P && P.fresh; if (!F || !sym) return null;
    var it = F.items.filter(function (x) { return x.sym === sym; })[0];
    if (!it || it.value == null) return null;
    var ch = it.prev ? (sym === '^TNX' ? it.value - it.prev : (it.value / it.prev - 1) * 100) : null;
    var v = sym === '^TNX' ? it.value.toFixed(2) + '%' : it.value >= 1000 ? U.fmtInt(it.value) : it.value.toFixed(2);
    var c = ch == null ? '' : sym === '^TNX' ? (ch >= 0 ? '+' : '−') + Math.abs(ch).toFixed(2) + '%p' : U.signPct(ch);
    return { v: v, c: c, up: ch > 0, d: it.last };
  }

  // ------------------------------------------------------------------ 하위 화면
  function subNav() {
    return '<div class="seg sgnav" role="group" aria-label="성상현 화면">' + [['sum', '요약'], ['theme', '주제'], ['posts', '글'], ['learn', '원칙·용어']].map(function (x) {
      return '<button type="button" data-act="sgSub" data-s="' + x[0] + '" aria-pressed="' + (ST.sub === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function pageSum(H, P, mounts) {
    var D = DATA, s = D.source, out = [];
    out.push(H.card('<div class="sghead"><div><b>매크로 비욘드</b> · ' + esc(s.author) + '</div><p class="sub">블로그 글 <b class="num">' + U.fmtInt(s.total) + '</b>개 (' + dLabel(s.first) + ' ~ ' + dLabel(s.last) + ') 중 사진 모음을 뺀 ' + U.fmtInt(s.analyzed) + '개를 앱이 모두 읽고 정리했어요. 요약은 앱이 쓴 것이고, 원문은 \'원문 보기\'로 열려요.</p></div>'));
    out.push(H.card(H.head('지금 그가 보는 시장', dLabel(D.asOf) + ' 글까지 반영') + D.now.map(function (n, i) {
      return '<div class="sgnow"><div class="sgn-i num">' + (i + 1) + '</div><div><h3>' + esc(n.title) + '</h3><p>' + esc(n.text) + '</p>' + refs(n.ids) + '</div></div>';
    }).join('')));
    out.push(H.card(H.head('그가 지금 확인하는 신호', '앱이 받은 최신 시세와 함께') + '<ul class="sgwatch">' + D.watch.map(function (w) {
      var L = live(w.model, P);
      return '<li><div><b>' + esc(w.name) + '</b><small>' + esc(w.why) + '</small></div>' +
        (L ? '<div class="sgv num"><small>' + esc(MODEL_NAMES[w.model] || '') + '</small><b>' + esc(L.v) + '</b><small class="' + (L.up ? 'up-t' : 'down-t') + '">' + esc(L.c) + '</small></div>' : '<div class="sgv"><small>앱 시세에 없음</small></div>') + '</li>';
    }).join('') + '</ul>'));
    var top = D.themes.map(function (t, i) { return { i: i, n: t.n }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
    out.push(H.card(H.head('관심 주제의 흐름', '달마다 각 주제를 다룬 글 수 · 진할수록 많이 씀') + H.chartBox('c-sgheat')));
    mounts.push(function () { H.Ch.heat(H.$('c-sgheat'), { rows: top.map(function (x) { return { name: SHORT[x.i], values: D.themes[x.i].monthly }; }), months: D.months }); });
    out.push(H.card(H.head('시기별 생각의 흐름', '그때그때 무엇을 걱정하고 기대했는지') + '<ol class="sgtl">' + D.eras.slice().reverse().map(function (e) {
      return '<li class="t' + (e.tone > 0 ? 'p' : e.tone < 0 ? 'n' : 'z') + '"><div class="sgtl-d num">' + esc(e.from.replace('-', '.')) + ' ~ ' + esc(e.to.replace('-', '.')) + '</div><h3>' + esc(e.title) + '</h3><p>' + esc(e.text) + '</p>' + refs(e.ids) + '</li>';
    }).join('') + '</ol><div class="legend"><span><i class="dot" style="background:var(--up)"></i>대체로 낙관</span><span><i class="dot" style="background:var(--muted)"></i>중립</span><span><i class="dot" style="background:var(--down)"></i>경계</span></div>'));
    out.push(H.card(H.head('그가 시장을 읽는 틀', '글 전체에서 되풀이되는 생각 6가지') + D.frame.map(function (f) {
      return '<div class="sgframe"><h3>' + esc(f.title) + '</h3><p>' + esc(f.text) + '</p>' + refs(f.ids) + '</div>';
    }).join('')));
    out.push(H.card(H.head('주요 전망 글', '분기·반기 전망과 시장 진단') + '<ul class="splist">' + D.outlooks.map(function (id) { return postRow(D.byId[id], !!ST.open[id]); }).join('') + '</ul>'));
    return out.join('');
  }
  function pageTheme(H, P, mounts) {
    var D = DATA, t = D.themes[ST.theme], out = [];
    out.push(H.card('<div class="sgchips">' + D.themes.map(function (x, i) {
      return '<button type="button" class="chipbtn" data-act="sgTheme" data-t="' + i + '" aria-pressed="' + (i === ST.theme) + '">' + esc(SHORT[i]) + ' <span class="num">' + x.n + '</span></button>';
    }).join('') + '</div>'));
    var lives = (t.model || []).map(function (m) { var L = live(m, P); return L ? '<span class="sglive"><b>' + esc(MODEL_NAMES[m] || m) + '</b> <span class="num">' + esc(L.v) + '</span> <small class="' + (L.up ? 'up-t' : 'down-t') + '">' + esc(L.c) + '</small></span>' : ''; }).join('');
    out.push(H.card('<p class="sgk">' + esc(t.name) + ' · 글 ' + t.n + '개</p><h2 class="sgtitle">' + esc(t.headline) + '</h2>' +
      '<div class="sgbox"><b>쉽게 말하면</b><p>' + esc(t.plain) + '</p></div>' +
      '<h3 class="sgh3">그의 일관된 관점</h3><p class="sgp">' + esc(t.core) + '</p>' +
      '<h3 class="sgh3">요즘 생각 (2026년 9~10월)</h3><p class="sgp">' + esc(t.now) + '</p>' +
      '<h3 class="sgh3">그가 보라고 하는 신호</h3><ul class="sgdots">' + t.watch.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
      (lives ? '<div class="sglives"><small>앱 시세로 본 관련 지표</small>' + lives + '</div>' : '')));
    out.push(H.card(H.head('이 주제를 쓴 달', '막대를 누르면 그 달 글 수') + H.chartBox('c-sgbars')));
    mounts.push(function () { H.Ch.monthBars(H.$('c-sgbars'), { values: t.monthly, months: D.months, name: t.name }); });
    out.push(H.card(H.head('생각의 변화', null) + '<ol class="sgtl">' + t.shifts.map(function (x) {
      return '<li class="tz"><div class="sgtl-d">' + esc(x.period) + '</div><p>' + esc(x.text) + '</p>' + refs(x.ids) + '</li>';
    }).join('') + '</ol>'));
    out.push(H.card(H.head('먼저 읽어 볼 글', null) + '<ul class="splist">' + t.best.map(function (id) { return postRow(D.byId[id], !!ST.open[id]); }).join('') + '</ul>' +
      '<button type="button" class="btn ghost wide" data-act="sgThemePosts" data-t="' + ST.theme + '">이 주제 글 모두 보기</button>'));
    return out.join('');
  }
  function filtered() {
    var D = DATA, q = ST.q.trim().toLowerCase(), F = favs();
    var a = D.posts.filter(function (p) {
      if (ST.fav && F.indexOf(p.id) < 0) return false;
      if (ST.cat >= 0 && p.c !== ST.cat) return false;
      if (ST.th >= 0 && p.th.indexOf(ST.th) < 0) return false;
      if (q && (p.t + ' ' + p.o + ' ' + p.s + ' ' + p.v).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (ST.sort === 'new') a = a.slice().reverse();
    else if (ST.sort === 'like') a = a.slice().sort(function (x, y) { return y.lk - x.lk; });
    else a = a.slice().sort(function (x, y) { return y.val - x.val || (y.d > x.d ? 1 : -1); });
    return a;
  }
  function pagePosts(H) {
    var D = DATA, a = filtered(), shown = a.slice(0, ST.limit);
    var sel = function (id, cur, opts) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; };
    var f = '<div class="sgfilter"><input id="sgQ" type="search" placeholder="제목·요약에서 찾기 (예: 장기금리, 메모리)" value="' + esc(ST.q) + '" aria-label="글 찾기">' +
      '<div class="sgsel">' + sel('sgCat', ST.cat, [[-1, '모든 분류']].concat(D.cats.map(function (c, i) { return [i, c]; }))) +
      sel('sgTh', ST.th, [[-1, '모든 주제']].concat(SHORT.map(function (c, i) { return [i, c]; }))) +
      sel('sgSort', ST.sort, [['new', '최신순'], ['key', '핵심 먼저'], ['like', '공감 많은 순']]) + '</div>' +
      '<label class="sgfav"><input type="checkbox" id="sgFavOnly"' + (ST.fav ? ' checked' : '') + '> 저장한 글만</label></div>';
    var list = shown.length ? '<ul class="splist">' + shown.map(function (p) { return postRow(p, !!ST.open[p.id]); }).join('') + '</ul>' : '<p class="note">맞는 글이 없어요</p>';
    return H.card(f + '<p class="sub" style="margin-top:10px">' + U.fmtInt(a.length) + '개 글</p>' + list +
      (a.length > ST.limit ? '<button type="button" class="btn ghost wide" data-act="sgMore">더 보기 (' + U.fmtInt(a.length - ST.limit) + '개 남음)</button>' : ''));
  }
  function pageLearn(H) {
    var D = DATA, out = [];
    out.push(H.card(H.head('그가 되풀이하는 투자 원칙', '글 ' + U.fmtInt(D.posts.filter(function (p) { return p.p; }).length) + '개에서 모은 ' + D.principles.length + '가지 · 많이 나온 순') +
      '<ol class="sgprin">' + D.principles.map(function (x) {
        return '<li><h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p>' + refs(x.ids.slice(0, 2)) + '</li>';
      }).join('') + '</ol>'));
    var q = ST.termQ.trim(), groups = {};
    D.terms.forEach(function (t) { if (q && (t.term + t.plain).indexOf(q) < 0) return; (groups[t.group] = groups[t.group] || []).push(t); });
    out.push(H.card(H.head('쉬운 경제 용어', '그의 글과 경제 뉴스에 자주 나오는 말 ' + D.terms.length + '개') +
      '<input id="sgTermQ" type="search" placeholder="용어 찾기" value="' + esc(q) + '" aria-label="용어 찾기" class="sginput">' +
      Object.keys(groups).map(function (g) {
        return '<h3 class="sgh3">' + esc(g) + '</h3><dl class="sgterms">' + groups[g].map(function (t) { return '<div><dt>' + esc(t.term) + '</dt><dd>' + esc(t.plain) + '</dd></div>'; }).join('') + '</dl>';
      }).join('')));
    return out.join('');
  }

  // H: app.js가 넘겨 주는 도구 {card, head, chartBox, $, Ch, setBar, render, openUrl, payload}
  function page(H) {
    H.setBar('성상현 · 매크로 비욘드', '<span class="chip demo">베타</span>', false);
    if (!DATA) {
      if (failed) return { html: H.card('<div class="empty"><h2>자료를 열지 못했어요</h2></div>') };
      load().then(H.render);
      return { html: H.card('<div class="empty"><h2>블로그 정리 자료를 여는 중</h2></div>') };
    }
    var mounts = [], P = H.payload, body;
    if (ST.sub === 'theme') body = pageTheme(H, P, mounts);
    else if (ST.sub === 'posts') body = pagePosts(H);
    else if (ST.sub === 'learn') body = pageLearn(H);
    else body = pageSum(H, P, mounts);
    return { html: subNav() + body + '<p class="foot">블로그 \'매크로 비욘드\'(성상현) 글을 앱이 요약했어요 · 원문과 판단은 블로그에서<br>통계적 참고용 · 투자 권유 아님 · ' + dLabel(DATA.source.collectedAt.slice(0, 10)) + ' 수집</p>', mounts: mounts };
  }

  // 누름 처리. true를 돌려주면 처리한 것.
  function onAct(act, d, H) {
    switch (act) {
      case 'sgSub': ST.sub = d.s; H.render(); root.scrollTo(0, 0); return true;
      case 'sgTheme': ST.theme = +d.t; ST.sub = 'theme'; H.render(); root.scrollTo(0, 0); return true;
      case 'sgThemePosts': ST.th = +d.t; ST.cat = -1; ST.q = ''; ST.fav = false; ST.limit = 30; ST.sub = 'posts'; H.render(); root.scrollTo(0, 0); return true;
      case 'sgToggle': ST.open[d.id] = !ST.open[d.id]; H.keep(); return true;
      case 'sgPost': ST.open[d.id] = true; ST.sub = 'posts'; ST.q = ''; ST.cat = -1; ST.th = -1; ST.fav = false; ST.sort = 'new';
        var a = filtered(), i = a.map(function (p) { return p.id; }).indexOf(d.id); ST.limit = Math.max(30, i + 10);
        H.render(); var el = document.querySelector('[data-act="sgToggle"][data-id="' + d.id + '"]'); if (el) el.scrollIntoView({ block: 'start' }); return true;
      case 'sgOpen': H.openUrl(url(d.id)); return true;
      case 'sgFav': var F = favs(), k = F.indexOf(d.id); if (k >= 0) F.splice(k, 1); else F.push(d.id); setFavs(F); H.keep(); return true;
      case 'sgMore': ST.limit += 30; H.keep(); return true;
    }
    return false;
  }
  var qTimer = null;
  function onInput(e, H) {
    var id = e.target.id;
    if (id === 'sgQ' || id === 'sgTermQ') {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        if (id === 'sgQ') { ST.q = e.target.value; ST.limit = 30; } else ST.termQ = e.target.value;
        H.keep(); var el = document.getElementById(id); if (el) { el.focus(); var n = el.value.length; try { el.setSelectionRange(n, n); } catch (x) { /* ignore */ } }
      }, 350);
      return true;
    }
    if (id === 'sgCat') { ST.cat = +e.target.value; ST.limit = 30; H.keep(); return true; }
    if (id === 'sgTh') { ST.th = +e.target.value; ST.limit = 30; H.keep(); return true; }
    if (id === 'sgSort') { ST.sort = e.target.value; ST.limit = 30; H.keep(); return true; }
    if (id === 'sgFavOnly') { ST.fav = e.target.checked; ST.limit = 30; H.keep(); return true; }
    return false;
  }
  function setState(o) { for (var k in o) ST[k] = o[k]; }

  root.SungPage = { page: page, onAct: onAct, onInput: onInput, load: load, setState: setState, SHORT: SHORT };
})(window);
