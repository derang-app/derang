import { db, newId, now } from './db';
import { withProvenance } from './provenance';
import type { BookCopy, BookWork, Note, NoteKind, ReadStatus, Reflection, Source } from './types';

export interface NewBookInput {
  title: string;
  authors?: string[];
  pageCount?: number;
  status?: ReadStatus;
  owned?: boolean;
  photoIds?: string[];
  note?: string;
  translators?: string[];
  publisher?: string;
  publication?: string;
  language?: string;
  isbn?: string;
  startedAt?: number;
  finishedAt?: number;
  rating?: number;
  /** Original work: title in its own language, other names, reference link and id. */
  workTitle?: string;
  altTitles?: string[];
  refUrl?: string;
  refId?: string;
  /** Fields that came from an online source (e.g. Taaghche) rather than the user. */
  online?: string[];
  /** Attach to an existing work instead of creating a new one. */
  workId?: string;
}

function manualProv(values: Record<string, unknown>, online: string[] = []): Record<string, Source> {
  const prov: Record<string, Source> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) prov[k] = online.includes(k) ? 'online' : 'manual';
  }
  return prov;
}

/** Quick add: only the title is required. Creates the work identity alongside the copy. */
export async function createBook(input: NewBookInput): Promise<BookCopy> {
  const t = now();
  return db.transaction('rw', db.bookWorks, db.bookCopies, db.notes, async () => {
    let workId = input.workId;
    if (!workId) {
      const authors = input.authors ?? [];
      const altTitles = input.altTitles ?? [];
      const workTitle = input.workTitle?.trim() || undefined;
      const work: BookWork = {
        id: newId(),
        title: workTitle,
        authors,
        altTitles,
        refUrl: input.refUrl,
        refId: input.refId || undefined,
        provenance: manualProv({ title: workTitle, authors, altTitles, refUrl: input.refUrl, refId: input.refId }, input.online),
        createdAt: t,
        updatedAt: t,
      };
      await db.bookWorks.add(work);
      workId = work.id;
    }
    const status = input.status ?? 'unread';
    const copy: BookCopy = {
      id: newId(),
      workId,
      title: input.title.trim(),
      translators: input.translators ?? [],
      publisher: input.publisher || undefined,
      publication: input.publication || undefined,
      language: input.language || undefined,
      isbn: input.isbn || undefined,
      pageCount: input.pageCount,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      rating: input.rating,
      photoIds: input.photoIds ?? [],
      owned: input.owned ?? true,
      status,
      matchStatus: 'unidentified',
      provenance: manualProv(
        {
          title: input.title,
          translators: input.translators,
          publisher: input.publisher,
          publication: input.publication,
          language: input.language,
          isbn: input.isbn,
          pageCount: input.pageCount,
        },
        input.online,
      ),
      createdAt: t,
      updatedAt: t,
    };
    if (status === 'reading' && !copy.startedAt) copy.startedAt = t;
    await db.bookCopies.add(copy);
    if (input.note?.trim()) {
      await db.notes.add({
        id: newId(),
        copyId: copy.id,
        kind: 'note',
        text: input.note.trim(),
        tags: [],
        createdAt: t,
        updatedAt: t,
      });
    }
    return copy;
  });
}

export async function updateCopy(id: string, patch: Partial<BookCopy>, source: Source = 'manual') {
  const copy = await db.bookCopies.get(id);
  if (!copy) throw new Error('not found');
  const next = withProvenance(copy, patch, source);
  next.updatedAt = now();
  await db.bookCopies.put(next);
  return next;
}

export async function updateWork(id: string, patch: Partial<BookWork>, source: Source = 'manual') {
  const work = await db.bookWorks.get(id);
  if (!work) throw new Error('not found');
  const next = withProvenance(work, patch, source);
  next.updatedAt = now();
  await db.bookWorks.put(next);
  return next;
}

async function dropWorkIfOrphan(workId: string) {
  const remaining = await db.bookCopies.where('workId').equals(workId).count();
  if (remaining === 0) await db.bookWorks.delete(workId);
}

/**
 * Attach a copy to another work (e.g. a second translation of the same book).
 * Reading history and notes stay on the copy; an orphaned previous work is removed.
 */
export async function linkCopyToWork(copyId: string, workId: string) {
  await db.transaction('rw', db.bookWorks, db.bookCopies, async () => {
    const copy = await db.bookCopies.get(copyId);
    if (!copy || copy.workId === workId) return;
    if (!(await db.bookWorks.get(workId))) throw new Error('work not found');
    const previous = copy.workId;
    await db.bookCopies.update(copyId, { workId, updatedAt: now() });
    await dropWorkIfOrphan(previous);
  });
}

