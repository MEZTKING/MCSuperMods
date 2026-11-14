/**
 * Rules through lowering (ADR 0082 D3): the sample rules fixture and the library's Rules
 * examples are expanded and lowered as the view does, and their plain rules fire here; rules
 * that need a script are said "Only in Minecraft" with their rule keys.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json, Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  LocalWorldSource,
  ruleBooksFrom,
  type SimFiles,
  type WorldEvent,
} from '../../src/index.js';
import { builtInTargets, lowerFixture, REPO_ROOT } from '../lower-fixture.js';

const S = 'msm_sample_rules';
const UP = { x: 0.5, y: 1, z: 0.5 };
const floorAt = (x: number, z: number) => ({ x, y: -1, z });

/** The rule books of a project folder as `{ id, data }`, as the app's session holds them. */
function books(folder: string, namespace: string): { id: string; data: Json }[] {
  const dir = join(REPO_ROOT, folder, 'content', namespace, 'rules');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as { id: string; data: Json });
}

let target: Target;
let sample: SimFiles;
let examples: SimFiles;

beforeAll(async () => {
  // The fixture's own target, as its project file names it.
  const header = JSON.parse(
    readFileSync(join(REPO_ROOT, 'fixtures/sample-rules/msm.project.json'), 'utf8'),
  ) as { targets: string[] };
  target = (await builtInTargets()).find((one) => one.id === header.targets[0]) as Target;
  const lowered = await lowerFixture('sample-rules', target);
  expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  sample = lowered.files;
  examples = (await lowerFixture('../examples/rules', target)).files;
}, 60_000);

function areaOf(files: SimFiles, withBooks?: { id: string; data: Json }[]) {
  const source = new LocalWorldSource({
    files,
    target,
    seed: 3,
    ...(withBooks === undefined ? {} : { ruleBooks: ruleBooksFrom(withBooks) }),
  });
  const events: WorldEvent[] = [];
  source.subscribe((event) => events.push(event));
  const effects = () => events.flatMap((event) => (event.type === 'effect' ? [event.effect] : []));
  return { source, effects };
}

