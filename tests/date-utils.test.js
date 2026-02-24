import { describe, expect, it } from 'vitest';

import { parseIsoDate, toLocalIsoDate } from '../src/core/date-utils.js';

describe('date-utils', () => {
  it('converts timezone timestamps to local YYYY-MM-DD', () => {
    const value = '2026-01-01T00:30:00+14:00';
    const expected = toLocalIsoDate(new Date(value));
    expect(parseIsoDate(value)).toBe(expected);
  });

  it('keeps date-only input unchanged', () => {
    expect(parseIsoDate('2026-05-10')).toBe('2026-05-10');
  });

  it('parses compact YYYYMMDD input', () => {
    expect(parseIsoDate('20260510')).toBe('2026-05-10');
  });
});

