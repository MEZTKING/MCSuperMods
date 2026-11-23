/**
 * Home's idea cards (ADR 0128 D1, D2; ADR 0129 D3): each card is the mod Surprise me's generator
 * makes from one card plan (`idea-plan.ts`: a seed, a lead flow and a theme; the generator's
 * `lead`, so the mod starts from that flow and is named after it), rolled for an empty mod in
 * the showcase namespace, with what the card shows: the mod's name, one line in words of what
 * it makes, the names of its things, a drawn picture (its things' pictures laid out as the
 * Showcase's drawn stills are, `composeStill`, at the screen's exact device pixels) and, when it
 * has a block or a spawn egg, a short clip for the Showcase's player (a showcase clip over the
 * idea's own bundle as an example). Presentation over the generator's output, never content:
 * Make this rolls the same plan again for the new mod.
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
import { CANVAS_CODEC, composeStill, firstFrame, type StillCodec } from '../showcase/drawn-still';
import { rollSurprise, type SurpriseMod, usableLeads } from '../surprise/surprise';
import { type IdeaSpec, ideaPlanner } from './idea-plan';

export type { IdeaSpec } from './idea-plan';

/** What rolling an idea needs (the session's library, target and kinds). */
export interface IdeaInput {
  readonly starters: readonly ProjectStarter[];
  readonly target: Target;
  isKnownKind(kind: string): boolean;
  /** Whether a rule book may be added. */
  readonly rules: boolean;
}

