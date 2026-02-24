import {
  clampCalendarRangeEnd,
  endOfWeek,
  formatCalendarRange,
  formatDisplayDate,
  formatDisplayDateTime,
  getRangeDaysInclusive,
  inCurrentWeek,
  isDateInCalendarRange,
  parseIsoDate,
  startOfWeek,
  toLocalIsoDate,
} from './core/date-utils.js';
import { createApiRequestError as createCoreApiRequestError, performApiRequest } from './core/api-request.js';
import { APP_ROUTES, createRouter, ROUTE_STORAGE_KEY } from './app/router.js';
import { createTodoUi } from './features/todo/ui.js';
import { createBucketUi } from './features/bucket/ui.js';
import { createCalendarUi } from './features/calendar/ui.js';
import { createReportUi } from './features/report/ui.js';
import { createAuthUi } from './features/auth/ui.js';
const TODO_STORAGE_KEY = 'day-check.main.todos.v4';
const DONE_STORAGE_KEY = 'day-check.main.doneLog.v1';
const CALENDAR_STORAGE_KEY = 'day-check.main.calendarItems.v1';
const BUCKET_LABELS_STORAGE_KEY = 'day-check.main.bucketLabels.v1';
const BUCKET_ORDER_STORAGE_KEY = 'day-check.main.bucketOrder.v1';
const BUCKET_VISIBILITY_STORAGE_KEY = 'day-check.main.bucketVisibility.v1';
const PROJECT_LANES_STORAGE_KEY = 'day-check.main.projectLanes.v1';
const USER_PROFILE_STORAGE_KEY = 'day-check.main.userProfile.v1';
const LEGACY_TODO_KEYS = ['day-check.main.todos.v3', 'day-check.main.todos.v2'];

const API_BASE = '/api';
const SYNC_DEBOUNCE_MS = 500;
const STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT = 4000;
const STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT = 20000;
const COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT = 6000;
const COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT = 30000;
const HOLIDAY_CACHE_TTL_MS_DEFAULT = 24 * 60 * 60 * 1000;
const HOLIDAY_STALE_RETRY_MS = 5 * 60 * 1000;
const API_ERROR_TOAST_COOLDOWN_MS = 4000;
const CONFLICT_BACKUP_STORAGE_KEY = 'day-check.state.conflict.backup.v1';

const BUCKET_TOTAL = 8;
const defaultBucketLabels = Array.from({ length: BUCKET_TOTAL }, (_, index) => [
  `bucket${index + 1}`,
  `버킷 ${index + 1}`,
]).reduce((acc, [bucket, label]) => {
  acc[bucket] = label;
  return acc;
}, {});
const buckets = Object.keys(defaultBucketLabels);
const defaultBucketVisibility = buckets.reduce((acc, bucket, index) => {
  acc[bucket] = index < 4;
  return acc;
}, {});
const defaultUserProfile = {
  nickname: '',
  honorific: '님',
};

const state = {
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

const appState = {
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

const runtime = appState.runtime;
const config = appState.config;

const routeOutletEl = document.getElementById('routeOutlet');
const routeLinkEls = Array.from(document.querySelectorAll('[data-route-link]'));
const routeViewEls = Array.from(document.querySelectorAll('[data-route-view]'));

const dateEl = document.getElementById('todayDate');
const todoCountEl = document.getElementById('todoCount');
const todoListEl = document.getElementById('todoList');
const todoTemplate = document.getElementById('todoItemTemplate');
const boardEl = document.querySelector('.board');
const addProjectColumnBtn = document.getElementById('addProjectColumnBtn');
const removeProjectColumnBtn = document.getElementById('removeProjectColumnBtn');

const authStatusEl = document.getElementById('authStatus');
const authBtn = document.getElementById('authBtn');
const appHeaderEl = document.getElementById('appHeader');

const weekRangeEl = document.getElementById('weekRange');
const weeklyDoneCountEl = document.getElementById('weeklyDoneCount');
const weeklyDoneListEl = document.getElementById('weeklyDoneList');
const weeklyPendingCountEl = document.getElementById('weeklyPendingCount');
const weeklyPendingListEl = document.getElementById('weeklyPendingList');
const quickForm = document.getElementById('quickAddForm');
const quickAddBody = document.getElementById('quickAddBody');
const quickInput = document.getElementById('quickInput');
const dueDateInput = document.getElementById('dueDateInput');
const bucketSelect = document.getElementById('bucketSelect');
const prioritySelect = document.getElementById('prioritySelect');

const calendarForm = document.getElementById('calendarForm');
const calendarDateInput = document.getElementById('calendarDateInput');
const calendarModeButtons = Array.from(document.querySelectorAll('.calendar-mode-btn'));
const calendarSubmitBtn = document.getElementById('calendarSubmitBtn');
const calendarTextInput = document.getElementById('calendarTextInput');
const calendarTodoFields = document.getElementById('calendarTodoFields');
const calendarTodoTitleInput = document.getElementById('calendarTodoTitleInput');
const calendarTodoDetailInput = document.getElementById('calendarTodoDetailInput');
const calendarGrid = document.getElementById('calendarGrid');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');

const selectedDateLabel = document.getElementById('selectedDateLabel');
const selectedDateSummary = document.getElementById('selectedDateSummary');
const selectedCreatedList = document.getElementById('selectedCreatedList');
const selectedCompletedList = document.getElementById('selectedCompletedList');
const selectedCalendarNoteList = document.getElementById('selectedCalendarNoteList');
const selectedDateNoteInput = document.getElementById('selectedDateNoteInput');
const selectedDateNoteStartDate = document.getElementById('selectedDateNoteStartDate');
const selectedDateNoteEndDate = document.getElementById('selectedDateNoteEndDate');
const addSelectedDateNoteBtn = document.getElementById('addSelectedDateNoteBtn');
const userAliasPreviewEl = document.getElementById('userAliasPreview');
const toggleProfileEditorBtn = document.getElementById('toggleProfileEditorBtn');
const profileEditorEl = document.getElementById('profileEditor');
const profileNicknameInput = document.getElementById('profileNicknameInput');
const profileHonorificInput = document.getElementById('profileHonorificInput');
const profilePublicIdInput = document.getElementById('profilePublicIdInput');
const profilePublicIdHint = document.getElementById('profilePublicIdHint');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const cancelProfileBtn = document.getElementById('cancelProfileBtn');

const collabPanelEl = document.getElementById('collabPanel');
const collabProfileBadgeEl = document.getElementById('collabProfileBadge');
const collabInviteFormEl = document.getElementById('collabInviteForm');
const collabInviteBucketSelectEl = document.getElementById('collabInviteBucketSelect');
const collabInviteTargetInputEl = document.getElementById('collabInviteTargetInput');
const collabReceivedInvitesEl = document.getElementById('collabReceivedInvites');
const collabSentInvitesEl = document.getElementById('collabSentInvites');
const collabMembershipListEl = document.getElementById('collabMembershipList');

const priorityLabel = {
  3: '낮음',
  2: '보통',
  1: '높음',
};

const typeLabel = {
  todo: '할 일',
  note: '메모',
};

const HOLIDAYS_BY_MONTH_DAY_FALLBACK = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '성탄절',
};
const HOLIDAYS_BY_YEAR = {};
const HOLIDAYS_REQUEST = {};
const MOJIBAKE_MARKERS = [
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

function findBrokenTextMarker(text) {
  return MOJIBAKE_MARKERS.find((marker) => text.includes(marker)) || '';
}

function hasBrokenText(value) {
  const text = String(value || '');
  if (!text) {
    return false;
  }
  if (/[\uFFFD]/u.test(text)) {
    return true;
  }
  return Boolean(findBrokenTextMarker(text));
}

function showBrokenTextFilteredToast(context, value) {
  const text = String(value || '');
  if (!text) {
    return;
  }

  const marker = findBrokenTextMarker(text);
  if (marker) {
    showToast(`${context}에서 깨진 문자열 패턴("${marker}")이 감지되어 제외했습니다.`, 'error');
    return;
  }

  if (/[\uFFFD]/u.test(text)) {
    showToast(`${context}에서 치환 문자(U+FFFD)가 감지되어 제외했습니다.`, 'error');
  }
}

function getHolidayFallbackLabel(date) {
  return HOLIDAYS_BY_MONTH_DAY_FALLBACK[formatMonthDay(date)] || '';
}

function formatMonthDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function getHolidayLabel(date) {
  const year = String(date.getFullYear());
  const dateText = toLocalIsoDate(date);
  const fallback = getHolidayFallbackLabel(date);

  return HOLIDAYS_BY_YEAR[year]?.data?.[dateText] || fallback;
}

function normalizeHolidayMap(candidate) {
  const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const normalized = {};
  Object.entries(source).forEach(([dateText, label]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      return;
    }
    const text = String(label || '').trim();
    if (text) {
      normalized[dateText] = text;
    }
  });
  return normalized;
}

function requestHolidayData(year) {
  const yearText = String(year);
  const cached = HOLIDAYS_BY_YEAR[yearText];
  if (HOLIDAYS_REQUEST[yearText]) {
    return HOLIDAYS_REQUEST[yearText];
  }
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data || {});
  }

  const promise = (async () => {
    const stale = cached?.data || {};
    const staleRetryExpiresAt = Date.now() + HOLIDAY_STALE_RETRY_MS;
    try {
      const response = await fetch(`${API_BASE}/holidays?year=${encodeURIComponent(yearText)}`, {
        headers: {
          'cache-control': 'no-store',
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        HOLIDAYS_BY_YEAR[yearText] = {
          data: stale,
          expiresAt: staleRetryExpiresAt,
        };
        return stale;
      }

      const payload = await response.json();
      const holidayMap = normalizeHolidayMap(payload?.holidays);
      const ttlRaw = Number(payload?.clientCacheTtlMs || config.holidays.cacheTtlMs);
      const ttlMs = Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : HOLIDAY_CACHE_TTL_MS_DEFAULT;
      HOLIDAYS_BY_YEAR[yearText] = {
        data: holidayMap,
        expiresAt: Date.now() + ttlMs,
      };
      return holidayMap;
    } catch {
      HOLIDAYS_BY_YEAR[yearText] = {
        data: stale,
        expiresAt: staleRetryExpiresAt,
      };
      return stale;
    } finally {
      HOLIDAYS_REQUEST[yearText] = null;
    }
  })();

  HOLIDAYS_REQUEST[yearText] = promise;
  promise.catch(() => {
    const stale = HOLIDAYS_BY_YEAR[yearText]?.data || {};
    HOLIDAYS_BY_YEAR[yearText] = {
      data: stale,
      expiresAt: Date.now() + HOLIDAY_STALE_RETRY_MS,
    };
  });
  return promise;
}

function ensureHolidayDataForYear(year) {
  const yearText = String(year);
  if (HOLIDAYS_REQUEST[yearText]) {
    return HOLIDAYS_REQUEST[yearText];
  }

  const cached = HOLIDAYS_BY_YEAR[yearText];
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data || {});
  }

  const request = requestHolidayData(yearText);
  request.finally(() => {
    HOLIDAYS_REQUEST[yearText] = null;
  });
  return request;
}

function getWeekendType(date) {
  const weekday = date.getDay();
  if (weekday === 6) {
    return 'saturday';
  }
  if (weekday === 0) {
    return 'sunday';
  }
  return '';
}

function safeJsonParse(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function normalizeBucketId(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const normalized = raw.trim();
  if (!normalized) {
    return '';
  }
  return normalized;
}

function normalizeBucketIdOrDefault(raw, fallback = '') {
  const normalized = normalizeBucketId(raw);
  return buckets.includes(normalized) ? normalized : fallback;
}

function getBucketFieldValue(input, bucket) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  return Object.prototype.hasOwnProperty.call(input, bucket) ? input[bucket] : undefined;
}

function ensureDateInState() {
  if (!state.selectedDate) {
    state.selectedDate = toLocalIsoDate(new Date());
  }
}

function loadStateFromLocal() {
  const todos = safeJsonParse(TODO_STORAGE_KEY);
  const doneLog = safeJsonParse(DONE_STORAGE_KEY);
  const calendarItems = safeJsonParse(CALENDAR_STORAGE_KEY);
  const bucketLabels = safeJsonParse(BUCKET_LABELS_STORAGE_KEY);
  const bucketOrder = safeJsonParse(BUCKET_ORDER_STORAGE_KEY);
  const bucketVisibility = safeJsonParse(BUCKET_VISIBILITY_STORAGE_KEY);
  const projectLanes = safeJsonParse(PROJECT_LANES_STORAGE_KEY);
  const userProfile = safeJsonParse(USER_PROFILE_STORAGE_KEY);

  const normalizedTodos = normalizeTodos(Array.isArray(todos) ? todos : []);
  if (normalizedTodos.length === 0) {
    for (const key of LEGACY_TODO_KEYS) {
      const legacy = safeJsonParse(key);
      const legacyTodos = normalizeTodos(Array.isArray(legacy) ? legacy : []);
      if (legacyTodos.length > 0) {
        state.todos = legacyTodos;
        break;
      }
    }
  } else {
    state.todos = normalizedTodos;
  }

  state.doneLog = normalizeDoneLog(Array.isArray(doneLog) ? doneLog : []);
  state.calendarItems = normalizeCalendarItems(Array.isArray(calendarItems) ? calendarItems : []);
  state.bucketLabels = normalizeBucketLabels(bucketLabels);
  state.bucketOrder = normalizeBucketOrder(bucketOrder);
  state.bucketVisibility = normalizeBucketVisibility(bucketVisibility);
  state.projectLanes = normalizeProjectLanes(projectLanes);
  state.userProfile = normalizeUserProfile(userProfile);

  ensureDataIntegrity();
  ensureDateInState();
}

function normalizeTodos(todos) {
  return todos
    .filter((todo) => todo && (todo.title || typeof todo.title === 'string'))
    .map((todo) => ({
      id: todo.id || crypto.randomUUID(),
      title: String(todo.title || '').trim(),
      details: normalizeTodoDetails(todo.details || todo.description || ''),
      subtasks: normalizeTodoSubtasks(todo.subtasks || todo.subTasks || []),
      memos: normalizeTodoMemos(todo.memos || todo.notes || []),
      projectLaneId: typeof todo.projectLaneId === 'string' ? todo.projectLaneId : '',
      bucket: normalizeBucketIdOrDefault(todo.bucket, 'bucket4'),
      priority: Number(todo.priority || 2),
      dueDate: String(todo.dueDate || '').trim(),
      legacyCategoryId:
        typeof todo.categoryId === 'string' && todo.categoryId.trim() ? todo.categoryId.trim() : '',
      legacyCategory:
        typeof todo.category === 'string' && todo.category.trim() ? todo.category.trim() : '',
      createdAt: todo.createdAt || new Date().toISOString(),
    }))
    .filter((todo) => todo.title);
}

function normalizeBucketLabels(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return buckets.reduce((acc, bucket) => {
    const rawValue = getBucketFieldValue(source, bucket);
    const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
    const isBroken = raw && hasBrokenText(raw);
    if (isBroken) {
      showBrokenTextFilteredToast('버킷 이름', raw);
    }
    const safeLabel = raw && !isBroken ? raw : '';
    acc[bucket] = safeLabel || defaultBucketLabels[bucket] || bucket;
    return acc;
  }, {});
}

function normalizeBucketOrder(input = []) {
  const source = Array.isArray(input)
    ? input.map((bucket) => normalizeBucketId(bucket)).filter((bucket) => buckets.includes(bucket))
    : [];
  const unique = [...new Set(source)];
  const missing = buckets.filter((bucket) => !unique.includes(bucket));
  return [...unique, ...missing];
}

function normalizeBucketVisibility(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const visibility = buckets.reduce((acc, bucket) => {
    const value = getBucketFieldValue(source, bucket);
    acc[bucket] =
      typeof value === 'boolean'
        ? value
        : defaultBucketVisibility[bucket] !== false;
    return acc;
  }, {});

  if (!buckets.some((bucket) => visibility[bucket] !== false)) {
    visibility[buckets[0]] = true;
  }
  return visibility;
}

function normalizeProjectLaneName(raw) {
  const normalized = normalizeBucketLabel(raw).slice(0, 30);
  if (normalized && hasBrokenText(normalized)) {
    showBrokenTextFilteredToast('세부 프로젝트 이름', normalized);
    return '';
  }
  return normalized;
}

function normalizeProjectLanes(input = []) {
  const source = Array.isArray(input) ? input : [];
  const laneIds = new Set();
  const normalized = [];

  source.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const id =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : crypto.randomUUID();
    if (laneIds.has(id)) {
      return;
    }

    const name = normalizeProjectLaneName(item.name || '');
    if (!name) {
      return;
    }

    const bucket = normalizeBucketIdOrDefault(item.bucket, 'bucket2');
    const duplicateInBucket = normalized.some(
      (lane) => lane.bucket === bucket && lane.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicateInBucket) {
      return;
    }

    const width = Number(item.width || 0);
    const height = Number(item.height || 0);

    laneIds.add(id);
    normalized.push({
      id,
      name,
      bucket,
      width: Number.isFinite(width) && width >= 220 ? Math.round(width) : 0,
      height: Number.isFinite(height) && height >= 220 ? Math.round(height) : 0,
    });
  });

  return normalized;
}

function normalizeDoneLog(doneLog) {
  return doneLog
    .filter((item) => item && item.id && item.title)
    .map((item) => ({
      id: item.id,
      title: String(item.title || '').trim(),
      details: normalizeTodoDetails(item.details || item.description || ''),
      subtasks: normalizeTodoSubtasks(item.subtasks || item.subTasks || []),
      memos: normalizeTodoMemos(item.memos || item.notes || []),
      projectLaneId: typeof item.projectLaneId === 'string' ? item.projectLaneId : '',
      bucket: normalizeBucketIdOrDefault(item.bucket, 'bucket4'),
      priority: Number(item.priority || 2),
      dueDate: String(item.dueDate || ''),
      legacyCategoryId:
        typeof item.categoryId === 'string' && item.categoryId.trim() ? item.categoryId.trim() : '',
      legacyCategory:
        typeof item.category === 'string' && item.category.trim() ? item.category.trim() : '',
      createdAt: item.createdAt || new Date().toISOString(),
      completedAt: item.completedAt || new Date().toISOString(),
    }))
    .filter((item) => item.title);
}

function normalizeCalendarItems(items) {
  return items
    .filter((item) => item && item.id && item.date && item.type && item.text)
    .map((item) => ({
      id: item.id,
      date: parseIsoDate(item.date),
      endDate: clampCalendarRangeEnd(item.date, item.endDate || item.date),
      type: item.type === 'note' ? 'note' : 'todo',
      text: String(item.text || '').trim(),
      createdAt: item.createdAt || new Date().toISOString(),
    }));
}

function normalizeUserProfile(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const nicknameRaw = typeof source.nickname === 'string' ? source.nickname.trim() : '';
  const honorificRaw = typeof source.honorific === 'string' ? source.honorific.trim() : '';
  const nickname = nicknameRaw.slice(0, 20);
  const honorific = (honorificRaw || defaultUserProfile.honorific).slice(0, 12);
  return {
    nickname,
    honorific: honorific || defaultUserProfile.honorific,
  };
}

function normalizeStateFromServer(payload) {
  return {
    todos: normalizeTodos(payload?.todos || []),
    doneLog: normalizeDoneLog(payload?.doneLog || []),
    calendarItems: normalizeCalendarItems(payload?.calendarItems || []),
    bucketLabels: normalizeBucketLabels(payload?.bucketLabels || {}),
    bucketOrder: normalizeBucketOrder(payload?.bucketOrder || []),
    bucketVisibility: normalizeBucketVisibility(payload?.bucketVisibility || {}),
    projectLanes: normalizeProjectLanes(payload?.projectLanes || []),
    userProfile: normalizeUserProfile(payload?.userProfile || {}),
    currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: state.selectedDate || toLocalIsoDate(new Date()),
    version: Number(payload?.version || 0),
  };
}

