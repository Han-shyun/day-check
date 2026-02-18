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
const PORT = Number(process.env.PORT || 4173);

const SESSION_COOKIE = 'daycheck_session';
const OAUTH_STATE_COOKIE = 'daycheck_oauth_state';
const CSRF_COOKIE = 'daycheck_csrf';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const OAUTH_REFRESH_SKEW_MS = 60 * 1000;

const DB_PATH = path.resolve(process.cwd(), process.env.DATABASE_PATH || 'daycheck.sqlite');
const PUBLIC_ROOT = path.resolve(process.cwd());

const sessions = new Map();
const oauthStates = new Map();
const idempotencyStore = new Map();

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

function ensureDatabase() {
  return run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naver_id TEXT NOT NULL UNIQUE,
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
    .then(() => run('CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON user_states(user_id)'));
}

function normalizeState(payload = {}) {
  const todos = Array.isArray(payload.todos) ? payload.todos : [];
  const doneLog = Array.isArray(payload.doneLog) ? payload.doneLog : [];
  const calendarItems = Array.isArray(payload.calendarItems) ? payload.calendarItems : [];
  const categoriesInput = Array.isArray(payload.categories) ? payload.categories : [];
  const categories = categoriesInput.filter(
    (item) => item && typeof item.id === 'string' && typeof item.name === 'string',
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
    categories,
  };
}

function parseNaverProfile(body) {
  if (!body || body.resultcode !== '00' || !body.response) {
    return null;
  }

  const response = body.response;
  const naverId = String(response.id || '').trim();
  if (!naverId) {
    return null;
  }

  return {
    naverId,
    nickname: response.nickname ? String(response.nickname) : null,
    email: response.email ? String(response.email) : null,
    profileImage: response.profile_image ? String(response.profile_image) : null,
  };
}

