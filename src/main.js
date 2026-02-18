import './style.css';

const TODO_STORAGE_KEY = 'day-check.main.todos.v4';
const DONE_STORAGE_KEY = 'day-check.main.doneLog.v1';
const CALENDAR_STORAGE_KEY = 'day-check.main.calendarItems.v1';
const CATEGORY_STORAGE_KEY = 'day-check.main.categories.v1';
const LEGACY_TODO_KEYS = ['day-check.main.todos.v3', 'day-check.main.todos.v2'];

const API_BASE = '/api';
const SYNC_DEBOUNCE_MS = 500;

const defaultCategories = [{ id: 'uncategorized', name: '미분류' }];
const buckets = ['today', 'project', 'routine', 'inbox'];

const state = {
  todos: [],
  doneLog: [],
  calendarItems: [],
  categories: [...defaultCategories],
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: '',
  version: 0,
};

let isServerSync = false;
let authUser = null;
let pendingSync = false;
let syncing = false;
let syncTimer = null;
let eventsRegistered = false;

const dateEl = document.getElementById('todayDate');
const todoCountEl = document.getElementById('todoCount');
const todoListEl = document.getElementById('todoList');
const todoTemplate = document.getElementById('todoItemTemplate');

const todoComposer = document.getElementById('todoComposer');
const todoTextarea = document.getElementById('todoTextarea');
const composerDate = document.getElementById('composerDate');
const composerPriority = document.getElementById('composerPriority');
const composerCategory = document.getElementById('composerCategory');
const openCategoryInlineBtn = document.getElementById('openCategoryInlineBtn');
const inlineCategoryCreate = document.getElementById('inlineCategoryCreate');
const newCategoryInput = document.getElementById('newCategoryInput');
const createCategoryBtn = document.getElementById('createCategoryBtn');
const cancelCategoryBtn = document.getElementById('cancelCategoryBtn');

const authStatusEl = document.getElementById('authStatus');
const authBtn = document.getElementById('authBtn');

const weekRangeEl = document.getElementById('weekRange');
const quickForm = document.getElementById('quickAddForm');
const quickInput = document.getElementById('quickInput');
const dueDateInput = document.getElementById('dueDateInput');
const bucketSelect = document.getElementById('bucketSelect');
const prioritySelect = document.getElementById('prioritySelect');

const calendarForm = document.getElementById('calendarForm');
const calendarDateInput = document.getElementById('calendarDateInput');
const calendarTypeSelect = document.getElementById('calendarTypeSelect');
const calendarTextInput = document.getElementById('calendarTextInput');
const calendarGrid = document.getElementById('calendarGrid');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');

const selectedDateLabel = document.getElementById('selectedDateLabel');
const selectedDateSummary = document.getElementById('selectedDateSummary');
const selectedCreatedList = document.getElementById('selectedCreatedList');
const selectedCompletedList = document.getElementById('selectedCompletedList');
const selectedCalendarNoteList = document.getElementById('selectedCalendarNoteList');

const priorityLabel = {
  3: '낮음',
  2: '보통',
  1: '높음',
};

const typeLabel = {
  todo: 'todo',
  note: 'note',
};

