const express = require('express');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Server: SocketIO } = require('socket.io');
const { attachHandlers: attachAvalonHandlers } = require('./server/modules/avalon/socketHandlers');
require('dotenv').config();

const app = express();
app.set('trust proxy', 'loopback');
const PORT = Number(process.env.PORT || 4173);

const SESSION_COOKIE = 'daycheck_session';
const OAUTH_STATE_COOKIE = 'daycheck_oauth_state';
const CSRF_COOKIE = 'daycheck_csrf';
const SECURITY_EVENT_PREFIX = 'daycheck_security_event';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TTL_DEFAULT_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TTL_RAW = Number(process.env.SESSION_ABSOLUTE_TTL_MS || SESSION_ABSOLUTE_TTL_DEFAULT_MS);
const SESSION_ABSOLUTE_TTL_MS =
  Number.isFinite(SESSION_ABSOLUTE_TTL_RAW) && SESSION_ABSOLUTE_TTL_RAW > 0
    ? SESSION_ABSOLUTE_TTL_RAW
    : SESSION_ABSOLUTE_TTL_DEFAULT_MS;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const OAUTH_REFRESH_SKEW_MS = 60 * 1000;
const SECURITY_EVENT_LOG_PATH = process.env.SECURITY_EVENT_LOG_PATH || path.resolve(process.cwd(), 'security-events.log');
const SECURITY_EVENT_LOG_MAX_DEFAULT_BYTES = 10 * 1024 * 1024;
const SECURITY_EVENT_LOG_MAX_RAW = Number(
  process.env.SECURITY_EVENT_LOG_MAX_BYTES || SECURITY_EVENT_LOG_MAX_DEFAULT_BYTES,
);
const SECURITY_EVENT_LOG_MAX_BYTES =
  Number.isFinite(SECURITY_EVENT_LOG_MAX_RAW) && SECURITY_EVENT_LOG_MAX_RAW > 0
    ? SECURITY_EVENT_LOG_MAX_RAW
    : SECURITY_EVENT_LOG_MAX_DEFAULT_BYTES;
const SECURITY_EVENTS_ENABLED = process.env.SECURITY_EVENTS_ENABLED !== 'false';
const HOLIDAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HOLIDAY_FETCH_TIMEOUT_MS = 12_000;
const HOLIDAY_API_PROVIDER = String(process.env.HOLIDAY_API_PROVIDER || 'public_data_portal').trim().toLowerCase();
const HOLIDAY_API_SERVICE_KEY = String(process.env.HOLIDAY_API_SERVICE_KEY || '').trim();
const HOLIDAY_API_BASE_URL =
  String(process.env.HOLIDAY_API_BASE_URL || '').trim() ||
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
const HOLIDAY_FEED_FALLBACK_URL =
  String(process.env.HOLIDAY_FEED_URL || process.env.NAVER_HOLIDAY_FEED_URL || '').trim() ||
  'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
const HOLIDAY_CLIENT_CACHE_TTL_MS_DEFAULT = 24 * 60 * 60 * 1000;
const HOLIDAY_CLIENT_CACHE_TTL_MS_RAW = Number(
  process.env.HOLIDAY_CLIENT_CACHE_TTL_MS || HOLIDAY_CLIENT_CACHE_TTL_MS_DEFAULT,
);
const HOLIDAY_CLIENT_CACHE_TTL_MS =
  Number.isFinite(HOLIDAY_CLIENT_CACHE_TTL_MS_RAW) && HOLIDAY_CLIENT_CACHE_TTL_MS_RAW > 0
    ? HOLIDAY_CLIENT_CACHE_TTL_MS_RAW
    : HOLIDAY_CLIENT_CACHE_TTL_MS_DEFAULT;
const POLL_STATE_ACTIVE_MS_DEFAULT = 4000;
const POLL_STATE_HIDDEN_MS_DEFAULT = 20000;
const POLL_COLLAB_ACTIVE_MS_DEFAULT = 6000;
const POLL_COLLAB_HIDDEN_MS_DEFAULT = 30000;
const POLL_STATE_ACTIVE_MS = Number(process.env.POLL_STATE_ACTIVE_MS || POLL_STATE_ACTIVE_MS_DEFAULT) > 0
  ? Number(process.env.POLL_STATE_ACTIVE_MS || POLL_STATE_ACTIVE_MS_DEFAULT)
  : POLL_STATE_ACTIVE_MS_DEFAULT;
const POLL_STATE_HIDDEN_MS = Number(process.env.POLL_STATE_HIDDEN_MS || POLL_STATE_HIDDEN_MS_DEFAULT) > 0
  ? Number(process.env.POLL_STATE_HIDDEN_MS || POLL_STATE_HIDDEN_MS_DEFAULT)
  : POLL_STATE_HIDDEN_MS_DEFAULT;
const POLL_COLLAB_ACTIVE_MS = Number(process.env.POLL_COLLAB_ACTIVE_MS || POLL_COLLAB_ACTIVE_MS_DEFAULT) > 0
  ? Number(process.env.POLL_COLLAB_ACTIVE_MS || POLL_COLLAB_ACTIVE_MS_DEFAULT)
  : POLL_COLLAB_ACTIVE_MS_DEFAULT;
const POLL_COLLAB_HIDDEN_MS = Number(process.env.POLL_COLLAB_HIDDEN_MS || POLL_COLLAB_HIDDEN_MS_DEFAULT) > 0
  ? Number(process.env.POLL_COLLAB_HIDDEN_MS || POLL_COLLAB_HIDDEN_MS_DEFAULT)
  : POLL_COLLAB_HIDDEN_MS_DEFAULT;
const HOLIDAY_CACHE = new Map();
const HOLIDAY_FETCH_INFLIGHT = new Map();
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
let USERS_REQUIRE_NAVER_ID = false;

function getSecureEncryptionKey() {
  const raw = process.env.SESSION_ENCRYPTION_KEY || '';
  if (!raw) {
    return null;
  }

  const toBuffer = (candidate) => {
    if (!candidate) return null;
    const normalized = candidate.trim();
    if (!normalized) return null;

    if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
      return Buffer.from(normalized, 'hex');
    }

    const base64 = Buffer.from(normalized, 'base64');
    if (base64.length === 32) {
      return base64;
    }

    const utf8 = Buffer.from(normalized, 'utf8');
    if (utf8.length === 32) {
      return utf8;
    }

    return null;
  };

  const key = toBuffer(raw);
  return key;
}

const SESSION_TOKEN_ENCRYPTION_KEY = getSecureEncryptionKey();

function validateRequiredSecurityConfig() {
  const sessionEncryptionKey = String(process.env.SESSION_ENCRYPTION_KEY || '').trim();
  if (!sessionEncryptionKey) {
    console.error('[security] SESSION_ENCRYPTION_KEY is required.');
    throw new Error('missing_SESSION_ENCRYPTION_KEY');
  }

  if (!SESSION_TOKEN_ENCRYPTION_KEY) {
    console.error(
      '[security] SESSION_ENCRYPTION_KEY is invalid. Must be a 32-byte base64/hex/utf8 string.',
    );
    throw new Error('invalid_SESSION_ENCRYPTION_KEY');
  }
}

function rotateSecurityEventLogIfNeeded() {
  if (!Number.isFinite(SECURITY_EVENT_LOG_MAX_BYTES) || SECURITY_EVENT_LOG_MAX_BYTES <= 0) {
    return;
  }

  try {
    const stat = fs.statSync(SECURITY_EVENT_LOG_PATH);
    if (!stat.isFile() || stat.size < SECURITY_EVENT_LOG_MAX_BYTES) {
      return;
    }

    const backupPath = `${SECURITY_EVENT_LOG_PATH}.1`;
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    } catch (error) {
      console.error('[security] failed to remove previous security log backup', error);
    }
    fs.renameSync(SECURITY_EVENT_LOG_PATH, backupPath);
  } catch (error) {
    if (!error || error.code === 'ENOENT') {
      return;
    }
    console.error('[security] failed to rotate security log file', error);
  }
}

