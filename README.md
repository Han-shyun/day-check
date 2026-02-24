# day-check

TickTick처럼 항목을 강제로 여러 화면/분류로 나누지 않고, **한 페이지에서 투두를 빠르게 쌓고 나중에 분류를 붙이는** 개인용 일정/체크리스트 앱입니다.

## 최신 업데이트 (2026-02-24, v6.1)
- 잔여 태스크 `T-008~T-022` 일괄 완료
- 신규 메타 API: `GET /api/meta`
  - 버킷 기본 구성, 폴링 주기(active/hidden), 공휴일 클라이언트 TTL, DB migration 버전 제공
- 신규 협업 배치 API: `GET /api/collab/snapshot`
  - summary + 공유 todo + 선택 댓글 묶음을 한 번에 조회
- 공휴일 소스 정책 정리
  - 공공데이터포털 우선(`HOLIDAY_API_PROVIDER=public_data_portal`)
  - 실패/서비스키 누락 시 Google ICS(`HOLIDAY_FEED_URL`) 폴백
- 상태 페이로드 계약 정리
  - legacy `category/categoryId` 제거, `projectLaneId` 단일 경로 유지
- 전역 에러 경계 추가
  - `window.error` / `unhandledrejection` 감지 시 fail-safe UI(재시도/새로고침)
- 테스트 스택 도입
  - `vitest`, `supertest` 기반 자동화 테스트 + `npm run test`, `npm run test:run` 추가

## 협업 API 요약
- `GET /api/collab/snapshot` (summary + 공유 todo 묶음 + 선택 댓글 묶음 배치 조회)
- `PUT /api/collab/public-id`
- `GET /api/collab/summary`
- `POST /api/collab/invites`
- `POST /api/collab/invites/:inviteId/accept`
- `POST /api/collab/invites/:inviteId/decline`
- `DELETE /api/collab/invites/:inviteId`
- `DELETE /api/collab/memberships/:membershipId`
- `GET /api/collab/shares/:ownerUserId/:bucketKey/todos`
- `POST /api/collab/shares/:ownerUserId/:bucketKey/todos`
- `PATCH /api/collab/shared-todos/:todoId`
- `DELETE /api/collab/shared-todos/:todoId`
- `GET /api/collab/shared-todos/:todoId/comments`
- `POST /api/collab/shared-todos/:todoId/comments`
- `DELETE /api/collab/comments/:commentId`

## 메타 API
- `GET /api/meta`
  - `bucketKeys`, `defaultBucketLabels`, `defaultBucketVisibility`
  - 폴링 주기(`poll.stateActiveMs`, `poll.stateHiddenMs`, `poll.collabActiveMs`, `poll.collabHiddenMs`)
  - 공휴일 클라이언트 캐시 TTL(`holidays.clientCacheTtlMs`)
  - 최신 DB migration 버전(`schema.latestMigrationVersion`)

## 상태 페이로드 계약
- `categories`, `todo.categoryId`, `doneLog.categoryId`, `projectLane.categoryId`는 제거됨
- 분류는 `projectLaneId` 단일 경로로 처리
- timestamp 저장값은 ISO 8601 UTC(`createdAt`, `completedAt`) 기준
- 화면 표시/날짜 비교는 클라이언트 로컬 타임존 기준 `YYYY-MM-DD`로 변환

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
2. .env 파일에 KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET 등록
3. npm run server:start (운영 모드) 또는 npm run server:dev (개발 모드)
4. 브라우저에서 http://localhost:4173 접속

### 서버 재시작 정리
- 개발 중 변경 즉시 반영: `npm run server:dev`
- 변경 반영 후 재시작: `npm run server:restart`
- 운영 시작: `npm run server:start`

## 자동 배포(서버 연동)

로컬에서 프로젝트를 수정하면 GitHub에 `main` 또는 `work` 브랜치 푸시만으로
자동으로 서버(`168.107.48.248`)로 반영되게 구성할 수 있습니다.

### GitHub Secrets 설정

레포지토리 `Settings > Secrets and variables > Actions`에 다음을 추가합니다.

