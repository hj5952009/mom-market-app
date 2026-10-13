/* 공용 도구: 숫자·날짜 표기(ux1 3-5절), 한국 거래일 달력, 조사, 초성.
 * 브라우저에서는 window.MCUtil, node에서는 module.exports. */
(function (root) {
  'use strict';

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var KST = 9 * 3600e3;

  // KRX 휴장일 (macro1 OB_KR_HOLIDAYS / DECISIONS). 주말은 따로 처리.
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

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  // ---------------------------------------------------------------- 숫자
  function fmtInt(x) {
    if (!isNum(x)) return '–';
    var v = Math.round(x), neg = v < 0, s = String(Math.abs(v));
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + s;
  }
  function round10(x) { return Math.round(x / 10) * 10; }        // stats2 1.2: 일반 반올림
  function fmt10(x) { return fmtInt(round10(x)); }
  // 부호 필수, 빼기는 U+2212, 반올림해서 0이면 "0.0%" (ux1 3-5)
  function signPct(v, d) {
    if (!isNum(v)) return '–';
    d = d == null ? 1 : d;
    var r = +v.toFixed(d);
    if (r === 0) return (0).toFixed(d) + '%';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(d) + '%';
  }
  function signNum(v, d) {
    if (!isNum(v)) return '–';
    var r = +v.toFixed(d || 0);
    if (r === 0) return (0).toFixed(d || 0);
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(d || 0);
  }
  function pctOf(v, base) { return (v / base - 1) * 100; }
  function plainPct(p, d) { return (p * 100).toFixed(d || 0) + '%'; }   // 0.949 -> "95%" / d=1 -> "94.9%"

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
  function fmtDateLong(ds) { return (+ds.slice(5, 7)) + '월 ' + (+ds.slice(8, 10)) + '일 (' + DOW[dowOf(ds)] + ')'; }
  function fmtDateMD(ds) { return (+ds.slice(5, 7)) + '월 ' + (+ds.slice(8, 10)) + '일'; }
  function fmtDateShort(ds) { return (+ds.slice(5, 7)) + '/' + (+ds.slice(8, 10)) + ' (' + DOW[dowOf(ds)] + ')'; }
  function fmtDateFull(ds) { return ds.slice(0, 4) + '년 ' + fmtDateLong(ds); }
  function fmtTime(ms) {
    var p = kstParts(ms), h = p.h % 12; if (h === 0) h = 12;
    return (p.h < 12 ? '오전 ' : '오후 ') + h + ':' + pad2(p.mi);
  }
  function fmtHM(hhmm) { // "08:40" -> "오전 8:40"
    var h = +hhmm.slice(0, 2), m = +hhmm.slice(3, 5), hh = h % 12; if (hh === 0) hh = 12;
    return (h < 12 ? '오전 ' : '오후 ') + hh + ':' + pad2(m);
  }
  // 계산 시각 표기: 오늘이면 "오전 8:41", 아니면 "10월 13일 오후 10:28"
  function fmtWhen(ms, nowMs) {
    var same = kstDate(ms) === kstDate(nowMs);
    return same ? fmtTime(ms) : fmtDateMD(kstDate(ms)) + ' ' + fmtTime(ms);
  }
  // 날짜를 오늘 기준 말로: 오늘 / 어제 / 내일 / 10월 9일 (금)
  function relDay(ds, todayK) {
    var n = dayDiff(todayK, ds);
    if (n === 0) return '오늘';
    if (n === -1) return '어제';
    if (n === 1) return '내일';
    return fmtDateLong(ds);
  }

  // ---------------------------------------------------------------- 거래일
  function isKrxHoliday(ds) { return !!KRX_HOLIDAYS[ds]; }
  function isTradingDay(ds) { var w = dowOf(ds); return w !== 0 && w !== 6 && !KRX_HOLIDAYS[ds]; }
  function nextTradingDay(ds) { var d = addDays(ds, 1); for (var i = 0; i < 20 && !isTradingDay(d); i++) d = addDays(d, 1); return d; }
  function prevTradingDay(ds) { var d = addDays(ds, -1); for (var i = 0; i < 20 && !isTradingDay(d); i++) d = addDays(d, -1); return d; }

  // ---------------------------------------------------------------- 한글
  // 받침 유무로 조사 고르기 (stocks2 §5 josa)
  function josa(word, withB, withoutB) {
    var w = String(word).trim(), ch = w.slice(-1), c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) return ((c - 0xAC00) % 28) ? withB : withoutB;
    if ('0136780'.indexOf(ch) >= 0) return withB;
    if ('LMN'.indexOf(ch.toUpperCase()) >= 0) return withB;
    return withoutB;
  }
  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  function chosung(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) out += CHO[Math.floor((c - 0xAC00) / 588)];
      else out += s[i];
    }
    return out;
  }
  function isChosungQuery(q) { return /^[ㄱ-ㅎ]+$/.test(q); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function median(a) {
    if (!a.length) return NaN;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  var MCUtil = {
    DOW: DOW, KRX_HOLIDAYS: KRX_HOLIDAYS,
    isNum: isNum, fmtInt: fmtInt, round10: round10, fmt10: fmt10, signPct: signPct, signNum: signNum, pctOf: pctOf, plainPct: plainPct,
    kstParts: kstParts, kstDate: kstDate, kstMinutes: kstMinutes, addDays: addDays, dowOf: dowOf, dayDiff: dayDiff,
    fmtDateLong: fmtDateLong, fmtDateMD: fmtDateMD, fmtDateShort: fmtDateShort, fmtDateFull: fmtDateFull,
    fmtTime: fmtTime, fmtHM: fmtHM, fmtWhen: fmtWhen, relDay: relDay,
    isKrxHoliday: isKrxHoliday, isTradingDay: isTradingDay, nextTradingDay: nextTradingDay, prevTradingDay: prevTradingDay,
    josa: josa, chosung: chosung, isChosungQuery: isChosungQuery, esc: esc, median: median
  };
  root.MCUtil = MCUtil;
  if (typeof module !== 'undefined' && module.exports) module.exports = MCUtil;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
