/**
 * Home's idea cards (ADR 0128 D1, D2): each card is the mod Surprise me makes from one seed
 * (`surprise/surprise.ts`, unchanged), rolled for an empty mod in the showcase namespace, with
 * what the card shows: the mod's name, one line in words of what it makes, the names of its
 * things, a drawn picture (its things' pictures laid out as the Showcase's drawn stills are,
 * `composeStill`) and, when it has a block or a spawn egg, a short clip for the Showcase's
 * player (a showcase clip over the idea's own bundle as an example). Presentation over Surprise
 * me's output, never content: Make this rolls the same seed again for the new mod.
 *
 * - {@link rollIdea} is cached by seed and target (a promise, so two cards asking at once share
 *   it), and keeps at most {@link IDEA_CACHE} ideas.
 * - Rolls run one at a time ({@link queueIdea}), the newest request first, so scrolling fast
 *   never queues work for cards already gone.
 *
 * @packageDocumentation
 */

import { createEmptyProject, type Json } from '@msm/core';
import type {
  ContentBundle,
  ContentBundleElement,
  ExampleProject,
  ProjectStarter,
  Target,
} from '@msm/plugin-api';
import type { RgbaImage } from '../components/texture-editor/pixels';
import { imageDataUrl } from '../components/texture-editor/png-canvas';
import {
  type ClipBlock,
  type ClipStep,
  SHOWCASE_NAMESPACE,
  type ShowcaseClip,
} from '../showcase/clip';
import { CANVAS_CODEC, composeStill, type StillCodec } from '../showcase/drawn-still';
import { rollSurprise, type SurpriseMod } from '../surprise/surprise';

/** What rolling an idea needs (the session's library, target and kinds). */
export interface IdeaInput {
  readonly starters: readonly ProjectStarter[];
  readonly target: Target;
  isKnownKind(kind: string): boolean;
  /** Whether a rule book may be added. */
  readonly rules: boolean;
}

/** One idea card's content. */
export interface Idea {
  readonly seed: number;
  /** The mod's name ("Ruby Mod"), the name Make this starts with. */
  readonly name: string;
  /** What it makes, in words ("An ore with its gem and block, a pet and sparkles."). */
  readonly line: string;
  /** The shown names of its things ("Ruby Ore", "Ruby Fox"…). */
  readonly makes: readonly string[];
  /** Its things' first pictures, at most three, for the drawn picture. */
  readonly pictures: readonly Uint8Array[];
  /** The things' bundles as one (namespace `showcase`), for the clip. */
  readonly bundle: ContentBundle;
  /** The clip, or `null` when the idea has no block or spawn egg to show. */
  readonly clip: ShowcaseClip | null;
  /** The bundle as an example, for the Showcase's clip player. */
  readonly example: ExampleProject;
}

/** At most this many ideas are kept. */
export const IDEA_CACHE = 120;

/** The clip id of the idea of `seed`. */
export function ideaClipId(seed: number): string {
  return `idea-${seed}`;
}

const capitalise = (text: string): string =>
  text === '' ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;

/** "a, b and c" (no Oxford comma). */
export function listInWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The line of a rolled mod: its things in words, and its rule. */
export function ideaLine(mod: SurpriseMod): string {
  const parts = mod.things.map((thing) => thing.what);
  if (mod.rule !== null) parts.push('a lucky rule');
  return parts.length === 0 ? 'A small mod to start from.' : `${capitalise(listInWords(parts))}.`;
}

type JsonObject = { [key: string]: Json };
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The things' bundles as one: an element two things share (the names file, a tag) is merged
 * (a tag's `values` joined, other objects' missing keys added), never listed twice; pictures
 * by path, first one kept.
 */
export function joinBundles(bundles: readonly ContentBundle[]): ContentBundle {
  const elements: ContentBundleElement[] = [];
  const byId = new Map<string, ContentBundleElement>();
  for (const bundle of bundles) {
    for (const entry of bundle.elements) {
      const known = byId.get(entry.id);
      if (known === undefined) {
        const copy = { ...entry };
        byId.set(entry.id, copy);
        elements.push(copy);
        continue;
      }
      if (!isObject(known.data) || !isObject(entry.data)) continue;
      const merged: JsonObject = { ...entry.data, ...known.data };
      const a = known.data.values;
      const b = entry.data.values;
      if (Array.isArray(a) && Array.isArray(b)) {
        const seen = new Set(a.map((value) => JSON.stringify(value)));
        merged.values = [...a, ...b.filter((value) => !seen.has(JSON.stringify(value)))];
      }
      known.data = merged;
    }
  }
  const assets = new Map<string, ContentBundle['assets'][number]>();
  for (const bundle of bundles) {
    for (const asset of bundle.assets) {
      const key = `${asset.namespace}\u0000${asset.path}`;
      if (!assets.has(key)) assets.set(key, asset);
    }
  }
  return { elements, assets: [...assets.values()] };
}

