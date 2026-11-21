/**
 * Logic rules in Try it's "What happened" (B401): the scripts Rules generates (ADR 0082 D3) run
 * instrumented at their `// rule:<key>` markers, so each step of a logic rule is said under the
 * rule's name (conditions checked, chances, loops, waits, what it did, what only the game does),
 * waits use the area's clock, and an error names the rule and its step.
 *
 * Covered: every compiler golden of the rules plugin (instrumented in place, still transpiles),
 * `fixtures/sample-rules`, the library's Rules examples (`examples/rules`) and the rules plugin's
 * six templates, lowered or compiled as the view gets them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Json, ResourceLocation, Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type CompiledScript,
  inProcessRunner,
  instrumentRuleScript,
  LocalWorldSource,
  PLAYER_VALUE,
  posValue,
  ruleBooksFrom,
  type SimFiles,
  scriptSources,
  type TraceEntry,
} from '../../src/index.js';
import { builtInTargets, lowerFixture, lowerProjectAt, REPO_ROOT } from '../lower-fixture.js';
import { compileModule, compileScripts, readApi, transpile } from './helpers.js';

const S = 'msm_sample_rules';
const X = 'msm_examples';
const UP = { x: 0.5, y: 1, z: 0.5 };
const floorAt = (x: number, z: number) => ({ x, y: -1, z });
const SNEAK = {
  type: 'move',
  forward: 0,
  strafe: 0,
  jump: false,
  sneak: true,
  toggleFly: false,
  yaw: 0,
  pitch: 0,
} as const;

const GOLDENS = join(REPO_ROOT, 'packages/plugins/rules/test/fixtures/goldens');

/** The rule books of a project folder as `{ id, data }`, as the app's session holds them. */
function booksOf(folder: string, namespace: string): { id: string; data: Json }[] {
  const dir = join(REPO_ROOT, folder, 'content', namespace, 'rules');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as { id: string; data: Json });
}

/** A Try it area over `files` with its scripts running in process and its rule books known. */
function area(
  files: SimFiles,
  target: Target,
  books: { id: string; data: Json }[] = [],
  options: { chance?: 'always' | 'random' | 'never'; compiled?: CompiledScript[] } = {},
) {
  const source = new LocalWorldSource({
    files,
    target,
    seed: 3,
    chance: options.chance ?? 'always',
    ruleBooks: ruleBooksFrom(books),
    scripts: { runner: inProcessRunner(compileModule), api: readApi(), version: '1.5.1' },
  });
  const compiled = compileScripts(files);
  source.loadScripts(options.compiled ?? compiled.scripts, compiled.problems);
  expect(compiled.problems).toEqual([]);
  const from = (start: number): TraceEntry[] => source.trace.slice(start);
  const texts = (start = 0): string[] => from(start).map((entry) => entry.text);
  return { source, from, texts };
}

let target: Target;
let sample: SimFiles;
let examples: SimFiles;

beforeAll(async () => {
  const header = JSON.parse(
    readFileSync(join(REPO_ROOT, 'fixtures/sample-rules/msm.project.json'), 'utf8'),
  ) as { targets: string[] };
  target = (await builtInTargets()).find((one) => one.id === header.targets[0]) as Target;
  const lowered = await lowerFixture('sample-rules', target);
  expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  sample = lowered.files;
  examples = (await lowerProjectAt(join(REPO_ROOT, 'examples/rules'), target)).files;
}, 60_000);

