/**
 * The function checker gates a snapshot target as the release it belongs to (B831; B810 V4).
 *
 * vanilla-mcdoc gates fields by release (`since="26.4"`, never a snapshot) and Spyglass orders
 * releases only. Given this target's raw `26.4-snapshot-7`, Spyglass could not order it and
 * treated every `since="26.4"` field as unknown: false "Unknown key" warnings in SNBT and item
 * components (the B810 gate probe, `docs/reference/spikes/b810/results/v4-gate-probe.txt`, and
 * `examples/flows/leaf_glider`'s `give_leaf_glider`). The service now passes Spyglass the release.
 */
import { readFile } from 'node:fs/promises';
import { releaseOfGameVersion } from '@msm/schemas';
import {
  createMcfunctionService,
  type McfunctionProblem,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import { beforeAll, describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

const INIT_HOOK_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 30_000;

/** The example's function, read from the example so the test follows it. */
const LEAF_GLIDER = new URL(
  '../../../../examples/flows/leaf_glider/content/msm_examples/function/give_leaf_glider.json',
  import.meta.url,
);

const summary = (problems: readonly McfunctionProblem[]) =>
  problems.map((p) => `${p.severity} ${p.message}`);

describe(`the function checker on ${target.id} gates by release`, {
  timeout: TEST_TIMEOUT_MS,
}, () => {
  let service: McfunctionService;

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
  }, INIT_HOOK_TIMEOUT_MS);

  it('is a snapshot of the release its id names', () => {
    expect(target.channel).toBe('snapshot');
    expect(releaseOfGameVersion(target.mcVersion)).toBe(target.id.slice('mc-'.length));
    expect(releaseOfGameVersion(target.mcVersion)).not.toBe(target.mcVersion);
    expect(service.mcVersion).toBe(target.mcVersion);
  });

  it("checks examples/flows/leaf_glider's give line without the false equip_sound warning", async () => {
    const element = (await readJson(LEAF_GLIDER)) as {
      lines?: string[];
      data?: { lines?: string[] };
    };
    const lines = element.data?.lines ?? element.lines ?? [];
    const give = lines.find((line) => line.includes('equip_sound'));
    expect(give).toBeDefined();
    expect(summary(await service.check(give as string))).toEqual([]);
  });

  it('no longer reports the B810 gate probe as unknown keys', async () => {
    for (const line of [
      'summon minecraft:zombie ~ ~ ~ {FreezingTime:20}',
      'setblock ~ ~ ~ minecraft:jukebox{playlist_position:1}',
      'summon minecraft:zombie ~ ~ ~ {DrownedConversionTime:20}',
    ]) {
      expect(summary(await service.check(line)), line).toEqual([]);
    }
  });

  it('still reports real problems', async () => {
    expect(summary(await service.check('summon minecraft:zombie ~ ~ ~ {NotAKey:20}'))).toEqual([
      'warning Unknown key “NotAKey”',
    ]);
    // 26.4 limits a test's rotation steps to 0..3: an error with its column (B810 V4).
    const rotation = await service.check('test run minecraft:always_pass 1 false 5');
    expect(rotation.filter((p) => p.severity === 'error').map((p) => p.start)).toEqual([39]);
    expect(
      summary(
        await service.check(
          'give @s minecraft:stick[minecraft:equippable={slot:"chest",not_a_field:1}]',
        ),
      ),
    ).toEqual(['warning Unknown key “not_a_field”']);
  });
});
