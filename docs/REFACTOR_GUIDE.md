# day-check 프로젝트 인수인계 가이드

> 마지막 업데이트: 2026-03-04
> 목적: 프로젝트를 처음 보는 사람이 기능, 구조, 실행 방법, 현재 상태를 빠르게 파악할 수 있도록 정리

## 1. 서비스 한 줄 요약
- `day-check`는 한 페이지에서 할 일을 빠르게 쌓고(버킷/세부프로젝트), 달력/리포트/협업까지 연결하는 개인 생산성 웹앱입니다.
- 인증은 카카오 OAuth, 사용자 데이터는 SQLite에 저장하며, 비로그인 시 로컬 저장도 지원합니다.

## 2. 현재 상태 (2026-03-04 기준)
- 프론트엔드 모듈 분리는 주요 영역(`core`, `state`, `features/*`)까지 완료된 상태입니다.
- 백엔드는 `server/modules/*` 구조가 있으나, 실제 런타임은 여전히 `server.js` 중심 구현을 사용합니다.
- 협업 기능(초대/수락/공유 할 일/댓글), 버킷 관리, 달력, 주간 리포트가 동작합니다.
- P0~P2 안정화/개선 완료 (2026-03-04):
  - P0: 버킷 서브프로젝트 생성 시 persist→render 순서 재구성, 렌더 예외 국소 처리
  - P1: Todo Details 패널 aria-expanded 초기 동기화 수정
  - P1: Quick Add last-used bucket 저장/복원 (`QUICK_ADD_PREFS_STORAGE_KEY`)
  - P2: 달력 선택 날짜 패널에 Due 섹션 추가 (dueDate 기준)
  - P2: 주간 리포트 KPI 카드 4종, 버킷 도넛차트, 요일별 완료 바차트 추가
  - `src/features/report/model.js` 신규 생성 (순수 계산 함수 분리)
- 로컬 검증 결과:
  - `npm run test:run` 통과 (4 files, 18 tests)
  - `npm run build:legacy` 통과 (Vite)
  - `npm run build:legacy` 시 Vite 경고 1건: `.env`의 `NODE_ENV=production` 값 관련 경고

## 3. 빠른 실행
```bash
npm install
npm run server:start   # 또는 npm run server:dev
# 브라우저: http://localhost:4173
```

주요 명령어:
- 개발 서버(프론트): `npm run dev`
- 백엔드(레거시 엔트리): `npm run start` (`node server.js`)
- 백엔드(모듈 엔트리): `npm run start:modular` (`node server/index.js`)
- 테스트: `npm run test:run`
- 빌드: `npm run build`
- 문자열 깨짐 검사: `npm run check:text`

## 4. 기술 스택
- Frontend: Vanilla JS (ES Modules), Vite
- Backend: Node.js + Express
- DB: SQLite3
- Auth: Kakao OAuth
- Test: Vitest + Supertest
- PWA: `manifest.webmanifest`, `sw.js`

## 5. 디렉터리 구조 (핵심)
```text
src/
  main.js                 # 프론트 런타임 엔트리(현재 809 lines)
  core/                   # 공통 유틸/컨텍스트/API/라우팅/동기화
  state/                  # 상태 정규화/저장/충돌 처리
  features/
    auth/
    bucket/
    calendar/
    collab/
    report/
    todo/

server/
  index.js                # 모듈 엔트리
  app.js                  # server.js 위임 래퍼
  modules/                # auth/state/holidays/collab 도메인 라우터/서비스/레포
  middleware/
  db/

server.js                 # 백엔드 핵심 구현(현재 2151 lines)
tests/                    # vitest/supertest 테스트
docs/                     # 문서 모음
```

## 6. 프론트엔드 구조 요약
`src/main.js`가 전체 부트스트랩을 담당하고, 아래 모듈에 의존성을 주입하는 방식입니다.

- `core/*`
  - `app-context.js`: `state`, `runtime`, `config`
  - `constants.js`: 스토리지 키, 폴링 주기, 기본 버킷/라벨
  - `sync.js`: API 요청, `/api/meta` 로딩, 런타임 메타 반영
  - `ui-utils.js`: 토스트/전역 에러 바운더리
  - `router-utils.js`: 해시 라우팅(`home`, `buckets`, `calendar`, `report`)
- `state/index.js`
  - 로컬 상태 정규화, 서버 스냅샷 적용, 버전 충돌(409) 백업 처리
- `features/*`
  - `todo`: 할 일 렌더링, 서브태스크/메모 처리
  - `bucket`: 버킷/세부프로젝트(라벨, 순서, 가시성, 액션 메뉴)
  - `calendar`: 월간 뷰, 날짜 패널, 메모/일정 입력
  - `collab`: 공개 ID, 공유 설정, 초대/수락, 공유 할 일/댓글
  - `report`: 주간 완료/미완료 리포트

## 7. 백엔드 구조 요약
실행 기준 핵심은 `server.js`입니다. `server/index.js`와 `server/app.js`는 현재 호환 레이어입니다.

주요 라우트:
- `GET /api/health`: 헬스체크
- `GET /api/meta`: 버킷 기본값, 폴링 주기, 휴일 캐시 TTL, 마이그레이션 버전
- `GET /api/holidays?year=YYYY`: 공휴일 조회
- `/api/auth/*`: 로그인/로그아웃/세션 조회
- `/api/state` (`GET`, `PUT`): 사용자 상태 조회/저장
- `/api/collab/*`: 협업 스냅샷/초대/공유 할 일/댓글