/** The quick flat ground of grass over dirt and stone, no trees (first air at y 9). */
const GRASS = {
  kind: 'quick',
  options: {
    shape: 'flat',
    layers: [
      { block: 'minecraft:grass_block[snowy=false]', thickness: 1 },
      { block: 'minecraft:dirt', thickness: 3 },
      { block: 'minecraft:stone', thickness: 4 },
      { block: 'minecraft:bedrock', thickness: 1 },
    ],
    water: false,
    waterLevel: 4,
    trees: 'none',
    seed: 3,
  },
} as const;
/** The first air layer of {@link GRASS}. */
const AIR = 9;
/** At most this many of the idea's blocks are shown. */
const CLIP_BLOCKS = 4;

const local = (id: string): string =>
  id.startsWith(`${SHOWCASE_NAMESPACE}:`) ? `./${id.slice(SHOWCASE_NAMESPACE.length + 1)}` : id;

/**
 * The clip of an idea: its plain blocks (blocks of no special type, at most four) stand as
 * short pillars in a row, one hatched from its spawn egg wanders in front, and the camera turns
 * slowly round them. `null` when it has neither a plain block nor a spawn egg.
 */
export function ideaClip(seed: number, name: string, bundle: ContentBundle): ShowcaseClip | null {
  const blocks = bundle.elements
    .filter(
      (entry) =>
        entry.kind === 'msm:block' &&
        entry.id.startsWith(`${SHOWCASE_NAMESPACE}:`) &&
        isObject(entry.data) &&
        entry.data.type === undefined,
    )
    .slice(0, CLIP_BLOCKS)
    .map((entry) => local(entry.id));
  const egg = bundle.elements.find(
    (entry) =>
      entry.kind === 'msm:item' &&
      entry.id.startsWith(`${SHOWCASE_NAMESPACE}:`) &&
      entry.id.endsWith('_spawn_egg'),
  );
  if (blocks.length === 0 && egg === undefined) return null;
  const setup: ClipBlock[] = [];
  const left = 24 - blocks.length;
  blocks.forEach((block, index) => {
    const x = left + index * 2;
    const height = 1 + (index % 2);
    for (let y = AIR; y < AIR + height; y += 1) setup.push({ pos: { x, y, z: 22 }, state: block });
  });
  const steps: ClipStep[] =
    egg === undefined
      ? []
      : [
          {
            tick: 10,
            action: {
              type: 'use',
              pos: { x: 24, y: AIR - 1, z: 26 },
              face: 'up',
              item: local(egg.id),
            },
          },
        ];
  return {
    id: ideaClipId(seed),
    title: name,
    sentence: name,
    exampleId: ideaClipId(seed),
    make: { type: 'example' },
    ground: GRASS,
    player: { x: 36.5, y: AIR, z: 38.5 },
    setup,
    steps,
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: { x: 24.5, y: AIR + 3.5, z: 31.5 }, yaw: 180, pitch: 18 },
        { tick: 100, eye: { x: 30.5, y: AIR + 4, z: 29.5 }, yaw: 140, pitch: 20 },
        { tick: 200, eye: { x: 18.5, y: AIR + 4, z: 29.5 }, yaw: 220, pitch: 20 },
      ],
    },
    captions: [{ start: 2, end: 70, text: name }],
    stillAt: 60,
    length: 200,
  };
}

/** The bundle as an example for the clip player (built for the showcase namespace already). */
export function ideaExample(seed: number, name: string, bundle: ContentBundle): ExampleProject {
  return {
    id: ideaClipId(seed),
    title: name,
    description: name,
    kind: 'msm:block',
    category: 'Ideas',
    requiresKinds: [],
    build: () => bundle,
  };
}

