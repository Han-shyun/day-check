# day-check 구현 현황 (2026-02-18)


## 최신 반영 (2026-02-26, 이어서 진행)

### 무엇을 변경했는지
1. 리팩터링 가이드 기준 진행 상태를 이어서 점검했고, 핵심 미완료 항목(콜라보/버킷/투두 핸들러 본체 통합)은 계속 진행 중으로 유지.
2. 자동 배포 안정화를 위해 Windows 환경용 수동 배포 스크립트(`scripts/deploy-local.ps1`)를 추가하고, `npm run deploy:local` 실행 경로를 등록.
3. 배포 키 alias를 문서화( `SERVER_SSH_PRIVATE_KEY`/`SERVER_SSH_PRIVATE_KEY_B64` 외 `SSH-KEY`, `SSH_KEY`, `SSH-KEY2`, `SSH_KEY2`) 및 수동 배포 명령을 README에 반영.
4. `deploy-local.ps1` 키 조회 로직을 강화해 파일 키/텍스트 키/base64 키 alias 모두 처리하고, 원격 배포 시 `.deploy-version` 동기화를 추가.
5. `src/features/collab/index.js`의 공개 import/export 인터페이스 충돌을 정리해 `main.js`의 기대 export 이름을 복원.
6. `npm run build`, `npm run test:run` 통과 후 `npm run deploy:local` 배포 완료.
7. 원격 검증(`https://mydaycheck.duckdns.org/api/health`, `/api/meta`) 정상 응답 확인.
8. 디자인 반영 지연 가능성 대비를 위해 `sw.js` 캐시 버전(`day-check-cache-v5`)를 상향해 PWA 캐시 기반 정적 자산 갱신을 강제.

### 현재 상태
- 테스트: `npm run test:run` 통과
- 빌드: `npm run build` 통과
- 로컬 배포 스크립트는 실행 성공(원격 `npm ci --omit=dev`, 서버 재기동, `.deploy-version` 기록 포함), `/api/health`와 `/api/meta` 응답 확인.

### 배포 결과
- `npm run deploy:local` 실행 성공(원격 `node` 의존성 설치 후 서버 재기동 확인).
- 원격 API(`https://mydaycheck.duckdns.org/api/health`) 응답: `{"status":"ok"}`.
- 원격 API(`/api/meta`) 응답: 버킷/폴링/공휴일 TTL/마이그레이션 버전 정보 반환.

### 남은 이슈
1. `REFACTOR_GUIDE.md`에 정리된 4-1,5-1,5-2 핵심 분리 미완료 항목을 코드 레벨로 마무리하는 작업이 남아 있음.
2. 원격 서버의 기존 변경분 정리(`daycheck.sqlite`/불필요 로그/개발 산출물)와 배포본 정합성 검증이 필요.
3. 브라우저 캐시/서비스워커 영향으로 UX 변경 확인은 클라이언트 실제 접속에서 1회 강제 새로고침 후 검토 필요.

## 완료한 작업
1. 백엔드 서버 골격 추가
- `server.js` 생성
- `Express`, `helmet`, `express-rate-limit`, `cookie-parser`, `sqlite3` 기반 서버 구성
- API 구성: `GET /api/health`, `GET /api/auth/me`, `GET /api/auth/kakao`, `GET /api/auth/kakao/callback`, `POST /api/auth/logout`, `GET /api/state`, `PUT /api/state`
- 카카오 OAuth `state` 검증, CSRF 검증(`x-csrf-token`), 메모리 세션, SQLite 테이블(`users`, `user_states`) 자동 생성

2. 프론트엔드 동기화 구조 전환
- `app.js` 전면 갱신
- 기존 `localStorage` 단독 저장에서 로그인 시 서버 동기화 하이브리드 구조로 변경
- 로그인 상태 확인(`/api/auth/me`), 서버 상태 로드(`/api/state`), 변경 시 저장(`/api/state`)
- 버전 충돌(409) 처리 로직 및 로컬 백업 저장 유지

3. UI/인증 인터페이스 변경
- `index.html` 전면 정리
- 상단에 인증 영역 추가: `#authStatus`, `#authBtn`
- 버튼 동작: 비로그인 시 카카오 로그인 이동, 로그인 시 로그아웃 호출
- 기존 TODO/캘린더/리포트 구조 유지

4. 실행/설정 파일 추가
- `package.json` 생성 (`start`, `dev` 스크립트 포함)
- `.env.example` 생성 (카카오 OAuth/DB/리다이렉트 설정 샘플)
- `README.md`에 서버 연동 실행법 및 환경변수 설명 추가

## 현재 상태
- 계획 기준 핵심 구조(인증 라우트 + 사용자별 상태 저장 + 프론트 API 연동) 코드 작성 완료
- 실제 실행 검증(`npm install`, 서버 실행, OAuth 왕복, 통합 테스트)은 아직 수행하지 않음

## 남은 작업
1. 의존성 설치 및 서버 실행 검증
2. 카카오 개발자센터 앱 설정값(특히 Redirect URI) 최종 반영
3. 보안 고도화
- 세션 저장소 영속화(예: Redis)
- 세션 쿠키 서명/검증 강화
- 토큰 만료/갱신/폐기 로직 운영 기준으로 세분화
- 보안 이벤트 모니터링/알림 체계 보강
4. 운영 스택 전환 시 PostgreSQL + Prisma 마이그레이션

