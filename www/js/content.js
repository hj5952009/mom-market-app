/* 고정 콘텐츠: 용어 사전·상식 카드(macro2 §5·§6), 걱정될 때 읽는 글(stocks2 §4-2),
 * 안내 문구(stocks3 §3), "얼마나 믿을 만한가요?"(stocks3 §2, 숫자는 모델 결과로 채움), 계산에 쓰는 것(ref/drivers.json).
 * 금지어 때문에 고친 곳: VIX 이름 '공포지수' → '불안지수'(뉴스 이름은 별칭으로만), '거의 확실한 범위(95%)' → '20번 중 19번 범위'. */
(function (root) {
  'use strict';
  var U = root.MCUtil || (typeof require !== 'undefined' ? require('./util.js') : null);

  var GLOSSARY = [
    { id: 'kospi', term: '코스피', aliases: ['KOSPI', '코스피 지수', '종합주가지수'], short: '우리나라 주식시장에 있는 회사들의 주가를 한데 모아 숫자 하나로 나타낸 거예요. 1980년 1월 4일을 100으로 놓고 지금 얼마인지 보여 주고, 덩치 큰 회사일수록 더 크게 반영돼요.', analogy: "한 학생 점수가 아니라 '반 전체 평균 점수'예요. 반 분위기가 좋은지 나쁜지 한눈에 보여 줘요.", example: '코스피 6,000은 1980년보다 우리 주식시장 전체 값이 약 60배가 됐다는 뜻이에요.', inApp: '이 앱은 코스피가 다음 거래일에 어디쯤에서 끝날지 범위로 보여 줘요.', related: ['index', 'point', 'kosdaq'] },
    { id: 'index', term: '지수', aliases: ['주가지수'], short: '여러 가격을 한 묶음으로 만들어, 기준이 되는 때와 비교해 얼마나 변했는지 보여 주는 숫자예요.', analogy: "장바구니 물가와 같아요. 쌀·우유·달걀 값을 따로 보지 않고 한 바구니로 묶어 '작년보다 얼마나 올랐나'를 보는 거예요.", example: null, related: ['kospi', 'sox', 'nasdaq'] },
    { id: 'point', term: '포인트', aliases: ['p', 'pt'], short: '지수가 움직인 크기를 세는 단위예요. 지수가 높을수록 같은 1%라도 포인트 숫자가 커지기 때문에, 크기를 비교할 땐 %로 보는 게 정확해요.', analogy: '키 재는 cm와 비슷해요. 어른이 2cm 크는 것과 아기가 2cm 크는 건 의미가 다르듯, 지수가 2,400일 때 60포인트와 6,000일 때 60포인트는 달라요.', example: '코스피 6,000에서 1% 오르면 60포인트, 2,400에서 1% 오르면 24포인트예요.', related: ['kospi', 'index'] },
    { id: 'semiconductor', term: '반도체', aliases: ['칩', '메모리 반도체'], short: '컴퓨터·휴대폰·AI 서버 안에서 계산하고 기억하는 작은 부품이에요. 삼성전자와 SK하이닉스가 대표 회사이고, 이 두 회사가 코스피에서 차지하는 몫이 커서 반도체 소식에 코스피가 크게 움직여요.', analogy: "우리 마을의 '주력 농사' 같은 거예요. 이 농사가 잘되면 마을 전체 살림이 펴고, 흉년이면 마을 전체가 힘들어요.", example: null, related: ['sox'] },
    { id: 'sox', term: '필라델피아 반도체지수', aliases: ['SOX', '반도체지수', '필라델피아반도체', '미국 반도체'], short: '미국에 상장된 주요 반도체 회사 30곳의 주가를 묶은 지수예요. 밤사이 이 지수가 오르면 다음 날 우리 반도체 주식도 따라 오르는 경우가 많아요.', analogy: "옆 동네 같은 업종 가게들의 '어젯밤 장사 성적표'예요. 그 동네가 잘 팔렸으면 우리 가게 손님도 늘 거라고 기대하게 되죠.", example: "앱의 'SOX 시나리오'는 오늘 밤 이 지수가 얼마나 움직이느냐에 따라 내일 코스피 범위가 어떻게 달라지는지 보여 줘요.", related: ['semiconductor', 'nasdaq'] },
    { id: 'nasdaq', term: '나스닥', aliases: ['NASDAQ', '나스닥 종합지수'], short: '애플·엔비디아 같은 미국 기술 회사가 많이 모인 주식시장, 또는 그 시장 전체의 지수예요.', analogy: "미국의 '첨단 기술 상가' 전체 매출표예요. 이 상가가 붐비면 세계 기술주 분위기가 좋다는 뜻이에요.", example: null, related: ['sox', 'index'] },
    { id: 'fx', term: '환율', aliases: ['원/달러 환율', '원달러', '달러 환율'], short: '1달러를 사려면 우리 돈이 얼마 필요한지를 나타낸 값이에요. 환율이 1,400원에서 1,450원으로 오르면 달러가 비싸지고 원화 값은 떨어진 거예요.', analogy: '해외여행 갈 때 은행에서 환전하는 가격이에요. 환율이 오르면 같은 100달러를 바꾸는 데 돈이 더 들어요.', example: null, related: ['foreign_trade', 'rate'] },
    { id: 'rate', term: '금리', aliases: ['이자율', '기준금리'], short: "돈을 빌리거나 빌려줄 때 붙는 이자율, 즉 '돈을 쓰는 값'이에요. 금리가 오르면 대출 부담이 커지고 예금·채권이 더 매력적으로 보여서 주식에는 부담이 되는 경우가 많아요.", analogy: "돈을 빌려 쓰는 '월세'예요. 월세가 오르면 무리해서 집(주식)을 사려는 사람이 줄어들죠.", example: null, related: ['govbond', 'bond_fund'] },
    { id: 'govbond', term: '국채', aliases: ['국고채', '미국 10년물', '미 국채', '10년물 금리', '미국 10년 금리'], short: "나라가 돈을 빌리면서 써 주는 차용증이에요. '미국 10년물 국채 금리'는 미국 정부에 10년 동안 돈을 빌려줄 때 받는 이자율인데, 세계 금리의 기준처럼 쓰여요.", analogy: '가장 믿을 만한 사람에게 돈을 빌려줄 때 받는 이자예요. 이 이자가 오르면 다른 모든 빌림의 이자도 따라 오르기 쉬워요.', example: null, related: ['rate', 'bond_fund'] },
    { id: 'vix', term: '불안지수(VIX)', aliases: ['VIX', '빅스', '공포지수', '변동성지수'], short: '미국 투자자들이 앞으로 한 달 동안 주가가 얼마나 출렁일 거라고 걱정하는지를 숫자로 나타낸 거예요. 보통 20 아래면 차분하고, 30을 넘으면 불안이 큰 상태로 봐요.', analogy: "태풍 예보와 비슷해요. 지금 비가 오는지가 아니라 '얼마나 불안해하고 있는지'를 알려 줘요.", example: "뉴스에서는 '공포지수'라고 부르기도 해요. 이 앱에서는 '불안지수'라고 써요.", related: ['volatility'] },
    { id: 'foreign_trade', term: '외국인 매수·매도', aliases: ['외국인 순매수', '외국인 순매도', '외인'], short: "외국 투자자가 우리 주식을 산 금액이 판 금액보다 많으면 '순매수', 적으면 '순매도'라고 해요. 거래 규모가 커서 외국인이 한쪽으로 몰리면 코스피가 크게 움직여요.", analogy: "시장에 온 '큰손 단체 손님'이에요. 한꺼번에 사 가면 값이 오르고, 한꺼번에 팔고 나가면 값이 내려가요.", example: '뉴스에 자주 나오는 말이라 풀이만 담았어요.', related: ['fx', 'ewy'] },
    { id: 'circuit_breaker', term: '서킷브레이커', aliases: ['매매거래 일시중단', 'CB'], short: '코스피가 전날보다 8% 넘게 떨어진 상태가 1분 이어지면 20분 동안 모든 거래를 멈추는 제도예요. 15% 넘게 떨어지면 다시 20분을 멈추고, 20% 넘게 떨어지면 그날 장을 끝내요.', analogy: '집의 두꺼비집(누전 차단기)과 같아요. 전기가 과하게 흐르면 잠깐 끊어서 불이 번지지 않게 하듯, 겁에 질린 거래가 꼬리를 무는 걸 잠시 멈춰요.', example: '발동됐다고 다음 날 더 떨어지거나 오르는 게 정해져 있지는 않아요.', related: ['sidecar', 'volatility'] },
    { id: 'sidecar', term: '사이드카', aliases: ['프로그램매매 호가 효력정지'], short: "코스피200 선물 값이 5% 넘게 오르거나 내린 상태가 1분 이어지면, 컴퓨터가 자동으로 내는 대량 주문(프로그램 매매)을 5분 동안 멈추는 제도예요. 서킷브레이커보다 한 단계 약한 '알림'이에요.", analogy: "과속 차량 옆에 붙어 '속도 줄이세요' 하고 따라가는 경찰 오토바이예요. 차를 세우진 않고 잠깐 속도만 늦춰요.", example: '오를 때도 발동돼요. 사이드카가 떴다고 나쁜 날이라는 뜻은 아니에요.', related: ['circuit_breaker'] },
    { id: 'volatility', term: '변동성', aliases: ['출렁임', '변동폭'], short: "가격이 얼마나 크게 오르내리는지, 즉 '출렁임의 크기'예요. 오를지 내릴지와는 별개라서, 변동성이 크면 크게 오를 수도 크게 내릴 수도 있어요.", analogy: '잔잔한 호수와 파도 치는 바다의 차이예요. 바다가 거칠수록 배가 어디로 갈지보다 얼마나 흔들릴지가 먼저 커져요.', example: "앱의 '요즘 출렁임: 평소의 2배'는 최근 하루하루 움직임이 지난 5년 보통 때보다 2배쯤 크다는 뜻이에요.", related: ['vix', 'prob_range'] },
    { id: 'prob_range', term: '확률·범위', aliases: ['오를 확률', '80% 범위', '95% 범위', '예측 범위', '범위'], short: "'오를 확률 60%'는 비슷한 상황 10번 중 6번쯤 올랐다는 뜻이고, 나머지 4번은 내렸다는 뜻이에요. '80% 범위'는 10번 중 8번쯤 종가가 그 안에 들어온다는 뜻이라, 10번 중 2번은 벗어나요.", analogy: '일기예보의 강수확률과 같아요. 60%면 우산을 챙길 만하지만, 비가 안 오는 날도 분명히 있어요.', example: null, exampleFn: 'coverage', related: ['volatility'] },
    { id: 'etf', term: 'ETF', aliases: ['상장지수펀드'], short: '여러 주식이나 채권을 한 바구니에 담아, 주식처럼 증권사 앱에서 바로 사고팔 수 있게 만든 상품이에요. 코스피200 같은 지수를 그대로 따라가는 것이 대표적이에요.', analogy: "과일을 하나씩 고르는 대신 마트 진열대에서 바로 집어 드는 '과일 선물세트'예요.", example: null, related: ['fund', 'leverage_inverse'] },
    { id: 'fund', term: '펀드', aliases: ['공모펀드', '투자신탁'], short: '여러 사람의 돈을 모아 전문 회사(운용사)가 대신 투자해 주는 상품이에요. 보통 하루에 한 번 정해지는 가격(기준가)으로 사고팔고, 운용 수수료(보수)가 있어요.', analogy: '계모임 돈을 모아 장보기를 잘 아는 사람에게 맡기는 것과 같아요. 대신 심부름 값을 조금 내죠.', example: '펀드는 오늘 신청해도 며칠 뒤 가격으로 거래되는 경우가 많아서, 오늘 코스피 숫자와 바로 같게 움직이지 않을 수 있어요.', related: ['etf', 'bond_fund'] },
    { id: 'bond_fund', term: '채권형', aliases: ['채권형 펀드', '채권 ETF', '채권'], short: '주로 채권(나라나 회사에 돈을 빌려주고 이자를 받는 증서)에 투자하는 펀드·ETF예요. 주식형보다 덜 출렁이는 편이지만, 금리가 오르면 값이 내려갈 수 있어요.', analogy: '매달 꼬박꼬박 월세가 들어오는 상가예요. 크게 오르는 일은 드물지만 덜 흔들려요.', example: null, related: ['govbond', 'rate', 'fund'] },
    { id: 'dividend', term: '배당', aliases: ['배당금', '분배금'], short: "회사가 번 돈의 일부를 주주에게 나눠 주는 거예요. 펀드나 ETF에서는 '분배금'이라고 부르기도 해요.", analogy: '과수원 지분을 갖고 있으면 가을에 수확한 과일을 지분만큼 나눠 받는 것과 같아요.', example: '배당을 주는 날이 지나면 그만큼 주가가 조금 내려가 보이는 날이 있어요(배당락). 손해가 난 게 아니라 나눠 준 몫이 빠진 거예요.', related: ['etf', 'fund'] },
    { id: 'leverage_inverse', term: '레버리지·인버스', aliases: ['레버리지', '인버스', '곱버스', '2배 ETF'], short: '레버리지는 지수가 1% 오르면 약 2% 오르도록(내릴 땐 약 2% 내리도록) 만든 상품이고, 인버스는 지수와 반대로 움직이도록 만든 상품이에요. 하루 단위로 맞춰지기 때문에 오래 들고 있으면 기대와 다른 결과가 나올 수 있어 특히 조심해야 해요.', analogy: "레버리지는 '확성기'라서 좋은 소리도 나쁜 소리도 2배로 커져요. 인버스는 '거울'이라 반대로 비춰요.", example: '지수가 하루 10% 오르고 다음 날 10% 내리면 지수는 −1%지만, 2배 레버리지는 −4%가 돼요(1.2 × 0.8 = 0.96).', related: ['etf', 'volatility'] },
    { id: 'kosdaq', term: '코스닥', aliases: ['KOSDAQ'], short: '코스피보다 규모가 작은 회사, 성장 중인 기술·바이오 회사가 많이 모인 우리나라의 또 다른 주식시장과 그 지수예요. 보통 코스피보다 더 크게 출렁여요.', analogy: "코스피가 큰 백화점이라면, 코스닥은 개성 있는 가게가 많은 '신상 골목'이에요.", example: null, related: ['kospi'] },
    { id: 'ewy', term: 'EWY(미국에 있는 한국 ETF)', aliases: ['EWY', 'MSCI 한국 ETF', '미국 속 한국 주식'], short: '미국 주식시장에서 거래되는, 한국 대표 주식들을 담은 ETF예요. 우리 장이 닫힌 밤에도 미국에서 거래되기 때문에, 밤사이 외국인이 한국 주식을 어떻게 보는지 미리 엿볼 수 있어요.', analogy: "우리 가게가 문 닫은 밤에 외국 시장에 내놓은 '우리 물건 견본'의 가격표예요.", example: "이 앱의 예측에서 다음 날 코스피에 가장 큰 영향을 준 변수가 바로 'EWY 밤사이 움직임'이었어요.", related: ['foreign_trade', 'etf'] }
  ];
  var GLOSSARY_BY_ID = {};
  GLOSSARY.forEach(function (g) { GLOSSARY_BY_ID[g.id] = g; });

  var TIPS = [
    { id: 'tip_overnight_us', title: '왜 아침마다 미국 시장 얘기를 할까요?', intro: '미국 장이 끝난 뒤 우리 장이 열려요',
      body: ['미국 주식시장은 우리 시간으로 밤 10시 30분부터 새벽 5시까지 열려요(미국 서머타임이 아닐 땐 밤 11시 30분~새벽 6시).', '그래서 아침 9시에 우리 장이 열리면, 밤사이 미국에서 있었던 일이 한꺼번에 반영돼요.', '이 앱의 예측에서도 다음 날 코스피에 영향이 큰 변수 1~3위가 모두 밤사이 미국 숫자였어요. 미국에 있는 한국 ETF(EWY), 마이크론, 필라델피아 반도체지수예요.'],
      caution: '하지만 우리 장 안에서 새 소식이 나오면 방향이 바뀌기도 해요. 그래서 이 앱이 오를지 내릴지 맞힌 비율도 전체 기준 {dirHit}% 정도예요.', links: ['nasdaq', 'sox', 'ewy'] },
    { id: 'tip_fx_foreigners', title: '환율이 오르면 왜 코스피가 힘들어할까요?', intro: '외국인 투자자는 달러로 셈해요',
      body: ['외국인 투자자는 결국 달러로 돈을 셈해요.', '원/달러 환율이 오르면(원화 값이 내려가면) 같은 한국 주식도 달러로 바꿨을 때 값이 줄어들어요.', '그래서 환율이 빠르게 오를 땐 외국인이 한국 주식을 파는 경우가 많고, 이게 코스피에 부담이 돼요. 반대로 원화 값이 오를 땐 외국인이 들어오기 쉬워요.'],
      liveFn: 'fx', caution: '이 앱 계산에서도 환율이 평소보다 크게 오른 다음 날은 코스피 예상값이 조금(약 0.1%) 낮아지는 경향이 있었지만, 늘 그런 건 아니에요.', links: ['fx', 'foreign_trade'] },
    { id: 'tip_after_big_drop', title: '하루 크게 빠진 다음 날은 어땠을까요?', intro: '지난 기록을 세어 봤어요',
      bodyFn: 'afterBigDrop',
      fallback: ['2025년 1월부터 2026년 10월까지 코스피가 하루에 4% 넘게 떨어진 날은 26번 있었어요.', '그다음 날 오른 건 18번, 오르지 않은 건 8번이었어요.', '8번 중 5번은 다음 날 또 4% 넘게 떨어졌고, 가장 크게 떨어진 다음 날은 −12.1%였어요(2026년 3월 4일).'],
      caution: '정해진 규칙은 없어요. 다음 날 더 크게 떨어진 적도 여러 번 있었어요. 하루 숫자만으로 거래를 정하기는 어려워요.', links: ['volatility', 'prob_range'] },
    { id: 'tip_points_vs_percent', title: "'300포인트 하락', 얼마나 큰 걸까요?", intro: '포인트보다 %를 보면 정확해요',
      bodyFn: 'points',
      fallback: ['같은 1%라도 지수가 높을수록 포인트 숫자는 커져요.', '코스피가 2,400일 때 1%는 24포인트, 6,000일 때는 60포인트, 9,000일 때는 90포인트예요.', '크기를 비교할 땐 %를 보는 게 정확해요.'],
      caution: null, links: ['point', 'kospi'] },
    { id: 'tip_semiconductor', title: '왜 반도체 소식에 코스피가 들썩일까요?', intro: '코스피에서 반도체 몫이 아주 커요',
      body: ['코스피에서 삼성전자·SK하이닉스 같은 반도체 회사가 차지하는 몫이 아주 커요.', '그래서 미국 반도체 회사(마이크론 등)나 필라델피아 반도체지수가 밤사이 크게 움직이면, 다음 날 코스피도 따라 움직이는 경우가 많아요.', "이 앱에서 내일 범위를 'SOX가 오르면 / 내리면'으로 나눠 보여 주는 것도 그 때문이에요."],
      liveFn: 'sox', caution: '반도체가 좋다고 코스피 전체가 늘 오르는 건 아니에요. 다른 업종이나 환율이 반대로 움직이기도 해요.', links: ['semiconductor', 'sox'] }
  ];

  // 상식 카드 본문 채우기. data: {ctx(MC.compute 결과), afterBigDrop, result}
  function tipBody(tip, data) {
    data = data || {};
    var body = tip.body ? tip.body.slice() : null, live = null;
    if (tip.bodyFn === 'afterBigDrop') {
      var a = data.afterBigDrop;
      // 검수 S8: '크게 빠진 다음 날은 대개 오른다'로 읽히지 않게 오른 날·내린 날을 같은 무게로 쓴다(평소 비율 비교는 뺌).
      body = a ? ['최근 ' + a.years + '년 동안 코스피가 하루에 4% 넘게 떨어진 날은 ' + a.n + '번 있었어요.',
        '그다음 날 오른 건 ' + a.up + '번, 오르지 않은 건 ' + (a.n - a.up) + '번이었어요.',
        (a.n - a.up) + '번 중 ' + a.again + '번은 다음 날 또 4% 넘게 떨어졌고, 가장 크게 떨어진 다음 날은 ' + U.signPct(a.worstNextPct) + '였어요.'] : tip.fallback.slice();
    }
    if (tip.bodyFn === 'points') {
      var k = data.ctx && data.ctx.kospi;
      body = k ? ['같은 1%라도 지수가 높을수록 포인트 숫자는 커져요.', '코스피가 2,400일 때 1%는 24포인트였지만, 지금(' + U.fmtInt(k.close) + ')은 1%가 약 ' + U.fmtInt(Math.round(k.close * 0.01)) + '포인트예요.', "그래서 요즘 뉴스의 '몇백 포인트'는 예전보다 커 보이기 쉬워요. 크기를 비교할 땐 %를 보는 게 정확해요."] : tip.fallback.slice();
    }
    if (tip.liveFn === 'fx' && data.ctx && data.ctx.fx) {
      var f = data.ctx.fx, d = f.fxDiff;
      var word = Math.abs(d) < 2 ? '비슷해요' : d > 0 ? U.signPct(d) + ' 높아요' : U.signPct(d) + ' 낮아요';
      live = '지금 환율은 ' + U.fmtInt(f.fx) + '원으로, 지난 1년 평균보다 ' + word + '.';
    }
    if (tip.liveFn === 'sox' && data.result && data.result.scenarios && data.result.scenarios.length === 5) {
      var sc = data.result.scenarios, up = sc[4], dn = sc[0], R = root.Reading;
      if (up.pUp != null && dn.pUp != null && R) live = '예: 오늘 밤 SOX가 3% 넘게 오르면 오를 확률 ' + R.upPctOf(up.pUp) + '%, 3% 넘게 내리면 ' + R.upPctOf(dn.pUp) + '%로 계산됐어요.';
    }
    var caution = tip.caution;
    if (caution && caution.indexOf('{dirHit}') >= 0) {
      var st = data.result && data.result.stats;
      caution = caution.replace('{dirHit}', st && st.dirHit ? Math.round(st.dirHit * 100) : 65);
    }
    return { body: body, live: live, caution: caution };
  }

  // stocks2 §4-2 (⑤는 DECISIONS·금지어에 맞게 고침)
  function worryPages(stats) {
    var N = stats && stats.holdoutN ? stats.holdoutN : 431, miss = stats && stats.miss95 != null ? stats.miss95 : 22;
    var dir = stats && stats.dirHit ? Math.floor(stats.dirHit * 10) : 6;
    return [
      { title: '범위가 넓은 날은', body: "오늘처럼 예측 범위가 넓은 날은 '크게 떨어진다'는 뜻이 아니라 '어느 쪽으로든 크게 움직일 수 있다'는 뜻이에요. 이 앱이 지난 " + N + '일 동안 오를지 내릴지를 맞힌 건 10번 중 ' + dir + '~' + (dir + 1) + '번이었어요. 예측은 틀릴 때도 많아요.' },
      { title: '지난 큰 하락들', body: '2008년 금융위기 때 코스피는 1년 사이 절반 넘게(2,064 → 938) 내려갔고, 이전 높이를 되찾는 데 약 3년이 걸렸어요. 2020년 코로나 때는 한 달 새 1,457까지 내려갔다가 그해 말 2,800을 넘었어요. 회복이 빨랐던 때도, 오래 걸린 때도 있었어요. 다만 지수와 달리 개별 회사는 예전 가격을 되찾지 못한 경우도 있어요.' },
      { title: '급한 결정에 대해', body: '여러 연구에서, 시장이 크게 흔들린 직후에 급하게 사고판 개인 투자자의 성과가 그대로 둔 경우보다 낮은 경향이 있었어요. 그래서 마음이 급한 날에는 하루 이틀 지나 차분할 때 다시 살펴보는 분들이 많아요.' },
      { title: '이 돈은 언제 쓸 돈인가요?', body: '하루의 숫자가 얼마나 중요한지는 이 돈을 언제 써야 하는지에 따라 달라요. 1~2년 안에 필요한 돈인지, 오래 둘 수 있는 돈인지 한번 떠올려 보세요. 가까운 시기에 필요한 돈이라면 가족이나 거래하시는 은행·증권사 상담 창구와 이야기해 보는 것도 방법이에요.' },
      { title: '하루는 하루예요', body: "하루 움직임에는 우연이 많이 섞여 있어요. 이 앱이 '20번 중 19번'이라고 한 넓은 범위도 " + N + '일 중 ' + miss + '일은 벗어났어요. 오늘 숫자가 1년 뒤를 말해 주지는 않아요.' }
    ];
  }
  var WORRY_FOOT = '이 글은 투자 권유가 아니에요. 사고파는 결정은 어머님 상황에 맞게 하시면 돼요.';

  // stocks3 3.2 / 3.3
  var NOTICE_VERSION = 1;
  var NOTICE_TITLE = '시작하기 전에 알아 두세요';
  var NOTICE_LEAD = "이 앱은 코스피가 내일 어디쯤 움직일지 지난 자료로 계산한 '참고용 예보'예요.";
  var NOTICE_POINTS = [
    '사거나 팔라고 권하는 앱이 아니에요. (투자 자문이나 투자 권유가 아니에요.)',
    '예측은 틀릴 수 있어요. 수익을 약속하지 않아요.',
    '사고파는 결정과 그 결과는 어머님 몫이에요.',
    '시세는 Yahoo Finance에서 가져오며, 늦거나 틀릴 수 있어요.',
    '입력하신 내 주식·펀드 정보는 이 폰에만 저장돼요.'
  ];
  var NOTICE_EXTRA = ['이 앱은 가족이 쓰려고 만든 개인 앱이에요. 다른 사람에게 나눠 주지 말아 주세요.'];

  // ref/drivers.json (모델 계수: 1표준편차 움직일 때 코스피 영향 %) — 위 5개
  var DRIVERS = [
    { name: '밤사이 미국 속 한국 주식(EWY)', term: 'ewy', effect: 0.529 },
    { name: '마이크론(미국 메모리 반도체 회사)', term: 'semiconductor', effect: 0.354 },
    { name: '미국 반도체(SOX)', term: 'sox', effect: 0.215 },
    { name: '신흥국 주식 묶음(EEM)', term: null, effect: 0.152 },
    { name: '미국 불안지수(VIX) 변화', term: 'vix', effect: -0.147 },
    { name: '코스피 전날 등락', term: 'kospi', effect: -0.145 },
    { name: '원/달러 환율 변화', term: 'fx', effect: -0.139 }
  ];
  var WHY_NOT_NARROW = [
    '하루 앞을 100포인트 폭으로 맞히려면 예측 오차가 0.4% 안이어야 해요.',
    '그런데 실제 하루 오차는 보통 2~3%예요. 그래서 범위를 그보다 좁게 잡으면 자주 벗어나요.',
    '장이 열린 날 오후 3시 무렵이 되어야 100포인트 폭으로 좁혀져요. 하루 전에는 그렇게 좁힐 수 없어요.'
  ];

  // stocks3 §2 — 숫자는 모델 결과(stats)와 성적표 계산(rs)에서 채운다. 예시 날짜들은 스펙이 계산해 둔 값.
  function trustSections(stats, rs) {
    stats = stats || {}; rs = rs || {};
    var N = stats.holdoutN || 431, miss = stats.miss95 != null ? stats.miss95 : 22, in95 = N - miss;
    var cov95 = stats.cov95 != null ? (stats.cov95 * 100).toFixed(1) : '94.9';
    var tiers = stats.dirTiers || [];
    var fb = rs.flatBand;
    var pct0 = function (x) { return Math.round(x * 100) + '%'; };
    var t = function (i) { var x = tiers[i]; if (!x) return null; var h = Math.round(x.hit * x.n); return { n: x.n, hits: h, miss: x.n - h, hit: pct0(x.hit), share: Math.round(x.share * 100) + '%', every: Math.round(1 / x.share) }; };
    var t60 = t(0), t65 = t(1), t70 = t(2);
    var dirRows = [{ who: '모든 날', freq: '매일', hit: stats.dirHit ? pct0(stats.dirHit) : '65%' }];
    if (t60) dirRows.push({ who: '앱이 조금 자신 있는 날 (오를 확률 60% 이상 또는 40% 이하)', freq: t60.every + '일에 1번꼴 (' + t60.share + ')', hit: t60.hit + ' (' + t60.n + '번 중 ' + t60.hits + '번)' });
    if (t65) dirRows.push({ who: '앱이 꽤 자신 있는 날 (65% 이상 또는 35% 이하)', freq: t65.every + '일에 1번꼴 (' + t65.share + ')', hit: t65.hit + ' (' + t65.n + '번 중 ' + t65.hits + '번)' });
    if (t70) dirRows.push({ who: '앱이 아주 자신 있는 날 (70% 이상 또는 30% 이하)', freq: t70.every + '일에 1번꼴 (' + t70.share + ')', hit: t70.hit + ' (' + t70.n + '번 중 ' + t70.hits + '번)' });
    if (fb) dirRows.push({ who: '앱이 자신 없는 날 (40~60%)', freq: '나머지', hit: '약 ' + fb.pct + '% (동전 던지기와 비슷)' });
    var missSplit = (rs.missUp != null && rs.missDays && rs.missDays.length === miss)
      ? '범위 밖으로 나간 ' + miss + '일 중 ' + rs.missDown + '일은 더 많이 내렸고, ' + rs.missUp + '일은 더 많이 올랐어요.' : null;
    return [
      { id: 'weather', q: '일기예보처럼 생각해 주세요', a: [
        "일기예보에서 '내일 비 올 확률 60%'라고 하면, 비가 꼭 온다는 뜻이 아니에요. '이런 날씨 10번 중 6번쯤은 비가 왔다'는 뜻이에요. 나머지 4번은 맑았어요.",
        "이 앱도 똑같아요. '코스피가 오를 확률 60%'는 비슷한 날 10번 중 6번쯤 올랐다는 뜻이에요. 4번쯤은 내렸어요.",
        '그래서 우산을 챙기는 건 내 몫이에요. 예보는 참고만 해요.'] },
      { id: 'tested', q: '이 숫자는 어떻게 검사했나요?', a: [
        '앱을 만들 때 한 번도 보지 않은 기간(' + (rs.firstDate ? U.fmtDateFull(rs.firstDate).replace(/ \(.\)$/, '') : '2025년 1월 2일') + '부터 시장이 열린 ' + N + '일)으로 시험해 봤어요. 매일 그날 이전 자료만 써서 계산했어요.',
        "'20번 중 19번' 범위는 실제로 " + N + '일 중 ' + in95 + '일 들어왔어요(' + cov95 + '%). ' + miss + '일은 범위 밖으로 나갔어요. 약 20일에 1번꼴이에요.',
        missSplit,
        "약속(95%)과 결과가 거의 같으니, 범위는 정직하게 맞춰진 편이에요. 하지만 '20번 중 1번은 벗어난다'는 것도 약속 안에 들어 있어요. 그 1번이 언제일지는 아무도 몰라요.",
        '참고: 2026년은 시장이 아주 크게 움직인 해라서, 95% 범위의 폭이 평균 15.7%나 됐어요(2025년은 6.3%, 2026년 10월 13일까지 검증 기준). 범위가 넓은 날은 앱도 앞일을 잘 모르는 날이에요.'].filter(Boolean) },
      { id: 'missed', q: '틀리는 날은 어떤 날이에요?', a: [
        '2026년 6월 23일 — 생각보다 훨씬 많이 내린 날. 전날 9,115, 앱의 95% 범위 8,731~9,673, 실제 8,204(하루에 −10.0%). 범위 아래 끝보다 527포인트 더 내려갔어요.',
        '2025년 4월 10일 — 생각보다 많이 오른 날. 전날 2,294, 앱의 95% 범위 2,271~2,434, 실제 2,445(하루에 +6.6%). 틀리는 건 내리는 쪽만이 아니에요.',
        '2026년 10월 13일 — 전날 6,384, 앱의 95% 범위 6,052~6,687, 실제 6,035(하루에 −5.5%). 범위 아래 끝보다 17포인트 더 내려갔어요.',
        '가장 크게 빗나간 날은 2026년 7월 28일이에요. 범위는 6,158~7,294였는데 실제는 6,024(−10.8%)였어요.',
        "범위를 벗어나는 날은 대개 갑자기 큰일이 생긴 날이에요. 그런 날에는 손해도 커요. '95%'는 '모든 날'이 아니에요."] },
      { id: 'direction', q: '오를지 내릴지는 얼마나 맞혔나요?', table: dirRows, a: [
        '자신 있는 날은 드물어요. 아주 자신 있는 날은 ' + (t70 ? t70.every + '일에 1번' : '4일에 1번') + '뿐이에요.',
        t70 ? '자신 있는 날에도 틀려요. 아주 자신 있는 날 ' + t70.n + '번 중 ' + t70.miss + '번은 틀렸어요.' : null,
        '자신 없는 날은 거의 동전 던지기예요. 그런 날 예측으로 사고팔 이유는 별로 없어요.',
        rs.dirWrong && rs.dirWrong.len ? '예측 방향이 며칠 연속 틀리는 때도 있었어요(검증 기간 중 최대 ' + rs.dirWrong.len + '일 연속).' : null,
        '자신 있는 날의 기준(60%·65%·70%)은 시험 기간을 보기 전에(2024년까지 자료로) 미리 정해 두었어요. 결과를 보고 좋게 고른 숫자가 아니에요.'].filter(Boolean) },
      { id: 'use', q: '직접 거래를 생각할 때는 어떻게 보면 좋을까요?', a: [
        '오를 확률보다 범위를 먼저 봐 주세요. 범위가 넓은 날은 어느 쪽으로든 크게 움직일 수 있는 날이에요.',
        '범위 끝은 최저·최고가 아니에요. 한 달에 한 번쯤은 그 밖으로 나가요.',
        '이 앱은 코스피 전체를 봐요. 갖고 계신 종목 하나하나의 내일은 예측하지 않아요.',
        '뉴스로 갑자기 생기는 일(전쟁, 정책 발표, 큰 회사 사고 등)은 미리 알 수 없어요.',
        "한 줄 정리: 이 앱은 '내일 날씨 예보'예요. 우산을 챙길지, 외출을 미룰지는 어머님이 정해요."] }
    ];
  }

  var Content = {
    GLOSSARY: GLOSSARY, GLOSSARY_BY_ID: GLOSSARY_BY_ID, TIPS: TIPS, tipBody: tipBody, worryPages: worryPages, WORRY_FOOT: WORRY_FOOT,
    NOTICE_VERSION: NOTICE_VERSION, NOTICE_TITLE: NOTICE_TITLE, NOTICE_LEAD: NOTICE_LEAD, NOTICE_POINTS: NOTICE_POINTS, NOTICE_EXTRA: NOTICE_EXTRA,
    DRIVERS: DRIVERS, WHY_NOT_NARROW: WHY_NOT_NARROW, trustSections: trustSections
  };
  root.Content = Content;
  if (typeof module !== 'undefined' && module.exports) module.exports = Content;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
