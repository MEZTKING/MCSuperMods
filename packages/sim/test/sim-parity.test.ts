/**
 * The sim side of the parity test (ADR 0085 D10, B399): lowers `fixtures/sim-parity/project` on
 * every built-in target and plays each scenario of `fixtures/sim-parity/scenarios.json` through
 * `@msm/sim`, checking blocks, shapes, events and actions against what the runtime recorded
 * (`MsmSimParityGameTest` plays the same file in the game). Any mismatch fails with the
 * scenario's name, the step and both values.
 *
 * Steps map onto the simulation as Try it's own `LocalWorldSource` runs them, with the look of
 * each step passed straight in (the scenarios set it per click, without ticks in between):
 *
 * - `place`: `placeBlock` with the step's face, hit, yaw and pitch, then `msm:on_place`.
 * - `use`: a door, trapdoor, gate or button is used by hand (`useBlock`, then
 *   `BlockTimers.afterUse`), then `msm:on_interact`. With `item` (vanilla parity 3, B519, B520):
 *   `minecraft:bone_meal` is the Grow tool; any other item, or none, first tries the uses of the
 *   five types of ADR 0103 (`useType3`: pots, berries).
 * - `wait`: each tick runs the timers with no one in the area, then the tick triggers.
 * - `break`: `msm:on_break`, then `breakBlock`.
 *
 * The scenarios of vanilla parity 3, batch 1 (B519: strands, columns, lichen, dripleaves, the pot
 * and the double chest) were recorded in the game by B520 and are in the same file.
 *
 * Batch 2's (B540: fluid cauldrons by bucket and bottle and a fluid source mixing with lava)
 * were recorded in the game by B541 and are in the same file. In them a `place` holding a bucket
 * pours its liquid (`bucketPours`), then the mixing it starts runs, and a `use` with an item
 * first tries the cauldrons (`useCauldron`).
 *
 * Live views 2 (B614): a `use` with an item first asks the project's vanilla block rules and block
 * transformers (`VanillaBlockRules`, as `Types3Area.use` does): an axe, shovel, hoe or honeycomb
 * on a prop. Those five scenarios await their recording in the game.
 *
 * - `step_on`: on a pressure plate, one timers tick with the player's box standing on it; on any
 *   other block, its `msm:on_step` fires for the player (`TriggerEngine.blockSteppedOn`) with no
 *   tick, as in the GameTest.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addFluidBlocks,
  type BlockCatalogue,
  type BlockPos,
  BlockTimers,
  type Box,
  breakBlock,
  bucketPours,
  buildCatalogue,
  buildEntityCatalogue,
  EntityWorld,
  type Face,
  type FluidCatalogue,
  growBlock,
  mixingAt,
  mixingCandidates,
  PlayerController,
  placeBlock,
  readEventDefinitions,
  readFluids,
  type SimFiles,
  type SimLog,
  SimTrace,
  SimWorld,
  type TraceEntry,
  TriggerEngine,
  updateNeighbours,
  useBlock,
  useCauldron,
  useType3,
  VanillaBlockRules,
} from '../src/index.js';
import { builtInTargets, lowerFixture, REPO_ROOT } from './lower-fixture.js';

type Triple = readonly [number, number, number];

interface BlockExpectation {
  readonly pos: Triple;
  readonly state: string;
}

interface ShapeExpectation {
  readonly pos: Triple;
  readonly outline: readonly number[] | null;
  readonly collision: readonly number[] | null;
}

interface Expectations {
  readonly blocks?: readonly BlockExpectation[];
  readonly shapes?: readonly ShapeExpectation[];
}

type Step = { readonly expect?: Expectations } & (
  | {
      readonly step: 'place';
      readonly block: string;
      readonly pos: Triple;
      readonly face: Face;
      readonly hit: Triple;
      readonly yaw: number;
      readonly pitch: number;
    }
  | {
      readonly step: 'use';
      readonly pos: Triple;
      readonly yaw: number;
      readonly face?: Face;
      readonly item?: string;
    }
  | { readonly step: 'step_on'; readonly pos: Triple }
  | { readonly step: 'wait'; readonly ticks: number }
  | { readonly step: 'break'; readonly pos: Triple }
);

interface EventRecord {
  readonly owner: string;
  readonly event: string;
  readonly depth: number;
  readonly pos: Triple;
}

interface ActionRecord {
  readonly event: string;
  readonly type: string;
}

interface Scenario {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly Step[];
  readonly events: readonly EventRecord[];
  readonly actions: readonly ActionRecord[];
}

interface ScenarioFile {
  readonly format: number;
  readonly namespace: string;
  readonly scenarios: readonly Scenario[];
}

const FILE = JSON.parse(
  readFileSync(join(REPO_ROOT, 'fixtures/sim-parity/scenarios.json'), 'utf8'),
) as ScenarioFile;

const TARGETS = await builtInTargets();

/** The item the `use` step treats as the Grow tool (B519). */
const BONE_MEAL = 'minecraft:bone_meal';

