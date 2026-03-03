import { API_BASE, HOLIDAY_CACHE_TTL_MS_DEFAULT, HOLIDAY_STALE_RETRY_MS } from './constants.js';
import { HOLIDAYS_BY_MONTH_DAY_FALLBACK, HOLIDAYS_BY_YEAR, HOLIDAYS_REQUEST } from './constants.js';
import { toLocalIsoDate } from './date-utils.js';

let _apiRequest = null;
let _config = null;

function resolveHolidayCacheTtlMs() {
  const fallback = HOLIDAY_CACHE_TTL_MS_DEFAULT;
  const ttl = Number(_config?.holidays?.cacheTtlMs);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : fallback;
}

export function initHolidayDeps({ apiRequest, config } = {}) {
  _apiRequest = typeof apiRequest === 'function' ? apiRequest : null;
  if (config) {
    _config = config;
  }
}

export function getHolidayFallbackLabel(date) {
  return HOLIDAYS_BY_MONTH_DAY_FALLBACK[formatMonthDay(date)] || '';
}

export function formatMonthDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

export function getHolidayLabel(date) {
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

function getFetchResponse(url, options) {
  if (_apiRequest) {
    return _apiRequest(url.replace(API_BASE, ''), options);
  }
  return fetch(url, {
    headers: {
      'cache-control': 'no-store',
    },
    cache: 'no-store',
    ...options,
  });
}

export function requestHolidayData(year) {
  const yearText = String(year);
  const cached = HOLIDAYS_BY_YEAR[yearText];
  if (HOLIDAYS_REQUEST[yearText]) {
    return HOLIDAYS_REQUEST[yearText];
  }
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data || {});
  }

  const stale = cached?.data || {};
  const staleRetryExpiresAt = Date.now() + HOLIDAY_STALE_RETRY_MS;

  const promise = (async () => {
    try {
      const response = await getFetchResponse(`${API_BASE}/holidays?year=${encodeURIComponent(yearText)}`);
      if (!response?.ok) {
        HOLIDAYS_BY_YEAR[yearText] = {
          data: stale,
          expiresAt: staleRetryExpiresAt,
        };
        return stale;
      }

      const payload = await response.json();
      const holidayMap = normalizeHolidayMap(payload?.holidays);
      const ttlMs = resolveHolidayCacheTtlMs();
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
  return promise;
}

export function ensureHolidayDataForYear(year) {
  const yearText = String(year);
  if (HOLIDAYS_REQUEST[yearText]) {
    return HOLIDAYS_REQUEST[yearText];
  }

  const cached = HOLIDAYS_BY_YEAR[yearText];
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data || {});
  }

  const request = requestHolidayData(yearText);
  return request;
}

export function getWeekendType(date) {
  const weekday = date.getDay();
  if (weekday === 6) {
    return 'saturday';
  }
  if (weekday === 0) {
    return 'sunday';
  }
  return '';
}
