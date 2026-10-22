import { ME, type Familiarity, type GameCopy, type GameWork, type Player, type Session } from '../db/types';
import { fa, formatRange } from './text';
import { FAMILIARITY, MOODS } from './vocab';

export type TimeWindow = 'short' | 'medium' | 'long';

export const TIME_WINDOWS: Record<TimeWindow, { label: string; limit: number }> = {
  short: { label: 'کمتر از ۳۰ دقیقه', limit: 30 },
  medium: { label: '۳۰ تا ۶۰ دقیقه', limit: 60 },
  long: { label: 'بیش از یک ساعت', limit: Infinity },
};

export interface PickerInput {
  players: number;
  time: TimeWindow;
  familiarity: Familiarity;
  /** Mood keys from MOODS. Empty = no preference. */
  moods: string[];
  /** Co-players present (observable preferences only). */
  playerIds: string[];
}

export interface PickerGame {
  copy: GameCopy;
  work?: GameWork;
  sessions: Session[];
}

export interface Candidate {
  game: PickerGame;
  score: number;
  reasons: string[];
  cautions: string[];
}

export type ExcludeReason = 'players' | 'time' | 'complexity' | 'mood';

export interface Relaxation {
  label: string;
  input: PickerInput;
  count: number;
}

export interface PickerResult {
  matches: Candidate[];
  /** Games that cannot be judged because stored data is missing. */
  incomplete: { game: PickerGame; missing: string[] }[];
  excluded: Record<ExcludeReason, number>;
  considered: number;
}

const DAY = 86_400_000;

function moodTags(keys: string[]) {
  return MOODS.filter((m) => keys.includes(m.key));
}

/** Rough expected duration: the upper bound when known (unknown is never assumed to fit). */
export function expectedDuration(work?: GameWork): number | undefined {
  return work?.playTimeMax ?? work?.playTimeMin;
}

export function pickGames(
  games: PickerGame[],
  input: PickerInput,
  people: Player[] = [],
  nowTs = Date.now(),
): PickerResult {
  const excluded: Record<ExcludeReason, number> = { players: 0, time: 0, complexity: 0, mood: 0 };
  const matches: Candidate[] = [];
  const incomplete: PickerResult['incomplete'] = [];
  const present = people.filter((p) => input.playerIds.includes(p.id));
  const moods = moodTags(input.moods);
  const owned = games.filter((g) => g.copy.owned);

  for (const game of owned) {
    const w = game.work;
    const missing: string[] = [];
    const reasons: string[] = [];
    const cautions: string[] = [];
    let failed: ExcludeReason | undefined;
    let score = 0;
    const n = input.players;

    // Allowed player count is a hard limit.
    if (w?.minPlayers === undefined && w?.maxPlayers === undefined) {
      missing.push('تعداد بازیکن مجاز');
    } else {
      const min = w.minPlayers ?? w.maxPlayers!;
      const max = w.maxPlayers ?? w.minPlayers!;
      if (n < min || n > max) failed ??= 'players';
      else reasons.push(`برای ${formatRange(min, max)} نفر طراحی شده و شما ${fa(n)} نفرید.`);
    }

    // Unknown duration is never assumed to fit.
    const duration = expectedDuration(w);
    if (duration === undefined) missing.push('زمان بازی');
    else if (duration > TIME_WINDOWS[input.time].limit) failed ??= 'time';
    else reasons.push(`حدود ${formatRange(w?.playTimeMin, w?.playTimeMax)} دقیقه؛ در زمانی که دارید جا می‌شود.`);

    const maxComplexity = FAMILIARITY[input.familiarity].maxComplexity;
    if (w?.complexity === undefined) cautions.push('پیچیدگی یادگیری ثبت نشده است.');
    else if (w.complexity > maxComplexity) failed ??= 'complexity';
    else reasons.push(`پیچیدگی ${fa(w.complexity)} از ۵ با آشنایی جمع می‌خواند.`);

    const tags = w?.tags ?? [];
    if (moods.length) {
      const hit = moods.filter((m) => m.tags.some((t) => tags.includes(t)));
      if (!tags.length) missing.push('سبک بازی');
      else if (!hit.length) failed ??= 'mood';
      else {
        score += hit.length * 2;
        reasons.push(`سبک ${hit.map((m) => `«${m.label}»`).join(' و ')} که خواستید.`);
      }
    }

    if (failed) {
      excluded[failed]++;
      continue;
    }
    if (missing.length) {
      incomplete.push({ game, missing });
      continue;
    }

    if (game.copy.favoritePlayers.includes(n)) {
      score += 3;
      reasons.push(`طبق تجربهٔ خودت، با ${fa(n)} نفر بیشتر لذت می‌برید.`);
    }
    if (w?.recommendedPlayers.includes(n)) {
      score += 1.5;
      reasons.push(`تعداد پیشنهادی منبع برای این بازی ${fa(n)} نفر است.`);
    }
    if (game.copy.rating) {
      score += game.copy.rating * 0.6;
      reasons.push(`امتیاز خودت: ${fa(game.copy.rating)} از ۵.`);
    }

    for (const p of present) {
      const liked = p.likes.filter((t) => tags.includes(t));
      const disliked = p.dislikes.filter((t) => tags.includes(t));
      if (liked.length) {
        score += 1;
        reasons.push(`${p.name} بازی‌های ${liked.map((t) => `«${t}»`).join('، ')} را دوست دارد.`);
      }
      if (disliked.length) {
        score -= 1.5;
        cautions.push(`${p.name} معمولاً ${disliked.map((t) => `«${t}»`).join('، ')} را دوست ندارد.`);
      }
      const playedBefore = game.sessions.some((s) => s.playerIds.includes(p.id));
      if (playedBefore) score += 0.3;
      else if (input.familiarity === 'new' && (w?.complexity ?? 0) >= 2.5) {
        cautions.push(`${p.name} هنوز این بازی را با تو بازی نکرده؛ توضیح قوانین وقت می‌برد.`);
      }
    }

    const last = game.sessions.reduce((m, s) => Math.max(m, s.at), 0);
    if (!last) {
      score += 0.5;
      reasons.push('هنوز جلسه‌ای از این بازی ثبت نکرده‌ای.');
    } else if (nowTs - last > 60 * DAY) {
      score += 0.5;
      reasons.push('مدتی است سراغش نرفته‌اید.');
    }

    matches.push({ game, score, reasons, cautions });
  }

  matches.sort((a, b) => b.score - a.score || a.game.copy.name.localeCompare(b.game.copy.name, 'fa'));
  return { matches, incomplete, excluded, considered: owned.length };
}

