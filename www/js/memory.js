/* 반도체 탭의 하위 화면 '사이클 모델' — 메모리(D램·낸드) 가격이 지금 사이클의 어디쯤인지.
 * 더한 것(2.7.0): '6개월 뒤 가격이 지금보다 낮을 확률'(prob, tools/memory/cycle_extra.py)과 통계청 재고/출하 점검(kosis).
 * 자료: 한국은행 ECOS 수출물가지수(품목별) D램·플래시메모리, 계약통화 기준(2020=100), 월별.
 * semi-data 작업(.github/workflows/semi-data.yml)이 매일 ECOS에서 받은 표로 tools/memory/build-memory.js를 돌려
 * memory.json을 semi-data 가지에 함께 올린다(확률·재고는 cycle_extra.py가 더함). 앱은 그것을 6시간에 한 번까지 받아 보고,
 * 못 받으면 저장해 둔 것 → APK에 묶인 data/memory.json 순서로 쓴다. 화면은 js/jw.js가 이 모듈의 view()로 그린다. '한눈에'(js/semihub.js)도 data()로 같은 자료를 쓴다. */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc;
  var REMOTE = 'https://raw.githubusercontent.com/hj5952009/mom-market-app/semi-data/memory.json';
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
    if (due && D.Native && D.Native.httpGet) {
      p = p.then(function () {
        return D.Native.httpGet(REMOTE + '?t=' + Math.floor(Date.now() / 600e3), 15000).then(function (d) {
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

  // 이주완 탭(js/jw.js)이 하위 화면으로 부른다: html을 돌려주고, 차트 그리기는 mounts에 넣는다
  function view(H, mounts) {
    if (!DATA) {
      load(H);
      return H.card('<div class="empty"><h2>' + (failed ? '자료를 열지 못했어요' : '자료를 여는 중이에요') + '</h2>' +
        (failed ? '<p>잠시 뒤 다시 열어 주세요</p>' : '') + '</div>');
    }
    if (!loading && !remoteTried) load(H);
    var Dd = DATA, it = Dd.items[ST.item], dr = Dd.items.dram, nd = Dd.items.nand, cur = it.current, out = [];
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

    // 1-1) 6개월 뒤 하락 확률 (사이클 모델 확률, 매달 그 전 자료로만 다시 학습)
    var PB = Dd.prob;
    if (PB && PB.items && PB.items.dram) {
      var pd = PB.items.dram, pn = PB.items.nand || {}, mt = PB.metrics;
      var hist = PB.hist.filter(function (h) { return h[0] >= '2016-01'; });
      var drv = pd.drivers.filter(function (x) { return x.size >= 0.15; });
      var dn = drv.filter(function (x) { return x.dir === 'down'; }).map(function (x) { return x.name; }), upd = drv.filter(function (x) { return x.dir === 'up'; }).map(function (x) { return x.name; });
      out.push(H.card(H.head('6개월 뒤 가격이 지금보다 낮을 확률', ymLabel(PB.month) + ' 기준 · 과거 가격 흐름으로 계산') +
        '<div class="mprob"><div><b class="num">' + Math.round(pd.p * 100) + '<span class="pc">%</span></b><small>D램' + (pd.p3ago != null ? ' · 3개월 전 ' + Math.round(pd.p3ago * 100) + '%' : '') + '</small></div>' +
        (pn.p != null ? '<div><b class="num">' + Math.round(pn.p * 100) + '<span class="pc">%</span></b><small>낸드' + (pn.p3ago != null ? ' · 3개월 전 ' + Math.round(pn.p3ago * 100) + '%' : '') + '</small></div>' : '') + '</div>' +
        H.chartBox('c-mmprob') +
        '<div class="legend"><span><i class="ln" style="background:var(--band-1)"></i>D램</span><span><i class="ln" style="background:var(--ink)"></i>낸드</span><span><i class="ln dash"></i>50%</span></div>' +
        (dn.length || upd.length ? '<p class="read" style="margin-top:10px">' + (dn.length ? '확률을 올린 것: <b>' + esc(dn.join(', ')) + '</b>' : '') + (dn.length && upd.length ? '<br>' : '') + (upd.length ? '확률을 내린 것: <b>' + esc(upd.join(', ')) + '</b>' : '') + '</p>' : '') +
        '<p class="note">' + mt.from.slice(0, 4) + '~' + mt.to.slice(0, 4) + '년 ' + mt.n + '번을 매달 그 전 자료로만 맞혀 봤어요. 6개월 뒤 더 낮았던 때가 원래 ' + Math.round(mt.baseRate) + '%라서, 이 확률은 평균만 말할 때보다 ' +
        (mt.gainPct > 0 ? '조금(' + mt.gainPct.toFixed(1) + '%) 나은' : '나아지지 않은') + ' 정도예요. 숫자 하나보다 방향이 바뀌는지를 보세요.</p>'));
      mounts.push(function () {
        H.Ch.semiLines(H.$('c-mmprob'), { months: hist.map(function (h) { return h[0]; }), label: '6개월 뒤 하락 확률', fmt: function (v) { return Math.round(v) + '%'; },
          series: [{ name: 'D램', values: hist.map(function (h) { return h[1] == null ? null : h[1] * 100; }), cls: 's-b1', key: '--band-1' },
            { name: '낸드', values: hist.map(function (h) { return h[2] == null ? null : h[2] * 100; }), cls: 'c-line thin', key: '--ink' },
            { name: '50%', values: hist.map(function () { return 50; }), cls: 'c-proj', key: '--ink-2', dash: true }] });
      });
    }

    // 품목 고르기
    var seg = '<div class="seg sgnav" role="group" aria-label="품목">' + [['dram', 'D램'], ['nand', '낸드(플래시)']].map(function (x) {
      return '<button type="button" data-act="jwCycItem" data-i="' + x[0] + '" aria-pressed="' + (ST.item === x[0]) + '">' + x[1] + '</button>';
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

    // 6) 공급으로 다시 보기 (통계청 재고/출하) — 이주완 모델의 '감산' 주장을 데이터로 보완
    var KO = Dd.kosis;
    if (KO && KO.series && KO.series.length > 24) {
      var ks = KO.series;
      out.push(H.card(H.head('공급으로 다시 보기', '통계청 반도체 재고 ÷ 출하(계절조정) · 낮을수록 물건이 모자라요') + H.chartBox('c-mmko') +
        '<div class="legend"><span><i class="ln"></i>재고 ÷ 출하</span><span><i class="ln dash"></i>2000년 이후 평균</span></div>' +
        '<p class="read" style="margin-top:10px">' + esc(ymLabel(KO.month)) + ' 재고는 출하의 <b>' + KO.ratio.toFixed(2) + '배</b>예요. 평균(' + KO.ratioAvg.toFixed(2) + '배)의 절반도 안 되고, 2000년 이후 지금보다 낮았던 달은 ' + Math.round(KO.lowerShare) + '%뿐이에요. ' +
        (KO.ratio > KO.ratio6ago + 0.05 ? '다만 6개월 전(' + KO.ratio6ago.toFixed(2) + '배)보다 올라 재고가 쌓이기 시작했어요.' : KO.ratio < KO.ratio6ago - 0.05 ? '6개월 전(' + KO.ratio6ago.toFixed(2) + '배)보다 더 빠듯해졌어요.' : '6개월 전(' + KO.ratio6ago.toFixed(2) + '배)과 비슷해요.') + '</p>' +
        '<p class="note">재고가 출하보다 빨리 늘면(선이 오르면) 과거엔 가격이 약해졌어요. 이 자료를 확률 계산에도 넣어 봤지만 발표 시점 그대로 맞혀 보면 나아지지 않아, 점검용으로만 보여 드려요.</p>'));
      mounts.push(function () {
        H.Ch.semiLines(H.$('c-mmko'), { months: ks.map(function (x) { return x[0]; }), label: '재고 ÷ 출하', fmt: function (v) { return v.toFixed(2); },
          series: [{ name: '재고÷출하', values: ks.map(function (x) { return x[1]; }), cls: 'c-line', key: '--ink' },
            { name: '평균', values: ks.map(function () { return KO.ratioAvg; }), cls: 'c-proj', key: '--ink-2', dash: true }] });
      });
    }

    // 7) 안내
    out.push(H.card(H.head('읽는 법', null) + '<ul class="list">' +
      '<li>메모리는 삼성전자·SK하이닉스의 주력 제품이라 코스피에 큰 영향을 줘요. 주가는 보통 가격보다 몇 달 먼저 움직여요.</li>' +
      '<li>이번 상승기는 과거보다 훨씬 길고 커서 과거 패턴과 다르게 흘러갈 수 있어요.</li></ul>'));
    var eTxt = Dd.ecos && Dd.ecos.status === 'error' ? ' · 최근 갱신 실패(저장된 값)' : '';
    out.push('<p class="foot">통계적 참고용 · 투자 권유 아님<br>자료 한국은행 ECOS 수출물가지수(품목별, 계약통화 기준) · ' + esc(latestTxt) + '까지' + eTxt +
      (KO ? '<br>통계청 광업제조업동향 반도체 생산·출하·재고지수 · ' + esc(ymLabel(KO.month)) + '까지' : '') + '</p>');
    return out.join('');
  }

  function onAct(act, d, H) {
    if (act === 'jwCycItem') { ST.item = d.i === 'nand' ? 'nand' : 'dram'; H.keep(); return true; }
    return false;
  }

  root.MemoryPage = { data: function () { return DATA; }, view: view, phaseChip: phaseChip, onAct: onAct, load: load, setState: function (o) { Object.assign(ST, o || {}); } };
})(window);
