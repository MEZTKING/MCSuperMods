/**
 * Home's More ideas (ADR 0128 D1, D2; ADR 0129 D3): the seeds of the cards, the window of the
 * endless grid, and the idea of a card plan rolled through Surprise me's generator with the
 * built-in library: the same plan gives the same card, its words carry no ids, the same plan
 * rolled for a new mod (Make this) gives the same things, the joined bundle lists an element
 * once, and a clip plays the idea's own blocks (`validateClip` against its lowered files).
 * The variety of the cards and the pictures' whole device pixels are in `ideas-varied.test.ts`.
 */

import { createEmptyProject } from '@msm/core';
import type { ContentBundle, ProjectStarter, Target } from '@msm/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IDEA_FIRST_ROWS,
  IDEA_MAX_SEED,
  IDEA_ROW,
  ideaColumns,
  ideaSeed,
  ideasWindow,
} from '../../../src/renderer/src/ideas/idea-seeds';
import {
  clearIdeas,
  type IdeaSpec,
  ideaPicture,
  ideaPlan,
  joinBundles,
  listInWords,
  makeIdea,
  rollIdea,
} from '../../../src/renderer/src/ideas/ideas';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import { validateClip } from '../../../src/renderer/src/showcase/clip';
import { exampleFiles } from '../../../src/renderer/src/showcase/example-files';
import { rollSurprise } from '../../../src/renderer/src/surprise/surprise';
import { TARGETS, theRegistry } from '../showcase/showcase-fixture';

const starters: ProjectStarter[] = builtInPlugins.flatMap(
  (plugin) => plugin.contributes.projectStarters ?? [],
);
const target = TARGETS[0] as Target;
const input = {
  starters,
  target,
  isKnownKind: (kind: string) => theRegistry().get(kind) !== undefined,
  rules: theRegistry().get('msm:rules') !== undefined,
};

afterEach(() => clearIdeas());

const plan = ideaPlan(input);
const spec = (base: number, index: number): IdeaSpec => plan(base, index) as IdeaSpec;

describe('the seeds of the cards', () => {
  it('give the same seed for the same base and card, within Surprise me’s range', () => {
    for (let index = 0; index < 500; index += 1) {
      const seed = ideaSeed(4242, index);
      expect(seed).toBe(ideaSeed(4242, index));
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(IDEA_MAX_SEED);
    }
  });

  it('differ between cards, and Shuffle (a new base) changes them', () => {
    const one = Array.from({ length: 200 }, (_, index) => ideaSeed(7, index));
    expect(new Set(one).size).toBeGreaterThan(195);
    const other = Array.from({ length: 200 }, (_, index) => ideaSeed(8, index));
    expect(one.filter((seed, index) => seed === other[index]).length).toBeLessThan(3);
  });
});

describe('the window of the grid', () => {
  it('mounts the rows near the view and grows ahead of it, never shrinking', () => {
    const width = 1200;
    expect(ideaColumns(width)).toBe(4);
    expect(ideaColumns(10)).toBe(1);
    const start = ideasWindow({ top: 400, height: 900, width }, 0);
    expect(start.first).toBe(0);
    expect(start.rows).toBeGreaterThanOrEqual(IDEA_FIRST_ROWS);
    // Far down: the first rows are gone, the mounted rows stay few, the list has grown.
    let rows = start.rows;
    for (let top = 0; top > -200_000; top -= 5_000) {
      const window_ = ideasWindow({ top, height: 900, width }, rows);
      expect(window_.rows).toBeGreaterThanOrEqual(rows);
      expect(window_.last - window_.first + 1).toBeLessThanOrEqual(8);
      expect((window_.last + 1) * IDEA_ROW).toBeGreaterThan(-top + 900);
      rows = window_.rows;
    }
    expect(rows).toBeGreaterThan(600);
    const far = ideasWindow({ top: -200_000, height: 900, width }, rows);
    expect(far.first).toBeGreaterThan(600);
    // Scrolling back up keeps the grown list.
    expect(ideasWindow({ top: 0, height: 900, width }, rows).rows).toBe(rows);
  });

  it('mounts nothing while the list is far below the view', () => {
    const window_ = ideasWindow({ top: 5_000, height: 900, width: 800 }, 3);
    expect(window_.last).toBeLessThan(window_.first);
  });
});