/** Filter changes that would produce results. Never applied automatically. */
export function suggestRelaxations(
  games: PickerGame[],
  input: PickerInput,
  people: Player[] = [],
  nowTs = Date.now(),
): Relaxation[] {
  const options: { label: string; input: PickerInput }[] = [];
  if (input.time === 'short') options.push({ label: 'زمان ۳۰ تا ۶۰ دقیقه', input: { ...input, time: 'medium' } });
  if (input.time !== 'long') options.push({ label: 'زمان بیش از یک ساعت', input: { ...input, time: 'long' } });
  if (input.moods.length) options.push({ label: 'بدون محدودیت سبک', input: { ...input, moods: [] } });
  if (input.familiarity === 'new') options.push({ label: 'بازی‌های کمی پیچیده‌تر', input: { ...input, familiarity: 'familiar' } });
  if (input.familiarity === 'familiar') options.push({ label: 'بازی‌های سنگین هم مجاز', input: { ...input, familiarity: 'gamer' } });
  return options
    .map((o) => ({ ...o, count: pickGames(games, o.input, people, nowTs).matches.length }))
    .filter((o) => o.count > 0);
}

/** A plain-language account of why nothing matched. */
export function explainEmpty(result: PickerResult, input: PickerInput): string {
  if (result.considered === 0) return 'هنوز هیچ بازی‌ای در مجموعه‌ات (به‌جز فهرست علاقه‌مندی) ثبت نشده است.';
  const parts: string[] = [];
  const e = result.excluded;
  if (e.players) parts.push(`${fa(e.players)} بازی برای ${fa(input.players)} نفر مجاز نیست`);
  if (e.time) parts.push(`${fa(e.time)} بازی بیشتر از «${TIME_WINDOWS[input.time].label}» طول می‌کشد`);
  if (e.complexity) parts.push(`${fa(e.complexity)} بازی برای «${FAMILIARITY[input.familiarity].label}» سنگین است`);
  if (e.mood) parts.push(`${fa(e.mood)} بازی با سبک انتخابی نمی‌خواند`);
  if (result.incomplete.length) parts.push(`${fa(result.incomplete.length)} بازی اطلاعات کافی ندارد`);
  return `از ${fa(result.considered)} بازی مجموعه‌ات، ${parts.join('، ')}.`;
}

export const meId = ME;
