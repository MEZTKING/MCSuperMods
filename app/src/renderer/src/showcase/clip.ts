/**
 * The showcase's clip format (ADR 0118 D4, B566): a short script, as data, that the clip player
 * (`clip-player.ts`) plays in a Try it area built from one library example's lowered files.
 *
 * - Ids are written relative to the example: `./elm_planks` is `showcase:elm_planks` (the
 *   example is built for the namespace {@link SHOWCASE_NAMESPACE}); `minecraft:` ids are props.
 * - Times are simulation ticks (20 a second) from the clip's own start, never the wall clock.
 * - The setup (blocks and spawns) is in place before the first frame; steps are player actions
 *   of `@msm/sim`, a `look` or `move` the player holds until the next one, or `set` (a block
 *   state the clip puts in place, never shown as a player action).
 * - Vehicles and mobs are named by their order (0 is the first one out), not by id: ids are
 *   only known at run time (B565 Z7).
 *
 * {@link validateClip} checks a clip before it plays. Pure: no renderer, no area.
 *
 * @packageDocumentation
 */

import {
  AREA_SIZE_X,
  AREA_SIZE_Y,
  AREA_SIZE_Z,
  type Face,
  QUICK_SHAPES,
  QUICK_TREES,
  type QuickWorldOptions,
  SIM_TOOLS,
} from '@msm/sim';
import type { MakeTileAction } from '../components/home/tiles';

/** The namespace every showcased example is built for. */
export const SHOWCASE_NAMESPACE = 'showcase';

/** Simulation ticks a second. */
export const CLIP_TICKS_PER_SECOND = 20;

/** The longest a clip may loop for: 12 seconds (ADR 0118 D4). */
export const CLIP_MAX_TICKS = 12 * CLIP_TICKS_PER_SECOND;

