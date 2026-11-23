/**
 * B555: the games Studios' pure parts: chances in 10,000ths, the one block's odds and run, an
 * area's box, a timer's clock, number formats, the world name and the world setup's live map
 * files laid over the project in memory.
 */
import type { Element, OutputFile, Project } from '@msm/plugin-api';
import { lowerWorldSetup } from '@msm/plugin-games';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { bundlePreviewProject } from '../../../../src/renderer/src/preview/bundle-source';
import {
  areaBoxOf,
  chanceOfPercent,
  clockOf,
  criterionWords,
  oddsOf,
  percentOf,
  runOneBlock,
  scoreText,
  timerAt,
  worldMapPlan,
  worldSetupName,
} from '../../../../src/renderer/src/studios/games/games-model';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const el = (id: string, kind: string, data: unknown): Element =>
  ({ id, kind, data, formatVersion: 1, meta: { createdAt: '' } }) as unknown as Element;
const project = (...elements: Element[]): Project =>
  ({
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements, assets: [] }],
  }) as unknown as Project;

describe('games model', () => {
  it('keeps chances in whole 10,000ths', () => {
    expect(percentOf(0.125)).toBe(12.5);
    expect(chanceOfPercent(12.345)).toBe(0.1235);
    expect(chanceOfPercent(150)).toBe(1);
  });

  it('gives each weighted entry its share', () => {
    expect(
      oddsOf(
        [
          { block: 'minecraft:dirt', weight: 3 },
          { block: 'minecraft:stone', weight: 1 },
        ],
        'block',
      ).map((entry) => entry.percent),
    ).toEqual([75, 25]);
  });

  it('plays phases by their breaks, looping, the same for the same seed', () => {
    const data = {
      loop: true,
      phases: [
        {
          name: 'A',
          breaks: 2,
          blocks: [{ block: 'minecraft:dirt', weight: 1 }],
          mob_chance: 0,
          chest_chance: 0,
        },
        {
          name: 'B',
          breaks: 1,
          blocks: [{ block: 'minecraft:stone', weight: 1 }],
          mob_chance: 1,
          mobs: [{ mob: 'minecraft:pig', weight: 1 }],
          chest_chance: 1,
          chest_loot: 'minecraft:chests/simple_dungeon',
        },
      ],
    };
    const run = runOneBlock(data, '7', 5);
    expect(run.map((entry) => entry.phase)).toEqual([0, 0, 1, 0, 0]);
    expect(run[2]).toMatchObject({
      chest: true,
      block: null,
      mob: 'minecraft:pig',
      newPhase: true,
    });
    expect(runOneBlock(data, '7', 5)).toEqual(run);
  });

  it('orders an area box and counts its blocks, corners inside', () => {
    const box = areaBoxOf({ from: [5, 10, 0], to: [0, 10, 2] });
    expect(box).toMatchObject({ min: [0, 10, 0], max: [5, 10, 2], size: [6, 1, 3], blocks: 18 });
    expect(box.unordered).toBe(true);
  });

  it('counts a timer down or up', () => {
    expect(clockOf(3725)).toBe('1:02:05');
    expect(timerAt({ seconds: 10, count: 'down' }, 4)).toMatchObject({ shown: 6, ended: false });
    expect(timerAt({ seconds: 10, count: 'up' }, 12)).toMatchObject({ shown: 10, ended: true });
  });

  it('writes scores by the number format and criteria in words', () => {
    expect(scoreText({}, 3).text).toBe('3');
    expect(scoreText({ number_format: { type: 'blank' } }, 3).text).toBe('');
    expect(
      scoreText({ number_format: { type: 'styled', colour: 'gold', bold: true } }, 3),
    ).toMatchObject({ colour: 'gold', bold: true });
    expect(criterionWords('minecraft.mined:minecraft.stone')).toBe('Mined: Stone');
    expect(criterionWords('dummy')).toBe('Changed only by rules');
  });

  it('names the world as the lowering does', () => {
    expect(worldSetupName('demo:games/sky_world')).toBe('Sky World');
  });
});

describe('the world setup map', () => {
  const folders = target.worldgen.terrainPreview?.dataFolders ?? [];
  const setup = el('demo:sky_world', 'msm:world_setup', {
    world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
    game_mode: 'survival',
    difficulty: 'normal',
    game_rules: {},
  });

  it('lays the lowered preset and sky biome over the project, never writing it', () => {
    const base = project(setup);
    const plan = worldMapPlan({
      project: base,
      element: setup,
      lowered: lowerWorldSetup(setup, target),
      folders,
      bundled: bundlePreviewProject,
    });
    expect(plan.draw).toBe(true);
    if (!plan.draw) return;
    expect(plan.preset.id).toBe('demo:sky_world');
    const kinds = plan.project.namespaces.flatMap((ns) =>
      ns.elements.map((e) => `${e.kind} ${e.id}`),
    );
    expect(kinds).toContain('minecraft:worldgen/biome demo:msm_games/sky');
    expect(base.namespaces[0]?.elements).toHaveLength(1);
  });

  it('draws nothing for the normal world and says why for a lowering error', () => {
    const vanilla = el('demo:w', 'msm:world_setup', { world: { type: 'vanilla' } });
    expect(
      worldMapPlan({
        project: project(vanilla),
        element: vanilla,
        lowered: [] as OutputFile[],
        folders,
        bundled: bundlePreviewProject,
      }).draw,
    ).toBe(false);
    const plan = worldMapPlan({
      project: project(setup),
      element: setup,
      lowered: new Error('demo:x'),
      folders,
      bundled: bundlePreviewProject,
    });
    expect(plan.draw === false && plan.why).not.toContain('demo:x');
  });
});
