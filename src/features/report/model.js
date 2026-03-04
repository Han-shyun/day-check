export const BUCKET_CHART_COLORS = [
  '#2f6fcc',
  '#e06820',
  '#1a8a48',
  '#c8362c',
  '#7b5ea7',
  '#c49b0a',
  '#2a8fa0',
  '#b03a7a',
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function computeWeeklyKpi(doneLog, todos, weekStart, weekEnd, lastWeekStart, lastWeekEnd) {
  const weeklyDone = doneLog.filter((item) => {
    const d = new Date(item.completedAt);
    return d >= weekStart && d <= weekEnd;
  });
  const lastWeeklyDone = doneLog.filter((item) => {
    const d = new Date(item.completedAt);
    return d >= lastWeekStart && d <= lastWeekEnd;
  });

  const done = weeklyDone.length;
  const pending = todos.length;
  const total = done + pending;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  const wow = done - lastWeeklyDone.length;

  return { rate, done, pending, wow };
}

export function computeBucketDistribution(todos, getBucketLabel) {
  const counts = {};
  todos.forEach((todo) => {
    const bucket = todo.bucket || 'bucket4';
    counts[bucket] = (counts[bucket] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([bucket, count]) => ({ bucket, label: getBucketLabel(bucket), count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function computeDailyCompletions(doneLog, weekStart) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { date: d, count: 0, label: DAY_LABELS[i] };
  });

  const weekEndMs = days[6].date.getTime() + 24 * 60 * 60 * 1000 - 1;
  doneLog.forEach((item) => {
    const d = new Date(item.completedAt);
    const ms = d.getTime();
    if (ms < weekStart.getTime() || ms > weekEndMs) {
      return;
    }
    const dayIdx = Math.floor((ms - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    if (dayIdx >= 0 && dayIdx < 7) {
      days[dayIdx].count++;
    }
  });

  return days;
}