function toLocalIsoDate(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(isoText) {
  if (!isoText) {
    return '';
  }
  return isoText.slice(0, 10);
}

function formatDisplayDate(isoText) {
  if (!isoText) {
    return '-';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(isoText));
}

function formatDisplayDateTime(isoText) {
  if (!isoText) {
    return '-';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoText));
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function inCurrentWeek(isoDateText) {
  const target = new Date(isoDateText);
  return target >= startOfWeek(new Date()) && target <= endOfWeek(new Date());
}

function safeJsonParse(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function ensureDateInState() {
  if (!state.selectedDate) {
    state.selectedDate = toLocalIsoDate(new Date());
  }
}

function loadStateFromLocal() {
  const todos = safeJsonParse(TODO_STORAGE_KEY);
  const doneLog = safeJsonParse(DONE_STORAGE_KEY);
  const calendarItems = safeJsonParse(CALENDAR_STORAGE_KEY);
  const categories = safeJsonParse(CATEGORY_STORAGE_KEY);

  const normalizedTodos = normalizeTodos(Array.isArray(todos) ? todos : []);
  if (normalizedTodos.length === 0) {
    for (const key of LEGACY_TODO_KEYS) {
      const legacy = safeJsonParse(key);
      const legacyTodos = normalizeTodos(Array.isArray(legacy) ? legacy : []);
      if (legacyTodos.length > 0) {
        state.todos = legacyTodos;
        break;
      }
    }
  } else {
    state.todos = normalizedTodos;
  }

  state.doneLog = normalizeDoneLog(Array.isArray(doneLog) ? doneLog : []);
  state.calendarItems = normalizeCalendarItems(Array.isArray(calendarItems) ? calendarItems : []);

  const categoriesFallback =
    Array.isArray(categories) && categories.length > 0
      ? categories.filter((category) => category && typeof category.id === 'string' && typeof category.name === 'string')
      : [];

  state.categories =
    categoriesFallback.length > 0
      ? categoriesFallback
      : [...defaultCategories];

  ensureCategoryIntegrity();
  ensureDateInState();
}

function normalizeTodos(todos) {
  return todos
    .filter((todo) => todo && (todo.title || typeof todo.title === 'string'))
    .map((todo) => ({
      id: todo.id || crypto.randomUUID(),
      title: String(todo.title || '').trim(),
      categoryId: todo.categoryId || todo.bucketId || todo.bucket || 'uncategorized',
      bucket: todo.bucket || 'inbox',
      priority: Number(todo.priority || 2),
      dueDate: String(todo.dueDate || '').trim(),
      createdAt: todo.createdAt || new Date().toISOString(),
    }))
    .filter((todo) => todo.title);
}

function normalizeDoneLog(doneLog) {
  return doneLog
    .filter((item) => item && item.id && item.title)
    .map((item) => ({
      id: item.id,
      title: String(item.title || '').trim(),
      categoryId: item.categoryId || 'uncategorized',
      bucket: item.bucket || 'inbox',
      priority: Number(item.priority || 2),
      dueDate: String(item.dueDate || ''),
      createdAt: item.createdAt || new Date().toISOString(),
      completedAt: item.completedAt || new Date().toISOString(),
    }))
    .filter((item) => item.title);
}

function normalizeCalendarItems(items) {
  return items
    .filter((item) => item && item.id && item.date && item.type && item.text)
    .map((item) => ({
      id: item.id,
      date: parseIsoDate(item.date),
      type: item.type === 'note' ? 'note' : 'todo',
      text: String(item.text || '').trim(),
      createdAt: item.createdAt || new Date().toISOString(),
    }));
}

function normalizeCategoryState(input) {
  const categories =
    Array.isArray(input)
      ? input.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      : [];

  const fixed =
    categories.length > 0
      ? categories
      : [...defaultCategories];

  if (!fixed.some((item) => item.id === 'uncategorized')) {
    fixed.unshift({ id: 'uncategorized', name: '미분류' });
  }

  return fixed;
}

function normalizeStateFromServer(payload) {
  return {
    todos: normalizeTodos(payload?.todos || []),
    doneLog: normalizeDoneLog(payload?.doneLog || []),
    calendarItems: normalizeCalendarItems(payload?.calendarItems || []),
    categories: normalizeCategoryState(payload?.categories || []),
    currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: state.selectedDate || toLocalIsoDate(new Date()),
    version: Number(payload?.version || 0),
  };
}

function hasStoredData(payload) {
  return (
    (Array.isArray(payload.todos) && payload.todos.length > 0) ||
    (Array.isArray(payload.doneLog) && payload.doneLog.length > 0) ||
    (Array.isArray(payload.calendarItems) && payload.calendarItems.length > 0) ||
    (Array.isArray(payload.categories) && payload.categories.length > 1)
  );
}

function saveLocalState() {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state.todos));
  localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(state.doneLog));
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(state.calendarItems));
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(state.categories));
}

function ensureCategoryIntegrity() {
  if (state.categories.length === 0) {
    state.categories = [...defaultCategories];
  }

  if (!state.categories.some((item) => item.id === 'uncategorized')) {
    state.categories.unshift({ id: 'uncategorized', name: '미분류' });
  }

  const ids = new Set(state.categories.map((item) => item.id));
  state.todos = state.todos.map((todo) => ({
    ...todo,
    categoryId: ids.has(todo.categoryId) ? todo.categoryId : 'uncategorized',
  }));
}

function getCategoryName(categoryId) {
  const category = state.categories.find((item) => item.id === categoryId);
  return category ? category.name : '미분류';
}

function renderCategoryOptions(selectEl, selectedId) {
  selectEl.innerHTML = '';
  state.categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    if (category.id === (selectedId || 'uncategorized')) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });
}

