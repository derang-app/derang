import { fa, toLatinDigits } from './text';

// Jalali ⇄ Gregorian conversion (algorithm from jalaali-js, MIT).

function div(a: number, b: number) {
  return ~~(a / b);
}
function mod(a: number, b: number) {
  return a - ~~(a / b) * b;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
];

function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm = 0;
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm: number;
  let jd: number;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toJalali(date: Date) {
  return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

export function fromJalali(jy: number, jm: number, jd: number): Date {
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  return new Date(gy, gm - 1, gd, 12);
}

export function isValidJalali(jy: number, jm: number, jd: number) {
  if (jy < 1 || jm < 1 || jm > 12 || jd < 1) return false;
  if (jm <= 6) return jd <= 31;
  if (jm <= 11) return jd <= 30;
  return jd <= (jalCal(jy).leap === 0 ? 30 : 29);
}

export const MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

/** ۱۴۰۲/۰۷/۳۰ */
export function formatJalali(ts: number | undefined): string {
  if (ts === undefined) return '';
  const { jy, jm, jd } = toJalali(new Date(ts));
  return fa(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/** ۳۰ مهر */
export function formatDayMonth(ts: number): string {
  const { jm, jd } = toJalali(new Date(ts));
  return `${fa(jd)} ${MONTHS[jm - 1]}`;
}

/** مهر ۱۴۰۲ */
export function formatMonthYear(ts: number): string {
  const { jy, jm } = toJalali(new Date(ts));
  return `${MONTHS[jm - 1]} ${fa(jy)}`;
}

/** Parse "1402/07/30" (any digits); returns a timestamp at local noon or undefined. */
export function parseJalali(value: string): number | undefined {
  const m = toLatinDigits(value).trim().match(/^(\d{3,4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return undefined;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidJalali(jy, jm, jd)) return undefined;
  return fromJalali(jy, jm, jd).getTime();
}

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of the Persian week (Saturday). */
export function startOfWeek(ts: number) {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 1) % 7; // Sat=0 … Fri=6
  return d.getTime() - offset * DAY;
}

export function startOfJalaliMonth(ts: number) {
  const { jy, jm } = toJalali(new Date(ts));
  return startOfDay(fromJalali(jy, jm, 1).getTime());
}

export function startOfJalaliYear(ts: number) {
  const { jy } = toJalali(new Date(ts));
  return startOfDay(fromJalali(jy, 1, 1).getTime());
}

export const WEEKDAYS_SHORT = ['شنبه', '۱ش', '۲ش', '۳ش', '۴ش', '۵ش', 'جمعه'];

/** «۳ روز پیش», «دیروز», «امروز» */
export function relativeDays(ts: number | undefined, nowTs = Date.now()): string {
  if (ts === undefined) return '';
  const days = Math.round((startOfDay(nowTs) - startOfDay(ts)) / DAY);
  if (days <= 0) return 'امروز';
  if (days === 1) return 'دیروز';
  if (days < 7) return `${fa(days)} روز پیش`;
  if (days < 30) return `${fa(Math.floor(days / 7))} هفته پیش`;
  if (days < 365) return `${fa(Math.floor(days / 30))} ماه پیش`;
  return `${fa(Math.floor(days / 365))} سال پیش`;
}

export { DAY };
