import { state } from '../../core/app-context.js';
import { buckets, priorityLabel } from '../../core/constants.js';
import {
  addSelectedDateNoteBtn,
  dueDateInput,
  prioritySelect,
  quickInput,
  todoCountEl,
  todoListEl,
  todoTemplate,
} from '../../core/dom-refs.js';
import {
  clampCalendarRangeEnd,
  isDateInCalendarRange,
  parseIsoDate,
  toLocalIsoDate,
  formatDisplayDateTime,
} from '../../core/date-utils.js';
import { createSelectedNoteTextNode } from '../calendar/index.js';
import {
  todoApi,
} from './api.js';
import { todoModel } from './model.js';
import { createTodoUi } from './ui.js';

let _deps = {
  bindTodoDetailsInput: () => {},
  bindTodoMemoComposer: () => {},
  bindTodoSubtaskComposer: () => {},
  buildTodoMetaText: () => '',
  createCalendarItem: () => ({
    id: '',
    date: '',
    endDate: '',
    type: 'note',
    text: '',
    createdAt: new Date().toISOString(),
  }),
  getProjectLaneName: () => '',
  getTodoGroupLabel: () => '',
  getTodayActiveNoteEntries: () => [],
  renderProjectLaneOptions: () => {},
  renderProjectLaneGroups: () => {},
  renderProjectLaneItems: () => {},
  renderSharedTodosForBucket: () => {},
  renderTodoItems: () => {},
  renderTodoList: () => {},
  renderTodosByBucket: () => {},
  renderTodayNoteHighlights: () => {},
  renderTodoMemoList: () => {},
  syncBucketActionMenus: () => {},
  ensureBucketShareToggle: () => null,
  sortTodos: (list) => list,
  queueSync: () => {},
  render: () => {},
  getBucketLabel: () => '',
  showToast: () => {},
};

export function initTodoDeps({
  bindTodoDetailsInput,
  bindTodoMemoComposer,
  bindTodoSubtaskComposer,
  buildTodoMetaText,
  createCalendarItem,
  getTodayActiveNoteEntries,
  renderTodoItems,
  renderTodoList,
  renderTodosByBucket,
  renderTodayNoteHighlights,
  renderTodoMemoList,
  renderProjectLaneOptions,
  renderProjectLaneGroups,
  renderSharedTodosForBucket,
  ensureBucketShareToggle,
  sortTodos,
  render,
  queueSync,
  getProjectLaneName,
  syncBucketActionMenus,
  getBucketLabel,
  showToast,
}) {
  if (typeof bindTodoDetailsInput === 'function') {
    _deps.bindTodoDetailsInput = bindTodoDetailsInput;
  }
  if (typeof bindTodoMemoComposer === 'function') {
    _deps.bindTodoMemoComposer = bindTodoMemoComposer;
  }
  if (typeof bindTodoSubtaskComposer === 'function') {
    _deps.bindTodoSubtaskComposer = bindTodoSubtaskComposer;
  }
  if (typeof buildTodoMetaText === 'function') {
    _deps.buildTodoMetaText = buildTodoMetaText;
  }
  if (typeof createCalendarItem === 'function') {
    _deps.createCalendarItem = createCalendarItem;
  }
  if (typeof getTodayActiveNoteEntries === 'function') {
    _deps.getTodayActiveNoteEntries = getTodayActiveNoteEntries;
  }
  if (typeof renderTodoItems === 'function') {
    _deps.renderTodoItems = renderTodoItems;
  }
  if (typeof renderTodoList === 'function') {
    _deps.renderTodoList = renderTodoList;
  }
  if (typeof renderTodosByBucket === 'function') {
    _deps.renderTodosByBucket = renderTodosByBucket;
  }
  if (typeof renderTodayNoteHighlights === 'function') {
    _deps.renderTodayNoteHighlights = renderTodayNoteHighlights;
  }
  if (typeof renderTodoMemoList === 'function') {
    _deps.renderTodoMemoList = renderTodoMemoList;
  }
  if (typeof sortTodos === 'function') {
    _deps.sortTodos = sortTodos;
  }
  if (typeof render === 'function') {
    _deps.render = render;
  }
  if (typeof queueSync === 'function') {
    _deps.queueSync = queueSync;
  }
  if (typeof renderProjectLaneOptions === 'function') {
    _deps.renderProjectLaneOptions = renderProjectLaneOptions;
  }
  if (typeof renderProjectLaneGroups === 'function') {
    _deps.renderProjectLaneGroups = renderProjectLaneGroups;
  }
  if (typeof renderSharedTodosForBucket === 'function') {
    _deps.renderSharedTodosForBucket = renderSharedTodosForBucket;
  }
  if (typeof ensureBucketShareToggle === 'function') {
    _deps.ensureBucketShareToggle = ensureBucketShareToggle;
  }
  if (typeof getProjectLaneName === 'function') {
    _deps.getProjectLaneName = getProjectLaneName;
  }
  if (typeof syncBucketActionMenus === 'function') {
    _deps.syncBucketActionMenus = syncBucketActionMenus;
  }
  if (typeof getBucketLabel === 'function') {
    _deps.getBucketLabel = getBucketLabel;
  }
  if (typeof showToast === 'function') {
    _deps.showToast = showToast;
  }
}