function logSecurityEvent(eventCode, details = {}) {
  if (!SECURITY_EVENTS_ENABLED) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    event: eventCode,
    ip: details.ip || null,
    path: details.path || null,
    method: details.method || null,
    sessionId: details.sessionId || null,
    userId: details.userId || null,
    error: details.error || null,
  };
  const text = JSON.stringify(payload);

  console.warn(`[${SECURITY_EVENT_PREFIX}] ${text}`);
  try {
    rotateSecurityEventLogIfNeeded();
    fs.appendFileSync(SECURITY_EVENT_LOG_PATH, `${text}\n`, 'utf8');
  } catch (error) {
    console.error('[security] failed to write security log', error);
  }
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, ms);
  return { controller, timeout };
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function unescapeIcsValue(value) {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/gi, '\n')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(rawDate) {
  if (!rawDate || typeof rawDate !== 'string') {
    return '';
  }
  const match = rawDate.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseDateFromUnknown(rawValue) {
  if (!rawValue) {
    return '';
  }

  const value = String(rawValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const compactMatch = value.match(/(\d{4})(\d{2})(\d{2})/);
  return compactMatch ? `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}` : '';
}

function pickHolidayDate(item, year) {
  if (!item || typeof item !== 'object') {
    return '';
  }

  const yearText = String(year);
  const candidates = [
    item.date,
    item.start,
    item.startDate,
    item.dtstart,
    item.start_at,
    item.eventDate,
    item.holidayDate,
  ];

  for (const candidate of candidates) {
    let resolved = candidate;
    if (resolved && typeof resolved === 'object') {
      resolved = resolved.date || resolved.dateTime || resolved.value || resolved.datetime;
    }
    const dateText = parseDateFromUnknown(resolved);
    if (!dateText) {
      continue;
    }
    if (dateText.startsWith(`${yearText}-`)) {
      return dateText;
    }
  }
  return '';
}

function parseHolidayName(item) {
  const candidates = [item.summary, item.name, item.title, item.holidayName, item.label];
  for (const candidate of candidates) {
    const text = safeTrim(candidate);
    if (text) {
      return text;
    }
  }
  return '';
}

function parseIcsHolidays(text, year) {
  const unfolded = [];
  const rawLines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }
    unfolded.push(line);
  }

  const holidays = {};
  let inEvent = false;
  let event = { date: '', name: '' };

  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      event = { date: '', name: '' };
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent && event.date && event.name) {
        holidays[event.date] = event.name;
      }
      inEvent = false;
      continue;
    }

    if (!inEvent || !line.includes(':')) {
      continue;
    }

    const sepIndex = line.indexOf(':');
    const field = line.slice(0, sepIndex);
    const value = line.slice(sepIndex + 1);
    const fieldName = field.split(';')[0];

    if (fieldName === 'SUMMARY') {
      event.name = safeTrim(unescapeIcsValue(value));
      continue;
    }

    if (fieldName.startsWith('DTSTART')) {
      const dateText = parseIcsDate(value);
      event.date = dateText;
      continue;
    }
  }

  return holidays;
}

function parseJsonHolidays(text, year) {
  const payload = safeTrim(text) ? JSON.parse(text) : null;
  if (!payload) {
    return {};
  }

  const yearText = String(year);
  let items = Array.isArray(payload) ? payload : null;
  if (!items && Array.isArray(payload?.holidays)) {
    items = payload.holidays;
  } else if (!items && Array.isArray(payload?.items)) {
    items = payload.items;
  } else if (!items && payload?.holidays && typeof payload.holidays === 'object' && !Array.isArray(payload.holidays)) {
    const map = {};
    Object.entries(payload.holidays).forEach(([dateText, name]) => {
      if (typeof dateText === 'string' && parseDateFromUnknown(dateText).startsWith(`${yearText}-`) && safeTrim(name)) {
        map[parseDateFromUnknown(dateText)] = safeTrim(name);
      }
    });
    return map;
  }
  if (!Array.isArray(items)) {
    return {};
  }

  const holidays = {};
  for (const item of items) {
    const dateText = pickHolidayDate(item, year);
    if (!dateText || !dateText.startsWith(`${yearText}-`)) {
      continue;
    }
    const name = parseHolidayName(item);
    if (!name) {
      continue;
    }
    holidays[dateText] = name;
  }
  return holidays;
}

function normalizeHolidaySourceUrl(year, rawCandidate = '') {
  const rawUrl = safeTrim(rawCandidate);
  if (!rawUrl) {
    return '';
  }

  let candidate = rawUrl.replace('{YYYY}', String(year)).replace('{year}', String(year));
  if (!/\{year\}|\{YYYY\}/i.test(rawUrl) && !/[?&]year=/.test(candidate)) {
    const sep = candidate.includes('?') ? '&' : '?';
    candidate = `${candidate}${sep}year=${year}`;
  }

  return candidate;
}

function shouldNormalizeByYear(key, year) {
  return typeof key === 'string' && key.startsWith(`${year}-`);
}

function normalizeHolidayDateCandidate(rawDate) {
  const parsed = parseDateFromUnknown(rawDate);
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : '';
}

function parsePublicDataPortalHolidays(payload, year) {
  const yearText = String(year);
  const candidates = [
    payload?.response?.body?.items?.item,
    payload?.response?.body?.item,
    payload?.body?.items?.item,
    payload?.items?.item,
    payload?.items,
  ];
  let items = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      items = candidate;
      break;
    }
    if (candidate && typeof candidate === 'object') {
      items = [candidate];
      break;
    }
  }

  const holidays = {};
  items.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const isHoliday = String(item.isHoliday || item.holidayYn || '').toUpperCase();
    if (isHoliday && isHoliday !== 'Y') {
      return;
    }

    const dateText = normalizeHolidayDateCandidate(item.locdate || item.dateName || item.date || '');
    if (!dateText || !dateText.startsWith(`${yearText}-`)) {
      return;
    }

    const name = safeTrim(item.dateName || item.holidayName || item.name || item.title || '');
    if (!name) {
      return;
    }
    holidays[dateText] = name;
  });

  return holidays;
}

