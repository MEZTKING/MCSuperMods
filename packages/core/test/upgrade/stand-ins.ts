/**
 * Stand-in targets for the upgrade tests (B815): `mc-a`, then `mc-b` (drops `default_block`
 * from noise settings and reports a removed block id, as the second built-in target does),
 * then `mc-c` (renames the feature type `ore` and drops `disable_mob_generation`, as B810
 * V14's stand-in third target did). No real version is named.
 */

import type {
  Json,
  MigrationChange,
  MigrationDetail,
  MigrationReport,
  Problem,
  Project,
  Target,
  TargetChangeSet,
} from '@msm/plugin-api';
import { createElement, createEmptyProject } from '../../src/index';
import { testTarget } from '../helpers/target';

type JsonObject = { [key: string]: Json };
const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const DEFAULT_BLOCK_CHANGE =
  'formats:minecraft:resource/worldgen/noise_settings#/default_block';
export const OLD_BLOCK_CHANGE = 'ids:block/old_block';
export const ORE_CHANGE = 'ids:worldgen/feature/ore';
export const MOB_GENERATION_CHANGE =
  'formats:minecraft:resource/worldgen/noise_settings#/disable_mob_generation';

export const changeSetB: TargetChangeSet = {
  from: 'mc-a',
  to: 'mc-b',
  refs: { from: { mcdoc: 'a', mcmeta: 'a' }, to: { mcdoc: 'b', mcmeta: 'b' } },
  changes: [
    {
      id: DEFAULT_BLOCK_CHANGE,
      area: 'formats',
      what: 'field-removed',
      registry: 'minecraft:resource',
      subject: 'minecraft:resource/worldgen/noise_settings',
      field: '/default_block',
      handling: 'auto',
      source: 'mcdoc',
      sentence: 'Noise settings no longer have a default block.',
      inGameCheck: 'Walk in the world and look at the ground.',
    },
    {
      id: OLD_BLOCK_CHANGE,
      area: 'ids',
      what: 'member-removed',
      registry: 'block',
      subject: 'block/old_block',
      from: 'old_block',
      handling: 'manual',
      source: 'registries',
      hint: 'Use another block.',
    },
    {
      id: 'ids:item/unused_thing',
      area: 'ids',
      what: 'member-removed',
      registry: 'item',
      subject: 'item/unused_thing',
      from: 'unused_thing',
      handling: 'manual',
      source: 'registries',
    },
    {
      id: 'formats:minecraft:resource/recipe#/new_option',
      area: 'formats',
      what: 'field-addedOptional',
      registry: 'minecraft:resource',
      subject: 'minecraft:resource/recipe',
      field: '/new_option',
      handling: 'none',
      source: 'mcdoc',
    },
    {
      id: 'packs:data_pack_version',
      area: 'packs',
      what: 'value-changed',
      subject: 'data_pack_version',
      from: 1,
      to: 2,
      handling: 'auto',
      source: 'version',
    },
  ],
  additions: { 'ids:block': 3, 'ids:item': 2 },
};

export const changeSetC: TargetChangeSet = {
  from: 'mc-b',
  to: 'mc-c',
  refs: { from: { mcdoc: 'b', mcmeta: 'b' }, to: { mcdoc: 'c', mcmeta: 'c' } },
  changes: [
    {
      id: MOB_GENERATION_CHANGE,
      area: 'formats',
      what: 'field-removed',
      registry: 'minecraft:resource',
      subject: 'minecraft:resource/worldgen/noise_settings',
      field: '/disable_mob_generation',
      handling: 'auto',
      source: 'mcdoc',
    },
    {
      id: ORE_CHANGE,
      area: 'ids',
      what: 'member-renamed',
      registry: 'worldgen/feature',
      subject: 'worldgen/feature/ore',
      from: 'ore',
      to: 'mineral_vein',
      handling: 'auto',
      source: 'curated',
    },
  ],
  additions: { 'ids:block': 1 },
};

