/**
 * The showcase list (B567, ADR 0118 D12, D14): the ten cards in order, their words and Make this;
 * every clip passes `validateClip` against its example; every example and flow exists in the
 * library on both targets; every clip plays to its end on both targets with every step as
 * expected, no problem and no "Only in Minecraft" line it does not expect; and the clip's
 * subject (its first project block, or its first mob or vehicle) is in the camera's view at
 * `stillAt`.
 *
 * The world cards (B588, ADR 0119 D12) play on a generated ground: the real terrain engine over
 * the example's own files, in a worker run in the test's thread. Their land is in, in full, before
 * the first tick; the ground's notes are the expected ones on each target; the camera never sits
 * inside the land; and at `stillAt` each block the card is about (sand, water and grass; snow;
 * lava and shroomlight) is the first thing a line from the eye meets somewhere in the view.
 */

import type { Target } from '@msm/plugin-api';
import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { SCRIPT_API } from '@msm/plugin-scripting';
import { type CompiledScript, inProcessRunner, type ScriptModuleFn } from '@msm/sim';
import * as terrain from '@msm/terrain';
import { mat4 } from 'gl-matrix';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { creatorFlows } from '../../../src/renderer/src/components/creator/creator-model';
import { VEHICLE_FLOW_IDS } from '../../../src/renderer/src/components/home/tiles';
import { type ShowcaseClip, validateClip } from '../../../src/renderer/src/showcase/clip';
import { ClipPlayer } from '../../../src/renderer/src/showcase/clip-player';
import type { ExampleFiles } from '../../../src/renderer/src/showcase/example-files';
import {
  SHOWCASES,
  showcaseModName,
  showcasesFor,
} from '../../../src/renderer/src/showcase/showcases';
import { TerrainClient } from '../../../src/renderer/src/terrain/client';
import { GENERATED_WORDS } from '../../../src/renderer/src/tryit/grounds';
import {
  boxInFrustum,
  type CameraPose,
  frustumPlanes,
  viewMatrixFor,
} from '../../../src/renderer/src/tryit/render/camera';
import type {
  TranspileOutcome,
  TryItScripts,
} from '../../../src/renderer/src/tryit/session-source';
import { type LocalWorker, localWorker } from '../terrain/fake-engine';
import { filesOf, TARGETS } from './showcase-fixture';

/** The "Only in Minecraft" lines each clip may give (parts of the line), from B565's runs. */
const ONLY_IN_MINECRAFT: Readonly<Record<string, readonly string[]>> = {
  'wood-set': [],
  pet: ["Ember Fox's goals"],
  crop: ['the preview plants it on anything'],
  machine: [],
  vehicle: ['Tank'],
  portal: ['the vanilla particle minecraft:dust'],
  sparkles: ['firefly_glow stopping on blocks', 'the vanilla particle minecraft:dust'],
  trader: ["Roadside Merchant's goals"],
  fluid: ['in the preview it stays where you pour it', 'Bucket of Oil empties'],
  rules: ['World.dropItem', 'Player.showActionBar'],
  'world-islands': [],
  'world-mountains': [],
  'world-caves': [],
};

/** The world cards (B588), in order. */
const WORLD_CARDS = ['world-islands', 'world-mountains', 'world-caves'] as const;

/** What each world card is about: every one of these blocks is seen at `stillAt`. */
const WORLD_SUBJECTS: Readonly<Record<string, readonly string[]>> = {
  'world-islands': ['minecraft:sand', 'minecraft:water', 'minecraft:grass_block'],
  'world-mountains': ['minecraft:snow_block', 'minecraft:stone'],
  'world-caves': ['minecraft:lava', 'minecraft:shroomlight', 'minecraft:deepslate'],
};

/**
 * The generated ground's notes for each world card: the three lines every generated ground
 * gives, the borders line where the target's biome layout is about right (26.4), and the cut top
 * for the caves (their rock roof is above the window).
 */
function worldNotes(id: string, target: Target): string[] {
  const always = [GENERATED_WORDS.aboutRight, GENERATED_WORDS.carved, GENERATED_WORDS.shaped];
  const borders = target.worldgen.terrainPreview?.approximate.includes('biome_layout') === true;
  switch (id) {
    case 'world-islands':
    case 'world-mountains':
      return borders ? [...always, GENERATED_WORDS.borders] : always;
    case 'world-caves':
      return [...always, GENERATED_WORDS.cut];
    default:
      return [];
  }
}

/** Words of an info line that says an action did not work. */
const FAILED = /\bnot\b|cannot|can't|nothing|no such/i;