async function fetchHolidaysFromFeed(year, sourceUrl, provider = 'holiday_feed') {
  const normalizedSourceUrl = safeTrim(sourceUrl);
  if (!normalizedSourceUrl) {
    return {
      year,
      holidays: {},
      fallback: true,
      reason: 'source_not_configured',
      source: '',
      provider,
    };
  }

  const { controller, timeout } = withTimeout(HOLIDAY_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(normalizedSourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        year,
        holidays: {},
        fallback: true,
        reason: `http_${response.status}`,
        source: normalizedSourceUrl,
        provider,
      };
    }

    const text = await response.text();
    const trimmed = safeTrim(text);
    if (!trimmed) {
      return {
        year,
        holidays: {},
        fallback: true,
        reason: 'empty_response',
        source: normalizedSourceUrl,
        provider,
      };
    }

    let holidays = {};
    try {
      if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('"holidays"')) {
        holidays = parseJsonHolidays(trimmed, year);
      } else {
        holidays = parseIcsHolidays(trimmed, year);
      }
    } catch (error) {
      holidays = {};
    }

    return {
      year,
      holidays,
      fallback: false,
      source: normalizedSourceUrl,
      provider,
    };
  } catch (error) {
    return {
      year,
      holidays: {},
      fallback: true,
      reason: error && error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      source: normalizedSourceUrl,
      provider,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHolidaysFromPublicDataPortal(year) {
  if (!HOLIDAY_API_SERVICE_KEY) {
    return {
      year,
      holidays: {},
      fallback: true,
      reason: 'missing_service_key',
      source: HOLIDAY_API_BASE_URL,
      provider: 'public_data_portal',
    };
  }

  const params = new URLSearchParams({
    ServiceKey: HOLIDAY_API_SERVICE_KEY,
    solYear: String(year),
    numOfRows: '100',
    pageNo: '1',
    _type: 'json',
  });
  const sourceUrl = `${HOLIDAY_API_BASE_URL}?${params.toString()}`;
  const { controller, timeout } = withTimeout(HOLIDAY_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        year,
        holidays: {},
        fallback: true,
        reason: `http_${response.status}`,
        source: sourceUrl,
        provider: 'public_data_portal',
      };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!payload || typeof payload !== 'object') {
      return {
        year,
        holidays: {},
        fallback: true,
        reason: 'invalid_json',
        source: sourceUrl,
        provider: 'public_data_portal',
      };
    }

    const resultCode =
      safeTrim(payload?.response?.header?.resultCode || payload?.header?.resultCode || payload?.resultCode || '');
    if (resultCode && resultCode !== '00') {
      return {
        year,
        holidays: {},
        fallback: true,
        reason: `api_${resultCode}`,
        source: sourceUrl,
        provider: 'public_data_portal',
      };
    }

    return {
      year,
      holidays: parsePublicDataPortalHolidays(payload, year),
      fallback: false,
      source: sourceUrl,
      provider: 'public_data_portal',
    };
  } catch (error) {
    return {
      year,
      holidays: {},
      fallback: true,
      reason: error && error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      source: sourceUrl,
      provider: 'public_data_portal',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHolidaysByProvider(year) {
  if (HOLIDAY_API_PROVIDER === 'public_data_portal') {
    const primary = await fetchHolidaysFromPublicDataPortal(year);
    if (!primary.fallback && Object.keys(primary.holidays || {}).length > 0) {
      return primary;
    }

    const fallbackUrl = normalizeHolidaySourceUrl(year, HOLIDAY_FEED_FALLBACK_URL);
    const fallback = await fetchHolidaysFromFeed(year, fallbackUrl, 'google_ics_fallback');
    if (!fallback.fallback) {
      return {
        ...fallback,
        fallback: true,
        reason: primary?.reason || 'fallback_feed',
      };
    }
    return {
      ...fallback,
      fallback: true,
      reason: `${primary?.reason || 'provider_failed'};${fallback.reason || 'fallback_failed'}`,
    };
  }

  const sourceUrl = normalizeHolidaySourceUrl(year, HOLIDAY_FEED_FALLBACK_URL);
  return fetchHolidaysFromFeed(year, sourceUrl, 'holiday_feed');
}

async function getHolidaysByYear(year) {
  const key = String(year);
  const cached = HOLIDAY_CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (HOLIDAY_FETCH_INFLIGHT.has(key)) {
    return HOLIDAY_FETCH_INFLIGHT.get(key);
  }

  const payload = fetchHolidaysByProvider(year)
    .then((result) => {
      const holidayMap = {};
      const source = result?.holidays || {};
      for (const [dateText, name] of Object.entries(source)) {
        if (typeof dateText === 'string' && shouldNormalizeByYear(dateText, year) && safeTrim(name)) {
          holidayMap[dateText] = safeTrim(name);
        }
      }

      HOLIDAY_CACHE.set(key, {
        fetchedAt: Date.now(),
        expiresAt: Date.now() + HOLIDAY_CACHE_TTL_MS,
        data: {
          year,
          holidays: holidayMap,
          source: result?.source || '',
          provider: result?.provider || '',
          fallback: result?.fallback === true,
          reason: result?.reason || '',
        },
      });

      return HOLIDAY_CACHE.get(key).data;
    })
    .finally(() => {
      HOLIDAY_FETCH_INFLIGHT.delete(key);
    });

  HOLIDAY_FETCH_INFLIGHT.set(key, payload);
  return payload;
}

function encryptToken(raw) {
  if (raw == null || raw === '') {
    return null;
  }
  if (!SESSION_TOKEN_ENCRYPTION_KEY) {
    return String(raw);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_TOKEN_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(raw), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc.v1:${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptToken(encryptedToken) {
  if (encryptedToken == null || encryptedToken === '') {
    return null;
  }
  if (!SESSION_TOKEN_ENCRYPTION_KEY) {
    return String(encryptedToken);
  }
  if (!String(encryptedToken).startsWith('enc.v1:')) {
    return String(encryptedToken);
  }

  const tokenParts = String(encryptedToken).replace(/^enc\.v1:/, '').split('.');
  if (tokenParts.length !== 3) {
    return null;
  }

  try {
    const [ivB64, tagB64, encryptedB64] = tokenParts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SESSION_TOKEN_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

const DB_PATH = path.resolve(process.cwd(), process.env.DATABASE_PATH || 'daycheck.sqlite');
const PUBLIC_ROOT = path.resolve(process.cwd());

const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON', (error) => {
    if (error) {
      console.error('[db] failed to enable foreign_keys pragma', error);
    }
  });
  db.run('PRAGMA journal_mode = WAL', (error) => {
    if (error) {
      console.error('[db] failed to enable WAL mode', error);
    }
  });
});

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function callback(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row || null);
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows || []);
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function ensureColumnIfMissing(tableName, columnName, columnDef) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((row) => row && row.name === columnName);
  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    return true;
  }
  return false;
}

async function ensureUsersSchema() {
  const created = [];
  if (await ensureColumnIfMissing('users', 'created_at', 'TEXT')) {
    created.push('created_at');
  }
  if (await ensureColumnIfMissing('users', 'updated_at', 'TEXT')) {
    created.push('updated_at');
  }
  if (await ensureColumnIfMissing('users', 'kakao_id', 'TEXT')) {
    created.push('kakao_id');
  }
  if (await ensureColumnIfMissing('users', 'nickname', 'TEXT')) {
    created.push('nickname');
  }
  if (await ensureColumnIfMissing('users', 'email', 'TEXT')) {
    created.push('email');
  }
  if (await ensureColumnIfMissing('users', 'profile_image', 'TEXT')) {
    created.push('profile_image');
  }
  if (await ensureColumnIfMissing('users', 'last_login_at', 'TEXT')) {
    created.push('last_login_at');
  }

  if (created.length > 0) {
    try {
      await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao_id ON users(kakao_id)');
    } catch {
      // safe fallback for older sqlite versions/corrupted state
    }
  }

  await run("UPDATE users SET created_at = COALESCE(created_at, datetime('now'))");
  await run("UPDATE users SET updated_at = COALESCE(updated_at, datetime('now'))");

  const columns = await all(`PRAGMA table_info(users)`);
  const legacyNaverIdColumn = columns.find((row) => row && row.name === 'naver_id');
  USERS_REQUIRE_NAVER_ID = Boolean(legacyNaverIdColumn && Number(legacyNaverIdColumn.notnull) === 1);
}

async function ensureStateSchemas() {
  const userColumns = await all(`PRAGMA table_info(user_states)`);
  if (userColumns.length > 0) {
    await ensureColumnIfMissing('user_states', 'state_json', 'TEXT NOT NULL DEFAULT \'{}\'');
    await ensureColumnIfMissing('user_states', 'version', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumnIfMissing('user_states', 'updated_at', 'TEXT NOT NULL DEFAULT (datetime(\'now\'))');
    await ensureColumnIfMissing('user_states', 'created_at', 'TEXT NOT NULL DEFAULT (datetime(\'now\'))');
  }

  const sessionColumns = await all(`PRAGMA table_info(user_sessions)`);
  if (sessionColumns.length > 0) {
    await ensureColumnIfMissing('user_sessions', 'kakao_access_token', 'TEXT');
    await ensureColumnIfMissing('user_sessions', 'kakao_refresh_token', 'TEXT');
    await ensureColumnIfMissing('user_sessions', 'kakao_token_expires_at', 'INTEGER');
  }

  const oauthColumns = await all(`PRAGMA table_info(oauth_states)`);
  if (oauthColumns.length > 0) {
    await ensureColumnIfMissing('oauth_states', 'ip', 'TEXT');
  }

  const idemColumns = await all(`PRAGMA table_info(idempotency_store)`);
  if (idemColumns.length > 0) {
    await ensureColumnIfMissing('idempotency_store', 'updated_at', 'INTEGER');
  }
}

async function ensureCollabSchemas() {
  await ensureColumnIfMissing('users', 'public_id', 'TEXT');
  await ensureColumnIfMissing('users', 'public_id_normalized', 'TEXT');
  await ensureColumnIfMissing('users', 'public_id_updated_at', 'TEXT');

  await run(
    `
    CREATE TABLE IF NOT EXISTS bucket_share_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      bucket_key TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(owner_user_id, bucket_key)
    )
  `,
  );
  await run(
    `
    CREATE TABLE IF NOT EXISTS bucket_share_invites (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER NOT NULL,
      bucket_key TEXT NOT NULL,
      invitee_user_id INTEGER NOT NULL,
      inviter_user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      responded_at TEXT,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invitee_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  );
  await run(
    `
    CREATE TABLE IF NOT EXISTS bucket_share_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      bucket_key TEXT NOT NULL,
      member_user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(owner_user_id, bucket_key, member_user_id)
    )
  `,
  );
  await run(
    `
    CREATE TABLE IF NOT EXISTS shared_bucket_todos (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER NOT NULL,
      bucket_key TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      subtasks_json TEXT NOT NULL DEFAULT '[]',
      priority INTEGER NOT NULL DEFAULT 2,
      due_date TEXT NOT NULL DEFAULT '',
      is_done INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      created_by_user_id INTEGER NOT NULL,
      updated_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  );
  await run(
    `
    CREATE TABLE IF NOT EXISTS shared_todo_comments (
      id TEXT PRIMARY KEY,
      todo_id TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      author_user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (todo_id) REFERENCES shared_bucket_todos(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  );

  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id_norm ON users(public_id_normalized)');
  await run('CREATE INDEX IF NOT EXISTS idx_share_settings_owner ON bucket_share_settings(owner_user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_invites_invitee_status ON bucket_share_invites(invitee_user_id, status)');
  await run('CREATE INDEX IF NOT EXISTS idx_invites_owner_bucket_status ON bucket_share_invites(owner_user_id, bucket_key, status)');
  await run('CREATE INDEX IF NOT EXISTS idx_memberships_member_status ON bucket_share_memberships(member_user_id, status)');
  await run('CREATE INDEX IF NOT EXISTS idx_memberships_owner_bucket_status ON bucket_share_memberships(owner_user_id, bucket_key, status)');
  await run('CREATE INDEX IF NOT EXISTS idx_shared_todos_owner_bucket_done ON shared_bucket_todos(owner_user_id, bucket_key, is_done)');
  await run('CREATE INDEX IF NOT EXISTS idx_shared_todos_updated_at ON shared_bucket_todos(updated_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_shared_comments_todo_created ON shared_todo_comments(todo_id, created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_shared_comments_author_created ON shared_todo_comments(author_user_id, created_at)');

  await run(
    `
    INSERT INTO bucket_share_settings (owner_user_id, bucket_key, is_enabled, created_at, updated_at)
    SELECT owner_user_id, bucket_key, 1, datetime('now'), datetime('now')
    FROM (
      SELECT DISTINCT owner_user_id, bucket_key
      FROM bucket_share_memberships
      WHERE status = 'active'
      UNION
      SELECT DISTINCT owner_user_id, bucket_key
      FROM bucket_share_invites
      WHERE status = 'pending'
      UNION
      SELECT DISTINCT owner_user_id, bucket_key
      FROM shared_bucket_todos
    )
    WHERE 1 = 1
    ON CONFLICT(owner_user_id, bucket_key) DO NOTHING
  `,
  );
}

function getSessionRecord(sessionId) {
  return get(
    `
    SELECT
      session_id,
      user_id,
      csrf_token,
      kakao_access_token,
      kakao_refresh_token,
      kakao_token_expires_at,
      created_at,
      expires_at
    FROM user_sessions
    WHERE session_id = ?
  `,
    [sessionId],
  ).then((row) => {
    if (!row) {
      return null;
    }

    const accessToken = row.kakao_access_token ? decryptToken(row.kakao_access_token) : null;
    const refreshToken = row.kakao_refresh_token ? decryptToken(row.kakao_refresh_token) : null;
    if (row.kakao_access_token && row.kakao_access_token.startsWith('enc.v1:') && accessToken === null) {
      logSecurityEvent('session_token_decrypt_failed', {
        sessionId: row.session_id,
      });
    }
    if (row.kakao_refresh_token && row.kakao_refresh_token.startsWith('enc.v1:') && refreshToken === null) {
      logSecurityEvent('session_token_decrypt_failed', {
        sessionId: row.session_id,
      });
    }

    return {
      sessionId: row.session_id,
      userId: Number(row.user_id),
      csrfToken: row.csrf_token || '',
      kakaoAccessToken: accessToken,
      kakaoRefreshToken: refreshToken,
      kakaoTokenExpiresAt: row.kakao_token_expires_at == null ? null : Number(row.kakao_token_expires_at),
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    };
  });
}

async function saveSessionRecord(sessionId, session) {
  const now = Date.now();
  const record = {
    userId: Number(session.userId),
    csrfToken: session.csrfToken || '',
    kakaoAccessToken: session.kakaoAccessToken ? encryptToken(session.kakaoAccessToken) : null,
    kakaoRefreshToken: session.kakaoRefreshToken ? encryptToken(session.kakaoRefreshToken) : null,
    kakaoTokenExpiresAt: session.kakaoTokenExpiresAt || null,
    createdAt: Number(session.createdAt || now),
    expiresAt: Number(session.expiresAt || now + SESSION_TTL_MS),
  };

  await run(
    `
    INSERT INTO user_sessions (
      session_id,
      user_id,
      csrf_token,
      kakao_access_token,
      kakao_refresh_token,
      kakao_token_expires_at,
      created_at,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      user_id = excluded.user_id,
      csrf_token = excluded.csrf_token,
      kakao_access_token = excluded.kakao_access_token,
      kakao_refresh_token = excluded.kakao_refresh_token,
      kakao_token_expires_at = excluded.kakao_token_expires_at,
      created_at = CASE WHEN user_sessions.created_at IS NULL THEN excluded.created_at ELSE user_sessions.created_at END,
      expires_at = excluded.expires_at
    `,
    [
      sessionId,
      record.userId,
      record.csrfToken,
      record.kakaoAccessToken,
      record.kakaoRefreshToken,
      record.kakaoTokenExpiresAt,
      record.createdAt,
      record.expiresAt,
    ],
  );
}

async function deleteSessionRecord(sessionId) {
  await run('DELETE FROM user_sessions WHERE session_id = ?', [sessionId]);
}

function getOauthState(state) {
  return get(
    `
    SELECT state, created_at, ip
    FROM oauth_states
    WHERE state = ?
  `,
    [state],
  ).then((row) => {
    if (!row) {
      return null;
    }

    return {
      state: row.state,
      createdAt: Number(row.created_at),
      ip: row.ip,
    };
  });
}

function createOauthState(state, ip) {
  return run(
    `
    INSERT OR REPLACE INTO oauth_states (state, created_at, ip)
    VALUES (?, ?, ?)
  `,
    [state, Date.now(), ip || null],
  );
}

function deleteOauthState(state) {
  return run('DELETE FROM oauth_states WHERE state = ?', [state]);
}

function getIdempotencyEntry(key) {
  return get(
    `
    SELECT idempotency_key, request_hash, response_json, expires_at
    FROM idempotency_store
    WHERE idempotency_key = ?
  `,
    [key],
  ).then((row) => {
    if (!row) {
      return null;
    }

    try {
      return {
        key: row.idempotency_key,
        requestHash: row.request_hash,
        response: JSON.parse(row.response_json || '{}'),
        expiresAt: Number(row.expires_at),
      };
    } catch {
      return {
        key: row.idempotency_key,
        requestHash: row.request_hash,
        response: null,
        expiresAt: Number(row.expires_at),
      };
    }
  });
}

function saveIdempotencyRecord(key, requestHash, response) {
  const now = Date.now();
  return run(
    `
    INSERT INTO idempotency_store (idempotency_key, request_hash, response_json, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO UPDATE SET
      request_hash = excluded.request_hash,
      response_json = excluded.response_json,
      expires_at = excluded.expires_at
    `,
    [key, requestHash, JSON.stringify(response), now + IDEMPOTENCY_TTL_MS],
  );
}

let latestSchemaMigrationVersion = 0;

function ensureMigrationsTable() {
  return run(
    `
      CREATE TABLE IF NOT EXISTS db_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `,
  );
}

async function runInTransaction(work) {
  await run('BEGIN IMMEDIATE');
  try {
    const result = await work();
    await run('COMMIT');
    return result;
  } catch (error) {
    try {
      await run('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

async function applyDatabaseMigration({ version, description, up }) {
  await runInTransaction(async () => {
    const existing = await get('SELECT version FROM db_migrations WHERE version = ?', [version]);
    if (existing) {
      return;
    }

    await up();
    await run(
      `
        INSERT INTO db_migrations (version, description, applied_at)
        VALUES (?, ?, datetime('now'))
      `,
      [version, description],
    );
  });
}

async function loadLatestMigrationVersion() {
  const row = await get('SELECT COALESCE(MAX(version), 0) AS version FROM db_migrations');
  latestSchemaMigrationVersion = Number(row?.version || 0);
  return latestSchemaMigrationVersion;
}

async function createBaseTablesAndIndexes() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kakao_id TEXT NOT NULL UNIQUE,
      nickname TEXT,
      email TEXT,
      profile_image TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS user_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      state_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      csrf_token TEXT NOT NULL,
      kakao_access_token TEXT,
      kakao_refresh_token TEXT,
      kakao_token_expires_at INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      ip TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS idempotency_store (
      idempotency_key TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON user_states(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_oauth_states_created_at ON oauth_states(created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_store(expires_at)');

  await ensureUsersSchema();
  await ensureStateSchemas();
}

async function ensureDatabase() {
  await ensureMigrationsTable();

  await applyDatabaseMigration({
    version: 1,
    description: 'baseline_auth_state_schema',
    up: async () => {
      await createBaseTablesAndIndexes();
    },
  });

  await applyDatabaseMigration({
    version: 2,
    description: 'collab_schema',
    up: async () => {
      await ensureCollabSchemas();
    },
  });

  await applyDatabaseMigration({
    version: 3,
    description: 'security_and_poll_meta',
    up: async () => {
      await run('CREATE INDEX IF NOT EXISTS idx_idempotency_updated_at ON idempotency_store(updated_at)');
    },
  });

  await loadLatestMigrationVersion();
}

const BUCKET_KEYS = ['bucket1', 'bucket2', 'bucket3', 'bucket4', 'bucket5', 'bucket6', 'bucket7', 'bucket8'];
const DEFAULT_BUCKET_LABELS = BUCKET_KEYS.reduce((acc, bucket, index) => {
  acc[bucket] = `버킷 ${index + 1}`;
  return acc;
}, {});
const DEFAULT_BUCKET_VISIBILITY = BUCKET_KEYS.reduce((acc, bucket, index) => {
  acc[bucket] = index < 4;
  return acc;
}, {});
const DEFAULT_USER_PROFILE = Object.freeze({
  nickname: '',
  honorific: '님',
});
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

function normalizeIsoDateOnly(rawValue) {
  const parsed = parseDateFromUnknown(rawValue);
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : '';
}

function normalizeUtcTimestamp(rawValue, fallback = '') {
  const fallbackValue = fallback || new Date().toISOString();
  if (rawValue == null || rawValue === '') {
    return fallbackValue;
  }
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackValue;
  }
  return parsed.toISOString();
}

function normalizeTodoSubtasksForState(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID(),
      text: String(entry.text || entry.title || '').trim().slice(0, 120),
      done: Boolean(entry.done || entry.completed),
      createdAt: normalizeUtcTimestamp(entry.createdAt),
    }))
    .filter((entry) => Boolean(entry.text));
}

function normalizeTodoMemosForState(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID(),
      text: String(entry.text || '').trim().slice(0, 1200),
      createdAt: normalizeUtcTimestamp(entry.createdAt),
    }))
    .filter((entry) => Boolean(entry.text));
}

function normalizeTodoCollection(input = [], options = {}) {
  const { includeCompletedAt = false, includeLegacyCategory = false } = options;
  const source = Array.isArray(input) ? input : [];
  return source
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const title = String(entry.title || '').trim().slice(0, 120);
      const createdAt = normalizeUtcTimestamp(entry.createdAt);
      const dueDate = normalizeIsoDateOnly(entry.dueDate);
      const priorityRaw = Number(entry.priority || 2);
      const priority = Number.isInteger(priorityRaw) && priorityRaw >= 1 && priorityRaw <= 3 ? priorityRaw : 2;
      const bucket = typeof entry.bucket === 'string' && BUCKET_KEYS.includes(entry.bucket) ? entry.bucket : 'bucket4';
      const normalized = {
        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID(),
        title,
        details: String(entry.details || entry.description || '').slice(0, 1200),
        subtasks: normalizeTodoSubtasksForState(entry.subtasks || entry.subTasks || []),
        memos: normalizeTodoMemosForState(entry.memos || entry.notes || []),
        projectLaneId: typeof entry.projectLaneId === 'string' ? entry.projectLaneId.trim() : '',
        bucket,
        priority,
        dueDate,
        createdAt,
      };
      if (includeLegacyCategory) {
        normalized.legacyCategoryId =
          typeof entry.categoryId === 'string' && entry.categoryId.trim() ? entry.categoryId.trim() : '';
        normalized.legacyCategory =
          typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : '';
      }
      if (includeCompletedAt) {
        normalized.completedAt = normalizeUtcTimestamp(entry.completedAt);
      }
      return normalized;
    })
    .filter((entry) => Boolean(entry.title));
}

function buildProjectLaneResolver(projectLanes = []) {
  const laneById = new Map();
  const laneByBucketName = new Map();

  projectLanes.forEach((lane) => {
    if (!lane || typeof lane !== 'object') {
      return;
    }
    laneById.set(lane.id, lane);
    laneByBucketName.set(`${lane.bucket}:${String(lane.name || '').toLowerCase()}`, lane.id);
  });

  return {
    laneById,
    laneByBucketName,
  };
}

function resolveProjectLaneId(entry, resolver) {
  if (!entry || !resolver) {
    return '';
  }

  const current = typeof entry.projectLaneId === 'string' ? entry.projectLaneId.trim() : '';
  if (current && resolver.laneById.has(current)) {
    const lane = resolver.laneById.get(current);
    if (lane && lane.bucket === entry.bucket) {
      return current;
    }
  }

  const candidates = [entry.legacyCategoryId, entry.legacyCategory]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (resolver.laneById.has(candidate)) {
      const lane = resolver.laneById.get(candidate);
      if (lane && lane.bucket === entry.bucket) {
        return lane.id;
      }
    }

    const byName = resolver.laneByBucketName.get(`${entry.bucket}:${candidate.toLowerCase()}`);
    if (byName && resolver.laneById.has(byName)) {
      return byName;
    }
  }

  return '';
}

function migrateLegacyProjectLaneCollection(items = [], resolver) {
  return items.map((entry) => {
    const migratedLaneId = resolveProjectLaneId(entry, resolver);
    const { legacyCategoryId, legacyCategory, categoryId, category, ...rest } = entry;
    return {
      ...rest,
      projectLaneId: migratedLaneId,
    };
  });
}

function normalizeCalendarCollection(input = []) {
  const source = Array.isArray(input) ? input : [];
  return source
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const date = normalizeIsoDateOnly(entry.date);
      const endDateRaw = normalizeIsoDateOnly(entry.endDate || entry.date);
      const endDate = endDateRaw && endDateRaw >= date ? endDateRaw : date;
      return {
        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : crypto.randomUUID(),
        date,
        endDate,
        type: entry.type === 'todo' ? 'todo' : 'note',
        text: String(entry.text || '').trim().slice(0, 1200),
        createdAt: normalizeUtcTimestamp(entry.createdAt),
      };
    })
    .filter((entry) => Boolean(entry.date) && Boolean(entry.text));
}

function normalizeState(payload = {}) {
  const bucketLabelsInput =
    payload && typeof payload.bucketLabels === 'object' && payload.bucketLabels !== null ? payload.bucketLabels : {};
  const bucketOrderInput = Array.isArray(payload?.bucketOrder) ? payload.bucketOrder : [];
  const bucketVisibilityInput =
    payload && typeof payload.bucketVisibility === 'object' && payload.bucketVisibility !== null
      ? payload.bucketVisibility
      : {};
  const projectLanesInput = Array.isArray(payload?.projectLanes) ? payload.projectLanes : [];
  const userProfileInput =
    payload && typeof payload.userProfile === 'object' && payload.userProfile !== null ? payload.userProfile : {};
  const normalizedProjectLanes = normalizeProjectLanes(projectLanesInput);
  const laneResolver = buildProjectLaneResolver(normalizedProjectLanes);
  const normalizedTodos = migrateLegacyProjectLaneCollection(
    normalizeTodoCollection(payload?.todos || [], { includeLegacyCategory: true }),
    laneResolver,
  );
  const normalizedDoneLog = migrateLegacyProjectLaneCollection(
    normalizeTodoCollection(payload?.doneLog || [], { includeCompletedAt: true, includeLegacyCategory: true }),
    laneResolver,
  );

  return {
    todos: normalizedTodos,
    doneLog: normalizedDoneLog,
    calendarItems: normalizeCalendarCollection(payload?.calendarItems || []),
    bucketLabels: normalizeBucketLabels(bucketLabelsInput),
    bucketOrder: normalizeBucketOrder(bucketOrderInput),
    bucketVisibility: normalizeBucketVisibility(bucketVisibilityInput),
    projectLanes: normalizedProjectLanes,
    userProfile: normalizeUserProfile(userProfileInput),
  };
}

function normalizeUserProfile(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const nicknameRaw = typeof source.nickname === 'string' ? source.nickname.trim() : '';
  const honorificRaw = typeof source.honorific === 'string' ? source.honorific.trim() : '';
  const nickname = nicknameRaw.slice(0, 20);
  const honorific = (honorificRaw || DEFAULT_USER_PROFILE.honorific).slice(0, 12);

  return {
    nickname,
    honorific: honorific || DEFAULT_USER_PROFILE.honorific,
  };
}

function normalizeBucketLabels(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return BUCKET_KEYS.reduce((acc, bucket) => {
    const raw = typeof source[bucket] === 'string' ? source[bucket].trim() : '';
    const label = raw && !hasBrokenText(raw) ? raw : '';
    acc[bucket] = label || DEFAULT_BUCKET_LABELS[bucket] || bucket;
    return acc;
  }, {});
}

function normalizeBucketOrder(input = []) {
  const source = Array.isArray(input) ? input.filter((bucket) => BUCKET_KEYS.includes(bucket)) : [];
  const unique = [...new Set(source)];
  const missing = BUCKET_KEYS.filter((bucket) => !unique.includes(bucket));
  return [...unique, ...missing];
}

function normalizeBucketVisibility(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const visibility = BUCKET_KEYS.reduce((acc, bucket) => {
    acc[bucket] =
      typeof source[bucket] === 'boolean'
        ? source[bucket]
        : DEFAULT_BUCKET_VISIBILITY[bucket] !== false;
    return acc;
  }, {});

  if (!BUCKET_KEYS.some((bucket) => visibility[bucket] !== false)) {
    visibility.bucket1 = true;
  }
  return visibility;
}

function normalizeProjectLanes(input = []) {
  const source = Array.isArray(input) ? input : [];
  const ids = new Set();
  const normalized = [];

  source.forEach((lane) => {
    if (!lane || typeof lane !== 'object') {
      return;
    }
    const id = typeof lane.id === 'string' && lane.id.trim() ? lane.id.trim() : crypto.randomUUID();
    if (ids.has(id)) {
      return;
    }

    const name = typeof lane.name === 'string' ? lane.name.trim().slice(0, 30) : '';
    if (!name) {
      return;
    }
    if (hasBrokenText(name)) {
      return;
    }
    const bucket = typeof lane.bucket === 'string' && BUCKET_KEYS.includes(lane.bucket) ? lane.bucket : 'bucket2';
    const duplicated = normalized.some(
      (item) => item.bucket === bucket && item.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicated) {
      return;
    }

    const width = Number(lane.width || 0);
    const height = Number(lane.height || 0);

    ids.add(id);
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

function parseKakaoProfile(body) {
  if (!body || !body.id) {
    return null;
  }

  const kakaoAccount = body.kakao_account || {};
  const properties = body.properties || {};
  const profile = kakaoAccount.profile || properties;

  const kakaoId = String(body.id).trim();
  if (!kakaoId) {
    return null;
  }

  const nickname = profile.nickname || profile.nickName || kakaoAccount.profile_nickname || null;
  const profileImage = profile.profile_image_url
    ? String(profile.profile_image_url)
    : profile.thumbnail_image_url
      ? String(profile.thumbnail_image_url)
      : null;

  return {
    kakaoId,
    nickname: nickname ? String(nickname) : null,
    email: kakaoAccount.email ? String(kakaoAccount.email) : null,
    profileImage,
  };
}

function getRedirectUri(req) {
  const configuredRedirect = String(process.env.KAKAO_REDIRECT_URI || '').trim();
  if (configuredRedirect) {
    try {
      const parsed = new URL(configuredRedirect);
      const redirectHost = parsed.hostname.toLowerCase();
      const forwardedHost = req.get('x-forwarded-host');
      const requestHost = String(forwardedHost || req.get('host') || '').split(',')[0].trim();
      const requestHostname = requestHost.split(':')[0].toLowerCase();
      const isRedirectLocalhost = redirectHost === 'localhost' || redirectHost === '127.0.0.1';
      const isRequestLocalhost =
        !requestHostname || requestHostname === 'localhost' || requestHostname === '127.0.0.1';
      if (!isRedirectLocalhost || isRequestLocalhost) {
        return configuredRedirect;
      }
    } catch {
      // Fall through to request-derived redirect URI.
    }
  }
  const forwardedProto = req.get('x-forwarded-proto');
  const proto = String(forwardedProto || req.protocol || 'https').split(',')[0].trim();
  const forwardedHost = req.get('x-forwarded-host');
  const host = String(forwardedHost || req.get('host') || '').split(',')[0].trim();
  if (!host) {
    return '/api/auth/kakao/callback';
  }
  return `${proto}://${host}/api/auth/kakao/callback`;
}

function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSessionSignature(sessionId) {
  const secret = process.env.SESSION_SECRET || 'daycheck-dev-secret';
  return crypto.createHmac('sha256', secret).update(sessionId).digest('hex');
}

function buildSignedSessionCookie(sessionId) {
  return `${sessionId}.${createSessionSignature(sessionId)}`;
}

function parseSignedSessionCookie(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parts = value.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const sessionId = parts[0];
  const signature = parts[1];
  if (!sessionId || !signature) {
    return null;
  }

  const expected = createSessionSignature(sessionId);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(left, right)) {
    return null;
  }

  return sessionId;
}

function payloadHash(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function secureCookieSettings(isProd) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

function csrfCookieSettings(isProd) {
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

function oauthStateCookieSettings(isProd) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_STATE_TTL_MS,
  };
}

function isStateValid(record) {
  return !!record && !!record.createdAt && Date.now() - record.createdAt <= OAUTH_STATE_TTL_MS;
}

async function cleanupExpiredStates() {
  const cutoff = Date.now() - OAUTH_STATE_TTL_MS;
  await run('DELETE FROM oauth_states WHERE created_at < ?', [cutoff]);
}

async function cleanupExpiredSessions() {
  await run('DELETE FROM user_sessions WHERE expires_at <= ?', [Date.now()]);
}

async function cleanupIdempotencyStore() {
  await run('DELETE FROM idempotency_store WHERE expires_at <= ?', [Date.now()]);
}

async function loadUserById(userId) {
  return get(
    `SELECT
      id,
      kakao_id,
      nickname,
      email,
      profile_image,
      last_login_at,
      public_id,
      public_id_updated_at
    FROM users
    WHERE id = ?`,
    [userId],
  );
}

async function upsertUser(profile) {
  const includeLegacyNaverId = USERS_REQUIRE_NAVER_ID;
  const insertColumns = includeLegacyNaverId
    ? 'kakao_id, naver_id, nickname, email, profile_image, updated_at, last_login_at'
    : 'kakao_id, nickname, email, profile_image, updated_at, last_login_at';
  const insertValues = includeLegacyNaverId
    ? [profile.kakaoId, profile.kakaoId, profile.nickname, profile.email, profile.profileImage]
    : [profile.kakaoId, profile.nickname, profile.email, profile.profileImage];
  const placeholders = includeLegacyNaverId
    ? '?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\')'
    : '?, ?, ?, ?, datetime(\'now\'), datetime(\'now\')';

  await run(
    `INSERT INTO users (${insertColumns})
           VALUES (${placeholders})
           ON CONFLICT(kakao_id)
           DO UPDATE SET
             nickname = excluded.nickname,
             email = excluded.email,
             profile_image = excluded.profile_image,
             updated_at = datetime('now'),
             last_login_at = datetime('now')`,
    insertValues,
  );

  return get(
    `SELECT
      id,
      kakao_id,
      nickname,
      email,
      profile_image,
      public_id,
      public_id_updated_at
    FROM users
    WHERE kakao_id = ?`,
    [profile.kakaoId],
  );
}

async function getStateRow(userId) {
  const row = await get(
    'SELECT state_json, version, updated_at FROM user_states WHERE user_id = ?',
    [userId],
  );

  if (!row) {
    return {
      state: normalizeState({}),
      version: 0,
      updatedAt: null,
      exists: false,
      hasData: false,
    };
  }

  let parsed = {};
  try {
    parsed = JSON.parse(row.state_json || '{}');
  } catch {
    parsed = {};
  }

  const normalized = normalizeState(parsed);
  const defaultBucketLabels = { ...DEFAULT_BUCKET_LABELS };
  const defaultBucketOrder = [...BUCKET_KEYS];
  const defaultBucketVisibility = { ...DEFAULT_BUCKET_VISIBILITY };
  const hasCustomBucketLabels = Object.keys(defaultBucketLabels).some(
    (bucket) => normalized.bucketLabels?.[bucket] !== defaultBucketLabels[bucket],
  );
  const hasCustomBucketOrder = normalized.bucketOrder.some((bucket, index) => bucket !== defaultBucketOrder[index]);
  const hasCustomBucketVisibility = Object.keys(defaultBucketVisibility).some(
    (bucket) => normalized.bucketVisibility?.[bucket] !== defaultBucketVisibility[bucket],
  );
  const hasProjectLanes = Array.isArray(normalized.projectLanes) && normalized.projectLanes.length > 0;
  const normalizedUserProfile = normalizeUserProfile(normalized.userProfile || {});
  const hasCustomUserProfile =
    (normalizedUserProfile.nickname && normalizedUserProfile.nickname !== DEFAULT_USER_PROFILE.nickname) ||
    (normalizedUserProfile.honorific &&
      normalizedUserProfile.honorific !== DEFAULT_USER_PROFILE.honorific &&
      normalizedUserProfile.honorific !== '');
  const hasData =
    normalized.todos.length > 0 ||
    normalized.doneLog.length > 0 ||
    normalized.calendarItems.length > 0 ||
    hasCustomBucketLabels ||
    hasCustomBucketOrder ||
    hasCustomBucketVisibility ||
    hasProjectLanes ||
    hasCustomUserProfile;

  return {
    state: normalized,
    version: Number(row.version || 0),
    updatedAt: row.updated_at || null,
    exists: true,
    hasData,
  };
}

async function refreshKakaoAccessTokenIfNeeded(session) {
  if (!session || !session.kakaoRefreshToken) {
    return session;
  }

  if (!session.kakaoTokenExpiresAt || session.kakaoTokenExpiresAt - Date.now() > OAUTH_REFRESH_SKEW_MS) {
    return session;
  }

  if (!process.env.KAKAO_CLIENT_ID || !process.env.KAKAO_CLIENT_SECRET) {
    return session;
  }

  try {
    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.KAKAO_CLIENT_ID,
      client_secret: process.env.KAKAO_CLIENT_SECRET,
      refresh_token: session.kakaoRefreshToken,
    });

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: refreshParams.toString(),
    });

    if (!response.ok) {
      return session;
    }

    const data = await response.json();
    if (!data || data.error || !data.access_token) {
      return session;
    }

    return {
      ...session,
      kakaoAccessToken: data.access_token,
      kakaoRefreshToken: data.refresh_token || session.kakaoRefreshToken,
      kakaoTokenExpiresAt:
        Number(data.expires_in || 0) > 0 ? Date.now() + Number(data.expires_in) * 1000 : session.kakaoTokenExpiresAt,
    };
  } catch (error) {
    logSecurityEvent('oauth_token_refresh_failed', {
      userId: session.userId || null,
      error: error && error.message ? error.message : String(error),
    });
    // ignore refresh failures; app session can continue without kakao token refresh.
  }
  return session;
}

