export function normalizeTodoSubtaskText(raw) {
  return String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function normalizeTodoMemoText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 1200);
}

export function normalizeTodoSubtasks(subtasks) {
  const source = Array.isArray(subtasks) ? subtasks : [];
  return source
    .map((item) => {
      if (typeof item === 'string') {
        const text = normalizeTodoSubtaskText(item);
        if (!text) {
          return null;
        }
        return {
          id: crypto.randomUUID(),
          text,
          done: false,
          createdAt: new Date().toISOString(),
        };
      }
      if (!item || typeof item !== 'object') {
        return null;
      }

      const text = normalizeTodoSubtaskText(item.text || item.title || '');
      if (!text) {
        return null;
      }

      return {
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : crypto.randomUUID(),
        text,
        done: Boolean(item.done || item.completed),
        createdAt: item.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export function normalizeTodoMemos(memos) {
  const source = Array.isArray(memos) ? memos : [];
  return source
    .map((item) => {
      if (typeof item === 'string') {
        const text = normalizeTodoMemoText(item);
        if (!text) {
          return null;
        }
        return {
          id: crypto.randomUUID(),
          text,
          createdAt: new Date().toISOString(),
        };
      }
      if (!item || typeof item !== 'object') {
        return null;
      }

      const text = normalizeTodoMemoText(item.text || item.content || item.memo || '');
      if (!text) {
        return null;
      }

      return {
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : crypto.randomUUID(),
        text,
        createdAt: item.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export function normalizeTodoDetails(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .slice(0, 1200);
}

export function createTodo(payload = {}) {
  const priority = Number(payload.priority || 2);
  return {
    id: payload.id || crypto.randomUUID(),
    title: String(payload.title || '').trim(),
    details: normalizeTodoDetails(payload.details || ''),
    subtasks: normalizeTodoSubtasks(payload.subtasks || []),
    memos: normalizeTodoMemos(payload.memos || []),
    projectLaneId: typeof payload.projectLaneId === 'string' ? payload.projectLaneId : '',
    bucket: typeof payload.bucket === 'string' && payload.bucket.trim() ? payload.bucket : 'bucket4',
    priority: Number.isFinite(priority) ? priority : 2,
    dueDate: String(payload.dueDate || '').trim(),
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

export const todoModel = {
  normalizeTodoSubtaskText,
  normalizeTodoMemoText,
  normalizeTodoSubtasks,
  normalizeTodoMemos,
  normalizeTodoDetails,
  createTodo,
};
