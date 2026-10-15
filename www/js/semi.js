/* 반도체 페이지 — 이주완 박사의 '메모리 가격은 공급(감산·가동률)이 정한다'는 주장으로 만든 D램 가격 모델.
 * 자료(semi.json)는 GitHub Actions(.github/workflows/semi-data.yml)가 매일 한국은행 ECOS에서 새로 받아 계산해
 * 저장소의 semi-data 가지에 올린다. 앱은 그것을 받아 쓰고, 못 받으면 앱에 묶어 둔 data/semi.json을 쓴다.
 * 이주완 탭(js/jw.js)의 하위 화면 '모델'·'공급'을 그린다. */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc, Dt = root.Data;
  var REMOTE = 'https://raw.githubusercontent.com/hj5952009/mom-market-app/semi-data/semi.json';
  var CACHE_KEY = 'semi1', MAX_AGE = 6 * 3600e3;
  var DATA = null, FROM = null, GOT = null, loading = null, failed = false, checking = false, tried = 0;

  function valid(d) { return d && d.v === 1 && d.price && d.price.months && d.scen && d.signals && d.head; }
  function newer(a, b) { return !b || (a && String(a.generatedAt) > String(b.generatedAt)); }
  function bundled() { return fetch('data/semi.json').then(function (r) { return r.json(); }).then(function (d) { return valid(d) ? d : null; }).catch(function () { return null; }); }
  function remote() {
    return Dt.Native.httpGet(REMOTE + '?t=' + Math.floor(Date.now() / 600e3), 15000).then(function (d) {
      if (typeof d === 'string') d = JSON.parse(d);
      if (!valid(d)) throw new Error('bad data');
      return d;
    });
  }
  function use(d, from, at) { DATA = d; FROM = from; GOT = at || Date.now(); }
  // 저장된 자료 → (오래됐으면) 원격 → 묶어 둔 자료 순서
  function load(force) {
    if (loading) return loading;
    var c = Dt.LS.get(CACHE_KEY, null);
    if (!DATA && c && valid(c.d)) use(c.d, 'cache', c.at);
    var fresh = c && valid(c.d) && Date.now() - c.at < MAX_AGE;
    if (Dt.demo) {
      loading = bundled().then(function (b) { if (b) use(b, 'bundle'); else failed = true; });
    } else if (fresh && !force) {
      loading = Promise.resolve();
    } else {
      checking = true; tried = Date.now();
      loading = remote().then(function (d) {
        Dt.LS.set(CACHE_KEY, { d: d, at: Date.now() }); use(d, 'remote');
      }).catch(function () {
        if (DATA) return;
        return bundled().then(function (b) { if (b) use(b, 'bundle'); else failed = true; });
      }).then(function () {
        if (DATA && FROM !== 'remote') return bundled().then(function (b) { if (b && newer(b, DATA)) use(b, 'bundle'); });
      });
    }
    loading = loading.then(function () { loading = null; checking = false; }, function () { loading = null; checking = false; failed = !DATA; });
    return loading;
  }

  // ------------------------------------------------------------------ 글자 도구
  function ym(s) { return s ? s.slice(0, 4) + '년 ' + (+s.slice(5, 7)) + '월' : ''; }
  function ymd(s) { return s && s.length >= 10 ? (+s.slice(5, 7)) + '월 ' + (+s.slice(8, 10)) + '일' : ym(s); }
  function sp(v, d) { return v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 1 : d) + '%'; }
  function stCls(s) { return s === '켜짐' ? 'on' : (s === '압력' || s === '둔화') ? 'mid' : 'off'; }
  function stTxt(s) { return s === '아직 아님' ? '아직' : s; }

  // ------------------------------------------------------------------ 하위 화면
  function pageSum(H, mounts) {
    var d = DATA, h = d.head, sc = d.scen, out = [];
    var rank = function (s) { return s.status === '켜짐' ? 0 : (s.status === '압력' || s.status === '둔화') ? 1 : 2; };
    var meter = d.signals.slice().sort(function (a, b) { return rank(a) - rank(b); }).map(function (s) { return '<i class="' + (s.status === '켜짐' ? 'on' : (s.status === '압력' || s.status === '둔화') ? 'mid' : '') + '"></i>'; }).join('');
    var take = '이주완 박사는 메모리 값이 수요보다 <b>공급(감산)</b>으로 정해진다고 봐요. 지금 한국 반도체 가동률은 정상보다 <b class="num">' + h.cut.toFixed(1) + '%</b> 낮고' +
      (h.cut >= 2 ? '(감산 중)' : '(감산이 거의 풀림)') + ', 생산능력은 1년 새 <b class="num">' + sp(h.capYoy) + '</b> 늘었어요. ' +
      (sc.falling ? 'D램 값은 ' + ym(sc.peakMonth) + '를 고비로 내려오기 시작했어요.' : 'D램 값은 ' + ym(sc.lastMonth) + '까지 아직 오르고 있어요.') +
      ' 박사가 보는 하락 신호 <b class="num">' + h.nSignals + '</b>개 중 <b class="num">' + h.lit + '</b>개가 켜졌어요.';
    out.push(H.card('<div class="smphase"><b>' + esc(h.phase) + '</b><span>메모리 가격 국면 · 이주완 모델</span></div>' +
      '<div class="smmeter" aria-label="하락 신호 ' + h.lit + '개">' + meter + '</div><p class="smtake">' + take + '</p>'));
    out.push(H.card('<div class="kpis four smkpis">' +
      '<div class="kpi"><div class="v">−' + h.cut.toFixed(1) + '<span class="pc">%</span></div><div class="l">가동률 (정상 대비)</div></div>' +
      '<div class="kpi"><div class="v">' + h.curUpM + '<span class="pc">개월</span></div><div class="l">이번 상승기 ' + sp(h.curUpPct, 0) + '<br>과거 최장 ' + h.maxUpM + '개월</div></div>' +
      '<div class="kpi"><div class="v">' + sp(sc.A12, 0).replace('%', '<span class="pc">%</span>') + '</div><div class="l">박사 시나리오 1년 뒤<br>(' + ym(sc.peakMonth) + ' 정점 기준)</div></div>' +
      '<div class="kpi"><div class="v">' + sp(sc.D12, 0).replace('%', '<span class="pc">%</span>') + '</div><div class="l">공급 모델 1년 뒤<br>범위 ' + sp(sc.D12lo, 0) + '~' + sp(sc.D12hi, 0) + '</div></div>' +
      '</div>', 'kpicard'));
    var am = d.price.months, i0 = am.indexOf('2023-01'); if (i0 < 0) i0 = Math.max(0, am.length - 44);
    out.push(H.card(H.head('D램 수출가격과 앞으로의 경로', '한국은행 수출물가지수(달러 기준, 2020=100) · 세로 눈금은 비율') + H.chartBox('c-smprice') +
      '<div class="legend"><span><i class="ln"></i>실제</span><span><i class="ln dash" style="background:repeating-linear-gradient(90deg,var(--down) 0 4px,transparent 4px 7px)"></i>A 박사 기본(띠: 과거 사이클 범위)</span>' +
      '<span><i class="ln dash" style="background:repeating-linear-gradient(90deg,var(--band-1) 0 4px,transparent 4px 7px)"></i>B 감산 완전 해제</span>' +
      (sc.consensus ? '<span><i class="ln dash" style="background:repeating-linear-gradient(90deg,var(--up) 0 4px,transparent 4px 7px)"></i>C 시장 전망(TrendForce ' + esc(sc.consensus.quarter.slice(2)) + ')</span>' : '') +
      '<span><i class="dot" style="background:var(--band-1)"></i>D 공급 모델 1년 뒤</span></div>' +
      '<p class="note">A는 ' + (sc.falling ? ym(sc.peakMonth) + ' 실제 최고점' : ym(sc.peakMonth) + (sc.estNext ? '(그달 고정거래가 ' + sp(sc.estNext.momPct) + '로 추정)' : '') + '을 정점으로 두고') +
      ' 2001년 이후 과거 정점 뒤 흐름을 붙였어요. B는 감산이 풀려 2022년 7~8월 값(' + Math.round(sc.level2022) + ')까지 30개월에 걸쳐 내려가는 길이에요. 실제가 어느 선을 따라가는지 보시면 돼요.</p>'));
    mounts.push(function () { H.Ch.semiPrice(H.$('c-smprice'), { months: am.slice(i0), actual: d.price.dram.slice(i0), scen: { months: sc.months, A: sc.A, Alo: sc.Alo, Ahi: sc.Ahi, B: sc.B, C: sc.C, D: sc.D } }); });
    out.push(H.card(H.head('박사가 말한 하락 신호', '켜짐: 하락 쪽 신호 · 압력·둔화: 기울기 시작 · 아직: 신호 없음') + '<ul class="smsig">' + d.signals.map(function (s) {
      return '<li><div class="t"><b>' + esc(s.name) + '</b><span class="smst ' + stCls(s.status) + '">' + esc(stTxt(s.status)) + '</span></div><p>' + esc(s.reading) + '</p>' +
        '<small>' + (s.auto ? '자동 갱신 · ' : '') + esc(ymd(s.asOf)) + ' 기준' + (s.source ? ' · ' + esc(s.source) : '') + '</small></li>';
    }).join('') + '</ul>'));
    return out.join('');
  }
  function pageSupply(H, mounts) {
    var d = DATA, s = d.supply, h = d.head, out = [];
    out.push(H.card(H.head('생산능력과 실제 생산', '통계청 반도체 제조업 지수(2020=100) · 생산은 3개월 평균') + H.chartBox('c-smcap') +
      '<div class="legend"><span><i class="ln" style="background:var(--ink)"></i>생산능력</span><span><i class="ln" style="background:var(--band-1)"></i>생산</span></div>' +
      '<p class="note">1년 전보다 능력은 ' + sp(h.capYoy) + ', 생산은 ' + sp(h.prodYoy) + '. 능력이 놀고 있다는 것이 박사가 말하는 감산이에요.</p>'));
    mounts.push(function () { H.Ch.semiLines(H.$('c-smcap'), { months: s.months, label: '생산능력과 생산', fmt: function (v) { return String(Math.round(v)); }, series: [{ name: '생산능력', values: s.cap, cls: 'c-line', key: '--ink' }, { name: '생산', values: s.prod3, cls: 's-b1', key: '--band-1' }] }); });
    out.push(H.card(H.head('가동률', '계절조정, 3개월 평균 · 점선은 직전 3년의 높은 수준(정상)') + H.chartBox('c-smutil') +
      '<p class="note">지금 ' + h.util3.toFixed(1) + ', 정상 ' + h.norm.toFixed(1) + '. 점선과 다시 만나면 감산이 끝났다는 뜻이고, 박사는 그때 가격이 크게 내린다고 봐요.</p>'));
    mounts.push(function () { H.Ch.semiLines(H.$('c-smutil'), { months: s.months, label: '반도체 가동률', fmt: function (v) { return v.toFixed(0); }, series: [{ name: '가동률', values: s.util3, cls: 'c-line', key: '--ink' }, { name: '정상', values: s.norm, cls: 'c-proj', key: '--ink-2', dash: true }] }); });
    out.push(H.card(H.head('수출: 가격 효과를 빼면', d.pv.period.replace(' vs ', ' · 1년 전 ').replace(/(\d{4})-(\d{2})/g, function (m, y, mo) { return y.slice(2) + '.' + mo; })) + H.chartBox('c-smpv') +
      '<p class="note">빨강은 금액·가격, 보라는 물량, 회색은 박사의 주장값이에요. 물량이 거의 늘지 않았다는 방향은 맞지만, 한국은행 자료로는 박사 말만큼 줄지 않았어요.</p>'));
    mounts.push(function () { H.Ch.semiBars(H.$('c-smpv'), { rows: d.pv.rows }); });
    out.push(H.card(H.head('환율', '원/달러 월평균 · 박사의 적정 환율 1,150원') + H.chartBox('c-smfx') +
      '<p class="note">박사 계산법(50원 오르면 영업이익 +15%, 내리면 −7%)으로는 ' + esc(d.fx.recentLabel.replace(/(\d{4})-(\d{2})/g, function (m, y, mo) { return y.slice(2) + '.' + mo; })) + ' 환율이 그 전 3개월보다 영업이익을 ' + sp(d.fx.effRecent) + ' 바꿔요.</p>'));
    mounts.push(function () { H.Ch.semiLines(H.$('c-smfx'), { months: d.fx.months, label: '원/달러 환율', fmt: function (v) { return U.fmtInt(v); }, series: [{ name: '원/달러', values: d.fx.values, cls: 'c-line', key: '--ink' }] }); });
    return out.join('') + modelCards(H);
  }
  function modelCards(H) {
    var d = DATA, h = d.head, m = d.model, out = [];
    out.push(H.card(H.head('공급 모델 성적', '2008년부터 매달 그 전 자료로만 다시 맞춰 1년 뒤를 예측') +
      '<table class="smtab"><tbody>' +
      '<tr><td>과거 평균만 쓴 예측보다 오차가</td><td class="num">' + (m.rmseGain >= 0 ? m.rmseGain.toFixed(1) + '% 작음' : Math.abs(m.rmseGain).toFixed(1) + '% 큼') + '</td></tr>' +
      '<tr><td>오를지 내릴지 맞힌 비율</td><td class="num">' + m.hit + '%</td></tr>' +
      '<tr><td>6개월 앞 예측</td><td class="num">' + (m.gain6 > 0 ? '조금 나음' : '나아지지 않음') + '</td></tr></tbody></table>' +
      '<p class="note">생산능력이 많이 늘면 1년 뒤 값이 내리는 경향은 데이터로 확인돼요. 하지만 맞히는 폭이 커서 숫자 하나보다 방향 참고용이에요.</p>'));
    out.push(H.card(H.head('사이클 길이', '2012년 이후 D램 가격 기준') +
      '<table class="smtab"><tbody>' +
      '<tr><td>오르는 기간 평균 (박사: 1.5년)</td><td class="num">' + h.upRecent.toFixed(1) + '개월</td></tr>' +
      '<tr><td>내리는 기간 평균 (박사: 2.5년)</td><td class="num">' + h.downRecent.toFixed(1) + '개월</td></tr>' +
      '<tr><td>하락기 가격 하락폭 (2001년 이후 중간값)</td><td class="num">' + sp(h.downFall, 0) + '</td></tr>' +
      '<tr><td>이번 상승기</td><td class="num">' + h.curUpM + '개월 · ' + sp(h.curUpPct, 0) + '</td></tr></tbody></table>'));
    return out.join('');
  }

  function foot() {
    var d = DATA, src = FROM === 'remote' ? '방금 받은 자료' : FROM === 'cache' ? '저장된 자료' : '앱에 들어 있는 자료';
    return '<p class="foot">D램 가격 ' + esc(ym(d.asOf.price)) + ' · 공급 ' + esc(ym(d.asOf.supply)) + ' · 환율 ' + esc(ym(d.asOf.fx)) + '까지 반영<br>' +
      esc(src) + ' · ' + esc(d.generatedAt.slice(0, 10).replace(/-/g, '.')) + ' 계산 · 한국은행 자료가 나오면 자동으로 바뀌어요<br>' +
      '<button type="button" class="btn ghost" data-act="smReload" style="margin:8px auto 4px">' + (checking ? '확인하는 중…' : '새 자료 확인') + '</button><br>' +
      d.sources.map(esc).join('<br>') + '<br>한 전문가의 주장을 데이터로 점검한 참고 자료 · 투자 권유 아님</p>';
  }

  // jw.js가 부른다. sub: 'model' | 'supply'. 자료가 아직 없으면 불러오고 안내 카드를 돌려준다.
  function view(H, sub, mounts) {
    if (!DATA) {
      if (failed) return H.card('<div class="empty"><h2>반도체 모델 자료를 열지 못했어요</h2><p>인터넷 연결을 확인하고 다시 열어 주세요</p></div>');
      load(false).then(H.render);
      return H.card('<div class="empty"><h2>반도체 모델 자료를 여는 중</h2></div>');
    }
    if (!loading && FROM !== 'remote' && !Dt.demo && (!GOT || Date.now() - GOT > MAX_AGE) && Date.now() - tried > 10 * 60e3) load(false).then(H.keep);
    return (sub === 'supply' ? pageSupply(H, mounts) : pageSum(H, mounts)) + foot();
  }
  function onAct(act, d, H) {
    switch (act) {
      case 'smReload': if (Dt.demo) return true; load(true).then(H.keep); H.keep(); return true;
    }
    return false;
  }
  root.SemiPage = { view: view, onAct: onAct, load: load };
})(window);
