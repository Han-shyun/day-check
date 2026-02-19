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
const TODO_STORAGE_KEY = 'day-check.main.todos.v4';
const DONE_STORAGE_KEY = 'day-check.main.doneLog.v1';
const CALENDAR_STORAGE_KEY = 'day-check.main.calendarItems.v1';
const CATEGORY_STORAGE_KEY = 'day-check.main.categories.v1';
const BUCKET_LABELS_STORAGE_KEY = 'day-check.main.bucketLabels.v1';
const BUCKET_ORDER_STORAGE_KEY = 'day-check.main.bucketOrder.v1';
const BUCKET_VISIBILITY_STORAGE_KEY = 'day-check.main.bucketVisibility.v1';
const PROJECT_LANES_STORAGE_KEY = 'day-check.main.projectLanes.v1';
const USER_PROFILE_STORAGE_KEY = 'day-check.main.userProfile.v1';
const LEGACY_TODO_KEYS = ['day-check.main.todos.v3', 'day-check.main.todos.v2'];

const API_BASE = '/api';
const SYNC_DEBOUNCE_MS = 500;

const defaultCategories = [{ id: 'uncategorized', name: '미분류' }];
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
  categories: [...defaultCategories],
  bucketLabels: { ...defaultBucketLabels },
  bucketOrder: [...buckets],
  bucketVisibility: { ...defaultBucketVisibility },
  projectLanes: [],
  userProfile: { ...defaultUserProfile },
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: '',
  version: 0,
};

let isServerSync = false;
let authUser = null;
let pendingSync = false;
let syncing = false;
let syncTimer = null;
let eventsRegistered = false;
let columnResizeObserver = null;
let toastHostEl = null;
let calendarMode = 'note';

const dateEl = document.getElementById('todayDate');
const todoCountEl = document.getElementById('todoCount');
const todoListEl = document.getElementById('todoList');
const todoTemplate = document.getElementById('todoItemTemplate');
const boardEl = document.querySelector('.board');

const todoComposer = document.getElementById('todoComposer');
const todoTextarea = document.getElementById('todoTextarea');
const composerDate = document.getElementById('composerDate');
const composerPriority = document.getElementById('composerPriority');
const composerCategory = document.getElementById('composerCategory');
const openCategoryInlineBtn = document.getElementById('openCategoryInlineBtn');
const inlineCategoryCreate = document.getElementById('inlineCategoryCreate');
const newCategoryInput = document.getElementById('newCategoryInput');
const createCategoryBtn = document.getElementById('createCategoryBtn');
const cancelCategoryBtn = document.getElementById('cancelCategoryBtn');

const authStatusEl = document.getElementById('authStatus');
const authBtn = document.getElementById('authBtn');

const weekRangeEl = document.getElementById('weekRange');
const quickForm = document.getElementById('quickAddForm');
const quickAddBody = document.getElementById('quickAddBody');
const toggleQuickAddBtn = document.getElementById('toggleQuickAddBtn');
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
const saveProfileBtn = document.getElementById('saveProfileBtn');
const cancelProfileBtn = document.getElementById('cancelProfileBtn');

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

