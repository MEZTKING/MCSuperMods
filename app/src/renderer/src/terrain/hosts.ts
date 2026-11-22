/**
 * The worlds a worldgen element is drawn in (ADR 0119 D7; B582): the "Seen in" picker's choices.
 *
 * - A **dimension** is a world by itself; a **world preset** gives one choice per dimension it
 *   names (the picker reads "Dimension" then).
 * - Every other kind the map draws (noise settings, a biome, a parameter list, a flat preset, a
 *   surface rule or condition) is shown inside a world that uses it: each project dimension, and
 *   each dimension of a project world preset, whose files lead to the element's id (a reference
 *   by id anywhere in its file or in a project file it names, followed through the project's
 *   files). Last comes a **plain world** made around the element alone: these settings with one
 *   biome, this biome everywhere over the overworld's land, this list of biomes, these flat
 *   layers, this surface rule over the overworld's land. Its files live in memory only, under
 *   the namespace {@link HOST_NAMESPACE}; they are never written anywhere.
 */

import type { TerrainSource, WorldgenFileMap } from './client';
import { hashText, stableKey } from './client';

/** The namespace of a plain world's own files. */
export const HOST_NAMESPACE = 'msm_preview';

const HOST_ID = `${HOST_NAMESPACE}:host`;

/** The block a plain world puts where a surface condition is true. */
export const LIT_BLOCK = 'minecraft:glowstone';

/** One world the element can be seen in. */
export interface TerrainHost {
  /** Stable key of this choice (for the picker and the world's hash). */
  readonly key: string;
  /** What the picker shows. */
  readonly label: string;
  readonly source: TerrainSource;
  /** Files laid over the project's for this world only (a plain world's), else empty. */
  readonly extra: WorldgenFileMap;
  /** True for the plain world made around the element. */
  readonly plain: boolean;
}

/** What {@link hostsFor} reads of the element. */
export interface HostElement {
  readonly kind: string;
  readonly id: string;
  readonly data: unknown;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `id` with the `minecraft` namespace when it has none. */
export function withNamespace(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** The registry folder of a worldgen kind id (`minecraft:worldgen/biome` to `worldgen/biome`). */
export function folderOfKind(kind: string): string {
  return kind.startsWith('minecraft:') ? kind.slice('minecraft:'.length) : kind;
}

/** Every id a JSON value names: strings that look like ids, with the namespace added. */
function idsIn(value: unknown, out: Set<string>): Set<string> {
  if (typeof value === 'string') {
    if (/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value) || /^[a-z0-9_./-]+$/.test(value)) {
      out.add(withNamespace(value));
    }
  } else if (Array.isArray(value)) {
    for (const item of value) idsIn(item, out);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) idsIn(item, out);
  }
  return out;
}

/** Whether `start` leads to `id` through the project's own files. */
function leadsTo(start: unknown, id: string, project: WorldgenFileMap): boolean {
  const byId = new Map<string, unknown[]>();
  for (const files of Object.values(project)) {
    for (const [fileId, json] of Object.entries(files)) {
      const key = withNamespace(fileId);
      byId.set(key, [...(byId.get(key) ?? []), json]);
    }
  }
  const seen = new Set<string>();
  const queue = [...idsIn(start, new Set())];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (next === id) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const json of byId.get(next) ?? []) queue.push(...idsIn(json, new Set()));
  }
  return false;
}

/** The dimensions a world preset names, in its order. */
export function presetDimensions(data: unknown): string[] {
  const dimensions = isObject(data) && isObject(data.dimensions) ? data.dimensions : {};
  return Object.keys(dimensions);
}

/** The noise settings of the overworld, the plain world's land. */
const OVERWORLD_SETTINGS = 'minecraft:overworld';
const OVERWORLD_TYPE = 'minecraft:overworld';

function noiseDimension(settings: unknown, biomeSource: Json): Json {
  return {
    type: OVERWORLD_TYPE,
    generator: { type: 'minecraft:noise', settings, biome_source: biomeSource },
  };
}

/**
 * The plain world made around the element, or `null` for a kind that has none. Settings a
 * surface rule is shown in are the overworld's from `vanilla` with only the rule changed (in
 * memory); without vanilla's files the plain world names them, and the view shows the set-up
 * banner as for any vanilla file.
 */
