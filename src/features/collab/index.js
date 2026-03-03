import { config, runtime, state } from '../../core/app-context.js';
import {
  CONFLICT_BACKUP_STORAGE_KEY,
  buckets,
} from '../../core/constants.js';
import {
  apiRequest as coreApiRequest,
  getCookie,
} from '../../core/sync.js';
import {
  normalizeBucketIdOrDefault,
  normalizeUserProfile,
  saveLocalState as stateSaveLocalState,
  applyServerStateSnapshot,
  markStateDirty as stateMarkStateDirty,
} from '../../state/index.js';
import { priorityLabel } from '../../core/constants.js';
import {
  formatDisplayDateTime,
  isDateInCalendarRange,
} from '../../core/date-utils.js';
import {
  authBtn,
  authStatusEl,
  boardEl,
  collabInviteBucketSelectEl,
  collabInviteTargetInputEl,
  collabMembershipListEl,
  collabPanelEl,
  collabProfileBadgeEl,
  collabReceivedInvitesEl,
  collabSentInvitesEl,
  profilePublicIdHint,
  profilePublicIdInput,
  userAliasPreviewEl,
} from '../../core/dom-refs.js';
import { getBucketLabel } from '../bucket/index.js';
import {
  collabContextKey,
  parseCollabContextKey,
  normalizePublicIdInput,
  isValidPublicId,
} from './model.js';

let apiRequestImpl = coreApiRequest;
let showToastImpl = () => {};
let addEmptyMessageImpl = () => {};
let _renderImpl = () => {};
let stateSaveLocalStateImpl = stateSaveLocalState;
let markStateDirtyImpl = stateMarkStateDirty;
let applyServerStateSnapshotImpl = applyServerStateSnapshot;
let hasPendingLocalChangesImpl = () =>
  runtime.localDirty || runtime.syncing || runtime.pendingSync || Boolean(runtime.syncTimer);
let safeReadJsonImpl = (response) => response.json().catch(() => ({}));
let loadStateFromLocalImpl = () => ({});

function showToast(...args) {
  return showToastImpl(...args);
}

function addEmptyMessage(...args) {
  return addEmptyMessageImpl(...args);
}

function apiRequest(path, options = {}) {
  return apiRequestImpl(path, options);
}

function saveLocalState(...args) {
  return stateSaveLocalStateImpl(...args);
}

function markStateDirty() {
  return markStateDirtyImpl();
}

function render() {
  return _renderImpl();
}

export function initCollabDeps({
  render: renderImpl,
  showToast,
  apiRequest,
  addEmptyMessage,
  saveLocalState,
  markStateDirty,
  safeReadJson,
  applyServerStateSnapshot: applyServerStateSnapshotInjected,
  loadStateFromLocal,
  hasPendingLocalChanges,
  createSharedCommentItem,
  createSharedTodoItem,
  getTodoGroupLabel,
  getProjectLaneName,
  getBucketLabel: getBucketLabelImpl,
} = {}) {
  if (typeof renderImpl === 'function') {
    _renderImpl = renderImpl;
  }
  if (typeof showToast === 'function') {
    showToastImpl = showToast;
  }
  if (typeof apiRequest === 'function') {
    apiRequestImpl = apiRequest;
  }
  if (typeof addEmptyMessage === 'function') {
    addEmptyMessageImpl = addEmptyMessage;
  }
  if (typeof saveLocalState === 'function') {
    stateSaveLocalStateImpl = saveLocalState;
  }
  if (typeof markStateDirty === 'function') {
    markStateDirtyImpl = markStateDirty;
  }
  if (typeof safeReadJson === 'function') {
    safeReadJsonImpl = safeReadJson;
  }
  if (typeof applyServerStateSnapshotInjected === 'function') {
    applyServerStateSnapshotImpl = applyServerStateSnapshotInjected;
  }
  if (typeof loadStateFromLocal === 'function') {
    loadStateFromLocalImpl = loadStateFromLocal;
  }
  if (typeof hasPendingLocalChanges === 'function') {
    hasPendingLocalChangesImpl = hasPendingLocalChanges;
  }
  if (typeof getBucketLabelImpl === 'function') {
    // No-op placeholder for explicit dependency compatibility;
    // runtime calls use internal bucket label resolver by default.
    _bucketLabelOverride = getBucketLabelImpl;
  }
  if (typeof createSharedCommentItem === 'function') {
    _createSharedCommentItem = createSharedCommentItem;
  }
  if (typeof createSharedTodoItem === 'function') {
    _createSharedTodoItem = createSharedTodoItem;
  }
  if (typeof getTodoGroupLabel === 'function') {
    _todoGroupLabel = getTodoGroupLabel;
  }
  if (typeof getProjectLaneName === 'function') {
    _projectLaneName = getProjectLaneName;
  }
}

