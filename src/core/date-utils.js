export function toLocalIsoDate(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(isoText) {
  if (!isoText) {
    return '';
  }

  const normalized = String(isoText).trim();
  if (!normalized) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return toLocalIsoDate(parsed);
  }

  const match = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function clampCalendarRangeEnd(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start) {
    return '';
  }
  if (!end || end < start) {
    return start;
  }
  return end;
}

export function isDateInCalendarRange(targetDate, startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = clampCalendarRangeEnd(start, endDate || start);
  const target = parseIsoDate(targetDate);
  if (!start || !end || !target) {
    return false;
  }
  return target >= start && target <= end;
}

export function formatCalendarRange(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = clampCalendarRangeEnd(start, endDate || start);
  if (!start) {
    return '';
  }
  return start === end ? start : `${start} ~ ${end}`;
}

export function getRangeDaysInclusive(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = clampCalendarRangeEnd(start, endDate || start);
  if (!start || !end) {
    return 1;
  }
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  return Math.max(1, Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1);
}

export function formatDisplayDate(isoText) {
  if (!isoText) {
    return '-';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(isoText));
}

export function formatDisplayDateTime(isoText) {
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

export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function inCurrentWeek(isoDateText) {
  const target = new Date(isoDateText);
  return target >= startOfWeek(new Date()) && target <= endOfWeek(new Date());
}
