# -*- coding: utf-8 -*-
"""메모리 가격 사이클 모델 — '6개월 뒤 가격이 지금보다 낮을 확률'과 통계청 공급 점검을 memory.json에 더한다.

  python tools/memory/cycle_extra.py --csv tools/semi/data/ecos_raw_wide.csv --mem tools/semi/out/memory.json [--kosis-key 키]

1) 확률 (사이클 모델 v1, 회준님 PC의 YouTubeArchive/people/이주완/model/verify/new_data/cycle_model_v2.py '가격만' 판과 같은 계산)
   - 입력: 한국은행 수출물가지수 D램·플래시(계약통화). 변수 4개: 3개월 상승률, 그 가속도, 1년 상승률, 12개월 최고점 대비.
   - D램·낸드를 함께 로지스틱 회귀로 학습(C=0.5, 표준화). 매달 그 6개월 전까지 결과가 나온 자료로만 다시 학습(walk-forward).
   - 재고·출하·생산능력 등 공급 변수를 더한 v2는 실시간 조건에서 나아지지 않아(검토 결과) 확률은 이 v1을 쓴다.
2) 공급 점검 (통계청 KOSIS 광업제조업동향, 반도체 제조업 C261 생산·출하·재고지수)
   - tools/semi/data/kosis_semi_C261.csv 를 쓴다. --kosis-key(또는 환경변수 KOSIS_API_KEY)가 있으면 먼저 새로 받아 덮어쓴다.
   - 재고/출하 비율(계절조정)이 낮을수록 공급이 빠듯하다는 뜻.
"""
import argparse, csv, json, math, os, sys, urllib.parse, urllib.request
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
KOSIS_CSV = os.path.join(ROOT, 'tools', 'semi', 'data', 'kosis_semi_C261.csv')
HZ = 6
FEATS = ['r3', 'acc', 'yoy', 'dd']
FEAT_TXT = {'r3': '최근 3개월 상승률', 'acc': '오르는 속도의 변화', 'yoy': '1년 상승률', 'dd': '1년 최고점 대비 위치'}


def r(x, n=3):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), n)


# ------------------------------------------------------------------ 확률 모델
def price_frame(csv_path):
    w = pd.read_csv(csv_path, dtype={'month': str})
    w['m'] = pd.PeriodIndex(w.month.str[:4] + '-' + w.month.str[4:6], freq='M')
    w = w.set_index('m').sort_index()
    return pd.to_numeric(w.xp_dram_C, errors='coerce'), pd.to_numeric(w.xp_flash_C, errors='coerce')


def item_frame(p, item):
    p = p.dropna()
    p = p[p > 0]
    f = pd.DataFrame(index=p.index)
    f['r3'] = np.log(p).diff(3)
    f['acc'] = f.r3 - f.r3.shift(3)
    f['yoy'] = np.log(p).diff(12)
    f['dd'] = np.log(p) - np.log(p.rolling(12).max())
    f['y'] = (p.shift(-HZ) < p).astype(float).where(p.shift(-HZ).notna())
    f['item'] = item
    f['is_nand'] = float(item == 'NAND')
    return f


def fit(F, t):
    tr = F[F.index <= t - HZ].dropna(subset=FEATS + ['y'])
    X = tr[FEATS + ['is_nand']].values
    mu, sd = X.mean(0), X.std(0) + 1e-9
    m = LogisticRegression(C=0.5, max_iter=2000).fit((X - mu) / sd, tr.y.values)
    return m, mu, sd, tr


def walk(F, start):
    rows = []
    last = F.dropna(subset=FEATS).index.max()
    for t in pd.period_range(start, last, freq='M'):
        te = F[F.index == t].dropna(subset=FEATS)
        if te.empty:
            continue
        m, mu, sd, tr = fit(F, t)
        if len(tr) < 60:
            continue
        p = m.predict_proba((te[FEATS + ['is_nand']].values - mu) / sd)[:, 1]
        for (_, row), pi in zip(te.iterrows(), p):
            rows.append({'month': str(t), 'item': row['item'], 'p': pi, 'clim': tr.y.mean(), 'y': row['y']})
    return pd.DataFrame(rows), last


