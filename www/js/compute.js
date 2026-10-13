/* 계산 묶음: 모델 실행 + 간밤 요약 + 요즘 시장 이야기 숫자. Web Worker와 메인 스레드(대체) 모두에서 쓴다.
 * 모델 수학은 model.js 그대로(KModel.run). historyDays만 늘려 성적표·종목 보정에 쓸 기록을 더 받는다(표시용 잘라내기 값일 뿐 계산에는 영향 없음). */
(function (root) {
  'use strict';
  var HISTORY_DAYS = 1000;

  var US_SYMS = ['^SOX', '^IXIC', 'EWY'];   // model.js US_KEY와 같은 지표

  // 미국 장 결과를 '확정'으로 써도 되는지 (검수 B2).
  //  - 오늘 받기에 실패해 저장된 값으로 채운 미국 지표가 있으면 → 미리 보기
  //  - 모델이 '미국 휴장'으로 판단했는데 그날이 NYSE 휴장일 표에 없으면 → 미리 보기 (자료가 늦게 들어오는 중일 수 있음)
  function previewReason(res, fetchErrors) {
    var miss = US_SYMS.filter(function (s) { return fetchErrors && fetchErrors[s]; });
    if (miss.length) return { code: 'us_fetch_failed', symbols: miss };
    if (res && res.meta && res.meta.usHoliday) {
      var hol = root.Overnight && root.Overnight.OB_US_HOLIDAYS;
      if (!hol || !hol[res.baseDate]) return { code: 'us_unconfirmed', date: res.baseDate };
    }
    return null;
  }

  // opts: {fetchErrors: {symbol: message}}
  function computeAll(raw, nowMs, opts) {
    opts = opts || {};
    var KModel = root.KModel;
    var cfg = { historyDays: HISTORY_DAYS };
    var pre = previewReason(null, opts.fetchErrors);
    var res = KModel.run(raw, { mode: pre ? 'mixture' : 'auto', now: nowMs, cfg: cfg });
    if (!pre && res.mode === 'overnight') {
      pre = previewReason(res, null);
      if (pre) res = KModel.run(raw, { mode: 'mixture', now: nowMs, cfg: cfg });
    }
    var N = KModel.normalize(raw, nowMs), R = N.R, F = KModel.buildFeatures(R);
    var brief = null, changes = null, ctx = null, abd = null;
    if (res.mode === 'overnight') {
      try {
        changes = root.Overnight.computeOvernightChanges(R, F, nowMs, res.pUp);
        brief = root.Overnight.overnightBrief(changes);
        brief.usDate = changes.usDate || null; brief.cutoff = changes.cutoff;
      } catch (e) { brief = null; }
    }
    try {
      ctx = root.Context.MC.compute({ kospi: R.kospi, usdkrw: R.usdkrw, tnx: R.tnx, vix: R.vix });
      abd = root.Context.MC.afterBigDrop(R.kospi, -0.04, 10);
    } catch (e) { ctx = null; }
    var tail = function (A, n) { return A ? A.slice(-n).map(function (r) { return { d: r.d, c: r.c }; }) : null; };
    // 미국 S&P500은 모델 입력이 아니므로 종목 화면에서 따로 받는다. 환율·나스닥 마지막 변화는 여기서.
    return {
      result: res, brief: brief, ctx: ctx, afterBigDrop: abd, previewReason: pre,
      kospi2y: tail(R.kospi, 560), usdkrwTail: tail(R.usdkrw, 10), ndxTail: tail(R.ndx, 10)
    };
  }
  root.Compute = { computeAll: computeAll, previewReason: previewReason, US_SYMS: US_SYMS, HISTORY_DAYS: HISTORY_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Compute;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