/** One idea card's content. */
export interface Idea extends IdeaSpec {
  /** The mod's name, after its lead thing ("Frost Wolf"), the name Make this starts with. */
  readonly name: string;
  /** What it makes, in words, the lead first ("A pet, with a food and sparkles."). */
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

/** The clip id of the idea of `spec`. */
export function ideaClipId(spec: IdeaSpec): string {
  return `idea-${spec.seed}-${spec.lead}-${spec.themeId}`;
}

/** The plan of card `index` of the base seed `base` for this library and target (ADR 0129 D3). */
export function ideaPlan(input: IdeaInput): (base: number, index: number) => IdeaSpec | null {
  return ideaPlanner(usableLeads(input));
}

const capitalise = (text: string): string =>
  text === '' ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;

/** "a, b and c" (no Oxford comma). */
export function listInWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The line of a rolled mod: its things in words, and its rule. A mod with a lead says the lead
 * first and the rest after "with" ("A car to drive, with a food and sparkles.").
 */
export function ideaLine(mod: SurpriseMod): string {
  const parts = mod.things.map((thing) => thing.what);
  if (mod.rule !== null) parts.push('a lucky rule');
  if (parts.length === 0) return 'A small mod to start from.';
  const led = mod.lead !== undefined && mod.things[0]?.flowId === mod.lead;
  if (!led || parts.length === 1) return `${capitalise(listInWords(parts))}.`;
  return `${capitalise(parts[0] as string)}, with ${listInWords(parts.slice(1))}.`;
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
export function ideaClip(spec: IdeaSpec, name: string, bundle: ContentBundle): ShowcaseClip | null {
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
    id: ideaClipId(spec),
    title: name,
    sentence: name,
    exampleId: ideaClipId(spec),
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
export function ideaExample(spec: IdeaSpec, name: string, bundle: ContentBundle): ExampleProject {
  return {
    id: ideaClipId(spec),
    title: name,
    description: name,
    kind: 'msm:block',
    category: 'Ideas',
    requiresKinds: [],
    build: () => bundle,
  };
}

/** Rolls the idea of `spec` (no cache). */
export async function makeIdea(input: IdeaInput, spec: IdeaSpec): Promise<Idea> {
  const { seed } = spec;
  const project = createEmptyProject(SHOWCASE_NAMESPACE);
  project.namespaces.push({ name: SHOWCASE_NAMESPACE, elements: [], assets: [] });
  let count = 0;
  const mod = await rollSurprise({
    seed,
    themeId: spec.themeId,
    lead: spec.lead,
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
    lead: spec.lead,
    group: spec.group,
    themeId: spec.themeId,
    name: mod.modName,
    line: ideaLine(mod),
    makes,
    pictures,
    bundle,
    clip: ideaClip(spec, mod.modName, bundle),
    example: ideaExample(spec, mod.modName, bundle),
  };
}

const cache = new Map<string, Promise<Idea>>();

/** Forgets every idea (tests). */
export function clearIdeas(): void {
  cache.clear();
  pictures.clear();
  waiting.length = 0;
}

/** The idea of `spec` on the input's target, rolled once and kept (at most {@link IDEA_CACHE}). */
export function rollIdea(input: IdeaInput, spec: IdeaSpec): Promise<Idea> {
  const key = `${ideaClipId(spec)}\u0000${input.target.id}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = makeIdea(input, spec);
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
 * Rolls the idea of `spec` in turn with the other cards' (one at a time, newest first) and
 * calls `done` with it, or `failed`. Returns the cancel: a card that goes away before its turn
 * costs nothing.
 */
export function queueIdea(
  input: IdeaInput,
  spec: IdeaSpec,
  done: (idea: Idea) => void,
  failed: (error: unknown) => void,
): () => void {
  let live = true;
  const entry: Waiting = {
    cancelled: false,
    run: () =>
      rollIdea(input, spec).then(
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

/**
 * The pictures of one card on one texel size: each smaller picture (an 8 by 8 particle beside
 * 16 by 16 items) is centred on a transparent square the size of the largest, so `composeStill`
 * scales them all by the same whole number. Drawn on its own, a small picture was scaled twice
 * as much as its neighbours, and a soft-edged sprite at twice their texel size read as a
 * smoothed picture beside crisp ones (the user's look at 1.5.7, ADR 0129 D3).
 */
export function oneTexelSize(images: readonly RgbaImage[]): RgbaImage[] {
  const frames = images.map(firstFrame);
  const width = Math.max(0, ...frames.map((image) => image.width));
  const height = Math.max(0, ...frames.map((image) => image.height));
  return frames.map((image) => {
    if (image.width === width && image.height === height) return image;
    const data = new Uint8ClampedArray(width * height * 4);
    const left = Math.floor((width - image.width) / 2);
    const top = Math.floor((height - image.height) / 2);
    for (let y = 0; y < image.height; y += 1) {
      const from = y * image.width * 4;
      data.set(image.data.subarray(from, from + image.width * 4), ((top + y) * width + left) * 4);
    }
    return { width, height, data };
  });
}

/** The most device pixels per CSS pixel an idea picture is drawn at. */
export const IDEA_MAX_RATIO = 3;

const pictures = new Map<string, Promise<string>>();

/**
 * The size in device pixels of an idea picture on a screen of `ratio` device pixels per CSS
 * pixel (ADR 0129 D3): exactly the picture area's device pixels, so the browser shows the
 * picture one to one and never scales it. Drawing for the ratio rounded to 1 or 2 (as before)
 * left the browser to rescale it on screens of 1.25, 1.5 or 1.75 (a 512-pixel picture in 384
 * device pixels), where texels came out uneven or filtered. The ratio is kept within 1 and
 * {@link IDEA_MAX_RATIO}.
 */
export function ideaPictureSize(ratio: number): { width: number; height: number } {
  const exact = Math.min(IDEA_MAX_RATIO, Math.max(1, Number.isFinite(ratio) ? ratio : 1));
  return {
    width: Math.round(IDEA_PICTURE_WIDTH * exact),
    height: Math.round(IDEA_PICTURE_HEIGHT * exact),
  };
}

/**
 * The idea's drawn picture as a PNG `data:` URL for a screen of `ratio` device pixels per CSS
 * pixel ({@link ideaPictureSize}): the things' pictures side by side, all scaled by the same
 * whole number of device pixels per texel ({@link oneTexelSize}) without smoothing
 * (`composeStill`), shown with
 * `image-rendering: pixelated`. Kept per card and size.
 */
export function ideaPicture(
  idea: Idea,
  ratio: number,
  codec: StillCodec = CANVAS_CODEC,
): Promise<string> {
  const size = ideaPictureSize(ratio);
  const key = `${ideaClipId(idea)}\u0000${size.width}x${size.height}`;
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
    const image = composeStill(oneTexelSize(decoded), size.width, size.height);
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
