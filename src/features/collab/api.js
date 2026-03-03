export const collabApi = {
  endpoints: {
    snapshot: '/collab/snapshot',
    summary: '/collab/summary',
    publicId: '/collab/public-id',
    invites: '/collab/invites',
    shareSettings: '/collab/share-settings',
    sharedTodos: '/collab/shared-todos',
    comments: '/collab/comments',
  },
  buildSnapshotUrl(commentTodoIds = []) {
    const normalized = Array.isArray(commentTodoIds)
      ? [...new Set(commentTodoIds.map((todoId) => String(todoId || '').trim()).filter(Boolean))].slice(0, 40)
      : [];
    if (normalized.length === 0) {
      return this.endpoints.snapshot;
    }
    return `${this.endpoints.snapshot}?commentTodoIds=${encodeURIComponent(normalized.join(','))}`;
  },
  buildShareTodoUrl(ownerUserId, bucketKey) {
    return `/collab/shares/${encodeURIComponent(String(ownerUserId))}/${encodeURIComponent(String(bucketKey))}/todos`;
  },
  buildSharedTodoUrl(todoId) {
    return `${this.endpoints.sharedTodos}/${encodeURIComponent(String(todoId))}`;
  },
};
