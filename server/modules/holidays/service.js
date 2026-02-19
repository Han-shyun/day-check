'use strict';

function createHolidaysService(dependencies = {}) {
  const { getHolidaysByYear } = dependencies;

  return {
    getHolidaysByYear,
  };
}

module.exports = {
  createHolidaysService,
};
