import {
  TODO_STORAGE_KEY,
  DONE_STORAGE_KEY,
  CALENDAR_STORAGE_KEY,
  BUCKET_LABELS_STORAGE_KEY,
  BUCKET_ORDER_STORAGE_KEY,
  BUCKET_VISIBILITY_STORAGE_KEY,
  PROJECT_LANES_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY,
  LEGACY_TODO_KEYS,
  CONFLICT_BACKUP_STORAGE_KEY,
  SYNC_DEBOUNCE_MS,
  buckets,
  defaultBucketLabels,
  defaultBucketVisibility,
  defaultUserProfile,
} from '../core/constants.js';
import { state, runtime } from '../core/app-context.js';
import { clampCalendarRangeEnd, parseIsoDate, toLocalIsoDate } from '../core/date-utils.js';
import { hasBrokenText } from '../core/ui-utils.js';

let _render = () => {};
let _syncState = () => Promise.resolve();
let _showToast = () => {};
let _showBrokenTextFilteredToast = () => {};
let _queueSync = () => {};

export function initStateDeps({ render, syncState, showToast, showBrokenTextFilteredToast, queueSync } = {}) {
  if (typeof render === 'function') {
    _render = render;
  }
  if (typeof syncState === 'function') {
    _syncState = syncState;
  }
  if (typeof showToast === 'function') {
    _showToast = showToast;
  }
  if (typeof showBrokenTextFilteredToast === 'function') {
    _showBrokenTextFilteredToast = showBrokenTextFilteredToast;
  }
  if (typeof queueSync === 'function') {
    _queueSync = queueSync;
  }
}

export function safeJsonParse(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

export function normalizeBucketId(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const normalized = raw.trim();
  if (!normalized) {
    return '';
  }
  return normalized;
}

export function normalizeBucketIdOrDefault(raw, fallback = '') {
  const normalized = normalizeBucketId(raw);
  return buckets.includes(normalized) ? normalized : fallback;
}

export function getBucketFieldValue(input, bucket) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  return Object.prototype.hasOwnProperty.call(input, bucket) ? input[bucket] : undefined;
}

export function ensureDateInState() {
  if (!state.selectedDate) {
    state.selectedDate = toLocalIsoDate(new Date());
  }
}

export function loadStateFromLocal() {
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

export function normalizeTodoSubtasks(subtasks) {
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

export function normalizeTodoMemos(memos) {
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

export function normalizeTodoDetails(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .slice(0, 1200);
}

export function normalizeTodos(todos) {
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

function normalizeBucketLabel(raw) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeBucketLabels(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return buckets.reduce((acc, bucket) => {
    const rawValue = getBucketFieldValue(source, bucket);
    const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
    const isBroken = raw && hasBrokenText(raw);
    if (isBroken) {
      _showBrokenTextFilteredToast('버킷 이름', raw);
    }
    const safeLabel = raw && !isBroken ? raw : '';
    acc[bucket] = safeLabel || defaultBucketLabels[bucket] || bucket;
    return acc;
  }, {});
}

export function normalizeBucketOrder(input = []) {
  const source = Array.isArray(input)
    ? input.map((bucket) => normalizeBucketId(bucket)).filter((bucket) => buckets.includes(bucket))
    : [];
  const unique = [...new Set(source)];
  const missing = buckets.filter((bucket) => !unique.includes(bucket));
  return [...unique, ...missing];
}

export function normalizeBucketVisibility(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const visibility = buckets.reduce((acc, bucket) => {
    const value = getBucketFieldValue(source, bucket);
    acc[bucket] = typeof value === 'boolean' ? value : defaultBucketVisibility[bucket] !== false;
    return acc;
  }, {});

  if (!buckets.some((bucket) => visibility[bucket] !== false)) {
    visibility[buckets[0]] = true;
  }
  return visibility;
}

export function normalizeProjectLaneName(raw) {
  const normalized = normalizeBucketLabel(raw).slice(0, 30);
  if (normalized && hasBrokenText(normalized)) {
    _showBrokenTextFilteredToast('세부 프로젝트 이름', normalized);
    return '';
  }
  return normalized;
}

export function normalizeProjectLanes(input = []) {
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

export function normalizeDoneLog(doneLog) {
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

export function normalizeCalendarItems(items) {
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

export function normalizeUserProfile(input = {}) {
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

export function normalizeStateFromServer(payload) {
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

export function applyServerStateSnapshot(payload, version, options = {}) {
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
    _render();
  }
}

export function hasStoredData(payload) {
  const bucketLabels = payload?.bucketLabels || {};
  const bucketOrder = normalizeBucketOrder(payload?.bucketOrder || []);
  const bucketVisibility = normalizeBucketVisibility(payload?.bucketVisibility || {});
  const normalizedBucketLabels = normalizeBucketLabels(bucketLabels);
  const normalizedUserProfile = normalizeUserProfile(payload?.userProfile || {});
  const hasCustomBucketLabels = Object.keys(defaultBucketLabels).some(
    (bucket) => normalizedBucketLabels[bucket] && normalizedBucketLabels[bucket] !== defaultBucketLabels[bucket],
  );
  const hasCustomBucketOrder = bucketOrder.some((bucket, index) => bucket !== buckets[index]);
  const hasCustomBucketVisibility = buckets.some(
    (bucket) => bucketVisibility[bucket] !== defaultBucketVisibility[bucket],
  );
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

export function saveLocalState() {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state.todos));
  localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(state.doneLog));
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(state.calendarItems));
  localStorage.setItem(BUCKET_LABELS_STORAGE_KEY, JSON.stringify(state.bucketLabels));
  localStorage.setItem(BUCKET_ORDER_STORAGE_KEY, JSON.stringify(state.bucketOrder));
  localStorage.setItem(BUCKET_VISIBILITY_STORAGE_KEY, JSON.stringify(state.bucketVisibility));
  localStorage.setItem(PROJECT_LANES_STORAGE_KEY, JSON.stringify(state.projectLanes));
  localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(state.userProfile));
}

export function ensureDataIntegrity() {
  ensureProjectLaneIntegrity();
}

export function ensureProjectLaneIntegrity() {
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

export function markStateDirty() {
  saveLocalState();

  if (!runtime.isServerSync) {
    return;
  }

  if (runtime.syncTimer) {
    clearTimeout(runtime.syncTimer);
  }
  runtime.syncTimer = setTimeout(() => {
    runtime.syncTimer = null;
    _syncState().catch(() => {});
  }, SYNC_DEBOUNCE_MS);
}

export function hasPendingLocalChanges() {
  return runtime.localDirty || runtime.syncing || runtime.pendingSync || Boolean(runtime.syncTimer);
}

export function snapshotSyncStatePayload() {
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

export function backupConflictSnapshot(remotePayload = {}) {
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

export function handleVersionConflict(payload = {}) {
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
    _queueSync(true);
    _showToast('버전 충돌 시 기존 변경 유지 후 재저장을 시도합니다.', 'error');
    _showToast('내 변경을 유지하고 다시 저장을 시도합니다.', 'error');
  }

  applyServerStateSnapshot(remoteState, remoteVersion);
  _showToast('동기화 충돌 응답을 확인했습니다.', 'info');
  _showToast('서버 최신 상태를 적용했습니다.', 'info');
}
