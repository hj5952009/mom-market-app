# -*- coding: utf-8 -*-
"""
이주완 박사 공급 중심 메모리 가격 모델 (Lee Joo-wan supply-driven memory price model)

핵심 가설 (영상·기사에서 정리):
  H1 메모리 가격은 수요가 아니라 공급(생산·가동률)이 결정한다. 수요는 직선 추세(상수)로 본다.
  H2 지금 가격 상승은 한국 업체 감산(가동률 저하) 때문이다. 가동률이 정상화되면 2022년 7~8월 가격으로 돌아간다.
  H3 수출 증가는 가격 효과이고, 가격 효과를 빼면 물량은 크게 줄었다(D램 -40%, 낸드 -60%, 2026년 1~8월).
  H4 생산능력은 늘었는데 생산은 늘지 않았다(2022년 7월 이후).
  H5 사이클: 호황 평균 1.5년, 불황 2.5년, 주기 4년. 이번 이익 정점은 2026년 3분기, 4분기부터 가격 하락.
  H6 실적은 환율 착시: 환율 50원 상승 시 영업이익 +15%, 50원 하락 시 -7%. 적정 환율 1,150원.
  H7 중국 점유율 10%, 감산 1년 더 하면 20%.
  H8 마이크론 이익률 가이던스 하락 = 고점 신호.

이 스크립트는 data/ 폴더의 CSV·JSON만 읽어 out/ 폴더에 결과를 씁니다.
데이터를 새로 받으려면 update_data.py 를 먼저 실행하세요.
"""
import json, os, math
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, 'data')
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)


def load():
    w = pd.read_csv(os.path.join(D, 'ecos_raw_wide.csv'), dtype={'month': str})
    w['date'] = pd.to_datetime(w.month, format='%Y%m')
    w = w.set_index('date').drop(columns='month').apply(pd.to_numeric, errors='coerce')
    # 생산지수 역산: 가동률지수 = 생산지수/생산능력지수 이므로 생산 ≈ 능력 × 가동률/100
    w['prod_semi'] = w.cap_semi * w.util_semi / 100
    w['prod_semi_sa'] = w.cap_semi * w.utilsa_semi / 100
    return w


def rel(path):
    return json.load(open(os.path.join(D, path), encoding='utf-8'))['rows']


# ---------------------------------------------------------------- H1/H2/H4 공급 지표
def supply_gauge(w):
    s = pd.DataFrame(index=w.index)
    s['capacity'] = w.cap_semi
    s['util_sa'] = w.utilsa_semi
    s['util_sa_3m'] = w.utilsa_semi.rolling(3).mean()
    s['prod'] = w.prod_semi
    s['prod_3m'] = w.prod_semi.rolling(3).mean()
    s['cap_yoy'] = (w.cap_semi / w.cap_semi.shift(12) - 1) * 100
    s['prod_yoy_3m'] = (s.prod_3m / s.prod_3m.shift(12) - 1) * 100
    # 정상 가동률 기준: 직전 36개월 가동률(계절조정, 3개월 평균)의 90번째 백분위
    s['util_norm'] = s.util_sa_3m.rolling(36, min_periods=24).quantile(0.9).shift(1)
    s['cut_depth'] = (1 - s.util_sa_3m / s.util_norm) * 100  # 감산 강도 (%)
    s['cap_minus_prod'] = s.cap_yoy - s.prod_yoy_3m           # 능력 증가율 - 생산 증가율 (%p)
    return s


