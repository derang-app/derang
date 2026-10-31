import { describe, expect, it } from 'vitest';
import { bggTags } from '../src/lib/bggVocab';

describe('BGG tags', () => {
  it('keeps every BGG category and mechanic (Onitama)', () => {
    const tags = bggTags(['Abstract Strategy', 'Fighting'], ['Grid Movement', 'Hand Management', 'Square Grid'], ['abstracts']);
    expect(tags).toEqual(expect.arrayContaining(['انتزاعی', 'مبارزه', 'حرکت روی شبکه', 'مدیریت دست', 'شبکهٔ مربعی', 'فکری']));
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('keeps an unknown BGG term in English instead of dropping it', () => {
    expect(bggTags([], ['Some New Mechanic'], [])).toEqual(['Some New Mechanic']);
  });
});
