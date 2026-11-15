/**
 * Coverage of the format (ADR 0085 D5: say it out loud): every action type of the schema's
 * `ActionType` enum is handled or logged, and every trigger field of the format is in the
 * simulation's table, fired or said. The schema and the validators are read by file path, as
 * `@msm/sim` may not depend on them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { SIM_ACTIONS, TRIGGER_SPECS } from '../../src/index.js';
import { REPO_ROOT } from '../lower-fixture.js';
import { evSource, floorAt, UP } from './helpers.js';

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

/** The values of `enum(string) ActionType { ... }` in `action.mcdoc`. */
function schemaActionTypes(): string[] {
  const text = read('packages/schemas/mcdoc/msm/action.mcdoc');
  const body = /enum\(string\) ActionType \{([\s\S]*?)\n\}/.exec(text)?.[1] ?? '';
  return [...body.matchAll(/=\s*"([a-z_]+)"/g)].map((match) => match[1] as string);
}

/** One minimal valid action of each type, to run it. */
const SAMPLES: Readonly<Record<string, JsonObject>> = {
  run_function: { function: 'ev:greet' },
  spawn_particle: { particle: { type: 'minecraft:dust', color: [1, 0, 0], scale: 1 }, count: 2 },
  set_block_state: { state: 'test:slab[type=top]', offset: [0, 1, 0] },
  give_item: { item: 'ev:ruby' },
  play_sound: { sound: 'minecraft:block.bell.use' },
  trigger_event: { event: 'other' },
  play_animation: { animation: 'wave' },
  run_script: { handler: 'ev:open_vault' },
  apply_effect: { effect: 'minecraft:speed', seconds: 1.5, amplifier: 1 },
  launch: { strength: 0.5, direction: 'horizontal' },
  damage: { amount: 2 },
  heal: { amount: 2 },
  light_portal: { portal: 'ev:gate' },
  explode: { power: 2 },
  show_hud: { hud: 'ev:mana' },
  hide_hud: { hud: 'ev:mana' },
  set_hud: { hud: 'ev:mana', value: 3 },
};

describe('the action list of the schema', () => {
  it('has a handling for every action type, and no other', () => {
    const types = schemaActionTypes();
    expect(types.length).toBeGreaterThanOrEqual(13);
    expect(Object.keys(SIM_ACTIONS).sort()).toEqual([...types].sort());
  });

  it('runs or says every action type when it fires', () => {
    for (const type of schemaActionTypes()) {
      const sample = SAMPLES[type];
      if (sample === undefined) throw new Error(`No sample action for "${type}"; add one.`);
      const block = {
        format: 1,
        components: { 'msm:on_interact': { event: 'go' } },
        events: { go: { actions: [{ type, ...sample }] }, other: { actions: [] } },
      };
      const { source } = evSource({
        files: new Map([['msm/ev/block/probe.json', JSON.stringify(block)]]),
      });
      source.act({ type: 'place', pos: floorAt(8, 8), face: 'up', hit: UP, block: 'ev:probe' });
      source.act({ type: 'use', pos: { x: 8, y: 0, z: 8 }, face: 'up', hit: UP });
      const entries = source.trace.filter((entry) => entry.action === type);
      expect(entries.length, `"${type}" left no trace`).toBeGreaterThan(0);
      if (SIM_ACTIONS[type] === 'onlyInMinecraft') {
        expect(
          entries.every((entry) => entry.kind === 'onlyInMinecraft'),
          type,
        ).toBe(true);
        expect(
          source.lines.some((line) => line.onlyInMinecraft),
          type,
        ).toBe(true);
      }
    }
  });
});

/** The `EVENT_FIELDS` paths of a validators source file, per kind constant. */
function validatorPaths(path: string): { kind: string; keys: string[] }[] {
  const text = read(path);
  const start = text.indexOf('const EVENT_FIELDS');
  const end = /\n[}\]];/.exec(text.slice(start));
  const block = text.slice(start, start + (end?.index ?? 0));
  const out: { kind: string; keys: string[] }[] = [];
  let kind = 'entity';
  for (const line of block.split('\n')) {
    const header = /\[(BLOCK|ITEM|EFFECT)_KIND\]:/.exec(line);
    if (header !== null) kind = (header[1] as string).toLowerCase();
    const list = /\[('(?:[^']+)'(?:,\s*'[^']+')*)\]/.exec(line);
    if (list === null || header !== null) continue;
    const keys = [...(list[1] as string).matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
    out.push({ kind, keys });
  }
  return out;
}