function applyServerStateSnapshot(payload, version, options = {}) {
  const { shouldRender = true, shouldPersist = true } = options;
  const merged = normalizeStateFromServer({ ...(payload || {}), version });

  state.todos = merged.todos;
  state.doneLog = merged.doneLog;
  state.calendarItems = merged.calendarItems;
  state.bucketLabels = normalizeBucketLabels(merged.bucketLabels);
  state.bucketOrder = normalizeBucketOrder(merged.bucketOrder);
  state.bucketVisibility = normalizeBucketVisibility(merged.bucketVisibility);
  state.projectLanes = normalizeProjectLanes(merged.projectLanes);
  state.userProfile = normalizeUserProfile(merged.userProfile || state.userProfile);
  state.version = Number(version || merged.version || state.version || 0);

  ensureDataIntegrity();
  runtime.localDirty = false;

  if (shouldPersist) {
    saveLocalState();
  }
  if (shouldRender) {
    render();
  }
}

function hasStoredData(payload) {
  const bucketLabels = payload?.bucketLabels || {};
  const bucketOrder = normalizeBucketOrder(payload?.bucketOrder || []);
  const bucketVisibility = normalizeBucketVisibility(payload?.bucketVisibility || {});
  const normalizedBucketLabels = normalizeBucketLabels(bucketLabels);
  const normalizedUserProfile = normalizeUserProfile(payload?.userProfile || {});
  const hasCustomBucketLabels = Object.keys(defaultBucketLabels).some(
    (bucket) => normalizedBucketLabels[bucket] && normalizedBucketLabels[bucket] !== defaultBucketLabels[bucket],
  );
  const hasCustomBucketOrder = bucketOrder.some((bucket, index) => bucket !== buckets[index]);
  const hasCustomBucketVisibility = buckets.some((bucket) => bucketVisibility[bucket] !== defaultBucketVisibility[bucket]);
  const hasProjectLanes = Array.isArray(payload?.projectLanes) && payload.projectLanes.length > 0;
  const hasCustomUserProfile =
    (normalizedUserProfile.nickname && normalizedUserProfile.nickname !== '') ||
    (normalizedUserProfile.honorific &&
      normalizedUserProfile.honorific !== defaultUserProfile.honorific &&
      normalizedUserProfile.honorific !== '');

  return (
    (Array.isArray(payload.todos) && payload.todos.length > 0) ||
    (Array.isArray(payload.doneLog) && payload.doneLog.length > 0) ||
    (Array.isArray(payload.calendarItems) && payload.calendarItems.length > 0) ||
    hasCustomBucketLabels ||
    hasCustomBucketOrder ||
    hasCustomBucketVisibility ||
    hasProjectLanes ||
    hasCustomUserProfile
  );
}

function saveLocalState() {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state.todos));
  localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(state.doneLog));
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(state.calendarItems));
  localStorage.setItem(BUCKET_LABELS_STORAGE_KEY, JSON.stringify(state.bucketLabels));
  localStorage.setItem(BUCKET_ORDER_STORAGE_KEY, JSON.stringify(state.bucketOrder));
  localStorage.setItem(BUCKET_VISIBILITY_STORAGE_KEY, JSON.stringify(state.bucketVisibility));
  localStorage.setItem(PROJECT_LANES_STORAGE_KEY, JSON.stringify(state.projectLanes));
  localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(state.userProfile));
}

function ensureDataIntegrity() {
  ensureProjectLaneIntegrity();
}

function getProjectLanesByBucket(bucket) {
  return state.projectLanes.filter((lane) => lane.bucket === bucket);
}

function ensureProjectLaneIntegrity() {
  state.projectLanes = normalizeProjectLanes(state.projectLanes);
  const laneIds = new Set(state.projectLanes.map((lane) => lane.id));
  const laneById = new Map(state.projectLanes.map((lane) => [lane.id, lane]));
  const laneNameByBucket = new Map();
  state.projectLanes.forEach((lane) => {
    laneNameByBucket.set(`${lane.bucket}:${String(lane.name).toLowerCase()}`, lane.id);
  });

  const resolveLaneId = (entry) => {
    const current = typeof entry.projectLaneId === 'string' ? entry.projectLaneId : '';
    if (current && laneIds.has(current)) {
      const lane = laneById.get(current);
      if (lane && lane.bucket === entry.bucket) {
        return current;
      }
    }

    const legacyCandidates = [
      entry.legacyCategoryId,
      entry.legacyCategory,
      entry.categoryId,
      entry.category,
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);

    for (const legacyValue of legacyCandidates) {
      if (laneIds.has(legacyValue)) {
        const lane = laneById.get(legacyValue);
        if (lane && lane.bucket === entry.bucket) {
          return lane.id;
        }
      }

      const laneId = laneNameByBucket.get(`${entry.bucket}:${legacyValue.toLowerCase()}`);
      if (laneId && laneIds.has(laneId)) {
        return laneId;
      }
    }
    return '';
  };

  const mapLane = (entry) => {
    const bucket = normalizeBucketIdOrDefault(entry?.bucket);
    if (!bucket) {
      return '';
    }
    return resolveLaneId({ ...entry, bucket });
  };

  state.todos = state.todos.map((todo) => {
    const mappedLane = mapLane(todo);
    const {
      legacyCategoryId,
      legacyCategory,
      categoryId,
      category,
      ...rest
    } = todo;
    return {
      ...rest,
      projectLaneId: mappedLane,
    };
  });

  state.doneLog = state.doneLog.map((item) => {
    const mappedLane = mapLane(item);
    const {
      legacyCategoryId,
      legacyCategory,
      categoryId,
      category,
      ...rest
    } = item;
    return {
      ...rest,
      projectLaneId: mappedLane,
    };
  });
}

function addProjectLane(rawName, bucket = 'bucket2') {
  if (!buckets.includes(bucket)) {
    return false;
  }
  const name = normalizeProjectLaneName(rawName);
  if (!name) {
    return false;
  }

  const duplicated = state.projectLanes.some(
    (lane) => lane.bucket === bucket && lane.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicated) {
    return false;
  }

  state.projectLanes.push({
    id: crypto.randomUUID(),
    name,
    bucket,
    width: 0,
    height: 0,
  });
  ensureProjectLaneIntegrity();
  return true;
}

function getProjectLaneName(projectLaneId) {
  const lane = state.projectLanes.find((item) => item.id === projectLaneId);
  return lane ? lane.name : '';
}

function getTodoGroupLabel(todo) {
  if (!todo) {
    return '';
  }
  const bucket = getBucketLabel(normalizeBucketIdOrDefault(todo.bucket, 'bucket4'));
  const lane = getProjectLaneName(todo.projectLaneId || '');
  return lane ? `${bucket}/${lane}` : `${bucket}/unassigned`;
}

function getActiveBucketCount() {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  return buckets.filter((bucket) => visibility[bucket] !== false).length;
}

function setBucketCount(targetCount) {
  const count = Math.max(1, Math.min(buckets.length, Number(targetCount) || 1));
  const order = normalizeBucketOrder(state.bucketOrder);
  const nextVisibility = normalizeBucketVisibility(state.bucketVisibility);
  const activeBuckets = order.slice(0, count);
  const activeSet = new Set(activeBuckets);
  const fallback = activeBuckets[0] || order[0] || buckets[0];

  buckets.forEach((bucket) => {
    nextVisibility[bucket] = activeSet.has(bucket);
  });
  state.bucketVisibility = nextVisibility;

  state.todos = state.todos.map((todo) => {
    if (activeSet.has(todo.bucket)) {
      return todo;
    }
    return {
      ...todo,
      bucket: fallback,
      projectLaneId: '',
    };
  });

  ensureProjectLaneIntegrity();
}

function removeBucket(bucket) {
  if (!buckets.includes(bucket)) {
    return false;
  }

  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  const active = buckets.filter((key) => visibility[key] !== false);
  if (!active.includes(bucket)) {
    return false;
  }
  if (active.length <= 1) {
    return false;
  }

  visibility[bucket] = false;
  state.bucketVisibility = visibility;
  return true;
}

function addNextHiddenBucket() {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  const order = normalizeBucketOrder(state.bucketOrder);
  const hidden = order.find((bucket) => visibility[bucket] === false);
  if (!hidden) {
    return '';
  }

  visibility[hidden] = true;
  state.bucketVisibility = visibility;
  return hidden;
}

function createBucketColumn(bucket) {
  const article = document.createElement('article');
  article.className = 'card column';
  article.dataset.bucket = bucket;

  const head = document.createElement('div');
  head.className = 'column-head';

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'column-drag-handle';
  dragHandle.setAttribute('aria-label', '버킷 이동');
  dragHandle.textContent = '↕';
  head.appendChild(dragHandle);

  const title = document.createElement('h2');
  title.id = `bucket-title-${bucket}`;
  title.className = 'bucket-title';
  title.setAttribute('contenteditable', 'true');
  title.setAttribute('role', 'textbox');
  title.dataset.bucket = bucket;
  title.textContent = getBucketLabel(bucket);
  head.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'column-head-actions';

  const count = document.createElement('span');
  count.className = 'count';
  count.id = `count-${bucket}`;
  count.textContent = '0';
  actions.appendChild(count);

  head.appendChild(actions);
  article.appendChild(head);

  const list = document.createElement('ul');
  list.id = `list-${bucket}`;
  list.className = 'todo-list';
  article.appendChild(list);

  return article;
}

function ensureBucketColumns() {
  if (!boardEl) {
    return;
  }
  buckets.forEach((bucket) => {
    const exists = boardEl.querySelector(`.column[data-bucket="${bucket}"]`);
    if (exists) {
      return;
    }
    boardEl.appendChild(createBucketColumn(bucket));
  });
}

function ensureBucketSelectOptions() {
  if (!bucketSelect) {
    return;
  }

  buckets.forEach((bucket) => {
    const exists = bucketSelect.querySelector(`option[value="${bucket}"]`);
    if (exists) {
      return;
    }
    const option = document.createElement('option');
    option.value = bucket;
    option.textContent = getBucketLabel(bucket);
    bucketSelect.appendChild(option);
  });
}

function getBucketLabel(bucket) {
  return state.bucketLabels?.[bucket] || defaultBucketLabels[bucket] || bucket;
}

function normalizeBucketLabel(raw) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyBucketLabels() {
  buckets.forEach((bucket) => {
    const label = getBucketLabel(bucket);
    const titleEl = document.getElementById(`bucket-title-${bucket}`);
    const optionEl = bucketSelect ? bucketSelect.querySelector(`option[value="${bucket}"]`) : null;

    if (titleEl) {
      titleEl.textContent = label;
    }
    if (optionEl) {
      optionEl.textContent = label;
    }
  });
}

function applyBucketOrder() {
  if (!boardEl) {
    return;
  }

  const order = normalizeBucketOrder(state.bucketOrder);
  state.bucketOrder = order;

  order.forEach((bucket, index) => {
    const column = boardEl.querySelector(`.column[data-bucket="${bucket}"]`);
    if (!column) {
      return;
    }

    boardEl.appendChild(column);
  });
}

function applyBucketVisibility() {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  if (!buckets.some((bucket) => visibility[bucket] !== false)) {
    visibility[normalizeBucketOrder(state.bucketOrder)[0] || buckets[0]] = true;
  }
  state.bucketVisibility = visibility;

  if (boardEl) {
    boardEl.style.removeProperty('--board-rows');
  }

  buckets.forEach((bucket) => {
    const visible = visibility[bucket] !== false;
    const column = boardEl ? boardEl.querySelector(`.column[data-bucket="${bucket}"]`) : null;
    const option = bucketSelect ? bucketSelect.querySelector(`option[value="${bucket}"]`) : null;

    if (column) {
      column.hidden = !visible;
    }

    if (option) {
      option.disabled = !visible;
      option.hidden = !visible;
    }
  });

  if (bucketSelect && bucketSelect.selectedOptions[0]?.disabled) {
    const firstVisible = buckets.find((bucket) => visibility[bucket] !== false) || 'bucket4';
    bucketSelect.value = firstVisible;
  }
}

function applyBucketSizes() {
  buckets.forEach((bucket) => {
    const column = boardEl ? boardEl.querySelector(`.column[data-bucket="${bucket}"]`) : null;
    if (!column) {
      return;
    }

    column.style.width = '';
    column.style.height = '';
  });
}

function applyProjectLaneSizes() {
  // 프로젝트 라인은 기존 프로젝트 칼럼 내부 섹션으로 렌더링되어 별도 크기 조절이 필요 없다.
}

function syncBucketOrderFromDom() {
  if (!boardEl) {
    return;
  }

  const columns = Array.from(boardEl.querySelectorAll('.column[data-bucket]'));
  const nextOrder = columns.map((column) => column.dataset.bucket).filter((bucket) => buckets.includes(bucket));

  state.bucketOrder = normalizeBucketOrder(nextOrder);
}

function registerBucketResizeObserver() {
  if (runtime.columnResizeObserver) {
    runtime.columnResizeObserver.disconnect();
    runtime.columnResizeObserver = null;
  }
}

function renderProjectLaneColumns() {
  if (!boardEl) {
    return;
  }

  boardEl.querySelectorAll('.column[data-project-lane-id]').forEach((column) => {
    if (runtime.columnResizeObserver) {
      runtime.columnResizeObserver.unobserve(column);
    }
    column.remove();
  });
}

function registerBucketDragControls() {
  if (!boardEl) {
    return;
  }

  let activeColumn = null;
  let activeHandle = null;
  let placeholderEl = null;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let rafPending = false;
  let onWindowMove = null;
  let onWindowEnd = null;

  const updateDrag = () => {
    rafPending = false;

    if (!activeColumn) {
      return;
    }

    activeColumn.style.left = `${Math.round(lastPointerX - pointerOffsetX)}px`;
    activeColumn.style.top = `${Math.round(lastPointerY - pointerOffsetY)}px`;

    const others = Array.from(
      boardEl.querySelectorAll('.column[data-bucket], .column[data-project-lane-id], .column-placeholder'),
    ).filter(
      (col) => col !== placeholderEl && !col.hidden,
    );
    const target = others.find(
      (col) => lastPointerX < col.getBoundingClientRect().left + col.getBoundingClientRect().width / 2,
    );

    if (target) {
      boardEl.insertBefore(placeholderEl, target);
    } else {
      boardEl.appendChild(placeholderEl);
    }
  };

  const onPointerMove = (event) => {
    if (!activeColumn) {
      return;
    }

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    if (!rafPending) {
      rafPending = true;
      window.requestAnimationFrame(updateDrag);
    }
  };

  const finishDrag = () => {
    if (!activeColumn) {
      return;
    }

    if (rafPending) {
      rafPending = false;
      updateDrag();
    }

    activeColumn.style.position = '';
    activeColumn.style.width = '';
    activeColumn.style.height = '';
    activeColumn.style.left = '';
    activeColumn.style.top = '';
    activeColumn.style.zIndex = '';
    activeColumn.style.pointerEvents = '';
    activeColumn.style.margin = '';
    activeColumn.classList.remove('is-dragging');

    if (placeholderEl && placeholderEl.parentNode) {
      placeholderEl.parentNode.insertBefore(activeColumn, placeholderEl);
      placeholderEl.remove();
    } else {
      boardEl.appendChild(activeColumn);
    }

    if (activeHandle) {
      activeHandle.classList.remove('is-grabbing');
    }

    if (onWindowMove) {
      window.removeEventListener('pointermove', onWindowMove);
    }
    if (onWindowEnd) {
      window.removeEventListener('pointerup', onWindowEnd);
      window.removeEventListener('pointercancel', onWindowEnd);
    }

    syncBucketOrderFromDom();
    applyBucketOrder();
    renderProjectLaneColumns();
    applyBucketSizes();
    applyProjectLaneSizes();
    applyBucketVisibility();
    queueSync();

    activeColumn = null;
    activeHandle = null;
    placeholderEl = null;
    pointerOffsetX = 0;
    pointerOffsetY = 0;
    lastPointerX = 0;
    lastPointerY = 0;
    rafPending = false;
    onWindowMove = null;
    onWindowEnd = null;
  };

  boardEl.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.column-drag-handle');
    if (!handle) {
      return;
    }

    const column = handle.closest('.column[data-bucket], .column[data-project-lane-id]');
    if (!column || column.hidden) {
      return;
    }

    event.preventDefault();

    const rect = column.getBoundingClientRect();
    activeColumn = column;
    activeHandle = handle;
    pointerOffsetX = event.clientX - rect.left;
    pointerOffsetY = event.clientY - rect.top;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    placeholderEl = document.createElement('div');
    placeholderEl.className = 'column-placeholder';
    placeholderEl.style.width = `${Math.round(rect.width)}px`;
    placeholderEl.style.height = `${Math.round(rect.height)}px`;
    boardEl.insertBefore(placeholderEl, column.nextSibling);

    activeColumn.classList.add('is-dragging');
    activeHandle.classList.add('is-grabbing');
    activeColumn.style.position = 'fixed';
    activeColumn.style.width = `${Math.round(rect.width)}px`;
    activeColumn.style.height = `${Math.round(rect.height)}px`;
    activeColumn.style.left = `${Math.round(rect.left)}px`;
    activeColumn.style.top = `${Math.round(rect.top)}px`;
    activeColumn.style.zIndex = '30';
    activeColumn.style.pointerEvents = 'none';
    activeColumn.style.margin = '0';
    document.body.appendChild(activeColumn);

    onWindowMove = onPointerMove;
    onWindowEnd = finishDrag;
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowEnd);
    window.addEventListener('pointercancel', onWindowEnd);
  });
}

function registerProjectColumnControls() {
  if (addProjectColumnBtn) {
    addProjectColumnBtn.setAttribute('aria-label', '버킷 추가');
    addProjectColumnBtn.setAttribute('aria-pressed', 'false');
    addProjectColumnBtn.addEventListener('click', () => {
      const bucket = addNextHiddenBucket();
      if (!bucket) {
        showToast('추가 가능한 버킷이 없습니다.', 'error');
        return;
      }

      addProjectColumnBtn.classList.add('is-active');
      addProjectColumnBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        addProjectColumnBtn.classList.remove('is-active');
        addProjectColumnBtn.setAttribute('aria-pressed', 'false');
      }, 120);

      showToast(`${getBucketLabel(bucket)} 버킷 추가됨`, 'success');
      render();
      queueSync();
    });
  }

  if (removeProjectColumnBtn) {
    removeProjectColumnBtn.setAttribute('aria-label', '버킷 제거');
    removeProjectColumnBtn.setAttribute('aria-pressed', 'false');
    removeProjectColumnBtn.addEventListener('click', () => {
      const visibility = normalizeBucketVisibility(state.bucketVisibility);
      const order = normalizeBucketOrder(state.bucketOrder);
      const active = order.filter((bucket) => visibility[bucket] !== false);
      const target = active[active.length - 1];
      if (!target || !removeBucket(target)) {
        showToast('최소 1개 버킷은 남아 있어야 합니다.', 'error');
        return;
      }

      removeProjectColumnBtn.classList.add('is-active');
      removeProjectColumnBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        removeProjectColumnBtn.classList.remove('is-active');
        removeProjectColumnBtn.setAttribute('aria-pressed', 'false');
      }, 120);

      showToast(`${getBucketLabel(target)} 버킷을 제거했습니다.`, 'success');
      render();
      queueSync();
    });
  }
}

