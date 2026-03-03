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
  `Bucket ${index + 1}`,
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
  honorific: '',
};

export const priorityLabel = {
  3: 'Low',
  2: 'Normal',
  1: 'High',
};

export const typeLabel = {
  todo: 'Task',
  note: 'Note',
};

export const HOLIDAYS_BY_MONTH_DAY_FALLBACK = {
  '01-01': "New Year's Day",
  '03-01': 'Independence Movement Day',
  '05-05': "Children's Day",
  '06-06': 'Memorial Day',
  '08-15': 'Liberation Day',
  '10-03': 'National Foundation Day',
  '10-09': 'Hangul Day',
  '12-25': 'Christmas',
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