/** Block types the player uses by hand, as `LocalWorldSource.use` does. */
const USED_BY_HAND = new Set(['door', 'trapdoor', 'fence_gate', 'button']);

/** Where the player stands: the middle of the area, far from the scenarios. */
const AWAY = { x: 24.5, y: 0, z: 24.5 };

const QUIET: SimLog = { info: () => {}, onlyInMinecraft: () => {} };

const toPos = ([x, y, z]: Triple): BlockPos => ({ x, y, z });
const toVec = ([x, y, z]: Triple) => ({ x, y, z });

/** The block state as the scenarios write it (`ns:path[a=1,b=2]`), or `null` for air. */
function parseExpected(text: string): { name: string; properties: Record<string, string> } | null {
  const open = text.indexOf('[');
  const name = open < 0 ? text : text.slice(0, open);
  if (name === 'minecraft:air') return null;
  const properties: Record<string, string> = {};
  if (open >= 0) {
    for (const pair of text.slice(open + 1, -1).split(',')) {
      if (pair === '') continue;
      const [key, value] = pair.split('=');
      properties[key as string] = value as string;
    }
  }
  return { name, properties };
}

/** A state written as the scenarios write it, with all its properties. */
function stateText(state: { name: string; properties: Readonly<Record<string, string>> } | null) {
  if (state === null) return 'minecraft:air';
  const props = Object.entries(state.properties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return props.length === 0 ? state.name : `${state.name}[${props.join(',')}]`;
}

/** The bounds of a shape's boxes in pixels, or `null` for none. */
function boundsInPixels(boxes: readonly Box[]): number[] | null {
  if (boxes.length === 0) return null;
  const out = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const box of boxes) {
    for (let i = 0; i < 3; i++) out[i] = Math.min(out[i] as number, box[i] as number);
    for (let i = 3; i < 6; i++) out[i] = Math.max(out[i] as number, box[i] as number);
  }
  return out.map((value) => Math.round(value * 16 * 1e6) / 1e6);
}

/** One scenario's area: the world and the parts of `LocalWorldSource` the steps drive. */
class ParityArea {
  readonly world = new SimWorld();
  readonly trace: SimTrace;
  private readonly timers: BlockTimers;
  private readonly triggers: TriggerEngine;
  private readonly player: PlayerController;
  private ticks = 0;

  readonly catalogue: BlockCatalogue;
  private readonly fluids: FluidCatalogue;
  private readonly rules: VanillaBlockRules;

  constructor(files: SimFiles, target: Target, catalogue: BlockCatalogue) {
    this.catalogue = catalogue;
    this.fluids = readFluids(files, target);
    this.rules = new VanillaBlockRules({
      world: this.world,
      catalogue: () => catalogue,
      log: QUIET,
      sayOnce: () => {},
      effect: () => {},
      give: () => {},
    });
    this.rules.setFiles(files);
    const shapes = catalogue;
    this.player = new PlayerController((x, y, z) => this.world.get({ x, y, z }), shapes, AWAY);
    const entities = new EntityWorld(
      this.world,
      shapes,
      buildEntityCatalogue(files, target, QUIET),
      QUIET,
    );
    this.timers = new BlockTimers(this.world, catalogue);
    this.trace = new SimTrace(QUIET, () => this.ticks);
    this.triggers = new TriggerEngine(readEventDefinitions(files, target), {
      world: this.world,
      catalogue: () => catalogue,
      player: this.player,
      entities,
      trace: this.trace,
      now: () => this.ticks,
      effect: () => {},
      chance: 'always',
    });
  }