function registerBucketLaneControls() {
  document.querySelectorAll('.column[data-bucket]').forEach((column) => {
    const bucket = column.dataset.bucket;
    const actions = column.querySelector('.column-head-actions');
    if (!bucket || !actions || actions.querySelector('.bucket-lane-add-btn')) {
      return;
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'column-remove-btn bucket-lane-add-btn bucket-header-action';
    addBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} 세부 추가`);
    addBtn.setAttribute('aria-expanded', 'false');
    addBtn.setAttribute('aria-pressed', 'false');
    addBtn.textContent = '+';
    const laneCreate = document.createElement('div');
    laneCreate.className = 'inline-lane-create hidden bucket-lane-create';
    const laneNameInput = document.createElement('input');
    laneNameInput.type = 'text';
    laneNameInput.maxLength = '30';
    laneNameInput.placeholder = '세부 프로젝트 이름';
    laneNameInput.setAttribute('aria-label', `${getBucketLabel(bucket)} 세부 프로젝트 이름`);
    const laneCreateBtn = document.createElement('button');
    laneCreateBtn.type = 'button';
    laneCreateBtn.className = 'column-remove-btn lane-create-submit-btn';
    laneCreateBtn.textContent = '추가';
    const laneCancelBtn = document.createElement('button');
    laneCancelBtn.type = 'button';
    laneCancelBtn.className = 'column-remove-btn lane-create-cancel-btn';
    laneCancelBtn.textContent = '×';
    laneCancelBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} 세부 프로젝트 취소`);
    laneCreate.append(laneNameInput, laneCreateBtn, laneCancelBtn);

    const showLaneCreate = () => {
      laneCreate.classList.remove('hidden');
      addBtn.classList.add('is-active');
      addBtn.textContent = '×';
      addBtn.setAttribute('aria-expanded', 'true');
      addBtn.setAttribute('aria-pressed', 'true');
      addBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} 세부 닫기`);
      laneNameInput.value = '';
      laneNameInput.focus();
    };
    const hideLaneCreate = () => {
      laneCreate.classList.add('hidden');
      addBtn.classList.remove('is-active');
      addBtn.textContent = '+';
      addBtn.setAttribute('aria-expanded', 'false');
      addBtn.setAttribute('aria-pressed', 'false');
      addBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} 세부 추가`);
      laneNameInput.value = '';
    };
    const submitLaneCreate = () => {
      if (!addProjectLane(laneNameInput.value, bucket)) {
        showToast('이름이 비어 있거나 이미 존재합니다.', 'error');
        laneNameInput.focus();
        return;
      }
      showToast(`${getBucketLabel(bucket)} 세부 추가됨`, 'success');
      hideLaneCreate();
      render();
      queueSync();
    };

    addBtn.addEventListener('click', () => {
      if (laneCreate.classList.contains('hidden')) {
        showLaneCreate();
      } else {
        hideLaneCreate();
      }
    });
    laneCreateBtn.addEventListener('click', submitLaneCreate);
    laneCancelBtn.addEventListener('click', hideLaneCreate);
    laneNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitLaneCreate();
      }
      if (event.key === 'Escape') {
        hideLaneCreate();
      }
    });
    actions.insertBefore(laneCreate, actions.firstChild);
    actions.insertBefore(addBtn, actions.firstChild);
  });
}

function closeBucketActionMenus({ restoreFocus = false } = {}) {
  document.querySelectorAll('.bucket-action-menu-list').forEach((menuList) => {
    menuList.hidden = true;
  });
  document.querySelectorAll('.bucket-action-menu-toggle').forEach((toggleBtn) => {
    toggleBtn.setAttribute('aria-expanded', 'false');
  });

  if (restoreFocus && runtime.activeBucketMenuButton?.focus) {
    runtime.activeBucketMenuButton.focus();
  }
  runtime.activeBucketMenuButton = null;
}

function registerBucketMenuHandlers() {
  if (runtime.bucketMenuHandlersRegistered || typeof document === 'undefined') {
    return;
  }

  runtime.bucketMenuHandlersRegistered = true;
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.closest('.bucket-action-menu')) {
      return;
    }
    closeBucketActionMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeBucketActionMenus({ restoreFocus: true });
    }
  });
}

function canRemoveBucketFromMenu(bucket) {
  const visibility = normalizeBucketVisibility(state.bucketVisibility);
  const active = buckets.filter((key) => visibility[key] !== false);
  return active.includes(bucket) && active.length > 1;
}

