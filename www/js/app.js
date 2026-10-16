/* 시장 나침반 v2 — 화면. 아래 탭 5개(예측·성적·반도체·성상현·정보), 숫자와 그래프 위주, 문장은 카드당 한 줄.
 * 2.7.0: 기록+달력을 '성적' 탭 하나로, 이주완 탭을 '반도체' 탭(한눈에·사이클 모델·이주완 모델·주장 점검)으로 정리. 예측 탭은 맨 위 한 줄 요약 + 세부 그래프 접기. */
(function () {
  'use strict';
  var U = window.MCUtil, D = window.Data, N = D.Native, LS = D.LS, Ch = window.Charts, Cp = window.Compute, esc = U.esc;
  var APP_VERSION = '2.8.0';
  var NOTICE_VERSION = 2;
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    tab: 'predict', payload: null, loading: null, error: null, period: '3m', scroll: {},
    settings: Object.assign({ notif: { on: true, time: '08:40' } }, LS.get('settings2', {})),
    sysScale: 1, update: null, build: null, lastBack: 0,
    hl: {}, cal: { month: null, sel: null, allMonths: false }, score: 'cal', predMore: false
  };

  var I = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    predict: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l5-5 4 3 4-6"/><path d="M16 9l5-4M16 9l5 9" opacity=".6"/></svg>',
    record: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 15l2.5-3 2.5 2 3-4.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14.5h.01M12 14.5h.01M16 14.5h.01" stroke-width="2.6"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    sung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 11.5h5"/></svg>',
    semi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 9.5h5v5h-5z"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/></svg>'
  };

  // ------------------------------------------------------------------ 글씨 배율
  // 2.8.0: 어머님 눈에 맞춰 기본을 '크게'(1.3배)로. 고르는 값: 보통 1.15 · 크게 1.3 · 아주 크게 1.5 (폰 글꼴 크기와 곱함, 최대 1.75배).
  // 예전 설정(scale: 1/1.15/1.3)은 무시하고 새 기본값에서 시작한다(text 칸이 없으면 1.3).
  var TEXT_SIZES = [[1.15, '보통'], [1.3, '크게'], [1.5, '아주 크게']];
  function textSize() { var t = S.settings.text; return TEXT_SIZES.some(function (o) { return o[0] === t; }) ? t : 1.3; }
  function applyScale() {
    var sc = Math.min(1.75, S.sysScale * (S.demoText != null ? S.demoText : textSize()));
    var root = document.documentElement;
    root.style.fontSize = (16 * sc) + 'px';
    // 큰 글씨에서는 두 칸 배치를 한 칸으로 바꾼다(css의 .big/.huge)
    root.classList.toggle('big', sc >= 1.35);
    root.classList.toggle('huge', sc >= 1.55);
  }
  function saveSettings() { LS.set('settings2', S.settings); }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ------------------------------------------------------------------ 공통 조각
  function card(inner, cls) { return '<section class="card' + (cls ? ' ' + cls : '') + '">' + inner + '</section>'; }
  function head(title, sub, right) {
    return '<div class="head"><h2>' + esc(title) + '</h2>' + (right || '') + '</div>' + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '');
  }
  function chartBox(id) { return '<div class="chart" id="' + id + '"></div>'; }
  function legend(items) {
    return '<div class="legend">' + items.map(function (it) {
      var m = it[0] === 'sw' ? '<i class="sw" style="background:var(' + it[1] + ')"></i>'
        : it[0] === 'ln' ? '<i class="ln' + (it[1] ? ' ' + it[1] : '') + '"></i>'
          : it[0] === 'dot' ? '<i class="dot" style="background:var(' + it[1] + ')"></i>'
            : '<i class="ring"></i>';
      return '<span>' + m + esc(it[2]) + '</span>';
    }).join('') + '</div>';
  }
  function chip(cls, text) { return '<span class="chip ' + cls + '"><i></i>' + esc(text) + '</span>'; }
  function demoChip() { return D.demo ? '<span class="chip demo">데모</span>' : ''; }
  function setBar(title, chips, withRefresh) {
    $('bar').innerHTML = '<h1>' + esc(title) + '</h1>' +
      (withRefresh ? '<button type="button" class="iconbtn' + (S.loading ? ' spin' : '') + '" data-act="refresh" aria-label="새로 계산">' + I.refresh + '</button>' : '<span></span>') +
      '<div class="chips">' + chips + demoChip() + '</div>';
  }

  // ------------------------------------------------------------------ 예측 탭
  var MOVE_NAMES = [
    ['sox', 'SOX(반도체)', 'SOX(미국 반도체 지수)'], ['ndx', '나스닥', '나스닥 종합지수'], ['ewy', 'EWY(한국 ETF)', 'EWY(미국 상장 한국 주식 ETF)'],
    ['mu', '마이크론', '마이크론(미국 메모리 반도체)'], ['vix', 'VIX(변동성)', 'VIX(미국 변동성 지수)'], ['usdkrw', '원/달러', '원/달러 환율'],
    ['stoxx', '유로스톡스50', '유로스톡스50(유럽 대표 50개 기업)'], ['eem', 'EEM(신흥국)', 'EEM(신흥국 주식 ETF)'], ['hyg', 'HYG(하이일드)', 'HYG(미국 하이일드 채권 ETF)']
  ];
  function pagePredict() {
    var P = S.payload, now = D.nowMs();
    if (!P) {
      setBar('코스피 마감 예상', '', true);
      return { html: emptyState() };
    }
    var r = P.out.result, st = U.forecastStatus(r, P.out.previewReason, now);
    var baseWord = U.relDay(r.baseDate, st.today), dayWord = U.relDay(st.target, st.today);
    if (baseWord.length > 2) baseWord = U.fmtMD(r.baseDate);
    var baseLabel = baseWord + ' 종가';
    setBar(U.fmtTitleDate(st.target) + ' 코스피 마감 예상', chip(st.status, st.label), true);

    var R = r.ranges, dPct = U.pctOf(r.center, r.baseClose), out = [], mounts = [];
    // 1) 핵심 숫자 (맨 위 한 줄 요약 + 숫자 3개)
    var lean = r.pUp >= 0.6 ? '오름 쪽으로 기울었어요' : r.pUp <= 0.4 ? '내림 쪽으로 기울었어요' : '오를지 내릴지 반반에 가까워요';
    var r80 = R['0.8'];
    out.push(card('<p class="ptake"><b>' + esc(dayWord) + ' 코스피는 ' + U.fmt10(r.center) + ' 근처</b>(' + esc(baseLabel) + ' 대비 ' + U.signPct(dPct) + ')로 봐요. ' + esc(lean) +
      ' 열에 여덟은 <span class="num nw">' + U.fmt10(r80[0]) + '~' + U.fmt10(r80[1]) + '</span> 사이에서 끝났어요.</p>' +
      '<div class="kpis">' +
      '<div class="kpi"><div class="v num">' + U.fmt10(r.center) + '</div><div class="l">중심값</div>' +
      '<div class="d"><span class="nw ' + (dPct >= 0 ? 'up-t' : 'down-t') + '">' + (dPct >= 0 ? '▲ ' : '▼ ') + U.signPct(dPct) + '</span> <span class="nw" style="color:var(--muted);font-weight:400">' + esc(baseLabel) + ' 대비</span></div></div>' +
      '<div class="kpi"><div class="v">' + Math.round(r.pUp * 100) + '<span class="pc">%</span></div><div class="l">오를 확률</div></div>' +
      '<div class="kpi wide"><div class="v mid num">' + U.fmt10(R['0.95'][0]) + '<span class="sep">~</span>' + U.fmt10(R['0.95'][1]) + '</div><div class="l">95% 범위 · 20번 중 19번은 이 안에서 끝났어요</div></div>' +
      '</div>', 'kpicard'));
    // 2) 팬 차트
    var sub = st.status === 'preview' ? (P.out.previewReason ? '미국 시세를 다 받지 못해 미리 보기로 계산했어요' : '미국 장이 끝나기 전 계산이라 범위가 넓어요')
      : st.status === 'past' ? (lagDate() ? '새 종가가 아직 들어오지 않아 지난 예측을 보여 드려요' : '이미 지난 날의 예측이에요. 새로고침하면 다시 계산해요') : '간밤 미국 장 결과까지 반영했어요';
    out.push(card(head('최근 30거래일과 예측 범위', sub) + chartBox('c-fan') +
      legend([['ln', '', '실제 종가'], ['sw', '--band-1', '50%'], ['sw', '--band-2', '80%'], ['sw', '--band-4', '95% 범위'], ['ln', 'dash', '중심 예상']])));
    var hist = (r.kospiSeries || []).slice(-30);
    mounts.push(function () { Ch.fan($('c-fan'), { hist: hist, base: r.baseClose, center: r.center, ranges: R, target: st.target }); });
    // 3~5) 확률 그래프 3개는 접어 둔다
    var detailAt = out.length;
    // 3) 분포 곡선
    var dens = Cp.densityFromQuantiles(Cp.quantileKnots(r));
    out.push(card(head(dayWord + ' 종가의 확률 분포', null) +
      '<div class="probrow"><span><i class="sw" style="background:var(--down)"></i>내릴 확률 ' + Math.round((1 - r.pUp) * 100) + '%</span>' +
      '<span>오를 확률 ' + Math.round(r.pUp * 100) + '%<i class="sw" style="background:var(--up)"></i></span></div>' + chartBox('c-dens') +
      '<p class="note">점선은 ' + esc(baseLabel) + ', 실선은 중심값이에요</p>'));
    mounts.push(function () { Ch.density($('c-dens'), { dens: dens, base: r.baseClose, center: r.center, baseWord: baseLabel }); });
    // 4) 오를 확률 막대
    out.push(card(head('오를 확률', null, '<span class="val">' + U.pct(r.pUp) + '</span>') + chartBox('c-gauge') +
      '<p class="note">40~60%는 방향 판단이 어려운 구간이에요</p>'));
    mounts.push(function () { Ch.gauge($('c-gauge'), { pUp: r.pUp }); });
    // 5) 범위 사다리
    out.push(card(head('확률 범위', '확률이 높을수록 범위가 넓어져요') + chartBox('c-ladder') +
      legend([['dot', '--ink', '중심값'], ['ln', 'dash', baseLabel]])));
    mounts.push(function () { Ch.ladder($('c-ladder'), { ranges: R, base: r.baseClose, center: r.center, baseWord: baseLabel }); });
    var details = out.splice(detailAt, 3), detailMounts = mounts.splice(mounts.length - 3, 3);
    // 6) 시나리오 또는 간밤 변화
    if (r.mode === 'overnight' && r.overnight && r.overnight.movesPct) {
      var mv = r.overnight.movesPct;
      var items = MOVE_NAMES.map(function (m) { return { name: m[1], full: m[2], v: mv[m[0]] == null ? null : mv[m[0]] }; });
      var when = r.overnight.usDate ? '미국 ' + U.fmtDateLong(r.overnight.usDate) + ' 장' : '';
      var uc = r.overnight.usDate && window.Freshness ? window.Freshness.usCloseKst(r.overnight.usDate) : null;
      var closeTxt = uc ? ' (한국 시간 ' + U.relDay(uc.date, st.today).replace(/^(\d+월 )/, '') + ' ' + (uc.hour < 12 ? '새벽 ' + uc.hour : '오후 ' + (uc.hour - 12)) + '시 마감)' : '';
      out.push(card(head('간밤 해외 지표 변화', when ? when + closeTxt + '까지 반영 · ' + U.fmtMD(r.baseDate) + ' 코스피 마감 이후 변화' : '코스피 마감 이후 변화') + chartBox('c-moves') +
        (mv.tnx != null ? '<p class="note">미국 10년물 국채 금리 <b class="num" style="color:var(--ink)">' + (mv.tnx > 0 ? '+' : mv.tnx < 0 ? '−' : '') + Math.abs(mv.tnx).toFixed(2) + '%p</b></p>' : '')));
      mounts.push(function () { Ch.moves($('c-moves'), { items: items, when: when }); });
    } else if (r.scenarios && r.scenarios.length) {
      out.push(card(head('오늘 밤 SOX(미국 반도체 지수) 결과별', '미국 장 결과에 따라 범위가 이렇게 달라져요') + chartBox('c-scen') +
        legend([['sw', '--band-2', '80%'], ['sw', '--band-4', '95% 범위'], ['dot', '--ink', '중심'], ['ln', 'dash', baseLabel]])));
      mounts.push(function () { Ch.scenarios($('c-scen'), { scenarios: r.scenarios, base: r.baseClose }); });
    }
    out.push('<button type="button" class="card moreb" data-act="predMore" aria-expanded="' + S.predMore + '"><b>' + (S.predMore ? '확률 그래프 접기' : '확률 그래프 더 보기') + '</b><small>종가 확률 분포 · 오를 확률 막대 · 확률 범위 사다리</small></button>');
    if (S.predMore) { out = out.concat(details); mounts = mounts.concat(detailMounts); }
    out.push(freshRow(P, now));
    if (window.SemiHub) out.push(window.SemiHub.miniRow());
    out.push('<p class="foot">통계적 참고용 · 투자 권유 아님<br>데이터 Yahoo Finance · ' + esc(U.fmtWhen(P.computedAt, now)) + ' 계산</p>');
    return { html: out.join(''), mounts: mounts };
  }

  // ------------------------------------------------------------------ 자료 상태
  var FS_TXT = { fresh: '최신', lag1: '하루 늦음', late: '늦음', cached: '저장된 값' };
  function freshSummary(F) {
    if (!F) return { cls: 'unk', text: '자료 상태를 아직 확인하지 않았어요' };
    var n = F.items.length, bad = F.items.filter(function (x) { return x.status === 'late' || x.status === 'cached'; });
    var lag = F.items.filter(function (x) { return x.status === 'lag1'; });
    if (bad.length) return { cls: 'bad', text: bad.map(function (x) { return x.name; }).join(', ') + ' 자료가 ' + (bad.every(function (x) { return x.status === 'cached'; }) ? '이번에 받아지지 않았어요' : '늦어요') + ' · 10분 뒤 다시 받아요' };
    if (lag.length) return { cls: 'warn', text: (n - lag.length) + '개 최신 · ' + lag.map(function (x) { return x.name; }).join(', ') + ' 하루 늦음(Yahoo 지연)' };
    return { cls: 'ok', text: '지표 ' + n + '개 모두 최신' };
  }
  function lastByMarket(F) {
    var m = {}, nm = { krx: '한국', us: '미국', eu: '유럽', fx: '환율' };
    F.items.forEach(function (x) { if (x.last && (!m[x.market] || x.last < m[x.market])) m[x.market] = x.last; });
    return ['krx', 'us', 'eu', 'fx'].filter(function (k) { return m[k]; }).map(function (k) { return nm[k] + ' ' + U.fmtSlash(m[k]); }).join(' · ');
  }
  function freshRow(P, now) {
    var F = P.fresh, sm = freshSummary(F);
    return '<button type="button" class="card freshrow ' + sm.cls + '" data-act="tab" data-tab="info" data-to="fresh">' +
      '<span class="fdot"></span><span class="ft"><b>자료 상태</b> ' + esc(sm.text) +
      (F ? '<small>마지막 장 ' + esc(lastByMarket(F)) + ' · ' + esc(U.fmtWhen(F.at, now)) + ' 확인</small>' : '') + '</span>' + I.next + '</button>';
  }
  function freshCard(P, now) {
    var F = P && P.fresh;
    if (!F) return card(head('자료 상태', '새로 계산하면 지표 11개가 최신인지 확인해요'), '');
    var sm = freshSummary(F);
    return '<section class="card" id="fresh">' + head('자료 상태', U.fmtWhen(F.at, now) + ' 확인 · 각 시장의 마지막으로 끝난 장까지 들어왔는지 봐요') +
      '<p class="fsum ' + sm.cls + '"><span class="fdot"></span>' + esc(sm.text) + '</p>' +
      '<table class="ftab"><thead><tr><th>지표 · 마지막 장</th><th>값</th><th>상태</th></tr></thead><tbody>' +
      F.items.map(function (x) {
        var v = x.value == null ? '–' : (x.sym === '^TNX' ? x.value.toFixed(2) + '%' : x.value >= 1000 ? U.fmtInt(x.value) : x.value.toFixed(2));
        var note = x.patched.length ? '<small>빈칸 채움</small>' : x.status === 'late' ? '<small>' + U.fmtSlash(x.expected) + ' 없음</small>' : '';
        return '<tr><td>' + esc(x.name) + '<small class="num">' + (x.last ? U.fmtSlash(x.last) + '(' + U.DOW[U.dowOf(x.last)] + ')' : '–') + '</small></td><td class="num">' + v + '</td>' +
          '<td><span class="fs ' + x.status + '">' + FS_TXT[x.status] + '</span>' + note + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note">빈칸 채움: Yahoo가 끝난 장의 종가를 비워 둬서 같은 Yahoo의 공식 마감 값으로 채운 것이에요</p>' +
      '<button type="button" class="btn ghost wide" data-act="refresh">지금 다시 받기</button></section>';
  }

  function emptyState() {
    if (S.loading) {
      var L0 = S.loading, pct = L0.total ? Math.round(L0.done / L0.total * 100) : 0;
      return card('<div class="empty"><h2>시세를 받고 있어요</h2><p>처음 한 번은 10년치 자료를 받아서 1분쯤 걸려요</p>' +
        '<div class="progress" style="max-width:240px;margin:0 auto"><i style="width:' + pct + '%"></i></div></div>');
    }
    var e = S.error;
    return card('<div class="empty"><h2>예측을 계산하지 못했어요</h2><p>' + esc(errText(e)) + '</p><button type="button" class="btn" data-act="refresh">다시 시도</button></div>');
  }
  function errText(e) {
    if (!e) return '아직 계산한 결과가 없어요';
    return { OFFLINE: '인터넷에 연결되어 있지 않아요', TIMEOUT: '시세 서버 응답이 늦어요', BAD_DATA: '받은 시세가 이상해서 계산하지 않았어요', INSUFFICIENT_DATA: '계산에 필요한 자료가 부족해요' }[e.code] || '시세를 받지 못했어요';
  }

  // ------------------------------------------------------------------ 기록 탭
  // ------------------------------------------------------------------ 성적 탭 (달력 + 통계)
  function scoreNav() {
    return '<div class="seg sgnav" role="group" aria-label="성적 화면">' + [['cal', '달력'], ['stat', '통계']].map(function (x) {
      return '<button type="button" data-act="score" data-s="' + x[0] + '" aria-pressed="' + (S.score === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function pageScore() {
    var pg = S.score === 'stat' ? pageRecord() : pageCal();
    if (S.payload) pg.html = scoreNav() + pg.html;
    return pg;
  }
  function pageRecord() {
    var P = S.payload;
    setBar('예측 성적', P ? '<span class="chip time">' + esc(recordSpan(P.out.result)) + '</span>' : '', false);
    if (!P) return { html: emptyState() };
    var r = P.out.result, st = r.stats, sh = st.shown || st, out = [], mounts = [];
    out.push(card('<div class="kpis four">' + [
      [sh.cov95, '95% 범위 적중률'], [sh.cov80, '80% 범위 적중률'], [st.dirHit, '방향 적중률'], [st.confHit60, '확신한 날 방향 적중률', '확률 ≥60% 또는 ≤40%']
    ].map(function (k) {
      var v = (k[0] * 100).toFixed(1);
      return '<div class="kpi"><div class="v">' + v + '<span class="pc">%</span></div><div class="l">' + esc(k[1]) + '</div>' + (k[2] ? '<div class="l2">' + esc(k[2]) + '</div>' : '') + '</div>';
    }).join('') + '</div>', 'kpicard'));

    var all = r.history.filter(function (h) { return h.date >= (st.from || '2025-01-01'); });
    var n = { '1m': 21, '3m': 63, all: all.length }[S.period] || 63;
    var rows = all.slice(-n), miss = rows.filter(function (h) { return !h.in95; }).length;
    var seg = '<div class="seg" role="group" aria-label="기간">' + [['1m', '1개월'], ['3m', '3개월'], ['all', '전체']].map(function (p) {
      return '<button type="button" data-act="period" data-p="' + p[0] + '" aria-pressed="' + (S.period === p[0]) + '">' + p[1] + '</button>';
    }).join('') + '</div>';
    out.push(card(head('예측 범위와 실제 종가', null, seg) + '<p class="sub">' + rows.length + '거래일 중 ' + miss + '일 95% 범위 밖</p>' + chartBox('c-bands') +
      legend([['ln', '', '실제 종가'], ['sw', '--band-2', '80%'], ['sw', '--band-4', '95% 범위'], ['dot', '--up', '95% 밖']])));
    mounts.push(function () { Ch.bands($('c-bands'), { rows: rows }); });

    out.push(card(head('목표와 실제 비율', '범위가 말한 만큼 실제로 그 안에서 끝났는지') + chartBox('c-cal') +
      legend([['sw', '--target', '목표'], ['sw', '--band-1', '실제']])));
    mounts.push(function () { Ch.calibration($('c-cal'), { stats: st }); });

    if (st.dirTiers && st.dirTiers.length) {
      out.push(card(head('확신 정도별 방향 적중률', '오를 확률이 한쪽으로 기운 날만 모아 본 비율 (예: 60% 이상·40% 이하)') + chartBox('c-tiers')));
      mounts.push(function () { Ch.tiers($('c-tiers'), { stats: st }); });
    }

    var roll = Cp.rollingHit(all, 60, 'in95');
    if (roll.length > 5) {
      out.push(card(head('최근 60일 95% 적중률 추이', '60거래일씩 묶어 본 비율, 굵은 가로선이 목표 95%') + chartBox('c-roll')));
      mounts.push(function () { Ch.rolling($('c-roll'), { series: roll, win: 60 }); });
    }

    var last = all.slice(-20), inN = last.filter(function (h) { return h.in95; }).length;
    out.push(card(head('최근 20거래일', null, '<span class="val">' + last.length + '일 중 ' + inN + '일 범위 안</span>') + chartBox('c-dots') +
      legend([['dot', '--band-1', '95% 범위 안'], ['ring', '', '범위 밖']])));
    mounts.push(function () { Ch.dots($('c-dots'), { rows: last }); });

    out.push('<p class="foot">' + esc((st.from || '2025-01-01').slice(0, 4)) + '년 ' + (+(st.from || '2025-01-01').slice(5, 7)) + '월부터 매일 그 전 자료로만 계산한 예측을 실제와 비교했어요</p>');
    return { html: out.join(''), mounts: mounts };
  }
  function recordSpan(r) {
    var f = r.stats && r.stats.from || '2025-01-01';
    return f.slice(0, 4) + '년 ' + (+f.slice(5, 7)) + '월부터 ' + (r.stats ? r.stats.holdoutN : '') + '거래일 검증';
  }


  // ------------------------------------------------------------------ 달력 탭
  // 날마다 '그 전날까지 자료로 계산한 예측'(아침 확정 기준)과 실제 종가·장중 범위를 나란히 본다.
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymAdd(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + pad2(m + 1); }
  function ymLabel(ym) { return ym.slice(0, 4) + '년 ' + (+ym.slice(5, 7)) + '월'; }
  function ratio(a, b) { return b ? a + '/' + b : '–'; }
  function pctTxt(v) { return v == null ? '–' : (v * 100).toFixed(1); }
  function calCtx() {
    var P = S.payload, r = P.out.result, now = D.nowMs(), st = U.forecastStatus(r, P.out.previewReason, now);
    var from = (r.stats && r.stats.from) || '2025-01-01';
    var cd = Cp.calendarData(r.history, S.hl, from);
    var pend = cd.byDate[st.target] ? null : {
      date: st.target, center: r.center, r80: r.ranges['0.8'], r95: r.ranges['0.95'], pUp: r.pUp, prevClose: r.baseClose, label: st.label
    };
    var maxYM = (pend ? pend.date : cd.last || st.today).slice(0, 7), minYM = (cd.first || from).slice(0, 7);
    var sel = S.cal.sel && (cd.byDate[S.cal.sel] || (pend && pend.date === S.cal.sel)) ? S.cal.sel : (cd.last || (pend && pend.date));
    var month = S.cal.month || (sel ? sel.slice(0, 7) : maxYM);
    if (month > maxYM) month = maxYM; if (month < minYM) month = minYM;
    return { r: r, st: st, cd: cd, pend: pend, from: from, sel: sel, month: month, minYM: minYM, maxYM: maxYM };
  }
  function calCell(ds, c) {
    var dn = +ds.slice(8, 10), d = c.cd.byDate[ds], cls = 'cd', mk = '', lab;
    if (d) {
      cls += d.in80 ? ' h80' : d.in95 ? ' h95' : ' miss';
      mk = d.dir === true ? '<span class="mk">○</span>' : d.dir === false ? '<span class="mk x">×</span>' : '<span class="mk">·</span>';
      lab = U.fmtTitleDate(ds) + ', ' + (d.in80 ? '80% 범위 안' : d.in95 ? '95% 범위 안' : '95% 범위 밖') + (d.dir === true ? ', 방향 맞음' : d.dir === false ? ', 방향 틀림' : '');
    } else if (c.pend && ds === c.pend.date) {
      cls += ' pend'; mk = '<span class="mk">예측</span>'; lab = U.fmtTitleDate(ds) + ', 결과 기다리는 중';
    } else {
      var past = c.cd.last && ds < c.cd.last && ds >= c.from;
      return '<div class="cd off" aria-hidden="true"><span class="dn">' + dn + '</span>' + (past ? '<span class="mk">휴장</span>' : '') + '</div>';
    }
    if (ds === c.sel) cls += ' sel';
    return '<button type="button" class="' + cls + '" data-act="calday" data-d="' + ds + '" aria-pressed="' + (ds === c.sel) + '" aria-label="' + esc(lab) + '"><span class="dn">' + dn + '</span>' + mk + '</button>';
  }
  function calGrid(c) {
    var ym = c.month, last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(), cells = [], started = false;
    for (var day = 1; day <= last; day++) {
      var ds = ym + '-' + pad2(day), w = U.dowOf(ds);
      if (w === 0 || w === 6) continue;
      if (!started) { for (var k = 1; k < w; k++) cells.push('<div class="cd blank" aria-hidden="true"></div>'); started = true; }
      cells.push(calCell(ds, c));
    }
    return '<div class="calhead" aria-hidden="true">' + ['월', '화', '수', '목', '금'].map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="calgrid">' + cells.join('') + '</div>';
  }
  function miniStats(st) {
    return '<div class="mstats">' + [
      [ratio(st.in95, st.n), '95% 범위 적중'], [ratio(st.in80, st.n), '80% 범위 적중'], [ratio(st.dirHit, st.dirN), '방향 일치']
    ].map(function (k) { return '<div><b class="num">' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('') + '</div>';
  }
  function dayDetail(c, mounts) {
    var ds = c.sel; if (!ds) return '';
    var d = c.cd.byDate[ds], p = !d && c.pend && c.pend.date === ds ? c.pend : null;
    if (!d && !p) return '';
    var x = d || p, dPct = U.pctOf(x.center, x.prevClose);
    var rows = [
      ['예측 중심값', U.fmt10(x.center) + ' <small>(' + U.signPct(dPct) + ')</small>'],
      ['오를 확률', x.pUp == null ? '–' : Math.round(x.pUp * 100) + '% <small>' + (x.pUp > 0.5 ? '오름 쪽 예상' : x.pUp < 0.5 ? '내림 쪽 예상' : '반반') + '</small>'],
      ['80% 범위', U.fmt10(x.r80[0]) + ' ~ ' + U.fmt10(x.r80[1])],
      ['95% 범위', U.fmt10(x.r95[0]) + ' ~ ' + U.fmt10(x.r95[1])]
    ];
    var pills = '', html;
    if (d) {
      rows.push(['실제 종가', '<b>' + U.fmtInt(d.actual) + '</b> <small class="' + (d.chgPct >= 0 ? 'up-t' : 'down-t') + '">' + (d.chgPct >= 0 ? '▲ ' : '▼ ') + U.signPct(d.chgPct) + '</small>']);
      rows.push(['장중 저가~고가', d.high ? U.fmtInt(d.low) + ' ~ ' + U.fmtInt(d.high) : '<small>정보 없음</small>']);
      rows.push(['중심값과 차이', (d.err >= 0 ? '+' : '−') + U.fmtInt(Math.abs(d.err)) + ' <small>(' + U.signPct(d.errPct) + ')</small>']);
      pills = '<div class="pills">' +
        '<span class="pill ' + (d.in95 ? 'ok' : 'no') + '">95% 범위 ' + (d.in95 ? '안 ✓' : '밖') + '</span>' +
        '<span class="pill ' + (d.in80 ? 'ok' : 'no') + '">80% 범위 ' + (d.in80 ? '안 ✓' : '밖') + '</span>' +
        (d.dir === null ? '' : '<span class="pill ' + (d.dir ? 'ok' : 'no') + '">방향 ' + (d.dir ? '맞음 ○' : '틀림 ×') + '</span>') + '</div>';
    }
    html = card(head(U.fmtTitleDate(ds) + (p ? ' 예측' : ' 예측과 실제'), p ? '장이 끝나면(오후 3시 30분) 실제 종가와 비교해요' : '전날까지의 자료로만 계산한 예측(아침 확정 기준)이에요') +
      pills + chartBox('c-day') +
      '<dl class="kv">' + rows.map(function (r0) { return '<div><dt>' + r0[0] + '</dt><dd class="num">' + r0[1] + '</dd></div>'; }).join('') + '</dl>' +
      (d ? legend([['sw', '--band-2', '80%'], ['sw', '--band-4', '95% 범위'], ['dot', '--ink', '중심·종가'], ['ln', '', '장중 저가~고가'], ['ln', 'dash', '전날 종가']]) : ''));
    mounts.push(function () {
      Ch.dayBar($('c-day'), { r80: x.r80, r95: x.r95, center: x.center, prevClose: x.prevClose, actual: d ? d.actual : null, high: d ? d.high : null, low: d ? d.low : null, in95: d ? d.in95 : true });
    });
    return html;
  }
  function pageCal() {
    var P = S.payload;
    setBar('예측 성적', P ? '<span class="chip time">' + esc(recordSpan(P.out.result)) + '</span>' : '', false);
    if (!P) return { html: emptyState() };
    var c = calCtx(), out = [], mounts = [];
    var mm = c.cd.months.filter(function (m) { return m.ym === c.month; })[0];
    var nav = '<div class="calnav"><button type="button" class="iconbtn sm" data-act="calm" data-n="-1" aria-label="이전 달"' + (c.month <= c.minYM ? ' disabled' : '') + '>' + I.prev + '</button>' +
      '<h2>' + ymLabel(c.month) + '</h2>' +
      '<button type="button" class="iconbtn sm" data-act="calm" data-n="1" aria-label="다음 달"' + (c.month >= c.maxYM ? ' disabled' : '') + '>' + I.next + '</button></div>';
    out.push(card(nav + calGrid(c) +
      '<div class="callegend"><span><i class="cdk h80"></i>80% 범위 안</span><span><i class="cdk h95"></i>95% 범위 안</span><span><i class="cdk miss"></i>95% 범위 밖</span><span><b>○</b> 방향 맞음 <b>×</b> 틀림</span></div>' +
      (mm ? '<p class="sub" style="margin-top:12px">이 달 ' + mm.stats.n + '거래일</p>' + miniStats(mm.stats) : '<p class="note">이 달은 아직 결과가 없어요</p>')));
    out.push(dayDetail(c, mounts));

    var A = c.cd.all;
    out.push(card(head('전체 성적', ymLabel(c.from.slice(0, 7)) + '부터 ' + A.n + '거래일') + '<div class="kpis four flat">' + [
      [A.hit95, '95% 범위 적중률', ratio(A.in95, A.n) + '일'], [A.hit80, '80% 범위 적중률', ratio(A.in80, A.n) + '일'],
      [A.dirRate, '방향 일치율', ratio(A.dirHit, A.dirN) + '일'], [A.nearRate, '중심값 ±1% 이내', ratio(A.near1, A.n) + '일']
    ].map(function (k) {
      return '<div class="kpi"><div class="v">' + pctTxt(k[0]) + '<span class="pc">%</span></div><div class="l">' + esc(k[1]) + '</div><div class="l2 num">' + esc(k[2]) + '</div></div>';
    }).join('') + '</div>', ''));

    var ms = S.cal.allMonths ? c.cd.months : c.cd.months.slice(0, 6);
    out.push(card(head('달별 성적', '줄을 누르면 그 달로 가요') +
      '<table class="mtab"><thead><tr><th>달</th><th>거래일</th><th>95%</th><th>80%</th><th>방향</th></tr></thead><tbody>' +
      ms.map(function (m) {
        var s0 = m.stats;
        return '<tr data-act="calgo" data-ym="' + m.ym + '"' + (m.ym === c.month ? ' class="on"' : '') + '><td>' + ymLabel(m.ym).slice(2) + '</td><td class="num">' + s0.n + '</td>' +
          '<td class="num">' + Math.round(s0.hit95 * 100) + '%</td><td class="num">' + Math.round(s0.hit80 * 100) + '%</td><td class="num">' + (s0.dirRate == null ? '–' : Math.round(s0.dirRate * 100) + '%') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (c.cd.months.length > 6 ? '<button type="button" class="btn ghost wide" data-act="calall">' + (S.cal.allMonths ? '접기' : '전체 ' + c.cd.months.length + '개월 보기') + '</button>' : '')));
    out.push('<p class="foot">적중률: 실제 종가가 예측 범위 안에서 끝난 비율<br>방향 일치율: 오를 확률 50%를 기준으로 예상한 방향이 실제와 같았던 비율</p>');
    return { html: out.join(''), mounts: mounts };
  }

  // ------------------------------------------------------------------ 정보 탭
  var VARS = ['나스닥', 'SOX(미국 반도체)', 'VIX(미국 변동성)', 'EWY(미국 상장 한국 ETF)', '코스피 전날 등락', '원/달러 환율', 'HYG(미국 하이일드 채권)',
    'EEM(신흥국 주식)', '유로스톡스50', '마이크론', '미국 10년물 금리'];
  function pageInfo() {
    setBar('정보', '', false);
    var P = S.payload, st = P && P.out.result.stats, nOut = st ? st.holdoutN : 431, miss = st ? st.miss95 : 22, out = [];
    out.push(card(head('이 모델은', null) + '<div class="read" style="margin-top:8px">' +
      '<p>코스피가 다음 거래일에 어디쯤에서 끝날지 범위와 오를 확률로 계산해요. 아래 11개 지표의 변화로 중심을 잡고, 최근 출렁임과 지난 오차로 범위의 폭을 정해요. ' +
      '매일 그날 이전 자료로만 다시 학습하고, ' + (st ? (+st.from.slice(0, 4)) + '년 ' + (+st.from.slice(5, 7)) + '월' : '2025년 1월') + '부터 ' + nOut + '거래일을 이 방식으로 검증했어요.</p></div>' +
      '<div class="tags">' + VARS.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') + '</div>'));
    out.push(freshCard(P, D.nowMs()));
    out.push(card(head('안내', null) + '<ul class="list">' +
      '<li>통계적 참고용 계산이에요. 투자 권유가 아니에요.</li>' +
      '<li>시세는 Yahoo Finance에서 받아요. 늦거나 빠질 수 있어요.</li>' +
      '<li>예측은 틀릴 수 있어요. 지난 ' + nOut + '일 중 ' + miss + '일은 95% 범위 밖에서 끝났어요.</li></ul>'));
    var n = S.settings.notif;
    var times = ['07:30', '08:00', '08:20', '08:40', '09:00'];
    if (times.indexOf(n.time) < 0) times.push(n.time);
    out.push(card(head('설정', null) +
      '<div class="row"><div class="rl">평일 아침 알림<small>"오늘 코스피 예측이 준비됐어요"</small></div>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + !!n.on + '" aria-label="평일 아침 알림" data-act="notif"></button></div>' +
      '<div class="row"><div class="rl">알림 시간</div><select id="notifTime" aria-label="알림 시간"' + (n.on ? '' : ' disabled') + '>' +
      times.map(function (t) { return '<option value="' + t + '"' + (t === n.time ? ' selected' : '') + '>' + U.fmtHM(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="row stack"><div class="rl">글씨 크기</div><div class="seg" role="group" aria-label="글씨 크기">' + TEXT_SIZES.map(function (o) {
        return '<button type="button" data-act="scale" data-v="' + o[0] + '" aria-pressed="' + (textSize() === o[0]) + '">' + o[1] + '</button>';
      }).join('') + '</div></div>'));
    var u = S.update, upd;
    if (!u) upd = '<button type="button" class="btn ghost" data-act="update">새 버전 확인</button>';
    else if (u.checking) upd = '<span class="rv">확인하는 중…</span>';
    else if (u.demo) upd = '<span class="rv">데모에서는 확인하지 않아요</span>';
    else if (!u.ok) upd = '<button type="button" class="btn ghost" data-act="update">다시 확인</button>';
    else if (u.newer) upd = '<button type="button" class="btn" data-act="download">내려받기</button>';
    else upd = '<span class="rv">최신 버전이에요</span>';
    out.push(card(head('앱', null) +
      '<div class="row"><div class="rl">새 버전' + (u && u.newer ? '<small>' + esc(u.tag) + '</small>' : u && u.ok === false && !u.demo ? '<small>확인하지 못했어요</small>' : '') + '</div>' + upd + '</div>' +
      '<div class="row"><div class="rl">앱 버전</div><span class="rv num">' + esc(APP_VERSION + (S.build && S.build.build ? ' (빌드 ' + S.build.build + ')' : '')) + '</span></div>' +
      '<div class="row"><div class="rl">데이터 출처<small>반도체: 한국은행 ECOS · 통계청 KOSIS</small></div><span class="rv">Yahoo Finance</span></div>'));
    return { html: out.join('') };
  }

  // ------------------------------------------------------------------ 그리기
  // 성상현 페이지(js/sung.js)에 넘기는 도구
  var H = {
    card: card, head: head, chartBox: chartBox, $: $, Ch: Ch, setBar: setBar,
    render: function () { render(); }, keep: function () { keepScroll(); }, openUrl: function (u) { N.openUrl(u); },
    get payload() { return S.payload; }, now: function () { return D.nowMs(); }
  };
  function pageSung() { return window.SungPage ? window.SungPage.page(H) : { html: '' }; }
  function pageJw() { return window.JwPage ? window.JwPage.page(H) : { html: '' }; }
  var PAGES = { predict: pagePredict, record: pageScore, semi: pageJw, sung: pageSung, info: pageInfo };
  var TAB_ALIAS = { cal: ['record', 'cal'], jw: ['semi'] };   // 예전 탭 이름(데모 주소·알림)
  function render() {
    Ch.reset();
    var pg = PAGES[S.tab]();
    $('view').innerHTML = pg.html;
    renderStrip();
    document.querySelectorAll('.tabs button').forEach(function (b) {
      if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    (pg.mounts || []).forEach(function (f) { try { f(); } catch (e) { if (window.console) console.warn('chart', e); } });
  }
  function renderStrip() {
    var el = $('strip');
    if (!S.payload || S.tab === 'info') { el.innerHTML = ''; return; }
    if (S.loading) {
      var L0 = S.loading, calc = L0.total && L0.done >= L0.total, pct = L0.total ? Math.round(L0.done / L0.total * 90) : 0;
      el.innerHTML = '<div class="strip"><div class="grow">' + (calc ? '새로 계산하는 중' : '시세 받는 중 ' + L0.done + '/' + L0.total) +
        '<div class="progress"><i style="width:' + (calc ? 95 : pct) + '%"></i></div></div></div>';
      var b = document.querySelector('.iconbtn'); if (b) b.classList.add('spin');
      return;
    }
    var b2 = document.querySelector('.iconbtn'); if (b2) b2.classList.remove('spin');
    if (S.error) {
      el.innerHTML = '<div class="strip"><div class="grow">' + esc(errText(S.error)) + '. 저장된 예측을 보여 드려요</div><button type="button" data-act="refresh">다시 시도</button></div>';
      return;
    }
    var lag = lagDate();
    if (lag) {
      el.innerHTML = '<div class="strip"><div class="grow">' + esc(U.fmtTitleDate(lag)) + ' 코스피 종가가 아직 시세 서버에 없어요. 10분마다 다시 받아 볼게요</div><button type="button" data-act="refresh">다시 시도</button></div>';
      return;
    }
    el.innerHTML = '';
  }
  function goTab(t) {
    S.scroll[S.tab] = window.scrollY;
    S.tab = t; render();
    window.scrollTo(0, S.scroll[t] || 0);
  }

  // ------------------------------------------------------------------ 갱신
  var retryTimer = null, previewRetry = null, lagRetry = null;
  // 지금쯤이면 있어야 할 코스피 종가가 결과에 없으면 그 날짜 (시세 서버가 늦거나 비워 둔 경우)
  function lagDate() {
    var P = S.payload; if (!P || D.demo) return null;
    var exp = U.expectedLastClose(Date.now());
    return P.out.result.baseDate < exp ? exp : null;
  }
  // 코스피 종가가 늦었거나, 해외 지표가 늦거나 저장된 값으로 채워졌으면 다시 받는다
  function needsRetry() {
    var P = S.payload; if (!P || D.demo) return false;
    return !!lagDate() || !!(P.fresh && !P.fresh.ok);
  }
  function refresh(manual) {
    if (S.loading) return;
    if (D.demo) { if (manual) toast('데모 화면은 저장된 결과를 보여 줘요'); return; }
    S.loading = { done: 0, total: 11 }; S.error = null;
    if (!S.payload) render(); else renderStrip();
    D.refresh(function (done, total) { if (!S.loading) return; S.loading.done = done; S.loading.total = total; if (S.payload) renderStrip(); else render(); })
      .then(function (p) {
        S.payload = p; S.loading = null;
        // B2: 미국 자료가 덜 들어와 미리 보기로 계산했으면 10분 뒤 한 번 더 받아 본다
        if (p.out && p.out.previewReason && !previewRetry) previewRetry = setTimeout(function () { previewRetry = null; refresh(false); }, 10 * 60e3);
        if (needsRetry() && !lagRetry) lagRetry = setTimeout(function () { lagRetry = null; if (needsRetry()) refresh(false); }, 10 * 60e3);
        return D.loadHL().then(function (hl) { S.hl = hl || {}; }).then(render, render);
      }, function (e) {
        S.loading = null; S.error = { code: e.code || 'ERROR', message: String(e.message || e) };
        render();
        if (e.code !== 'OFFLINE' && !retryTimer) retryTimer = setTimeout(function () { retryTimer = null; if (S.error) refresh(false); }, 5 * 60e3);
      });
  }
  function stale() {
    if (!S.payload) return true;
    var age = Date.now() - S.payload.computedAt;
    return age > 10 * 60e3 || (needsRetry() && age > 2 * 60e3);
  }

  // ------------------------------------------------------------------ 알림
  function applyNotif() { if (!N.isNative) return Promise.resolve(); return N.Noti.apply(S.settings.notif); }

  // ------------------------------------------------------------------ 첫 실행 안내 (한 화면)
  function showNotice() {
    var el = $('notice');
    var st = S.payload && S.payload.out.result.stats, nOut = st ? st.holdoutN : 431, miss = st ? st.miss95 : 22;
    el.innerHTML = '<div class="notice" role="dialog" aria-modal="true" aria-labelledby="ntitle"><h1 id="ntitle">시작하기 전에</h1><ul>' +
      '<li><b>통계적 참고용이에요</b><span>지난 시세로 계산한 범위와 확률이에요</span></li>' +
      '<li><b>투자 권유가 아니에요</b><span>사고팔 때의 판단은 직접 해 주세요</span></li>' +
      '<li><b>데이터는 Yahoo Finance</b><span>늦거나 빠질 수 있어요</span></li>' +
      '<li><b>틀릴 수 있어요</b><span>지난 ' + nOut + '거래일 중 ' + miss + '일은 95% 범위 밖에서 끝났어요</span></li>' +
      '</ul><button type="button" class="btn" data-act="noticeOk">확인</button></div>';
    el.hidden = false;
  }
  function closeNotice() {
    LS.set('notice2', { accepted: true, version: NOTICE_VERSION, at: new Date().toISOString() });
    $('notice').hidden = true; $('notice').innerHTML = '';
    if (N.isNative && S.settings.notif.on) N.Noti.request().then(function () { return applyNotif(); });
  }

  function keepScroll() { var y = window.scrollY; render(); window.scrollTo(0, y); }

  // ------------------------------------------------------------------ 누름
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    var d = el.dataset;
    if (/^sg/.test(d.act) && window.SungPage && window.SungPage.onAct(d.act, d, H)) return;
    if (/^jw/.test(d.act) && window.JwPage && window.JwPage.onAct(d.act, d, H)) return;
    if (/^sm/.test(d.act) && window.SemiPage && window.SemiPage.onAct(d.act, d, H)) return;
    switch (d.act) {
      case 'tab': goTab(d.tab); if (d.to && $(d.to)) $(d.to).scrollIntoView({ block: 'start' }); break;
      case 'refresh': refresh(true); break;
      case 'period': S.period = d.p; var y = window.scrollY; render(); window.scrollTo(0, y); break;
      case 'notif':
        S.settings.notif.on = !S.settings.notif.on; saveSettings();
        if (S.settings.notif.on && N.isNative) N.Noti.request().then(applyNotif); else applyNotif();
        render(); break;
      case 'scale': S.settings.text = +d.v; S.demoText = null; saveSettings(); applyScale(); var y2 = window.scrollY; render(); window.scrollTo(0, y2); break;
      case 'update':
        if (D.demo) { S.update = { demo: true }; render(); break; }
        S.update = { checking: true }; render();
        D.checkUpdate().then(function (u) { S.update = u; if (S.tab === 'info') render(); });
        break;
      case 'download': if (S.update && S.update.url) N.openUrl(S.update.url); break;
      case 'noticeOk': closeNotice(); break;
      case 'calday': S.cal.sel = d.d; S.cal.month = d.d.slice(0, 7); keepScroll(); break;
      case 'calm': if (S.payload) { var cc = calCtx(); S.cal.month = ymAdd(cc.month, +d.n); } keepScroll(); break;
      case 'calgo': S.cal.month = d.ym; S.cal.sel = null; render(); window.scrollTo(0, 0); break;
      case 'calall': S.cal.allMonths = !S.cal.allMonths; keepScroll(); break;
      case 'score': S.score = d.s === 'stat' ? 'stat' : 'cal'; render(); window.scrollTo(0, 0); break;
      case 'predMore': S.predMore = !S.predMore; keepScroll(); break;
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target && /^sg/.test(e.target.id || '') && e.target.type === 'search' && window.SungPage) window.SungPage.onInput(e, H);
  });
  document.addEventListener('change', function (e) {
    if (e.target && /^sg/.test(e.target.id || '') && e.target.type !== 'search' && window.SungPage && window.SungPage.onInput(e, H)) return;
    if (e.target.id === 'notifTime') { S.settings.notif.time = e.target.value; saveSettings(); applyNotif(); toast(U.fmtHM(e.target.value) + '에 알려 드릴게요'); }
  });
  N.onBack(function () {
    if (!$('notice').hidden) return;
    if (S.tab !== 'predict') { goTab('predict'); return; }
    var now = Date.now();
    if (now - S.lastBack < 2000) N.exitApp(); else { S.lastBack = now; toast('한 번 더 누르면 앱이 닫혀요'); }
  });
  N.onResume(function () {
    N.textZoom().then(function (z) { if (z && z !== S.sysScale) { S.sysScale = z; applyScale(); render(); } });
    if (!D.demo && stale()) refresh(false);
  });
  N.Noti.onTap(function () { goTab('predict'); if (stale()) refresh(false); });

  // ------------------------------------------------------------------ 시작
  function init() {
    var qs = D.params;
    if (qs.get('scale')) { S.sysScale = +qs.get('scale'); S.demoText = 1; }   // 데모 주소의 scale은 최종 배율 그대로
    applyScale();
    $('tabs').innerHTML = [['predict', '예측'], ['record', '성적'], ['semi', '반도체'], ['sung', '성상현'], ['info', '정보']].map(function (t) {
      return '<button type="button" data-act="tab" data-tab="' + t[0] + '">' + I[t[0]] + t[1] + '</button>';
    }).join('');
    Promise.all([N.textZoom(), D.getBuild(), D.loadLast(), D.loadHL()]).then(function (a) {
      if (a[0] && !qs.get('scale')) { S.sysScale = a[0]; applyScale(); }
      S.build = a[1]; S.payload = a[2] || null; S.hl = a[3] || {};
      if (qs.get('sg') && window.SungPage) window.SungPage.setState({ sub: qs.get('sg'), theme: +(qs.get('sgt') || 5), open: qs.get('sgopen') ? (function (o) { o[qs.get('sgopen')] = true; return o; })({}) : {} });
      if (qs.get('sgmore') && window.SungPage) window.SungPage.setState({ more: qs.get('sgmore').split(',').reduce(function (o, k) { o[k] = true; return o; }, {}) });
      if (qs.get('cyc') && window.MemoryPage) window.MemoryPage.setState({ item: qs.get('cyc') });
      if (qs.get('jw') && window.JwPage) window.JwPage.setState({ sub: qs.get('jw'), open: qs.get('jwopen') ? (function (o) { o[qs.get('jwopen')] = true; return o; })({}) : {} });
      if (/^\d{4}-\d{2}-\d{2}$/.test(qs.get('day') || '')) { S.cal.sel = qs.get('day'); S.cal.month = qs.get('day').slice(0, 7); }
      if (qs.get('predmore') === '1') S.predMore = true;
      var tab = qs.get('tab');
      if (tab === 'record') S.score = 'stat';
      if (TAB_ALIAS[tab]) { if (TAB_ALIAS[tab][1]) S.score = TAB_ALIAS[tab][1]; tab = TAB_ALIAS[tab][0]; }
      if (qs.get('score')) S.score = qs.get('score') === 'stat' ? 'stat' : 'cal';
      if (tab && PAGES[tab]) S.tab = tab;
      if (/^(1m|3m|all)$/.test(qs.get('period') || '')) S.period = qs.get('period');
      render();
      if (window.JwPage) window.JwPage.preload(H);   // 반도체 자료(예측 탭 한 줄에도 씀)
      var nt = LS.get('notice2', null);
      if (D.demo ? qs.get('notice') === '1' : !(nt && nt.accepted && nt.version === NOTICE_VERSION)) showNotice();
      if (!D.demo) {
        applyNotif();
        if (stale()) refresh(false);
      }
    });
  }
  init();
})();