function sortTodos(list) {
  return [...list].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function createTodo({ title, categoryId = 'uncategorized', bucket = 'inbox', priority = 2, dueDate = '' }) {
  return {
    id: crypto.randomUUID(),
    title,
    categoryId,
    bucket,
    priority: Number(priority),
    dueDate: dueDate || '',
    createdAt: new Date().toISOString(),
  };
}

function createCalendarItem(date, type, text) {
  return {
    id: crypto.randomUUID(),
    date,
    type,
    text,
    createdAt: new Date().toISOString(),
  };
}

function formatToday() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  dateEl.textContent = fmt.format(now);
}

function markStateDirty() {
  saveLocalState();

  if (!isServerSync) {
    return;
  }

  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncState().catch(() => {});
  }, SYNC_DEBOUNCE_MS);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  return response;
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift() || '';
  }
  return '';
}

function applyAuthState(me) {
  if (!me || !me.authenticated) {
    isServerSync = false;
    authUser = null;
    state.version = 0;
    return;
  }

  isServerSync = true;
  authUser = me.user;
}

function updateAuthUI() {
  if (!authStatusEl || !authBtn) {
    return;
  }

  if (isServerSync && authUser) {
    const label = authUser.nickname || authUser.email || `naver-${authUser.naverId || ''}`;
    authStatusEl.textContent = `로그인됨: ${label}`;
    authBtn.textContent = '로그아웃';
  } else {
    authStatusEl.textContent = '로컬 모드';
    authBtn.textContent = '네이버 로그인';
  }
}

async function checkAuth() {
  try {
    const response = await apiRequest('/auth/me', { method: 'GET' });
    if (!response.ok) {
      applyAuthState(null);
      return;
    }
    const me = await response.json();
    applyAuthState(me);
  } catch (error) {
    applyAuthState(null);
  }
}

async function loadServerState() {
  try {
    const response = await apiRequest('/state', { method: 'GET' });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      state: data.state || {},
      hasData: !!data.hasData,
      exists: !!data.exists,
      version: Number(data.version || 0),
    };
  } catch {
    return null;
  }
}

