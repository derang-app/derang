import type { Edition, Familiarity, Interaction, ReadStatus } from '../db/types';

/** Standard game style tags. Users may add their own free-form tags too. */
export const GAME_TAGS = [
  'همکاری',
  'رقابتی',
  'بلوف',
  'استراتژی',
  'مهمانی',
  'فکری',
  'خانوادگی',
  'تیمی',
  'کارتی',
  'تاس',
  'کلمات',
  'سرعتی',
] as const;

export interface Mood {
  key: string;
  label: string;
  icon: string;
  /** Tags any of which satisfy this mood. */
  tags: string[];
}

export const MOODS: Mood[] = [
  { key: 'coop', label: 'همکاری', icon: 'fa-handshake', tags: ['همکاری', 'تیمی'] },
  { key: 'competitive', label: 'رقابتی', icon: 'fa-trophy', tags: ['رقابتی'] },
  { key: 'bluff', label: 'بلوف', icon: 'fa-masks-theater', tags: ['بلوف'] },
  { key: 'strategy', label: 'استراتژیک', icon: 'fa-chess', tags: ['استراتژی'] },
  { key: 'party', label: 'مهمانی', icon: 'fa-champagne-glasses', tags: ['مهمانی'] },
  { key: 'brain', label: 'فکری', icon: 'fa-puzzle-piece', tags: ['فکری'] },
];

export const EDITION_LABEL: Record<Edition, string> = {
  copy: 'کپی',
  redesign: 'ریدیزاین',
  original: 'اورجینال',
  unknown: 'نامشخص',
};

export const STATUS_LABEL: Record<ReadStatus, string> = {
  unread: 'نخوانده',
  reading: 'در حال مطالعه',
  read: 'خوانده‌شده',
};

export const FAMILIARITY: Record<Familiarity, { label: string; hint: string; icon: string; maxComplexity: number }> = {
  new: { label: 'آماتور و تازه‌کار', hint: 'بازی‌های ساده با یادگیری سریع', icon: 'fa-seedling', maxComplexity: 2 },
  familiar: { label: 'آشنا و با تجربه', hint: 'قوانین متوسط را به راحتی درک می‌کنند', icon: 'fa-user-check', maxComplexity: 3.5 },
  gamer: { label: 'حرفه‌ای (Gamer)', hint: 'علاقه به استراتژی‌های پیچیده و سنگین', icon: 'fa-brain', maxComplexity: 5 },
};

export const INTERACTION_LABEL: Record<Interaction, string> = {
  low: 'تعامل کم',
  medium: 'تعامل متوسط',
  high: 'تعامل زیاد',
};

/** Complexity scale 1–5. */
export function complexityLabel(value: number | undefined): string {
  if (value === undefined) return 'نامشخص';
  if (value < 1.5) return 'بسیار ساده';
  if (value < 2.5) return 'ساده';
  if (value < 3.5) return 'متوسط';
  if (value < 4.25) return 'سنگین';
  return 'خیلی پیچیده';
}

export const READING_MOODS = ['متفکر', 'امیدوار', 'غمگین', 'هیجان‌زده', 'آرام', 'الهام‌گرفته'];

export const PLAYER_COUNT_LABEL = ['', 'تک نفره', 'دو نفره', 'سه نفره', 'چهار نفره', 'پنج نفره'];