/** Deepslate's projection (`Renderer.getPerspective`): 70 degrees, the clip's 16 by 9 box. */
function projection(): mat4 {
  return mat4.perspective(mat4.create(), (70 * Math.PI) / 180, 320 / 180, 0.1, 500);
}

function inView(pose: CameraPose, box: readonly [number, number, number, number, number, number]) {
  const clip = mat4.multiply(mat4.create(), projection(), viewMatrixFor(pose));
  return boxInFrustum(frustumPlanes(clip), ...box);
}

const compile = (script: CompiledScript): ScriptModuleFn =>
  new Function('exports', 'require', 'module', 'msm', `${script.js}\n`) as ScriptModuleFn;
const SCRIPTS: TryItScripts = {
  transpile: async (source): Promise<TranspileOutcome> => ({
    js: ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        downlevelIteration: true,
        alwaysStrict: true,
      },
    }).outputText,
  }),
  api: SCRIPT_API,
  runner: () => inProcessRunner(compile),
};

const players: ClipPlayer[] = [];
afterEach(() => {
  for (const player of players.splice(0)) player.dispose();
});

/**
 * A clip's player, ready to play: a generated ground's land comes from the real engine in a
 * worker run in the test's thread, which is run until the land is in.
 */
async function readyPlayer(clip: ShowcaseClip, example: ExampleFiles): Promise<ClipPlayer> {
  let local: LocalWorker | null = null;
  const terrainClient =
    clip.ground.kind === 'generated'
      ? new TerrainClient({
          createWorker: () => {
            local = localWorker(terrain);
            return local.worker;
          },
        })
      : undefined;
  const player = new ClipPlayer({
    clip,
    example,
    scripts: SCRIPTS,
    ...(terrainClient === undefined ? {} : { terrain: terrainClient }),
  });
  players.push(player);
  if (terrainClient !== undefined) {
    for (let i = 0; i < 400 && !player.groundIn; i += 1) {
      await (local as LocalWorker | null)?.flush();
      await new Promise((done) => setTimeout(done, 0));
      if (player.problems.length > 0) break;
    }
    expect(player.problems, clip.id).toEqual([]);
    expect(player.groundIn, `${clip.id}: the land is in`).toBe(true);
  }
  await player.whenReady();
  return player;
}

/** The block a line from `eye` to the middle of `cell` meets first, or `null` for none. */
function firstMet(
  player: ClipPlayer,
  eye: { x: number; y: number; z: number },
  cell: { x: number; y: number; z: number },
): string | null {
  const world = player.area.source.world;
  const to = { x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 };
  const length = Math.hypot(to.x - eye.x, to.y - eye.y, to.z - eye.z);
  const steps = Math.ceil(length / 0.05);
  let last = '';
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const at = {
      x: Math.floor(eye.x + (to.x - eye.x) * t),
      y: Math.floor(eye.y + (to.y - eye.y) * t),
      z: Math.floor(eye.z + (to.z - eye.z) * t),
    };
    const key = `${at.x},${at.y},${at.z}`;
    if (key === last) continue;
    last = key;
    const state = world.get(at);
    if (state !== null && state.name !== 'minecraft:air') return state.name;
  }
  return null;
}

/** Whether a block named `name` is seen from `pose`: in the view and met first from the eye. */
function seesBlock(player: ClipPlayer, pose: CameraPose, name: string): boolean {
  const world = player.area.source.world;
  for (let y = 0; y < world.sizeY; y += 1) {
    for (let z = 0; z < world.sizeZ; z += 1) {
      for (let x = 0; x < world.sizeX; x += 1) {
        if (world.get({ x, y, z })?.name !== name) continue;
        if (!inView(pose, [x, y, z, x + 1, y + 1, z + 1])) continue;
        if (firstMet(player, pose.eye, { x, y, z }) === name) return true;
      }
    }
  }
  return false;
}

/** The subject's box at the moment: the first mob or vehicle, or the first project block. */
function subjectBox(
  player: ClipPlayer,
): readonly [number, number, number, number, number, number] | null {
  const { clip } = player;
  const source = player.area.source;
  if (clip.camera.type === 'driver') {
    const one = source.vehicles.snapshots()[0];
    if (one === undefined) return null;
    const { x, y, z } = one.position;
    return [x - 1, y, z - 1, x + 1, y + 1.5, z + 1];
  }
  if (clip.camera.type === 'follow') {
    const mob = source.entities.snapshots()[clip.camera.mob];
    if (mob === undefined) return null;
    const { x, y, z } = mob.position;
    return [x - 0.3, y, z - 0.3, x + 0.3, y + 0.8, z + 0.3];
  }
  const places = [
    ...clip.setup.map((block) => block.pos),
    ...clip.steps.flatMap((step) => ('pos' in step.action ? [step.action.pos] : [])),
  ];
  for (const pos of places) {
    for (const dy of [0, 1]) {
      const at = { x: pos.x, y: pos.y + dy, z: pos.z };
      if (source.world.get(at)?.name.startsWith('showcase:') === true) {
        return [at.x, at.y, at.z, at.x + 1, at.y + 1, at.z + 1];
      }
    }
  }
  return null;
}

