/* 계산 묶음: 모델 실행 + 간밤 요약 + 요즘 시장 이야기 숫자. Web Worker와 메인 스레드(대체) 모두에서 쓴다.
 * 모델 수학은 model.js 그대로(KModel.run). historyDays만 늘려 성적표·종목 보정에 쓸 기록을 더 받는다(표시용 잘라내기 값일 뿐 계산에는 영향 없음). */
(function (root) {
  'use strict';
  var HISTORY_DAYS = 1000;

  function computeAll(raw, nowMs) {
    var KModel = root.KModel;
    var res = KModel.run(raw, { mode: 'auto', now: nowMs, cfg: { historyDays: HISTORY_DAYS } });
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
      result: res, brief: brief, ctx: ctx, afterBigDrop: abd,
      kospi2y: tail(R.kospi, 560), usdkrwTail: tail(R.usdkrw, 10), ndxTail: tail(R.ndx, 10)
    };
  }
  root.Compute = { computeAll: computeAll, HISTORY_DAYS: HISTORY_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Compute;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