async function syncState() {
  if (!isServerSync || !authUser || syncing) {
    return;
  }

  syncing = true;
  try {
    const response = await apiRequest('/state', {
      method: 'PUT',
      headers: {
        'x-csrf-token': getCookie('daycheck_csrf') || '',
      },
      body: JSON.stringify({
        todos: state.todos,
        doneLog: state.doneLog,
        calendarItems: state.calendarItems,
        categories: state.categories,
        version: state.version,
      }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        const data = await response.json();
        if (data && data.state) {
          const restored = normalizeStateFromServer(data.state);
          state.todos = restored.todos;
          state.doneLog = restored.doneLog;
          state.calendarItems = restored.calendarItems;
          state.categories = normalizeCategoryState(data.state?.categories || state.categories);
          state.version = Number(data.version || state.version);
          ensureCategoryIntegrity();
          render();
        }
      }
      return;
    }

    const result = await response.json();
    state.version = Number(result.version || state.version);
  } catch {
    // Keep local data and retry on next edit.
  } finally {
    syncing = false;
  }

  if (pendingSync) {
    pendingSync = false;
    syncState().catch(() => {});
  }
}

function queueSync() {
  saveLocalState();

  if (!isServerSync) {
    return;
  }

  if (syncing) {
    pendingSync = true;
    return;
  }

  markStateDirty();
}

function render() {
  renderTodoComposer();
  renderTodoList();
  renderTodosByBucket();
  renderCalendar();
  renderSelectedDatePanel();
  renderWeeklyReport();
}

function renderTodoComposer() {
  if (!composerCategory) {
    return;
  }
  renderCategoryOptions(composerCategory, composerCategory.value || 'uncategorized');
}

function renderTodoList() {
  const sorted = sortTodos(state.todos);
  todoCountEl.textContent = String(sorted.length);
  todoListEl.innerHTML = '';

  sorted.forEach((todo) => {
    const item = todoTemplate.content.firstElementChild.cloneNode(true);
    const titleEl = item.querySelector('.title');
    const metaEl = item.querySelector('.meta');
    const categorySelect = item.querySelector('.todo-category-select');
    const completeBtn = item.querySelector('.complete');
    const deleteBtn = item.querySelector('.delete');

    titleEl.textContent = todo.title;
    const dateText = todo.dueDate ? ` 마감일: ${todo.dueDate}` : '';
    metaEl.textContent = `우선순위: ${priorityLabel[todo.priority] || '보통'}${dateText}`;

    renderCategoryOptions(categorySelect, todo.categoryId);

    categorySelect.addEventListener('change', () => {
      todo.categoryId = categorySelect.value;
      render();
      queueSync();
    });

    completeBtn.addEventListener('click', () => {
      state.doneLog.unshift({
        id: todo.id,
        title: todo.title,
        categoryId: todo.categoryId,
        bucket: todo.bucket || 'inbox',
        priority: todo.priority,
        dueDate: todo.dueDate,
        createdAt: todo.createdAt,
        completedAt: new Date().toISOString(),
      });
      state.todos = state.todos.filter((item) => item.id !== todo.id);
      render();
      queueSync();
    });

    deleteBtn.addEventListener('click', () => {
      state.todos = state.todos.filter((item) => item.id !== todo.id);
      render();
      queueSync();
    });

    todoListEl.appendChild(item);
  });
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

    sorted.forEach((todo) => {
      const item = todoTemplate.content.firstElementChild.cloneNode(true);
      const titleEl = item.querySelector('.title');
      const metaEl = item.querySelector('.meta');
      const completeBtn = item.querySelector('.complete');
      const deleteBtn = item.querySelector('.delete');
      const bucketSelect = item.querySelector('.todo-category-select');

      titleEl.textContent = todo.title;
      const dateText = todo.dueDate ? ` 마감일: ${todo.dueDate}` : '';
      metaEl.textContent = `우선순위: ${priorityLabel[todo.priority] || '보통'}${dateText}`;

      renderCategoryOptions(bucketSelect, todo.categoryId);
      bucketSelect.addEventListener('change', () => {
        todo.categoryId = bucketSelect.value;
        render();
        queueSync();
      });

      completeBtn.addEventListener('click', () => {
        state.doneLog.unshift({
          id: todo.id,
          title: todo.title,
          categoryId: todo.categoryId,
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
}

function countDailyStats(dateText) {
  const scheduledCount = state.todos.filter((todo) => todo.dueDate === dateText).length;
  const completedCount = state.doneLog.filter((item) => parseIsoDate(item.completedAt) === dateText).length;
  return { scheduledCount, completedCount };
}

function getEntriesForDate(dateText) {
  const todoEntries = state.todos
    .filter((todo) => todo.dueDate === dateText)
    .map((todo) => ({
      id: todo.id,
      type: 'todo',
      text: `${todo.title} (${getCategoryName(todo.categoryId)})`,
      source: 'todo',
    }));

  const noteEntries = state.calendarItems
    .filter((item) => item.date === dateText)
    .map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      source: 'calendar',
    }));

  return [...todoEntries, ...noteEntries];
}

function addEmptyMessage(listEl, message) {
  const li = document.createElement('li');
  li.textContent = message;
  listEl.appendChild(li);
}

function renderSelectedDatePanel() {
  const targetDate = state.selectedDate;
  const target = new Date(targetDate);
  const labelFmt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  selectedDateLabel.textContent = labelFmt.format(target);

  const createdTodos = sortTodos(state.todos.filter((todo) => parseIsoDate(todo.createdAt) === targetDate));
  const completedTodos = state.doneLog.filter((log) => parseIsoDate(log.completedAt) === targetDate);
  const notes = state.calendarItems.filter((item) => item.date === targetDate);

  selectedDateSummary.textContent = `생성 ${createdTodos.length}개 / 완료 ${completedTodos.length}개 / 메모 ${notes.length}개`;
  selectedCreatedList.innerHTML = '';
  selectedCompletedList.innerHTML = '';
  selectedCalendarNoteList.innerHTML = '';

  if (createdTodos.length === 0) {
    addEmptyMessage(selectedCreatedList, '해당 날짜에 생성된 할 일이 없습니다.');
  } else {
    createdTodos.forEach((todo) => {
      const li = document.createElement('li');
      li.textContent = `[${getCategoryName(todo.categoryId)}] ${todo.title} (${formatDisplayDateTime(todo.createdAt)})`;
      selectedCreatedList.appendChild(li);
    });
  }

  if (completedTodos.length === 0) {
    addEmptyMessage(selectedCompletedList, '해당 날짜에 완료한 항목이 없습니다.');
  } else {
    completedTodos.forEach((log) => {
      const dueDateText = log.dueDate ? ` 마감: ${log.dueDate}` : '';
      const li = document.createElement('li');
      li.textContent = `[${getCategoryName(log.categoryId)}] ${log.title} (${formatDisplayDateTime(log.completedAt)}${dueDateText})`;
      selectedCompletedList.appendChild(li);
    });
  }

  if (notes.length === 0) {
    addEmptyMessage(selectedCalendarNoteList, '해당 날짜에 메모/기록이 없습니다.');
  } else {
    notes.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `[${typeLabel[item.type] || item.type}] ${item.text}`;
      selectedCalendarNoteList.appendChild(li);
    });
  }
}

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const firstDate = new Date(year, month, 1);
  const dayCount = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDate.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + dayCount) / 7) * 7;

  const fmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });
  calendarMonthLabel.textContent = fmt.format(state.currentMonth);

  calendarGrid.innerHTML = '';

  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startOffset + 1;
    const inMonth = dayNumber > 0 && dayNumber <= dayCount;

    const cell = document.createElement('article');
    cell.className = 'calendar-cell';

    if (!inMonth) {
      cell.classList.add('is-empty');
      calendarGrid.appendChild(cell);
      continue;
    }

    const currentDate = new Date(year, month, dayNumber);
    const dateText = toLocalIsoDate(currentDate);

    if (dateText === state.selectedDate) {
      cell.classList.add('is-selected');
    }

    const dayLabel = document.createElement('p');
    dayLabel.className = 'calendar-day';
    dayLabel.textContent = String(dayNumber);
    cell.appendChild(dayLabel);

    const { scheduledCount, completedCount } = countDailyStats(dateText);
    const dailySummary = document.createElement('p');
    dailySummary.className = 'calendar-summary';
    dailySummary.textContent = `예정 ${scheduledCount} / 완료 ${completedCount}`;
    cell.appendChild(dailySummary);

    const entries = getEntriesForDate(dateText);

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '항목 없음';
      cell.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'calendar-item-list';

      entries.slice(0, 3).forEach((entry) => {
        const li = document.createElement('li');
        li.className = `calendar-item ${entry.type === 'note' ? 'is-note' : 'is-todo'}`;

        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = typeLabel[entry.type] || entry.type;

        const text = document.createElement('span');
        text.className = 'calendar-item-text';
        text.textContent = entry.text;

        li.appendChild(badge);
        li.appendChild(text);

        if (entry.source === 'calendar') {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'calendar-remove';
          removeBtn.textContent = 'x';
          removeBtn.setAttribute('aria-label', '항목 삭제');
          removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            state.calendarItems = state.calendarItems.filter((item) => item.id !== entry.id);
            render();
            queueSync();
          });
          li.appendChild(removeBtn);
        }

        list.appendChild(li);
      });

      if (entries.length > 3) {
        const more = document.createElement('li');
        more.className = 'calendar-more';
        more.textContent = `+${entries.length - 3}개 더 보기`;
        list.appendChild(more);
      }

      cell.appendChild(list);
    }

    cell.addEventListener('click', () => {
      state.selectedDate = dateText;
      render();
    });

    calendarGrid.appendChild(cell);
  }
}