function ensureBucketActionMenu(column) {
  if (!column) {
    return;
  }

  const bucket = column.dataset.bucket || '';
  const actions = column.querySelector('.column-head-actions');
  if (!bucket || !actions) {
    return;
  }

  let menu = actions.querySelector('.bucket-action-menu');
  let toggleBtn = menu?.querySelector('.bucket-action-menu-toggle') || null;
  let menuList = menu?.querySelector('.bucket-action-menu-list') || null;

  if (!menu || !toggleBtn || !menuList) {
    menu = document.createElement('div');
    menu.className = 'bucket-action-menu';

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ghost-btn bucket-action-menu-toggle';
    toggleBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} 액션 메뉴`);
    toggleBtn.setAttribute('aria-haspopup', 'menu');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = '...';

    menuList = document.createElement('div');
    menuList.className = 'bucket-action-menu-list';
    menuList.setAttribute('role', 'menu');
    menuList.hidden = true;

    toggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = toggleBtn.getAttribute('aria-expanded') !== 'true';
      closeBucketActionMenus();
      if (!willOpen) {
        return;
      }
      toggleBtn.setAttribute('aria-expanded', 'true');
      menuList.hidden = false;
      runtime.activeBucketMenuButton = toggleBtn;
      const firstItem = menuList.querySelector('button:not([disabled])');
      firstItem?.focus?.();
    });

    menu.append(toggleBtn, menuList);
    actions.appendChild(menu);
  }

  const appendMenuItem = (label, onClick, disabled = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'bucket-action-menu-item';
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    item.disabled = Boolean(disabled);
    item.addEventListener('click', () => {
      closeBucketActionMenus({ restoreFocus: true });
      onClick();
    });
    menuList.appendChild(item);
  };

  menuList.innerHTML = '';
  const laneAddBtn = actions.querySelector('.bucket-lane-add-btn');
  if (laneAddBtn) {
    appendMenuItem('세부 추가', () => laneAddBtn.click(), laneAddBtn.disabled);
  }

  const shareToggleBtn = actions.querySelector('.bucket-share-toggle');
  if (shareToggleBtn) {
    const shareLabel = String(shareToggleBtn.textContent || '').trim() || '공유 설정';
    appendMenuItem(shareLabel, () => shareToggleBtn.click(), shareToggleBtn.disabled);
  }

  if (canRemoveBucketFromMenu(bucket)) {
    appendMenuItem('버킷 제거', () => {
      if (!removeBucket(bucket)) {
        showToast('최소 1개 버킷은 남아 있어야 합니다.', 'error');
        return;
      }
      showToast(`${getBucketLabel(bucket)} 버킷을 제거했습니다.`, 'success');
      render();
      queueSync();
    });
  }

  menu.hidden = menuList.children.length === 0;
  if (menu.hidden) {
    closeBucketActionMenus();
  }
}

function syncBucketActionMenus() {
  registerBucketMenuHandlers();
  document.querySelectorAll('.column[data-bucket]').forEach((column) => {
    ensureBucketActionMenu(column);
  });
}

function beginEditLaneName(lane, currentNameEl) {
  if (!currentNameEl || !lane) {
    return;
  }

  const originalText = String(lane.name || '');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = '30';
  input.className = 'project-lane-name-editor';
  input.value = originalText;
  input.setAttribute('aria-label', '세부 프로젝트 이름 편집');
  let committed = false;

  const restoreName = () => {
    const restored = document.createElement('strong');
    restored.textContent = lane.name;
    restored.className = 'project-lane-name';
    input.replaceWith(restored);
    return restored;
  };

  const commit = () => {
    const nextName = normalizeProjectLaneName(input.value);
    if (!nextName) {
      showToast('이름이 비어 있거나 길이가 너무 깁니다.', 'error');
      restoreName();
      return;
    }

    const duplicated = state.projectLanes.some(
      (item) =>
        item.id !== lane.id &&
        item.bucket === lane.bucket &&
        item.name.toLowerCase() === nextName.toLowerCase(),
    );

    if (duplicated) {
      showToast('이미 존재하는 이름입니다.', 'error');
      input.focus();
      input.select();
      return;
    }

    if (nextName === lane.name) {
      committed = true;
      restoreName();
      return;
    }

    lane.name = nextName;
    ensureProjectLaneIntegrity();
    committed = true;
    render();
    queueSync();
    showToast('세부 프로젝트 이름을 변경했습니다.', 'success');
  };

  input.addEventListener('blur', () => {
    if (!committed) {
      commit();
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Escape') {
      committed = true;
      input.blur();
      restoreName();
    }
  });

  currentNameEl.replaceWith(input);
  input.focus();
  input.select();
}

function renderProjectLaneOptions(selectEl, todo) {
  if (!selectEl) {
    return;
  }

  const bucket = todo?.bucket || 'bucket4';
  const lanes = state.projectLanes.filter((lane) => lane.bucket === bucket);
  selectEl.innerHTML = '';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '미지정';
  if (!todo.projectLaneId) {
    emptyOption.selected = true;
  }
  selectEl.appendChild(emptyOption);

  lanes.forEach((lane) => {
    const option = document.createElement('option');
    option.value = lane.id;
    option.textContent = lane.name;
    if (lane.id === (todo.projectLaneId || '')) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });

  selectEl.disabled = false;
}

function removeProjectLane(laneId) {
  const target = state.projectLanes.find((lane) => lane.id === laneId);
  if (!target) {
    return false;
  }
  state.projectLanes = state.projectLanes.filter((lane) => lane.id !== laneId);
  state.todos = state.todos.map((todo) => (todo.projectLaneId === laneId ? { ...todo, projectLaneId: '' } : todo));
  state.doneLog = state.doneLog.map((todo) => (todo.projectLaneId === laneId ? { ...todo, projectLaneId: '' } : todo));
  return true;
}

function renderProjectLaneGroups(listEl, todos, bucket) {
  const lanes = state.projectLanes.filter((lane) => lane.bucket === bucket);
  const grouped = new Map(lanes.map((lane) => [lane.id, []]));
  const unassigned = [];

  todos.forEach((todo) => {
    if (todo.projectLaneId && grouped.has(todo.projectLaneId)) {
      grouped.get(todo.projectLaneId).push(todo);
      return;
    }
    unassigned.push(todo);
  });

  lanes.forEach((lane) => {
    const section = document.createElement('li');
    section.className = 'project-lane-group';

    const head = document.createElement('div');
    head.className = 'project-lane-head';

    const name = document.createElement('strong');
    name.textContent = lane.name;
    head.appendChild(name);

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(grouped.get(lane.id).length);
    head.appendChild(count);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'column-remove-btn';
    renameBtn.textContent = '이름';
    renameBtn.addEventListener('click', () => {
      beginEditLaneName(lane, name);
    });
    head.appendChild(renameBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'column-remove-btn';
    deleteBtn.textContent = '제거';
    deleteBtn.addEventListener('click', () => {
      removeProjectLane(lane.id);
      ensureProjectLaneIntegrity();
      showToast('세부 프로젝트를 제거했습니다.', 'success');
      render();
      queueSync();
    });
    head.appendChild(deleteBtn);

    section.appendChild(head);

    const nested = document.createElement('ul');
    nested.className = 'todo-list';
    renderTodoItems(nested, sortTodos(grouped.get(lane.id)));
    section.appendChild(nested);
    listEl.appendChild(section);
  });

  if (unassigned.length > 0 || lanes.length === 0) {
    const section = document.createElement('li');
    section.className = 'project-lane-group';

  const head = document.createElement('div');
  head.className = 'project-lane-head';

  const name = document.createElement('strong');
  name.textContent = lanes.length === 0 ? getBucketLabel(bucket) : '미지정';
  head.appendChild(name);

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(unassigned.length);
    head.appendChild(count);

    section.appendChild(head);

    const nested = document.createElement('ul');
    nested.className = 'todo-list';
    renderTodoItems(nested, sortTodos(unassigned));
    section.appendChild(nested);
    listEl.appendChild(section);
  }
}

function buildTodoMetaText(todo) {
  const dateText = todo.dueDate ? ` / 마감일 ${todo.dueDate}` : '';
  const projectText = ` / 프로젝트 ${getProjectLaneName(todo.projectLaneId) || '미지정'}`;
  const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : [];
  if (subtasks.length === 0) {
    return `우선순위: ${priorityLabel[todo.priority] || '없음'}${dateText}${projectText}`;
  }
  const doneCount = subtasks.filter((entry) => entry.done).length;
  return `우선순위: ${priorityLabel[todo.priority] || '없음'}${dateText}${projectText} / 세부 ${doneCount}/${subtasks.length}`;
}

function renderTodoSubtaskList(listEl, todo, onUpdate) {
  if (!listEl || !todo) {
    return;
  }

  const subtasks = normalizeTodoSubtasks(todo.subtasks || []);
  todo.subtasks = subtasks;
  listEl.innerHTML = '';

  if (subtasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'todo-inline-empty';
    empty.textContent = '세부 할 일을 추가해 보세요.';
    listEl.appendChild(empty);
    return;
  }

  subtasks.forEach((subtask) => {
    const li = document.createElement('li');
    li.className = 'todo-subtask-item';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'todo-subtask-toggle';
    toggleBtn.textContent = subtask.done ? '완료' : '진행';
    toggleBtn.setAttribute('aria-pressed', String(Boolean(subtask.done)));
    toggleBtn.setAttribute(
      'aria-label',
      subtask.done ? '세부 할 일을 미완료로 변경' : '세부 할 일을 완료로 변경',
    );
    toggleBtn.addEventListener('click', () => {
      subtask.done = !subtask.done;
      renderTodoSubtaskList(listEl, todo, onUpdate);
      if (onUpdate) {
        onUpdate();
      }
      queueSync();
    });

    const text = document.createElement('span');
    text.className = 'todo-subtask-text';
    if (subtask.done) {
      text.classList.add('is-done');
    }
    text.textContent = subtask.text;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'todo-mini-delete';
    removeBtn.textContent = '삭제';
    removeBtn.setAttribute('aria-label', '세부 할 일 삭제');
    removeBtn.addEventListener('click', () => {
      todo.subtasks = subtasks.filter((entry) => entry.id !== subtask.id);
      renderTodoSubtaskList(listEl, todo, onUpdate);
      if (onUpdate) {
        onUpdate();
      }
      queueSync();
    });

    li.append(toggleBtn, text, removeBtn);
    listEl.appendChild(li);
  });
}

function bindTodoSubtaskComposer(inputEl, addBtn, listEl, todo, onUpdate) {
  if (!inputEl || !addBtn || !listEl || !todo) {
    return;
  }

  const submit = () => {
    const text = normalizeTodoSubtaskText(inputEl.value);
    if (!text) {
      return;
    }

    todo.subtasks = normalizeTodoSubtasks([
      {
        id: crypto.randomUUID(),
        text,
        done: false,
        createdAt: new Date().toISOString(),
      },
      ...(todo.subtasks || []),
    ]);
    inputEl.value = '';
    renderTodoSubtaskList(listEl, todo, onUpdate);
    if (onUpdate) {
      onUpdate();
    }
    queueSync();
    inputEl.focus();
  };

  addBtn.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
}

function renderTodoMemoList(listEl, todo) {
  if (!listEl || !todo) {
    return;
  }

  const memos = normalizeTodoMemos(todo.memos || []);
  todo.memos = memos;
  listEl.innerHTML = '';

  if (memos.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'todo-inline-empty';
    empty.textContent = '메모를 추가해 보세요.';
    listEl.appendChild(empty);
    return;
  }

  memos.forEach((memo) => {
    const li = document.createElement('li');
    li.className = 'todo-memo-item';

    const body = document.createElement('div');
    body.className = 'todo-memo-body';
    body.appendChild(createSelectedNoteTextNode(memo.text));

    const createdAtText = memo.createdAt ? formatDisplayDateTime(memo.createdAt) : '';
    if (createdAtText) {
      const date = document.createElement('span');
      date.className = 'todo-memo-date';
      date.textContent = createdAtText;
      body.appendChild(date);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'todo-mini-delete';
    removeBtn.textContent = '삭제';
    removeBtn.setAttribute('aria-label', '메모 삭제');
    removeBtn.addEventListener('click', () => {
      todo.memos = memos.filter((entry) => entry.id !== memo.id);
      renderTodoMemoList(listEl, todo);
      queueSync();
    });

    li.append(body, removeBtn);
    listEl.appendChild(li);
  });
}

function bindTodoMemoComposer(inputEl, addBtn, listEl, todo) {
  if (!inputEl || !addBtn || !listEl || !todo) {
    return;
  }

  const submit = () => {
    const text = normalizeTodoMemoText(inputEl.value);
    if (!text) {
      return;
    }

    todo.memos = normalizeTodoMemos([
      {
        id: crypto.randomUUID(),
        text,
        createdAt: new Date().toISOString(),
      },
      ...(todo.memos || []),
    ]);
    inputEl.value = '';
    renderTodoMemoList(listEl, todo);
    queueSync();
    inputEl.focus();
  };

  addBtn.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
}

function renderTodoItems(listEl, todos) {
  todos.forEach((todo) => {
    const item = todoTemplate.content.firstElementChild.cloneNode(true);
    const titleEl = item.querySelector('.title');
    const metaEl = item.querySelector('.meta');
    const detailsEl = item.querySelector('.todo-detail-input');
    const subtaskInputEl = item.querySelector('.todo-subtask-input');
    const subtaskAddBtn = item.querySelector('.todo-subtask-add');
    const subtaskListEl = item.querySelector('.todo-subtask-list');
    const memoInputEl = item.querySelector('.todo-memo-input');
    const memoAddBtn = item.querySelector('.todo-memo-add');
    const memoListEl = item.querySelector('.todo-memo-list');
    const completeBtn = item.querySelector('.complete');
    const deleteBtn = item.querySelector('.delete');
    const projectSelect = item.querySelector('.todo-project-lane-select');

    todo.subtasks = normalizeTodoSubtasks(todo.subtasks || []);
    todo.memos = normalizeTodoMemos(todo.memos || []);

    titleEl.textContent = todo.title;
    const updateMeta = () => {
      metaEl.textContent = buildTodoMetaText(todo);
    };
    updateMeta();

    bindTodoDetailsInput(detailsEl, todo);
    renderTodoSubtaskList(subtaskListEl, todo, updateMeta);
    bindTodoSubtaskComposer(subtaskInputEl, subtaskAddBtn, subtaskListEl, todo, updateMeta);
    renderTodoMemoList(memoListEl, todo);
    bindTodoMemoComposer(memoInputEl, memoAddBtn, memoListEl, todo);

    renderProjectLaneOptions(projectSelect, todo);
    projectSelect.addEventListener('change', () => {
      todo.projectLaneId = projectSelect.value;
      updateMeta();
      render();
      queueSync();
    });

    completeBtn.addEventListener('click', () => {
      state.doneLog.unshift({
        id: todo.id,
        title: todo.title,
        details: todo.details || '',
        subtasks: normalizeTodoSubtasks(todo.subtasks || []),
        memos: normalizeTodoMemos(todo.memos || []),
        projectLaneId: todo.projectLaneId || '',
        bucket: todo.bucket,
        priority: todo.priority,
        dueDate: todo.dueDate || '',
        createdAt: todo.createdAt,
        completedAt: new Date().toISOString(),
      });
      state.todos = state.todos.filter((t) => t.id !== todo.id);
      render();
      queueSync();
    });

    deleteBtn.addEventListener('click', () => {
      state.todos = state.todos.filter((t) => t.id !== todo.id);
      render();
      queueSync();
    });

    listEl.appendChild(item);
  });
}

function registerBucketTitleEditors() {
  const titleEls = document.querySelectorAll('.bucket-title');
  titleEls.forEach((titleEl) => {
    const bucket = titleEl.dataset.bucket;
    if (!bucket || !buckets.includes(bucket)) {
      return;
    }

    titleEl.addEventListener('blur', () => {
      const label = normalizeBucketLabel(titleEl.textContent);
      const current = getBucketLabel(bucket);
      const nextLabel = label || defaultBucketLabels[bucket] || bucket;

      if (nextLabel === current) {
        return;
      }

      state.bucketLabels[bucket] = nextLabel;
      applyBucketLabels();
      queueSync();
    });

    titleEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        titleEl.blur();
      }
    });
  });
}

function sortTodos(list) {
  return [...list].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function normalizeTodoSubtaskText(raw) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalizeTodoMemoText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 1200);
}

function normalizeTodoSubtasks(subtasks) {
  const source = Array.isArray(subtasks) ? subtasks : [];
  return source
    .map((item) => {
      if (typeof item === 'string') {
        const text = normalizeTodoSubtaskText(item);
        if (!text) {
          return null;
        }
        return {
          id: crypto.randomUUID(),
          text,
          done: false,
          createdAt: new Date().toISOString(),
        };
      }
      if (!item || typeof item !== 'object') {
        return null;
      }

      const text = normalizeTodoSubtaskText(item.text || item.title || '');
      if (!text) {
        return null;
      }

      return {
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : crypto.randomUUID(),
        text,
        done: Boolean(item.done || item.completed),
        createdAt: item.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function normalizeTodoMemos(memos) {
  const source = Array.isArray(memos) ? memos : [];
  return source
    .map((item) => {
      if (typeof item === 'string') {
        const text = normalizeTodoMemoText(item);
        if (!text) {
          return null;
        }
        return {
          id: crypto.randomUUID(),
          text,
          createdAt: new Date().toISOString(),
        };
      }
      if (!item || typeof item !== 'object') {
        return null;
      }

      const text = normalizeTodoMemoText(item.text || item.content || item.memo || '');
      if (!text) {
        return null;
      }

      return {
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : crypto.randomUUID(),
        text,
        createdAt: item.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function normalizeTodoDetails(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .slice(0, 1200);
}

function createTodo({
  title,
  details = '',
  subtasks = [],
  memos = [],
  projectLaneId = '',
  bucket = 'bucket4',
  priority = 2,
  dueDate = '',
}) {
  return {
    id: crypto.randomUUID(),
    title,
    details: normalizeTodoDetails(details),
    subtasks: normalizeTodoSubtasks(subtasks),
    memos: normalizeTodoMemos(memos),
    projectLaneId,
    bucket,
    priority: Number(priority),
    dueDate: dueDate || '',
    createdAt: new Date().toISOString(),
  };
}

function createCalendarItem(date, type, text, endDate = date) {
  const start = parseIsoDate(date);
  const safeEndDate = clampCalendarRangeEnd(start, endDate);
  return {
    id: crypto.randomUUID(),
    date: start,
    endDate: safeEndDate,
    type,
    text,
    createdAt: new Date().toISOString(),
  };
}

function formatToday() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  dateEl.textContent = fmt.format(now);
}

function ensureToastHost() {
  if (runtime.toastHostEl && document.body.contains(runtime.toastHostEl)) {
    return runtime.toastHostEl;
  }

  runtime.toastHostEl = document.getElementById('toastHost');
  if (!runtime.toastHostEl) {
    runtime.toastHostEl = document.createElement('div');
    runtime.toastHostEl.id = 'toastHost';
    runtime.toastHostEl.className = 'toast-host';
    document.body.appendChild(runtime.toastHostEl);
  }

  return runtime.toastHostEl;
}

function showToast(message, type = 'info') {
  const host = ensureToastHost();
  if (!host || !message) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = String(message);
  host.appendChild(toast);

  window.requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, 2200);
}

function extractErrorDetail(error) {
  if (!error) {
    return '';
  }
  if (error instanceof Error) {
    return error.stack || error.message || '';
  }
  return String(error);
}

function dismissFatalErrorScreen({ restoreFocus = false } = {}) {
  const overlay = runtime.fatalErrorOverlayEl;
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  runtime.fatalErrorOverlayEl = null;
  runtime.fatalErrorShown = false;

  if (restoreFocus && typeof document !== 'undefined') {
    const fallbackFocus = document.querySelector('.topbar button, .app-tabs button');
    fallbackFocus?.focus?.();
  }
}

function renderFatalErrorScreen(error) {
  if (runtime.fatalErrorShown || typeof document === 'undefined' || !document.body) {
    return;
  }

  const details = extractErrorDetail(error);
  const isDev = Boolean(import.meta?.env?.DEV);

  runtime.fatalErrorShown = true;
  const overlay = document.createElement('section');
  overlay.className = 'fatal-error-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'fatal-error-card';

  const title = document.createElement('h2');
  title.className = 'fatal-error-title';
  title.textContent = '앱 오류가 발생했습니다';

  const description = document.createElement('p');
  description.className = 'fatal-error-description';
  description.textContent = '화면을 복구하지 못했습니다. 다시 시도하거나 새로고침해 주세요.';

  const actions = document.createElement('div');
  actions.className = 'fatal-error-actions';

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'ghost-btn';
  retryBtn.textContent = '다시 시도';
  retryBtn.addEventListener('click', () => {
    dismissFatalErrorScreen();
    render();
  });

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.className = 'project-add-btn';
  reloadBtn.textContent = '새로고침';
  reloadBtn.addEventListener('click', () => {
    window.location.reload();
  });

  actions.append(retryBtn, reloadBtn);
  card.append(title, description);

  if (isDev && details) {
    const stack = document.createElement('pre');
    stack.className = 'fatal-error-stack';
    stack.textContent = details;
    card.appendChild(stack);
  }

  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  runtime.fatalErrorOverlayEl = overlay;
  retryBtn.focus();
}

function handleFatalError(error) {
  console.error('[fatal]', error);
  renderFatalErrorScreen(error);
}

function shouldIgnoreGlobalError(error) {
  const detail = extractErrorDetail(error);
  const message =
    (error && typeof error === 'object' && 'message' in error ? String(error.message || '') : '') || detail;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name || '') : '';

  if (name === 'ApiRequestError' || name === 'AbortError') {
    return true;
  }
  if (!message) {
    return false;
  }
  if (message.includes('ResizeObserver loop limit exceeded')) {
    return true;
  }
  if (message.includes('ResizeObserver loop completed with undelivered notifications')) {
    return true;
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return true;
  }
  if (message.includes('Loading chunk') && message.includes('failed')) {
    return true;
  }
  return false;
}

function registerGlobalErrorBoundary() {
  if (runtime.globalErrorHandlersRegistered || typeof window === 'undefined') {
    return;
  }

  runtime.globalErrorHandlersRegistered = true;
  window.addEventListener('error', (event) => {
    const error = event?.error || new Error(String(event?.message || 'window_error'));
    if (shouldIgnoreGlobalError(error)) {
      return;
    }
    handleFatalError(error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason || new Error('unhandled_rejection');
    if (shouldIgnoreGlobalError(reason)) {
      return;
    }
    handleFatalError(reason);
  });
}

function showApiErrorToast(message) {
  const text = String(message || '').trim();
  if (!text) {
    return;
  }
  const now = Date.now();
  if (text === runtime.lastApiErrorToastKey && now - runtime.lastApiErrorToastAt < API_ERROR_TOAST_COOLDOWN_MS) {
    return;
  }
  runtime.lastApiErrorToastKey = text;
  runtime.lastApiErrorToastAt = now;
  showToast(text, 'error');
}

function createApiRequestError(path, response, payload = null) {
  return createCoreApiRequestError(path, response, payload);
}

function markStateDirty() {
  saveLocalState();

  if (!runtime.isServerSync) {
    return;
  }

  if (runtime.syncTimer) {
    clearTimeout(runtime.syncTimer);
  }
  runtime.syncTimer = setTimeout(() => {
    runtime.syncTimer = null;
    syncState().catch(() => {});
  }, SYNC_DEBOUNCE_MS);
}

function hasPendingLocalChanges() {
  return runtime.localDirty || runtime.syncing || runtime.pendingSync || Boolean(runtime.syncTimer);
}

async function apiRequest(path, options = {}) {
  return performApiRequest({
    baseUrl: API_BASE,
    path,
    options,
    onErrorToast: showApiErrorToast,
    createError: createApiRequestError,
  });
}

function mergeBucketDefaultsFromMeta(metaPayload = {}) {
  const metaKeys = Array.isArray(metaPayload.bucketKeys)
    ? metaPayload.bucketKeys.map((key) => String(key || '').trim()).filter(Boolean)
    : [];
  const nextKeys = metaKeys.length > 0 ? [...new Set(metaKeys)] : [...buckets];
  if (nextKeys.length === 0) {
    return;
  }

  const nextLabels = nextKeys.reduce((acc, key, index) => {
    const fromMeta = typeof metaPayload.defaultBucketLabels?.[key] === 'string'
      ? String(metaPayload.defaultBucketLabels[key]).trim()
      : '';
    acc[key] = fromMeta || `버킷 ${index + 1}`;
    return acc;
  }, {});

  const nextVisibility = nextKeys.reduce((acc, key, index) => {
    const fromMeta = metaPayload.defaultBucketVisibility?.[key];
    acc[key] = typeof fromMeta === 'boolean' ? fromMeta : index < 4;
    return acc;
  }, {});

  buckets.splice(0, buckets.length, ...nextKeys);
  Object.keys(defaultBucketLabels).forEach((key) => {
    delete defaultBucketLabels[key];
  });
  Object.entries(nextLabels).forEach(([key, value]) => {
    defaultBucketLabels[key] = value;
  });
  Object.keys(defaultBucketVisibility).forEach((key) => {
    delete defaultBucketVisibility[key];
  });
  Object.entries(nextVisibility).forEach(([key, value]) => {
    defaultBucketVisibility[key] = value;
  });
}

function applyRuntimeMeta(metaPayload = {}) {
  mergeBucketDefaultsFromMeta(metaPayload);

  const poll = metaPayload?.poll || {};
  const holidays = metaPayload?.holidays || {};
  const nextStateActive = Number(poll.stateActiveMs || config.poll.stateActiveMs);
  const nextStateHidden = Number(poll.stateHiddenMs || config.poll.stateHiddenMs);
  const nextCollabActive = Number(poll.collabActiveMs || config.poll.collabActiveMs);
  const nextCollabHidden = Number(poll.collabHiddenMs || config.poll.collabHiddenMs);
  const nextHolidayTtl = Number(holidays.clientCacheTtlMs || config.holidays.cacheTtlMs);

  config.poll.stateActiveMs = Number.isFinite(nextStateActive) && nextStateActive > 0
    ? nextStateActive
    : STATE_POLL_ACTIVE_INTERVAL_MS_DEFAULT;
  config.poll.stateHiddenMs = Number.isFinite(nextStateHidden) && nextStateHidden > 0
    ? nextStateHidden
    : STATE_POLL_HIDDEN_INTERVAL_MS_DEFAULT;
  config.poll.collabActiveMs = Number.isFinite(nextCollabActive) && nextCollabActive > 0
    ? nextCollabActive
    : COLLAB_POLL_ACTIVE_INTERVAL_MS_DEFAULT;
  config.poll.collabHiddenMs = Number.isFinite(nextCollabHidden) && nextCollabHidden > 0
    ? nextCollabHidden
    : COLLAB_POLL_HIDDEN_INTERVAL_MS_DEFAULT;
  config.holidays.cacheTtlMs = Number.isFinite(nextHolidayTtl) && nextHolidayTtl > 0
    ? nextHolidayTtl
    : HOLIDAY_CACHE_TTL_MS_DEFAULT;
  config.metaLoaded = true;

  if (runtime.isServerSync && runtime.authUser) {
    startStatePolling();
    syncCollabPolling();
  }
}

async function loadRuntimeMeta() {
  try {
    const response = await apiRequest('/meta', {
      method: 'GET',
      suppressErrorToast: true,
    });
    if (!response.ok) {
      return;
    }
    const payload = await safeReadJson(response);
    applyRuntimeMeta(payload || {});
  } catch {
    // offline fallback keeps local defaults
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift() || '';
  }
  return '';
}

function normalizePublicIdInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[\s-]+/g, '_');
}

function isValidPublicId(value) {
  return /^[a-z0-9_]{4,20}$/.test(String(value || ''));
}

function collabContextKey(ownerUserId, bucketKey) {
  return `${Number(ownerUserId)}:${String(bucketKey)}`;
}

function parseCollabContextKey(key) {
  const [ownerUserIdText, bucketKey] = String(key || '').split(':');
  const ownerUserId = Number(ownerUserIdText);
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0 || !bucketKey) {
    return null;
  }
  return {
    ownerUserId,
    bucketKey,
    key: collabContextKey(ownerUserId, bucketKey),
  };
}

function safeReadJson(response) {
  return response
    .json()
    .catch(() => ({}));
}

function resetCollabState() {
  runtime.collabProfile = {
    publicId: '',
    publicIdUpdatedAt: null,
  };
  runtime.collabSummary = null;
  runtime.collabShareSettingsByBucket = {};
  runtime.sharedTodosByContext = {};
  runtime.sharedCommentsByTodo = {};
  runtime.activeSharedContextByBucket = {};
  stopCollabPolling();
}

function normalizeCollabShareSettings(summaryPayload) {
  const normalized = buckets.reduce((acc, bucket) => {
    acc[bucket] = false;
    return acc;
  }, {});

  const settings = Array.isArray(summaryPayload?.shareSettings) ? summaryPayload.shareSettings : [];
  settings.forEach((entry) => {
    const bucketKey = normalizeBucketIdOrDefault(entry?.bucketKey, '');
    if (!bucketKey) {
      return;
    }
    normalized[bucketKey] = Boolean(entry.enabled);
  });

  const owned = Array.isArray(summaryPayload?.ownedBuckets) ? summaryPayload.ownedBuckets : [];
  owned.forEach((entry) => {
    const bucketKey = normalizeBucketIdOrDefault(entry?.bucketKey, '');
    if (!bucketKey) {
      return;
    }
    if (entry.shareEnabled === true) {
      normalized[bucketKey] = true;
    }
  });

  return normalized;
}

function isBucketShareEnabled(bucket) {
  return Boolean(runtime.collabShareSettingsByBucket[bucket]);
}

function shouldShowSharedSection(bucket) {
  if (!runtime.isServerSync || !runtime.authUser || !runtime.collabSummary) {
    return false;
  }
  if (isBucketShareEnabled(bucket)) {
    return true;
  }
  return getCollabContextsForBucket(bucket).length > 0;
}

function pruneCollabCaches() {
  const validContextKeys = new Set();
  buckets.forEach((bucket) => {
    getCollabContextsForBucket(bucket).forEach((context) => {
      validContextKeys.add(context.key);
    });
  });

  Object.keys(runtime.sharedTodosByContext).forEach((key) => {
    if (!validContextKeys.has(key)) {
      delete runtime.sharedTodosByContext[key];
    }
  });

  Object.keys(runtime.activeSharedContextByBucket).forEach((bucket) => {
    const key = runtime.activeSharedContextByBucket[bucket];
    if (!validContextKeys.has(key)) {
      delete runtime.activeSharedContextByBucket[bucket];
    }
  });

  const validTodoIds = new Set();
  Object.values(runtime.sharedTodosByContext).forEach((todos) => {
    const list = Array.isArray(todos) ? todos : [];
    list.forEach((todo) => {
      if (todo?.id) {
        validTodoIds.add(String(todo.id));
      }
    });
  });
  Object.keys(runtime.sharedCommentsByTodo).forEach((todoId) => {
    if (!validTodoIds.has(todoId)) {
      delete runtime.sharedCommentsByTodo[todoId];
    }
  });
}

function ensureBucketShareToggle(bucket) {
  if (!boardEl) {
    return null;
  }
  const column = boardEl.querySelector(`.column[data-bucket="${bucket}"]`);
  const actions = column?.querySelector('.column-head-actions');
  if (!actions) {
    return null;
  }

  let button = actions.querySelector('.bucket-share-toggle');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost-btn bucket-share-toggle bucket-header-action';
    button.dataset.sharedAction = 'toggle-share-setting';
    button.dataset.bucket = bucket;
    actions.appendChild(button);
  }

  const enabled = isBucketShareEnabled(bucket);
  const ready = runtime.isServerSync && !!runtime.authUser && !!runtime.collabSummary;
  button.disabled = !ready;
  button.textContent = enabled ? '공유 ON' : '공유 시작';
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  return button;
}

function getCollabContextsForBucket(bucket) {
  const contexts = [];
  const seen = new Set();
  if (!runtime.collabSummary) {
    return contexts;
  }

  const owned = Array.isArray(runtime.collabSummary.ownedBuckets) ? runtime.collabSummary.ownedBuckets : [];
  owned.forEach((entry) => {
    if (!entry || entry.bucketKey !== bucket) {
      return;
    }
    const hasMembers = Array.isArray(entry.members) && entry.members.length > 0;
    const hasPendingInvites = Array.isArray(entry.pendingInvites) && entry.pendingInvites.length > 0;
    const shareEnabled = entry.shareEnabled === true || isBucketShareEnabled(bucket) || hasMembers || hasPendingInvites;
    if (!shareEnabled) {
      return;
    }
    const key = collabContextKey(entry.ownerUserId, entry.bucketKey);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    contexts.push({
      key,
      ownerUserId: Number(entry.ownerUserId),
      bucketKey: entry.bucketKey,
      source: 'owned',
      label: `내 공유 (${getBucketLabel(entry.bucketKey)})`,
    });
  });

  const joined = Array.isArray(runtime.collabSummary.joinedBuckets) ? runtime.collabSummary.joinedBuckets : [];
  joined.forEach((entry) => {
    if (!entry || entry.bucketKey !== bucket) {
      return;
    }
    const key = collabContextKey(entry.ownerUserId, entry.bucketKey);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const ownerPublicId = entry.owner?.publicId ? `@${entry.owner.publicId}` : `USER-${entry.ownerUserId}`;
    contexts.push({
      key,
      ownerUserId: Number(entry.ownerUserId),
      bucketKey: entry.bucketKey,
      source: 'joined',
      label: `${ownerPublicId} 공유`,
    });
  });

  if (runtime.isServerSync && runtime.authUser && isBucketShareEnabled(bucket)) {
    const ownerKey = collabContextKey(Number(runtime.authUser.id), bucket);
    if (!seen.has(ownerKey)) {
      contexts.unshift({
        key: ownerKey,
        ownerUserId: Number(runtime.authUser.id),
        bucketKey: bucket,
        source: 'owned',
        label: `내 공유 (${getBucketLabel(bucket)})`,
      });
    }
  }

  return contexts;
}

function ensureActiveSharedContext(bucket) {
  const contexts = getCollabContextsForBucket(bucket);
  if (contexts.length === 0) {
    delete runtime.activeSharedContextByBucket[bucket];
    return null;
  }

  const activeKey = runtime.activeSharedContextByBucket[bucket];
  const active = contexts.find((entry) => entry.key === activeKey) || contexts[0];
  runtime.activeSharedContextByBucket[bucket] = active.key;
  return active;
}

function getSharedTodoById(todoId) {
  const targetId = String(todoId || '');
  if (!targetId) {
    return null;
  }

  for (const [contextKey, todos] of Object.entries(runtime.sharedTodosByContext)) {
    const list = Array.isArray(todos) ? todos : [];
    const todo = list.find((item) => item && item.id === targetId);
    if (todo) {
      return {
        contextKey,
        todo,
      };
    }
  }
  return null;
}

async function collabApiRequest(path, options = {}, { withCsrf = false, retryOnCsrf = true } = {}) {
  const headers = {
    ...(options.headers || {}),
  };
  if (withCsrf) {
    headers['x-csrf-token'] = getCookie('daycheck_csrf') || '';
  }

  const response = await apiRequest(path, {
    ...options,
    headers,
    allowHttpStatus: [401, 403, 404, 409, 429],
    suppressErrorToast: true,
  });

  if (response.status === 401) {
    applyAuthState(null);
    updateAuthUI();
    render();
  }

  if (withCsrf && retryOnCsrf && response.status === 403) {
    const payload = await safeReadJson(response.clone());
    if (payload?.error === 'invalid_csrf_token') {
      await checkAuth();
      if (runtime.isServerSync && runtime.authUser) {
        return collabApiRequest(path, options, { withCsrf, retryOnCsrf: false });
      }
    }
  }

  return response;
}

function applyCollabSnapshotPayload(payload = {}) {
  const summary = payload?.summary || null;
  runtime.collabSummary = summary;
  runtime.collabShareSettingsByBucket = normalizeCollabShareSettings(summary);

  const profile = summary?.profile || {};
  runtime.collabProfile = {
    publicId: normalizePublicIdInput(profile.publicId || runtime.authUser?.publicId || ''),
    publicIdUpdatedAt: profile.publicIdUpdatedAt || null,
  };

  const todosByContextRaw =
    payload?.todosByContext && typeof payload.todosByContext === 'object' ? payload.todosByContext : {};
  runtime.sharedTodosByContext = Object.entries(todosByContextRaw).reduce((acc, [key, todos]) => {
    acc[key] = Array.isArray(todos) ? todos : [];
    return acc;
  }, {});

  const commentsByTodoRaw =
    payload?.commentsByTodo && typeof payload.commentsByTodo === 'object' ? payload.commentsByTodo : {};
  Object.entries(commentsByTodoRaw).forEach(([todoId, comments]) => {
    runtime.sharedCommentsByTodo[String(todoId)] = Array.isArray(comments) ? comments : [];
  });

  pruneCollabCaches();
}

function buildSnapshotCommentTodoQuery(commentTodoIds = []) {
  const normalized = Array.isArray(commentTodoIds)
    ? [...new Set(commentTodoIds.map((todoId) => String(todoId || '').trim()).filter(Boolean))].slice(0, 40)
    : [];
  if (normalized.length === 0) {
    return '';
  }
  return `?commentTodoIds=${encodeURIComponent(normalized.join(','))}`;
}

async function refreshCollabSnapshot({ commentTodoIds = [] } = {}) {
  if (!runtime.isServerSync || !runtime.authUser) {
    resetCollabState();
    return null;
  }

  const query = buildSnapshotCommentTodoQuery(commentTodoIds);
  const response = await collabApiRequest(`/collab/snapshot${query}`, { method: 'GET' });
  if (!response.ok) {
    return null;
  }

  const payload = await safeReadJson(response);
  applyCollabSnapshotPayload(payload);
  return runtime.collabSummary;
}

async function refreshCollabSummary({ includeTodos = true, commentTodoIds = [] } = {}) {
  if (!includeTodos) {
    return refreshCollabSnapshot({ commentTodoIds });
  }
  return refreshCollabSnapshot({ commentTodoIds });
}

async function refreshSharedComments(todoId) {
  const targetId = String(todoId || '');
  if (!targetId || !runtime.isServerSync || !runtime.authUser) {
    return [];
  }

  await refreshCollabSnapshot({ commentTodoIds: [targetId] });
  const comments = runtime.sharedCommentsByTodo[targetId];
  return Array.isArray(comments) ? comments : [];
}

function stopCollabPolling() {
  if (runtime.collabPollTimer) {
    clearInterval(runtime.collabPollTimer);
    runtime.collabPollTimer = null;
  }
  runtime.collabPollIntervalMs = 0;
  runtime.collabPollInFlight = false;
}

function getCollabPollIntervalMs() {
  if (typeof document !== 'undefined' && document.hidden) {
    return config.poll.collabHiddenMs;
  }
  return config.poll.collabActiveMs;
}

async function pollCollabData() {
  if (!runtime.isServerSync || !runtime.authUser || runtime.currentRoute !== 'buckets' || runtime.collabPollInFlight) {
    return;
  }

  runtime.collabPollInFlight = true;
  try {
    await refreshCollabSnapshot();
    render();
  } catch {
    // Keep local snapshot and retry on next poll.
  } finally {
    runtime.collabPollInFlight = false;
  }
}

function startCollabPolling() {
  if (!runtime.isServerSync || !runtime.authUser || runtime.currentRoute !== 'buckets') {
    stopCollabPolling();
    return;
  }

  const nextInterval = getCollabPollIntervalMs();
  if (runtime.collabPollTimer && runtime.collabPollIntervalMs !== nextInterval) {
    clearInterval(runtime.collabPollTimer);
    runtime.collabPollTimer = null;
  }
  if (!runtime.collabPollTimer) {
    runtime.collabPollIntervalMs = nextInterval;
    runtime.collabPollTimer = setInterval(() => {
      pollCollabData().catch(() => {});
    }, nextInterval);
  }
  pollCollabData().catch(() => {});
}

function syncCollabPolling() {
  if (!runtime.isServerSync || !runtime.authUser || runtime.currentRoute !== 'buckets') {
    stopCollabPolling();
    return;
  }
  startCollabPolling();
}

async function savePublicIdToServer(inputPublicId) {
  const publicId = normalizePublicIdInput(inputPublicId);
  if (!isValidPublicId(publicId)) {
    showToast('고유ID는 4~20자, 소문자/숫자/_만 가능합니다.', 'error');
    return false;
  }

  const response = await collabApiRequest(
    '/collab/public-id',
    {
      method: 'PUT',
      body: JSON.stringify({ publicId }),
    },
    { withCsrf: true },
  );

  if (response.status === 409) {
    showToast('이미 사용 중인 고유ID입니다.', 'error');
    return false;
  }
  if (!response.ok) {
    const payload = await safeReadJson(response);
    if (response.status === 401) {
      showToast('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'error');
      return false;
    }
    if (payload?.error === 'invalid_csrf_token') {
      showToast('보안 토큰이 갱신되었습니다. 다시 저장해 주세요.', 'error');
      return false;
    }
    if (payload?.error === 'invalid_payload') {
      showToast('고유ID 형식을 확인해 주세요. (4~20자, 소문자/숫자/_)', 'error');
      return false;
    }
    if (response.status === 404 || payload?.error === 'not_found') {
      showToast('사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요.', 'error');
      return false;
    }
    if (response.status >= 500 || payload?.error === 'internal_server_error') {
      showToast('서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      return false;
    }
    showToast('고유ID 저장에 실패했습니다.', 'error');
    return false;
  }

  const payload = await safeReadJson(response);
  const profile = payload?.profile || {};
  runtime.collabProfile.publicId = normalizePublicIdInput(profile.publicId || publicId);
  runtime.collabProfile.publicIdUpdatedAt = profile.publicIdUpdatedAt || runtime.collabProfile.publicIdUpdatedAt;
  if (runtime.authUser) {
    runtime.authUser.publicId = runtime.collabProfile.publicId;
  }
  return true;
}

function getProfileDisplayName() {
  const profile = normalizeUserProfile(state.userProfile);
  if (profile.nickname) {
    return `${profile.nickname}${profile.honorific}`;
  }
  if (runtime.isServerSync && runtime.authUser) {
    const fallback = runtime.authUser.nickname || runtime.authUser.email || '';
    return fallback ? `${fallback}${profile.honorific}` : '';
  }
  return '';
}

function updateProfileAliasUI() {
  if (!userAliasPreviewEl) {
    return;
  }
  const label = getProfileDisplayName();
  userAliasPreviewEl.textContent = label || '호칭 미설정';
}

function applyAuthState(me) {
  if (!me || !me.authenticated) {
    runtime.isServerSync = false;
    runtime.authUser = null;
    state.version = 0;
    runtime.localDirty = false;
    stopStatePolling();
    resetCollabState();
    return;
  }

  runtime.isServerSync = true;
  runtime.authUser = me.user;
  runtime.collabProfile = {
    publicId: normalizePublicIdInput(me.user?.publicId || ''),
    publicIdUpdatedAt: null,
  };
  runtime.collabShareSettingsByBucket = {};
  startStatePolling();
  syncCollabPolling();
}

function updateAuthUI() {
  if (!authStatusEl || !authBtn) {
    return;
  }

  updateProfileAliasUI();
  if (runtime.isServerSync && runtime.authUser) {
    const label = runtime.authUser.nickname || runtime.authUser.email || `kakao-${runtime.authUser.kakaoId || ''}`;
    authStatusEl.textContent = `로그인 상태: ${label}`;
    authBtn.innerHTML = '<span>로그아웃</span>';
    if (profilePublicIdInput) {
      profilePublicIdInput.disabled = false;
      profilePublicIdInput.value = normalizePublicIdInput(runtime.collabProfile.publicId || runtime.authUser.publicId || '');
    }
    if (profilePublicIdHint) {
      profilePublicIdHint.textContent = '형식: a-z, 0-9, _ / 4~20자 ( @, -, 공백은 자동 변환 )';
    }
  } else {
    authStatusEl.textContent = '로그인 필요';
    authBtn.innerHTML = '<span class="kakao-logo" aria-hidden="true">K</span><span>카카오 로그인</span>';
    if (profilePublicIdInput) {
      profilePublicIdInput.disabled = true;
      profilePublicIdInput.value = '';
    }
    if (profilePublicIdHint) {
      profilePublicIdHint.textContent = '로그인 후 설정할 수 있습니다.';
    }
  }
}

async function checkAuth() {
  try {
    const response = await apiRequest('/auth/me', {
      method: 'GET',
      allowHttpStatus: [401],
      suppressErrorToast: true,
    });
    if (response.status === 401) {
      applyAuthState(null);
      return;
    }
    const me = await response.json();
    applyAuthState(me);
  } catch (error) {
    applyAuthState(null);
  }
}

async function loadServerState() {
  try {
    const response = await apiRequest('/state', {
      method: 'GET',
      allowHttpStatus: [401],
      suppressErrorToast: true,
    });
    if (response.status === 401) {
      return null;
    }

    const data = await response.json();
    return {
      state: data.state || {},
      hasData: !!data.hasData,
      exists: !!data.exists,
      version: Number(data.version || 0),
    };
  } catch {
    return null;
  }
}

async function pollServerState() {
  if (!runtime.isServerSync || !runtime.authUser || runtime.statePollInFlight) {
    return;
  }
  if (hasPendingLocalChanges()) {
    return;
  }

  runtime.statePollInFlight = true;
  try {
    const response = await apiRequest('/state', {
      method: 'GET',
      allowHttpStatus: [401],
      suppressErrorToast: true,
    });
    if (response.status === 401) {
      applyAuthState(null);
      updateAuthUI();
      return;
    }

    const data = await response.json();
    const remoteVersion = Number(data.version || 0);
    if (remoteVersion <= Number(state.version || 0)) {
      return;
    }
    if (hasPendingLocalChanges()) {
      return;
    }

    applyServerStateSnapshot(data.state || {}, remoteVersion);
  } catch {
    // Keep current state and try again on next polling tick.
  } finally {
    runtime.statePollInFlight = false;
  }
}

function stopStatePolling() {
  if (runtime.statePollTimer) {
    clearInterval(runtime.statePollTimer);
    runtime.statePollTimer = null;
  }
  runtime.statePollIntervalMs = 0;
  runtime.statePollInFlight = false;
}

function getStatePollIntervalMs() {
  if (typeof document !== 'undefined' && document.hidden) {
    return config.poll.stateHiddenMs;
  }
  return config.poll.stateActiveMs;
}

function startStatePolling() {
  if (!runtime.isServerSync || !runtime.authUser) {
    stopStatePolling();
    return;
  }

  const nextInterval = getStatePollIntervalMs();
  if (runtime.statePollTimer && runtime.statePollIntervalMs !== nextInterval) {
    clearInterval(runtime.statePollTimer);
    runtime.statePollTimer = null;
  }
  if (!runtime.statePollTimer) {
    runtime.statePollIntervalMs = nextInterval;
    runtime.statePollTimer = setInterval(() => {
      pollServerState().catch(() => {});
    }, nextInterval);
  }
  pollServerState().catch(() => {});
}

function registerStatePollingEvents() {
  if (runtime.statePollingEventsRegistered || typeof window === 'undefined') {
    return;
  }

  runtime.statePollingEventsRegistered = true;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      startStatePolling();
      syncCollabPolling();
      if (!document.hidden) {
        pollServerState().catch(() => {});
        pollCollabData().catch(() => {});
      }
    });
  }
  window.addEventListener('focus', () => {
    startStatePolling();
    syncCollabPolling();
    pollServerState().catch(() => {});
    pollCollabData().catch(() => {});
  });
  window.addEventListener('online', () => {
    startStatePolling();
    syncCollabPolling();
    pollServerState().catch(() => {});
    pollCollabData().catch(() => {});
  });
}

function snapshotSyncStatePayload() {
  return {
    todos: state.todos,
    doneLog: state.doneLog,
    calendarItems: state.calendarItems,
    bucketLabels: state.bucketLabels,
    bucketOrder: state.bucketOrder,
    bucketVisibility: state.bucketVisibility,
    projectLanes: state.projectLanes,
    userProfile: state.userProfile,
    version: state.version,
  };
}

function backupConflictSnapshot(remotePayload = {}) {
  try {
    const backup = {
      at: new Date().toISOString(),
      local: snapshotSyncStatePayload(),
      remote: {
        state: remotePayload?.state || {},
        version: Number(remotePayload?.version || 0),
        updatedAt: remotePayload?.updatedAt || null,
      },
    };
    localStorage.setItem(CONFLICT_BACKUP_STORAGE_KEY, JSON.stringify(backup));
  } catch {
    // ignore localStorage failures
  }
}

function handleVersionConflict(payload = {}) {
  const remoteVersion = Number(payload?.version || 0);
  const remoteState = payload?.state || {};
  backupConflictSnapshot(payload);

  const canPrompt = typeof window !== 'undefined' && typeof window.confirm === 'function';
  if (!canPrompt) {
    applyServerStateSnapshot(remoteState, remoteVersion);
    return;
  }

  const keepLocal = window.confirm(
    '버전 충돌이 발생했습니다.\n확인: 내 변경 유지 후 다시 저장\n취소: 서버 최신 상태 적용',
  );

  if (keepLocal) {
    if (remoteVersion > 0) {
      state.version = remoteVersion;
    }
    runtime.localDirty = true;
    queueSync(true);
    showToast('내 변경을 유지하고 다시 저장을 시도합니다.', 'error');
    return;
  }

  applyServerStateSnapshot(remoteState, remoteVersion);
  showToast('서버 최신 상태를 적용했습니다.', 'info');
}

async function syncState() {
  if (!runtime.isServerSync || !runtime.authUser || runtime.syncing) {
    return;
  }

  const syncPayload = snapshotSyncStatePayload();
  runtime.syncing = true;
  try {
    const response = await apiRequest('/state', {
      method: 'PUT',
      allowHttpStatus: [401, 409],
      suppressErrorToast: true,
      headers: {
        'x-csrf-token': getCookie('daycheck_csrf') || '',
      },
      body: JSON.stringify(syncPayload),
    });

    if (response.status === 401) {
      applyAuthState(null);
      updateAuthUI();
      return;
    }
    if (response.status === 409) {
      const data = await safeReadJson(response);
      handleVersionConflict(data);
      return;
    }

    const result = await response.json();
    state.version = Number(result.version || state.version);
    runtime.localDirty = false;
  } catch {
    // Keep local data and retry on next edit.
  } finally {
    runtime.syncing = false;
  }

  if (runtime.pendingSync) {
    runtime.pendingSync = false;
    syncState().catch(() => {});
  }
}

function queueSync(immediate = false) {
  saveLocalState();

  if (!runtime.isServerSync) {
    return;
  }

  runtime.localDirty = true;

  if (runtime.syncing) {
    runtime.pendingSync = true;
    return;
  }

  if (immediate) {
    if (runtime.syncTimer) {
      clearTimeout(runtime.syncTimer);
      runtime.syncTimer = null;
    }
    syncState().catch(() => {});
    return;
  }

  markStateDirty();
}

function updateRouteTabs(route) {
  routeLinkEls.forEach((linkEl) => {
    const linkRoute = String(linkEl.dataset.routeLink || '');
    const isActive = linkRoute === route;
    linkEl.classList.toggle('is-active', isActive);
    if (isActive) {
      linkEl.setAttribute('aria-current', 'page');
    } else {
      linkEl.removeAttribute('aria-current');
    }
  });
}

function focusRouteHeading(route) {
  const activeView = routeViewEls.find((viewEl) => viewEl.dataset.routeView === route);
  if (!activeView) {
    return;
  }
  const heading = activeView.querySelector('h1, h2');
  if (!heading) {
    return;
  }
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

function animateRouteView(route, direction = 'none') {
  if (!routeOutletEl) {
    return;
  }
  const activeView = routeViewEls.find((viewEl) => viewEl.dataset.routeView === route);
  if (!activeView) {
    return;
  }

  if (runtime.routeTransitionTimer) {
    clearTimeout(runtime.routeTransitionTimer);
    runtime.routeTransitionTimer = null;
  }

  routeViewEls.forEach((viewEl) => {
    viewEl.classList.remove('is-entering-forward', 'is-entering-backward');
  });

  if (direction === 'forward') {
    activeView.classList.add('is-entering-forward');
  } else if (direction === 'backward') {
    activeView.classList.add('is-entering-backward');
  }

  runtime.routeTransitionTimer = setTimeout(() => {
    routeViewEls.forEach((viewEl) => {
      viewEl.classList.remove('is-entering-forward', 'is-entering-backward');
    });
    runtime.routeTransitionTimer = null;
  }, 190);
}

function activateRoute(route, direction = 'none') {
  runtime.currentRoute = APP_ROUTES.includes(route) ? route : 'home';
  syncCollabPolling();

  routeViewEls.forEach((viewEl) => {
    const isActive = viewEl.dataset.routeView === runtime.currentRoute;
    viewEl.hidden = !isActive;
    viewEl.classList.toggle('is-active', isActive);
  });

  updateRouteTabs(runtime.currentRoute);
  animateRouteView(runtime.currentRoute, direction);
  focusRouteHeading(runtime.currentRoute);
}

function renderRoute(route) {
  if (route !== 'buckets') {
    closeBucketActionMenus();
  }
  switch (route) {
    case 'buckets':
      renderTodosByBucket();
      break;
    case 'calendar':
      renderCalendar();
      renderSelectedDatePanel();
      break;
    case 'report':
      renderWeeklyReport();
      break;
    case 'home':
    default:
      renderTodoList();
      break;
  }
}

function render() {
  if (runtime.fatalErrorShown) {
    return;
  }

  try {
    ensureBucketColumns();
    ensureBucketSelectOptions();
    applyBucketOrder();
    renderProjectLaneColumns();
    applyBucketSizes();
    applyProjectLaneSizes();
    applyBucketVisibility();
    applyBucketLabels();
    renderRoute(runtime.currentRoute);
    renderCollabPanel();

    const activeModule = runtime.routeModules[runtime.currentRoute];
    if (activeModule?.render) {
      activeModule.render(state);
    }
    if (runtime.authView?.render) {
      runtime.authView.render({
        isServerSync: runtime.isServerSync,
        authUser: runtime.authUser,
      });
    }

    updateProfileAliasUI();
  } catch (error) {
    handleFatalError(error);
  }
}

function renderWeeklyReport() {
  if (!weekRangeEl || !weeklyDoneCountEl || !weeklyDoneListEl || !weeklyPendingCountEl || !weeklyPendingListEl) {
    return;
  }

  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());
  const weekStartText = toLocalIsoDate(weekStart);
  const weekEndText = toLocalIsoDate(weekEnd);

  weekRangeEl.textContent = `${weekStartText} ~ ${weekEndText}`;

  const weeklyDone = state.doneLog
    .filter((item) => inCurrentWeek(item.completedAt))
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const weeklyPending = sortTodos(state.todos);

  weeklyDoneCountEl.textContent = `${weeklyDone.length}개`;
  weeklyPendingCountEl.textContent = `${weeklyPending.length}개`;
  weeklyDoneListEl.innerHTML = '';
  weeklyPendingListEl.innerHTML = '';

  if (weeklyDone.length === 0) {
    addEmptyMessage(weeklyDoneListEl, '이번 주 완료된 항목이 없습니다.');
  } else {
    weeklyDone.forEach((item) => {
      const li = document.createElement('li');
      const dueDateText = item.dueDate ? ` / 마감 ${formatDisplayDate(item.dueDate)}` : '';
      li.textContent = `[${getTodoGroupLabel(item)}] ${item.title} (${formatDisplayDateTime(item.completedAt)}${dueDateText})`;
      weeklyDoneListEl.appendChild(li);
    });
  }

  if (weeklyPending.length === 0) {
    addEmptyMessage(weeklyPendingListEl, '남아 있는 항목이 없습니다.');
  } else {
    weeklyPending.forEach((item) => {
      const li = document.createElement('li');
      const dueDateText = item.dueDate ? ` / 마감 ${formatDisplayDate(item.dueDate)}` : '';
      li.textContent = `[${getTodoGroupLabel(item)}] ${item.title}${dueDateText}`;
      weeklyPendingListEl.appendChild(li);
    });
  }
}

function bindTodoDetailsInput(detailInput, todo) {
  if (!detailInput) {
    return;
  }

  detailInput.value = todo.details || '';
  detailInput.addEventListener('blur', () => {
    const next = normalizeTodoDetails(detailInput.value);
    if ((todo.details || '') === next) {
      return;
    }
    todo.details = next;
    queueSync();
  });
}

function getTodayActiveNoteEntries() {
  const today = toLocalIsoDate(new Date());
  return state.calendarItems
    .filter((item) => item.type === 'note' && isDateInCalendarRange(today, item.date, item.endDate || item.date))
    .sort((a, b) => {
      const aIsLong = (a.endDate || a.date) > a.date;
      const bIsLong = (b.endDate || b.date) > b.date;
      if (aIsLong !== bIsLong) {
        return aIsLong ? -1 : 1;
      }
      if (a.date !== b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function renderTodayNoteHighlights(listEl, notes) {
  notes.forEach((note) => {
    const item = document.createElement('li');
    item.className = 'todo-item todo-item-note';

    const main = document.createElement('div');
    main.className = 'todo-main';

    const title = createSelectedNoteTextNode(`오늘 메모 · ${note.text}`);
    title.classList.add('todo-note-title');

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = note.date === note.endDate
      ? `일정일: ${note.date}`
      : `장기 일정: ${note.date} ~ ${note.endDate}`;

    main.append(title, meta);

    const controls = document.createElement('div');
    controls.className = 'todo-controls';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const focusBtn = document.createElement('button');
    focusBtn.type = 'button';
    focusBtn.className = 'complete';
    focusBtn.textContent = '캘린더';
    focusBtn.addEventListener('click', () => {
      state.selectedDate = note.date;
      const monthDate = new Date(note.date);
      state.currentMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      render();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', () => {
      state.calendarItems = state.calendarItems.filter((entry) => entry.id !== note.id);
      render();
      queueSync();
    });

    actions.append(focusBtn, deleteBtn);
    controls.appendChild(actions);

    item.append(main, controls);
    listEl.appendChild(item);
  });
}

function ensureSharedSection(bucket) {
  if (!boardEl) {
    return null;
  }
  const column = boardEl.querySelector(`.column[data-bucket="${bucket}"]`);
  if (!column) {
    return null;
  }

  let section = column.querySelector('.shared-todo-section');
  if (section) {
    section.dataset.bucket = bucket;
    return section;
  }

  section = document.createElement('section');
  section.className = 'shared-todo-section';
  section.dataset.bucket = bucket;

  const head = document.createElement('div');
  head.className = 'shared-todo-head';

  const title = document.createElement('strong');
  title.textContent = '공유 작업';
  head.appendChild(title);

  const contextSelect = document.createElement('select');
  contextSelect.className = 'shared-context-select';
  contextSelect.setAttribute('aria-label', '공유 컨텍스트 선택');
  head.appendChild(contextSelect);
  section.appendChild(head);

  const composeForm = document.createElement('form');
  composeForm.className = 'shared-compose-form';
  composeForm.dataset.bucket = bucket;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'shared-compose-title';
  titleInput.maxLength = 120;
  titleInput.placeholder = '공유 작업 제목';
  titleInput.required = true;
  composeForm.appendChild(titleInput);

  const detailInput = document.createElement('textarea');
  detailInput.className = 'shared-compose-details';
  detailInput.rows = 2;
  detailInput.maxLength = 1200;
  detailInput.placeholder = '상세 내용';
  composeForm.appendChild(detailInput);

  const metaRow = document.createElement('div');
  metaRow.className = 'shared-compose-meta';

  const priority = document.createElement('select');
  priority.className = 'shared-compose-priority';
  priority.innerHTML = `
    <option value="1">높음</option>
    <option value="2" selected>보통</option>
    <option value="3">낮음</option>
  `;
  metaRow.appendChild(priority);

  const dueDate = document.createElement('input');
  dueDate.type = 'date';
  dueDate.className = 'shared-compose-due';
  dueDate.setAttribute('aria-label', '공유 작업 마감일');
  metaRow.appendChild(dueDate);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = '공유 추가';
  metaRow.appendChild(submitBtn);

  composeForm.appendChild(metaRow);
  section.appendChild(composeForm);

  const list = document.createElement('ul');
  list.className = 'todo-list shared-todo-list';
  section.appendChild(list);

  column.appendChild(section);
  return section;
}

function setSharedListEmpty(listEl, message) {
  if (!listEl) {
    return;
  }
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'todo-inline-empty';
  li.textContent = message;
  listEl.appendChild(li);
}

function getAuthorTag(author) {
  const publicId = normalizePublicIdInput(author?.publicId || '');
  if (publicId) {
    return `@${publicId}`;
  }
  return `USER-${author?.userId || '?'}`;
}

function getSharedTodoMetaText(todo) {
  const priority = priorityLabel[todo.priority] || '보통';
  const dueDateText = todo.dueDate ? ` / 마감 ${todo.dueDate}` : '';
  const doneText = todo.isDone ? ' / 완료' : '';
  return `우선순위 ${priority}${dueDateText}${doneText} / rev ${todo.revision}`;
}

function createSharedCommentItem(comment, context) {
  const li = document.createElement('li');
  li.className = 'shared-comment-item';
  li.dataset.commentId = comment.id;

  const body = document.createElement('div');
  body.className = 'shared-comment-body';

  const head = document.createElement('div');
  head.className = 'shared-comment-head';
  const author = document.createElement('span');
  author.className = 'shared-comment-author';
  author.textContent = getAuthorTag(comment.author);
  head.appendChild(author);

  if (comment.createdAt) {
    const created = document.createElement('span');
    created.className = 'shared-comment-date';
    created.textContent = formatDisplayDateTime(comment.createdAt);
    head.appendChild(created);
  }
  body.appendChild(head);

  const text = document.createElement('p');
  text.className = 'shared-comment-text';
  text.textContent = comment.body || '';
  body.appendChild(text);
  li.appendChild(body);

  const canDelete =
    Number(runtime.authUser?.id) === Number(comment.author?.userId) ||
    Number(runtime.authUser?.id) === Number(context.ownerUserId);
  if (canDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'todo-mini-delete';
    deleteBtn.textContent = '삭제';
    deleteBtn.dataset.sharedAction = 'delete-comment';
    deleteBtn.dataset.commentId = comment.id;
    li.appendChild(deleteBtn);
  }

  return li;
}

function renderSharedComments(listEl, todo, context) {
  if (!listEl) {
    return;
  }
  const comments = Array.isArray(runtime.sharedCommentsByTodo[todo.id]) ? runtime.sharedCommentsByTodo[todo.id] : [];
  listEl.innerHTML = '';
  if (comments.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'todo-inline-empty';
    empty.textContent = '의견이 없습니다.';
    listEl.appendChild(empty);
    return;
  }
  comments.forEach((comment) => {
    listEl.appendChild(createSharedCommentItem(comment, context));
  });
}

function createSharedTodoItem(todo, context) {
  const item = document.createElement('li');
  item.className = 'todo-item shared-todo-item';
  item.dataset.todoId = todo.id;
  item.dataset.contextKey = context.key;

  const main = document.createElement('div');
  main.className = 'todo-main';

  const markerRow = document.createElement('div');
  markerRow.className = 'shared-marker-row';
  const badge = document.createElement('span');
  badge.className = 'shared-badge';
  badge.textContent = '공유';
  markerRow.appendChild(badge);
  const author = document.createElement('span');
  author.className = 'shared-author';
  author.textContent = `작성자 ${getAuthorTag(todo.author)}`;
  markerRow.appendChild(author);
  main.appendChild(markerRow);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'shared-todo-title';
  titleInput.maxLength = 120;
  titleInput.value = todo.title || '';
  main.appendChild(titleInput);

  const detailsInput = document.createElement('textarea');
  detailsInput.className = 'shared-todo-details';
  detailsInput.rows = 2;
  detailsInput.maxLength = 1200;
  detailsInput.value = todo.details || '';
  main.appendChild(detailsInput);

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = getSharedTodoMetaText(todo);
  main.appendChild(meta);

  const controls = document.createElement('div');
  controls.className = 'todo-controls';

  const prioritySelect = document.createElement('select');
  prioritySelect.className = 'shared-todo-priority';
  prioritySelect.innerHTML = `
    <option value="1">높음</option>
    <option value="2">보통</option>
    <option value="3">낮음</option>
  `;
  prioritySelect.value = String(todo.priority || 2);
  controls.appendChild(prioritySelect);

  const dueDateInput = document.createElement('input');
  dueDateInput.type = 'date';
  dueDateInput.className = 'shared-todo-due';
  dueDateInput.value = todo.dueDate || '';
  controls.appendChild(dueDateInput);

  const actions = document.createElement('div');
  actions.className = 'actions shared-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'complete';
  saveBtn.textContent = '저장';
  saveBtn.dataset.sharedAction = 'save';
  actions.appendChild(saveBtn);

  const toggleDoneBtn = document.createElement('button');
  toggleDoneBtn.type = 'button';
  toggleDoneBtn.className = 'complete';
  toggleDoneBtn.textContent = todo.isDone ? '미완료' : '완료';
  toggleDoneBtn.dataset.sharedAction = 'toggle-done';
  actions.appendChild(toggleDoneBtn);

  if (Number(runtime.authUser?.id) === Number(context.ownerUserId)) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete';
    deleteBtn.textContent = '삭제';
    deleteBtn.dataset.sharedAction = 'delete';
    actions.appendChild(deleteBtn);
  }

  const commentToggleBtn = document.createElement('button');
  commentToggleBtn.type = 'button';
  commentToggleBtn.className = 'ghost-btn';
  commentToggleBtn.textContent = '의견';
  commentToggleBtn.dataset.sharedAction = 'toggle-comments';
  actions.appendChild(commentToggleBtn);

  controls.appendChild(actions);

  const commentPanel = document.createElement('div');
  commentPanel.className = 'shared-comment-panel hidden';
  commentPanel.dataset.todoId = todo.id;

  const commentList = document.createElement('ul');
  commentList.className = 'shared-comment-list';
  renderSharedComments(commentList, todo, context);
  commentPanel.appendChild(commentList);

  const commentComposer = document.createElement('div');
  commentComposer.className = 'shared-comment-composer';
  const commentInput = document.createElement('textarea');
  commentInput.className = 'shared-comment-input';
  commentInput.rows = 2;
  commentInput.maxLength = 1200;
  commentInput.placeholder = '의견을 작성하세요';
  commentComposer.appendChild(commentInput);
  const commentSubmit = document.createElement('button');
  commentSubmit.type = 'button';
  commentSubmit.className = 'complete';
  commentSubmit.textContent = '등록';
  commentSubmit.dataset.sharedAction = 'add-comment';
  commentComposer.appendChild(commentSubmit);
  commentPanel.appendChild(commentComposer);

  main.appendChild(commentPanel);
  item.append(main, controls);
  return item;
}

function renderSharedTodosForBucket(bucket) {
  const section = ensureSharedSection(bucket);
  if (!section) {
    return;
  }
  const visible = shouldShowSharedSection(bucket);
  section.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }

  const contextSelect = section.querySelector('.shared-context-select');
  const composeForm = section.querySelector('.shared-compose-form');
  const listEl = section.querySelector('.shared-todo-list');
  if (!contextSelect || !composeForm || !listEl) {
    return;
  }

  const contexts = getCollabContextsForBucket(bucket);
  contextSelect.innerHTML = '';
  if (contexts.length === 0) {
    contextSelect.disabled = true;
    composeForm.classList.add('is-disabled');
    Array.from(composeForm.elements).forEach((input) => {
      input.disabled = true;
    });
    setSharedListEmpty(listEl, '연결된 공유 버킷이 없습니다.');
    return;
  }

  contexts.forEach((context) => {
    const option = document.createElement('option');
    option.value = context.key;
    option.textContent = context.label;
    contextSelect.appendChild(option);
  });

  const active = ensureActiveSharedContext(bucket);
  contextSelect.disabled = false;
  if (active) {
    contextSelect.value = active.key;
  }
  composeForm.classList.remove('is-disabled');
  Array.from(composeForm.elements).forEach((input) => {
    input.disabled = false;
  });

  if (!active) {
    setSharedListEmpty(listEl, '공유 컨텍스트를 찾을 수 없습니다.');
    return;
  }

  const todos = Array.isArray(runtime.sharedTodosByContext[active.key]) ? runtime.sharedTodosByContext[active.key] : [];
  listEl.innerHTML = '';
  if (todos.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'todo-inline-empty';
    empty.textContent = '공유 작업이 없습니다.';
    listEl.appendChild(empty);
    return;
  }

  todos.forEach((todo) => {
    listEl.appendChild(createSharedTodoItem(todo, active));
  });
}

function renderCollabPanel() {
  if (!collabPanelEl) {
    return;
  }

  const ready = runtime.isServerSync && !!runtime.authUser;
  collabPanelEl.classList.toggle('is-disabled', !ready);

  if (collabProfileBadgeEl) {
    const publicId = normalizePublicIdInput(runtime.collabProfile.publicId || runtime.authUser?.publicId || '');
    collabProfileBadgeEl.textContent = ready
      ? `내 고유ID: ${publicId ? `@${publicId}` : '미설정'}`
      : '로그인 후 공유 기능을 사용할 수 있습니다.';
  }

  if (!ready || !runtime.collabSummary) {
    if (collabInviteBucketSelectEl) {
      collabInviteBucketSelectEl.innerHTML = '';
      collabInviteBucketSelectEl.disabled = true;
    }
    if (collabReceivedInvitesEl) {
      setSharedListEmpty(collabReceivedInvitesEl, '받은 초대가 없습니다.');
    }
    if (collabSentInvitesEl) {
      setSharedListEmpty(collabSentInvitesEl, '보낸 초대가 없습니다.');
    }
    if (collabMembershipListEl) {
      setSharedListEmpty(collabMembershipListEl, '공유 멤버가 없습니다.');
    }
    if (collabInviteTargetInputEl) {
      collabInviteTargetInputEl.disabled = true;
    }
    if (collabInviteBucketSelectEl) {
      collabInviteBucketSelectEl.disabled = true;
    }
    return;
  }

  const inviteableBuckets = buckets.filter((bucket) => isBucketShareEnabled(bucket));
  if (collabInviteBucketSelectEl) {
    collabInviteBucketSelectEl.innerHTML = '';
    if (inviteableBuckets.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '공유 ON 버킷 없음';
      collabInviteBucketSelectEl.appendChild(option);
      collabInviteBucketSelectEl.disabled = true;
    } else {
      inviteableBuckets.forEach((bucket) => {
        const option = document.createElement('option');
        option.value = bucket;
        option.textContent = getBucketLabel(bucket);
        collabInviteBucketSelectEl.appendChild(option);
      });
      collabInviteBucketSelectEl.disabled = false;
    }
  }
  if (collabInviteTargetInputEl) {
    collabInviteTargetInputEl.disabled = inviteableBuckets.length === 0;
  }

  if (collabReceivedInvitesEl) {
    const received = Array.isArray(runtime.collabSummary.receivedInvites) ? runtime.collabSummary.receivedInvites : [];
    collabReceivedInvitesEl.innerHTML = '';
    if (received.length === 0) {
      setSharedListEmpty(collabReceivedInvitesEl, '받은 초대가 없습니다.');
    } else {
      received.forEach((invite) => {
        const li = document.createElement('li');
        li.className = 'collab-list-item';
        li.textContent = `${getBucketLabel(invite.bucketKey)} / ${getAuthorTag(invite.owner)} (${invite.status})`;
        if (invite.status === 'pending') {
          const acceptBtn = document.createElement('button');
          acceptBtn.type = 'button';
          acceptBtn.className = 'complete';
          acceptBtn.textContent = '수락';
          acceptBtn.dataset.collabAction = 'accept-invite';
          acceptBtn.dataset.inviteId = invite.id;
          li.appendChild(acceptBtn);

          const declineBtn = document.createElement('button');
          declineBtn.type = 'button';
          declineBtn.className = 'delete';
          declineBtn.textContent = '거절';
          declineBtn.dataset.collabAction = 'decline-invite';
          declineBtn.dataset.inviteId = invite.id;
          li.appendChild(declineBtn);
        }
        collabReceivedInvitesEl.appendChild(li);
      });
    }
  }

  if (collabSentInvitesEl) {
    const sent = Array.isArray(runtime.collabSummary.sentInvites) ? runtime.collabSummary.sentInvites : [];
    collabSentInvitesEl.innerHTML = '';
    if (sent.length === 0) {
      setSharedListEmpty(collabSentInvitesEl, '보낸 초대가 없습니다.');
    } else {
      sent.forEach((invite) => {
        const li = document.createElement('li');
        li.className = 'collab-list-item';
        li.textContent = `${getBucketLabel(invite.bucketKey)} -> ${getAuthorTag(invite.invitee)} (${invite.status})`;
        if (invite.status === 'pending') {
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'delete';
          cancelBtn.textContent = '취소';
          cancelBtn.dataset.collabAction = 'cancel-invite';
          cancelBtn.dataset.inviteId = invite.id;
          li.appendChild(cancelBtn);
        }
        collabSentInvitesEl.appendChild(li);
      });
    }
  }

  if (collabMembershipListEl) {
    const owned = Array.isArray(runtime.collabSummary.ownedBuckets) ? runtime.collabSummary.ownedBuckets : [];
    const joined = Array.isArray(runtime.collabSummary.joinedBuckets) ? runtime.collabSummary.joinedBuckets : [];
    collabMembershipListEl.innerHTML = '';

    owned.forEach((entry) => {
      (Array.isArray(entry.members) ? entry.members : []).forEach((member) => {
        const li = document.createElement('li');
        li.className = 'collab-list-item';
        li.textContent = `[내 버킷 ${getBucketLabel(entry.bucketKey)}] ${member.publicId ? `@${member.publicId}` : `USER-${member.userId}`}`;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'delete';
        removeBtn.textContent = '제거';
        removeBtn.dataset.collabAction = 'remove-membership';
        removeBtn.dataset.membershipId = String(member.membershipId || '');
        li.appendChild(removeBtn);
        collabMembershipListEl.appendChild(li);
      });
    });

    joined.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'collab-list-item';
      li.textContent = `[참여 ${getBucketLabel(entry.bucketKey)}] ${getAuthorTag(entry.owner)}`;
      const leaveBtn = document.createElement('button');
      leaveBtn.type = 'button';
      leaveBtn.className = 'delete';
      leaveBtn.textContent = '나가기';
      leaveBtn.dataset.collabAction = 'remove-membership';
      leaveBtn.dataset.membershipId = String(entry.membershipId || '');
      li.appendChild(leaveBtn);
      collabMembershipListEl.appendChild(li);
    });

    if (!collabMembershipListEl.children.length) {
      setSharedListEmpty(collabMembershipListEl, '공유 멤버가 없습니다.');
    }
  }
}

async function submitCollabInvite() {
  if (!collabInviteBucketSelectEl || !collabInviteTargetInputEl) {
    return;
  }
  const bucketKey = collabInviteBucketSelectEl.value;
  if (!bucketKey || !isBucketShareEnabled(bucketKey)) {
    showToast('버킷 공유를 먼저 켜 주세요.', 'error');
    return;
  }
  const targetPublicId = normalizePublicIdInput(collabInviteTargetInputEl.value);
  if (!isValidPublicId(targetPublicId)) {
    showToast('상대 고유ID 형식이 올바르지 않습니다.', 'error');
    return;
  }

  const response = await collabApiRequest(
    '/collab/invites',
    {
      method: 'POST',
      body: JSON.stringify({ bucketKey, targetPublicId }),
    },
    { withCsrf: true },
  );
  if (!response.ok) {
    showToast('초대 전송에 실패했습니다.', 'error');
    return;
  }

  collabInviteTargetInputEl.value = '';
  await refreshCollabSummary({ includeTodos: true });
  render();
  showToast('초대를 보냈습니다.', 'success');
}

async function toggleBucketShareSetting(bucket) {
  const targetBucket = normalizeBucketIdOrDefault(bucket, '');
  if (!targetBucket) {
    return;
  }
  if (!runtime.isServerSync || !runtime.authUser) {
    showToast('로그인 후 사용할 수 있습니다.', 'error');
    return;
  }

  const nextEnabled = !isBucketShareEnabled(targetBucket);
  const response = await collabApiRequest(
    `/collab/share-settings/${encodeURIComponent(targetBucket)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ enabled: nextEnabled }),
    },
    { withCsrf: true },
  );
  if (!response.ok) {
    showToast('버킷 공유 설정 변경에 실패했습니다.', 'error');
    return;
  }

  await refreshCollabSummary({ includeTodos: true });
  render();
  showToast(nextEnabled ? `${getBucketLabel(targetBucket)} 공유를 켰습니다.` : `${getBucketLabel(targetBucket)} 공유를 껐습니다.`, 'success');
}

