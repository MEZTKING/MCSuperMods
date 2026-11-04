import { readFile } from 'node:fs/promises';
import { ElementKindRegistry } from '@msm/core';
import type {
  Element,
  ElementKind,
  Json,
  OutputFile,
  OutputLayer,
  Project,
  ResourceLocation,
} from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
} from '@msm/schemas';
import { readVendoredJson, type TargetBundle } from '@msm/targets';

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const cache = new Map<string, Promise<{ schemaIndex: SchemaIndex; registries: RegistryIndex }>>();

/** The schema and registry indexes for a built-in target, built once per test file. */
export function indexesFor(
  bundle: TargetBundle,
): Promise<{ schemaIndex: SchemaIndex; registries: RegistryIndex }> {
  let entry = cache.get(bundle.target.id);
  if (entry === undefined) {
    entry = (async () => {
      const symbols = parseVanillaMcdocSymbols(
        await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      );
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      return {
        schemaIndex: createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion }),
        registries: createRegistryIndex({ vanilla }),
      };
    })();
    cache.set(bundle.target.id, entry);
  }
  return entry;
}

function splitId(id: string): { namespace: string; path: string } {
  const [namespace, path] = id.split(':') as [string, string];
  return { namespace, path };
}

/** A stand-in for the resource pack plugin's model kind. */
export const modelKind: ElementKind = {
  id: 'test:model',
  schema: '::java::assets::model::Model',
  folder: 'model',
  lower(element, target) {
    const { namespace, path } = splitId(element.id);
    return [
      {
        path: `assets/${namespace}/${target.folders.resource.model}/${path}.json`,
        contents: element.data,
        layer: 'resourcepack',
        schema: 'resource:model',
      },
    ];
  },
};

/** A stand-in for the resource pack plugin's lang kind. */
export const langKind: ElementKind = {
  id: 'test:lang',
  schema: '::java::assets::lang::Lang',
  folder: 'lang',
  lower(element, target) {
    const { namespace, path } = splitId(element.id);
    return [
      {
        path: `assets/${namespace}/${target.folders.resource.lang}/${path}.json`,
        contents: element.data,
        layer: 'resourcepack',
        schema: 'resource:lang',
      },
    ];
  },
};

/** Data of a {@link rawKind} element: the one file it lowers to. */
export interface RawData {
  path: string;
  layer: OutputLayer;
  json?: Json;
  text?: string;
  schema?: string;
  language?: string;
}

/** Lowers to exactly the file its data describes, for edge cases. */
export const rawKind: ElementKind = {
  id: 'test:raw',
  schema: '::test::Raw',
  folder: 'raw',
  lower(element) {
    const data = element.data as unknown as RawData;
    const file: OutputFile = {
      path: data.path,
      layer: data.layer,
      contents: data.text !== undefined ? new TextEncoder().encode(data.text) : (data.json ?? null),
    };
    if (data.schema !== undefined) file.schema = data.schema;
    if (data.language !== undefined) file.language = data.language;
    return [file];
  },
};

export function testRegistry(): ElementKindRegistry {
  const registry = new ElementKindRegistry();
  registry.register(modelKind);
  registry.register(langKind);
  registry.register(rawKind);
  return registry;
}

export function element(kind: string, id: ResourceLocation, data: Json): Element {
  return { formatVersion: 1, id, kind, data, meta: { createdAt: '2026-11-04T12:00:00.000Z' } };
}

export function raw(id: ResourceLocation, data: RawData): Element {
  return element('test:raw', id, data as unknown as Json);
}

export function project(
  elements: Element[],
  assets: { path: string; mediaType: string }[] = [],
  name = 'Ruby Pack',
): Project {
  return {
    formatVersion: 1,
    name,
    namespaces: [{ name: 'ruby', elements, assets }],
    targets: [],
    plugins: ['msm.resourcepack'],
    settings: {},
  };
}

/** Deterministic fake asset bytes: the namespace and path as UTF-8. */
export async function fakeAsset(namespace: string, path: string): Promise<Uint8Array> {
  return new TextEncoder().encode(`asset ${namespace}/${path}`);
}

export const meta = { msmVersion: '0.1.0', plugins: ['msm.resourcepack'] };