# ---------------------------------------------------------------- H3 가격·물량 분해
def price_volume(w, start=None, end=None, base_start=None, base_end=None):
    if start is None:   # 가장 최근 달이 속한 해의 1월~그 달, 1년 전 같은 기간과 비교
        last = w[['expval_ic', 'expvol_ic', 'xp_dram_C']].dropna().index.max()
        end = last.strftime('%Y-%m'); start = last.strftime('%Y') + '-01'
        base_start = str(last.year - 1) + '-01'; base_end = (last - pd.DateOffset(years=1)).strftime('%Y-%m')
    a = w.loc[start:end].mean(); b = w.loc[base_start:base_end].mean()
    g = lambda c: (a[c] / b[c] - 1) * 100
    res = {
        'period': f'{start}~{end} vs {base_start}~{base_end}',
        'export_value_ic_pct': g('expval_ic'),
        'export_volume_ic_bok_pct': g('expvol_ic'),
        'dram_price_usd_pct': g('xp_dram_C'),
        'flash_price_usd_pct': g('xp_flash_C'),
        'value_deflated_by_dram_pct': ((a.expval_ic / a.xp_dram_C) / (b.expval_ic / b.xp_dram_C) - 1) * 100,
        'value_deflated_by_flash_pct': ((a.expval_ic / a.xp_flash_C) / (b.expval_ic / b.xp_flash_C) - 1) * 100,
        'production_semi_pct': g('prod_semi'),
        'capacity_semi_pct': g('cap_semi'),
        'claim_dram_pct': -40, 'claim_nand_pct': -60,
    }
    # 월별 표
    m = pd.DataFrame({
        'export_value_ic_yoy': (w.expval_ic / w.expval_ic.shift(12) - 1) * 100,
        'export_volume_ic_yoy': (w.expvol_ic / w.expvol_ic.shift(12) - 1) * 100,
        'dram_price_yoy': (w.xp_dram_C / w.xp_dram_C.shift(12) - 1) * 100,
        'prod_semi_yoy': (w.prod_semi / w.prod_semi.shift(12) - 1) * 100,
    })
    return res, m


# ---------------------------------------------------------------- H1 공급→가격 선행 회귀 (out-of-sample)
def supply_price_model(w, horizon=12, start_oos='2008-01'):
    p = np.log(w.xp_dram_C)
    prod3 = np.log(w.prod_semi.rolling(3).mean())
    X = pd.DataFrame({
        'prod_g12': prod3.diff(12),                        # 한국 반도체 생산 증가(로그, 12개월)
        'cap_g12': np.log(w.cap_semi).diff(12),            # 생산능력 증가
        'util_chg12': (w.utilsa_semi.rolling(3).mean()).diff(12) / 100,  # 가동률 변화
        'price_g12': p.diff(12),                           # 지난 12개월 가격 상승(과열·평균회귀)
    })
    y = p.shift(-horizon) - p
    df = pd.concat([X, y.rename('y')], axis=1).loc['1997':]
    feats_full = ['cap_g12', 'util_chg12']   # 이주완 가설: 공급(생산능력 증설·가동률)만으로 가격을 설명
    specs = {
        '공급(능력·가동률)': ['cap_g12', 'util_chg12'],
        '가격 추세만(평균회귀)': ['price_g12'],
        '공급+가격 추세': ['cap_g12', 'util_chg12', 'price_g12'],
    }
    rows = []; preds = {}
    dates = df.loc[start_oos:].index
    for name, f in specs.items():
        pr = []
        for t in dates:
            # t 시점에 알 수 있는 자료만: y는 t-horizon 까지 확정
            train = df.loc[:t - pd.DateOffset(months=horizon)].dropna(subset=f + ['y'])
            xt = df.loc[t, f]
            if len(train) < 60 or xt.isna().any():
                pr.append(np.nan); continue
            A = np.column_stack([np.ones(len(train)), train[f].values])
            beta, *_ = np.linalg.lstsq(A, train.y.values, rcond=None)
            pr.append(beta[0] + xt.values @ beta[1:])
        preds[name] = pd.Series(pr, index=dates)
    # 기준선: 과거 평균
    base = []
    for t in dates:
        tr = df.loc[:t - pd.DateOffset(months=horizon)].y.dropna()
        base.append(tr.mean())
    preds['기준선(과거 평균)'] = pd.Series(base, index=dates)
    yy = df.loc[dates, 'y']
    for name, pr in preds.items():
        ok = pr.notna() & yy.notna()
        e = pr[ok] - yy[ok]
        rmse = float(np.sqrt((e ** 2).mean()))
        hit = float(((np.sign(pr[ok]) == np.sign(yy[ok]))).mean() * 100)
        corr = float(np.corrcoef(pr[ok], yy[ok])[0, 1])
        rows.append({'model': name, 'horizon_m': horizon, 'n': int(ok.sum()), 'rmse_log': rmse,
                     'direction_hit_pct': hit, 'corr_pred_actual': corr})
    metrics = pd.DataFrame(rows)
    b_rmse = metrics.loc[metrics.model == '기준선(과거 평균)', 'rmse_log'].iloc[0]
    metrics['rmse_vs_baseline_pct'] = (metrics.rmse_log / b_rmse - 1) * 100
    # 전체 표본 적합 + 현재 예측
    full = df.dropna(subset=feats_full + ['y'])
    A = np.column_stack([np.ones(len(full)), full[feats_full].values])
    beta, *_ = np.linalg.lstsq(A, full.y.values, rcond=None)
    resid = full.y.values - A @ beta
    sd = float(resid.std(ddof=len(feats_full) + 1))
    last = df[feats_full].dropna().index.max()
    xl = df.loc[last, feats_full].values
    point = float(beta[0] + xl @ beta[1:])
    # 표준화 계수(설명력 비교용)
    z = full[feats_full].std().values * beta[1:]
    coefs = pd.DataFrame({'feature': feats_full, 'coef': beta[1:], 'effect_of_1sd': z})
    current = {'as_of': last.strftime('%Y-%m'), 'horizon_m': horizon,
               'features': dict(zip(feats_full, map(float, xl))),
               'pred_log': point, 'pred_pct': (math.exp(point) - 1) * 100,
               'band80_pct': [(math.exp(point - 1.2816 * sd) - 1) * 100, (math.exp(point + 1.2816 * sd) - 1) * 100],
               'resid_sd_log': sd}
    oos = pd.DataFrame(preds); oos['actual'] = yy
    return metrics, coefs, current, oos


