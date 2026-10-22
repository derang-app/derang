// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { createGame, deleteGameCopy, linkGameCopyToWork, saveSession, updateGameWork } from '../src/db/games';
import { mergeExternal } from '../src/db/provenance';
import { ME } from '../src/db/types';

describe('board game copy ⇄ original game', () => {
  it('a copy keeps its own name and photo while the original holds shared specs', async () => {
    const copy = await createGame({ name: 'قطار اروپا', edition: 'redesign', minPlayers: 2, maxPlayers: 5, specsSource: 'rulebook' });
    await updateGameWork(copy.workId, { name: 'Ticket to Ride: Europe', bggId: '14996' });
    const work = await db.gameWorks.get(copy.workId);
    expect(copy.name).toBe('قطار اروپا');
    expect(work!.name).toBe('Ticket to Ride: Europe');
    expect(work!.provenance.minPlayers).toBe('rulebook');
    expect(work!.provenance.bggId).toBe('manual');
  });

  it('links a redesign to an existing original without changing rules data', async () => {
    const original = await createGame({ name: 'Azul', edition: 'original', minPlayers: 2, maxPlayers: 4, playTimeMax: 45 });
    const redesign = await createGame({ name: 'کاشی', edition: 'redesign' });
    await linkGameCopyToWork(redesign.id, original.workId);
    const r = await db.gameCopies.get(redesign.id);
    expect(r!.workId).toBe(original.workId);
    expect(r!.edition).toBe('redesign');
    expect(await db.gameWorks.count()).toBe(1);
    expect((await db.gameWorks.get(original.workId))!.maxPlayers).toBe(4);
  });

  it('online data never silently overwrites manual values', async () => {
    const copy = await createGame({ name: 'X', minPlayers: 3, maxPlayers: 5 });
    const work = (await db.gameWorks.get(copy.workId))!;
    const merged = mergeExternal(work, { minPlayers: 2, maxPlayers: 5, playTimeMax: 60 }, 'online');
    expect(merged.minPlayers).toBe(3);
    expect(merged.playTimeMax).toBe(60);
    expect(merged.provenance.playTimeMax).toBe('online');
    const forced = mergeExternal(work, { minPlayers: 2 }, 'online', ['minPlayers']);
    expect(forced.minPlayers).toBe(2);
  });

  it('deleting a copy removes its sessions', async () => {
    const copy = await createGame({ name: 'X' });
    await saveSession({ gameCopyId: copy.id, at: Date.now(), playerIds: [ME], winnerIds: [ME], result: 'win' });
    await deleteGameCopy(copy.id);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.gameWorks.count()).toBe(0);
  });
});