let _bucketLabelOverride;
let _createSharedCommentItem;
let _createSharedTodoItem;
let _todoGroupLabel;
let _projectLaneName;

function hasPendingLocalChanges() {
  return hasPendingLocalChangesImpl();
}

function safeReadJson(response) {
  return safeReadJsonImpl(response);
}

function applyServerStateSnapshotToRuntime(statePayload, version, options = {}) {
  return applyServerStateSnapshotImpl(statePayload, version, options);
}

function loadStateFromLocal() {
  return loadStateFromLocalImpl();
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
  button.textContent = enabled ? 'Sharing ON' : 'Start Sharing';
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
      label: `My shared bucket (${getBucketLabel(entry.bucketKey)})`,
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
      label: `${ownerPublicId} shared bucket`,
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
        label: `My shared bucket (${getBucketLabel(bucket)})`,
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
    showToast('Public ID must be 4-20 chars: lowercase, numbers, _ only.', 'error');
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
    showToast('This public ID is already taken.', 'error');
    return false;
  }
  if (!response.ok) {
    const payload = await safeReadJson(response);
    if (response.status === 401) {
      showToast('Session expired. Please log in again.', 'error');
      return false;
    }
    if (payload?.error === 'invalid_csrf_token') {
      showToast('Security token renewed. Please save again.', 'error');
      return false;
    }
    if (payload?.error === 'invalid_payload') {
      showToast('Invalid public ID format. (4-20 chars, lowercase/numbers/_)', 'error');
      return false;
    }
    if (response.status === 404 || payload?.error === 'not_found') {
      showToast('User not found. Please log in again.', 'error');
      return false;
    }
    if (response.status >= 500 || payload?.error === 'internal_server_error') {
      showToast('Server error. Please try again later.', 'error');
      return false;
    }
    showToast('Failed to save public ID.', 'error');
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
  userAliasPreviewEl.textContent = label || 'No alias set';
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
    authStatusEl.textContent = `Logged in: ${label}`;
    authBtn.innerHTML = '<span>Logout</span>';
    if (profilePublicIdInput) {
      profilePublicIdInput.disabled = false;
      profilePublicIdInput.value = normalizePublicIdInput(runtime.collabProfile.publicId || runtime.authUser.publicId || '');
    }
    if (profilePublicIdHint) {
      profilePublicIdHint.textContent = 'Format: a-z, 0-9, _ / 4-20 chars (@, -, spaces auto-converted)';
    }
  } else {
    authStatusEl.textContent = 'Login required';
    authBtn.innerHTML = '<span class="kakao-logo" aria-hidden="true">K</span><span>Kakao Login</span>';
    if (profilePublicIdInput) {
      profilePublicIdInput.disabled = true;
      profilePublicIdInput.value = '';
    }
    if (profilePublicIdHint) {
      profilePublicIdHint.textContent = 'Login required to set public ID.';
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
    const me = await safeReadJson(response);
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

    const data = await safeReadJson(response);
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

    const data = await safeReadJson(response);
    const remoteVersion = Number(data.version || 0);
    if (remoteVersion <= Number(state.version || 0)) {
      return;
    }
    if (hasPendingLocalChanges()) {
      return;
    }

    applyServerStateSnapshotToRuntime(data.state || {}, remoteVersion);
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
    applyServerStateSnapshotToRuntime(remoteState, remoteVersion);
    return;
  }

  const keepLocal = window.confirm(
    'Keep local changes and keep syncing local state?'
  );

  if (keepLocal) {
    if (remoteVersion > 0) {
      state.version = remoteVersion;
    }
    runtime.localDirty = true;
    queueSync(true);
    showToast('Keeping local state; sync again later.', 'error');
    return;
  }

    applyServerStateSnapshotToRuntime(remoteState, remoteVersion);
  showToast('Remote state was applied.', 'info');
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

    const result = await safeReadJson(response);
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
  title.textContent = 'Shared Tasks';
  head.appendChild(title);

  const contextSelect = document.createElement('select');
  contextSelect.className = 'shared-context-select';
  contextSelect.setAttribute('aria-label', 'Select sharing context');
  head.appendChild(contextSelect);
  section.appendChild(head);

  const composeForm = document.createElement('form');
  composeForm.className = 'shared-compose-form';
  composeForm.dataset.bucket = bucket;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'shared-compose-title';
  titleInput.maxLength = 120;
  titleInput.placeholder = 'Shared task title';
  titleInput.required = true;
  composeForm.appendChild(titleInput);

  const detailInput = document.createElement('textarea');
  detailInput.className = 'shared-compose-details';
  detailInput.rows = 2;
  detailInput.maxLength = 1200;
  detailInput.placeholder = 'Details';
  composeForm.appendChild(detailInput);

  const metaRow = document.createElement('div');
  metaRow.className = 'shared-compose-meta';

  const priority = document.createElement('select');
  priority.className = 'shared-compose-priority';
  priority.innerHTML = `
    <option value="1">High</option>
    <option value="2" selected>Normal</option>
    <option value="3">Low</option>
  `;
  metaRow.appendChild(priority);

  const dueDate = document.createElement('input');
  dueDate.type = 'date';
  dueDate.className = 'shared-compose-due';
  dueDate.setAttribute('aria-label', 'Shared task due date');
  metaRow.appendChild(dueDate);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Add Shared';
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
  const priority = priorityLabel[todo.priority] || 'Normal';
  const dueDateText = todo.dueDate ? ` / Due ${todo.dueDate}` : '';
  const doneText = todo.isDone ? ' / Done' : '';
  return `Priority: ${priority}${dueDateText}${doneText} / rev ${todo.revision}`;
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
    deleteBtn.textContent = 'Del';
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
    empty.textContent = 'No comments.';
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
  badge.textContent = 'Shared';
  markerRow.appendChild(badge);
  const author = document.createElement('span');
  author.className = 'shared-author';
  author.textContent = `Author: ${getAuthorTag(todo.author)}`;
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
    <option value="1">High</option>
    <option value="2">Normal</option>
    <option value="3">Low</option>
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
  saveBtn.textContent = 'Save';
  saveBtn.dataset.sharedAction = 'save';
  actions.appendChild(saveBtn);

  const toggleDoneBtn = document.createElement('button');
  toggleDoneBtn.type = 'button';
  toggleDoneBtn.className = 'complete';
  toggleDoneBtn.textContent = todo.isDone ? 'Undo' : 'Done';
  toggleDoneBtn.dataset.sharedAction = 'toggle-done';
  actions.appendChild(toggleDoneBtn);

  if (Number(runtime.authUser?.id) === Number(context.ownerUserId)) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete';
    deleteBtn.textContent = 'Del';
    deleteBtn.dataset.sharedAction = 'delete';
    actions.appendChild(deleteBtn);
  }

  const commentToggleBtn = document.createElement('button');
  commentToggleBtn.type = 'button';
  commentToggleBtn.className = 'ghost-btn';
  commentToggleBtn.textContent = 'Comments';
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
  commentInput.placeholder = 'Write a comment';
  commentComposer.appendChild(commentInput);
  const commentSubmit = document.createElement('button');
  commentSubmit.type = 'button';
  commentSubmit.className = 'complete';
  commentSubmit.textContent = 'Post';
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
    setSharedListEmpty(listEl, 'No connected shared buckets.');
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
    setSharedListEmpty(listEl, 'Select a sharing context to view tasks.');
    return;
  }

  const todos = Array.isArray(runtime.sharedTodosByContext[active.key]) ? runtime.sharedTodosByContext[active.key] : [];
  listEl.innerHTML = '';
  if (todos.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'todo-inline-empty';
    empty.textContent = 'No shared tasks.';
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
      ? `Public ID: ${publicId ? `@${publicId}` : 'Not set'}`
      : 'Log in to configure shared buckets.';
  }

  if (!ready || !runtime.collabSummary) {
    if (collabInviteBucketSelectEl) {
      collabInviteBucketSelectEl.innerHTML = '';
      collabInviteBucketSelectEl.disabled = true;
    }
    if (collabReceivedInvitesEl) {
      setSharedListEmpty(collabReceivedInvitesEl, 'No received invites.');
    }
    if (collabSentInvitesEl) {
      setSharedListEmpty(collabSentInvitesEl, 'No sent invites.');
    }
    if (collabMembershipListEl) {
      setSharedListEmpty(collabMembershipListEl, 'No shared bucket memberships.');
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
      option.textContent = 'No sharing-enabled buckets';
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
      setSharedListEmpty(collabReceivedInvitesEl, 'No received invites.');
    } else {
      received.forEach((invite) => {
        const li = document.createElement('li');
        li.className = 'collab-list-item';
        li.textContent = `${getBucketLabel(invite.bucketKey)} / ${getAuthorTag(invite.owner)} (${invite.status})`;
        if (invite.status === 'pending') {
          const acceptBtn = document.createElement('button');
          acceptBtn.type = 'button';
          acceptBtn.className = 'complete';
          acceptBtn.textContent = 'Accept';
          acceptBtn.dataset.collabAction = 'accept-invite';
          acceptBtn.dataset.inviteId = invite.id;
          li.appendChild(acceptBtn);

          const declineBtn = document.createElement('button');
          declineBtn.type = 'button';
          declineBtn.className = 'delete';
          declineBtn.textContent = 'Decline';
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
      setSharedListEmpty(collabSentInvitesEl, 'No sent invites.');
    } else {
      sent.forEach((invite) => {
        const li = document.createElement('li');
        li.className = 'collab-list-item';
        li.textContent = `${getBucketLabel(invite.bucketKey)} -> ${getAuthorTag(invite.invitee)} (${invite.status})`;
        if (invite.status === 'pending') {
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'delete';
          cancelBtn.textContent = 'Cancel';
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
        li.textContent = `[My ${getBucketLabel(entry.bucketKey)}] ${member.publicId ? `@${member.publicId}` : `USER-${member.userId}`}`;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'delete';
        removeBtn.textContent = 'Remove';
        removeBtn.dataset.collabAction = 'remove-membership';
        removeBtn.dataset.membershipId = String(member.membershipId || '');
        li.appendChild(removeBtn);
        collabMembershipListEl.appendChild(li);
      });
    });

    joined.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'collab-list-item';
      li.textContent = `[Joined ${getBucketLabel(entry.bucketKey)}] ${getAuthorTag(entry.owner)}`;
      const leaveBtn = document.createElement('button');
      leaveBtn.type = 'button';
      leaveBtn.className = 'delete';
      leaveBtn.textContent = 'Leave';
      leaveBtn.dataset.collabAction = 'remove-membership';
      leaveBtn.dataset.membershipId = String(entry.membershipId || '');
      li.appendChild(leaveBtn);
      collabMembershipListEl.appendChild(li);
    });

    if (!collabMembershipListEl.children.length) {
      setSharedListEmpty(collabMembershipListEl, 'No shared bucket memberships.');
    }
  }
}

