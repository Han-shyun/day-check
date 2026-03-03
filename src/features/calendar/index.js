import { state, runtime } from '../../core/app-context.js';
import { HOLIDAYS_BY_YEAR, typeLabel } from '../../core/constants.js';
import {
  selectedDateLabel,
  selectedDateSummary,
  selectedCreatedList,
  selectedCompletedList,
  selectedCalendarNoteList,
  selectedDateNoteInput,
  selectedDateNoteStartDate,
  selectedDateNoteEndDate,
  calendarDateInput,
  calendarModeButtons,
  calendarSubmitBtn,
  calendarTextInput,
  calendarTodoTitleInput,
  calendarTodoFields,
  calendarTodoDetailInput,
  calendarGrid,
  calendarMonthLabel,
} from '../../core/dom-refs.js';
import {
  getHolidayLabel,
  getWeekendType,
  ensureHolidayDataForYear,
} from '../../core/holidays.js';
import {
  clampCalendarRangeEnd,
  isDateInCalendarRange,
  toLocalIsoDate,
  parseIsoDate,
  formatDisplayDateTime,
  formatCalendarRange,
  getRangeDaysInclusive,
} from '../../core/date-utils.js';

let _render = () => {};
let _showToast = () => {};
let _queueSync = () => {};
let _sortTodos = (list) => list;
let _getTodoGroupLabel = (todo) => todo?.title || '';
let _createCalendarItem = (date, type, text, endDate = date) => ({
  id: crypto.randomUUID(),
  date,
  endDate: endDate || date,
  type,
  text,
  createdAt: new Date().toISOString(),
});

export function initCalendarDeps({ render, showToast, queueSync, sortTodos, getTodoGroupLabel, createCalendarItem } = {}) {
  if (typeof render === 'function') {
    _render = render;
  }
  if (typeof showToast === 'function') {
    _showToast = showToast;
  }
  if (typeof queueSync === 'function') {
    _queueSync = queueSync;
  }
  if (typeof sortTodos === 'function') {
    _sortTodos = sortTodos;
  }
  if (typeof getTodoGroupLabel === 'function') {
    _getTodoGroupLabel = getTodoGroupLabel;
  }
  if (typeof createCalendarItem === 'function') {
    _createCalendarItem = createCalendarItem;
  }
}

export function countDailyStats(dateText) {
  const scheduledCount = state.todos.filter((todo) => todo.dueDate === dateText).length;
  const completedCount = state.doneLog.filter((item) => parseIsoDate(item.completedAt) === dateText).length;
  return { scheduledCount, completedCount };
}

