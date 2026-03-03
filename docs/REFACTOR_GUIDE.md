# Refactor Guide

## 진행 상태 (실행 기준)

- [x] 핵심 공통 모듈(state, sync, router, viewport, holidays, ui-utils, report) 분리 반영
- [x] `collab`/`bucket`/`todo` feature 엔트리 진입점 및 의존성 주입 경로 정리
- [x] `collab`/`bucket`/`todo` feature 본체 핸들러/이벤트 로직의 main.js 이관 완료
- [x] `main.js` 최종 통합 정리 완료
- [x] 자동 배포 예방 조치: `scripts/deploy-local.ps1` + `npm run deploy:local` 추가
- [x] GitHub 배포 워크플로우 + 로컬 배포 검증 루프 정비 완료 (`master` 브랜치 추가 포함)
- [x] `src/features/collab/index.js` 공개 인터페이스 정합성(중복 선언/내보내기 충돌) 정리

## 2026-02-25 실행 로그

- [x] `npm run check:text`, `npm run build`, `npm run test:run` 통과 확인.
- [x] `npm run deploy:local` 실행 성공 (원격 배포 완료, `server restarted` 확인).
- [x] 원격 API 검증: `https://mydaycheck.duckdns.org/api/health` → `{"status":"ok"}`.
- [x] 원격 API 검증: `https://mydaycheck.duckdns.org/api/meta` 응답 정상.
- [x] `docs/REFACTOR_GUIDE.md`의 4-1/5-1/5-2/5-7 항목 반영 완료.

## 진행 상태 (현재까지 반영)

- [x] 1-1 src/core/constants.js 생성/정의
- [x] 1-2 src/core/app-context.js 생성/정의
- [x] 1-3 src/core/dom-refs.js 생성/정의
- [x] 1-4 src/main.js 1단계 import 구조 반영(기본 분리)
- [x] 2-2 src/core/ui-utils.js 핵심 기능 모듈화(에러 바운더리/토스트/깨진 텍스트 체크 반영, UTF-8 복구 완료)
- [x] 2-3 src/core/holidays.js 핵심 기능 모듈화(캐시/조회/주말/이름 조회)
- [x] 2-1 src/state/index.js 핵심 상태/정규화 함수 이관
- [x] 2-4 src/main.js bootstrap 주입/초기화 정리 완료
- [x] 3-1 src/features/calendar/index.js 추출/연결 완료
- [x] 3-2 `main.js` 라우팅/캘린더 연계 정리 완료 (렌더 경로 정리 포함)
- [x] 4 src/features/collab/index.js 추출 완료 (스캐폴드 생성/정의 완료, 핵심 로직 이관 완료)
- [x] 5 src/features/bucket/index.js 추출 완료 (스캐폴드 생성 + `main.js` init 연동 완료, 주요 유틸/핸들러/이벤트 로직 이관 완료)
- [x] 5 src/features/todo/index.js 추출 완료 (정규화/생성 함수의 실사용 호출부 연동 완료, 주요 이벤트/DOM 로직 이관 완료)
- [x] 5-3 src/core/router-utils.js 분리 완료(라우팅/라우트 모듈 초기화/뷰포트 의존 해제)
- [x] 5-5 src/core/sync.js 완료(상태 메타/폴링/런타임 분리)
- [x] 5-4 src/core/viewport.js 추출 완료
- [x] 5-6 src/features/report/index.js 추출 완료
- [x] 5-7 최종 main.js 정리(모듈 결합 리팩터) 완료
- [x] collab 엔트리 정합성: `getCollabContextKey`, `getParsedCollabContext`, `normalizePublicId` 공개 export 복구

## 현재 완료/미완료 요약

- 완료: `core/` 및 `state/` 모듈 기반 정규화/상태/동기화 유틸 정리, 핵심 초기화 경로 주입(`initStateDeps`, `initUiDeps`, `initHolidayDeps`, `initSyncDeps`, `initRouterDeps`, `initCalendarDeps`, `initReportDeps`) 정착.
- 완료: `features/collab/index.js`, `features/bucket/index.js`, `features/todo/index.js`, `features/calendar/index.js`, `features/report/index.js` 스캐폴드 및 핵심 유틸 의존성 분리.
- 완료: `bucket` 라벨 정규화/`todo` 정규화·생성·공유 ID 유틸을 모듈 경유로 호출.
- 완료: `PROJECT_TASKS.md`/`WORK_STATUS.md`에 T-001~T-022 완료 반영(요약 기준).

### 남은 항목
- [x] 4-1 `src/features/collab/index.js`: 협업 핵심 핸들러(요약 조회/초대/공유작업/댓글)를 main.js에서 완전 이관.
- [x] 5-1 `src/features/bucket/index.js`: 버킷 핵심 핸들러(생성/렌더/드래그/리사이즈/이벤트 바인딩) 본체 이관.
- [x] 5-2 `src/features/todo/index.js`: 할 일 핵심 렌더/상세/서브태스크/메모/이벤트 핸들러 이관.
- [x] 5-7 `src/main.js`: 위 3개 feature 분리 완료 전까지 최종 결합 정리 완료.

### 수행 원칙
- 진행 상태를 매 턴 `[x]`/`[ ]`로 갱신해 완료/미완료를 누적 가시화.
- 다음 단계 우선순위: `collab` → `bucket` → `todo` → `main.js` 정리.

### 실행 가능한 상태 표시

- 완료: `src/features/collab/model.js` 생성 및 `normalizePublicIdInput`/`isValidPublicId`/`collabContextKey`/`parseCollabContextKey`의 중복 선언 제거를 통해 `npm run build` 통과.
- 완료: `src/features/collab/index.js`, `src/features/bucket/index.js`, `src/features/todo/index.js`, 관련 model/api 모듈이 존재함.
- 완료: `main.js`에서 `initCollabDeps`, `initBucketDeps`, `initTodoDeps` 실행 경로 추가.
- 완료: `todo` 정규화/생성 유틸, `bucket` 라벨 정규화 유틸을 각각 모듈 호출로 교체.
- 완료: `main.js`에서 라우팅/뷰포트 초기화 호출(`initializeRouteModules`, `setupRouter`, `registerViewportClassSync`)을 모듈 함수 호출 경로로 정리(레거시 wrapper 제거).
- 완료: `main.js`의 collab 공개 ID/컨텍스트 유틸 호출을 `features/collab/index.js` 진입점으로 통일.
- 완료: `main.js` 상단의 상수/상태/DOM 참조를 `core/constants.js`, `core/app-context.js`, `core/dom-refs.js`로 이전해 중복 선언 제거 및 `initStateDeps` 주입 완료.
- 완료: `main.js`의 텍스트 정합성/휴일 조회 함수를 `core/ui-utils`, `core/holidays` 경로로 위임(주입: `initUiDeps`, `initHolidayDeps`).
- 완료: `main.js` 중심의 동작 함수 분리를 완료하고, `render/라우팅/이벤트/폴링` 경로가 feature 모듈 경유로 정렬됨.