describe('the showcase list', () => {
  it('has the ten cards of the plan, then the three world cards, in order', () => {
    expect(SHOWCASES.map((clip) => [clip.title, clip.exampleId])).toEqual([
      ['A set of wood', 'example_msm_wood_set'],
      ['A pet', 'example_msm_tameable_pet'],
      ['Plants that grow', 'example_msm_crop'],
      ['A machine', 'example_msm_ore_crusher'],
      ['A vehicle', 'example_msm_vehicle'],
      ['A portal', 'example_msm_sky_portal'],
      ['Sparkles', 'example_msm_firefly_jar'],
      ['A trader', 'example_msm_roadside_merchant'],
      ['A liquid of your own', 'example_msm_fluid'],
      ['Rules: a lucky block', 'example_msm_rules'],
      ['A world of islands', 'example_world_coral_isles'],
      ['A world of tall mountains', 'example_world_frost_peaks'],
      ['A world of caves', 'example_world_ember_caverns'],
    ]);
    expect(new Set(SHOWCASES.map((clip) => clip.id)).size).toBe(SHOWCASES.length);
  });

  it('opens the flow of each card, the vehicle picker for the vehicle and the example for Rules', () => {
    expect(SHOWCASES.map((clip) => clip.make)).toEqual([
      { type: 'flows', flowIds: ['wood-set'] },
      { type: 'flows', flowIds: ['pet'] },
      { type: 'flows', flowIds: ['crop'] },
      { type: 'flows', flowIds: ['machine'] },
      { type: 'flows', flowIds: VEHICLE_FLOW_IDS },
      { type: 'flows', flowIds: ['portal'] },
      { type: 'flows', flowIds: ['particle'] },
      { type: 'flows', flowIds: ['wandering-merchant'] },
      { type: 'flows', flowIds: ['fluid'] },
      { type: 'example' },
      { type: 'flows', flowIds: ['world-islands'] },
      { type: 'flows', flowIds: ['world-mountains'] },
      { type: 'flows', flowIds: ['world-caves'] },
    ]);
  });

  it('plays the world cards on a generated ground of their example, named in plain words', () => {
    const worlds = SHOWCASES.filter((clip) => clip.ground.kind === 'generated');
    expect(worlds.map((clip) => clip.id)).toEqual([...WORLD_CARDS]);
    expect(worlds.map((clip) => [clip.sentence, showcaseModName(clip)])).toEqual([
      ['Your own world: small sandy islands in a wide sea.', 'Island Mod'],
      ['Your own world: snowy peaks as tall as the sky allows.', 'Mountain Mod'],
      ['Your own world: caves under a roof of rock, with lava lakes.', 'Cave Mod'],
    ]);
    for (const clip of worlds) {
      expect(clip.steps, clip.id).toEqual([]);
      // What only the game does is said as "… in the game" (ADR 0118 D11).
      expect(clip.captions.length, clip.id).toBeGreaterThan(0);
    }
    expect(worlds[0]?.captions.map((caption) => caption.text)).toContain(
      'Its jungle trees grow in the game.',
    );
  });

  it('says what it shows in plain words, with no ids', () => {
    for (const clip of SHOWCASES) {
      const words = [clip.title, clip.sentence, ...clip.captions.map((caption) => caption.text)];
      for (const text of words) expect(text, clip.id).not.toMatch(/[a-z0-9][:_][a-z0-9]/);
      expect(clip.sentence.endsWith('.'), clip.id).toBe(true);
    }
  });

  for (const target of TARGETS) {
    it(`finds every example and flow in the library on ${target.id}`, () => {
      expect(showcasesFor(target, libraryExamples).map((clip) => clip.id)).toEqual(
        SHOWCASES.map((clip) => clip.id),
      );
      const flows = new Set(
        creatorFlows(libraryStarters, target)
          .filter((flow) => flow.unavailable === null)
          .map((flow) => flow.starter.id),
      );
      for (const clip of SHOWCASES) {
        if (clip.make.type !== 'flows') continue;
        for (const id of clip.make.flowIds) expect(flows.has(id), `${clip.id}: ${id}`).toBe(true);
      }
    });
  }
});