def prob_block(csv_path):
    dram, nand = price_frame(csv_path)
    F = pd.concat([item_frame(dram, 'DRAM'), item_frame(nand, 'NAND')])
    F = F[F.index >= pd.Period('1997-01', 'M')]
    df, last = walk(F, '2006-01')
    d = df.dropna(subset=['y'])
    brier = ((d.p - d.y) ** 2).mean()
    brier_clim = ((d.clim - d.y) ** 2).mean()
    metrics = {'from': d.month.min(), 'to': d.month.max(), 'n': int(len(d)), 'auc': r(roc_auc_score(d.y, d.p)),
               'brier': r(brier), 'brierClim': r(brier_clim), 'gainPct': r((1 - brier / brier_clim) * 100, 1),
               'hit': r(((d.p > 0.5) == (d.y == 1)).mean() * 100, 1), 'baseRate': r(d.y.mean() * 100, 1)}
    # 확률 높을 때(60% 이상) 실제로 6개월 뒤 더 낮았던 비율
    hi = d[d.p >= 0.6]
    metrics['hiN'] = int(len(hi))
    metrics['hiDown'] = r(hi.y.mean() * 100, 1) if len(hi) else None
    piv = df.pivot(index='month', columns='item', values='p').sort_index()
    hist = [[m, r(row.get('DRAM'), 3), r(row.get('NAND'), 3)] for m, row in piv.iterrows()]
    # 지금 달 기여도(표준화 값 × 계수): 어느 변수가 확률을 어느 쪽으로 미는지
    out = {'month': str(last), 'metrics': metrics, 'hist': hist, 'items': {}}
    m, mu, sd, tr = fit(F, last)
    for item in ('DRAM', 'NAND'):
        row = F[(F.index == last) & (F.item == item)].dropna(subset=FEATS)
        if row.empty:
            continue
        x = (row[FEATS + ['is_nand']].values[0] - mu) / sd
        contrib = dict(zip(FEATS + ['is_nand'], (x * m.coef_[0]).tolist()))
        p = float(m.predict_proba(x.reshape(1, -1))[:, 1][0])
        prev = piv[item].dropna()
        prev3 = prev.iloc[-4] if len(prev) >= 4 else None
        drivers = sorted(FEATS, key=lambda k: -abs(contrib[k]))
        out['items'][item.lower()] = {
            'p': r(p), 'p3ago': r(prev3), 'trainN': int(len(tr)),
            'drivers': [{'k': k, 'name': FEAT_TXT[k], 'dir': 'down' if contrib[k] > 0 else 'up', 'size': r(abs(contrib[k]), 2)} for k in drivers]}
    return out


# ------------------------------------------------------------------ 통계청 공급
def fetch_kosis(key):
    """KOSIS 광업제조업동향(DT_1F02001) 반도체 제조업(C261) 생산·출하·재고지수 원계열(T10~12)·계절조정(T20~22)."""
    q = {'method': 'getList', 'apiKey': key, 'itmId': 'T10+T11+T12+T20+T21+T22+', 'objL1': '00', 'objL2': 'C261',
         'objL3': '', 'objL4': '', 'objL5': '', 'objL6': '', 'objL7': '', 'objL8': '', 'format': 'json', 'jsonVD': 'Y',
         'prdSe': 'M', 'startPrdDe': '199001', 'endPrdDe': pd.Timestamp.today().strftime('%Y%m'), 'orgId': '101', 'tblId': 'DT_1F02001'}
    url = 'https://kosis.kr/openapi/Param/statisticsParameterData.do?' + urllib.parse.urlencode(q, safe='+')
    with urllib.request.urlopen(url, timeout=60) as resp:
        j = json.loads(resp.read().decode('utf-8'))
    if not isinstance(j, list):
        raise RuntimeError('KOSIS 응답 이상: ' + str(j)[:200])
    by = {}
    for x in j:
        by.setdefault(x['PRD_DE'], {})[x['ITM_ID']] = x['DT']
    months = sorted(by)
    old = sum(1 for _ in open(KOSIS_CSV, encoding='utf-8')) - 1 if os.path.exists(KOSIS_CSV) else 0
    if len(months) < max(300, old):
        raise RuntimeError(f'KOSIS 자료가 너무 적음({len(months)}개월, 전에는 {old})')
    with open(KOSIS_CSV, 'w', newline='', encoding='utf-8') as f:
        wr = csv.writer(f)
        wr.writerow(['month', 'prod', 'ship', 'inv', 'prod_sa', 'ship_sa', 'inv_sa'])
        for mth in months:
            v = by[mth]
            wr.writerow([mth] + [v.get(k, '') for k in ('T10', 'T11', 'T12', 'T20', 'T21', 'T22')])
    return months[-1]


