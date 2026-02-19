# day-check 개발/운영 유지 가이드 (Dev Ops Notes)

## 1) 프로젝트 현재 운영 범위
- 목표: 카카오 OAuth 기반 사용자 인증 + 사용자별 상태 동기화(로컬/서버 혼합)
- UI: 보드(버킷/세부프로젝트), 할 일/완료 로그/캘린더, 리포트
- PWA: `manifest.webmanifest`, `sw.js`, 아이콘 4개 등록

## 2) 핵심 코드맵
- `server.js`: 인증/API/DB 동기화 핵심 서버
  - 인증: `/api/auth/me`, `/api/auth/kakao`, `/api/auth/kakao/login`, `/api/auth/kakao/callback`, `/api/auth/logout`
  - 상태: `/api/state`, `/api/state`(PUT)
  - DB: `daycheck.sqlite` + 테이블 `users`, `user_states`, `user_sessions`, `oauth_states`, `idempotency_store`
- `src/main.js`: 프런트 상태 관리, 동기화 큐, 렌더링, 드래그/사이즈/버킷 제어
- `src/style.css`: UI/반응형/접근성 스타일
- `index.html`: 화면 구성 + 로그인 버튼/보드/캘린더/리포트
- `sw.js` + `manifest.webmanifest`: 오프라인/PWA 셸 정의
- `scripts/check-text.js`: 텍스트 인코딩/문자 깨짐 점검 스크립트
- `WORK_STATUS.md`: 변경 로그 기록용 (유지)

## 3) 실행/개발 루틴
1. 의존성: `npm install`
2. 서버 실행: `npm start`
3. 브라우저: `http://localhost:4173`
4. API 헬스체크: `GET /api/health`
5. 로그인: 카카오 OAuth 정상 로그인(실제 OAuth 앱 설정 필요)
6. 상태 동기화: 브라우저에서 자동 체크(`checkAuth` -> `/api/auth/me`, `/api/state`)

## 4) 필수 체크(개발 계속 진행할 때)
- `.env`는 로컬 전용 값 유지(커밋 주의)
- DB/로그/임시파일은 유지 정책을 팀 규칙에 맞게 관리
  - 개발 유지 목적: 현재 `daycheck.sqlite`, `security-events.log` 보존
  - 배포 전 정리 대상 여부는 별도 결정
- 문자열 깨짐 또는 UTF-8 문제 의심 시:
  - `npm run check:text`
- 브라우저 캐시가 UI를 가릴 때:
  - 강력 새로고침 또는 SW unregister
- `server.js` 변경 시: `users` 테이블 마이그레이션 경로, `oauth_states`, `idempotency_store` TTL 정합성 확인

## 5) 현재 남은 이슈(우선순위)
- 런타임 통합 검증(카카오 콜백/동기화 충돌/오류 복구 플로우)
- 버전 충돌 케이스에서 사용자 복구 UX 강화
- `node_modules`, 로그, DB 백업 정책 정리(개발 유지 vs 배포 정책 일원화)
- `.env` 키 순환(보안/운영 주기)

## 6) naver 레거시 정리(완료 기록)
- `index.html`: 스타일 쿼리 라벨 `?v=naver-theme` → `?v=day-check-style`
- `sw.js`: 동일 캐시 라벨 업데이트
- `server.js`: `upsertUser`의 `naver_id` 레거시 분기 정리
- `tmp_registerevents.txt`: `/api/auth/naver` → `/api/auth/kakao`
- `WORK_STATUS.md`는 변경 로그 보존용으로 계속 유지

## 7) 최근 컨텍스트 요약(빠른 복기용)
- 현재 요청 기준: `node_modules`/배포용 정리는 보류, 개발 유지 항목(`daycheck.sqlite`, `security-events.log`)은 유지
- 인증은 카카오 기준으로 고정 진행
- 버킷은 동적 라벨/가시성/크기/순서를 포함해 사용자 상태로 저장/동기화
- 세부프로젝트는 버킷별 독립 운영

## 8) 다음 변경 시 참고 체크리스트
- [ ] 기능 수정 전 영향범위(프론트/서버/DB) 구분
- [ ] `.env` 실제 값 노출 여부 확인
- [ ] 새 API 추가 시 `README.md`에 반영
- [ ] UI 문자열 깨짐/인코딩 회귀 체크(`npm run check:text`)
- [ ] 최소 1회 브라우저로 동작 확인 및 상태 동기화 경로 검증

## 9) 내부 조직/개발 연결 맵(유지용)
- 단일 개발 기준:
  - 기획/요건 결정은 1곳에서 관리
  - 서버 핵심 수정: `server.js` 변경은 API/데이터 영향 범위 명시 후 적용
  - 클라이언트 핵심 수정: `src/main.js` 변경은 동기화 호환성 점검
- 연동 책임(요청-응답 흐름):
  - 인증: 브라우저 UI → `/api/auth/kakao/login` → 카카오 OAuth → `/api/auth/kakao/callback` → `/api/auth/kakao`
  - 상태 로드/저장: 클라이언트 `checkAuth` / `loadRemoteState` → `/api/auth/me`, `/api/state`(GET/PUT)
  - 동기화 충돌: 서버 `user_states.version` / `syncToken` 기준으로 복구 처리
- 변경 전 확인 포인트:
  - 데이터 스키마(`daycheck.sqlite`) 변경 필요성
  - PWA 캐시 키(`sw.js`) 버전/리스트 변경 필요성
  - `security-events.log`, `tmp_registerevents.txt` 변경 사유 기록
- 문서 업데이트 규칙:
  - 변경마다 `WORK_STATUS.md`에 날짜(`YYYY-MM-DD HH:mm`)와 요약 1줄 추가
  - `DEVELOPMENT_GUIDE.md`의 핵심 체크리스트를 함께 업데이트
