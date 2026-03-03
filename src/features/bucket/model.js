import { normalizeBucketIdOrDefault } from '../../state/index.js';

export function normalizeBucketLabel(raw) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeBucketId(raw, fallback = 'bucket4') {
  return normalizeBucketIdOrDefault(raw, fallback);
}

export const bucketModel = {
  normalizeBucketLabel,
  sanitizeBucketId,
};
