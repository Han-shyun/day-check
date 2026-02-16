const TODO_STORAGE_KEY = 'day-check.main.todos.v2';
const DONE_STORAGE_KEY = 'day-check.main.doneLog.v1';
const CALENDAR_STORAGE_KEY = 'day-check.main.calendarItems.v1';

const priorityLabel = {
  3: '높음',
  2: '보통',
  1: '낮음',
};

const typeLabel = {
  todo: '체크리스트',
  note: '메모',
};

const state = {
  todos: loadState(TODO_STORAGE_KEY),
  doneLog: loadState(DONE_STORAGE_KEY),
  calendarItems: loadState(CALENDAR_STORAGE_KEY),
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
};

const dateEl = document.getElementById('todayDate');
const weekRangeEl = document.getElementById('weekRange');
const form = document.getElementById('quickAddForm');
const input = document.getElementById('quickInput');
const dueDateInput = document.getElementById('dueDateInput');
const bucketSelect = document.getElementById('bucketSelect');
const prioritySelect = document.getElementById('prioritySelect');
const template = document.getElementById('todoItemTemplate');

const calendarForm = document.getElementById('calendarForm');
const calendarDateInput = document.getElementById('calendarDateInput');
const calendarTypeSelect = document.getElementById('calendarTypeSelect');
const calendarTextInput = document.getElementById('calendarTextInput');
const calendarGrid = document.getElementById('calendarGrid');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');

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
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(state.calendarItems));
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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
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
  const start = startOfWeek(new Date());
  const end = endOfWeek(new Date());
  return target >= start && target <= end;
}

function createTodo(title, bucket, priority, dueDate) {
  return {
    id: crypto.randomUUID(),
    title,
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
      const dateText = todo.dueDate ? ` · 날짜: ${todo.dueDate}` : '';
      metaEl.textContent = `우선순위: ${priorityLabel[todo.priority] || '보통'}${dateText}`;

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

function getCalendarEntriesByDate(dateText) {
  const todoEntries = state.todos
    .filter((todo) => todo.dueDate === dateText)
    .map((todo) => ({
      id: todo.id,
      type: 'todo',
      text: todo.title,
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

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const fmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });
  calendarMonthLabel.textContent = fmt.format(state.currentMonth);

  const firstDate = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDate.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  calendarGrid.innerHTML = '';

  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startOffset + 1;
    const inMonth = dayNumber > 0 && dayNumber <= daysInMonth;

    const cell = document.createElement('article');
    cell.className = 'calendar-cell';

    if (!inMonth) {
      cell.classList.add('is-empty');
      calendarGrid.appendChild(cell);
      continue;
    }

    const currentDate = new Date(year, month, dayNumber);
    const dateText = isoDate(currentDate);

    const dayLabel = document.createElement('p');
    dayLabel.className = 'calendar-day';
    dayLabel.textContent = String(dayNumber);
    cell.appendChild(dayLabel);

    const entries = getCalendarEntriesByDate(dateText);
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '비어 있음';
      cell.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'calendar-item-list';

      entries.slice(0, 4).forEach((entry) => {
        const li = document.createElement('li');
        li.className = `calendar-item ${entry.type === 'note' ? 'is-note' : 'is-todo'}`;

        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = typeLabel[entry.type] || '항목';

        const text = document.createElement('span');
        text.className = 'calendar-item-text';
        text.textContent = entry.text;

        li.appendChild(badge);
        li.appendChild(text);

        if (entry.source === 'calendar') {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'calendar-remove';
          removeBtn.textContent = '✕';
          removeBtn.setAttribute('aria-label', '달력 항목 삭제');
          removeBtn.addEventListener('click', () => {
            state.calendarItems = state.calendarItems.filter((item) => item.id !== entry.id);
            saveState();
            renderCalendar();
          });
          li.appendChild(removeBtn);
        }

        list.appendChild(li);
      });

      if (entries.length > 4) {
        const more = document.createElement('li');
        more.className = 'calendar-more';
        more.textContent = `+${entries.length - 4}개 더 있음`;
        list.appendChild(more);
      }

      cell.appendChild(list);
    }

    calendarGrid.appendChild(cell);
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
  renderCalendar();
  renderWeeklyReport();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) {
    return;
  }

  state.todos.unshift(createTodo(title, bucketSelect.value, prioritySelect.value, dueDateInput.value));
  saveState();
  input.value = '';
  dueDateInput.value = '';
  input.focus();
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
  saveState();
  calendarTextInput.value = '';
  renderCalendar();
});

prevMonthBtn.addEventListener('click', () => {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

formatToday();
render();