async function handleCollabPanelAction(buttonEl) {
  if (!buttonEl) {
    return;
  }
  const action = buttonEl.dataset.collabAction;
  if (!action) {
    return;
  }

  if (action === 'accept-invite' || action === 'decline-invite' || action === 'cancel-invite') {
    const inviteId = buttonEl.dataset.inviteId;
    if (!inviteId) {
      return;
    }
    const pathByAction = {
      'accept-invite': `/collab/invites/${encodeURIComponent(inviteId)}/accept`,
      'decline-invite': `/collab/invites/${encodeURIComponent(inviteId)}/decline`,
      'cancel-invite': `/collab/invites/${encodeURIComponent(inviteId)}`,
    };
    const methodByAction = {
      'accept-invite': 'POST',
      'decline-invite': 'POST',
      'cancel-invite': 'DELETE',
    };
    const response = await collabApiRequest(
      pathByAction[action],
      { method: methodByAction[action] },
      { withCsrf: true },
    );
    if (!response.ok) {
      showToast('요청 처리에 실패했습니다.', 'error');
      return;
    }
    await refreshCollabSummary({ includeTodos: true });
    render();
    return;
  }

  if (action === 'remove-membership') {
    const membershipId = buttonEl.dataset.membershipId;
    if (!membershipId) {
      return;
    }
    const response = await collabApiRequest(
      `/collab/memberships/${encodeURIComponent(membershipId)}`,
      { method: 'DELETE' },
      { withCsrf: true },
    );
    if (!response.ok) {
      showToast('멤버 변경에 실패했습니다.', 'error');
      return;
    }
    await refreshCollabSummary({ includeTodos: true });
    render();
  }
}

