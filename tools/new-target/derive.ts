/**
 * The facts a target derives from its vendored data alone (B810 V20, kind "D"), recomputed from
 * a target folder's `vendor/` and compared with the facts a target module holds. The tool prints
 * the comparison and writes it into `VERIFY.md`; it sets in `target.ts` only the identity facts
 * (`make.ts`), and a person carries the rest across.
 *
 * Pure but for `readVendored`, which reads one folder's files.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type SchemaIndex,
} from '../../packages/schemas/src/index.ts';
import { topFields } from '../diff-targets/mcdoc.ts';
import { parseJsonStrict, stringifySorted } from '../shared/download.ts';

/** A JSON value. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** One target folder's vendored files, as far as the derived facts read them. */
export interface VendoredData {
  versionFile: Record<string, unknown>;
  mcmetaSource: { refs?: { summary?: string } };
  mcdocSource: { ref?: string };
  registries: Record<string, string[]>;
  commands: { children?: Record<string, { type?: string }> };
  /** The vanilla-mcdoc export as stored (`mcdoc`, `mcdoc/dispatcher`, `ref`). */
  symbols: Record<string, unknown>;
  /** `vendor/worldgen/feature-order.json` `steps`, when the folder has it. */
  featureSteps?: string[][];
}

async function readJson(path: string): Promise<unknown> {
  return parseJsonStrict(await readFile(path, 'utf8'), path);
}

async function readOptionalJson(path: string): Promise<unknown> {
  try {
    return await readJson(path);
  } catch {
    return undefined;
  }
}

/** Reads a target folder's vendored files. */
export async function readVendored(folder: string): Promise<VendoredData> {
  const mcmeta = join(folder, 'vendor', 'mcmeta');
  const mcdoc = join(folder, 'vendor', 'vanilla-mcdoc');
  const order = (await readOptionalJson(
    join(folder, 'vendor', 'worldgen', 'feature-order.json'),
  )) as { steps?: string[][] } | undefined;
  return {
    versionFile: (await readJson(join(mcmeta, 'version.json'))) as Record<string, unknown>,
    mcmetaSource: (await readJson(join(mcmeta, 'SOURCE.json'))) as VendoredData['mcmetaSource'],
    mcdocSource: (await readJson(join(mcdoc, 'SOURCE.json'))) as VendoredData['mcdocSource'],
    registries: (await readJson(join(mcmeta, 'registries.json'))) as Record<string, string[]>,
    commands: (await readJson(join(mcmeta, 'commands.json'))) as VendoredData['commands'],
    symbols: (await readJson(join(mcdoc, 'symbols.json'))) as Record<string, unknown>,
    ...(order?.steps === undefined ? {} : { featureSteps: order.steps }),
  };
}

/** A version mcmeta tags: a release, or a snapshot, pre-release or release candidate. */
export const VERSION_PATTERN = /^[0-9]+(\.[0-9]+)*(-(snapshot|pre|rc)-[0-9]+)?$/;

/** The release line of a version: up to its first `-` (`26.4-pre-1` is on `26.4`). */
export function releaseLine(version: string): string {
  return version.split('-')[0] as string;
}

/** The target id of a version: `mc-` plus its release line. */
export function targetIdOf(version: string): string {
  return `mc-${releaseLine(version)}`;
}

/** What a deriver is given. */
interface DeriveContext {
  data: VendoredData;
  version: string;
  /** The mcdoc resolved at the folder's own version (built once, on first use). */
  index: () => SchemaIndex;
}

/** One derived fact: its path in the target's facts, where it comes from, how to compute it. */
interface Deriver {
  fact: string;
  source: string;
  derive: (context: DeriveContext) => Json | undefined;
}

const sorted = (values: Iterable<string>): string[] => [...values].sort();
const registry = (data: VendoredData, name: string): string[] | undefined => data.registries[name];

type McdocType = {
  kind?: string;
  values?: { value: unknown }[];
  fields?: { key?: string; type: McdocField }[];
};
type McdocField = {
  valueRange?: { min?: number; max?: number };
  attributes?: { name: string; value?: { value?: { value?: unknown } } }[];
};

function mcdocType(data: VendoredData, path: string): McdocType | undefined {
  const types = data.symbols.mcdoc as Record<string, McdocType> | undefined;
  return types?.[path];
}

function featureSteps(context: DeriveContext): string[] | undefined {
  const step = mcdocType(context.data, '::java::data::worldgen::DecorationStep');
  if (step?.kind !== 'enum' || step.values === undefined) return undefined;
  return step.values.map((entry) => String(entry.value));
}

