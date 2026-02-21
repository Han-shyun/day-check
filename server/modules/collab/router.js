'use strict';

const { Router } = require('express');
const { CollabError } = require('./service');

module.exports = {
  createCollabRouter(options = {}) {
    const {
      validateCsrf = (_req, _res, next) => next(),
      service,
    } = options;

    if (!service) {
      throw new Error('collab_service_required');
    }

    const router = Router();
    const wrap = (handler) => async (req, res, next) => {
      try {
        await handler(req, res, next);
      } catch (error) {
        if (error instanceof CollabError) {
          console.warn(
            '[collab]',
            req.method,
            req.originalUrl,
            `-> ${error.status} ${error.error}`,
            error.details || {},
          );
          res.status(error.status).json({
            error: error.error,
            ...(error.details || {}),
          });
          return;
        }
        next(error);
      }
    };

    router.get('/summary', wrap(async (req, res) => {
      const summary = await service.getSummary(req.auth.userId);
      res.json(summary);
    }));

    router.put('/public-id', validateCsrf, wrap(async (req, res) => {
      const result = await service.setPublicId(req.auth.userId, req.body || {});
      res.json(result);
    }));

    router.put('/share-settings/:bucketKey', validateCsrf, wrap(async (req, res) => {
      const result = await service.setShareSetting(req.auth.userId, req.params.bucketKey, req.body || {});
      res.json(result);
    }));

    router.post('/invites', validateCsrf, wrap(async (req, res) => {
      const invite = await service.createInvite(req.auth.userId, req.body || {});
      res.status(201).json({ invite });
    }));

    router.post('/invites/:inviteId/accept', validateCsrf, wrap(async (req, res) => {
      const payload = await service.acceptInvite(req.auth.userId, req.params.inviteId);
      res.json(payload);
    }));

    router.post('/invites/:inviteId/decline', validateCsrf, wrap(async (req, res) => {
      const invite = await service.declineInvite(req.auth.userId, req.params.inviteId);
      res.json({ invite });
    }));

    router.delete('/invites/:inviteId', validateCsrf, wrap(async (req, res) => {
      const result = await service.cancelInvite(req.auth.userId, req.params.inviteId);
      res.json(result);
    }));

    router.delete('/memberships/:membershipId', validateCsrf, wrap(async (req, res) => {
      const result = await service.removeMembership(req.auth.userId, req.params.membershipId);
      res.json(result);
    }));

    router.get('/shares/:ownerUserId/:bucketKey/todos', wrap(async (req, res) => {
      const todos = await service.listSharedTodos(
        req.auth.userId,
        req.params.ownerUserId,
        req.params.bucketKey,
      );
      res.json({ todos });
    }));

    router.post('/shares/:ownerUserId/:bucketKey/todos', validateCsrf, wrap(async (req, res) => {
      const todo = await service.createSharedTodo(
        req.auth.userId,
        req.params.ownerUserId,
        req.params.bucketKey,
        req.body || {},
      );
      res.status(201).json({ todo });
    }));

    router.patch('/shared-todos/:todoId', validateCsrf, wrap(async (req, res) => {
      const todo = await service.updateSharedTodo(req.auth.userId, req.params.todoId, req.body || {});
      res.json({ todo });
    }));

    router.delete('/shared-todos/:todoId', validateCsrf, wrap(async (req, res) => {
      const result = await service.deleteSharedTodo(req.auth.userId, req.params.todoId);
      res.json(result);
    }));

    router.get('/shared-todos/:todoId/comments', wrap(async (req, res) => {
      const comments = await service.listComments(req.auth.userId, req.params.todoId);
      res.json({ comments });
    }));

    router.post('/shared-todos/:todoId/comments', validateCsrf, wrap(async (req, res) => {
      const comment = await service.createComment(req.auth.userId, req.params.todoId, req.body || {});
      res.status(201).json({ comment });
    }));

    router.delete('/comments/:commentId', validateCsrf, wrap(async (req, res) => {
      const result = await service.deleteComment(req.auth.userId, req.params.commentId);
      res.json(result);
    }));

    return router;
  },
};