function hasBrokenText(value) {
  const text = String(value || '');
  if (!text) {
    return false;
  }
  if (/[\uFFFD]/u.test(text)) {
    return true;
  }
  return /\?[^\s"'`<>()[\]{}=]{1,3}/u.test(text);
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

  return HOLIDAYS_BY_YEAR[year]?.[dateText] || fallback;
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
  if (HOLIDAYS_BY_YEAR[yearText] || HOLIDAYS_REQUEST[yearText]) {
    return HOLIDAYS_REQUEST[yearText] || Promise.resolve(HOLIDAYS_BY_YEAR[yearText]);
  }

  const promise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/holidays?year=${encodeURIComponent(yearText)}`, {
        headers: {
          'cache-control': 'no-store',
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        HOLIDAYS_BY_YEAR[yearText] = {};
        return {};
      }

      const payload = await response.json();
      const holidayMap = normalizeHolidayMap(payload?.holidays);
      HOLIDAYS_BY_YEAR[yearText] = holidayMap;
      return HOLIDAYS_BY_YEAR[yearText];
    } catch {
      HOLIDAYS_BY_YEAR[yearText] = HOLIDAYS_BY_YEAR[yearText] || {};
      return {};
    } finally {
      HOLIDAYS_REQUEST[yearText] = null;
    }
  })();

  HOLIDAYS_REQUEST[yearText] = promise;
  promise.catch(() => {
    HOLIDAYS_BY_YEAR[yearText] = HOLIDAYS_BY_YEAR[yearText] || {};
  });
  return promise;
}

function ensureHolidayDataForYear(year) {
  const yearText = String(year);
  if (HOLIDAYS_BY_YEAR[yearText] || HOLIDAYS_REQUEST[yearText]) {
    return HOLIDAYS_REQUEST[yearText] || Promise.resolve(HOLIDAYS_BY_YEAR[yearText]);
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
  const categories = safeJsonParse(CATEGORY_STORAGE_KEY);
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

  const categoriesFallback =
    Array.isArray(categories) && categories.length > 0
      ? categories.filter(
          (category) =>
            category &&
            typeof category.id === 'string' &&
            typeof category.name === 'string' &&
            !hasBrokenText(category.name),
        )
      : [];

  state.categories =
    categoriesFallback.length > 0
      ? categoriesFallback
      : [...defaultCategories];
  state.bucketLabels = normalizeBucketLabels(bucketLabels);
  state.bucketOrder = normalizeBucketOrder(bucketOrder);
  state.bucketVisibility = normalizeBucketVisibility(bucketVisibility);
  state.projectLanes = normalizeProjectLanes(projectLanes);
  state.userProfile = normalizeUserProfile(userProfile);

  ensureCategoryIntegrity();
  ensureDateInState();
}

function normalizeTodos(todos) {
  return todos
    .filter((todo) => todo && (todo.title || typeof todo.title === 'string'))
    .map((todo) => ({
      id: todo.id || crypto.randomUUID(),
      title: String(todo.title || '').trim(),
      details: normalizeTodoDetails(todo.details || todo.description || ''),
      categoryId: todo.categoryId || todo.bucketId || todo.bucket || 'uncategorized',
      projectLaneId: typeof todo.projectLaneId === 'string' ? todo.projectLaneId : '',
      bucket: normalizeBucketIdOrDefault(todo.bucket, 'bucket4'),
      priority: Number(todo.priority || 2),
      dueDate: String(todo.dueDate || '').trim(),
      createdAt: todo.createdAt || new Date().toISOString(),
    }))
    .filter((todo) => todo.title);
}

function normalizeBucketLabels(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return buckets.reduce((acc, bucket) => {
    const rawValue = getBucketFieldValue(source, bucket);
    const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
    const safeLabel = raw && !hasBrokenText(raw) ? raw : '';
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
  return hasBrokenText(normalized) ? '' : normalized;
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

    const categoryId =
      typeof item.categoryId === 'string' && item.categoryId.trim()
        ? item.categoryId.trim()
        : '';
    const width = Number(item.width || 0);
    const height = Number(item.height || 0);

    laneIds.add(id);
    normalized.push({
      id,
      name,
      bucket,
      categoryId,
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
      categoryId: item.categoryId || 'uncategorized',
      projectLaneId: typeof item.projectLaneId === 'string' ? item.projectLaneId : '',
      bucket: normalizeBucketIdOrDefault(item.bucket, 'bucket4'),
      priority: Number(item.priority || 2),
      dueDate: String(item.dueDate || ''),
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

function normalizeCategoryState(input) {
  const categories =
    Array.isArray(input)
      ? input.filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            !hasBrokenText(item.name),
        )
      : [];

  const fixed =
    categories.length > 0
      ? categories
      : [...defaultCategories];

  if (!fixed.some((item) => item.id === 'uncategorized')) {
    fixed.unshift({ id: 'uncategorized', name: '미분류' });
  }

  return fixed;
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
    categories: normalizeCategoryState(payload?.categories || []),
    userProfile: normalizeUserProfile(payload?.userProfile || {}),
    currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: state.selectedDate || toLocalIsoDate(new Date()),
    version: Number(payload?.version || 0),
  };
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
    (Array.isArray(payload.categories) && payload.categories.length > 1) ||
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
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(state.categories));
  localStorage.setItem(BUCKET_LABELS_STORAGE_KEY, JSON.stringify(state.bucketLabels));
  localStorage.setItem(BUCKET_ORDER_STORAGE_KEY, JSON.stringify(state.bucketOrder));
  localStorage.setItem(BUCKET_VISIBILITY_STORAGE_KEY, JSON.stringify(state.bucketVisibility));
  localStorage.setItem(PROJECT_LANES_STORAGE_KEY, JSON.stringify(state.projectLanes));
  localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(state.userProfile));
}

function ensureCategoryIntegrity() {
  if (state.categories.length === 0) {
    state.categories = [...defaultCategories];
  }

  if (!state.categories.some((item) => item.id === 'uncategorized')) {
    state.categories.unshift({ id: 'uncategorized', name: '미분류' });
  }

  ensureProjectLaneIntegrity();

  const ids = new Set(state.categories.map((item) => item.id));
  state.todos = state.todos.map((todo) => ({
    ...todo,
    categoryId: ids.has(todo.categoryId) ? todo.categoryId : 'uncategorized',
  }));
}

function getProjectLanesByBucket(bucket) {
  return state.projectLanes.filter((lane) => lane.bucket === bucket);
}

function ensureProjectLaneIntegrity() {
  state.projectLanes = normalizeProjectLanes(state.projectLanes);
  const laneIds = new Set(state.projectLanes.map((lane) => lane.id));
  const laneById = new Map(state.projectLanes.map((lane) => [lane.id, lane]));
  const legacyCategoryToLaneId = new Map(
    state.projectLanes
      .filter((lane) => typeof lane.categoryId === 'string' && lane.categoryId)
      .map((lane) => [lane.categoryId, lane.id]),
  );

  const resolveLaneId = (entry) => {
    const current = typeof entry.projectLaneId === 'string' ? entry.projectLaneId : '';
    if (current && laneIds.has(current)) {
      const lane = laneById.get(current);
      if (lane && lane.bucket === entry.bucket) {
        return current;
      }
    }
    const legacy = legacyCategoryToLaneId.get(entry.categoryId || '');
    if (legacy && laneIds.has(legacy)) {
      const lane = laneById.get(legacy);
      if (lane && lane.bucket === entry.bucket) {
        return legacy;
      }
    }
    const sameBucketLane = state.projectLanes.find(
      (lane) => lane.bucket === entry.bucket && lane.name === entry.categoryId,
    );
    if (sameBucketLane) {
      return sameBucketLane.id;
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

  state.todos = state.todos.map((todo) => ({
    ...todo,
    projectLaneId: mapLane(todo),
  }));

  state.doneLog = state.doneLog.map((item) => ({
    ...item,
    projectLaneId: mapLane(item),
  }));
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
    categoryId: '',
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
  buckets.forEach((bucket) => {
    visibility[bucket] = true;
  });
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
  if (columnResizeObserver) {
    columnResizeObserver.disconnect();
    columnResizeObserver = null;
  }
}

function renderProjectLaneColumns() {
  if (!boardEl) {
    return;
  }

  boardEl.querySelectorAll('.column[data-project-lane-id]').forEach((column) => {
    if (columnResizeObserver) {
      columnResizeObserver.unobserve(column);
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
    addBtn.className = 'column-remove-btn bucket-lane-add-btn';
    addBtn.setAttribute('aria-label', `${getBucketLabel(bucket)} 세부 추가`);
    addBtn.setAttribute('aria-expanded', 'false');
    addBtn.setAttribute('aria-pressed', 'false');
    addBtn.textContent = '+';
    const laneCreate = document.createElement('div');
    laneCreate.className = 'inline-category-create hidden bucket-lane-create';
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

function renderTodoItems(listEl, todos) {
  todos.forEach((todo) => {
    const item = todoTemplate.content.firstElementChild.cloneNode(true);
    const titleEl = item.querySelector('.title');
    const metaEl = item.querySelector('.meta');
    const detailsEl = item.querySelector('.todo-detail-input');
    const completeBtn = item.querySelector('.complete');
    const deleteBtn = item.querySelector('.delete');
    const projectSelect = item.querySelector('.todo-category-select');

    titleEl.textContent = todo.title;
    const dateText = todo.dueDate ? ` / 마감일 ${todo.dueDate}` : '';
    const projectText = ` / 프로젝트 ${getProjectLaneName(todo.projectLaneId) || '미지정'}`;
    metaEl.textContent = `우선순위: ${priorityLabel[todo.priority] || '없음'}${dateText}${projectText}`;
    bindTodoDetailsInput(detailsEl, todo);

    renderProjectLaneOptions(projectSelect, todo);
    projectSelect.addEventListener('change', () => {
      todo.projectLaneId = projectSelect.value;
      render();
      queueSync();
    });

    completeBtn.addEventListener('click', () => {
      state.doneLog.unshift({
        id: todo.id,
        title: todo.title,
        details: todo.details || '',
        categoryId: todo.categoryId,
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

function normalizeTodoDetails(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .slice(0, 1200);
}

function createTodo({
  title,
  details = '',
  categoryId = 'uncategorized',
  projectLaneId = '',
  bucket = 'bucket4',
  priority = 2,
  dueDate = '',
}) {
  return {
    id: crypto.randomUUID(),
    title,
    details: normalizeTodoDetails(details),
    categoryId,
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
  if (toastHostEl && document.body.contains(toastHostEl)) {
    return toastHostEl;
  }

  toastHostEl = document.getElementById('toastHost');
  if (!toastHostEl) {
    toastHostEl = document.createElement('div');
    toastHostEl.id = 'toastHost';
    toastHostEl.className = 'toast-host';
    document.body.appendChild(toastHostEl);
  }

  return toastHostEl;
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

function markStateDirty() {
  saveLocalState();

  if (!isServerSync) {
    return;
  }

  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncState().catch(() => {});
  }, SYNC_DEBOUNCE_MS);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  return response;
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift() || '';
  }
  return '';
}

function getProfileDisplayName() {
  const profile = normalizeUserProfile(state.userProfile);
  if (profile.nickname) {
    return `${profile.nickname}${profile.honorific}`;
  }
  if (isServerSync && authUser) {
    const fallback = authUser.nickname || authUser.email || '';
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
    isServerSync = false;
    authUser = null;
    state.version = 0;
    return;
  }

  isServerSync = true;
  authUser = me.user;
}

function updateAuthUI() {
  if (!authStatusEl || !authBtn) {
    return;
  }

  updateProfileAliasUI();
  if (isServerSync && authUser) {
    const label = authUser.nickname || authUser.email || `kakao-${authUser.kakaoId || ''}`;
    authStatusEl.textContent = `로그인 상태: ${label}`;
    authBtn.innerHTML = '<span>로그아웃</span>';
  } else {
    authStatusEl.textContent = '로그인 필요';
    authBtn.innerHTML = '<span class="kakao-logo" aria-hidden="true">K</span><span>카카오 로그인</span>';
  }
}

async function checkAuth() {
  try {
    const response = await apiRequest('/auth/me', { method: 'GET' });
    if (!response.ok) {
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
    const response = await apiRequest('/state', { method: 'GET' });
    if (!response.ok) {
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

async function syncState() {
  if (!isServerSync || !authUser || syncing) {
    return;
  }

  syncing = true;
  try {
    const response = await apiRequest('/state', {
      method: 'PUT',
      headers: {
        'x-csrf-token': getCookie('daycheck_csrf') || '',
      },
      body: JSON.stringify({
        todos: state.todos,
        doneLog: state.doneLog,
        calendarItems: state.calendarItems,
        categories: state.categories,
        bucketLabels: state.bucketLabels,
        bucketOrder: state.bucketOrder,
        bucketVisibility: state.bucketVisibility,
        projectLanes: state.projectLanes,
        userProfile: state.userProfile,
        version: state.version,
      }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        const data = await response.json();
        if (data && data.state) {
          const restored = normalizeStateFromServer(data.state);
          state.todos = restored.todos;
          state.doneLog = restored.doneLog;
          state.calendarItems = restored.calendarItems;
          state.categories = normalizeCategoryState(data.state?.categories || state.categories);
          state.bucketLabels = normalizeBucketLabels(data.state?.bucketLabels || state.bucketLabels);
          state.bucketOrder = normalizeBucketOrder(data.state?.bucketOrder || state.bucketOrder);
          state.bucketVisibility = normalizeBucketVisibility(data.state?.bucketVisibility || state.bucketVisibility);
          state.projectLanes = normalizeProjectLanes(data.state?.projectLanes || state.projectLanes);
          state.userProfile = normalizeUserProfile(data.state?.userProfile || state.userProfile);
          state.version = Number(data.version || state.version);
          ensureCategoryIntegrity();
          render();
        }
      }
      return;
    }

    const result = await response.json();
    state.version = Number(result.version || state.version);
  } catch {
    // Keep local data and retry on next edit.
  } finally {
    syncing = false;
  }

  if (pendingSync) {
    pendingSync = false;
    syncState().catch(() => {});
  }
}

function queueSync(immediate = false) {
  saveLocalState();

  if (!isServerSync) {
    return;
  }

  if (syncing) {
    pendingSync = true;
    return;
  }

  if (immediate) {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    syncState().catch(() => {});
    return;
  }

  markStateDirty();
}

function render() {
  ensureBucketColumns();
  ensureBucketSelectOptions();
  applyBucketOrder();
  renderProjectLaneColumns();
  applyBucketSizes();
  applyProjectLaneSizes();
  applyBucketVisibility();
  applyBucketLabels();
  renderTodoComposer();
  renderTodoList();
  renderTodosByBucket();
  renderCalendar();
  renderSelectedDatePanel();
  renderWeeklyReport();
  updateProfileAliasUI();
}

function renderTodoComposer() {
  if (!composerCategory) {
    return;
  }
  composerCategory.innerHTML = '';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = '세부 프로젝트 없음';
  composerCategory.appendChild(noneOption);
  state.projectLanes
    .filter((lane) => lane.bucket === 'bucket4')
    .forEach((lane) => {
      const option = document.createElement('option');
      option.value = lane.id;
      option.textContent = lane.name;
      composerCategory.appendChild(option);
    });
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
  }
}

function countDailyStats(dateText) {
  const scheduledCount = state.todos.filter((todo) => todo.dueDate === dateText).length;
  const completedCount = state.doneLog.filter((item) => parseIsoDate(item.completedAt) === dateText).length;
  return { scheduledCount, completedCount };
}

function getEntriesForDate(dateText) {
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
  const notes = state.calendarItems.filter((item) =>
    isDateInCalendarRange(targetDate, item.date, item.endDate || item.date),
  );

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
  return calendarMode === 'todo';
}

function setCalendarMode(mode) {
  calendarMode = mode === 'todo' ? 'todo' : 'note';
  applyCalendarFormMode();
}

function applyCalendarFormMode() {
  const isTodo = isCalendarTodoMode();
  calendarModeButtons.forEach((button) => {
    const buttonMode = button.dataset.calendarMode;
    const isActive = buttonMode === calendarMode;
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

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const yearText = String(year);
  if (!HOLIDAYS_BY_YEAR[yearText]) {
    ensureHolidayDataForYear(year).finally(() => {
      render();
    });
  }

  const firstDate = new Date(year, month, 1);
  const dayCount = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDate.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + dayCount) / 7) * 7;

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
    dailySummary.textContent = `일정 ${scheduledCount} / 완료 ${completedCount}`;
    const weekendLabel = weekendType === 'saturday' ? ' 토요일' : weekendType === 'sunday' ? ' 일요일' : '';
    const holidayDescription = isHoliday ? `, 공휴일(${holidayLabel})` : '';
    cell.setAttribute(
      'aria-label',
      `${month + 1}월 ${dayNumber}일${weekendLabel}, ${dailySummary.textContent}${holidayDescription}`,
    );
    cell.appendChild(dailySummary);

    const entries = getEntriesForDate(dateText);

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '일정 없음';
      cell.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'calendar-item-list';

      entries.slice(0, 3).forEach((entry) => {
        const li = document.createElement('li');
        li.className = `calendar-item ${entry.type === 'note' ? 'is-note' : 'is-todo'}`;
        if (entry.isRange) {
          li.classList.add('is-range', `is-range-${entry.rangePosition}`);
          if (entry.rangePosition !== 'start') {
            li.classList.add('is-range-continuation');
          }
        }

        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = entry.isRange ? '장기' : typeLabel[entry.type] || entry.type;

        const text = document.createElement('span');
        text.className = 'calendar-item-text';
        text.textContent = entry.isRange && entry.rangePosition !== 'start' ? ' ' : entry.text;

        li.appendChild(badge);
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

      if (entries.length > 3) {
        const more = document.createElement('li');
        more.className = 'calendar-more';
        more.textContent = `+${entries.length - 3}건`;
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
  if (eventsRegistered) {
    return;
  }
  eventsRegistered = true;

  registerBucketResizeObserver();
  registerBucketTitleEditors();
  registerBucketLaneControls();

  if (todoComposer) {
    todoComposer.addEventListener('submit', (event) => {
      event.preventDefault();

      const lines = todoTextarea.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return;
      }

      lines.forEach((title) => {
        state.todos.unshift(
          createTodo({
            title,
            categoryId: composerCategory?.value || 'uncategorized',
            bucket: 'bucket4',
            priority: Number(composerPriority?.value || 2),
            dueDate: composerDate?.value || '',
          }),
        );
      });

      saveLocalState();
      queueSync();
      render();
      todoTextarea.value = '';
      if (composerDate) {
        composerDate.value = '';
      }
      if (composerPriority) {
        composerPriority.value = '2';
      }
      if (todoTextarea) {
        todoTextarea.focus();
      }
    });
  }

  if (openCategoryInlineBtn && inlineCategoryCreate) {
    openCategoryInlineBtn.setAttribute('aria-pressed', 'false');
    openCategoryInlineBtn.addEventListener('click', () => {
      const isHidden = inlineCategoryCreate.classList.contains('hidden');
      const nextHidden = !isHidden;
      inlineCategoryCreate.classList.toggle('hidden', nextHidden);
      openCategoryInlineBtn.classList.toggle('is-active', !nextHidden);
      openCategoryInlineBtn.setAttribute('aria-pressed', String(!nextHidden));
      if (!nextHidden && newCategoryInput) {
        newCategoryInput.focus();
      }
    });

    cancelCategoryBtn?.addEventListener('click', () => {
      newCategoryInput.value = '';
      inlineCategoryCreate.classList.add('hidden');
      openCategoryInlineBtn.classList.remove('is-active');
      openCategoryInlineBtn.setAttribute('aria-pressed', 'false');
    });

    createCategoryBtn?.addEventListener('click', () => {
      const name = newCategoryInput?.value?.trim?.() || '';
      if (!name) {
        return;
      }

      const exists = state.categories.find((item) => item.name === name);
      if (exists) {
        if (composerCategory) {
          composerCategory.value = exists.id;
        }
        newCategoryInput.value = '';
        inlineCategoryCreate.classList.add('hidden');
        return;
      }

      const category = { id: crypto.randomUUID(), name };
      state.categories.push(category);
      ensureCategoryIntegrity();
      newCategoryInput.value = '';
      if (composerCategory) {
        composerCategory.value = category.id;
      }
      inlineCategoryCreate.classList.add('hidden');
      openCategoryInlineBtn.classList.remove('is-active');
      openCategoryInlineBtn.setAttribute('aria-pressed', 'false');
      render();
      queueSync();
    });

    newCategoryInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        createCategoryBtn.click();
      }
    });
  }

  if (quickForm) {
    const hideQuickAdd = () => {
      if (quickAddBody) {
        quickAddBody.classList.add('hidden');
      }
      if (toggleQuickAddBtn) {
        toggleQuickAddBtn.setAttribute('aria-expanded', 'false');
        toggleQuickAddBtn.setAttribute('aria-pressed', 'false');
        toggleQuickAddBtn.textContent = '펼치기';
        toggleQuickAddBtn.classList.remove('is-active');
      }
    };
    const showQuickAdd = () => {
      if (quickAddBody) {
        quickAddBody.classList.remove('hidden');
      }
      if (toggleQuickAddBtn) {
        toggleQuickAddBtn.setAttribute('aria-expanded', 'true');
        toggleQuickAddBtn.setAttribute('aria-pressed', 'true');
        toggleQuickAddBtn.textContent = '접기';
        toggleQuickAddBtn.classList.add('is-active');
      }
      if (quickInput) {
        quickInput.focus();
      }
    };

    toggleQuickAddBtn?.addEventListener('click', () => {
      if (quickAddBody?.classList.contains('hidden')) {
        showQuickAdd();
      } else {
        hideQuickAdd();
      }
    });

    hideQuickAdd();

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
      showQuickAdd();
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

    saveProfileBtn.addEventListener('click', () => {
      state.userProfile = normalizeUserProfile({
        nickname: profileNicknameInput.value,
        honorific: profileHonorificInput.value,
      });
      saveLocalState();
      updateAuthUI();
      hideProfileEditor();
      showToast('호칭을 저장했습니다.', 'success');
    });

    cancelProfileBtn.addEventListener('click', () => {
      hideProfileEditor();
    });

    [profileNicknameInput, profileHonorificInput].forEach((input) => {
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
      if (!isServerSync) {
        window.location.href = '/api/auth/kakao';
        return;
      }

      try {
        await apiRequest('/auth/logout', {
          method: 'POST',
          headers: {
            'x-csrf-token': getCookie('daycheck_csrf') || '',
          },
        });
      } catch {
        // ignore
      }

      isServerSync = false;
      authUser = null;
      state.version = 0;
      updateAuthUI();
    });
  }
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
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

async function bootstrap() {
  formatToday();
  state.selectedDate = state.selectedDate || toLocalIsoDate(new Date());
  loadStateFromLocal();

  await checkAuth();

  if (isServerSync) {
    const serverState = await loadServerState();
    if (serverState) {
      const localBackup = {
        todos: [...state.todos],
        doneLog: [...state.doneLog],
        calendarItems: [...state.calendarItems],
        categories: [...state.categories],
        bucketLabels: { ...state.bucketLabels },
        bucketOrder: [...state.bucketOrder],
        bucketVisibility: { ...state.bucketVisibility },
        projectLanes: [...state.projectLanes],
        userProfile: { ...state.userProfile },
      };

      if (serverState.exists && serverState.hasData) {
        const merged = normalizeStateFromServer({ ...serverState.state, version: serverState.version });
        state.todos = merged.todos;
        state.doneLog = merged.doneLog;
        state.calendarItems = merged.calendarItems;
        state.bucketLabels = normalizeBucketLabels(merged.bucketLabels);
        state.bucketOrder = normalizeBucketOrder(merged.bucketOrder);
        state.bucketVisibility = normalizeBucketVisibility(merged.bucketVisibility);
        state.projectLanes = normalizeProjectLanes(merged.projectLanes);
        state.categories = normalizeCategoryState(merged.categories);
        state.userProfile = normalizeUserProfile(merged.userProfile || state.userProfile);
        state.version = Number(serverState.version || 0);
      } else if (hasStoredData(localBackup)) {
        queueSync();
      }
    }
  }

  ensureCategoryIntegrity();
  saveLocalState();
  ensureBucketColumns();
  ensureBucketSelectOptions();
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

bootstrap().catch(() => {
  ensureBucketColumns();
  ensureBucketSelectOptions();
  updateAuthUI();
  registerEvents();
  render();
});

registerServiceWorker();



