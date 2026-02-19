'use strict';

function createStateRepository(dependencies = {}) {
  const {
    getStateRow,
    run,
    getIdempotencyEntry,
    saveIdempotencyRecord,
  } = dependencies;

  return {
    getStateRow,
    getIdempotencyEntry,
    saveIdempotencyRecord,
    saveState: (userId, statePayload, nextVersion) =>
      run(
        `INSERT INTO user_states (user_id, state_json, version, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id)
         DO UPDATE SET
           state_json = excluded.state_json,
           version = ?,
           updated_at = datetime('now')`,
        [userId, JSON.stringify(statePayload), nextVersion, nextVersion],
      ),
  };
}

module.exports = {
  createStateRepository,
};