function getRedirectUri(req) {
  if (process.env.NAVER_REDIRECT_URI) {
    return process.env.NAVER_REDIRECT_URI;
  }
  return `${req.protocol}://${req.get('host')}/api/auth/naver/callback`;
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

function cleanupExpiredStates() {
  const cutoff = Date.now() - OAUTH_STATE_TTL_MS;
  for (const [state, entry] of oauthStates.entries()) {
    if (entry.createdAt < cutoff) {
      oauthStates.delete(state);
    }
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function cleanupIdempotencyStore() {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (entry.expiresAt <= now) {
      idempotencyStore.delete(key);
    }
  }
}

async function loadUserById(userId) {
  return get(
    'SELECT id, naver_id, nickname, email, profile_image, last_login_at FROM users WHERE id = ?',
    [userId],
  );
}

async function upsertUser(profile) {
  await run(
    `INSERT INTO users (naver_id, nickname, email, profile_image, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(naver_id)
     DO UPDATE SET
       nickname = excluded.nickname,
       email = excluded.email,
       profile_image = excluded.profile_image,
       updated_at = datetime('now'),
       last_login_at = datetime('now')`,
    [profile.naverId, profile.nickname, profile.email, profile.profileImage],
  );

  return get('SELECT id, naver_id, nickname, email, profile_image FROM users WHERE naver_id = ?', [
    profile.naverId,
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
  const hasData =
    normalized.todos.length > 0 ||
    normalized.doneLog.length > 0 ||
    normalized.calendarItems.length > 0 ||
    normalized.categories.length > 1;

  return {
    state: normalized,
    version: Number(row.version || 0),
    updatedAt: row.updated_at || null,
    exists: true,
    hasData,
  };
}

async function refreshNaverAccessTokenIfNeeded(sessionId, session) {
  if (!session || !session.naverRefreshToken) {
    return;
  }

  if (!session.naverTokenExpiresAt || session.naverTokenExpiresAt - Date.now() > OAUTH_REFRESH_SKEW_MS) {
    return;
  }

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return;
  }

  try {
    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.NAVER_CLIENT_ID,
      client_secret: process.env.NAVER_CLIENT_SECRET,
      refresh_token: session.naverRefreshToken,
    });

    const response = await fetch('https://nid.naver.com/oauth2.0/token', {
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

    const updated = {
      ...session,
      naverAccessToken: data.access_token,
      naverRefreshToken: data.refresh_token || session.naverRefreshToken,
      naverTokenExpiresAt:
        Number(data.expires_in || 0) > 0 ? Date.now() + Number(data.expires_in) * 1000 : session.naverTokenExpiresAt,
    };

    sessions.set(sessionId, updated);
  } catch {
    // ignore refresh failures; app session can continue without naver token refresh.
  }
}

function authSessionMiddleware(req, res, next) {
  const rawCookie = req.cookies?.[SESSION_COOKIE];
  const sessionId = parseSignedSessionCookie(rawCookie);

  if (rawCookie && !sessionId) {
    res.clearCookie(SESSION_COOKIE);
    res.clearCookie(CSRF_COOKIE);
    res.locals.userSession = null;
    next();
    return;
  }

  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId && session) {
      sessions.delete(sessionId);
    }
    if (sessionId || rawCookie) {
      res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
    }
    res.locals.userSession = null;
    next();
    return;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  refreshNaverAccessTokenIfNeeded(sessionId, session).catch(() => {});
  res.locals.userSession = {
    ...session,
    sessionId,
  };
  next();
}

function requireAuth(req, res, next) {
  if (!res.locals.userSession) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  req.auth = {
    userId: res.locals.userSession.userId,
    csrfToken: res.locals.userSession.csrfToken || '',
  };
  next();
}

function validateCsrf(req, res, next) {
  const headerToken = req.get('x-csrf-token');
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const expected = req.auth.csrfToken;

  if (!expected || !headerToken || !cookieToken || headerToken !== expected || cookieToken !== expected) {
    res.status(403).json({ error: 'invalid_csrf_token' });
    return;
  }

  next();
}

function createAuthRouter() {
  const router = express.Router();

  function startNaverLogin(req, res) {
    if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
      res.status(500).json({ error: 'oauth_not_configured' });
      return;
    }

    const state = generateRandomToken();
    oauthStates.set(state, {
      createdAt: Date.now(),
      ip: req.ip,
    });

    const authorizeUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', process.env.NAVER_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', getRedirectUri(req));
    authorizeUrl.searchParams.set('state', state);

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieSettings(isProd));
    res.redirect(authorizeUrl.toString());
  }

  router.get('/me', authSessionMiddleware, async (req, res) => {
    if (!res.locals.userSession) {
      res.json({ authenticated: false });
      return;
    }

    const user = await loadUserById(res.locals.userSession.userId);
    if (!user) {
      sessions.delete(res.locals.userSession.sessionId);
      res.clearCookie(SESSION_COOKIE);
      res.clearCookie(CSRF_COOKIE);
      res.json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        naverId: user.naver_id,
        nickname: user.nickname,
        email: user.email,
        profileImage: user.profile_image,
      },
      lastLoginAt: user.last_login_at || null,
    });
  });

  router.get('/naver', authSessionMiddleware, startNaverLogin);
  router.get('/naver/login', authSessionMiddleware, startNaverLogin);

  router.get('/naver/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      res.redirect('/?auth=denied');
      return;
    }

    if (!code || !state) {
      res.status(400).send('invalid_callback');
      return;
    }

    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    const savedState = oauthStates.get(String(state));

    if (!cookieState || String(cookieState) !== String(state) || !isStateValid(savedState)) {
      res.clearCookie(OAUTH_STATE_COOKIE);
      res.status(403).send('invalid_state');
      return;
    }

    oauthStates.delete(String(state));
    res.clearCookie(OAUTH_STATE_COOKIE);

    try {
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.NAVER_CLIENT_ID,
        client_secret: process.env.NAVER_CLIENT_SECRET,
        code: String(code),
        state: String(state),
        redirect_uri: getRedirectUri(req),
      });

      const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        body: tokenParams.toString(),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.error || 'token_exchange_failed');
      }

      const profileResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      const profileBody = await profileResponse.json();
      const profile = parseNaverProfile(profileBody);
      if (!profile) {
        throw new Error('invalid_profile');
      }

      const user = await upsertUser(profile);
      const sessionId = generateRandomToken();
      const csrfToken = generateRandomToken();
      const now = Date.now();

      sessions.set(sessionId, {
        id: sessionId,
        userId: user.id,
        naverAccessToken: tokenData.access_token,
        naverRefreshToken: tokenData.refresh_token || null,
        naverTokenExpiresAt:
          Number(tokenData.expires_in || 0) > 0 ? now + Number(tokenData.expires_in) * 1000 : null,
        csrfToken,
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
      });

      const isProd = process.env.NODE_ENV === 'production';
      res.cookie(SESSION_COOKIE, buildSignedSessionCookie(sessionId), secureCookieSettings(isProd));
      res.cookie(CSRF_COOKIE, csrfToken, csrfCookieSettings(isProd));
      res.redirect(process.env.AUTH_SUCCESS_REDIRECT || '/?auth=success');
    } catch (error) {
      console.error('oauth_callback_error', error && error.message ? error.message : error);
      res.redirect('/?auth=error');
    }
  });

  router.post('/logout', authSessionMiddleware, (req, res) => {
    const sessionId = res.locals.userSession?.sessionId || parseSignedSessionCookie(req.cookies?.[SESSION_COOKIE]);
    const session = sessionId ? sessions.get(sessionId) : null;

    if (
      session &&
      session.naverAccessToken &&
      process.env.NAVER_CLIENT_ID &&
      process.env.NAVER_CLIENT_SECRET
    ) {
      const revokeParams = new URLSearchParams({
        grant_type: 'delete',
        client_id: process.env.NAVER_CLIENT_ID,
        client_secret: process.env.NAVER_CLIENT_SECRET,
        access_token: session.naverAccessToken,
        service_provider: 'NAVER',
      });

      fetch(`https://nid.naver.com/oauth2.0/token?${revokeParams.toString()}`).catch(() => {});
    }

    if (sessionId) {
      sessions.delete(sessionId);
    }

    res.clearCookie(SESSION_COOKIE);
    res.clearCookie(CSRF_COOKIE);
    res.clearCookie(OAUTH_STATE_COOKIE);
    res.json({ success: true });
  });

  return router;
}

