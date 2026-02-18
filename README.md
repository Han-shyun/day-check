# day-check

TickTick처럼 항목을 강제로 여러 화면/분류로 나누지 않고, **한 페이지에서 투두를 빠르게 쌓고 나중에 분류를 붙이는** 개인용 일정/체크리스트 앱입니다.

## 현재 구현 상태 (v5.1)
- 메인 원페이지 투두 UI
- **UI 미감 리프레시** (더 넓은 여백, 부드러운 컬러/카드, 버튼/폼 시각 개선)
- **큰 투두 입력창(한창) 제공**
  - 여러 줄 입력 가능 (줄바꿈마다 할 일 1개 저장)
- 입력 옵션
  - 날짜
  - 우선순위
  - 분류 선택
- **분류 추가 UX 개선 (팝업 없음)**
  - `+ 분류 추가` 클릭 시 입력창이 폼 옆에서 펼쳐짐
  - 새 분류를 즉시 생성 후 선택 가능
- 전체 투두 리스트에서 항목별 분류를 나중에 변경 가능
- 완료/삭제 처리
  - 완료 버튼: doneLog 기록 후 목록에서 제거
  - 삭제 버튼: 기록 없이 제거
- 브라우저 로컬스토리지 저장(남은 체크리스트는 다음날에도 유지)
- 이번 주 리포트
  - 이번 주 완료(지운 일)
  - 아직 남은 일
- 월간 달력 v3
  - 날짜 지정 투두와 달력 메모를 함께 표시
  - 날짜 셀 `일정 N · 완료 M`
  - 날짜 상세(추가/완료/메모) 확인
TickTick처럼 항목을 강제로 여러 화면/분류로 나누지 않고, **한 페이지에서 전체 할 일 + 달력 메모를 함께 관리**하는 개인용 일정/체크리스트 앱입니다.

## 현재 구현 상태 (v3)
- 메인 원페이지 체크리스트 UI
- 빠른 추가(제목 + 날짜 선택 + 우선순위 + 버킷)
- 4개 섹션: `today`, `project`, `routine`, `inbox`
- **완료(지우기)** 버튼: 할 일 수행 후 리스트에서 바로 제거
- 일반 삭제 버튼(기록 없이 제거)
- 날짜 미지정 항목은 우선순위 기준 정렬
- 브라우저 로컬스토리지 저장(남은 체크리스트는 다음날에도 유지)
- 이번 주 리포트
  - 이번 주 완료(지운 일)
  - 아직 남은 일
- **월간 달력 v3**
  - 날짜 지정 체크리스트와 별도 달력 메모를 함께 표시
  - 각 날짜 셀에 `일정 N · 완료 M` 집계 표시
  - 날짜 클릭 시 하단 내용창에서 확인 가능
    - 해당 날짜에 추가된 체크리스트(생성 시간)
    - 해당 날짜에 완료된 체크리스트(완료 시간)
    - 해당 날짜의 달력 메모/별도 내용

## 로컬 실행 방법
```bash
python3 -m http.server 4173
```
브라우저에서 `http://localhost:4173` 접속.

## GitHub 온라인 테스트 서버 (GitHub Pages)
이 저장소는 GitHub Actions로 Pages 자동 배포가 되도록 설정되어 있습니다.

1. GitHub 저장소 **Settings → Pages**로 이동
2. **Build and deployment**에서 Source를 `GitHub Actions`로 설정
3. `main` 또는 `work` 브랜치에 push
4. Actions의 `Deploy static site to GitHub Pages` 워크플로가 완료되면 아래 주소로 접속

```text
https://<github-username>.github.io/<repository-name>/
```

예시:
```text
https://yourname.github.io/day-check/
```

---

## 지금 반영된 사용 방식
1. 일이 발생하면 빠르게 입력
2. 처리한 일은 `완료(지우기)`로 제거
3. 날짜 없는 일은 우선순위(높음/보통/낮음)로 위에서부터 처리
4. 날짜가 있는 일은 달력에도 함께 표시
5. 체크리스트 외 별도 내용(메모/잡다한 기록)도 달력에 직접 추가
6. 달력에서 날짜를 누르면 그날 **추가/완료/메모 내역**을 내용창에서 확인
7. 다음날에는 지운 항목 제외하고 남은 체크리스트 유지
8. 이번 주에 한 일/못 한 일을 하단 리포트에서 확인


## 서버 연동 실행 방법
1. npm install
2. .env 파일에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 등록
3. npm run start
4. 브라우저에서 http://localhost:4173 접속

## 환경변수
- NAVER_CLIENT_ID: 네이버 앱 client_id
- NAVER_CLIENT_SECRET: 네이버 앱 client_secret
- NAVER_REDIRECT_URI: 네이버 콜백 URL (미설정시 요청 호스트 기반 자동 생성)
- SESSION_SECRET: 세션 고정 키(현재 구현은 메모리 세션)
- DATABASE_PATH: DB 경로(기본: daycheck.sqlite)
- DATABASE_URL/FRONTEND_BASE_URL는 추후 확장용

## 보안 반영 요약 (2026-02-18)
- OAuth `state` 검증 + 콜백 불일치 거부
- 서버 사이드 토큰 교환(`client_secret`은 서버 환경변수)
- 세션 쿠키 서명 검증(HMAC)
- CSRF 보호(`x-csrf-token` + CSRF 쿠키)
- 인증 라우트 레이트리밋
- 운영 환경 HTTPS 강제 (`NODE_ENV=production`)
- 사용자별 상태 저장 API: `GET /api/state`, `PUT /api/state`
- OAuth 시작 URL: `GET /api/auth/naver` 또는 `GET /api/auth/naver/login`
