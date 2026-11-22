/**
 * The 26.3 Java generator for batch 2 of vanilla parity 2 and of vanilla parity 3 (ADR 0112 D3;
 * B537):
 *
 * - every runtime GameTest definition of fluids, villager professions, villager types, game rules,
 *   statistics, rules for vanilla blocks, commands and creative tabs
 *   (`engine-mod/src/gametest/resources/msm/msm_test/<kind>/`) generates, except the ones the
 *   runtime refuses (`REFUSED`), which fail with a message naming them;
 * - the 44 argument types, the hand-ordered tab and `open_dialog` write what the runtime does;
 * - the shared classes copied from the runtime keep its code: after the renames below, at least
 *   `MIN_SHARED` of each class's code lines are lines of the runtime source (the rest are the
 *   record-for-parser swaps, `null` for `Optional`, and the logger).
 *
 * The ejected Gradle build of a project with all of it is the exporters'
 * `vanilla-parity-3-batch-2.test.ts` (`MSM_VANILLA_PARITY_3_BATCH_2_JAVA_OUT`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, JavaProjectInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { ARGUMENT_TYPES } from '../../src/java-project/commands';
import { generateJavaProject } from '../../src/java-project/index';

const here = dirname(fileURLToPath(import.meta.url));
const engine = join(here, '../../../../../engine-mod');
const gametest = join(engine, 'src/gametest/resources/msm/msm_test');
const runtime = join(engine, 'src/main/java/dev/mcsupermods/runtime');

/** Gametest folder to `JavaProjectInput` list. */
const LISTS = {
  fluid: 'fluids',
  villager_profession: 'villagerProfessions',
  villager_type: 'villagerTypes',
  game_rule: 'gameRules',
  stat: 'stats',
  vanilla_block_rules: 'vanillaBlockRules',
  command: 'commands',
  creative_tab: 'creativeTabs',
} as const;

/** GameTest definitions the runtime refuses, and what generation says. */
const REFUSED: Readonly<Record<string, RegExp>> = {
  'game_rule/b533_broken.json': /min and max are not fields of a boolean game rule/,
  'command/cmd_broken.json': /is not lower case/,
};

async function definitions(folder: string): Promise<[string, DefinitionInput][]> {
  const names = (await readdir(join(gametest, folder))).filter((n) => n.endsWith('.json')).sort();
  return Promise.all(
    names.map(
      async (name): Promise<[string, DefinitionInput]> => [
        `${folder}/${name}`,
        {
          id: `msm_test:${name.slice(0, -'.json'.length)}`,
          path: `msm/msm_test/${folder}/${name}`,
          definition: JSON.parse(
            await readFile(join(gametest, folder, name), 'utf8'),
          ) as JsonObject,
        },
      ],
    ),
  );
}

function input(lists: Partial<JavaProjectInput> = {}): JavaProjectInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks: [],
    items: [],
    entities: [],
    geckolib: false,
    ...lists,
  };
}

async function allAccepted(): Promise<Partial<JavaProjectInput>> {
  const out: Record<string, DefinitionInput[]> = {};
  for (const [folder, key] of Object.entries(LISTS)) {
    out[key] = (await definitions(folder))
      .filter(([name]) => REFUSED[name] === undefined)
      .map(([, def]) => def);
  }
  return out as Partial<JavaProjectInput>;
}

const sources = (lists: Partial<JavaProjectInput>): Map<string, string> =>
  new Map(
    generateJavaProject(input(lists)).files.map((file) => [
      file.path.replace('src/main/java/msm_test/', ''),
      file.contents,
    ]),
  );

/** Code lines: no comments, package, imports, annotations or blank lines; trimmed. */
function code(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(\*|\/\*\*|\/\/|package |import |@)/.test(line));
}

/** The ejected names of the runtime's classes and members. */
const RENAMES: readonly [RegExp, string][] = [
  [/MsmFluids\.Entry/g, 'FluidRegistry.Entry'],
  [/MsmFluids\.Fluids/g, 'FluidRegistry.Fluids'],
  [/MsmFluids/g, 'FluidRegistry'],
  [/MsmLiquidBlock/g, 'ModLiquidBlock'],
  [/MsmFlowingFluid/g, 'ModFlowingFluid'],
  [/MsmFluid\b/g, 'ModFluid'],
  [/MsmCauldronBlock/g, 'ModCauldronBlock'],
  [/MsmBottleItem/g, 'ModBottleItem'],
  [/MsmCauldrons/g, 'FluidCauldrons'],
  [/useOnProjectCauldron/g, 'useOnCauldron'],
  [/FluidDefinition/g, 'FluidSpec'],
  [/\bdefinition\(\)/g, 'spec()'],
  [/\bdefinition\b/g, 'spec'],
  [/VillagerTypes/g, 'ModVillagerTypes'],
];

function renamed(source: string): Set<string> {
  let out = source;
  for (const [from, to] of RENAMES) out = out.replace(from, to);
  return new Set(code(out));
}

/** The share of `ejected`'s code lines found in `runtimeSources`. */
function shared(ejected: string, runtimeSources: readonly string[]): number {
  const known = new Set(runtimeSources.flatMap((source) => [...renamed(source)]));
  const lines = code(ejected);
  return lines.filter((line) => known.has(line)).length / lines.length;
}

const MIN_SHARED = 0.75;

