/// <reference types="node" />
/**
 * Test helper: the real schema index of the newest built-in target, read from its vendored
 * symbol export with `node:fs` (tests only; the app reads it through main).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
} from '@msm/schemas';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';

/**
 * Under happy-dom, Vitest serves modules over HTTP, so `import.meta.url` (and the vendored
 * URLs built from it) read `http://localhost:<port>/@fs/<absolute path>`.
 */
function toPath(url: URL): string {
  if (url.protocol === 'file:') return fileURLToPath(url.href);
  const prefix = '/@fs/';
  if (url.pathname.startsWith(prefix))
    return decodeURIComponent(url.pathname.slice(prefix.length - 1));
  throw new Error(`Cannot read ${url.href} from the file system.`);
}

const cache = new Map<TargetBundle, Promise<SchemaIndex>>();

/** The schema index of one built-in target, built once per test file. */
export function schemaIndexFor(bundle: TargetBundle): Promise<SchemaIndex> {
  let index = cache.get(bundle);
  if (index === undefined) {
    index = (async () => {
      const raw = await readVendoredJson(bundle, 'vanillaMcdocSymbols', (url) =>
        readFile(toPath(url)),
      );
      return createSchemaIndex(parseVanillaMcdocSymbols(raw), {
        mcVersion: bundle.target.mcVersion,
      });
    })();
    cache.set(bundle, index);
  }
  return index;
}

/** The schema index of `builtInTargets[0]`, built once per test file. */
export function schemaIndex(): Promise<SchemaIndex> {
  const bundle = builtInTargets[0];
  if (bundle === undefined) return Promise.reject(new Error('No built-in target.'));
  return schemaIndexFor(bundle);
}

const registryCache = new Map<TargetBundle, Promise<RegistryIndex>>();

/** The vanilla registry index of one built-in target (mcmeta), built once per test file. */
export function registryIndexFor(bundle: TargetBundle): Promise<RegistryIndex> {
  let index = registryCache.get(bundle);
  if (index === undefined) {
    index = (async () => {
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', (url) =>
        readFile(toPath(url)),
      )) as Record<string, string[]>;
      return createRegistryIndex({ vanilla });
    })();
    registryCache.set(bundle, index);
  }
  return index;
}

/** A form completion source over a registry index (no project ids). */
export function completionsFrom(registries: RegistryIndex): {
  suggest(registry: string, prefix: string): string[];
  projectIds(): string[];
} {
  return {
    suggest: (registry, prefix) =>
      registries
        .ids(registry)
        .filter((id) => id.startsWith(prefix) || id.startsWith(`minecraft:${prefix}`)),
    projectIds: () => [],
  };
}
