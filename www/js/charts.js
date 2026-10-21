/* 차트: 의존성 없는 순수 SVG. 컨테이너 폭(px)에 맞춰 다시 그리고, 글씨는 앱 글씨 배율을 따른다.
 * 공통 규칙(dataviz): 선 2px, 격자·축은 1px 연한 실선, 막대 ≤24px·데이터 끝 4px 둥글게, 점 ≥8px + 표면색 2px 테두리,
 * 글자는 잉크색(계열 색 금지), 2개 이상 계열은 범례, 숫자는 꼭 필요한 곳에만 직접 라벨.
 * 모든 차트: 손가락으로 누르거나 끌면 툴팁(선·면 차트는 세로 보조선이 가장 가까운 날짜에 붙음), 키보드 ←/→도 같은 내용. */
(function (root) {
  'use strict';
  var U = root.MCUtil;
  var esc = U.esc;

  // ------------------------------------------------------------------ 도구
  function lin(d0, d1, r0, r1) { var k = (r1 - r0) / ((d1 - d0) || 1); var f = function (v) { return r0 + (v - d0) * k; }; f.inv = function (p) { return d0 + (p - r0) / k; }; return f; }
  function n1(v) { return Math.round(v * 10) / 10; }
  function niceTicks(lo, hi, count) {
    var span = hi - lo, raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), st = mag;
    [1, 2, 2.5, 5, 10].some(function (m) { st = m * mag; return st >= raw; });
    var out = [], v = Math.ceil(lo / st - 1e-9) * st;
    for (; v <= hi + 1e-9; v += st) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  // 글자 폭 어림 (배치 판단용)
  function tw(s, F, bold) {
    var w = 0; s = String(s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), ch = s[i];
      if (c >= 0x1100) w += 0.98;
      else if (/[0-9]/.test(ch)) w += 0.58;
      else if (/[,.:]/.test(ch)) w += 0.28;
      else if (ch === ' ') w += 0.28;
      else if (ch === '%') w += 0.86;
      else if (/[A-Z]/.test(ch)) w += 0.68;
      else if (/[()]/.test(ch)) w += 0.34;
      else w += 0.56;
    }
    return w * F * (bold ? 1.06 : 1);
  }
  function T(x, y, s, F, cls, anchor, extra) {
    return '<text x="' + n1(x) + '" y="' + n1(y) + '" font-size="' + n1(F) + '" class="' + (cls || 'c-txt') + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') + (extra || '') + '>' + esc(s) + '</text>';
  }
  function L(x1, y1, x2, y2, cls) { return '<line x1="' + n1(x1) + '" y1="' + n1(y1) + '" x2="' + n1(x2) + '" y2="' + n1(y2) + '" class="' + cls + '"/>'; }
  function C(x, y, r, cls) { return '<circle cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + n1(r) + '" class="' + cls + '"/>'; }
  function P(d, cls) { return '<path d="' + d + '" class="' + cls + '"/>'; }
  // 떠 있는 범위 막대(양 끝이 모두 데이터) — 양 끝 둥글게
  function rangeBar(x0, x1, y, h, cls) {
    var w = Math.max(1, x1 - x0), r = Math.min(4, h / 2, w / 2);
    return '<rect x="' + n1(x0) + '" y="' + n1(y) + '" width="' + n1(w) + '" height="' + n1(h) + '" rx="' + n1(r) + '" class="' + cls + '"/>';
  }
  // 기준선에서 자라는 막대 — 데이터 끝만 둥글게
  function hBar(xb, xv, y, h, cls) {
    var w = Math.abs(xv - xb); if (w < 0.5) return '';
    var r = Math.min(4, h / 2, w), d;
    if (xv >= xb) d = 'M' + n1(xb) + ',' + n1(y) + 'H' + n1(xv - r) + 'Q' + n1(xv) + ',' + n1(y) + ' ' + n1(xv) + ',' + n1(y + r) + 'V' + n1(y + h - r) + 'Q' + n1(xv) + ',' + n1(y + h) + ' ' + n1(xv - r) + ',' + n1(y + h) + 'H' + n1(xb) + 'Z';
    else d = 'M' + n1(xb) + ',' + n1(y) + 'H' + n1(xv + r) + 'Q' + n1(xv) + ',' + n1(y) + ' ' + n1(xv) + ',' + n1(y + r) + 'V' + n1(y + h - r) + 'Q' + n1(xv) + ',' + n1(y + h) + ' ' + n1(xv + r) + ',' + n1(y + h) + 'H' + n1(xb) + 'Z';
    return P(d, cls);
  }
  function poly(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + n1(p[0]) + ',' + n1(p[1]); }).join(''); }
  // 겹치는 라벨을 세로로 벌림 (위→아래 정렬된 [{y}]), 범위 [lo, hi]
  function spread(items, gap, lo, hi) {
    items.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    var over = items.length ? items[items.length - 1].y - hi : 0;
    if (over > 0) for (var j = items.length - 1; j >= 0; j--) { items[j].y -= over; if (j && items[j].y - items[j - 1].y >= gap) break; over = j ? gap - (items[j].y - items[j - 1].y) : 0; if (over <= 0) break; }
    if (items.length && items[0].y < lo) { var sh = lo - items[0].y; items.forEach(function (it) { it.y += sh; }); }
    return items;
  }
  function fmtP(v) { return U.fmtInt(v); }
  // 가격 x축 눈금: 라벨이 겹치지 않으면서 3개 이상 보이게
  function priceTicks(lo, hi, x, x0, x1, F) {
    var best = [], lw = tw('0,000', F) * 1.5;
    for (var cnt = 3; cnt <= 8; cnt++) {
      var tk = niceTicks(lo, hi, cnt).filter(function (t) { return x(t) > x0 + lw / 2 && x(t) < x1 - lw / 2; });
      if (tk.length >= 2 && x(tk[1]) - x(tk[0]) >= lw) best = tk;
      if (best.length >= 3) break;
    }
    return best;
  }
  function rangeTxt(a, b) { return U.fmt10(a) + '~' + U.fmt10(b); }
  // 날짜 눈금: 라벨 폭이 겹치지 않게 고른다
  function dateTicks(dates, xOf, F, mode) {
    var out = [], lab = function (d) { return mode === 'ym' ? U.fmtYM(d) : mode === 'm' ? (+d.slice(5, 7)) + '월' : U.fmtSlash(d); };
    var push = function (i) {
      var x = xOf(i), s = lab(dates[i]), wl = tw(s, F), prev = out[out.length - 1];
      if (!prev || x - prev.x >= (wl + prev.w) / 2 + F * 1.6) out.push({ x: x, s: s, w: wl });
    };
    if (mode === 'ym' || mode === 'm') {
      for (var i = 1; i < dates.length; i++) if (dates[i].slice(0, 7) !== dates[i - 1].slice(0, 7)) push(i);
    } else {
      var n = dates.length, k = Math.max(1, Math.ceil(n / 4));
      for (var j = 0; j < n; j += k) push(j);
    }
    return out;
  }

  // ------------------------------------------------------------------ 바탕 (그리기·툴팁·키보드)
  var mounted = [];
  // 차트 글자는 화면 글씨를 따라 커지되 1.4배까지만(더 크면 눈금·이름이 서로 겹쳐 오히려 읽기 어려움)
  function fontPx() { var fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; return 14 * Math.min(1.4, fs / 16); }
  function mount(el, label, build) {
    el._build = build; el._label = label;
    if (mounted.indexOf(el) < 0) mounted.push(el);
    draw(el);
    if (!el._wired) wire(el);
  }
  function draw(el) {
    var w = Math.floor(el.clientWidth); if (!w) return;
    var F = fontPx(), c = el._build(w, F);
    el._c = c; el._w = w; el._idx = -1;
    el.setAttribute('tabindex', '0'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', el._label);
    el.innerHTML = '<svg width="' + w + '" height="' + Math.ceil(c.h) + '" viewBox="0 0 ' + w + ' ' + Math.ceil(c.h) + '" aria-hidden="true">' + c.svg + '<g class="hov"></g></svg><div class="tip" hidden></div>';
  }
  function hide(el) {
    var g = el.querySelector('.hov'), t = el.querySelector('.tip');
    if (g) g.innerHTML = ''; if (t) t.hidden = true;
  }
  function show(el, info) {
    var g = el.querySelector('.hov'), tip = el.querySelector('.tip');
    if (!info) { hide(el); return; }
    var h = el._c.h, s = '';
    if (info.band) s += '<rect x="' + n1(info.band.x) + '" y="' + n1(info.band.y) + '" width="' + n1(info.band.w) + '" height="' + n1(info.band.h) + '" rx="6"/>';
    if (info.cx != null) s += L(info.cx, info.cy0 != null ? info.cy0 : 0, info.cx, info.cy1 != null ? info.cy1 : h, '');
    (info.dots || []).forEach(function (d) { s += C(d.x, d.y, d.r || 5, d.cls || 'c-dot'); });
    g.innerHTML = s;
    // 내용은 textContent로만 (라벨은 데이터)
    tip.textContent = '';
    if (info.title) { var t0 = document.createElement('div'); t0.className = 'tt'; t0.textContent = info.title; tip.appendChild(t0); }
    (info.rows || []).forEach(function (r) {
      var row = document.createElement('div'); row.className = 'tr';
      var k = document.createElement('i'); k.className = 'k ' + (r.k ? '' : 'none'); if (r.k) k.style.background = 'var(' + r.k + ')';
      var b = document.createElement('b'); b.textContent = r.value;
      var sp = document.createElement('span'); sp.textContent = r.label;
      row.appendChild(k); row.appendChild(b); row.appendChild(sp); tip.appendChild(row);
    });
    tip.hidden = false;
    var tw0 = tip.offsetWidth, th = tip.offsetHeight, W = el._w, left, top;
    if (info.cx != null) {
      // 세로 보조선 차트: 툴팁을 보조선 옆(빈 쪽)에, 차트 위쪽에 붙여서 가리키는 점을 가리지 않게
      var cx = info.cx, gap = 12;
      left = cx > W / 2 ? cx - tw0 - gap : cx + gap;
      if (left < 0 || left + tw0 > W) left = Math.max(0, Math.min(W - tw0, cx - tw0 / 2));
      top = 0;
      var dy = (info.dots && info.dots[0]) ? info.dots[0].y : null;
      if (dy != null && left <= cx && left + tw0 >= cx && dy < th + 8) top = dy + 14;   // 가운데로 왔을 때 점과 겹치지 않게
    } else {
      var ax = info.ax != null ? info.ax : W / 2, ay = info.ay != null ? info.ay : 0;
      left = Math.max(0, Math.min(W - tw0, ax - tw0 / 2));
      top = ay - th - 10;
      if (top < -8) top = ay + (info.band ? info.band.h : 0) + 8;
    }
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function wire(el) {
    el._wired = true;
    var at = function (e) {
      var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (!el._c || x < 0 || x > r.width) return;
      show(el, el._c.probe(x, y));
    };
    el.addEventListener('pointerdown', function (e) { at(e); });
    el.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || e.buttons) at(e); });
    el.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(el); });
    el.addEventListener('keydown', function (e) {
      var st = el._c && el._c.stops; if (!st || !st.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') el._idx = Math.min(st.length - 1, el._idx + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') el._idx = el._idx < 0 ? st.length - 1 : Math.max(0, el._idx - 1);
      else if (e.key === 'Escape') { hide(el); el._idx = -1; return; }
      else return;
      e.preventDefault();
      show(el, el._c.probe(st[el._idx][0], st[el._idx][1]));
    });
    el.addEventListener('blur', function () { hide(el); el._idx = -1; });
  }
  document.addEventListener('pointerdown', function (e) {
    mounted.forEach(function (el) { if (!el.contains(e.target)) hide(el); });
  });
  var rt = null;
  function redrawAll() {
    mounted = mounted.filter(function (el) { return document.body.contains(el); });
    mounted.forEach(function (el) { if (el.clientWidth !== el._w) draw(el); });
  }
  root.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redrawAll, 120); });
  function reset() { mounted = []; }

  // ================================================================== 예측 탭
  /* 팬 차트: 최근 30거래일 종가 + 다음 거래일 예측 부채꼴(50/80/95%) + 중심값.
   * d: {hist:[{date,close}], base, center, ranges, target} */
  function fan(el, d) {
    mount(el, '최근 30거래일 코스피 종가와 ' + U.fmtDateLong(d.target) + ' 예측 범위', function (w, F) {
      var hist = d.hist, n = hist.length, R = d.ranges;
      var h = Math.round(F * 17), top = F * 0.8, bot = h - F * 2;
      var vals = hist.map(function (r) { return r.close; }).concat([R['0.95'][0], R['0.95'][1]]);
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.06;
      var ticks = niceTicks(lo - pad, hi + pad, 4);
      var y0 = Math.min(lo - pad, ticks[0]), y1 = Math.max(hi + pad, ticks[ticks.length - 1]);
      var y = lin(y0, y1, bot, top);
      var left = tw(fmtP(ticks[ticks.length - 1]), F) + 8, right = tw('0,000', F, true) + 10;
      var xT = w - right, xH = left + (xT - left) * 0.70;
      var x = function (i) { return left + 4 + (xH - left - 4) * i / (n - 1); };
      var s = '<rect x="' + n1((xH + xT) / 2 - 2) + '" y="' + n1(top - 4) + '" width="' + n1(w - (xH + xT) / 2 + 2) + '" height="' + n1(bot - top + 4) + '" class="c-shade"/>';
      ticks.forEach(function (t) {
        if (y(t) < top - 1 || y(t) > bot + 1) return;
        s += L(left, y(t), xT, y(t), 'c-grid') + T(left - 6, y(t) + F * 0.35, fmtP(t), F, 'c-txt num', 'end');
      });
      s += L(left, bot, xT, bot, 'c-axis');
      var bx = x(n - 1), by = y(d.base);
      [['0.95', 'b4'], ['0.8', 'b2'], ['0.5', 'b1']].forEach(function (b) {
        s += P(poly([[bx, by], [xT, y(R[b[0]][1])], [xT, y(R[b[0]][0])]]) + 'Z', b[1]);
      });
      s += P(poly(hist.map(function (r, i) { return [x(i), y(r.close)]; })), 'c-line');
      s += L(bx, by, xT, y(d.center), 'c-proj');
      s += C(bx, by, 4.5, 'c-dot') + C(xT, y(d.center), 5, 'c-dot');
      // 끝 라벨: 95% 위·아래, 중심
      var labs = spread([
        { y: y(R['0.95'][1]) + F * 0.35, s: U.fmt10(R['0.95'][1]), c: 'c-lab num' },
        { y: y(d.center) + F * 0.35, s: U.fmt10(d.center), c: 'c-strong num' },
        { y: y(R['0.95'][0]) + F * 0.35, s: U.fmt10(R['0.95'][0]), c: 'c-lab num' }
      ], F * 1.1, top + F * 0.4, bot);
      labs.forEach(function (l) { s += T(xT + 6, l.y, l.s, F, l.c, 'start'); });
      // x 눈금: 처음·가운데·마지막 날 + 예측일
      var ty = h - F * 0.45;
      // 글씨가 커서 겹치면 가운데 날짜부터 뺀다
      var tl = [], tR = xT - tw(U.fmtSlash(d.target), F, true) / 2;
      [0, Math.round((n - 1) / 2), n - 1].forEach(function (i, k) {
        var lbl = U.fmtSlash(hist[i].date), w0 = tw(lbl, F), l0 = k === 0 ? x(i) : x(i) - w0 / 2;
        tl.push({ i: i, k: k, s: lbl, l: l0, r: l0 + w0 });
      });
      var gapT = F * 0.6, okT = function (a, b) { return !a || !b || b.l - a.r >= gapT; };
      if (tl[2].r > tR - gapT) tl[2] = null;
      if (!okT(tl[0], tl[1]) || !okT(tl[1], tl[2]) || (tl[1] && tl[1].r > tR - gapT)) tl[1] = null;
      tl.forEach(function (o) { if (o) s += T(x(o.i), ty, o.s, F, 'c-txt', o.k === 0 ? 'start' : 'middle'); });
      s += T(xT, ty, U.fmtSlash(d.target), F, 'c-strong', 'middle');
      var mid = (xH + xT) / 2;
      return {
        h: h, svg: s,
        stops: hist.map(function (r, i) { return [x(i), 0]; }).concat([[xT, 0]]),
        probe: function (px) {
          if (px >= mid) {
            return {
              cx: xT, cy0: top - 4, cy1: bot, dots: [{ x: xT, y: y(d.center) }], ax: Math.min(xT, w - 60), ay: y(R['0.95'][1]),
              title: U.fmtDateLong(d.target) + ' 예상',
              rows: [{ label: '중심', value: U.fmt10(d.center) }, { k: '--band-1', label: '50%', value: rangeTxt(R['0.5'][0], R['0.5'][1]) },
                { k: '--band-2', label: '80%', value: rangeTxt(R['0.8'][0], R['0.8'][1]) }, { k: '--band-4', label: '95%', value: rangeTxt(R['0.95'][0], R['0.95'][1]) }]
            };
          }
          var i = Math.max(0, Math.min(n - 1, Math.round((px - left - 4) / (xH - left - 4) * (n - 1))));
          var r = hist[i], prev = i > 0 ? hist[i - 1].close : null;
          return {
            cx: x(i), cy0: top - 4, cy1: bot, dots: [{ x: x(i), y: y(r.close), r: 4.5 }], ax: x(i), ay: Math.min(y(r.close), top + F * 3),
            title: U.fmtDateLong(r.date),
            rows: [{ k: '--ink', label: '종가', value: U.fmtInt(r.close) }].concat(prev ? [{ label: '전날 대비', value: U.signPct(U.pctOf(r.close, prev)) }] : [])
          };
        }
      };
    });
  }

  /* 확률 분포 곡선. d: {dens, base, center, baseWord} */
  function density(el, d) {
    mount(el, '내일 종가의 확률 분포. 기준 종가보다 위는 상승, 아래는 하락', function (w, F) {
      var D = d.dens, h = Math.round(F * 14), top = F * 2.2, bot = h - F * 2;
      var xl = Math.min(D.quantile(0.002), d.base), xr = Math.max(D.quantile(0.998), d.base);
      var padX = 6, x = lin(xl, xr, padX, w - padX);
      var pts = D.sample(xl, xr, 220), ymax = 0;
      pts.forEach(function (p) { ymax = Math.max(ymax, p.y); });
      var y = lin(0, ymax * 1.05, bot, top);
      var dn = pts.filter(function (p) { return p.x <= d.base; }), upP = pts.filter(function (p) { return p.x >= d.base; });
      var atB = { x: d.base, y: D.pdf(d.base) };
      dn.push(atB); upP.unshift(atB);
      var area = function (arr) { return poly(arr.map(function (p) { return [x(p.x), y(p.y)]; })) + 'L' + n1(x(arr[arr.length - 1].x)) + ',' + n1(bot) + 'L' + n1(x(arr[0].x)) + ',' + n1(bot) + 'Z'; };
      var curve = function (arr) { return poly(arr.map(function (p) { return [x(p.x), y(p.y)]; })); };
      var s = '';
      var ticks = priceTicks(xl, xr, x, padX, w - padX, F);
      ticks.forEach(function (t) { s += L(x(t), top, x(t), bot, 'c-grid') + T(x(t), h - F * 0.45, fmtP(t), F, 'c-txt num', 'middle'); });
      s += P(area(dn), 'w-down') + P(area(upP), 'w-up') + P(curve(dn), 's-down') + P(curve(upP), 's-up');
      s += L(padX, bot, w - padX, bot, 'c-axis');
      var xb = x(d.base), xc = x(d.center);
      s += L(xb, top - F * 0.4, xb, bot, 'c-base') + L(xc, top - F * 0.4, xc, bot, 'c-center');
      var lb = d.baseWord + ' ' + U.fmtInt(d.base), lc = '중심 ' + U.fmt10(d.center), ly = top - F * 0.8;
      var right = d.center >= d.base;
      var bx = right ? xb - 5 : xb + 5, cx = right ? xc + 5 : xc - 5;
      var wb = tw(lb, F), wc = tw(lc, F, true);
      if (right) { bx = Math.max(wb, bx); cx = Math.min(w - wc, cx); } else { bx = Math.min(w - wb, bx); cx = Math.max(wc, cx); }
      s += T(bx, ly, lb, F, 'c-lab num', right ? 'end' : 'start') + T(cx, ly, lc, F, 'c-strong num', right ? 'start' : 'end');
      var stops = [];
      for (var k = 0; k <= 12; k++) stops.push([padX + (w - 2 * padX) * k / 12, 0]);
      return {
        h: h, svg: s, stops: stops,
        probe: function (px) {
          var v = x.inv(Math.max(padX, Math.min(w - padX, px))), p = D.cdf(v);
          return {
            cx: x(v), cy0: top - F * 0.4, cy1: bot, dots: [{ x: x(v), y: y(D.pdf(v)), r: 4.5, cls: v >= d.base ? 'c-dot' : 'c-dot' }], ax: x(v), ay: top,
            title: U.fmtInt(v) + ' (' + U.signPct(U.pctOf(v, d.base)) + ')',
            rows: [{ k: '--down', label: '이보다 낮게 끝날 확률', value: U.pct(p) }, { k: '--up', label: '이보다 높게 끝날 확률', value: U.pct(1 - p) }]
          };
        }
      };
    });
  }

  /* 오를 확률 막대(0~100%), 40~60% 구간 표시. d: {pUp} */
  function gauge(el, d) {
    mount(el, '오를 확률 ' + U.pct(d.pUp), function (w, F) {
      var h = Math.round(F * 4.6), pad = 8, x = lin(0, 1, pad, w - pad), ty = F * 1.15, th = 12;
      var s = rangeBar(x(0), x(1), ty, th, 'c-track') + '<rect x="' + n1(x(0.4)) + '" y="' + n1(ty) + '" width="' + n1(x(0.6) - x(0.4)) + '" height="' + th + '" class="c-zone"/>';
      s += hBar(x(0.5), x(d.pUp), ty, th, d.pUp >= 0.5 ? 'f-up' : 'f-down');
      s += L(x(0.5), ty - 4, x(0.5), ty + th + 4, 'c-ref');
      s += C(x(d.pUp), ty + th / 2, 7, d.pUp >= 0.5 ? 'f-up ringed' : 'f-down ringed');
      var ly = ty + th + F * 1.35;
      [[0, '0%', 'start'], [0.4, '40%', 'middle'], [0.6, '60%', 'middle'], [1, '100%', 'end']].forEach(function (t) {
        s += L(x(t[0]), ty + th + 2, x(t[0]), ty + th + 6, 'c-axis') + T(x(t[0]), ly, t[1], F, 'c-txt num', t[2]);
      });
      return {
        h: ly + F * 0.4, svg: s, stops: [[x(d.pUp), ty]],
        probe: function () {
          return { dots: [], ax: x(d.pUp), ay: ty, title: '오를 확률', rows: [{ k: '--up', label: '오를 확률', value: U.pct(d.pUp, 1) }, { k: '--down', label: '내릴 확률', value: U.pct(1 - d.pUp, 1) }] };
        }
      };
    });
  }

  /* 확률 범위 사다리: 50/80/90/95% 범위를 같은 축에. d: {ranges, base, center, baseWord} */
  function ladder(el, d) {
    mount(el, '50, 80, 90, 95% 범위', function (w, F) {
      var lv = [['0.5', 'b1', '50%'], ['0.8', 'b2', '80%'], ['0.9', 'b3', '90%'], ['0.95', 'b4', '95%']];
      var R = d.ranges, labW = tw('95%', F) + 10, numW = tw('0,000~0,000', F) + 10;
      var stacked = (w - labW - numW) < 150;              // 좁으면 숫자를 막대 위 줄로
      var barH = 14, rowH = stacked ? F * 1.5 + barH + 14 : Math.max(F * 1.9, barH + 16), topH = F * 1.6;
      var lo = Math.min(R['0.95'][0], d.base), hi = Math.max(R['0.95'][1], d.base), pd = (hi - lo) * 0.03;
      var x0 = labW, x1 = stacked ? w - 6 : w - numW;
      var x = lin(lo - pd, hi + pd, x0, x1), s = '';
      var h = topH + rowH * lv.length + 4;
      var xb = x(d.base);
      var bl = d.baseWord + ' ' + U.fmtInt(d.base), bw = tw(bl, F);
      s += T(Math.max(bw / 2, Math.min(w - bw / 2, xb)), F * 1.05, bl, F, 'c-lab num', 'middle');
      var rows = lv.map(function (l, i) {
        var ry = topH + i * rowH, by = stacked ? ry + F * 1.45 : ry + (rowH - barH) / 2;
        var ty = stacked ? ry + F * 1.1 : by + barH / 2 + F * 0.35;
        s += T(0, ty, l[2], F, 'c-lab num', 'start');
        s += rangeBar(x(R[l[0]][0]), x(R[l[0]][1]), by, barH, l[1]);
        s += T(w, ty, rangeTxt(R[l[0]][0], R[l[0]][1]), F, 'c-strong num', 'end');
        return { y: ry, by: by, l: l };
      });
      s += L(xb, topH - 4, xb, h - 2, 'c-base');
      rows.forEach(function (r) { s += C(x(d.center), r.by + barH / 2, 4, 'c-dot'); });
      return {
        h: h, svg: s, stops: rows.map(function (r) { return [w / 2, r.y + rowH / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(lv.length - 1, Math.floor((py - topH) / rowH)));
          var r = rows[i], a = R[r.l[0]][0], b = R[r.l[0]][1];
          return {
            band: { x: -4, y: r.y, w: w + 8, h: rowH }, ax: x((a + b) / 2), ay: r.y,
            title: r.l[2] + ' 범위 (' + (r.l[0] === '0.5' ? '2번 중 1번' : r.l[0] === '0.8' ? '10번 중 8번' : r.l[0] === '0.9' ? '10번 중 9번' : '20번 중 19번') + ')',
            rows: [{ label: '범위', value: rangeTxt(a, b) }, { label: '폭', value: U.fmt10(b - a) },
              { label: d.baseWord + ' 대비', value: U.signPct(U.pctOf(a, d.base)) + ' ~ ' + U.signPct(U.pctOf(b, d.base)) }]
          };
        }
      };
    });
  }

  /* 예측 달력 하루: 위 줄 = 예측(95%·80% 범위, 중심), 아래 줄 = 실제(장중 저가~고가, 종가 점), 점선 = 전날 종가.
   * d: {r80, r95, center, prevClose, actual|null, high|null, low|null, in95} */
  function dayBar(el, d) {
    mount(el, '예측 범위와 실제 움직임', function (w, F) {
      var labW = tw('예측', F) + 12, barH = 14, rowH = Math.max(F * 2.1, barH + 18), topH = F * 1.6, axisH = F * 1.8;
      var vals = [d.r95[0], d.r95[1], d.prevClose];
      if (d.actual > 0) vals.push(d.actual);
      if (d.high > 0) vals.push(d.high, d.low);
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pd = (hi - lo) * 0.04 || 10;
      var x0 = labW, x1 = w - 6, x = lin(lo - pd, hi + pd, x0, x1), s = '';
      var rows = d.actual > 0 ? 2 : 1, h = topH + rowH * rows + axisH;
      var xb = x(d.prevClose), bl = '전날 종가 ' + U.fmtInt(d.prevClose), bw = tw(bl, F);
      s += T(Math.max(x0 + bw / 2, Math.min(w - bw / 2, xb)), F * 1.05, bl, F, 'c-lab num', 'middle');
      var y1 = topH + (rowH - barH) / 2;
      s += T(0, y1 + barH / 2 + F * 0.35, '예측', F, 'c-lab', 'start');
      s += rangeBar(x(d.r95[0]), x(d.r95[1]), y1, barH, 'b4');
      s += rangeBar(x(d.r80[0]), x(d.r80[1]), y1, barH, 'b2');
      s += C(x(d.center), y1 + barH / 2, 4, 'c-dot');
      var y2 = topH + rowH + rowH / 2;
      if (rows === 2) {
        s += T(0, y2 + F * 0.35, '실제', F, 'c-lab', 'start');
        if (d.high > 0 && d.low > 0) {
          s += L(x(d.low), y2, x(d.high), y2, 'c-line');
          s += L(x(d.low), y2 - 6, x(d.low), y2 + 6, 'c-line') + L(x(d.high), y2 - 6, x(d.high), y2 + 6, 'c-line');
        }
        s += C(x(d.actual), y2, 6, d.in95 ? 'c-dot' : 'c-miss');
      }
      s += L(xb, topH - 4, xb, topH + rowH * rows, 'c-base');
      var ay = topH + rowH * rows;
      priceTicks(lo - pd, hi + pd, x, x0, x1, F).forEach(function (t) { s += T(x(t), ay + F * 1.3, U.fmtInt(t), F, 'c-txt num', 'middle'); });
      return {
        h: h, svg: s, stops: [[w / 2, topH + rowH / 2]].concat(rows === 2 ? [[w / 2, y2]] : []),
        probe: function (px, py) {
          var second = rows === 2 && py > topH + rowH;
          if (!second) return {
            band: { x: -4, y: topH, w: w + 8, h: rowH }, ax: x(d.center), ay: topH,
            title: '예측', rows: [{ label: '중심값', value: U.fmt10(d.center) }, { label: '80% 범위', value: rangeTxt(d.r80[0], d.r80[1]) }, { label: '95% 범위', value: rangeTxt(d.r95[0], d.r95[1]) }]
          };
          var rr = [{ label: '종가', value: U.fmtInt(d.actual) }];
          if (d.high > 0) rr.push({ label: '장중 저가~고가', value: U.fmtInt(d.low) + '~' + U.fmtInt(d.high) });
          rr.push({ label: '전날 대비', value: U.signPct(U.pctOf(d.actual, d.prevClose)) });
          return { band: { x: -4, y: topH + rowH, w: w + 8, h: rowH }, ax: x(d.actual), ay: topH + rowH, title: '실제', rows: rr };
        }
      };
    });
  }

  /* SOX 결과별 시나리오(포레스트): 80/95% 범위 + 중심, 각 줄에 오를 확률. d: {scenarios, base} */
  function scenarios(el, d) {
    var sc = d.scenarios;
    mount(el, '오늘 밤 미국 반도체 지수 결과별 코스피 범위', function (w, F) {
      var barH = 12, rowH = F * 1.45 + barH + 16, topH = F * 0.4, axisH = F * 1.7;
      var all = [d.base];
      sc.forEach(function (s0) { if (s0.n) { all.push(s0.r95[0], s0.r95[1]); } });
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pd = (hi - lo) * 0.04;
      var x = lin(lo - pd, hi + pd, 4, w - 4), s = '';
      var h = topH + rowH * sc.length + axisH;
      var ticks = priceTicks(lo - pd, hi + pd, x, 0, w, F);
      var gy0 = topH, gy1 = topH + rowH * sc.length;
      ticks.forEach(function (t) { s += L(x(t), gy0, x(t), gy1, 'c-grid') + T(x(t), h - F * 0.4, fmtP(t), F, 'c-txt num', 'middle'); });
      var rows = sc.map(function (r, i) {
        var ry = topH + i * rowH, by = ry + F * 1.45 + 2;
        s += T(0, ry + F * 1.05, r.label.replace(/^SOX\s*/, '').replace(/-/g, '−'), F, 'c-lab', 'start');
        s += T(w, ry + F * 1.05, r.n ? '오를 확률 ' + U.pct(r.pUp) : '자료 없음', F, 'c-strong num', 'end');
        if (r.n) {
          s += rangeBar(x(r.r95[0]), x(r.r95[1]), by, barH, 'b4') + rangeBar(x(r.r80[0]), x(r.r80[1]), by, barH, 'b2');
          s += C(x(r.center), by + barH / 2, 4, 'c-dot');
        }
        return { y: ry, by: by, r: r };
      });
      s += L(x(d.base), gy0, x(d.base), gy1, 'c-base');
      return {
        h: h, svg: s, stops: rows.map(function (r) { return [w / 2, r.y + rowH / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(sc.length - 1, Math.floor((py - topH) / rowH))), r = rows[i], q = r.r;
          if (!q.n) return { band: { x: -4, y: r.y, w: w + 8, h: rowH }, ay: r.y, title: q.label, rows: [{ label: '', value: '자료 없음' }] };
          return {
            band: { x: -4, y: r.y, w: w + 8, h: rowH }, ax: x(q.center), ay: r.y,
            title: q.label.replace(/-/g, '−') + '일 때',
            rows: [{ label: '오를 확률', value: U.pct(q.pUp) }, { label: '중심', value: U.fmt10(q.center) },
              { k: '--band-2', label: '80%', value: rangeTxt(q.r80[0], q.r80[1]) }, { k: '--band-4', label: '95%', value: rangeTxt(q.r95[0], q.r95[1]) },
              { label: '지난 500일 중 이런 밤', value: q.n + '번' }]
          };
        }
      };
    });
  }

  /* 간밤 해외 지표 변화: 0 기준 좌우 막대(상승 빨강 오른쪽, 하락 파랑 왼쪽). d: {items:[{name, full, v}]} */
  function moves(el, d) {
    var items = d.items;
    mount(el, '간밤 해외 지표 변화', function (w, F) {
      var labW = Math.max.apply(null, items.map(function (it) { return tw(it.name, F); })) + 12;
      var barH = 14, rowH = Math.max(F * 2, 30);
      var maxAbs = Math.max(0.5, Math.max.apply(null, items.map(function (it) { return it.v == null ? 0 : Math.abs(it.v); })));
      // 값 라벨은 0 기준선의 반대쪽(막대가 없는 쪽)에 둔다 → 막대가 반쪽 폭을 다 쓸 수 있다
      var half = (w - labW) / 2, xz = labW + half;
      var k = (half - 4) / maxAbs;
      var h = rowH * items.length + 6, s = '';
      var rows = items.map(function (it, i) {
        var ry = i * rowH, by = ry + (rowH - barH) / 2, ty = by + barH / 2 + F * 0.35;
        s += T(0, ty, it.name, F, 'c-lab', 'start');
        if (it.v == null) { s += T(xz + 6, ty, '자료 없음', F, 'c-txt', 'start'); return { y: ry, it: it }; }
        var xv = xz + it.v * k;
        s += hBar(xz, xv, by, barH, it.v >= 0 ? 'f-up' : 'f-down');
        var pos = +it.v.toFixed(1) > 0;   // 0.0%는 오른쪽에 통일
        s += T(pos ? xz - 6 : xz + 6, ty, U.signPct(it.v), F, 'c-strong num', pos ? 'end' : 'start');
        return { y: ry, it: it, xv: xv };
      });
      s += L(xz, 0, xz, h, 'c-axis');
      return {
        h: h, svg: s, stops: rows.map(function (r) { return [w / 2, r.y + rowH / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(items.length - 1, Math.floor(py / rowH))), r = rows[i];
          return {
            band: { x: -4, y: r.y, w: w + 8, h: rowH }, ax: r.xv != null ? r.xv : xz, ay: r.y,
            title: r.it.full, rows: [{ k: r.it.v == null ? null : (r.it.v >= 0 ? '--up' : '--down'), label: d.when || '', value: r.it.v == null ? '자료 없음' : U.signPct(r.it.v, 2) }]
          };
        }
      };
    });
  }

  // ================================================================== 기록 탭
  /* 예측 띠 vs 실제: 그날 예측한 80/95% 띠(계단형) 위에 실제 종가, 95% 밖은 빨간 점. d: {rows} */
  function bands(el, d) {
    var rows = d.rows;
    mount(el, '최근 ' + rows.length + '거래일 예측 범위와 실제 종가', function (w, F) {
      var n = rows.length, h = Math.round(F * 17), top = F * 0.6, bot = h - F * 2;
      var lo = Infinity, hi = -Infinity;
      rows.forEach(function (r) { lo = Math.min(lo, r.lo95, r.actual); hi = Math.max(hi, r.hi95, r.actual); });
      var pd = (hi - lo) * 0.04, ticks = niceTicks(lo - pd, hi + pd, 4);
      var y = lin(Math.min(lo - pd, ticks[0]), Math.max(hi + pd, ticks[ticks.length - 1]), bot, top);
      var left = tw(fmtP(ticks[ticks.length - 1]), F) + 8, right = 6, step = (w - left - right) / n;
      var x = function (i) { return left + step * (i + 0.5); };
      var s = '';
      ticks.forEach(function (t) { if (y(t) >= top - 1 && y(t) <= bot + 1) s += L(left, y(t), w - right, y(t), 'c-grid') + T(left - 6, y(t) + F * 0.35, fmtP(t), F, 'c-txt num', 'end'); });
      var ribbon = function (loK, hiK) {
        var up = [], dn = [];
        rows.forEach(function (r, i) { var a = left + step * i, b = a + step; up.push([a, y(r[hiK])], [b, y(r[hiK])]); dn.push([a, y(r[loK])], [b, y(r[loK])]); });
        return poly(up.concat(dn.reverse())) + 'Z';
      };
      s += P(ribbon('lo95', 'hi95'), 'b4') + P(ribbon('lo80', 'hi80'), 'b2');
      s += L(left, bot, w - right, bot, 'c-axis');
      s += P(poly(rows.map(function (r, i) { return [x(i), y(r.actual)]; })), n > 100 ? 'c-line thin' : 'c-line');
      rows.forEach(function (r, i) { if (!r.in95) s += C(x(i), y(r.actual), 4, 'c-miss'); });
      dateTicks(rows.map(function (r) { return r.date; }), x, F, n > 150 ? 'ym' : n > 30 ? 'm' : 'md').forEach(function (t) {
        var wl = tw(t.s, F) / 2;
        s += L(t.x, bot, t.x, bot + 4, 'c-axis') + T(Math.max(left + wl - 4, Math.min(w - wl, t.x)), h - F * 0.45, t.s, F, 'c-txt num', 'middle');
      });
      var stops = rows.map(function (r, i) { return [x(i), 0]; });
      return {
        h: h, svg: s, stops: stops,
        probe: function (px) {
          var i = Math.max(0, Math.min(n - 1, Math.floor((px - left) / step))), r = rows[i];
          var out = [{ k: '--ink', label: '실제 종가', value: U.fmtInt(r.actual) }, { k: '--band-2', label: '80% 범위', value: rangeTxt(r.lo80, r.hi80) },
            { k: '--band-4', label: '95% 범위', value: rangeTxt(r.lo95, r.hi95) }];
          if (!r.in95) out.push({ k: '--up', label: '', value: '95% 범위 밖' });
          return { cx: x(i), cy0: top, cy1: bot, dots: [{ x: x(i), y: y(r.actual), r: 4.5, cls: r.in95 ? 'c-dot' : 'c-miss' }], ax: x(i), ay: Math.min(y(r.hi95), top + F * 4), title: U.fmtDateLong(r.date), rows: out };
        }
      };
    });
  }

  /* 보정: 목표(50/80/90/95%) vs 실제 적중 비율, 막대 쌍. d: {stats} */
  function calibration(el, d) {
    var st = d.stats, sh = st.shown || st;
    var lv = [[0.5, sh.cov50], [0.8, sh.cov80], [0.9, sh.cov90], [0.95, sh.cov95]];
    mount(el, '범위별 목표와 실제 비율', function (w, F) {
      var labW = tw('95% 범위', F) + 12, valW = tw('100.0%', F, true) + 8;
      var tH = 8, aH = 14, gap = 3, rowH = tH + gap + aH + Math.max(16, F * 1.1), axisH = F * 1.7;
      var x = lin(0, 1, labW, w - valW), h = rowH * lv.length + axisH, s = '';
      var mid = (x(1) - x(0)) / 2 > tw('100%', F) * 1.4;
      [0, 0.5, 1].forEach(function (t, k) {
        s += L(x(t), 0, x(t), rowH * lv.length - 8, 'c-grid');
        if (k !== 1 || mid) s += T(x(t), h - F * 0.4, (t * 100) + '%', F, 'c-txt num', k === 0 ? 'start' : k === 2 ? 'middle' : 'middle');
      });
      var rows = lv.map(function (l, i) {
        var ry = i * rowH, ty = ry, ay = ry + tH + gap;
        s += T(0, ay + aH / 2 + F * 0.35, Math.round(l[0] * 100) + '% 범위', F, 'c-lab', 'start');
        s += hBar(x(0), x(l[0]), ty, tH, 'c-target') + hBar(x(0), x(l[1]), ay, aH, 'b1');
        s += T(x(l[1]) + 6, ay + aH / 2 + F * 0.35, U.pct(l[1], 1), F, 'c-strong num', 'start');
        return { y: ry, l: l };
      });
      return {
        h: h, svg: s, stops: rows.map(function (r) { return [w / 2, r.y + rowH / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(lv.length - 1, Math.floor(py / rowH))), r = rows[i];
          return {
            band: { x: -4, y: r.y - 4, w: w + 8, h: rowH }, ax: x(r.l[1]), ay: r.y,
            title: Math.round(r.l[0] * 100) + '% 범위', rows: [{ k: '--target', label: '목표', value: Math.round(r.l[0] * 100) + '%' },
              { k: '--band-1', label: '실제 (' + st.holdoutN + '일 중 ' + Math.round(r.l[1] * st.holdoutN) + '일)', value: U.pct(r.l[1], 1) }]
          };
        }
      };
    });
  }

  /* 확신도별 방향 적중률. d: {stats} */
  function tiers(el, d) {
    var st = d.stats;
    var list = [{ name: '모든 날', hit: st.dirHit, n: st.dirN, share: 1 }].concat((st.dirTiers || []).map(function (t) {
      var a = Math.round(t.thr * 100);
      return { name: a + '% 이상·' + (100 - a) + '% 이하', full: '오를 확률 ' + a + '% 이상 또는 ' + (100 - a) + '% 이하인 날', hit: t.hit, n: t.n, share: t.share };
    }));
    mount(el, '확신 정도별 오르내림 맞힌 비율', function (w, F) {
      var barH = 14, rowH = F * 1.45 + barH + F * 1.25 + 14, h = rowH * list.length, s = '';
      var x = lin(0, 1, 0, w);
      var rows = list.map(function (r, i) {
        var ry = i * rowH, by = ry + F * 1.45 + 2;
        s += T(0, ry + F * 1.05, r.name, F, 'c-lab', 'start') + T(w, ry + F * 1.05, U.pct(r.hit, 1), F, 'c-strong num', 'end');
        s += rangeBar(x(0), x(1), by, barH, 'c-track') + hBar(x(0), x(r.hit), by, barH, 'b1');
        s += L(x(0.5), by - 3, x(0.5), by + barH + 3, 'c-ref');
        s += T(0, by + barH + F * 1.1, r.share === 1 ? '전체 ' + r.n + '일' : '전체의 ' + U.pct(r.share) + ' (' + r.n + '일)', F * 0.93, 'c-txt num', 'start');
        return { y: ry, r: r };
      });
      s += T(w, rows[0].y + F * 1.45 + 2 + barH + F * 1.1, '세로선 = 반반(50%)', F * 0.93, 'c-txt', 'end');
      return {
        h: h, svg: s, stops: rows.map(function (r) { return [w / 2, r.y + rowH / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(list.length - 1, Math.floor(py / rowH))), r = rows[i];
          return { band: { x: -4, y: r.y - 2, w: w + 8, h: rowH - 6 }, ax: x(r.r.hit), ay: r.y, title: r.r.full || r.r.name, rows: [{ k: '--band-1', label: '맞힌 비율', value: U.pct(r.r.hit, 1) }, { label: '해당 날', value: r.r.n + '일' }] };
        }
      };
    });
  }

  /* 롤링 60일 95% 적중률 추이 + 목표 95% 기준선. d: {series:[{date,rate}], win} */
  function rolling(el, d) {
    var sr = d.series;
    mount(el, '최근 ' + d.win + '일 95% 범위 안에 든 비율의 추이', function (w, F) {
      var n = sr.length, h = Math.round(F * 13), top = F * 1.6, bot = h - F * 2;
      var mn = Math.min.apply(null, sr.map(function (p) { return p.rate; }));
      var lo = Math.min(0.9, Math.floor((mn - 0.01) * 20) / 20), hiV = 1;
      var y = lin(lo, hiV, bot, top), ticks = [];
      for (var tv = lo; tv <= 1.0001; tv += 0.05) ticks.push(Math.round(tv * 100) / 100);
      var left = tw('100%', F) + 8, right = 8, x = lin(0, n - 1, left, w - right), s = '';
      ticks.forEach(function (t) { s += L(left, y(t), w - right, y(t), 'c-grid') + T(left - 6, y(t) + F * 0.35, Math.round(t * 100) + '%', F, Math.abs(t - 0.95) < 1e-6 ? 'c-strong num' : 'c-txt num', 'end'); });
      s += L(left, y(0.95), w - right, y(0.95), 'c-ref');
      s += P(poly(sr.map(function (p, i) { return [x(i), y(p.rate)]; })), 's-b1');
      var last = sr[n - 1];
      s += C(x(n - 1), y(last.rate), 4.5, 'b1 ringed');
      var ly = last.rate >= 0.95 ? Math.min(y(last.rate), y(0.95)) - 8 : Math.max(y(last.rate), y(0.95)) + F + 2;
      s += T(w - right, ly, U.pct(last.rate, 1), F, 'c-strong num', 'end');
      s += L(left, bot, w - right, bot, 'c-axis');
      dateTicks(sr.map(function (p) { return p.date; }), x, F, 'ym').forEach(function (t) {
        var wl = tw(t.s, F) / 2;
        s += T(Math.max(left + wl - 4, Math.min(w - wl, t.x)), h - F * 0.45, t.s, F, 'c-txt num', 'middle');
      });
      return {
        h: h, svg: s, stops: sr.map(function (p, i) { return [x(i), 0]; }).filter(function (p, i) { return i % 5 === 0 || i === n - 1; }),
        probe: function (px) {
          var i = Math.max(0, Math.min(n - 1, Math.round(x.inv(px)))), p = sr[i];
          return { cx: x(i), cy0: top, cy1: bot, dots: [{ x: x(i), y: y(p.rate), r: 4.5, cls: 'b1' }], ax: x(i), ay: top, title: U.fmtDateLong(p.date) + '까지 ' + d.win + '일',
            rows: [{ k: '--band-1', label: d.win + '일 중 ' + Math.round(p.rate * d.win) + '일 범위 안', value: U.pct(p.rate, 1) }] };
        }
      };
    });
  }

  /* 최근 20거래일 결과 점 줄: 95% 범위 안 ●, 밖 ○. d: {rows} */
  function dots(el, d) {
    var rows = d.rows;
    mount(el, '최근 ' + rows.length + '거래일 95% 범위 결과', function (w, F) {
      var n = rows.length, sp = w / n, r = Math.max(4, Math.min(8, sp * 0.33)), cy = r + 6, h = cy + r + F * 1.6, s = '';
      var x = function (i) { return sp * (i + 0.5); };
      rows.forEach(function (q, i) { s += C(x(i), cy, q.in95 ? r : r - 1, q.in95 ? 'b1' : 'c-out'); });
      s += T(0, h - F * 0.3, U.fmtSlash(rows[0].date), F, 'c-txt num', 'start') + T(w, h - F * 0.3, U.fmtSlash(rows[n - 1].date), F, 'c-txt num', 'end');
      return {
        h: h, svg: s, stops: rows.map(function (q, i) { return [x(i), cy]; }),
        probe: function (px) {
          var i = Math.max(0, Math.min(n - 1, Math.floor(px / sp))), q = rows[i];
          return { band: { x: x(i) - sp / 2, y: 0, w: sp, h: cy * 2 }, ax: x(i), ay: 0, title: U.fmtDateLong(q.date),
            rows: [{ label: '실제 종가', value: U.fmtInt(q.actual) }, { label: '95% 범위', value: rangeTxt(q.lo95, q.hi95) }, { k: q.in95 ? '--band-1' : '--up', label: '', value: q.in95 ? '범위 안' : '범위 밖' }] };
        }
      };
    });
  }

  /* 성상현 페이지: 주제 × 달 글 수 히트맵. d: {rows:[{name, values}], months:['2024-03',...]} */
  function ymLab(ym) { return ym.slice(0, 4) + '년 ' + (+ym.slice(5, 7)) + '월'; }
  function heat(el, d) {
    var rows = d.rows, M = d.months;
    mount(el, '주제별 글 수 흐름', function (w, F) {
      var labW = Math.max.apply(null, rows.map(function (r) { return tw(r.name, F); })) + 8;
      var gw = (w - labW) / M.length, rh = Math.max(F * 1.45, 20), axisH = F * 1.7, h = rows.length * rh + axisH, s = '';
      var max = 1; rows.forEach(function (r) { r.values.forEach(function (v) { if (v > max) max = v; }); });
      rows.forEach(function (r, i) {
        var y = i * rh;
        s += T(0, y + rh / 2 + F * 0.35, r.name, F, 'c-lab', 'start');
        r.values.forEach(function (v, j) {
          var op = v ? 0.15 + 0.85 * Math.sqrt(v / max) : 0;
          s += '<rect x="' + n1(labW + j * gw + 0.5) + '" y="' + n1(y + 2) + '" width="' + n1(Math.max(1, gw - 1)) + '" height="' + n1(rh - 4) + '" rx="2" class="' + (v ? 'b1' : 'c-empty') + '"' + (v ? ' fill-opacity="' + op.toFixed(2) + '"' : '') + '/>';
        });
      });
      var lastR = -1e9, yw = tw('0000', F);
      M.forEach(function (m, j) {   // 해마다 1월에 연도 (겹치면 건너뜀)
        if (m.slice(5) !== '01' && j !== 0) return;
        var x0 = labW + j * gw; if (x0 < lastR + 6 || x0 + yw > w) return;
        s += T(x0, h - F * 0.35, m.slice(0, 4), F, 'c-txt num', 'start'); lastR = x0 + yw;
      });
      return {
        h: h, svg: s, stops: rows.map(function (r, i) { return [labW + (M.length - 1) * gw, i * rh + rh / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(rows.length - 1, Math.floor(py / rh))), j = Math.max(0, Math.min(M.length - 1, Math.floor((px - labW) / gw)));
          return { band: { x: labW + j * gw, y: i * rh, w: gw, h: rh }, ax: labW + (j + 0.5) * gw, ay: i * rh,
            title: rows[i].name + ' · ' + ymLab(M[j]), rows: [{ k: '--band-1', label: '개 글', value: String(rows[i].values[j]) }] };
        }
      };
    });
  }
  /* 한 주제의 달별 글 수 막대. d: {values, months, name} */
  function monthBars(el, d) {
    var V = d.values, M = d.months;
    mount(el, d.name + ' 달별 글 수', function (w, F) {
      var axisH = F * 1.7, ch = 70, h = ch + axisH, gw = w / M.length, max = Math.max.apply(null, V.concat([1])), s = '';
      s += L(0, ch, w, ch, 'c-axis');
      V.forEach(function (v, j) {
        if (!v) return;
        var bh = Math.max(2, v / max * (ch - 6));
        s += '<rect x="' + n1(j * gw + gw * 0.15) + '" y="' + n1(ch - bh) + '" width="' + n1(Math.max(1, gw * 0.7)) + '" height="' + n1(bh) + '" rx="1.5" class="b1"/>';
      });
      var lastR = -1e9, yw = tw('0000', F);
      M.forEach(function (m, j) {
        if (m.slice(5) !== '01' && j !== 0) return;
        var x0 = j * gw; if (x0 < lastR + 6 || x0 + yw > w) return;
        s += T(x0, h - F * 0.35, m.slice(0, 4), F, 'c-txt num', 'start'); lastR = x0 + yw;
      });
      return {
        h: h, svg: s, stops: [[w - gw / 2, ch / 2]],
        probe: function (px) {
          var j = Math.max(0, Math.min(M.length - 1, Math.floor(px / gw)));
          return { band: { x: j * gw, y: 0, w: gw, h: ch }, ax: (j + 0.5) * gw, ay: 0, title: ymLab(M[j]), rows: [{ k: '--band-1', label: '개 글', value: String(V[j]) }] };
        }
      };
    });
  }

  /* 성상현 관점 지수(위)와 코스피 종가(아래), 같은 날짜 축. d: {dates, S:[number|null], K:[number]} */
  function sungIndex(el, d) {
    var D = d.dates, S = d.S, K = d.K, n = D.length;
    mount(el, '성상현 관점 지수와 코스피', function (w, F) {
      var labW = Math.max(tw('+1.0', F), tw('00,000', F * 0.9)) + 6, x0 = labW, x1 = w - 4, h1 = 120, gap = F * 1.6, h2 = 90, axisH = F * 1.7, h = h1 + gap + h2 + axisH, s = '';
      var x = lin(0, n - 1, x0, x1), ys = lin(-1, 1, h1 - 4, 4);
      var kv = K.filter(function (v) { return v > 0; }), kmin = Math.min.apply(null, kv), kmax = Math.max.apply(null, kv), kp = (kmax - kmin) * 0.06;
      var yk = lin(kmin - kp, kmax + kp, h1 + gap + h2, h1 + gap);
      [-1, -0.5, 0, 0.5, 1].forEach(function (t) { s += L(x0, ys(t), x1, ys(t), t === 0 ? 'c-axis' : 'c-grid'); s += T(0, ys(t) + F * 0.35, (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t).toFixed(1), F, 'c-txt num', 'start'); });
      // 0 위는 상승색, 아래는 하락색 면
      var segs = [], cur = [];
      for (var i = 0; i < n; i++) { if (S[i] == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(i); }
      if (cur.length) segs.push(cur);
      segs.forEach(function (sg) {
        var up = 'M' + n1(x(sg[0])) + ',' + n1(ys(0)), dn = up;
        sg.forEach(function (j) { up += 'L' + n1(x(j)) + ',' + n1(ys(Math.max(0, S[j]))); dn += 'L' + n1(x(j)) + ',' + n1(ys(Math.min(0, S[j]))); });
        up += 'L' + n1(x(sg[sg.length - 1])) + ',' + n1(ys(0)) + 'Z'; dn += 'L' + n1(x(sg[sg.length - 1])) + ',' + n1(ys(0)) + 'Z';
        s += P(up, 'w-up') + P(dn, 'w-down');
        s += P(poly(sg.map(function (j) { return [x(j), ys(S[j])]; })), 'c-line');
      });
      s += T(x0, h1 + gap - F * 0.4, '코스피', F, 'c-lab', 'start');
      var kt = niceTicks(kmin, kmax, 3);
      kt.forEach(function (t) { s += L(x0, yk(t), x1, yk(t), 'c-grid'); });
      s += P(poly(K.map(function (v, j) { return v > 0 ? [x(j), yk(v)] : null; }).filter(Boolean)), 'c-line');
      kt.forEach(function (t) { s += T(0, yk(t) + F * 0.3, U.fmtInt(t), F * 0.9, 'c-txt num', 'start'); });
      var lastR = -1e9, yw = tw('2026.01', F);
      D.forEach(function (ds, j) {
        if (j && ds.slice(5, 7) === D[j - 1].slice(5, 7)) return;
        var m = +ds.slice(5, 7); if (m !== 1 && m !== 7) return;
        var xx = x(j); if (xx - yw / 2 < lastR + 8 || xx + yw / 2 > w || xx - yw / 2 < 0) return;
        s += T(xx, h - F * 0.35, ds.slice(0, 4) + '.' + ds.slice(5, 7), F, 'c-txt num', 'middle'); lastR = xx + yw / 2;
      });
      return {
        h: h, svg: s, stops: [[x(n - 1), ys(S[n - 1] || 0)]],
        probe: function (px) {
          var j = Math.max(0, Math.min(n - 1, Math.round(x.inv(px))));
          return { cx: x(j), cy0: 0, cy1: h1 + gap + h2, dots: (S[j] == null ? [] : [{ x: x(j), y: ys(S[j]) }]).concat(K[j] > 0 ? [{ x: x(j), y: yk(K[j]) }] : []),
            title: U.fmtDateLong(D[j]), rows: [{ label: '관점 지수', value: S[j] == null ? '–' : (S[j] >= 0 ? '+' : '−') + Math.abs(S[j]).toFixed(2) }, { label: '코스피', value: K[j] > 0 ? U.fmtInt(K[j]) : '–' }] };
        }
      };
    });
  }

  /* 이주완 탭: D램 가격 전년비(위, 오르면 빨강·내리면 파랑)와 반도체 생산·집적회로 수출물량 전년비(아래), 분기 축.
   * d: {rows:[{q:'2024-1', price, prod, vol}], from:'2024-1'(가격 상승 구간 시작, 옅은 면)} */
  function jwPriceVol(el, d) {
    var R = d.rows, n = R.length;
    function sg(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%'; }
    mount(el, 'D램 가격과 생산·수출 물량, 전년 대비', function (w, F) {
      var labW = tw('−200', F) + 6, x0 = labW, x1 = w, gw = (x1 - x0) / n;
      var h1 = 132, gap = F * 2.4, h2 = 104, axisH = F * 1.7, top = F * 2.1, h = top + h1 + gap + h2 + axisH, s = '';
      var pMin = Math.min(-60, Math.min.apply(null, R.map(function (r) { return r.price; }))), pMax = Math.max.apply(null, R.map(function (r) { return r.price; }).concat([50]));
      var qv = R.map(function (r) { return r.prod; }).concat(R.map(function (r) { return r.vol; }));
      var qMin = Math.min(-10, Math.min.apply(null, qv)), qMax = Math.max(10, Math.max.apply(null, qv));
      var yp = lin(pMin, pMax * 1.08, top + h1, top), b0 = top + h1 + gap, yq = lin(qMin * 1.1, qMax * 1.1, b0 + h2, b0);
      var si = R.map(function (r) { return r.q; }).indexOf(d.from);
      if (si >= 0) s += '<rect x="' + n1(x0 + si * gw) + '" y="0" width="' + n1((n - si) * gw) + '" height="' + n1(b0 + h2) + '" class="c-shade"/>';
      if (si >= 0) s += T(x0 + si * gw + 4, F * 0.85, '값이 오른 ' + (n - si) + '분기', F * 0.9, 'c-lab', 'start');
      niceTicks(0, pMax, 2).forEach(function (t) { s += L(x0, yp(t), x1, yp(t), t === 0 ? 'c-axis' : 'c-grid'); s += T(0, yp(t) + F * 0.35, String(t), F, 'c-txt num', 'start'); });
      niceTicks(qMin, qMax, 3).forEach(function (t) { s += L(x0, yq(t), x1, yq(t), t === 0 ? 'c-axis' : 'c-grid'); s += T(0, yq(t) + F * 0.35, (t < 0 ? '−' : '') + Math.abs(t), F, 'c-txt num', 'start'); });
      s += T(x0, top + h1 + gap * 0.62, '생산·수출 물량 (%)', F * 0.9, 'c-lab', 'start');
      var vbar = function (cx, bw, y0, y1, cls) {
        var hh = Math.abs(y1 - y0); if (hh < 0.5) return '';
        var r = Math.min(3, bw / 2, hh), x = cx - bw / 2, d2;
        if (y1 < y0) d2 = 'M' + n1(x) + ',' + n1(y0) + 'V' + n1(y1 + r) + 'Q' + n1(x) + ',' + n1(y1) + ' ' + n1(x + r) + ',' + n1(y1) + 'H' + n1(x + bw - r) + 'Q' + n1(x + bw) + ',' + n1(y1) + ' ' + n1(x + bw) + ',' + n1(y1 + r) + 'V' + n1(y0) + 'Z';
        else d2 = 'M' + n1(x) + ',' + n1(y0) + 'V' + n1(y1 - r) + 'Q' + n1(x) + ',' + n1(y1) + ' ' + n1(x + r) + ',' + n1(y1) + 'H' + n1(x + bw - r) + 'Q' + n1(x + bw) + ',' + n1(y1) + ' ' + n1(x + bw) + ',' + n1(y1 - r) + 'V' + n1(y0) + 'Z';
        return P(d2, cls);
      };
      var pw = Math.min(18, gw * 0.62), qw = Math.min(9, gw * 0.34);
      R.forEach(function (r, i) {
        var cx = x0 + (i + 0.5) * gw;
        s += vbar(cx, pw, yp(0), yp(r.price), r.price >= 0 ? 'f-up' : 'f-down');
        s += vbar(cx - qw / 2 - 0.5, qw, yq(0), yq(r.prod), 'b1');
        s += vbar(cx + qw / 2 + 0.5, qw, yq(0), yq(r.vol), 'b3');
      });
      // 가장 큰 두 값만 숫자로
      var big = R.map(function (r, i) { return i; }).sort(function (a, b) { return R[b].price - R[a].price; }).slice(0, 2);
      big.forEach(function (i) { s += T(x0 + (i + 0.5) * gw, yp(R[i].price) - 5, '+' + Math.round(R[i].price) + '%', F * 0.9, 'c-strong num', 'middle'); });
      var lastR = -1e9;
      R.forEach(function (r, i) {
        if (r.q.slice(5) !== '1') return;
        var lx = x0 + i * gw + 2, yw = tw('0000', F); if (lx < lastR + 6 || lx + yw > w) return;
        s += T(lx, h - F * 0.35, r.q.slice(0, 4), F, 'c-txt num', 'start'); lastR = lx + yw;
      });
      var stops = R.map(function (r, i) { return [x0 + (i + 0.5) * gw, top + h1 / 2]; });
      return {
        h: h, svg: s, stops: stops,
        probe: function (px) {
          var i = Math.max(0, Math.min(n - 1, Math.floor((px - x0) / gw))), r = R[i];
          return { band: { x: x0 + i * gw, y: 0, w: gw, h: b0 + h2 }, ax: x0 + (i + 0.5) * gw, ay: 0, title: r.q.slice(0, 4) + '년 ' + r.q.slice(5) + '분기',
            rows: [{ k: r.price >= 0 ? '--up' : '--down', label: 'D램 가격', value: sg(r.price) }, { k: '--band-1', label: '반도체 생산', value: sg(r.prod) }, { k: '--band-3', label: '수출 물량', value: sg(r.vol) }] };
        }
      };
    });
  }

  // ================================================================== 반도체 탭
  function ymText(ym) { return ym.slice(0, 4) + '년 ' + (+ym.slice(5, 7)) + '월'; }
  function ymShort(ym) { return ym.slice(2, 4) + '.' + ym.slice(5, 7); }
  function monthIdx(months, ym) { return months.indexOf(ym); }
  /* 월별 선 1~3개. d: {months, series:[{name, values, cls, key, dash}], fmt, label, yFrom0} */
  function semiLines(el, d) {
    var M = d.months, n = M.length, Sx = d.series;
    mount(el, d.label, function (w, F) {
      var all = []; Sx.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); });
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.08 || 1;
      var tk = niceTicks(lo - pad, hi + pad, 4), labW = Math.max.apply(null, tk.map(function (t) { return tw(d.fmt(t), F); })) + 8;
      var endW = Math.max.apply(null, Sx.map(function (s) { var v = s.values[n - 1]; return v == null ? 0 : tw(d.fmt(v), F); })) + 8;
      var x0 = labW, x1 = w - endW, ch = Math.round(F * 12), axisH = F * 1.8, h = ch + axisH, s = '';
      // 눈금이 값 범위 안쪽에서만 나와도 선이 차트 밖으로 나가지 않게 세로 범위는 값과 눈금을 모두 덮는다
      var x = lin(0, n - 1, x0, x1), y = lin(Math.min(tk[0], lo - pad), Math.max(tk[tk.length - 1], hi + pad), ch - 4, 4);
      tk.forEach(function (t) { s += L(x0, y(t), x1, y(t), 'c-grid'); s += T(0, y(t) + F * 0.35, d.fmt(t), F, 'c-txt num', 'start'); });
      Sx.forEach(function (sr) {
        var segs = [], cur = [];
        sr.values.forEach(function (v, j) { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(j), y(v)]); });
        if (cur.length) segs.push(cur);
        segs.forEach(function (sg) { s += P(poly(sg), sr.cls); });
      });
      var ends = Sx.map(function (sr) { var v = sr.values[n - 1]; return v == null ? null : { y: y(v), v: v, sr: sr }; }).filter(Boolean);
      spread(ends, F * 1.15, F * 0.5, ch);
      ends.forEach(function (e) { s += T(x1 + 6, e.y + F * 0.35, d.fmt(e.v), F, 'c-strong num', 'start'); });
      var lastR = -1e9, yw = tw('2026', F);
      M.forEach(function (m, j) {
        if (m.slice(5) !== '01') return;
        var xx = x(j); if (xx - yw / 2 < lastR + 10 || xx + yw / 2 > w) return;
        s += T(xx, h - F * 0.35, m.slice(0, 4), F, 'c-txt num', 'middle'); lastR = xx + yw / 2;
      });
      return {
        h: h, svg: s, stops: [[x(n - 1), ch / 2]],
        probe: function (px) {
          var j = Math.max(0, Math.min(n - 1, Math.round(x.inv(px))));
          return { cx: x(j), cy0: 0, cy1: ch, dots: Sx.filter(function (sr) { return sr.values[j] != null && !sr.dash; }).map(function (sr) { return { x: x(j), y: y(sr.values[j]) }; }),
            title: ymText(M[j]), rows: Sx.map(function (sr) { return { k: sr.key, label: sr.name, value: sr.values[j] == null ? '–' : d.fmt(sr.values[j]) }; }) };
        }
      };
    });
  }
  /* D램 가격 실제 + 시나리오(로그 눈금). d: {months:[실제 월], actual:[...], scen:{months, A, Alo, Ahi, B, C, D}} */
  function semiPrice(el, d) {
    var AM = d.months, A = d.actual, S = d.scen;
    var allM = AM.slice(); S.months.forEach(function (m) { if (allM.indexOf(m) < 0) allM.push(m); });
    if (S.D && allM.indexOf(S.D.month) < 0) allM.push(S.D.month);
    allM.sort(); var n = allM.length;
    mount(el, 'D램 수출가격과 시나리오', function (w, F) {
      var vals = A.concat(S.Alo, S.Ahi, S.B, S.C, S.D ? [S.D.lo, S.D.hi] : []).filter(function (v) { return v != null && v > 0; });
      var lo = Math.log(Math.min.apply(null, vals) * 0.9), hi = Math.log(Math.max.apply(null, vals) * 1.08);
      var cand = [25, 50, 100, 200, 400, 800, 1600], tk = cand.filter(function (t) { return Math.log(t) >= lo && Math.log(t) <= hi; });
      var labW = Math.max.apply(null, tk.map(function (t) { return tw(String(t), F); })) + 8;
      var ends = [['A', S.A], ['B', S.B], ['C', S.C]].map(function (e) { var v = null; e[1].forEach(function (x) { if (x != null) v = x; }); return { k: e[0], v: v }; }).filter(function (e) { return e.v != null; });
      var endW = tw('A 000', F) + 8;
      var x0 = labW, x1 = w - endW, ch = Math.round(F * 15), axisH = F * 1.8, h = ch + axisH, s = '';
      var x = lin(0, n - 1, x0, x1), yl = lin(lo, hi, ch - 4, 4), y = function (v) { return yl(Math.log(v)); };
      var X = function (m) { return x(allM.indexOf(m)); };
      tk.forEach(function (t) { s += L(x0, y(t), x1, y(t), 'c-grid'); s += T(0, y(t) + F * 0.35, String(t), F, 'c-txt num', 'start'); });
      // 예측 구간 음영
      var fx0 = X(S.months[0]); s += '<rect x="' + n1(fx0) + '" y="0" width="' + n1(x1 - fx0) + '" height="' + ch + '" class="c-shade"/>';
      // A 범위 띠
      var up = [], dn = [];
      S.months.forEach(function (m, i) { if (S.Alo[i] != null && S.Ahi[i] != null) { up.push([X(m), y(S.Ahi[i])]); dn.push([X(m), y(S.Alo[i])]); } });
      if (up.length) s += P(poly(up.concat(dn.reverse())) + 'Z', 'w-down');
      var link = function (arr) { var pts = []; S.months.forEach(function (m, i) { if (arr[i] != null) pts.push([X(m), y(arr[i])]); }); return pts; };
      var lastA = [X(AM[AM.length - 1]), y(A[A.length - 1])];
      var join = function (pts) { return pts.length && pts[0][0] > lastA[0] ? [lastA].concat(pts) : pts; };
      [['B', S.B, 's-b1 s-dash'], ['C', S.C, 's-up s-dash'], ['A', S.A, 's-down s-dash']].forEach(function (e) { var pts = join(link(e[1])); if (pts.length > 1) s += P(poly(pts), e[2]); });
      s += P(poly(A.map(function (v, j) { return [X(AM[j]), y(v)]; })), 'c-line');
      s += C(lastA[0], lastA[1], 4.5, 'c-dot');
      if (S.D) {
        var dx = X(S.D.month);
        s += L(dx, y(S.D.lo), dx, y(S.D.hi), 's-b1'); s += L(dx - 5, y(S.D.lo), dx + 5, y(S.D.lo), 's-b1'); s += L(dx - 5, y(S.D.hi), dx + 5, y(S.D.hi), 's-b1');
        s += C(dx, y(S.D.mid), 5, 'b1');
      }
      var labs = ends.map(function (e) { return { y: y(e.v), t: e.k + ' ' + Math.round(e.v), cls: e.k === 'A' ? 'c-dn' : e.k === 'C' ? 'c-upt' : 'c-b1t' }; });
      spread(labs, F * 1.2, F * 0.5, ch);
      labs.forEach(function (l) { s += T(x1 + 6, l.y + F * 0.35, l.t, F, l.cls + ' num', 'start'); });
      var lastR = -1e9, yw = tw('26.01', F);
      allM.forEach(function (m, j) {
        var mm = +m.slice(5, 7); if (mm !== 1 && mm !== 7) return;
        var xx = x(j); if (xx - yw / 2 < lastR + 8 || xx + yw / 2 > w) return;
        s += T(xx, h - F * 0.35, ymShort(m), F, 'c-txt num', 'middle'); lastR = xx + yw / 2;
      });
      var at = function (arr, m) { var i = S.months.indexOf(m); return i < 0 ? null : arr[i]; };
      return {
        h: h, svg: s, stops: [[lastA[0], lastA[1]]],
        probe: function (px) {
          var j = Math.max(0, Math.min(n - 1, Math.round(x.inv(px)))), m = allM[j], ai = AM.indexOf(m), rows = [], dots = [];
          if (ai >= 0) { rows.push({ k: '--ink', label: '실제', value: A[ai].toFixed(1) }); dots.push({ x: x(j), y: y(A[ai]) }); }
          var a = at(S.A, m), b = at(S.B, m), c = at(S.C, m);
          if (a != null) rows.push({ k: '--down', label: 'A 박사 기본 (' + Math.round(at(S.Alo, m)) + '~' + Math.round(at(S.Ahi, m)) + ')', value: a.toFixed(0) });
          if (b != null) rows.push({ k: '--band-1', label: 'B 감산 해제', value: b.toFixed(0) });
          if (c != null) rows.push({ k: '--up', label: 'C 시장 전망', value: c.toFixed(0) });
          if (S.D && m === S.D.month) rows.push({ k: '--band-1', label: 'D 공급 모델 (' + Math.round(S.D.lo) + '~' + Math.round(S.D.hi) + ')', value: String(Math.round(S.D.mid)) });
          return { cx: x(j), cy0: 0, cy1: ch, dots: dots, title: ymText(m), rows: rows.length ? rows : [{ label: '자료 없음', value: '' }] };
        }
      };
    });
  }
  /* 가로 막대(+/−). d: {rows:[[이름, 종류(price|volume|claim), 값%]]} */
  function semiBars(el, d) {
    var R = d.rows;
    mount(el, '수출 금액·가격·물량 변화', function (w, F) {
      var labW = Math.max.apply(null, R.map(function (r) { return tw(r[0], F); })) + 10, valW = tw('+000%', F) + 6;
      var rowH = Math.max(F * 2, 30), barH = 14, h = rowH * R.length + 4, s = '';
      var vmin = Math.min(0, Math.min.apply(null, R.map(function (r) { return r[2]; }))), vmax = Math.max(0, Math.max.apply(null, R.map(function (r) { return r[2]; })));
      var x = lin(vmin, vmax, labW + valW, w - valW), xz = x(0);
      var rows = R.map(function (r, i) {
        var ry = i * rowH, by = ry + (rowH - barH) / 2, ty = by + barH / 2 + F * 0.35, xv = x(r[2]);
        s += T(0, ty, r[0], F, 'c-lab', 'start');
        s += hBar(xz, xv, by, barH, r[1] === 'claim' ? 'c-zone' : r[1] === 'price' ? 'f-up' : 'b1');
        s += T(r[2] >= 0 ? xv + 6 : xv - 6, ty, U.signPct(r[2], 0), F, 'c-strong num', r[2] >= 0 ? 'start' : 'end');
        return { y: ry, xv: xv, r: r };
      });
      s += L(xz, 0, xz, h, 'c-axis');
      return {
        h: h, svg: s, stops: rows.map(function (r) { return [w / 2, r.y + rowH / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(R.length - 1, Math.floor(py / rowH))), r = rows[i];
          return { band: { x: -4, y: r.y, w: w + 8, h: rowH }, ax: r.xv, ay: r.y, title: r.r[0],
            rows: [{ k: r.r[1] === 'claim' ? '--axis' : r.r[1] === 'price' ? '--up' : '--band-1', label: r.r[1] === 'claim' ? '박사 주장값' : '1년 전 같은 기간 대비', value: U.signPct(r.r[2], 1) }] };
        }
      };
    });
  }

  // ================================================================== 이주완 탭 · 사이클 (js/memory.js)
  // 해마다 1월(또는 n년마다)에 연도 라벨 — 겹치면 건너뜀
  function yearLabels(M, xOf, F, w, h, every) {
    var s = '', lastR = -1e9, yw = tw('0000', F);
    M.forEach(function (m, j) {
      if (m.slice(5) !== '01' || (+m.slice(0, 4)) % (every || 1)) return;
      var xx = xOf(j), x0 = xx - yw / 2; if (x0 < lastR + 6 || xx + yw / 2 > w || x0 < 0) return;
      s += T(xx, h - F * 0.35, m.slice(0, 4), F, 'c-txt num', 'middle'); lastR = xx + yw / 2;
    });
    return s;
  }

  /* 월별 지수 선(로그 눈금) 여러 개 + 하락기 회색 띠.
   * d: {lines:[{name, cls, key, pts:[[ym, v]]}], shades:[[ym0, ym1]]} — 모든 선은 같은 달 축(첫 선 기준) */
  function memLines(el, d) {
    var M = d.lines[0].pts.map(function (p) { return p[0]; }), n = M.length;
    var idx = {}; M.forEach(function (m, i) { idx[m] = i; });
    var vals = []; d.lines.forEach(function (l) { l.pts.forEach(function (p) { if (p[1] > 0) vals.push(p[1]); }); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    mount(el, d.label || '월별 가격 지수', function (w, F) {
      var top = F * 0.8, h = Math.round(F * 15), bot = h - F * 1.9;
      var ly = lin(Math.log(lo * 0.9), Math.log(hi * 1.1), bot, top), y = function (v) { return ly(Math.log(v)); };
      var ticks = []; [1, 2, 5].forEach(function (m0) { for (var e = -1; e <= 7; e++) { var t = m0 * Math.pow(10, e); if (t >= lo * 0.9 && t <= hi * 1.1) ticks.push(t); } });
      ticks.sort(function (a, b) { return a - b; });
      var left = Math.max.apply(null, ticks.map(function (t) { return tw(U.fmtInt(t), F); }).concat([tw('00', F)])) + 8;
      var ends = d.lines.map(function (l) { var p = l.pts[l.pts.length - 1]; return { l: l, v: p[1], s: l.name + ' ' + U.fmtInt(p[1]) }; });
      var right = Math.max.apply(null, ends.map(function (e) { return tw(e.s, F); })) + 10;
      var x = lin(0, n - 1, left, w - right), s = '';
      (d.shades || []).forEach(function (sh) {
        var a = idx[sh[0]], b = idx[sh[1]]; if (a == null && b == null) return;
        a = a == null ? 0 : a; b = b == null ? n - 1 : b;
        s += '<rect x="' + n1(x(a)) + '" y="' + n1(top) + '" width="' + n1(Math.max(1, x(b) - x(a))) + '" height="' + n1(bot - top) + '" class="c-track"/>';
      });
      ticks.forEach(function (t) { s += L(left, y(t), w - right, y(t), 'c-grid') + T(left - 6, y(t) + F * 0.35, U.fmtInt(t), F, 'c-txt num', 'end'); });
      d.lines.forEach(function (l) { s += P(poly(l.pts.filter(function (p) { return p[1] > 0; }).map(function (p) { return [x(idx[p[0]]), y(p[1])]; })), l.cls); });
      var lab = ends.map(function (e) { return { y: y(e.v) + F * 0.35, e: e }; });
      spread(lab, F * 1.2, top, bot);
      lab.forEach(function (o) { s += C(x(n - 1), y(o.e.v), 4, o.e.l.dot || 'c-dot') + T(w - right + 8, o.y, o.e.s, F, 'c-strong num', 'start'); });
      s += L(left, bot, w - right, bot, 'c-axis') + yearLabels(M, x, F, w - right, h, n > 150 ? 3 : 1);
      return {
        h: h, svg: s, stops: [[x(n - 1), top]],
        probe: function (px) {
          var j = Math.max(0, Math.min(n - 1, Math.round(x.inv(px))));
          var dots = [], rows = [];
          d.lines.forEach(function (l) { var p = l.pts[j]; if (p && p[1] > 0) { dots.push({ x: x(j), y: y(p[1]), r: 4.5, cls: l.dot || 'c-dot' }); rows.push({ k: l.key, label: l.name, value: (Math.round(p[1] * 10) / 10).toFixed(1) }); } });
          return { cx: x(j), cy0: top, cy1: bot, dots: dots, title: ymLab(M[j]), rows: rows };
        }
      };
    });
  }

  /* 월별 3개월 변화율 막대(0 기준, 오르면 빨강·내리면 파랑) + 이번 사이클 최고 표시.
   * d: {pts:[[ym, pct]], peak:{m, v}, label} */
  function memBars(el, d) {
    var pts = d.pts.filter(function (p) { return p[1] != null; }), n = pts.length;
    mount(el, d.label || '3개월 전 대비 변화율', function (w, F) {
      var top = F * 1.4, h = Math.round(F * 13), bot = h - F * 1.9;
      var vs = pts.map(function (p) { return p[1]; }), mn = Math.min(0, Math.min.apply(null, vs)), mx = Math.max(0, Math.max.apply(null, vs));
      var ticks = niceTicks(mn, mx, 4), y = lin(Math.min(mn, ticks[0]), Math.max(mx, ticks[ticks.length - 1]), bot, top);
      var left = Math.max.apply(null, ticks.map(function (t) { return tw((t > 0 ? '+' : '') + t + '%', F); })) + 8;
      var gw = (w - left) / n, bw = Math.max(2, Math.min(18, gw * 0.7)), s = '';
      var x = function (j) { return left + gw * (j + 0.5); };
      ticks.forEach(function (t) { s += L(left, y(t), w, y(t), t === 0 ? 'c-axis' : 'c-grid') + T(left - 6, y(t) + F * 0.35, (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t) + '%', F, 'c-txt num', 'end'); });
      pts.forEach(function (p, j) {
        var y0 = y(0), y1 = y(p[1]), hh = Math.abs(y1 - y0); if (hh < 0.5) return;
        var r = Math.min(3, bw / 2, hh), xx = x(j) - bw / 2, cls = p[1] >= 0 ? 'f-up' : 'f-down', dd;
        if (p[1] >= 0) dd = 'M' + n1(xx) + ',' + n1(y0) + 'V' + n1(y1 + r) + 'Q' + n1(xx) + ',' + n1(y1) + ' ' + n1(xx + r) + ',' + n1(y1) + 'H' + n1(xx + bw - r) + 'Q' + n1(xx + bw) + ',' + n1(y1) + ' ' + n1(xx + bw) + ',' + n1(y1 + r) + 'V' + n1(y0) + 'Z';
        else dd = 'M' + n1(xx) + ',' + n1(y0) + 'V' + n1(y1 - r) + 'Q' + n1(xx) + ',' + n1(y1) + ' ' + n1(xx + r) + ',' + n1(y1) + 'H' + n1(xx + bw - r) + 'Q' + n1(xx + bw) + ',' + n1(y1) + ' ' + n1(xx + bw) + ',' + n1(y1 - r) + 'V' + n1(y0) + 'Z';
        s += P(dd, cls);
      });
      var pk = -1; pts.forEach(function (p, j) { if (d.peak && p[0] === d.peak.m) pk = j; });
      if (pk >= 0) {
        var lab = '최고 ' + U.signPct(pts[pk][1], 0), lw2 = tw(lab, F), lx = Math.max(left + lw2 / 2, Math.min(w - lw2 / 2, x(pk)));
        s += T(lx, y(pts[pk][1]) - 6, lab, F, 'c-strong num', 'middle');
      }
      s += yearLabels(pts.map(function (p) { return p[0]; }), x, F, w, h, 1);
      return {
        h: h, svg: s, stops: pts.map(function (p, j) { return [x(j), top]; }).filter(function (p, j) { return j % 3 === 0 || j === n - 1; }),
        probe: function (px) {
          var j = Math.max(0, Math.min(n - 1, Math.floor((px - left) / gw))), p = pts[j];
          return { band: { x: x(j) - gw / 2, y: top, w: gw, h: bot - top }, ax: x(j), ay: top, title: ymLab(p[0]),
            rows: [{ k: p[1] >= 0 ? '--up' : '--down', label: '3개월 전보다', value: U.signPct(p[1], 1) }] };
        }
      };
    });
  }

  /* 지난 상승기 비교 가로 막대(저점→고점 상승률). d: {rows:[{label, pct, months, cur}]} */
  function cycleBars(el, d) {
    var rows = d.rows;
    mount(el, '지난 상승기와 지금 비교', function (w, F) {
      var barH = 16, rowH = Math.max(F * 1.5, barH) + 12, h = rows.length * rowH, s = '';
      var labW = Math.max.apply(null, rows.map(function (r) { return tw(r.label, F, r.cur); })) + 10;
      var vtx = rows.map(function (r) { return U.signPct(r.pct, 0) + ' · ' + r.months + '개월'; });
      var valW = Math.max.apply(null, vtx.map(function (t) { return tw(t, F); })) + 8;
      var mx = Math.max.apply(null, rows.map(function (r) { return r.pct; })), x = lin(0, mx, labW, w - valW);
      rows.forEach(function (r, i) {
        var yy = i * rowH + (rowH - barH) / 2;
        s += T(labW - 8, yy + barH / 2 + F * 0.35, r.label, F, r.cur ? 'c-strong' : 'c-lab', 'end');
        s += hBar(x(0), x(Math.max(0, r.pct)), yy, barH, r.cur ? 'b1' : 'b4');
        s += T(x(Math.max(0, r.pct)) + 6, yy + barH / 2 + F * 0.35, vtx[i], F, r.cur ? 'c-strong num' : 'c-txt num', 'start');
      });
      return {
        h: h, svg: s, stops: rows.map(function (r, i) { return [w / 2, i * rowH + rowH / 2]; }),
        probe: function (px, py) {
          var i = Math.max(0, Math.min(rows.length - 1, Math.floor(py / rowH))), r = rows[i];
          return { band: { x: -4, y: i * rowH, w: w + 8, h: rowH }, ax: x(Math.max(0, r.pct)), ay: i * rowH, title: r.full || r.label,
            rows: [{ k: r.cur ? '--band-1' : '--band-4', label: '저점에서', value: U.signPct(r.pct, 0) }, { label: '기간', value: r.months + '개월' }] };
        }
      };
    });
  }

  /* 과거 같은 신호 뒤 6개월 결과 점: 더 낮아짐 파랑, 더 높아짐 빨강, 아직 모름 빈 원. d: {eps:[{m, chg6Pct}]} */
  function eventDots(el, d) {
    var eps = d.eps;
    mount(el, '같은 신호가 나왔던 때와 6개월 뒤', function (w, F) {
      var n = eps.length, sp = w / n, r = Math.max(4, Math.min(9, sp * 0.36)), cy = r + 6, h = cy + r + F * 1.6, s = '';
      var x = function (i) { return sp * (i + 0.5); };
      eps.forEach(function (e, i) {
        s += e.chg6Pct == null ? C(x(i), cy, r - 1, 'c-out') : C(x(i), cy, r, e.chg6Pct < 0 ? 'f-down' : 'f-up');
      });
      s += T(0, h - F * 0.3, eps[0].m.slice(0, 4), F, 'c-txt num', 'start') + T(w, h - F * 0.3, eps[n - 1].m.slice(0, 4), F, 'c-txt num', 'end');
      return {
        h: h, svg: s, stops: eps.map(function (e, i) { return [x(i), cy]; }),
        probe: function (px) {
          var i = Math.max(0, Math.min(n - 1, Math.floor(px / sp))), e = eps[i];
          return { band: { x: x(i) - sp / 2, y: 0, w: sp, h: cy * 2 }, ax: x(i), ay: 0, title: ymLab(e.m) + ' 신호',
            rows: e.chg6Pct == null ? [{ label: '6개월 뒤', value: '아직 몰라요' }] : [{ k: e.chg6Pct < 0 ? '--down' : '--up', label: '6개월 뒤 가격', value: U.signPct(e.chg6Pct, 0) }] };
        }
      };
    });
  }

  /* 유럽 국채 위험 지수 흐름: 여러 나라 선, 고른 나라만 굵게(나머지는 연한 회색), 위험 구간 띠와 100 위기선.
   * d: {months, series:[{c, name, values}], focus} */
  function esriHist(el, d) {
    var M = d.months, n = M.length, Sx = d.series;
    mount(el, '유럽 국채 위험 지수 흐름', function (w, F) {
      var vals = []; Sx.forEach(function (s) { s.values.forEach(function (v) { if (v != null) vals.push(v); }); });
      var hi = Math.max(110, Math.max.apply(null, vals) * 1.05);
      var tk = [0, 25, 50, 75, 100].concat(hi > 130 ? [125] : []), labW = tw('100', F) + 8;
      var ends = Sx.map(function (s) { var v = s.values[n - 1]; return v == null ? null : { s: s, v: v, t: s.name + ' ' + Math.round(v) }; }).filter(Boolean);
      var endW = Math.max.apply(null, ends.map(function (e) { return tw(e.t, F, true); }).concat([0])) + 10;
      var x0 = labW, x1 = w - endW, ch = Math.round(F * 13), axisH = F * 1.8, h = ch + axisH, sv = '';
      var x = lin(0, Math.max(1, n - 1), x0, x1), y = lin(0, hi, ch - 4, 4);
      [[50, 75, 'euz-warn'], [75, 100, 'euz-high'], [100, hi, 'euz-crit']].forEach(function (z) {
        sv += '<rect x="' + n1(x0) + '" y="' + n1(y(z[1])) + '" width="' + n1(x1 - x0) + '" height="' + n1(y(z[0]) - y(z[1])) + '" class="' + z[2] + '"/>';
      });
      tk.forEach(function (t) { sv += L(x0, y(t), x1, y(t), t === 100 ? 'euz-line' : 'c-grid') + T(0, y(t) + F * 0.35, String(t), F, 'c-txt num', 'start'); });
      var order = Sx.slice().sort(function (a, b) { return (a.c === d.focus) - (b.c === d.focus); });
      order.forEach(function (sr) {
        var segs = [], cur = [];
        sr.values.forEach(function (v, j) { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(j), y(v)]); });
        if (cur.length) segs.push(cur);
        segs.forEach(function (sg) { sv += P(poly(sg), sr.c === d.focus ? 'eu-focus' : 'eu-other'); });
      });
      var lab = ends.map(function (e) { return { y: y(e.v) + F * 0.35, e: e }; });
      spread(lab, F * 1.2, F, ch);
      lab.forEach(function (o) { sv += T(x1 + 6, o.y, o.e.t, F, o.e.s.c === d.focus ? 'c-strong num' : 'c-txt num', 'start'); });
      var lastR = -1e9, yw = tw('2026', F), step = n > 180 ? 5 : n > 60 ? 2 : 1;
      M.forEach(function (m, j) {
        if (m.slice(5) !== '01' || (+m.slice(0, 4)) % step) return;
        var xx = x(j); if (xx - yw / 2 < lastR + 10 || xx + yw / 2 > x1) return;
        sv += T(xx, h - F * 0.35, m.slice(0, 4), F, 'c-txt num', 'middle'); lastR = xx + yw / 2;
      });
      return {
        h: h, svg: sv, stops: [[x(n - 1), ch / 2]],
        probe: function (px) {
          var j = Math.max(0, Math.min(n - 1, Math.round(x.inv(px))));
          return { cx: x(j), cy0: 0, cy1: ch, dots: Sx.filter(function (sr) { return sr.c === d.focus && sr.values[j] != null; }).map(function (sr) { return { x: x(j), y: y(sr.values[j]) }; }),
            title: ymText(M[j]), rows: Sx.map(function (sr) { return { k: sr.c === d.focus ? '--band-1' : '--axis', label: sr.name, value: sr.values[j] == null ? '–' : String(Math.round(sr.values[j])) }; }) };
        }
      };
    });
  }
  /* 일별 한 줄 차트(최근 1년). d: {rows:[[날짜, 값]], fmt, label} */
  function esriDaily(el, d) {
    var R = d.rows.filter(function (r) { return r[1] != null; }), n = R.length;
    if (!n) return;
    mount(el, d.label, function (w, F) {
      var v = R.map(function (r) { return r[1]; }), lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
      var tk = niceTicks(lo - pad, hi + pad, 3), labW = Math.max.apply(null, tk.map(function (t) { return tw(d.fmt(t), F); })) + 8;
      var x0 = labW, x1 = w - 6, ch = Math.round(F * 6.5), axisH = F * 1.7, h = ch + axisH, s = '';
      var x = lin(0, n - 1, x0, x1), y = lin(Math.min(tk[0], lo - pad), Math.max(tk[tk.length - 1], hi + pad), ch - 3, 3);
      tk.forEach(function (t) { s += L(x0, y(t), x1, y(t), 'c-grid') + T(0, y(t) + F * 0.35, d.fmt(t), F, 'c-txt num', 'start'); });
      s += P(poly(R.map(function (r, j) { return [x(j), y(r[1])]; })), 'c-line') + C(x(n - 1), y(v[n - 1]), 4, 'c-dot');
      var lastR = -1e9, lw = tw('12월', F);
      R.forEach(function (r, j) {
        if (j && r[0].slice(5, 7) === R[j - 1][0].slice(5, 7)) return;
        var mm = +r[0].slice(5, 7); if (mm % 3 !== 1) return;
        var xx = x(j); if (xx - lw / 2 < lastR + 8 || xx + lw / 2 > w || xx - lw / 2 < x0 - 4) return;
        s += T(xx, h - F * 0.35, mm === 1 ? r[0].slice(0, 4) : mm + '월', F, 'c-txt num', 'middle'); lastR = xx + lw / 2;
      });
      return {
        h: h, svg: s, stops: [[x(n - 1), y(v[n - 1])]],
        probe: function (px) {
          var j = Math.max(0, Math.min(n - 1, Math.round(x.inv(px))));
          return { cx: x(j), cy0: 0, cy1: ch, dots: [{ x: x(j), y: y(v[j]) }], title: U.fmtDateLong(R[j][0]), rows: [{ label: d.label, value: d.fmt(v[j]) }] };
        }
      };
    });
  }

  root.Charts = {
    esriHist: esriHist, esriDaily: esriDaily,
    memLines: memLines, memBars: memBars, cycleBars: cycleBars, eventDots: eventDots,
    semiLines: semiLines, semiPrice: semiPrice, semiBars: semiBars,
    heat: heat, monthBars: monthBars, sungIndex: sungIndex, jwPriceVol: jwPriceVol,
    fan: fan, density: density, gauge: gauge, ladder: ladder, scenarios: scenarios, moves: moves,
    bands: bands, calibration: calibration, tiers: tiers, rolling: rolling, dots: dots, dayBar: dayBar,
    redrawAll: redrawAll, reset: reset, _tw: tw, _niceTicks: niceTicks
  };
})(window);
