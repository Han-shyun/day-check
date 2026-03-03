export function normalizePublicIdInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[\s-]+/g, '_');
}

export function isValidPublicId(value) {
  return /^[a-z0-9_]{4,20}$/.test(String(value || ''));
}

export function collabContextKey(ownerUserId, bucketKey) {
  return `${Number(ownerUserId)}:${String(bucketKey)}`;
}

export function parseCollabContextKey(key) {
  const [ownerUserIdText, bucketKey] = String(key || '').split(':');
  const ownerUserId = Number(ownerUserIdText);
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0 || !bucketKey) {
    return null;
  }
  return {
    ownerUserId,
    bucketKey,
    key: collabContextKey(ownerUserId, bucketKey),
  };
}

export const collabModel = {
  normalizePublicIdInput,
  isValidPublicId,
  collabContextKey,
  parseCollabContextKey,
};
