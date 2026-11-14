import { readdir, readFile } from 'node:fs/promises';
import {
  createMcfunctionService,
  defaultFunctionUri,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type DevGameRuleIds,
  REFILL_SECTION,
  SETUP_CHEST_COUNT,
  SETUP_CHEST_SLOTS,
  SETUP_SECTION,
  type SetupItem,
  setupFunctionLines,
  setupFunctionText,
} from '../../src/index';

/**
 * The game rule ids both targets have (F7; `TargetFacts.dev.gameRules` in `packages/targets`
 * gives them to the app). This package cannot depend on the target packages, so the test reads
 * their vendored command trees by path.
 */
const gameRules: DevGameRuleIds = {
  advanceTime: 'minecraft:advance_time',
  advanceWeather: 'minecraft:advance_weather',
  spawnMobs: 'minecraft:spawn_mobs',
  keepInventory: 'minecraft:keep_inventory',
};

/** Every target package with vendored data, found on disk (version literals stay in `packages/targets`). */
const TARGETS_ROOT = new URL('../../../targets/', import.meta.url);
const TARGETS = await Promise.all(
  (await readdir(TARGETS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('mc-'))
    .map(async (entry) => {
      const version = (await readVendored(entry.name, 'mcmeta/version.json')) as { id: string };
      return { folder: entry.name, mcVersion: version.id };
    }),
);

async function readVendored(folder: string, file: string): Promise<unknown> {
  const url = new URL(`../../../targets/${folder}/vendor/${file}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

const items: SetupItem[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `msm_sample:gem_${i}`, count: 64 })),
  { id: 'msm_sample:ruby_sword' },
  { id: 'msm_sample:glow_spawn_egg', count: 16 },
  { id: 'minecraft:stone', count: 99 },
];

/** The project's own item ids, declared as the app declares project ids for its checks. */
const projectIds = {
  item: items.map((item) => item.id).filter((id) => !id.startsWith('minecraft:')),
};

describe('setupFunctionLines', () => {
  it('sets the game rules by their command names and builds the test area', () => {
    const fn = setupFunctionLines({ gameRules, items });
    expect(fn.setup.slice(0, 6)).toEqual([
      'time set 6000',
      'gamerule advance_time false',
      'weather clear',
      'gamerule advance_weather false',
      'gamerule spawn_mobs false',
      'gamerule keep_inventory true',
    ]);
    expect(fn.setup).toContain('fill ~-10 ~-1 ~-10 ~10 ~-1 ~10 minecraft:smooth_stone');
    expect(fn.setup).toContain('fill ~-9 ~-1 ~-9 ~-7 ~-1 ~-7 minecraft:water');
    expect(fn.setup.filter((line) => line.startsWith('item replace entity @p hotbar.'))).toEqual(
      Array.from(
        { length: 9 },
        (_, i) => `item replace entity @p hotbar.${i} with msm_sample:gem_${i} 64`,
      ),
    );
    expect(fn.leftOut).toBe(0);
  });

  it('fills the chests slot by slot, empties unused slots and removes unused chests', () => {
    const fn = setupFunctionLines({ gameRules, items });
    expect(fn.refill[0]).toBe(
      'execute unless block ~-4 ~ ~-2 minecraft:chest run setblock ~-4 ~ ~-2 minecraft:chest[facing=south]',
    );
    expect(fn.refill[1]).toBe('item replace block ~-4 ~ ~-2 container.0 with msm_sample:gem_0 64');
    // 33 items: two chests (1 + 27 lines each), then 16 removals.
    expect(fn.refill).toHaveLength(2 * (1 + SETUP_CHEST_SLOTS) + (SETUP_CHEST_COUNT - 2));
    expect(fn.refill).toContain(
      'item replace block ~-3 ~ ~-2 container.3 with msm_sample:ruby_sword',
    );
    expect(fn.refill).toContain('item replace block ~-3 ~ ~-2 container.6 with minecraft:air');
    expect(fn.refill.at(-1)).toBe(
      'execute if block ~4 ~ ~-4 minecraft:chest run setblock ~4 ~ ~-4 minecraft:air',
    );
  });

  it('uses absolute positions when given a spawn, and reports items that do not fit', () => {
    const many = Array.from({ length: SETUP_CHEST_COUNT * SETUP_CHEST_SLOTS + 5 }, (_, i) => ({
      id: `a:i${i}`,
    }));
    const fn = setupFunctionLines({ gameRules, items: many, spawn: { x: 8, y: -60, z: -3 } });
    expect(fn.setup).toContain('fill -2 -61 -13 18 -61 7 minecraft:smooth_stone');
    expect(fn.leftOut).toBe(5);
    expect(fn.refill.filter((line) => line.includes('minecraft:air'))).toEqual([]);
  });

  it('refuses bad ids and counts', () => {
    expect(() => setupFunctionLines({ gameRules, items: [{ id: 'Gem' }] })).toThrow();
    expect(() => setupFunctionLines({ gameRules, items: [{ id: 'a:b', count: 100 }] })).toThrow();
    expect(() =>
      setupFunctionLines({ gameRules: { ...gameRules, spawnMobs: 'x y' }, items }),
    ).toThrow();
    expect(() => setupFunctionLines({ gameRules, items, spawn: { x: 0.5, y: 0, z: 0 } })).toThrow();
  });

  it('writes the sections after their markers', () => {
    const text = setupFunctionText(setupFunctionLines({ gameRules, items: [] }));
    const lines = text.split('\n');
    expect(lines[1]).toBe(SETUP_SECTION);
    const refillAt = lines.indexOf(REFILL_SECTION);
    expect(lines[refillAt + 1]).toBe(
      'execute if block ~-4 ~ ~-2 minecraft:chest run setblock ~-4 ~ ~-2 minecraft:air',
    );
    expect(text.endsWith('\n')).toBe(true);
  });
});

it('finds both target packages', () => {
  expect(TARGETS.length).toBeGreaterThanOrEqual(2);
});

for (const target of TARGETS) {
  describe(`setup function commands on ${target.folder}`, { timeout: 60_000 }, () => {
    let service: McfunctionService;
    const uri = defaultFunctionUri('msm_sample', 'msm_dev_setup', 'function');

    beforeAll(async () => {
      const [commands, blocks, registries, mcdocSymbols] = await Promise.all([
        readVendored(target.folder, 'mcmeta/commands.json'),
        readVendored(target.folder, 'mcmeta/blocks.json'),
        readVendored(target.folder, 'mcmeta/registries.json'),
        readVendored(target.folder, 'vanilla-mcdoc/symbols.json'),
      ]);
      service = await createMcfunctionService(
        { commands, blocks, registries: registries as Record<string, string[]> },
        { mcVersion: target.mcVersion, mcdocSymbols },
      );
    }, 120_000);

    it('passes the offline checker, relative and absolute', async () => {
      for (const spawn of [undefined, { x: 0, y: -60, z: 0 }]) {
        const text = setupFunctionText(
          setupFunctionLines({ gameRules, items, ...(spawn !== undefined ? { spawn } : {}) }),
        );
        const problems = await service.check(text, { uri, projectIds });
        expect(problems.filter((p) => p.severity !== 'info')).toEqual([]);
      }
    });

    it('catches a game rule the target does not have', async () => {
      const text = setupFunctionText(
        setupFunctionLines({ gameRules: { ...gameRules, spawnMobs: 'no_such_rule' }, items: [] }),
      );
      const problems = await service.check(text, { uri, projectIds });
      expect(problems.some((p) => p.severity === 'error')).toBe(true);
    });
  });
}
