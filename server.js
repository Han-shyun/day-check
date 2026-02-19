const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.set('trust proxy', 'loopback');
const PORT = Number(process.env.PORT || 4173);

const SESSION_COOKIE = 'daycheck_session';
const OAUTH_STATE_COOKIE = 'daycheck_oauth_state';
const CSRF_COOKIE = 'daycheck_csrf';
const SECURITY_EVENT_PREFIX = 'daycheck_security_event';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const OAUTH_REFRESH_SKEW_MS = 60 * 1000;
const SECURITY_EVENT_LOG_PATH = process.env.SECURITY_EVENT_LOG_PATH || path.resolve(process.cwd(), 'security-events.log');
const SECURITY_EVENTS_ENABLED = process.env.SECURITY_EVENTS_ENABLED !== 'false';
const SESSION_ENCRYPTION_KEY_CONFIGURED = Boolean(process.env.SESSION_ENCRYPTION_KEY);
const HOLIDAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HOLIDAY_FETCH_TIMEOUT_MS = 12_000;
const HOLIDAY_FALLBACK_FEED_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
const HOLIDAY_FEED_URL =
  process.env.HOLIDAY_FEED_URL || process.env.NAVER_HOLIDAY_FEED_URL || HOLIDAY_FALLBACK_FEED_URL;
const HOLIDAY_CACHE = new Map();
const HOLIDAY_FETCH_INFLIGHT = new Map();
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
    fs.appendFileSync(SECURITY_EVENT_LOG_PATH, `${text}\n`, 'utf8');
  } catch {
    // best-effort logging
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

function normalizeHolidaySourceUrl(year) {
  const rawUrl = safeTrim(HOLIDAY_FEED_URL);
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

async function fetchHolidaysFromNaver(year) {
  const sourceUrl = normalizeHolidaySourceUrl(year);
  if (!sourceUrl) {
    return {
      year,
      holidays: {},
      fallback: true,
      reason: 'source_not_configured',
      source: '',
    };
  }

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
        source: sourceUrl,
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
      source: sourceUrl,
    };
  } catch (error) {
    return {
      year,
      holidays: {},
      fallback: true,
      reason: error && error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      source: sourceUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
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

  const payload = fetchHolidaysFromNaver(year)
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

function ensureDatabase() {
  return run(`
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
  `)
    .then(() =>
      run(`
        CREATE TABLE IF NOT EXISTS user_states (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE,
          state_json TEXT NOT NULL DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
    )
    .then(() =>
      run(`
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
      `),
    )
    .then(() =>
      run(`
        CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          ip TEXT
        )
      `),
    )
    .then(() =>
      run(`
        CREATE TABLE IF NOT EXISTS idempotency_store (
          idempotency_key TEXT PRIMARY KEY,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `),
    )
    .then(() => run('CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON user_states(user_id)'))
    .then(() => run('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)'))
    .then(() => run('CREATE INDEX IF NOT EXISTS idx_oauth_states_created_at ON oauth_states(created_at)'))
    .then(() => run('CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_store(expires_at)'))
    .then(() => ensureUsersSchema())
    .then(() => ensureStateSchemas());
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

function normalizeState(payload = {}) {
  const todos = Array.isArray(payload.todos) ? payload.todos : [];
  const doneLog = Array.isArray(payload.doneLog) ? payload.doneLog : [];
  const calendarItems = Array.isArray(payload.calendarItems) ? payload.calendarItems : [];
  const categoriesInput = Array.isArray(payload.categories) ? payload.categories : [];
  const bucketLabelsInput = payload && typeof payload.bucketLabels === 'object' && payload.bucketLabels !== null ? payload.bucketLabels : {};
  const bucketOrderInput = Array.isArray(payload?.bucketOrder) ? payload.bucketOrder : [];
  const bucketVisibilityInput = payload && typeof payload.bucketVisibility === 'object' && payload.bucketVisibility !== null ? payload.bucketVisibility : {};
  const projectLanesInput = Array.isArray(payload?.projectLanes) ? payload.projectLanes : [];
  const userProfileInput = payload && typeof payload.userProfile === 'object' && payload.userProfile !== null ? payload.userProfile : {};
  const categories = categoriesInput.filter(
    (item) =>
      item &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      !hasBrokenText(item.name),
  );

  if (categories.length === 0) {
    categories.push({ id: 'uncategorized', name: '미분류' });
  }
  if (!categories.some((item) => item.id === 'uncategorized')) {
    categories.unshift({ id: 'uncategorized', name: '미분류' });
  }

  return {
    todos,
    doneLog,
    calendarItems,
    bucketLabels: normalizeBucketLabels(bucketLabelsInput),
    bucketOrder: normalizeBucketOrder(bucketOrderInput),
    bucketVisibility: normalizeBucketVisibility(bucketVisibilityInput),
    projectLanes: normalizeProjectLanes(projectLanesInput),
    categories,
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

    const categoryId = typeof lane.categoryId === 'string' && lane.categoryId.trim() ? lane.categoryId.trim() : '';
    const width = Number(lane.width || 0);
    const height = Number(lane.height || 0);

    ids.add(id);
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
    if (process.env.NODE_ENV === 'production') {
      try {
        const parsed = new URL(configuredRedirect);
        const host = parsed.hostname.toLowerCase();
        if (host !== 'localhost' && host !== '127.0.0.1') {
          return configuredRedirect;
        }
      } catch {
        // Fall through to request-derived redirect URI.
      }
    } else {
      return configuredRedirect;
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
    'SELECT id, kakao_id, nickname, email, profile_image, last_login_at FROM users WHERE id = ?',
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

  return get('SELECT id, kakao_id, nickname, email, profile_image FROM users WHERE kakao_id = ?', [
    profile.kakaoId,
  ]);
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
    normalized.categories.length > 1 ||
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
      return;
    }

    const data = await response.json();
    if (!data || data.error || !data.access_token) {
      return;
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

    if (!session || session.expiresAt <= Date.now()) {
      if (sessionId && session) {
        await deleteSessionRecord(sessionId);
        logSecurityEvent('session_expired', {
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
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    await saveSessionRecord(sessionId, session);
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

app.use(helmet());
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

app.use(express.static(PUBLIC_ROOT));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

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
  return ensureDatabase()
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
      if (SESSION_ENCRYPTION_KEY_CONFIGURED && !SESSION_TOKEN_ENCRYPTION_KEY) {
        console.error(
          '[security] SESSION_ENCRYPTION_KEY is set but invalid. Must be 32-byte base64/hex/utf8 string.',
        );
        if (isProd) {
          throw new Error('invalid_SESSION_ENCRYPTION_KEY');
        }
      }
      if (SESSION_TOKEN_ENCRYPTION_KEY) {
        console.log('[security] Session token encryption enabled for OAuth tokens.');
      } else {
        console.warn('[security] Session token encryption disabled. Configure SESSION_ENCRYPTION_KEY for production.');
      }

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
        const server = app.listen(PORT, () => {
          console.log(`day-check server listening on http://localhost:${PORT}`);
          resolve(server);
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
};