/** The derived facts, in the order `VERIFY.md` lists them. */
export const DERIVERS: readonly Deriver[] = [
  {
    fact: 'id',
    source: 'mcmeta `version.json` `id`',
    derive: ({ version }) => targetIdOf(version),
  },
  { fact: 'mcVersion', source: 'mcmeta `version.json` `id`', derive: ({ version }) => version },
  {
    fact: 'channel',
    source: 'mcmeta `version.json` `type`',
    derive: ({ data }) => (data.versionFile.type === 'release' ? 'release' : 'snapshot'),
  },
  {
    fact: 'dataVersion',
    source: 'mcmeta `version.json` `data_version`',
    derive: ({ data }) => (data.versionFile.data_version as number | undefined) ?? null,
  },
  {
    fact: 'packFormats.data',
    source: 'mcmeta `version.json` `data_pack_version`, `_minor`',
    derive: ({ data }) => ({
      major: (data.versionFile.data_pack_version as number | undefined) ?? null,
      minor: (data.versionFile.data_pack_version_minor as number | undefined) ?? 0,
    }),
  },
  {
    fact: 'packFormats.resource',
    source: 'mcmeta `version.json` `resource_pack_version`, `_minor`',
    derive: ({ data }) => ({
      major: (data.versionFile.resource_pack_version as number | undefined) ?? null,
      minor: (data.versionFile.resource_pack_version_minor as number | undefined) ?? 0,
    }),
  },
  {
    fact: 'mcdocRef',
    source: 'vanilla-mcdoc `SOURCE.json` `ref`',
    derive: ({ data }) => data.mcdocSource.ref ?? null,
  },
  {
    fact: 'mcmetaRef',
    source: 'mcmeta `SOURCE.json` `refs.summary`',
    derive: ({ data }) => data.mcmetaSource.refs?.summary?.replace(/-summary$/, '') ?? null,
  },
  {
    fact: 'worldgen.featureSteps',
    source: 'mcdoc `DecorationStep`',
    derive: (context) => featureSteps(context),
  },
  {
    fact: 'worldgen.environmentAttributes',
    source: 'registry `environment_attribute`',
    derive: ({ data }) => {
      const ids = registry(data, 'environment_attribute');
      return ids === undefined ? undefined : sorted(ids.map((id) => `minecraft:${id}`));
    },
  },
  {
    fact: 'worldgen.dimensionHeight',
    source: 'mcdoc `DimensionType` `min_y`, `height`',
    derive: ({ data }) => {
      const fields =
        mcdocType(data, '::java::data::worldgen::dimension::DimensionType')?.fields ?? [];
      const field = (key: string) => fields.find((entry) => entry.key === key)?.type;
      const minY = field('min_y');
      const height = field('height');
      const step = minY?.attributes?.find((entry) => entry.name === 'divisible_by')?.value?.value
        ?.value;
      if (minY?.valueRange?.min === undefined || minY.valueRange.max === undefined) {
        return undefined;
      }
      if (typeof step !== 'number' || height?.valueRange?.min !== step) return undefined;
      return { minY: minY.valueRange.min, maxY: minY.valueRange.max, step };
    },
  },
  {
    fact: 'worldgen.noiseSettingsDefaultBlock',
    source: 'mcdoc `worldgen/noise_settings` at this version',
    derive: ({ index }) => {
      try {
        const fields = topFields(index().dispatch('minecraft:resource', 'worldgen/noise_settings'));
        return fields === undefined ? undefined : fields.has('default_block');
      } catch {
        return undefined;
      }
    },
  },
  {
    fact: 'worldgen.vanillaFeatureOrder',
    source: '`vendor/worldgen/feature-order.json` by `DecorationStep`',
    derive: (context) => {
      const steps = featureSteps(context);
      const order = context.data.featureSteps;
      if (steps === undefined || order === undefined) return undefined;
      return Object.fromEntries(steps.map((step, i) => [step, order[i] ?? []]));
    },
  },
  {
    fact: 'commands.vanillaNames',
    source: '`commands.json` root literals',
    derive: ({ data }) => {
      const children = data.commands.children;
      if (children === undefined) return undefined;
      return sorted(
        Object.entries(children)
          .filter(([, node]) => node.type === 'literal')
          .map(([name]) => name),
      );
    },
  },
  {
    fact: 'entities.saddleTag',
    source: 'registry `tag/entity_type` `can_equip_saddle`',
    derive: ({ data }) =>
      registry(data, 'tag/entity_type')?.includes('can_equip_saddle')
        ? 'minecraft:can_equip_saddle'
        : null,
  },
  {
    fact: 'entities.villagerTypes',
    source: 'registry `villager_type`',
    derive: ({ data }) => {
      const ids = registry(data, 'villager_type');
      return ids === undefined ? undefined : sorted(ids);
    },
  },
  {
    fact: 'gameRules.vanillaNames',
    source: 'registry `game_rule`',
    derive: ({ data }) => {
      const ids = registry(data, 'game_rule');
      return ids === undefined ? undefined : sorted(ids);
    },
  },
  {
    fact: 'stats.vanillaCustomStats',
    source: 'registry `custom_stat`',
    derive: ({ data }) => {
      const ids = registry(data, 'custom_stat');
      return ids === undefined ? undefined : sorted(ids);
    },
  },
  {
    fact: 'scoreboard.statTypes',
    source: 'registry `stat_type`',
    derive: ({ data }) => {
      const ids = registry(data, 'stat_type');
      return ids === undefined ? undefined : sorted(ids);
    },
  },
];