def kosis_block(status):
    k = pd.read_csv(KOSIS_CSV, dtype={'month': str})
    k['m'] = pd.PeriodIndex(k.month.str[:4] + '-' + k.month.str[4:6], freq='M')
    k = k.set_index('m').sort_index().apply(pd.to_numeric, errors='coerce').dropna(subset=['inv_sa', 'ship_sa'])
    ratio = k.inv_sa / k.ship_sa
    since = ratio['2000-01':]
    last = k.index[-1]
    s3 = lambda c: k[c].rolling(3).sum()
    yo = lambda c: r((s3(c).iloc[-1] / s3(c).iloc[-13] - 1) * 100, 1)
    lo_m = since.idxmin()
    rat15 = ratio['2015-01':]
    pct_rank = r((since < ratio.iloc[-1]).mean() * 100, 0)   # 2000년 이후 지금보다 낮았던 달 비율
    return {
        'status': status, 'month': str(last),
        'ratio': r(ratio.iloc[-1], 2), 'ratioAvg': r(since.mean(), 2), 'ratioMin': r(since.min(), 2), 'ratioMinMonth': str(lo_m),
        'ratio6ago': r(ratio.iloc[-7], 2), 'lowerShare': pct_rank,
        'invYoy': yo('inv'), 'shipYoy': yo('ship'), 'prodYoy': yo('prod'),
        'series': [[str(m), r(v, 2)] for m, v in rat15.items()],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default=os.path.join(ROOT, 'tools', 'semi', 'data', 'ecos_raw_wide.csv'))
    ap.add_argument('--mem', default=os.path.join(ROOT, 'www', 'data', 'memory.json'))
    ap.add_argument('--kosis-key', default=os.environ.get('KOSIS_API_KEY', ''))
    a = ap.parse_args()
    mem = json.load(open(a.mem, encoding='utf-8'))
    prob = prob_block(a.csv)
    mem['prob'] = prob
    status = {'state': 'saved', 'message': '저장해 둔 통계청 자료'}
    if a.kosis_key:
        try:
            lm = fetch_kosis(a.kosis_key)
            status = {'state': 'kosis', 'message': f'통계청에서 새로 받음(최신 {lm})'}
        except Exception as ex:   # 못 받으면 저장된 표를 그대로 쓴다
            status = {'state': 'error', 'message': '통계청에서 새로 받지 못해 저장된 자료를 씀'}
            print('KOSIS 실패:', ex, file=sys.stderr)
    mem['kosis'] = kosis_block(status)
    with open(a.mem, 'w', encoding='utf-8') as f:
        json.dump(mem, f, ensure_ascii=False, separators=(',', ':'))
    it = prob['items']
    print(f"확률 {prob['month']}: D램 {it['dram']['p']} 낸드 {it['nand']['p']} · 검증 AUC {prob['metrics']['auc']} Brier {prob['metrics']['brier']} (평균만 {prob['metrics']['brierClim']})")
    print(f"재고/출하 {mem['kosis']['month']}: {mem['kosis']['ratio']} (2000년 이후 평균 {mem['kosis']['ratioAvg']}) · {status['message']}")


if __name__ == '__main__':
    main()
