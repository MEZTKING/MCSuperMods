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

/**
 * Generous limits: the service initialises in about 0.5 s on an idle machine, but under a full
 * `turbo run test` the CPU is shared with every other package, which has made the default
 * hook and test timeouts (and a 5 s init bound) flaky.
 */
const INIT_HOOK_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 30_000;
const INIT_BOUND_MS = 15_000;

for (const bundle of bundles) {
  describe(`mcfunction service over vendored ${bundle.target.id} data`, {
    timeout: TEST_TIMEOUT_MS,
  }, () => {
    let service: McfunctionService;
    let bare: McfunctionService;
    let initMs = 0;
    let bareInitMs = 0;
    const uri = defaultFunctionUri('msm_sample', 'test', bundle.target.folders.data.function);

    beforeAll(async () => {
      const [commands, blocks, registries, mcdocSymbols] = await Promise.all([
        readJson(bundle.vendored.mcmetaCommands),
        readJson(bundle.vendored.mcmetaBlocks),
        readJson(bundle.vendored.mcmetaRegistries),
        readJson(bundle.vendored.vanillaMcdocSymbols),
      ]);
      const data = { commands, blocks, registries: registries as Record<string, string[]> };
      const { mcVersion } = bundle.target;
      let t0 = performance.now();
      bare = await createMcfunctionService(data, { mcVersion });
      bareInitMs = performance.now() - t0;
      t0 = performance.now();
      service = await createMcfunctionService(data, { mcVersion, mcdocSymbols });
      initMs = performance.now() - t0;
      console.info(
        `mcfunction init ${Math.round(bareInitMs)} ms without, ${Math.round(initMs)} ms with mcdoc symbols`,
      );
    }, INIT_HOOK_TIMEOUT_MS);

    it('initialises in bounded time, with and without mcdoc symbols', () => {
      expect(service.mcVersion).toBe(bundle.target.mcVersion);
      expect(bareInitMs).toBeLessThan(INIT_BOUND_MS);
      expect(initMs).toBeLessThan(INIT_BOUND_MS);
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

    it('checks JSON text components in tellraw and title', async () => {
      const wrongType = await service.check('tellraw @a {"text":1}', { uri });
      expect(wrongType.some((p) => p.severity === 'error' && p.code === 'mcfunction.check')).toBe(
        true,
      );
      expect(await service.check('tellraw @a {"text":"hi"}', { uri })).toEqual([]);
      expect(await service.check('tellraw @a {"text":"hi","color":"red"}', { uri })).toEqual([]);
      expect(await service.check('tellraw @a "plain"', { uri })).toEqual([]);
      const bold = await service.check('title @a title {"text":"x","bold":"yes"}', { uri });
      expect(bold.some((p) => p.severity === 'error')).toBe(true);
      const unknownKey = await service.check('tellraw @a {"text":"hi","colour":"red"}', { uri });
      expect(unknownKey.map((p) => p.severity)).toEqual(['warning']);
      // Without the symbol export, components are parsed but not typed.
      expect(await bare.check('tellraw @a {"text":1}', { uri })).toEqual([]);
    });

    it('checks item components and entity NBT', async () => {
      expect(
        await service.check(`give @s minecraft:stone[minecraft:custom_name='"x"'] 1`, { uri }),
      ).toEqual([]);
      const unknown = await service.check('give @s minecraft:stone[minecraft:not_a_component=1]', {
        uri,
      });
      expect(unknown.length).toBeGreaterThan(0);
      const wrongValue = await service.check('give @s minecraft:stone[max_stack_size="a"] 1', {
        uri,
      });
      expect(wrongValue.some((p) => p.severity === 'error')).toBe(true);
      expect(await service.check('summon minecraft:zombie ~ ~ ~ {NoAI:1b}', { uri })).toEqual([]);
      const nbt = await service.check('summon minecraft:zombie ~ ~ ~ {NoAI:"x"}', { uri });
      expect(nbt.some((p) => p.severity === 'error')).toBe(true);
    });

    it('completes keys inside JSON text components and SNBT', async () => {
      const text = 'tellraw @a {"';
      const textKeys = (await service.complete(text, text.length, { uri })).map((i) => i.label);
      expect(textKeys).toEqual(expect.arrayContaining(['text', 'color', 'bold']));
      const snbt = 'summon minecraft:zombie ~ ~ ~ {No';
      const snbtKeys = (await service.complete(snbt, snbt.length, { uri })).map((i) => i.label);
      expect(snbtKeys).toContain('NoAI');
      // Without the symbol export there is no type to complete from.
      expect(await bare.complete(snbt, snbt.length, { uri })).toEqual([]);
    });

    it('checks block-state properties', async () => {
      const ok = [
        'setblock ~ ~ ~ minecraft:oak_stairs[facing=north]',
        'fill ~ ~ ~ ~ ~ ~ minecraft:oak_stairs[half=top,shape=straight] replace minecraft:stone',
        'execute if block ~ ~ ~ #minecraft:stairs[facing=north] run say x',
      ];
      for (const source of ok) expect(await service.check(source, { uri })).toEqual([]);
      const property = await service.check('setblock ~ ~ ~ minecraft:stone[wat=1]', { uri });
      expect(property).toHaveLength(1);
      expect(property[0]).toMatchObject({ severity: 'error', code: 'mcfunction.check', start: 31 });
      const value = await service.check('setblock ~ ~ ~ minecraft:oak_stairs[facing=up]', { uri });
      expect(value).toHaveLength(1);
      expect(value[0]).toMatchObject({ severity: 'error', start: 43, end: 45 });
      // An unknown block is the linter's warning only.
      const block = await service.check('setblock ~ ~ ~ minecraft:not_a_block[a=b]', { uri });
      expect(block.map((p) => p.severity)).toEqual(['warning']);
    });

    it('completes block-state properties and values', async () => {
      const keys = 'setblock ~ ~ ~ minecraft:oak_stairs[';
      expect(
        (await service.complete(keys, keys.length, { uri })).map((i) => i.label).sort(),
      ).toEqual(['facing', 'half', 'shape', 'waterlogged']);
      const values = 'setblock ~ ~ ~ minecraft:oak_stairs[facing=n';
      expect((await service.complete(values, values.length, { uri })).map((i) => i.label)).toEqual([
        'north',
      ]);
    });
  });
}