  /** Plays one step; a line on what it did when that helps a failure message. */
  play(step: Step): string {
    switch (step.step) {
      case 'place': {
        // A bucket pours its liquid where a block would go (B540).
        const poured = bucketPours(this.fluids, step.block);
        const result = placeBlock(this.world, this.catalogue, {
          pos: toPos(step.pos),
          face: step.face,
          hit: toVec(step.hit),
          block: poured ?? step.block,
          yaw: step.yaw,
          pitch: step.pitch,
        });
        if (!result.placed) return `not placed: ${result.reason}`;
        if (poured !== undefined) {
          for (const cell of mixingCandidates(result.pos)) {
            mixingAt(this.world, this.fluids, cell, (id) => ({ name: id, properties: {} }));
          }
          return `poured at ${result.pos.x}, ${result.pos.y}, ${result.pos.z}`;
        }
        this.triggers.blockPlaced(result.pos);
        return `placed at ${result.pos.x}, ${result.pos.y}, ${result.pos.z}`;
      }
      case 'use': {
        const pos = toPos(step.pos);
        const state = this.world.get(pos);
        const block = state === null ? undefined : this.catalogue.blockFor(state.name);
        if (useCauldron(this.world, this.fluids, pos, step.item).handled) return 'used (cauldron)';
        if (step.item === BONE_MEAL) {
          growBlock(this.world, this.catalogue, QUIET, pos, () => 0);
          return 'bone meal';
        }
        if (state !== null && block !== undefined) {
          if (this.rules.use(pos, state, block, step.item)) return 'used (block rules)';
          const used = useType3(this.world, this.catalogue, block, state, pos, step.item);
          for (const change of used.changes)
            updateNeighbours(this.world, this.catalogue, change.pos);
          if (used.handled) return 'used (vanilla parity 3)';
        }
        if (block !== undefined && USED_BY_HAND.has(block.type)) {
          const result = useBlock(this.world, this.catalogue, { pos, yaw: step.yaw });
          this.timers.afterUse(pos, result);
        }
        this.triggers.blockUsed(pos);
        return 'used';
      }
      case 'wait':
        for (let i = 0; i < step.ticks; i++) {
          this.ticks += 1;
          this.timers.tick([]);
          this.triggers.tick();
        }
        return `waited ${step.ticks} ticks`;
      case 'break': {
        const pos = toPos(step.pos);
        if (this.world.get(pos) !== null) this.triggers.blockBreaking(pos);
        breakBlock(this.world, this.catalogue, pos);
        return 'broken';
      }
      case 'step_on': {
        const [x, y, z] = step.pos;
        const state = this.world.get(toPos(step.pos));
        const block = state === null ? undefined : this.catalogue.blockFor(state.name);
        if (block?.type === 'pressure_plate') {
          this.timers.tick([[x + 0.2, y, z + 0.2, x + 0.8, y + 1.8, z + 0.8]]);
          return 'stood on the plate';
        }
        this.triggers.blockSteppedOn(toPos(step.pos));
        return 'stood on the block';
      }
    }
  }
}

/** The events of a trace as the runtime records them: each trigger and each `trigger_event`. */
function eventsOf(trace: readonly TraceEntry[], namespace: string): EventRecord[] {
  const out: EventRecord[] = [];
  for (const entry of trace) {
    const owner = entry.origin.elementId;
    if (owner === undefined || !owner.startsWith(`${namespace}:`) || entry.pos === undefined) {
      continue;
    }
    const pos: Triple = [entry.pos.x, entry.pos.y, entry.pos.z];
    if (entry.kind === 'trigger' && entry.origin.eventId !== undefined) {
      out.push({ owner, event: entry.origin.eventId, depth: entry.depth ?? 1, pos });
    } else if (entry.ranEvent !== undefined) {
      out.push({ owner, event: entry.ranEvent, depth: (entry.depth ?? 1) + 1, pos });
    }
  }
  return out;
}

/** The actions of a trace in run order; an action that wrote several entries counts once. */
function actionsOf(trace: readonly TraceEntry[], namespace: string): ActionRecord[] {
  const out: ActionRecord[] = [];
  let last: TraceEntry | undefined;
  for (const entry of trace) {
    if (entry.kind === 'trigger' || entry.action === undefined) continue;
    if (entry.actionIndex === undefined || entry.origin.eventId === undefined) continue;
    if (!entry.origin.elementId?.startsWith(`${namespace}:`)) continue;
    const same =
      last !== undefined &&
      last.origin.elementId === entry.origin.elementId &&
      last.origin.eventId === entry.origin.eventId &&
      last.actionIndex === entry.actionIndex &&
      last.depth === entry.depth &&
      last.tick === entry.tick;
    last = entry;
    if (same) continue;
    out.push({ event: entry.origin.eventId, type: entry.action });
  }
  return out;
}

