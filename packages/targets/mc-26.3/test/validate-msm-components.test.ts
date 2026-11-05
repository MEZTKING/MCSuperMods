import { readdir, readFile } from 'node:fs/promises';
import type { Json } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  type SchemaProblem,
  validateJson,
} from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

/**
 * `msm:components` (ADR 0044 D1) dispatches each entry to the vendored
 * `minecraft:data_component` schema, so the target's own component schemas apply.
 */
async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

const symbols = parseVanillaMcdocSymbols(await readJson(vendored.vanillaMcdocSymbols));
const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
const registries = createRegistryIndex({
  vanilla: (await readJson(vendored.mcmetaRegistries)) as Record<string, string[]>,
});
const item = (components: Json): Json => ({
  format: 1,
  components: { 'msm:components': components },
});
const problems = (value: Json): [string, string][] =>
  validateJson(value, index.resolveSchemaRef(MSM_SCHEMA_REFS.itemDefinition), { registries }).map(
    (problem: SchemaProblem) => [problem.path, problem.code],
  );

describe(`${target.id} msm:components passthrough (real export)`, () => {
  it('accepts vanilla components in their vanilla form, prefixed or not', () => {
    expect(
      problems(
        item({
          'minecraft:glider': {},
          use_cooldown: { seconds: 2 },
          'minecraft:jukebox_playable': 'minecraft:13',
          'minecraft:provides_trim_material': 'minecraft:quartz',
        }),
      ),
    ).toEqual([]);
  });

  it('checks each entry against its own component schema', () => {
    const found = problems(item({ 'minecraft:use_cooldown': { seconds: 'two' } }));
    expect(found.map(([path]) => path)).toContain(
      '/components/msm:components/minecraft:use_cooldown/seconds',
    );
    expect(found.every(([, code]) => code.startsWith('schema.'))).toBe(true);
  });

  it('reports an unknown component id', () => {
    const found = problems(item({ 'minecraft:no_such_component': {} }));
    expect(found.length).toBeGreaterThan(0);
  });
});

describe(`${target.id} MSM conformance corpus against the real export`, () => {
  const corpus = new URL(
    '../../../schemas/mcdoc/msm/conformance/definition/valid/',
    import.meta.url,
  );

  it('reports no error for any valid item definition, passthrough entries included', async () => {
    const names = (await readdir(corpus)).filter((name) => /^item-.*\.json$/.test(name)).sort();
    expect(names).toContain('item-components-passthrough.json');
    const schema = index.resolveSchemaRef(MSM_SCHEMA_REFS.itemDefinition);
    for (const name of names) {
      const value = (await readJson(new URL(name, corpus))) as Json;
      const errors = validateJson(value, schema, { registries })
        .filter((problem) => problem.severity === 'error')
        .map((problem) => `${name} ${problem.path} ${problem.code}`);
      expect(errors).toEqual([]);
    }
  });
});
