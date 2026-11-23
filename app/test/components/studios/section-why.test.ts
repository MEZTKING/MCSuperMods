/// <reference types="node" />
/**
 * Every Studio section says in one line what it is for (ADR 0130 D2): each `<Section … testId>`
 * of the Studios has a why in `studios/section-why.ts`, and every why is plain words (no id, none
 * of the forbidden words) in British English.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import { SECTION_WHY, sectionWhy } from '../../../src/renderer/src/studios/section-why';

const STUDIOS = join(__dirname, '..', '..', '..', 'src', 'renderer', 'src', 'studios');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The literal test ids of the Studios' sections. */
function sectionIds(): string[] {
  const ids = new Set<string>();
  for (const path of walk(STUDIOS).filter((file) => file.endsWith('.tsx'))) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/<Section\b[^>]*?testId="([a-z0-9-]+)"/gs)) {
      ids.add(match[1] as string);
    }
  }
  return [...ids].sort();
}

describe('section whys', () => {
  it('has a why for every section of the Studios', () => {
    const ids = sectionIds();
    expect(ids.length).toBeGreaterThan(150);
    expect(ids.filter((id) => sectionWhy(id) === undefined)).toEqual([]);
  });

  it('says every why in plain British words', () => {
    for (const [id, why] of Object.entries(SECTION_WHY)) {
      expect(forbiddenIn(why), id).toEqual([]);
      expect(why, id).toMatch(/^[A-Z].*[.]$/);
      expect(why, id).not.toMatch(/\b(color|behavior|armor|favorite)\b/i);
    }
    expect(sectionWhy('item-fuel-compost')).toMatch(/furnace/);
  });
});