export const todoUi = {
  create: createTodoUi,
};

export function createTodo(payload) {
  return todoModel.createTodo(payload);
}

function getBucketLabel(bucket) {
  return _deps.getBucketLabel(bucket);
}

function getProjectLaneName(projectLaneId) {
  return _deps.getProjectLaneName(projectLaneId);
}

function render() {
  _deps.render();
}

function queueSync() {
  _deps.queueSync();
}

function renderProjectLaneOptions(selectEl, todo) {
  const delegate = _deps.renderProjectLaneOptions;
  if (typeof delegate !== 'function' || delegate === renderProjectLaneOptions) {
    return;
  }
  return delegate(selectEl, todo);
}

function renderProjectLaneGroups(listEl, todos, bucket) {
  const delegate = _deps.renderProjectLaneGroups;
  if (typeof delegate !== 'function' || delegate === renderProjectLaneGroups) {
    return;
  }
  return delegate(listEl, todos, bucket);
}

function ensureBucketShareToggle(bucket) {
  return _deps.ensureBucketShareToggle(bucket);
}

function renderSharedTodosForBucket(bucket) {
  return _deps.renderSharedTodosForBucket(bucket);
}

function syncBucketActionMenus() {
  return _deps.syncBucketActionMenus();
}

function buildTodoMetaText(todo) {
  const dateText = todo.dueDate ? ` ${todo.dueDate}` : '';
  const lane = _deps.getProjectLaneName(todo.projectLaneId);
  const projectText = lane ? ` / Lane: ${lane}` : '';
  return `Priority: ${priorityLabel[todo.priority] || 'Normal'}${dateText}${projectText}`;
}

function buildTodoDetailSummary(todo) {
  const priority = priorityLabel[todo.priority] || 'Normal';
  const dueDate = todo.dueDate || 'None';
  const bucket = getBucketLabel(todo.bucket || 'bucket4') || (todo.bucket || 'bucket4');
  return {
    priority: `Priority: ${priority}`,
    dueDate: `Due: ${dueDate}`,
    bucket: `Bucket: ${bucket}`,
  };
}

