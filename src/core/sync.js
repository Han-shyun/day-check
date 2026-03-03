import { performApiRequest } from './api-request.js';

let _apiBase = '/api';
let _showApiErrorToast = () => {};
let _createApiRequestError = () => {
  throw new Error('createApiRequestError is not configured');
};
let _startStatePolling = () => {};
let _syncCollabPolling = () => {};
let _config = null;
let _runtime = null;
let _buckets = [];
let _defaultBucketLabels = {};
let _defaultBucketVisibility = {};
let _pollDefaults = {
  stateActive: 4000,
  stateHidden: 20000,
  collabActive: 6000,
  collabHidden: 30000,
  holidayTtl: 24 * 60 * 60 * 1000,
};

let _safeReadJson = (response) => response.json().catch(() => ({}));

export function initSyncDeps({
  apiBase = '/api',
  showApiErrorToast,
  createApiRequestError,
  startStatePolling,
  syncCollabPolling,
  config,
  runtime,
  buckets,
  defaultBucketLabels,
  defaultBucketVisibility,
  safeReadJson,
  pollDefaults = {},
} = {}) {
  _apiBase = typeof apiBase === 'string' && apiBase ? apiBase : '/api';
  _showApiErrorToast = typeof showApiErrorToast === 'function' ? showApiErrorToast : () => {};
  _createApiRequestError =
    typeof createApiRequestError === 'function' ? createApiRequestError : _createApiRequestError;
  _startStatePolling =
    typeof startStatePolling === 'function' ? startStatePolling : () => {};
  _syncCollabPolling =
    typeof syncCollabPolling === 'function' ? syncCollabPolling : () => {};
  _config = config || null;
  _runtime = runtime || null;
  _buckets = Array.isArray(buckets) ? buckets : [];
  _defaultBucketLabels =
    defaultBucketLabels && typeof defaultBucketLabels === 'object' ? defaultBucketLabels : {};
  _defaultBucketVisibility =
    defaultBucketVisibility && typeof defaultBucketVisibility === 'object'
      ? defaultBucketVisibility
      : {};
  _safeReadJson =
    typeof safeReadJson === 'function' ? safeReadJson : ((response) => response.json().catch(() => ({})));

  const nextStateActive = Number(pollDefaults.stateActive);
  const nextStateHidden = Number(pollDefaults.stateHidden);
  const nextCollabActive = Number(pollDefaults.collabActive);
  const nextCollabHidden = Number(pollDefaults.collabHidden);
  const nextHolidayTtl = Number(pollDefaults.holidayTtl);

  _pollDefaults = {
    stateActive: Number.isFinite(nextStateActive) && nextStateActive > 0 ? nextStateActive : 4000,
    stateHidden: Number.isFinite(nextStateHidden) && nextStateHidden > 0 ? nextStateHidden : 20000,
    collabActive: Number.isFinite(nextCollabActive) && nextCollabActive > 0 ? nextCollabActive : 6000,
    collabHidden: Number.isFinite(nextCollabHidden) && nextCollabHidden > 0 ? nextCollabHidden : 30000,
    holidayTtl: Number.isFinite(nextHolidayTtl) && nextHolidayTtl > 0
      ? nextHolidayTtl
      : 24 * 60 * 60 * 1000,
  };
}

export async function apiRequest(path, options = {}) {
  return performApiRequest({
    baseUrl: _apiBase,
    path,
    options,
    onErrorToast: _showApiErrorToast,
    createError: _createApiRequestError,
  });
}

export function mergeBucketDefaultsFromMeta(metaPayload = {}) {
  if (!Array.isArray(_buckets) || _buckets.length === 0) {
    return;
  }

  const metaKeys = Array.isArray(metaPayload.bucketKeys)
    ? metaPayload.bucketKeys.map((key) => String(key || '').trim()).filter(Boolean)
    : [];
  const nextKeys = metaKeys.length > 0 ? [...new Set(metaKeys)] : [..._buckets];
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

  _buckets.splice(0, _buckets.length, ...nextKeys);
  Object.keys(_defaultBucketLabels).forEach((key) => {
    delete _defaultBucketLabels[key];
  });
  Object.entries(nextLabels).forEach(([key, value]) => {
    _defaultBucketLabels[key] = value;
  });
  Object.keys(_defaultBucketVisibility).forEach((key) => {
    delete _defaultBucketVisibility[key];
  });
  Object.entries(nextVisibility).forEach(([key, value]) => {
    _defaultBucketVisibility[key] = value;
  });
}

export function applyRuntimeMeta(metaPayload = {}) {
  mergeBucketDefaultsFromMeta(metaPayload);

  if (!_config) {
    return;
  }

  const poll = metaPayload?.poll || {};
  const holidays = metaPayload?.holidays || {};
  const nextStateActive = Number(poll.stateActiveMs || _config.poll.stateActiveMs);
  const nextStateHidden = Number(poll.stateHiddenMs || _config.poll.stateHiddenMs);
  const nextCollabActive = Number(poll.collabActiveMs || _config.poll.collabActiveMs);
  const nextCollabHidden = Number(poll.collabHiddenMs || _config.poll.collabHiddenMs);
  const nextHolidayTtl = Number(holidays.clientCacheTtlMs || _config.holidays.cacheTtlMs);

  _config.poll.stateActiveMs = Number.isFinite(nextStateActive) && nextStateActive > 0
    ? nextStateActive
    : _pollDefaults.stateActive;
  _config.poll.stateHiddenMs = Number.isFinite(nextStateHidden) && nextStateHidden > 0
    ? nextStateHidden
    : _pollDefaults.stateHidden;
  _config.poll.collabActiveMs = Number.isFinite(nextCollabActive) && nextCollabActive > 0
    ? nextCollabActive
    : _pollDefaults.collabActive;
  _config.poll.collabHiddenMs = Number.isFinite(nextCollabHidden) && nextCollabHidden > 0
    ? nextCollabHidden
    : _pollDefaults.collabHidden;
  _config.holidays.cacheTtlMs = Number.isFinite(nextHolidayTtl) && nextHolidayTtl > 0
    ? nextHolidayTtl
    : _pollDefaults.holidayTtl;
  _config.metaLoaded = true;

  if (_runtime?.isServerSync && _runtime?.authUser) {
    _startStatePolling();
    _syncCollabPolling();
  }
}

export async function loadRuntimeMeta() {
  try {
    const response = await apiRequest('/meta', {
      method: 'GET',
      suppressErrorToast: true,
    });
    if (!response.ok) {
      return;
    }
    const payload = await _safeReadJson(response);
    applyRuntimeMeta(payload || {});
  } catch {
    // offline fallback keeps local defaults
  }
}

export function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift() || '';
  }
  return '';
}
