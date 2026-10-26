import { describe, expect, it } from 'vitest';
import { createBook } from '../src/db/books';
import { db } from '../src/db/db';
import { setCover } from '../src/lib/cover';
import { defaultQuad, enhance, isUsableQuad, outputSize, squareToQuad, warp, type Quad } from '../src/lib/scan';
import { parseThing, parseXml } from '../src/online/bgg';
import { guideInShot } from '../src/ui/ScannerCamera';
import { coverPrompt, parseImageLink, parseTaaghcheLink, readableImageUrl, taaghcheCoverUrl } from '../src/online/covers';

describe('perspective warp', () => {
  const quad: Quad = [
    { x: 10, y: 20 },
    { x: 110, y: 10 },
    { x: 120, y: 160 },
    { x: 5, y: 150 },
  ];

  it('maps the unit square corners onto the quad', () => {
    const map = squareToQuad(quad);
    const corners = [map(0, 0), map(1, 0), map(1, 1), map(0, 1)];
    corners.forEach((p, i) => {
      expect(p.x).toBeCloseTo(quad[i].x, 6);
      expect(p.y).toBeCloseTo(quad[i].y, 6);
    });
  });

  it('handles a plain rectangle (affine case)', () => {
    const map = squareToQuad(defaultQuad(200, 100, 0));
    expect(map(0.5, 0.5)).toEqual({ x: 100, y: 50 });
  });

  it('flattens a region and keeps its content', () => {
    // 4×4 image: left half red, right half blue.
    const w = 4;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let i = 0; i < w * w; i++) {
      const x = i % w;
      data.set(x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    }
    const out = warp({ data, width: w, height: w }, defaultQuad(w, w, 0), 2, 2);
    expect(Array.from(out.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(out.data.slice(4, 8))).toEqual([0, 0, 255, 255]);
  });

  it('sizes the output from the edges, capped on the long side', () => {
    expect(outputSize(defaultQuad(1000, 1500, 0), 1600)).toEqual({ width: 1000, height: 1500 });
    expect(outputSize(defaultQuad(2000, 3000, 0), 1500)).toEqual({ width: 1000, height: 1500 });
  });

  it('rejects crossed or tiny outlines', () => {
    expect(isUsableQuad(quad, 130, 170)).toBe(true);
    const crossed: Quad = [quad[0], quad[2], quad[1], quad[3]];
    expect(isUsableQuad(crossed, 130, 170)).toBe(false);
    expect(isUsableQuad(defaultQuad(1000, 1000, 0.45), 1000, 1000)).toBe(false);
  });
});

describe('camera guide frame', () => {
  it('maps the on-screen frame into the shot through object-cover cropping', () => {
    // 1920×1080 landscape feed in a 375×812 portrait screen: scaled ×0.752, 534px cropped each side.
    const box = { left: 0, top: 0, width: 375, height: 812 };
    const frame = { left: 47.5, top: 200, width: 280, height: 420 };
    const q = guideInShot(box, frame, 1920, 1080, 1);
    const cover = 812 / 1080;
    const ox = (375 - 1920 * cover) / 2;
    expect(q[0].x).toBeCloseTo((47.5 - ox) / cover, 3);
    expect(q[0].y).toBeCloseTo(200 / cover, 3);
    expect(q[2].x).toBeCloseTo((327.5 - ox) / cover, 3);
    expect(q[2].y).toBeCloseTo(620 / cover, 3);
    // Frame centred on screen → centred in the shot.
    expect((q[0].x + q[1].x) / 2).toBeCloseTo(960, 3);
  });

  it('scales to the stored shot size', () => {
    const q = guideInShot({ left: 0, top: 0, width: 100, height: 100 }, { left: 0, top: 0, width: 100, height: 100 }, 1000, 1000, 0.5);
    expect(q[2]).toEqual({ x: 500, y: 500 });
  });
});

describe('enhance', () => {
  const px = (rgb: number[][]) => ({ data: new Uint8ClampedArray(rgb.flatMap((c) => [...c, 255])), width: rgb.length, height: 1 });

  it('mostly removes a warm cast on white paper', () => {
    const img = px([...Array(97).fill([120, 100, 80]), ...Array(3).fill([235, 215, 185])]);
    enhance(img);
    const last = Array.from(img.data.slice(99 * 4, 99 * 4 + 3));
    // Before: 235/215/185, a spread of 50.
    expect(Math.max(...last) - Math.min(...last)).toBeLessThan(25);
  });

  it('leaves a colourful cover’s colours alone', () => {
    const img = px(Array(100).fill([200, 30, 30]));
    enhance(img);
    expect(img.data[0]).toBeGreaterThan(img.data[1] * 3);
  });
});

describe('cover sources', () => {
  it('reads remote images through the image cache', () => {
    const u = new URL(readableImageUrl('https://cf.geekdo-images.com/a/pic1.jpg'));
    expect(u.hostname).toBe('wsrv.nl');
    expect(u.searchParams.get('url')).toBe('https://cf.geekdo-images.com/a/pic1.jpg');
    expect(() => readableImageUrl('http://example.com/a.jpg')).toThrow();
  });

  it('reads BGG full-size box art', () => {
    const doc = parseXml(`<items><item type="boardgame" id="13"><thumbnail>https://cf.geekdo-images.com/t.jpg</thumbnail><image>https://cf.geekdo-images.com/full.jpg</image><name type="primary" value="CATAN"/></item></items>`);
    expect(parseThing(doc)?.image).toBe('https://cf.geekdo-images.com/full.jpg');
  });
});

describe('Taaghche links', () => {
  it('finds the book id in links and shared text', () => {
    expect(parseTaaghcheLink('https://taaghche.com/book/141438/%DA%A9%D8%AA%D8%A7%D8%A8')).toBe('141438');
    expect(parseTaaghcheLink('کتاب «بوف کور» را در طاقچه ببین: https://taaghche.com/book/199851')).toBe('199851');
    expect(parseTaaghcheLink('taaghche.com/audiobook/book/۱۲۳۴')).toBe('1234');
    expect(parseTaaghcheLink('https://fidibo.com/book/146470')).toBeUndefined();
    expect(parseTaaghcheLink('https://taaghche.com/publisher/12')).toBeUndefined();
  });

  it('points at the front cover, read through the image cache', () => {
    expect(taaghcheCoverUrl('141438')).toBe('https://img.taaghche.com/frontCover/141438.jpg');
    expect(new URL(readableImageUrl(taaghcheCoverUrl('1'))).hostname).toBe('wsrv.nl');
  });
});

describe('ChatGPT prompt', () => {
  it('includes the known details and asks only for a link, not a drawn cover', () => {
    const p = coverPrompt({ kind: 'book', title: 'قلعهٔ حیوانات', originalTitle: 'Animal Farm', authors: ['George Orwell'], translators: [], isbn: '978' });
    expect(p).toContain('قلعهٔ حیوانات');
    expect(p).toContain('Animal Farm');
    expect(p).toContain('DIRECT address');
    expect(p).not.toContain('reproduce');
    expect(p).not.toContain('Translator');
    const g = coverPrompt({ kind: 'game', title: 'کاتان', originalTitle: 'CATAN' });
    expect(g).toContain('CATAN');
    expect(g).toContain('DIRECT address');
  });
});

describe('image link', () => {
  it('finds the address inside a pasted answer', () => {
    expect(parseImageLink('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(parseImageLink('لینک عکس: [جلد](https://cdn.example.ir/covers/12.webp).')).toBe('https://cdn.example.ir/covers/12.webp');
    expect(parseImageLink('https://example.com/a.jpg،')).toBe('https://example.com/a.jpg');
    expect(parseImageLink('http://example.com/a.jpg')).toBeUndefined();
    expect(parseImageLink('چیزی نیست')).toBeUndefined();
  });
});

describe('setCover', () => {
  it('puts the new photo first and keeps the old ones', async () => {
    const copy = await createBook({ title: 'کتاب', photoIds: ['old'] });
    await setCover('book', copy.id, 'new');
    expect((await db.bookCopies.get(copy.id))?.photoIds).toEqual(['new', 'old']);
    await setCover('book', copy.id, 'old');
    expect((await db.bookCopies.get(copy.id))?.photoIds).toEqual(['old', 'new']);
  });
});
