import type { Element, ElementKind, Json } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  assetPath,
  langKind,
  packMcmetaKind,
  ResourcePackLoweringError,
  resourcePackKinds,
  soundsKind,
} from '../src/index';
import { indexesFor, schemaErrors } from './support';

const KIND_IDS = [
  'minecraft:atlas',
  'minecraft:block_definition',
  'minecraft:equipment',
  'minecraft:font',
  'minecraft:item_definition',
  'minecraft:lang',
  'minecraft:model',
  'minecraft:pack_mcmeta',
  'minecraft:sounds',
];

const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];

const element = (kind: string, id: `${string}:${string}`, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const firstTarget = (builtInTargets[0] as TargetBundle).target;

describe('@msm/plugin-resourcepack', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.resourcepack');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes the nine vanilla resource pack kinds with unique ids and folders', () => {
    const ids = kinds().map((kind) => kind.id);
    expect([...ids].sort()).toEqual(KIND_IDS);
    expect(new Set(kinds().map((kind) => kind.folder)).size).toBe(KIND_IDS.length);
    expect(resourcePackKinds.map((kind) => kind.id)).toEqual(ids);
    for (const kind of kinds()) {
      expect(kind.id, kind.id).toMatch(/^minecraft:[a-z_]+$/);
      expect(kind.folder, kind.id).toMatch(/^[a-z_]+$/);
      expect(kind.schema, kind.id).toMatch(/^::java::/);
      expect(kind.defaultData, kind.id).toBeDefined();
    }
  });

  it('sets preview hints only on the kinds the host previews', () => {
    const hints = Object.fromEntries(kinds().map((kind) => [kind.id, kind.previewKind]));
    expect(hints).toEqual({
      'minecraft:model': 'model',
      'minecraft:block_definition': 'block_definition',
      'minecraft:item_definition': 'item_definition',
      'minecraft:lang': undefined,
      'minecraft:sounds': undefined,
      'minecraft:pack_mcmeta': undefined,
      'minecraft:equipment': undefined,
      'minecraft:atlas': undefined,
      'minecraft:font': undefined,
    });
  });

  it('hides the pack formats that lowering owns', () => {
    expect(packMcmetaKind.hiddenPaths).toEqual([
      '/pack/pack_format',
      '/pack/min_format',
      '/pack/max_format',
      '/pack/supported_formats',
    ]);
  });

  it('keeps defaults free of any user namespace', () => {
    const text = JSON.stringify(kinds().map((kind) => kind.defaultData));
    expect(text).not.toMatch(/"(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'target %s',
  (_id, bundle) => {
    it('resolves every kind schema', async () => {
      const { schemaIndex } = await indexesFor(bundle);
      for (const kind of kinds()) {
        expect(() => schemaIndex.resolveSchemaRef(kind.schema), kind.id).not.toThrow();
      }
    });

    it('has defaults that validate with no errors', async () => {
      const indexes = await indexesFor(bundle);
      for (const kind of kinds()) {
        expect(schemaErrors(indexes, kind.schema, kind.defaultData ?? {}), kind.id).toEqual([]);
      }
    });

    it('reports errors for invalid data, so the checks above are not vacuous', async () => {
      const indexes = await indexesFor(bundle);
      expect(schemaErrors(indexes, langKind.schema, { key: 1 })).not.toEqual([]);
      expect(
        schemaErrors(indexes, packMcmetaKind.schema, {
          pack: { description: 'x', pack_format: 'a' },
        }),
      ).not.toEqual([]);
    });

    it('lowers the default pack metadata to valid JSON for both packs', async () => {
      const indexes = await indexesFor(bundle);
      const files = await packMcmetaKind.lower(
        element(packMcmetaKind.id, 'example:pack', packMcmetaKind.defaultData ?? {}),
        bundle.target,
      );
      expect(files.map((file) => file.layer)).toEqual(['resourcepack', 'datapack']);
      for (const file of files) {
        expect(file.schema).toBe(packMcmetaKind.schema);
        expect(schemaErrors(indexes, packMcmetaKind.schema, file.contents as Json)).toEqual([]);
      }
    });
  },
);

describe('lowering', () => {
  it('builds asset paths from the target folders', () => {
    const folders = firstTarget.folders.resource;
    expect(assetPath(firstTarget, 'model', 'example', 'block/ruby')).toBe(
      `assets/example/${folders.model}/block/ruby.json`,
    );
    expect(assetPath(firstTarget, 'sounds_file', 'example', 'ignored')).toBe(
      `assets/example/${folders.sounds_file}`,
    );
  });

  it('produces one resource pack file and does not share data with the element', async () => {
    const data = { 'block.example.ruby': 'Ruby' };
    const input = element(langKind.id, 'example:en_us', data);
    const files = await langKind.lower(input, firstTarget);
    expect(files).toHaveLength(1);
    expect(files[0]?.layer).toBe('resourcepack');
    expect(files[0]?.contents).toEqual(data);
    expect(files[0]?.contents).not.toBe(data);
    expect(files[0]?.merge).toBe('object');
  });

  it('is deterministic', () => {
    for (const kind of kinds()) {
      const id = kind.id === soundsKind.id ? 'example:sounds' : 'example:thing';
      const input = element(kind.id, id, kind.defaultData ?? {});
      expect(kind.lower(input, firstTarget), kind.id).toEqual(kind.lower(input, firstTarget));
    }
  });

  it('rejects a sounds element whose path is not "sounds"', () => {
    const input = element(soundsKind.id, 'example:other', {});
    expect(() => soundsKind.lower(input, firstTarget)).toThrow(ResourcePackLoweringError);
  });

  it.each(['example:', 'Example:thing', 'example:../escape', 'example:a//b', 'example:/abs'])(
    'rejects the unsafe id %s',
    (id) => {
      const input = element(langKind.id, id as `${string}:${string}`, {});
      expect(() => langKind.lower(input, firstTarget)).toThrow(ResourcePackLoweringError);
    },
  );

  it('overwrites pack formats from the target without mutating the element', async () => {
    const data = { pack: { description: 'x', pack_format: 1, supported_formats: [1, 2] } };
    const input = element(packMcmetaKind.id, 'example:pack', data);
    const [file] = await packMcmetaKind.lower(input, firstTarget);
    const { major, minor } = firstTarget.packFormats.resource;
    expect(file?.path).toBe('pack.mcmeta');
    expect(file?.contents).toEqual({
      pack: {
        description: 'x',
        pack_format: major,
        min_format: [major, minor],
        max_format: [major, minor],
      },
    });
    expect(data.pack.pack_format).toBe(1);
    expect(data.pack.supported_formats).toEqual([1, 2]);
  });

  it('lowers pack metadata once per pack, each with its own formats', async () => {
    const data = { pack: { description: 'Both packs' } };
    const files = await packMcmetaKind.lower(
      element(packMcmetaKind.id, 'example:pack', data),
      firstTarget,
    );
    const format = (major: number, minor: number) => ({
      pack: {
        description: 'Both packs',
        pack_format: major,
        min_format: [major, minor],
        max_format: [major, minor],
      },
    });
    const { resource, data: dataFormat } = firstTarget.packFormats;
    expect(files).toEqual([
      {
        path: 'pack.mcmeta',
        contents: format(resource.major, resource.minor),
        layer: 'resourcepack',
        schema: packMcmetaKind.schema,
      },
      {
        path: 'pack.mcmeta',
        contents: format(dataFormat.major, dataFormat.minor),
        layer: 'datapack',
        schema: packMcmetaKind.schema,
      },
    ]);
    expect(files[0]?.contents).not.toBe(files[1]?.contents);
  });

  it('adds a pack object when the data has none and rejects non-object data', async () => {
    const [file] = await packMcmetaKind.lower(
      element(packMcmetaKind.id, 'example:pack', {}),
      firstTarget,
    );
    expect(file?.contents).toMatchObject({ pack: { description: '' } });
    expect(() =>
      packMcmetaKind.lower(element(packMcmetaKind.id, 'example:pack', []), firstTarget),
    ).toThrow(ResourcePackLoweringError);
    expect(() =>
      packMcmetaKind.lower(element(packMcmetaKind.id, 'example:pack', { pack: 1 }), firstTarget),
    ).toThrow(ResourcePackLoweringError);
  });
});
