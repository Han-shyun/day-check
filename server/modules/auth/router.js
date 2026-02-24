'use strict';

const { Router } = require('express');

function createAuthRouter(options = {}) {
  const {
    logSecurityEvent = () => {},
    authSessionMiddleware,
    repository = {},
    service = {},
    secureCookieSettings,
    csrfCookieSettings,
    oauthStateCookieSettings,
    sessionCookieName = 'daycheck_session',
    csrfCookieName = 'daycheck_csrf',
    oauthStateCookieName = 'daycheck_oauth_state',
    isStateValid = () => false,
    sessionTtlMs = 7 * 24 * 60 * 60 * 1000,
  } = options;

  const {
    loadUserById,
    upsertUser,
    getSessionRecord,
    saveSessionRecord,
    deleteSessionRecord,
    getOauthState,
    createOauthState,
    deleteOauthState,
  } = repository;
  const {
    parseSignedSessionCookie,
    buildSignedSessionCookie,
    parseKakaoProfile,
    generateRandomToken,
    getRedirectUri,
  } = service;

  const router = Router();

  async function startKakaoLogin(req, res) {
    if (!process.env.KAKAO_CLIENT_ID || !process.env.KAKAO_CLIENT_SECRET) {
      logSecurityEvent('oauth_not_configured', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      res.status(500).json({ error: 'oauth_not_configured' });
      return;
    }

    const state = generateRandomToken ? generateRandomToken() : '';
    await createOauthState?.(state, req.ip);

    const authorizeUrl = new URL('https://kauth.kakao.com/oauth/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', process.env.KAKAO_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', getRedirectUri(req));
    authorizeUrl.searchParams.set('state', state);

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(oauthStateCookieName, state, oauthStateCookieSettings(isProd));
    res.redirect(authorizeUrl.toString());
  }

  router.get('/me', authSessionMiddleware, async (req, res) => {
    if (!res.locals.userSession) {
      res.json({ authenticated: false });
      return;
    }

    const user = await loadUserById(res.locals.userSession.userId);
    if (!user) {
      await deleteSessionRecord(res.locals.userSession.sessionId);
      res.clearCookie(sessionCookieName);
      res.clearCookie(csrfCookieName);
      res.json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        kakaoId: user.kakao_id,
        nickname: user.nickname,
        email: user.email,
        profileImage: user.profile_image,
        publicId: user.public_id || null,
      },
      lastLoginAt: user.last_login_at || null,
    });
  });

  router.get('/kakao', authSessionMiddleware, startKakaoLogin);
  router.get('/kakao/login', authSessionMiddleware, startKakaoLogin);

  router.get('/kakao/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      logSecurityEvent('oauth_callback_error_param', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        error: String(oauthError),
      });
      res.redirect('/?auth=denied');
      return;
    }

    if (!code || !state) {
      logSecurityEvent('oauth_callback_missing_params', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      res.status(400).send('invalid_callback');
      return;
    }

    const cookieState = req.cookies?.[oauthStateCookieName];
    const savedState = await getOauthState(String(state));

    if (!cookieState || String(cookieState) !== String(state) || !isStateValid(savedState)) {
      logSecurityEvent('oauth_state_invalid', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        error: `cookieState=${String(cookieState || '')}, isValid=${isStateValid(savedState)}`,
      });
      res.clearCookie(oauthStateCookieName);
      res.status(403).send('invalid_state');
      return;
    }

    await deleteOauthState(String(state));
    res.clearCookie(oauthStateCookieName);

    try {
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_CLIENT_ID,
        client_secret: process.env.KAKAO_CLIENT_SECRET,
        code: String(code),
        redirect_uri: getRedirectUri(req),
      });

      const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
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

      const profileResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      const profileBody = await profileResponse.json();
      const profile = parseKakaoProfile(profileBody);
      if (!profile) {
        logSecurityEvent('oauth_invalid_profile', { ip: req.ip, path: req.path, method: req.method });
        throw new Error('invalid_profile');
      }

      const user = await upsertUser(profile);
      const sessionId = generateRandomToken();
      const csrfToken = generateRandomToken();
      const now = Date.now();

      await saveSessionRecord(sessionId, {
        id: sessionId,
        userId: user.id,
        kakaoAccessToken: tokenData.access_token,
        kakaoRefreshToken: tokenData.refresh_token || null,
        kakaoTokenExpiresAt:
          Number(tokenData.expires_in || 0) > 0 ? now + Number(tokenData.expires_in) * 1000 : null,
        csrfToken,
        createdAt: now,
        expiresAt: now + sessionTtlMs,
      });

      const isProd = process.env.NODE_ENV === 'production';
      res.cookie(sessionCookieName, buildSignedSessionCookie(sessionId), secureCookieSettings(isProd));
      res.cookie(csrfCookieName, csrfToken, csrfCookieSettings(isProd));
      res.redirect(process.env.AUTH_SUCCESS_REDIRECT || '/?auth=success');
    } catch (error) {
      logSecurityEvent('oauth_callback_failed', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        error: error && error.message ? error.message : String(error),
      });
      console.error('oauth_callback_error', error && error.message ? error.message : error);
      res.redirect('/?auth=error');
    }
  });

  router.post('/logout', authSessionMiddleware, async (req, res) => {
    const sessionId =
      res.locals.userSession?.sessionId || parseSignedSessionCookie?.(req.cookies?.[sessionCookieName]);
    const session = sessionId ? await getSessionRecord(sessionId) : null;

    if (session && session.kakaoAccessToken) {
      fetch('https://kapi.kakao.com/v1/user/unlink', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.kakaoAccessToken}`,
        },
      }).catch(() => {});
    }

    if (sessionId) {
      await deleteSessionRecord(sessionId);
    }

    res.clearCookie(sessionCookieName);
    res.clearCookie(csrfCookieName);
    res.clearCookie(oauthStateCookieName);
    res.json({ success: true });
  });

  return router;
}

module.exports = {
  createAuthRouter,
};