describe('an idea', () => {
  it('is the same card for the same plan, in words with no ids', async () => {
    for (const card of [spec(11, 0), spec(4242, 3), spec(987_654, 17)]) {
      const first = await makeIdea(input, card);
      const again = await makeIdea(input, card);
      expect(again.name).toBe(first.name);
      expect(again.line).toBe(first.line);
      expect(again.makes).toEqual(first.makes);
      expect(first.name).not.toMatch(/ Mod$/);
      expect(first.line.length).toBeGreaterThan(5);
      for (const text of [first.name, first.line, ...first.makes]) {
        expect(text).not.toMatch(/[a-z0-9_]+:[a-z0-9_/]+/);
      }
    }
  }, 120_000);

  it('is rolled once and kept', async () => {
    const one = rollIdea(input, spec(77, 0));
    expect(rollIdea(input, spec(77, 0))).toBe(one);
    await one;
  }, 60_000);

  it('makes the same things when its plan is rolled for a new mod (Make this)', async () => {
    const card = spec(31_337, 2);
    const idea = await makeIdea(input, card);
    const project = createEmptyProject('Fresh Mod');
    project.namespaces.push({ name: 'fresh_mod', elements: [], assets: [] });
    const mod = await rollSurprise({
      ...input,
      seed: card.seed,
      themeId: card.themeId,
      lead: card.lead,
      namespace: 'fresh_mod',
      project,
    });
    expect(mod.modName).toBe(idea.name);
    expect(mod.things.flatMap((thing) => thing.makes)).toEqual(idea.makes);
  }, 60_000);

  it('draws its picture at the screen’s exact device pixels', async () => {
    const idea = await makeIdea(input, spec(5, 0));
    const sizes: [number, number][] = [];
    const codec = {
      decode: async () => ({ width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) }),
      encode: (image: { width: number; height: number }) => {
        sizes.push([image.width, image.height]);
        return new Uint8Array([0x89, 0x50]);
      },
    };
    expect(await ideaPicture(idea, 1, codec)).toMatch(/^data:image\/png;base64,/);
    await ideaPicture(idea, 1.5, codec);
    await ideaPicture(idea, 2, codec);
    expect(sizes).toEqual([
      [256, 144],
      [384, 216],
      [512, 288],
    ]);
  }, 60_000);

  it('has a clip of its own blocks or spawn egg that validates against its files', async () => {
    let checked = 0;
    for (let index = 0; index < 12 && checked < 3; index += 1) {
      const idea = await makeIdea(input, spec(99, index));
      if (idea.clip === null) continue;
      const files = await exampleFiles(idea.example, target, {
        registry: theRegistry(),
        plugins: builtInPlugins,
      });
      expect(validateClip(idea.clip, files.ids)).toEqual([]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  }, 240_000);
});

describe('joining the things’ bundles', () => {
  it('lists a shared element once, joining tag values', () => {
    const a: ContentBundle = {
      elements: [
        { id: 'showcase:en_us', kind: 'minecraft:lang', data: { 'item.a': 'A' } },
        { id: 'showcase:tag', kind: 'minecraft:tag', data: { values: ['x'] } },
      ],
      assets: [{ namespace: 'showcase', path: 'textures/item/a.png', bytes: new Uint8Array([1]) }],
    };
    const b: ContentBundle = {
      elements: [
        { id: 'showcase:en_us', kind: 'minecraft:lang', data: { 'item.b': 'B' } },
        { id: 'showcase:tag', kind: 'minecraft:tag', data: { values: ['x', 'y'] } },
      ],
      assets: [{ namespace: 'showcase', path: 'textures/item/a.png', bytes: new Uint8Array([2]) }],
    };
    const joined = joinBundles([a, b]);
    expect(joined.elements).toHaveLength(2);
    expect(joined.elements[0]?.data).toEqual({ 'item.a': 'A', 'item.b': 'B' });
    expect(joined.elements[1]?.data).toEqual({ values: ['x', 'y'] });
    expect(joined.assets).toHaveLength(1);
    expect(joined.assets[0]?.bytes).toEqual(new Uint8Array([1]));
  });

  it('says lists in words', () => {
    expect(listInWords([])).toBe('');
    expect(listInWords(['a pet'])).toBe('a pet');
    expect(listInWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