## 변경된/추가된 주요 파일
- `server.js`
- `app.js`
- `index.html`
- `package.json`
- `.env.example`
- `README.md`

## 운영 규칙 (지속 반영)
- 현재 컨텍스트를 추후에 계속 반영할수있도록 요약 추가 정리
- 이후 사용자 지시가 들어올 때마다 이 문서(`WORK_STATUS.md`)에 수행 내역을 계속 누적 기록
- 각 지시는 `무엇을 변경했는지`, `현재 상태`, `남은 이슈` 중심으로 간단 명확하게 업데이트
- 검증 미실행 항목은 문서에 명시
- 명령할때마다 컨텍스트 초기화.
## 추가 작업 내역 (2026-02-18 / 카카오 로그인 보안 강화 + 사용자별 DB 저장 고도화)

### 무엇을 변경했는지
1. `server.js` 보안 강화
- 세션 쿠키 서명/검증(HMAC) 적용
- OAuth `state` 쿠키 TTL을 세션 TTL과 분리(`OAUTH_STATE_TTL_MS`) 적용
- CSRF 검증 강화: `x-csrf-token` 헤더 + CSRF 쿠키 동시 일치 필수
- `PUT /api/state`에 `Idempotency-Key` 지원(서버 메모리 TTL 캐시 기반)
- 운영 환경 HTTPS 강제 미들웨어 추가(`NODE_ENV=production`)
- 인증 라우트 전용 레이트 리밋 강화(`20 req/min`)
- 카카오 토큰 만료 임박 시 refresh 시도 로직 추가
- OAuth 시작 엔드포인트 별칭 추가: `GET /api/auth/kakao/login` (`/api/auth/kakao`와 동일 동작)

2. `app.js` 안정성 수정
- `syncState`에 `finally` 처리 추가(동기화 플래그 누수 방지)
- 동기화 큐 처리 시 로컬 저장 일관성 강화(`queueSync`에서 로컬 저장 보장)
- 카테고리 인라인 토글 포커스 버그 수정
- 이벤트 리스너 중복 등록 방지 가드 추가(`eventsRegistered`)

### 현재 상태
- 카카오 로그인 + 사용자별 DB 저장 구조는 구현되어 있고, 보안 관련 핵심 항목(CSRF/state/쿠키서명/HTTPS 정책/레이트리밋)이 코드에 반영됨
- 프론트는 로그인 시 서버 동기화, 비로그인 시 로컬 저장 모드로 동작하도록 유지됨

### 남은 이슈
1. 실제 런타임 검증 미실행
- `npm install`, 서버 구동, OAuth 왕복, 상태 저장/복원, 로그아웃까지 통합 검증 필요
2. 세션/상태 저장소 영속화 미적용
- 현재 `sessions`, `oauthStates`, `idempotencyStore`는 메모리 기반
3. 운영 보안 추가 고도화 여지
- Redis 세션스토어, 보안 이벤트 알림 연동, DB/토큰 암호화 저장 정책 확장

### 추가 반영 (환경변수 로딩)
- `server.js`에 `require('dotenv').config()` 추가
- `package.json`에 `dotenv` 의존성 추가

## 추가 작업 내역 (2026-02-18 / 메인 화면 디자인 리뉴얼)

### 무엇을 변경했는지
1. `styles.css` 전면 개편
- 카카오 톤의 그린 포인트 컬러와 카드 중심 레이아웃으로 재디자인
- 배경 그라데이션/패턴, 카드 그림자, 상태 배지, 버튼 스타일 통일
- 페이지 로드 시 카드 순차 등장 애니메이션 추가
- 데스크톱/태블릿/모바일 반응형 규칙 재정비

2. `index.html` 헤더 카피 정리
- 상단 제목 중복(`h1` 2개) 제거
- 메인 설명 문구를 `hero-copy`로 분리해 가독성 개선

### 현재 상태
- 메인 화면의 시각 스타일은 기능 구조를 유지한 채 전면 갱신됨
- TODO/캘린더/리포트/인증 UI는 기존 `id`/동작을 유지하도록 반영됨

### 남은 이슈
1. 브라우저 실기기 디자인 검증 미실행
- 현재 턴에서 서버 실행 및 실제 화면 스냅샷 검증은 수행하지 않음

### 추가 작업 내역 (2026-02-18 / 작업 현황 반영)

#### 무엇을 변경했는지
- 사용자 요청에 따라 `WORK_STATUS.md`에 현재까지의 진행 정리 내용을 누적 반영함

#### 현재 상태
- 프로젝트의 핵심 기능(인증 + 사용자별 상태 동기화 + 보안 강화)은 문서 상으로 정리된 상태 유지
- 본 턴에서는 코드 변경 없이 진행 기록 정합성만 정리

#### 남은 이슈
- 런타임 실행 검증(`npm install`, 서버 구동, OAuth/상태 동기화 통합 테스트) 미실시
- 운영 스택 영속성/모니터링/암호화 정책은 기존 계획대로 보완 필요