describe('plain rules of fixtures/sample-rules', () => {
  it('"Ring the chime" plays the chime and gives a Ruby when the Chime Block is used', () => {
    const { source, effects } = areaOf(sample, books('fixtures/sample-rules', S));
    source.act({
      type: 'place',
      pos: floorAt(10, 10),
      face: 'up',
      hit: UP,
      block: `${S}:chime_block`,
    });
    const before = source.trace.length;
    source.act({ type: 'use', pos: { x: 10, y: 0, z: 10 }, face: 'up', hit: UP });
    const entries = source.trace.slice(before);
    expect(entries.map((entry) => entry.text)).toEqual([
      'You used Chime Block, so rule "Ring the chime" ran.',
      'Played sound Chime.',
      'Gave you 1 Ruby.',
    ]);
    for (const entry of entries) {
      expect(entry.origin).toMatchObject({
        elementId: `${S}:chime_block`,
        eventId: `${S}:chime_block_rules_block_used`,
        ruleKey: 'ring_chime',
        ruleBook: `${S}:chime_block_rules`,
      });
    }
    expect(effects()).toEqual([
      expect.objectContaining({ kind: 'sound', id: 'minecraft:block.note_block.chime' }),
    ]);
    expect(source.inventory.count(`${S}:ruby`)).toBe(1);
  });

  it('names a plain rule by its trigger without the rule books', () => {
    const { source } = areaOf(sample);
    source.act({
      type: 'place',
      pos: floorAt(10, 10),
      face: 'up',
      hit: UP,
      block: `${S}:chime_block`,
    });
    source.act({ type: 'use', pos: { x: 10, y: 0, z: 10 }, face: 'up', hit: UP });
    expect(source.trace.map((entry) => entry.text)).toContain(
      'You used Chime Block, so its rules (block used) ran.',
    );
  });

  it('"Keep watch" rings, sparkles and gives Glowing every 5 seconds while a Sentinel is alive', () => {
    const { source, effects } = areaOf(sample, books('fixtures/sample-rules', S));
    source.act({
      type: 'use',
      pos: floorAt(20, 20),
      face: 'up',
      hit: UP,
      item: `${S}:sentinel_spawn_egg`,
    });
    expect(source.entities.count).toBe(1);
    for (let i = 0; i < 200; i += 1) source.tick();
    const ran = source.trace.filter((entry) => entry.kind === 'trigger');
    expect(ran).toHaveLength(2);
    expect(ran[0]?.text).toBe(
      'Sentinel\'s timer came round (every 5 seconds), so rule "Keep watch" ran.',
    );
    const shown = effects();
    expect(shown.filter((effect) => effect.kind === 'sound')).toHaveLength(2);
    expect(
      shown.filter((effect) => effect.kind === 'particle' && effect.id === 'minecraft:end_rod'),
    ).toHaveLength(10);
    expect(shown.filter((effect) => effect.kind === 'chip')).toEqual([
      expect.objectContaining({ id: 'Glowing for 3 seconds' }),
      expect.objectContaining({ id: 'Glowing for 3 seconds' }),
    ]);
  });

  it('says the rules that need a script, naming their keys', () => {
    const { source } = areaOf(sample);
    source.act({
      type: 'place',
      pos: floorAt(12, 12),
      face: 'up',
      hit: UP,
      block: `${S}:lucky_block`,
    });
    source.act({ type: 'use', pos: { x: 12, y: 0, z: 12 }, face: 'up', hit: UP });
    expect(source.trace.at(-2)?.text).toBe('You used Lucky Block, which starts rule "try_luck".');
    expect(source.trace.at(-1)).toMatchObject({
      kind: 'onlyInMinecraft',
      text: 'rule "try_luck" (it needs a script)',
      action: 'run_script',
      origin: {
        eventId: `${S}:lucky_block_rules_block_used`,
        ruleKey: 'try_luck',
        ruleBook: `${S}:lucky_block_rules`,
      },
    });
    source.act({ type: 'use', pos: floorAt(14, 14), face: 'up', hit: UP, item: `${S}:rally_horn` });
    expect(source.trace.at(-1)).toMatchObject({
      kind: 'onlyInMinecraft',
      origin: { ruleKey: 'rally' },
    });
    // The world rules start from Script API events only the game fires.
    expect(source.lines.map((line) => line.text)).toContain(
      `rules "stone_ruby", "welcome", "clear_rain" of ${S}:world_rules (they start from block.break, player.join, server.tick)`,
    );
  });
});

describe('the Rules examples of the library', () => {
  it("says the guard's and the lucky block's rules by key", () => {
    const { source } = areaOf(examples, books('examples/rules', 'msm_examples'));
    source.act({
      type: 'use',
      pos: floorAt(20, 20),
      face: 'up',
      hit: UP,
      item: 'msm_examples:guard_spawn_egg',
    });
    for (let i = 0; i < 100; i += 1) source.tick();
    expect(source.trace.filter((entry) => entry.kind === 'trigger')).toHaveLength(1);
    expect(source.trace.at(-1)).toMatchObject({
      kind: 'onlyInMinecraft',
      origin: { ruleKey: 'watch', ruleBook: 'msm_examples:guard_rules' },
    });
    source.act({
      type: 'place',
      pos: floorAt(10, 10),
      face: 'up',
      hit: UP,
      block: 'msm_examples:lucky_block',
    });
    source.act({ type: 'break', pos: { x: 10, y: 0, z: 10 } });
    expect(source.trace.at(-1)).toMatchObject({
      kind: 'onlyInMinecraft',
      text: 'rule "Open a lucky block" (it needs a script)',
      origin: { ruleKey: 'open_lucky_block' },
    });
  });
});