describe('every clip', () => {
  /** The lines of each clip on the first target, to compare the second with. */
  const firstLines = new Map<string, readonly string[]>();
  for (const [index, target] of TARGETS.entries()) {
    for (const clip of SHOWCASES) {
      it(`${clip.id} plays to its end on ${target.id}`, async () => {
        const example = await filesOf(clip.exampleId, target);
        expect(example.problems).toEqual([]);
        expect(validateClip(clip, example.ids)).toEqual([]);
        const player = await readyPlayer(clip, example);
        const generated = clip.ground.kind === 'generated';
        let subject: ReturnType<typeof subjectBox> = null;
        let pose: CameraPose | null = null;
        const seen: string[] = [];
        const inLand: number[] = [];
        while (player.tick < clip.length) {
          player.stepTick();
          if (generated) {
            const eye = player.camera().eye;
            const at = { x: Math.floor(eye.x), y: Math.floor(eye.y), z: Math.floor(eye.z) };
            const state = player.area.source.world.get(at);
            if (state !== null && state.name !== 'minecraft:air') inLand.push(player.tick);
          }
          if (player.tick === clip.stillAt) {
            pose = player.camera();
            if (generated) {
              const still = pose;
              for (const name of WORLD_SUBJECTS[clip.id] ?? []) {
                if (seesBlock(player, still, name)) seen.push(name);
              }
            } else {
              subject = subjectBox(player);
            }
          }
        }
        expect(player.problems).toEqual([]);
        expect(player.records.map((record) => record.tick)).toEqual(
          clip.steps.map((step) => step.tick),
        );
        const allowed = ONLY_IN_MINECRAFT[clip.id] ?? [];
        const unexpected = player.lines.filter(
          (line) =>
            (line.kind === 'onlyInMinecraft' &&
              !allowed.some((part) => line.text.includes(part))) ||
            line.kind === 'skipped' ||
            (line.kind === 'info' && FAILED.test(line.text)),
        );
        expect(unexpected.map((line) => `${line.kind}: ${line.text}`)).toEqual([]);
        if (generated) {
          // The land, the notes and the subject (B588).
          expect(player.area.generated?.state.notes).toEqual(worldNotes(clip.id, target));
          expect(inLand, 'ticks with the camera inside the land').toEqual([]);
          expect(seen).toEqual(WORLD_SUBJECTS[clip.id]);
        } else {
          // The subject is in view at the still.
          expect(subject, 'no subject at stillAt').not.toBeNull();
          expect(pose).not.toBeNull();
          if (subject !== null && pose !== null) expect(inView(pose, subject)).toBe(true);
        }
        // Both targets give the same lines (index 0 is the first target).
        if (index === 0)
          firstLines.set(
            clip.id,
            player.lines.map((line) => line.text),
          );
        else expect(player.lines.map((line) => line.text)).toEqual(firstLines.get(clip.id));
      }, 30_000);
    }
  }
});

describe('a loop', () => {
  it('plays every clip again with every step as expected after it starts over', async () => {
    const target = TARGETS[0];
    if (target === undefined) throw new Error('no target');
    for (const clip of SHOWCASES) {
      const example = await filesOf(clip.exampleId, target);
      const player = await readyPlayer(clip, example);
      player.playToEnd();
      player.stepTick();
      expect(player.loops, clip.id).toBe(1);
      player.playToEnd();
      expect(player.problems, clip.id).toEqual([]);
      expect(player.records, clip.id).toHaveLength(clip.steps.length);
    }
  }, 60_000);

  it('keeps the lucky block counter across loops, so no caption names its number', async () => {
    // The area's Clear keeps the rule's counter (script data), so the second loop says 3 and 4.
    const clip = SHOWCASES.find((one) => one.id === 'rules') as ShowcaseClip;
    expect(clip.captions.some((caption) => /\d/.test(caption.text))).toBe(false);
  });
});

describe('the view check', () => {
  it('finds a block in front of the camera and not one behind it', () => {
    const pose: CameraPose = { eye: { x: 24.5, y: 6.5, z: 30 }, yaw: 180, pitch: 18 };
    expect(inView(pose, [24, 4, 24, 25, 5, 25])).toBe(true);
    expect(inView(pose, [24, 4, 36, 25, 5, 37])).toBe(false);
    expect(inView(pose, [4, 4, 29, 5, 5, 30])).toBe(false);
  });
});