function renderWeeklyReport() {
  const start = startOfWeek(new Date());
  const end = endOfWeek(new Date());
  const fmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });

  const doneThisWeek = state.doneLog.filter((item) => inCurrentWeek(item.completedAt));
  const pending = sortTodos(state.todos);

  weekRangeEl.textContent = `${fmt.format(start)} ~ ${fmt.format(end)}`;

  const doneCountEl = document.getElementById('weeklyDoneCount');
  const pendingCountEl = document.getElementById('weeklyPendingCount');
  const doneListEl = document.getElementById('weeklyDoneList');
  const pendingListEl = document.getElementById('weeklyPendingList');

  doneCountEl.textContent = `${doneThisWeek.length}건`;
  pendingCountEl.textContent = `${pending.length}건`;

  doneListEl.innerHTML = '';
  pendingListEl.innerHTML = '';

  if (doneThisWeek.length === 0) {
    doneListEl.innerHTML = '<li>이번 주 완료 항목이 없습니다.</li>';
  } else {
    doneThisWeek.slice(0, 12).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `[${getCategoryName(item.categoryId)}] ${item.title}`;
      doneListEl.appendChild(li);
    });
  }

  if (pending.length === 0) {
    pendingListEl.innerHTML = '<li>남은 할 일이 없습니다.</li>';
  } else {
    pending.slice(0, 12).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `[${getCategoryName(item.categoryId)}] ${item.title} (${priorityLabel[item.priority] || '보통'})`;
      pendingListEl.appendChild(li);
    });
  }
}