/** Give a copy its own new identity (undo a wrong link). */
export async function detachCopy(copyId: string) {
  await db.transaction('rw', db.bookWorks, db.bookCopies, async () => {
    const copy = await db.bookCopies.get(copyId);
    if (!copy) return;
    const others = await db.bookCopies.where('workId').equals(copy.workId).count();
    if (others <= 1) return;
    const old = await db.bookWorks.get(copy.workId);
    const t = now();
    const work: BookWork = {
      id: newId(),
      authors: old?.authors ?? [],
      altTitles: [],
      provenance: old?.provenance.authors ? { authors: old.provenance.authors } : {},
      createdAt: t,
      updatedAt: t,
    };
    await db.bookWorks.add(work);
    await db.bookCopies.update(copyId, { workId: work.id, matchStatus: 'unidentified', updatedAt: t });
  });
}

export async function deleteCopy(copyId: string) {
  await db.transaction(
    'rw',
    [db.bookWorks, db.bookCopies, db.notes, db.readingLogs, db.photos, db.aiResponses],
    async () => {
      const copy = await db.bookCopies.get(copyId);
      if (!copy) return;
      await db.notes.where('copyId').equals(copyId).delete();
      await db.readingLogs.where('copyId').equals(copyId).delete();
      await db.aiResponses.where('targetId').equals(copyId).delete();
      await db.photos.bulkDelete(copy.photoIds);
      await db.bookCopies.delete(copyId);
      await dropWorkIfOrphan(copy.workId);
    },
  );
}

export async function startReading(copyId: string) {
  const copy = await db.bookCopies.get(copyId);
  if (!copy) return;
  await db.bookCopies.update(copyId, {
    status: 'reading',
    owned: true,
    startedAt: copy.startedAt ?? now(),
    finishedAt: undefined,
    updatedAt: now(),
  });
}

/** Record progress; returns true when the copy reached its last page. */
export async function setProgress(copyId: string, page: number): Promise<boolean> {
  const copy = await db.bookCopies.get(copyId);
  if (!copy) return false;
  const t = now();
  const from = copy.currentPage ?? 0;
  const clamped = Math.max(0, copy.pageCount ? Math.min(page, copy.pageCount) : page);
  await db.transaction('rw', db.bookCopies, db.readingLogs, async () => {
    if (clamped !== from) {
      await db.readingLogs.add({ id: newId(), copyId, at: t, fromPage: from, toPage: clamped });
    }
    await db.bookCopies.update(copyId, {
      currentPage: clamped,
      status: copy.status === 'read' ? 'read' : 'reading',
      startedAt: copy.startedAt ?? t,
      updatedAt: t,
    });
  });
  return !!copy.pageCount && clamped >= copy.pageCount && copy.status !== 'read';
}

export async function finishReading(
  copyId: string,
  opts: { rating?: number; reflection?: Omit<Reflection, 'at'>; finishedAt?: number },
) {
  const copy = await db.bookCopies.get(copyId);
  if (!copy) return;
  const t = now();
  await db.bookCopies.update(copyId, {
    status: 'read',
    owned: true,
    finishedAt: opts.finishedAt ?? t,
    currentPage: copy.pageCount ?? copy.currentPage,
    rating: opts.rating ?? copy.rating,
    reflection: opts.reflection ? { ...opts.reflection, at: t } : copy.reflection,
    updatedAt: t,
  });
}

export async function addNote(input: {
  copyId: string;
  kind: NoteKind;
  text: string;
  page?: number;
  chapter?: string;
  tags?: string[];
}): Promise<Note> {
  const t = now();
  const note: Note = {
    id: newId(),
    copyId: input.copyId,
    kind: input.kind,
    text: input.text.trim(),
    page: input.page,
    chapter: input.chapter?.trim() || undefined,
    tags: input.tags ?? [],
    createdAt: t,
    updatedAt: t,
  };
  await db.notes.add(note);
  return note;
}

export async function updateNote(id: string, patch: Partial<Note>) {
  await db.notes.update(id, { ...patch, updatedAt: now() });
}

export async function deleteNote(id: string) {
  await db.notes.delete(id);
}

export interface BookView {
  copy: BookCopy;
  work?: BookWork;
}

export async function listBooks(): Promise<BookView[]> {
  const [copies, works] = await Promise.all([db.bookCopies.toArray(), db.bookWorks.toArray()]);
  const byId = new Map(works.map((w) => [w.id, w]));
  return copies.map((copy) => ({ copy, work: byId.get(copy.workId) }));
}
