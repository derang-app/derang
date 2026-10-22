import type { BookCopy, ReadingLog, Session } from '../db/types';
import { DAY, fromJalali, MONTHS, startOfDay, startOfJalaliMonth, startOfJalaliYear, startOfWeek, toJalali } from './date';
import { fa } from './text';

export type Period = 'week' | 'month' | 'year';

export function periodStart(period: Period, ts = Date.now()) {
  if (period === 'week') return startOfWeek(ts);
  if (period === 'month') return startOfJalaliMonth(ts);
  return startOfJalaliYear(ts);
}

export function pagesRead(logs: ReadingLog[], from: number, to = Infinity) {
  return logs
    .filter((l) => l.at >= from && l.at < to)
    .reduce((sum, l) => sum + Math.max(0, l.toPage - l.fromPage), 0);
}

export interface Bar {
  label: string;
  value: number;
  current: boolean;
}

/** Pages per bucket for the period chart: 7 weekdays, ~5 weeks, or 12 months. */
export function readingBars(logs: ReadingLog[], period: Period, ts = Date.now()): Bar[] {
  const start = periodStart(period, ts);
  if (period === 'week') {
    const labels = ['شنبه', '۱ش', '۲ش', '۳ش', '۴ش', '۵ش', 'جمعه'];
    const today = Math.floor((ts - start) / DAY);
    return labels.map((label, i) => ({
      label,
      value: pagesRead(logs, start + i * DAY, start + (i + 1) * DAY),
      current: i === today,
    }));
  }
  if (period === 'month') {
    const bars: Bar[] = [];
    for (let i = 0; i < 5; i++) {
      const from = start + i * 7 * DAY;
      bars.push({
        label: `هفته ${fa(i + 1)}`,
        value: pagesRead(logs, from, from + 7 * DAY),
        current: ts >= from && ts < from + 7 * DAY,
      });
    }
    return bars;
  }
  const { jy, jm } = toJalali(new Date(ts));
  return MONTHS.map((m, i) => {
    const from = startOfDay(fromJalali(jy, i + 1, 1).getTime());
    const to = startOfDay((i === 11 ? fromJalali(jy + 1, 1, 1) : fromJalali(jy, i + 2, 1)).getTime());
    return { label: m.slice(0, 3), value: pagesRead(logs, from, to), current: i + 1 === jm };
  });
}

export function finishedIn(copies: BookCopy[], from: number, to = Infinity) {
  return copies.filter((c) => c.status === 'read' && c.finishedAt !== undefined && c.finishedAt >= from && c.finishedAt < to);
}

export function sessionsIn(sessions: Session[], from: number, to = Infinity) {
  return sessions.filter((s) => s.at >= from && s.at < to);
}

export interface WinStats {
  wins: number;
  losses: number;
  draws: number;
  unknown: number;
  total: number;
  rate: number;
}

export function winStats(sessions: Session[]): WinStats {
  const s = { wins: 0, losses: 0, draws: 0, unknown: 0 };
  for (const x of sessions) {
    if (x.result === 'win') s.wins++;
    else if (x.result === 'loss') s.losses++;
    else if (x.result === 'draw') s.draws++;
    else s.unknown++;
  }
  const total = sessions.length;
  const decided = s.wins + s.losses + s.draws;
  return { ...s, total, rate: decided ? Math.round((s.wins / decided) * 100) : 0 };
}