function migrateB(previous: Target, project: Project): MigrationReport {
  if (previous.id !== 'mc-a') {
    return {
      changes: [],
      problems: [{ severity: 'warning', code: 'target.no-migration-path', message: 'No path.' }],
    };
  }
  const changes: MigrationChange[] = [];
  const problems: Problem[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const data = element.data;
      if (element.kind === 'minecraft:worldgen/noise_settings' && isObject(data)) {
        if ('default_block' in data) {
          const next = structuredClone(data);
          const before = next.default_block as Json;
          delete next.default_block;
          changes.push({
            elementId: element.id,
            kind: 'update',
            description: 'Removed default_block.',
            data: next,
            details: [
              { op: 'drop', path: '/default_block', before, changeId: DEFAULT_BLOCK_CHANGE },
            ],
          });
        }
      }
      if (isObject(data) && data.block === 'minecraft:old_block') {
        problems.push({
          severity: 'error',
          code: 'target.removed-id',
          message: 'minecraft:old_block was removed in the newer version.',
          elementId: element.id,
          path: '/block',
        });
      }
    }
  }
  return { changes, problems };
}

function migrateC(previous: Target, project: Project): MigrationReport {
  if (previous.id !== 'mc-b') {
    return {
      changes: [],
      problems: [{ severity: 'warning', code: 'target.no-migration-path', message: 'No path.' }],
    };
  }
  const changes: MigrationChange[] = [];
  const reverses: MigrationReport['reverses'] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const data = element.data;
      if (!isObject(data)) continue;
      let next: JsonObject | undefined;
      const details: MigrationDetail[] = [];
      if (
        element.kind === 'minecraft:worldgen/configured_feature' &&
        data.type === 'minecraft:ore'
      ) {
        next = structuredClone(data);
        next.type = 'minecraft:mineral_vein';
        details.push({
          op: 'rename-id',
          path: '/type',
          before: 'minecraft:ore',
          after: 'minecraft:mineral_vein',
          changeId: ORE_CHANGE,
        });
      }
      if (
        element.kind === 'minecraft:worldgen/noise_settings' &&
        'disable_mob_generation' in data
      ) {
        next = next ?? structuredClone(data);
        const before = next.disable_mob_generation as Json;
        delete next.disable_mob_generation;
        details.push({
          op: 'drop',
          path: '/disable_mob_generation',
          before,
          changeId: MOB_GENERATION_CHANGE,
        });
        // This hook gives its reverses itself; the host fills the hash.
        reverses.push({
          elementId: element.id,
          path: '/disable_mob_generation',
          value: before,
          afterHash: '',
        });
      }
      if (next !== undefined) {
        changes.push({
          elementId: element.id,
          kind: 'update',
          description: 'Moved to the newest version.',
          data: next,
          details,
        });
      }
    }
  }
  return {
    changes,
    problems: [],
    inGameChecks: [{ changeId: ORE_CHANGE, check: 'Find an ore vein.' }],
    reverses,
  };
}

export const targetA: Target = { ...testTarget, id: 'mc-a', mcVersion: 'a' };
export const targetB: Target = {
  ...testTarget,
  id: 'mc-b',
  mcVersion: 'b',
  previous: 'mc-a',
  packFormats: { resource: { major: 2, minor: 0 }, data: { major: 2, minor: 1 } },
  changes: changeSetB,
  migrateFrom: migrateB,
};
export const targetC: Target = {
  ...testTarget,
  id: 'mc-c',
  mcVersion: 'c',
  previous: 'mc-b',
  changes: changeSetC,
  migrateFrom: migrateC,
};
/** A target beside `mc-b` on another branch: no path between them. */
export const targetSide: Target = {
  ...testTarget,
  id: 'mc-side',
  mcVersion: 'side',
  previous: 'mc-a',
};

export const allTargets: Target[] = [targetC, targetA, targetSide, targetB];

const now = () => '2026-01-01T00:00:00.000Z';

/** A project on `mc-a` touched by every stand-in change but `unused_thing`. */
export function fixtureProject(): Project {
  const project = createEmptyProject('Fixture', { targets: ['mc-a'] });
  project.namespaces.push({
    name: 'fx',
    assets: [],
    elements: [
      createElement({
        id: 'fx:land',
        kind: 'minecraft:worldgen/noise_settings',
        data: {
          default_block: { Name: 'minecraft:stone' },
          disable_mob_generation: false,
          sea_level: 63,
        },
        now,
      }),
      createElement({
        id: 'fx:veins',
        kind: 'minecraft:worldgen/configured_feature',
        data: { type: 'minecraft:ore', config: { size: 9 } },
        now,
      }),
      createElement({
        id: 'fx:pillar',
        kind: 'msm:block',
        data: { block: 'minecraft:old_block', name: 'Pillar' },
        now,
      }),
      createElement({
        id: 'fx:words',
        kind: 'minecraft:lang',
        data: { 'block.fx.pillar': 'old_block' },
        now,
      }),
    ],
  });
  return project;
}
