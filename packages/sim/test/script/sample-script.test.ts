/**
 * `fixtures/sample-script` in Try it (B400): the fixture is lowered as the view does, its scripts
 * are transpiled as main does and run in process against the shim. What the preview can do
 * happens; every call it cannot do is said once as only in Minecraft.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimFiles } from '../../src/index.js';
import { builtInTargets, lowerFixture, REPO_ROOT } from '../lower-fixture.js';
import { compileScripts, scriptedArea } from './helpers.js';

const S = 'msm_sample_script';
const UP = { x: 0.5, y: 1, z: 0.5 };
const floorAt = (x: number, z: number) => ({ x, y: -1, z });

let target: Target;
let files: SimFiles;

beforeAll(async () => {
  const header = JSON.parse(
    readFileSync(join(REPO_ROOT, 'fixtures/sample-script/msm.project.json'), 'utf8'),
  ) as { targets: string[] };
  target = (await builtInTargets()).find((one) => one.id === header.targets[0]) as Target;
  const lowered = await lowerFixture('sample-script', target);
  expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  files = lowered.files;
}, 60_000);

describe('fixtures/sample-script in Try it', () => {
  it('transpiles every script of the fixture', () => {
    const { scripts, problems } = compileScripts(files);
    expect(problems).toEqual([]);
    expect(scripts.length).toBeGreaterThanOrEqual(25);
    expect(scripts.map((one) => one.id)).toContain(`${S}:util`);
  });

  it('loads the scripts, then fires server.started and player.join', () => {
    const { source, texts } = scriptedArea(files, target);
    const lines = texts();
    // util is required by two scripts and runs once.
    expect(lines.filter((line) => line.endsWith('logged: util loaded'))).toHaveLength(1);
    expect(lines).toContain(
      `The script ${S}:on_server_started logged: server.started: runtime 1.5.1 in minecraft:overworld, handler ${S}:spark`,
    );
    expect(lines).toContain(`The script ${S}:start_counter logged: start counter: 1`);
    expect(lines).toContain(
      `The script ${S}:on_player_join says to you: "MSM Sample Script is loaded. Use the spark ore."`,
    );
    expect(lines).toContain(`The script ${S}:on_player_join logged: player.join: Player`);
    expect(source.scripts?.loaded).toBe(true);
    // The old "scripts run only in the game" line is not said when they run.
    expect(lines.some((line) => line.includes('it listens for'))).toBe(false);
  });

  it('says the events the preview never fires, once per script', () => {
    const { only } = scriptedArea(files, target);
    const said = only();
    expect(said).toContain(
      `player.respawn for the script ${S}:on_player_respawn (you never die in the preview)`,
    );
    expect(said).toContain(
      `entity.hurt for the script ${S}:on_entity_hurt (mobs have no health in the preview (a hit removes them))`,
    );
  });

  it('runs the spark ore: block.interact, its event and the run_script handler', () => {
    const { source, texts, only } = scriptedArea(files, target);
    source.act({
      type: 'place',
      pos: floorAt(10, 10),
      face: 'up',
      hit: UP,
      block: `${S}:spark_ore`,
    });
    const before = source.trace.length;
    source.act({ type: 'use', pos: { x: 10, y: 0, z: 10 }, face: 'up', hit: UP });
    const lines = texts(before);
    expect(lines).toContain(
      `The script ${S}:on_block_interact logged: block.interact: Player used spark ore at 10, 0, 10`,
    );
    expect(lines).toContain('Played sound Chime.');
    expect(lines).toContain(`Ran the script action ${S}:spark.`);
    expect(lines).toContain(
      `The script ${S}:spark_handler logged: action ${S}:spark: ${S}:spark_ore ${S}:spark at 10, 0, 10`,
    );
    expect(lines).toContain(`The script ${S}:spark_handler gave you 1 Spark Gem.`);
    expect(source.inventory.count(`${S}:spark_gem`)).toBe(1);
    // World.runCommand is only in the game.
    expect(only(before)).toContain(`World.runCommand, used by the script ${S}:on_block_interact`);
  });

  it('lets a script refuse the use of the warded stone: nothing is placed against it', () => {
    const { source, texts } = scriptedArea(files, target);
    source.act({
      type: 'place',
      pos: floorAt(12, 12),
      face: 'up',
      hit: UP,
      block: `${S}:warded_stone`,
    });
    const before = source.trace.length;
    const blocks = source.world.count;
    source.act({
      type: 'use',
      pos: { x: 12, y: 0, z: 12 },
      face: 'up',
      hit: UP,
      item: `${S}:spark_ore`,
    });
    expect(source.world.count).toBe(blocks);
    expect(texts(before)).toContain(
      `The script ${S}:on_block_interact logged: block.interact: Player was refused at warded stone 12, 0, 12`,
    );
    expect(source.lines.at(-1)?.text).toBe(
      'A script refused your use of Warded Stone; nothing happened.',
    );
  });

  it('logs the block.break listener and still breaks the block', () => {
    const { source, texts } = scriptedArea(files, target);
    source.act({ type: 'place', pos: floorAt(5, 5), face: 'up', hit: UP, block: `${S}:spark_ore` });
    const before = source.trace.length;
    source.act({ type: 'break', pos: { x: 5, y: 0, z: 5 } });
    expect(source.world.get({ x: 5, y: 0, z: 5 })).toBeNull();
    expect(texts(before)).toContain(
      `The script ${S}:on_block_break logged: block.break: Player broke spark ore at 5, 0, 5`,
    );
  });

  it('answers chat commands and says the members it cannot do', () => {
    const { source, texts, only } = scriptedArea(files, target);
    const before = source.trace.length;
    source.chat('!help');
    const lines = texts(before);
    expect(lines).toContain(`The script ${S}:on_player_chat logged: player.chat: Player ran !help`);
    expect(
      lines.some((line) =>
        line.startsWith(
          `The script ${S}:on_player_chat says to you: "Sample commands: !help, !kit`,
        ),
      ),
    ).toBe(true);
    source.chat('!kit');
    expect(only(before)).toContain(`Player.inventory, used by the script ${S}:kit_command`);
    source.chat('!bar');
    expect(only(before)).toContain(`msm.bossBars.get, used by the script ${S}:spark_bar`);
  });

  it('runs server.tick and player.tick on the clock', () => {
    const { source, texts, only } = scriptedArea(files, target);
    for (let i = 0; i < 20; i++) source.tick();
    expect(texts()).toContain(`The script ${S}:on_server_tick logged: server.tick: first tick 1`);
    expect(texts().filter((line) => line.includes('server.tick: first tick'))).toHaveLength(1);
    // player.tick every 20 ticks reads the inventory, which only the game has.
    expect(only()).toContain(`Player.inventory, used by the script ${S}:on_player_tick`);
  });
});