describe('the 26.3 generator, batch 2 (B537)', () => {
  it('generates every accepted runtime GameTest definition, alone and together', async () => {
    for (const [folder, key] of Object.entries(LISTS)) {
      for (const [name, def] of await definitions(folder)) {
        const run = () => generateJavaProject(input({ [key]: [def] }));
        const refused = REFUSED[name];
        if (refused === undefined) expect(run, name).not.toThrow();
        else expect(run, name).toThrow(refused);
      }
    }
    const files = sources(await allAccepted());
    for (const path of [
      'ModFluids.java',
      'ModProfessions.java',
      'ModVillagerTypes.java',
      'ModGameRules.java',
      'ModStats.java',
      'ModVanillaBlockRules.java',
      'ModCommands.java',
      'ModCreativeTabs.java',
      'fluid/FluidRegistry.java',
      'fluid/FluidMixing.java',
      'fluid/FluidCauldrons.java',
      'client/fluid/FluidRenderers.java',
      'client/MsmTestModClient.java',
      'BlockStripping.java',
      'BlockWaxing.java',
      'CooldownMap.java',
      'TickLimiter.java',
    ]) {
      expect(files.has(path), path).toBe(true);
    }
    const mod = files.get('MsmTestMod.java') ?? '';
    const order = [
      'ModFluids.register();',
      'ModProfessions.register();',
      'ModCommands.register();',
      'ModVillagerTypes.register();',
      'FluidCauldrons.register();',
      'ModGameRules.register();',
      'ModStats.register();',
      'FluidMixing.register();',
      'ModVanillaBlockRules.register();',
    ].map((line) => mod.indexOf(line));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(files.get('client/MsmTestModClient.java')).toContain('FluidRenderers.init();');
  });

  it('writes the 44 argument types, the hand order and open_dialog as the runtime does', async () => {
    const lists = await allAccepted();
    // One command with every argument type (the rest-of-line message last; text the same parser).
    const every = Object.keys(ARGUMENT_TYPES)
      .filter((type) => type !== 'text' && type !== 'message')
      .map((type) => ({ name: type, type }));
    lists.commands = [
      ...(lists.commands ?? []),
      {
        id: 'msm_test:every',
        path: 'msm/msm_test/command/every.json',
        definition: {
          format: 1,
          name: 'msm_every',
          function: 'msm_test:every',
          arguments: [...every, { name: 'message', type: 'message', optional: true }],
        },
      },
    ];
    const files = sources(lists);
    const commands = files.get('ModCommands.java') ?? '';
    for (const text of [
      'ResourceKeyArgument.key(Registries.STRUCTURE)',
      'ResourceOrTagKeyArgument.getResourceOrTagKey(context, "structure_or_tag", Registries.STRUCTURE, NO_STRUCTURE).asPrintable()',
      'args.putString("rotation", rotation(RotationArgument.getRotation(context, "rotation").getRotation(context.getSource())));',
      'ResourceOrIdArgument.dialog(buildContext)',
      'if (present > 42) {',
      'MessageArgument.message()',
      'TimeArgument.time()',
      'typed(context, ',
    ]) {
      expect(commands, text).toContain(text);
    }
    const tabs = files.get('ModCreativeTabs.java') ?? '';
    expect(tabs).toContain('handOrder(members, ');
    expect(tabs).toContain('CreativeModeTab.TabVisibility.SEARCH_TAB_ONLY');
    const dialog = sources({
      commands: [
        {
          id: 'demo:hello',
          path: 'msm/demo/command/hello.json',
          definition: {
            format: 1,
            name: 'hello',
            event: 'demo:greet',
            events: {
              'demo:greet': {
                actions: [{ type: 'open_dialog', dialog: 'demo:welcome' }],
              },
            },
          },
        },
      ],
    });
    expect(dialog.get('ModCommands.java')).toContain(
      'Actions.openDialog(OWNER, player != null ? player : entity, "demo:welcome");',
    );
    expect(dialog.get('Actions.java')).toContain('player.openDialog(dialog.get());');
  });

  it('keeps the code of the shared classes the runtime has', async () => {
    const files = sources(await allAccepted());
    const read = (path: string) => readFile(join(runtime, path), 'utf8');
    const seam = join(engine, 'src/mc/26.3/java/dev/mcsupermods/runtime/registry/fluid');
    const fluid = 'registry/fluid';
    const pairs: [string, string[]][] = [
      ['fluid/ModFluid.java', [await readFile(join(seam, 'MsmFluid.java'), 'utf8')]],
      ['fluid/ModFlowingFluid.java', [await readFile(join(seam, 'MsmFlowingFluid.java'), 'utf8')]],
      ['fluid/FluidRegistry.java', [await read(`${fluid}/MsmFluids.java`)]],
      ['fluid/ModLiquidBlock.java', [await read(`${fluid}/MsmLiquidBlock.java`)]],
      ['fluid/FluidMixing.java', [await read(`${fluid}/FluidMixing.java`)]],
      ['fluid/ModCauldronBlock.java', [await read(`${fluid}/MsmCauldronBlock.java`)]],
      ['fluid/FluidCauldrons.java', [await read(`${fluid}/MsmCauldrons.java`)]],
      ['client/fluid/FluidRenderers.java', [await read('client/fluid/FluidClient.java')]],
      ['ModVillagerTypes.java', [await read('registry/mob/VillagerTypes.java')]],
    ];
    for (const [path, runtimeSources] of pairs) {
      const share = shared(files.get(path) ?? '', runtimeSources);
      expect(
        share,
        `${path}: ${share.toFixed(2)} of its code lines are the runtime's`,
      ).toBeGreaterThanOrEqual(MIN_SHARED);
    }
  });
});
