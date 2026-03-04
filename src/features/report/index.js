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
  reportKpiRateEl,
  reportKpiDoneEl,
  reportKpiPendingEl,
  reportKpiWowEl,
  reportDonutChartEl,
  reportBarChartEl,
} from '../../core/dom-refs.js';
import {
  BUCKET_CHART_COLORS,
  computeWeeklyKpi,
  computeBucketDistribution,
  computeDailyCompletions,
} from './model.js';

let _addEmptyMessage = () => {};
let _sortTodos = (list) => list;
let _getTodoGroupLabel = (todo) => todo?.title || '';
let _getBucketLabel = (bucket) => bucket;
let _queueSync = () => {};

export function initReportDeps({ addEmptyMessage, sortTodos, getTodoGroupLabel, getBucketLabel, queueSync } = {}) {
  if (typeof addEmptyMessage === 'function') {
    _addEmptyMessage = addEmptyMessage;
  }
  if (typeof sortTodos === 'function') {
    _sortTodos = sortTodos;
  }
  if (typeof getTodoGroupLabel === 'function') {
    _getTodoGroupLabel = getTodoGroupLabel;
  }
  if (typeof getBucketLabel === 'function') {
    _getBucketLabel = getBucketLabel;
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

function renderKpiCards(kpi) {
  if (reportKpiRateEl) {
    reportKpiRateEl.textContent = `${kpi.rate}%`;
  }
  if (reportKpiDoneEl) {
    reportKpiDoneEl.textContent = String(kpi.done);
  }
  if (reportKpiPendingEl) {
    reportKpiPendingEl.textContent = String(kpi.pending);
  }
  if (reportKpiWowEl) {
    const sign = kpi.wow > 0 ? '+' : '';
    reportKpiWowEl.textContent = `${sign}${kpi.wow}`;
    reportKpiWowEl.dataset.trend = kpi.wow > 0 ? 'up' : kpi.wow < 0 ? 'down' : 'flat';
  }
}

function renderDonutChart(distribution) {
  if (!reportDonutChartEl) {
    return;
  }
  reportDonutChartEl.innerHTML = '';

  const total = distribution.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No pending tasks';
    reportDonutChartEl.appendChild(empty);
    return;
  }

  const R = 40;
  const CX = 50;
  const CY = 50;
  const SW = 14;
  const C = 2 * Math.PI * R;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'donut-svg');

  const bg = document.createElementNS(svgNS, 'circle');
  bg.setAttribute('cx', String(CX));
  bg.setAttribute('cy', String(CY));
  bg.setAttribute('r', String(R));
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', 'var(--line)');
  bg.setAttribute('stroke-width', String(SW));
  svg.appendChild(bg);

  let offset = 0;
  distribution.forEach((item, i) => {
    const dash = (item.count / total) * C;
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', String(CX));
    circle.setAttribute('cy', String(CY));
    circle.setAttribute('r', String(R));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', BUCKET_CHART_COLORS[i % BUCKET_CHART_COLORS.length]);
    circle.setAttribute('stroke-width', String(SW));
    circle.setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${C.toFixed(2)}`);
    circle.setAttribute('stroke-dashoffset', (-offset).toFixed(2));
    circle.setAttribute('transform', `rotate(-90 ${CX} ${CY})`);
    svg.appendChild(circle);
    offset += dash;
  });

  reportDonutChartEl.appendChild(svg);

  const legend = document.createElement('ul');
  legend.className = 'donut-legend';
  distribution.forEach((item, i) => {
    const pct = Math.round((item.count / total) * 100);
    const li = document.createElement('li');
    li.className = 'donut-legend-item';
    const dot = document.createElement('span');
    dot.className = 'donut-legend-dot';
    dot.style.background = BUCKET_CHART_COLORS[i % BUCKET_CHART_COLORS.length];
    li.appendChild(dot);
    li.appendChild(document.createTextNode(`${item.label} ${item.count} (${pct}%)`));
    legend.appendChild(li);
  });
  reportDonutChartEl.appendChild(legend);
}

function renderBarChart(days) {
  if (!reportBarChartEl) {
    return;
  }
  reportBarChartEl.innerHTML = '';

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  const wrap = document.createElement('div');
  wrap.className = 'bar-chart';

  days.forEach((day) => {
    const item = document.createElement('div');
    item.className = 'bar-item';

    const barWrap = document.createElement('div');
    barWrap.className = 'bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.setProperty('--bar-h', `${Math.round((day.count / maxCount) * 100)}%`);
    if (day.count > 0) {
      bar.setAttribute('title', String(day.count));
    }

    barWrap.appendChild(bar);

    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = day.label;

    const count = document.createElement('span');
    count.className = 'bar-count';
    count.textContent = day.count > 0 ? String(day.count) : '';

    item.appendChild(barWrap);
    item.appendChild(label);
    item.appendChild(count);
    wrap.appendChild(item);
  });

  reportBarChartEl.appendChild(wrap);
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

  const lastWeekEnd = new Date(weekStart.getTime() - 1);
  const lastWeekStart = startOfWeek(lastWeekEnd);

  weekRangeEl.textContent = `${weekStartText} ~ ${weekEndText}`;

  const weeklyDone = state.doneLog
    .filter((item) => inCurrentWeek(item.completedAt))
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const weeklyPending = _sortTodos(state.todos);

  const kpi = computeWeeklyKpi(state.doneLog, state.todos, weekStart, weekEnd, lastWeekStart, lastWeekEnd);
  renderKpiCards(kpi);

  const distribution = computeBucketDistribution(state.todos, _getBucketLabel);
  renderDonutChart(distribution);

  const dailyCompletions = computeDailyCompletions(state.doneLog, weekStart);
  renderBarChart(dailyCompletions);

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
