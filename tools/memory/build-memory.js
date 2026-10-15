/* '반도체' 탭 자료 만들기 — node tools/memory/build-memory.js
 *
 * 1) tools/memory/ecos_history.json(저장해 둔 월별 지수)을 읽는다.
 * 2) 환경변수 ECOS_API_KEY가 있으면 한국은행 ECOS Open API에서 최근 36개월을 받아 덮어쓰고(수정·잠정치 반영) 이력 파일도 고친다.
 *    - 통계표 코드·항목 코드는 이름으로 찾는다('수출물가지수' + '품목별', 'DRAM', '플래시메모리', '계약통화기준', '원화기준').
 *      ECOS_STAT_CODE로 통계표 코드를 직접 줄 수도 있다.
 *    - 받다가 실패하면 저장된 이력으로 계속 만들고 그 사실을 결과의 ecos.status에 남긴다(앱에 '최근 갱신 실패'로 보임).
 * 3) memcalc.js로 사이클을 계산해 www/data/memory.json을 쓴다(앱이 GitHub에서 받아 보는 파일, APK에도 묶임).
 *
 * 출력이 바뀌지 않으면 파일을 다시 쓰지 않는다(시각만 바뀐 커밋을 만들지 않게). */
'use strict';
const fs = require('fs');
const path = require('path');
const calc = require('./memcalc.js');

const ROOT = path.join(__dirname, '..', '..');
const HIST = path.join(__dirname, 'ecos_history.json');
const OUT = path.join(ROOT, 'www', 'data', 'memory.json');
const KEY = (process.env.ECOS_API_KEY || '').trim();
const API = 'https://ecos.bok.or.kr/api';

function log(s) { process.stdout.write(s + '\n'); }
async function getJson(url, label) {
  let last;
  for (let a = 1; a <= 3; a++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.RESULT && j.RESULT.CODE && j.RESULT.CODE !== 'INFO-000') throw new Error(j.RESULT.CODE + ' ' + (j.RESULT.MESSAGE || ''));
      return j;
    } catch (e) { last = e; log('  ' + label + ' ' + a + '번째 실패: ' + e.message); await new Promise((res) => setTimeout(res, 3000 * a)); }
  }
  throw last;
}
const k = (s) => String(s || '').replace(/\s+/g, '');

async function fetchEcos(hist) {
  const key = encodeURIComponent(KEY);
  // 통계표 찾기
  let stat = (process.env.ECOS_STAT_CODE || '').trim(), statName = '';
  if (!stat) {
    const j = await getJson(`${API}/StatisticTableList/${key}/json/kr/1/20000/`, '통계표 목록');
    const rows = (j.StatisticTableList && j.StatisticTableList.row) || [];
    const hit = rows.filter((r) => /수출물가지수/.test(r.STAT_NAME) && /품목별/.test(r.STAT_NAME) && r.SRCH_YN === 'Y');
    if (!hit.length) throw new Error('수출물가지수(품목별) 통계표를 찾지 못함');
    stat = hit[0].STAT_CODE; statName = hit[0].STAT_NAME;
  }
  log('  통계표 ' + stat + ' ' + statName);
  // 항목 찾기
  const il = await getJson(`${API}/StatisticItemList/${key}/json/kr/1/20000/${stat}`, '항목 목록');
  const items = (il.StatisticItemList && il.StatisticItemList.row) || [];
  const find = (name) => items.find((r) => k(r.ITEM_NAME) === k(name));
  const want = { dram: find('DRAM'), nand: find('플래시메모리') };
  if (!want.dram || !want.nand) throw new Error('DRAM·플래시메모리 항목을 찾지 못함');
  const grpOrder = []; items.forEach((r) => { if (grpOrder.indexOf(r.GRP_CODE) < 0) grpOrder.push(r.GRP_CODE); });
  // 최근 36개월
  const now = new Date(Date.now() + 9 * 3600e3), endN = now.getUTCFullYear() * 12 + now.getUTCMonth(), startN = endN - 36;
  const ym = (n) => calc.nToYm(n).replace('-', '');
  const got = {};
  for (const [name, it] of Object.entries(want)) {
    const pos = grpOrder.indexOf(it.GRP_CODE);   // 0이면 ITEM_CODE1 자리
    const codes = pos === 0 ? it.ITEM_CODE : '?/' + it.ITEM_CODE;
    const url = `${API}/StatisticSearch/${key}/json/kr/1/1000/${stat}/M/${ym(startN)}/${ym(endN)}/${codes}`;
    const j = await getJson(url, name + ' 시세');
    const rows = (j.StatisticSearch && j.StatisticSearch.row) || [];
    rows.forEach((r) => {
      const names = [r.ITEM_NAME1, r.ITEM_NAME2, r.ITEM_NAME3].map(k).join('|');
      const cur = /계약통화기준/.test(names) ? 'cc' : /원화기준/.test(names) ? 'krw' : null;
      if (!cur || !/DRAM|플래시메모리/.test(names)) return;
      const m = String(r.TIME).slice(0, 4) + '-' + String(r.TIME).slice(4, 6), v = parseFloat(String(r.DATA_VALUE).replace(/,/g, ''));
      if (!(v > 0)) return;
      (got[m] = got[m] || {})[name + '_' + cur] = Math.round(v * 100) / 100;
    });
  }
  const months = Object.keys(got).sort();
  if (!months.length) throw new Error('받은 값이 없음');
  // 이력에 합치기: 같은 달은 새 값으로, 새 달은 덧붙임(빈 달이 생기면 중단)
  const byM = {}; hist.rows.forEach((r) => { byM[r.m] = r; });
  let changed = 0;
  months.forEach((m) => {
    const row = byM[m] || { m: m };
    ['dram_cc', 'dram_krw', 'nand_cc', 'nand_krw'].forEach((f) => { if (got[m][f] != null && row[f] !== got[m][f]) { row[f] = got[m][f]; changed++; } });
    delete row.p;
    if (!byM[m]) { byM[m] = row; hist.rows.push(row); }
  });
  hist.rows.sort((a, b) => (a.m < b.m ? -1 : 1));
  hist.rows.forEach((r) => { delete r.p; });
  hist.rows[hist.rows.length - 1].p = true;   // 가장 최근 달은 잠정치
  calc.clean(hist.rows.map((r) => ({ m: r.m, v: r.dram_cc })));   // 빈 달 확인
  return { stat, months: months.length, latest: months[months.length - 1], changed };
}