function createStateRouter() {
  const router = express.Router();

  router.get('/', authSessionMiddleware, requireAuth, async (req, res) => {
    const stateRow = await getStateRow(req.auth.userId);
    res.json({
      state: stateRow.state,
      version: stateRow.version,
      exists: stateRow.exists,
      hasData: stateRow.hasData,
      updatedAt: stateRow.updatedAt,
    });
  });

  router.put('/', authSessionMiddleware, requireAuth, validateCsrf, async (req, res) => {
    const payload = normalizeState(req.body || {});
    const incomingVersion = Number(req.body?.version || 0);
    const current = await getStateRow(req.auth.userId);

    const idempotencyKeyRaw = req.get('Idempotency-Key');
    const idempotencyKey = idempotencyKeyRaw ? idempotencyKeyRaw.trim() : '';
    const idemStoreKey = idempotencyKey ? `${req.auth.userId}:${idempotencyKey}` : '';
    const requestHash = idempotencyKey
      ? payloadHash(`${incomingVersion}:${JSON.stringify(payload)}`)
      : '';

    if (idempotencyKey) {
      const previous = idempotencyStore.get(idemStoreKey);
      if (previous && previous.expiresAt > Date.now()) {
        if (previous.requestHash !== requestHash) {
          res.status(409).json({ error: 'idempotency_key_reuse' });
          return;
        }
        res.json(previous.response);
        return;
      }
    }

    if (current.version > 0 && incomingVersion > 0 && incomingVersion !== current.version) {
      res.status(409).json({
        error: 'version_conflict',
        version: current.version,
        state: current.state,
        updatedAt: current.updatedAt,
      });
      return;
    }

    const nextVersion = current.version > 0 ? current.version + 1 : 1;

    await run(
      `INSERT INTO user_states (user_id, state_json, version, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id)
       DO UPDATE SET
         state_json = excluded.state_json,
         version = ?,
         updated_at = datetime('now')`,
      [req.auth.userId, JSON.stringify(payload), nextVersion, nextVersion],
    );

    const responsePayload = {
      success: true,
      version: nextVersion,
      state: payload,
      updatedAt: new Date().toISOString(),
    };

    if (idempotencyKey) {
      idempotencyStore.set(idemStoreKey, {
        requestHash,
        response: responsePayload,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    res.json(responsePayload);
  });

  return router;
}

app.enable('trust proxy');
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

ensureDatabase()
  .then(() => {
    const isProd = process.env.NODE_ENV === 'production';

    if (isProd && !process.env.SESSION_SECRET) {
      console.error('[security] SESSION_SECRET is required in production.');
      process.exit(1);
      return;
    }

    if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
      const level = isProd ? 'error' : 'warn';
      console[level](
        '[security] NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is not configured. OAuth endpoints will fail.',
      );
    }

    setInterval(cleanupExpiredStates, 60 * 1000);
    setInterval(cleanupExpiredSessions, 60 * 1000);
    setInterval(cleanupIdempotencyStore, 60 * 1000);

    app.listen(PORT, () => {
      console.log(`day-check server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });

