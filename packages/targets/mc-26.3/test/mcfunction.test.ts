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

// This package cannot depend on `@msm/targets` (cycle), so it iterates its own bundle.
const bundles = [{ target, vendored }];

for (const bundle of bundles) {
  describe(`mcfunction service over vendored ${bundle.target.id} data`, () => {
    let service: McfunctionService;
    let initMs = 0;
    const uri = defaultFunctionUri('msm_sample', 'test', bundle.target.folders.data.function);

    beforeAll(async () => {
      const [commands, blocks, registries] = await Promise.all([
        readJson(bundle.vendored.mcmetaCommands),
        readJson(bundle.vendored.mcmetaBlocks),
        readJson(bundle.vendored.mcmetaRegistries),
      ]);
      const t0 = performance.now();
      service = await createMcfunctionService(
        { commands, blocks, registries: registries as Record<string, string[]> },
        { mcVersion: bundle.target.mcVersion },
      );
      initMs = performance.now() - t0;
      console.info(`mcfunction init ${Math.round(initMs)} ms`);
    });

    it('initialises in under 2 s', () => {
      expect(service.mcVersion).toBe(bundle.target.mcVersion);
      expect(initMs).toBeLessThan(2000);
    });

    it('accepts a plain command', async () => {
      expect(await service.check('say hello', { uri })).toEqual([]);
    });

    it('warns on an unknown item id', async () => {
      const problems = await service.check('give @s minecraft:not_an_item 1', { uri });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({
        severity: 'warning',
        code: 'mcfunction.lint.undeclaredSymbol',
        line: 0,
        start: 8,
        end: 29,
      });
    });

    it('warns on a missing function unless the project declares it', async () => {
      const source = 'function msm_sample:missing';
      const without = await service.check(source, { uri });
      expect(without).toHaveLength(1);
      expect(without[0]?.severity).toBe('warning');
      const withIds = await service.check(source, {
        uri,
        projectIds: { function: ['msm_sample:missing'] },
      });
      expect(withIds).toEqual([]);
      // Declarations are replaced when `projectIds` changes.
      expect(await service.check(source, { uri, projectIds: {} })).toHaveLength(1);
    });

    it('reports errors for a bogus command and a missing coordinate', async () => {
      const bogus = await service.check('bogus command here', { uri });
      expect(bogus.length).toBeGreaterThan(0);
      expect(bogus.every((p) => p.severity === 'error')).toBe(true);
      const tp = await service.check('say ok\ntp @s 1 2', { uri });
      expect(tp.some((p) => p.severity === 'error' && p.line === 1)).toBe(true);
    });

    it('checks the spike fixture with timings', async () => {
      const text = [
        '# a comment',
        'say hello',
        'give @s minecraft:stone 1',
        'give @s minecraft:not_an_item 1',
        'execute as @a[distance=..5] at @s run function msm_sample:greet',
        'function msm_sample:missing',
        'loot give @s loot msm_sample:ruby',
        'tellraw @a {"text":"hi","color":"red"}',
        'scoreboard objectives add foo dummy',
        'bogus command here',
        'tp @s 1 2',
        '$say $(name)',
        'execute if entity @e[type=minecraft:zombie] run \\',
        '    say continued',
      ].join('\n');
      const t0 = performance.now();
      const problems = await service.check(text, {
        uri,
        projectIds: { function: ['msm_sample:greet'], loot_table: ['msm_sample:ruby'] },
      });
      console.info(`mcfunction check ${Math.round(performance.now() - t0)} ms (14 lines)`);
      const byLine = (line: number) => problems.filter((p) => p.line === line);
      expect(byLine(3).map((p) => p.severity)).toEqual(['warning']);
      expect(byLine(4)).toEqual([]);
      expect(byLine(5).map((p) => p.severity)).toEqual(['warning']);
      expect(byLine(6)).toEqual([]);
      expect(byLine(9).length).toBeGreaterThan(0);
      expect(byLine(10).some((p) => p.severity === 'error')).toBe(true);
      expect(byLine(11)).toEqual([]);
      expect(byLine(12)).toEqual([]);
      expect(byLine(13)).toEqual([]);
    });

    it('completes item ids with prefix filtering and a cap', async () => {
      const source = 'give @s minecraft:sto';
      const all = await service.complete('give @s ', 8, { uri, limit: 100_000 });
      expect(all.length).toBeGreaterThan(3000);
      const items = await service.complete(source, source.length, { uri, limit: 100_000 });
      expect(items.map((i) => i.label)).toContain('minecraft:stone');
      expect(items.every((i) => i.label.replace(/^minecraft:/, '').startsWith('sto'))).toBe(true);
      expect(await service.complete('give @s ', 8, { uri })).toHaveLength(200);
    });

    it('proposes root commands on a blank line', async () => {
      const labels = (await service.complete('say a\n', 6, { uri, limit: 1000 })).map(
        (i) => i.label,
      );
      expect(labels).toContain('give');
      expect(labels).toContain('execute');
    });

    it('parses item components and rejects legacy item NBT', async () => {
      expect(await service.check('give @s minecraft:stone[custom_name="x"] 1', { uri })).toEqual(
        [],
      );
      const legacy = await service.check('give @s minecraft:stone{a:1} 1', { uri });
      expect(legacy.some((p) => p.severity === 'error')).toBe(true);
    });
  });
}
