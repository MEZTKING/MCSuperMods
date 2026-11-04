/**
 * Loads the schema model for a project's target through the platform (vendored files are
 * served by main, plan D10) and derives the project's own registry ids for `#[id]` checks.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
} from '@msm/schemas';
import type { PlatformAdapter } from '../../../shared/platform';

/** Everything validation and the forms need for one target. */
export interface SchemaContext {
  /** The target the schemas belong to. */
  target: Target;
  /** Version-gated schema index over the target's vanilla-mcdoc export. */
  schemaIndex: SchemaIndex;
  /** Vanilla registry ids (mcmeta `registries.json`, ids without a namespace). */
  vanillaRegistries: Readonly<Record<string, readonly string[]>>;
  /**
   * The registry index for `project`: vanilla ids plus the project's own models, textures and
   * sounds. Memoised on the set of project ids.
   */
  registries(project: Project): RegistryIndex;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function parseJsonBytes(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(
      `The vendored ${what} file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseRegistries(json: unknown): Record<string, string[]> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('The vendored registries file is not a JSON object.');
  }
  const out: Record<string, string[]> = {};
  for (const [name, ids] of Object.entries(json)) {
    if (Array.isArray(ids)) out[name] = ids.filter((id): id is string => typeof id === 'string');
  }
  return out;
}

/** Strips `prefix` and `suffix` from `path`, or returns `undefined` when either is absent. */
function between(path: string, prefix: string, suffix: string): string | undefined {
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const middle = path.slice(prefix.length, path.length - suffix.length);
  return middle === '' ? undefined : middle;
}

/**
 * The ids a project defines, per registry: `model` (model elements), `texture` (PNG assets
 * under `textures/`) and `sound` (Ogg assets under `sounds/`). Sorted, namespaced.
 *
 * @param project - The project.
 */
export function projectRegistryIds(project: Project): Record<string, string[]> {
  const model: string[] = [];
  const texture: string[] = [];
  const sound: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === 'minecraft:model') model.push(element.id);
    }
    for (const asset of namespace.assets) {
      const textureId = between(asset.path, 'textures/', '.png');
      if (textureId !== undefined) texture.push(`${namespace.name}:${textureId}`);
      const soundId = between(asset.path, 'sounds/', '.ogg');
      if (soundId !== undefined) sound.push(`${namespace.name}:${soundId}`);
    }
  }
  return { model: model.sort(), sound: sound.sort(), texture: texture.sort() };
}

/**
 * Reads and parses the target's vendored symbols and registries through the platform.
 *
 * @param platform - Supplies `targets.readVendored`.
 * @param target - The target to load.
 */
export async function loadSchemaContext(
  platform: Pick<PlatformAdapter, 'targets'>,
  target: Target,
): Promise<SchemaContext> {
  const [symbolBytes, registryBytes] = await Promise.all([
    platform.targets.readVendored(target.id, 'vanillaMcdocSymbols'),
    platform.targets.readVendored(target.id, 'mcmetaRegistries'),
  ]);
  const symbols = parseVanillaMcdocSymbols(parseJsonBytes(symbolBytes, 'vanilla-mcdoc symbols'));
  const vanillaRegistries = parseRegistries(parseJsonBytes(registryBytes, 'registries'));
  const schemaIndex = createSchemaIndex(symbols, { mcVersion: target.mcVersion });

  let cachedKey: string | null = null;
  let cached: RegistryIndex | null = null;
  return {
    target,
    schemaIndex,
    vanillaRegistries,
    registries(project) {
      const ids = projectRegistryIds(project);
      const key = JSON.stringify(ids);
      if (cached === null || key !== cachedKey) {
        cached = createRegistryIndex({ vanilla: vanillaRegistries, project: ids });
        cachedKey = key;
      }
      return cached;
    },
  };
}