const specPaths = (owner: string): string[] =>
  TRIGGER_SPECS.filter((spec) => spec.owner === owner).map((spec) => spec.path.join('/'));

describe('the trigger table', () => {
  it("holds every trigger field of the blocks-items and entities validators' EVENT_FIELDS", () => {
    const blocksItems = validatorPaths('packages/plugins/blocks-items/src/validators.ts');
    expect(blocksItems.length).toBeGreaterThanOrEqual(18);
    for (const { kind, keys } of blocksItems) {
      expect(specPaths(kind), keys.join('/')).toContain(['components', ...keys].join('/'));
    }
    const entities = validatorPaths('packages/plugins/entities/src/validators.ts');
    expect(entities.length).toBeGreaterThanOrEqual(10);
    for (const { keys } of entities) {
      expect(specPaths('entity'), keys.join('/')).toContain(['components', ...keys].join('/'));
    }
  });

  it('holds every trigger component and event field of definition.mcdoc', () => {
    const text = read('packages/schemas/mcdoc/msm/definition.mcdoc');
    const components = new Set(
      [...text.matchAll(/"(msm:(?:on|while)_[a-z_]+)"\?:/g)].map((m) => m[1] as string),
    );
    const inTable = new Set(TRIGGER_SPECS.map((spec) => spec.path[1]));
    for (const component of components) expect(inTable, component).toContain(component);
    // Event fields outside an `msm:on_*` component (`on_open`, `on_travel`, `on_shoot`, ...).
    const fields = new Set(
      [...text.matchAll(/\n\t(on_[a-z_]+)\?: string,/g)].map((m) => m[1] as string),
    );
    const lastKeys = new Set(TRIGGER_SPECS.map((spec) => spec.path.at(-1)));
    for (const field of fields) expect(lastKeys, field).toContain(field);
  });

  it('fires or says every trigger a definition sets', () => {
    const setAt = (root: JsonObject, path: readonly string[], value: Json): void => {
      let node = root;
      for (const key of path.slice(0, -1)) {
        if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
        node = node[key] as JsonObject;
      }
      node[path.at(-1) as string] = value;
    };
    const definitions: Record<string, JsonObject> = {
      block: { format: 1, events: { e: { actions: [] } } },
      item: { format: 1, events: { e: { actions: [] } } },
      entity: {
        format: 1,
        category: 'creature',
        size: { width: 0.6, height: 1 },
        components: { 'msm:animated_model': { model: 'ev:m', texture: 'ev:m' } },
        events: { e: { actions: [] } },
      },
      effect: { format: 1, category: 'beneficial', color: 0, events: { e: { actions: [] } } },
    };
    for (const spec of TRIGGER_SPECS) setAt(definitions[spec.owner] as JsonObject, spec.path, 'e');
    // The block also gives the project effect, so its triggers are met.
    const block = definitions.block as JsonObject;
    (block.events as JsonObject).given = {
      actions: [{ type: 'apply_effect', effect: 'ev:all', seconds: 1 }],
    };
    setAt(block, ['components', 'msm:on_interact', 'event'], 'given');
    const { source } = evSource({
      files: new Map([
        ['msm/ev/block/all.json', JSON.stringify(definitions.block)],
        ['msm/ev/item/all.json', JSON.stringify(definitions.item)],
        ['msm/ev/entity/all.json', JSON.stringify(definitions.entity)],
        ['msm/ev/effect/all.json', JSON.stringify(definitions.effect)],
      ]),
    });
    source.act({ type: 'place', pos: floorAt(8, 8), face: 'up', hit: UP, block: 'ev:all' });
    source.act({ type: 'use', pos: { x: 8, y: 0, z: 8 }, face: 'up', hit: UP });
    source.act({ type: 'use', pos: floorAt(2, 2), face: 'up', hit: UP, item: 'ev:all' });
    source.act({
      type: 'use',
      pos: floorAt(30, 30),
      face: 'up',
      hit: UP,
      item: 'ev:all_spawn_egg',
    });
    const said = source.trace
      .filter((entry) => entry.kind === 'onlyInMinecraft')
      .map((entry) => entry.text);
    for (const spec of TRIGGER_SPECS.filter((one) => !one.handled)) {
      expect(
        said.some((text) => text.includes(spec.words)),
        `${spec.id} was neither fired nor said`,
      ).toBe(true);
    }
  });
});