/** Every derived fact of a folder's data, by fact path (`undefined`: the data has no answer). */
export function deriveFacts(data: VendoredData): Map<string, Json | undefined> {
  const version = String(data.versionFile.id);
  let index: SchemaIndex | undefined;
  const context: DeriveContext = {
    data,
    version,
    index: () => {
      index ??= createSchemaIndex(parseVanillaMcdocSymbols(data.symbols), { mcVersion: version });
      return index;
    },
  };
  const out = new Map<string, Json | undefined>();
  for (const deriver of DERIVERS) out.set(deriver.fact, deriver.derive(context));
  return out;
}

/** Reads a fact by its dotted path (`worldgen.featureSteps`). */
export function factAt(facts: unknown, path: string): unknown {
  let current: unknown = facts;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** The facts as plain JSON: functions (the hooks) and `undefined` left out. */
export function plainFacts(target: unknown): Record<string, Json> {
  return JSON.parse(JSON.stringify(target ?? {})) as Record<string, Json>;
}

/** How a derived fact compares with the value a target holds. */
export type FactState = 'same' | 'changed' | 'not-derived';

export interface FactComparison {
  fact: string;
  source: string;
  /** What the target module holds today. */
  before: Json | undefined;
  /** What the vendored data now gives. */
  after: Json | undefined;
  state: FactState;
}

const same = (a: unknown, b: unknown): boolean =>
  a === undefined || b === undefined ? a === b : stringifySorted(a) === stringifySorted(b);

/** Compares every derived fact of `data` with `facts`, a target's plain facts. */
export function compareFacts(facts: Record<string, Json>, data: VendoredData): FactComparison[] {
  const derived = deriveFacts(data);
  return DERIVERS.map(({ fact, source }) => {
    const raw = factAt(facts, fact) as Json | undefined;
    const after = derived.get(fact);
    // A fact a target leaves unset reads as `null` from the data (no saddle tag).
    const before = raw === undefined && after === null ? null : raw;
    const state: FactState =
      after === undefined ? 'not-derived' : same(before, after) ? 'same' : 'changed';
    return { fact, source, before, after, state };
  });
}

const code = (text: string): string => `\`${text.replaceAll('`', "'")}\``;

/** A short description of a value for a table cell or a log line. */
export function showValue(value: Json | undefined): string {
  if (value === undefined) return '(none)';
  if (Array.isArray(value)) return `${value.length} items`;
  if (value !== null && typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length <= 60 ? code(text) : `${Object.keys(value).length} entries`;
  }
  return code(JSON.stringify(value));
}

/** What changed inside a list fact: members added and removed, at most `limit` each. */
export function listDelta(
  before: Json | undefined,
  after: Json | undefined,
  limit = 12,
): string | undefined {
  if (!Array.isArray(before) || !Array.isArray(after)) return undefined;
  const a = new Set(before.map((v) => JSON.stringify(v)));
  const b = new Set(after.map((v) => JSON.stringify(v)));
  const added = [...b].filter((v) => !a.has(v));
  const removed = [...a].filter((v) => !b.has(v));
  const part = (sign: string, values: string[]) =>
    values.length === 0
      ? []
      : [
          `${sign}${values
            .slice(0, limit)
            .map((v) => code(JSON.parse(v) as string))
            .join(', ')}${values.length > limit ? ` and ${values.length - limit} more` : ''}`,
        ];
  const parts = [...part('+', added), ...part('-', removed)];
  if (parts.length === 0) return 'same members, new order';
  return parts.join('; ');
}

/** One line per derived fact that changed, for the log. */
export function factDiffLines(comparisons: readonly FactComparison[]): string[] {
  return comparisons
    .filter((c) => c.state !== 'same')
    .map((c) => {
      if (c.state === 'not-derived') return `${c.fact}: not derivable from the new data`;
      const delta = listDelta(c.before, c.after);
      return `${c.fact}: ${showValue(c.before)} -> ${showValue(c.after)}${delta ? ` (${delta})` : ''}`;
    });
}