describe('instrumentRuleScript over the compiler goldens', () => {
  const goldens = readdirSync(GOLDENS).filter((name) => name.endsWith('.ts'));

  it('keeps every line, instruments every rule and still transpiles', () => {
    expect(goldens.length).toBeGreaterThan(80);
    for (const name of goldens) {
      const source = readFileSync(join(GOLDENS, name), 'utf8');
      const out = instrumentRuleScript(source);
      expect(out.split('\n').length, name).toBe(source.split('\n').length);
      const rules = source
        .split('\n')
        .filter((line) => /^\s*rule\(".*", \(\) => \{ \/\/ rule:/.test(line));
      expect(out.split('__tryIt.rule(').length - 1, name).toBe(rules.length);
      expect(out, name).toContain('import { tryIt as __tryIt } from "msm:try-it";');
      expect(() => transpile(out, name), name).not.toThrow();
    }
  });

  it('checks conditions, chances, loops and players, and leaves other lines as they are', () => {
    const read = (name: string) => instrumentRuleScript(readFileSync(join(GOLDENS, name), 'utf8'));
    expect(read('step-if.ts')).toContain(
      'if (__tryIt.check("if", (player !== undefined && player.isSneaking), true)) { // rule:sample',
    );
    expect(read('condition-chance.ts')).toContain(
      'if (!__tryIt.check("only", (__tryIt.chance(25)))) return; // rule:sample',
    );
    expect(read('step-repeat.ts')).toContain('if (!__tryIt.repeat(count, 3)) { // rule:sample');
    expect(read('step-wait.ts')).toContain('if (__tryIt.gone(gone(mob))) return; // rule:sample');
    expect(read('step-for_each_player.ts')).toContain(
      '__tryIt.each(msm.players()).forEach((player) => { // rule:sample',
    );
    // A single-line `if` of a plain step is not a condition of the rule.
    expect(read('step-run_command.ts')).toContain(
      '    if (player !== undefined) player.runCommand(command1); // rule:sample',
    );
  });

  it('leaves a hand-written script alone', () => {
    const text = 'import { msm } from "msm:runtime";\nif (true) { // rule:x\n}\n';
    expect(instrumentRuleScript(text)).toBe(text);
  });

  it('instruments the generated scripts among the lowered files only', () => {
    const sources = scriptSources(sample);
    expect(sources.map((one) => one.id)).toEqual([
      `${S}:rules/lucky_block_rules`,
      `${S}:rules/rally_horn_rules`,
      `${S}:rules/world_rules`,
    ]);
    for (const one of sources) expect(one.source).toContain('__tryIt.rule(');
  });
});

describe('logic rules of fixtures/sample-rules', () => {
  it('"Try your luck": its "only if", counter, chance and "if" are said under its name', () => {
    const { source, from, texts } = area(sample, target, booksOf('fixtures/sample-rules', S));
    source.act({
      type: 'place',
      pos: floorAt(12, 12),
      face: 'up',
      hit: UP,
      block: `${S}:lucky_block`,
    });
    let at = source.trace.length;
    source.act({ type: 'use', pos: { x: 12, y: 0, z: 12 }, face: 'up', hit: UP });
    expect(texts(at)).toEqual([
      'You used Lucky Block, which starts rule "Try your luck".',
      'Rule "Try your luck" ran as a script.',
      'Rule "Try your luck" checked its "only if": false, so it stopped.',
    ]);
    source.act(SNEAK);
    source.tick();
    at = source.trace.length;
    source.act({ type: 'use', pos: { x: 12, y: 0, z: 12 }, face: 'up', hit: UP });
    expect(texts(at)).toEqual([
      'You used Lucky Block, which starts rule "Try your luck".',
      'Rule "Try your luck" ran as a script.',
      'Rule "Try your luck" checked its "only if": true, so it went on.',
      'Rule "Try your luck" set its counter lucky_uses to 1.',
      'Rule "Try your luck" rolled its 50 per cent chance: it came up ("Run every time" is on).',
      'Rule "Try your luck" checked its "if": true, so its "then" steps ran.',
      'Rule "Try your luck" gave you 1 Ruby.',
      'Rule "Try your luck" played sound Levelup.',
      'Rule "Try your luck" says to you: "You have used the lucky block 1 times."',
    ]);
    // Every line links to the rule card.
    for (const entry of from(at + 1)) {
      expect(entry.origin).toMatchObject({
        ruleKey: 'try_luck',
        ruleBook: `${S}:lucky_block_rules`,
      });
    }
    expect(from(at + 2).map((entry) => entry.ruleStep)).toEqual([
      'check',
      'did',
      'chance',
      'check',
      'did',
      'did',
      'did',
    ]);
    expect(source.inventory.count(`${S}:ruby`)).toBe(1);
  });

  it('"Try your luck" with chances never coming up runs its "otherwise" steps', () => {
    const { source, texts } = area(sample, target, booksOf('fixtures/sample-rules', S), {
      chance: 'never',
    });
    source.act({
      type: 'place',
      pos: floorAt(12, 12),
      face: 'up',
      hit: UP,
      block: `${S}:lucky_block`,
    });
    source.act(SNEAK);
    source.tick();
    const at = source.trace.length;
    source.act({ type: 'use', pos: { x: 12, y: 0, z: 12 }, face: 'up', hit: UP });
    expect(texts(at)).toContain(
      'Rule "Try your luck" rolled its 50 per cent chance: it did not come up (chances never come up now).',
    );
    expect(texts(at)).toContain(
      'Rule "Try your luck" checked its "if": false, so its "otherwise" steps ran.',
    );
    expect(texts(at)).toContain('Player.showActionBar, used by rule "Try your luck"');
    expect(source.inventory.count(`${S}:ruby`)).toBe(0);
  });

  it('"Rally the players nearby": for each player, then a wait on the area\'s clock', () => {
    const { source, from } = area(sample, target, booksOf('fixtures/sample-rules', S));
    const at = source.trace.length;
    source.act({ type: 'use', pos: floorAt(14, 14), face: 'up', hit: UP, item: `${S}:rally_horn` });
    const now = from(at)[0]?.tick ?? 0;
    const said = () => from(at).map((entry) => `${entry.tick - now} ${entry.kind} ${entry.text}`);
    expect(said()).toEqual([
      '0 trigger You used Rally Horn, which starts rule "Rally the players nearby".',
      '0 action Rule "Rally the players nearby" ran as a script.',
      '0 action Rule "Rally the players nearby" runs its "for each player" steps for 1 player.',
      '0 onlyInMinecraft Entity.addEffect, used by rule "Rally the players nearby"',
      '0 onlyInMinecraft Player.showActionBar, used by rule "Rally the players nearby"',
      '0 action Rule "Rally the players nearby" waits 2 seconds (40 ticks of the preview\'s clock).',
    ]);
    // The wait follows the area's clock: nothing more until 40 ticks have gone.
    for (let i = 0; i < 39; i += 1) source.tick();
    expect(said()).toHaveLength(6);
    source.tick();
    expect(said().slice(6)).toEqual([
      '40 action Rule "Rally the players nearby" waited 2 seconds and goes on.',
      '40 action Rule "Rally the players nearby" says to you: "The rally is over."',
    ]);
  });

  it('the world rules: a Script API start, a chance, and a tick rule said once when it stops', () => {
    const { source, texts } = area(sample, target, booksOf('fixtures/sample-rules', S));
    expect(texts()).toEqual(
      expect.arrayContaining([
        'The script heard player.join, so rule "Welcome" ran.',
        'Player.showTitle, used by rule "Welcome"',
        'Rule "Welcome" played sound Chime.',
      ]),
    );
    for (let i = 0; i < 400; i += 1) source.tick();
    const stopped = texts().filter((text) => text.startsWith('Rule "No rain in the day"'));
    expect(stopped).toEqual([
      'Rule "No rain in the day" checked its "only if" on server.tick: false, so it stopped. (Said once: it checks again every time.)',
    ]);
    expect(texts()).toContain('World.isRaining, used by rule "No rain in the day"');
    // No start line for a tick rule that did not go on.
    expect(texts().some((text) => text.includes('so rule "No rain in the day" ran'))).toBe(false);
    const at = source.trace.length;
    source.act({
      type: 'place',
      pos: floorAt(16, 16),
      face: 'up',
      hit: UP,
      block: 'minecraft:stone',
    });
    source.act({ type: 'break', pos: { x: 16, y: 0, z: 16 } });
    expect(texts(at)).toEqual([
      'The script heard block.break, so rule "Stone sometimes hides a ruby" ran.',
      'Rule "Stone sometimes hides a ruby" rolled its 20 per cent chance: it came up ("Run every time" is on).',
      'Rule "Stone sometimes hides a ruby" checked its "only if": true, so it went on.',
      'World.dropItem, used by rule "Stone sometimes hides a ruby"',
    ]);
  });

  it('rolls chances from the seed when "Run every time" is off', () => {
    const rolls = (): string[] => {
      const { source, texts } = area(sample, target, booksOf('fixtures/sample-rules', S), {
        chance: 'random',
      });
      for (let i = 0; i < 6; i += 1) {
        source.act({
          type: 'place',
          pos: floorAt(16, 16),
          face: 'up',
          hit: UP,
          block: 'minecraft:stone',
        });
        source.act({ type: 'break', pos: { x: 16, y: 0, z: 16 } });
      }
      return texts().filter((text) => text.includes('per cent chance'));
    };
    const first = rolls();
    expect(first).toHaveLength(6);
    expect(rolls()).toEqual(first);
  });

  it('a script error names the rule and the step it was in, not the script file', () => {
    const broken = (needle: string, key: string) =>
      compileScripts(sample).scripts.map((one) => {
        const source = scriptSources(sample).find((s) => s.id === one.id)?.source ?? '';
        const lines = source
          .split('\n')
          .map((line) =>
            line.includes(needle) && line.includes(' // rule:')
              ? `throw new Error("boom"); // rule:${key}`
              : line,
          );
        return { ...one, js: transpile(lines.join('\n')) };
      });
    const luck = area(sample, target, booksOf('fixtures/sample-rules', S), {
      compiled: broken('target.give(', 'try_luck'),
    });
    luck.source.act({
      type: 'place',
      pos: floorAt(12, 12),
      face: 'up',
      hit: UP,
      block: `${S}:lucky_block`,
    });
    luck.source.act(SNEAK);
    luck.source.tick();
    const at = luck.source.trace.length;
    luck.source.act({ type: 'use', pos: { x: 12, y: 0, z: 12 }, face: 'up', hit: UP });
    const failed = luck.from(at).filter((entry) => entry.ruleStep === 'error');
    expect(failed.map((entry) => [entry.kind, entry.text])).toEqual([
      ['skipped', 'Rule "Try your luck" failed after its "if" check: Error: boom'],
    ]);
    expect(failed[0]?.origin).toMatchObject({
      ruleKey: 'try_luck',
      ruleBook: `${S}:lucky_block_rules`,
    });
    expect(luck.texts().some((text) => text.includes(`The script ${S}:rules`))).toBe(false);

    const rally = area(sample, target, booksOf('fixtures/sample-rules', S), {
      compiled: broken('The rally is over.', 'rally'),
    });
    rally.source.act({
      type: 'use',
      pos: floorAt(14, 14),
      face: 'up',
      hit: UP,
      item: `${S}:rally_horn`,
    });
    for (let i = 0; i < 40; i += 1) rally.source.tick();
    expect(rally.texts().at(-1)).toBe(
      'Rule "Rally the players nearby" failed after its wait of 2 seconds: Error: boom',
    );
  });

  it("names the rule from the script's own error line when a script was not instrumented", () => {
    const plain = scriptSources(sample).map((one) => {
      const stored = sample.get(one.path);
      const raw = typeof stored === 'string' ? stored : new TextDecoder().decode(stored);
      const lines = raw
        .split('\n')
        .map((line) =>
          line.includes('target.give(') ? 'throw new Error("boom"); // rule:try_luck' : line,
        );
      return {
        id: one.id,
        path: one.path,
        js: transpile(lines.join('\n')),
        book: one.book as string,
      };
    });
    const { source, texts } = area(sample, target, booksOf('fixtures/sample-rules', S), {
      compiled: plain,
    });
    source.act({
      type: 'place',
      pos: floorAt(12, 12),
      face: 'up',
      hit: UP,
      block: `${S}:lucky_block`,
    });
    source.act(SNEAK);
    source.tick();
    source.act({ type: 'use', pos: { x: 12, y: 0, z: 12 }, face: 'up', hit: UP });
    expect(texts().at(-1)).toBe('Rule "Try your luck" failed: Error: boom');
  });
});

describe('the Rules examples of the library', () => {
  it('"Open a lucky block": counter, chance, "if" and the steps only the game does', () => {
    const { source, texts } = area(examples, target, booksOf('examples/rules', X));
    source.act({
      type: 'place',
      pos: floorAt(10, 10),
      face: 'up',
      hit: UP,
      block: `${X}:lucky_block`,
    });
    const at = source.trace.length;
    source.act({ type: 'break', pos: { x: 10, y: 0, z: 10 } });
    const said = texts(at);
    expect(said.slice(-8)).toEqual([
      'Rule "Open a lucky block" ran as a script.',
      'Rule "Open a lucky block" set its counter lucky_blocks to 1.',
      'Rule "Open a lucky block" rolled its 60 per cent chance: it came up ("Run every time" is on).',
      'Rule "Open a lucky block" checked its "if": true, so its "then" steps ran.',
      'World.dropItem, used by rule "Open a lucky block"',
      'Rule "Open a lucky block" played sound Levelup.',
      'Player.showActionBar, used by rule "Open a lucky block"',
      'Rule "Open a lucky block" says to you: "Lucky blocks opened: 1"',
    ]);
  });

  it('"Spend a lucky coin": each step done or only in Minecraft', () => {
    const { source, texts } = area(examples, target, booksOf('examples/rules', X));
    const at = source.trace.length;
    source.act({ type: 'use', pos: floorAt(8, 8), face: 'up', hit: UP, item: `${X}:lucky_coin` });
    const said = texts(at).filter((text) => text.includes('"Spend a lucky coin"'));
    expect(said).toEqual(
      expect.arrayContaining([
        'Rule "Spend a lucky coin" ran as a script.',
        'Entity.addEffect, used by rule "Spend a lucky coin"',
        'Rule "Spend a lucky coin" played sound Chime.',
      ]),
    );
  });

  it('"Watch the players nearby": the guard\'s timer, for each player and the sparkles', () => {
    const { source, texts } = area(examples, target, booksOf('examples/rules', X));
    source.act({
      type: 'use',
      pos: floorAt(20, 20),
      face: 'up',
      hit: UP,
      item: `${X}:guard_spawn_egg`,
    });
    const at = source.trace.length;
    for (let i = 0; i < 100; i += 1) source.tick();
    expect(texts(at)).toEqual(
      expect.arrayContaining([
        'Rule "Watch the players nearby" ran as a script.',
        'Rule "Watch the players nearby" runs its "for each player" steps for 1 player.',
        'Entity.addEffect, used by rule "Watch the players nearby"',
        'Player.showActionBar, used by rule "Watch the players nearby"',
        'Rule "Watch the players nearby" showed 5 End Rod particles.',
      ]),
    );
  });
});

describe('the rules templates', () => {
  /** A template's book compiled by the rules plugin into its generated script, as lowering does. */
  async function templateFiles(
    id: string,
  ): Promise<{ files: SimFiles; book: { id: string; data: Json } }> {
    const rules = (await import(join(REPO_ROOT, 'packages/plugins/rules/src/index.ts'))) as {
      rulesTemplates: readonly { id: string; data: () => Json }[];
      compileRuleBooks: (
        books: readonly Element[],
        elements: readonly Element[],
        target: Target,
      ) => { scripts: ReadonlyMap<string, string[]>; problems: readonly unknown[] };
    };
    const template = rules.rulesTemplates.find((one) => one.id === id);
    if (template === undefined) throw new Error(`No template ${id}`);
    const book = { id: 't:templates', data: template.data() };
    const element: Element = {
      formatVersion: 1,
      id: book.id as ResourceLocation,
      kind: 'msm:rules',
      data: book.data,
      meta: { createdAt: '2026-01-01T00:00:00.000Z' },
    };
    const compiled = rules.compileRuleBooks([element], [element], target);
    const lines = compiled.scripts.get(book.id);
    if (lines === undefined) throw new Error(`No script for ${id}`);
    return { files: new Map([['msm/t/script/rules/templates.ts', lines.join('\n')]]), book };
  }

  it('Welcome message: the start and its steps', async () => {
    const { files, book } = await templateFiles('msm_rules_welcome_message');
    const { texts } = area(files, target, [book]);
    expect(texts()).toEqual([
      'The script heard player.join, so rule "Welcome" ran.',
      'Player.showTitle, used by rule "Welcome"',
      'Rule "Welcome" says to you: "Welcome to the world. Have fun!"',
      'Rule "Welcome" played sound Chime.',
    ]);
  });

  it('Jump pad: off the pad its "only if" is said once; on it, it goes on every quarter second', async () => {
    const { files, book } = await templateFiles('msm_rules_jump_pad');
    const { source, texts } = area(files, target, [book]);
    for (let i = 0; i < 20; i += 1) source.tick();
    expect(texts().filter((text) => text.includes('Jump pad'))).toEqual([
      'Rule "Jump pad" checked its "only if" on player.tick: false, so it stopped. (Said once: it checks again every time.)',
    ]);
    const feet = source.player.position;
    const pad = { x: Math.floor(feet.x), y: 0, z: Math.floor(feet.z) };
    source.world.set(pad, { name: 'minecraft:slime_block', properties: {} });
    source.player.teleport({ x: pad.x + 0.5, y: 1, z: pad.z + 0.5 });
    const at = source.trace.length;
    for (let i = 0; i < 5; i += 1) source.tick();
    expect(texts(at)).toEqual(
      expect.arrayContaining([
        'The script heard player.tick, so rule "Jump pad" ran.',
        'Rule "Jump pad" checked its "only if": true, so it went on.',
      ]),
    );
  });

  it('Lucky block: a chance and an "if" on any Sponge broken', async () => {
    const { files, book } = await templateFiles('msm_rules_lucky_block');
    const { source, texts } = area(files, target, [book], { chance: 'never' });
    source.act({
      type: 'place',
      pos: floorAt(6, 6),
      face: 'up',
      hit: UP,
      block: 'minecraft:sponge',
    });
    const at = source.trace.length;
    source.act({ type: 'break', pos: { x: 6, y: 0, z: 6 } });
    expect(texts(at)).toEqual([
      'The script heard block.break, so rule "Lucky block" ran.',
      'Rule "Lucky block" rolled its 50 per cent chance: it did not come up (chances never come up now).',
      'Rule "Lucky block" checked its "if": false, so its "otherwise" steps ran.',
      'World.spawnEntity, used by rule "Lucky block"',
      'Player.showActionBar, used by rule "Lucky block"',
    ]);
  });

  it('Healing spring: out of water its "only if" is said once', async () => {
    const { files, book } = await templateFiles('msm_rules_healing_spring');
    const { source, texts } = area(files, target, [book]);
    for (let i = 0; i < 60; i += 1) source.tick();
    expect(texts().filter((text) => text.includes('Healing spring'))).toEqual([
      'Rule "Healing spring" checked its "only if" on player.tick: false, so it stopped. (Said once: it checks again every time.)',
    ]);
  });

  it('Click counter: the counter on every Lever used', async () => {
    const { files, book } = await templateFiles('msm_rules_click_counter');
    const { source, texts } = area(files, target, [book]);
    source.act({
      type: 'place',
      pos: floorAt(4, 4),
      face: 'up',
      hit: UP,
      block: 'minecraft:lever',
    });
    source.act({ type: 'use', pos: { x: 4, y: 0, z: 4 }, face: 'up', hit: UP });
    source.act({ type: 'use', pos: { x: 4, y: 0, z: 4 }, face: 'up', hit: UP });
    expect(texts().filter((text) => text.startsWith('Rule "Count clicks"'))).toEqual([
      'Rule "Count clicks" set its counter clicks to 1.',
      'Rule "Count clicks" set its counter clicks to 2.',
    ]);
    expect(texts()).toContain('Player.showActionBar, used by rule "Count clicks"');
  });

  it('Mob drops a reward: loaded and waiting for a zombie to die', async () => {
    const { files, book } = await templateFiles('msm_rules_mob_reward');
    const { source } = area(files, target, [book]);
    expect(source.scripts?.listeners['entity.death']).toEqual(['t:rules/templates']);
  });

  it("runs a repeat with a wait inside on the area's clock (the step-repeat golden)", () => {
    const files = new Map([
      ['msm/demo/script/rules/rules.ts', readFileSync(join(GOLDENS, 'step-repeat.ts'), 'utf8')],
    ]);
    const { source, from } = area(files, target);
    const at = source.trace.length;
    source.scripts?.runAction('demo:rules/rules/plain_block/block_used', {
      pos: posValue({ x: 5, y: 0, z: 5 }),
      block: null,
      player: PLAYER_VALUE,
    });
    for (let i = 0; i < 40; i += 1) source.tick();
    const start = from(at)[0]?.tick ?? 0;
    expect(from(at).map((entry) => `${entry.tick - start} ${entry.text}`)).toEqual([
      '0 Rule "sample" repeats: time 1 of 3.',
      '0 Rule "sample" played sound Chime.',
      '0 Rule "sample" waits 0.5 seconds (10 ticks of the preview\'s clock).',
      '10 Rule "sample" waited 0.5 seconds and goes on.',
      '10 Rule "sample" repeats: time 2 of 3.',
      '10 Rule "sample" played sound Chime.',
      '10 Rule "sample" waits 0.5 seconds (10 ticks of the preview\'s clock).',
      '20 Rule "sample" waited 0.5 seconds and goes on.',
      '20 Rule "sample" repeats: time 3 of 3.',
      '20 Rule "sample" played sound Chime.',
      '20 Rule "sample" waits 0.5 seconds (10 ticks of the preview\'s clock).',
      '30 Rule "sample" waited 0.5 seconds and goes on.',
      '30 Rule "sample" finished repeating (3 times).',
      '30 Rule "sample" says to you: "Done."',
    ]);
  });
});