async function authSessionMiddleware(req, res, next) {
  try {
    const rawCookie = req.cookies?.[SESSION_COOKIE];
    const sessionId = parseSignedSessionCookie(rawCookie);

    if (rawCookie && !sessionId) {
      logSecurityEvent('invalid_session_cookie', { ip: req.ip, path: req.path, method: req.method });
      res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
      res.locals.userSession = null;
      next();
      return;
    }

    let session = sessionId ? await getSessionRecord(sessionId) : null;
    const now = Date.now();
    const isAbsoluteExpired =
      !!session &&
      Number.isFinite(Number(session.createdAt)) &&
      now - Number(session.createdAt) > SESSION_ABSOLUTE_TTL_MS;

    if (!session || session.expiresAt <= now || isAbsoluteExpired) {
      if (sessionId && session) {
        await deleteSessionRecord(sessionId);
        logSecurityEvent(isAbsoluteExpired ? 'session_absolute_expired' : 'session_expired', {
          sessionId,
          ip: req.ip,
          path: req.path,
          method: req.method,
          userId: session.userId || null,
        });
      }
      if (sessionId || rawCookie) {
        res.clearCookie(SESSION_COOKIE);
        res.clearCookie(CSRF_COOKIE);
      }
      res.locals.userSession = null;
      next();
      return;
    }

    session = await refreshKakaoAccessTokenIfNeeded(session);
    if (!session.csrfToken) {
      session.csrfToken = generateRandomToken();
    }
    session.expiresAt = now + SESSION_TTL_MS;
    await saveSessionRecord(sessionId, session);
    if ((req.cookies?.[CSRF_COOKIE] || '') !== session.csrfToken) {
      res.cookie(CSRF_COOKIE, session.csrfToken, csrfCookieSettings(process.env.NODE_ENV === 'production'));
      if (req.cookies) {
        req.cookies[CSRF_COOKIE] = session.csrfToken;
      }
    }
    res.locals.userSession = {
      ...session,
      sessionId,
    };
    next();
  } catch (error) {
    next(error);
  }
}