# ---------------------------------------------------------------- H5 사이클 판정
def find_cycles(series, min_amp=0.20, min_gap=6):
    s = np.log(series.dropna().rolling(3, center=True, min_periods=1).mean())
    idx = s.index; v = s.values
    piv = []  # (i, type)
    mode = None; ext_i = 0
    for i in range(1, len(v)):
        if mode is None:
            if v[i] - v[ext_i] >= min_amp: mode = 'up'; piv.append((ext_i, 'trough')); ext_i = i
            elif v[ext_i] - v[i] >= min_amp: mode = 'down'; piv.append((ext_i, 'peak')); ext_i = i
            elif abs(v[i] - v[0]) > abs(v[ext_i] - v[0]): ext_i = i
            continue
        if mode == 'up':
            if v[i] > v[ext_i]: ext_i = i
            elif v[ext_i] - v[i] >= min_amp and i - ext_i >= 1:
                piv.append((ext_i, 'peak')); mode = 'down'; ext_i = i
        else:
            if v[i] < v[ext_i]: ext_i = i
            elif v[i] - v[ext_i] >= min_amp:
                piv.append((ext_i, 'trough')); mode = 'up'; ext_i = i
    out = [(idx[i], t, float(series.loc[idx[i]])) for i, t in piv]
    return out, mode, idx[ext_i]


def cycle_stats(w):
    s = w.xp_dram_C.dropna()
    piv, mode, ext = find_cycles(s)
    rows = []
    for (d0, t0, v0), (d1, t1, v1) in zip(piv[:-1], piv[1:]):
        rows.append({'start': d0.strftime('%Y-%m'), 'end': d1.strftime('%Y-%m'),
                     'phase': '상승기' if t0 == 'trough' else '하락기',
                     'months': (d1.year - d0.year) * 12 + d1.month - d0.month,
                     'change_pct': (v1 / v0 - 1) * 100})
    last_d, last_t, last_v = piv[-1]
    cur_months = (s.index[-1].year - last_d.year) * 12 + s.index[-1].month - last_d.month
    rows.append({'start': last_d.strftime('%Y-%m'), 'end': s.index[-1].strftime('%Y-%m') + ' (진행 중)',
                 'phase': '상승기' if last_t == 'trough' else '하락기', 'months': cur_months,
                 'change_pct': (s.iloc[-1] / last_v - 1) * 100})
    cyc = pd.DataFrame(rows)
    cyc = cyc[cyc.start >= '2001-10'].reset_index(drop=True)   # 2001년 이후(약 25년)
    done = cyc[~cyc.end.str.contains('진행')]
    rec = done[done.start >= '2012-11']
    summ = {
        'up_median_m': float(done[done.phase == '상승기'].months.median()),
        'up_mean_m': float(done[done.phase == '상승기'].months.mean()),
        'down_median_m': float(done[done.phase == '하락기'].months.median()),
        'down_mean_m': float(done[done.phase == '하락기'].months.mean()),
        'n_up': int((done.phase == '상승기').sum()), 'n_down': int((done.phase == '하락기').sum()),
        'claim_up_m': 18, 'claim_down_m': 30, 'claim_period_m': 48,
        'down_median_fall_pct': float(done[done.phase == '하락기'].change_pct.median()),
        'recent_up_mean_m': float(rec[rec.phase == '상승기'].months.mean()),
        'recent_down_mean_m': float(rec[rec.phase == '하락기'].months.mean()),
        'recent_n': int(len(rec)),
        'current_up_months': int(cyc.iloc[-1].months), 'current_up_change_pct': float(cyc.iloc[-1].change_pct),
        'max_past_up_months': int(done[done.phase == '상승기'].months.max()),
        'max_past_up_change_pct': float(done[done.phase == '상승기'].change_pct.max()),
    }
    peaks = [p for p in piv if p[1] == 'peak' and p[0] >= pd.Timestamp('2001-10-01')]
    # 정점 이후 경로 (정점 대비 %)
    paths = {}
    for d, _, v in peaks:
        seg = s.loc[d:].iloc[:25] / s.loc[d]
        if len(seg) >= 13:
            paths[d.strftime('%Y-%m')] = (seg.values - 1) * 100
    L = min(len(x) for x in paths.values())
    P = pd.DataFrame({k: v[:L] for k, v in paths.items()})
    path_q = pd.DataFrame({'k': range(L), 'p25': P.quantile(0.25, axis=1), 'median': P.median(axis=1),
                           'p75': P.quantile(0.75, axis=1)})
    return cyc, summ, path_q, P


