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

export function initReportDeps({ addEmptyMessage, sortTodos, getTodoGroupLabel } = {}) {
  if (typeof addEmptyMessage === 'function') {
    _addEmptyMessage = addEmptyMessage;
  }
  if (typeof sortTodos === 'function') {
    _sortTodos = sortTodos;
  }
  if (typeof getTodoGroupLabel === 'function') {
    _getTodoGroupLabel = getTodoGroupLabel;
  }
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

  weeklyDoneCountEl.textContent = `${weeklyDone.length}개`;
  weeklyPendingCountEl.textContent = `${weeklyPending.length}개`;
  weeklyDoneListEl.innerHTML = '';
  weeklyPendingListEl.innerHTML = '';

  if (weeklyDone.length === 0) {
    _addEmptyMessage(weeklyDoneListEl, '이번 주 완료된 항목이 없습니다.');
  } else {
    weeklyDone.forEach((item) => {
      const dueDateText = item.dueDate ? ` / 마감 ${formatDisplayDate(item.dueDate)}` : '';
      const li = document.createElement('li');
      li.textContent = `[${_getTodoGroupLabel(item)}] ${item.title} (${formatDisplayDateTime(item.completedAt)}${dueDateText})`;
      weeklyDoneListEl.appendChild(li);
    });
  }

  if (weeklyPending.length === 0) {
    _addEmptyMessage(weeklyPendingListEl, '남아 있는 항목이 없습니다.');
  } else {
    weeklyPending.forEach((item) => {
      const dueDateText = item.dueDate ? ` / 마감 ${formatDisplayDate(item.dueDate)}` : '';
      const li = document.createElement('li');
      li.textContent = `[${_getTodoGroupLabel(item)}] ${item.title}${dueDateText}`;
      weeklyPendingListEl.appendChild(li);
    });
  }
}
