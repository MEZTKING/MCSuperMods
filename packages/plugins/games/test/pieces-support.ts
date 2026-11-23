/**
 * Test helpers for the game pieces (B552): elements, the real schema, registry and mcfunction
 * checker of a built-in target, and the project ids a set of lowered files declares.
 */
import { readFile } from 'node:fs/promises';
import type { Element, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
} from '@msm/schemas';
import { createMcfunctionService, type McfunctionService } from '@msm/schemas/mcfunction';
import { readVendoredJson, type TargetBundle } from '@msm/targets';

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

/** An element of `kind` with `data`. */
export function element(kind: string, id: string, data: Json): Element {
  return {
    formatVersion: 1,
    id: id as ResourceLocation,
    kind,
    data,
    meta: { createdAt: '2026-01-01T00:00:00.000Z' },
  };
}

/** The text of a function file. */
export const textOf = (file: OutputFile): string =>
  new TextDecoder().decode(file.contents as Uint8Array);

export interface TargetTools {
  schemas: SchemaIndex;
  registries: RegistryIndex;
  vanilla: Record<string, string[]>;
  mcfunction: McfunctionService;
}

const cache = new Map<string, Promise<TargetTools>>();

/** The schema index, registry index and mcfunction checker of a target, made once. */
export function toolsFor(bundle: TargetBundle): Promise<TargetTools> {
  const cached = cache.get(bundle.target.id);
  if (cached !== undefined) return cached;
  const made = (async () => {
    const [commands, blocks, registries, symbols] = await Promise.all(
      (['mcmetaCommands', 'mcmetaBlocks', 'mcmetaRegistries', 'vanillaMcdocSymbols'] as const).map(
        (key) => readVendoredJson(bundle, key, nodeReadFile),
      ),
    );
    const vanilla = registries as Record<string, string[]>;
    return {
      schemas: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
        mcVersion: bundle.target.mcVersion,
      }),
      registries: createRegistryIndex({ vanilla }),
      vanilla,
      mcfunction: await createMcfunctionService(
        { commands, blocks, registries: vanilla },
        { mcVersion: bundle.target.mcVersion, mcdocSymbols: symbols },
      ),
    };
  })();
  cache.set(bundle.target.id, made);
  return made;
}

/** `data/<ns>/<folder...>/<path>.<ext>` to `<ns>:<path>` below `folder`. */
function idOf(path: string, folder: string, extension: string): string | undefined {
  const match = /^data\/([^/]+)\/(.+)$/.exec(path);
  if (match === null) return undefined;
  const [, namespace, rest] = match as unknown as [string, string, string];
  if (!rest.startsWith(`${folder}/`) || !rest.endsWith(extension)) return undefined;
  return `${namespace}:${rest.slice(folder.length + 1, rest.length - extension.length)}`;
}

/**
 * The ids the lowered files declare, as the checker's `projectIds`: functions, function tags,
 * predicates, and the plain objective, team, entity tag and boss bar names their lines make.
 */
export function projectIdsOf(
  files: readonly OutputFile[],
  folders: { function: string; tags: string; predicate: string },
  extra: Readonly<Record<string, readonly string[]>> = {},
): Record<string, string[]> {
  const ids: Record<string, Set<string>> = {};
  const add = (category: string, id: string | undefined): void => {
    if (id === undefined) return;
    if (ids[category] === undefined) ids[category] = new Set();
    ids[category].add(id);
  };
  for (const file of files) {
    add('function', idOf(file.path, folders.function, '.mcfunction'));
    add('tag/function', idOf(file.path, `${folders.tags}/${folders.function}`, '.json'));
    add('predicate', idOf(file.path, folders.predicate, '.json'));
    if (file.language !== 'mcfunction') continue;
    for (const line of textOf(file).split('\n')) {
      for (const match of line.matchAll(/scoreboard objectives add (\S+)/g)) {
        add('objective', match[1]);
      }
      for (const match of line.matchAll(/team add (\S+)/g)) add('team', match[1]);
      for (const match of line.matchAll(/tag @s add (\S+)/g)) add('tag', match[1]);
      for (const match of line.matchAll(/bossbar add (\S+)/g)) add('bossbar', match[1]);
    }
  }
  for (const [category, list] of Object.entries(extra)) for (const id of list) add(category, id);
  return Object.fromEntries(
    Object.entries(ids).map(([category, set]) => [category, [...set].sort()]),
  );
}