async function submitSharedComposeForm(formEl) {
  if (!formEl) {
    return;
  }
  const bucket = formEl.dataset.bucket;
  const context = ensureActiveSharedContext(bucket);
  if (!context) {
    showToast('공유 컨텍스트를 선택해 주세요.', 'error');
    return;
  }

  const titleEl = formEl.querySelector('.shared-compose-title');
  const detailsEl = formEl.querySelector('.shared-compose-details');
  const priorityEl = formEl.querySelector('.shared-compose-priority');
  const dueDateEl = formEl.querySelector('.shared-compose-due');
  const title = String(titleEl?.value || '').trim();
  if (!title) {
    showToast('공유 작업 제목을 입력해 주세요.', 'error');
    return;
  }

  const response = await collabApiRequest(
    `/collab/shares/${encodeURIComponent(context.ownerUserId)}/${encodeURIComponent(context.bucketKey)}/todos`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        details: detailsEl?.value || '',
        priority: Number(priorityEl?.value || 2),
        dueDate: dueDateEl?.value || '',
      }),
    },
    { withCsrf: true },
  );

  if (!response.ok) {
    showToast('공유 작업 추가에 실패했습니다.', 'error');
    return;
  }

  if (titleEl) {
    titleEl.value = '';
  }
  if (detailsEl) {
    detailsEl.value = '';
  }
  if (priorityEl) {
    priorityEl.value = '2';
  }
  if (dueDateEl) {
    dueDateEl.value = '';
  }

  await refreshCollabSnapshot();
  render();
}

