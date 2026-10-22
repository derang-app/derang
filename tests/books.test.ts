// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import {
  addNote,
  createBook,
  deleteCopy,
  detachCopy,
  finishReading,
  linkCopyToWork,
  setProgress,
  updateCopy,
  updateWork,
} from '../src/db/books';

describe('book work ⇄ copy', () => {
  it('quick add needs only a title and creates a separate work identity', async () => {
    const copy = await createBook({ title: 'قلعه حیوانات' });
    const work = await db.bookWorks.get(copy.workId);
    expect(work).toBeDefined();
    expect(work!.title).toBeUndefined(); // unknown original title stays empty
    expect(copy.owned).toBe(true);
    expect(copy.status).toBe('unread');
    expect(copy.translators).toEqual([]);
    expect(copy.isbn).toBeUndefined();
  });

  it('two translations link to one work but keep independent reading history and notes', async () => {
    const a = await createBook({ title: 'قلعه حیوانات', authors: ['جورج اورول'], pageCount: 160 });
    const b = await createBook({ title: 'مزرعه حیوانات', pageCount: 120 });
    await updateWork(a.workId, { title: 'Animal Farm' });
    await updateCopy(a.id, { translators: ['احمد کسروی'], isbn: '978-964-0000-00-0' });
    await updateCopy(b.id, { translators: ['امیر امیرشاهی'] });

    await linkCopyToWork(b.id, a.workId);
    expect(await db.bookWorks.get(b.workId)).toBeUndefined(); // orphan removed
    const copies = await db.bookCopies.where('workId').equals(a.workId).toArray();
    expect(copies.map((c) => c.title).sort()).toEqual(['قلعه حیوانات', 'مزرعه حیوانات'].sort());

    await setProgress(a.id, 50);
    await addNote({ copyId: a.id, kind: 'quote', text: 'همه برابرند', page: 90 });
    await finishReading(b.id, { rating: 4, reflection: { moods: ['متفکر'], skipped: false, text: 'قدرت' } });

    const [ca, cb] = await Promise.all([db.bookCopies.get(a.id), db.bookCopies.get(b.id)]);
    expect(ca!.status).toBe('reading');
    expect(ca!.currentPage).toBe(50);
    expect(cb!.status).toBe('read');
    expect(cb!.rating).toBe(4);
    expect(ca!.rating).toBeUndefined();
    expect(await db.notes.where('copyId').equals(a.id).count()).toBe(1);
    expect(await db.notes.where('copyId').equals(b.id).count()).toBe(0);
    expect(await db.readingLogs.where('copyId').equals(a.id).count()).toBe(1);
    expect((await db.bookCopies.get(a.id))!.isbn).toBe('978-964-0000-00-0'); // ISBN stays a string
  });

  it('detaching gives the copy its own identity again', async () => {
    const a = await createBook({ title: 'A', authors: ['X'] });
    const b = await createBook({ title: 'B' });
    await linkCopyToWork(b.id, a.workId);
    await detachCopy(b.id);
    const nb = await db.bookCopies.get(b.id);
    expect(nb!.workId).not.toBe(a.workId);
    expect((await db.bookWorks.get(nb!.workId))!.authors).toEqual(['X']);
  });

  it('deleting a copy removes its notes and logs, and the work only when orphaned', async () => {
    const a = await createBook({ title: 'A', pageCount: 10 });
    const b = await createBook({ title: 'B', workId: a.workId });
    await addNote({ copyId: a.id, kind: 'note', text: 'n' });
    await setProgress(a.id, 3);
    await deleteCopy(a.id);
    expect(await db.notes.count()).toBe(0);
    expect(await db.readingLogs.count()).toBe(0);
    expect(await db.bookWorks.get(a.workId)).toBeDefined();
    await deleteCopy(b.id);
    expect(await db.bookWorks.get(a.workId)).toBeUndefined();
  });

  it('records provenance and reports reaching the last page', async () => {
    const a = await createBook({ title: 'A', pageCount: 100 });
    expect(a.provenance.title).toBe('manual');
    await updateCopy(a.id, { publisher: 'چشمه' }, 'ai_unconfirmed');
    expect((await db.bookCopies.get(a.id))!.provenance.publisher).toBe('ai_unconfirmed');
    expect(await setProgress(a.id, 100)).toBe(true);
  });
});
