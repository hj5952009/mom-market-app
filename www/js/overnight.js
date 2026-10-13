/* 간밤 세계 시장 요약 — specs/macro1_overnight_brief.md §4 코드를 옮긴 것.
 * 바꾼 점(이유):
 *  - 빼기 부호를 '-' 대신 '−'(U+2212)로 (ux1 3-5 숫자 표기 규칙)
 *  - '공포지수(VIX)' → '미국 불안지수(VIX)' (stocks3 4.3 '공포' 금지어, 4.4 VIX 풀이 '미국 시장 불안 지수')
 * R·F는 KModel.normalize(raw).R, KModel.buildFeatures(R) 결과를 그대로 받는다. */
(function (root) {
  'use strict';

  var OB_INDICATORS = {
    sox:    { main: true,  order: 1, name: '미국 반도체(SOX)',      term: 'sox',    subj: '미국 반도체 주식이',                     doName: '미국 반도체도',      unit: 'pct', sign: +1, w: 0.215, sigmaFix: 2.1 },
    ewyx:   { main: true,  order: 2, name: '미국 속 한국 주식(EWY)', term: 'ewy',    subj: '미국에서 거래된 한국 주식 묶음(EWY)이',  doName: '미국 속 한국 주식도', unit: 'ewy', sign: +1, w: 0.529, sigmaFix: 1.1 },
    ndx:    { main: true,  order: 3, name: '나스닥',                term: 'nasdaq', subj: '미국 나스닥 지수가',                     doName: '나스닥도',           unit: 'pct', sign: +1, w: 0.10,  sigmaFix: 1.35 },
    usdkrw: { main: true,  order: 4, name: '원/달러 환율',           term: 'fx',     subj: '원/달러 환율이',                         doName: '원/달러 환율도',     unit: 'krw', sign: -1, w: 0.139, sigmaFix: 0.45 },
    vix:    { main: true,  order: 5, name: '미국 불안지수(VIX)',     term: 'vix',    subj: '미국 불안지수(VIX)가',                   doName: '불안지수도',         unit: 'vix', sign: -1, w: 0.147, sigmaFix: 7.5 },
    tnx:    { main: false, order: 6, name: '미국 10년 금리',         term: 'govbond', subj: '미국 10년 금리가',                      doName: '미국 10년 금리도',   unit: 'pp',  sign: -1, w: 0.094, sigmaFix: 0.065 },
    mu:     { main: false, order: 7, name: '마이크론',               term: 'semiconductor', subj: '미국 메모리 반도체 회사 마이크론 주가가', doName: '마이크론도', unit: 'pct', sign: +1, w: 0.354, sigmaFix: 3.3 }
  };
  var OB_K_FLAT = 0.20, OB_K_BIG = 1.25;
  var OB_TIEBREAK = ['semis', 'ewyx', 'usdkrw', 'vix', 'ndx', 'tnx'];
  var OB_WHY = {
    sox: '코스피에서 삼성전자·SK하이닉스 같은 반도체 회사 비중이 커서, 미국 반도체 주가가 오르면 다음 날 우리 반도체 주식도 따라 오르는 경우가 많아요.',
    ewyx: '미국 시간에 거래되는 한국 주식 묶음이라, 우리 시장이 문 닫은 사이 해외 투자자들이 한국 주식을 어떻게 봤는지 미리 보여 줘요. 예측 모델이 가장 중요하게 보는 지표예요.',
    ndx: '미국 기술주가 모인 시장이라 세계 주식시장 분위기를 보여 주고, 우리 시장도 대체로 비슷한 방향으로 움직여요.',
    usdkrw: '환율이 오르면(원화 값이 내리면) 외국인 투자자에게 한국 주식의 가치가 줄어 팔고 나가기 쉬워서, 코스피에는 보통 부담이 돼요.',
    vix: '미국 투자자들이 앞으로 얼마나 불안해하는지를 숫자로 나타낸 것이라, 오르면 세계 주식시장이 움츠러드는 경우가 많아요.',
    tnx: '금리가 오르면 예금·채권이 더 매력적이 되고 회사가 돈을 빌리는 부담도 커져서, 주식에는 보통 부담이 돼요.',
    mu: 'SK하이닉스·삼성전자와 같은 메모리 반도체 회사라, 우리 반도체 주식의 흐름을 미리 보여 주는 경우가 많아요.'
  };
  var OB_IMPACT = {
    sox: { up: '삼성전자·SK하이닉스에 좋은 소식이라 {D} 코스피에 힘이 될 수 있어요.', down: '삼성전자·SK하이닉스에 부담이 되는 소식이라 {D} 코스피가 힘을 받기 어려울 수 있어요.' },
    mu: { up: '마이크론은 SK하이닉스·삼성전자와 같은 메모리 반도체 회사라, {D} 우리 반도체 주식과 코스피에 좋은 소식이에요.', down: '마이크론은 SK하이닉스·삼성전자와 같은 메모리 반도체 회사라, {D} 우리 반도체 주식과 코스피에 부담이 될 수 있어요.' },
    ewyx: { up: '해외 투자자들이 밤사이 한국 주식을 좋게 봤다는 뜻이라 {D} 코스피에 힘이 될 수 있어요.', down: '해외 투자자들이 밤사이 한국 주식을 덜 좋게 봤다는 뜻이라 {D} 코스피에 부담이 될 수 있어요.' },
    ndx: { up: '미국 기술주가 올랐다는 뜻이에요. 이런 날 다음 날 우리 시장도 오른 경우가 많았지만, 늘 그렇지는 않았어요.', down: '미국 기술주가 내렸다는 뜻이에요. 이런 날 다음 날 우리 시장도 힘이 약했던 경우가 많았지만, 늘 그렇지는 않았어요.' },
    usdkrw: { up: '원화 값이 내렸다는 뜻이라, 외국인 투자자들이 한국 주식을 팔고 나갈 수 있어 {D} 코스피에 부담이 될 수 있어요.', down: '원화 값이 올랐다는 뜻이라, 외국인 투자자들이 한국 주식을 사기 좋아져 {D} 코스피에 힘이 될 수 있어요.' },
    vix: { up: '투자자들의 불안이 커졌다는 뜻이라 {D} 코스피에 부담이 될 수 있어요.', down: '투자자들의 불안이 줄었다는 뜻이라 {D} 코스피에 힘이 될 수 있어요.' },
    tnx: { up: '금리가 오르면 주식의 매력이 줄어드는 경향이 있어 {D} 코스피에 조금 부담이 될 수 있어요.', down: '금리가 내리면 주식의 매력이 커지는 경향이 있어 {D} 코스피에 조금 힘이 될 수 있어요.' }
  };
  var OB_MOOD = {
    2: '전체적으로 {D} 코스피에 힘이 될 수 있는 분위기예요.',
    1: '전체적으로는 {D} 코스피에 조금 힘이 될 수 있는 분위기예요.',
    0: '다른 지표까지 함께 보면 {D} 코스피 방향은 뚜렷하지 않아요.',
    '-1': '전체적으로는 {D} 코스피에 조금 부담이 될 수 있는 분위기예요.',
    '-2': '전체적으로 {D} 코스피에 부담이 될 수 있는 분위기예요.'
  };
  var OB_CONFLICT_END = {
    1: '좋은 소식과 부담이 되는 소식이 섞였지만, 다른 지표까지 함께 보면 힘이 되는 쪽이 조금 더 커 보여요.',
    0: '좋은 소식과 부담이 되는 소식이 섞여 있어, {D} 코스피 방향은 뚜렷하지 않아요.',
    '-1': '좋은 소식과 부담이 되는 소식이 섞였지만, 다른 지표까지 함께 보면 부담이 되는 쪽이 조금 더 커 보여요.'
  };
  var OB_DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var MINUS = '−';

  function obFmt(x, d) {
    d = d || 0;
    if (!isFinite(x)) return '';
    var s = Math.abs(x).toFixed(d), parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (x < 0 ? MINUS : '') + parts.join('.');
  }
  function obAmt(a, unitWord) {
    if (unitWord === '%' && a < 1) return a < 0.05 ? '0.1% 미만' : a.toFixed(1) + '%';
    var f = Math.floor(a), fr = a - f;
    if (fr < 0.2) return '약 ' + f + unitWord;
    if (fr >= 0.8) return (f + 1) + unitWord + ' 가까이';
    return f + unitWord + ' 넘게';
  }
  function obSigned(s) {
    var u = OB_INDICATORS[s.key].unit, d = u === 'krw' ? 0 : u === 'pp' ? 2 : 1;
    var r = +s.disp.toFixed(d), sg = r > 0 ? '+' : r < 0 ? MINUS : '';
    var body = u === 'krw' ? obFmt(Math.abs(r)) : Math.abs(r).toFixed(d);
    return sg + body + (u === 'krw' ? '원' : u === 'pp' ? '%포인트' : '%');
  }
  function obAmount(s) {
    var u = OB_INDICATORS[s.key].unit, a = Math.abs(s.disp);
    var pre = s.sessions >= 2 ? '모두 합쳐 ' : '';
    if (u === 'krw') return pre + obAmt(a, '원');
    if (u === 'pp') return pre + a.toFixed(2) + '%포인트';
    return pre + obAmt(a, '%');
  }
  function obVixMood(v) { return v >= 30 ? '매우 불안' : v >= 20 ? '불안한 편' : v >= 15 ? '보통' : '차분한 편'; }

  function obVerb(s) {
    var L = s.level, A = obAmount(s), S = obSigned(s), u = OB_INDICATORS[s.key].unit, lv;
    var base = s.ewyBase || '어제 코스피';
    if (u === 'ewy') return { 2: base + '보다 ' + A + ' 더 강했어요', 1: base + '보다 조금 더 강했어요(' + S + ')', 0: base + '와 거의 같았어요(' + S + ')', '-1': base + '보다 조금 더 약했어요(' + S + ')', '-2': base + '보다 ' + A + ' 더 약했어요' }[L];
    if (u === 'krw') {
      lv = '1달러에 ' + obFmt(Math.round(s.last)) + '원';
      return { 2: A + ' 올라 ' + lv + ' 수준이에요(원화 값 내림)', 1: '조금 올라 ' + lv + ' 수준이에요(' + S + ')', 0: lv + '으로 거의 그대로였어요', '-1': '조금 내려 ' + lv + ' 수준이에요(' + S + ')', '-2': A + ' 내려 ' + lv + ' 수준이에요(원화 값 오름)' }[L];
    }
    if (u === 'vix') {
      lv = s.last.toFixed(0);
      return { 2: A + ' 올라 ' + lv + ' 수준이에요', 1: '조금 올라 ' + lv + ' 수준이에요(' + S + ')', 0: lv + ' 수준으로 거의 그대로였어요', '-1': '조금 내려 ' + lv + ' 수준이에요(' + S + ')', '-2': A + ' 내려 ' + lv + ' 수준이에요' }[L];
    }
    if (u === 'pp') {
      lv = s.last.toFixed(2) + '%';
      return { 2: A + ' 올라 ' + lv + ' 수준이에요', 1: '조금 올라 ' + lv + ' 수준이에요(' + S + ')', 0: lv + ' 수준으로 거의 그대로였어요', '-1': '조금 내려 ' + lv + ' 수준이에요(' + S + ')', '-2': A + ' 내려 ' + lv + ' 수준이에요' }[L];
    }
    return { 2: A + ' 올랐어요', 1: '조금 올랐어요(' + S + ')', 0: '거의 그대로였어요(' + S + ')', '-1': '조금 내렸어요(' + S + ')', '-2': A + ' 내렸어요' }[L];
  }

  function obClassify(s) {
    var cfg = OB_INDICATORS[s.key];
    var sig = (s.sigma != null ? s.sigma : cfg.sigmaFix) * Math.sqrt(Math.min(Math.max(s.sessions, 1), 4));
    var z = s.disp / sig;
    var zz = cfg.unit === 'krw' ? s.pct / sig : z;
    var a = Math.abs(zz);
    s.z = zz;
    s.level = a < OB_K_FLAT ? 0 : (a >= OB_K_BIG ? 2 : 1) * Math.sign(zz);
    s.score = s.level === 0 ? 0 : cfg.sign * cfg.w * Math.max(-4, Math.min(4, zz));
    s.impact = s.level === 0 ? 0 : Math.sign(s.score);
    return s;
  }

  function overnightBrief(changes) {
    var C = changes, D = C.krClosedToday ? '다음 거래일' : '오늘';
    var fill = function (t) { return t.replace('{D}', D); };
    var S = {};
    Object.keys(OB_INDICATORS).forEach(function (k) {
      var s = C.series[k];
      if (s && s.status === 'ok') S[k] = obClassify(Object.assign({}, s, { key: k }));
    });
    var items = Object.keys(OB_INDICATORS).sort(function (a, b) { return OB_INDICATORS[a].order - OB_INDICATORS[b].order; }).map(function (k) {
      var cfg = OB_INDICATORS[k], raw = C.series[k] || { status: 'missing' }, s = S[k];
      // 검수 S1: SOX와 마이크론이 반대로 움직였으면 마이크론도 기본 목록에 보여 준다(묶음 점수가 상쇄된 이유가 보이게)
      var muSplit = k === 'mu' && S.sox && S.mu && S.sox.level * S.mu.level < 0;
      var it = { key: k, name: cfg.name, term: cfg.term, main: cfg.main || muSplit, why: OB_WHY[k] };
      if (!s) {
        return Object.assign(it, { valueText: '', changeText: raw.status === 'closed' ? '어젯밤 거래 없음(휴장)' : '자료 없음', direction: 'none', level: null, levelText: '', arrow: '–', color: 'gray', impact: 'none', impactText: '' });
      }
      var dir = s.level > 0 ? 'up' : s.level < 0 ? 'down' : 'flat';
      it.valueText = cfg.unit === 'krw' ? obFmt(Math.round(s.last)) + '원'
        : cfg.unit === 'vix' ? s.last.toFixed(1) + ' (' + obVixMood(s.last) + ')'
          : cfg.unit === 'pp' ? s.last.toFixed(2) + '%'
            : cfg.unit === 'ewy' ? '' : obFmt(s.last, 0);
      it.changeText = cfg.unit === 'ewy' ? (s.ewyBase || '어제 코스피') + '보다 ' + obSigned(s) : obSigned(s);
      it.signed = obSigned(s);
      if (s.sessions >= 2) it.changeText += ' (미국 ' + s.sessions + '일 합계)';
      it.direction = dir; it.level = s.level;
      it.levelText = (cfg.unit === 'ewy'
        ? { 2: '크게 강함', 1: '조금 강함', 0: '비슷함', '-1': '조금 약함', '-2': '크게 약함' }
        : { 2: '크게 오름', 1: '조금 오름', 0: '보합', '-1': '조금 내림', '-2': '크게 내림' })[s.level];
      it.arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
      it.color = dir === 'up' ? 'red' : dir === 'down' ? 'blue' : 'gray';
      it.impact = s.impact > 0 ? 'plus' : s.impact < 0 ? 'minus' : 'none';
      it.impactText = s.impact > 0 ? '코스피에 힘' : s.impact < 0 ? '코스피에 부담' : '영향 적음';
      if (cfg.unit === 'ewy' && s.level !== 0) it.changeText += s.level > 0 ? ' 강함' : ' 약함';
      return it;
    });

    var sentences = [];
    if (C.krClosedToday) sentences.push('오늘은 한국 시장이 쉬는 날이에요' + (C.krHolidayName ? '(' + C.krHolidayName + ')' : '') + '.');

    if (C.usStatus === 'holiday' || C.usStatus === 'missing') {
      if (C.usStatus === 'holiday') sentences.push((C.usHolidayLabel || '어젯밤에는') + ' 미국 시장이 쉬었어요' + (C.usHolidayName ? '(' + C.usHolidayName + ')' : '') + '.');
      else sentences.push('미국 시장의 새 자료가 아직 없어요(휴일이었거나 자료가 늦게 들어오고 있어요).');
      var k0 = S.usdkrw;
      if (k0 && k0.level !== 0) sentences.push('원/달러 환율은 ' + obVerb(k0) + '.');
      else sentences.push('그래서 해외에서 새로 전해진 큰 소식이 적어요.');
      sentences.push(D + ' 코스피는 우리 시장 안의 소식에 더 많이 좌우될 수 있어요.');
      return { sentences: sentences, items: items, mood: null, lead: null };
    }

    var groups = {};
    var add = function (g, s) { if (s) (groups[g] = groups[g] || []).push(s); };
    add('semis', S.sox); add('semis', S.mu);
    ['ewyx', 'ndx', 'usdkrw', 'vix', 'tnx'].forEach(function (k) { add(k, S[k]); });
    var G = Object.keys(groups).map(function (g) {
      var arr = groups[g];
      var score = arr.reduce(function (t, s) { return t + s.score; }, 0);
      var soxOk = g === 'semis' && arr.filter(function (s) { return s.key === 'sox' && s.level !== 0 && Math.sign(s.score) === Math.sign(score); })[0];
      var rep = soxOk || arr.slice().sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); })[0];
      var big = arr.some(function (s) { return Math.abs(s.level) === 2 && Math.sign(s.score) === Math.sign(score); });
      return { g: g, score: score, rep: rep, big: big, notable: score !== 0 && (Math.abs(score) >= 0.15 || big) };
    });
    var total = G.reduce(function (t, x) { return t + x.score; }, 0);
    var mood;
    if (C.modelPUp != null) {
      var p = C.modelPUp;
      mood = p >= 0.65 ? 2 : p >= 0.60 ? 1 : p > 0.40 ? 0 : p > 0.35 ? -1 : -2;
    } else {
      mood = total >= 0.5 ? 2 : total >= 0.25 ? 1 : total > -0.25 ? 0 : total > -0.5 ? -1 : -2;
    }
    var moodSign = Math.sign(mood);

    var tb = function (g) { return OB_TIEBREAK.indexOf(g); };
    var ranked = G.filter(function (x) { return x.score !== 0; }).sort(function (a, b) {
      var d = Math.abs(b.score) - Math.abs(a.score);
      return Math.abs(d) > 0.02 ? d : tb(a.g) - tb(b.g);
    });
    var T = C.timeLabel || '어젯밤';
    if (ranked[0] && ranked[0].g === 'ewyx') {
      var se = ranked.filter(function (x) { return x.g === 'semis' && Math.sign(x.score) === Math.sign(ranked[0].score) && x.big && Math.abs(x.score) >= 0.6 * Math.abs(ranked[0].score); })[0];
      if (se) { ranked.splice(ranked.indexOf(se), 1); ranked.unshift(se); }
    }
    var lead = ranked[0];
    // 검수 S1: 묶음 점수가 상쇄돼도 '크게' 움직인 지표는 빼먹지 않는다
    var bigItems = Object.keys(S).map(function (k) { return S[k]; }).filter(function (x) { return Math.abs(x.level) === 2 && x.score !== 0; })
      .sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); });
    if ((!lead || (Math.abs(lead.score) < 0.12 && !lead.big)) && bigItems.length) {
      var bi = bigItems[0];
      lead = { g: bi.key === 'sox' || bi.key === 'mu' ? 'semis' : bi.key, score: bi.score, rep: bi, big: true, notable: true };
    }

    if (!lead || (Math.abs(lead.score) < 0.12 && !lead.big)) {
      sentences.push(T + ' 세계 시장은 대체로 조용했어요.');
      var bits = [];
      if (S.sox) bits.push('미국 반도체(' + obSigned(S.sox) + ')');
      if (S.usdkrw) bits.push('원/달러 환율(' + obSigned(S.usdkrw) + ')');
      if (bits.length) sentences.push(bits.join('와 ') + ' 모두 큰 움직임이 없었어요.');
      sentences.push(mood === 0 ? D + ' 코스피는 해외 소식보다 우리 시장 안의 소식에 따라 움직일 수 있어요.' : fill(OB_MOOD[mood]));
      return { sentences: sentences, items: items, mood: mood, lead: null };
    }

    var L = lead.rep, Ls = Math.sign(L.score) || Math.sign(lead.score);   // 문장에 쓰는 지표의 방향을 따른다
    var s1 = T + ' ' + OB_INDICATORS[L.key].subj + ' ' + obVerb(L);
    if (lead.g === 'semis') {
      var other = L.key === 'sox' ? S.mu : S.sox;
      if (other && L.key === 'sox' && Math.abs(other.level) === 2 && Math.sign(other.level) === Math.sign(L.level)) s1 += '(마이크론 ' + obSigned(other) + ')';
      if (other && L.key === 'mu') s1 += '(미국 반도체 전체 ' + obSigned(other) + ')';
    }
    sentences.push(s1 + '.');
    var impactOf = function (s) { return fill(OB_IMPACT[s.key][s.level > 0 ? 'up' : 'down']); };

    var opp = ranked.filter(function (x) { return x !== lead && Math.sign(x.score) === -Ls && x.notable && Math.abs(x.score) >= 0.4 * Math.abs(lead.score); })[0];
    var oppRep = opp ? opp.rep : null;
    if (oppRep && Math.sign(oppRep.score) !== -Ls) oppRep = null;
    if (!oppRep) {   // 검수 S1: '크게' 움직인 지표가 리드와 반대쪽이면 반드시 '반면'으로 함께 말한다
      oppRep = bigItems.filter(function (x) { return x.key !== L.key && Math.sign(x.score) === -Ls; })[0] || null;
    }
    if (oppRep) {
      sentences.push('반면 ' + OB_INDICATORS[oppRep.key].subj + ' ' + obVerb(oppRep) + '.');
      sentences.push(fill(OB_CONFLICT_END[moodSign]));
      return { sentences: sentences, items: items, mood: mood, lead: L.key, conflict: oppRep.key };
    }
    sentences.push(impactOf(L));
    if (moodSign !== 0 && moodSign === -Ls) {
      sentences.push('다만 다른 지표까지 함께 보면 ' + D + ' 코스피에는 ' + (moodSign > 0 ? '힘이 되는' : '부담이 되는') + ' 쪽이 조금 더 커 보여요.');
    } else {
      var n2 = ranked.filter(function (x) { return x !== lead && Math.sign(x.score) === Ls && x.notable; })[0];
      if (n2) sentences.push(OB_INDICATORS[n2.rep.key].doName + ' ' + (Ls > 0 ? '힘을 보태는' : '부담을 더하는') + ' 쪽이었어요(' + obSigned(n2.rep) + ').');
      else if (Math.abs(mood) === 2 || mood === 0) sentences.push(fill(OB_MOOD[mood]));
    }
    return { sentences: sentences, items: items, mood: mood, lead: L.key };
  }

  // ---------------------------------------------------------------- 변화 계산 (모델과 같은 창)
  var OB_US_HOLIDAYS = {
    '2026-01-01': '새해 첫날', '2026-01-19': '마틴 루서 킹 기념일', '2026-02-16': '대통령의 날', '2026-04-03': '성금요일',
    '2026-05-25': '메모리얼 데이', '2026-06-19': '준틴스', '2026-07-03': '독립기념일 대체휴일', '2026-09-07': '노동절',
    '2026-11-26': '추수감사절', '2026-12-25': '크리스마스',
    '2027-01-01': '새해 첫날', '2027-01-18': '마틴 루서 킹 기념일', '2027-02-15': '대통령의 날', '2027-03-26': '성금요일',
    '2027-05-31': '메모리얼 데이', '2027-06-18': '준틴스 대체휴일', '2027-07-05': '독립기념일 대체휴일', '2027-09-06': '노동절',
    '2027-11-25': '추수감사절', '2027-12-24': '크리스마스 대체휴일'
  };
  // KRX 휴장일: util.js의 KRX_HOLIDAYS를 같이 쓴다(한 곳에서 관리).
  var OB_KST = 9 * 3600e3;
  function obDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function obAddDays(d, n) { return obDay(Date.parse(d + 'T00:00:00Z') + n * 864e5); }
  function obDow(d) { return new Date(d + 'T00:00:00Z').getUTCDay(); }
  function obLastBefore(arr, d) { var lo = 0, hi = arr.length - 1, ans = -1; while (lo <= hi) { var m = (lo + hi) >> 1; if (arr[m].d < d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; }
  function obStd(xs) { var n = xs.length; if (n < 20) return null; var m = xs.reduce(function (a, b) { return a + b; }, 0) / n; return Math.sqrt(xs.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n - 1)); }
  function krHolidays() { return (root.MCUtil && root.MCUtil.KRX_HOLIDAYS) || {}; }

  function computeOvernightChanges(R, F, nowMs, modelPUp) {
    if (modelPUp === undefined) modelPUp = null;
    var KRH = krHolidays();
    var kstNow = new Date(nowMs + OB_KST);
    var todaySeoul = obDay(nowMs + OB_KST);
    var cutoff = kstNow.getUTCHours() < 7 ? obAddDays(todaySeoul, -1) : todaySeoul;
    var K = R.kospi, ip = obLastBefore(K, cutoff);
    var dp = K[ip].d;
    var k1 = Math.log(K[ip].c / K[ip - 1].c);
    var krClosedToday = obDow(cutoff) === 0 || obDow(cutoff) === 6 || !!KRH[cutoff];
    var out = { cutoff: cutoff, dp: dp, krClosedToday: krClosedToday, krHolidayName: KRH[cutoff] || null, modelPUp: modelPUp, series: {} };

    var win = function (key) {
      var A = R[key]; if (!A || !A.length) return null;
      var j1 = obLastBefore(A, cutoff), j0 = obLastBefore(A, dp);
      if (j1 < 0 || j0 < 0) return null; return { A: A, j0: j0, j1: j1, n: j1 - j0 };
    };
    var sigmaOf = function (fk, mult, fallback) {
      if (!F || !F.length) return fallback;
      var all = obStd(F.map(function (r) { return r[fk]; }).filter(isFinite));
      var rec = obStd(F.slice(-60).map(function (r) { return r[fk]; }).filter(isFinite));
      if (!all) return fallback;
      var s = Math.min(Math.max(rec != null ? rec : all, all), 1.5 * all); return s * mult;
    };
    var mk = function (w, extra) { return w == null ? { status: 'missing' } : w.n === 0 ? { status: 'closed', sessions: 0 } : Object.assign({ status: 'ok', sessions: w.n }, extra); };

    ['sox', 'ndx', 'mu'].forEach(function (k) {
      var w = win(k);
      out.series[k] = mk(w, w && { last: w.A[w.j1].c, prev: w.A[w.j0].c, pct: 100 * (w.A[w.j1].a / w.A[w.j0].a - 1), sigma: sigmaOf(k, 100, OB_INDICATORS[k].sigmaFix) });
      if (out.series[k].status === 'ok') out.series[k].disp = out.series[k].pct;
    });
    (function () {
      var w = win('vix');
      out.series.vix = mk(w, w && { last: w.A[w.j1].c, prev: w.A[w.j0].c, pct: 100 * (w.A[w.j1].c / w.A[w.j0].c - 1), sigma: sigmaOf('vix', 100, 7.5) });
      if (out.series.vix.status === 'ok') out.series.vix.disp = out.series.vix.pct;
    })();
    (function () {
      var w = win('usdkrw');
      out.series.usdkrw = mk(w, w && { last: w.A[w.j1].c, prev: w.A[w.j0].c, pct: 100 * (w.A[w.j1].c / w.A[w.j0].c - 1), disp: w.A[w.j1].c - w.A[w.j0].c, sigma: sigmaOf('usdkrw', 100, 0.45) });
    })();
    (function () {
      var w = win('tnx');
      if (w && w.n > 0) {
        var sc = w.A[w.j1].c > 20 ? 0.1 : 1;
        out.series.tnx = { status: 'ok', sessions: w.n, last: w.A[w.j1].c * sc, prev: w.A[w.j0].c * sc, disp: (w.A[w.j1].c - w.A[w.j0].c) * sc, sigma: sigmaOf('tnx', sc, 0.065) };
        out.series.tnx.pct = out.series.tnx.disp;
      } else out.series.tnx = mk(w);
    })();
    (function () {
      var we = win('ewy'), wk = win('usdkrw');
      if (we && wk && we.n > 0 && wk.n > 0) {
        var ewy = Math.log(we.A[we.j1].a / we.A[we.j0].a), fx = Math.log(wk.A[wk.j1].c / wk.A[wk.j0].c);
        var x = ewy - (k1 - fx);
        out.series.ewyx = { status: 'ok', sessions: we.n, pct: 100 * x, disp: 100 * x, last: null, sigma: sigmaOf('ewyx', 100, 1.1), ewyBase: dp === obAddDays(cutoff, -1) ? '어제 코스피' : '지난 ' + OB_DOW[obDow(dp)] + '요일 코스피' };
      } else out.series.ewyx = (we && we.n === 0) ? { status: 'closed', sessions: 0 } : { status: 'missing' };
    })();

    var wn = win('ndx');
    var expected = [];
    for (var d = dp; d < cutoff; d = obAddDays(d, 1)) { var wd = obDow(d); if (wd >= 1 && wd <= 5) expected.push(d); }
    var usOpenDays = expected.filter(function (x) { return !OB_US_HOLIDAYS[x]; });
    var hol = expected.filter(function (x) { return OB_US_HOLIDAYS[x]; })[0];
    var dayWord = function (x) { return x === obAddDays(cutoff, -1) ? '어젯밤에는' : '지난 ' + OB_DOW[obDow(x)] + '요일에는'; };
    if (!wn) out.usStatus = 'missing';
    else if (wn.n === 0) {
      out.usStatus = usOpenDays.length === 0 && hol ? 'holiday' : 'missing';
      if (hol) { out.usHolidayName = OB_US_HOLIDAYS[hol]; out.usHolidayLabel = dayWord(hol); }
    } else out.usStatus = 'ok';
    if (wn && wn.n >= 2) out.timeLabel = '한국 시장이 쉬는 동안';
    else if (wn && wn.n === 1) {
      var ud = wn.A[wn.j1].d;
      out.timeLabel = ud === obAddDays(cutoff, -1) ? '어젯밤' : '지난 ' + OB_DOW[obDow(ud)] + '요일 밤';
      out.usDate = ud;
    }
    if (wn && wn.j1 >= 0) out.usDate = wn.A[wn.j1].d;
    return out;
  }

  var Overnight = { overnightBrief: overnightBrief, computeOvernightChanges: computeOvernightChanges, OB_INDICATORS: OB_INDICATORS, OB_US_HOLIDAYS: OB_US_HOLIDAYS };
  root.Overnight = Overnight;
  if (typeof module !== 'undefined' && module.exports) module.exports = Overnight;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
