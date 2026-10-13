/* 순수 문구·규칙 모듈 단위 테스트 — node test/run-unit.js
 * fixture(실제 모델 결과)와 경계 사례로 확인한다. */
'use strict';
const fs = require('fs');
const path = require('path');
const W = path.join(__dirname, '..', 'www');
global.window = undefined;
const U = require(path.join(W, 'js/util.js'));
global.MCUtil = U;
const Reading = require(path.join(W, 'js/reading.js'));
global.Reading = Reading;
const Overnight = require(path.join(W, 'js/overnight.js'));
const Context = require(path.join(W, 'js/context.js'));
const Holdings = require(path.join(W, 'js/holdings.js'));
const Content = require(path.join(W, 'js/content.js'));
const KModel = require(path.join(W, 'js/model.js'));

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b }); }
function section(s) { console.log('• ' + s); }

// ------------------------------------------------------------------ 금지어 (stocks3 4장 + stocks1 2-6 + stocks2 §3 + macro1/2)
const BANNED = [
  '매수 추천', '매도 추천', '추천 종목', '사세요', '파세요', '매수 타이밍', '매도 타이밍', '살 때', '팔 때', '매수 신호', '매도 신호', '시그널',
  '들어가세요', '탈출하세요', '손절', '저가 매수', '줍줍', '물타기', '비중 확대', '비중 축소', '목표가',
  '확실', '틀림없이', '무조건', '반드시', '100%', '보장', '적중률 높은', '잘 맞는', '정확한 예측', '정답', '오를 것입니다', '내릴 것입니다',
  '바닥', '꼭지', '천장', '대박', '떡상', '급등', '로켓', '폭락', '폭등', '떡락', '패닉', '공포', '위험!', '경고!', '주의!',
  '놓치면 후회', '마지막 기회', '지금 아니면', '반등', '곧 회복', '개미', '세력', '기회', '담으세요', '정리하세요', '추천', '붕괴', '안전해요', '걱정 마세요',
  '매수', '매도', '존버', '거의 확실'
];
// 허용 목록: 뉴스 용어 풀이(용어 이름 자체)만. 이유는 content.js 주석 참고.
const ALLOW = [/외국인 매수·매도/, /외국인 순매수/, /외국인 순매도/, /'순매수'/, /'순매도'/, /'공포지수'/, /공포지수/];
function bannedIn(text) {
  let t = String(text);
  ALLOW.forEach(a => { t = t.replace(new RegExp(a.source, 'g'), ''); });
  return BANNED.filter(w => t.indexOf(w) >= 0);
}
function scan(name, value) {
  const hits = new Set();
  (function walk(v) {
    if (v == null) return;
    if (typeof v === 'string') bannedIn(v).forEach(h => hits.add(h + ' ← ' + v.slice(0, 60)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.values(v).forEach(walk);
  })(value);
  ok('금지어 없음: ' + name, hits.size === 0, [...hits]);
}

// ------------------------------------------------------------------ fixture
const fxRaw = JSON.parse(fs.readFileSync(path.join(W, 'demo/fixture.json'), 'utf8'));
const cols = fxRaw._historyColumns;
const R = Object.assign({}, fxRaw, {
  history: fxRaw.history.map(r => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); o.in80 = !!o.in80; o.in95 = !!o.in95; return o; })
});

section('model.js는 검증된 원본 그대로');
eq('model.js sha256', require('crypto').createHash('sha256').update(fs.readFileSync(path.join(W, 'js/model.js'))).digest('hex'), '311f40f930295ea1bec82d13fa860153dfbff12092de493fa0ab0f59079f12b1');

section('util');
eq('signPct 음수 기호', U.signPct(-6.517), '−6.5%');
eq('signPct 0', U.signPct(0.004), '0.0%');
eq('fmtInt', U.fmtInt(6035.35), '6,035');
eq('round10 일반 반올림', [U.round10(5642), U.round10(6516), U.round10(5384), U.round10(6695), U.round10(6035.35)], [5640, 6520, 5380, 6700, 6040]);
eq('날짜 표기', U.fmtDateLong('2026-10-14'), '10월 14일 (수)');
eq('다음 거래일(주말)', U.nextTradingDay('2026-10-16'), '2026-10-19');
eq('다음 거래일(크리스마스)', U.nextTradingDay('2026-12-24'), '2026-12-28');
eq('다음 거래일(연말·신정)', U.nextTradingDay('2026-12-30'), '2027-01-04');
eq('시각', U.fmtTime(Date.parse('2026-10-13T23:41:00Z')), '오전 8:41');
eq('조사', [U.josa('삼성전자', '은', '는'), U.josa('NAVER', '은', '는'), U.josa('HLB', '이', '가'), U.josa('KODEX 200', '은', '는')], ['는', '는', '가', '은']);
eq('초성', U.chosung('삼성전자'), 'ㅅㅅㅈㅈ');