# ---------------------------------------------------------------- H6 환율 효과
def fx_effect(w):
    fx = w.usdkrw_avg.dropna()
    rule_up, rule_dn = 15 / 50, 7 / 50  # 이주완: 50원 상승 → 영업이익 +15%, 50원 하락 → -7%
    def opeff(d):
        return d * (rule_up if d > 0 else rule_dn)
    recent, prev = fx.iloc[-3:], fx.iloc[-6:-3]
    krw = {
        'fx_recent3': float(recent.mean()), 'fx_prev3': float(prev.mean()),
        'fx_recent3_label': recent.index[0].strftime('%Y-%m') + '~' + recent.index[-1].strftime('%Y-%m'),
        'fx_prev3_label': prev.index[0].strftime('%Y-%m') + '~' + prev.index[-1].strftime('%Y-%m'),
        'fx_last': float(fx.iloc[-1]), 'fx_last_month': fx.index[-1].strftime('%Y-%m'),
        'fair_fx_claim': 1150,
        'op_effect_recent_vs_prev_pct': opeff(recent.mean() - prev.mean()),
        'op_effect_last_vs_prev_pct': opeff(fx.iloc[-1] - prev.mean()),
        'gap_vs_fair_won': float(fx.iloc[-1] - 1150),
        'claim_1y_fx': '1,300원 초반',
    }
    yo = pd.DataFrame({'dram_krw_yoy': (w.xp_dram_W / w.xp_dram_W.shift(12) - 1) * 100,
                       'dram_usd_yoy': (w.xp_dram_C / w.xp_dram_C.shift(12) - 1) * 100,
                       'fx_yoy': (w.usdkrw_avg / w.usdkrw_avg.shift(12) - 1) * 100})
    return krw, yo


# ---------------------------------------------------------------- H8 마이크론 이익률 가이던스 신호
def micron_signal(w):
    m = pd.DataFrame(rel('micron_gross_margin.json'))
    m = m.dropna(subset=['guidance_next_q_gm_pct']).copy()
    m['period_end'] = pd.to_datetime(m.period_end)
    m['guide_minus_actual'] = m.guidance_next_q_gm_pct - m.gross_margin_pct
    p = w.xp_dram_C.dropna()
    out = []
    for _, r in m.iterrows():
        t = r.period_end + pd.DateOffset(months=1)  # 발표는 분기 말 약 1개월 뒤
        if t > p.index[-1]:
            f6 = np.nan
        else:
            base = p.loc[:t].iloc[-1]
            fut = p.loc[t + pd.DateOffset(months=6):]
            f6 = (fut.iloc[0] / base - 1) * 100 if len(fut) else np.nan
        out.append({'quarter': r.fiscal_quarter, 'announce': t.strftime('%Y-%m'), 'gm': r.gross_margin_pct,
                    'guide': r.guidance_next_q_gm_pct, 'guide_minus_actual': r.guide_minus_actual,
                    'dram_6m_after_pct': f6})
    o = pd.DataFrame(out)
    neg = o[(o.guide_minus_actual < 0) & o.dram_6m_after_pct.notna()]
    pos = o[(o.guide_minus_actual >= 0) & o.dram_6m_after_pct.notna()]
    stat = {'n_down_guides': int(len(neg)), 'down_then_price_fell': int((neg.dram_6m_after_pct < 0).sum()),
            'median_6m_after_down_guide': float(neg.dram_6m_after_pct.median()),
            'n_up_guides': int(len(pos)), 'up_then_price_fell': int((pos.dram_6m_after_pct < 0).sum()),
            'median_6m_after_up_guide': float(pos.dram_6m_after_pct.median()),
            'n_small_down_guides': int((neg.guide_minus_actual > -2).sum()),
            'small_down_then_fell': int(((neg.guide_minus_actual > -2) & (neg.dram_6m_after_pct < 0)).sum()),
            'latest_guide_minus_actual': float(o.guide_minus_actual.iloc[-1])}
    return o, stat


