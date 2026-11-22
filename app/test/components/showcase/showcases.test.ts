/**
 * The showcase list (B567, ADR 0118 D12, D14): the ten cards in order, their words and Make this;
 * every clip passes `validateClip` against its example; every example and flow exists in the
 * library on both targets; every clip plays to its end on both targets with every step as
 * expected, no problem and no "Only in Minecraft" line it does not expect; and the clip's
 * subject (its first project block, or its first mob or vehicle) is in the camera's view at
 * `stillAt`.
 */

import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { SCRIPT_API } from '@msm/plugin-scripting';
import { type CompiledScript, inProcessRunner, type ScriptModuleFn } from '@msm/sim';
import { mat4 } from 'gl-matrix';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { creatorFlows } from '../../../src/renderer/src/components/creator/creator-model';
import { VEHICLE_FLOW_IDS } from '../../../src/renderer/src/components/home/tiles';
import { type ShowcaseClip, validateClip } from '../../../src/renderer/src/showcase/clip';
import { ClipPlayer } from '../../../src/renderer/src/showcase/clip-player';
import { SHOWCASES, showcasesFor } from '../../../src/renderer/src/showcase/showcases';
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
};

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
  it('has the ten cards of the plan, in order', () => {
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
    ]);
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
        const player = new ClipPlayer({ clip, example, scripts: SCRIPTS });
        players.push(player);
        await player.whenReady();
        let subject: ReturnType<typeof subjectBox> = null;
        let pose: CameraPose | null = null;
        while (player.tick < clip.length) {
          player.stepTick();
          if (player.tick === clip.stillAt) {
            subject = subjectBox(player);
            pose = player.camera();
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
        // The subject is in view at the still.
        expect(subject, 'no subject at stillAt').not.toBeNull();
        expect(pose).not.toBeNull();
        if (subject !== null && pose !== null) expect(inView(pose, subject)).toBe(true);
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
      const player = new ClipPlayer({ clip, example, scripts: SCRIPTS });
      players.push(player);
      await player.whenReady();
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