function requireAuth(req, res, next) {
  if (!res.locals.userSession) {
    logSecurityEvent('unauthorized_access', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      sessionId: parseSignedSessionCookie(req.cookies?.[SESSION_COOKIE]),
    });
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  req.auth = {
    userId: res.locals.userSession.userId,
    sessionId: res.locals.userSession.sessionId || null,
    csrfToken: res.locals.userSession.csrfToken || '',
  };
  next();
}

function validateCsrf(req, res, next) {
  const headerToken = req.get('x-csrf-token');
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const expected = req.auth.csrfToken;

  if (!expected || !headerToken || !cookieToken || headerToken !== expected || cookieToken !== expected) {
    logSecurityEvent('invalid_csrf_token', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      sessionId: req.auth.sessionId || null,
      userId: req.auth.userId || null,
    });
    res.status(403).json({ error: 'invalid_csrf_token' });
    return;
  }

  next();
}

let authRouterInstance = null;
let stateRouterInstance = null;
let holidaysRouterInstance = null;
let collabRouterInstance = null;

function createAuthRouter() {
  if (!authRouterInstance) {
    const { createAuthRouter } = require('./server/modules/auth/router');
    const { createAuthService } = require('./server/modules/auth/service');
    const { createAuthRepository } = require('./server/modules/auth/repository');

    const authService = createAuthService({
      parseKakaoProfile,
      generateRandomToken,
      getRedirectUri,
      buildSignedSessionCookie,
      parseSignedSessionCookie,
    });

    const authRepository = createAuthRepository({
      loadUserById,
      upsertUser,
      getSessionRecord,
      saveSessionRecord,
      deleteSessionRecord,
      getOauthState,
      createOauthState,
      deleteOauthState,
    });

    authRouterInstance = createAuthRouter({
      logSecurityEvent,
      authSessionMiddleware,
      repository: authRepository,
      service: authService,
      secureCookieSettings,
      csrfCookieSettings,
      oauthStateCookieSettings,
      sessionCookieName: SESSION_COOKIE,
      csrfCookieName: CSRF_COOKIE,
      oauthStateCookieName: OAUTH_STATE_COOKIE,
      isStateValid,
      sessionTtlMs: SESSION_TTL_MS,
    });
  }

  return authRouterInstance;
}

