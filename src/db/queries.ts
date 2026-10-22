import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { listBooks, type BookView } from './books';
import { listGames, type GameView } from './games';
import type { Session } from './types';

export function useBooks(): BookView[] | undefined {
  return useLiveQuery(listBooks, []);
}

export function useGames(): GameView[] | undefined {
  return useLiveQuery(listGames, []);
}

export function useSessions(): Session[] | undefined {
  return useLiveQuery(() => db.sessions.orderBy('at').reverse().toArray(), []);
}

export function usePlayers() {
  return useLiveQuery(() => db.players.orderBy('name').toArray(), []);
}

export function useBook(id: string | undefined) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const copy = await db.bookCopies.get(id);
    if (!copy) return null;
    const work = await db.bookWorks.get(copy.workId);
    const siblings = await db.bookCopies.where('workId').equals(copy.workId).toArray();
    return { copy, work, siblings };
  }, [id]);
}

export function useGame(id: string | undefined) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const copy = await db.gameCopies.get(id);
    if (!copy) return null;
    const work = await db.gameWorks.get(copy.workId);
    const sessions = await db.sessions.where('gameCopyId').equals(id).reverse().sortBy('at');
    const siblings = await db.gameCopies.where('workId').equals(copy.workId).toArray();
    return { copy, work, sessions, siblings };
  }, [id]);
}

/** Display name of a book: my copy's title, then the original title. */
export function bookTitle(v: BookView) {
  return v.copy.title || v.work?.title || 'بی‌نام';
}

export function authorsOf(v: { work?: { authors: string[] } }) {
  return v.work?.authors.join('، ') ?? '';
}
