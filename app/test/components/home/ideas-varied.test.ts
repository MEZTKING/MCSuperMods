// @vitest-environment happy-dom
/**
 * Varied More ideas (ADR 0129 D3; the user on 1.5.7's Home: "most of these are similar"):
 *
 * - The plans of the first 200 cards: at least 10 different lead groups, none over a quarter,
 *   no two neighbouring cards with the same lead flow or theme, the same plan for the same base
 *   and card, and a few cards in a row never repeating a group or theme either.
 * - The rolled cards: every lead flow builds, each card is led by its plan's flow (its first
 *   thing), is named after the lead thing (never "<Theme> Mod"), and no two neighbours share a
 *   name.
 * - Make this on a mob-led and a vehicle-led card makes exactly that card's things, the mob and
 *   the vehicle among them.
 * - The pictures: drawn at the screen's exact device pixels for ratios 1 to 3, every texel a
 *   whole square of device pixels, shown with `image-rendering: pixelated`.
 * - Surprise me without a lead still starts from a material.
 */

import { createEmptyProject } from '@msm/core';
import type { ProjectStarter, Target } from '@msm/plugin-api';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RgbaImage } from '../../../src/renderer/src/components/texture-editor/pixels';
import { IdeaCard } from '../../../src/renderer/src/ideas/IdeaCard';
import { GROUP_WINDOW, THEME_WINDOW } from '../../../src/renderer/src/ideas/idea-plan';
import {
  clearIdeas,
  type Idea,
  type IdeaSpec,
  ideaPicture,
  ideaPictureSize,
  ideaPlan,
  makeIdea,
} from '../../../src/renderer/src/ideas/ideas';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import {
  FLOW_RECIPES,
  LEAD_RECIPES,
  rollSurprise,
  usableLeads,
} from '../../../src/renderer/src/surprise/surprise';
import { TARGETS, theRegistry } from '../showcase/showcase-fixture';

const starters: ProjectStarter[] = builtInPlugins.flatMap(
  (plugin) => plugin.contributes.projectStarters ?? [],
);
const isKnownKind = (kind: string) => theRegistry().get(kind) !== undefined;
const inputOn = (target: Target) => ({
  starters,
  target,
  isKnownKind,
  rules: isKnownKind('msm:rules'),
});
const input = inputOn(TARGETS[0] as Target);
const plan = ideaPlan(input);
const CARDS = 200;
const BASES = [1, 4242, 987_654];
const plans = (base: number): IdeaSpec[] =>
  Array.from({ length: CARDS }, (_, index) => plan(base, index) as IdeaSpec);

afterEach(() => {
  cleanup();
  clearIdeas();
});

describe('the plans of the cards', () => {
  it('lead from many groups, none over a quarter, on every target', () => {
    for (const target of TARGETS) {
      const planOn = ideaPlan(inputOn(target));
      for (const base of BASES) {
        const counts = new Map<string, number>();
        for (let index = 0; index < CARDS; index += 1) {
          const group = (planOn(base, index) as IdeaSpec).group;
          counts.set(group, (counts.get(group) ?? 0) + 1);
        }
        expect(counts.size, `${target.id} ${base}`).toBeGreaterThanOrEqual(10);
        for (const [group, count] of counts) {
          expect(count / CARDS, `${target.id} ${base} ${group}`).toBeLessThanOrEqual(0.25);
        }
      }
    }
  });

  it('never give neighbours the same lead flow or theme, nor a few in a row the same group', () => {
    for (const base of BASES) {
      const cards = plans(base);
      cards.forEach((card, index) => {
        const next = cards[index + 1];
        if (next !== undefined) {
          expect(next.lead, `${base} ${index}`).not.toBe(card.lead);
          expect(next.themeId, `${base} ${index}`).not.toBe(card.themeId);
        }
        for (let ahead = 1; ahead < GROUP_WINDOW; ahead += 1) {
          const other = cards[index + ahead];
          if (other !== undefined)
            expect(other.group, `${base} ${index}+${ahead}`).not.toBe(card.group);
        }
        for (let ahead = 1; ahead < THEME_WINDOW; ahead += 1) {
          const other = cards[index + ahead];
          if (other !== undefined) expect(other.themeId).not.toBe(card.themeId);
        }
      });
    }
  });

  it('are pure: the same base and card give the same plan, and the card keeps its seed', () => {
    const again = ideaPlan(input);
    for (let index = 0; index < CARDS; index += 7) {
      expect(again(4242, index)).toEqual(plan(4242, index));
    }
    expect(plan(4242, 3)).toBe(plan(4242, 3));
    expect(plans(1).map((card) => card.lead)).not.toEqual(plans(2).map((card) => card.lead));
  });

  it('can lead with every usable lead flow, and the leads cover what the brief names', () => {
    const usable = usableLeads(input).map((recipe) => recipe.flowId);
    expect(usable).toEqual(LEAD_RECIPES.map((recipe) => recipe.flowId));
    const groups = new Set(LEAD_RECIPES.map((recipe) => recipe.group));
    for (const group of [
      'mob',
      'pet',
      'vehicle',
      'portal',
      'plant',
      'tree',
      'machine',
      'storage',
      'particle',
      'music',
      'art',
      'world',
      'game',
      'rules',
      'magic',
      'material',
    ]) {
      expect(groups.has(group as never), group).toBe(true);
    }
    const seen = new Set<string>();
    for (const base of [1, 2, 3, 4, 5, 6]) for (const card of plans(base)) seen.add(card.lead);
    expect([...seen].sort()).toEqual([...usable].sort());
  });
});

