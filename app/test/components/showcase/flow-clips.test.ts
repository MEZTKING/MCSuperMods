/**
 * The gallery's flow cards (ADR 0129 D1, D2): a card for every library starter and Creator flow,
 * naming the example the library names for it (`FLOW_EXAMPLE_IDS`); every clip passes
 * `validateClip` against its example's own blocks and items and plays to its end on both targets
 * with every step run and no problem; every card has a drawn picture the art generator draws.
 */

import {
  ART_RECIPE_IDS,
  artLookPng,
  FLOW_EXAMPLE_IDS,
  libraryExamples,
  libraryStarters,
} from '@msm/plugin-library';
import { SCRIPT_API } from '@msm/plugin-scripting';
import { type CompiledScript, inProcessRunner, type ScriptModuleFn } from '@msm/sim';
import { mat4 } from 'gl-matrix';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { validateClip } from '../../../src/renderer/src/showcase/clip';
import { ClipPlayer } from '../../../src/renderer/src/showcase/clip-player';
import { FLOW_CARDS, flowClips } from '../../../src/renderer/src/showcase/flow-clips';
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

/** Words of an info line that says an action did not work. */
const FAILED = /\bnot\b|cannot|can't|nothing|no such|has none/i;

/** The failure lines a clip expects: the plane is put down empty and given coal (tick 12). */
const EXPECTED_FAILURES: Readonly<Record<string, readonly string[]>> = {
  'flow-vehicle-plane': ['Sky Hopper needs fuel and has none yet'],
};

/** Whether a block is in the view of `pose` (the showcase's 70 degree, 16 by 9 projection). */
function blockInView(pose: CameraPose, x: number, y: number, z: number): boolean {
  const projection = mat4.perspective(mat4.create(), (70 * Math.PI) / 180, 320 / 180, 0.1, 500);
  const clip = mat4.multiply(mat4.create(), projection, viewMatrixFor(pose));
  return boxInFrustum(frustumPlanes(clip), x, y, z, x + 1, y + 1, z + 1);
}

const players: ClipPlayer[] = [];
afterEach(() => {
  for (const player of players.splice(0)) player.dispose();
});

/** The flow clips of their own (the reused showcase clips are played by `showcases.test.ts`). */
const OWN_CLIPS = flowClips().filter((clip) => clip.id.startsWith('flow-'));

describe('the flow cards', () => {
  it('has a card for every starter and flow, naming the library example for it', () => {
    expect(Object.keys(FLOW_CARDS).sort()).toEqual(
      libraryStarters.map((starter) => starter.id).sort(),
    );
    for (const [flowId, card] of Object.entries(FLOW_CARDS)) {
      expect(card.flowId).toBe(flowId);
      expect(card.exampleId, flowId).toBe(FLOW_EXAMPLE_IDS[flowId] ?? null);
      if (card.clip !== null) expect(card.clip.exampleId, flowId).toBe(card.exampleId);
    }
    const ids = new Set(libraryExamples.map((example) => example.id));
    for (const card of Object.values(FLOW_CARDS)) {
      if (card.exampleId !== null) expect(ids.has(card.exampleId), card.exampleId).toBe(true);
    }
  });

  it('opens the card own flow from its clip', () => {
    for (const card of Object.values(FLOW_CARDS)) {
      if (card.clip === null || !card.clip.id.startsWith('flow-')) continue;
      const starter = libraryStarters.find((entry) => entry.id === card.flowId);
      expect(card.clip.make, card.flowId).toEqual(
        starter?.creator === undefined
          ? { type: 'flows', flowIds: [], starterIds: [card.flowId] }
          : { type: 'flows', flowIds: [card.flowId] },
      );
    }
  });

  it('draws a picture for every card', () => {
    for (const card of Object.values(FLOW_CARDS)) {
      expect(ART_RECIPE_IDS, card.flowId).toContain(card.picture.recipe);
      const png = artLookPng(card.picture);
      expect([...png.subarray(1, 4)].map((byte) => String.fromCharCode(byte)).join('')).toBe('PNG');
    }
  });

  it('says what each clip shows in plain words, with no ids', () => {
    for (const clip of OWN_CLIPS) {
      const words = [clip.title, clip.sentence, ...clip.captions.map((one) => one.text)];
      for (const text of words) expect(text, clip.id).not.toMatch(/[a-z0-9][:_][a-z0-9]/);
      expect(clip.sentence.endsWith('.'), clip.id).toBe(true);
    }
    expect(new Set(OWN_CLIPS.map((clip) => clip.id)).size).toBe(OWN_CLIPS.length);
  });
});

describe('every flow clip', () => {
  for (const target of TARGETS) {
    for (const clip of OWN_CLIPS) {
      it(`${clip.id} validates and plays to its end on ${target.id}`, async () => {
        const example = await filesOf(clip.exampleId, target);
        expect(example.problems).toEqual([]);
        expect(validateClip(clip, example.ids)).toEqual([]);
        const player = new ClipPlayer({ clip, example, scripts: SCRIPTS });
        players.push(player);
        await player.whenReady();
        // At the still, the subject is there: a block of the example's, its mob or its vehicle.
        let subject = false;
        while (player.tick < clip.length) {
          player.stepTick();
          if (player.tick !== clip.stillAt) continue;
          const source = player.area.source;
          if (clip.camera.type === 'follow') subject = source.entities.snapshots().length > 0;
          else if (clip.camera.type === 'driver') subject = source.vehicles.snapshots().length > 0;
          else {
            // A block of the example's in the camera's view.
            const world = source.world;
            const pose = player.camera();
            for (let y = 0; y < world.sizeY && !subject; y += 1) {
              for (let z = 0; z < world.sizeZ && !subject; z += 1) {
                for (let x = 0; x < world.sizeX && !subject; x += 1) {
                  subject =
                    world.get({ x, y, z })?.name.startsWith('showcase:') === true &&
                    blockInView(pose, x, y, z);
                }
              }
            }
          }
        }
        expect(subject, 'the subject at the still').toBe(true);
        expect(player.problems).toEqual([]);
        expect(player.records.map((record) => record.tick)).toEqual(
          clip.steps.map((step) => step.tick),
        );
        expect(
          player.lines
            .filter(
              (line) =>
                line.kind === 'skipped' ||
                (line.kind === 'info' &&
                  FAILED.test(line.text) &&
                  !(EXPECTED_FAILURES[clip.id] ?? []).some((part) => line.text.includes(part))),
            )
            .map((line) => `${line.kind}: ${line.text}`),
        ).toEqual([]);
      }, 30_000);
    }
  }
});
