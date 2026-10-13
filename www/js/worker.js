/* 계산 전용 Web Worker (계산 중에도 화면이 멈추지 않게) */
/* global importScripts, Compute */
importScripts('util.js', 'model.js', 'compute.js');
self.onmessage = function (e) {
  var t0 = Date.now();
  try {
    var out = Compute.computeAll(e.data.raw, e.data.now, e.data.opts);
    out.workerMs = Date.now() - t0;
    self.postMessage({ ok: true, out: out });
  } catch (err) {
    self.postMessage({ ok: false, error: { message: String(err && err.message || err), code: err && err.code || 'COMPUTE_FAILED' } });
  }
};