> ??臾몄꽌??ChatGPT?먭쾶 ?쒖감?곸쑝濡??꾨떖?섏뿬 ?ㅽ뻾?쒗궎湲??꾪븳 媛?대뱶?낅땲??
> 媛?Phase瑜??섎굹??蹂듭궗?섏뿬 ChatGPT??遺숈뿬?ｊ퀬, 寃곌낵臾쇱쓣 ?곸슜?????ㅼ쓬 Phase濡??섏뼱媛?몄슂.

## ?꾨줈?앺듃 諛곌꼍

- **臾몄젣**: `src/main.js`媛 5,688以? 189媛??⑥닔瑜?媛吏??⑥씪 ?뚯씪 (God File)
- **紐⑺몴**: 湲곕뒫蹂?紐⑤뱢濡?遺꾨━?섏뿬 AI ?댁떆?ㅽ꽩?멸? ?꾩슂???뚯씪留??쎌쓣 ???덇쾶 ??- **?쒖빟**: Vite 鍮뚮뱶 ?놁씠 raw ES module濡??쒕튃 (import 寃쎈줈留??뺥솗?섎㈃ ??
- **?⑦꽩**: ?쒗솚 李몄“ 諛⑹?瑜??꾪빐 `initDeps()` ?섏〈??二쇱엯 ?⑦꽩 ?ъ슜

## ?섏〈??二쇱엯 ?⑦꽩 ?ㅻ챸

紐⑤뱢媛??쒗솚 李몄“瑜?諛⑹??섍린 ?꾪빐, 媛?紐⑤뱢? ?ㅻⅨ 紐⑤뱢???⑥닔媛 ?꾩슂????吏곸젒 import?섏? ?딄퀬 `initDeps()` ?⑥닔瑜??듯빐 諛쏆뒿?덈떎:

```javascript
// ?덉떆: src/features/calendar/index.js
let _render, _showToast;

export function initCalendarDeps({ render, showToast }) {
  _render = render;
  _showToast = showToast;
}

// ?댄썑 紐⑤뱢 ???⑥닔?먯꽌 _render(), _showToast() ?ъ슜
```

`src/main.js`??`bootstrap()` ?⑥닔?먯꽌 紐⑤뱺 紐⑤뱢??`initDeps()`瑜??몄텧?⑸땲??

---

# [x] Phase 1: 怨듭쑀 而⑦뀓?ㅽ듃 ?뚯씪 ?앹꽦

## 吏?쒖궗??
?꾨옒 3媛??뚯씪???덈줈 ?앹꽦?섍퀬, `src/main.js`?먯꽌 ?대떦 肄붾뱶瑜??쒓굅????import濡?援먯껜?섏꽭??

### [x] 1-1. `src/core/constants.js` ?앹꽦

`src/main.js`??**21~58??* 肄붾뱶瑜??대룞?⑸땲??

```javascript
// src/core/constants.js

export const TODO_STORAGE_KEY = 'day-check.main.todos.v4';
export const DONE_STORAGE_KEY = 'day-check.main.doneLog.v1';
export const CALENDAR_STORAGE_KEY = 'day-check.main.calendarItems.v1';
export const BUCKET_LABELS_STORAGE_KEY = 'day-check.main.bucketLabels.v1';
export const BUCKET_ORDER_STORAGE_KEY = 'day-check.main.bucketOrder.v1';
export const BUCKET_VISIBILITY_STORAGE_KEY = 'day-check.main.bucketVisibility.v1';
export const PROJECT_LANES_STORAGE_KEY = 'day-check.main.projectLanes.v1';
export const USER_PROFILE_STORAGE_KEY = 'day-check.main.userProfile.v1';
export const LEGACY_TODO_KEYS = ['day-check.main.todos.v3', 'day-check.main.todos.v2'];

export const API_BASE = '/api';
export const SYNC_DEBOUNCE_MS = 500;
export const STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT = 4000;
export const STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT = 20000;
export const COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT = 6000;
export const COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT = 30000;
export const HOLIDAY_CACHE_TTL_MS_DEFAULT = 24 * 60 * 60 * 1000;
export const HOLIDAY_STALE_RETRY_MS = 5 * 60 * 1000;
export const API_ERROR_TOAST_COOLDOWN_MS = 4000;
export const CONFLICT_BACKUP_STORAGE_KEY = 'day-check.state.conflict.backup.v1';

export const BUCKET_TOTAL = 8;

export const defaultBucketLabels = Array.from({ length: BUCKET_TOTAL }, (_, index) => [
  `bucket${index + 1}`,
  `踰꾪궥 ${index + 1}`,
]).reduce((acc, [bucket, label]) => {
  acc[bucket] = label;
  return acc;
}, {});

export const buckets = Object.keys(defaultBucketLabels);

export const defaultBucketVisibility = buckets.reduce((acc, bucket, index) => {
  acc[bucket] = index < 4;
  return acc;
}, {});

export const defaultUserProfile = {
  nickname: '',
  honorific: '??,
};

export const priorityLabel = {
  3: '??쓬',
  2: '蹂댄넻',
  1: '?믪쓬',
};

export const typeLabel = {
  todo: '????,
  note: '硫붾え',
};

export const HOLIDAYS_BY_MONTH_DAY_FALLBACK = {
  '01-01': '?좎젙',
  '03-01': '?쇱씪??,
  '05-05': '?대┛?대궇',
  '06-06': '?꾩땐??,
  '08-15': '愿묐났??,
  '10-03': '媛쒖쿇??,
  '10-09': '?쒓???,
  '12-25': '?깊깂??,
};

export const HOLIDAYS_BY_YEAR = {};
export const HOLIDAYS_REQUEST = {};

export const MOJIBAKE_MARKERS = [
  '\u003F\uAFA8',
  '\u003F\uBA83',
  '\u003F\uACD7',
  '\u003F\uB181',
  '\u6FE1\uC493',
  '\u907A\uAFA8',
  '\u79FB\uB301',
  '\u8E30\uAFAA\uADA5',
  '\u7337\u2466',
];
```

### [x] 1-2. `src/core/app-context.js` ?앹꽦

`src/main.js`??**60~132??* 肄붾뱶瑜??대룞?⑸땲??

```javascript
// src/core/app-context.js
import {
  buckets,
  defaultBucketLabels,
  defaultBucketVisibility,
  defaultUserProfile,
  STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
  STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
  COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
  COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
  HOLIDAY_CACHE_TTL_MS_DEFAULT,
} from './constants.js';

export const state = {
  todos: [],
  doneLog: [],
  calendarItems: [],
  bucketLabels: { ...defaultBucketLabels },
  bucketOrder: [...buckets],
  bucketVisibility: { ...defaultBucketVisibility },
  projectLanes: [],
  userProfile: { ...defaultUserProfile },
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: '',
  version: 0,
};

export const appState = {
  data: state,
  runtime: {
    isServerSync: false,
    authUser: null,
    pendingSync: false,
    syncing: false,
    syncTimer: null,
    localDirty: false,
    statePollTimer: null,
    statePollInFlight: false,
    statePollIntervalMs: 0,
    statePollingEventsRegistered: false,
    eventsRegistered: false,
    columnResizeObserver: null,
    toastHostEl: null,
    calendarMode: 'note',
    currentRoute: 'home',
    appRouter: null,
    routeTransitionTimer: null,
    routeModules: {},
    authView: null,
    viewportClassRegistered: false,
    collabProfile: {
      publicId: '',
      publicIdUpdatedAt: null,
    },
    collabSummary: null,
    collabShareSettingsByBucket: {},
    sharedTodosByContext: {},
    sharedCommentsByTodo: {},
    activeSharedContextByBucket: {},
    collabPollTimer: null,
    collabPollInFlight: false,
    collabPollIntervalMs: 0,
    lastApiErrorToastKey: '',
    lastApiErrorToastAt: 0,
    fatalErrorShown: false,
    fatalErrorOverlayEl: null,
    globalErrorHandlersRegistered: false,
    bucketMenuHandlersRegistered: false,
    activeBucketMenuButton: null,
  },
  config: {
    poll: {
      stateActiveMs: STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
      stateHiddenMs: STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
      collabActiveMs: COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT,
      collabHiddenMs: COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
    },
    holidays: {
      cacheTtlMs: HOLIDAY_CACHE_TTL_MS_DEFAULT,
    },
    metaLoaded: false,
  },
};

export const runtime = appState.runtime;
export const config = appState.config;
```

### [x] 1-3. `src/core/dom-refs.js` ?앹꽦

`src/main.js`??**134~201??* 肄붾뱶瑜??대룞?⑸땲??

```javascript
// src/core/dom-refs.js
// DOM element 李몄“瑜??쒓납?먯꽌 愿由?
export const routeOutletEl = document.getElementById('routeOutlet');
export const routeLinkEls = Array.from(document.querySelectorAll('[data-route-link]'));
export const routeViewEls = Array.from(document.querySelectorAll('[data-route-view]'));

export const dateEl = document.getElementById('todayDate');
export const todoCountEl = document.getElementById('todoCount');
export const todoListEl = document.getElementById('todoList');
export const todoTemplate = document.getElementById('todoItemTemplate');
export const boardEl = document.querySelector('.board');
export const addProjectColumnBtn = document.getElementById('addProjectColumnBtn');
export const removeProjectColumnBtn = document.getElementById('removeProjectColumnBtn');

export const authStatusEl = document.getElementById('authStatus');
export const authBtn = document.getElementById('authBtn');
export const appHeaderEl = document.getElementById('appHeader');

export const weekRangeEl = document.getElementById('weekRange');
export const weeklyDoneCountEl = document.getElementById('weeklyDoneCount');
export const weeklyDoneListEl = document.getElementById('weeklyDoneList');
export const weeklyPendingCountEl = document.getElementById('weeklyPendingCount');
export const weeklyPendingListEl = document.getElementById('weeklyPendingList');
export const quickForm = document.getElementById('quickAddForm');
export const quickAddBody = document.getElementById('quickAddBody');
export const quickInput = document.getElementById('quickInput');
export const dueDateInput = document.getElementById('dueDateInput');
export const bucketSelect = document.getElementById('bucketSelect');
export const prioritySelect = document.getElementById('prioritySelect');

export const calendarForm = document.getElementById('calendarForm');
export const calendarDateInput = document.getElementById('calendarDateInput');
export const calendarModeButtons = Array.from(document.querySelectorAll('.calendar-mode-btn'));
export const calendarSubmitBtn = document.getElementById('calendarSubmitBtn');
export const calendarTextInput = document.getElementById('calendarTextInput');
export const calendarTodoFields = document.getElementById('calendarTodoFields');
export const calendarTodoTitleInput = document.getElementById('calendarTodoTitleInput');
export const calendarTodoDetailInput = document.getElementById('calendarTodoDetailInput');
export const calendarGrid = document.getElementById('calendarGrid');
export const calendarMonthLabel = document.getElementById('calendarMonthLabel');
export const prevMonthBtn = document.getElementById('prevMonthBtn');
export const nextMonthBtn = document.getElementById('nextMonthBtn');

export const selectedDateLabel = document.getElementById('selectedDateLabel');
export const selectedDateSummary = document.getElementById('selectedDateSummary');
export const selectedCreatedList = document.getElementById('selectedCreatedList');
export const selectedCompletedList = document.getElementById('selectedCompletedList');
export const selectedCalendarNoteList = document.getElementById('selectedCalendarNoteList');
export const selectedDateNoteInput = document.getElementById('selectedDateNoteInput');
export const selectedDateNoteStartDate = document.getElementById('selectedDateNoteStartDate');
export const selectedDateNoteEndDate = document.getElementById('selectedDateNoteEndDate');
export const addSelectedDateNoteBtn = document.getElementById('addSelectedDateNoteBtn');
export const userAliasPreviewEl = document.getElementById('userAliasPreview');
export const toggleProfileEditorBtn = document.getElementById('toggleProfileEditorBtn');
export const profileEditorEl = document.getElementById('profileEditor');
export const profileNicknameInput = document.getElementById('profileNicknameInput');
export const profileHonorificInput = document.getElementById('profileHonorificInput');
export const profilePublicIdInput = document.getElementById('profilePublicIdInput');
export const profilePublicIdHint = document.getElementById('profilePublicIdHint');
export const saveProfileBtn = document.getElementById('saveProfileBtn');
export const cancelProfileBtn = document.getElementById('cancelProfileBtn');

export const collabPanelEl = document.getElementById('collabPanel');
export const collabProfileBadgeEl = document.getElementById('collabProfileBadge');
export const collabInviteFormEl = document.getElementById('collabInviteForm');
export const collabInviteBucketSelectEl = document.getElementById('collabInviteBucketSelect');
export const collabInviteTargetInputEl = document.getElementById('collabInviteTargetInput');
export const collabReceivedInvitesEl = document.getElementById('collabReceivedInvites');
export const collabSentInvitesEl = document.getElementById('collabSentInvites');
export const collabMembershipListEl = document.getElementById('collabMembershipList');
```

### [x] 1-4. `src/main.js` ?섏젙

main.js ?곷떒?먯꽌 ?꾩뿉????릿 肄붾뱶(21~236??瑜??쒓굅?섍퀬 ?꾨옒 import濡?援먯껜?⑸땲??

```javascript
// main.js 理쒖긽??湲곗〈 import ?ㅼ뿉 異붽?
import {
  TODO_STORAGE_KEY, DONE_STORAGE_KEY, CALENDAR_STORAGE_KEY,
  BUCKET_LABELS_STORAGE_KEY, BUCKET_ORDER_STORAGE_KEY,
  BUCKET_VISIBILITY_STORAGE_KEY, PROJECT_LANES_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY, LEGACY_TODO_KEYS,
  API_BASE, SYNC_DEBOUNCE_MS,
  STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT, STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
  COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT, COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT,
  HOLIDAY_CACHE_TTL_MS_DEFAULT, HOLIDAY_STALE_RETRY_MS,
  API_ERROR_TOAST_COOLDOWN_MS, CONFLICT_BACKUP_STORAGE_KEY,
  BUCKET_TOTAL, defaultBucketLabels, buckets, defaultBucketVisibility,
  defaultUserProfile, priorityLabel, typeLabel,
  HOLIDAYS_BY_MONTH_DAY_FALLBACK, HOLIDAYS_BY_YEAR, HOLIDAYS_REQUEST,
  MOJIBAKE_MARKERS,
} from './core/constants.js';
import { state, appState, runtime, config } from './core/app-context.js';
import {
  routeOutletEl, routeLinkEls, routeViewEls,
  dateEl, todoCountEl, todoListEl, todoTemplate, boardEl,
  addProjectColumnBtn, removeProjectColumnBtn,
  authStatusEl, authBtn, appHeaderEl,
  weekRangeEl, weeklyDoneCountEl, weeklyDoneListEl,
  weeklyPendingCountEl, weeklyPendingListEl,
  quickForm, quickAddBody, quickInput, dueDateInput,
  bucketSelect, prioritySelect,
  calendarForm, calendarDateInput, calendarModeButtons,
  calendarSubmitBtn, calendarTextInput, calendarTodoFields,
  calendarTodoTitleInput, calendarTodoDetailInput,
  calendarGrid, calendarMonthLabel, prevMonthBtn, nextMonthBtn,
  selectedDateLabel, selectedDateSummary,
  selectedCreatedList, selectedCompletedList, selectedCalendarNoteList,
  selectedDateNoteInput, selectedDateNoteStartDate, selectedDateNoteEndDate,
  addSelectedDateNoteBtn, userAliasPreviewEl,
  toggleProfileEditorBtn, profileEditorEl,
  profileNicknameInput, profileHonorificInput,
  profilePublicIdInput, profilePublicIdHint,
  saveProfileBtn, cancelProfileBtn,
  collabPanelEl, collabProfileBadgeEl, collabInviteFormEl,
  collabInviteBucketSelectEl, collabInviteTargetInputEl,
  collabReceivedInvitesEl, collabSentInvitesEl, collabMembershipListEl,
} from './core/dom-refs.js';
```

## Phase 1 寃利?
釉뚮씪?곗??먯꽌 ?깆쓣 ?댁뼱 ?뺤긽 ?숈옉?섎뒗吏 ?뺤씤?⑸땲?? 肄섏넄??import ?먮윭媛 ?놁뼱???⑸땲??

---

# [~] Phase 2: ?곹깭 愿由?諛??좏떥由ы떚 異붿텧

## 吏?쒖궗??
### [~] 2-1. `src/state/index.js` ?앹꽦

`src/main.js`?먯꽌 ?꾨옒 ?⑥닔?ㅼ쓣 ???뚯씪濡??대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `safeJsonParse` | 391 |
| `normalizeBucketId` | 399 |
| `normalizeBucketIdOrDefault` | 410 |
| `getBucketFieldValue` | 415 |
| `ensureDateInState` | 422 |
| `loadStateFromLocal` | 428 |
| `normalizeTodos` | 464 |
| `normalizeBucketLabels` | 486 |
| `normalizeBucketOrder` | 501 |
| `normalizeBucketVisibility` | 510 |
| `normalizeProjectLaneName` | 527 |
| `normalizeProjectLanes` | 536 |
| `normalizeDoneLog` | 583 |
| `normalizeCalendarItems` | 606 |
| `normalizeUserProfile` | 619 |
| `normalizeStateFromServer` | 631 |
| `applyServerStateSnapshot` | 647 |
| `hasStoredData` | 672 |
| `saveLocalState` | 702 |
| `ensureDataIntegrity` | 713 |
| `ensureProjectLaneIntegrity` | 721 |
| `markStateDirty` | 2399 |
| `hasPendingLocalChanges` | 2415 |
| `snapshotSyncStatePayload` | 3221 |
| `backupConflictSnapshot` | 3235 |
| `handleVersionConflict` | 3252 |

?뚯씪 援ъ“:

```javascript
// src/state/index.js
import { state, runtime } from '../core/app-context.js';
import {
  TODO_STORAGE_KEY, DONE_STORAGE_KEY, CALENDAR_STORAGE_KEY,
  BUCKET_LABELS_STORAGE_KEY, BUCKET_ORDER_STORAGE_KEY,
  BUCKET_VISIBILITY_STORAGE_KEY, PROJECT_LANES_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY, LEGACY_TODO_KEYS,
  CONFLICT_BACKUP_STORAGE_KEY, SYNC_DEBOUNCE_MS,
  buckets, defaultBucketLabels, defaultBucketVisibility, defaultUserProfile,
} from '../core/constants.js';
import { toLocalIsoDate } from '../core/date-utils.js';

// ?섏〈??二쇱엯?쇰줈 諛쏆쓣 ?⑥닔??let _render, _showToast, _syncState, _showBrokenTextFilteredToast;

export function initStateDeps({ render, showToast, syncState, showBrokenTextFilteredToast }) {
  _render = render;
  _showToast = showToast;
  _syncState = syncState;
  _showBrokenTextFilteredToast = showBrokenTextFilteredToast;
}

// ?ш린?????⑥닔?ㅼ쓣 洹몃?濡?遺숈뿬?ｊ린
// ?? ?ㅻⅨ 紐⑤뱢 ?⑥닔(render, showToast ????_ ?묐몢??蹂???ъ슜

export function safeJsonParse(key) { /* ... */ }
export function loadStateFromLocal() { /* ... */ }
export function saveLocalState() { /* ... */ }
// ... ?섎㉧吏 ?⑥닔?ㅻ룄 export
```

**二쇱쓽**: `markStateDirty()`?먯꽌 `syncState()`瑜??몄텧?섎?濡?`_syncState`瑜??ъ슜?댁빞 ?⑸땲??
`applyServerStateSnapshot()`?먯꽌 `render()`瑜??몄텧?섎?濡?`_render`瑜??ъ슜?⑸땲??
`handleVersionConflict()`?먯꽌 `showToast()`瑜??몄텧?섎?濡?`_showToast`瑜??ъ슜?⑸땲??

### [x] 2-2. `src/core/ui-utils.js` ?앹꽦

?꾨옒 ?⑥닔?ㅼ쓣 ?대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `findBrokenTextMarker` | 238 |
| `hasBrokenText` | 242 |
| `showBrokenTextFilteredToast` | 253 |
| `formatToday` | 2191 |
| `ensureToastHost` | 2202 |
| `showToast` | 2218 |
| `extractErrorDetail` | 2241 |
| `dismissFatalErrorScreen` | 2251 |
| `renderFatalErrorScreen` | 2265 |
| `handleFatalError` | 2327 |
| `shouldIgnoreGlobalError` | 2332 |
| `registerGlobalErrorBoundary` | 2359 |
| `showApiErrorToast` | 2381 |
| `createApiRequestError` | 2395 |

```javascript
// src/core/ui-utils.js
import { runtime } from './app-context.js';
import { dateEl } from './dom-refs.js';
import { MOJIBAKE_MARKERS, API_ERROR_TOAST_COOLDOWN_MS } from './constants.js';
import { createApiRequestError as createCoreApiRequestError } from './api-request.js';

export function showToast(message, type = 'info') { /* ... */ }
export function handleFatalError(error) { /* ... */ }
export function registerGlobalErrorBoundary() { /* ... */ }
// ... ?섎㉧吏 ?⑥닔??```

### [x] 2-3. `src/core/holidays.js` ?앹꽦

怨듯쑕??愿???⑥닔?ㅼ쓣 ?대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `getHolidayFallbackLabel` | 270 |
| `formatMonthDay` | 274 |
| `getHolidayLabel` | 280 |
| `normalizeHolidayMap` | 288 |
| `requestHolidayData` | 303 |
| `ensureHolidayDataForYear` | 362 |
| `getWeekendType` | 380 |

```javascript
// src/core/holidays.js
import {
  HOLIDAYS_BY_MONTH_DAY_FALLBACK, HOLIDAYS_BY_YEAR,
  HOLIDAYS_REQUEST, HOLIDAY_STALE_RETRY_MS,
} from './constants.js';

let _apiRequest, _config;

export function initHolidayDeps({ apiRequest, config }) {
  _apiRequest = apiRequest;
  _config = config;
}

export function getHolidayLabel(date) { /* ... */ }
// ... ?섎㉧吏
```

### [~] 2-4. `src/main.js` ?섏젙

?꾩뿉????릿 ?⑥닔?ㅼ쓣 紐⑤몢 ?쒓굅?섍퀬, import濡?援먯껜?⑸땲??

```javascript
import {
  safeJsonParse, loadStateFromLocal, saveLocalState,
  normalizeBucketId, normalizeBucketIdOrDefault,
  // ... ?섎㉧吏 state ?⑥닔??  initStateDeps,
} from './state/index.js';
import {
  showToast, handleFatalError, registerGlobalErrorBoundary,
  showApiErrorToast, createApiRequestError, showBrokenTextFilteredToast,
  hasBrokenText, formatToday,
} from './core/ui-utils.js';
import {
  getHolidayLabel, ensureHolidayDataForYear, getWeekendType,
  initHolidayDeps,
} from './core/holidays.js';
```

`bootstrap()` ?⑥닔 ?쒖옉 遺遺꾩뿉 `initDeps` ?몄텧??異붽??⑸땲??

```javascript
async function bootstrap() {
  // ?섏〈??二쇱엯
  initStateDeps({ render, showToast, syncState, showBrokenTextFilteredToast });
  initHolidayDeps({ apiRequest, config });

  registerGlobalErrorBoundary();
  // ... 湲곗〈 肄붾뱶 怨꾩냽
}
```

## Phase 2 寃利?
釉뚮씪?곗??먯꽌 ???닿린 ???좎씪 異붽?/??젣 ???덈줈怨좎묠 ???좎? ?뺤씤. 肄섏넄???먮윭 ?놁뼱???⑸땲??

---

# [x] Phase 3: Calendar 湲곕뒫 異붿텧

## 吏?쒖궗??
### [x] 3-1. `src/features/calendar/index.js` ?ъ옉??
湲곗〈??鍮??ㅽ뀅(`src/features/calendar/ui.js`)? ?좎??섍퀬, `index.js`瑜??덈줈 ?묒꽦?⑸땲??

`src/main.js`?먯꽌 ?꾨옒 ?⑥닔?ㅼ쓣 ?대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `countDailyStats` | 4494 |
| `buildCalendarRangeLaneMap` | 4500 |
| `getEntriesForDate` | 4545 |
| `addEmptyMessage` | 4595 |
| `createSelectedNoteTextNode` | 4601 |
| `renderSelectedDatePanel` | 4632 |
| `isCalendarTodoMode` | 4735 |
| `setCalendarMode` | 4739 |
| `applyCalendarFormMode` | 4744 |
| `addSelectedDateNote` | 4771 |
| `isCompactCalendarViewport` | 4808 |
| `renderCalendar` | 4815 |

```javascript
// src/features/calendar/index.js
import { state, runtime } from '../../core/app-context.js';
import {
  calendarForm, calendarDateInput, calendarModeButtons,
  calendarSubmitBtn, calendarTextInput, calendarTodoFields,
  calendarTodoTitleInput, calendarTodoDetailInput,
  calendarGrid, calendarMonthLabel,
  selectedDateLabel, selectedDateSummary,
  selectedCreatedList, selectedCompletedList, selectedCalendarNoteList,
  selectedDateNoteInput, selectedDateNoteStartDate, selectedDateNoteEndDate,
  addSelectedDateNoteBtn,
} from '../../core/dom-refs.js';
import { typeLabel } from '../../core/constants.js';
import {
  toLocalIsoDate, formatDisplayDate, parseIsoDate,
  isDateInCalendarRange, clampCalendarRangeEnd,
  formatCalendarRange, getRangeDaysInclusive,
} from '../../core/date-utils.js';
import { getHolidayLabel, getWeekendType } from '../../core/holidays.js';

let _showToast, _render, _saveLocalState, _queueSync,
    _createCalendarItem, _hasBrokenText, _showBrokenTextFilteredToast;

export function initCalendarDeps({
  showToast, render, saveLocalState, queueSync,
  createCalendarItem, hasBrokenText, showBrokenTextFilteredToast,
}) {
  _showToast = showToast;
  _render = render;
  _saveLocalState = saveLocalState;
  _queueSync = queueSync;
  _createCalendarItem = createCalendarItem;
  _hasBrokenText = hasBrokenText;
  _showBrokenTextFilteredToast = showBrokenTextFilteredToast;
}

export function renderCalendar() { /* main.js?먯꽌 媛?몄삩 肄붾뱶 */ }
export function renderSelectedDatePanel() { /* ... */ }
export function setCalendarMode(mode) { /* ... */ }
export function applyCalendarFormMode() { /* ... */ }
export function addSelectedDateNote() { /* ... */ }
export function isCalendarTodoMode() { /* ... */ }
export function isCompactCalendarViewport() { /* ... */ }
// ... ?섎㉧吏 ?⑥닔??(?대??⑹? export 遺덊븘??
```

### [x] 3-2. `src/main.js` ?섏젙

???⑥닔?ㅼ쓣 main.js?먯꽌 ?쒓굅?섍퀬 import?⑸땲??

```javascript
import {
  renderCalendar, renderSelectedDatePanel,
  setCalendarMode, applyCalendarFormMode,
  addSelectedDateNote, isCalendarTodoMode,
  isCompactCalendarViewport, initCalendarDeps,
} from './features/calendar/index.js';
```

`bootstrap()`??異붽?:

```javascript
initCalendarDeps({
  showToast, render, saveLocalState, queueSync,
  createCalendarItem, hasBrokenText, showBrokenTextFilteredToast,
});
```

## Phase 3 寃利?
罹섎┛???????좎쭨 ?대┃ ??硫붾え 異붽?/??젣 ?????대룞 ??紐⑤몢 ?뺤긽 ?숈옉 ?뺤씤.

---

# [~] Phase 4: Collab 湲곕뒫 異붿텧

## 吏?쒖궗??
?닿쾬??媛????異붿텧?낅땲??(~1,800以?. ?좎쨷?섍쾶 吏꾪뻾?섏꽭??

### [~] 4-1. `src/features/collab/index.js` ?ъ옉??
`src/main.js`?먯꽌 ?꾨옒 ?⑥닔?ㅼ쓣 ?대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `normalizePublicIdInput` | 2526 (`src/features/collab/model.js`로 이전됨) |
| `isValidPublicId` | 2534 (`src/features/collab/model.js`로 이전됨) |
| `collabContextKey` | 2538 (`src/features/collab/model.js`로 이전됨) |
| `parseCollabContextKey` | 2542 (`src/features/collab/model.js`로 이전됨) |
| `safeReadJson` | 2555 |
| `resetCollabState` | 2561 |
| `normalizeCollabShareSettings` | 2574 |
| `isBucketShareEnabled` | 2603 |
| `shouldShowSharedSection` | 2607 |
| `pruneCollabCaches` | 2617 |
| `ensureBucketShareToggle` | 2654 |
| `getCollabContextsForBucket` | 2682 |
| `ensureActiveSharedContext` | 2750 |
| `getSharedTodoById` | 2763 |
| `collabApiRequest` | 2782 |
| `applyCollabSnapshotPayload` | 2816 |
| `buildSnapshotCommentTodoQuery` | 2843 |
| `refreshCollabSnapshot` | 2853 |
| `refreshCollabSummary` | 2870 |
| `refreshSharedComments` | 2877 |
| `stopCollabPolling` | 2888 |
| `getCollabPollIntervalMs` | 2897 |
| `pollCollabData` | 2904 |
| `startCollabPolling` | 2920 |
| `syncCollabPolling` | 2940 |
| `savePublicIdToServer` | 2948 |
| `getProfileDisplayName` | 3004 |
| `updateProfileAliasUI` | 3016 |
| `applyAuthState` | 3024 |
| `updateAuthUI` | 3046 |
| `checkAuth` | 3076 |
| `loadServerState` | 3094 |
| `pollServerState` | 3117 |
| `stopStatePolling` | 3155 |
| `getStatePollIntervalMs` | 3164 |
| `startStatePolling` | 3171 |
| `registerStatePollingEvents` | 3191 |
| `syncState` | 3281 |
| `queueSync` | 3325 |
| `ensureSharedSection` | 3612 |
| `setSharedListEmpty` | 3697 |
| `getAuthorTag` | 3708 |
| `getSharedTodoMetaText` | 3716 |
| `createSharedCommentItem` | 3723 |
| `renderSharedComments` | 3768 |
| `createSharedTodoItem` | 3786 |
| `renderSharedTodosForBucket` | 3910 |
| `renderCollabPanel` | 3977 |
| `submitCollabInvite` | 4135 |
| `toggleBucketShareSetting` | 4169 |
| `handleCollabPanelAction` | 4198 |
| `submitSharedComposeForm` | 4255 |
| `updateSharedTodoFromItem` | 4312 |
| `deleteSharedTodo` | 4371 |
| `addSharedComment` | 4394 |
| `deleteSharedComment` | 4427 |
| `toggleSharedCommentPanel` | 4441 |

```javascript
// src/features/collab/index.js
import { state, runtime, config } from '../../core/app-context.js';
import {
  buckets, API_BASE, SYNC_DEBOUNCE_MS,
  // ... ?꾩슂???곸닔??} from '../../core/constants.js';
import {
  collabPanelEl, collabProfileBadgeEl,
  collabInviteFormEl, collabInviteBucketSelectEl,
  // ... ?꾩슂??DOM refs
} from '../../core/dom-refs.js';

let _render, _showToast, _apiRequest, _saveLocalState,
    _applyServerStateSnapshot, _loadStateFromLocal;

export function initCollabDeps({
  render, showToast, apiRequest, saveLocalState,
  applyServerStateSnapshot, loadStateFromLocal,
  showApiErrorToast, createApiRequestError,
  getBucketLabel, ensureBucketColumns,
  hasPendingLocalChanges,
}) {
  _render = render;
  _showToast = showToast;
  // ... ?섎㉧吏 ?좊떦
}

export function renderCollabPanel() { /* ... */ }
export function refreshCollabSummary(options) { /* ... */ }
export function syncCollabPolling() { /* ... */ }
export function checkAuth() { /* ... */ }
export function updateAuthUI() { /* ... */ }
export function syncState() { /* ... */ }
export function queueSync(immediate) { /* ... */ }
// ... ?섎㉧吏 export
```

### [~] 4-2. `src/main.js` ?섏젙

???⑥닔?ㅼ쓣 ?쒓굅?섍퀬 import?⑸땲??

```javascript
import {
  renderCollabPanel, refreshCollabSummary, syncCollabPolling,
  checkAuth, updateAuthUI, syncState, queueSync,
  savePublicIdToServer, updateProfileAliasUI,
  loadServerState, pollServerState,
  stopStatePolling, startStatePolling, registerStatePollingEvents,
  stopCollabPolling, startCollabPolling,
  submitCollabInvite, toggleBucketShareSetting,
  handleCollabPanelAction, submitSharedComposeForm,
  updateSharedTodoFromItem, deleteSharedTodo,
  addSharedComment, deleteSharedComment, toggleSharedCommentPanel,
  renderSharedTodosForBucket, ensureSharedSection,
  isBucketShareEnabled, shouldShowSharedSection,
  ensureBucketShareToggle, setCalendarMode,
  initCollabDeps,
} from './features/collab/index.js';
```

`bootstrap()`??異붽?:

```javascript
initCollabDeps({
  render, showToast, apiRequest, saveLocalState,
  applyServerStateSnapshot, loadStateFromLocal,
  showApiErrorToast, createApiRequestError,
  getBucketLabel, ensureBucketColumns,
  hasPendingLocalChanges,
});
```

## Phase 4 寃利?
1. 濡쒓렇??濡쒓렇?꾩썐 ?뚯뒪??2. ?묒뾽 ?⑤꼸 ?닿린 ??珥덈? 蹂대궡湲?諛쏄린
3. 怨듭쑀 ?좎씪 ?묒꽦/?섏젙/??젣
4. ?쒕쾭 ?숆린???뺤씤 (?좎씪 異붽? ???덈줈怨좎묠 ???좎?)

---

# [~] Phase 5: Bucket/Todo 異붿텧 + 留덈Т由?
## 吏?쒖궗??
### [~] 5-1. `src/features/bucket/index.js` ?ъ옉??
?꾨옒 ?⑥닔?ㅼ쓣 ?대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `getProjectLanesByBucket` | 717 |
| `addProjectLane` | 803 |
| `getProjectLaneName` | 830 |
| `getTodoGroupLabel` | 835 |
| `getActiveBucketCount` | 844 |
| `setBucketCount` | 849 |
| `removeBucket` | 876 |
| `addNextHiddenBucket` | 895 |
| `createBucketColumn` | 908 |
| `ensureBucketColumns` | 952 |
| `ensureBucketSelectOptions` | 965 |
| `getBucketLabel` | 982 |
| `normalizeBucketLabel` | 986 |
| `applyBucketLabels` | 993 |
| `applyBucketOrder` | 1008 |
| `applyBucketVisibility` | 1026 |
| `applyBucketSizes` | 1058 |
| `applyProjectLaneSizes` | 1070 |
| `syncBucketOrderFromDom` | 1074 |
| `registerBucketResizeObserver` | 1085 |
| `renderProjectLaneColumns` | 1092 |
| `registerBucketDragControls` | 1105 |
| `registerProjectColumnControls` | 1267 |
| `registerBucketLaneControls` | 1318 |
| `closeBucketActionMenus` | 1405 |
| `registerBucketMenuHandlers` | 1419 |
| `canRemoveBucketFromMenu` | 1439 |
| `ensureBucketActionMenu` | 1445 |
| `syncBucketActionMenus` | 1539 |
| `beginEditLaneName` | 1546 |
| `renderProjectLaneOptions` | 1627 |
| `removeProjectLane` | 1657 |
| `renderProjectLaneGroups` | 1668 |
| `registerBucketTitleEditors` | 2019 |

```javascript
// src/features/bucket/index.js
import { state, runtime } from '../../core/app-context.js';
import { buckets, defaultBucketLabels, defaultBucketVisibility } from '../../core/constants.js';
import { boardEl, bucketSelect, addProjectColumnBtn, removeProjectColumnBtn } from '../../core/dom-refs.js';

let _render, _showToast, _saveLocalState, _queueSync, _markStateDirty;

export function initBucketDeps({ render, showToast, saveLocalState, queueSync, markStateDirty }) {
  _render = render;
  _showToast = showToast;
  _saveLocalState = saveLocalState;
  _queueSync = queueSync;
  _markStateDirty = markStateDirty;
}

export function ensureBucketColumns() { /* ... */ }
export function getBucketLabel(bucket) { /* ... */ }
// ... ?섎㉧吏 ?⑥닔??```

### [~] 5-2. `src/features/todo/index.js` ?ъ옉??
?꾨옒 ?⑥닔?ㅼ쓣 ?대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `buildTodoMetaText` | 1754 |
| `renderTodoSubtaskList` | 1765 |
| `bindTodoSubtaskComposer` | 1830 |
| `renderTodoMemoList` | 1868 |
| `bindTodoMemoComposer` | 1917 |
| `renderTodoItems` | 1951 |
| `sortTodos` | 2050 |
| `normalizeTodoSubtaskText` | 2059 |
| `normalizeTodoMemoText` | 2067 |
| `normalizeTodoSubtasks` | 2074 |
| `normalizeTodoMemos` | 2112 |
| `normalizeTodoDetails` | 2148 |
| `createTodo` | 2154 |
| `createCalendarItem` | 2178 |
| `renderTodoList` | 4458 |
| `renderTodosByBucket` | 4467 |
| `bindTodoDetailsInput` | 3525 |
| `getTodayActiveNoteEntries` | 3541 |
| `renderTodayNoteHighlights` | 3558 |

```javascript
// src/features/todo/index.js
import { state, runtime } from '../../core/app-context.js';
import { priorityLabel, typeLabel } from '../../core/constants.js';
import { todoCountEl, todoListEl, todoTemplate } from '../../core/dom-refs.js';

let _render, _showToast, _saveLocalState, _queueSync, _markStateDirty;

export function initTodoDeps({ render, showToast, saveLocalState, queueSync, markStateDirty }) {
  _render = render;
  _showToast = showToast;
  _saveLocalState = saveLocalState;
  _queueSync = queueSync;
  _markStateDirty = markStateDirty;
}

export function sortTodos(list) { /* ... */ }
export function createTodo(params) { /* ... */ }
export function renderTodoList() { /* ... */ }
// ... ?섎㉧吏
```

### [x] 5-3. `src/core/router-utils.js` ?앹꽦

?쇱슦??愿???⑥닔瑜??대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `updateRouteTabs` | 3351 |
| `focusRouteHeading` | 3364 |
| `animateRouteView` | 3377 |
| `activateRoute` | 3409 |
| `renderRoute` | 3424 |
| `initializeRouteModules` | 5480 |
| `setupRouter` | 5497 |

### [x] 5-4. `src/core/viewport.js` ?앹꽦

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `isIphoneLikeDevice` | 5532 |
| `syncViewportClasses` | 5540 |
| `registerViewportClassSync` | 5551 |

### [ ] 5-5. `src/core/sync.js` ?앹꽦

API ?붿껌怨??숆린??愿???⑥닔瑜??대룞?⑸땲??

| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `apiRequest` | 2419 |
| `mergeBucketDefaultsFromMeta` | 2429 |
| `applyRuntimeMeta` | 2467 |
| `loadRuntimeMeta` | 2501 |
| `getCookie` | 2517 |

### [x] 5-6. `src/features/report/index.js` ?ъ옉??
| ?⑥닔紐?| ?먮옒 ??|
|--------|---------|
| `renderWeeklyReport` | 3480 |

### [~] 5-7. `src/main.js` 理쒖쥌 ?뺥깡

main.js?먮뒗 ?꾨옒留??⑥뒿?덈떎 (~300~500以?:

```javascript
// src/main.js ??理쒖쥌 ?뺥깭

// === Imports ===
import { state, runtime, config } from './core/app-context.js';
import { /* DOM refs */ } from './core/dom-refs.js';
import { /* ?곸닔 */ } from './core/constants.js';
import { /* date-utils */ } from './core/date-utils.js';
import { /* ui-utils */ } from './core/ui-utils.js';
import { /* holidays */ } from './core/holidays.js';
import { /* state 愿由?*/ } from './state/index.js';
import { /* sync */ } from './core/sync.js';
import { /* router */ } from './core/router-utils.js';
import { /* viewport */ } from './core/viewport.js';
import { /* calendar */ } from './features/calendar/index.js';
import { /* collab */ } from './features/collab/index.js';
import { /* bucket */ } from './features/bucket/index.js';
import { /* todo */ } from './features/todo/index.js';
import { /* report */ } from './features/report/index.js';

// === render() ===
function render() {
  // 湲곗〈 肄붾뱶 ?좎?
}

// === registerEvents() ===
function registerEvents() {
  // 湲곗〈 肄붾뱶 ?좎? (?대깽??由ъ뒪???깅줉)
}

// === bootstrap() ===
async function bootstrap() {
  // ?섏〈??二쇱엯
  initStateDeps({ ... });
  initHolidayDeps({ ... });
  initCalendarDeps({ ... });
  initCollabDeps({ ... });
  initBucketDeps({ ... });
  initTodoDeps({ ... });

  // 湲곗〈 bootstrap 肄붾뱶
  registerGlobalErrorBoundary();
  formatToday();
  // ...
}

bootstrap().catch((error) => {
  // 湲곗〈 fallback 肄붾뱶
});

registerServiceWorker();
```

## Phase 5 寃利?
1. 紐⑤뱺 ???뺤긽 ?숈옉 (?? 踰꾪궥, 罹섎┛?? 由ы룷??
2. ?좎씪 CRUD ?뺤긽
3. 濡쒓렇??濡쒓렇?꾩썐 ?뺤긽
4. ?묒뾽 湲곕뒫 ?뺤긽
5. main.js媛 ~500以??댄븯濡?以꾩뿀?붿? ?뺤씤
6. 媛?紐⑤뱢 ?뚯씪???낅┰?곸쑝濡??쎌쓣 ???덈뒗 ?ш린?몄? ?뺤씤

---

# 理쒖쥌 ?뚯씪 援ъ“

```
src/
?쒋?? main.js                        (~400以? bootstrap + render + registerEvents)
?쒋?? app/
??  ?쒋?? bootstrap.js               (湲곗〈 ?좎?)
??  ?붴?? router.js                  (湲곗〈 ?좎?)
?쒋?? core/
??  ?쒋?? api-request.js             (湲곗〈 ?좎?)
??  ?쒋?? app-context.js             (NEW: state, runtime, config)
??  ?쒋?? constants.js               (NEW: 紐⑤뱺 ?곸닔)
??  ?쒋?? date-utils.js              (湲곗〈 ?좎?)
??  ?쒋?? dom-refs.js                (NEW: DOM element 李몄“)
??  ?쒋?? holidays.js                (NEW: 怨듯쑕??濡쒖쭅)
??  ?쒋?? router-utils.js            (NEW: ?쇱슦???좏떥)
??  ?쒋?? sync.js                    (NEW: API/?숆린??
??  ?쒋?? ui-utils.js                (NEW: toast, error boundary)
??  ?붴?? viewport.js                (NEW: viewport 愿??
?쒋?? features/
??  ?쒋?? auth/ui.js                 (湲곗〈 ?좎?)
??  ?쒋?? bucket/
??  ??  ?쒋?? index.js               (NEW: 踰꾪궥 ?꾩껜 濡쒖쭅)
??  ??  ?붴?? ui.js                  (湲곗〈 ?좎?)
??  ?쒋?? calendar/
??  ??  ?쒋?? index.js               (NEW: 罹섎┛???꾩껜 濡쒖쭅)
??  ??  ?붴?? ui.js                  (湲곗〈 ?좎?)
??  ?쒋?? collab/
??  ??  ?쒋?? index.js               (NEW: ?묒뾽 ?꾩껜 濡쒖쭅)
??  ??  ?쒋?? policy.js              (湲곗〈 ?좎?)
??  ??  ?붴?? ui.js                  (湲곗〈 ?좎?)
??  ?쒋?? report/
??  ??  ?쒋?? index.js               (NEW: 二쇨컙 由ы룷??
??  ??  ?붴?? ui.js                  (湲곗〈 ?좎?)
??  ?붴?? todo/
??      ?쒋?? index.js               (NEW: ?좎씪 ?꾩껜 濡쒖쭅)
??      ?붴?? ui.js                  (湲곗〈 ?좎?)
?붴?? state/
    ?붴?? index.js                   (NEW: ?곹깭 愿由?
```

---

# ?묒뾽 ??
1. **??Phase??吏꾪뻾**: 諛섎뱶????Phase瑜??꾨즺?섍퀬 釉뚮씪?곗??먯꽌 ?뺤씤?????ㅼ쓬?쇰줈 ?섏뼱媛?몄슂.
2. **?⑥닔 蹂몃Ц? 洹몃?濡?*: ?⑥닔 ?대? 濡쒖쭅? 蹂寃쏀븯吏 留덉꽭?? import/export留?異붽??⑸땲??
3. **?섏〈??二쇱엯 二쇱쓽**: ?ㅻⅨ 紐⑤뱢 ?⑥닔瑜??몄텧?섎뒗 遺遺꾨쭔 `_` ?묐몢??蹂?섎줈 援먯껜?⑸땲??
4. **export ?꾨씫 二쇱쓽**: main.js???ㅻⅨ ?⑥닔?먯꽌 ?몄텧?섎뒗 ?⑥닔??諛섎뱶??export?댁빞 ?⑸땲??
5. **IDE 寃???쒖슜**: ?⑥닔 ?대룞 ?? ?대떦 ?⑥닔瑜??몄텧?섎뒗 紐⑤뱺 怨녹쓣 寃?됲븯?몄슂.







