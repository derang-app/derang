// @vitest-environment node
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { db } from '../src/db/db';
import { addNote, createBook, linkCopyToWork, setProgress } from '../src/db/books';
import { createGame, saveSession, savePlayer } from '../src/db/games';
import { BackupError, createBackup, parseBackup, restoreBackup } from '../src/lib/backup';
import { ME } from '../src/db/types';

async function addPhoto(id: string, bytes: number[]) {
  await db.photos.add({ id, blob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), thumb: new Blob([new Uint8Array([9])], { type: 'image/jpeg' }), width: 10, height: 20, createdAt: 1 });
}

async function bytes(blob: Blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

describe('backup and restore', () => {
  it('round-trips data and photos, and excludes secrets', async () => {
    await addPhoto('ph1', [1, 2, 3]);
    await addPhoto('ph2', [4, 5]);
    const a = await createBook({ title: 'قلعه حیوانات', pageCount: 100, photoIds: ['ph1'] });
    const b = await createBook({ title: 'مزرعه حیوانات' });
    await linkCopyToWork(b.id, a.workId);
    await setProgress(a.id, 40);
    await addNote({ copyId: a.id, kind: 'quote', text: 'جمله' });
    const g = await createGame({ name: 'آزول', photoIds: ['ph2'], minPlayers: 2, maxPlayers: 4 });
    const p = await savePlayer({ name: 'مریم', likes: ['همکاری'] });
    await saveSession({ gameCopyId: g.id, at: 5, playerIds: [ME, p.id], winnerIds: [p.id], result: 'loss' });
    await db.kv.put({ key: 'profile', value: { name: 'من' } });
    await db.kv.put({ key: 'ai.secret', value: 'sk-should-not-leak' });

    const blob = await createBackup('0.1.0');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const text = await zip.file('data.json')!.async('string');
    expect(text).not.toContain('sk-should-not-leak');
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.version).toBe(1);
    expect(manifest.counts.photos).toBe(2);

    const parsed = await parseBackup(blob);
    expect(parsed.manifest.counts.bookCopies).toBe(2);

    // Change current data, then restore.
    await db.bookCopies.clear();
    await db.photos.clear();
    await createBook({ title: 'جدید' });
    await restoreBackup(parsed);

    expect(await db.bookCopies.count()).toBe(2);
    expect((await db.bookCopies.where('workId').equals(a.workId).count())).toBe(2);
    expect((await db.bookCopies.get(a.id))!.currentPage).toBe(40);
    expect(await db.notes.count()).toBe(1);
    expect(await db.sessions.count()).toBe(1);
    expect((await db.players.get(p.id))!.likes).toEqual(['همکاری']);
    expect(await bytes((await db.photos.get('ph1'))!.blob)).toEqual([1, 2, 3]);
    expect(await bytes((await db.photos.get('ph2'))!.blob)).toEqual([4, 5]);
    expect((await db.kv.get('profile'))!.value).toEqual({ name: 'من' });
    expect(await db.kv.get('ai.secret')).toBeUndefined();
  });

  it('rejects invalid files before touching data', async () => {
    await createBook({ title: 'می‌ماند' });
    await expect(parseBackup(new Blob(['not a zip']))).rejects.toBeInstanceOf(BackupError);

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ format: 'derang-backup', version: 99, counts: {} }));
    zip.file('data.json', '{}');
    await expect(parseBackup(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/نسخهٔ جدیدتری/);
    expect(await db.bookCopies.count()).toBe(1);
  });

  it('rejects a backup whose referenced photos are missing', async () => {
    await addPhoto('ph1', [1]);
    await createBook({ title: 'x', photoIds: ['ph1'] });
    const blob = await createBackup('0.1.0');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.remove('photos/ph1.jpg');
    await expect(parseBackup(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/عکس/);
  });

  it('rejects broken references and drops unknown setting keys', async () => {
    const book = await createBook({ title: 'x' });
    await db.kv.put({ key: 'profile', value: { name: 'من' } });
    const zip = await JSZip.loadAsync(await (await createBackup('0.1.0')).arrayBuffer());
    const data = JSON.parse(await zip.file('data.json')!.async('string'));

    data.kv.push({ key: 'evil', value: { x: 1 } });
    data.kv.push({ key: 'ai', value: { provider: 'anthropic', model: 'claude-opus-5-5', includeNotes: true, baseUrl: 'https://attacker.example' } });
    zip.file('data.json', JSON.stringify(data));
    const parsed = await parseBackup(await zip.generateAsync({ type: 'blob' }));
    expect(parsed.data.kv.map((r) => (r as { key: string }).key)).toEqual(['profile', 'ai']);
    expect(JSON.stringify(parsed.data.kv)).not.toContain('attacker');

    data.bookCopies[0].workId = 'missing';
    zip.file('data.json', JSON.stringify(data));
    await expect(parseBackup(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/bookCopies/);

    data.bookCopies[0].workId = book.workId;
    data.bookCopies[0].status = 'eaten';
    zip.file('data.json', JSON.stringify(data));
    await expect(parseBackup(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/bookCopies/);
  });
});
