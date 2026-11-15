/**
 * The 26.3 Java generator for the vanilla parity batch 1 (ADR 0094 D13, ADR 0095 D6, ADR 0096 D6;
 * B457): every runtime GameTest definition of the twenty block types (`plant2_*`, `furniture_*`
 * in `engine-mod/src/gametest/resources/msm/msm_test/block/`) generates; the generator's defaults
 * and Brigadier argument types match this target's facts; and the cases the runtime refuses fail
 * generation with a message naming them. The ejected Gradle build of a project with all of it is
 * the exporters' `vanilla-parity.test.ts` (`MSM_VANILLA_PARITY_JAVA_OUT`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { ARGUMENT_TYPES } from '../src/java-project/commands';
import type { GeneratorInput } from '../src/java-project/context';
import { generateJavaProject } from '../src/java-project/index';
import { PARITY_DEFAULTS, VANILLA_PARITY_TYPES } from '../src/java-project/vanilla-types';
import { target } from '../src/target';

const here = dirname(fileURLToPath(import.meta.url));
const gametestBlocks = join(
  here,
  '../../../../engine-mod/src/gametest/resources/msm/msm_test/block',
);

function definition(kind: string, path: string, json: JsonObject): DefinitionInput {
  return { id: `msm_test:${path}`, path: `msm/msm_test/${kind}/${path}.json`, definition: json };
}

function input(parts: Partial<GeneratorInput>): GeneratorInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks: [],
    items: [],
    entities: [],
    geckolib: false,
    ...parts,
  };
}

const sources = (files: { path: string; contents: string }[]): Map<string, string> =>
  new Map(files.map((file) => [file.path.replace('src/main/java/msm_test/', ''), file.contents]));

describe('the 26.3 generator and the ADR 0094 block types', () => {
  it('generates every runtime GameTest definition of the twenty types', async () => {
    const names = (await readdir(gametestBlocks))
      .filter((name) => /^(plant2|furniture)_.*\.json$/.test(name))
      .filter((name) => !name.startsWith('furniture_clash'))
      .sort();
    const blocks = await Promise.all(
      names.map(async (name) =>
        definition(
          'block',
          name.slice(0, -'.json'.length),
          JSON.parse(await readFile(join(gametestBlocks, name), 'utf8')) as JsonObject,
        ),
      ),
    );
    const types = new Set(blocks.map((block) => String(block.definition.type)));
    for (const type of VANILLA_PARITY_TYPES) expect(types.has(type), type).toBe(true);
    const files = sources(generateJavaProject(input({ blocks })).files);
    const modBlocks = files.get('ModBlocks.java') ?? '';
    expect(modBlocks).toContain('FURNITURE_TORCH_WALL');
    expect(modBlocks).toContain('FURNITURE_STEM_ATTACHED');
    expect(files.has('block/type/ModScaffoldingBlock.java')).toBe(true);
  });

  it('refuses a companion that clashes with a project block', async () => {
    const read = async (path: string) =>
      definition(
        'block',
        path,
        JSON.parse(await readFile(join(gametestBlocks, `${path}.json`), 'utf8')) as JsonObject,
      );
    const blocks = [await read('furniture_clash'), await read('furniture_clash_wall')];
    expect(() => generateJavaProject(input({ blocks }))).toThrow(/generated-block-clash/);
  });

  it("keeps this target's defaults and argument types", () => {
    const facts = target;
    expect(PARITY_DEFAULTS.stemSoil).toBe(facts.blocks?.stemTags?.soil);
    expect(PARITY_DEFAULTS.stemFruitSoil).toBe(facts.blocks?.stemTags?.fruitSoil);
    expect(PARITY_DEFAULTS.torchParticle).toBe(facts.blocks?.defaultTorchParticle);
    const argumentTypes = facts.commands?.argumentTypes ?? {};
    expect(Object.keys(ARGUMENT_TYPES).sort()).toEqual(Object.keys(argumentTypes).sort());
    for (const [name, info] of Object.entries(argumentTypes)) {
      expect(
        { parser: ARGUMENT_TYPES[name]?.parser, properties: ARGUMENT_TYPES[name]?.properties },
        name,
      ).toEqual({
        parser: info.parser,
        properties: info.properties,
      });
    }
  });

  it('fails where the runtime refuses', () => {
    const fails = (parts: Partial<GeneratorInput>, message: RegExp) =>
      expect(() => generateJavaProject(input(parts))).toThrow(message);
    fails(
      {
        blocks: [
          definition('block', 'wet_slab', {
            format: 1,
            type: 'slab',
            components: { 'msm:waterloggable': {} },
          }),
        ],
      },
      /msm:waterloggable is not allowed on type 'slab'/,
    );
    fails(
      {
        blocks: [
          definition('block', 'old_bed', {
            format: 1,
            type: 'bed',
            components: { 'msm:weathering': { stage: 'exposed' } },
          }),
        ],
      },
      /msm:weathering is not allowed on type 'bed'/,
    );
    fails(
      {
        items: [
          definition('item', 'both', {
            format: 1,
            components: { 'msm:item_inventory': {}, 'msm:bundle': {} },
          }),
        ],
      },
      /msm:item_inventory and msm:bundle/,
    );
    fails(
      {
        commands: [
          definition('command', 'odd', {
            format: 1,
            name: 'odd',
            arguments: [
              { name: 'a', type: 'word', optional: true },
              { name: 'b', type: 'word' },
            ],
          }),
        ],
      },
      /optional-not-last/,
    );
  });

  it('writes the weathering, waxing and bag classes', () => {
    const files = sources(
      generateJavaProject(
        input({
          blocks: [
            definition('block', 'tin', {
              format: 1,
              components: {
                'msm:weathering': { stage: 'unaffected', next: 'msm_test:old_tin' },
                'msm:waxable': { into: 'msm_test:waxed_tin' },
              },
            }),
            definition('block', 'old_tin', {
              format: 1,
              components: { 'msm:weathering': { stage: 'oxidized' } },
            }),
            definition('block', 'waxed_tin', { format: 1 }),
          ],
          items: [
            definition('item', 'bag', {
              format: 1,
              components: { 'msm:item_inventory': { layout: 'dispenser' } },
            }),
          ],
          creativeTabs: [definition('creative_tab', 'things', { format: 1, icon: 'msm_test:bag' })],
        }),
      ).files,
    );
    expect(files.get('block/TinBlock.java')).toContain('return 0.75f;');
    expect(files.get('block/OldTinBlock.java')).toContain('return Optional.empty();');
    expect(files.get('block/OldTinBlock.java')).not.toContain('protected void randomTick');
    const blocks = files.get('ModBlocks.java') ?? '';
    expect(blocks).toContain(
      'BlockWaxing.unwax(Identifier.fromNamespaceAndPath("msm_test", "waxed_tin"), Identifier.fromNamespaceAndPath("msm_test", "tin"));',
    );
    expect(blocks.indexOf('BlockWaxing.register();')).toBeGreaterThan(
      blocks.indexOf('BlockWaxing.scrape('),
    );
    expect(files.get('item/BagItem.java')).toContain('public boolean canFitInsideContainerItems()');
    expect(files.get('item/BagItem.class')).toBeUndefined();
    expect(files.get('item/BagItem.java')).toBeDefined();
    expect(files.get('ModCreativeTabs.java')).toContain('"itemGroup.msm_test.things"');
  });
});