# ---------------------------------------------------------------- H7 중국 점유율
def china_share():
    c = pd.DataFrame(rel('china_dram_share.json'))
    cp = c[(c.company_or_scope == 'CXMT') & (c.basis.str.startswith('revenue')) & c.source.str.contains('Counterpoint')].copy()
    order = ['2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q2']
    cp = cp[cp.period.isin(order)].drop_duplicates('period').set_index('period').loc[order]
    x = np.arange(len(cp)); yv = cp.share_pct.astype(float).values
    k, b0 = np.polyfit(x, yv, 1)
    q_to_20 = (20 - (b0 + k * x[-1])) / k
    return cp.reset_index()[['period', 'share_pct', 'source', 'source_url']], {
        'slope_pp_per_q': float(k), 'latest': float(yv[-1]), 'quarters_to_20pct_linear': float(q_to_20)}


# ---------------------------------------------------------------- 시나리오 전망
def _q_months(q):
    y, n = int(q[:4]), int(q[-1])
    return [f'{y}-{m:02d}' for m in range(3 * n - 2, 3 * n + 1)]


def _prev_q(q):
    y, n = int(q[:4]), int(q[-1])
    return f'{y - 1}Q4' if n == 1 else f'{y}Q{n - 1}'


def scenarios(w, path_q, model_cur):
    """A·B는 '이주완 주장대로 정점이 왔다면'의 경로. 정점은
    - 가격이 아직 오르는 중이면: 최신 달(다음 달 고정거래가 상승률이 있으면 그것으로 다음 달을 추정해 정점으로)
    - 이미 내려오기 시작했으면: 2023년 이후 실제 최고 달"""
    p = w.xp_dram_C.dropna(); last = p.index[-1]; lv = float(p.iloc[-1])
    rec = p.loc['2023-01':]; pk = rec.idxmax()
    fixed = pd.read_csv(os.path.join(D, 'fixed_price_monthly.csv'))
    ddr4 = fixed[fixed.series == 'DDR4 8Gb'].set_index('month')
    falling = lv < float(rec.max()) * 0.98
    est = None
    if falling:
        peak_m, peak_v, peak_kind = pk, float(rec.max()), '실제 최고점'
    else:
        nxt = (last + pd.DateOffset(months=1)).strftime('%Y-%m')
        mom = ddr4.mom_pct.get(nxt) if nxt in ddr4.index else None
        if mom is not None and not pd.isna(mom):
            peak_m, peak_v, peak_kind = last + pd.DateOffset(months=1), lv * (1 + float(mom) / 100), '추정(고정거래가)'
            est = {'month': nxt, 'value': peak_v, 'mom_pct': float(mom)}
        else:
            peak_m, peak_v, peak_kind = last, lv, '최신 실제값'
    months = pd.date_range(peak_m, periods=13, freq='MS')
    level_2022 = float(p.loc['2022-07':'2022-08'].mean())
    rows = []
    for i, d in enumerate(months):
        rows.append({'month': d.strftime('%Y-%m'), 'k': i,
                     'A_median': peak_v * (1 + path_q['median'].iloc[i] / 100),
                     'A_p25': peak_v * (1 + path_q['p25'].iloc[i] / 100),
                     'A_p75': peak_v * (1 + path_q['p75'].iloc[i] / 100),
                     'B_normalize': peak_v * (level_2022 / peak_v) ** (i / 30)})
    sc = pd.DataFrame(rows)
    # C. TrendForce 최신 분기 전망(범용 D램, 전분기 평균 대비 중간값)
    sc['C_consensus'] = np.nan
    cons = None
    tf = pd.read_csv(os.path.join(D, 'trendforce_forecast.csv'))
    tf = tf[tf.series == 'DRAM(범용)'].sort_values('quarter')
    if len(tf):
        r = tf.iloc[-1]; qm = _q_months(r.quarter); pm = _q_months(_prev_q(r.quarter))
        known = {k.strftime('%Y-%m'): float(v) for k, v in p.items()}
        if est: known[est['month']] = est['value']
        if all(m in known for m in pm) and qm[-1] > last.strftime('%Y-%m'):
            q_avg = np.mean([known[m] for m in pm]) * (1 + float(r.mid_pct) / 100)
            path = {pm[-1]: known[pm[-1]]}
            for m, f in zip(qm, [0.9817, 1.0, 1.0183]):
                path[m] = q_avg * f
            for m, v in path.items():
                sc.loc[sc.month == m, 'C_consensus'] = v
            cons = {'quarter': r.quarter, 'range': r.range, 'announced': r.announced_date, 'path': path}
    meta = {'peak_assumed': pd.Timestamp(peak_m).strftime('%Y-%m'), 'peak_value_est': peak_v, 'peak_kind': peak_kind,
            'falling': bool(falling), 'est_next': est, 'consensus': cons,
            'last_actual_month': last.strftime('%Y-%m'), 'last_actual': lv, 'level_2022_jul_aug': level_2022,
            'model_12m_target_month': (last + pd.DateOffset(months=12)).strftime('%Y-%m'),
            'model_12m_point': lv * (1 + model_cur['pred_pct'] / 100),
            'model_12m_lo': lv * (1 + model_cur['band80_pct'][0] / 100),
            'model_12m_hi': lv * (1 + model_cur['band80_pct'][1] / 100),
            'A_12m_median_pct_vs_peak': float(path_q['median'].iloc[12]),
            'B_12m_pct_vs_peak': float((level_2022 / peak_v) ** (12 / 30) - 1) * 100,
            'full_reversion_pct': (level_2022 / peak_v - 1) * 100}
    hist = p.loc['2023-01':].rename('actual').reset_index()
    hist['month'] = hist['date'].dt.strftime('%Y-%m')
    return sc, hist[['month', 'actual']], meta