## 추가 작업 내역 (2026-02-18 / 보드 자유편집 + 프로젝트 칸 관리 + PWA + 문자열/인코딩 복구)

### 무엇을 변경했는지
1. 보드 칸 자유 조작 기능
- 각 칸 헤더에 드래그 핸들(`↔`) 추가
- 칸 드래그 이동으로 순서 재배치 가능
- 칸 우하단 리사이즈로 가로/세로 크기 조절 가능
- 칸 순서/크기를 `localStorage` + 서버 상태(`bucketOrder`, `bucketSizes`)로 저장

2. 프로젝트 칸 삭제/추가 기능
- 프로젝트 칸 헤더에 `삭제` 버튼 추가
- 보드 하단에 `+ 프로젝트 칸 추가` 버튼 추가
- 표시 여부를 `bucketVisibility`로 저장/동기화

3. 할 일 세부내용 필드 추가
- 각 할 일 카드에 세부내용 입력 textarea 추가
- `todo.details` 저장/복원 및 완료 로그로 이관 시 유지

4. PWA(iPhone/iPad 웹앱) 지원
- `manifest.webmanifest`, `sw.js`, 앱 아이콘(`icons/*`) 추가
- `index.html`에 iOS 웹앱 메타/아이콘 링크 추가
- 서비스워커 등록 코드 추가(`src/main.js`)
- iOS safe-area 대응 스타일 추가

5. 문자열/인코딩 깨짐 복구
- `index.html`, `src/main.js` 한글 텍스트/깨진 태그 정리
- 서비스워커 캐시 버전 상향(`v1 -> v2 -> v3`)으로 구버전 화면 캐시 무효화

### 현재 상태
- 보드 칸의 위치/크기/프로젝트 칸 표시 상태를 사용자 조작으로 변경 가능
- 변경 상태는 로컬과 서버에 저장되어 새로고침 후에도 유지
- 서버 헬스체크 기준 정상 동작(`GET /api/health` -> `200`)

### 남은 이슈
1. 브라우저 캐시 영향
- 이전 서비스워커 캐시가 남아있으면 구 UI가 보일 수 있음
- 필요 시 강력 새로고침(`Ctrl+Shift+R`) 또는 Service Worker unregister 필요

2. 실사용 검증 범위
- 자동 테스트 스위트는 아직 미실행
- 현재는 문법 점검(`node --check`)과 헬스체크 중심으로 검증함