section('reading: 방향 (stocks1 / stats2 / DECISIONS)');
eq('upOutOf10 표', [0.601, 0.599, 0.70, 0.45, 0.40, 0.31, 0.30, 0.95, 0.05].map(Reading.upOutOf10), [6, 5, 7, 5, 4, 4, 3, 9, 1]);
eq('upPct 50쪽 자르기', [0.597, 0.601, 0.403, 0.5].map(Reading.upPctOf), [59, 60, 41, 50]);
const vFix = Reading.verdict(R, { isFinal: false, dayWord: '내일', periodLabel: '지난 1년 반' });
eq('fixture 칩', vFix.chip.text, '오를 쪽');
eq('fixture 헤드라인', vFix.headline, '오를 가능성이 조금 더 높아요');
eq('fixture 확률 줄', vFix.probLine, '오를 확률 60% (10번 중 6번)');
eq('미리 보기에는 맞힌 비율 없음', vFix.hitLine, '미국 장이 끝난 뒤 아침에 다시 계산해요. 지금은 미리 보기예요.');
const hit = p => Reading.verdict({ pUp: p }, { isFinal: true, periodLabel: '지난 1년 반' }).hitLine;
eq('0.60 → 6번', hit(0.60), '이런 날 예측은 지난 1년 반 동안 10번 중 6번 정도 맞았어요.');
eq('0.6499 → 6번', hit(0.6499).includes('6번'), true);
eq('0.65 → 7번', hit(0.65).includes('7번'), true);
eq('0.70 → 8번', hit(0.70).includes('8번'), true);
eq('0.35 → 7번 (내릴 쪽)', hit(0.35).includes('7번'), true);
eq('0.3501 → 6번', hit(0.3501).includes('6번'), true);
eq('0.30 → 8번', hit(0.30).includes('8번'), true);
eq('0.55 → 반반', hit(0.55), '오를지 내릴지는 반반에 가까워요(방향은 알기 어려워요).');
const vDown = Reading.verdict({ pUp: 0.32 }, { isFinal: true });
eq('내릴 쪽 칩/확률', [vDown.chip.text, vDown.probLine, vDown.headline], ['내릴 쪽', '내릴 확률 68% (10번 중 6번)', '내릴 가능성이 높은 편이에요']);
eq('반반 헤드라인(내일)', Reading.verdict({ pUp: 0.52 }, { dayWord: '내일' }).headline, '내일은 방향을 알기 어려워요');
eq('기간 말', [Reading.periodLabel('2025-01-01', '2026-10-13'), Reading.periodLabel('2025-01-01', '2025-08-01'), Reading.periodLabel('2025-01-01', '2027-01-10')], ['지난 1년 반', '지난 7개월', '지난 2년']);

