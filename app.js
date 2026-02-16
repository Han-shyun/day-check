const TODO_STORAGE_KEY = 'day-check.main.todos.v2';
const DONE_STORAGE_KEY = 'day-check.main.doneLog.v1';

const priorityLabel = {
  3: '높음',
  2: '보통',
  1: '낮음',
};

const state = {
  todos: loadState(TODO_STORAGE_KEY),
  doneLog: loadState(DONE_STORAGE_KEY),
};

const dateEl = document.getElementById('todayDate');
const weekRangeEl = document.getElementById('weekRange');
const form = document.getElementById('quickAddForm');
const input = document.getElementById('quickInput');
const bucketSelect = document.getElementById('bucketSelect');
const prioritySelect = document.getElementById('prioritySelect');
const template = document.getElementById('todoItemTemplate');

const buckets = ['today', 'project', 'routine', 'inbox'];

function loadState(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveState() {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state.todos));
  localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(state.doneLog));
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

function inCurrentWeek(isoDate) {
  const target = new Date(isoDate);
  const start = startOfWeek(new Date());
  const end = endOfWeek(new Date());
  return target >= start && target <= end;
}

function createTodo(title, bucket, priority) {
  return {
    id: crypto.randomUUID(),
    title,
    bucket,
    priority: Number(priority),
    createdAt: new Date().toISOString(),
  };
}

function sortByPriorityThenCreated(list) {
  return [...list].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function renderTodos() {
  for (const bucket of buckets) {
    const listEl = document.getElementById(`list-${bucket}`);
    const countEl = document.getElementById(`count-${bucket}`);
    listEl.innerHTML = '';

    const filtered = state.todos.filter((todo) => todo.bucket === bucket);
    const sorted = sortByPriorityThenCreated(filtered);
    countEl.textContent = String(sorted.length);

    sorted.forEach((todo) => {
      const item = template.content.firstElementChild.cloneNode(true);
      const titleEl = item.querySelector('.title');
      const metaEl = item.querySelector('.meta');
      const completeBtn = item.querySelector('.complete');
      const deleteBtn = item.querySelector('.delete');

      titleEl.textContent = todo.title;
      metaEl.textContent = `우선순위: ${priorityLabel[todo.priority] || '보통'}`;

      completeBtn.addEventListener('click', () => {
        state.doneLog.unshift({
          id: todo.id,
          title: todo.title,
          bucket: todo.bucket,
          priority: todo.priority,
          completedAt: new Date().toISOString(),
        });
        state.todos = state.todos.filter((t) => t.id !== todo.id);
        saveState();
        render();
      });

      deleteBtn.addEventListener('click', () => {
        state.todos = state.todos.filter((t) => t.id !== todo.id);
        saveState();
        render();
      });

      listEl.appendChild(item);
    });
  }
}

function renderWeeklyReport() {
  const start = startOfWeek(new Date());
  const end = endOfWeek(new Date());

  const fmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });
  weekRangeEl.textContent = `${fmt.format(start)} ~ ${fmt.format(end)}`;

  const doneThisWeek = state.doneLog.filter((log) => inCurrentWeek(log.completedAt));
  const pendingNow = sortByPriorityThenCreated(state.todos);

  const doneCountEl = document.getElementById('weeklyDoneCount');
  const pendingCountEl = document.getElementById('weeklyPendingCount');
  const doneListEl = document.getElementById('weeklyDoneList');
  const pendingListEl = document.getElementById('weeklyPendingList');

  doneCountEl.textContent = `${doneThisWeek.length}개 완료`;
  pendingCountEl.textContent = `${pendingNow.length}개 남음`;

  doneListEl.innerHTML = '';
  pendingListEl.innerHTML = '';

  if (doneThisWeek.length === 0) {
    doneListEl.innerHTML = '<li>이번 주 완료한 일이 아직 없습니다.</li>';
  } else {
    doneThisWeek.slice(0, 12).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `[${item.bucket}] ${item.title}`;
      doneListEl.appendChild(li);
    });
  }

  if (pendingNow.length === 0) {
    pendingListEl.innerHTML = '<li>남은 일이 없습니다. 👍</li>';
  } else {
    pendingNow.slice(0, 12).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `[${item.bucket}] ${item.title} (${priorityLabel[item.priority]})`;
      pendingListEl.appendChild(li);
    });
  }
}

function render() {
  renderTodos();
  renderWeeklyReport();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) {
    return;
  }

  state.todos.unshift(createTodo(title, bucketSelect.value, prioritySelect.value));
  saveState();
  input.value = '';
  input.focus();
  render();
});

formatToday();
render();
