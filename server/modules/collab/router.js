'use strict';

const { Router } = require('express');

module.exports = {
  createCollabRouter() {
    const router = Router();
    router.get('/', (_req, res) => {
      res.status(501).json({ error: 'collab_not_implemented' });
    });
    return router;
  },
};