function renderTodoSubtaskList(listEl, todo, onUpdate) {
  if (!listEl || !todo) {
    return;
  }

  const subtasks = normalizeTodoSubtasks(todo.subtasks || []);
  todo.subtasks = subtasks;
  listEl.innerHTML = '';

  if (subtasks.length === 0) {
    return;
  }

  subtasks.forEach((subtask) => {
    const li = document.createElement('li');
    li.className = 'todo-subtask-item';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'todo-subtask-state-toggle';
    toggleBtn.textContent = subtask.done ? 'Done' : 'Todo';
    toggleBtn.setAttribute('aria-pressed', String(Boolean(subtask.done)));
    toggleBtn.setAttribute(
      'aria-label',
      subtask.done ? 'Mark subtask as incomplete' : 'Mark subtask as complete',
    );
    toggleBtn.addEventListener('click', () => {
      subtask.done = !subtask.done;
      renderTodoSubtaskList(listEl, todo, onUpdate);
      if (onUpdate) {
        onUpdate();
      }
      queueSync();
    });

    const text = document.createElement('span');
    text.className = 'todo-subtask-text';
    if (subtask.done) {
      text.classList.add('is-done');
    }
    text.textContent = subtask.text;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'todo-mini-delete';
    removeBtn.textContent = 'Del';
    removeBtn.setAttribute('aria-label', 'Delete subtask');
    removeBtn.addEventListener('click', () => {
      todo.subtasks = subtasks.filter((entry) => entry.id !== subtask.id);
      renderTodoSubtaskList(listEl, todo, onUpdate);
      if (onUpdate) {
        onUpdate();
      }
      queueSync();
    });

    li.append(toggleBtn, text, removeBtn);
    listEl.appendChild(li);
  });
}

function bindTodoSubtaskComposer(inputEl, addBtn, listEl, todo, onUpdate) {
  if (!inputEl || !addBtn || !listEl || !todo) {
    return;
  }

  const submit = () => {
    const text = normalizeTodoSubtaskText(inputEl.value);
    if (!text) {
      return;
    }

    todo.subtasks = normalizeTodoSubtasks([
      {
        id: crypto.randomUUID(),
        text,
        done: false,
        createdAt: new Date().toISOString(),
      },
      ...(todo.subtasks || []),
    ]);
    inputEl.value = '';
    renderTodoSubtaskList(listEl, todo, onUpdate);
    if (onUpdate) {
      onUpdate();
    }
    queueSync();
    inputEl.focus();
  };

  addBtn.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
}


