/* 이주완 탭 '사이클' 화면 자료 만들기
 *   node tools/memory/build-memory.js [--csv tools/semi/data/ecos_raw_wide.csv] [--out 경로]
 *
 * 1) tools/memory/ecos_history.json(저장해 둔 D램·플래시 수출물가지수, 1995-01~)을 읽는다.
 * 2) --csv가 있으면 semi-data 작업(tools/semi/update_data.py)이 ECOS에서 막 받은 표의
 *    xp_dram_C·xp_dram_W·xp_flash_C·xp_flash_W 열로 같은 달 값을 바꾸고 새 달을 덧붙인다.
 *    (ECOS는 한 번만 받는다 — 인증키도 그 작업의 ECOS_API_KEY 비밀값 하나만 쓴다.)
 * 3) memcalc.js로 사이클을 계산해 결과 JSON을 쓴다(기본: www/data/memory.json = APK에 묶이는 자료).
 *    매일 작업에서는 --out tools/semi/out/memory.json 으로 써서 semi-data 가지에 함께 올린다. */
'use strict';
const fs = require('fs');
const path = require('path');
const calc = require('./memcalc.js');

const ROOT = path.join(__dirname, '..', '..');
const HIST = path.join(__dirname, 'ecos_history.json');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const CSV = arg('--csv');
const OUT = path.resolve(ROOT, arg('--out') || 'www/data/memory.json');
const COLS = { dram_cc: 'xp_dram_C', dram_krw: 'xp_dram_W', nand_cc: 'xp_flash_C', nand_krw: 'xp_flash_W' };

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/), head = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','), o = {}; head.forEach((h, i) => { o[h] = c[i]; }); return o; });
}

function main() {
  const hist = JSON.parse(fs.readFileSync(HIST, 'utf8'));
  let src = { status: 'seed', message: '저장된 이력만 사용' };
  if (CSV) {
    const rows = readCsv(CSV), byM = {};
    hist.rows.forEach((r) => { byM[r.m] = r; });
    let changed = 0, added = 0, latest = null;
    rows.forEach((r) => {
      const m = String(r.month).slice(0, 4) + '-' + String(r.month).slice(4, 6);
      const vals = {}; Object.entries(COLS).forEach(([f, c]) => { const v = parseFloat(r[c]); if (v > 0) vals[f] = Math.round(v * 100) / 100; });
      if (vals.dram_cc == null || m < '1995-01') return;   // D램 값이 있는 달만
      let row = byM[m];
      if (!row) { row = { m: m }; byM[m] = row; hist.rows.push(row); added++; }
      Object.entries(vals).forEach(([f, v]) => { if (row[f] !== v) { row[f] = v; changed++; } });
      if (!latest || m > latest) latest = m;
    });
    hist.rows.sort((a, b) => (a.m < b.m ? -1 : 1));
    hist.rows.forEach((r) => { delete r.p; });
    hist.rows[hist.rows.length - 1].p = true;   // 가장 최근 달은 잠정치
    calc.clean(hist.rows.map((r) => ({ m: r.m, v: r.dram_cc })));   // 빈 달이 생기면 여기서 멈춤
    src = { status: 'ecos', message: `ECOS 표에서 최신 ${latest} (바뀐 값 ${changed}개, 새 달 ${added}개)` };
  }
  console.log(src.message);
  const last = hist.rows[hist.rows.length - 1];
  const res = {
    v: 1,
    source: { name: '한국은행 경제통계시스템(ECOS) 수출물가지수(품목별)', basis: '계약통화 기준 · 2020=100', url: 'https://ecos.bok.or.kr/' },
    latest: { month: last.m, prelim: !!last.p },
    ecos: src,
    items: {
      dram: Object.assign({ name: 'D램' }, calc.analyze(hist.rows.map((r) => ({ m: r.m, v: r.dram_cc })), '1996-01')),
      nand: Object.assign({ name: '낸드(플래시)' }, calc.analyze(hist.rows.map((r) => ({ m: r.m, v: r.nand_cc })), '2003-01'))
    }
  };
  Object.values(res.items).forEach((it) => { it.series = it.series.filter((p) => p[0] >= '2005-01'); });   // 앱 차트는 2005년부터
  res.builtAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(res));
  const d = res.items.dram;
  console.log(`썼어요: ${path.relative(ROOT, OUT)} · 최신 ${res.latest.month}${res.latest.prelim ? '(잠정)' : ''} · D램 ${d.phase.label} · 3개월 ${d.current.r3Pct}%`);
}
main();