### 주요 변경 파일(최신)
- `index.html`
- `src/main.js`
- `src/style.css`
- `server.js`
- `manifest.webmanifest`
- `sw.js`
- `icons/icon-180.png`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/icon-maskable-512.png`


## 추가 작업 내역 (2026-02-18 / 세부 프로젝트 칸 + 카테고리 자동동기화)

### 무엇을 변경했는지
1. 세부 프로젝트 칸(서브 칸) 추가/삭제 기능
- `+ 프로젝트 칸 추가` 버튼 동작을 확장하여, 프로젝트가 보이는 상태에서는 `세부 프로젝트 칸`을 생성하도록 변경
- 프로젝트가 숨김 상태일 때는 동일 버튼으로 프로젝트 메인 칸을 복원하도록 유지
- 각 세부 프로젝트 칸 헤더에서 이름 직접 수정 가능, 칸별 삭제 버튼 제공

2. 카테고리 자동 동기화
- 세부 프로젝트 칸 생성 시 같은 이름의 카테고리를 자동 생성/연결
- 세부 프로젝트 칸 이름 변경 시 연결된 카테고리 이름도 동일하게 자동 반영
- 세부 칸 이름 중복은 방지(동일 이름 칸 중복 생성/변경 차단)

3. 보드 렌더링/데이터 모델 확장
- 클라이언트 상태에 `projectLanes` 추가(로컬 저장 + 서버 동기화 포함)
- 서버 상태 정규화(`normalizeState`)에 `projectLanes` 필드 추가
- 프로젝트 메인 칸은 세부 칸에 매핑되지 않은 프로젝트 할 일만 표시하고,
  세부 프로젝트 칸은 매핑된 카테고리의 프로젝트 할 일을 각각 표시하도록 분리

4. 칸 조작 연계
- 세부 프로젝트 칸도 기존 드래그 이동/리사이즈 관측 흐름에 연결
- 세부 칸의 폭/높이도 상태에 저장되도록 반영

### 현재 상태
- 프로젝트 메인 칸 아래에 세부 프로젝트 칸을 동적으로 추가/삭제할 수 있음
- 세부 칸 명칭과 카테고리 명칭이 자동으로 동일하게 유지됨
- 관련 상태(`projectLanes`)는 로컬/서버 동기화 경로 모두에 반영됨

### 남은 이슈
1. 사용자 시나리오 검증
- 실제 브라우저에서 세부 칸 생성/이름변경/삭제 후 새로고침 및 재로그인 복원 확인 필요
2. UX 세부조정
- 세부 칸명 중복/빈값 처리 시 사용자 피드백(토스트/경고문) 강화 여지 있음

## 추가 작업 내역 (2026-02-18 / 카테고리 제거 + 프로젝트 칸 내부 세부프로젝트 전환)

### 무엇을 변경했는지
1. 세부프로젝트 렌더링 구조 변경
- 기존처럼 보드의 독립 칸으로 세부프로젝트를 만들지 않고,
  `프로젝트` 메인 칸 내부에 세부프로젝트 그룹(섹션)으로 표시되도록 전환
- 프로젝트 할 일은 세부프로젝트별로 그룹화되어 같은 칸 내부에서 관리 가능

2. 카테고리 UI 제거 및 역할 전환
- 할 일 카드의 분류 셀렉트는 `카테고리`가 아니라 `세부프로젝트` 선택으로 동작하도록 변경
- 기존 `+ 카테고리` 버튼 동작을 `+ 세부 프로젝트` 추가 동작으로 변경
- 세부프로젝트 생성/이름변경/삭제 기능을 프로젝트 칸 내부 그룹 헤더에서 처리 가능

3. 데이터 모델 보강
- todo/doneLog에 `projectLaneId`를 사용하도록 확장
- 기존 데이터의 category 기반 매핑은 `projectLaneId`로 자동 마이그레이션되도록 정합성 처리 추가
- 프로젝트 할 일이 세부프로젝트 삭제 시에는 미지정 상태로 자동 이동

4. 스타일 보강
- 프로젝트 칸 내부 세부프로젝트 그룹 UI용 스타일(`project-lane-group`, `project-lane-head`) 추가

### 현재 상태
- 세부프로젝트가 프로젝트 칸 내부에 표시되고, 카테고리 대신 세부프로젝트로 분류/관리 가능
- 세부프로젝트 추가/이름수정/삭제가 동작하며, 할 일은 세부프로젝트 기준으로 그룹화됨

### 남은 이슈
1. 실제 사용자 동선 검증
- 빠른 입력 폼에서 프로젝트 버킷 선택 시 세부프로젝트 지정 UX를 더 명확히 안내할 여지
2. 레거시 카테고리 정리
- 서버 저장 포맷에서 category 필드를 완전 제거할지 여부는 호환성 기준으로 추가 결정 필요

## 추가 작업 내역 (2026-02-18 / 전 버킷 세부프로젝트 + 빠른등록 제거 + 달력 날짜직접입력)

### 무엇을 변경했는지
1. 세부프로젝트 범위 확장
- 기존 `프로젝트` 버킷 전용이던 세부프로젝트를 `오늘/프로젝트/루틴/인박스` 모든 버킷에서 사용할 수 있도록 확장
- 세부프로젝트 데이터에 `bucket` 속성을 추가해 버킷별로 독립 관리
- 각 버킷 칸 헤더에 `+ 세부` 버튼을 동적으로 추가해, 해당 버킷 내부 세부프로젝트 생성 가능

2. 카테고리 사용 중단 및 세부프로젝트 중심 전환
- 할 일 카드의 선택 드롭다운을 카테고리 대신 `세부프로젝트` 선택으로 동작하도록 유지/확장
- 메타/리포트/날짜패널 표시 라벨을 카테고리 기반에서 `버킷/세부프로젝트` 기반으로 전환
- 레거시 category 매핑은 호환성 유지를 위해 내부적으로만 보정

3. 빠른등록 창 제거
- `quickAddForm`이 포함된 섹션을 런타임에서 숨김 처리해 UI에서 제거
- 빠른등록 submit 이벤트 바인딩 제거

4. 캘린더 입력 방식 변경
- 캘린더 상단 입력 폼(`calendarForm`)을 숨김 처리
- 날짜 셀 클릭 시 즉시 프롬프트로 메모 입력 가능하도록 변경
- 입력 시 해당 날짜에 `note` 항목으로 저장되며 동기화 큐에 반영

5. 서버 정규화 보강
- `server.js`의 `normalizeProjectLanes`에 `bucket` 필드 정규화 로직 추가
- 동일 버킷 내 세부프로젝트 이름 중복 방지 규칙 반영

### 현재 상태
- 4개 버킷 각각에 세부프로젝트를 추가/선택/삭제/이름변경 가능
- 빠른등록 창은 표시되지 않음
- 캘린더는 날짜 클릭만으로 메모 입력 가능

### 남은 이슈
1. UX 개선 여지
- 세부프로젝트 추가/중복 실패 시 안내 메시지를 prompt 외 UI 피드백으로 강화 가능
2. 카테고리 완전 제거 여부
- 서버/저장 포맷에서 category 필드를 완전히 삭제할지(마이그레이션 포함)는 별도 결정 필요

## 추가 작업 내역 (2026-02-18 / 토스트 피드백 + 재기동)

### 무엇을 변경했는지
1. 토스트 메시지 추가
- 세부프로젝트 추가/이름변경/삭제 성공 시 토스트 표시
- 세부프로젝트 이름 중복/빈값 실패 시 오류 토스트 표시
- 달력 날짜 클릭 입력에서 빈 문자열 입력 시 오류 토스트 표시
- `src/main.js`에 `showToast`/`ensureToastHost` 추가
- `src/style.css`에 토스트 스타일(`toast-host`, `toast`, `toast-success`, `toast-error`) 추가

2. 서버 재기동
- 기존 node 프로세스 종료 후 서버 재실행
- 헬스체크 확인: `GET /api/health` -> `{\"status\":\"ok\"}`

### 현재 상태
- 요청한 두 작업(토스트 UX + 전체 서버 재실행) 모두 반영 완료

## 추가 작업 내역 (2026-02-18 / 세부프로젝트 수량 1~8 제한)

### 무엇을 변경했는지
1. 버킷별 세부프로젝트 수량 제한 추가
- 각 버킷(오늘/프로젝트/루틴/인박스)의 세부프로젝트 수량을 `최소 1개 ~ 최대 8개`로 제한
- 최대치(8개)에서 추가 시 오류 토스트 표시
- 최소치(1개)에서 삭제 시 오류 토스트 표시

2. 버킷별 수량 조절 버튼 추가
- 각 버킷 헤더에 `수량` 버튼 추가
- 클릭 시 prompt로 목표 수량(1~8)을 입력받아 자동 증감
- 증감 완료 시 성공 토스트 표시

3. 초기/정합성 보정
- 정합성 처리 시 버킷별 세부프로젝트가 0개면 자동으로 1개 생성
- 비정상적으로 많은 경우 버킷당 최대 8개까지만 유지

### 현재 상태
- 세부프로젝트는 버킷별로 삭제 가능하지만, 버킷 내부 최소 1개는 항상 유지
- 버킷별 수량을 사용자 입력으로 1~8 범위에서 즉시 조절 가능

## 수정 내역 (2026-02-18 / 사용자 정정 반영: 버킷 수량 1~8)

### 변경 요약
- 요청 해석 오류(세부프로젝트 수량)를 수정하고, 실제로 `버킷 수량`을 1~8로 조절 가능하게 전환

### 프론트 변경 (`src/main.js`)
1. 버킷 확장
- 버킷 키를 4개 고정에서 8개(`today, project, routine, inbox, bucket5~bucket8`)로 확장
- 기본 가시성은 기존 4개만 표시, 나머지 4개는 숨김

2. 버킷 수량 조절 기능
- 하단 컨트롤 버튼(`addProjectColumnBtn`)을 버킷 수량 조절용으로 전환
- 클릭 시 1~8 숫자 입력으로 보드 버킷 개수를 즉시 반영
- 수량 축소 시 숨겨지는 버킷의 할 일은 첫 번째 활성 버킷으로 이동(세부프로젝트 연결은 초기화)

3. 동적 버킷 UI 생성
- HTML에 없는 `bucket5~bucket8` 칸을 런타임에서 자동 생성
- 버킷 셀렉트 옵션도 런타임에서 자동 보강

4. 가시성 정규화 보정
- 버킷 가시성 정규화 시 기본값(신규 버킷은 false) 반영
- 모두 비활성일 경우 최소 1개(today) 자동 활성화

### 서버 변경 (`server.js`)
1. 8버킷 표준화
- 서버 정규화 기준 버킷 키를 8개로 확장
- 기본 라벨/기본 가시성도 8버킷 기준으로 확장

2. 가시성 기본값 보정
- 입력에 키가 없을 때 기본 가시성을 사용하도록 보정(신규 버킷 false 유지)

3. 커스텀 여부 판별 수정
- `hasCustomBucketVisibility` 판별을 단순 false 존재 검사에서
  기본 가시성과의 비교 방식으로 수정

## 수정 내역 (2026-02-18 / 버킷 삭제+추가 / 세부프로젝트 무제한 / 5번째 2행)

### 무엇을 변경했는지
1. 버킷 제어 방식 변경
- 버킷 수량 입력 방식(1~8 prompt)을 제거
- 각 버킷 헤더에 `삭제` 버튼 추가
- 하단 버튼을 `+ 버킷 추가`로 전환해서 숨겨진 버킷을 순서대로 다시 표시
- 최소 1개 버킷은 남도록 보호

2. 세부프로젝트 제한 해제
- 세부프로젝트의 최소/최대 수량 제한 로직 제거
- 버킷당 0개도 허용(자동 강제 생성 제거)
- 세부프로젝트 수량 조절 버튼(`수량`) 제거

3. 보드 레이아웃 변경
- 보드를 4열 고정 그리드로 전환
- 따라서 5번째 버킷부터 항상 2번째 행에 표시

### 현재 상태
- 버킷은 개별 삭제 가능, 하단 `+ 버킷 추가`로 복원 가능
- 세부프로젝트는 0~무제한으로 추가/삭제 가능
- 5번째 버킷부터는 자동으로 2행 배치

## 추가 수정 (2026-02-18 / 버킷 영역 침범 방지)

### 무엇을 변경했는지
1. 버킷 침범 방지(핵심)
- 버킷 칸의 가로 리사이즈를 비활성화하고 세로 리사이즈만 허용(`resize: vertical`)
- 버킷 폭은 그리드 트랙 폭을 따르도록 고정(`width: 100%`, `box-sizing: border-box`)
- 보드 그리드 정렬을 `align-items: start`로 조정해 서로 겹침/비정상 정렬 방지

2. 크기 저장 로직 보정
- `bucketSizes` 적용 시 폭은 무시하고 높이만 반영
- ResizeObserver에서도 버킷 폭은 저장하지 않고 높이만 저장

### 현재 상태
- 버킷 간 가로 침범(겹침) 없이 4열/2행 구조로 안정 배치
- 사용자는 버킷 높이만 조절 가능(가로 확장으로 인한 겹침 차단)

## 통합 요약 (2026-02-18 / 현재 기준)

### 1) 제품 방향 및 화면 구조
- 기본 보드는 버킷 중심 운영으로 전환됨
- 버킷은 사용자 조작으로 숨김/복원 가능
- 현재 레이아웃은 4열 그리드 기준이며, 5번째 버킷부터 2행 배치
- 버킷 간 영역 침범 방지를 위해 가로 리사이즈는 막고 세로 리사이즈만 허용

### 2) 버킷/세부프로젝트 동작
- 버킷별로 세부프로젝트 추가/이름변경/삭제 가능
- 세부프로젝트 수량은 0~무제한
- 세부프로젝트는 버킷 단위로 독립 관리됨
- 버킷 헤더 액션으로 `+세부`, `버킷 삭제`, `드래그` 조작 가능
- 하단 컨트롤은 `+ 버킷 추가`로 동작

### 3) 할 일 입력/분류
- 카테고리 중심 흐름을 축소하고 세부프로젝트 중심으로 분류
- 할 일 카드에서 세부프로젝트 선택 가능
- 상세내용(details) 입력/저장 가능
- 완료 이력(doneLog)에도 관련 정보 유지

### 4) 캘린더/입력 UX
- 빠른등록 영역(quick add)은 제거(숨김)
- 캘린더 상단 입력폼은 제거(숨김)
- 날짜 셀 클릭 시 즉시 메모 입력(prompt) 가능
- 빈 입력/오류 케이스는 토스트로 피드백 제공

### 5) 인터랙션/저장/동기화
- 보드 칸 드래그 이동 및 세로 크기 조절 지원
- 로컬 저장 + 서버 동기화 하이브리드 유지
- 서버 상태에는 bucket labels/order/sizes/visibility + project lanes 포함
- 버전 충돌(409) 처리 및 상태 복원 경로 유지

### 6) 모바일/PWA
- iPhone/iPad 웹앱 사용을 위한 PWA 자산(manifest, service worker, 아이콘, iOS 메타) 반영됨

### 7) 안정성/운영
- 서버 재시작 및 헬스체크 흐름(`GET /api/health`) 기반으로 운영 확인
- 최근 변경으로 레이아웃 겹침 문제(버킷 침범) 차단 완료

### 8) 현재 남은 개선 포인트
- 헤더 버튼 밀도 완화(액션 메뉴화)
- 버킷/세부프로젝트 조작 피드백 고도화(토스트/가이드)
- 레거시 category 필드 완전 제거 여부 결정 및 마이그레이션

## 추가 작업 내역 (2026-02-20 / 협업 기능 + 고유ID + 의견 공유 + 플랫 디자인)

### 무엇을 변경했는지
1. 협업 백엔드 구현 완료
- `server/modules/collab/*` stub 제거 후 실제 구현
- `/api/collab` 라우터 전체 추가
- 권한 정책(owner/member), 접근제어, optimistic concurrency(`revision`) 반영
- `GET /api/auth/me` 응답에 `user.publicId` 추가

2. DB 스키마 확장
- `users.public_id`, `users.public_id_normalized`, `users.public_id_updated_at`
- 신규 테이블:
  - `bucket_share_invites`
  - `bucket_share_memberships`
  - `shared_bucket_todos`
  - `shared_todo_comments`
- 관련 인덱스 추가 및 additive migration 적용

3. 프론트 협업 UI 구현
- 프로필 편집기에 고유ID 입력 필드 추가 (`profilePublicIdInput`)
- 버킷 화면 상단에 공유 패널 추가
  - 초대 발송
  - 받은 초대 수락/거절
  - 보낸 초대 취소
  - 공유 멤버 제거/나가기
- 버킷별 공유 작업 섹션 추가
  - 공유 작업 생성/수정/완료/삭제
  - 작성자 `@publicId` 식별 배지 표시
  - 의견(코멘트) 토글/작성/삭제
- 버킷 화면 활성 시 협업 데이터 폴링 동기화(6초 주기)

4. 플랫 디자인 전면 적용
- 전역 토큰을 플랫 톤으로 오버라이드
- 카드/버튼/탭/캘린더/버킷 UI의 그림자/블러/translate hover 제거
- 사각형 기반(6~8px) 경계선 중심 스타일로 통일
- 모바일 하단 탭 블러 제거

### 검증
1. 빌드 검증
- `npm run build` 성공

2. 통합 API 시나리오 검증(로컬 스크립트)
- A/B 계정 생성 → 고유ID 설정 → 초대/수락 → 공유할일 생성/수정 → 코멘트 작성
- 작성자 식별(`comment.author.publicId`) 확인

3. 서버 반영
- 1단계(백엔드) 배포 후 `http://127.0.0.1:4173/api/health` on server: `{"status":"ok"}`
- 2~3단계(프론트+디자인) 배포 후 동일 헬스체크: `{"status":"ok"}`

### 주요 변경 파일
- `server.js`
- `server/app.js`
- `server/modules/auth/router.js`
- `server/modules/collab/router.js`
- `server/modules/collab/service.js`
- `server/modules/collab/repository.js`
- `server/modules/collab/policy.js`
- `src/main.js`
- `src/style.css`
- `index.html`
- `README.md`
- `WORK_STATUS.md`
- `docs/DESIGN_HANDOFF.md`

## 추가 작업 내역 (2026-02-23 / T-001, T-002 착수 반영)

### 무엇을 변경했는지
1. T-001 서버 암호화 키 강제
- `server.js`에 `validateRequiredSecurityConfig()` 추가
- `SESSION_ENCRYPTION_KEY` 미설정 시 `missing_SESSION_ENCRYPTION_KEY` 예외로 서버 시작 차단
- `SESSION_ENCRYPTION_KEY` 형식 무효 시 `invalid_SESSION_ENCRYPTION_KEY` 예외로 서버 시작 차단
- 검증 시점을 `startServer()` 초기(DB 초기화 이전)로 이동
- `.env.example`에 `SESSION_ENCRYPTION_KEY` 필수/형식 주석 강화

2. T-002 깨진 문자열 오탐 수정 + 피드백
- `src/main.js`, `server.js`의 `hasBrokenText()` 규칙을 동일하게 변경
- `?` + 임의 문자 1~3자 정규식 차단 규칙 제거
- `scripts/check-text.js`의 `MOJIBAKE_MARKERS` 기반 판정으로 축소
- 프론트 정규화 경로(`loadStateFromLocal`, `normalizeBucketLabels`, `normalizeProjectLanes`, `normalizeCategoryState`)에서 필터링 시 `showToast(..., 'error')` 피드백 추가

3. 태스크 문서 반영
- `PROJECT_TASKS.md`에서 `T-001`, `T-002`를 완료 상태로 표시하고 완료 목록에 추가

### 현재 상태
- T-001/T-002 요구사항 코드 반영 완료
- 서버/프론트 손상 문자열 판정 로직이 동기화됨

### 남은 이슈
1. 시작/동기화 시 손상 데이터가 많으면 토스트가 다수 발생할 수 있음
2. T-003 이후 공통 API 에러 처리 개선 시 토스트 정책 재조정 필요

## 추가 작업 내역 (2026-02-23 / T-003~T-007, T-018, T-021 반영)

### 무엇을 변경했는지
1. T-003 `apiRequest` 에러 처리 표준화
- `src/main.js`에 `ApiRequestError` 생성 로직 추가
- `apiRequest()`에서 4xx/5xx 응답 시 표준 에러 throw + 전역 에러 토스트 출력
- 토스트 중복 방지 쿨다운(`API_ERROR_TOAST_COOLDOWN_MS`) 추가
- 백그라운드/예외 케이스는 `allowHttpStatus`, `suppressErrorToast` 옵션으로 제어

2. T-004 세션 절대 만료 추가
- `server.js`에 `SESSION_ABSOLUTE_TTL_MS`(기본 30일) 도입
- `authSessionMiddleware`에서 `createdAt` 기준 절대 만료 검증 추가
- 절대 만료 시 `session_absolute_expired` 보안 이벤트로 기록

3. T-005 버전 충돌(409) 사용자 선택 UI
- `src/main.js`에 충돌 처리 함수(`handleVersionConflict`) 추가
- 충돌 시 로컬/원격 스냅샷을 `CONFLICT_BACKUP_STORAGE_KEY`에 백업
- 사용자 선택:
  - 확인: 로컬 변경 유지 후 재저장 시도
  - 취소: 서버 최신 상태 적용

4. T-006 협업 API Rate Limit
- `server/modules/collab/router.js`에 write 엔드포인트 공통 제한 추가
- 기본값: 분당 10회 (`writeWindowMs=60000`, `writeLimit=10`)

5. T-007 보안 이벤트 로그 유실 방지
- `server.js` 로그 기록 시 실패 `console.error` 출력 추가
- 로그 로테이션(`SECURITY_EVENT_LOG_MAX_BYTES`, 기본 10MB, `.1` 백업) 추가

6. T-018 CI/CD SSH 타임아웃/재시도
- `.github/workflows/deploy-server.yml`에서
  - `ssh-keyscan` 타임아웃 8초 -> 30초
  - `ssh handshake` connect timeout 8초 -> 30초
  - keyscan/handshake 각각 3회 재시도 로직 추가

7. T-021 SQLite WAL 모드
- `server.js` DB 초기화 시
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA journal_mode = WAL`
  적용

### 현재 상태
- T-001~T-007, T-018, T-021 코드 반영 완료
- `PROJECT_TASKS.md` 완료 상태 동기화 완료

### 남은 이슈
1. 충돌 처리(T-005)는 현재 "사용자 선택 UI" 방식이며, 자동 병합(필드 단위 merge)은 아직 미구현
2. T-008 이후 구조 리팩토링(전역 상태 통합) 전까지는 `src/main.js` 결합도가 높음

## 추가 작업 내역 (2026-02-24 / T-008~T-022 잔여 일괄 완료)

### 무엇을 변경했는지
1. 프론트 상태/동기화 구조(`src/main.js`)
- `appState = { data, runtime, config }` 기준으로 런타임 상태 통합 유지/보강
- `/api/meta` 선로딩 후 버킷 기본값/폴링 주기/공휴일 TTL 반영
- 상태/협업 폴링을 가시성 기반 active/hidden 가변 주기로 전환
- 협업 동기화를 `GET /api/collab/snapshot` 단일 배치 호출 경로로 전환
- 공휴일 캐시를 `{ data, expiresAt }` 구조로 변경하고 TTL 만료/실패 시 stale 유지
- 버킷 헤더 보조 액션을 `...` 메뉴로 통합(모바일/좁은 폭 자동 메뉴화)
- 전역 에러 경계(`window.error`, `unhandledrejection`) + fail-safe UI(재시도/새로고침) 추가
- 레거시 category 필드 마이그레이션 보정 유지 후 저장/동기화 페이로드에서 제거
- 타임존 처리 보강: `parseIsoDate`를 로컬 변환 기반으로 교체

2. 서버(`server.js`, `server/modules/collab/*`)
- `GET /api/meta` 유지/확장: 버킷 기본값, poll 주기, holiday TTL, migration version 노출
- `GET /api/collab/snapshot` + `service.getSnapshot` 추가 유지(하위 엔드포인트 호환 유지)
- 공휴일 공급자 정책 확정:
  - 1순위: 공공데이터포털(`HOLIDAY_API_PROVIDER=public_data_portal`)
  - 실패/키 누락 시 Google ICS(`HOLIDAY_FEED_URL`) 폴백
  - 응답 메타(`source`, `provider`, `fallback`, `reason`) 포함
- `normalizeState`에서 legacy `category/categoryId`를 `projectLaneId`로 매핑 후 제거
- DB 마이그레이션 구조 개편:
  - `db_migrations` 버전 기록
  - migration step 트랜잭션(`BEGIN IMMEDIATE`~`COMMIT/ROLLBACK`)
  - idempotent 적용 + `/api/meta.schema.latestMigrationVersion` 반영

3. 공통/문서/설정
- `.env.example`에 신규 환경변수 추가:
  - `HOLIDAY_API_PROVIDER`, `HOLIDAY_API_SERVICE_KEY`, `HOLIDAY_API_BASE_URL`
  - `HOLIDAY_CLIENT_CACHE_TTL_MS`
  - `POLL_STATE_ACTIVE_MS`, `POLL_STATE_HIDDEN_MS`, `POLL_COLLAB_ACTIVE_MS`, `POLL_COLLAB_HIDDEN_MS`
- `README.md`에 신규 API(`GET /api/meta`, `GET /api/collab/snapshot`) 및 상태 계약/환경변수 업데이트
- `PROJECT_TASKS.md`에서 `T-008~T-022` 완료 표시/완료 목록 반영

4. 자동화 테스트 도입(`vitest` + `supertest`)
- `tests/server-core.test.js`: `/api/auth/me` 비인증 응답, `normalizeState` 이관, `db_migrations` idempotent, 보안 로그 rotate 회귀검증
- `tests/api-request.test.js`: `allowHttpStatus`, throw, 토스트 suppress 분기 검증
- `tests/date-utils.test.js`: 로컬 타임존 변환 기반 날짜 유틸 검증

### 현재 상태
- `T-008`부터 `T-022`까지 계획된 잔여 항목을 코드/문서 기준으로 모두 반영 완료
- 프론트/서버 빌드 및 자동화 테스트 스크립트 기준 통과 상태

### 검증 결과
1. `npm run check:text` 통과
2. `npm run build` 통과
3. `npm run test:run` 통과

### 남은 이슈 / 리스크
1. 실제 운영 환경(공공데이터포털 실키, 카카오 OAuth 왕복, 배포 인프라)에서 E2E 검증은 별도 필요
2. `NODE_ENV=production`이 `.env`에 있을 때 Vite 경고가 출력되므로 dev/build 분리 운영 권장

## 추가 작업 내역 (2026-02-25 / 리팩터 가이드 진행 지속)

### 무엇을 변경했는지
1. 리팩터 문서 상태 반영
- `docs/REFACTOR_GUIDE.md`의 완료/미완료 항목을 명확히 `[x]`/`[ ]` 구조로 정리.
- `features/collab`, `features/bucket`, `features/todo`의 남은 이관 범위를 구체 항목으로 분리.

### 현재 상태
- 기존 변경(`T-001~T-022`, 플랫 스타일 반영)은 유지되며, 로컬 기준 `npm run build`, `npm run test:run` 통과.
- 문서-작업 상태 동기화: 남은 항목을 “Collab/버킷/할일의 main.js 이관”으로 좁힘.

### 남은 이슈
1. `main.js`의 협업/버킷/할일 핵심 이벤트/렌더/네트워크 처리 로직 분리 미완료.
2. 배포 자동화는 워크플로우 기반이나, 운영 시 `push` 브랜치 및 SSH 시크릿 구성 확인 필요.
3. 브라우저 실제 동작(디자인, 접근성, 협업 폴링) E2E 검증 미실행.

### 다음 액션
- 우선순위 1: `src/features/collab/index.js`로 협업 함수 이관.
- 우선순위 2: `src/features/bucket/index.js`, `src/features/todo/index.js`로 핵심 렌더/이벤트 이관.
- 우선순위 3: `src/main.js` 결합 정리 후 문서 상태 반영 완료.