/** A point or block position in the 48 by 32 by 48 area. */
export interface ClipPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The ground a clip plays on (Try it's grounds, B405). */
export type ClipGround =
  | { readonly kind: 'grid' }
  | { readonly kind: 'flat' }
  | { readonly kind: 'quick'; readonly options: Partial<QuickWorldOptions> };

/** A block state put in place by the setup, for example `./elm_log[axis=y]`. */
export interface ClipBlock {
  readonly pos: ClipPoint;
  readonly state: string;
}

/** A mob hatched by the setup from a spawn egg on the top face of the block at `on`. */
export interface ClipSpawn {
  readonly on: ClipPoint;
  readonly egg: string;
}

/** What a step does. */
export type ClipAction =
  /** Place a block against a face of the block at `pos`. */
  | { readonly type: 'place'; readonly pos: ClipPoint; readonly face: Face; readonly block: string }
  /** Break the block. */
  | { readonly type: 'break'; readonly pos: ClipPoint }
  /** Use (right-click) the block, with `item` in hand or an empty hand. */
  | {
      readonly type: 'use';
      readonly pos: ClipPoint;
      readonly face: Face;
      readonly item?: string;
    }
  /** Use the `mob`-th mob (0 is the first), with `item` in hand or an empty hand. */
  | { readonly type: 'interact'; readonly mob: number; readonly item?: string }
  /** Use the `vehicle`-th vehicle (0 is the first): get in, or use `item` on it. */
  | { readonly type: 'useVehicle'; readonly vehicle: number; readonly item?: string }
  /** Hold a walking or driving input until the next `move` (B565 Z7: `strafe` steers). */
  | {
      readonly type: 'move';
      readonly forward: number;
      readonly strafe: number;
      readonly jump?: boolean;
      readonly sneak?: boolean;
    }
  /** Hold a look until the next `look`; placed blocks face it (B565 Z6). */
  | { readonly type: 'look'; readonly yaw: number; readonly pitch: number }
  /** Use a Try it tool (`grow`, `power`, …) on the block. */
  | { readonly type: 'tool'; readonly tool: string; readonly pos: ClipPoint }
  /** Put a block state in place, as the clip, not the player (portals, lit fronts). */
  | { readonly type: 'set'; readonly pos: ClipPoint; readonly state: string };

/** What a step must give, checked by the player (and the showcase tests). */
export type ClipExpect =
  /**
   * A "What happened" line containing `line`, written at the step's tick or within `within`
   * ticks after it (default 0; a rule run by a script answers a tick later, B565 Z9).
   */
  | { readonly line: string; readonly within?: number }
  /**
   * The block at `at` right after the step: `state`'s id with at least its listed properties
   * (`./elm_door[open=true]`).
   */
  | { readonly at: ClipPoint; readonly state: string };

/** One step of the script. */
export interface ClipStep {
  /** The tick it runs at, from 1 to the clip's length. */
  readonly tick: number;
  readonly action: ClipAction;
  readonly expect?: readonly ClipExpect[];
}

/** A key of the camera: where the eye is and where it looks at a tick. */
export interface CameraKey {
  readonly tick: number;
  readonly eye: ClipPoint;
  /** Degrees; 0 faces south (+z), 90 faces west (-x). */
  readonly yaw: number;
  /** Degrees; negative looks up. */
  readonly pitch: number;
}

/** How the camera moves. */
export type ClipCamera =
  /** Eased between keys, yaw the short way round (`camera-path.ts`). */
  | { readonly type: 'keys'; readonly keys: readonly CameraKey[] }
  /** The driver's view of the vehicle the player sits in (`tryit/vehicles/camera.ts`). */
  | { readonly type: 'driver' }
  /**
   * Follows the `mob`-th mob: the eye `offset` from its feet, looking at it; `keys` until it is
   * out.
   */
  | {
      readonly type: 'follow';
      readonly mob: number;
      readonly offset: ClipPoint;
      readonly keys: readonly CameraKey[];
    };

/** A caption over the picture from `start` to `end` (ticks). */
export interface ClipCaption {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** What a card's **Make this** opens: a Home tile action, or the example itself (Rules). */
export type ShowcaseMake = MakeTileAction | { readonly type: 'example' };

/** One showcase clip with its card's words (ADR 0118 D4). */
export interface ShowcaseClip {
  readonly id: string;
  /** The card's title and sentence, plain words, no ids. */
  readonly title: string;
  readonly sentence: string;
  /** The library example it is drawn from. */
  readonly exampleId: string;
  readonly make: ShowcaseMake;
  readonly ground: ClipGround;
  /** Where the player's feet stand before the first step (away from what it places). */
  readonly player: ClipPoint;
  readonly setup: readonly ClipBlock[];
  readonly spawns?: readonly ClipSpawn[];
  readonly steps: readonly ClipStep[];
  readonly camera: ClipCamera;
  readonly captions: readonly ClipCaption[];
  /** The tick the still picture is taken at. */
  readonly stillAt: number;
  /** Ticks until the clip starts over; at most {@link CLIP_MAX_TICKS}. */
  readonly length: number;
}

/** An id or a block state with `./` made into the showcase namespace. */
export function clipId(text: string): string {
  return text.startsWith('./') ? `${SHOWCASE_NAMESPACE}:${text.slice(2)}` : text;
}

/** The block or item id of a state string (`./elm_log[axis=y]` gives `showcase:elm_log`). */
export function clipIdOf(text: string): string {
  const bracket = text.indexOf('[');
  return clipId(bracket === -1 ? text : text.slice(0, bracket)).trim();
}

/** What {@link validateClip} checks ids against. */
export interface ClipIds {
  /** Whether the example has the block or item (a `showcase:` id). */
  has(id: string): boolean;
}

const TOOL_IDS = new Set(SIM_TOOLS.map((tool) => tool.id));
const SHAPES: ReadonlySet<string> = new Set(QUICK_SHAPES);
const TREES: ReadonlySet<string> = new Set(QUICK_TREES);

function inArea(point: ClipPoint): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.z >= 0 &&
    point.x <= AREA_SIZE_X &&
    point.y <= AREA_SIZE_Y &&
    point.z <= AREA_SIZE_Z
  );
}

function blockInArea(point: ClipPoint): boolean {
  return (
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    Number.isInteger(point.z) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.z >= 0 &&
    point.x < AREA_SIZE_X &&
    point.y < AREA_SIZE_Y &&
    point.z < AREA_SIZE_Z
  );
}

const at = (point: ClipPoint): string => `${point.x}, ${point.y}, ${point.z}`;

/**
 * The problems of a clip, in plain words; empty when it can play. With `ids`, every
 * `showcase:` block and item the clip names must be the example's; `minecraft:` ids are props
 * and are not checked here.
 */
