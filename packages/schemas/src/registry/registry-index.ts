/**
 * Registry index for `#[id]` checks (ADR 0009). Vanilla ids come from the mcmeta
 * `registries.json` the target vendors (ids without a namespace); project ids are supplied by
 * the caller, already namespaced. Nothing here reads files or names a Minecraft version.
 */

/** Read-only lookup over vanilla and project registry ids. */
export interface RegistryIndex {
  /**
   * Whether `id` is in `registry`. `id` may be `x` (read as `minecraft:x`), `minecraft:x` or
   * `ns:x`. A tag reference `#x` is checked against registry `tag/<registry>` (vanilla tags
   * from mcmeta plus project tags) when the index knows that registry, and is accepted
   * otherwise. `registry` may carry a `minecraft:` prefix. An unknown registry has no ids.
   */
  has(registry: string, id: string): boolean;
  /** Every id of `registry`, namespaced and sorted; `[]` for an unknown registry. */
  ids(registry: string): readonly string[];
  /** Every registry name (unprefixed), sorted. */
  registries(): readonly string[];
}

/** Input for `createRegistryIndex`. */
export interface RegistryIndexInput {
  /** The mcmeta `registries.json`: registry name to ids without a namespace. */
  vanilla: Readonly<Record<string, readonly string[]>>;
  /**
   * Namespaced ids the project defines, per registry. Tags go under `tag/<registry>`, without
   * the `#`.
   */
  project?: Readonly<Record<string, readonly string[]>>;
}

const DEFAULT_NAMESPACE = 'minecraft';
const MINECRAFT_PREFIX = 'minecraft:';
/** Registry name prefix under which tag ids of a registry are stored, e.g. `tag/item`. */
const TAG_REGISTRY_PREFIX = 'tag/';

/** `x` becomes `minecraft:x`; a namespaced id is returned unchanged. */
function namespaced(id: string): string {
  return id.includes(':') ? id : `${DEFAULT_NAMESPACE}:${id}`;
}

function registryName(registry: string): string {
  return registry.startsWith(MINECRAFT_PREFIX) ? registry.slice(MINECRAFT_PREFIX.length) : registry;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Builds an immutable registry index. Ids are stored namespaced. */
export function createRegistryIndex(input: RegistryIndexInput): RegistryIndex {
  const sets = new Map<string, Set<string>>();
  const add = (source: Readonly<Record<string, readonly string[]>> | undefined): void => {
    if (source === undefined) return;
    for (const [registry, ids] of Object.entries(source)) {
      const name = registryName(registry);
      let set = sets.get(name);
      if (set === undefined) {
        set = new Set();
        sets.set(name, set);
      }
      for (const id of ids) set.add(namespaced(id));
    }
  };
  add(input.vanilla);
  add(input.project);

  const sorted = new Map<string, readonly string[]>();
  for (const [name, set] of sets) sorted.set(name, Object.freeze([...set].sort(compare)));
  const names = Object.freeze([...sets.keys()].sort(compare));
  const EMPTY: readonly string[] = Object.freeze([]);

  return {
    has: (registry, id) => {
      const name = registryName(registry);
      if (id.startsWith('#')) {
        const tags = sets.get(`${TAG_REGISTRY_PREFIX}${name}`);
        return tags === undefined || tags.has(namespaced(id.slice(1)));
      }
      return sets.get(name)?.has(namespaced(id)) ?? false;
    },
    ids: (registry) => sorted.get(registryName(registry)) ?? EMPTY,
    registries: () => names,
  };
}
