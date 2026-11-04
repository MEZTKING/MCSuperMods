/**
 * The chain walk of plan D5 (2): follows every worldgen link in an exported data pack and
 * reports each one that resolves to nothing. Links resolve against the zip's own files plus
 * the target's vanilla registries (mcmeta `registries.json`, ids without a namespace).
 *
 * Walked from every world preset, world preset tag, dimension and structure set in the zip:
 * world preset → dimensions → dimension types, noise settings and biome sources → biomes →
 * placed features → configured features (and carvers); structure set → structure → biome tag
 * → biomes (and nested tags); structure → start pool → pools (including fallbacks and
 * processor lists) → structure templates (`.nbt`) → the pools their jigsaws name, and every
 * jigsaw `target` must be the name of a jigsaw in the target pool's pieces or its fallbacks.
 */
import type { Target } from '@msm/plugin-api';
import { readNbt, structureTemplateFromNbt } from '@msm/plugin-structures';

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** What the walk found. */
export interface ChainWalkResult {
  /** One line per broken link: `<from> -> <registry> <id>: <reason>`. */
  errors: string[];
  /** Every `<registry> <id>` resolved from the zip itself, sorted. */
  visited: string[];
  /** Block count of every structure template read, by id. */
  structureBlocks: Record<string, number>;
}

interface Template {
  jigsaws: { pool: string; name: string; target: string }[];
  blocks: number;
}

/**
 * Walks the worldgen chain of an exported data pack.
 *
 * @param files - The zip's entries (path to bytes), as `fflate.unzipSync` returns them.
 * @param target - The target the pack was exported for (folder names).
 * @param vanilla - The target's vanilla registries, ids without a namespace.
 */