async function submitCollabInvite() {
  if (!collabInviteBucketSelectEl || !collabInviteTargetInputEl) {
    return;
  }
  const bucketKey = collabInviteBucketSelectEl.value;
  if (!bucketKey || !isBucketShareEnabled(bucketKey)) {
    showToast('Please enable bucket sharing first.', 'error');
    return;
  }
  const targetPublicId = normalizePublicIdInput(collabInviteTargetInputEl.value);
  if (!isValidPublicId(targetPublicId)) {
    showToast('Invalid target public ID format.', 'error');
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
    showToast('Failed to send invite.', 'error');
    return;
  }

  collabInviteTargetInputEl.value = '';
  await refreshCollabSummary({ includeTodos: true });
  render();
  showToast('Invite sent.', 'success');
}

async function toggleBucketShareSetting(bucket) {
  const targetBucket = normalizeBucketIdOrDefault(bucket, '');
  if (!targetBucket) {
    return;
  }
  if (!runtime.isServerSync || !runtime.authUser) {
    showToast('Login required.', 'error');
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
    showToast('Failed to change bucket sharing settings.', 'error');
    return;
  }

  await refreshCollabSummary({ includeTodos: true });
  render();
  showToast(nextEnabled ? `${getBucketLabel(targetBucket)} sharing enabled.` : `${getBucketLabel(targetBucket)} sharing disabled.`, 'success');
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
      showToast('Failed to process request.', 'error');
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
      showToast('Failed to update member.', 'error');
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
    showToast('Please select a sharing context.', 'error');
    return;
  }

  const titleEl = formEl.querySelector('.shared-compose-title');
  const detailsEl = formEl.querySelector('.shared-compose-details');
  const priorityEl = formEl.querySelector('.shared-compose-priority');
  const dueDateEl = formEl.querySelector('.shared-compose-due');
  const title = String(titleEl?.value || '').trim();
  if (!title) {
    showToast('Please enter a shared task title.', 'error');
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
    showToast('Failed to add shared task.', 'error');
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
    showToast('Shared todo conflicted. Please reload and try again.', 'error');
    const context = parseCollabContextKey(found.contextKey);
    if (context) {
      await refreshCollabSnapshot();
    }
    render();
    return;
  }
  if (!response.ok) {
    showToast('Request failed. Please retry.', 'error');
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
    showToast('Failed to delete shared task.', 'error');
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
    showToast('Please enter a comment.', 'error');
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
    showToast('Failed to add comment.', 'error');
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
    showToast('Failed to delete comment.', 'error');
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


export {
  addSharedComment,
  applyAuthState,
  applyCollabSnapshotPayload,
  checkAuth,
  collabApiRequest,
  createSharedCommentItem,
  createSharedTodoItem,
  createSharedTodoItem as renderSharedTodoItem,
  deleteSharedComment,
  deleteSharedTodo,
  ensureActiveSharedContext,
  ensureBucketShareToggle,
  ensureSharedSection,
  getAuthorTag,
  getCollabContextsForBucket,
  getCollabPollIntervalMs,
  getProfileDisplayName,
  getSharedTodoById,
  getSharedTodoMetaText,
  getStatePollIntervalMs,
  handleCollabPanelAction,
  hasPendingLocalChanges,
  isBucketShareEnabled,
  loadServerState,
  normalizeCollabShareSettings,
  pruneCollabCaches,
  pollCollabData,
  pollServerState,
  queueSync,
  refreshCollabSummary,
  refreshCollabSnapshot,
  refreshSharedComments,
  registerStatePollingEvents,
  renderCollabPanel,
  renderSharedComments,
  renderSharedTodosForBucket,
  resetCollabState,
  saveLocalState,
  savePublicIdToServer,
  shouldShowSharedSection,
  safeReadJson,
  startCollabPolling,
  startStatePolling,
  stopCollabPolling,
  stopStatePolling,
  submitCollabInvite,
  submitSharedComposeForm,
  syncCollabPolling,
  syncState,
  toggleBucketShareSetting,
  toggleSharedCommentPanel,
  updateAuthUI,
  updateProfileAliasUI,
  updateSharedTodoFromItem,
  snapshotSyncStatePayload,
  handleVersionConflict,
  backupConflictSnapshot,
  collabContextKey,
  parseCollabContextKey,
  normalizePublicIdInput,
  isValidPublicId,
  normalizePublicIdInput as normalizePublicId,
  isValidPublicId as validatePublicId,
  collabContextKey as getCollabContextKey,
  parseCollabContextKey as getParsedCollabContext,
};







