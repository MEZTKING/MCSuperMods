/**
 * `msm:world_setup` lowering, validators and templates (B551; ADR 0113 D2, D9; ADR 0114 D1 to
 * D3). On every built-in target: each case's files equal the golden in
 * `test/fixtures/<target>/world-setup/<case>.json` (`UPDATE_GOLDENS=1` rewrites them), every JSON
 * file validates against its schema with no error and no unknown id, every function line passes
 * the offline checker of `@msm/schemas/mcfunction` with no error, and the command forms come
 * from `target.commands.forms`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Element,
  Json,
  OutputFile,
  Problem,
  ResourceLocation,
  Target,
  ValidationRegistry,
} from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import {
  createMcfunctionService,
  defaultFunctionUri,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import plugin, {
  lowerWorldSetup,
  worldSetupGeneratedIds,
  worldSetupKind,
  worldSetupLoadFunction,
  worldSetupTemplates,
  worldSetupValidators,
} from '../src/index';
import { WORLD_SETUP_CASES as CASES } from './world-setup-samples';

const update = process.env.UPDATE_GOLDENS === '1';
const here = dirname(fileURLToPath(import.meta.url));
const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const element = (id: string, kind: string, data: Json): Element => ({
  formatVersion: 1,
  id: id as ResourceLocation,
  kind,
  data,
  meta: { createdAt: '2026-11-23T00:00:00.000Z' },
});

/** The start island every case with a start uses: 5 by 3 by 5. */
const ISLAND = element('sky:island', 'minecraft:structure_template', {
  size: [5, 3, 5],
  palette: ['minecraft:grass_block'],
  blocks: [[0, 0, 0, 0]],
});

const setup = (name: string, data: Json = CASES[name] as Json): Element =>
  element(`sky:${name}`, 'msm:world_setup', data);

/** Ids every case's files may name, as the project's registry would hold them. */
function projectIds(files: readonly OutputFile[], target: Target): Record<string, string[]> {
  const ids: Record<string, string[]> = {
    structure: ['sky:island'],
    advancement: ['sky:goals/root'],
    'worldgen/world_preset': ['sky:my_preset'],
  };
  const add = (registry: string, id: string): void => {
    const list = ids[registry] ?? [];
    list.push(id);
    ids[registry] = list;
  };
  const folders = target.folders.data;
  for (const file of files) {
    const match = /^data\/([^/]+)\/(.+)\.(json|mcfunction)$/.exec(file.path);
    if (match === null) continue;
    const [, namespace, rest] = match as unknown as [string, string, string];
    for (const [registry, folder] of [
      ['function', folders.function],
      ['advancement', folders.advancement],
      ['worldgen/biome', `${folders.worldgen}/biome`],
      ['worldgen/world_preset', `${folders.worldgen}/world_preset`],
      ['worldgen/structure', `${folders.worldgen}/structure`],
      ['worldgen/template_pool', `${folders.worldgen}/template_pool`],
      ['worldgen/structure_set', `${folders.worldgen}/structure_set`],
    ] as const) {
      if (rest.startsWith(`${folder}/`))
        add(registry, `${namespace}:${rest.slice(folder.length + 1)}`);
    }
  }
  return ids;
}

/** A file as the golden stores it: JSON as it is, functions as their lines. */
function goldenOf(files: readonly OutputFile[]): Json {
  return files.map((file) => ({
    path: file.path,
    layer: file.layer,
    ...(file.schema === undefined ? {} : { schema: file.schema }),
    ...(file.merge === undefined ? {} : { merge: file.merge }),
    ...(file.language === undefined ? {} : { language: file.language }),
    contents:
      file.contents instanceof Uint8Array
        ? new TextDecoder().decode(file.contents).split('\n')
        : file.contents,
  }));
}

interface Context {
  bundle: TargetBundle;
  schemaIndex: SchemaIndex;
  vanilla: Record<string, string[]>;
  mcfunction: McfunctionService;
}

async function contextFor(bundle: TargetBundle): Promise<Context> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, registries, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const vanilla = registries as Record<string, string[]>;
  return {
    bundle,
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    vanilla,
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries: vanilla },
      { mcVersion: bundle.target.mcVersion, mcdocSymbols: symbols },
    ),
  };
}

/** Schema problems (errors and unknown ids) of every JSON file. */
function schemaProblems(
  files: readonly OutputFile[],
  context: Context,
  registries: RegistryIndex,
): string[] {
  const out: string[] = [];
  for (const file of files) {
    if (file.schema === undefined) continue;
    const node = context.schemaIndex.resolveSchemaRef(file.schema);
    for (const problem of validateJson(file.contents as Json, node, { registries })) {
      if (problem.severity === 'error' || problem.code === 'schema.unknown-id') {
        out.push(`${file.path} ${problem.path} ${problem.code}: ${problem.message}`);
      }
    }
  }
  return out;
}

