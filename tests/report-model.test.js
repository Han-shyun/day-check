import { describe, expect, it } from 'vitest';

import {
  computeWeeklyKpi,
  computeBucketDistribution,
  computeDailyCompletions,
} from '../src/features/report/model.js';

import { startOfWeek, endOfWeek } from '../src/core/date-utils.js';

const makeCompleted = (offsetDays = 0, bucket = 'bucket1') => {
  const d = new Date();
  const weekStart = startOfWeek(d);
  weekStart.setDate(weekStart.getDate() + offsetDays);
  return { completedAt: weekStart.toISOString(), bucket };
};

const makeTodo = (bucket = 'bucket1') => ({ id: crypto.randomUUID(), title: 'T', bucket });

describe('computeWeeklyKpi', () => {
  it('returns zero rate when no todos or done', () => {
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    const lastWeekEnd = new Date(weekStart.getTime() - 1);
    const lastWeekStart = startOfWeek(lastWeekEnd);
    const kpi = computeWeeklyKpi([], [], weekStart, weekEnd, lastWeekStart, lastWeekEnd);
    expect(kpi.rate).toBe(0);
    expect(kpi.done).toBe(0);
    expect(kpi.pending).toBe(0);
    expect(kpi.wow).toBe(0);
  });

  it('calculates rate correctly', () => {
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    const lastWeekEnd = new Date(weekStart.getTime() - 1);
    const lastWeekStart = startOfWeek(lastWeekEnd);
    const doneLog = [makeCompleted(0), makeCompleted(1)];
    const todos = [makeTodo(), makeTodo(), makeTodo()];
    const kpi = computeWeeklyKpi(doneLog, todos, weekStart, weekEnd, lastWeekStart, lastWeekEnd);
    expect(kpi.done).toBe(2);
    expect(kpi.pending).toBe(3);
    expect(kpi.rate).toBe(40);
  });

  it('reports positive wow when this week beats last week', () => {
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    const lastWeekEnd = new Date(weekStart.getTime() - 1);
    const lastWeekStart = startOfWeek(lastWeekEnd);
    const lastWeekItem = { completedAt: new Date(lastWeekStart.getTime() + 3600000).toISOString(), bucket: 'bucket1' };
    const doneLog = [makeCompleted(0), makeCompleted(1), makeCompleted(2), lastWeekItem];
    const kpi = computeWeeklyKpi(doneLog, [], weekStart, weekEnd, lastWeekStart, lastWeekEnd);
    expect(kpi.done).toBe(3);
    expect(kpi.wow).toBe(2);
  });
});

describe('computeBucketDistribution', () => {
  it('returns empty array for empty todos', () => {
    expect(computeBucketDistribution([], (b) => b)).toEqual([]);
  });

  it('counts by bucket and sorts descending', () => {
    const todos = [
      makeTodo('bucket1'),
      makeTodo('bucket1'),
      makeTodo('bucket2'),
    ];
    const dist = computeBucketDistribution(todos, (b) => b);
    expect(dist[0].bucket).toBe('bucket1');
    expect(dist[0].count).toBe(2);
    expect(dist[1].bucket).toBe('bucket2');
    expect(dist[1].count).toBe(1);
  });
});

describe('computeDailyCompletions', () => {
  it('returns 7 entries (Mon-Sun)', () => {
    const weekStart = startOfWeek(new Date());
    const result = computeDailyCompletions([], weekStart);
    expect(result).toHaveLength(7);
    expect(result[0].label).toBe('Mon');
    expect(result[6].label).toBe('Sun');
  });

  it('counts completions per day', () => {
    const weekStart = startOfWeek(new Date());
    const mondayItem = { completedAt: new Date(weekStart.getTime() + 3600000).toISOString() };
    const wednesdayItem = { completedAt: new Date(weekStart.getTime() + 2 * 24 * 3600000 + 3600000).toISOString() };
    const result = computeDailyCompletions([mondayItem, wednesdayItem], weekStart);
    expect(result[0].count).toBe(1);
    expect(result[1].count).toBe(0);
    expect(result[2].count).toBe(1);
  });

  it('ignores items outside the current week', () => {
    const weekStart = startOfWeek(new Date());
    const outsideItem = { completedAt: new Date(weekStart.getTime() - 24 * 3600000).toISOString() };
    const result = computeDailyCompletions([outsideItem], weekStart);
    expect(result.every((d) => d.count === 0)).toBe(true);
  });
});