def main():
    w = load()
    s = supply_gauge(w)
    pv, pvm = price_volume(w)
    met12, coef12, cur12, oos12 = supply_price_model(w, 12)
    met6, coef6, cur6, oos6 = supply_price_model(w, 6)
    cyc, csum, path_q, P = cycle_stats(w)
    fx, fxy = fx_effect(w)
    mic, micstat = micron_signal(w)
    ch, chstat = china_share()
    sc, hist, meta = scenarios(w, path_q, cur12)

    s.to_csv(os.path.join(OUT, 'supply_gauge.csv'))
    pvm.to_csv(os.path.join(OUT, 'price_volume_monthly.csv'))
    pd.concat([met12, met6]).to_csv(os.path.join(OUT, 'model_backtest.csv'), index=False)
    coef12.to_csv(os.path.join(OUT, 'model_coefs_12m.csv'), index=False)
    oos12.to_csv(os.path.join(OUT, 'model_oos_12m.csv'))
    cyc.to_csv(os.path.join(OUT, 'cycles.csv'), index=False)
    path_q.to_csv(os.path.join(OUT, 'post_peak_paths.csv'), index=False)
    P.to_csv(os.path.join(OUT, 'post_peak_paths_each.csv'), index=False)
    fxy.to_csv(os.path.join(OUT, 'fx_dram_yoy.csv'))
    mic.to_csv(os.path.join(OUT, 'micron_guidance_signal.csv'), index=False)
    ch.to_csv(os.path.join(OUT, 'china_share.csv'), index=False)
    sc.to_csv(os.path.join(OUT, 'scenarios.csv'), index=False)
    summary = {'price_volume': pv, 'model12': cur12, 'model6': cur6,
               'backtest12': met12.to_dict('records'), 'backtest6': met6.to_dict('records'),
               'coefs12': coef12.to_dict('records'), 'cycles': csum, 'fx': fx, 'micron': micstat,
               'china': chstat, 'scenario_meta': meta,
               'supply_latest': {k: (None if pd.isna(v) else float(v)) for k, v in s.dropna(subset=['capacity']).iloc[-1].items()},
               'supply_latest_month': s.dropna(subset=['capacity']).index[-1].strftime('%Y-%m')}
    json.dump(summary, open(os.path.join(OUT, 'summary.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=float)
    return summary


if __name__ == '__main__':
    r = main()
    print(json.dumps(r, ensure_ascii=False, indent=1, default=float)[:6000])
