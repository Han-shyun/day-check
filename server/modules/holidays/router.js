'use strict';

const { Router } = require('express');

function createHolidaysRouter(options = {}) {
  const { logSecurityEvent = () => {}, service = {} } = options;
  const { getHolidaysByYear } = service;

  const router = Router();

  router.get('/', async (req, res) => {
    const requestedYear = Number(req.query.year);
    const year = Number.isInteger(requestedYear) ? requestedYear : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1970 || year > 2600) {
      res.status(400).json({ error: 'invalid_year' });
      return;
    }

    try {
      const data = await getHolidaysByYear(year);
      if (!data || typeof data !== 'object') {
        res.status(500).json({ error: 'failed_to_load_holidays' });
        return;
      }

      res.json({
        ...data,
        year,
        source: data.source || '',
        holidays: data.holidays || {},
      });
    } catch (error) {
      logSecurityEvent('holidays_fetch_failed', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        error: error && error.message ? error.message : String(error),
        year,
      });
      res.status(500).json({ error: 'failed_to_load_holidays' });
    }
  });

  return router;
}

module.exports = {
  createHolidaysRouter,
};
