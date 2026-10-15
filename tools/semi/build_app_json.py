# -*- coding: utf-8 -*-
"""jw_model.py 결과(out/)와 data/ 의 손으로 정리한 자료로 앱용 semi.json 을 만든다.

  python tools/semi/build_app_json.py            → tools/semi/out/semi.json
  python tools/semi/build_app_json.py --bundle   → 위 + www/data/semi.json (앱에 묶어 넣는 기본값)

앱은 GitHub의 semi-data 가지에 올라간 semi.json 을 먼저 받고, 못 받으면 묶어 둔 www/data/semi.json 을 쓴다.
"""
import json, os, sys, math, datetime
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import jw_model as M  # noqa: E402

D = os.path.join(HERE, 'data')
OUT = os.path.join(HERE, 'out')
WWW = os.path.join(HERE, '..', '..', 'www', 'data', 'semi.json')
SCHEMA = 1


def r(x, n=1):
    if x is None:
        return None
    try:
        if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
            return None
    except TypeError:
        return None
    return round(float(x), n)


def kym(m, short=False):
    m = str(m)
    return (m[2:4] + '년 ' if not short else '') + str(int(m[5:7])) + '월'


def series(s, n=1):
    return [r(v, n) for v in s.values]


def main(bundle=False):
    S = M.main()                       # out/*.csv, out/summary.json 다시 만듦
    w = M.load()
    sup = pd.read_csv(os.path.join(OUT, 'supply_gauge.csv'), index_col=0, parse_dates=True)
    sc = pd.read_csv(os.path.join(OUT, 'scenarios.csv'))
    meta = S['scenario_meta']; sl = S['supply_latest']; cy = S['cycles']; fx = S['fx']

    # ---- 가격 (2015년부터)
    p = w.loc['2015-01':, ['xp_dram_C', 'xp_flash_C']].dropna(subset=['xp_dram_C'])
    dram = w.xp_dram_C.dropna()
    m3 = (dram / dram.shift(3) - 1) * 100
    cyc_start = pd.Timestamp('2023-08-01')
    m3_peak_m = m3.loc[cyc_start:].idxmax()
    price = {'months': [d.strftime('%Y-%m') for d in p.index], 'dram': series(p.xp_dram_C), 'flash': series(p.xp_flash_C),
             'm3_last': r(m3.iloc[-1]), 'm3_peak': r(m3.loc[m3_peak_m]), 'm3_peak_month': m3_peak_m.strftime('%Y-%m')}

    # ---- 공급 (2015년부터)
    s2 = sup.loc['2015-01':].dropna(subset=['capacity'])
    supply = {'months': [d.strftime('%Y-%m') for d in s2.index], 'cap': series(s2.capacity), 'prod3': series(s2.prod_3m),
              'util3': series(s2.util_sa_3m), 'norm': series(s2.util_norm)}

    # ---- 시나리오
    scen = {'months': list(sc.month), 'A': series(sc.A_median), 'Alo': series(sc.A_p25), 'Ahi': series(sc.A_p75),
            'B': series(sc.B_normalize), 'C': series(sc.C_consensus),
            'D': {'month': meta['model_12m_target_month'], 'mid': r(meta['model_12m_point']), 'lo': r(meta['model_12m_lo']), 'hi': r(meta['model_12m_hi'])},
            'peakMonth': meta['peak_assumed'], 'peakValue': r(meta['peak_value_est']), 'peakKind': meta['peak_kind'], 'falling': meta['falling'],
            'estNext': meta['est_next'] and {'month': meta['est_next']['month'], 'value': r(meta['est_next']['value']), 'momPct': r(meta['est_next']['mom_pct'])},
            'consensus': meta['consensus'] and {'quarter': meta['consensus']['quarter'], 'range': meta['consensus']['range'], 'announced': meta['consensus']['announced']},
            'level2022': r(meta['level_2022_jul_aug']), 'lastMonth': meta['last_actual_month'], 'last': r(meta['last_actual']),
            'A12': r(meta['A_12m_median_pct_vs_peak'], 0), 'B12': r(meta['B_12m_pct_vs_peak'], 0), 'full': r(meta['full_reversion_pct'], 0),
            'D12': r(S['model12']['pred_pct']), 'D12lo': r(S['model12']['band80_pct'][0], 0), 'D12hi': r(S['model12']['band80_pct'][1], 0)}

    # ---- 신호 (자동 4개 + 손으로 정리한 4개)
    sig = []
    cut = sl['cut_depth']
    sig.append({'id': 'cut', 'name': '감산(가동률)', 'auto': True, 'asOf': S['supply_latest_month'],
                'status': '아직 아님' if cut >= 5 else ('둔화' if cut >= 2 else '켜짐'),
                'reading': (f'가동률이 정상보다 {cut:.1f}% 낮아요. 감산이 이어지는 동안은 가격을 받쳐 줘요' if cut >= 2
                            else f'가동률이 정상 수준에 가까워졌어요(차이 {cut:.1f}%). 박사가 말한 감산 종료 신호예요')})
    cap = sl['cap_yoy']
    sig.append({'id': 'cap', 'name': '생산능력 증설', 'auto': True, 'asOf': S['supply_latest_month'],
                'status': '압력' if cap > 5 else '아직 아님',
                'reading': f'반도체 생산능력이 1년 전보다 {cap:+.1f}%. 감산이 풀리면 바로 공급이 돼요'})
    ml, mp = price['m3_last'], price['m3_peak']
    if meta['falling']:
        st, rd = '켜짐', f"D램 수출가격이 {kym(meta['peak_assumed'])} 최고점보다 {(meta['last_actual'] / meta['peak_value_est'] - 1) * 100:.1f}% 낮아요. 하락이 시작됐어요"
    elif ml is not None and ml < 0:
        st, rd = '켜짐', f'최근 3개월 D램 가격 {ml:+.1f}%. 내려가기 시작했어요'
    elif ml is not None and mp and ml < mp / 2:
        st, rd = '둔화', f"3개월 상승률이 {kym(price['m3_peak_month'])} {mp:+.1f}%에서 {kym(meta['last_actual_month'])} {ml:+.1f}%로 줄었어요"
    else:
        st, rd = '아직 아님', f'3개월 상승률 {ml:+.1f}%'
    sig.append({'id': 'speed', 'name': 'D램 가격 흐름', 'auto': True, 'asOf': meta['last_actual_month'], 'status': st, 'reading': rd})
    dfx = fx['fx_last'] - fx['fx_prev3']
    sig.append({'id': 'fx', 'name': '환율', 'auto': True, 'asOf': fx['fx_last_month'],
                'status': '켜짐' if dfx < -30 else '아직 아님',
                'reading': f"원/달러 {kym(fx['fx_prev3_label'][:7])}~{kym(fx['fx_prev3_label'][-7:], True)} 평균 {fx['fx_prev3']:,.0f}원 → {kym(fx['fx_last_month'])} {fx['fx_last']:,.0f}원. "
                           + ('원화가 강해져 원화 실적에 불리해요' if dfx < 0 else '원화가 약해 원화 실적에는 유리해요')})
    stat = json.load(open(os.path.join(D, 'signals_static.json'), encoding='utf-8'))['rows']
    for x in stat:
        sig.append(dict(x, auto=False))
    lit = sum(1 for x in sig if x['status'] in ('켜짐', '압력', '둔화'))
    strong = sum(1 for x in sig if x['status'] == '켜짐')

    if meta['falling']:
        phase = '하락 시작'
    elif strong >= 3 or lit >= 5:
        phase = '상승 후반'
    else:
        phase = '상승 중'

    # ---- 가격·물량
    pv = S['price_volume']
    pvr = [['수출금액(집적회로)', 'price', pv['export_value_ic_pct']], ['D램 수출가격', 'price', pv['dram_price_usd_pct']],
           ['수출물량(한은 공식)', 'volume', pv['export_volume_ic_bok_pct']], ['금액 ÷ D램 가격', 'volume', pv['value_deflated_by_dram_pct']],
           ['반도체 생산', 'volume', pv['production_semi_pct']], ['박사 주장: D램 물량', 'claim', -40], ['박사 주장: 낸드 물량', 'claim', -60]]

    bt = {b['model']: b for b in S['backtest12']}
    sup12 = bt.get('공급(능력·가동률)', {})

    out = {
        'v': SCHEMA,
        'generatedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec='minutes'),
        'asOf': {'price': meta['last_actual_month'], 'supply': S['supply_latest_month'], 'fx': fx['fx_last_month']},
        'head': {'phase': phase, 'lit': lit, 'nSignals': len(sig), 'cut': r(cut), 'util3': r(sl['util_sa_3m']), 'norm': r(sl['util_norm']),
                 'capYoy': r(cap), 'prodYoy': r(sl['prod_yoy_3m']), 'curUpM': cy['current_up_months'], 'curUpPct': r(cy['current_up_change_pct'], 0),
                 'maxUpM': cy['max_past_up_months'], 'maxUpPct': r(cy['max_past_up_change_pct'], 0),
                 'upRecent': r(cy['recent_up_mean_m']), 'downRecent': r(cy['recent_down_mean_m']), 'downFall': r(cy['down_median_fall_pct'], 0)},
        'price': price, 'supply': supply, 'scen': scen, 'signals': sig,
        'pv': {'period': pv['period'], 'rows': [[a, b, r(c)] for a, b, c in pvr]},
        'model': {'rmseGain': r(-sup12.get('rmse_vs_baseline_pct', float('nan'))), 'hit': r(sup12.get('direction_hit_pct'), 0), 'n': sup12.get('n'),
                  'gain6': r(-{b['model']: b for b in S['backtest6']}.get('공급(능력·가동률)', {}).get('rmse_vs_baseline_pct', float('nan')))},
        'fx': {'months': [d.strftime('%Y-%m') for d in w.usdkrw_avg.dropna().index[-36:]], 'values': series(w.usdkrw_avg.dropna().iloc[-36:], 0),
               'effRecent': r(fx['op_effect_recent_vs_prev_pct']), 'recentLabel': fx['fx_recent3_label'], 'prevLabel': fx['fx_prev3_label']},
        'micron': S['micron'] and {k: S['micron'][k] for k in ['n_down_guides', 'down_then_price_fell', 'n_small_down_guides', 'small_down_then_fell']},
        'sources': ['한국은행 ECOS: 반도체 제조업 생산능력·가동률지수(통계청), D램·플래시 수출물가, 집적회로 수출금액·물량지수, 원/달러',
                    'TrendForce(고정거래가·분기 전망), 마이크론 실적 발표, Counterpoint(CXMT 점유율), DRAMeXchange(현물가)',
                    '이주완 박사 발언: 삼프로TV·YTN 라디오·MTN·SBS Biz·KBS 성공예감(2025~2026)'],
    }
    txt = json.dumps(out, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'semi.json'), 'w', encoding='utf-8').write(txt)
    if bundle:
        open(WWW, 'w', encoding='utf-8').write(txt)
    print('semi.json', len(txt), 'bytes · 가격', meta['last_actual_month'], '· 공급', S['supply_latest_month'], '· 국면', phase, f'· 신호 {lit}/{len(sig)}')


if __name__ == '__main__':
    main(bundle='--bundle' in sys.argv)
