import { db, newId, now } from './db';
import { withProvenance } from './provenance';
import type { Edition, GameCopy, GameWork, Interaction, MyResult, Player, Session, Source } from './types';

export interface NewGameInput {
  name: string;
  edition?: Edition;
  brand?: string;
  owned?: boolean;
  photoIds?: string[];
  favoritePlayers?: number[];
  rating?: number;
  notes?: string;
  /** Original game name and other names it's known by. */
  workName?: string;
  altNames?: string[];
  /** Specs of the original game (shared by all copies of it). */
  minPlayers?: number;
  maxPlayers?: number;
  recommendedPlayers?: number[];
  playTimeMin?: number;
  playTimeMax?: number;
  complexity?: number;
  interaction?: Interaction;
  tags?: string[];
  bggId?: string;
  refUrl?: string;
  /** Origin of the specs above: typed by me, or read from the rulebook. */
  specsSource?: Source;
  workId?: string;
}

function provFor(values: Record<string, unknown>, source: Source): Record<string, Source> {
  const prov: Record<string, Source> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) prov[k] = source;
  }
  return prov;
}

export async function createGame(input: NewGameInput): Promise<GameCopy> {
  const t = now();
  return db.transaction('rw', db.gameWorks, db.gameCopies, async () => {
    let workId = input.workId;
    if (!workId) {
      const specs = {
        minPlayers: input.minPlayers,
        maxPlayers: input.maxPlayers,
        recommendedPlayers: input.recommendedPlayers ?? [],
        playTimeMin: input.playTimeMin,
        playTimeMax: input.playTimeMax,
        complexity: input.complexity,
        interaction: input.interaction,
        tags: input.tags ?? [],
      };
      const links = { bggId: input.bggId, refUrl: input.refUrl };
      const names = { name: input.workName?.trim() || undefined, altNames: input.altNames ?? [] };
      const work: GameWork = {
        id: newId(),
        ...names,
        ...specs,
        ...links,
        provenance: {
          ...provFor(specs, input.specsSource ?? 'manual'),
          ...provFor({ ...links, ...names }, 'manual'),
        },
        createdAt: t,
        updatedAt: t,
      };
      await db.gameWorks.add(work);
      workId = work.id;
    }
    const copy: GameCopy = {
      id: newId(),
      workId,
      name: input.name.trim(),
      photoIds: input.photoIds ?? [],
      edition: input.edition,
      brand: input.brand?.trim() || undefined,
      owned: input.owned ?? true,
      favoritePlayers: input.favoritePlayers ?? [],
      rating: input.rating,
      notes: input.notes?.trim() || undefined,
      matchStatus: 'unidentified',
      provenance: provFor(
        { name: input.name, edition: input.edition, brand: input.brand?.trim() || undefined, favoritePlayers: input.favoritePlayers },
        'manual',
      ),
      createdAt: t,
      updatedAt: t,
    };
    await db.gameCopies.add(copy);
    return copy;
  });
}

export async function updateGameCopy(id: string, patch: Partial<GameCopy>, source: Source = 'manual') {
  const copy = await db.gameCopies.get(id);
  if (!copy) throw new Error('not found');
  const next = withProvenance(copy, patch, source);
  next.updatedAt = now();
  await db.gameCopies.put(next);
  return next;
}

export async function updateGameWork(id: string, patch: Partial<GameWork>, source: Source = 'manual') {
  const work = await db.gameWorks.get(id);
  if (!work) throw new Error('not found');
  const next = withProvenance(work, patch, source);
  next.updatedAt = now();
  await db.gameWorks.put(next);
  return next;
}

async function dropWorkIfOrphan(workId: string) {
  const remaining = await db.gameCopies.where('workId').equals(workId).count();
  if (remaining === 0) await db.gameWorks.delete(workId);
}

/** Point my copy at an existing original game (e.g. a redesign of a game I already have). */
export async function linkGameCopyToWork(copyId: string, workId: string) {
  await db.transaction('rw', db.gameWorks, db.gameCopies, async () => {
    const copy = await db.gameCopies.get(copyId);
    if (!copy || copy.workId === workId) return;
    if (!(await db.gameWorks.get(workId))) throw new Error('work not found');
    const previous = copy.workId;
    await db.gameCopies.update(copyId, { workId, updatedAt: now() });
    await dropWorkIfOrphan(previous);
  });
}

export async function deleteGameCopy(copyId: string) {
  await db.transaction(
    'rw',
    [db.gameWorks, db.gameCopies, db.sessions, db.photos, db.aiResponses],
    async () => {
      const copy = await db.gameCopies.get(copyId);
      if (!copy) return;
      await db.sessions.where('gameCopyId').equals(copyId).delete();
      await db.aiResponses.where('targetId').equals(copyId).delete();
      await db.photos.bulkDelete(copy.photoIds);
      await db.gameCopies.delete(copyId);
      await dropWorkIfOrphan(copy.workId);
    },
  );
}

export interface SessionInput {
  gameCopyId: string;
  at: number;
  durationMin?: number;
  playerIds: string[];
  winnerIds: string[];
  result: MyResult;
  notes?: string;
}

export async function saveSession(input: SessionInput, id?: string): Promise<Session> {
  const t = now();
  const existing = id ? await db.sessions.get(id) : undefined;
  const session: Session = {
    ...input,
    notes: input.notes?.trim() || undefined,
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await db.sessions.put(session);
  return session;
}

export async function deleteSession(id: string) {
  await db.sessions.delete(id);
}

export async function savePlayer(input: Partial<Player> & { name: string }): Promise<Player> {
  const t = now();
  const existing = input.id ? await db.players.get(input.id) : undefined;
  const player: Player = {
    likes: [],
    dislikes: [],
    ...existing,
    ...input,
    name: input.name.trim(),
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await db.players.put(player);
  return player;
}

export async function deletePlayer(id: string) {
  await db.transaction('rw', db.players, db.sessions, db.photos, async () => {
    const player = await db.players.get(id);
    if (!player) return;
    // Keep past sessions intact; just remove the person from them.
    const sessions = await db.sessions.filter((s) => s.playerIds.includes(id)).toArray();
    for (const s of sessions) {
      await db.sessions.update(s.id, {
        playerIds: s.playerIds.filter((p) => p !== id),
        winnerIds: s.winnerIds.filter((p) => p !== id),
      });
    }
    if (player.photoId) await db.photos.delete(player.photoId);
    await db.players.delete(id);
  });
}

export interface GameView {
  copy: GameCopy;
  work?: GameWork;
}

export async function listGames(): Promise<GameView[]> {
  const [copies, works] = await Promise.all([db.gameCopies.toArray(), db.gameWorks.toArray()]);
  const byId = new Map(works.map((w) => [w.id, w]));
  return copies.map((copy) => ({ copy, work: byId.get(copy.workId) }));
}
