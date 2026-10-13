/* 엄마의 시장 나침반 — 화면 (specs/ux1_design.md 구조, 문구는 각 스펙/DECISIONS)
 * 순수 JS, 빌드 도구 없음. 화면은 문자열로 그리고, 누름은 data-act 위임으로 처리한다. */
(function () {
  'use strict';
  var U = window.MCUtil, Rd = window.Reading, H = window.Holdings, CT = window.Content, CX = window.Context;
  var E = window.Engine, N = window.Native, LS = window.Store.LS, esc = U.esc;
  var APP_VERSION = '1.0.0';
  var $ = function (id) { return document.getElementById(id); };
  var view = $('view');

  var S = {
    tab: 'today', stack: [], scroll: {},
    payload: null, loading: null, error: null, netBack: false, doneBand: false,
    settings: Object.assign({ bigText: false, notif: { on: true, time: '08:40', weekend: false } }, LS.get('settings', {})),
    holdings: null, hData: {}, hLoading: {}, statsMemo: {},
    sysScale: 1, update: null, build: null, notifPerm: null, lastBack: 0, flash: false,
    add: null, ob: null, showAllMonths: false, openRows: {}, briefMore: false, worryPage: 0
  };

  // ------------------------------------------------------------------ 아이콘 (단색 SVG)
  var I = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="#5C5C5C" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.2v.1" stroke-linecap="round"/></svg>',
    compass: '<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="11" stroke="#7A4E08" stroke-width="2.4"/><path d="M14 14l5.5-5.5-2 7.5z" fill="#C62828"/><path d="M14 14l-5.5 5.5 2-7.5z" fill="#1565C0"/><circle cx="14" cy="14" r="1.8" fill="#fff" stroke="#7A4E08" stroke-width="1.2"/></svg>',
    book: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5c3-1.5 6.5-1.5 10 .5v16c-3.5-2-7-2-10-.5zM24 6.5c-3-1.5-6.5-1.5-10 .5v16c3.5-2 7-2 10-.5z"/></svg>',
    bulb: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><path d="M10 19h8M11 23h6M9.5 15.5A7 7 0 1 1 18.5 15.5c-1 1-1.5 2-1.5 3.5h-6c0-1.5-.5-2.5-1.5-3.5z"/></svg>',
    heart: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" aria-hidden="true"><path d="M14 23s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12z"/></svg>',
    text: '<svg class="ri" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true"><text x="2" y="22" font-size="19" font-weight="700" font-family="sans-serif">가</text><text x="17" y="22" font-size="11" font-weight="700" font-family="sans-serif">+</text></svg>',
    bell: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" aria-hidden="true"><path d="M7 19V13a7 7 0 0 1 14 0v6l2 2.5H5zM11.5 23.5a2.6 2.6 0 0 0 5 0"/></svg>',
    gear: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" aria-hidden="true"><circle cx="14" cy="14" r="3.6"/><path d="M14 3.5v3M14 21.5v3M3.5 14h3M21.5 14h3M6.6 6.6l2.1 2.1M19.3 19.3l2.1 2.1M6.6 21.4l2.1-2.1M19.3 8.7l2.1-2.1"/></svg>',
    doc: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5h10l5 5v16H7z"/><path d="M11 13h7M11 17h7M11 21h4"/></svg>',
    q: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="14" cy="14" r="10.5"/><path d="M10.8 11a3.3 3.3 0 1 1 4.6 3c-1 .5-1.4 1.2-1.4 2.3M14 20.2v.1"/></svg>',
    i: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="14" cy="14" r="10.5"/><path d="M14 12.5v7M14 8.3v.1"/></svg>',
    down: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4v14M8.5 12.5L14 18l5.5-5.5M5 23.5h18"/></svg>',
    send: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" aria-hidden="true"><path d="M4 13.5L24 4l-6 20-4.5-8z"/><path d="M13.5 16L24 4"/></svg>',
    wallet: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="21" height="15" rx="3"/><path d="M3.5 11h16M18 15.5h3.5"/></svg>',
    redo: '<svg class="ri" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 13a8 8 0 1 0-2.3 5.7"/><path d="M22 6v7h-7"/></svg>',
    sun: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="14" cy="14" r="5"/><path d="M14 3v3M14 22v3M3 14h3M22 14h3M6.2 6.2l2.1 2.1M19.7 19.7l2.1 2.1M6.2 21.8l2.1-2.1M19.7 8.3l2.1-2.1"/></svg>',
    check: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5h10l5 5v16H7z"/><path d="M10.5 16l3 3 5.5-6"/></svg>'
  };
  function appIcon(size) {
    return '<svg class="ob-icon" width="' + size + '" height="' + size + '" viewBox="0 0 108 108" aria-hidden="true"><rect width="108" height="108" rx="24" fill="#FFF1D9"/>' +
      '<circle cx="54" cy="54" r="30" fill="none" stroke="#7A4E08" stroke-width="6"/>' +
      '<path d="M54 27v6M54 75v6M27 54h6M75 54h6" stroke="#7A4E08" stroke-width="4"/>' +
      '<path d="M54 54L69.6 38.4 58.9 58.9z" fill="#C62828"/><path d="M54 54L38.4 69.6 49.1 49.1z" fill="#1565C0"/>' +
      '<circle cx="54" cy="54" r="5" fill="#fff" stroke="#7A4E08" stroke-width="2"/></svg>';
  }
  function compassAnim() {
    return '<svg class="compass-anim" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="#FFF1D9" stroke="#7A4E08" stroke-width="6"/>' +
      '<g class="needle"><path d="M50 50L50 18 58 50z" fill="#C62828"/><path d="M50 50L50 82 42 50z" fill="#1565C0"/></g><circle cx="50" cy="50" r="5" fill="#fff" stroke="#7A4E08" stroke-width="2"/></svg>';
  }

  // ------------------------------------------------------------------ 공용 조각
  var seen = null;   // 한 화면에서 같은 용어는 처음만 밑줄 (ux1 4-7)
  function T(id, text) {
    if (!CT.GLOSSARY_BY_ID[id] || seen.has(id)) return esc(text);
    seen.add(id);
    return '<button type="button" class="term" data-act="term" data-id="' + id + '">' + esc(text) + '</button>';
  }
  function chgHTML(pct, suffix) {
    var r = +pct.toFixed(1), dir = r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
    var sym = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■', verb = dir === 'up' ? '올랐어요' : dir === 'down' ? '내렸어요' : '그대로예요';
    return '<span class="' + dir + '-t" aria-label="' + Math.abs(r).toFixed(1) + '% ' + verb + '"><span aria-hidden="true">' + sym + ' ' + Math.abs(r).toFixed(1) + '% ' + verb + '</span></span>' + (suffix ? ' <span class="muted">' + esc(suffix) + '</span>' : '');
  }
  function sw(on) { return '<span class="sw-label">' + (on ? '켜짐' : '꺼짐') + '</span><span class="switch" aria-hidden="true"></span>'; }
  function row(act, icon, title, value, extra) {
    return '<button type="button" class="row press" data-act="' + act + '"' + (extra || '') + '>' + (icon || '') + '<span class="rt">' + title + '</span>' +
      (value ? '<span class="rv">' + value + '</span>' : '') + '<span class="chev" aria-hidden="true">›</span></button>';
  }
  function guardHTML(g, screen) {
    return '<section class="card guard" aria-label="' + esc(g.title) + '"><div class="gh">' + I.compass + '<h3>' + esc(g.title) + '</h3></div><p>' + esc(g.body) + '</p>' +
      '<div class="gfoot"><button type="button" class="textbtn small" data-act="push" data-page="trust">왜 이런 말을 하나요?</button>' +
      '<button type="button" class="btn2" data-act="guardOk" data-screen="' + screen + '" data-id="' + g.id + '">알겠어요</button></div></section>';
  }
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 3000);
  }
  function todayK() { return U.kstDate(E.nowMs()); }

  // ------------------------------------------------------------------ 글씨 배율 (ux1 3-1, 4-5)
  function applyScale() {
    var raw = S.sysScale * (S.settings.bigText ? 1.2 : 1), sc = Math.min(raw, 1.6);
    S.scale = sc; S.scaleCapped = raw > 1.6 + 1e-9;
    var el = document.documentElement;
    el.style.fontSize = (16 * sc) + 'px';
    el.classList.toggle('scale-big', sc >= 1.3 - 1e-9);
    el.classList.toggle('scale-xl', sc >= 1.4 - 1e-9);
  }
  function saveSettings() { LS.set('settings', S.settings); }

  // ------------------------------------------------------------------ 결과에서 뽑는 맥락
  function info() {
    var P = S.payload; if (!P) return null;
    var r = P.out.result, now = E.nowMs(), tk = U.kstDate(now);
    var target = U.nextTradingDay(r.baseDate);
    var expired = target < tk;
    var ks = r.kospiSeries || [], n = ks.length;
    var ret = function (k) { return n > k ? (ks[n - 1].close / ks[n - 1 - k].close - 1) * 100 : null; };
    return {
      P: P, r: r, now: now, todayK: tk, target: target, expired: expired,
      dayWord: Rd.dayWordOf(target, tk), baseWord: U.relDay(r.baseDate, tk), isFinal: r.mode === 'overnight',
      stale: expired ? 'expired' : (S.error ? 'fallback' : 'none'),
      periodLabel: r.stats && r.stats.from ? Rd.periodLabel(r.stats.from, r.baseDate) : '지난 1년 반',
      ret1: ret(1), ret3: ret(3), ret5: ret(5)
    };
  }
  function dayTitle(x) { return x.dayWord === '오늘' || x.dayWord === '내일' ? x.dayWord : U.fmtDateLong(x.target); }

  // ------------------------------------------------------------------ 오늘 (H1)
  function pageToday() {
    var P = S.payload;
    if (!P) return { title: '오늘', action: refreshBtn(), body: firstRunBody() };
    var x = info(), r = x.r, out = [];
    var gstate = LS.get('guard', {});
    if (P.demo) out.push('<p class="demo-band">체험용 화면이에요. 코스피 예측 숫자는 ' + U.fmtDateLong(r.baseDate) + ' 실제 계산 결과이고, 밤사이 시장·종목 시세는 예시 값이에요.</p>');
    out.push('<p class="dateline"><span class="nw">' + U.fmtDateLong(x.target) + '</span> 코스피 마감 예상 · <span class="nw">' + U.fmtWhen(P.computedAt, x.now) + ' 계산</span>' +
      (x.stale === 'fallback' ? ' <span class="nw">(새 자료를 못 받아 저장된 결과예요)</span>' : '') + '</p>');

    // 상태 띠 (ux1 S2·S5)
    var mins = U.kstMinutes(x.now), trading = U.isTradingDay(x.todayK);
    if (!trading) out.push('<div class="notice-line">오늘은 주식시장이 쉬는 날이에요. 다음 장은 <b class="nw">' + U.fmtDateLong(x.target >= x.todayK ? x.target : U.nextTradingDay(x.todayK)) + '</b>이에요.</div>');
    else if (x.target === x.todayK && mins >= 540 && mins < 930) out.push('<div class="notice-line">장이 열려 있어요. 이 예측은 장 시작 전 자료로 계산했고, 장중 시세로 다시 계산하지 않아요. 지금 시세는 실시간이 아니에요. 증권사 앱 시세가 더 정확해요.</div>');

    // 자체 점검 (stats2 4.3)
    var sc = selfCheckState();
    if (sc && sc.showing && LS.get('selfcheck.hiddenOn') !== x.todayK) out.push(selfCheckCard(sc, true));

    var y = r.yesterday, closedToday = y && y.date === x.todayK;
    if (closedToday) out.push(yesterdayCard(x, true));
    out.push(verdictCard(x));
    var g = Rd.guardHome({
      kospiRet1: x.ret1, kospiRet5: x.ret5, holdingDrop: holdingDrop(), upPct: Rd.upPctOf(r.pUp), isFinal: x.isFinal,
      stats: r.stats, marketWord: x.baseWord
    }, gstate, x.todayK);
    if (g && !x.expired) { markGuardShown(g.id); out.push(guardHTML(g, 'home')); }
    out.push(rangeCard(x));
    if (!x.expired) {
      if (r.mode === 'mixture' && r.scenarios && r.scenarios.length) out.push(scenarioCard(x));
      else if (P.out.brief) out.push(briefCard(x, P.out.brief));
    }
    if (y && !closedToday) out.push(yesterdayCard(x, false));
    if (P.out.ctx) out.push(contextCard(P.out.ctx));
    out.push(tipTeaser(x));
    out.push('<div class="footer"><p>' + (x.stale === 'none'
      ? '참고용 예보예요 · 시세 출처 Yahoo Finance · <span class="nw">' + U.fmtDateMD(U.kstDate(P.computedAt)) + ' ' + U.fmtTime(P.computedAt) + ' 기준</span>'
      : '지금 보시는 건 <span class="nw">' + U.fmtDateMD(U.kstDate(P.computedAt)) + ' ' + U.fmtTime(P.computedAt) + '</span> 자료예요. 새 자료를 받지 못했어요.') +
      '</p><p>투자 권유가 아니에요. <button type="button" class="textbtn small" data-act="push" data-page="notice">유의사항 ›</button></p>' +
      (S.error ? '<p><button type="button" class="textbtn small" data-act="report">오류 정보 보내기</button></p>' : '') + '</div>');
    return { title: '오늘', action: refreshBtn(), body: out.join(''), after: afterRange };
  }
  function refreshBtn() { return '<button type="button" class="tbtn" data-act="refresh" aria-label="새로 계산하기">' + I.refresh + '새로고침</button>'; }

  function firstRunBody() {
    if (S.loading) {
      var L = S.loading;
      var stageText = ['밤사이 세계 시장 소식을 모으는 중이에요…', '지난 10년 자료로 범위를 계산하는 중이에요…', '거의 다 됐어요…'][L.stage - 1];
      return '<section class="card firstload" aria-busy="true">' + compassAnim() + '<h2>오늘 시장을 계산하고 있어요</h2>' +
        '<div class="progress thick"><i id="pbar" style="width:' + L.pct + '%"></i></div><p class="muted" id="pstage" style="margin-top:6px">' + L.stage + ' / 3 단계</p>' +
        '<p id="ptext" style="margin-top:8px">' + stageText + '</p>' + (L.slow ? '<p class="muted" style="margin-top:8px">인터넷이 느려서 조금 더 걸려요. 잠시만요.</p>' : '') + '</section>';
    }
    var e = S.error || {};
    var off = e.code === 'OFFLINE';
    return '<section class="card firstload">' + compassAnim() +
      '<h2>' + (off ? '인터넷에 연결되면 오늘 예측을 계산할 수 있어요' : '시세 자료를 가져오지 못했어요') + '</h2>' +
      '<p>' + (off ? '와이파이나 모바일 데이터가 켜져 있는지 확인해 주세요.' : '잠시 뒤 다시 해 볼게요. 아래 버튼으로 바로 다시 해 볼 수도 있어요.') + '</p>' +
      '<div style="margin-top:16px"><button type="button" class="btn" data-act="retry">다시 시도</button></div>' +
      '<p style="margin-top:8px"><button type="button" class="textbtn small" data-act="report">오류 정보 보내기</button></p></section>';
  }

  function verdictCard(x) {
    var r = x.r, v = Rd.verdict(r, { isFinal: x.isFinal, dayWord: x.dayWord, periodLabel: x.periodLabel, stale: x.stale });
    var cls = x.expired ? 'expired' : v.chip.cls;
    var icons = '';
    var triU = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4l7 12H3z" fill="currentColor"/></svg>', triD = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16L3 4h14z" fill="currentColor"/></svg>';
    for (var i = 0; i < 10; i++) icons += i < v.N ? '<span class="u">' + triU + '</span>' : '<span class="d">' + triD + '</span>';
    var chips = '<span class="chip ' + v.chip.cls + '"><span aria-hidden="true">' + v.chip.sym + '</span> ' + v.chip.text + '</span>';
    if (!x.isFinal && !x.expired) chips += '<span class="chip warn">미리 보기 · 아직 확정 아님</span>';
    if (x.expired) chips += '<span class="chip grey">지난 예측</span>';
    var body = '<section class="card verdict ' + cls + '" id="verdictCard" aria-labelledby="vh">' +
      '<div class="chips">' + chips + '</div>' +
      '<p class="kicker">' + (dayTitle(x) !== U.fmtDateLong(x.target) ? esc(dayTitle(x)) + ' · ' : '') + U.fmtDateLong(x.target) + ' ' + T('kospi', '코스피') + '</p>' +
      '<h2 class="headline" id="vh">' + esc(v.headline) + '</h2>';
    if (x.expired) {
      body += '<p>인터넷이 연결되면 다시 받아 와요. 아래는 ' + U.fmtDateLong(x.target) + ' 예상이에요.</p>';
    }
    body += '<p class="prob">' + esc(v.probLine) + '</p>' +
      '<div class="icons" role="img" aria-label="' + esc(v.iconAria) + '">' + icons + '</div>' +
      '<div class="legend"><span><span class="up-t">▲</span> 오른 날</span><span><span class="down-t">▼</span> 내린 날</span></div>' +
      '<p class="sub">' + esc(v.iconSub) + '</p>';
    if (v.hitLine) body += '<p class="hitline">' + esc(v.hitLine) + '</p>';
    if (!x.expired && x.isFinal) body += '<p class="sub">이 예측은 밤사이 미국 장 결과까지 넣어 계산했고, 하루 동안 바뀌지 않아요.</p>';
    body += '<div class="linkrow"><button type="button" class="textbtn" data-act="push" data-page="trust">이 예측은 얼마나 믿을 만한가요? ›</button></div></section>';
    return body;
  }

  function rangeCard(x) {
    var r = x.r, rv = Rd.rangeView(r, { dayWord: x.dayWord, baseWord: x.baseWord, prevWord: r.yesterday ? U.relDay(r.yesterday.date, x.todayK) : '어제', prev: r.yesterday, recentMedW95: Rd.recentMedW95(r.history) });
    var g = rv.geo, cl = function (v) { return Math.max(0, Math.min(100, v)); };
    var lo95 = cl(g.lo95), hi95 = cl(g.hi95), lo80 = cl(g.lo80), hi80 = cl(g.hi80), c = cl(g.center), split = Math.min(Math.max(50, lo80), hi80);
    var dn = split > lo80 ? '<i class="b80dn' + (split >= hi80 ? ' solo' : '') + '" style="left:' + lo80 + '%;width:' + (split - lo80) + '%"></i>' : '';
    var up = hi80 > split ? '<i class="b80up' + (split <= lo80 ? ' solo' : '') + '" style="left:' + split + '%;width:' + (hi80 - split) + '%"></i>' : '';
    var ctxLine = rv.noteLine || rv.wideLine || [rv.volExplain, rv.volCompare].filter(Boolean).join(' ');
    return '<section class="card" id="rangeCard" aria-labelledby="rh"><div class="rangehead"><h2 id="rh">' + esc(dayTitle(x)) + ' 마감은 어디쯤일까요?</h2>' +
      '<span class="chip vol">' + rv.volBadge + '</span></div>' +
      (rv.scaleNote ? '<p class="scalenote">' + rv.scaleNote + '</p>' : '') +
      '<div class="rangeviz" id="rangeviz" role="img" aria-label="' + esc(rv.aria) + '">' +
      '<span class="baselabel" id="baselabel">' + esc(x.baseWord) + ' ' + rv.s.base + '</span>' +
      '<div class="bar"><i class="b95" style="left:' + lo95 + '%;width:' + (hi95 - lo95) + '%"></i>' + dn + up +
      '<span class="diamond" style="left:' + c + '%"></span></div><span class="baseline" style="left:50%"></span></div>' +
      '<div class="endlabels" id="endlabels" data-lo="' + lo80 + '" data-hi="' + hi80 + '" aria-hidden="true"><span>' + rv.s.lo80 + '</span><span>' + rv.s.hi80 + '</span></div>' +
      '<div class="ticks" aria-hidden="true"><span class="dn">−' + rv.S + '%</span><span class="mid">' + esc(x.baseWord) + ' 마감</span><span class="upw">+' + rv.S + '%</span></div>' +
      '<div class="ticks" aria-hidden="true"><span class="dn">↓ 내리면</span><span class="upw">오르면 ↑</span></div>' +
      '<p class="r80label">대부분 — ' + T('prob_range', '10번 중 8번') + '은 이 사이에서 끝났어요</p>' +
      '<p class="r80value"><span class="nw">' + rv.s.lo80 + '</span><span class="nw">~ ' + rv.s.hi80 + '</span></p>' +
      '<p>' + esc(x.baseWord) + ' 마감보다 <span class="nw ' + (rv.lo80 < rv.base ? 'down-t' : 'up-t') + '">' + rv.pct.lo80 + '</span> ~ <span class="nw ' + (rv.hi80 < rv.base ? 'down-t' : 'up-t') + '">' + rv.pct.hi80 + '</span></p>' +
      '<p class="sub">10번 중 2번은 밖이에요(일주일에 한 번꼴).</p>' +
      '<hr class="hr"><p>거의 다 — 20번 중 19번: <span class="nw"><b>' + rv.s.lo95 + '</b></span> <span class="nw"><b>~ ' + rv.s.hi95 + '</b></span></p>' +
      '<p class="sub">그래도 한 달에 한 번쯤은 이 밖으로 나가요.</p>' +
      '<p class="center-line"><span aria-hidden="true">◆</span> 가장 가운데 <b class="nw">' + rv.s.center + '</b> <span class="nw">(' + esc(x.baseWord) + ' 마감보다 ' + rv.pct.center + ')</span> — 맞힐 값이 아니라 범위의 한가운데예요.</p>' +
      (ctxLine ? '<div class="ctxbox">' + I.info + '<span>' + esc(ctxLine) + '</span></div>' : '') +
      '<p class="sub">범위 끝은 \'최저·최고\'가 아니에요. 이 밖으로 갈 수도 있어요.</p>' +
      '<div class="linkrow"><button type="button" class="textbtn" data-act="push" data-page="range">자세히 보기 ›</button></div></section>';
  }
  function afterRange() {
    var viz = $('rangeviz'); if (!viz) return;
    var W = viz.clientWidth, lab = $('baselabel');
    if (lab) { var w = lab.offsetWidth; lab.style.left = Math.min(Math.max(W / 2 - w / 2, 0), W - w) + 'px'; }
    var el = $('endlabels'); if (!el) return;
    var sp = el.querySelectorAll('span'), xs = [+el.dataset.lo / 100 * W, +el.dataset.hi / 100 * W], ws = [sp[0].offsetWidth, sp[1].offsetWidth];
    var L = Rd.placeLabels(xs, ws, W, 8);
    sp[0].style.left = L[0] + 'px'; sp[1].style.left = L[1] + 'px';
  }

  function scenarioCard(x) {
    var rows = Rd.scenarioRows(x.r);
    return '<section class="card" aria-labelledby="sch"><div class="chips" style="margin-bottom:8px"><span class="chip warn">아직 확정 아님</span></div>' +
      '<h2 class="ct" id="sch">오늘 밤 ' + T('sox', '미국 반도체(SOX)') + '에 따라 달라져요</h2>' +
      '<p class="sub" style="margin-top:0">미국 장은 우리 시간 새벽에 끝나요. 그 결과에 따라 ' + esc(dayTitle(x)) + ' 범위가 이렇게 달라졌어요.</p>' +
      '<ul class="scen">' + rows.map(function (s) {
        return '<li><span class="when"><span class="arrow" aria-hidden="true">' + s.arrow + '</span>' + s.text + ' <small>(' + s.range + ')</small></span>' +
          '<span class="what">' + (s.empty ? '<span class="muted">비슷한 날이 없었어요</span>' : '오를 확률 ' + s.upPct + '%<br><span class="nw">대부분 ' + s.lo80 + '~' + s.hi80 + '</span>') + '</span></li>';
      }).join('') + '</ul><p class="sub">미리 계산해 둔 참고 숫자예요. 아침에 앱을 열면 실제 미국 장 결과로 다시 계산해요.</p></section>';
  }

  function briefCard(x, b) {
    var items = b.items.filter(function (i) { return i.main || S.briefMore; });
    var hdr = b.usDate ? '<p class="sub" style="margin-top:0">' + U.fmtDateMD(b.cutoff) + ' 아침 기준 (미국 ' + U.fmtDateMD(b.usDate) + ' 장 마감)</p>' : '';
    return '<section class="card" aria-labelledby="bh"><h2 class="ct" id="bh">밤사이 세계 시장</h2>' + hdr +
      '<div class="sentences">' + b.sentences.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</div>' +
      '<ul class="brief">' + items.map(function (it) {
        var open = S.openRows['b:' + it.key];
        var val = it.direction === 'none' ? '<span class="val c-gray">' + esc(it.changeText) + '</span>'
          : '<span class="val c-' + it.color + '">' + esc(it.signed || it.changeText) + '<small>' + esc(it.levelText) + '</small></span>';
        return '<li><button type="button" class="bi" data-act="toggle" data-key="b:' + it.key + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="arrow c-' + it.color + '" aria-hidden="true">' + it.arrow + '</span><span class="name">' + esc(it.name) + '</span>' + val +
          '<span class="meta"><span>' + esc(it.valueText || (it.key === 'ewyx' ? it.changeText : '')) + '</span>' + (it.impactText ? '<span class="badge">' + esc(it.impactText) + '</span>' : '') + '</span></button>' +
          (open ? '<p class="why">' + esc(it.why) + ' ' + T(it.term, '용어 풀이 보기') + '</p>' : '') + '</li>';
      }).join('') + '</ul>' +
      '<div class="linkrow"><button type="button" class="textbtn small" data-act="briefMore">' + (S.briefMore ? '접기' : '미국 금리·마이크론 더 보기') + '</button></div>' +
      '<p class="sub">미국 시장 마감 숫자를 정리한 참고 정보예요. 오늘 코스피가 이렇게 움직인다는 뜻은 아니에요.</p></section>';
  }

  function yesterdayCard(x, first) {
    var y = x.r.yesterday, st = x.r.stats || {};
    var yc = Rd.yesterdayCheck(y, { N: st.holdoutN, miss: st.miss95 });
    var cls = yc.verdict === 'IN80' ? 'res-in80' : yc.verdict === 'IN95' ? 'res-in95' : 'res-out';
    var sym = yc.verdict === 'OUT' ? '✕' : '○';
    var word = U.relDay(y.date, x.todayK);
    var title = (word === '오늘' || word === '어제' ? word + '(' + (+y.date.slice(5, 7)) + '/' + (+y.date.slice(8, 10)) + ')' : '지난 장(' + U.fmtDateMD(y.date) + ')') + ' 예상은 맞았나요?';
    var rs = Rd.recentSummary(x.r.history);
    return '<section class="card" aria-labelledby="yh"><h2 class="ct" id="yh">' + esc(title) + '</h2>' +
      '<p class="verdict-sym ' + cls + '"><span class="sym" aria-hidden="true">' + sym + '</span>' + esc(yc.big) + '</p>' +
      '<p style="margin-top:8px">' + esc(yc.small) + '</p>' + (yc.dirLine ? '<p style="margin-top:6px">' + esc(yc.dirLine) + '</p>' : '') +
      (rs ? '<p class="sub">최근 20번: 대부분 범위 안 ' + rs.k80 + '번, 넓은 범위 안 ' + rs.k95 + '번 (평소 기대: 16번, 19번)</p>' : '') +
      (first ? '<p class="sub">' + U.fmtDateLong(x.target) + ' 예측은 아래에 있어요.</p>' : '') +
      '<div class="linkrow"><button type="button" class="textbtn" data-act="tab" data-tab="record">성적표 보기 ›</button></div></section>';
  }

  function contextCard(c) {
    var lockIn = LS.get('ctxHeadline', null), L = CX.lockedHeadline(c, lockIn);
    if (!lockIn || JSON.stringify(L.lock) !== JSON.stringify(lockIn)) LS.set('ctxHeadline', L.lock);
    var rows = CX.rows(c);
    var stale = U.dayDiff(c.kospi.D, todayK()) > 5;
    return '<section class="card" aria-labelledby="cxh"><h2 class="ct" id="cxh">요즘 시장 이야기 <span class="muted nw" style="font-weight:400">' + U.fmtDateLong(c.kospi.D) + ' 기준</span></h2>' +
      (stale ? '<p class="notice-line" style="margin-bottom:8px">' + U.fmtDateMD(c.kospi.D) + ' 자료 기준이에요(최근 자료를 아직 못 받았어요).</p>' : '') +
      '<p class="ctx-head">' + esc(L.headline.text) + '</p>' + (L.headline.sub ? '<p class="sub">' + esc(L.headline.sub) + '</p>' : '') +
      (L.locked ? '<p class="sub">' + U.fmtDateMD(L.lockedDate) + ' 기준 문장이에요. 아래 숫자는 최신이에요.</p>' : '') +
      '<div style="margin-top:10px">' + rows.map(function (rw) {
        var open = S.openRows['c:' + rw.id], val;
        if (rw.id === 'kospi') {
          val = '<b class="nw">' + rw.value + '</b> · ' + rw.periods.map(function (p) { return '<span class="nw">' + p.k + ' <span class="' + (p.v >= 0 ? 'up-t' : 'down-t') + '">' + (p.v >= 0 ? '▲' : '▼') + ' ' + U.signPct(p.v) + '</span></span>'; }).join(' · ');
        } else val = esc(rw.value);
        return '<button type="button" class="ctxrow" data-act="toggle" data-key="c:' + rw.id + '" aria-expanded="' + (open ? 'true' : 'false') + '"><span class="crh"><b>' + esc(rw.label) + '</b><span class="crv">' + val + '</span></span>' +
          (open ? '<div class="long">' + rw.long.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + (rw.info ? '<p class="muted">ⓘ ' + esc(rw.info) + '</p>' : '') + '</div>' : '') + '</button>';
      }).join('') + '</div><p class="sub">줄을 누르면 풀이가 나와요.</p></section>';
  }

  function tipTeaser(x) {
    var shown = LS.get('tips.lastShown', {}), inst = LS.get('installDate', x.todayK);
    var id = CX.pickTip(S.payload.out.ctx, x.todayK, U.dayDiff(inst, x.todayK) < 7, shown);
    if (shown[id] !== x.todayK) { shown[id] = x.todayK; LS.set('tips.lastShown', shown); }
    var tip = CT.TIPS.filter(function (t) { return t.id === id; })[0];
    return '<button type="button" class="card tipcard press" data-act="push" data-page="tip" data-id="' + tip.id + '">' + I.bulb.replace('class="ri"', '') +
      '<span><span class="muted">알아 두면 좋은 상식 · 읽는 데 2분</span><br><b>' + esc(tip.title) + '</b></span></button>';
  }

  // ------------------------------------------------------------------ 자체 점검
  function selfCheckState() {
    var P = S.payload; if (!P) return null;
    var st = Rd.selfCheck(P.out.result.history, LS.get('selfcheck', {}), todayK());
    LS.set('selfcheck', { showing: st.showing, since: st.since });
    return st;
  }
  function selfCheckCard(sc, closable) {
    return '<section class="card infocard"><h3>ⓘ 최근 예측이 평소보다 덜 맞고 있어요</h3><p>최근 60일 중 <b>' + sc.miss95 + '일</b>이 넓은 범위 밖에서 끝났어요. 평소라면 3일쯤이에요. 요즘 시장이 평소와 달라서일 수 있어요. 범위는 평소보다 더 넉넉하게 생각해 주세요.</p>' +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn2" data-act="tab" data-tab="record">지난 성적표 보기</button>' +
      (closable ? '<button type="button" class="btn2" data-act="hideSelfCheck">닫기</button>' : '') + '</div></section>';
  }

  // ------------------------------------------------------------------ 안전장치 기록
  function markGuardShown(id) {
    var gs = LS.get('guard', {}), d = todayK();
    gs.shows = gs.shows || {}; var a = gs.shows[id] = gs.shows[id] || [];
    if (a.indexOf(d) < 0) { a.push(d); if (a.length > 20) a.splice(0, a.length - 20); LS.set('guard', gs); }
  }
  function dismissGuard(screen) {
    var gs = LS.get('guard', {}); gs.dismissedOn = gs.dismissedOn || {}; gs.dismissedOn[screen] = todayK(); LS.set('guard', gs);
  }

  // ------------------------------------------------------------------ 내 종목 (P1)
  var HKEY = function () { return E.demo ? 'demoHoldings' : 'myHoldings'; };
  function loadHoldings() {
    var list = LS.get(HKEY(), null);
    if (!list && E.demo) {
      var pick = function (id, extra) { return Object.assign({}, H.CATALOG.filter(function (c) { return c.id === id; })[0], extra || {}); };
      list = [pick('005930', { amountWon: 10000000 }), pick('069500'), pick('122630'), pick('360750'), pick('fund_kr'), pick('deposit')];
    }
    S.holdings = list || [];
  }
  function saveHoldings() { LS.set(HKEY(), S.holdings.map(function (h) { var o = Object.assign({}, h); delete o.chosung; return o; })); }
  function kospiLast() { var k = S.payload && S.payload.out.kospi2y; return k && k.length ? k[k.length - 1].d : null; }
  function symOf(item) { return item.symbol || item.proxy || null; }
  function ensureRows(sym) {
    if (!sym || S.hData[sym] || S.hLoading[sym] || !S.payload) return;
    S.hLoading[sym] = true;
    E.holdingRows(sym, kospiLast()).then(function (d) {
      S.hLoading[sym] = false; S.hData[sym] = d || { failed: true };
      if (d && d.movedTo) {
        S.holdings.forEach(function (h) { if (h.symbol === sym) h.symbol = d.movedTo; });
        S.hData[d.movedTo] = d; saveHoldings();
      }
      if (S.tab === 'holdings' || S.stack.length) render();
    }, function () { S.hLoading[sym] = false; S.hData[sym] = { failed: true }; render(); });
  }
  function statsFor(item) {
    var sym = symOf(item), d = sym && S.hData[sym];
    if (!d || !d.rows || !S.payload) return null;
    var key = sym + '|' + S.payload.computedAt + '|' + d.day;
    if (S.statsMemo[key]) return S.statsMemo[key];
    var P = S.payload.out, type = item.type === 'fund_kr' ? 'etf_kr' : item.type;
    var st = H.holdingStats(d.rows, P.kospi2y || [], H.wfOutFromHistory(P.result.history), { type: type });
    S.statsMemo[key] = st; return st;
  }
  function holdingDrop() {
    if (!S.holdings) return null;
    for (var i = 0; i < S.holdings.length; i++) {
      var st = statsFor(S.holdings[i]);
      if (st && st.lastRetPct != null && st.lastRetPct <= -5) return { name: S.holdings[i].name, pct: st.lastRetPct };
    }
    return null;
  }
  function usOvernight(item) {
    var x = info(); if (!x || !x.isFinal) return null;
    var mv = x.r.overnight && x.r.overnight.movesPct; if (!mv) return null;
    var idx = null;
    if (item.ref === 'ndx') idx = mv.ndx;
    else { var g = S.hData['^GSPC']; ensureRows('^GSPC'); if (g && g.rows && g.rows.length > 1 && g.rows[g.rows.length - 1].d >= x.r.baseDate) idx = (g.rows[g.rows.length - 1].c / g.rows[g.rows.length - 2].c - 1) * 100; }
    return idx == null ? null : { idxPct: idx, fxPct: mv.usdkrw };
  }
  function cardFor(item) {
    var x = info(), r = x.r, sym = symOf(item);
    var needsStats = ['stock', 'etf_kr', 'etf_lev', 'fund_kr', 'etf_us', 'bond'].indexOf(item.type) >= 0 || (item.type === 'fund_global' && sym);
    var st = needsStats && sym ? statsFor(item) : null;
    var lo = U.pctOf(r.ranges['0.8'][0], r.baseClose), hi = U.pctOf(r.ranges['0.8'][1], r.baseClose);
    var base = { kospiLo80Pct: lo, kospiHi80Pct: hi, kospiCenterPct: U.pctOf(r.center, r.baseClose), dayWord: x.dayWord, amountWon: item.amountWon || null };
    if (needsStats && sym && !st) {
      var d = S.hData[sym];
      if (d && d.failed) return { title: item.name, kind: 'status', lines: ['아직 시세를 받아오지 못했어요.', '인터넷이 연결되면 다시 받아 올게요.'] };
      return { title: item.name, kind: 'loading', lines: ['시세를 받아 오는 중이에요…'] };
    }
    var input = Object.assign({}, item, st || {}, base);
    if (item.type === 'etf_us' || item.type === 'fund_global') input.overnight = usOvernight(item);
    if (st && st.status === 'vol_only' && ['etf_kr', 'etf_lev', 'fund_kr'].indexOf(item.type) >= 0) input.type = 'stock';
    return H.holdingCard(input);
  }
  function holdingCardHTML(item, idx) {
    var card = cardFor(item), sym = symOf(item), d = sym && S.hData[sym], pl = d && d.rows ? H.priceLine(d.rows) : null;
    var lines = card.lines || [], core = lines[0], note = lines.filter(function (l) { return l.indexOf('※') === 0; })[0];
    var price = '';
    if (pl) {
      price = item.symbol ? '<p class="hprice">' + U.fmtInt(pl.close) + '원</p><p class="hchange">' + chgHTML(pl.pct, '(' + U.fmtDateMD(pl.date) + ')') + '</p>'
        : '<p class="hchange">따라가는 상품 ' + chgHTML(pl.pct, '(' + U.fmtDateMD(pl.date) + ', 대리 상품 기준)') + '</p>';
    }
    if (d && d.stale) price += '<p class="muted">' + U.fmtDateMD(d.day) + ' 자료 기준이에요</p>';
    return '<button type="button" class="card hcard press" data-act="push" data-page="holding" data-id="' + idx + '"><span class="hhead"><span class="hname">' + esc(item.name) + '</span><span class="tchip">' + H.typeLabel(item) + '</span></span>' +
      price + (core ? '<p class="hcore">' + esc(core) + '</p>' : '') + (note ? '<p class="hnote">' + esc(note) + '</p>' : '') + '</button>';
  }
  function pageHoldings() {
    if (!S.holdings) loadHoldings();
    var P = S.payload, out = [];
    var action = '<button type="button" class="tbtn outline" data-act="addOpen">' + I.plus + '추가</button>';
    if (!P) return { title: '내 종목', action: action, body: '<section class="card empty"><p>오늘 시장 계산이 끝나면 내 종목도 함께 설명해 드려요.</p><button type="button" class="btn" data-act="tab" data-tab="today">오늘 화면으로</button></section>' };
    var x = info(), r = x.r;
    if (P.demo) out.push('<p class="demo-band">체험용 화면이에요. 종목 시세는 예시 값이에요.</p>');
    S.holdings.forEach(function (h) { ensureRows(symOf(h)); });
    var kl = kospiLast();
    if (kl) out.push('<p class="dateline">' + U.fmtDateLong(kl) + ' 장 마감 기준</p>');
    var wt = H.worryTrigger({
      pUp: r.pUp, kospiCenterPct: U.pctOf(r.center, r.baseClose), kospi3dPct: x.ret3,
      holdings: S.holdings.map(function (h) { var sym = symOf(h); return { name: h.name, stats: h.symbol ? statsFor(h) : null, rows: h.symbol && S.hData[sym] ? S.hData[sym].rows : null }; })
    });
    if (wt.show && LS.get('worry.hiddenOn') !== x.todayK) {
      S.worryFact = wt.fact;
      out.push('<div style="display:flex;gap:8px;align-items:stretch"><button type="button" class="worry press" data-act="push" data-page="worry">' + I.heart.replace('class="ri"', 'width="28" height="28"') + '<span>마음이 쓰이는 날이죠. 읽어 볼 글이 있어요 ›</span></button>' +
        '<button type="button" class="tbtn worry-x" data-act="hideWorry" aria-label="오늘은 숨기기">닫기</button></div>');
    }
    if (!S.holdings.length) {
      out.push('<section class="card empty"><p>갖고 계신 주식이나 펀드를 넣으면<br>오늘 시장과 함께 설명해 드려요.</p><button type="button" class="btn" data-act="addOpen">+ 첫 종목 넣기</button></section>');
    } else {
      var gs = LS.get('guard', {}), levShown = false;
      var dismissed = gs.dismissedOn && gs.dismissedOn.holdings === x.todayK;
      S.holdings.forEach(function (h, i) {
        out.push(holdingCardHTML(h, i));
        if (!levShown && !dismissed && Rd.isLeveraged(h)) {
          var key = 'leverage:' + (h.symbol || h.name), last = ((gs.shows || {})[key] || []).slice(-1)[0];
          if (!last || last === x.todayK || U.dayDiff(last, x.todayK) >= 30) {
            levShown = true; markGuardShown(key); out.push(guardHTML(Rd.leverageCard(h, r), 'holdings'));
          }
        }
      });
    }
    out.push('<p class="notice-line">여기 숫자는 코스피 예측과 지난 움직임을 바탕으로 한 참고 자료예요. 이 종목이 오를지 내릴지 알려 드리는 게 아니에요.</p>');
    out.push('<section class="card"><details class="acc"><summary>왜 종목 예측은 없나요?</summary><div class="read"><p>이 앱은 코스피만 예측해요. 개별 종목은 회사 실적이나 소식에 크게 좌우돼서 같은 방법으로 맞히기 어려워요. 그래서 \'코스피가 움직이면 이 종목이 보통 얼마나 같이 움직였는지\'만 보여 드려요.</p></div></details></section>');
    return { title: '내 종목', action: action, body: out.join('') };
  }
  function pageHolding(args) {
    var idx = +args.id, item = S.holdings[idx];
    if (!item) return pageHoldings();
    ensureRows(symOf(item));
    var card = cardFor(item), sym = symOf(item), d = sym && S.hData[sym], pl = d && d.rows ? H.priceLine(d.rows) : null;
    var out = [];
    var head = '<section class="card"><div class="hhead"><span class="hname">' + esc(item.name) + '</span><span class="tchip">' + H.typeLabel(item) + '</span></div>';
    if (pl) head += (item.symbol ? '<p class="hprice">' + U.fmtInt(pl.close) + '원</p>' : '<p class="muted" style="margin-top:6px">따라가는 상품 기준</p>') + '<p class="hchange">' + chgHTML(pl.pct, '(' + U.fmtDateMD(pl.date) + ')') + '</p>';
    if (d && d.rows && d.rows.length > 20) head += chartSVG(d.rows.slice(-63));
    head += '</section>';
    out.push(head);
    out.push('<section class="card"><h2 class="ct">오늘 시장 예측과 함께 보면</h2>' + (card.lines || []).map(function (l, i) {
      return '<p class="' + (i === 0 ? 'hcore' : l.indexOf('※') === 0 ? 'hnote' : 'hline') + '"' + (i === 0 ? ' style="border-top:0;padding-top:0;margin-top:0"' : '') + '>' + esc(l) + '</p>';
    }).join('') + '</section>');
    out.push('<section class="card"><h2 class="ct">넣어 두신 금액 (몰라도 돼요)</h2><p>' + (item.amountWon ? '<b>' + U.fmtInt(Math.round(item.amountWon / 10000)) + '만 원</b>' : '적지 않았어요') + '</p>' +
      '<p class="sub">폰 안에만 저장돼요.</p><div class="linkrow"><button type="button" class="textbtn" data-act="amountEdit" data-id="' + idx + '">고치기</button></div></section>');
    out.push('<button type="button" class="btn2 wide danger" data-act="removeAsk" data-id="' + idx + '">이 종목 빼기</button>');
    if (P_demo()) out.push('<p class="demo-band">체험용 예시 시세예요.</p>');
    return { title: item.name, back: true, body: out.join('') };
  }
  function P_demo() { return S.payload && S.payload.demo; }
  function chartSVG(rows) {
    var cs = rows.map(function (r) { return r.c; }), mn = Math.min.apply(null, cs), mx = Math.max.apply(null, cs), span = (mx - mn) || 1;
    var Wd = 320, Ht = 150, pad = 8;
    var pts = rows.map(function (r, i) { return [(i / (rows.length - 1)) * (Wd - 2 * pad) + pad, Ht - pad - (r.c - mn) / span * (Ht - 2 * pad)]; });
    var last = pts[pts.length - 1];
    return '<svg class="chart" viewBox="0 0 ' + Wd + ' ' + (Ht + 26) + '" role="img" aria-label="최근 3개월 가격 그래프, 최저 ' + U.fmtInt(mn) + '원, 최고 ' + U.fmtInt(mx) + '원">' +
      '<line x1="' + pad + '" y1="' + (Ht - pad) + '" x2="' + (Wd - pad) + '" y2="' + (Ht - pad) + '" stroke="#CFC7B9" stroke-width="1"/>' +
      '<polyline fill="none" stroke="#7A4E08" stroke-width="2.5" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="5" fill="#7A4E08" stroke="#fff" stroke-width="2"/>' +
      '<text x="' + pad + '" y="' + (Ht + 20) + '" font-size="15" fill="#5C5C5C">' + U.fmtDateMD(rows[0].d) + '</text>' +
      '<text x="' + (Wd - pad) + '" y="' + (Ht + 20) + '" font-size="15" fill="#5C5C5C" text-anchor="end">' + U.fmtDateMD(rows[rows.length - 1].d) + '</text></svg>';
  }

  // ------------------------------------------------------------------ 종목 넣기 시트 (P2)
  function openAdd() {
    if (S.holdings && S.holdings.length >= 15) { toast('종목은 15개까지 넣을 수 있어요'); return; }
    S.add = { seg: 'stock', q: '', sel: null, amount: '', mode: 'list', code: '', found: null, busy: false, msg: null };
    openSheet('add', addSheetHTML(), true);
  }
  function addListHTML() {
    var A = S.add, list;
    if (A.seg === 'stock') list = H.CATALOG.filter(function (c) { return c.type === 'stock'; });
    else if (A.seg === 'etf') list = H.CATALOG.filter(function (c) { return c.symbol && c.type !== 'stock'; });
    else list = H.CATALOG.filter(function (c) { return !c.symbol; });
    list = H.search(A.q, list);
    var have = {}; (S.holdings || []).forEach(function (h) { have[h.id] = true; });
    var item = function (c) {
      var on = A.sel === c.id;
      return '<button type="button" class="pick" data-act="addPick" data-id="' + c.id + '" aria-pressed="' + on + '"' + (have[c.id] ? ' disabled' : '') + '><span class="ck" aria-hidden="true">' + (on ? '✓' : '') + '</span>' +
        esc(c.name) + (have[c.id] ? '<small>이미 있어요</small>' : c.symbol ? '<small>' + c.symbol.slice(0, 6) + '</small>' : '') + '</button>';
    };
    if (!list.length) return '<p class="muted" style="padding:12px 4px">찾는 이름이 없어요. 아래 "목록에 없어요"를 눌러 주세요.</p>';
    if (A.seg === 'stock' && !A.q) {
      return H.STOCK_GROUPS.map(function (g) {
        var l = list.filter(function (c) { return c.group === g; }); if (!l.length) return '';
        return '<p class="groupname">' + g + '</p><div class="picklist">' + l.map(item).join('') + '</div>';
      }).join('');
    }
    return '<div class="picklist" style="margin-top:8px">' + list.map(item).join('') + '</div>';
  }
  function addSheetHTML() {
    var A = S.add;
    if (A.mode === 'code') {
      return '<div class="sh"><h2>번호로 찾기</h2><button type="button" class="tbtn" data-act="addBackList">목록으로</button></div>' +
        '<p>증권 앱 종목 화면에 있는 6자리 번호를 넣어 주세요.</p><div style="margin:12px 0"><input class="input" id="codeInput" inputmode="numeric" maxlength="6" placeholder="예: 005930" value="' + esc(A.code) + '" aria-label="6자리 종목 번호"></div>' +
        '<button type="button" class="btn" data-act="codeFind"' + (A.busy ? ' disabled' : '') + '>' + (A.busy ? '찾는 중이에요…' : '찾기') + '</button>' +
        (A.msg ? '<p style="margin-top:12px">' + esc(A.msg) + '</p>' : '') +
        (A.found ? '<section class="card" style="margin-top:12px"><p>이 종목이 맞나요?</p><p class="hname" style="margin-top:6px">' + esc(A.found.name) + '</p><p class="muted">' + A.found.symbol + ' · ' + U.fmtDateMD(A.found.date) + ' ' + U.fmtInt(A.found.close) + '원</p>' +
          '<p style="margin-top:10px">이름이 영어로 나오면 고쳐 적을 수 있어요.</p><input class="input" id="foundName" value="' + esc(A.found.name) + '" aria-label="종목 이름" style="margin-top:6px">' +
          '<button type="button" class="btn" style="margin-top:12px" data-act="codeAdd">네, 넣기</button></section>' : '');
    }
    var sel = A.sel && H.CATALOG.filter(function (c) { return c.id === A.sel; })[0];
    return '<div class="handle" aria-hidden="true"></div><div class="sh"><h2>종목 넣기</h2><button type="button" class="tbtn" data-act="closeSheet">닫기</button></div>' +
      '<div class="seg" role="group" aria-label="종류">' + [['stock', '주식'], ['etf', 'ETF'], ['fund', '펀드·예금']].map(function (s) {
        return '<button type="button" data-act="addSeg" data-seg="' + s[0] + '" aria-pressed="' + (A.seg === s[0]) + '">' + (A.seg === s[0] ? '✓ ' : '') + s[1] + '</button>';
      }).join('') + '</div>' +
      '<input class="input" id="addSearch" type="search" placeholder="이름으로 찾기 (예: 삼성전자, ㅅㅅㅈㅈ)" value="' + esc(A.q) + '" aria-label="이름으로 찾기">' +
      '<div id="addList">' + addListHTML() + '</div>' +
      '<button type="button" class="textbtn" data-act="addCode">목록에 없어요 ›</button>' +
      (sel ? '<section class="card" style="margin-top:8px;position:sticky;bottom:0"><p><b>' + esc(sel.name) + '</b>' + (sel.type === 'cash' && !sel.parking ? '' : '') + '</p>' +
        (sel.type !== 'cash' || sel.parking ? '<p style="margin-top:8px">얼마 넣어 두셨는지 적으면 원 단위로도 보여 드려요. 안 적어도 괜찮아요.</p>' +
          '<div class="inputwrap" style="margin-top:6px"><input class="input" id="amountInput" inputmode="numeric" placeholder="예: 500" value="' + esc(A.amount) + '" aria-label="넣어 둔 금액(만 원)"><span>만 원</span></div><p class="sub">폰 안에만 저장돼요.</p>' : '') +
        '<button type="button" class="btn" style="margin-top:10px" data-act="addDo">넣기</button></section>' : '');
  }
  function refreshAdd(keepFocus) {
    if (!S.add) return;
    if (keepFocus) { var l = $('addList'); if (l) l.innerHTML = addListHTML(); return; }
    var sh = document.querySelector('.sheet'); if (sh) { var st = sh.scrollTop; sh.innerHTML = addSheetHTML(); sh.scrollTop = st; }
  }
  function addHolding(item) {
    S.holdings = S.holdings || [];
    S.holdings.push(item); saveHoldings(); closeSheet(); render();
    toast(item.name + U.josa(item.name, '을', '를') + ' 넣었어요');
  }

  // ------------------------------------------------------------------ 성적표 (R1)
  function pageRecord() {
    var P = S.payload;
    if (!P) return { title: '성적표', body: '<section class="card empty"><p>계산이 끝나면 성적표를 보여 드려요.</p></section>' };
    var x = info(), r = x.r, rs = Rd.recordStats(r), out = [];
    var days = LS.get('screen.record.openDays', []); if (days.indexOf(x.todayK) < 0) { days.push(x.todayK); LS.set('screen.record.openDays', days.slice(-14)); }
    out.push('<p class="dateline">' + (rs.firstDate ? U.fmtDateFull(rs.firstDate).replace(/ \(.\)$/, '') : '2025년 1월') + '부터 ' + U.fmtDateMD(r.baseDate) + '까지 ' + rs.N + '거래일</p>');
    out.push('<h2 class="headline" style="margin:0">이렇게 맞혔어요</h2><p class="sub" style="margin-top:-8px">예측이 실제로 얼마나 맞았는지 숨김없이 보여 드려요.</p>');
    var g = Rd.guardRecord(r, LS.get('guard', {}), x.todayK, days);
    if (g) { markGuardShown(g.id); out.push(guardHTML(g, 'record')); }
    var sc = selfCheckState();
    if (sc && sc.showing) out.push(selfCheckCard(sc, false));
    else if (sc && sc.miss95 != null) out.push('<p class="notice-line">자체 점검: 최근 60일 중 넓은 범위 밖에서 끝난 날은 ' + sc.miss95 + '일이에요(평소 3일쯤). 평소 수준이에요.</p>');

    // R-C 최근 20번
    var last = r.history.slice(-20);
    if (last.length === 20) {
      var dots = last.map(function (h, i) {
        var c = h.in80 ? 'in80' : h.in95 ? 'in95' : 'out';
        var lbl = U.fmtDateMD(h.date) + ', ' + (h.in80 ? '보통 범위 안' : h.in95 ? '넓은 범위 안' : '넓은 범위 밖');
        return '<button type="button" class="dot ' + c + '" data-act="dot" data-i="' + (r.history.length - 20 + i) + '" aria-label="' + lbl + '">' + (c === 'out' ? '✕' : '') + '</button>';
      });
      var k80 = last.filter(function (h) { return h.in80; }).length, k95 = last.filter(function (h) { return h.in95; }).length;
      out.push('<section class="card" aria-labelledby="r20"><h2 class="ct" id="r20">최근 20거래일</h2>' +
        '<div class="dots">' + dots.slice(0, 10).join('') + '</div><div class="dotdates"><span>' + U.fmtDateMD(last[0].date) + '</span><span>' + U.fmtDateMD(last[9].date) + '</span></div>' +
        '<div class="dots">' + dots.slice(10).join('') + '</div><div class="dotdates"><span>' + U.fmtDateMD(last[10].date) + '</span><span>' + U.fmtDateMD(last[19].date) + '</span></div>' +
        '<div class="dotlegend"><span><i style="background:#B7791F"></i>보통 범위(10번 중 8번) 안</span><span><i style="background:#F3DFAE;border:2px solid #B7791F"></i>넓은 범위 안</span><span>✕ 넓은 범위 밖</span></div>' +
        '<p style="margin-top:10px;font-weight:700">보통 범위 안 ' + k80 + '번 · 넓은 범위 안 ' + k95 + '번</p><p class="sub">평소라면 20번 중 16번 · 19번쯤이에요.' + (k80 < 16 || k95 < 19 ? ' 최근에는 평소보다 덜 맞았어요.' : '') + '</p>' +
        '<p class="sub">점을 누르면 그날 숫자가 나와요.</p>' +
        '<div class="linkrow"><button type="button" class="textbtn" data-act="push" data-page="misses">틀린 날 모두 보기 ›</button></div></section>');
    }
    // R-A
    out.push('<section class="card" aria-labelledby="ra"><h2 class="ct" id="ra">범위 안에서 끝난 날</h2>' +
      '<p class="bignum">20번 중 19번 범위: <span class="nw">' + rs.N + '일 중 ' + rs.in95n + '일</span></p>' +
      '<p>' + (rs.cov95 * 100).toFixed(1) + '% · 벗어난 날 ' + rs.miss95 + '일 (약 20일에 1번꼴)</p>' +
      '<p style="margin-top:10px"><b>10번 중 8번 범위:</b> <span class="nw">' + rs.N + '일 중 ' + rs.in80n + '일</span> (' + (rs.cov80 * 100).toFixed(1) + '%)</p>' +
      (rs.near1Share != null ? '<p style="margin-top:10px"><b>가운데 ±1% 안에서 끝난 날:</b> ' + rs.near1 + '일 (' + Math.round(rs.near1Share * 100) + '%) — 2번 중 1번꼴</p><p class="sub">가운데 점이 맞힐 값은 아니에요. 2번 중 1번은 1% 넘게 떨어진 곳에서 끝났어요.</p>' : '') +
      '<p class="sub">' + (rs.streak95.len <= 1 ? '넓은 범위를 이틀 연달아 벗어난 적은 아직 없어요.' : '넓은 범위를 가장 길게 연달아 벗어난 건 ' + rs.streak95.len + '일이에요(' + U.fmtDateMD(rs.streak95.from) + '~' + U.fmtDateMD(rs.streak95.to) + ').') +
      ' 보통 범위는 가장 길게 ' + rs.streak80.len + '일 연달아 벗어났어요.</p></section>');
    // R-B
    out.push('<section class="card" aria-labelledby="rb"><h2 class="ct" id="rb">오를지 내릴지 맞힌 비율</h2><div class="hbars">' + rs.tiers.map(function (t) {
      return '<div class="hbar"><div class="hl"><span>' + esc(t.label) + ' <span class="muted nw">(' + t.n + '일)</span></span><b>' + Math.round(t.hit * 100) + '%</b></div>' +
        '<div class="track" aria-hidden="true"><span class="fill" style="width:' + (t.hit * 100) + '%"></span><span class="half"></span></div></div>';
    }).join('') + '</div><p class="sub">┊ 점선 = 50%(동전 던지기)</p>' +
      (rs.flatBand ? '<p style="margin-top:8px">오를 확률 40~60%인 날(' + rs.flatBand.n + '일)은 ' + rs.flatBand.pct + '% 맞았어요. 동전 던지기와 비슷해요.</p>' : '') +
      '<p style="margin-top:8px">확신이 큰 날일수록 맞힌 비율이 높았어요. 그래도 그런 날에도 틀린 날이 있었어요.</p>' +
      '<p class="sub">60%·65%·70% 기준은 이 기간을 보기 전에(2024년까지 자료로) 미리 정해 두었어요.</p></section>');
    // 달별
    var months = S.showAllMonths ? rs.monthly : rs.monthly.slice(0, 6);
    out.push('<section class="card" aria-labelledby="rm"><h2 class="ct" id="rm">달별 성적</h2>' + months.map(function (m) {
      var lbl = m.month.slice(0, 4) + '년 ' + (+m.month.slice(5)) + '월';
      return '<div class="mrow"><b>' + lbl + '</b><span class="nw">' + m.n + '일' + (m.n < 10 ? ' (아직 ' + m.n + '일)' : '') + '</span><span class="nw">보통 ' + m.in80 + '/' + m.n + '</span><span class="nw">넓은 ' + m.in95 + '/' + m.n + '</span></div>';
    }).join('') + (rs.monthly.length > 6 ? '<div class="linkrow"><button type="button" class="textbtn small" data-act="months">' + (S.showAllMonths ? '접기' : '더 보기') + '</button></div>' : '') + '</section>');
    // R-D
    out.push(trustAccordion(r, rs));
    out.push('<p class="sub">모든 기록은 그날 이전 자료만 써서 계산한 것이에요(앱 설치 전 기간도 같은 방식). 판정은 반올림하기 전 숫자로 했어요.</p>');
    return { title: '성적표', body: out.join('') };
  }
  function trustAccordion(r, rs) {
    var secs = CT.trustSections(r.stats, rs);
    return '<section class="card" aria-labelledby="rd"><h2 class="ct" id="rd">얼마나 믿을 만한가요?</h2>' + secs.slice(1).map(function (s) {
      return '<details class="acc"><summary>' + esc(s.q) + '</summary><div class="read">' + (s.table ? dirTable(s.table) : '') + s.a.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div></details>';
    }).join('') + '<div class="linkrow"><button type="button" class="textbtn small" data-act="push" data-page="trust">한 화면에서 모두 읽기 ›</button></div></section>';
  }
  function dirTable(rows) {
    return '<table class="dirtable"><tbody>' + rows.map(function (t) { return '<tr><td>' + esc(t.who) + '<br><span class="muted">' + esc(t.freq) + '</span></td><td style="text-align:right;width:34%"><b>' + esc(t.hit.split(' (')[0]) + '</b>' + (t.hit.indexOf(' (') > 0 ? '<br><span class="muted">' + esc('(' + t.hit.split(' (')[1]) + '</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function pageMisses() {
    var r = S.payload.out.result, rs = Rd.recordStats(r);
    var out = ['<p class="bignum">' + rs.histN + '일 중 ' + rs.missDays.length + '일 넓은 범위를 벗어났어요.</p><p>위로 ' + rs.missUp + '일, 아래로 ' + rs.missDown + '일이에요.</p>'];
    out.push('<section class="card">' + rs.missDays.map(function (m) {
      return '<div class="missrow"><b>' + U.fmtDateFull(m.date) + '</b><p>실제 <b>' + U.fmtInt(m.actual) + '</b> · 예상 <span class="nw">' + U.fmtInt(m.lo95) + '~' + U.fmtInt(m.hi95) + '</span></p><p class="' + (m.up ? 'up-t' : 'down-t') + '">' + (m.up ? '▲ 위로 ' : '▼ 아래로 ') + m.gap + '포인트 벗어남</p></div>';
    }).join('') + '</section>');
    return { title: '틀린 날 모아 보기', back: true, body: out.join('') };
  }
  function pageTrust() {
    var r = S.payload ? S.payload.out.result : null, rs = r ? Rd.recordStats(r) : {};
    var secs = CT.trustSections(r && r.stats, rs);
    var out = secs.map(function (s) {
      return '<section class="card read"><h2 class="ct">' + esc(s.q) + '</h2>' + (s.table ? dirTable(s.table) : '') + s.a.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</section>';
    });
    out.push('<section class="card read"><h2 class="ct">이 앱이 할 수 없는 것</h2><p>\'내일 정확히 몇 포인트\'는 못 맞혀요. 하루 앞을 100포인트 폭으로 맞히려면 오차가 0.4% 안이어야 하는데, 실제 하루 오차는 보통 2~3%예요.</p><p>뉴스로 갑자기 생기는 일은 미리 알 수 없어요.</p><p>개별 종목(예: 삼성전자 하나)의 내일을 예측하지 않아요. 앱은 코스피 전체를 봐요.</p></section>');
    return { title: '얼마나 믿을 만한가요?', back: true, body: out.join('') };
  }

  // ------------------------------------------------------------------ 범위 자세히 (H2)
  function pageRange() {
    var x = info(), r = x.r, lv = [['0.5', '2번 중 1번'], ['0.8', '10번 중 8번'], ['0.9', '10번 중 9번'], ['0.95', '20번 중 19번']];
    var out = ['<p class="bignum">' + U.fmtDateLong(x.target) + ' 코스피 마감 예상</p>'];
    out.push('<section class="card"><h2 class="ct">이만큼 자주 이 사이에서 끝났어요</h2>' + lv.map(function (l) {
      var R = r.ranges[l[0]], strong = l[0] === '0.8';
      return '<div class="mrow"' + (strong ? ' style="font-weight:700"' : '') + '><b>' + l[1] + '</b><span class="nw">' + U.fmt10(R[0]) + ' ~ ' + U.fmt10(R[1]) + '</span>' + (strong ? '<span class="muted">← 오늘 화면의 기준</span>' : '') + '</div>';
    }).join('') + '<p style="margin-top:10px">범위가 넓을수록 더 자주 맞지만, 그만큼 덜 쓸모 있어요.</p></section>');
    out.push('<section class="card read"><h2 class="ct">숫자로 자세히</h2>' + Rd.detailMore(r, { isFinal: x.isFinal, baseWord: x.baseWord, dayWord: x.dayWord, prev: r.yesterday, prevWord: r.yesterday ? U.relDay(r.yesterday.date, x.todayK) : '어제', recentMedW95: Rd.recentMedW95(r.history) }).map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</section>');
    out.push('<section class="card"><h2 class="ct">무엇을 보고 계산했나요?</h2><p class="sub" style="margin-top:0">영향이 큰 순서예요(모델 계산 기준).</p>' + CT.DRIVERS.slice(0, 5).map(function (d, i) {
      return '<div class="mrow"><b>' + (i + 1) + '. ' + (d.term ? T(d.term, d.name) : esc(d.name)) + '</b><span>' + (d.effect > 0 ? '<span class="up-t">▲ 오르면 코스피에 힘</span>' : '<span class="down-t">▲ 오르면 코스피에 부담</span>') + '</span></div>';
    }).join('') + '<p class="sub">이 밖에 원/달러 환율, 유럽 주식, 미국 금리, 코스피 전날 등락 등 모두 11가지를 함께 봐요.</p></section>');
    out.push('<section class="card"><details class="acc"><summary>왜 100포인트 폭으로는 못 맞히나요?</summary><div class="read">' + CT.WHY_NOT_NARROW.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</div></details></section>');
    return { title: '범위 자세히', back: true, body: out.join('') };
  }

  // ------------------------------------------------------------------ 더보기 (M1) 이하
  function pageMore() {
    var ns = S.settings.notif, out = [];
    out.push('<div class="list">' + row('push', I.book, '용어 사전', '', ' data-page="glossary"') + row('push', I.bulb, '알아 두면 좋은 경제 상식', '', ' data-page="tips"') +
      row('push', I.heart, '마음이 불안할 때 읽는 글', '', ' data-page="worry"') + '</div>');
    out.push('<div class="list"><button type="button" class="row press" data-act="bigText" role="switch" aria-checked="' + S.settings.bigText + '">' + I.text + '<span class="rt">글씨 크게</span>' + sw(S.settings.bigText) + '</button>' +
      row('push', I.bell, '아침 알림<small>' + (ns.on ? (ns.weekend ? '매일 ' : '평일 ') + U.fmtHM(ns.time) : '꺼짐') + '</small>', '', ' data-page="settings"') + row('push', I.gear, '설정', '', ' data-page="settings"') + '</div>');
    out.push('<div class="list">' + row('push', I.doc, '안내 (꼭 읽어 주세요)', '', ' data-page="notice"') + row('push', I.q, '이 예측은 얼마나 믿을 만한가요?', '', ' data-page="trust"') +
      row('push', I.i, '앱 정보', '', ' data-page="about"') + '</div>');
    var up = S.update, upText = !up ? '' : up.checking ? '확인 중…' : !up.ok ? '확인하지 못했어요' : up.newer ? '새 버전이 있어요' : '지금이 최신이에요';
    out.push('<div class="list">' + row('checkUpdate', I.down, up && up.newer ? '<b>새 버전이 있어요</b><small>' + esc(up.tag) + ' · 눌러서 내려받기</small>' : '새 버전 확인', up && !up.newer ? upText : '') +
      row('report', I.send, '오류 정보 보내기', '', '') + '</div>');
    out.push('<p class="footer">' + esc(versionText()) + '<br>데이터: Yahoo Finance</p>');
    return { title: '더보기', body: out.join('') };
  }
  function versionText() { return '엄마의 시장 나침반 ' + APP_VERSION + (S.build && S.build.build ? ' (빌드 ' + S.build.build + ')' : ''); }
  function pageSettings() {
    var ns = S.settings.notif, out = [];
    out.push('<p class="secthead">글씨</p><div class="list"><button type="button" class="row press" data-act="bigText" role="switch" aria-checked="' + S.settings.bigText + '"><span class="rt">글씨 크게<small>휴대폰 글씨 크기에 더해 한 단계 더 커져요</small></span>' + sw(S.settings.bigText) + '</button>' +
      '<div style="padding:0 16px 16px"><div class="notice-line"><span class="muted">미리 보기</span><br>오늘 코스피는 오를 가능성이 조금 더 높아요</div>' + (S.scaleCapped ? '<p class="sub">휴대폰 글씨가 이미 커서 여기까지만 커져요.</p>' : '') + '</div></div>');
    out.push('<p class="secthead">알림</p><div class="list"><button type="button" class="row press" data-act="notifOn" role="switch" aria-checked="' + ns.on + '"><span class="rt">아침 알림 받기</span>' + sw(ns.on) + '</button>' +
      row('timeSheet', '', '알림 시각', U.fmtHM(ns.time)) +
      '<button type="button" class="row press" data-act="notifWeekend" role="switch" aria-checked="' + ns.weekend + '"><span class="rt">주말에도 받기</span>' + sw(ns.weekend) + '</button>' +
      '<p style="padding:8px 16px 14px" class="muted">평일 장 시작(9시) 전에 알려 드려요. 알림에는 숫자 없이 "예측이 준비됐어요"만 나와요.' + (S.notifPerm && S.notifPerm !== 'granted' && S.notifPerm !== 'unavailable' ? '<br><b>휴대폰 설정에서 알림이 꺼져 있어요.</b> 휴대폰 설정 › 애플리케이션 › 시장 나침반 › 알림에서 켤 수 있어요.' : '') + (!N.isNative ? '<br>(이 미리보기 화면에서는 알림이 오지 않아요.)' : '') + '</p></div>');
    out.push('<p class="secthead">내 종목</p><div class="list">' + row('tab', I.wallet, '내 종목 관리', '', ' data-tab="holdings"') + '</div>');
    out.push('<p class="secthead">기타</p><div class="list">' + row('obAgain', I.redo, '처음 안내 다시 보기') + row('report', I.send, '문제 알리기 (아들에게 보내기)') + '</div>');
    return { title: '설정', back: true, body: out.join('') };
  }
  function pageNotice() {
    var st = S.payload && S.payload.out.result.stats;
    return { title: '안내', back: true, body: '<section class="card read"><h2 class="ct">' + esc(CT.NOTICE_TITLE) + '</h2><p>' + esc(CT.NOTICE_LEAD) + '</p><ul>' +
      CT.NOTICE_POINTS.concat(CT.NOTICE_EXTRA).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
      (st ? '<p>예측은 틀릴 수 있어요. 지난 ' + st.holdoutN + '일 중 ' + st.miss95 + '일은 넓은 범위를 벗어났어요.</p>' : '') +
      '<div class="linkrow"><button type="button" class="textbtn" data-act="push" data-page="trust">예측이 얼마나 맞았는지 보기 ›</button></div></section>' };
  }
  function pageAbout() {
    var P = S.payload, r = P && P.out.result, m = r && r.meta;
    var lines = [
      ['앱 이름', '엄마의 시장 나침반 (홈 화면: 시장 나침반)'], ['버전', APP_VERSION + (S.build && S.build.build ? ' (빌드 ' + S.build.build + ')' : '')],
      ['데이터', 'Yahoo Finance (비공식 시세, 개인·비상업적 참고용. 늦거나 빠질 수 있어요)'],
      ['예측 방법', '지난 10년 시세 11가지로 매일 다시 학습하는 통계 모델 (모델 ' + (m ? m.version : '1.0.0') + ')'],
      ['마지막 계산', P ? U.fmtDateMD(U.kstDate(P.computedAt)) + ' ' + U.fmtTime(P.computedAt) + (r.mode === 'overnight' ? ' · 아침 확정' : ' · 미리 보기') : '아직 없음'],
      ['만든 사람', '가족용 개인 앱이에요. 다른 사람에게 나눠 주지 말아 주세요.']
    ];
    return { title: '앱 정보', back: true, body: '<section class="card">' + lines.map(function (l) { return '<div class="mrow"><b>' + l[0] + '</b><span>' + esc(l[1]) + '</span></div>'; }).join('') + '</section>' +
      (m ? '<p class="debug">기준 ' + esc(r.baseDate) + ' · ' + esc(m.modeReason) + ' · ' + m.ms.total + 'ms' + (m.warnings && m.warnings.length ? ' · ' + esc(m.warnings.join(' / ')) : '') + '</p>' : '') };
  }
  function pageGlossary() {
    var q = S.glossQ || '';
    var list = CT.GLOSSARY.slice().sort(function (a, b) { return a.term.localeCompare(b.term, 'ko'); }).filter(function (g) {
      if (!q) return true; var Q = q.replace(/\s/g, '').toUpperCase();
      return (g.term + ' ' + g.aliases.join(' ')).replace(/\s/g, '').toUpperCase().indexOf(Q) >= 0 || (U.isChosungQuery(q) && U.chosung(g.term).indexOf(q) >= 0);
    });
    return { title: '용어 사전', back: true, body: '<input class="input" id="glossSearch" type="search" placeholder="용어 찾기" value="' + esc(q) + '" aria-label="용어 찾기"><div class="list" id="glossList">' + glossListHTML(list) + '</div>' };
  }
  function glossListHTML(list) { return list.map(function (g) { return row('push', '', esc(g.term) + '<small>' + esc(g.short.split('.')[0].slice(0, 40)) + '…</small>', '', ' data-page="term" data-id="' + g.id + '"'); }).join('') || '<p class="muted" style="padding:16px">찾는 용어가 없어요.</p>'; }
  function termBody(g, full) {
    var st = S.payload && S.payload.out.result.stats;
    var ex = g.exampleFn === 'coverage' && st ? '지난 ' + st.holdoutN + '거래일 동안 이 앱의 95% 범위 안에 실제 종가가 들어온 날은 ' + (st.cov95 * 100).toFixed(1) + '%였고, ' + st.miss95 + '일은 벗어났어요.' : g.example;
    return '<p class="bignum" style="font-size:var(--fs-lg)">' + esc(g.short.split(/(?<=요\.)\s/)[0]) + '</p>' +
      '<div class="read" style="margin-top:10px">' + g.short.split(/(?<=요\.)\s/).slice(1).map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') +
      '<p><b>비유하면</b> ' + esc(g.analogy) + '</p>' + (ex ? '<p><b>예를 들면</b> ' + esc(ex) + '</p>' : '') + (g.inApp ? '<p><b>이 앱에서는</b> ' + esc(g.inApp) + '</p>' : '') + '</div>' +
      (full && g.related && g.related.length ? '<div class="btnrow" style="margin-top:12px">' + g.related.filter(function (id) { return CT.GLOSSARY_BY_ID[id]; }).map(function (id) { return '<button type="button" class="btn2" data-act="push" data-page="term" data-id="' + id + '">' + esc(CT.GLOSSARY_BY_ID[id].term) + '</button>'; }).join('') + '</div>' : '');
  }
  function pageTerm(args) {
    var g = CT.GLOSSARY_BY_ID[args.id];
    return { title: g.term, back: true, body: '<section class="card">' + termBody(g, true) + '</section>' };
  }
  function tipData() { var P = S.payload; return P ? { ctx: P.out.ctx, afterBigDrop: P.out.afterBigDrop, result: P.out.result } : {}; }
  function pageTips() {
    return { title: '경제 상식', back: true, body: CT.TIPS.map(function (t) {
      return '<button type="button" class="card tipcard press" data-act="push" data-page="tip" data-id="' + t.id + '">' + I.bulb.replace('class="ri"', '') + '<span><b>' + esc(t.title) + '</b><br><span class="muted">' + esc(t.intro) + ' · 읽는 데 2분</span></span></button>';
    }).join('') };
  }
  function pageTip(args) {
    var t = CT.TIPS.filter(function (x) { return x.id === args.id; })[0], b = CT.tipBody(t, tipData());
    return { title: '경제 상식', back: true, body: '<section class="card read"><h2 class="ct">' + esc(t.title) + '</h2>' + b.body.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      (b.live ? '<p class="notice-line">' + esc(b.live) + '</p>' : '') + (b.caution ? '<p class="muted">' + esc(b.caution) + '</p>' : '') +
      '<div class="btnrow" style="margin-top:12px">' + t.links.map(function (id) { return '<button type="button" class="btn2" data-act="push" data-page="term" data-id="' + id + '">' + esc(CT.GLOSSARY_BY_ID[id].term) + '</button>'; }).join('') + '</div></section>' +
      (S.payload && S.payload.demo ? '<p class="demo-band">체험용 화면의 일부 숫자는 예시 시세로 계산했어요.</p>' : '') };
  }
  function pageWorry() {
    var pages = CT.worryPages(S.payload && S.payload.out.result.stats), i = Math.min(S.worryPage, pages.length - 1), p = pages[i];
    return { title: '마음이 쓰이는 날', back: true, body: (S.worryFact && i === 0 ? '<p class="notice-line">' + esc(S.worryFact) + '</p>' : '') +
      '<section class="card read" style="font-size:1.25rem"><p class="muted">' + (i + 1) + ' / ' + pages.length + '</p><h2 class="ct">' + esc(p.title) + '</h2><p>' + esc(p.body) + '</p>' +
      (i === pages.length - 1 ? '<p class="muted">' + esc(CT.WORRY_FOOT) + '</p>' : '') + '</section>' +
      '<div class="btnrow">' + (i > 0 ? '<button type="button" class="btn2" data-act="worryPrev">‹ 앞 장</button>' : '') + (i < pages.length - 1 ? '<button type="button" class="btn" data-act="worryNext">다음 장 ›</button>' : '<button type="button" class="btn" data-act="back">다 읽었어요</button>') + '</div>' };
  }

  var PAGES = { range: pageRange, holding: pageHolding, misses: pageMisses, trust: pageTrust, settings: pageSettings, notice: pageNotice, about: pageAbout, glossary: pageGlossary, term: pageTerm, tips: pageTips, tip: pageTip, worry: pageWorry };
  var TABS = { today: pageToday, holdings: pageHoldings, record: pageRecord, more: pageMore };

  // ------------------------------------------------------------------ 그리기
  function render() {
    seen = new Set();
    var top = S.stack[S.stack.length - 1], v;
    try { v = top ? PAGES[top.name](top.args || {}) : TABS[S.tab](); }
    catch (e) { logError({ code: 'RENDER', message: String(e && e.message || e), at: Date.now() }); v = { title: '잠깐만요', back: !!top, body: '<section class="card empty"><p>화면을 그리는 중에 문제가 생겼어요.</p><button type="button" class="btn" data-act="report">오류 정보 보내기</button></section>' }; if (window.console) console.warn(e); }
    $('title').textContent = v.title;
    $('backBtn').hidden = !v.back;
    $('topActions').innerHTML = v.action || '';
    view.innerHTML = '<div class="ptr" id="ptr"></div><div class="page' + (S.anim ? ' slide' : '') + '">' + v.body + '</div>';
    S.anim = false;
    document.querySelectorAll('.tab').forEach(function (t) { if (t.dataset.tab === S.tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    renderStrip();
    if (S.flash && !top && S.tab === 'today') { ['verdictCard', 'rangeCard'].forEach(function (id) { var el = $(id); if (el) el.classList.add('flash'); }); S.flash = false; }
    if (v.after) requestAnimationFrame(v.after);
  }
  function renderStrip() {
    var s = $('strip'), L = S.loading, P = S.payload, html = '';
    if (L && P) html = '<div class="band info"><span class="bt" id="pstage2">새 자료로 다시 계산하는 중이에요 (' + L.stage + '/3)' + (L.slow ? ' · 인터넷이 느려서 조금 더 걸려요' : '') + '</span><div class="progress"><i id="pbar2" style="width:' + L.pct + '%"></i></div></div>';
    else if (S.doneBand) html = '<div class="band info"><span class="bt">새로 계산했어요 ✓</span></div>';
    else if (S.netBack) html = '<div class="band info"><span class="bt">다시 연결됐어요.</span><button type="button" class="btn2" data-act="retry">새로 계산</button></div>';
    else if (S.error && P) {
      var off = S.error.code === 'OFFLINE';
      html = '<div class="band"><svg viewBox="0 0 24 24" fill="none" stroke="#8A5300" stroke-width="2.2" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.1" stroke-linecap="round"/></svg><span class="bt">' +
        (off ? '인터넷에 연결되지 않아 <b class="nw">' + U.fmtDateMD(U.kstDate(P.computedAt)) + ' ' + U.fmtTime(P.computedAt) + '</b>에 계산한 결과를 보여 드려요.' : '시세 자료를 가져오지 못했어요. 잠시 뒤 다시 해 볼게요. 지금은 저장된 결과예요.') +
        '</span><button type="button" class="btn2" data-act="retry">다시 시도</button></div>';
    } else if (P && P.usedCached && P.usedCached.length && !P.demo) html = '<div class="band grey"><span class="bt">일부 해외 시세(' + P.usedCached.length + '개)를 받지 못해 저장해 둔 값으로 계산했어요.</span></div>';
    s.innerHTML = html;
  }
  function updateProgress() {
    var L = S.loading; if (!L) return;
    if (!S.payload && S.tab === 'today' && !S.stack.length) {
      var b = $('pbar');
      if (!b) { render(); return; }
      b.style.width = L.pct + '%';
      $('pstage').textContent = L.stage + ' / 3 단계';
      $('ptext').textContent = ['밤사이 세계 시장 소식을 모으는 중이에요…', '지난 10년 자료로 범위를 계산하는 중이에요…', '거의 다 됐어요…'][L.stage - 1];
      if (L.slow && !L.slowShown) { L.slowShown = true; render(); }
      return;
    }
    var b2 = $('pbar2'), st = $('pstage2');
    if (!b2) { renderStrip(); return; }
    b2.style.width = L.pct + '%';
    st.textContent = '새 자료로 다시 계산하는 중이에요 (' + L.stage + '/3)' + (L.slow ? ' · 인터넷이 느려서 조금 더 걸려요' : '');
  }

  // ------------------------------------------------------------------ 이동
  function saveScroll() { if (!S.stack.length) S.scroll[S.tab] = view.scrollTop; }
  function goTab(tab) {
    if (S.tab === tab && !S.stack.length) { view.scrollTop = 0; return; }
    saveScroll(); S.tab = tab; S.stack = []; render(); view.scrollTop = S.scroll[tab] || 0;
  }
  function push(name, args) { saveScroll(); S.stack.push({ name: name, args: args }); S.anim = true; render(); view.scrollTop = 0; }
  function back() {
    if (S.sheet) { closeSheet(); return true; }
    if (S.stack.length) { S.stack.pop(); render(); if (!S.stack.length) view.scrollTop = S.scroll[S.tab] || 0; return true; }
    if (S.tab !== 'today') { goTab('today'); return true; }
    return false;
  }

  // ------------------------------------------------------------------ 시트
  function openSheet(id, html, tall) {
    S.sheet = id;
    $('sheet-root').innerHTML = '<div class="sheet-wrap" role="dialog" aria-modal="true"><div class="sheet-bg" data-act="closeSheet"></div><div class="sheet' + (tall ? ' tall' : '') + '">' + html + '</div></div>';
  }
  function closeSheet() { S.sheet = null; S.add = null; $('sheet-root').innerHTML = ''; }
  function termSheet(id) {
    var g = CT.GLOSSARY_BY_ID[id]; if (!g) return;
    seen = new Set();
    openSheet('term', '<div class="handle" aria-hidden="true"></div><div class="sh"><h2>' + esc(g.term) + '</h2><button type="button" class="tbtn" data-act="closeSheet">닫기</button></div>' + termBody(g, false) +
      '<div class="linkrow"><button type="button" class="textbtn" data-act="termMore" data-id="' + id + '">용어 사전에서 더 보기 ›</button></div>');
  }
  function timeSheet() {
    var cur = S.settings.notif.time, opts = ['07:30', '08:00', '08:40', '09:00'];
    openSheet('time', '<div class="handle" aria-hidden="true"></div><div class="sh"><h2>몇 시에 알려 드릴까요?</h2><button type="button" class="tbtn" data-act="closeSheet">닫기</button></div>' +
      '<div class="btnrow">' + opts.map(function (t) { return '<button type="button" class="btn2" data-act="setTime" data-t="' + t + '" aria-pressed="' + (t === cur) + '"' + (t === cur ? ' style="background:var(--brand);color:#fff"' : '') + '>' + U.fmtHM(t) + (t === '08:40' ? ' (기본)' : '') + (t === cur ? ' ✓' : '') + '</button>'; }).join('') + '</div>' +
      '<p style="margin-top:14px"><b>직접 고르기</b></p><input class="input" type="time" id="timeInput" value="' + cur + '" aria-label="알림 시각 직접 고르기" style="margin-top:6px">' +
      '<button type="button" class="btn" style="margin-top:10px" data-act="setTimeCustom">이 시각으로</button>' +
      '<p class="sub">8시 40분이 기본이에요. 밤사이 미국 시장 자료가 다 모인 뒤, 장 시작 20분 전이에요.</p>');
  }
  function confirmRemove(idx) {
    var item = S.holdings[idx];
    openSheet('confirm', '<div class="sh"><h2>정말 뺄까요?</h2></div><p>' + esc(item.name) + U.josa(item.name, '을', '를') + ' 내 종목에서 빼요.</p><div class="btnrow" style="margin-top:16px"><button type="button" class="btn2" data-act="closeSheet">취소</button><button type="button" class="btn" data-act="removeDo" data-id="' + idx + '">빼기</button></div>');
  }
  function amountSheet(idx) {
    var item = S.holdings[idx];
    openSheet('amount', '<div class="sh"><h2>넣어 두신 금액</h2><button type="button" class="tbtn" data-act="closeSheet">닫기</button></div><p>' + esc(item.name) + '</p>' +
      '<div class="inputwrap" style="margin-top:8px"><input class="input" id="amountEdit" inputmode="numeric" value="' + (item.amountWon ? Math.round(item.amountWon / 10000) : '') + '" aria-label="금액(만 원)"><span>만 원</span></div><p class="sub">비워 두면 금액 없이 보여 드려요. 폰 안에만 저장돼요.</p>' +
      '<button type="button" class="btn" style="margin-top:12px" data-act="amountSave" data-id="' + idx + '">저장</button>');
  }
  function dotSheet(i) {
    var h = S.payload.out.result.history[i]; if (!h) return;
    var res = h.in80 ? '보통 범위 안에서 끝났어요' : h.in95 ? '보통 범위는 벗어났지만 넓은 범위 안이었어요' : '넓은 범위보다 ' + Math.round(h.actual > h.hi95 ? h.actual - h.hi95 : h.lo95 - h.actual) + '포인트 ' + (h.actual > h.hi95 ? '위' : '아래') + '에서 끝났어요';
    openSheet('dot', '<div class="sh"><h2>' + U.fmtDateLong(h.date) + '</h2><button type="button" class="tbtn" data-act="closeSheet">닫기</button></div>' +
      '<div class="mrow"><b>보통 범위</b><span class="nw">' + U.fmtInt(h.lo80) + '~' + U.fmtInt(h.hi80) + '</span></div><div class="mrow"><b>넓은 범위</b><span class="nw">' + U.fmtInt(h.lo95) + '~' + U.fmtInt(h.hi95) + '</span></div>' +
      '<div class="mrow"><b>실제 마감</b><span class="nw">' + U.fmtInt(h.actual) + '</span></div><p style="margin-top:10px;font-weight:700">' + res + '</p>');
  }

  // ------------------------------------------------------------------ 갱신
  var retryTimer = null;
  function refresh(manual) {
    if (S.loading) return;
    var P = S.payload;
    if (manual && P && !S.error && !E.demo && Date.now() - P.computedAt < 10 * 60e3) { toast('방금 계산한 결과예요 (' + U.fmtTime(P.computedAt) + ')'); return; }
    S.loading = { stage: 1, pct: 0, slow: false }; S.error = null; S.netBack = false;
    if (!P) render(); else renderStrip();
    E.refresh(function (stage, pct, slow) { if (!S.loading) return; S.loading.stage = stage; S.loading.pct = pct; if (slow) S.loading.slow = true; updateProgress(); })
      .then(function (p) {
        var had = !!S.payload; S.payload = p; S.loading = null; S.statsMemo = {};
        if (had && !E.demo) { S.flash = true; S.doneBand = true; setTimeout(function () { S.doneBand = false; renderStrip(); }, 1500); }
        render();
      }, function (e) {
        S.loading = null; S.error = { code: e.code || 'ERROR', message: String(e.message || e), at: Date.now() };
        logError(S.error); render();
        if (e.code !== 'OFFLINE' && !retryTimer) retryTimer = setTimeout(function () { retryTimer = null; if (S.error) refresh(false); }, 5 * 60e3);
      });
  }
  function logError(e) { var a = LS.get('errors', []); a.push(e); LS.set('errors', a.slice(-10)); }
  function report() {
    var P = S.payload, r = P && P.out.result, errs = LS.get('errors', []);
    var text = ['[시장 나침반 오류 정보]', '앱: ' + versionText(), '시각: ' + new Date().toISOString(),
      '현재 오류: ' + (S.error ? S.error.code + ' ' + S.error.message : '없음'),
      '마지막 계산: ' + (P ? new Date(P.computedAt).toISOString() + ' / ' + r.mode + ' / 기준 ' + r.baseDate + ' / ' + (r.meta && r.meta.modeReason) : '없음'),
      '받지 못한 시세: ' + (P && P.usedCached && P.usedCached.length ? P.usedCached.join(', ') : '없음'),
      '최근 오류: ' + errs.slice(-5).map(function (e) { return new Date(e.at).toISOString() + ' ' + e.code + ' ' + e.message; }).join(' | '),
      '글씨 배율: ' + (S.scale || 1).toFixed(2), '기기: ' + navigator.userAgent].join('\n');
    N.share('시장 나침반 오류 정보', text).then(function (res) {
      if (res === 'unsupported') openSheet('report', '<div class="sh"><h2>오류 정보</h2><button type="button" class="tbtn" data-act="closeSheet">닫기</button></div><p>아래 내용을 길게 눌러 복사해서 회준님께 보내 주세요.</p><pre class="debug" style="white-space:pre-wrap">' + esc(text) + '</pre>');
    });
  }
  function checkUpdate(open) {
    if (S.update && S.update.newer && open) { N.openUrl(S.update.url); return; }
    if (E.demo) { S.update = { ok: false }; render(); toast('미리보기 화면에서는 확인하지 않아요'); return; }
    S.update = { checking: true }; render();
    E.checkUpdate().then(function (u) { S.update = u; LS.set('update.checkedOn', todayK()); render(); if (u.ok && !u.newer) toast('지금이 최신이에요'); });
  }

  // ------------------------------------------------------------------ 알림 설정 반영
  function applyNotif() {
    if (!N.isNative) return Promise.resolve();
    return N.Noti.check().then(function (p) { S.notifPerm = p; return N.Noti.apply(S.settings.notif); });
  }

  // ------------------------------------------------------------------ 첫 실행 안내 (O1~O3)
  function needOnboarding() {
    var n = LS.get('notice', null);
    if (E.demo) return E.params.get('ob') === '1';
    return !n || !n.accepted || n.version !== CT.NOTICE_VERSION;
  }
  function startOnboarding(again) {
    var n = LS.get('notice', null), onlyO3 = !again && n && n.accepted && n.version !== CT.NOTICE_VERSION;
    var step = +(E.params.get('obstep') || 0);
    S.ob = { step: onlyO3 ? 2 : step, checked: !!again, notif: S.settings.notif.on, again: !!again };
    renderOb();
  }
  function renderOb() {
    var o = S.ob, el = $('onboarding');
    if (!o) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var st = S.payload && S.payload.out.result.stats, N0 = st ? st.holdoutN : 431, M0 = st ? st.miss95 : 22;
    var dots = '<div class="ob-dots" aria-hidden="true">' + [0, 1, 2].map(function (i) { return '<i class="' + (i === o.step ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    var top = '<div class="ob-top"><span class="muted">' + (o.step + 1) + ' / 3</span>' + (o.step < 2 ? '<button type="button" class="tbtn" data-act="obSkip">건너뛰기</button>' : '') + '</div>';
    var body, foot;
    if (o.step === 0) {
      body = appIcon(96) + '<h2 style="text-align:center">엄마의 시장 나침반에 오신 걸 환영해요</h2><ul class="feat">' +
        '<li>' + I.sun + '<span>오늘 시장 분위기를 한눈에 보여 드려요</span></li><li>' + I.wallet.replace('class="ri"', '') + '<span>갖고 계신 종목과 함께 설명해 드려요</span></li><li>' + I.check + '<span>얼마나 맞았는지도 숨김없이 보여 드려요</span></li></ul>';
      foot = dots + '<button type="button" class="btn" data-act="obNext">다음</button>';
    } else if (o.step === 1) {
      body = '<h2>이렇게 읽어요</h2><div class="card"><div class="rangeviz" style="padding-top:28px"><span class="baselabel" style="left:calc(50% - 2em)">어제 마감</span><div class="bar"><i class="b95" style="left:6%;width:88%"></i><i class="b80dn" style="left:22%;width:28%"></i><i class="b80up" style="left:50%;width:30%"></i><span class="diamond" style="left:54%"></span></div><span class="baseline" style="left:50%"></span></div>' +
        '<div class="ticks" style="margin-top:10px"><span class="dn">↓ 내리면</span><span class="upw">오르면 ↑</span></div></div>' +
        '<ul class="feat" style="margin-top:16px"><li><span style="width:30px;flex:none;text-align:center"><span style="display:inline-block;width:26px;height:14px;border-radius:7px;background:linear-gradient(90deg,var(--down-band) 50%,var(--up-band) 50%)"></span></span><span><b>진한 띠</b>: 10번 중 8번은 이 사이에서 끝났어요</span></li>' +
        '<li><span style="width:30px;flex:none;text-align:center"><span style="display:inline-block;width:26px;height:14px;border-radius:7px;background:var(--band-95)"></span></span><span><b>연한 띠</b>: 20번 중 19번. 한 달에 한 번쯤은 밖으로 나가요</span></li>' +
        '<li><span style="width:30px;flex:none;text-align:center;font-size:1.2rem">◆</span><span><b>가장 가운데</b> 값이에요. 맞힐 값은 아니에요</span></li>' +
        '<li><span style="width:30px;flex:none;text-align:center;font-weight:700">┊</span><span><b>점선</b>은 어제 마감이에요</span></li></ul><p>띠가 넓을수록 시장이 크게 출렁이는 때예요.</p>';
      foot = dots + '<button type="button" class="btn" data-act="obNext">다음</button>';
    } else {
      body = '<div style="display:flex;justify-content:center">' + I.compass.replace('viewBox', 'width="56" height="56" viewBox') + '</div><h2>' + esc(CT.NOTICE_TITLE) + '</h2><p>' + esc(CT.NOTICE_LEAD) + '</p><ul>' +
        CT.NOTICE_POINTS.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
        '<p>지난 ' + N0 + '일 중 ' + M0 + '일은 넓은 범위를 벗어났어요. 한 달에 한 번쯤은 벗어나요.</p><p class="muted" style="margin-top:8px">궁금하면 언제든 더보기 › 안내에서 다시 볼 수 있어요.</p>' +
        '<div style="margin-top:16px"><button type="button" class="check" data-act="obCheck" role="checkbox" aria-checked="' + o.checked + '"><span class="box" aria-hidden="true">' + (o.checked ? '✓' : '') + '</span>네, 참고용이라는 걸 이해했어요</button></div>' +
        '<button type="button" class="row" style="border:0;padding:12px 0" data-act="obNotif" role="switch" aria-checked="' + o.notif + '">' + I.bell + '<span class="rt">평일 아침 ' + U.fmtHM(S.settings.notif.time) + '에 알려 드릴게요</span>' + sw(o.notif) + '</button>';
      foot = dots + (o.checked ? '' : '<p class="muted" style="text-align:center">글을 읽고 \'네, 참고용이라는 걸 이해했어요\' 칸을 눌러 주세요</p>') + '<button type="button" class="btn" data-act="obStart"' + (o.checked ? '' : ' disabled') + '>시작하기</button>';
    }
    el.innerHTML = top + '<div class="ob-body" id="obBody">' + body + '</div><div class="ob-foot">' + foot + '</div>';
  }
  function finishOnboarding() {
    var o = S.ob;
    LS.set('notice', { accepted: true, version: CT.NOTICE_VERSION, ackAt: new Date().toISOString() });
    LS.set('onboardingDone', true);
    if (!LS.get('installDate')) LS.set('installDate', todayK());
    S.settings.notif.on = o.notif; saveSettings();
    S.ob = null; renderOb();
    if (N.isNative && o.notif) N.Noti.request().then(function (p) { S.notifPerm = p; return N.Noti.apply(S.settings.notif); });
    else applyNotif();
  }

  // ------------------------------------------------------------------ 누름 처리
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    var a = el.dataset.act, d = el.dataset;
    switch (a) {
      case 'tab': closeSheet(); goTab(d.tab); break;
      case 'back': back(); break;
      case 'push': if (d.page === 'worry') S.worryPage = 0; push(d.page, { id: d.id }); break;
      case 'refresh': refresh(true); break;
      case 'retry': S.netBack = false; refresh(false); break;
      case 'term': termSheet(d.id); break;
      case 'termMore': closeSheet(); push('term', { id: d.id }); break;
      case 'closeSheet': closeSheet(); break;
      case 'toggle': S.openRows[d.key] = !S.openRows[d.key]; render(); break;
      case 'briefMore': S.briefMore = !S.briefMore; render(); break;
      case 'guardOk': dismissGuard(d.screen); render(); break;
      case 'hideSelfCheck': LS.set('selfcheck.hiddenOn', todayK()); render(); break;
      case 'hideWorry': LS.set('worry.hiddenOn', todayK()); render(); break;
      case 'months': S.showAllMonths = !S.showAllMonths; render(); break;
      case 'dot': dotSheet(+d.i); break;
      case 'worryNext': S.worryPage++; render(); view.scrollTop = 0; break;
      case 'worryPrev': S.worryPage = Math.max(0, S.worryPage - 1); render(); view.scrollTop = 0; break;
      case 'bigText': S.settings.bigText = !S.settings.bigText; saveSettings(); var keep = view.scrollTop; applyScale(); render(); view.scrollTop = keep; break;
      case 'notifOn':
        S.settings.notif.on = !S.settings.notif.on; saveSettings();
        if (S.settings.notif.on && N.isNative) N.Noti.request().then(function (p) { S.notifPerm = p; N.Noti.apply(S.settings.notif); render(); }); else applyNotif();
        render(); break;
      case 'notifWeekend': S.settings.notif.weekend = !S.settings.notif.weekend; saveSettings(); applyNotif(); render(); break;
      case 'timeSheet': timeSheet(); break;
      case 'setTime': S.settings.notif.time = d.t; saveSettings(); applyNotif(); closeSheet(); render(); toast(U.fmtHM(d.t) + '에 알려 드릴게요'); break;
      case 'setTimeCustom': var tv = $('timeInput').value; if (/^\d\d:\d\d$/.test(tv)) { S.settings.notif.time = tv; saveSettings(); applyNotif(); closeSheet(); render(); toast(U.fmtHM(tv) + '에 알려 드릴게요'); } break;
      case 'obAgain': startOnboarding(true); break;
      case 'report': report(); break;
      case 'checkUpdate': checkUpdate(true); break;
      case 'addOpen': if (!S.holdings) loadHoldings(); openAdd(); break;
      case 'addSeg': S.add.seg = d.seg; S.add.sel = null; S.add.q = ''; refreshAdd(); break;
      case 'addPick': S.add.sel = S.add.sel === d.id ? null : d.id; refreshAdd(); break;
      case 'addCode': S.add.mode = 'code'; S.add.msg = null; S.add.found = null; refreshAdd(); break;
      case 'addBackList': S.add.mode = 'list'; refreshAdd(); break;
      case 'addDo': {
        var c = H.CATALOG.filter(function (x) { return x.id === S.add.sel; })[0]; if (!c) break;
        var amt = $('amountInput') ? parseFloat(($('amountInput').value || '').replace(/[^\d.]/g, '')) : NaN;
        var item = Object.assign({}, c); delete item.chosung; if (amt > 0) item.amountWon = Math.round(amt * 10000);
        addHolding(item); break;
      }
      case 'codeFind': {
        var code = ($('codeInput').value || '').replace(/\D/g, '');
        S.add.code = code;
        if (code.length !== 6) { S.add.msg = '6자리 숫자를 넣어 주세요.'; refreshAdd(); break; }
        S.add.busy = true; S.add.msg = null; S.add.found = null; refreshAdd();
        E.lookupCode(code, kospiLast()).then(function (f) {
          if (!S.add) return; S.add.busy = false;
          if (f) S.add.found = f; else S.add.msg = '찾지 못했어요. 회준님께 부탁해 주세요.';
          refreshAdd();
        }); break;
      }
      case 'codeAdd': {
        var f = S.add.found, nm = ($('foundName').value || f.name).trim();
        addHolding({ id: f.symbol.slice(0, 6), name: nm, symbol: f.symbol, type: 'stock', group: '직접 넣음' }); break;
      }
      case 'removeAsk': confirmRemove(+d.id); break;
      case 'removeDo': S.holdings.splice(+d.id, 1); saveHoldings(); closeSheet(); S.stack = []; render(); toast('뺐어요'); break;
      case 'amountEdit': amountSheet(+d.id); break;
      case 'amountSave': {
        var v = parseFloat(($('amountEdit').value || '').replace(/[^\d.]/g, '')), it = S.holdings[+d.id];
        if (v > 0) it.amountWon = Math.round(v * 10000); else delete it.amountWon;
        saveHoldings(); closeSheet(); render(); break;
      }
      case 'obNext': S.ob.step = Math.min(2, S.ob.step + 1); renderOb(); break;
      case 'obSkip': S.ob.step = 2; renderOb(); break;
      case 'obCheck': S.ob.checked = !S.ob.checked; renderOb(); break;
      case 'obNotif': S.ob.notif = !S.ob.notif; renderOb(); break;
      case 'obStart': finishOnboarding(); break;
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'addSearch' && S.add) { S.add.q = e.target.value; S.add.sel = null; refreshAdd(true); }
    else if (e.target.id === 'amountInput' && S.add) S.add.amount = e.target.value;
    else if (e.target.id === 'codeInput' && S.add) S.add.code = e.target.value;
    else if (e.target.id === 'glossSearch') {
      S.glossQ = e.target.value; seen = new Set();
      var q = S.glossQ, list = CT.GLOSSARY.slice().sort(function (a, b) { return a.term.localeCompare(b.term, 'ko'); }).filter(function (g) {
        if (!q) return true; var Q = q.replace(/\s/g, '').toUpperCase();
        return (g.term + ' ' + g.aliases.join(' ')).replace(/\s/g, '').toUpperCase().indexOf(Q) >= 0 || (U.isChosungQuery(q) && U.chosung(g.term).indexOf(q) >= 0);
      });
      $('glossList').innerHTML = glossListHTML(list);
    }
  });

  // 첫 실행 안내 좌우 넘기기
  (function () {
    var sx = null, sy = null;
    $('onboarding').addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    $('onboarding').addEventListener('touchend', function (e) {
      if (sx == null || !S.ob) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
      if (dx < 0 && S.ob.step < 2) { S.ob.step++; renderOb(); }
      if (dx > 0 && S.ob.step > 0 && !S.ob.again) { S.ob.step--; renderOb(); }
      if (dx > 0 && S.ob.step > 0 && S.ob.again) { S.ob.step--; renderOb(); }
    }, { passive: true });
  })();

  // 당겨서 새로고침 (ux1 4-1)
  (function () {
    var y0 = null, dist = 0;
    view.addEventListener('touchstart', function (e) { if (view.scrollTop <= 0 && !S.stack.length && (S.tab === 'today' || S.tab === 'holdings')) { y0 = e.touches[0].clientY; dist = 0; } else y0 = null; }, { passive: true });
    view.addEventListener('touchmove', function (e) {
      if (y0 == null) return; dist = Math.max(0, e.touches[0].clientY - y0);
      var p = $('ptr'); if (!p) return; var hgt = Math.min(120, dist * 0.5);
      p.style.height = hgt + 'px';
      var ready = hgt >= 80;
      if (ready && !p.dataset.ready && navigator.vibrate) { try { navigator.vibrate(10); } catch (x) { /* ignore */ } }
      p.dataset.ready = ready ? '1' : '';
      p.textContent = ready ? '놓으면 새로 계산해요' : '아래로 당기면 새로 계산해요';
    }, { passive: true });
    view.addEventListener('touchend', function () {
      var p = $('ptr'); if (y0 == null || !p) return; y0 = null;
      var go = p.dataset.ready === '1'; p.style.height = '0px'; p.textContent = ''; p.dataset.ready = '';
      if (go) refresh(true);
    });
  })();

  // 안드로이드 뒤로 가기 (ux1 4-9)
  N.onBack(function () {
    if (S.ob) { if (S.ob.step > 0) { S.ob.step--; renderOb(); } return; }
    if (back()) return;
    var now = Date.now();
    if (now - S.lastBack < 2000) N.exitApp(); else { S.lastBack = now; toast('한 번 더 누르면 앱이 닫혀요', 2000); }
  });
  N.onResume(function () {
    N.textZoom().then(function (z) { if (z) { S.sysScale = z; applyScale(); render(); } });
    if (!E.demo && S.payload && Date.now() - S.payload.computedAt > 10 * 60e3) refresh(false);
  });
  N.onNetwork(function (online) {
    if (online && S.error && S.error.code === 'OFFLINE') { S.netBack = true; renderStrip(); }
  });
  N.Noti.onTap(function () { closeSheet(); S.stack = []; goTab('today'); refresh(false); });
  window.addEventListener('resize', function () { var t = S.stack.length ? null : S.tab; if (t === 'today') afterRange(); });

  // ------------------------------------------------------------------ 시작
  function init() {
    var qs = E.params;
    if (qs.get('scale')) S.sysScale = +qs.get('scale');
    if (qs.get('shot') === '1') document.documentElement.classList.add('shot');
    if (qs.get('big') === '1') S.settings.bigText = true;
    applyScale();
    if (!LS.get('installDate')) LS.set('installDate', U.kstDate(Date.now()));
    Promise.all([N.textZoom(), E.getBuild(), E.loadLast()]).then(function (a) {
      if (a[0] && !qs.get('scale')) S.sysScale = a[0];
      applyScale();
      S.build = a[1]; S.payload = a[2] || null;
      loadHoldings();
      var tab = qs.get('tab'); if (tab && TABS[tab]) S.tab = tab;
      var pg = qs.get('page'); if (pg && PAGES[pg]) S.stack = [{ name: pg, args: { id: qs.get('id') } }];
      if (qs.get('loading') === '1') { S.payload = null; S.loading = { stage: 2, pct: 72, slow: false }; }
      if (qs.get('error') === 'offline') { S.error = { code: 'OFFLINE', message: 'demo', at: Date.now() }; if (qs.get('nocache') === '1') S.payload = null; }
      render();
      if (qs.get('sheet') === 'add') openAdd();
      if (qs.get('sheet') === 'term') termSheet(qs.get('id') || 'kospi');
      if (qs.get('sheet') === 'time') timeSheet();
      if (needOnboarding()) startOnboarding(false);
      if (!E.demo) {
        if (!S.payload || Date.now() - S.payload.computedAt > 10 * 60e3) refresh(false);
        applyNotif();
      }
    }).catch(function (e) {
      logError({ code: 'INIT', message: String(e && e.message || e), at: Date.now() });
      render();
    });
  }
  window.__app = { S: S, render: render, refresh: refresh };
  init();
})();