function createStateRouter() {
  if (!stateRouterInstance) {
    const { createStateRouter } = require('./server/modules/state/router');
    const { createStateService } = require('./server/modules/state/service');
    const { createStateRepository } = require('./server/modules/state/repository');

    const stateService = createStateService({
      normalizeState,
      payloadHash,
    });
    const stateRepository = createStateRepository({
      getStateRow,
      run,
      getIdempotencyEntry,
      saveIdempotencyRecord,
    });

    stateRouterInstance = createStateRouter({
      authSessionMiddleware,
      requireAuth,
      validateCsrf,
      service: stateService,
      repository: stateRepository,
    });
  }

  return stateRouterInstance;
}

function createHolidaysRouter() {
  if (!holidaysRouterInstance) {
    const { createHolidaysRouter } = require('./server/modules/holidays/router');
    const { createHolidaysService } = require('./server/modules/holidays/service');

    const holidaysService = createHolidaysService({ getHolidaysByYear });
    holidaysRouterInstance = createHolidaysRouter({
      logSecurityEvent,
      service: holidaysService,
    });
  }

  return holidaysRouterInstance;
}

function createCollabRouter() {
  if (!collabRouterInstance) {
    const { createCollabRouter } = require('./server/modules/collab/router');
    const { createCollabService } = require('./server/modules/collab/service');
    const { createCollabRepository } = require('./server/modules/collab/repository');

    const repository = createCollabRepository({
      run,
      get,
      all,
    });
    const service = createCollabService({
      repository,
    });

    collabRouterInstance = createCollabRouter({
      validateCsrf,
      service,
    });
  }

  return collabRouterInstance;
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", 'https://fonts.googleapis.com'],
      'style-src':  ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      'font-src':   ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      'img-src':    ["'self'", 'data:'],
    },
  },
}));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const forwardedProto = req.get('x-forwarded-proto') || '';
    const firstProto = forwardedProto.split(',')[0].trim();
    const isSecure = req.secure || firstProto === 'https';

    if (!isSecure) {
      if (req.path.startsWith('/api/')) {
        res.status(400).json({ error: 'https_required' });
      } else {
        res.status(400).send('https_required');
      }
      return;
    }
  }

  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/meta', (_req, res) => {
  res.json({
    bucketKeys: [...BUCKET_KEYS],
    defaultBucketLabels: { ...DEFAULT_BUCKET_LABELS },
    defaultBucketVisibility: { ...DEFAULT_BUCKET_VISIBILITY },
    poll: {
      stateActiveMs: POLL_STATE_ACTIVE_MS,
      stateHiddenMs: POLL_STATE_HIDDEN_MS,
      collabActiveMs: POLL_COLLAB_ACTIVE_MS,
      collabHiddenMs: POLL_COLLAB_HIDDEN_MS,
    },
    holidays: {
      provider: HOLIDAY_API_PROVIDER,
      clientCacheTtlMs: HOLIDAY_CLIENT_CACHE_TTL_MS,
    },
    schema: {
      latestMigrationVersion: Number(latestSchemaMigrationVersion || 0),
    },
  });
});

