import { state } from '../../core/app-context.js';
import {
  inCurrentWeek,
  startOfWeek,
  endOfWeek,
  toLocalIsoDate,
  formatDisplayDate,
  formatDisplayDateTime,
} from '../../core/date-utils.js';
import {
  weekRangeEl,
  weeklyDoneCountEl,
  weeklyDoneListEl,
  weeklyPendingCountEl,
  weeklyPendingListEl,
} from '../../core/dom-refs.js';

let _addEmptyMessage = () => {};
let _sortTodos = (list) => list;
let _getTodoGroupLabel = (todo) => todo?.title || '';
let _queueSync = () => {};

export function initReportDeps({ addEmptyMessage, sortTodos, getTodoGroupLabel, queueSync } = {}) {
  if (typeof addEmptyMessage === 'function') {
    _addEmptyMessage = addEmptyMessage;
  }
  if (typeof sortTodos === 'function') {
    _sortTodos = sortTodos;
  }
  if (typeof getTodoGroupLabel === 'function') {
    _getTodoGroupLabel = getTodoGroupLabel;
  }
  if (typeof queueSync === 'function') {
    _queueSync = queueSync;
  }
}

function createEditableReportItem(item, textContent, { editable = false } = {}) {
  const li = document.createElement('li');
  li.className = 'report-item';

  if (!editable) {
    li.textContent = textContent;
    return li;
  }

  const titleSpan = document.createElement('span');
  titleSpan.className = 'title';
  titleSpan.textContent = item.title;
  titleSpan.setAttribute('contenteditable', 'true');
  titleSpan.setAttribute('spellcheck', 'false');
  titleSpan.addEventListener('blur', () => {
    const next = (titleSpan.textContent || '').trim();
    if (next && next !== item.title) {
      item.title = next;
      _queueSync();
    } else {
      titleSpan.textContent = item.title;
    }
  });
  titleSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleSpan.blur();
    }
  });

  const dueDateText = item.dueDate ? ` / Due ${formatDisplayDate(item.dueDate)}` : '';
  const metaSpan = document.createElement('span');
  metaSpan.className = 'meta';
  metaSpan.textContent = ` [${_getTodoGroupLabel(item)}] (${formatDisplayDateTime(item.completedAt || item.createdAt)}${dueDateText})`;

  li.append(titleSpan, metaSpan);
  return li;
}

export function renderWeeklyReport() {
  if (
    !weekRangeEl ||
    !weeklyDoneCountEl ||
    !weeklyDoneListEl ||
    !weeklyPendingCountEl ||
    !weeklyPendingListEl
  ) {
    return;
  }

  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());
  const weekStartText = toLocalIsoDate(weekStart);
  const weekEndText = toLocalIsoDate(weekEnd);

  weekRangeEl.textContent = `${weekStartText} ~ ${weekEndText}`;

  const weeklyDone = state.doneLog
    .filter((item) => inCurrentWeek(item.completedAt))
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const weeklyPending = _sortTodos(state.todos);

  weeklyDoneCountEl.textContent = `${weeklyDone.length} items`;
  weeklyPendingCountEl.textContent = `${weeklyPending.length} items`;
  weeklyDoneListEl.innerHTML = '';
  weeklyPendingListEl.innerHTML = '';

  if (weeklyDone.length === 0) {
    _addEmptyMessage(weeklyDoneListEl, 'No completed items this week.');
  } else {
    weeklyDone.forEach((item) => {
      weeklyDoneListEl.appendChild(
        createEditableReportItem(item, '', { editable: true }),
      );
    });
  }

  if (weeklyPending.length === 0) {
    _addEmptyMessage(weeklyPendingListEl, 'No pending items.');
  } else {
    weeklyPending.forEach((item) => {
      weeklyPendingListEl.appendChild(
        createEditableReportItem(item, '', { editable: true }),
      );
    });
  }
}