/** Function checker problems (errors and warnings) of every function file. */
async function functionProblems(
  files: readonly OutputFile[],
  context: Context,
  ids: Record<string, string[]>,
): Promise<string[]> {
  const out: string[] = [];
  const folder = context.bundle.target.folders.data.function;
  for (const file of files) {
    if (file.language !== 'mcfunction') continue;
    const source = new TextDecoder().decode(file.contents as Uint8Array).replace(/\n$/, '');
    const found = await context.mcfunction.check(source, {
      uri: defaultFunctionUri('sky', 'check', folder),
      projectIds: {
        ...ids,
        'tag/function': ['minecraft:load', 'minecraft:tick'],
        dialog: ['minecraft:server_links'],
      },
    });
    for (const problem of found) {
      if (problem.severity !== 'info') {
        out.push(`${file.path}:${problem.line + 1} ${problem.severity} ${problem.message}`);
      }
    }
  }
  return out;
}

/** The registry a validator sees: vanilla plus the project's own. */
function validationRegistry(registries: RegistryIndex): ValidationRegistry {
  return { has: (registry, id) => registries.has(registry, id), ids: (r) => registries.ids(r) };
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'world setup on %s',
  (targetId, bundle) => {
    let context: Context;
    beforeAll(async () => {
      context = await contextFor(bundle);
    });

    it.each(Object.keys(CASES))(
      '%s equals its golden, validates and passes the checker',
      async (name) => {
        const files = await worldSetupKind.lower(setup(name), bundle.target);
        expect(files).toEqual(lowerWorldSetup(setup(name), bundle.target));
        const golden = join(here, 'fixtures', targetId, 'world-setup', `${name}.json`);
        const actual = `${JSON.stringify(goldenOf(files), null, 2)}\n`;
        if (update) {
          await mkdir(dirname(golden), { recursive: true });
          await writeFile(golden, actual);
        }
        expect(actual).toBe(await readFile(golden, 'utf8'));
        const ids = projectIds(files, bundle.target);
        const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
        expect(schemaProblems(files, context, registries)).toEqual([]);
        expect(await functionProblems(files, context, ids)).toEqual([]);
      },
    );

    it.each(Object.keys(CASES))('%s names every id its files define', async (name) => {
      const files = await worldSetupKind.lower(setup(name), bundle.target);
      const fromFiles = projectIds(files, bundle.target);
      for (const fixed of ['structure', 'advancement', 'worldgen/world_preset']) {
        const list = (fromFiles[fixed] ?? []).filter(
          (id) => !['sky:island', 'sky:goals/root', 'sky:my_preset'].includes(id),
        );
        if (list.length === 0) delete fromFiles[fixed];
        else fromFiles[fixed] = list;
      }
      delete fromFiles.structure;
      const sorted = (ids: Record<string, string[]>) =>
        Object.fromEntries(
          Object.entries(ids)
            .map(([key, list]) => [key, [...list].sort()] as const)
            .sort(([a], [b]) => (a < b ? -1 : 1)),
        );
      expect(sorted(worldSetupGeneratedIds(setup(name)))).toEqual(sorted(fromFiles));
    });

    it('writes the world type, its name, the load tag and the first-join advancement', async () => {
      const files = await worldSetupKind.lower(setup('skyblock'), bundle.target);
      const folders = bundle.target.folders;
      const paths = files.map((file) => file.path);
      expect(paths).toContain(`data/sky/${folders.data.worldgen}/world_preset/skyblock.json`);
      expect(paths).toContain(`data/sky/${folders.data.worldgen}/biome/msm_games/sky.json`);
      expect(paths).toContain(
        `data/minecraft/${folders.data.tags}/worldgen/world_preset/normal.json`,
      );
      expect(paths).toContain(`data/minecraft/${folders.data.tags}/function/load.json`);
      expect(paths).toContain(`data/sky/${folders.data.advancement}/msm_games/first_join.json`);
      const lang = files.find(
        (file) => file.path === `assets/sky/${folders.resource.lang}/en_us.json`,
      );
      expect(lang?.contents).toEqual({ 'generator.sky.skyblock': 'Skyblock' });
      expect(lang?.merge).toBe('object');
      const tag = (path: string) => files.find((file) => file.path === path);
      const minecraftLoad = tag(`data/minecraft/${folders.data.tags}/function/load.json`);
      expect(minecraftLoad?.contents).toEqual({ values: ['#sky:msm_games/load'] });
      expect(minecraftLoad?.merge).toBe('tag');
      const pluginLoad = tag(`data/sky/${folders.data.tags}/function/msm_games/load.json`);
      expect(pluginLoad?.contents).toEqual({ values: [worldSetupLoadFunction('sky:skyblock')] });
      expect(pluginLoad?.merge).toBe('tag');
      const advancement = files.find((file) => file.path.endsWith('msm_games/first_join.json'));
      expect(advancement?.contents).toEqual({
        criteria: { first_join: { trigger: bundle.target.worlds?.firstJoinCriterion } },
        rewards: { function: 'sky:msm_games/world_setup/first_join' },
      });
    });

    it('takes every command form from the target', async () => {
      const forms = bundle.target.commands?.forms;
      if (forms === undefined) throw new Error('no forms');
      const target: Target = {
        ...bundle.target,
        commands: {
          ...(bundle.target.commands as NonNullable<Target['commands']>),
          forms: {
            ...forms,
            place_template: 'place template <template> <x> <y> <z> none',
            forceload_add: 'forceload add <x1> <z1> <x2> <z2> X',
            loot_give: 'loot give <players> loot <loot_table> Y',
          },
        },
      };
      const text = (files: OutputFile[]) =>
        files
          .filter((file) => file.language === 'mcfunction')
          .map((file) => new TextDecoder().decode(file.contents as Uint8Array))
          .join('');
      const skyblock = text(lowerWorldSetup(setup('skyblock'), target));
      expect(skyblock).toContain('place template sky:island 0 64 0 none\n');
      expect(skyblock).toContain('forceload add 0 0 47 47 X\n');
      expect(text(lowerWorldSetup(setup('flat'), target))).toContain(
        'loot give @s loot minecraft:chests/simple_dungeon Y\n',
      );
      const { forms: _dropped, ...withoutForms } = target.commands as NonNullable<
        Target['commands']
      >;
      expect(() =>
        lowerWorldSetup(setup('skyblock'), { ...target, commands: withoutForms }),
      ).toThrow(/no command form/);
      const { worlds: _worlds, ...withoutWorlds } = target;
      expect(() => lowerWorldSetup(setup('skyblock'), withoutWorlds)).toThrow(/no world facts/);
    });

    it('sets the spawn radius unless a game rule names it, and leaves project rules out', async () => {
      const lines = (data: Json) =>
        new TextDecoder()
          .decode(
            lowerWorldSetup(setup('x', data), bundle.target).find((file) =>
              file.path.endsWith('world_setup/world_start.mcfunction'),
            )?.contents as Uint8Array,
          )
          .split('\n');
      const base = CASES.vanilla as Record<string, Json>;
      expect(lines({ ...base, spawn_radius: 6 })).toContain('gamerule respawn_radius 6');
      const named = lines({ ...base, spawn_radius: 6, game_rules: { respawn_radius: 2 } });
      expect(named.filter((line) => line.includes('respawn_radius'))).toEqual([
        'gamerule respawn_radius 2',
      ]);
      expect(lines({ ...base, game_rules: { 'sky:my_rule': true } }).join('\n')).not.toContain(
        'sky:my_rule',
      );
    });

    it('checks the project with the validators', () => {
      const registries = createRegistryIndex({
        vanilla: context.vanilla,
        project: {
          structure: ['sky:island', 'sky:big'],
          advancement: ['sky:goals/root'],
          game_rule: ['sky:my_rule'],
        },
      });
      const run = (elements: Element[]): Problem[] =>
        worldSetupValidators.flatMap(
          (validator) =>
            validator.validate({
              elements,
              target: bundle.target,
              registry: validationRegistry(registries),
            }) as Problem[],
        );
      const codes = (elements: Element[]) =>
        run(elements).map((problem) => [problem.severity, problem.code, problem.path ?? '']);
      const skyblock = CASES.skyblock as Record<string, Json>;
      expect(codes([ISLAND, setup('skyblock')])).toEqual([
        ['warning', 'games.world-setup.void-end', '/world/end'],
      ]);
      const big = element('sky:big', 'minecraft:structure_template', {
        size: [64, 4, 64],
        palette: ['minecraft:stone'],
        blocks: [],
      });
      const rule = element('sky:my_rule', 'msm:game_rule', { kind: 'boolean', default: false });
      expect(
        codes([
          ISLAND,
          big,
          rule,
          setup('a', {
            ...skyblock,
            world: { type: 'void', nether: 'void', end: 'vanilla' },
            start: { structure: 'sky:big', spawn: [70, 0, 0] },
            game_rules: { no_such_rule: true, 'sky:my_rule': true, 'other:rule': 1 },
            new_player: { items: [{ item: 'minecraft:bread', count: 1 }], loot_table: 'x:y' },
          }),
          setup('b', { ...skyblock, start: { structure: 'sky:missing', spawn: [0, 0, 0] } }),
          element('sky:msm_games/mine', 'minecraft:function', { lines: [] }),
        ]),
      ).toEqual([
        ['error', 'games.world-setup.one-per-project', ''],
        ['info', 'games.world-setup.void-nether', '/world/nether'],
        ['error', 'games.world-setup.spawn-outside', '/start/spawn'],
        ['error', 'games.world-setup.start-too-large', '/start/structure'],
        ['error', 'games.world-setup.unknown-game-rule', '/game_rules/no_such_rule'],
        ['warning', 'games.world-setup.project-game-rule', '/game_rules/sky:my_rule'],
        ['error', 'games.world-setup.unknown-game-rule', '/game_rules/other:rule'],
        ['error', 'games.world-setup.kit-both', '/new_player/loot_table'],
        ['warning', 'games.world-setup.void-end', '/world/end'],
        ['error', 'games.world-setup.start-missing', '/start/structure'],
        ['error', 'games.generated-path', ''],
      ]);
      expect(
        codes([
          ISLAND,
          setup('islands_worldgen'),
          setup('c', {
            ...(CASES.flat as Record<string, Json>),
            world: { type: 'flat', nether: 'vanilla', end: 'vanilla' },
          }),
        ]),
      ).toEqual([
        ['error', 'games.world-setup.one-per-project', ''],
        ['warning', 'games.world-setup.start-turned', '/start/when'],
        ['warning', 'games.world-setup.flat-without-layers', '/world/layers'],
      ]);
      expect(
        codes([
          setup('d', {
            ...(CASES.preset as Record<string, Json>),
            world: { type: 'preset', nether: 'void', end: 'vanilla' },
          }),
        ]),
      ).toEqual([
        ['error', 'games.world-setup.preset-missing', '/world/preset'],
        ['warning', 'games.world-setup.preset-dimensions', '/world/nether'],
      ]);
      expect(
        codes([
          setup('e', {
            ...(CASES.vanilla as Record<string, Json>),
            world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
          }),
        ]),
      ).toEqual([['warning', 'games.world-setup.no-start', '/world/type']]);
      const noOrigin = worldSetupValidators[0]?.validate({
        elements: [ISLAND, setup('islands_worldgen')],
        target: {
          ...bundle.target,
          worlds: {
            ...(bundle.target.worlds as NonNullable<Target['worlds']>),
            structurePlacements: [],
          },
        },
        registry: validationRegistry(registries),
      }) as Problem[];
      expect(noOrigin.map((problem) => problem.code)).toContain(
        'games.world-setup.no-origin-placement',
      );
    });

    it('offers templates that validate and lower with no problem', async () => {
      expect(plugin.contributes.elementTemplates).toEqual(
        expect.arrayContaining([...worldSetupTemplates]),
      );
      const registries = createRegistryIndex({ vanilla: context.vanilla });
      for (const template of worldSetupTemplates) {
        expect(template.kind).toBe('msm:world_setup');
        const data = (await template.data({
          id: 'sky:world_setup' as ResourceLocation,
          namespace: 'sky',
          path: 'world_setup',
          projectNamespace: 'sky',
          namespaces: ['sky'],
          kindDefault: undefined,
          target: bundle.target,
        })) as Json;
        const node = context.schemaIndex.resolveSchemaRef(worldSetupKind.schema);
        expect(
          validateJson(data, node, { registries }).filter(
            (problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id',
          ),
          template.id,
        ).toEqual([]);
        const element = setup('world_setup', data);
        const problems = worldSetupValidators.flatMap(
          (validator) =>
            validator.validate({
              elements: [element],
              target: bundle.target,
              registry: validationRegistry(registries),
            }) as Problem[],
        );
        expect(
          problems.filter((problem) => problem.severity === 'error'),
          template.id,
        ).toEqual([]);
        const files = lowerWorldSetup(element, bundle.target);
        const ids = projectIds(files, bundle.target);
        const withProject = createRegistryIndex({ vanilla: context.vanilla, project: ids });
        expect(schemaProblems(files, context, withProject), template.id).toEqual([]);
        expect(await functionProblems(files, context, ids), template.id).toEqual([]);
      }
    });
  },
);