export function chainWalk(
  files: Record<string, Uint8Array>,
  target: Target,
  vanilla: Readonly<Record<string, readonly string[]>>,
): ChainWalkResult {
  const folders = target.folders.data;
  const decoder = new TextDecoder();
  const errors: string[] = [];
  const visited = new Set<string>();
  const structureBlocks: Record<string, number> = {};

  /** The file path of `id` in `registry`, or undefined for a registry the walk does not know. */
  const pathOf = (registry: string, id: string): string => {
    const [namespace, path] = namespaced(id).split(':') as [string, string];
    if (registry === 'structure') return `data/${namespace}/${folders.structure}/${path}.nbt`;
    if (registry.startsWith('tag/')) {
      return `data/${namespace}/${folders.tags}/${registry.slice(4)}/${path}.json`;
    }
    if (registry.startsWith('worldgen/')) {
      return `data/${namespace}/${folders.worldgen}/${registry.slice(9)}/${path}.json`;
    }
    const folder = (folders as Record<string, string>)[registry] ?? registry;
    return `data/${namespace}/${folder}/${path}.json`;
  };

  const json = (registry: string, id: string): unknown => {
    const bytes = files[pathOf(registry, id)];
    return bytes === undefined ? undefined : JSON.parse(decoder.decode(bytes));
  };

  const isVanilla = (registry: string, id: string): boolean => {
    const full = namespaced(id);
    if (!full.startsWith('minecraft:')) return false;
    return (vanilla[registry] ?? []).includes(full.slice('minecraft:'.length));
  };

  /**
   * Resolves `id` in `registry`: true when the zip has it (then `visit` runs once) or vanilla
   * has it; otherwise records an error.
   */
  const resolve = (from: string, registry: string, id: unknown, visit?: () => void): boolean => {
    if (typeof id !== 'string') return true;
    const full = namespaced(id);
    const key = `${registry} ${full}`;
    if (files[pathOf(registry, full)] !== undefined) {
      if (!visited.has(key)) {
        visited.add(key);
        visit?.();
      }
      return true;
    }
    if (isVanilla(registry, full)) return true;
    errors.push(`${from} -> ${key}: not in the pack or the vanilla registry`);
    return false;
  };

  /** An id, a `#tag` or a list of ids of `registry`. */
  const resolveRefs = (from: string, registry: string, value: unknown): void => {
    for (const ref of typeof value === 'string' ? [value] : arr(value)) {
      if (typeof ref !== 'string') {
        if (isObj(ref) && typeof ref.id === 'string') resolveRefs(from, registry, ref.id);
        continue;
      }
      if (ref.startsWith('#')) {
        const tag = ref.slice(1);
        resolve(from, `tag/${registry}`, tag, () => {
          const data = json(`tag/${registry}`, tag);
          resolveRefs(`#${namespaced(tag)}`, registry, isObj(data) ? data.values : undefined);
        });
      } else resolveRefs1(from, registry, ref);
    }
  };

  const resolveRefs1 = (from: string, registry: string, id: string): void => {
    resolve(from, registry, id, () => visitors[registry]?.(namespaced(id)));
  };

  const biomeSource = (from: string, source: unknown): void => {
    if (!isObj(source)) return;
    if (typeof source.biome === 'string') resolveRefs(from, 'worldgen/biome', source.biome);
    if (typeof source.preset === 'string') {
      resolve(from, 'worldgen/multi_noise_biome_source_parameter_list', source.preset);
    }
    if (typeof source.biomes === 'string') resolveRefs(from, 'worldgen/biome', source.biomes);
    for (const entry of arr(source.biomes)) {
      if (typeof entry === 'string') resolveRefs(from, 'worldgen/biome', entry);
      else if (isObj(entry)) resolveRefs(from, 'worldgen/biome', entry.biome);
    }
  };

  const dimension = (from: string, data: unknown): void => {
    if (!isObj(data)) return;
    resolve(from, 'dimension_type', data.type);
    const generator = data.generator;
    if (!isObj(generator)) return;
    if (typeof generator.settings === 'string') {
      resolve(from, 'worldgen/noise_settings', generator.settings);
    }
    biomeSource(from, generator.biome_source);
  };

  const templates = new Map<string, Template | undefined>();
  const readTemplate = (id: string): Template | undefined => {
    if (templates.has(id)) return templates.get(id);
    const bytes = files[pathOf('structure', id)];
    let template: Template | undefined;
    if (bytes !== undefined) {
      const { data } = structureTemplateFromNbt(readNbt(bytes).root);
      template = {
        jigsaws: (data.jigsaws ?? []).map(({ pool, name, target }) => ({ pool, name, target })),
        blocks: data.blocks.length,
      };
      structureBlocks[id] = template.blocks;
    }
    templates.set(id, template);
    return template;
  };

  /** Pieces of a pool element, flattening list elements. */
  const pieces = (element: unknown): Obj[] => {
    if (!isObj(element)) return [];
    if (namespaced(String(element.element_type)) === 'minecraft:list_pool_element') {
      return arr(element.elements).flatMap(pieces);
    }
    return [element];
  };

  /** Jigsaw names offered by a pool and its fallbacks; undefined when a part is vanilla. */
  const poolNames = (poolId: string, seen = new Set<string>()): Set<string> | undefined => {
    const id = namespaced(poolId);
    if (id === 'minecraft:empty' || seen.has(id)) return new Set();
    seen.add(id);
    const data = json('worldgen/template_pool', id);
    if (!isObj(data)) return undefined;
    const names = new Set<string>();
    for (const entry of arr(data.elements)) {
      for (const piece of pieces(isObj(entry) ? entry.element : undefined)) {
        const type = namespaced(String(piece.element_type));
        if (type === 'minecraft:empty_pool_element') continue;
        if (type === 'minecraft:feature_pool_element') {
          names.add('minecraft:bottom');
          continue;
        }
        if (typeof piece.location !== 'string') continue;
        const template = readTemplate(namespaced(piece.location));
        if (template === undefined) return undefined;
        for (const jigsaw of template.jigsaws) names.add(jigsaw.name);
      }
    }
    const more = poolNames(
      typeof data.fallback === 'string' ? data.fallback : 'minecraft:empty',
      seen,
    );
    if (more === undefined) return undefined;
    for (const name of more) names.add(name);
    return names;
  };

  const visitors: Record<string, (id: string) => void> = {
    'worldgen/world_preset': (id) => {
      const data = json('worldgen/world_preset', id);
      const dimensions = isObj(data) && isObj(data.dimensions) ? data.dimensions : {};
      for (const [key, value] of Object.entries(dimensions)) {
        if (!isVanilla('dimension', key)) resolve(`preset ${id}`, 'dimension', key);
        dimension(`preset ${id} ${key}`, value);
      }
    },
    dimension: (id) => dimension(`dimension ${id}`, json('dimension', id)),
    'worldgen/biome': (id) => {
      const data = json('worldgen/biome', id);
      if (!isObj(data)) return;
      for (const step of arr(data.features))
        resolveRefs(`biome ${id}`, 'worldgen/placed_feature', step);
      resolveRefs(`biome ${id}`, 'worldgen/carver', data.carvers);
    },
    'worldgen/placed_feature': (id) => {
      const data = json('worldgen/placed_feature', id);
      if (isObj(data) && typeof data.feature === 'string') {
        resolveRefs1(`placed feature ${id}`, 'worldgen/feature', data.feature);
      }
    },
    'worldgen/structure_set': (id) => {
      const data = json('worldgen/structure_set', id);
      for (const entry of arr(isObj(data) ? data.structures : undefined)) {
        if (isObj(entry)) resolveRefs(`structure set ${id}`, 'worldgen/structure', entry.structure);
      }
    },
    'worldgen/structure': (id) => {
      const data = json('worldgen/structure', id);
      if (!isObj(data)) return;
      resolveRefs(`structure ${id}`, 'worldgen/biome', data.biomes);
      if (typeof data.start_pool === 'string') {
        resolveRefs1(`structure ${id}`, 'worldgen/template_pool', data.start_pool);
      }
    },
    'worldgen/template_pool': (id) => {
      const data = json('worldgen/template_pool', id);
      if (!isObj(data)) return;
      const from = `pool ${id}`;
      if (typeof data.fallback === 'string' && namespaced(data.fallback) !== 'minecraft:empty') {
        resolveRefs1(from, 'worldgen/template_pool', data.fallback);
      }
      for (const entry of arr(data.elements)) {
        for (const piece of pieces(isObj(entry) ? entry.element : undefined)) {
          if (typeof piece.processors === 'string') {
            resolve(from, 'worldgen/processor_list', piece.processors);
          }
          if (typeof piece.feature === 'string') {
            resolve(from, 'worldgen/placed_feature', piece.feature);
          }
          if (typeof piece.location === 'string') {
            resolveRefs1(from, 'structure', piece.location);
          }
        }
      }
    },
    structure: (id) => {
      const template = readTemplate(id);
      for (const jigsaw of template?.jigsaws ?? []) {
        const from = `template ${id} jigsaw ${jigsaw.name}`;
        if (namespaced(jigsaw.pool) === 'minecraft:empty') continue;
        if (
          !resolve(from, 'worldgen/template_pool', jigsaw.pool, () =>
            visitors['worldgen/template_pool']?.(namespaced(jigsaw.pool)),
          )
        ) {
          continue;
        }
        if (namespaced(jigsaw.target) === 'minecraft:empty') continue;
        const names = poolNames(jigsaw.pool);
        if (names !== undefined && !names.has(jigsaw.target)) {
          errors.push(
            `${from} -> target ${jigsaw.target}: no jigsaw of that name in pool ${namespaced(jigsaw.pool)} or its fallbacks`,
          );
        }
      }
    },
  };

  // Roots: every world preset, world preset tag, dimension and structure set in the zip.
  const roots: [string, string][] = [];
  const prefix = (registry: string): RegExp => {
    const sample = pathOf(registry, 'ns:x');
    const [, rest] = sample.split('data/ns/') as [string, string];
    const folder = rest.slice(0, rest.length - 'x.json'.length);
    return new RegExp(`^data/([a-z0-9_.-]+)/${folder.replace(/[/.]/g, '\\$&')}(.+)\\.json$`);
  };
  for (const registry of ['worldgen/world_preset', 'dimension', 'worldgen/structure_set']) {
    const pattern = prefix(registry);
    for (const path of Object.keys(files).sort()) {
      const match = pattern.exec(path);
      if (match !== null) roots.push([registry, `${match[1]}:${match[2]}`]);
    }
  }
  const presetTags = prefix('tag/worldgen/world_preset');
  for (const path of Object.keys(files).sort()) {
    const match = presetTags.exec(path);
    if (match === null) continue;
    const data = JSON.parse(decoder.decode(files[path]));
    resolveRefs(
      `#${match[1]}:${match[2]}`,
      'worldgen/world_preset',
      isObj(data) ? data.values : [],
    );
  }
  for (const [registry, id] of roots) resolveRefs1('root', registry, id);

  return { errors, visited: [...visited].sort(), structureBlocks };
}