async function main() {
  const hist = JSON.parse(fs.readFileSync(HIST, 'utf8'));
  let ecos = { status: 'seed', message: '저장된 이력 사용(인증키 없음)' };
  if (KEY) {
    try {
      const r = await fetchEcos(hist);
      ecos = { status: 'api', message: `ECOS에서 ${r.months}개월 받음(최신 ${r.latest}, 바뀐 값 ${r.changed}개)`, stat: r.stat };
      if (r.changed) { hist.updated = new Date().toISOString().slice(0, 10); fs.writeFileSync(HIST, JSON.stringify(hist, null, 0)); }
    } catch (e) {
      ecos = { status: 'error', message: 'ECOS 받기 실패: ' + e.message };
      process.exitCode = 0;   // 저장된 자료로 계속 — 실패 사실은 결과에 남김
    }
  }
  log(ecos.message);
  const rows = hist.rows, last = rows[rows.length - 1];
  const res = {
    v: 1,
    source: { name: '한국은행 경제통계시스템(ECOS) 수출물가지수(품목별)', basis: '계약통화 기준 · 2020=100', url: 'https://ecos.bok.or.kr/' },
    latest: { month: last.m, prelim: !!last.p },
    ecos: ecos,
    items: {
      dram: Object.assign({ name: 'D램' }, calc.analyze(rows.map((r) => ({ m: r.m, v: r.dram_cc })), '1996-01')),
      nand: Object.assign({ name: '낸드(플래시)' }, calc.analyze(rows.map((r) => ({ m: r.m, v: r.nand_cc })), '2003-01'))
    }
  };
  // 앱 차트에는 2005년부터만(파일 크기)
  Object.values(res.items).forEach((it) => { it.series = it.series.filter((p) => p[0] >= '2005-01'); });
  const body = JSON.stringify(res);
  let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* 처음 */ }
  const same = prev && JSON.stringify(Object.assign({}, prev, { builtAt: undefined, ecos: undefined })) === JSON.stringify(Object.assign({}, res, { ecos: undefined }));
  if (same && prev.ecos && prev.ecos.status === ecos.status) { log('바뀐 것 없음: ' + path.relative(ROOT, OUT)); return; }
  res.builtAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(res));
  const d = res.items.dram;
  log(`썼어요: ${path.relative(ROOT, OUT)} · 최신 ${res.latest.month}${res.latest.prelim ? '(잠정)' : ''} · D램 ${d.phase.label} · 3개월 ${d.current.r3Pct}%`);
}
main().catch((e) => { console.error(e); process.exit(1); });
