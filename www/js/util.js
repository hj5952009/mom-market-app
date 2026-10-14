/* 공용 도구: 숫자·날짜 표기, 한국·미국 휴장일, 예측 대상일과 상태(확정/미리 보기/지난 예측).
 * 브라우저·Worker에서는 전역 MCUtil, node에서는 module.exports. */
(function (root) {
  'use strict';

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var KST = 9 * 3600e3;
  var CLOSE_MIN = 15 * 60 + 30;   // 코스피 정규장 마감 15:30 (KST)

  // KRX 휴장일 (주말은 따로 처리).
  // 2027년: 정부 2027년 월력요항(관공서 공휴일·대체공휴일) 보도로 확인한 평일 공휴일 + 거래소 연말 휴장 관례.
  //   출처: 비건뉴스 "2027년 공휴일 72일…" https://www.vegannews.co.kr/news/article.html?no=383903
  //         경기일보 2026-06-29 https://www.kyeonggi.com/article/20260629580085
  //         month2k 2027년 5월 달력 https://www.month2k.com/lunar/2027-05
  // TODO(2026년 12월): 한국거래소의 2027년 휴장일 공식 공지가 나오면 아래 표와 대조한다.
  //   특히 05-03(노동절 대체공휴일)과 12-31(연말 휴장)은 거래소 공지로 아직 확인하지 못함. 임시공휴일·선거일이 생기면 추가.
  var KRX_HOLIDAYS = {
    '2026-12-25': '크리스마스',
    '2026-12-31': '연말 휴장',
    '2027-01-01': '신정',
    '2027-02-08': '설 연휴',
    '2027-02-09': '설 대체공휴일',
    '2027-03-01': '삼일절',
    '2027-05-03': '노동절 대체공휴일',
    '2027-05-05': '어린이날',
    '2027-05-13': '부처님오신날',
    '2027-07-19': '제헌절 대체공휴일',
    '2027-08-16': '광복절 대체공휴일',
    '2027-09-14': '추석 연휴',
    '2027-09-15': '추석',
    '2027-09-16': '추석 연휴',
    '2027-10-04': '개천절 대체공휴일',
    '2027-10-11': '한글날 대체공휴일',
    '2027-12-27': '성탄절 대체공휴일',
    '2027-12-31': '연말 휴장'
  };
  // NYSE 휴장일 — 모델이 '미국 휴장'이라고 판단했을 때 진짜 휴장인지 확인하는 데 쓴다(B2 규칙).
  var US_HOLIDAYS = {
    '2026-01-01': 1, '2026-01-19': 1, '2026-02-16': 1, '2026-04-03': 1, '2026-05-25': 1, '2026-06-19': 1,
    '2026-07-03': 1, '2026-09-07': 1, '2026-11-26': 1, '2026-12-25': 1,
    '2027-01-01': 1, '2027-01-18': 1, '2027-02-15': 1, '2027-03-26': 1, '2027-05-31': 1, '2027-06-18': 1,
    '2027-07-05': 1, '2027-09-06': 1, '2027-11-25': 1, '2027-12-24': 1
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  // ---------------------------------------------------------------- 숫자
  function fmtInt(x) {
    if (!isNum(x)) return '–';
    var v = Math.round(x), neg = v < 0, s = String(Math.abs(v));
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + s;
  }
  function round10(x) { return Math.round(x / 10) * 10; }
  function fmt10(x) { return fmtInt(round10(x)); }
  // 부호 필수, 빼기는 U+2212, 반올림해서 0이면 "0.0%"
  function signPct(v, d) {
    if (!isNum(v)) return '–';
    d = d == null ? 1 : d;
    var r = +v.toFixed(d);
    if (r === 0) return (0).toFixed(d) + '%';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(d) + '%';
  }
  function pctOf(v, base) { return (v / base - 1) * 100; }
  function pct(p, d) { return isNum(p) ? (p * 100).toFixed(d == null ? 0 : d) + '%' : '–'; }

  // ---------------------------------------------------------------- 날짜 (KST)
  function kstParts(ms) {
    var d = new Date(ms + KST);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
  }
  function kstDate(ms) { var p = kstParts(ms); return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
  function kstMinutes(ms) { var p = kstParts(ms); return p.h * 60 + p.mi; }
  function addDays(ds, n) { return new Date(Date.parse(ds + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function dowOf(ds) { return new Date(ds + 'T00:00:00Z').getUTCDay(); }
  function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
  function fmtMD(ds) { return (+ds.slice(5, 7)) + '월 ' + (+ds.slice(8, 10)) + '일'; }
  function fmtTitleDate(ds) { return fmtMD(ds) + '(' + DOW[dowOf(ds)] + ')'; }          // 10월 14일(수)
  function fmtDateLong(ds) { return fmtMD(ds) + ' (' + DOW[dowOf(ds)] + ')'; }          // 10월 14일 (수)
  function fmtSlash(ds) { return (+ds.slice(5, 7)) + '/' + (+ds.slice(8, 10)); }          // 10/14
  function fmtYM(ds) { return ds.slice(2, 4) + '.' + ds.slice(5, 7); }                    // 26.10
  function fmtTime(ms) {
    var p = kstParts(ms), h = p.h % 12; if (h === 0) h = 12;
    return (p.h < 12 ? '오전 ' : '오후 ') + h + ':' + pad2(p.mi);
  }
  function fmtHM(hhmm) {
    var h = +hhmm.slice(0, 2), m = +hhmm.slice(3, 5), hh = h % 12; if (hh === 0) hh = 12;
    return (h < 12 ? '오전 ' : '오후 ') + hh + ':' + pad2(m);
  }
  // 계산 시각: 오늘이면 "오전 8:41", 아니면 "10월 13일 오후 10:28"
  function fmtWhen(ms, nowMs) {
    return kstDate(ms) === kstDate(nowMs) ? fmtTime(ms) : fmtMD(kstDate(ms)) + ' ' + fmtTime(ms);
  }
  // 오늘 기준 말: 오늘 / 어제 / 내일 / 10월 9일 (금)
  function relDay(ds, todayK) {
    var n = dayDiff(todayK, ds);
    if (n === 0) return '오늘';
    if (n === -1) return '어제';
    if (n === 1) return '내일';
    return fmtDateLong(ds);
  }

  // ---------------------------------------------------------------- 거래일
  function isTradingDay(ds) { var w = dowOf(ds); return w !== 0 && w !== 6 && !KRX_HOLIDAYS[ds]; }
  function nextTradingDay(ds) { var d = addDays(ds, 1); for (var i = 0; i < 20 && !isTradingDay(d); i++) d = addDays(d, 1); return d; }
  function prevTradingDay(ds) { var d = addDays(ds, -1); for (var i = 0; i < 20 && !isTradingDay(d); i++) d = addDays(d, -1); return d; }

  /* 예측 대상일과 상태.
   *  - 대상일 = 모델 기준일(마지막 코스피 종가 날) 다음 거래일
   *  - 지난 예측: 대상일 장 마감(15:30)이 이미 지남
   *  - 미리 보기: 미국 장 결과가 아직 반영되지 않음(mixture) 또는 B2 규칙으로 미리 보기 처리
   *  - 확정: 미국 장 결과까지 반영(overnight) */
  function forecastStatus(result, previewReason, nowMs) {
    var target = nextTradingDay(result.baseDate);
    var today = kstDate(nowMs);
    var past = today > target || (today === target && kstMinutes(nowMs) >= CLOSE_MIN);
    var status = past ? 'past' : (result.mode === 'overnight' && !previewReason ? 'final' : 'preview');
    return { target: target, today: today, status: status, label: { past: '지난 예측', preview: '미리 보기', final: '확정' }[status] };
  }

  /* 지금 시각이면 Yahoo에 이미 있어야 할 마지막 코스피 종가 날짜.
   * 오늘이 거래일이고 16:10(마감 15:30 + 여유 40분)이 지났으면 오늘, 아니면 그 전 거래일. */
  var SETTLE_MIN = CLOSE_MIN + 40;
  function expectedLastClose(nowMs) {
    var today = kstDate(nowMs);
    if (isTradingDay(today) && kstMinutes(nowMs) >= SETTLE_MIN) return today;
    return prevTradingDay(today);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var MCUtil = {
    DOW: DOW, KRX_HOLIDAYS: KRX_HOLIDAYS, US_HOLIDAYS: US_HOLIDAYS, CLOSE_MIN: CLOSE_MIN,
    isNum: isNum, fmtInt: fmtInt, round10: round10, fmt10: fmt10, signPct: signPct, pctOf: pctOf, pct: pct,
    kstParts: kstParts, kstDate: kstDate, kstMinutes: kstMinutes, addDays: addDays, dowOf: dowOf, dayDiff: dayDiff,
    fmtMD: fmtMD, fmtTitleDate: fmtTitleDate, fmtDateLong: fmtDateLong, fmtSlash: fmtSlash, fmtYM: fmtYM,
    fmtTime: fmtTime, fmtHM: fmtHM, fmtWhen: fmtWhen, relDay: relDay,
    isTradingDay: isTradingDay, nextTradingDay: nextTradingDay, prevTradingDay: prevTradingDay, expectedLastClose: expectedLastClose,
    forecastStatus: forecastStatus, esc: esc
  };
  root.MCUtil = MCUtil;
  if (typeof module !== 'undefined' && module.exports) module.exports = MCUtil;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