export function buildCalendarRangeLaneMap(year, month) {
  const monthStart = toLocalIsoDate(new Date(year, month, 1));
  const monthEnd = toLocalIsoDate(new Date(year, month + 1, 0));
  const rangeLaneMap = {};
  const laneEndDates = [];

  const rangeItems = state.calendarItems
    .filter((item) => {
      if (item.type !== 'note') {
        return false;
      }
      const startDate = item.date;
      const endDate = item.endDate || item.date;
      const isRange = endDate > startDate;
      if (!isRange) {
        return false;
      }
      return startDate <= monthEnd && endDate >= monthStart;
    })
    .sort((a, b) => {
      if (a.date !== b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      if ((a.endDate || a.date) !== (b.endDate || b.date)) {
        return new Date(a.endDate || a.date) - new Date(b.endDate || b.date);
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  rangeItems.forEach((item) => {
    const startDate = item.date;
    const endDate = item.endDate || item.date;
    let lane = laneEndDates.findIndex((laneEndDate) => laneEndDate < startDate);
    if (lane === -1) {
      lane = laneEndDates.length;
      laneEndDates.push(endDate);
    } else {
      laneEndDates[lane] = endDate;
    }
    rangeLaneMap[item.id] = lane;
  });

  return rangeLaneMap;
}

export function getEntriesForDate(dateText, rangeLaneMap = {}) {
  const noteEntries = state.calendarItems
    .filter((item) => isDateInCalendarRange(dateText, item.date, item.endDate || item.date))
    .map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      source: 'calendar',
      createdAt: item.createdAt,
      startDate: item.date,
      endDate: item.endDate || item.date,
      isRange: (item.endDate || item.date) > item.date,
      rangeLane:
        (item.endDate || item.date) > item.date && Number.isInteger(rangeLaneMap?.[item.id])
          ? rangeLaneMap[item.id]
          : -1,
      rangePosition:
        dateText === item.date
          ? 'start'
          : dateText === (item.endDate || item.date)
            ? 'end'
            : 'middle',
    }));

  const todoEntries = state.todos
    .filter((todo) => todo.dueDate === dateText)
    .map((todo) => ({
      id: todo.id,
      type: 'todo',
      text: `${todo.title} (${_getTodoGroupLabel(todo)})`,
      source: 'todo',
    }));

  noteEntries.sort((a, b) => {
    if (a.isRange !== b.isRange) {
      return a.isRange ? -1 : 1;
    }
    if (a.isRange && b.isRange && a.rangeLane !== b.rangeLane) {
      return a.rangeLane - b.rangeLane;
    }
    if (a.startDate !== b.startDate) {
      return new Date(a.startDate) - new Date(b.startDate);
    }
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return [...noteEntries, ...todoEntries];
}

export function addEmptyMessage(listEl, message) {
  const li = document.createElement('li');
  li.textContent = message;
  listEl.appendChild(li);
}

export function createSelectedNoteTextNode(rawText) {
  const text = String(rawText || '');
  const container = document.createElement('div');
  container.className = 'selected-note-text-wrap';

  const textEl = document.createElement('p');
  textEl.className = 'selected-note-text';
  textEl.textContent = text;
  textEl.title = text;
  container.appendChild(textEl);

  const needToggle = text.length > 120 || text.includes('\n');
  if (!needToggle) {
    return container;
  }

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'selected-note-expand';
  expandBtn.textContent = '더 보기';
  expandBtn.setAttribute('aria-expanded', 'false');
  expandBtn.addEventListener('click', () => {
    const expanded = textEl.classList.toggle('is-expanded');
    expandBtn.setAttribute('aria-expanded', String(expanded));
    expandBtn.textContent = expanded ? '접기' : '더 보기';
  });

  container.appendChild(expandBtn);
  return container;
}

export function renderSelectedDatePanel() {
  const targetDate = state.selectedDate;
  const target = new Date(targetDate);
  const labelFmt = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  selectedDateLabel.textContent = labelFmt.format(target);

  const createdTodos = _sortTodos(state.todos.filter((todo) => parseIsoDate(todo.createdAt) === targetDate));
  const completedTodos = state.doneLog.filter((log) => parseIsoDate(log.completedAt) === targetDate);
  const notes = state.calendarItems
    .filter((item) => isDateInCalendarRange(targetDate, item.date, item.endDate || item.date))
    .sort((a, b) => {
      const aIsRange = (a.endDate || a.date) > a.date;
      const bIsRange = (b.endDate || b.date) > b.date;
      if (aIsRange !== bIsRange) {
        return aIsRange ? -1 : 1;
      }
      if (a.date !== b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  selectedDateSummary.textContent = `작성 ${createdTodos.length}개 / 완료 ${completedTodos.length}개 / 메모 ${notes.length}개`;
  selectedCreatedList.innerHTML = '';
  selectedCompletedList.innerHTML = '';
  selectedCalendarNoteList.innerHTML = '';
  if (selectedDateNoteInput) {
    selectedDateNoteInput.placeholder = `${targetDate} 메모 입력`;
    selectedDateNoteInput.setAttribute('aria-label', `${targetDate} 메모 입력`);
  }
  if (selectedDateNoteStartDate && !selectedDateNoteStartDate.value) {
    selectedDateNoteStartDate.value = targetDate;
  }
  const noteStart = parseIsoDate(selectedDateNoteStartDate?.value || targetDate) || targetDate;
  if (selectedDateNoteStartDate) {
    selectedDateNoteStartDate.value = noteStart;
  }
  if (selectedDateNoteEndDate) {
    selectedDateNoteEndDate.min = noteStart;
    if (!selectedDateNoteEndDate.value || selectedDateNoteEndDate.value < noteStart) {
      selectedDateNoteEndDate.value = noteStart;
    }
  }

  if (createdTodos.length === 0) {
    addEmptyMessage(selectedCreatedList, '선택한 날짜에 생성된 할 일이 없습니다.');
  } else {
    createdTodos.forEach((todo) => {
      const li = document.createElement('li');
      li.textContent = `[${_getTodoGroupLabel(todo)}] ${todo.title} (${formatDisplayDateTime(todo.createdAt)})`;
      selectedCreatedList.appendChild(li);
    });
  }

  if (completedTodos.length === 0) {
    addEmptyMessage(selectedCompletedList, '선택한 날짜에 완료한 할 일이 없습니다.');
  } else {
    completedTodos.forEach((log) => {
      const dueDateText = log.dueDate ? ` / 마감일 ${log.dueDate}` : '';
      const li = document.createElement('li');
      li.textContent = `[${_getTodoGroupLabel(log)}] ${log.title} (${formatDisplayDateTime(log.completedAt)}${dueDateText})`;
      selectedCompletedList.appendChild(li);
    });
  }

  if (notes.length === 0) {
    addEmptyMessage(selectedCalendarNoteList, '선택한 날짜에 노트/메모가 없습니다.');
  } else {
    notes.forEach((item) => {
      const li = document.createElement('li');
      const rangeText = formatCalendarRange(item.date, item.endDate || item.date);
      li.className = 'selected-note-item';
      if ((item.endDate || item.date) > item.date) {
        li.classList.add('is-range-note');
      }

      const head = document.createElement('div');
      head.className = 'selected-note-head';

      const typeBadge = document.createElement('span');
      typeBadge.className = 'selected-note-type';
      typeBadge.textContent = typeLabel[item.type] || item.type;

      const period = document.createElement('span');
      period.className = 'selected-note-period';
      const days = getRangeDaysInclusive(item.date, item.endDate || item.date);
      period.textContent = days > 1 ? `${rangeText} · ${days}일` : rangeText;

      const text = createSelectedNoteTextNode(item.text);

      head.append(typeBadge, period);
      li.append(head, text);
      selectedCalendarNoteList.appendChild(li);
    });
  }
}

export function isCalendarTodoMode() {
  return runtime.calendarMode === 'todo';
}

export function setCalendarMode(mode) {
  runtime.calendarMode = mode === 'todo' ? 'todo' : 'note';
  applyCalendarFormMode();
}

export function applyCalendarFormMode() {
  const isTodo = isCalendarTodoMode();
  calendarModeButtons.forEach((button) => {
    const buttonMode = button.dataset.calendarMode;
    const isActive = buttonMode === runtime.calendarMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  if (calendarTodoFields) {
    if (isTodo) {
      calendarTodoFields.classList.remove('hidden');
    } else {
      calendarTodoFields.classList.add('hidden');
    }
  }
  if (calendarTextInput) {
    calendarTextInput.classList.toggle('hidden', isTodo);
    calendarTextInput.required = !isTodo;
  }
  if (calendarTodoTitleInput) {
    calendarTodoTitleInput.required = isTodo;
  }
  if (calendarSubmitBtn) {
    calendarSubmitBtn.textContent = isTodo ? '할 일 저장' : '노트 저장';
  }
}

export function addSelectedDateNote() {
  const fallbackDate = state.selectedDate || toLocalIsoDate(new Date());
  const startDate = parseIsoDate(selectedDateNoteStartDate?.value || fallbackDate) || fallbackDate;
  const text = String(selectedDateNoteInput?.value || '').trim();
  const endDate = clampCalendarRangeEnd(startDate, selectedDateNoteEndDate?.value || startDate);
  if (!text) {
    _showToast('메모를 입력해 주세요.', 'error');
    selectedDateNoteInput?.focus();
    return;
  }
  if (!endDate || endDate < startDate) {
    _showToast('종료일을 시작일 이후로 선택해 주세요.', 'error');
    selectedDateNoteEndDate?.focus();
    return;
  }

  state.calendarItems.unshift(_createCalendarItem(startDate, 'note', text, endDate));
  state.selectedDate = startDate;
  if (selectedDateNoteInput) {
    selectedDateNoteInput.value = '';
    selectedDateNoteInput.focus();
  }
  if (selectedDateNoteStartDate) {
    selectedDateNoteStartDate.value = startDate;
  }
  if (selectedDateNoteEndDate) {
    selectedDateNoteEndDate.min = startDate;
    selectedDateNoteEndDate.value = endDate;
  }
  _queueSync();
  _render();
  _showToast(
    startDate === endDate ? '메모를 추가했습니다.' : `장기 일정을 추가했습니다. (${startDate} ~ ${endDate})`,
    'success',
  );
}

export function isCompactCalendarViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(max-width: 760px)').matches;
}

export function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const compactCalendar = isCompactCalendarViewport();
  const yearText = String(year);
  const holidayEntry = HOLIDAYS_BY_YEAR[yearText];
  if (!holidayEntry || holidayEntry.expiresAt <= Date.now()) {
    ensureHolidayDataForYear(year).finally(() => {
      _render();
    });
  }

  const firstDate = new Date(year, month, 1);
  const dayCount = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDate.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + dayCount) / 7) * 7;
  const rangeLaneMap = buildCalendarRangeLaneMap(year, month);

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
    const todayText = toLocalIsoDate(new Date());
    const isTodayDate = dateText === todayText;
    const isSelectedDate = dateText === state.selectedDate;
    const weekendType = getWeekendType(currentDate);
    const holidayLabel = getHolidayLabel(currentDate);
    const isHoliday = Boolean(holidayLabel);

    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', `${month + 1}월 ${dayNumber}일`);

    if (isTodayDate) {
      cell.classList.add('is-today');
      cell.setAttribute('aria-current', 'date');
    } else {
      cell.removeAttribute('aria-current');
    }

    if (weekendType) {
      cell.classList.add(`is-${weekendType}`);
    }
    if (isHoliday) {
      cell.classList.add('is-holiday');
    }

    if (isSelectedDate) {
      cell.classList.add('is-selected', 'is-active');
      cell.setAttribute('aria-selected', 'true');
    } else {
      cell.removeAttribute('aria-selected');
    }

    const dayLabel = document.createElement('p');
    dayLabel.className = 'calendar-day';
    dayLabel.textContent = String(dayNumber);
    cell.appendChild(dayLabel);

    if (isHoliday) {
      const holidayBadge = document.createElement('p');
      holidayBadge.className = 'calendar-holiday';
      holidayBadge.textContent = holidayLabel;
      cell.appendChild(holidayBadge);
    }

    const { scheduledCount, completedCount } = countDailyStats(dateText);
    const dailySummary = document.createElement('p');
    dailySummary.className = 'calendar-summary';
    const summaryLabel = `일정 ${scheduledCount} / 완료 ${completedCount}`;
    dailySummary.textContent = compactCalendar
      ? `일${scheduledCount}/완${completedCount}`
      : summaryLabel;
    const weekendLabel = weekendType === 'saturday' ? ' 토요일' : weekendType === 'sunday' ? ' 일요일' : '';
    const holidayDescription = isHoliday ? `, 공휴일(${holidayLabel})` : '';
    cell.setAttribute(
      'aria-label',
      `${month + 1}월 ${dayNumber}일${weekendLabel}, ${summaryLabel}${holidayDescription}`,
    );
    cell.appendChild(dailySummary);

    const entries = getEntriesForDate(dateText, rangeLaneMap);

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '일정 없음';
      cell.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'calendar-item-list';

      const maxVisibleItems = compactCalendar ? 2 : 3;
      const rangeEntries = entries.filter((entry) => entry.isRange);
      const otherEntries = entries.filter((entry) => !entry.isRange);
      const maxLaneIndex = rangeEntries.reduce(
        (maxLane, entry) => Math.max(maxLane, entry.rangeLane || 0),
        -1,
      );
      const laneSlotCount = Math.min(maxVisibleItems, Math.max(0, maxLaneIndex + 1));
      const laneSlots = Array.from({ length: laneSlotCount }, (_, lane) =>
        rangeEntries.find((entry) => (entry.rangeLane || 0) === lane) || null,
      );
      const visibleOtherEntries = otherEntries.slice(0, Math.max(0, maxVisibleItems - laneSlotCount));
      const visibleEntries = [...laneSlots, ...visibleOtherEntries];
      let renderedRealCount = 0;

      visibleEntries.forEach((entry) => {
        if (!entry) {
          const placeholder = document.createElement('li');
          placeholder.className = 'calendar-item is-range is-range-placeholder';
          list.appendChild(placeholder);
          return;
        }

        renderedRealCount += 1;
        const li = document.createElement('li');
        li.className = `calendar-item ${entry.type === 'note' ? 'is-note' : 'is-todo'}`;
        if (entry.isRange) {
          li.classList.add('is-range', `is-range-${entry.rangePosition}`);
          if (entry.rangePosition !== 'start') {
            li.classList.add('is-range-continuation');
          }
          const isWeekStart = currentDate.getDay() === 1;
          const isWeekEnd = currentDate.getDay() === 0;
          const isMonthStart = dayNumber === 1;
          const isMonthEnd = dayNumber === dayCount;
          if (entry.rangePosition !== 'start' && (isWeekStart || isMonthStart)) {
            li.classList.add('is-range-row-start');
          }
          if (entry.rangePosition !== 'end' && (isWeekEnd || isMonthEnd)) {
            li.classList.add('is-range-row-end');
          }
        }

        const text = document.createElement('span');
        text.className = 'calendar-item-text';
        text.textContent = entry.isRange && entry.rangePosition !== 'start' ? ' ' : entry.text;
        li.title = entry.isRange
          ? `${entry.text} (${entry.startDate} ~ ${entry.endDate})`
          : entry.text;

        if (!entry.isRange) {
          const badge = document.createElement('span');
          badge.className = 'type-badge';
          badge.textContent = typeLabel[entry.type] || entry.type;
          li.appendChild(badge);
        }
        li.appendChild(text);

        if (entry.source === 'calendar' && (!entry.isRange || entry.rangePosition === 'start')) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'calendar-remove';
          removeBtn.textContent = 'x';
          removeBtn.setAttribute('aria-label', '항목 삭제');
          removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            state.calendarItems = state.calendarItems.filter((item) => item.id !== entry.id);
            _render();
            _queueSync(true);
          });
          li.appendChild(removeBtn);
        }

        list.appendChild(li);
      });

      const hiddenCount = entries.length - renderedRealCount;
      if (hiddenCount > 0) {
        const more = document.createElement('li');
        more.className = 'calendar-more';
        more.textContent = `+${hiddenCount}건`;
        list.appendChild(more);
      }

      cell.appendChild(list);
    }

    const selectDate = () => {
      state.selectedDate = dateText;
      state.currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      _render();
      if (calendarDateInput) {
        calendarDateInput.value = dateText;
      }
      if (selectedDateNoteStartDate) {
        selectedDateNoteStartDate.value = dateText;
      }
      if (selectedDateNoteEndDate) {
        selectedDateNoteEndDate.min = dateText;
        selectedDateNoteEndDate.value = dateText;
      }
      if (selectedDateNoteInput) {
        selectedDateNoteInput.focus();
      }
    };
    cell.addEventListener('click', selectDate);
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectDate();
      }
    });

    calendarGrid.appendChild(cell);
  }
}