async function updateSharedTodoFromItem(itemEl, action) {
  if (!itemEl) {
    return;
  }
  const todoId = itemEl.dataset.todoId;
  const found = getSharedTodoById(todoId);
  if (!found) {
    await refreshCollabSummary({ includeTodos: true });
    render();
    return;
  }

  const payload = {
    revision: Number(found.todo.revision || 1),
  };
  if (action === 'save') {
    payload.title = String(itemEl.querySelector('.shared-todo-title')?.value || '').trim();
    payload.details = itemEl.querySelector('.shared-todo-details')?.value || '';
    payload.priority = Number(itemEl.querySelector('.shared-todo-priority')?.value || found.todo.priority || 2);
    payload.dueDate = itemEl.querySelector('.shared-todo-due')?.value || '';
    payload.isDone = Boolean(found.todo.isDone);
  } else if (action === 'toggle-done') {
    payload.isDone = !Boolean(found.todo.isDone);
    payload.title = found.todo.title;
    payload.details = found.todo.details || '';
    payload.priority = Number(found.todo.priority || 2);
    payload.dueDate = found.todo.dueDate || '';
  }

  const response = await collabApiRequest(
    `/collab/shared-todos/${encodeURIComponent(todoId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    { withCsrf: true },
  );

  if (response.status === 409) {
    showToast('다른 사용자가 먼저 수정했습니다. 새로고침합니다.', 'error');
    const context = parseCollabContextKey(found.contextKey);
    if (context) {
      await refreshCollabSnapshot();
    }
    render();
    return;
  }
  if (!response.ok) {
    showToast('공유 작업 수정에 실패했습니다.', 'error');
    return;
  }

  const context = parseCollabContextKey(found.contextKey);
  if (context) {
    await refreshCollabSnapshot();
  }
  render();
}

async function deleteSharedTodo(todoId) {
  const found = getSharedTodoById(todoId);
  const response = await collabApiRequest(
    `/collab/shared-todos/${encodeURIComponent(todoId)}`,
    { method: 'DELETE' },
    { withCsrf: true },
  );
  if (!response.ok) {
    showToast('공유 작업 삭제에 실패했습니다.', 'error');
    return;
  }

  if (found) {
    const context = parseCollabContextKey(found.contextKey);
    if (context) {
      await refreshCollabSnapshot();
    }
  } else {
    await refreshCollabSummary({ includeTodos: true });
  }
  render();
}

async function addSharedComment(itemEl) {
  const todoId = itemEl?.dataset.todoId;
  if (!todoId) {
    return;
  }
  const panel = itemEl.querySelector('.shared-comment-panel');
  const input = panel?.querySelector('.shared-comment-input');
  const body = String(input?.value || '').trim();
  if (!body) {
    showToast('의견 내용을 입력해 주세요.', 'error');
    return;
  }

  const response = await collabApiRequest(
    `/collab/shared-todos/${encodeURIComponent(todoId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    },
    { withCsrf: true },
  );
  if (!response.ok) {
    showToast('의견 등록에 실패했습니다.', 'error');
    return;
  }

  if (input) {
    input.value = '';
  }
  await refreshSharedComments(todoId);
  render();
}

async function deleteSharedComment(commentId, todoId) {
  const response = await collabApiRequest(
    `/collab/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
    { withCsrf: true },
  );
  if (!response.ok) {
    showToast('의견 삭제에 실패했습니다.', 'error');
    return;
  }
  await refreshSharedComments(todoId);
  render();
}

async function toggleSharedCommentPanel(itemEl) {
  const panel = itemEl.querySelector('.shared-comment-panel');
  if (!panel) {
    return;
  }
  const willOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (!willOpen) {
    return;
  }
  const todoId = itemEl.dataset.todoId;
  if (!Array.isArray(runtime.sharedCommentsByTodo[todoId])) {
    await refreshSharedComments(todoId);
    render();
  }
}

function renderTodoList() {
  const todayNotes = getTodayActiveNoteEntries();
  const sorted = sortTodos(state.todos);
  todoCountEl.textContent = String(todayNotes.length + sorted.length);
  todoListEl.innerHTML = '';
  renderTodayNoteHighlights(todoListEl, todayNotes);
  renderTodoItems(todoListEl, sorted);
}

function renderTodosByBucket() {
  for (const bucket of buckets) {
    const listEl = document.getElementById(`list-${bucket}`);
    const countEl = document.getElementById(`count-${bucket}`);
    if (!listEl || !countEl) {
      continue;
    }

    listEl.innerHTML = '';
    const filtered = state.todos.filter((todo) => todo.bucket === bucket);
    const sorted = sortTodos(filtered);

    countEl.textContent = String(sorted.length);
    const hasLane = state.projectLanes.some((lane) => lane.bucket === bucket);
    if (hasLane) {
      renderProjectLaneGroups(listEl, sorted, bucket);
    } else {
      renderTodoItems(listEl, sorted);
    }

    ensureBucketShareToggle(bucket);
    renderSharedTodosForBucket(bucket);
  }

  syncBucketActionMenus();
}

function countDailyStats(dateText) {
  const scheduledCount = state.todos.filter((todo) => todo.dueDate === dateText).length;
  const completedCount = state.doneLog.filter((item) => parseIsoDate(item.completedAt) === dateText).length;
  return { scheduledCount, completedCount };
}

function buildCalendarRangeLaneMap(year, month) {
  const monthStart = toLocalIsoDate(new Date(year, month, 1));
  const monthEnd = toLocalIsoDate(new Date(year, month + 1, 0));
  const rangeLaneMap = {};
  const laneEndDates = [];

  const rangeItems = state.calendarItems
    .filter((item) => {
      if (item.type !== 'note') {
        return false;
      }
      const startDate = item.date;
      const endDate = item.endDate || item.date;
      const isRange = endDate > startDate;
      if (!isRange) {
        return false;
      }
      return startDate <= monthEnd && endDate >= monthStart;
    })
    .sort((a, b) => {
      if (a.date !== b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      if ((a.endDate || a.date) !== (b.endDate || b.date)) {
        return new Date(a.endDate || a.date) - new Date(b.endDate || b.date);
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  rangeItems.forEach((item) => {
    const startDate = item.date;
    const endDate = item.endDate || item.date;
    let lane = laneEndDates.findIndex((laneEndDate) => laneEndDate < startDate);
    if (lane === -1) {
      lane = laneEndDates.length;
      laneEndDates.push(endDate);
    } else {
      laneEndDates[lane] = endDate;
    }
    rangeLaneMap[item.id] = lane;
  });

  return rangeLaneMap;
}

function getEntriesForDate(dateText, rangeLaneMap = {}) {
  const noteEntries = state.calendarItems
    .filter((item) => isDateInCalendarRange(dateText, item.date, item.endDate || item.date))
    .map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      source: 'calendar',
      createdAt: item.createdAt,
      startDate: item.date,
      endDate: item.endDate || item.date,
      isRange: (item.endDate || item.date) > item.date,
      rangeLane:
        (item.endDate || item.date) > item.date &&
        Number.isInteger(rangeLaneMap?.[item.id])
          ? rangeLaneMap[item.id]
          : -1,
      rangePosition:
        dateText === item.date
          ? 'start'
          : dateText === (item.endDate || item.date)
            ? 'end'
            : 'middle',
    }));

  const todoEntries = state.todos
    .filter((todo) => todo.dueDate === dateText)
    .map((todo) => ({
      id: todo.id,
      type: 'todo',
      text: `${todo.title} (${getTodoGroupLabel(todo)})`,
      source: 'todo',
    }));

  noteEntries.sort((a, b) => {
    if (a.isRange !== b.isRange) {
      return a.isRange ? -1 : 1;
    }
    if (a.isRange && b.isRange && a.rangeLane !== b.rangeLane) {
      return a.rangeLane - b.rangeLane;
    }
    if (a.startDate !== b.startDate) {
      return new Date(a.startDate) - new Date(b.startDate);
    }
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return [...noteEntries, ...todoEntries];
}

function addEmptyMessage(listEl, message) {
  const li = document.createElement('li');
  li.textContent = message;
  listEl.appendChild(li);
}

function createSelectedNoteTextNode(rawText) {
  const text = String(rawText || '');
  const container = document.createElement('div');
  container.className = 'selected-note-text-wrap';

  const textEl = document.createElement('p');
  textEl.className = 'selected-note-text';
  textEl.textContent = text;
  textEl.title = text;
  container.appendChild(textEl);

  const needToggle = text.length > 120 || text.includes('\n');
  if (!needToggle) {
    return container;
  }

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'selected-note-expand';
  expandBtn.textContent = '더 보기';
  expandBtn.setAttribute('aria-expanded', 'false');
  expandBtn.addEventListener('click', () => {
    const expanded = textEl.classList.toggle('is-expanded');
    expandBtn.setAttribute('aria-expanded', String(expanded));
    expandBtn.textContent = expanded ? '접기' : '더 보기';
  });

  container.appendChild(expandBtn);
  return container;
}

function renderSelectedDatePanel() {
  const targetDate = state.selectedDate;
  const target = new Date(targetDate);
  const labelFmt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  selectedDateLabel.textContent = labelFmt.format(target);

  const createdTodos = sortTodos(state.todos.filter((todo) => parseIsoDate(todo.createdAt) === targetDate));
  const completedTodos = state.doneLog.filter((log) => parseIsoDate(log.completedAt) === targetDate);
  const notes = state.calendarItems
    .filter((item) => isDateInCalendarRange(targetDate, item.date, item.endDate || item.date))
    .sort((a, b) => {
      const aIsRange = (a.endDate || a.date) > a.date;
      const bIsRange = (b.endDate || b.date) > b.date;
      if (aIsRange !== bIsRange) {
        return aIsRange ? -1 : 1;
      }
      if (a.date !== b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  selectedDateSummary.textContent = `작성 ${createdTodos.length}개 / 완료 ${completedTodos.length}개 / 메모 ${notes.length}개`;
  selectedCreatedList.innerHTML = '';
  selectedCompletedList.innerHTML = '';
  selectedCalendarNoteList.innerHTML = '';
  if (selectedDateNoteInput) {
    selectedDateNoteInput.placeholder = `${targetDate} 메모 입력`;
    selectedDateNoteInput.setAttribute('aria-label', `${targetDate} 메모 입력`);
  }
  if (selectedDateNoteStartDate && !selectedDateNoteStartDate.value) {
    selectedDateNoteStartDate.value = targetDate;
  }
  const noteStart = parseIsoDate(selectedDateNoteStartDate?.value || targetDate) || targetDate;
  if (selectedDateNoteStartDate) {
    selectedDateNoteStartDate.value = noteStart;
  }
  if (selectedDateNoteEndDate) {
    selectedDateNoteEndDate.min = noteStart;
    if (!selectedDateNoteEndDate.value || selectedDateNoteEndDate.value < noteStart) {
      selectedDateNoteEndDate.value = noteStart;
    }
  }

  if (createdTodos.length === 0) {
    addEmptyMessage(selectedCreatedList, '선택한 날짜에 생성된 할 일이 없습니다.');
  } else {
    createdTodos.forEach((todo) => {
      const li = document.createElement('li');
      li.textContent = `[${getTodoGroupLabel(todo)}] ${todo.title} (${formatDisplayDateTime(todo.createdAt)})`;
      selectedCreatedList.appendChild(li);
    });
  }

  if (completedTodos.length === 0) {
    addEmptyMessage(selectedCompletedList, '선택한 날짜에 완료한 할 일이 없습니다.');
  } else {
    completedTodos.forEach((log) => {
      const dueDateText = log.dueDate ? ` / 마감일 ${log.dueDate}` : '';
      const li = document.createElement('li');
      li.textContent = `[${getTodoGroupLabel(log)}] ${log.title} (${formatDisplayDateTime(log.completedAt)}${dueDateText})`;
      selectedCompletedList.appendChild(li);
    });
  }

  if (notes.length === 0) {
    addEmptyMessage(selectedCalendarNoteList, '선택한 날짜에 노트/메모가 없습니다.');
  } else {
    notes.forEach((item) => {
      const li = document.createElement('li');
      const rangeText = formatCalendarRange(item.date, item.endDate || item.date);
      li.className = 'selected-note-item';
      if ((item.endDate || item.date) > item.date) {
        li.classList.add('is-range-note');
      }

      const head = document.createElement('div');
      head.className = 'selected-note-head';

      const typeBadge = document.createElement('span');
      typeBadge.className = 'selected-note-type';
      typeBadge.textContent = typeLabel[item.type] || item.type;

      const period = document.createElement('span');
      period.className = 'selected-note-period';
      const days = getRangeDaysInclusive(item.date, item.endDate || item.date);
      period.textContent = days > 1 ? `${rangeText} · ${days}일` : rangeText;

      const text = createSelectedNoteTextNode(item.text);

      head.append(typeBadge, period);
      li.append(head, text);
      selectedCalendarNoteList.appendChild(li);
    });
  }
}

function isCalendarTodoMode() {
  return runtime.calendarMode === 'todo';
}

function setCalendarMode(mode) {
  runtime.calendarMode = mode === 'todo' ? 'todo' : 'note';
  applyCalendarFormMode();
}

function applyCalendarFormMode() {
  const isTodo = isCalendarTodoMode();
  calendarModeButtons.forEach((button) => {
    const buttonMode = button.dataset.calendarMode;
    const isActive = buttonMode === runtime.calendarMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  if (calendarTodoFields) {
    if (isTodo) {
      calendarTodoFields.classList.remove('hidden');
    } else {
      calendarTodoFields.classList.add('hidden');
    }
  }
  if (calendarTextInput) {
    calendarTextInput.classList.toggle('hidden', isTodo);
    calendarTextInput.required = !isTodo;
  }
  if (calendarTodoTitleInput) {
    calendarTodoTitleInput.required = isTodo;
  }
  if (calendarSubmitBtn) {
    calendarSubmitBtn.textContent = isTodo ? '할 일 저장' : '노트 저장';
  }
}

function addSelectedDateNote() {
  const fallbackDate = state.selectedDate || toLocalIsoDate(new Date());
  const startDate = parseIsoDate(selectedDateNoteStartDate?.value || fallbackDate) || fallbackDate;
  const text = String(selectedDateNoteInput?.value || '').trim();
  const endDate = clampCalendarRangeEnd(startDate, selectedDateNoteEndDate?.value || startDate);
  if (!text) {
    showToast('메모를 입력해 주세요.', 'error');
    selectedDateNoteInput?.focus();
    return;
  }
  if (!endDate || endDate < startDate) {
    showToast('종료일을 시작일 이후로 선택해 주세요.', 'error');
    selectedDateNoteEndDate?.focus();
    return;
  }

  state.calendarItems.unshift(createCalendarItem(startDate, 'note', text, endDate));
  state.selectedDate = startDate;
  if (selectedDateNoteInput) {
    selectedDateNoteInput.value = '';
    selectedDateNoteInput.focus();
  }
  if (selectedDateNoteStartDate) {
    selectedDateNoteStartDate.value = startDate;
  }
  if (selectedDateNoteEndDate) {
    selectedDateNoteEndDate.min = startDate;
    selectedDateNoteEndDate.value = endDate;
  }
  queueSync();
  render();
  showToast(
    startDate === endDate ? '메모를 추가했습니다.' : `장기 일정을 추가했습니다. (${startDate} ~ ${endDate})`,
    'success',
  );
}

function isCompactCalendarViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(max-width: 760px)').matches;
}

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const compactCalendar = isCompactCalendarViewport();
  const yearText = String(year);
  const holidayEntry = HOLIDAYS_BY_YEAR[yearText];
  if (!holidayEntry || holidayEntry.expiresAt <= Date.now()) {
    ensureHolidayDataForYear(year).finally(() => {
      render();
    });
  }

  const firstDate = new Date(year, month, 1);
  const dayCount = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDate.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + dayCount) / 7) * 7;
  const rangeLaneMap = buildCalendarRangeLaneMap(year, month);

  const fmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });
  calendarMonthLabel.textContent = fmt.format(state.currentMonth);

  calendarGrid.innerHTML = '';

  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startOffset + 1;
    const inMonth = dayNumber > 0 && dayNumber <= dayCount;

    const cell = document.createElement('article');
    cell.className = 'calendar-cell';

    if (!inMonth) {
      cell.classList.add('is-empty');
      calendarGrid.appendChild(cell);
      continue;
    }

    const currentDate = new Date(year, month, dayNumber);
    const dateText = toLocalIsoDate(currentDate);
    const todayText = toLocalIsoDate(new Date());
    const isTodayDate = dateText === todayText;
    const isSelectedDate = dateText === state.selectedDate;
    const weekendType = getWeekendType(currentDate);
    const holidayLabel = getHolidayLabel(currentDate);
    const isHoliday = Boolean(holidayLabel);

    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', `${month + 1}월 ${dayNumber}일`);

    if (isTodayDate) {
      cell.classList.add('is-today');
      cell.setAttribute('aria-current', 'date');
    } else {
      cell.removeAttribute('aria-current');
    }

    if (weekendType) {
      cell.classList.add(`is-${weekendType}`);
    }
    if (isHoliday) {
      cell.classList.add('is-holiday');
    }

    if (isSelectedDate) {
      cell.classList.add('is-selected', 'is-active');
      cell.setAttribute('aria-selected', 'true');
    } else {
      cell.removeAttribute('aria-selected');
    }

    const dayLabel = document.createElement('p');
    dayLabel.className = 'calendar-day';
    dayLabel.textContent = String(dayNumber);
    cell.appendChild(dayLabel);

    if (isHoliday) {
      const holidayBadge = document.createElement('p');
      holidayBadge.className = 'calendar-holiday';
      holidayBadge.textContent = holidayLabel;
      cell.appendChild(holidayBadge);
    }

    const { scheduledCount, completedCount } = countDailyStats(dateText);
    const dailySummary = document.createElement('p');
    dailySummary.className = 'calendar-summary';
    const summaryLabel = `일정 ${scheduledCount} / 완료 ${completedCount}`;
    dailySummary.textContent = compactCalendar
      ? `일${scheduledCount}/완${completedCount}`
      : summaryLabel;
    const weekendLabel = weekendType === 'saturday' ? ' 토요일' : weekendType === 'sunday' ? ' 일요일' : '';
    const holidayDescription = isHoliday ? `, 공휴일(${holidayLabel})` : '';
    cell.setAttribute(
      'aria-label',
      `${month + 1}월 ${dayNumber}일${weekendLabel}, ${summaryLabel}${holidayDescription}`,
    );
    cell.appendChild(dailySummary);

    const entries = getEntriesForDate(dateText, rangeLaneMap);

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '일정 없음';
      cell.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'calendar-item-list';

      const maxVisibleItems = compactCalendar ? 2 : 3;
      const rangeEntries = entries.filter((entry) => entry.isRange);
      const otherEntries = entries.filter((entry) => !entry.isRange);
      const maxLaneIndex = rangeEntries.reduce(
        (maxLane, entry) => Math.max(maxLane, entry.rangeLane || 0),
        -1,
      );
      const laneSlotCount = Math.min(maxVisibleItems, Math.max(0, maxLaneIndex + 1));
      const laneSlots = Array.from({ length: laneSlotCount }, (_, lane) =>
        rangeEntries.find((entry) => (entry.rangeLane || 0) === lane) || null,
      );
      const visibleOtherEntries = otherEntries.slice(0, Math.max(0, maxVisibleItems - laneSlotCount));
      const visibleEntries = [...laneSlots, ...visibleOtherEntries];
      let renderedRealCount = 0;

      visibleEntries.forEach((entry) => {
        if (!entry) {
          const placeholder = document.createElement('li');
          placeholder.className = 'calendar-item is-range is-range-placeholder';
          list.appendChild(placeholder);
          return;
        }

        renderedRealCount += 1;
        const li = document.createElement('li');
        li.className = `calendar-item ${entry.type === 'note' ? 'is-note' : 'is-todo'}`;
        if (entry.isRange) {
          li.classList.add('is-range', `is-range-${entry.rangePosition}`);
          if (entry.rangePosition !== 'start') {
            li.classList.add('is-range-continuation');
          }
          const isWeekStart = currentDate.getDay() === 1;
          const isWeekEnd = currentDate.getDay() === 0;
          const isMonthStart = dayNumber === 1;
          const isMonthEnd = dayNumber === dayCount;
          if (entry.rangePosition !== 'start' && (isWeekStart || isMonthStart)) {
            li.classList.add('is-range-row-start');
          }
          if (entry.rangePosition !== 'end' && (isWeekEnd || isMonthEnd)) {
            li.classList.add('is-range-row-end');
          }
        }

        const text = document.createElement('span');
        text.className = 'calendar-item-text';
        text.textContent = entry.isRange && entry.rangePosition !== 'start' ? ' ' : entry.text;
        li.title = entry.isRange
          ? `${entry.text} (${entry.startDate} ~ ${entry.endDate})`
          : entry.text;

        if (!entry.isRange) {
          const badge = document.createElement('span');
          badge.className = 'type-badge';
          badge.textContent = typeLabel[entry.type] || entry.type;
          li.appendChild(badge);
        }
        li.appendChild(text);

        if (entry.source === 'calendar' && (!entry.isRange || entry.rangePosition === 'start')) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'calendar-remove';
          removeBtn.textContent = 'x';
          removeBtn.setAttribute('aria-label', '항목 삭제');
          removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            state.calendarItems = state.calendarItems.filter((item) => item.id !== entry.id);
            render();
            queueSync(true);
          });
          li.appendChild(removeBtn);
        }

        list.appendChild(li);
      });

      const hiddenCount = entries.length - renderedRealCount;
      if (hiddenCount > 0) {
        const more = document.createElement('li');
        more.className = 'calendar-more';
        more.textContent = `+${hiddenCount}건`;
        list.appendChild(more);
      }

      cell.appendChild(list);
    }

    const selectDate = () => {
      state.selectedDate = dateText;
      state.currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      render();
      if (calendarDateInput) {
        calendarDateInput.value = dateText;
      }
      if (selectedDateNoteStartDate) {
        selectedDateNoteStartDate.value = dateText;
      }
      if (selectedDateNoteEndDate) {
        selectedDateNoteEndDate.min = dateText;
        selectedDateNoteEndDate.value = dateText;
      }
      if (selectedDateNoteInput) {
        selectedDateNoteInput.focus();
      }
    };
    cell.addEventListener('click', selectDate);
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectDate();
      }
    });

    calendarGrid.appendChild(cell);
  }
}
function registerEvents() {
  if (runtime.eventsRegistered) {
    return;
  }
  runtime.eventsRegistered = true;

  registerBucketResizeObserver();
  registerBucketTitleEditors();
  registerBucketLaneControls();
  registerBucketDragControls();
  registerProjectColumnControls();

  if (quickForm) {
    if (quickAddBody) {
      quickAddBody.classList.remove('hidden');
    }

    quickForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const title = quickInput.value.trim();
      if (!title) {
        return;
      }

      state.todos.unshift(
        createTodo({
          title,
          bucket: bucketSelect?.value || 'bucket4',
          projectLaneId: '',
          priority: Number(prioritySelect?.value || 2),
          dueDate: dueDateInput?.value || '',
        }),
      );
      saveLocalState();
      queueSync();
      render();
      quickInput.value = '';
      if (dueDateInput) {
        dueDateInput.value = '';
      }
      if (prioritySelect) {
        prioritySelect.value = '2';
      }
      if (bucketSelect) {
        bucketSelect.value = 'bucket4';
      }
      quickInput?.focus();
    });
  }

  if (calendarForm) {
    const hideCalendarForm = () => {
      calendarForm.hidden = true;
      setCalendarMode('note');
      if (calendarTextInput) {
        calendarTextInput.value = '';
      }
      if (calendarTodoTitleInput) {
        calendarTodoTitleInput.value = '';
      }
      if (calendarTodoDetailInput) {
        calendarTodoDetailInput.value = '';
      }
    };

    calendarForm.hidden = true;
    setCalendarMode('note');
    calendarModeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.calendarMode) {
          setCalendarMode(button.dataset.calendarMode);
          if (button.dataset.calendarMode === 'todo') {
            if (calendarTodoTitleInput) {
              calendarTodoTitleInput.focus();
            }
          } else if (calendarTextInput) {
            calendarTextInput.focus();
          }
        }
      });
    });
    calendarForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const date = String(calendarDateInput?.value || '').trim();
      if (!date) {
        showToast('날짜를 선택해 주세요.', 'error');
        if (calendarDateInput) {
          calendarDateInput.focus();
        }
        return;
      }

      const itemType = isCalendarTodoMode() ? 'todo' : 'note';
      const noteText = String(calendarTextInput?.value || '').trim();
      const todoTitle = String(calendarTodoTitleInput?.value || '').trim();
      const todoDetail = String(calendarTodoDetailInput?.value || '').trim();

      if (itemType === 'todo') {
        if (!todoTitle) {
          showToast('할 일 제목을 입력해 주세요.', 'error');
          if (calendarTodoTitleInput) {
            calendarTodoTitleInput.focus();
          }
          return;
        }
        state.todos.unshift(
          createTodo({
            title: todoTitle,
            details: todoDetail,
            bucket: 'bucket4',
            projectLaneId: '',
            priority: 2,
            dueDate: date,
          }),
        );
      } else {
        if (!noteText) {
          showToast('메모를 입력해 주세요.', 'error');
          if (calendarTextInput) {
            calendarTextInput.focus();
          }
          return;
        }
        state.calendarItems.unshift(createCalendarItem(date, itemType, noteText));
      }

      queueSync();
      render();
      if (calendarTextInput) {
        calendarTextInput.value = '';
      }
      if (calendarTodoTitleInput) {
        calendarTodoTitleInput.value = '';
      }
      if (calendarTodoDetailInput) {
        calendarTodoDetailInput.value = '';
      }
      applyCalendarFormMode();
      if (calendarDateInput) {
        calendarDateInput.focus();
      }
    });

    [
      calendarDateInput,
      calendarTextInput,
      calendarTodoTitleInput,
      calendarTodoDetailInput,
    ].forEach((element) => {
      if (!element) {
        return;
      }
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideCalendarForm();
        }
      });
    });
  }

  if (prevMonthBtn) {
    prevMonthBtn.setAttribute('aria-pressed', 'false');
    prevMonthBtn.addEventListener('click', () => {
      prevMonthBtn.classList.add('is-active');
      prevMonthBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        prevMonthBtn.classList.remove('is-active');
        prevMonthBtn.setAttribute('aria-pressed', 'false');
      }, 120);
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
      render();
    });
  }

  if (selectedDateNoteInput && addSelectedDateNoteBtn) {
    addSelectedDateNoteBtn.addEventListener('click', addSelectedDateNote);
    selectedDateNoteInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addSelectedDateNote();
      }
    });
    selectedDateNoteStartDate?.addEventListener('change', () => {
      const startDate = parseIsoDate(selectedDateNoteStartDate.value || state.selectedDate || toLocalIsoDate(new Date()));
      if (!startDate) {
        return;
      }
      selectedDateNoteStartDate.value = startDate;
      if (selectedDateNoteEndDate) {
        selectedDateNoteEndDate.min = startDate;
        if (!selectedDateNoteEndDate.value || selectedDateNoteEndDate.value < startDate) {
          selectedDateNoteEndDate.value = startDate;
        }
      }
    });
    selectedDateNoteEndDate?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addSelectedDateNote();
      }
    });
  }

  if (
    toggleProfileEditorBtn &&
    profileEditorEl &&
    profileNicknameInput &&
    profileHonorificInput &&
    profilePublicIdInput &&
    saveProfileBtn &&
    cancelProfileBtn
  ) {
    const hideProfileEditor = () => {
      profileEditorEl.classList.add('hidden');
      toggleProfileEditorBtn.classList.remove('is-active');
      toggleProfileEditorBtn.setAttribute('aria-expanded', 'false');
    };

    const showProfileEditor = () => {
      const profile = normalizeUserProfile(state.userProfile);
      profileNicknameInput.value = profile.nickname;
      profileHonorificInput.value = profile.honorific;
      profilePublicIdInput.value = normalizePublicIdInput(runtime.collabProfile.publicId || runtime.authUser?.publicId || '');
      profilePublicIdInput.disabled = !runtime.isServerSync;
      profileEditorEl.classList.remove('hidden');
      toggleProfileEditorBtn.classList.add('is-active');
      toggleProfileEditorBtn.setAttribute('aria-expanded', 'true');
      profileNicknameInput.focus();
      profileNicknameInput.select();
    };

    toggleProfileEditorBtn.addEventListener('click', () => {
      if (profileEditorEl.classList.contains('hidden')) {
        showProfileEditor();
      } else {
        hideProfileEditor();
      }
    });

    saveProfileBtn.addEventListener('click', async () => {
      state.userProfile = normalizeUserProfile({
        nickname: profileNicknameInput.value,
        honorific: profileHonorificInput.value,
      });
      saveLocalState();
      queueSync(true);

      if (runtime.isServerSync && runtime.authUser) {
        const nextPublicId = normalizePublicIdInput(profilePublicIdInput.value);
        const currentPublicId = normalizePublicIdInput(runtime.collabProfile.publicId || runtime.authUser.publicId || '');
        if (nextPublicId !== currentPublicId) {
          const ok = await savePublicIdToServer(nextPublicId);
          if (!ok) {
            profilePublicIdInput.focus();
            profilePublicIdInput.select();
            return;
          }
        }
      }

      await refreshCollabSummary({ includeTodos: true });
      updateAuthUI();
      hideProfileEditor();
      showToast('호칭을 저장했습니다.', 'success');
    });

    cancelProfileBtn.addEventListener('click', () => {
      hideProfileEditor();
    });

    [profileNicknameInput, profileHonorificInput, profilePublicIdInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveProfileBtn.click();
        }
        if (event.key === 'Escape') {
          hideProfileEditor();
        }
      });
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.setAttribute('aria-pressed', 'false');
    nextMonthBtn.addEventListener('click', () => {
      nextMonthBtn.classList.add('is-active');
      nextMonthBtn.setAttribute('aria-pressed', 'true');
      setTimeout(() => {
        nextMonthBtn.classList.remove('is-active');
        nextMonthBtn.setAttribute('aria-pressed', 'false');
      }, 120);
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
      render();
    });
  }

  if (authBtn) {
    authBtn.addEventListener('click', async () => {
      if (!runtime.isServerSync) {
        window.location.href = '/api/auth/kakao';
        return;
      }

      try {
        await apiRequest('/auth/logout', {
          method: 'POST',
          allowHttpStatus: [401],
          suppressErrorToast: true,
          headers: {
            'x-csrf-token': getCookie('daycheck_csrf') || '',
          },
        });
      } catch {
        // ignore
      }

      applyAuthState(null);
      updateAuthUI();
      render();
    });
  }

  if (collabInviteFormEl) {
    collabInviteFormEl.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCollabInvite().catch(() => {
        showToast('초대 요청 처리에 실패했습니다.', 'error');
      });
    });
  }

  if (collabPanelEl) {
    collabPanelEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-collab-action]');
      if (!button) {
        return;
      }
      handleCollabPanelAction(button).catch(() => {
        showToast('공유 요청 처리에 실패했습니다.', 'error');
      });
    });
  }

  if (boardEl) {
    boardEl.addEventListener('change', (event) => {
      const contextSelect = event.target.closest('.shared-context-select');
      if (!contextSelect) {
        return;
      }
      const section = contextSelect.closest('.shared-todo-section');
      const bucket = section?.dataset.bucket;
      if (!bucket) {
        return;
      }
      const context = parseCollabContextKey(contextSelect.value);
      if (!context) {
        return;
      }
      runtime.activeSharedContextByBucket[bucket] = context.key;
      if (!Array.isArray(runtime.sharedTodosByContext[context.key])) {
        refreshCollabSnapshot()
          .then(() => {
            render();
          })
          .catch(() => {});
        return;
      }
      render();
    });

    boardEl.addEventListener('submit', (event) => {
      const form = event.target.closest('.shared-compose-form');
      if (!form) {
        return;
      }
      event.preventDefault();
      submitSharedComposeForm(form).catch(() => {
        showToast('공유 작업 추가에 실패했습니다.', 'error');
      });
    });

    boardEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-shared-action]');
      if (!button) {
        return;
      }
      const action = button.dataset.sharedAction;
      if (!action) {
        return;
      }
      if (action === 'toggle-share-setting') {
        const bucket = button.dataset.bucket;
        toggleBucketShareSetting(bucket).catch(() => {
          showToast('버킷 공유 설정 변경에 실패했습니다.', 'error');
        });
        return;
      }
      const itemEl = button.closest('.shared-todo-item');
      if (!itemEl) {
        return;
      }

      if (action === 'save' || action === 'toggle-done') {
        updateSharedTodoFromItem(itemEl, action).catch(() => {
          showToast('공유 작업 수정에 실패했습니다.', 'error');
        });
        return;
      }
      if (action === 'delete') {
        deleteSharedTodo(itemEl.dataset.todoId).catch(() => {
          showToast('공유 작업 삭제에 실패했습니다.', 'error');
        });
        return;
      }
      if (action === 'toggle-comments') {
        toggleSharedCommentPanel(itemEl).catch(() => {
          showToast('의견 패널을 열 수 없습니다.', 'error');
        });
        return;
      }
      if (action === 'add-comment') {
        addSharedComment(itemEl).catch(() => {
          showToast('의견 등록에 실패했습니다.', 'error');
        });
        return;
      }
      if (action === 'delete-comment') {
        const commentId = button.dataset.commentId;
        const todoId = itemEl.dataset.todoId;
        if (!commentId || !todoId) {
          return;
        }
        deleteSharedComment(commentId, todoId).catch(() => {
          showToast('의견 삭제에 실패했습니다.', 'error');
        });
      }
    });
  }
}

function initializeRouteModules() {
  runtime.routeModules = {
    home: createTodoUi(),
    buckets: createBucketUi(),
    calendar: createCalendarUi(),
    report: createReportUi(),
  };

  Object.entries(runtime.routeModules).forEach(([route, module]) => {
    const root = routeViewEls.find((viewEl) => viewEl.dataset.routeView === route) || null;
    module?.mount?.(root);
  });

  runtime.authView = createAuthUi();
  runtime.authView?.mount?.(appHeaderEl);
}

function setupRouter() {
  if (runtime.appRouter) {
    return;
  }

  if (!routeOutletEl) {
    runtime.currentRoute = 'home';
    return;
  }

  runtime.appRouter = createRouter({
    routes: APP_ROUTES,
    storageKey: ROUTE_STORAGE_KEY,
    defaultRoute: 'home',
  });

  runtime.appRouter.subscribe(({ route, direction }) => {
    activateRoute(route, direction);
    render();
  });

  routeLinkEls.forEach((linkEl) => {
    linkEl.addEventListener('click', (event) => {
      const route = String(linkEl.dataset.routeLink || '');
      if (!APP_ROUTES.includes(route)) {
        return;
      }
      event.preventDefault();
      runtime.appRouter.navigate(route);
    });
  });

  runtime.appRouter.init();
}

function isIphoneLikeDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = String(navigator.userAgent || '');
  return /iPhone|iPod/i.test(ua);
}

function syncViewportClasses() {
  if (typeof window === 'undefined' || !document.body) {
    return;
  }

  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const isNarrow = window.matchMedia('(max-width: 980px)').matches;
  document.body.classList.toggle('is-ios-portrait', isIphoneLikeDevice() && isPortrait);
  document.body.classList.toggle('is-mobile-portrait', isPortrait && isNarrow);
}

function registerViewportClassSync() {
  syncViewportClasses();
  if (runtime.viewportClassRegistered || typeof window === 'undefined') {
    return;
  }

  runtime.viewportClassRegistered = true;
  window.addEventListener('resize', syncViewportClasses, { passive: true });
  window.addEventListener('orientationchange', syncViewportClasses);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocalhost && window.location.protocol !== 'https:') {
    return;
  }

  window.addEventListener('load', () => {
    let refreshing = false;
    const triggerReload = () => {
      if (refreshing) {
        return;
      }
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', triggerReload);

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.update().catch(() => {});
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) {
            return;
          }

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              triggerReload();
            }
          });
        });
      })
      .catch(() => {});
  });
}

async function bootstrap() {
  registerGlobalErrorBoundary();
  formatToday();
  registerViewportClassSync();
  registerStatePollingEvents();
  await loadRuntimeMeta();
  state.selectedDate = state.selectedDate || toLocalIsoDate(new Date());
  loadStateFromLocal();

  await checkAuth();

  if (runtime.isServerSync) {
    const serverState = await loadServerState();
    if (serverState) {
      const localBackup = {
        todos: [...state.todos],
        doneLog: [...state.doneLog],
        calendarItems: [...state.calendarItems],
        bucketLabels: { ...state.bucketLabels },
        bucketOrder: [...state.bucketOrder],
        bucketVisibility: { ...state.bucketVisibility },
        projectLanes: [...state.projectLanes],
        userProfile: { ...state.userProfile },
      };

      if (serverState.exists && serverState.hasData) {
        applyServerStateSnapshot(serverState.state, Number(serverState.version || 0), {
          shouldRender: false,
          shouldPersist: false,
        });
      } else if (hasStoredData(localBackup)) {
        queueSync();
      }
    }

    await refreshCollabSummary({ includeTodos: true });
  }

  ensureDataIntegrity();
  saveLocalState();
  ensureBucketColumns();
  ensureBucketSelectOptions();
  initializeRouteModules();
  setupRouter();
  registerEvents();
  updateAuthUI();
  await ensureHolidayDataForYear(state.currentMonth.getFullYear()).catch(() => {});
  render();

  const searchParams = new URLSearchParams(window.location.search);
  const auth = searchParams.get('auth');
  if (auth === 'error') {
    alert('카카오 로그인 중 오류가 발생했습니다.');
  }
}

bootstrap().catch((error) => {
  registerGlobalErrorBoundary();
  console.error('[bootstrap]', error);

  try {
    registerViewportClassSync();
    registerStatePollingEvents();
    state.selectedDate = state.selectedDate || toLocalIsoDate(new Date());
    loadStateFromLocal();
    ensureDataIntegrity();
    saveLocalState();
    ensureBucketColumns();
    ensureBucketSelectOptions();
    initializeRouteModules();
    setupRouter();
    registerEvents();
    updateAuthUI();
    render();

    showToast('초기화 중 일부 오류가 발생했지만 앱을 복구했습니다.', 'error');
  } catch (fallbackError) {
    handleFatalError(fallbackError);
  }
});

registerServiceWorker();