export function validateClip(clip: ShowcaseClip, ids?: ClipIds): string[] {
  const problems: string[] = [];
  const add = (where: string, message: string): void => {
    problems.push(`${clip.id} ${where}: ${message}`);
  };
  const checkId = (where: string, text: string): void => {
    const id = clipIdOf(text);
    const colon = id.indexOf(':');
    if (colon <= 0 || colon === id.length - 1) {
      add(where, `"${text}" is not an id (write ./name or minecraft:name)`);
      return;
    }
    if (id.startsWith(`${SHOWCASE_NAMESPACE}:`) && ids !== undefined && !ids.has(id)) {
      add(where, `the example has no ${text}`);
    }
  };
  const checkBlock = (where: string, point: ClipPoint): void => {
    if (!blockInArea(point)) add(where, `${at(point)} is not a block in the area`);
  };

  if (clip.title.trim() === '' || clip.sentence.trim() === '')
    add('card', 'needs a title and a sentence');
  if (!Number.isInteger(clip.length) || clip.length <= 0)
    add('length', 'must be a whole number of ticks');
  if (clip.length > CLIP_MAX_TICKS) {
    add('length', `${clip.length} ticks is longer than ${CLIP_MAX_TICKS} (12 seconds)`);
  }
  if (!Number.isInteger(clip.stillAt) || clip.stillAt < 0 || clip.stillAt > clip.length) {
    add('stillAt', `tick ${clip.stillAt} is not within the clip (0 to ${clip.length})`);
  }
  if (clip.ground.kind === 'quick') {
    const { shape, trees } = clip.ground.options;
    if (shape !== undefined && !SHAPES.has(shape)) add('ground', `unknown shape ${shape}`);
    if (trees !== undefined && !TREES.has(trees)) add('ground', `unknown trees ${trees}`);
  }
  if (!inArea(clip.player)) add('player', `${at(clip.player)} is outside the area`);
  clip.setup.forEach((block, index) => {
    checkBlock(`setup[${index}]`, block.pos);
    checkId(`setup[${index}]`, block.state);
  });
  (clip.spawns ?? []).forEach((spawn, index) => {
    checkBlock(`spawns[${index}]`, spawn.on);
    checkId(`spawns[${index}]`, spawn.egg);
  });
  let last = 0;
  clip.steps.forEach((step, index) => {
    const where = `steps[${index}]`;
    if (!Number.isInteger(step.tick) || step.tick < 1)
      add(where, `tick ${step.tick} must be 1 or more`);
    if (step.tick > clip.length) add(where, `tick ${step.tick} is after the end (${clip.length})`);
    if (step.tick < last) add(where, `tick ${step.tick} comes before the step above it`);
    last = Math.max(last, step.tick);
    const action = step.action;
    switch (action.type) {
      case 'place':
        checkBlock(where, action.pos);
        checkId(where, action.block);
        break;
      case 'use':
        checkBlock(where, action.pos);
        if (action.item !== undefined) checkId(where, action.item);
        break;
      case 'break':
      case 'set':
        checkBlock(where, action.pos);
        if (action.type === 'set') checkId(where, action.state);
        break;
      case 'tool':
        checkBlock(where, action.pos);
        if (!TOOL_IDS.has(action.tool)) add(where, `unknown tool ${action.tool}`);
        break;
      case 'interact':
      case 'useVehicle': {
        const index = action.type === 'interact' ? action.mob : action.vehicle;
        if (!Number.isInteger(index) || index < 0)
          add(where, `${index} is not an order (0 is the first)`);
        if (action.item !== undefined) checkId(where, action.item);
        break;
      }
      case 'move':
        if (Math.abs(action.forward) > 1 || Math.abs(action.strafe) > 1) {
          add(where, 'forward and strafe go from -1 to 1');
        }
        break;
      case 'look':
        if (Math.abs(action.pitch) > 90) add(where, 'pitch goes from -90 to 90');
        break;
    }
    for (const expect of step.expect ?? []) {
      if ('at' in expect) {
        checkBlock(`${where} expect`, expect.at);
        checkId(`${where} expect`, expect.state);
      } else if (expect.line.trim() === '') {
        add(`${where} expect`, 'an empty line matches anything');
      }
    }
  });
  const keys = clip.camera.type === 'driver' ? [] : clip.camera.keys;
  if (clip.camera.type !== 'driver' && keys.length === 0) add('camera', 'needs at least one key');
  let lastKey = -1;
  keys.forEach((key, index) => {
    const where = `camera[${index}]`;
    if (!inArea(key.eye)) add(where, `the eye ${at(key.eye)} is outside the area`);
    if (key.tick < 0 || key.tick > clip.length)
      add(where, `tick ${key.tick} is not within the clip`);
    if (key.tick <= lastKey) add(where, `tick ${key.tick} must come after the key above it`);
    if (Math.abs(key.pitch) > 90) add(where, 'pitch goes from -90 to 90');
    lastKey = key.tick;
  });
  if (
    clip.camera.type === 'follow' &&
    (!Number.isInteger(clip.camera.mob) || clip.camera.mob < 0)
  ) {
    add('camera', `${clip.camera.mob} is not an order (0 is the first)`);
  }
  clip.captions.forEach((caption, index) => {
    const where = `captions[${index}]`;
    if (caption.text.trim() === '') add(where, 'has no words');
    if (caption.start < 0 || caption.end > clip.length || caption.start >= caption.end) {
      add(where, `${caption.start} to ${caption.end} is not within the clip (0 to ${clip.length})`);
    }
  });
  return problems;
}
