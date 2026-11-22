import { readFile } from 'node:fs/promises';
import {
  createMcfunctionService,
  defaultFunctionUri,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import { beforeAll, describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

/**
 * Spike B547 (`docs/reference/spikes/b547/results/spyglass-holders.txt`): valid vanilla lines
 * the game accepts on both versions, on which the checker used to throw "Cannot enter ... with
 * Block visibility as no node with locals is supplied" (score holders, named random sequences,
 * jigsaw target names). Ids in a project namespace the function is not told about (a mod's
 * block or particle, as in `fixtures/sample-machines` and `fixtures/sample-particles`) threw the
 * same way.
 */
const VALID = [
  'execute if score #a b547.c matches 1.. run say hi',
  'execute if score @s b547.c matches 1.. run say hi',
  'execute if score a b547.c matches 1.. run say hi',
  'scoreboard players get #a b547.c',
  // Team names are plain names; a team made in the same function is declared there.
  'team join t #a',
  'team add t\nteam join t #a',
  'tellraw @a {score:{name:"#a",objective:"b547.c"}}',
  'scoreboard players operation #a b547.c += #b b547.c',
  'execute store result score #a b547.c run random value 1..6',
  'random value 1..100 b547:ob',
  'random roll 1..6 b547:dice',
  'random reset b547:ob',
  'place jigsaw b547:island b547:empty 1 640 64 600',
  'scoreboard players set #a b547.c 1',
  'team add t\nteam leave #a',
  'setblock ~ ~ ~ b547:crate replace',
  'setblock ~ ~ ~ b547:crate{LootTable:"b547:chests/crate"} replace',
  'setblock ~ ~ ~ b547:crate{LootTable:"b547:chests/crate",Items:[{Slot:0b,id:"minecraft:stone",count:1}]} replace',
  'particle b547:spark ~ ~1 ~ 0.5 0.5 0.5 0 30',
];

describe(`score holders, random sequences and jigsaw targets (${target.id})`, () => {
  let service: McfunctionService;
  const uri = defaultFunctionUri('b547', 'holders', target.folders.data.function);
  const projectIds = {
    objective: ['b547.c'],
    team: ['t'],
    loot_table: ['b547:chests/crate'],
    'worldgen/template_pool': ['b547:island'],
  };

  beforeAll(async () => {
    const [commands, blocks, registries, mcdocSymbols] = await Promise.all([
      readJson(vendored.mcmetaCommands),
      readJson(vendored.mcmetaBlocks),
      readJson(vendored.mcmetaRegistries),
      readJson(vendored.vanillaMcdocSymbols),
    ]);
    service = await createMcfunctionService(
      { commands, blocks, registries: registries as Record<string, string[]> },
      { mcVersion: target.mcVersion, mcdocSymbols },
    );
  }, 60_000);

  for (const line of VALID) {
    it(`accepts ${line.replace('\n', ' / ')}`, async () => {
      expect(await service.check(line, { uri, projectIds })).toEqual([]);
    });
  }

  it('accepts them all in one function', async () => {
    expect(await service.check(VALID.join('\n'), { uri, projectIds })).toEqual([]);
  });

  it('still reports a wrong line among them', async () => {
    const source = ['scoreboard players get #a b547.c', 'scoreboard players get #a'].join('\n');
    const problems = await service.check(source, { uri, projectIds });
    expect(problems.some((p) => p.severity === 'error' && p.line === 1)).toBe(true);
    expect(problems.filter((p) => p.line === 0)).toEqual([]);
    expect(problems.some((p) => p.message.includes('stopped early'))).toBe(false);
  });

  it('still warns on an undeclared objective next to a holder', async () => {
    const problems = await service.check('scoreboard players get #a b547.missing', {
      uri,
      projectIds,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      severity: 'warning',
      code: 'mcfunction.lint.undeclaredSymbol',
    });
  });

  it('still warns on an unknown key of a project block entity', async () => {
    const problems = await service.check('setblock ~ ~ ~ b547:crate{Foo:1} replace', {
      uri,
      projectIds,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('Foo'),
    });
  });

  it('completes after a holder', async () => {
    const source = 'execute if score #a b547.c ';
    const items = await service.complete(source, source.length, { uri, projectIds });
    expect(items.map((i) => i.label)).toContain('matches');
  });
});
