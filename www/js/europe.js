/* 유럽 탭 — 유럽 국채 위험 지수(ESRI v2: 독일·프랑스·이탈리아·스페인).
 * 자료(esri.json)는 GitHub Actions(.github/workflows/europe-data.yml)가 매일 ECB·Eurostat·Yahoo에서 받아 tools/esri/esri.js로 계산해
 * 저장소의 europe-data 가지에 올린다. 앱은 그것을 6시간에 한 번까지 받아 보고, 못 받으면 앱에 묶어 둔 data/esri.json을 쓴다.
 * 하위 화면: 한눈에 · 나라별 · 매일 · 모델(제미나이 원안 평가와 검증). 숫자는 모두 esri.json에서 오며 여기서는 새 모델 숫자를 만들지 않는다
 * (나라별 '5년 부채비율 경로'만 esri.json의 재정 값으로 같은 식을 다시 그려 보여 준다). */
(function (root) {
  'use strict';
  var U = root.MCUtil, esc = U.esc, Dt = root.Data;
  var REMOTE = 'https://raw.githubusercontent.com/hj5952009/mom-market-app/europe-data/esri.json';
  var CACHE_KEY = 'esri1', MAX_AGE = 6 * 3600e3;
  var DATA = null, FROM = null, GOT = null, loading = null, failed = false;
  var ST = { sub: 'hub', c: 'FR', span: '10y' };
  var C4 = ['DE', 'FR', 'IT', 'ES'];
  var REG = { 정상: 'ok', 주의: 'warn', 고위험: 'high', 위기: 'crit' };

  function valid(d) { return d && d.v === 1 && d.countries && C4.every(function (c) { return d.countries[c] && d.countries[c].latest; }); }
  function bundled() { return fetch('data/esri.json').then(function (r) { return r.json(); }).then(function (d) { return valid(d) ? d : null; }).catch(function () { return null; }); }
  function remote() {
    return Dt.Native.httpGet(REMOTE + '?t=' + Math.floor(Date.now() / 600e3), 15000).then(function (d) {
      if (typeof d === 'string') d = JSON.parse(d);
      if (!valid(d)) throw new Error('bad data');
      return d;
    });
  }
  function use(d, from, at) { DATA = d; FROM = from; GOT = at || Date.now(); }
  // 저장된 자료 → (6시간 넘었으면) 원격 → 묶어 둔 자료
  function load(force) {
    if (loading) return loading;
    var c = Dt.LS.get(CACHE_KEY, null);
    if (!DATA && c && valid(c.d)) use(c.d, 'cache', c.at);
    var fresh = c && valid(c.d) && Date.now() - c.at < MAX_AGE;
    if (Dt.demo) loading = bundled().then(function (b) { if (b) use(b, 'bundle'); else failed = true; });
    else if (fresh && !force) loading = Promise.resolve();
    else {
      loading = remote().then(function (d) { Dt.LS.set(CACHE_KEY, { d: d, at: Date.now() }); use(d, 'remote'); })
        .catch(function () { if (DATA) return; return bundled().then(function (b) { if (b) use(b, 'bundle'); else failed = true; }); });
    }
    loading = loading.then(function () { loading = null; }, function () { loading = null; });
    return loading;
  }

  // ------------------------------------------------------------------ 도구
  function f1(v) { return v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1); }
  function f0(v) { return v == null ? '–' : String(Math.round(v)); }
  function sg(v, d, u) { return v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 1 : d) + (u || ''); }
  function ymL(m) { return m ? m.slice(0, 4) + '년 ' + (+m.slice(5, 7)) + '월' : ''; }
  function dL(d) { return d ? (+d.slice(5, 7)) + '월 ' + (+d.slice(8, 10)) + '일' : ''; }
  function pctTxt(p) { return p == null ? '–' : '상위 ' + Math.max(1, Math.round((1 - p) * 100)) + '%'; }
  function regPill(r) { return r ? '<span class="eupill ' + REG[r] + '">' + esc(r) + '</span>' : ''; }
  // 0~120 눈금 막대: 구간(정상·주의·고위험·위기) + 현재 위치
  function zoneBar(t, prev) {
    var X = function (v) { return Math.max(0, Math.min(100, v / 120 * 100)); };
    return '<div class="euzb" aria-hidden="true"><i class="z ok" style="width:' + X(50) + '%"></i><i class="z warn" style="left:' + X(50) + '%;width:' + (X(75) - X(50)) + '%"></i>' +
      '<i class="z high" style="left:' + X(75) + '%;width:' + (X(100) - X(75)) + '%"></i><i class="z crit" style="left:' + X(100) + '%;width:' + (100 - X(100)) + '%"></i>' +
      (prev != null ? '<i class="pv" style="left:' + X(prev) + '%"></i>' : '') + '<i class="mk" style="left:' + X(t) + '%"></i></div>' +
      '<div class="euzl num"><span>0</span><span style="left:' + X(50) + '%">50</span><span style="left:' + X(75) + '%">75</span><span style="left:' + X(100) + '%">100 위기선</span></div>';
  }
  function prevMonth(c) { var M = DATA.countries[c].monthly; return M.length > 1 ? M[M.length - 2] : null; }
  function headline() {
    var L = C4.map(function (c) { return { c: c, x: DATA.countries[c] }; });
    var top = L.slice().sort(function (a, b) { return b.x.latest.t100 - a.x.latest.t100; })[0];
    var weak = L.slice().sort(function (a, b) { return b.x.latest.F - a.x.latest.F; })[0];
    var all = L.every(function (o) { return o.x.latest.regime === '정상'; });
    var s = all ? '네 나라 모두 \'정상\' 구간이에요. ' : '';
    s += '시장 쪽 위험이 가장 높은 곳은 ' + top.x.name + '(' + f1(top.x.latest.t100) + ')';
    if (weak.c !== top.c) s += ', 재정이 가장 약한 곳은 ' + weak.x.name + '예요.';
    else s += '이고, 재정도 가장 약해요.';
    return s;
  }

  // ------------------------------------------------------------------ 하위 화면
  var SUBS = [['hub', '한눈에'], ['country', '나라별'], ['daily', '매일'], ['model', '모델']];
  function subNav() {
    return '<div class="seg sgnav eunav" role="group" aria-label="유럽 화면">' + SUBS.map(function (x) {
      return '<button type="button" data-act="euSub" data-s="' + x[0] + '" aria-pressed="' + (ST.sub === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function chips() {
    return '<div class="sgchips euchips">' + C4.map(function (c) {
      return '<button type="button" class="chipbtn" data-act="euC" data-c="' + c + '" aria-pressed="' + (ST.c === c) + '">' + esc(DATA.countries[c].name) + '</button>';
    }).join('') + '</div>';
  }
  function spanSeg() {
    return '<div class="seg" role="group" aria-label="기간">' + [['3y', '3년'], ['10y', '10년'], ['all', '전체']].map(function (p) {
      return '<button type="button" data-act="euSpan" data-p="' + p[0] + '" aria-pressed="' + (ST.span === p[0]) + '">' + p[1] + '</button>';
    }).join('') + '</div>';
  }
  function histSeries(span) {
    var D = DATA, M0 = D.countries.FR.monthly.map(function (r) { return r[0]; });
    var from = span === 'all' ? '0000' : span === '3y' ? addM(D.nowMonth, -36) : addM(D.nowMonth, -120);
    var months = M0.filter(function (m) { return m >= from; });
    var series = C4.map(function (c) {
      var mp = {}; D.countries[c].monthly.forEach(function (r) { mp[r[0]] = r[1]; });
      return { c: c, name: D.countries[c].name, values: months.map(function (m) { return mp[m] == null ? null : mp[m]; }) };
    });
    return { months: months, series: series };
  }
  function addM(m, k) { var n = (+m.slice(0, 4)) * 12 + (+m.slice(5, 7)) - 1 + k; return Math.floor(n / 12) + '-' + ('0' + (n % 12 + 1)).slice(-2); }

  function pageHub(H, mounts) {
    var D = DATA, out = [];
    out.push(H.card(H.head('유럽 국채 위험 지수', '100 = 2011~12년 남유럽 재정위기 수준 · ' + ymL(D.nowMonth) + '(잠정) · 공식 금리는 ' + ymL(D.lastOfficialMonth) + '까지') +
      '<p class="euhl">' + esc(headline()) + '</p>' +
      C4.map(function (c) {
        var x = D.countries[c], a = x.latest, pv = prevMonth(c);
        return '<button type="button" class="eurow" data-act="euGo" data-c="' + c + '"><div class="eurt"><b>' + esc(x.name) + '</b>' + regPill(a.regime) +
          '<span class="euv num">' + f1(a.t100) + '</span></div>' + zoneBar(a.t100, pv && pv[1]) +
          '<small>지난달 지수 ' + (pv ? f1(pv[1]) : '–') + ' · 점수 ' + f0(a.m100) + '/100' + ' · 재정 취약 ' + Math.round(a.F * 100) + '%</small></button>';
      }).join('') +
      '<div class="legend"><span><i class="sw euok"></i>정상 0~50</span><span><i class="sw euwarn"></i>주의 51~75</span><span><i class="sw euhigh"></i>고위험 76~99</span><span><i class="sw eucrit"></i>위기 100~</span><span><i class="ring euring"></i>지난달</span></div>'));
    out.push(H.card(H.head('지난 흐름', '굵은 선이 고른 나라 · 점선이 위기선 100', spanSeg()) + chips() + H.chartBox('c-euhist')));
    var hs = histSeries(ST.span);
    mounts.push(function () { H.Ch.esriHist(H.$('c-euhist'), { months: hs.months, series: hs.series, focus: ST.c }); });
    var g = D.global.latest, gp = g.parts, gv = g.vals;
    var rows = [['VIX(미국 주식 변동성)', f1(gv.vix), gp.vix], ['MOVE(미국 채권 변동성)', f1(gv.move), gp.move], ['미국 10년물 3개월 변화', sg(gv.tnx3, 2, '%p'), gp.tnx3],
      ['브렌트유 6개월 변화', sg(gv.brent6, 1, '%'), gp.brent6], ['유로/달러 6개월 변동', f1(gv.eur6) + '%', gp.eur6]];
    out.push(H.card(H.head('글로벌 전이 요인', '네 나라에 같이 영향을 주는 바깥 충격 · 과거 대비 순위') +
      '<ul class="euglob">' + rows.map(function (r) {
        return '<li><div><b>' + esc(r[0]) + '</b><small class="num">' + esc(r[1]) + '</small></div><div class="eupb"><i style="width:' + Math.round((r[2] || 0) * 100) + '%"></i></div><span class="num">' + (r[2] == null ? '–' : Math.round(r[2] * 100)) + '</span></li>';
      }).join('') + '</ul><p class="note">막대는 1999년 이후 그 지표가 지금보다 낮았던 달의 비율이에요(100에 가까울수록 드문 충격). 합친 글로벌 점수 ' + Math.round(g.P3 * 100) + '</p>'));
    return out.join('');
  }

  // 5년 부채비율 경로: d_{k+1} = d_k(1+r_eff)/(1+g) − pb, r_eff는 1/WAM씩 시장금리로
  function debtPath(f, wam, r) {
    var d = f.debt, re = f.reff != null ? f.reff : r, g = f.g / 100, pts = [d];
    for (var k = 0; k < 5; k++) { re = re + (r - re) / wam; d = d * (1 + re / 100) / (1 + g) - f.pb; pts.push(d); }
    return pts;
  }
  function partRow(label, val, p, note) {
    return '<li><div><b>' + esc(label) + '</b><small class="num">' + esc(val) + (note ? ' · ' + esc(note) : '') + '</small></div><div class="eupb"><i style="width:' + Math.round((p || 0) * 100) + '%"></i></div><span class="num">' + (p == null ? '–' : Math.round(p * 100)) + '</span></li>';
  }
  function pageCountry(H, mounts) {
    var D = DATA, c = ST.c, x = D.countries[c], a = x.latest, f = a.fiscal || {}, out = [], pv = prevMonth(c);
    out.push(chips());
    out.push(H.card('<div class="kpis"><div class="kpi"><div class="v">' + f1(a.t100) + '</div><div class="l">위기선 기준 지수 (100 = 위기)</div><div class="d">' + regPill(a.regime) + ' <span class="l2">지난달 ' + (pv ? f1(pv[1]) : '–') + '</span></div></div>' +
      '<div class="kpi"><div class="v">' + f0(a.m100) + '<span class="pc">점</span></div><div class="l">100점 만점 점수 (지수 100 ≈ 85점)</div></div></div>' + zoneBar(a.t100, pv && pv[1]), 'kpicard eukpi'));
    var W = D.weights;
    out.push(H.card(H.head('무엇이 이 숫자를 만드나', '시장 스트레스(①국채시장 ' + Math.round(W.P1 * 100) + '% + ③글로벌 ' + Math.round(W.P3 * 100) + '%) × 재정 취약성(②)') +
      '<h3 class="sgh3">① 국채시장 스트레스 <span class="num">' + Math.round(a.P1 * 100) + '</span></h3><ul class="euglob">' +
      (c === 'DE' ? '<li><div><b>독일 10년물(기준 금리)</b><small class="num">스프레드 0 · 기준 나라</small></div><div class="eupb"><i style="width:0"></i></div><span class="num">0</span></li>' :
        partRow('독일 대비 10년물 금리차', f0(a.vals.spr) + 'bp', a.parts.spr, '450bp = 1') + partRow('3개월 금리차 변화', sg(a.vals.dspr, 0, 'bp'), a.parts.dspr, '150bp 확대 = 1')) +
      partRow('금융 스트레스(ECB CISS)', a.vals.ciss == null ? '–' : a.vals.ciss.toFixed(3), a.parts.ciss, '과거 순위') +
      partRow(x.bank + ' 12개월 낙폭', a.vals.bank == null ? '–' : '−' + f1(a.vals.bank) + '%', a.parts.bank, '과거 순위') + '</ul>' +
      '<h3 class="sgh3">② 재정 취약성 <span class="num">' + Math.round(a.F * 100) + '</span><small> ' + (f.year || '') + '년 자료</small></h3><ul class="euglob">' +
      partRow('정부부채', f1(f.debt) + '% GDP', f.sc && f.sc.debt, '60%=0 · 150%=1') +
      partRow('기초재정수지', sg(f.pb, 1, '% GDP'), f.sc && f.sc.pb, '+2%=0 · −4%=1') +
      partRow('시장금리 − 임계금리 r*', sg(f.gap, 2, '%p'), f.sc && f.sc.gap, '−2=0 · +4=1') +
      partRow('5년 뒤 부채비율 변화', sg(f.dd5, 1, '%p'), f.sc && f.sc.dd5, '−5=0 · +15=1') +
      partRow('연간 총자금조달수요', f1(f.gfn) + '% GDP', f.sc && f.sc.gfn, '10%=0 · 25%=1') + '</ul>' +
      '<h3 class="sgh3">③ 글로벌 전이 <span class="num">' + Math.round(a.P3 * 100) + '</span></h3><p class="note">네 나라 공통 · 한눈에 화면 아래에 자세히</p>'));
    // 부채 동학
    if (f.debt != null) {
      var r = f.rmkt, years = [], base = f.year + 1;
      for (var k = 0; k <= 5; k++) years.push((base + k - 1) + '-01');
      var p0 = debtPath(f, x.wam, r), p1 = debtPath(f, x.wam, r + 1), ps = debtPath(f, x.wam, Math.max(0, f.rstar));
      out.push(H.card(H.head('부채가 어디로 가나', '정부부채 비율(% GDP) 5년 경로 · 성장률·기초재정수지는 그대로라고 가정') +
        '<div class="eurates"><div><small>지금 평균 이자율</small><b class="num">' + (f.reff == null ? '–' : f.reff.toFixed(2) + '%') + '</b></div><div><small>임계금리 r*</small><b class="num">' + f.rstar.toFixed(2) + '%</b></div><div><small>10년물 시장금리</small><b class="num">' + r.toFixed(2) + '%</b></div></div>' +
        '<p class="note">r*는 부채비율이 늘지 않는 가장 높은 금리예요(성장률 ' + f.g.toFixed(1) + '%·기초재정수지 ' + sg(f.pb, 1, '%') + ' 기준). 지금 빚의 평균 이자율은 시장금리보다 낮지만, 평균 ' + x.wam + '년 만기에 맞춰 차환되며 시장금리로 다가가요.</p>' +
        H.chartBox('c-eudebt') + '<div class="legend"><span><i class="ln"></i>지금 금리 유지</span><span><i class="ln euup"></i>금리 +1%p</span><span><i class="ln dash"></i>금리가 r*일 때</span></div>'));
      mounts.push(function () {
        H.Ch.semiLines(H.$('c-eudebt'), { months: years, label: x.name + ' 부채비율 경로', fmt: function (v) { return Math.round(v) + '%'; },
          series: [{ name: '지금 금리', key: '--ink', cls: 'c-line', values: p0 }, { name: '+1%p', key: '--up', cls: 's-up', values: p1 }, { name: 'r*', key: '--ink-2', cls: 'c-proj', values: ps, dash: true }] });
      });
    }
    // 이 나라의 지난 흐름과 ECB 국채 스트레스 지수(검증)
    var hs = histSeries('all'), mine = hs.series.filter(function (s) { return s.c === c; });
    out.push(H.card(H.head(x.name + ' 지난 흐름', '모델 지수(위)와 ECB 국채 스트레스 지수 SovCISS(아래, 모델 입력에 쓰지 않음)') + H.chartBox('c-euone') + H.chartBox('c-eusov') +
      '<p class="note">두 지수의 순위 상관 ' + (x.valid.rhoLevel == null ? '–' : x.valid.rhoLevel.toFixed(2)) + ' (' + ymL(x.valid.from) + '~' + ymL(x.valid.to) + ', ' + x.valid.n + '개월). ECB는 SovCISS를 ' + ymL(x.valid.to) + '까지만 내놨어요.</p>'));
    mounts.push(function () {
      H.Ch.esriHist(H.$('c-euone'), { months: hs.months, series: mine, focus: c });
      var sv = x.sov; H.Ch.semiLines(H.$('c-eusov'), { months: sv.map(function (r) { return r[0]; }), label: 'SovCISS', fmt: function (v) { return v.toFixed(2); }, series: [{ name: 'SovCISS', key: '--band-1', cls: 's-b1', values: sv.map(function (r) { return r[1]; }) }] });
    });
    out.push(H.card(H.head('큰 사건 때 ' + x.name + ' 지수', '그 구간의 가장 높은 값') + '<table class="mtab"><thead><tr><th>시기</th><th>사건</th><th>지수</th></tr></thead><tbody>' +
      DATA.episodes.map(function (e) { return '<tr><td class="num">' + e.from.slice(2).replace('-', '.') + '</td><td>' + esc(e.name) + '</td><td class="num">' + f1(e[c]) + '</td></tr>'; }).join('') + '</tbody></table>'));
    return out.join('');
  }

  function pageDaily(H, mounts) {
    var D = DATA, out = [];
    out.push(H.card(H.head('나라별 금융 스트레스 (ECB CISS, 매일)', '0~1 · 높을수록 금융시장이 불안 · 최근 1년') +
      C4.map(function (c) {
        var x = D.countries[c], d = x.daily.ciss, last = d[d.length - 1];
        return '<div class="eudrow"><div class="eudh"><b>' + esc(x.name) + '</b><span class="num">' + (last ? last[1].toFixed(3) : '–') + '</span><small>' + (last ? dL(last[0]) : '') + ' · 1980년 이후 ' + pctTxt(x.cissPct) + '</small></div>' + H.chartBox('c-euciss-' + c) + '</div>';
      }).join('')));
    C4.forEach(function (c) { var d = D.countries[c].daily.ciss; mounts.push(function () { H.Ch.esriDaily(H.$('c-euciss-' + c), { rows: d, fmt: function (v) { return v.toFixed(2); }, label: D.countries[c].name + ' CISS' }); }); });
    out.push(H.card(H.head('대표 은행 주가 (매일)', '나라 빚과 은행이 함께 흔들리는지(둠루프) 보는 창') +
      C4.map(function (c) {
        var x = D.countries[c], d = x.daily.bank, last = d[d.length - 1], m1 = d.length > 21 ? (last[1] / d[d.length - 22][1] - 1) * 100 : null;
        return '<div class="eudrow"><div class="eudh"><b>' + esc(x.bank) + '</b><span class="num">' + (last ? last[1].toFixed(2) : '–') + '</span><small>' + (last ? dL(last[0]) : '') + ' · 한 달 ' + sg(m1, 1, '%') + '</small></div>' + H.chartBox('c-eubank-' + c) + '</div>';
      }).join('')));
    C4.forEach(function (c) { var d = D.countries[c].daily.bank; mounts.push(function () { H.Ch.esriDaily(H.$('c-eubank-' + c), { rows: d, fmt: function (v) { return v.toFixed(1); }, label: D.countries[c].bank }); }); });
    var G = D.global.daily, NM = { vix: 'VIX', move: 'MOVE', tnx: '미국 10년물(%)', brent: '브렌트유($)', eur: '유로/달러' };
    out.push(H.card(H.head('글로벌 지표 (매일)', '최근 1년') + Object.keys(NM).filter(function (k) { return G[k] && G[k].length; }).map(function (k) {
      var d = G[k], last = d[d.length - 1];
      return '<div class="eudrow"><div class="eudh"><b>' + esc(NM[k]) + '</b><span class="num">' + last[1] + '</span><small>' + dL(last[0]) + '</small></div>' + H.chartBox('c-eug-' + k) + '</div>';
    }).join('')));
    Object.keys(NM).forEach(function (k) { if (G[k] && G[k].length) mounts.push(function () { H.Ch.esriDaily(H.$('c-eug-' + k), { rows: G[k], fmt: function (v) { return k === 'eur' ? v.toFixed(3) : v.toFixed(k === 'tnx' ? 2 : 0); }, label: NM[k] }); }); });
    out.push('<p class="foot">ECB CISS는 다음 날 오후, 은행 주가·글로벌 지표는 장 마감 뒤 들어와요 · 하루 두 번(07:40·18:40) 자동으로 새로 계산해요</p>');
    return out.join('');
  }

  function pageModel(H) {
    var D = DATA, out = [], cal = D.calibration;
    out.push(H.card(H.head('제미나이 원안 평가', 'ESRI-100 설계서를 실제 자료로 점검한 결과') +
      '<h3 class="sgh3">좋았던 점 (그대로 살림)</h3><ul class="sgdots">' +
      '<li>시장 스트레스·재정 펀더멘털·글로벌 전이 세 영역으로 나눈 틀</li>' +
      '<li>부채 동학 식과 임계금리 r* = g + pb(1+g)/d — 문서의 네 나라 r* 값은 식대로 맞게 계산돼 있었어요</li>' +
      '<li>\'100 = 위기 임계선\' 지수와 0~100점 점수를 함께 쓰는 이중 표기(로지스틱 γ=0.048, θ=64 그대로)</li>' +
      '<li>ECB CISS식 상관 가중 합산(영역끼리 함께 오를 때 더 위험)</li></ul>' +
      '<h3 class="sgh3">문제였던 점 (고침)</h3><ul class="sgdots">' +
      '<li><b>숫자가 계산이 아니라 적어 넣은 값이었어요.</b> 네 나라 영역 점수·백테스트(2011년 138.6, 2022년 영국 114.2)는 자료로 계산한 흔적이 없고, 글로벌 영역은 네 나라 모두 54.0으로 같았어요 → 모든 숫자를 공식 자료로 다시 계산</li>' +
      '<li><b>임계금리를 신규 10년물 금리와 바로 비교</b>했어요. 부채 동학의 r은 빚 전체의 평균 이자율이라 차환되며 천천히 오르는데, 이를 무시해 위험을 부풀려요 → 평균 이자율이 만기(WAM)에 맞춰 시장금리로 다가가는 5년 부채 경로를 함께 계산</li>' +
      '<li><b>18개 변수 중 상당수는 무료로 매일 받을 수 없어요</b>(CDS·입찰 응찰률·5Y5Y 물가스와프·통화 베이시스·PMI·씨티 서프라이즈 지수 등) → 받을 수 있는 공식 자료로 바꿈</li>' +
      '<li><b>ACM 기간 프리미엄은 미국 국채 모델</b>이라 유럽 국채에 그대로 쓸 수 없어요 → 제외</li>' +
      '<li><b>위기 기준 82.5·가중치는 근거 없이 정해져</b> 있었어요 → 2011~12년 이탈리아·스페인 위기 정점을 100으로 맞추는 보정으로 바꿈</li>' +
      '<li><b>마르코프 국면전환·극단치(GPD)·동적 PCA</b>는 위기 사례가 몇 번뿐이라 추정이 불안정하고 설명도 어려워요 → 빼고, 대신 결과를 ECB 국채 스트레스 지수로 검증</li></ul>'));
    out.push(H.card(H.head('검증', 'ECB 국채 스트레스 지수 SovCISS(모델 입력에 쓰지 않은 외부 지표)와 비교') +
      '<table class="mtab"><thead><tr><th>나라</th><th>순위 상관</th><th>12개월 변화 상관</th><th>개월</th></tr></thead><tbody>' +
      C4.map(function (c) { var v = D.countries[c].valid; return '<tr><td>' + esc(D.countries[c].name) + '</td><td class="num">' + (v.rhoLevel == null ? '–' : v.rhoLevel.toFixed(2)) + '</td><td class="num">' + (v.rhoChange12 == null ? '–' : v.rhoChange12.toFixed(2)) + '</td><td class="num">' + v.n + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="note">보정: 2011년 8월~2012년 1월 이탈리아, 2012년 5~8월 스페인의 최고 원시 위험(' + cal.anchors.map(function (a) { return a.R.toFixed(2); }).join('·') + ') 평균 ' + cal.Rcrisis.toFixed(3) + ' = 100. 다른 시기는 보정에 쓰지 않았어요.</p>' +
      '<h3 class="sgh3">큰 사건 때 지수 (그 구간 최고값)</h3><table class="mtab sgtab"><thead><tr><th>사건</th><th>독</th><th>프</th><th>이</th><th>스</th></tr></thead><tbody>' +
      D.episodes.map(function (e) { return '<tr><td>' + esc(e.name) + '<small class="num">' + e.from.slice(2).replace('-', '.') + '</small></td>' + C4.map(function (c) { return '<td class="num' + (e[c] >= 100 ? ' euhot' : '') + '">' + f0(e[c]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
      '<p class="note">독일은 늘 낮고, 2011~12년 위기와 2022년 금리 충격 때 이탈리아가 가장 높게 나와요. 2018년 이탈리아 예산 갈등은 \'주의\', 2024년 프랑스 조기 총선은 \'정상\' 상단으로 잡혀요.</p>'));
    var G = D.gemini;
    out.push(H.card(H.head('제미나이 숫자와 비교', '문서의 \'2026년 10월 실측\' vs 공식 자료로 계산한 값') +
      '<table class="mtab sgtab"><thead><tr><th>나라</th><th>10년물<small>문서 / 실제</small></th><th>r*<small>문서 / 다시 계산</small></th><th>지수<small>문서 / 이 모델</small></th></tr></thead><tbody>' +
      C4.map(function (c) { var a = D.countries[c].latest, o = D.countries[c].official, f = a.fiscal || {}, g = G[c];
        return '<tr><td>' + esc(D.countries[c].name) + '</td><td class="num">' + g.y10.toFixed(2) + ' / ' + (f.rmkt == null ? '–' : f.rmkt.toFixed(2)) + '</td><td class="num">' + g.rstar.toFixed(2) + ' / ' + (f.rstar == null ? '–' : f.rstar.toFixed(2)) + '</td><td class="num">' + f1(g.t100) + ' / ' + f1(a.t100) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="note">실제 금리는 ECB 공식 ' + ymL(D.lastOfficialMonth) + ' 평균이에요. r*는 같은 식이지만 성장률을 10년 평균으로, 부채·재정수지를 Eurostat 최신 연간 값으로 넣어 달라졌어요. 프랑스는 재정 취약성이 네 나라 중 가장 높지만(r*가 시장금리보다 크게 낮음), 시장 스트레스는 아직 크지 않아 지수는 위기선과 거리가 있어요.</p>'));
    out.push(H.card(H.head('계산 방법', null) + '<ol class="sgdots sgsteps">' +
      '<li>① 국채시장: 독일 대비 10년물 금리차(450bp=1, 무게 .45), 3개월 확대 폭(150bp=1, .20), ECB 나라별 금융 스트레스 CISS(.20), 대표 은행주 12개월 낙폭(.15). CISS·은행주는 1999년부터 그 달까지 네 나라 값 중 순위로 0~1</li>' +
      '<li>③ 글로벌: VIX·MOVE·미국 10년물 3개월 변화·브렌트유 6개월 변화·유로/달러 6개월 변동의 과거 순위 평균</li>' +
      '<li>시장 스트레스 M = √((w∘s)ᵀC(w∘s)), w = ①0.75·③0.25, C는 두 영역의 최근 상관(EWMA)</li>' +
      '<li>② 재정: 부채비율·기초재정수지·(시장금리 − r*)·5년 뒤 부채 변화·총자금조달수요를 고정 기준으로 0~1, 평균. 연간 자료는 다음 해 4월부터 써서 앞을 보지 않아요</li>' +
      '<li>원시 위험 R = M × (0.5 + 재정), 지수 = 100 × R ÷ 위기 기준, 점수 = 100 ÷ (1 + e^(−0.048(지수 − 64)))</li>' +
      '<li>이번 달은 공식 월 금리가 나오기 전이라 지난달 금리 + 이번 달 일별 CISS·글로벌 지표로 잠정 계산해요</li></ol>'));
    out.push(H.card(H.head('자료와 자동 갱신', null) + '<ul class="sgdots">' +
      '<li>ECB Data Portal: 10년물 금리(월), CISS(일), SovCISS(월, 검증), 유로/달러(일) — 키 필요 없음</li>' +
      '<li>Eurostat: 정부부채·재정수지·이자지출·명목 GDP(연) — 키 필요 없음</li>' +
      '<li>Yahoo Finance: VIX·MOVE·미국 10년물·브렌트유·은행주 4곳</li>' +
      '<li>GitHub Actions가 매일 07:40·18:40에 받아 계산하고, 앱은 6시간에 한 번까지 새 자료를 받아요. 실패하면 저장소 주인에게 메일이 가요</li>' +
      '<li>이탈리아·스페인 10년물은 무료로 매일 받을 곳이 없어 ECB 공식 월평균을 써요. 매일 금리차가 필요하면 유료 API(예: EODHD 국채 자료) 키를 저장소 Secrets에 넣으면 연결할 수 있어요</li></ul>' +
      '<p class="foot">통계적 참고용 · 투자 권유 아님 · 계산 ' + esc(D.generatedAt ? D.generatedAt.slice(0, 16).replace('T', ' ') + ' UTC' : '') + '</p>'));
    return out.join('');
  }

  function page(H) {
    H.setBar('유럽 국채 위험', '', false);
    if (!DATA) {
      if (failed) return { html: H.card('<div class="empty"><h2>자료를 열지 못했어요</h2></div>') };
      load().then(H.render);
      return { html: H.card('<div class="empty"><h2>유럽 자료를 여는 중</h2></div>') };
    }
    var mounts = [], body;
    if (ST.sub === 'country') body = pageCountry(H, mounts);
    else if (ST.sub === 'daily') body = pageDaily(H, mounts);
    else if (ST.sub === 'model') body = pageModel(H);
    else body = pageHub(H, mounts);
    var src = FROM === 'remote' ? '방금 받은 자료' : FROM === 'cache' ? '저장된 자료' : '앱에 넣어 둔 자료';
    return { html: subNav() + body + (ST.sub !== 'model' && ST.sub !== 'daily' ? '<p class="foot">ESRI v2 · ' + esc(src) + ' · ' + esc(DATA.asOf) + ' 계산 · 통계적 참고용</p>' : ''), mounts: mounts };
  }
  function onAct(act, d, H) {
    switch (act) {
      case 'euSub': ST.sub = d.s; H.render(); root.scrollTo(0, 0); return true;
      case 'euC': ST.c = d.c; H.keep(); return true;
      case 'euGo': ST.c = d.c; ST.sub = 'country'; H.render(); root.scrollTo(0, 0); return true;
      case 'euSpan': ST.span = d.p; H.keep(); return true;
    }
    return false;
  }
  function setState(o) { for (var k in o) ST[k] = o[k]; }
  root.EuropePage = { page: page, onAct: onAct, setState: setState, load: load, data: function () { return DATA; } };
})(window);