export function plainHost(
  element: HostElement,
  vanilla: WorldgenFileMap | null,
): TerrainHost | null {
  const id = withNamespace(element.id);
  const folder = folderOfKind(element.kind);
  const plains = { type: 'minecraft:fixed', biome: 'minecraft:plains' };
  let dimension: Json | null = null;
  let label = '';
  const extra: Record<string, Record<string, unknown>> = {};
  const overworld = vanilla?.['worldgen/noise_settings']?.[OVERWORLD_SETTINGS];
  const withRule = (rule: unknown): string => {
    if (!isObject(overworld)) return OVERWORLD_SETTINGS;
    extra['worldgen/noise_settings'] = { [HOST_ID]: { ...overworld, surface_rule: rule } };
    return HOST_ID;
  };
  switch (folder) {
    case 'worldgen/noise_settings':
      dimension = noiseDimension(id, plains);
      label = 'A plain world with these settings and one biome';
      break;
    case 'worldgen/biome':
      dimension = noiseDimension(OVERWORLD_SETTINGS, { type: 'minecraft:fixed', biome: id });
      label = "A plain world: this biome everywhere on the overworld's land";
      break;
    case 'worldgen/multi_noise_biome_source_parameter_list':
      dimension = noiseDimension(OVERWORLD_SETTINGS, { type: 'minecraft:multi_noise', preset: id });
      label = "A plain world: these biomes on the overworld's land";
      break;
    case 'worldgen/flat_level_generator_preset': {
      const settings = isObject(element.data) ? element.data.settings : undefined;
      dimension = { type: OVERWORLD_TYPE, generator: { type: 'minecraft:flat', settings } };
      label = 'A plain world with these layers';
      break;
    }
    case 'worldgen/material_rule': {
      const settings = withRule(id);
      dimension = noiseDimension(settings, plains);
      label = "A plain world: this rule on the overworld's land";
      break;
    }
    case 'worldgen/material_condition': {
      const original = isObject(overworld) ? overworld.surface_rule : undefined;
      const lit = {
        type: 'minecraft:condition',
        if_true: id,
        then_run: { type: 'minecraft:block', result_state: { Name: LIT_BLOCK } },
      };
      const rule =
        original === undefined ? lit : { type: 'minecraft:sequence', sequence: [lit, original] };
      const settings = withRule(rule);
      dimension = noiseDimension(settings, plains);
      label = "A plain world: glowstone where this is true, on the overworld's land";
      break;
    }
    default:
      return null;
  }
  extra.dimension = { [HOST_ID]: dimension };
  return {
    key: `plain:${hashText(stableKey(extra))}`,
    label,
    source: { dimension: HOST_ID },
    extra,
    plain: true,
  };
}

/**
 * The worlds `element` can be seen in, project worlds first, the plain world last; see the
 * module comment. `project` is the project's lowered files (`files.ts`).
 */
export function hostsFor(
  element: HostElement,
  project: WorldgenFileMap,
  vanilla: WorldgenFileMap | null,
): TerrainHost[] {
  const id = withNamespace(element.id);
  const folder = folderOfKind(element.kind);
  if (folder === 'dimension') {
    return [
      { key: `dimension:${id}`, label: id, source: { dimension: id }, extra: {}, plain: false },
    ];
  }
  if (folder === 'worldgen/world_preset') {
    const data = project['worldgen/world_preset']?.[id] ?? element.data;
    return presetDimensions(data).map((dimension) => ({
      key: `preset:${id}:${dimension}`,
      label: withNamespace(dimension),
      source: { preset: id, dimension },
      extra: {},
      plain: false,
    }));
  }
  const hosts: TerrainHost[] = [];
  for (const [dimensionId, json] of Object.entries(project.dimension ?? {})) {
    if (leadsTo(json, id, project)) {
      const key = withNamespace(dimensionId);
      hosts.push({
        key: `dimension:${key}`,
        label: key,
        source: { dimension: key },
        extra: {},
        plain: false,
      });
    }
  }
  for (const [presetId, preset] of Object.entries(project['worldgen/world_preset'] ?? {})) {
    const dimensions = isObject(preset) && isObject(preset.dimensions) ? preset.dimensions : {};
    for (const [dimension, json] of Object.entries(dimensions)) {
      if (!leadsTo(json, id, project)) continue;
      const key = withNamespace(presetId);
      hosts.push({
        key: `preset:${key}:${dimension}`,
        label: `${withNamespace(dimension)} of ${key}`,
        source: { preset: key, dimension },
        extra: {},
        plain: false,
      });
    }
  }
  const plain = plainHost(element, vanilla);
  if (plain !== null) hosts.push(plain);
  return hosts;
}

/** The project's files with a host's own laid over them. */
export function filesWithHost(project: WorldgenFileMap, host: TerrainHost): WorldgenFileMap {
  if (Object.keys(host.extra).length === 0) return project;
  const out: Record<string, Readonly<Record<string, unknown>>> = { ...project };
  for (const [folder, files] of Object.entries(host.extra)) {
    out[folder] = { ...(project[folder] ?? {}), ...files };
  }
  return out;
}

/**
 * The dimension JSON a host draws (for the view's labels: the End, the kind of biome source),
 * or `null` when it is not in the project's or the host's files.
 */
export function hostDimension(host: TerrainHost, project: WorldgenFileMap): Json | null {
  const files = filesWithHost(project, host);
  const source = host.source;
  if ('preset' in source) {
    const preset = files['worldgen/world_preset']?.[source.preset];
    const dimensions = isObject(preset) && isObject(preset.dimensions) ? preset.dimensions : {};
    const json = dimensions[source.dimension] ?? dimensions[withNamespace(source.dimension)];
    return isObject(json) ? json : null;
  }
  const json = files.dimension?.[source.dimension];
  return isObject(json) ? json : null;
}

/** Whether a dimension is the End (by its biome source or its id): its land is approximate. */
export function isEndDimension(host: TerrainHost, dimension: Json | null): boolean {
  const name = 'preset' in host.source ? host.source.dimension : host.source.dimension;
  if (withNamespace(name) === 'minecraft:the_end') return true;
  const generator = isObject(dimension?.generator) ? dimension.generator : {};
  const biomeSource = isObject(generator.biome_source) ? generator.biome_source : {};
  return (
    typeof biomeSource.type === 'string' && withNamespace(biomeSource.type) === 'minecraft:the_end'
  );
}

/** Whether a dimension places its biomes by climate (`multi_noise`). */
export function usesClimate(dimension: Json | null): boolean {
  const generator = isObject(dimension?.generator) ? dimension.generator : {};
  const biomeSource = isObject(generator.biome_source) ? generator.biome_source : {};
  return (
    typeof biomeSource.type === 'string' &&
    withNamespace(biomeSource.type) === 'minecraft:multi_noise'
  );
}