function registerEvents() {
  if (eventsRegistered) {
    return;
  }
  eventsRegistered = true;

  todoComposer.addEventListener('submit', (event) => {
    event.preventDefault();

    const lines = todoTextarea.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return;
    }

    lines.forEach((title) => {
      state.todos.unshift(
        createTodo({
          title,
          categoryId: composerCategory.value || 'uncategorized',
          bucket: 'inbox',
          priority: composerPriority.value,
          dueDate: composerDate.value,
        }),
      );
    });

    saveLocalState();
    queueSync();
    todoTextarea.value = '';
    composerDate.value = '';
    composerPriority.value = '2';
    todoTextarea.focus();
    render();
  });

  openCategoryInlineBtn.addEventListener('click', () => {
    const isHidden = inlineCategoryCreate.classList.contains('hidden');
    const nextHidden = !isHidden;
    inlineCategoryCreate.classList.toggle('hidden', nextHidden);
    if (!nextHidden) {
      newCategoryInput.focus();
    }
  });

  cancelCategoryBtn.addEventListener('click', () => {
    newCategoryInput.value = '';
    inlineCategoryCreate.classList.add('hidden');
  });

  createCategoryBtn.addEventListener('click', () => {
    const name = newCategoryInput.value.trim();
    if (!name) {
      return;
    }

    const exists = state.categories.find((item) => item.name === name);
    if (exists) {
      composerCategory.value = exists.id;
      newCategoryInput.value = '';
      inlineCategoryCreate.classList.add('hidden');
      return;
    }

    const category = { id: crypto.randomUUID(), name };
    state.categories.push(category);
    ensureCategoryIntegrity();
    newCategoryInput.value = '';
    composerCategory.value = category.id;
    inlineCategoryCreate.classList.add('hidden');
    render();
    queueSync();
  });

  newCategoryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      createCategoryBtn.click();
    }
  });

  quickForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const title = quickInput.value.trim();
    if (!title) {
      return;
    }

    state.todos.unshift(
      createTodo({
        title,
        bucket: bucketSelect.value,
        priority: prioritySelect.value,
        dueDate: dueDateInput.value,
      }),
    );

    saveLocalState();
    queueSync();
    quickInput.value = '';
    dueDateInput.value = '';
    quickInput.focus();
    render();
  });

  calendarForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = calendarTextInput.value.trim();
    const date = calendarDateInput.value;
    if (!text || !date) {
      return;
    }

    state.calendarItems.unshift(createCalendarItem(date, calendarTypeSelect.value, text));
    state.selectedDate = date;
    state.currentMonth = new Date(new Date(date).getFullYear(), new Date(date).getMonth(), 1);
    saveLocalState();
    queueSync();
    calendarTextInput.value = '';
    render();
  });

  prevMonthBtn.addEventListener('click', () => {
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
    render();
  });

  nextMonthBtn.addEventListener('click', () => {
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
    render();
  });

  authBtn.addEventListener('click', async () => {
    if (!isServerSync) {
      window.location.href = '/api/auth/naver';
      return;
    }

    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        headers: {
          'x-csrf-token': getCookie('daycheck_csrf') || '',
        },
      });
    } catch {
      // ignore
    }

    isServerSync = false;
    authUser = null;
    state.version = 0;
    updateAuthUI();
  });
}

async function bootstrap() {
  formatToday();
  state.selectedDate = state.selectedDate || toLocalIsoDate(new Date());
  loadStateFromLocal();

  await checkAuth();

  if (isServerSync) {
    const serverState = await loadServerState();
    if (serverState) {
      const localBackup = {
        todos: [...state.todos],
        doneLog: [...state.doneLog],
        calendarItems: [...state.calendarItems],
        categories: [...state.categories],
      };

      if (serverState.exists && serverState.hasData) {
        const merged = normalizeStateFromServer({ ...serverState.state, version: serverState.version });
        state.todos = merged.todos;
        state.doneLog = merged.doneLog;
        state.calendarItems = merged.calendarItems;
        state.categories = normalizeCategoryState(merged.categories);
        state.version = Number(serverState.version || 0);
      } else if (hasStoredData(localBackup)) {
        queueSync();
      }
    }
  }

  ensureCategoryIntegrity();
  saveLocalState();
  registerEvents();
  updateAuthUI();
  render();

  const searchParams = new URLSearchParams(window.location.search);
  const auth = searchParams.get('auth');
  if (auth === 'error') {
    alert('네이버 로그인 중 오류가 발생했습니다.');
  }
}

bootstrap().catch(() => {
  updateAuthUI();
  registerEvents();
  render();
});