- `SERVER_SSH_PRIVATE_KEY`
- `SERVER_HOST` (예: `168.107.48.248`)
- `SERVER_USER` (예: `ubuntu`)
- `SERVER_APP_PATH` (예: `/home/ubuntu/day-check`)
- `SERVER_SSH_PORT` (선택, 기본값 `22`)

### 서버 준비

서버에 배포 키를 등록하고, `SERVER_APP_PATH` 경로에 앱 권한이 있는지 확인합니다.  
`package.json`, `package-lock.json`, `server.js`가 위치한 디렉터리에서
`scripts/deploy-server.sh`가 실행 가능해야 합니다.

### 배포 동작

`push` 이벤트가 발생하면 다음이 자동 실행됩니다.

1. `.git`, `node_modules`, `.env`, `server.log`, `security-events.log` 등은 제외하고 코드 동기화
2. 서버에서 `npm ci --omit=dev`
3. 기존 `node server.js` 종료 후 재실행

수동 실행은 로컬에서 워크플로를 `workflow_dispatch`로 실행하거나,
서버에 SSH로 접속해 아래를 실행할 수 있습니다.

```bash
cd /home/ubuntu/day-check
bash scripts/deploy-server.sh
```

`server:restart`는 현재 실행 중인 `server.js` 프로세스를 정리한 뒤, 개발 모드로 다시 띄웁니다.

## 환경변수
- KAKAO_CLIENT_ID: 카카오 앱 client_id
- KAKAO_CLIENT_SECRET: 카카오 앱 client_secret
- KAKAO_REDIRECT_URI: 카카오 콜백 URL (미설정시 요청 호스트 기반 자동 생성)
- SESSION_ENCRYPTION_KEY: OAuth 토큰 암복호화 키 (32-byte AES-256, 필수)
- SESSION_ABSOLUTE_TTL_MS: 세션 절대 만료(ms, 기본 30일)
- SECURITY_EVENT_LOG_PATH: 보안 이벤트 로그 파일 경로(기본 security-events.log)
- SECURITY_EVENT_LOG_MAX_BYTES: 보안 로그 로테이션 최대 크기(기본 10MB)
- SECURITY_EVENTS_ENABLED: 보안 이벤트 로깅 여부(default true)
- SESSION_SECRET: 세션 고정 키(현재 구현은 메모리 세션)
- DATABASE_PATH: DB 경로(기본: daycheck.sqlite)
- HOLIDAY_API_PROVIDER: 공휴일 공급자 (기본 `public_data_portal`)
- HOLIDAY_API_SERVICE_KEY: 공공데이터포털 서비스키
- HOLIDAY_API_BASE_URL: 공공데이터포털 공휴일 API 기본 URL
- HOLIDAY_FEED_URL: 공급자 실패/미설정 시 사용하는 ICS 폴백 URL (기본 Google 대한민국 공휴일 ICS)
- HOLIDAY_CLIENT_CACHE_TTL_MS: 클라이언트 공휴일 캐시 TTL(ms, 기본 86400000)
- POLL_STATE_ACTIVE_MS / POLL_STATE_HIDDEN_MS: 상태 동기화 폴링 주기(ms)
- POLL_COLLAB_ACTIVE_MS / POLL_COLLAB_HIDDEN_MS: 협업 동기화 폴링 주기(ms)
- DATABASE_URL/FRONTEND_BASE_URL는 추후 확장용

## 보안 반영 요약 (2026-02-18)
- OAuth `state` 검증 + 콜백 불일치 거부
- 서버 사이드 토큰 교환(`client_secret`은 서버 환경변수)
- 세션 쿠키 서명 검증(HMAC)
- CSRF 보호(`x-csrf-token` + CSRF 쿠키)
- 인증 라우트 레이트리밋
- 운영 환경 HTTPS 강제 (`NODE_ENV=production`)
- 사용자별 상태 저장 API: `GET /api/state`, `PUT /api/state`
- OAuth 시작 URL: `GET /api/auth/kakao` 또는 `GET /api/auth/kakao/login`
