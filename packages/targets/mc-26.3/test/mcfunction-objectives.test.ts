import { readFile } from 'node:fs/promises';
import {
  collectProjectObjectives,
  createMcfunctionService,
  defaultFunctionUri,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import { beforeAll, describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

describe(`project-wide scoreboard objectives (${target.id})`, () => {
  let service: McfunctionService;
  const folder = target.folders.data.function;
  const load = 'scoreboard objectives add jumps minecraft.custom:minecraft.jump';
  const tick = 'execute as @a[scores={jumps=1..}] run scoreboard players reset @s jumps';

  beforeAll(async () => {
    const [commands, blocks, registries] = await Promise.all([
      readJson(vendored.mcmetaCommands),
      readJson(vendored.mcmetaBlocks),
      readJson(vendored.mcmetaRegistries),
    ]);
    service = await createMcfunctionService(
      { commands, blocks, registries: registries as Record<string, string[]> },
      { mcVersion: target.mcVersion },
    );
  }, 60_000);

  it('warns on an objective another function creates unless it is declared', async () => {
    const uri = defaultFunctionUri('demo', 'tick', folder);
    const alone = await service.check(tick, { uri });
    expect(alone.length).toBeGreaterThan(0);
    expect(alone.every((p) => p.code === 'mcfunction.lint.undeclaredSymbol')).toBe(true);
    const objective = collectProjectObjectives([load, tick]);
    expect(objective).toEqual(['jumps']);
    expect(await service.check(tick, { uri, projectIds: { objective } })).toEqual([]);
    // Declarations are replaced when the objectives change.
    const without = await service.check(tick, { uri, projectIds: { objective: [] } });
    expect(without.length).toBeGreaterThan(0);
  });

  it('still checks the function that creates the objective', async () => {
    const uri = defaultFunctionUri('demo', 'load', folder);
    expect(await service.check(load, { uri, projectIds: { objective: ['jumps'] } })).toEqual([]);
    expect(await service.check(load, { uri })).toEqual([]);
  });
});
