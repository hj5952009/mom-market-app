# 엄마의 시장 나침반 (홈 화면 이름: 시장 나침반)

가족 한 분(어머님)을 위한 안드로이드 앱입니다. 매일 코스피가 다음 거래일에 어디쯤에서 끝날지 **범위와 오를 확률**로 보여 주고,
그 예측이 지난날 얼마나 맞았는지(성적표), 갖고 계신 종목이 코스피와 어떻게 움직여 왔는지(내 종목)를 함께 보여 줍니다.
**투자 권유가 아닌 통계 참고용**이며, 사고팔라는 말은 어디에도 쓰지 않습니다.

- 화면: 오늘 / 내 종목 / 성적표 / 더보기 (+ 첫 실행 안내 3장)
- 예측: 폰이 Yahoo Finance 일봉(10년치, 11개 지표)을 직접 받아 `www/js/model.js`(검증된 모델, 수정 금지)로 계산합니다. 서버는 없습니다.
- 알림: 평일 오전 8:40(바꿀 수 있음)에 "오늘 코스피 예측이 준비됐어요" 알림. 숫자는 넣지 않습니다.

## 빌드 (GitHub Actions)

저장소 루트 = 이 폴더입니다. `main`에 푸시하거나 Actions 탭에서 **Build APK → Run workflow**를 누르면:

1. `npm ci` → `npm test`(문구·규칙 단위 테스트) → `npx cap sync android`
2. `android/gradlew assembleRelease` (러너의 Android SDK, Java 21)
3. APK를 Actions 아티팩트로 올리고, **Releases**에 `v1.0.0-<실행번호>` 태그로 `market-compass.apk`를 붙입니다.

`versionCode`는 Actions 실행 번호라서 새 빌드는 항상 "업데이트"로 설치됩니다. 앱의 더보기 › 새 버전 확인은
`https://api.github.com/repos/hj5952009/mom-market-app/releases/latest`의 태그 번호와 앱에 찍힌 빌드 번호(`www/build.json`, CI가 기록)를 비교합니다.

로컬에서 웹 화면만 보려면: 아무 정적 서버로 `www/`를 열면 됩니다(네이티브가 아니면 자동으로 **체험용(데모) 모드**, 묶어 둔 실제 모델 결과 사용).

```
npm install
npm test                      # 문구·규칙 단위 테스트 (node)
npm run screenshots           # 데모 화면 360×800 스크린샷 → screenshots/ (Chromium 필요)
node tools/make-demo.js       # www/demo/*.json 다시 만들기 (../ref 필요)
python3 tools/make-icons.py   # 런처·알림·스플래시 아이콘 다시 만들기 (Pillow)
```

## 갤럭시 폰에 설치하기

1. 폰에서 GitHub 저장소의 **Releases**(최신 것)를 열고 `market-compass.apk`를 누릅니다(크롬이나 삼성 인터넷).
2. "이 유형의 파일은 기기를 손상시킬 수 있습니다" 같은 안내가 나오면 **다운로드**를 누릅니다.
3. 다 받으면 **열기**(또는 내 파일 › 다운로드에서 `market-compass.apk`)를 누릅니다.
4. "출처를 알 수 없는 앱" 안내가 나오면 **설정 › 이 출처 허용**을 켭니다(받은 앱이 크롬이면 크롬, 내 파일이면 내 파일에 대해). 뒤로 가서 **설치**.
5. Play 프로텍트가 "확인되지 않은 앱"이라고 하면 **세부정보 › 무시하고 설치**를 누릅니다(가족용이라 스토어 등록을 하지 않았기 때문).
6. 처음 열면 안내 3장이 나오고, 마지막 장에서 "네, 참고용이라는 걸 이해했어요"를 눌러야 시작됩니다. 알림 권한 창에서 **허용**을 누르면 아침 알림이 옵니다.

업데이트도 같은 방법으로 새 APK를 설치하면 데이터(내 종목·설정)는 그대로 남습니다.

## 서명 keystore 안내 (꼭 읽기)

- `android/app/family-release.keystore`(별칭 `family`)와 비밀번호(`android/app/build.gradle`에 평문)를 **일부러 저장소에 넣었습니다.**
  모든 빌드가 같은 서명이어야 기존 앱 위에 업데이트 설치가 되기 때문입니다.
- 위험: 저장소를 볼 수 있는 사람은 누구나 "같은 서명의 가짜 업데이트"를 만들 수 있습니다. 그래서 **저장소는 비공개로 두고**, APK는 가족에게만 전달해 주세요.
  이 keystore를 다른 앱이나 스토어 배포에 쓰지 마세요.
- keystore를 바꾸면 폰에서 기존 앱을 지우고 다시 설치해야 합니다(내 종목·설정이 지워짐).

## 자료와 안전 안내

- 시세: Yahoo Finance 비공식 차트 API(`query1/query2.finance.yahoo.com/v8/finance/chart`). 개인적·비상업적 참고용이며, 늦거나 빠지거나 바뀔 수 있습니다.
  앱 안 여러 곳에 "시세 출처 Yahoo Finance"를 표시합니다.
- 보유 종목·금액은 **폰 안(localStorage)에만** 저장하고 어디로도 보내지 않습니다. 오류 정보 보내기는 사용자가 공유창에서 직접 보낼 때만 나갑니다.
- 숫자는 모두 모델 결과(`KModel.run`)나 스펙에 계산돼 있던 값만 씁니다. "확실·반드시·사세요·파세요·폭락" 등 금지어는 `npm test`가 모든 문구에서 검사합니다.
- 배포는 **가족 한정**입니다. 단톡방·카페·스토어에 올리거나 유료로 하면 유사투자자문업 등 법적 검토가 필요합니다.

## 폴더

```
www/                화면(빌드 도구 없는 HTML/CSS/JS)
  js/model.js       검증된 예측 모델(app-src/model.js와 같은 파일, sha256 테스트로 확인)
  js/compute.js     모델 + 간밤 요약 + 요즘 시장 숫자 묶음 (worker.js에서 실행)
  js/reading.js     오늘·성적표 문구와 규칙 (stocks1/stats2/stocks3/DECISIONS)
  js/overnight.js   간밤 세계 시장 요약 (macro1)
  js/context.js     요즘 시장 이야기·상식 카드 고르기 (macro2)
  js/holdings.js    내 종목 카탈로그·계산·카드 문구 (stocks2)
  js/content.js     용어 사전·상식·안내·"얼마나 믿을 만한가요?" 글
  js/app.js         화면·이동·설정·알림 (ux1)
  demo/             체험용 자료 (실제 모델 결과 + 예시 시세)
android/            Capacitor 안드로이드 프로젝트 (gradle wrapper, keystore 포함)
test/               단위 테스트, 스크린샷 스크립트
screenshots/        검수용 화면 (데모 모드, 360×800, 글씨 1.0/1.3/1.56배)
```
