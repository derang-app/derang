import { describe, expect, it } from 'vitest';
import type { GameCopy, GameWork, Player } from '../src/db/types';
import { explainEmpty, pickGames, suggestRelaxations, type PickerGame, type PickerInput } from '../src/lib/picker';

let n = 0;
function game(name: string, w: Partial<GameWork>, c: Partial<GameCopy> = {}): PickerGame {
  const id = String(++n);
  return {
    copy: { id, workId: 'w' + id, name, photoIds: [], owned: true, favoritePlayers: [], matchStatus: 'unidentified', provenance: {}, createdAt: 0, updatedAt: 0, ...c },
    work: { id: 'w' + id, altNames: [], recommendedPlayers: [], tags: [], provenance: {}, createdAt: 0, updatedAt: 0, ...w },
    sessions: [],
  };
}

const base: PickerInput = { players: 3, time: 'medium', familiarity: 'familiar', moods: [], playerIds: [] };

describe('what should we play', () => {
  const azul = game('آزول', { minPlayers: 2, maxPlayers: 4, playTimeMin: 30, playTimeMax: 45, complexity: 1.8, tags: ['استراتژی', 'خانوادگی'] });
  const codenames = game('کدنیمز', { minPlayers: 4, maxPlayers: 8, playTimeMax: 15, complexity: 1.3, tags: ['مهمانی', 'تیمی'] });
  const brass = game('برس', { minPlayers: 2, maxPlayers: 4, playTimeMax: 120, complexity: 3.9, tags: ['استراتژی'] });
  const noTime = game('بی‌زمان', { minPlayers: 2, maxPlayers: 6, complexity: 2 });
  const wish = game('آرزو', { minPlayers: 1, maxPlayers: 5, playTimeMax: 20 }, { owned: false });
  const all = [azul, codenames, brass, noTime, wish];

  it('respects allowed player count as a hard limit', () => {
    const r = pickGames(all, { ...base, players: 3 });
    expect(r.matches.map((m) => m.game.copy.name)).toEqual(['آزول']);
    expect(r.excluded.players).toBe(1); // codenames needs 4+
  });

  it('never assumes unknown play time fits', () => {
    const r = pickGames(all, { ...base, time: 'long' });
    expect(r.matches.map((m) => m.game.copy.name)).not.toContain('بی‌زمان');
    expect(r.incomplete.map((i) => i.game.copy.name)).toContain('بی‌زمان');
    expect(r.incomplete[0].missing).toContain('زمان بازی');
  });

  it('ignores wishlist games and filters by complexity and mood', () => {
    const r = pickGames(all, { ...base, players: 4, time: 'long', familiarity: 'new', moods: ['strategy'] });
    expect(r.matches.map((m) => m.game.copy.name)).toEqual(['آزول']);
    expect(r.excluded.complexity).toBe(1); // brass too heavy for newcomers
    expect(r.matches.some((m) => m.game.copy.name === 'آرزو')).toBe(false);
  });

  it('gives concrete reasons based on stored data and co-players', () => {
    const maryam: Player = { id: 'p1', name: 'مریم', likes: ['خانوادگی'], dislikes: [], createdAt: 0, updatedAt: 0 };
    const fav = game('فاو', { minPlayers: 2, maxPlayers: 4, playTimeMax: 30, complexity: 2, tags: ['خانوادگی'] }, { favoritePlayers: [3], rating: 5 });
    const r = pickGames([azul, fav], { ...base, playerIds: ['p1'] }, [maryam]);
    expect(r.matches[0].game.copy.name).toBe('فاو');
    const reasons = r.matches[0].reasons.join(' ');
    expect(reasons).toContain('طبق تجربهٔ خودت');
    expect(reasons).toContain('مریم');
    expect(reasons).toContain('۲ تا ۴');
  });

  it('explains empty results and only suggests relaxations that would help', () => {
    const input: PickerInput = { ...base, players: 3, time: 'short', familiarity: 'familiar', moods: ['strategy'] };
    const r = pickGames(all, input);
    expect(r.matches).toHaveLength(0);
    expect(explainEmpty(r, input)).toContain('طول می‌کشد');
    const relax = suggestRelaxations(all, input);
    expect(relax.map((x) => x.label)).toContain('زمان ۳۰ تا ۶۰ دقیقه');
    expect(relax.every((x) => x.count > 0)).toBe(true);
    // The input itself is untouched.
    expect(input.time).toBe('short');
  });
});
