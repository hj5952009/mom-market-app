/* 반도체 페이지 — 메모리(D램·낸드) 가격이 지금 사이클의 어디쯤인지.
 * 자료: 한국은행 ECOS 수출물가지수(품목별) D램·플래시메모리, 계약통화 기준(2020=100), 월별.
 * 계산은 GitHub Actions(tools/memory/build-memory.js)가 매일 해서 www/data/memory.json에 올리고,
 * 앱은 그 파일을 GitHub에서 받아 본다(6시간에 한 번까지). 못 받으면 저장해 둔 것 → APK에 묶인 것 순서로 쓴다. */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc;
  var REMOTE = 'https://raw.githubusercontent.com/hj5952009/mom-market-app/main/www/data/memory.json';
  var CACHE_KEY = 'memData', MAX_AGE = 6 * 3600e3;
  var DATA = null, loading = null, failed = false, remoteTried = false;
  var ST = { item: 'dram' };

  function valid(d) { return d && d.v === 1 && d.items && d.items.dram && d.items.dram.series && d.items.dram.series.length > 24 && d.latest && /^\d{4}-\d{2}$/.test(d.latest.month); }
  function newer(a, b) { return !b || a.latest.month > b.latest.month || (a.latest.month === b.latest.month && (a.builtAt || '') >= (b.builtAt || '')); }

  function load(H) {
    if (loading) return loading;
    var D = root.Data, LS = D.LS;
    var cached = LS.get(CACHE_KEY, null);
    var p = Promise.resolve(), before = DATA;
    if (!DATA) {
      p = (cached && valid(cached.data) ? Promise.resolve(cached.data) : fetch('data/memory.json').then(function (r) { return r.json(); }))
        .then(function (d) { if (valid(d)) DATA = d; else failed = true; })
        .catch(function () { failed = true; });
    }
    // 원격(GitHub) 확인: 데모가 아니고, 마지막 확인이 6시간 넘었으면
    var due = !D.demo && !remoteTried && (!cached || !cached.at || Date.now() - cached.at > MAX_AGE);
    remoteTried = true;   // 앱을 켤 때마다 한 번만 확인(다시 그리기 때문에 반복 확인하지 않게)
    if (due && D.httpGet) {
      p = p.then(function () {
        return D.httpGet(REMOTE + '?t=' + Math.floor(Date.now() / 600e3), 15000).then(function (d) {
          if (typeof d === 'string') d = JSON.parse(d);
          if (!valid(d)) return;
          var keep = DATA && !newer(d, DATA) ? DATA : d;
          DATA = keep; failed = false;
          LS.set(CACHE_KEY, { at: Date.now(), data: keep });
        }).catch(function () { /* 저장된 자료 그대로 */ });
      });
    }
    var hadData = !!DATA;
    loading = p.then(function () { loading = null; if (H && (!hadData || DATA !== before)) H.keep(); });
    return loading;
  }

  function ymLabel(ym) { return ym.slice(0, 4) + '년 ' + (+ym.slice(5, 7)) + '월'; }
  function phaseChip(ph) {
    var cls = { up: 'final', late: 'preview', turning: 'past', down: 'past', bottom: 'preview' }[ph.code] || 'past';
    return '<span class="chip ' + cls + '"><i></i>' + esc(ph.label) + '</span>';
  }

  function page(H) {
    H.setBar('메모리 반도체 가격', DATA ? phaseChip(DATA.items.dram.phase) : '', false);
    if (!DATA) {
      load(H);
      return { html: H.card('<div class="empty"><h2>' + (failed ? '자료를 열지 못했어요' : '자료를 여는 중이에요') + '</h2>' +
        (failed ? '<p>잠시 뒤 다시 열어 주세요</p>' : '') + '</div>') };
    }
    if (!loading && !remoteTried) load(H);
    var Dd = DATA, it = Dd.items[ST.item], dr = Dd.items.dram, nd = Dd.items.nand, cur = it.current, out = [], mounts = [];
    var latestTxt = ymLabel(Dd.latest.month) + (Dd.latest.prelim ? '(잠정)' : '');

    // 1) 핵심: 지금 국면 + 두 품목 3개월 변화
    function kpi(x, name) {
      var c = x.current;
      return '<div class="kpi"><div class="v num ' + (c.r3Pct >= 0 ? 'up-t' : 'down-t') + '">' + U.signPct(c.r3Pct, 1) + '</div>' +
        '<div class="l">' + esc(name) + ' 3개월 전보다</div>' +
        (c.peakR3Pct != null ? '<div class="l2">이번 상승기 최고 ' + U.signPct(c.peakR3Pct, 0) + ' (' + esc(ymLabel(c.peakR3Month)) + ')</div>' : '') + '</div>';
    }
    out.push(H.card('<div class="kpis">' + kpi(dr, 'D램') + kpi(nd, '낸드') +
      '<div class="kpi wide"><div class="v mid">' + esc(dr.phase.label) + '</div><div class="l">' + esc(dr.phase.text) + ' · D램, ' + esc(latestTxt) + ' 수출가격 기준</div></div>' +
      '</div>', 'kpicard mmk'));

    // 품목 고르기
    var seg = '<div class="seg sgnav" role="group" aria-label="품목">' + [['dram', 'D램'], ['nand', '낸드(플래시)']].map(function (x) {
      return '<button type="button" data-act="mmItem" data-i="' + x[0] + '" aria-pressed="' + (ST.item === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    out.push(seg);

    // 2) 오르는 속도
    var last36 = it.series.slice(-36).map(function (p) { return [p[0], p[2]]; });
    out.push(H.card(H.head('오르는 속도', '매달 3개월 전보다 얼마나 올랐는지 · 막대가 줄면 오르는 힘이 약해지는 거예요') + H.chartBox('c-mmbars')));
    mounts.push(function () { H.Ch.memBars(H.$('c-mmbars'), { pts: last36, peak: cur.peakR3Month ? { m: cur.peakR3Month } : null, label: it.name + ' 3개월 변화율' }); });

    // 3) 긴 흐름
    var shades = it.cycles.filter(function (c) { return c.phase === 'down'; }).map(function (c) { return [c.start, c.end]; });
    out.push(H.card(H.head(it.name + ' 가격 20년', '수출가격 지수(2020년=100) · 회색은 가격이 내린 시기') + H.chartBox('c-mmlines') +
      '<div class="legend"><span><i class="sw" style="background:var(--band-1)"></i>' + esc(it.name) + '</span><span><i class="sw" style="background:var(--track, var(--grid))"></i>하락기</span></div>'));
    mounts.push(function () {
      H.Ch.memLines(H.$('c-mmlines'), { label: it.name + ' 가격 지수', shades: shades,
        lines: [{ name: it.name, cls: 's-b1', dot: 'b1 ringed', key: '--band-1', pts: it.series.map(function (p) { return [p[0], p[1]]; }) }] });
    });

    // 4) 지난 상승기와 비교
    var ups = it.cycles.filter(function (c) { return c.phase === 'up'; }).slice(-7);
    out.push(H.card(H.head('지난 상승기와 비교', '바닥에서 꼭대기까지 오른 폭과 기간 · 맨 아래가 지금') + H.chartBox('c-mmcyc')));
    mounts.push(function () {
      H.Ch.cycleBars(H.$('c-mmcyc'), { rows: ups.map(function (c) {
        return { label: !c.done ? '지금' : c.start.slice(0, 4) === c.end.slice(0, 4) ? c.start.slice(0, 4) : c.start.slice(0, 4) + '~' + c.end.slice(2, 4), full: c.done ? ymLabel(c.start) + ' ~ ' + ymLabel(c.end) : ymLabel(c.start) + '부터 지금까지',
          pct: c.changePct, months: c.months, cur: !c.done };
      }) });
    });

    // 5) 과거에 비슷했을 때
    var ev = it.event, stt = it.stats;
    var eventLine = ev.onNow
      ? '지금 이 신호가 켜져 있어요(' + esc(ymLabel(ev.lastTrigger)) + '부터).'
      : '지금은 이 신호가 꺼져 있어요' + (ev.lastTrigger ? '(마지막: ' + esc(ymLabel(ev.lastTrigger)) + ')' : '') + '.';
    out.push(H.card(H.head('과거에 비슷했을 때', '가격은 오르는데 오르는 속도가 최고의 절반 아래로 줄었던 때') +
      '<p class="read" style="margin-top:8px">' + eventLine + ' 과거 ' + ev.n6 + '번 중 <b>' + ev.down6 + '번</b>은 6개월 뒤 가격이 더 낮았어요' +
      ' (중간값 ' + U.signPct(ev.median6Pct, 0) + ').</p>' + H.chartBox('c-mmev') +
      '<div class="legend"><span><i class="dot" style="background:var(--down)"></i>6개월 뒤 더 낮음</span><span><i class="dot" style="background:var(--up)"></i>더 높음</span><span><i class="ring" style="border-color:var(--muted)"></i>아직 모름</span></div>' +
      (cur.peakR3Month ? '<p class="note">오르는 속도가 꼭대기를 찍은 뒤 가격 꼭대기까지는 과거 중간값 ' + stt.lagMedian + '개월(' + stt.lagMin + '~' + stt.lagMax + '개월) 걸렸어요. 지금은 ' + cur.monthsSincePeakR3 + '개월째예요.</p>' : '')));
    mounts.push(function () { H.Ch.eventDots(H.$('c-mmev'), { eps: ev.episodes }); });

    // 6) 안내
    out.push(H.card(H.head('읽는 법', null) + '<ul class="list">' +
      '<li>메모리 반도체는 삼성전자와 SK하이닉스의 주력 제품이라 코스피에 큰 영향을 줘요.</li>' +
      '<li>주가는 보통 가격보다 몇 달 먼저 움직여요. 가격이 아직 올라도 오르는 속도가 줄면 주가가 먼저 흔들릴 수 있어요.</li>' +
      '<li>지난 패턴으로 본 통계 참고용이에요. 이번 상승기는 과거보다 훨씬 길고 커서 과거와 다르게 흘러갈 수 있어요.</li></ul>'));
    var eTxt = Dd.ecos && Dd.ecos.status === 'error' ? ' · 최근 갱신 실패(저장된 값)' : '';
    out.push('<p class="foot">통계적 참고용 · 투자 권유 아님<br>자료 한국은행 ECOS 수출물가지수(품목별, 계약통화 기준) · ' + esc(latestTxt) + '까지' + eTxt + '</p>');
    return { html: out.join(''), mounts: mounts };
  }

  function onAct(act, d, H) {
    if (act === 'mmItem') { ST.item = d.i === 'nand' ? 'nand' : 'dram'; H.keep(); return true; }
    return false;
  }

  root.MemoryPage = { page: page, onAct: onAct, load: load, setState: function (o) { Object.assign(ST, o || {}); } };
})(window);