describe('the rolled cards', () => {
  it('build every lead flow, led by it and named after it', async () => {
    const cards = plans(1);
    let previous: Idea | null = null;
    for (const card of cards) {
      const idea = await makeIdea(input, card);
      expect(idea.lead).toBe(card.lead);
      expect(idea.name, `${card.lead}`).not.toMatch(/ Mod$/);
      expect(idea.name.split(' ').length, idea.name).toBeGreaterThanOrEqual(2);
      expect(idea.makes.length, idea.name).toBeGreaterThan(0);
      expect(idea.line).toMatch(/^[A-Z].*\.$/);
      for (const text of [idea.name, idea.line, ...idea.makes]) {
        expect(text).not.toMatch(/[a-z0-9_]+:[a-z0-9_/]+/);
      }
      if (previous !== null) expect(idea.name).not.toBe(previous.name);
      previous = idea;
      // The planned flow is the first thing: what the card says comes first.
      expect(idea.bundle.elements.length).toBeGreaterThan(0);
    }
  }, 900_000);

  it('builds every lead flow on each target', async () => {
    for (const target of TARGETS) {
      const on = inputOn(target);
      for (const recipe of usableLeads(on)) {
        const mod = await rollSurprise({
          ...on,
          seed: 4242,
          themeId: 'frost',
          lead: recipe.flowId,
          namespace: 'showcase',
          project: emptyProject(),
        });
        expect(mod.things[0]?.flowId, `${target.id} ${recipe.flowId}`).toBe(recipe.flowId);
        expect(mod.modName, recipe.flowId).not.toBe('Frost Mod');
        expect(mod.modName.startsWith('Frost '), mod.modName).toBe(true);
      }
    }
  }, 900_000);
});

function emptyProject(name = 'showcase') {
  const project = createEmptyProject(name);
  project.namespaces.push({ name, elements: [], assets: [] });
  return project;
}

/** The first card of `group` among the first cards of base 1. */
function firstOf(group: string): IdeaSpec {
  for (const base of [1, 2, 3]) {
    const found = plans(base).find((card) => card.group === group);
    if (found !== undefined) return found;
  }
  throw new Error(`no ${group} card`);
}

describe('Make this', () => {
  for (const [group, kind] of [
    ['mob', 'msm:entity'],
    ['vehicle', 'msm:vehicle'],
  ] as const) {
    it(`on a ${group}-led card makes that card's things, the ${group} among them`, async () => {
      const card = firstOf(group);
      const idea = await makeIdea(input, card);
      const mod = await rollSurprise({
        ...input,
        seed: card.seed,
        themeId: card.themeId,
        lead: card.lead,
        namespace: 'fresh_mod',
        project: emptyProject('fresh_mod'),
      });
      expect(mod.modName).toBe(idea.name);
      expect(mod.lead).toBe(card.lead);
      expect(mod.things[0]?.flowId).toBe(card.lead);
      expect(mod.things.flatMap((thing) => thing.makes)).toEqual(idea.makes);
      const bundleKinds = mod.things[0]?.bundle.elements.map((entry) => entry.kind) ?? [];
      expect(bundleKinds, group).toContain(kind);
      expect(mod.items.length).toBeGreaterThan(0);
    }, 120_000);
  }
});