app.use('/api/holidays', createHolidaysRouter());

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  createAuthRouter(),
);
app.use('/api/state', createStateRouter());
app.use('/api/collab', authSessionMiddleware, requireAuth, createCollabRouter());

app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(PUBLIC_ROOT, 'sw.js'));
});

// ── 아발론 정적 파일 ──────────────────────────────────────────
app.use('/avalon', express.static(path.join(__dirname, 'public/avalon'), {
  setHeaders: (res) => { res.setHeader('Cache-Control', 'no-cache'); },
}));
app.get('/avalon', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public/avalon/index.html'));
});

app.use(
  express.static(PUBLIC_ROOT, {
    setHeaders: (res, filePath) => {
      const normalized = String(filePath || '').replace(/\\/g, '/');
      if (normalized.endsWith('/index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return;
      }
      if (/\.(?:css|js|mjs)$/i.test(normalized)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(PUBLIC_ROOT, 'index.html'));
});

app.use((error, req, res, _next) => {
  console.error(error);
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    res.status(500).json({ error: 'internal_server_error' });
    return;
  }
  res.status(500).send('internal_server_error');
});

function startServer() {
  return Promise.resolve()
    .then(() => {
      validateRequiredSecurityConfig();
      return ensureDatabase();
    })
    .then(() => {
      const isProd = process.env.NODE_ENV === 'production';

      if (isProd && !process.env.SESSION_SECRET) {
        console.error('[security] SESSION_SECRET is required in production.');
        throw new Error('SESSION_SECRET is required in production.');
      }

      if (!process.env.KAKAO_CLIENT_ID || !process.env.KAKAO_CLIENT_SECRET) {
        const level = isProd ? 'error' : 'warn';
        console[level](
          '[security] KAKAO_CLIENT_ID or KAKAO_CLIENT_SECRET is not configured. OAuth endpoints will fail.',
        );
      }
      console.log('[security] Session token encryption enabled for OAuth tokens.');

      setInterval(() => {
        cleanupExpiredStates().catch(() => {});
      }, 60 * 1000);
      setInterval(() => {
        cleanupExpiredSessions().catch(() => {});
      }, 60 * 1000);
      setInterval(() => {
        cleanupIdempotencyStore().catch(() => {});
      }, 60 * 1000);

      return new Promise((resolve) => {
        const httpServer = http.createServer(app);
        const io = new SocketIO(httpServer, {
          cors: { origin: false },
          transports: ['websocket', 'polling'],
        });
        attachAvalonHandlers(io);
        httpServer.listen(PORT, () => {
          console.log(`day-check server listening on http://localhost:${PORT}`);
          resolve(httpServer);
        });
      });
    });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  createHolidaysRouter,
  createAuthRouter,
  createStateRouter,
  createCollabRouter,
  authSessionMiddleware,
  requireAuth,
  validateCsrf,
  getHolidaysByYear,
  getSessionRecord,
  saveSessionRecord,
  deleteSessionRecord,
  getOauthState,
  createOauthState,
  deleteOauthState,
  getIdempotencyEntry,
  saveIdempotencyRecord,
  payloadHash,
  parseSignedSessionCookie,
  buildSignedSessionCookie,
  safeTrim,
  normalizeState,
  getStateRow,
  run,
  get,
  all,
  getRedirectUri,
  generateRandomToken,
  parseKakaoProfile,
  loadUserById,
  upsertUser,
  ensureDatabase,
  ensureCollabSchemas,
  logSecurityEvent,
  closeDatabase,
};

