'use strict';

const { Router } = require('express');

function createStateRouter(options = {}) {
  const {
    authSessionMiddleware,
    requireAuth,
    validateCsrf,
    service = {},
    repository = {},
  } = options;

  const { normalizeState, payloadHash } = service;
  const {
    getStateRow,
    getIdempotencyEntry,
    saveIdempotencyRecord,
    saveState,
  } = repository;

  const router = Router();

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
    const requestHash = idempotencyKey ? payloadHash(`${incomingVersion}:${JSON.stringify(payload)}`) : '';

    if (idempotencyKey) {
      const previous = await getIdempotencyEntry(idemStoreKey);
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
    await saveState(req.auth.userId, payload, nextVersion);

    const responsePayload = {
      success: true,
      version: nextVersion,
      state: payload,
      updatedAt: new Date().toISOString(),
    };

    if (idempotencyKey) {
      await saveIdempotencyRecord(idemStoreKey, requestHash, responsePayload);
    }

    res.json(responsePayload);
  });

  return router;
}

module.exports = {
  createStateRouter,
};