인증/보안 포인트:
- 카카오 OAuth `state` 검증
- 서명 세션 쿠키 + CSRF 토큰
- 인증 라우트 및 협업 write 라우트 rate limit
- 보안 이벤트 로그 로테이션

## 8. 주요 API 맵
### Auth
- `GET /api/auth/me`
- `GET /api/auth/kakao`
- `GET /api/auth/kakao/login`
- `GET /api/auth/kakao/callback`
- `POST /api/auth/logout`

### State
- `GET /api/state`
- `PUT /api/state` (`Idempotency-Key` 지원, 버전 충돌 시 409)

### Holidays
- `GET /api/holidays?year=2026`

### Collab
- `GET /api/collab/snapshot`
- `GET /api/collab/summary`
- `PUT /api/collab/public-id`
- `PUT /api/collab/share-settings/:bucketKey`
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

## 9. 데이터 저장 위치
- 로컬: `localStorage` (todo/doneLog/calendar/bucket/projectLanes/userProfile 등)
- 서버: `daycheck.sqlite`
- 주요 파일:
  - DB: `daycheck.sqlite`
  - 보안 로그: `security-events.log`

## 10. 환경변수 핵심
필수:
- `SESSION_ENCRYPTION_KEY` (미설정/형식 오류 시 서버 시작 실패)
- `KAKAO_CLIENT_ID`
- `KAKAO_CLIENT_SECRET`

자주 쓰는 옵션:
- `PORT`, `NODE_ENV`, `DATABASE_PATH`
- `SESSION_ABSOLUTE_TTL_MS`
- `HOLIDAY_API_PROVIDER`, `HOLIDAY_API_SERVICE_KEY`, `HOLIDAY_FEED_URL`
- `POLL_STATE_ACTIVE_MS`, `POLL_STATE_HIDDEN_MS`
- `POLL_COLLAB_ACTIVE_MS`, `POLL_COLLAB_HIDDEN_MS`
- `SECURITY_EVENT_LOG_PATH`, `SECURITY_EVENT_LOG_MAX_BYTES`

샘플 파일: `.env.example`

## 11. 테스트 커버리지 요약
- `tests/server-core.test.js`
  - `/api/auth/me` 비인증 응답
  - 레거시 `category/categoryId` -> `projectLaneId` 정규화
  - DB 마이그레이션 idempotent
  - 보안 로그 로테이션
- `tests/api-request.test.js`
  - API 에러 처리/허용 상태/토스트 억제
- `tests/date-utils.test.js`
  - 타임존 포함 날짜 파싱 정합성
- `tests/report-model.test.js`
  - `computeWeeklyKpi`: 완료율, WoW 델타 계산
  - `computeBucketDistribution`: 버킷별 집계 및 정렬
  - `computeDailyCompletions`: 요일별 집계, 범위 외 항목 무시

## 12. 현재 리스크/개선 우선순위
1. `server.js` 단일 파일 비중이 큼 (2151 lines): 도메인 모듈 완전 이관 필요
2. `src/main.js`도 여전히 큼 (812 lines): 이벤트 등록/부트스트랩 추가 분리 여지
3. 임시 파일(`tmp*`, `src/main.js.new`)이 루트에 남아 있어 정리 기준 필요
4. 문서가 여러 파일에 분산되어 있어(README/docs/archive/기타 문서) 단일 진실원본(Single Source of Truth) 정리 필요
5. `.env`의 `NODE_ENV=production`은 Vite dev/build 경고를 유발할 수 있어 환경 분리 운영 권장

## 13. 다음 작업 제안
1. 서버 모듈화 2단계: `server.js`의 auth/state/collab/holidays 실구현을 `server/modules/*`로 이관
2. 프론트 엔트리 경량화: `src/main.js`의 `registerEvents()/bootstrap()` 일부를 `src/app/*`로 분리
3. 문서 통합: `docs/archive/WORK_STATUS.md`는 이력용, 본 문서는 현재상태용으로 역할 고정
4. 정리 작업: 임시 파일/실험 산출물 정리 규칙 수립

## 14. 참고 문서
- `README.md`: 사용자/실행 중심 문서
- `docs/archive/WORK_STATUS.md`: 날짜별 변경 이력(아카이브)
- `docs/archive/DEVELOPMENT_GUIDE.md`: 운영/점검 체크리스트(아카이브)
- `docs/archive/PROJECT_TASKS.md`: 태스크 관리 문서(아카이브)
- `docs/archive/MODULARIZATION_PROGRESS.md`: 모듈화 진행 기록(아카이브)


## 15. 디자인 문서 안내
- UI/UX 레퍼런스, 토큰, 컴포넌트 규칙, Safari 대응, UI 테스트 및 배포 체크리스트는 `docs/DESIGN_HANDOFF.md`를 단일 기준으로 사용합니다.
- 본 문서에는 기능/아키텍처/운영 인수인계 내용만 유지하고, 디자인 세부 기준은 중복 작성하지 않습니다.

### 관련 문서
- `docs/DESIGN_HANDOFF.md`: 디자인/UX 운영 기준 (Single Source of Truth)
- `docs/REFACTOR_GUIDE.md`: 기능/구조/운영 인수인계 기준
