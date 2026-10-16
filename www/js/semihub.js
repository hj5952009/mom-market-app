/* 반도체 탭 '한눈에' — 두 모델을 한 화면에 나란히.
 *  - 메모리 가격 사이클 모델(js/memory.js, memory.json): 수출가격 흐름·지난 사이클·6개월 뒤 하락 확률·통계청 재고/출하
 *  - 이주완 반도체 가격 모델(js/semi.js, semi.json): 박사의 '공급(감산)이 가격을 정한다' 논리로 본 국면·하락 신호·시나리오
 * 여기서는 새 숫자를 만들지 않는다. 두 모델이 낸 숫자를 그대로 가져와 '같이 보는 것 / 다르게 보는 것'으로 묶을 뿐이다.
 * 예측 탭 맨 아래의 반도체 한 줄(miniRow)도 여기서 만든다. */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc;

  var CYC_SHORT = { up: '상승 중', late: '상승 후반', turning: '꺾이는 중', down: '하락 중', bottom: '바닥 다지기' };
  var JW_RANK = { '상승 중': 0, '상승 후반': 1, '하락 시작': 2 };
  var CYC_RANK = { up: 0, late: 1, turning: 2, down: 3, bottom: 4 };

  function ym(s) { return s ? s.slice(0, 4) + '년 ' + (+s.slice(5, 7)) + '월' : ''; }
  function yms(s) { return s ? s.slice(2, 4) + '년 ' + (+s.slice(5, 7)) + '월' : ''; }
  function addM(s, k) { var n = (+s.slice(0, 4)) * 12 + (+s.slice(5, 7)) - 1 + k, y = Math.floor(n / 12), m = n % 12 + 1; return y + '-' + (m < 10 ? '0' : '') + m; }
  function sp(v, d) { return v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 0 : d) + '%'; }
  function pct(p) { return p == null ? '–' : Math.round(p * 100) + '%'; }

  // 두 자료를 읽어 화면에 쓸 값으로 정리 (둘 중 하나만 있어도 동작)
  function digest() {
    var M = root.MemoryPage && root.MemoryPage.data(), S = root.SemiPage && root.SemiPage.data();
    if (!M && !S) return null;
    var g = { M: M, S: S };
    if (M) {
      var dr = M.items.dram;
      g.cyc = { code: dr.phase.code, label: CYC_SHORT[dr.phase.code] || dr.phase.label, cur: dr.current, st: dr.stats, ev: dr.event, month: M.latest.month };
      if (M.prob && M.prob.items && M.prob.items.dram) g.prob = { dram: M.prob.items.dram.p, nand: M.prob.items.nand && M.prob.items.nand.p, month: M.prob.month, m: M.prob.metrics };
      if (M.kosis) g.ko = M.kosis;
    }
    if (S) {
      var on = S.signals.filter(function (x) { return x.status === '켜짐'; }).length;
      var mid = S.signals.filter(function (x) { return x.status === '압력' || x.status === '둔화'; }).length;
      g.jw = { phase: S.head.phase, on: on, mid: mid, n: S.signals.length, h: S.head, sc: S.scen };
    }
    // 큰 제목: 두 모델 중 더 진행된 국면 (상승 중 < 상승 후반 < 꺾임/하락)
    var a = g.cyc ? CYC_RANK[g.cyc.code] : -1, b = g.jw ? JW_RANK[g.jw.phase] : -1;
    if (g.cyc && g.cyc.code === 'bottom') g.title = '바닥 다지기';
    else if (a >= 2 || b >= 2) g.title = a >= 3 ? '하락 중' : '꺾이기 시작';
    else g.title = Math.max(a, b) === 1 ? '상승 후반' : '상승 중';
    // 한 줄 판정
    if (g.cyc && g.jw) {
      if (g.cyc.code === 'late' && g.jw.phase === '상승 후반') g.line = '두 모델 모두 \'오르는 힘이 약해진 상승 후반\'으로 봐요. 가격이 내려가기 시작했다는 숫자는 아직 없어요.';
      else if (g.cyc.code === 'up' && g.jw.phase === '상승 중') g.line = '두 모델 모두 아직 상승 중으로 봐요.';
      else if (a >= 2 && b >= 2) g.line = '두 모델 모두 가격이 꺾이기 시작했다고 봐요.';
      else if (a >= 2 || b >= 2) g.line = (a >= 2 ? '사이클 모델' : '이주완 모델') + '이 먼저 꺾임 신호를 냈어요. 다른 모델은 아직 \'' + (a >= 2 ? g.jw.phase : g.cyc.label) + '\'이에요.';
      else g.line = '사이클 모델은 \'' + g.cyc.label + '\', 이주완 모델은 \'' + g.jw.phase + '\'으로 봐요.';
    } else g.line = g.cyc ? '사이클 모델은 \'' + g.cyc.label + '\'으로 봐요.' : '이주완 모델은 \'' + g.jw.phase + '\'으로 봐요.';
    // 정점 시기: 사이클 모델(속도 정점 + 과거 간격) vs 박사 가정
    if (g.cyc && g.cyc.cur.peakR3Month && (g.cyc.code === 'late' || g.cyc.code === 'up')) {
      var c = g.cyc.cur, st = g.cyc.st;
      g.peak = { from: c.peakR3Month, mid: addM(c.peakR3Month, st.lagMedian), lo: addM(c.peakR3Month, st.lagMin), hi: addM(c.peakR3Month, st.lagMax), since: c.monthsSincePeakR3, lag: st.lagMedian };
    }
    return g;
  }

  function tag(same, txt) { return '<span class="htag ' + (same ? 'same' : 'diff') + '">' + esc(txt || (same ? '같음' : '다름')) + '</span>'; }
  function cmpRow(title, tg, left, right) {
    return '<div class="hrow"><div class="hrt"><b>' + esc(title) + '</b>' + (tg || '') + '</div><div class="hcols">' +
      '<div><small>사이클 모델</small><p>' + left + '</p></div><div><small>이주완 모델</small><p>' + right + '</p></div></div></div>';
  }

  // H: app.js 도구. 두 자료가 없으면 불러오고 안내 카드를 돌려준다.
  function view(H, mounts) {
    var g = digest();
    if (!g) return H.card('<div class="empty"><h2>반도체 자료를 여는 중</h2></div>');
    var out = [], cyc = g.cyc, jw = g.jw, prob = g.prob, ko = g.ko;

    // 1) 지금 국면 + 한 줄
    out.push(H.card('<p class="hk">메모리 반도체 가격, 지금은</p><div class="smphase"><b>' + esc(g.title) + '</b>' +
      (cyc ? '<span>' + esc(ym(cyc.month)) + ' 수출가격 기준</span>' : '') + '</div>' +
      '<p class="smtake">' + esc(g.line) + '</p>' +
      '<div class="hbadges">' +
      (cyc ? '<button type="button" class="hbadge" data-act="jwSub" data-s="cycle"><small>사이클 모델</small><b>' + esc(cyc.label) + '</b><span>' + (prob ? '6개월 뒤 더 낮을 확률 ' + pct(prob.dram) : '오르는 속도 ' + sp(cyc.cur.r3Pct, 1)) + '</span></button>' : '') +
      (jw ? '<button type="button" class="hbadge" data-act="jwSub" data-s="model"><small>이주완 모델</small><b>' + esc(jw.phase) + '</b><span>하락 신호 켜짐 ' + jw.on + ' · 기울기 ' + jw.mid + ' / ' + jw.n + '개</span></button>' : '') +
      '</div>'));

    // 2) 핵심 숫자 4개
    var k = [];
    if (cyc) k.push(['<span class="' + (cyc.cur.r3Pct >= 0 ? 'up-t' : 'down-t') + '">' + sp(cyc.cur.r3Pct, 1).replace('%', '<span class="pc">%</span>') + '</span>', 'D램 가격 3개월 변화', cyc.cur.peakR3Pct != null ? '이번 최고 ' + sp(cyc.cur.peakR3Pct) + ' (' + yms(cyc.cur.peakR3Month) + ')' : '']);
    if (prob) k.push([Math.round(prob.dram * 100) + '<span class="pc">%</span>', '6개월 뒤 D램이 더 낮을 확률', '낸드 ' + pct(prob.nand) + ' · 사이클 모델']);
    if (jw) k.push(['−' + jw.h.cut.toFixed(1) + '<span class="pc">%</span>', '반도체 가동률 (정상 대비)', jw.h.cut >= 2 ? '감산 중 · 이주완 모델' : '감산 거의 끝 · 이주완 모델']);
    if (ko) k.push([ko.ratio.toFixed(2) + '<span class="pc">배</span>', '재고 ÷ 출하 (통계청)', '2000년 이후 평균 ' + ko.ratioAvg.toFixed(2) + '배 · 낮을수록 빠듯']);
    out.push(H.card('<div class="kpis four smkpis">' + k.map(function (x) {
      return '<div class="kpi"><div class="v">' + x[0] + '</div><div class="l">' + esc(x[1]) + '</div>' + (x[2] ? '<div class="l2">' + esc(x[2]) + '</div>' : '') + '</div>';
    }).join('') + '</div>', 'kpicard'));

    // 3) 같이 보는 것 · 다르게 보는 것
    if (cyc && jw) {
      var rows = [];
      var sameNow = cyc.label === jw.phase;
      rows.push(cmpRow('지금 국면', tag(sameNow),
        '<b>' + esc(cyc.label) + '</b> · 오르는 속도가 ' + esc(yms(cyc.cur.peakR3Month)) + ' ' + sp(cyc.cur.peakR3Pct) + '에서 ' + sp(cyc.cur.r3Pct, 1) + '로 줄었어요',
        '<b>' + esc(jw.phase) + '</b> · 박사가 보는 하락 신호 ' + jw.n + '개 중 켜짐 ' + jw.on + '개, 기울기 시작 ' + jw.mid + '개'));
      if (g.peak) {
        var sc = jw.sc, pk = g.peak;
        var gap = Math.abs(((+pk.mid.slice(0, 4)) * 12 + (+pk.mid.slice(5, 7))) - ((+sc.peakMonth.slice(0, 4)) * 12 + (+sc.peakMonth.slice(5, 7))));
        rows.push(cmpRow('가격 꼭대기는 언제', tag(gap <= 2, gap <= 2 ? '비슷' : '다름'),
          '속도가 꺾인 뒤 가격 꼭대기까지 과거 중간값 ' + pk.lag + '개월 → <b>' + esc(yms(pk.mid)) + '쯤</b> (과거 범위 ' + esc(yms(pk.lo)) + '~' + esc(yms(pk.hi)) + ')',
          (sc.falling ? '<b>' + esc(yms(sc.peakMonth)) + '</b>에 이미 꼭대기를 지났다고 봐요' : '<b>' + esc(yms(sc.peakMonth)) + '</b>을 꼭대기로 두고 계산해요 (박사: 3분기 정점)')));
      }
      rows.push(cmpRow('내린다면 얼마나', '',
        '지난 하락기 중간값 <b>' + sp(cyc.st.downChangeMedianPct) + '</b>(' + cyc.st.downMonthsMedian + '개월). 비슷한 신호 뒤 6개월 중간값 ' + sp(cyc.ev.median6Pct) + ' (' + cyc.ev.n6 + '번 중 ' + cyc.ev.down6 + '번 하락)',
        '박사 기본 시나리오 1년 뒤 <b>' + sp(jw.sc.A12) + '</b>, 2022년 수준까지 가면 ' + sp(jw.sc.full) + '. 공급 모델만 쓰면 1년 뒤 ' + sp(jw.sc.D12)));
      if (ko) {
        var tightK = ko.ratio < ko.ratioAvg, tightJ = jw.h.cut >= 2;
        rows.push(cmpRow('공급은 빠듯한가', tag(tightK === tightJ, tightK === tightJ ? (tightK ? '둘 다 빠듯' : '둘 다 여유') : '다름'),
          '통계청 재고가 출하의 <b>' + ko.ratio.toFixed(2) + '배</b>. 2000년 이후 지금보다 낮았던 달은 ' + Math.round(ko.lowerShare) + '%뿐이에요',
          '가동률이 정상보다 <b>' + jw.h.cut.toFixed(1) + '%</b> 낮아요. 박사는 감산이 풀릴 때 값이 크게 내린다고 봐요'));
      }
      out.push(H.card(H.head('두 모델 비교', '같은 메모리 가격을 서로 다른 길로 봐요') + rows.join('')));
    }

    // 4) 다음에 볼 일정 (이주완 자료의 일정 중 오늘 이후 3개)
    var J = root.JwPage && root.JwPage.data(), today = U.kstDate(H.now());
    if (J && J.watch) {
      var ws = J.watch.filter(function (w) { return w.date && w.date >= today; }).slice(0, 3);
      if (ws.length) out.push(H.card(H.head('다음에 볼 일정', '두 모델 중 어느 쪽이 맞는지 가려 줄 발표') + '<ul class="jwwatch">' + ws.map(function (w) {
        return '<li><div class="jwd num">' + (+w.date.slice(5, 7)) + '월 ' + (+w.date.slice(8, 10)) + '일</div><div><b>' + esc(w.what) + '</b><small>' + esc(w.look) + '</small></div></li>';
      }).join('') + '</ul>'));
    }

    // 5) 자세히 보기
    out.push('<div class="hnav">' +
      '<button type="button" class="card hgo" data-act="jwSub" data-s="cycle"><b>사이클 모델</b><small>가격 흐름 · 6개월 뒤 확률 · 지난 사이클 · 재고</small>' + I_NEXT + '</button>' +
      '<button type="button" class="card hgo" data-act="jwSub" data-s="model"><b>이주완 모델</b><small>감산·가동률 · 하락 신호 8개 · 가격 시나리오</small>' + I_NEXT + '</button>' +
      '<button type="button" class="card hgo" data-act="jwSub" data-s="claims"><b>박사 주장 점검</b><small>주장 판정 · 예측 기록 · 회사 공시</small>' + I_NEXT + '</button></div>');

    var asof = [];
    if (cyc) asof.push('수출가격 ' + ym(cyc.month));
    if (jw) asof.push('가동률 ' + ym(g.S.asOf.supply));
    if (ko) asof.push('재고 ' + ym(ko.month));
    out.push('<p class="foot">' + esc(asof.join(' · ')) + '까지 반영 · 한국은행·통계청 자료가 나오면 자동으로 바뀌어요<br>두 모델의 숫자를 나란히 놓은 참고 자료 · 투자 권유 아님</p>');
    return out.join('');
  }
  var I_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  // 예측 탭 맨 아래 한 줄
  function miniRow() {
    var g = digest(); if (!g) return '';
    var bits = [];
    if (g.prob) bits.push('6개월 뒤 하락 확률 ' + pct(g.prob.dram));
    if (g.jw) bits.push('하락 신호 켜짐 ' + g.jw.on + '·기울기 ' + g.jw.mid);
    return '<button type="button" class="card freshrow semirow" data-act="tab" data-tab="semi"><span class="fdot"></span><span class="ft"><b>메모리 가격</b> ' + esc(g.title) +
      '<small>' + esc(bits.join(' · ')) + ' · 반도체 탭에서 자세히</small></span>' + I_NEXT + '</button>';
  }

  root.SemiHub = { view: view, miniRow: miniRow, digest: digest };
})(window);
