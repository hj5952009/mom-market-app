# -*- coding: utf-8 -*-
"""
한국은행 ECOS에서 모델 입력 자료를 새로 받아 data/ecos_raw_wide.csv 를 다시 만듭니다.

  python update_data.py            # 공개 'sample' 키 사용 (요청당 10건이라 느리지만 키 없이 동작)
  python update_data.py 내인증키     # ECOS 인증키가 있으면 훨씬 빠름

받은 뒤 python jw_model.py 를 실행하면 out/ 폴더 결과가 갱신됩니다.
"""
import sys, os, json, time, csv, urllib.request, urllib.parse

KEY = sys.argv[1] if len(sys.argv) > 1 else 'sample'
STEP = 10 if KEY == 'sample' else 1000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'data', 'ecos_raw_wide.csv')

# (열 이름, 통계표, 항목코드들, 시작월)
SERIES = [
    ('cap_semi',   '901Y035', ['I32AO1', 'I11A'], '198001'),   # 반도체 제조업 생산능력지수
    ('util_semi',  '901Y035', ['I32AO1', 'I11B'], '198001'),   # 반도체 제조업 가동률지수(원지수)
    ('utilsa_semi','901Y035', ['I32AO1', 'I11C'], '198001'),   # 가동률지수(계절조정)
    ('cap_mfg',    '901Y035', ['I32A', 'I11A'], '199001'),     # 제조업 생산능력
    ('util_mfg',   '901Y035', ['I32A', 'I11B'], '199001'),     # 제조업 가동률
    ('expval_ic',  '403Y001', ['309112AA'], '200001'),         # 수출금액지수 집적회로
    ('expvol_ic',  '403Y002', ['309112AA'], '200001'),         # 수출물량지수 집적회로
    ('expval_semi','403Y001', ['3091AA'], '200001'),
    ('expvol_semi','403Y002', ['3091AA'], '200001'),
    ('prod_elec',  '901Y032', ['I11ACQ', '1'], '199001'),      # 전자부품·컴퓨터·통신 생산지수
    ('ship_elec',  '901Y032', ['I11ACQ', '3'], '199001'),
    ('inv_elec',   '901Y032', ['I11ACQ', '5'], '199001'),
    ('xp_dram_C',  '402Y016', ['30911201AA', 'C'], '199001'),  # D램 수출물가 계약통화
    ('xp_dram_W',  '402Y016', ['30911201AA', 'W'], '199001'),  # D램 수출물가 원화
    ('xp_flash_C', '402Y016', ['30911202AA', 'C'], '200001'),
    ('xp_flash_W', '402Y016', ['30911202AA', 'W'], '200001'),
    ('usdkrw_avg', '731Y004', ['0000001', '0000100'], '199001'),  # 원/달러 매매기준율 월평균
]


def ym_add(ym, k):
    y, m = int(ym[:4]), int(ym[4:]) + k
    while m > 12: m -= 12; y += 1
    return f'{y}{m:02d}'


def fetch(code, items, start, end):
    out = {}
    s = start
    while s <= end:
        e = min(ym_add(s, STEP - 1), end)
        url = f'https://ecos.bok.or.kr/api/StatisticSearch/{KEY}/json/kr/1/{STEP}/{code}/M/{s}/{e}/' + '/'.join(items)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    j = json.loads(r.read().decode('utf-8'))
                break
            except Exception as ex:
                time.sleep(2)
        else:
            raise RuntimeError(url)
        for row in (j.get('StatisticSearch') or {}).get('row', []):
            out[row['TIME']] = row['DATA_VALUE']
        s = ym_add(e, 1)
    return out


def main():
    import datetime
    end = datetime.date.today().strftime('%Y%m')
    cols = {}
    for name, code, items, start in SERIES:
        print('받는 중:', name, flush=True)
        cols[name] = fetch(code, items, start, end)
    # 안전장치: 핵심 자료가 비었거나 예전 파일보다 짧아지면 저장하지 않고 실패로 끝낸다(GitHub가 메일로 알림)
    for k in ('cap_semi', 'utilsa_semi', 'xp_dram_C', 'expval_ic', 'usdkrw_avg'):
        if len(cols[k]) < 100:
            raise SystemExit(f'{k} 자료가 너무 적음({len(cols[k])}개) — ECOS 응답 확인 필요')
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f:
            old = list(csv.DictReader(f))
        for k in ('cap_semi', 'xp_dram_C'):
            n_old = sum(1 for r in old if r.get(k))
            if len(cols[k]) < n_old:
                raise SystemExit(f'{k} 자료가 예전({n_old}개)보다 줄었음({len(cols[k])}개)')
    months = sorted(set(m for c in cols.values() for m in c))
    names = sorted(cols)
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['month'] + names)
        for m in months:
            w.writerow([m] + [cols[n].get(m, '') for n in names])
    print('저장:', OUT, len(months), '개월')


if __name__ == '__main__':
    main()