section('reading: 범위 (stats2 기하, DECISIONS 반올림)');
const rv = Reading.rangeView(R, { dayWord: '내일', prevWord: '오늘', baseWord: '오늘', prev: R.yesterday, recentMedW95: Reading.recentMedW95(R.history) });
eq('반올림된 범위', [rv.s.lo80, rv.s.hi80, rv.s.lo95, rv.s.hi95, rv.s.center], ['5,640', '6,520', '5,380', '6,700', '6,090']);
eq('어제보다 %', [rv.pct.lo80, rv.pct.hi80], ['−6.5%', '+8.0%']);
eq('눈금 ±15%', rv.S, 15);
const dp = x => +(16 + x / 100 * 328).toFixed(1);
eq('stats2 2.4 좌표(dp)', [dp(rv.geo.lo95), dp(rv.geo.lo80), dp(rv.geo.base), dp(rv.geo.center), dp(rv.geo.hi80), dp(rv.geo.hi95)], [62.0, 108.7, 180.0, 189.9, 267.1, 299.5]);
eq('조용한 날 눈금 ±10%', Reading.scaleS(2533, 2533 * 0.98, 2533 * 1.02), 10);
eq('출렁임 매우 큼', [rv.vol, rv.volBadge], ['very_high', '출렁임 매우 큼']);
eq('넓어진 이유 A', rv.noteLine, '오늘 예상보다 크게 움직여서, 내일은 범위를 넓게 잡았어요.');
ok('15% 이상 넓은 날 한 줄', rv.wideLine && rv.wideLine.indexOf('앞일을 내다보기 어려운') > 0);
const rvB = Reading.rangeView(R, { prev: { lo95: 5000, hi95: 7000, prevClose: 6000, actual: 6200 } });
eq('넓어진 이유 B', rvB.noteLine, '어제 +3.3% 크게 움직여서 오늘 범위도 넓어요.');
eq('조용한 날 출렁임 평소', Reading.rangeView({ baseClose: 2500, center: 2505, ranges: { '0.8': [2470, 2540], '0.95': [2450, 2560] } }).vol, 'normal');
const L = Reading.placeLabels([100, 110], [50, 50], 300, 8);
ok('라벨 겹침 벌리기', L[1] - (L[0] + 50) >= 7.99, L);
const L2 = Reading.placeLabels([5, 295], [50, 50], 300, 8);
eq('라벨 안쪽 밀기', L2, [0, 250]);

section('reading: 어제 예상 (stocks1 3장)');
const yc = Reading.yesterdayCheck(R.yesterday, { N: 431, miss: 22 });
eq('fixture 10/13 판정', [yc.verdict, yc.big], ['OUT', '이번엔 예상을 벗어났어요']);
ok('17포인트 더 내렸어요', yc.small.indexOf('6,052~6,687)보다 17포인트 더 내렸어요. 실제 마감 6,035.') >= 0, yc.small);
eq('반반 예측은 방향 줄 없음(pUp 0.48)', yc.dirLine, null);
const yIn = Reading.yesterdayCheck({ lo80: 100, hi80: 120, lo95: 90, hi95: 130, prevClose: 105, actual: 110, pUp: 0.66 });
eq('IN80 + 방향 맞음', [yIn.verdict, yIn.dirLine], ['IN80', '오를 거라는 쪽도 맞았어요.']);
const y95 = Reading.yesterdayCheck({ lo80: 100, hi80: 120, lo95: 90, hi95: 130, prevClose: 105, actual: 95, pUp: 0.7 });
eq('IN95 + 방향 틀림', [y95.verdict, y95.dirLine], ['IN95', '오를 거라는 쪽은 틀렸어요.']);
const rs20 = Reading.recentSummary(R.history);
eq('최근 20일 (원래 값 기준 80% 11, 95% 17 — stats2 3.3)', [rs20.k80, rs20.k95], [11, 17]);

section('reading: 자체 점검 (stats2 4)');
const sc = Reading.selfCheck(R.history, {}, '2026-10-13');
eq('최근 60일 95% 이탈 4일 → 안내 없음', [sc.miss95, sc.showing], [4, false]);
const bad = R.history.slice(-60).map((h, i) => Object.assign({}, h, { in95: i % 6 !== 0 }));
const sc2 = Reading.selfCheck(bad, {}, '2026-10-13');
eq('이탈 10일 → 안내 켜짐', [sc2.miss95, sc2.showing, sc2.since], [10, true, '2026-10-13']);
const sc3 = Reading.selfCheck(R.history, { showing: true, since: '2026-10-12' }, '2026-10-13');
eq('회복해도 5거래일 전엔 유지', sc3.showing, true);
const sc4 = Reading.selfCheck(R.history, { showing: true, since: '2026-09-01' }, '2026-10-13');
eq('회복 + 5거래일 지나면 끔', sc4.showing, false);
eq('60일 미만이면 점검 안 함', Reading.selfCheck(R.history.slice(-30), {}, '2026-10-13').miss95, null);

