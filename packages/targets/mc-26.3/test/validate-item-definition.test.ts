import { readFile } from 'node:fs/promises';
import type { Json } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type SchemaProblem,
  validateJson,
} from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8')) as unknown;
}

const symbols = parseVanillaMcdocSymbols(await readJson(vendored.vanillaMcdocSymbols));
const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
const registries = createRegistryIndex({
  vanilla: (await readJson(vendored.mcmetaRegistries)) as Record<string, string[]>,
});
const itemDefinition = index.dispatch('minecraft:resource', 'item_definition');
const select = (component: string, when: Json): Json => ({
  model: {
    type: 'minecraft:select',
    property: 'minecraft:component',
    component,
    cases: [{ when, model: { type: 'minecraft:model', model: 'minecraft:item/music_disc_13' } }],
    fallback: { type: 'minecraft:model', model: 'minecraft:item/music_disc_13' },
  },
});
const problems = (value: Json): [string, string][] => {
  if (itemDefinition === undefined) throw new Error('no item_definition resource schema');
  return validateJson(value, itemDefinition, { registries }).map((problem: SchemaProblem) => [
    problem.path,
    problem.code,
  ]);
};

describe('26.3 item definition validation (real export)', () => {
  it('accepts select on minecraft:component with a data component case', () => {
    expect(problems(select('minecraft:jukebox_playable', 'minecraft:13'))).toEqual([]);
    expect(problems(select('jukebox_playable', ['minecraft:13', 'minecraft:cat']))).toEqual([]);
  });

  it('checks each case against the selected component', () => {
    expect(problems(select('minecraft:jukebox_playable', 5))).toEqual([
      ['/model/cases/0/when', 'schema.no-union-match'],
    ]);
    expect(problems(select('minecraft:jukebox_playable', 'minecraft:no_such_song'))).toEqual([
      ['/model/cases/0/when', 'schema.unknown-id'],
    ]);
  });
});