function renderTodoMemoList(listEl, todo) {
  if (!listEl || !todo) {
    return;
  }

  const memos = normalizeTodoMemos(todo.memos || []);
  todo.memos = memos;
  listEl.innerHTML = '';

  if (memos.length === 0) {
    return;
  }

  memos.forEach((memo) => {
    const li = document.createElement('li');
    li.className = 'todo-memo-item';

    const body = document.createElement('div');
    body.className = 'todo-memo-body';
    body.appendChild(createSelectedNoteTextNode(memo.text));

    const createdAtText = memo.createdAt ? formatDisplayDateTime(memo.createdAt) : '';
    if (createdAtText) {
      const date = document.createElement('span');
      date.className = 'todo-memo-date';
      date.textContent = createdAtText;
      body.appendChild(date);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'todo-mini-delete';
    removeBtn.textContent = 'Del';
    removeBtn.setAttribute('aria-label', 'Delete memo');
    removeBtn.addEventListener('click', () => {
      todo.memos = memos.filter((entry) => entry.id !== memo.id);
      renderTodoMemoList(listEl, todo);
      queueSync();
    });

    li.append(body, removeBtn);
    listEl.appendChild(li);
  });
}

function bindTodoMemoComposer(inputEl, addBtn, listEl, todo) {
  if (!inputEl || !addBtn || !listEl || !todo) {
    return;
  }

  const submit = () => {
    const text = normalizeTodoMemoText(inputEl.value);
    if (!text) {
      return;
    }

    todo.memos = normalizeTodoMemos([
      {
        id: crypto.randomUUID(),
        text,
        createdAt: new Date().toISOString(),
      },
      ...(todo.memos || []),
    ]);
    inputEl.value = '';
    renderTodoMemoList(listEl, todo);
    queueSync();
    const composer = addBtn.closest('.todo-memo-composer');
    if (composer) {
      composer.classList.add('hidden');
    }
    const memoToggle = addBtn.closest('.todo-item')?.querySelector('.todo-memo-toggle');
    if (memoToggle) {
      memoToggle.setAttribute('aria-expanded', 'false');
      memoToggle.focus();
    } else {
      inputEl.focus();
    }
    _deps.showToast('Memo saved.', 'success');
  };

  addBtn.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
}

function renderTodoItems(listEl, todos) {
  if (!listEl) {
    return;
  }

  todos.forEach((todo) => {
    const item = todoTemplate.content.firstElementChild.cloneNode(true);
    const titleEl = item.querySelector('.title');
    const metaEl = item.querySelector('.meta');
    const detailsEl = item.querySelector('.todo-detail-input');
    const detailPriorityEl = item.querySelector('.todo-detail-priority');
    const detailDueDateEl = item.querySelector('.todo-detail-due-date');
    const detailBucketEl = item.querySelector('.todo-detail-bucket');
    const subtaskInputEl = item.querySelector('.todo-subtask-input');
    const subtaskAddBtn = item.querySelector('.todo-subtask-add');
    const subtaskListEl = item.querySelector('.todo-subtask-list');
    const memoInputEl = item.querySelector('.todo-memo-input');
    const memoAddBtn = item.querySelector('.todo-memo-add');
    const memoListEl = item.querySelector('.todo-memo-list');
    const memoComposer = item.querySelector('.todo-memo-composer');
    const subtaskComposer = item.querySelector('.todo-subtask-composer');
    const todoMainEl = item.querySelector('.todo-main');
    const todoExtraEl = item.querySelector('.todo-extra');
    const completeBtn = item.querySelector('.complete');
    const deleteBtn = item.querySelector('.delete');
    const projectSelect = item.querySelector('.todo-project-lane-select');

    todo.subtasks = normalizeTodoSubtasks(todo.subtasks || []);
    todo.memos = normalizeTodoMemos(todo.memos || []);

    titleEl.textContent = todo.title;
    titleEl.setAttribute('contenteditable', 'true');
    titleEl.setAttribute('spellcheck', 'false');
    titleEl.addEventListener('blur', () => {
      const next = (titleEl.textContent || '').trim();
      if (next && next !== todo.title) {
        todo.title = next;
        queueSync();
      } else {
        titleEl.textContent = todo.title;
      }
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleEl.blur();
      }
    });
    const updateDetailSummary = () => {
      const summary = buildTodoDetailSummary(todo);
      if (detailPriorityEl) {
        detailPriorityEl.textContent = summary.priority;
      }
      if (detailDueDateEl) {
        detailDueDateEl.textContent = summary.dueDate;
      }
      if (detailBucketEl) {
        detailBucketEl.textContent = summary.bucket;
      }
    };
    const updateMeta = () => {
      metaEl.textContent = buildTodoMetaText(todo);
      updateDetailSummary();
    };
    updateMeta();
    bindTodoDetailsInput(detailsEl, todo);

    if (subtaskComposer) {
      subtaskComposer.classList.add('hidden');
    }
    if (memoComposer) {
      memoComposer.classList.add('hidden');
    }
    renderTodoSubtaskList(subtaskListEl, todo, updateMeta);
    renderTodoMemoList(memoListEl, todo);
    bindTodoSubtaskComposer(subtaskInputEl, subtaskAddBtn, subtaskListEl, todo, updateMeta);
    bindTodoMemoComposer(memoInputEl, memoAddBtn, memoListEl, todo);

    const detailToggle = item.querySelector('.todo-detail-toggle');
    const collapsible = item.querySelector('.todo-collapsible');
    if (detailToggle && collapsible) {
      const hasContent = (todo.details || '').trim() ||
                         (todo.subtasks && todo.subtasks.length > 0) ||
                         (todo.memos && todo.memos.length > 0);
      if (hasContent) {
        collapsible.hidden = false;
        detailToggle.textContent = 'Collapse';
      } else {
        collapsible.hidden = true;
        detailToggle.textContent = 'Details';
      }
      detailToggle.setAttribute('aria-expanded', String(!collapsible.hidden));
      detailToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const expanded = !collapsible.hidden;
        collapsible.hidden = expanded;
        detailToggle.textContent = expanded ? 'Details' : 'Collapse';
        detailToggle.setAttribute('aria-expanded', String(!expanded));
      });
    }

    const actionWrap = item.querySelector('.todo-inline-actions');
    if (!actionWrap && todoMainEl) {
      const createdActionWrap = document.createElement('div');
      createdActionWrap.className = 'todo-inline-actions';
      createdActionWrap.setAttribute('aria-label', 'todo quick actions');

      const memoToggle = document.createElement('button');
      memoToggle.type = 'button';
      memoToggle.className = 'todo-memo-toggle action-toggle';
      memoToggle.textContent = 'Memo';
      memoToggle.setAttribute('aria-expanded', 'false');
      memoToggle.setAttribute('aria-label', 'Toggle memo composer');

      const subtaskToggle = document.createElement('button');
      subtaskToggle.type = 'button';
      subtaskToggle.className = 'todo-subtask-toggle action-toggle';
      subtaskToggle.textContent = 'Subtask';
      subtaskToggle.setAttribute('aria-expanded', 'false');
      subtaskToggle.setAttribute('aria-label', 'Toggle subtask composer');

      createdActionWrap.appendChild(subtaskToggle);
      createdActionWrap.appendChild(memoToggle);
      const collapsibleEl = item.querySelector('.todo-collapsible');
      todoMainEl.insertBefore(createdActionWrap, collapsibleEl || todoExtraEl || null);
    }

    const subtaskToggle = item.querySelector('.todo-subtask-toggle');
    const memoToggle = item.querySelector('.todo-memo-toggle');

    const bindToggle = (button, editor) => {
      if (!button || !editor) {
        return;
      }
      editor.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => {
        const hidden = editor.classList.toggle('hidden');
        button.setAttribute('aria-expanded', String(!hidden));
        if (!hidden) {
          const field = editor.querySelector('textarea, input');
          if (field) {
            field.focus();
          }
        }
      });
    };

    bindToggle(subtaskToggle, subtaskComposer);
    bindToggle(memoToggle, memoComposer);

    if (projectSelect) {
      renderProjectLaneOptions(projectSelect, todo);
      projectSelect.addEventListener('change', () => {
        todo.projectLaneId = projectSelect.value;
        updateMeta();
        render();
        queueSync();
      });
    }

    completeBtn.addEventListener('click', () => {
      state.doneLog.unshift({
        id: todo.id,
        title: todo.title,
        details: todo.details || '',
        subtasks: normalizeTodoSubtasks(todo.subtasks || []),
        memos: normalizeTodoMemos(todo.memos || []),
        projectLaneId: todo.projectLaneId || '',
        bucket: todo.bucket,
        priority: todo.priority,
        dueDate: todo.dueDate || '',
        createdAt: todo.createdAt,
        completedAt: new Date().toISOString(),
      });
      state.todos = state.todos.filter((t) => t.id !== todo.id);
      render();
      queueSync();
    });

    deleteBtn.addEventListener('click', () => {
      state.todos = state.todos.filter((t) => t.id !== todo.id);
      render();
      queueSync();
    });

    listEl.appendChild(item);
  });
}