/** Rolls the idea of `seed` (no cache). */
export async function makeIdea(input: IdeaInput, seed: number): Promise<Idea> {
  const project = createEmptyProject(SHOWCASE_NAMESPACE);
  project.namespaces.push({ name: SHOWCASE_NAMESPACE, elements: [], assets: [] });
  let count = 0;
  const mod = await rollSurprise({
    seed,
    themeId: null,
    starters: input.starters,
    target: input.target,
    namespace: SHOWCASE_NAMESPACE,
    project,
    isKnownKind: (kind) => input.isKnownKind(kind),
    rules: input.rules,
    newSetId: () => {
      count += 1;
      return `idea-${seed}-${count}`;
    },
  });
  const makes: string[] = [];
  for (const thing of mod.things) {
    for (const name of thing.makes) if (!makes.includes(name)) makes.push(name);
  }
  const pictures = mod.things
    .flatMap((thing) => (thing.pictures[0] === undefined ? [] : [thing.pictures[0].bytes]))
    .slice(0, 3);
  const bundle = joinBundles(mod.things.map((thing) => thing.bundle));
  return {
    seed,
    name: mod.modName,
    line: ideaLine(mod),
    makes,
    pictures,
    bundle,
    clip: ideaClip(seed, mod.modName, bundle),
    example: ideaExample(seed, mod.modName, bundle),
  };
}

const cache = new Map<string, Promise<Idea>>();

/** Forgets every idea (tests). */
export function clearIdeas(): void {
  cache.clear();
  pictures.clear();
  waiting.length = 0;
}

/** The idea of `seed` on the input's target, rolled once and kept (at most {@link IDEA_CACHE}). */
export function rollIdea(input: IdeaInput, seed: number): Promise<Idea> {
  const key = `${seed}\u0000${input.target.id}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = makeIdea(input, seed);
  cache.set(key, made);
  made.catch(() => {
    if (cache.get(key) === made) cache.delete(key);
  });
  while (cache.size > IDEA_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return made;
}

// One at a time ----------------------------------------------------------------------------

interface Waiting {
  readonly run: () => Promise<void>;
  cancelled: boolean;
}
const waiting: Waiting[] = [];
let running = false;

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      // The newest request first: the cards the user is looking at now.
      const next = waiting.pop();
      if (next === undefined) break;
      if (next.cancelled) continue;
      await next.run();
      // Let the page draw between rolls.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    running = false;
  }
}

/**
 * Rolls the idea of `seed` in turn with the other cards' (one at a time, newest first) and
 * calls `done` with it, or `failed`. Returns the cancel: a card that goes away before its turn
 * costs nothing.
 */
export function queueIdea(
  input: IdeaInput,
  seed: number,
  done: (idea: Idea) => void,
  failed: (error: unknown) => void,
): () => void {
  let live = true;
  const entry: Waiting = {
    cancelled: false,
    run: () =>
      rollIdea(input, seed).then(
        (idea) => {
          if (live) done(idea);
        },
        (error: unknown) => {
          if (live) failed(error);
        },
      ),
  };
  waiting.push(entry);
  void drain();
  return () => {
    live = false;
    entry.cancelled = true;
  };
}

// The drawn picture ------------------------------------------------------------------------

/** The picture area of a card, in CSS pixels (the Showcase's 16 by 9). */
export const IDEA_PICTURE_WIDTH = 256;
export const IDEA_PICTURE_HEIGHT = 144;

const pictures = new Map<string, Promise<string>>();

/**
 * The idea's drawn picture as a PNG `data:` URL, at `scale` device pixels per CSS pixel (a
 * whole number, so its pixels land on the screen's): the things' pictures side by side, each
 * scaled by a whole number without smoothing (`composeStill`). Kept per seed and scale.
 */
export function ideaPicture(
  idea: Idea,
  scale: number,
  codec: StillCodec = CANVAS_CODEC,
): Promise<string> {
  const whole = Math.max(1, Math.min(2, Math.round(scale)));
  const key = `${idea.seed}\u0000${whole}`;
  const hit = pictures.get(key);
  if (hit !== undefined) return hit;
  const made = (async () => {
    const decoded: RgbaImage[] = [];
    for (const bytes of idea.pictures) {
      try {
        decoded.push(await codec.decode(bytes));
      } catch {
        // A picture that cannot be read is left out.
      }
    }
    const image = composeStill(decoded, IDEA_PICTURE_WIDTH * whole, IDEA_PICTURE_HEIGHT * whole);
    return imageDataUrl(codec.encode(image));
  })();
  pictures.set(key, made);
  made.catch(() => {
    if (pictures.get(key) === made) pictures.delete(key);
  });
  while (pictures.size > IDEA_CACHE) {
    const oldest = pictures.keys().next().value;
    if (oldest === undefined) break;
    pictures.delete(oldest);
  }
  return made;
}