describe('the pictures of a card', () => {
  /** A checker of two colours, `side` texels square. */
  const checkerOf = (side: number): RgbaImage => ({
    width: side,
    height: side,
    data: new Uint8ClampedArray(
      Array.from({ length: side * side }, (_, at) =>
        ((at % side) + Math.floor(at / side)) % 2 === 0 ? [250, 10, 10, 255] : [10, 250, 10, 255],
      ).flat(),
    ),
  });

  /** The run lengths of one row's colours inside the picture (left to right). */
  function runs(image: RgbaImage, y: number): number[] {
    const out: number[] = [];
    let last = -1;
    for (let x = 0; x < image.width; x += 1) {
      const at = (y * image.width + x) * 4;
      const red = image.data[at] ?? 0;
      const green = image.data[at + 1] ?? 0;
      const colour = red === 250 ? 1 : green === 250 ? 2 : 0;
      if (colour === 0) {
        last = -1;
        continue;
      }
      if (colour === last) out[out.length - 1] = (out[out.length - 1] ?? 0) + 1;
      else out.push(1);
      last = colour;
    }
    return out;
  }

  it('are drawn at the exact device pixels, every texel of every picture one whole square', async () => {
    const rolled = await makeIdea(input, plan(1, 0) as IdeaSpec);
    // A 16 by 16 item, an 8 by 8 particle and an 18 by 18 effect icon on one card.
    const sides = [16, 8, 18];
    const idea: Idea = {
      ...rolled,
      lead: 'test-texels',
      pictures: sides.map((side) => new Uint8Array([side])),
    };
    for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      let drawn: RgbaImage | null = null;
      const codec = {
        decode: async (bytes: Uint8Array) => checkerOf(bytes[0] ?? 16),
        encode: (image: RgbaImage) => {
          drawn = image;
          return new Uint8Array([0x89, 0x50]);
        },
      };
      await ideaPicture(idea, ratio, codec);
      const image = drawn as RgbaImage | null;
      expect(image).not.toBeNull();
      if (image === null) continue;
      const size = ideaPictureSize(ratio);
      expect([image.width, image.height]).toEqual([size.width, size.height]);
      expect(image.width).toBe(Math.round(240 * ratio));
      expect(image.height).toBe(Math.round(150 * ratio));
      // A row through the middle: every texel the same whole width, in every picture.
      const lengths = runs(image, Math.floor(image.height / 2));
      expect(lengths.length).toBeGreaterThan(0);
      const texel = lengths[0] as number;
      expect(Number.isInteger(texel)).toBe(true);
      expect(texel).toBeGreaterThanOrEqual(1);
      for (const length of lengths) expect(length).toBe(texel);
    }
  }, 60_000);

  it('are shown pixelated, at the picture area’s size', () => {
    const idea = { name: 'Frost Wolf', line: 'A pet.', makes: ['Frost Wolf'] } as unknown as Idea;
    render(
      createElement(IdeaCard, {
        index: 0,
        idea,
        picture: 'data:image/png;base64,iVBORw0KGgo=',
        playable: false,
        onMake: () => {},
      }),
    );
    const still = screen.getByTestId('idea-still-0');
    expect(still.className).toContain('[image-rendering:pixelated]');
    expect(still.getAttribute('width')).toBe('240');
    expect(still.getAttribute('height')).toBe('150');
  });
});

describe('Surprise me', () => {
  it('still starts from a material without a lead', async () => {
    const materials = new Set(
      FLOW_RECIPES.filter((recipe) => recipe.slot === 'material').map((recipe) => recipe.flowId),
    );
    for (const seed of [3, 77, 4242]) {
      const mod = await rollSurprise({
        ...input,
        seed,
        namespace: 'showcase',
        project: emptyProject(),
      });
      expect(materials.has(mod.things[0]?.flowId ?? '')).toBe(true);
      expect(mod.modName).toMatch(/ Mod$/);
      expect(mod.lead).toBeUndefined();
    }
  }, 120_000);
});