section('reading: 안전장치 (stocks3)');
const gPanic = Reading.guardHome({ kospiRet1: -5.46, kospiRet5: -11, upPct: 60, isFinal: false, stats: R.stats }, {}, '2026-10-13');
eq('−5.5% 다음 날 → 공포 카드', gPanic && gPanic.id, 'panic');
eq('알겠어요 누른 날은 아무 카드도 없음', Reading.guardHome({ kospiRet1: -5.46, upPct: 72, stats: R.stats }, { dismissedOn: { home: '2026-10-13' } }, '2026-10-13'), null);
const gs7 = { shows: { panic: ['2026-10-08', '2026-10-10'] } };
const gNext = Reading.guardHome({ kospiRet1: -5, upPct: 72, isFinal: true, stats: R.stats }, gs7, '2026-10-13');
eq('7일에 2번 넘으면 다음 순위(숫자 과신)', gNext && gNext.id, 'overtrust');
ok('숫자 과신 카드 숫자는 모델 dirTiers', gNext.body.indexOf('103번 중 87번 맞고 16번 틀렸어요') >= 0 && gNext.body.indexOf('4일에 1번꼴') >= 0, gNext.body);
const g65 = Reading.guardHome({ kospiRet1: 0.2, upPct: 66, isFinal: true, stats: R.stats }, {}, '2026-10-13');
ok('65~70%: 163번 중 131번', g65 && g65.body.indexOf('163번 중 131번 맞고 32번 틀렸어요') >= 0, g65 && g65.body);
eq('+3% → 추격 카드', Reading.guardHome({ kospiRet1: 3.1, upPct: 50, stats: R.stats }, {}, '2026-10-13').id, 'chase');
eq('5일 +8% → 추격 카드', Reading.guardHome({ kospiRet1: 1, kospiRet5: 8.2, upPct: 50, stats: R.stats }, {}, '2026-10-13').id, 'chase');
eq('미리 보기에선 숫자 과신 카드 없음', Reading.guardHome({ kospiRet1: 0, upPct: 72, isFinal: false, stats: R.stats }, {}, '2026-10-13'), null);
eq('보유 종목 −5% → 공포 카드', Reading.guardHome({ kospiRet1: 0, upPct: 50, holdingDrop: { name: 'x', pct: -6 } }, {}, '2026-10-13').title, '갖고 계신 종목이 많이 내렸어요');
const gm = Reading.guardRecord(R, {}, '2026-10-13', []);
eq('성적표 첫 방문: 신용·미수 카드', gm.id, 'margin');
ok('신용 카드 숫자', gm.body.indexOf('5,380') > 0 && gm.body.indexOf('−10.8%') > 0, gm.body);
const go = Reading.guardRecord(R, { shows: { margin: ['2026-10-01'] } }, '2026-10-13', ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13']);
ok('7일 중 5일 → 과잉매매 카드(40~60% 적중 계산값)', go && go.id === 'overtrade' && /\d+% 정도/.test(go.body), go);
eq('40~60% 구간 역산', Reading.flatBandHit(R.stats), { n: 183, hits: 100, pct: 55 });
const lv = Reading.leverageCard({ name: 'KODEX 레버리지', type: 'etf_lev', leverage: 2 }, R);
ok('레버리지 범위 ×2 (−21.6%~+21.9%)', lv.body.indexOf('−21.6% ~ +21.9%') >= 0, lv.body);
ok('이름으로 레버리지 감지', Reading.isLeveraged({ name: 'TIGER 200선물인버스2X', type: 'stock' }) && !Reading.isLeveraged({ name: '삼성전자', type: 'stock' }));

section('reading: 시나리오·자세히·성적표');
const scen = Reading.scenarioRows(R);
eq('SOX 시나리오 5줄', scen.map(s => [s.text, s.upPct, s.lo80, s.hi80]), [
  ['많이 내리면', 40, '5,540', '6,390'], ['조금 내리면', 51, '5,600', '6,450'], ['비슷하면', 60, '5,640', '6,490'],
  ['조금 오르면', 67, '5,690', '6,540'], ['많이 오르면', 76, '5,750', '6,640']]);
const more = Reading.detailMore(R, { isFinal: true, baseWord: '어제' });
ok('자세히: 근거 줄(82번 중 50번)', more.some(s => s.indexOf('82번 있었고, 그중 50번') >= 0), more);
const rst = Reading.recordStats(R);
eq('성적표 전체', [rst.N, rst.miss95, rst.in95n, rst.in80n, rst.histN], [431, 22, 409, 343, 431]);
eq('벗어난 날 22일: 아래 10, 위 12 (stocks3 §2)', [rst.missDays.length, rst.missDown, rst.missUp], [22, 10, 12]);
eq('가운데 ±1% 212일 (stats2)', rst.near1, 212);
eq('95% 연속 이탈 최장 1일, 80% 3일', [rst.streak95.len, rst.streak80.len], [1, 3]);
eq('달별: 2026-10은 7일', rst.monthly[0], { month: '2026-10', n: 7, in80: 2, in95: 5 });
eq('방향 줄 4개', rst.tiers.map(t => t.n), [428, 245, 163, 103]);

section('overnight (macro1 §5 시나리오)');
function mkChanges(series, extra) { return Object.assign({ cutoff: '2026-10-14', dp: '2026-10-13', krClosedToday: false, usStatus: 'ok', timeLabel: '어젯밤', modelPUp: null, series }, extra || {}); }
const ok1 = (o) => Object.assign({ status: 'ok', sessions: 1 }, o);
const b1 = Overnight.overnightBrief(mkChanges({
  sox: ok1({ pct: 3.4, disp: 3.4, last: 7012, sigma: 2.1 }), mu: ok1({ pct: 4.8, disp: 4.8, last: 120, sigma: 3.3 }),
  ewyx: ok1({ pct: 0.9, disp: 0.9, sigma: 1.1, ewyBase: '어제 코스피' }), ndx: ok1({ pct: 1.2, disp: 1.2, last: 20000, sigma: 1.35 }),
  usdkrw: ok1({ pct: -0.21, disp: -3, last: 1418.2, sigma: 0.45 }), vix: ok1({ pct: -6, disp: -6, last: 16.2, sigma: 7.5 }), tnx: { status: 'closed', sessions: 0 }
}, { modelPUp: 0.71 }));
eq('#1', b1.sentences.join(' '), '어젯밤 미국 반도체 주식이 3% 넘게 올랐어요(마이크론 +4.8%). 삼성전자·SK하이닉스에 좋은 소식이라 오늘 코스피에 힘이 될 수 있어요. 미국 속 한국 주식도 힘을 보태는 쪽이었어요(+0.9%).');
const b2 = Overnight.overnightBrief(mkChanges({
  sox: ok1({ pct: 2.8, disp: 2.8, last: 7000, sigma: 2.1 }), usdkrw: ok1({ pct: 1.08, disp: 15.6, last: 1452, sigma: 0.45 }),
  vix: ok1({ pct: 9.8, disp: 9.8, last: 22, sigma: 7.5 })
}, { modelPUp: 0.52 }));
// 스펙 §5 #2 표의 문장은 반도체가 먼저지만, 같은 입력을 스펙 §4 코드에 넣으면 환율 점수(0.33)가 반도체(0.29)보다 커서 환율이 먼저 나온다(코드가 기준).
eq('#2 엇갈림', b2.sentences.join(' '), '어젯밤 원/달러 환율이 15원 넘게 올라 1달러에 1,452원 수준이에요(원화 값 내림). 반면 미국 반도체 주식이 2% 넘게 올랐어요. 좋은 소식과 부담이 되는 소식이 섞여 있어, 오늘 코스피 방향은 뚜렷하지 않아요.');
eq('#2 엇갈림 표시', b2.conflict, 'sox');
const b3 = Overnight.overnightBrief(mkChanges({ sox: ok1({ pct: 0.3, disp: 0.3, last: 7000, sigma: 2.1 }), usdkrw: ok1({ pct: 0.07, disp: 1, last: 1420, sigma: 0.45 }) }, { modelPUp: 0.55 }));
eq('#3 조용한 밤', b3.sentences.join(' '), '어젯밤 세계 시장은 대체로 조용했어요. 미국 반도체(+0.3%)와 원/달러 환율(+1원) 모두 큰 움직임이 없었어요. 오늘 코스피는 해외 소식보다 우리 시장 안의 소식에 따라 움직일 수 있어요.');
const b5 = Overnight.overnightBrief(mkChanges({ usdkrw: ok1({ pct: -0.28, disp: -4, last: 1410, sigma: 0.45 }) }, { usStatus: 'holiday', usHolidayName: '추수감사절', usHolidayLabel: '어젯밤에는' }));
eq('#5 미국 휴장', b5.sentences.join(' '), '어젯밤에는 미국 시장이 쉬었어요(추수감사절). 원/달러 환율은 조금 내려 1달러에 1,410원 수준이에요(−4원). 오늘 코스피는 우리 시장 안의 소식에 더 많이 좌우될 수 있어요.');
const b8 = Overnight.overnightBrief(mkChanges({ ewyx: ok1({ pct: -0.6, disp: -0.6, sigma: 1.1, ewyBase: '어제 코스피' }) }, { krClosedToday: true, modelPUp: 0.45 }));
eq('#8 토요일', b8.sentences.join(' '), '오늘은 한국 시장이 쉬는 날이에요. 어젯밤 미국에서 거래된 한국 주식 묶음(EWY)이 어제 코스피보다 조금 더 약했어요(−0.6%). 해외 투자자들이 밤사이 한국 주식을 덜 좋게 봤다는 뜻이라 다음 거래일 코스피에 부담이 될 수 있어요. 다른 지표까지 함께 보면 다음 거래일 코스피 방향은 뚜렷하지 않아요.');
eq('카드 5개 + 더 보기 2개', [b1.items.filter(i => i.main).length, b1.items.filter(i => !i.main).length], [5, 2]);
eq('VIX 이름은 불안지수', b1.items.find(i => i.key === 'vix').name, '미국 불안지수(VIX)');
eq('휴장 카드', b1.items.find(i => i.key === 'tnx').changeText, '어젯밤 거래 없음(휴장)');
[b1, b2, b3, b5, b8].forEach((b, i) => scan('overnight #' + (i + 1), b));

section('overnight: 달력 판정 (모델과 같은 창)');
const demoSeries = JSON.parse(fs.readFileSync(path.join(W, 'demo/series.json'), 'utf8')).tickers;
const DS = {}; Object.keys(demoSeries).forEach(k => { DS[k] = demoSeries[k].map(x => ({ d: x[0], c: x[1], a: x[1] })); });
const F = KModel.buildFeatures(DS);
const ch = Overnight.computeOvernightChanges(DS, F, Date.parse('2026-10-14T08:40:00+09:00'), 0.6);
eq('수 10/14 08:40', [ch.cutoff, ch.dp, ch.usStatus, ch.timeLabel, ch.series.sox.sessions], ['2026-10-14', '2026-10-13', 'ok', '어젯밤', 1]);
const ch2 = Overnight.computeOvernightChanges(DS, F, Date.parse('2026-10-14T03:00:00+09:00'), 0.6);
eq('새벽 3시는 전날 cutoff', ch2.cutoff, '2026-10-13');
const ch3 = Overnight.computeOvernightChanges(DS, F, Date.parse('2026-10-17T11:00:00+09:00'), 0.6);
eq('토요일: 한국 휴장', ch3.krClosedToday, true);
scan('demo brief', Overnight.overnightBrief(ch));

section('context (macro2)');
const C = Context.MC.compute({ kospi: DS.kospi, usdkrw: DS.usdkrw, tnx: DS.tnx, vix: DS.vix });
eq('기준일', C.kospi.D, '2026-10-13');
eq('하루 −5.5% → bigday', C.headlineId, 'bigday');
const hl = Context.headlineOf(C);
ok('bigday 문장', /^10월 13일\(화\) 코스피가 하루에 5\.5% 떨어졌어요\. 최근 5년 동안 이만큼 움직인 날은 \d+번 있었어요\.$/.test(hl.text), hl.text);
ok('1주 약 −13% (macro2 1.7은 반올림 종가 기준 −13.0%)', Math.abs(C.kospi.chg1w + 13.0) < 0.15, C.kospi.chg1w);
eq('최고치 9,115 (6/22)', [Math.round(C.kospi.high10y), C.kospi.high10yDate], [9115, '2026-06-22']);
const lk = Context.lockedHeadline(C, null);
const lk2 = Context.lockedHeadline(Object.assign({}, C, { kospi: Object.assign({}, C.kospi, { D: '2026-10-14', lastRetPct: 1 }), headlineId: 'vol' }), lk.lock);
eq('같은 주에는 헤드라인 고정', [lk2.headline.id, lk2.locked], ['bigday', true]);
eq('기간 말', [Context.periodWord(-13, '1w'), Context.periodWord(0.5, '1w'), Context.periodWord(3, '1w'), Context.periodWord(43.2, 'ytd')], ['크게 내렸어요', '거의 제자리였어요', '꽤 올랐어요', '크게 올랐어요']);
eq('ISO 주차', Context.isoWeekKey('2026-10-13'), '2026-W42');
scan('context rows', Context.rows(C));
scan('context headline', hl);
ok('상식: 조건 맞는 카드 우선', ['tip_fx_foreigners', 'tip_after_big_drop'].indexOf(Context.pickTip(C, '2026-10-14', false, {})) >= 0);
eq('상식: 첫 주에는 미국 시장 카드', Context.pickTip(C, '2026-10-14', true, {}), 'tip_overnight_us');

section('holdings (stocks2)');
const syms = Holdings.CATALOG.filter(c => c.symbol);
eq('심볼 54개', syms.length, 54);
eq('주식 38 / ETF 16 / 분류 6', [Holdings.CATALOG.filter(c => c.type === 'stock').length, syms.filter(c => c.type !== 'stock').length, Holdings.CATALOG.filter(c => !c.symbol).length], [38, 16, 6]);
eq('초성 검색', Holdings.search('ㅅㅅㅈㅈ').map(c => c.name), ['삼성전자', '삼성전자우']);
eq('이름 검색', Holdings.search('하이닉스').map(c => c.name), ['SK하이닉스']);
const base = { kospiLo80Pct: -6.52, kospiHi80Pct: 7.96, kospiCenterPct: 0.91, dayWord: '내일' };
const cardEx = Holdings.holdingCard(Object.assign({ name: '예시', type: 'stock', beta: 1.2, betaAdj: 1.2, residVolPct: 2.0, calibK: 1.0, dailyVolPct: 2.5, kospiVolPct: 2.0, r2: 0.5 }, base));
eq('§2-4 계산 확인 ±9%', cardEx.lines[0], '내일은 보통 ±9% 정도 움직일 수 있어요.');
const lev = Holdings.holdingCard(Object.assign({ name: 'KODEX 인버스', type: 'etf_lev', leverage: -1, beta: -1.02, dailyVolPct: 2, residVolPct: 0.3, calibK: 1 }, base));
ok('인버스 문구', lev.lines.indexOf('코스피가 1% 오를 때 보통 1% 내렸어요.') >= 0, lev.lines);
const big = Holdings.holdingCard(Object.assign({ name: '말도안되는', type: 'stock', beta: 3, betaAdj: 3, residVolPct: 20, calibK: 2, dailyVolPct: 30, kospiVolPct: 2 }, base));
eq('±30% 넘지 않음', big.x, 30);
const amt = Holdings.holdingCard(Object.assign({ name: '삼성전자', type: 'stock', beta: 1.3, betaAdj: 1.2, residVolPct: 2, calibK: 1, calibHit: 0.8, calibN: 120, dailyVolPct: 2.5, kospiVolPct: 2.2, r2: 0.5, amountWon: 10000000 }, base));
ok('금액 줄', amt.lines.indexOf('넣어 두신 1,000만 원 기준으로는 대략 ±90만 원이에요.') >= 0, amt.lines);
ok('지난 120일 실제로 든 날', amt.lines[1] === '(10번 중 8번은 이 안이라는 뜻이에요 · 지난 120일 실제로 든 날: 10번 중 8번)', amt.lines[1]);
const cards = ['stock', 'etf_kr', 'fund_kr', 'etf_lev', 'etf_us', 'fund_global', 'fund_mixed', 'bond', 'cash'].map(t =>
  Holdings.holdingCard(Object.assign({ name: '테스트', type: t, beta: 0.9, dailyVolPct: 1.5, residVolPct: 1, kospiVolPct: 1.4, move80Pct: 1.2, desc: '코스피200', leverage: 2, overnight: { idxPct: 0.8, fxPct: 0.3 }, betaStable: false, betaRange: [0.7, 1.4], nDays: 150 }, base)));
cards.forEach(c => ok('방향 문구 없음: ' + c.kind, !c.lines.some(l => /오를 것|내릴 것|오를 거|내릴 거/.test(l)), c.lines));
cards.forEach(c => ok('"꼭" 없음: ' + c.kind, !c.lines.some(l => l.indexOf('꼭') >= 0)));
scan('holding cards', cards);
eq('상태 카드', Holdings.holdingCard({ name: 'x', status: 'stale' }).lines[0], '최근 거래 자료가 없어요.');
// holdingStats on synthetic rows
const K2 = DS.kospi.slice(-500);
let px = 50000; const hrows = K2.map((k, i) => { if (i) px *= Math.exp(1.1 * Math.log(k.c / K2[i - 1].c) + 0.01 * Math.sin(i * 1.7)); return { d: k.d, c: px, a: px, v: 100 }; });
const hst = Holdings.holdingStats(hrows, K2.map(k => ({ d: k.d, c: k.c })), Holdings.wfOutFromHistory(R.history), { type: 'stock' });
ok('holdingStats ok + 베타 1.1 근처', hst.status === 'ok' && Math.abs(hst.beta - 1.1) < 0.05, hst.beta);
ok('보정 적중률 계산됨', hst.calibHit != null && hst.calibN >= 60, [hst.calibHit, hst.calibN]);
eq('stale 판정', Holdings.holdingStats(hrows.slice(0, -10), K2, [], { type: 'stock' }).status, 'stale');
eq('too_short', Holdings.holdingStats(hrows.slice(-40), K2, [], { type: 'stock' }).status, 'too_short');
const wt = Holdings.worryTrigger({ pUp: 0.6, kospiCenterPct: 0.9, kospi3dPct: -11.3, holdings: [] });
eq('코스피 3일 −11.3% → 걱정 배너', wt.show, true);
const wt2 = Holdings.worryTrigger({ pUp: 0.6, kospiCenterPct: 0.9, kospi3dPct: 0, holdings: [{ name: '삼성전자', stats: { lastRetPct: -7.2, dailyVolPct: 2, lastDate: '2026-10-13', daysAsBadAsLast: 3 } }] });
eq('종목 −7.2% 사실 줄', wt2.fact, '10월 13일, 삼성전자가 −7.2% 내렸어요. 지난 1년 동안 하루에 이만큼 이상 내린 날은 3번 있었어요.');
eq('조건 없음', Holdings.worryTrigger({ pUp: 0.6, kospiCenterPct: 0.9, kospi3dPct: 0, holdings: [] }).show, false);

section('content');
eq('용어 22개', Content.GLOSSARY.length, 22);
const tsec = Content.trustSections(R.stats, rst);
ok('믿을 만한가: 409일·22일', tsec[1].a.join(' ').indexOf('431일 중 409일 들어왔어요(94.9%). 22일은') >= 0, tsec[1].a);
ok('믿을 만한가: 10일 더 내림 12일 더 오름', tsec[1].a.join(' ').indexOf('22일 중 10일은 더 많이 내렸고, 12일은 더 많이 올랐어요') >= 0);
scan('trust page', tsec);
scan('worry pages', Content.worryPages(R.stats));
scan('notice', [Content.NOTICE_TITLE, Content.NOTICE_LEAD, Content.NOTICE_POINTS, Content.NOTICE_EXTRA]);
scan('glossary', Content.GLOSSARY);
Content.TIPS.forEach(t => scan('tip ' + t.id, Content.tipBody(t, { ctx: C, afterBigDrop: Context.MC.afterBigDrop(DS.kospi), result: R })));
scan('reading texts', [vFix, rv, yc, more, Reading.GUARD_TEXT, gPanic, gNext, g65, gm, go, lv, scen]);

section('소스 파일 문자열 전체 금지어 검사');
['app.js', 'reading.js', 'overnight.js', 'context.js', 'holdings.js', 'content.js', 'engine.js', 'native.js'].forEach(f => {
  if (!fs.existsSync(path.join(W, 'js', f))) return;
  const src = fs.readFileSync(path.join(W, 'js', f), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
  const lits = src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || [];
  scan('js/' + f, lits.filter(s => /[가-힣]/.test(s)));
});
const html = (fs.existsSync(path.join(W, 'index.html')) ? fs.readFileSync(path.join(W, 'index.html'), 'utf8') : '').replace(/<!--[\s\S]*?-->/g, '');
scan('index.html', html.replace(/<[^>]+>/g, ' '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