/** Every mismatch of one step's expectations, in words. */
function checkStep(area: ParityArea, expectations: Expectations): string[] {
  const problems: string[] = [];
  for (const wanted of expectations.blocks ?? []) {
    const actual = area.world.get(toPos(wanted.pos));
    const expected = parseExpected(wanted.state);
    let ok: boolean;
    if (expected === null) ok = actual === null;
    else
      ok =
        actual !== null &&
        actual.name === expected.name &&
        Object.entries(expected.properties).every(
          ([key, value]) => actual.properties[key] === value,
        );
    if (!ok) {
      problems.push(
        `block at ${wanted.pos.join(', ')}: expected ${wanted.state}, got ${stateText(actual)}`,
      );
    }
  }
  for (const wanted of expectations.shapes ?? []) {
    const state = area.world.get(toPos(wanted.pos));
    const outline = state === null ? null : boundsInPixels(area.catalogue.outline(state));
    const collision = state === null ? null : boundsInPixels(area.catalogue.collision(state));
    for (const [what, want, got] of [
      ['outline', wanted.outline, outline],
      ['collision', wanted.collision, collision],
    ] as const) {
      if (JSON.stringify(want) !== JSON.stringify(got)) {
        problems.push(
          `${what} shape at ${wanted.pos.join(', ')} (${stateText(state)}): expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
        );
      }
    }
  }
  return problems;
}

/** Plays a scenario; every mismatch in words, each naming the scenario and the step. */
function playScenario(
  scenario: Scenario,
  files: SimFiles,
  target: Target,
  catalogue: BlockCatalogue,
): string[] {
  const area = new ParityArea(files, target, catalogue);
  const problems: string[] = [];
  scenario.steps.forEach((step, index) => {
    const did = area.play(step);
    if (step.expect === undefined) return;
    for (const problem of checkStep(area, step.expect)) {
      problems.push(
        `${scenario.name}, step ${index + 1} (${step.step}; ${did}): ${problem} [${target.id}]`,
      );
    }
  });
  const events = eventsOf(area.trace.entries, FILE.namespace);
  if (JSON.stringify(events) !== JSON.stringify(scenario.events)) {
    problems.push(
      `${scenario.name}, events: expected ${JSON.stringify(scenario.events)}, got ${JSON.stringify(events)} [${target.id}]`,
    );
  }
  const actions = actionsOf(area.trace.entries, FILE.namespace);
  if (JSON.stringify(actions) !== JSON.stringify(scenario.actions)) {
    problems.push(
      `${scenario.name}, actions: expected ${JSON.stringify(scenario.actions)}, got ${JSON.stringify(actions)} [${target.id}]`,
    );
  }
  return problems;
}

it('reads format 1 of the sim_parity scenarios', () => {
  expect(FILE.format).toBe(1);
  expect(FILE.namespace).toBe('sim_parity');
  expect(FILE.scenarios.length).toBeGreaterThanOrEqual(30);
  expect(new Set(FILE.scenarios.map((one) => one.name)).size).toBe(FILE.scenarios.length);
});

describe.each(TARGETS.map((target) => [target.id, target] as const))(
  'sim parity on %s',
  (_id, target) => {
    let files: SimFiles;
    let catalogue: BlockCatalogue;

    beforeAll(async () => {
      const lowered = await lowerFixture('sim-parity/project', target);
      expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      files = lowered.files;
      catalogue = buildCatalogue(files, target, QUIET);
      // Project fluids' liquid blocks and cauldrons, as `LocalWorldSource` adds them (B540).
      addFluidBlocks(catalogue, readFluids(files, target));
    }, 60_000);

    it.each(FILE.scenarios.map((scenario) => [scenario.name, scenario] as const))(
      '%s',
      (_name, scenario) => {
        expect(playScenario(scenario, files, target, catalogue)).toEqual([]);
      },
    );
  },
);