function sortTodos(list) {
  return [...list].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function createCalendarItem(date, type, text, endDate = date) {
  const start = parseIsoDate(date);
  const safeEndDate = clampCalendarRangeEnd(start, endDate);
  return {
    id: crypto.randomUUID(),
    date: start,
    endDate: safeEndDate,
    type,
    text,
    createdAt: new Date().toISOString(),
  };
}

function bindTodoDetailsInput(detailInput, todo) {
  if (!detailInput) {
    return;
  }

  detailInput.value = todo.details || '';
  detailInput.addEventListener('blur', () => {
    const next = normalizeTodoDetails(detailInput.value);
    if ((todo.details || '') === next) {
      return;
    }
    todo.details = next;
    queueSync();
  });
}

function getTodayActiveNoteEntries() {
  const today = toLocalIsoDate(new Date());
  return state.calendarItems
    .filter((item) => item.type === 'note' && isDateInCalendarRange(today, item.date, item.endDate || item.date))
    .sort((a, b) => {
      const aIsLong = (a.endDate || a.date) > a.date;
      const bIsLong = (b.endDate || b.date) > b.date;
      if (aIsLong !== bIsLong) {
        return aIsLong ? -1 : 1;
      }
      if (a.date !== b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function renderTodayNoteHighlights(listEl, notes) {
  notes.forEach((note) => {
    const item = document.createElement('li');
    item.className = 'todo-item todo-item-note';

    const main = document.createElement('div');
    main.className = 'todo-main';

    const title = createSelectedNoteTextNode(`Note: ${note.text}`);
    title.classList.add('todo-note-title');

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = note.date === note.endDate
      ? `Date: ${note.date}`
      : `Period: ${note.date} ~ ${note.endDate}`;

    main.append(title, meta);

    const controls = document.createElement('div');
    controls.className = 'todo-controls';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const focusBtn = document.createElement('button');
    focusBtn.type = 'button';
    focusBtn.className = 'complete';
    focusBtn.textContent = 'Go';
    focusBtn.addEventListener('click', () => {
      state.selectedDate = note.date;
      const monthDate = new Date(note.date);
      state.currentMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      render();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete';
    deleteBtn.textContent = 'Del';
    deleteBtn.addEventListener('click', () => {
      state.calendarItems = state.calendarItems.filter((entry) => entry.id !== note.id);
      render();
      queueSync();
    });

    actions.append(focusBtn, deleteBtn);
    controls.appendChild(actions);

    item.append(main, controls);
    listEl.appendChild(item);
  });
}

function renderTodoList() {
  const todayNotes = getTodayActiveNoteEntries();
  const sorted = sortTodos(state.todos);
  todoCountEl.textContent = String(todayNotes.length + sorted.length);
  todoListEl.innerHTML = '';
  renderTodayNoteHighlights(todoListEl, todayNotes);
  renderTodoItems(todoListEl, sorted);
}

function renderTodosByBucket() {
  for (const bucket of buckets) {
    const listEl = document.getElementById(`list-${bucket}`);
    const countEl = document.getElementById(`count-${bucket}`);
    if (!listEl || !countEl) {
      continue;
    }

    listEl.innerHTML = '';
    const filtered = state.todos.filter((todo) => todo.bucket === bucket);
    const sorted = sortTodos(filtered);

    countEl.textContent = String(sorted.length);
    const hasLane = state.projectLanes.some((lane) => lane.bucket === bucket);
    if (hasLane) {
      renderProjectLaneGroups(listEl, sorted, bucket);
    } else {
      renderTodoItems(listEl, sorted);
    }

    ensureBucketShareToggle(bucket);
    renderSharedTodosForBucket(bucket);
  }

  syncBucketActionMenus();
}

export function normalizeTodoSubtaskText(raw) {
  return todoModel.normalizeTodoSubtaskText(raw);
}

export function normalizeTodoMemoText(raw) {
  return todoModel.normalizeTodoMemoText(raw);
}

export function normalizeTodoSubtasks(subtasks) {
  return todoModel.normalizeTodoSubtasks(subtasks);
}

export function normalizeTodoMemos(memos) {
  return todoModel.normalizeTodoMemos(memos);
}

export function normalizeTodoDetails(raw) {
  return todoModel.normalizeTodoDetails(raw);
}

export const todo = {
  get label() {
    return _deps;
  },
};

export {
  todoApi,
  todoModel,
  createTodoUi,
  bindTodoDetailsInput,
  bindTodoMemoComposer,
  bindTodoSubtaskComposer,
  buildTodoMetaText,
  createCalendarItem,
  getTodayActiveNoteEntries,
  renderTodoItems,
  renderTodoList,
  renderTodosByBucket,
  renderTodayNoteHighlights,
  renderTodoMemoList,
  syncBucketActionMenus,
  sortTodos,
  renderProjectLaneOptions,
  renderProjectLaneGroups,
  ensureBucketShareToggle,
  renderSharedTodosForBucket,
  getProjectLaneName,
};
