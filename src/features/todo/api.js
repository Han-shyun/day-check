export const todoApi = {
  endpoints: {
    todo: '/todos',
    sync: '/state/sync',
  },
  buildTodoPayload(todo = {}) {
    return {
      id: todo.id,
      title: String(todo.title || '').trim(),
      details: String(todo.details || ''),
      subtasks: todo.subtasks || [],
      memos: todo.memos || [],
      projectLaneId: todo.projectLaneId || '',
      bucket: todo.bucket || 'bucket4',
      priority: Number(todo.priority || 2),
      dueDate: String(todo.dueDate || '').trim(),
      createdAt: todo.createdAt || new Date().toISOString(),
    };
  },
};
