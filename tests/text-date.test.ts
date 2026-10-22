import { describe, expect, it } from 'vitest';
import { formatJalali, parseJalali, toJalali } from '../src/lib/date';
import { matchesQuery, normalizeForSearch, parseNum, parseRange } from '../src/lib/text';

describe('persian text', () => {
  it('search ignores ي/ی, ك/ک, spaces and ZWNJ', () => {
    expect(matchesQuery('كتاب ها', 'کتاب‌ها')).toBe(true);
    expect(matchesQuery('علي', 'علی')).toBe(true);
    expect(matchesQuery('صدسال', 'صد سال تنهایی')).toBe(true);
    expect(normalizeForSearch('Ticket to Ride')).toBe('tickettoride');
  });
  it('parses persian digits and ranges', () => {
    expect(parseNum('۱۲۰')).toBe(120);
    expect(parseNum('۲٫۵')).toBe(2.5);
    expect(parseRange('۲-۵')).toEqual({ min: 2, max: 5 });
    expect(parseRange('۲ تا ۴')).toEqual({ min: 2, max: 4 });
  });
});

describe('jalali dates', () => {
  it('converts both ways', () => {
    expect(toJalali(new Date(2023, 9, 22))).toEqual({ jy: 1402, jm: 7, jd: 30 });
    const ts = parseJalali('۱۴۰۲/۰۷/۳۰')!;
    expect(formatJalali(ts)).toBe('۱۴۰۲/۰۷/۳۰');
    expect(parseJalali('1402/12/30')).toBeUndefined(); // 1402 is not leap
    expect(parseJalali('1403/12/30')).toBeDefined();
  });
});
