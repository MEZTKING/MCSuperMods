/**
 * Golden over the committed rules project (`fixtures/sample-rules`, ADRs 0082 and 0084, plan
 * B380): namespace `msm_sample_rules`, an `msm:mod` and five rule books, each different enough
 * for a parity test (B381) to tell apart:
 *
 * - `chime_block_rules`: a **plain** rule on the Chime Block (`block_used`): play a chime at the
 *   block and give the player one Ruby. Plain rules compile to format actions only, so this
 *   book has no script and its event is in the Java eject.
 * - `lucky_block_rules`: a **logic** rule on the Lucky Block (`block_used`) that runs only while
 *   the player is sneaking: it adds one to the player counter `lucky_uses`, then with a 50 per
 *   cent chance gives a Ruby and plays a sound, otherwise shows "No luck this time." above the
 *   hotbar, and always says in the chat how many times the player has used it.
 * - `rally_horn_rules`: the Rally Horn (`item_used`, cooldown 2 s) gives Speed to each player
 *   within 16 blocks (`for_each_player`), waits 2 seconds (`wait`) and tells its user the rally
 *   is over.
 * - `sentinel_rules`: a **plain** rule on the Sentinel mob (`mob_every`, every 5 s): a bell at
 *   the mob, end rod sparkles and Glowing on the mob itself.
 * - `world_rules`: breaking vanilla Stone drops a Ruby with a 20 per cent chance
 *   (`any_block_broken` with subject `minecraft:stone`); a player who joins sees a welcome title
 *   (`player_joined`); every 10 seconds, when it is raining in the day, the weather is set to
 *   clear and every player is told the time of day (`world_every`).
 *
 * Pictures are the library's placeholder pictures (`placeholderPng`, `presetSkinPng`); none is
 * vanilla's. As the app does (ADR 0082 D9, B371), the project is expanded with every plugin's
 * project expanders before validating and exporting (`expandProject(project, PLUGINS,
 * target)`, as `library.test.ts` does), and `scripting.unknown-handler` warnings for handlers a
 * generated rule script defines are dropped.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and {@link SAMPLE_ASSETS}
 *   now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the expansion has none, the plugins' project
 *   validators report nothing on every target, and the generated scripts type-check against the
 *   generated typings.
 * - The content jar exports with zero errors and warnings, holds the definitions (valid) with
 *   the rules' events (plain ones as actions, the others as `run_script`), the three generated
 *   scripts as JavaScript, and its SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-rules-jar.sha256`).
 * - The vanilla packs carry nothing of the rules (they need the Fabric mod jar, R8): no `msm/`,
 *   no script; the data pack leaves out the two blocks' loot tables with
 *   `export.mod-only-reference`.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target) and
 *   `MSM_SAMPLE_RULES_OUT` (a folder), the jar is also exported with the real runtime nested and
 *   written to that folder as `msm_sample_rules.jar`, next to `fabric-facts.json` for
 *   `tools/run-fabric-server`. Without them that test is skipped.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  type DirEntry,
  ElementKindRegistry,
  expandProject,
  loadProject,
  type MemoryFileSystem,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import type { Element, Json, Plugin, Problem, Project, TargetFacts } from '@msm/plugin-api';
import blocksItemsPlugin, { blockGeneratedModelIds, blockItemIdOf } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import {
  COLOURS as LIBRARY_COLOURS,
  MOB_PRESETS,
  placeholderPng,
  presetAnimationFields,
  presetSkinPng,
  type Rgb,
} from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import rulesPlugin, {
  generatedScript,
  RULES_KIND,
  ruleEventId,
  ruleHandlerId,
  ruleScriptPath,
} from '@msm/plugin-rules';
import scriptingPlugin, {
  findHandlerDefinitions,
  MSM_RUNTIME_TYPINGS,
} from '@msm/plugin-scripting';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import { createMcfunctionService, type McfunctionService } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createFabricContentJarExporter,
  createMemorySink,
  createZipSink,
  dataPackExporter,
  type FabricContentJarOptions,
  MOD_ONLY_FUNCTION,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  nestedRuntimePath,
  resourcePackExporter,
  runExport,
  type ScriptTranspileResult,
  vanillaSafeExporter,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

// Expanding, compiling and exporting a project with mobs and rules takes a few seconds; under
// load the default 5 s is too short (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-rules');
const NAMESPACE = 'msm_sample_rules';
const PROJECT_NAME = 'MSM Sample Rules';
const NOW = '2026-11-14T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order (rules after scripting). */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
  rulesPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim', 'msm.rules'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-rules golden');

/** The transpiler of ADR 0031 D2: TypeScript to ES5 CommonJS; syntax errors as problems. */
function typescriptTranspile(source: string, name: string): ScriptTranspileResult {
  const output = ts.transpileModule(source, {
    fileName: name,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      downlevelIteration: true,
      ignoreDeprecations: '6.0',
    },
  });
  const diagnostics = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics.length > 0) {
    return {
      problems: diagnostics.map((diagnostic) => ({
        severity: 'error',
        code: 'scripting.syntax',
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        file: name,
      })),
    };
  }
  return { js: output.outputText };
}

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/block/x.png`. */
  path: string;
  bytes: Uint8Array;
}

type JsonRecord = { [key: string]: Json };
type Pattern = Parameters<typeof placeholderPng>[0];

const ns = (path: string): string => `${NAMESPACE}:${path}`;

const COLOURS = {
  ruby: LIBRARY_COLOURS.ruby,
  chime: LIBRARY_COLOURS.sapphire,
  lucky: LIBRARY_COLOURS.amber,
  horn: LIBRARY_COLOURS.jade,
  sentinel: LIBRARY_COLOURS.slate,
} as const satisfies Record<string, Rgb>;

const RUBY = ns('ruby');
const CHIME_BLOCK = ns('chime_block');
const LUCKY_BLOCK = ns('lucky_block');
const RALLY_HORN = ns('rally_horn');
const SENTINEL = ns('sentinel');

const CHIME_BOOK = ns('chime_block_rules');
const LUCKY_BOOK = ns('lucky_block_rules');
const HORN_BOOK = ns('rally_horn_rules');
const SENTINEL_BOOK = ns('sentinel_rules');
const WORLD_BOOK = ns('world_rules');

/** The player counter of the lucky block. */
const LUCKY_COUNTER = 'lucky_uses';
const luckyCount: Json = { counter: LUCKY_COUNTER, scope: 'player', value: 'counter' };

/** The chat and title lines a parity test can look for. */
const LINES = {
  noLuck: 'No luck this time.',
  luckyUsedBefore: 'You have used the lucky block ',
  luckyUsedAfter: ' times.',
  rallyOver: 'The rally is over.',
  welcomeTitle: 'Welcome',
  welcomeSubtitle: 'to the MSM sample rules',
  sunOut: 'The rain stops. Time of day: ',
} as const;

const texture = (path: string, pattern: Pattern, colour: Rgb): SampleAsset => ({
  path: `textures/${path}.png`,
  bytes: placeholderPng(pattern, { colour }),
});

/** A cube block model over `block/<name>`. */
const blockModel = (name: string): SampleElement => ({
  id: ns(`block/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:block/cube_all', textures: { all: ns(`block/${name}`) } },
});

/** A flat item model over `item/<name>`. */
const itemModel = (name: string): SampleElement => ({
  id: ns(`item/${name}`),
  kind: 'minecraft:model',
  data: { parent: 'minecraft:item/generated', textures: { layer0: ns(`item/${name}`) } },
});

/** A rule book with its counters. */
const book = (rules: Json[], counters: Json[] = []): Json => ({ counters, format: 1, rules });

const RULE_BOOKS: readonly SampleElement[] = [
  {
    id: CHIME_BOOK,
    kind: RULES_KIND,
    data: book([
      {
        do: [
          { sound: 'minecraft:block.note_block.chime', step: 'play_sound', where: 'here' },
          { count: 1, item: RUBY, step: 'give_item' },
        ],
        key: 'ring_chime',
        name: 'Ring the chime',
        when: { subject: CHIME_BLOCK, trigger: 'block_used' },
      },
    ]),
  },
  {
    id: LUCKY_BOOK,
    kind: RULES_KIND,
    data: book(
      [
        {
          do: [
            { amount: 1, counter: LUCKY_COUNTER, scope: 'player', step: 'add_to_counter' },
            {
              conditions: [{ condition: 'chance', percent: 50 }],
              do: [
                { count: 1, item: RUBY, step: 'give_item' },
                { sound: 'minecraft:entity.player.levelup', step: 'play_sound', where: 'player' },
              ],
              else: [{ step: 'show_action_bar', text: [LINES.noLuck] }],
              match: 'all',
              step: 'if',
            },
            {
              step: 'show_message',
              text: [LINES.luckyUsedBefore, luckyCount, LINES.luckyUsedAfter],
            },
          ],
          key: 'try_luck',
          name: 'Try your luck',
          only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
          when: { subject: LUCKY_BLOCK, trigger: 'block_used' },
        },
      ],
      [{ name: LUCKY_COUNTER, scope: 'player', start: 0 }],
    ),
  },
  {
    id: HORN_BOOK,
    kind: RULES_KIND,
    data: book([
      {
        do: [
          {
            do: [
              { effect: 'minecraft:speed', seconds: 10, step: 'give_effect' },
              { step: 'show_action_bar', text: ['Rally!'] },
            ],
            radius: 16,
            step: 'for_each_player',
          },
          { seconds: 2, step: 'wait' },
          { step: 'show_message', text: [LINES.rallyOver] },
        ],
        key: 'rally',
        name: 'Rally the players nearby',
        when: { options: { cooldown_seconds: 2 }, subject: RALLY_HORN, trigger: 'item_used' },
      },
    ]),
  },
  {
    id: SENTINEL_BOOK,
    kind: RULES_KIND,
    data: book([
      {
        do: [
          { sound: 'minecraft:block.note_block.bell', step: 'play_sound', where: 'here' },
          {
            count: 5,
            particle: 'minecraft:end_rod',
            spread: 0.3,
            step: 'spawn_particles',
            where: 'here',
          },
          { effect: 'minecraft:glowing', seconds: 3, step: 'give_effect', who: 'mob' },
        ],
        key: 'keep_watch',
        name: 'Keep watch',
        when: { options: { interval_seconds: 5 }, subject: SENTINEL, trigger: 'mob_every' },
      },
    ]),
  },
  {
    id: WORLD_BOOK,
    kind: RULES_KIND,
    data: book([
      {
        do: [{ count: 1, item: RUBY, step: 'drop_item' }],
        key: 'stone_ruby',
        name: 'Stone sometimes hides a ruby',
        only_if: { conditions: [{ condition: 'chance', percent: 20 }], match: 'all' },
        when: { subject: 'minecraft:stone', trigger: 'any_block_broken' },
      },
      {
        do: [
          {
            step: 'show_title',
            subtitle: [LINES.welcomeSubtitle],
            title: [LINES.welcomeTitle],
          },
          { sound: 'minecraft:block.note_block.chime', step: 'play_sound', where: 'player' },
        ],
        key: 'welcome',
        name: 'Welcome',
        when: { trigger: 'player_joined' },
      },
      {
        do: [
          { seconds: 300, step: 'set_weather', weather: 'clear' },
          {
            step: 'show_message',
            text: [LINES.sunOut, { value: 'time_of_day' }],
            who: 'every_player',
          },
        ],
        key: 'clear_rain',
        name: 'No rain in the day',
        only_if: {
          conditions: [{ condition: 'is_raining' }, { condition: 'is_day' }],
          match: 'all',
        },
        when: { options: { interval_seconds: 10 }, trigger: 'world_every' },
      },
    ]),
  },
];

/** The Sentinel, drawn with the library's biped preset by the runtime's vanilla renderer. */
const SENTINEL_ELEMENTS: readonly SampleElement[] = [
  {
    id: SENTINEL,
    kind: 'msm:entity',
    data: {
      format: 1,
      display_name: 'Sentinel',
      category: 'creature',
      size: { width: 0.6, height: 1.95 },
      spawn_egg: { texture: ns('item/sentinel_spawn_egg'), display_name: 'Sentinel Spawn Egg' },
      components: {
        'msm:health': { max: 20 },
        'msm:movement': { speed: 0.2 },
        'msm:ai_goals': {
          goals: [
            { type: 'wander', speed: 0.6 },
            { type: 'look_at_player', distance: 8 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': {
          model: ns('entity/sentinel'),
          animations: ns('entity/sentinel_animations'),
          texture: ns('entity/sentinel'),
          renderer: 'vanilla',
          ...presetAnimationFields('biped'),
        },
      },
    },
  },
  {
    id: ns('entity/sentinel'),
    kind: 'msm:geo_model',
    data: MOB_PRESETS.biped.geometry('sentinel'),
  },
  {
    id: ns('entity/sentinel_animations'),
    kind: 'msm:animation',
    data: MOB_PRESETS.biped.animations(),
  },
];

const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description:
        'Sample rules: two blocks, two items and a mob whose behaviour is made with rules, no code, plus rules for vanilla stone, joining players and the weather.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  ...RULE_BOOKS,
  {
    id: RUBY,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Ruby',
      model: ns('item/ruby'),
      creative_tab: 'minecraft:ingredients',
    },
  },
  itemModel('ruby'),
  {
    id: CHIME_BLOCK,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Chime Block',
      model: ns('block/chime_block'),
      sound_type: 'amethyst',
      loot: 'self',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: { 'msm:breakable': { hardness: 0.8, resistance: 0.8 } },
    },
  },
  blockModel('chime_block'),
  {
    id: LUCKY_BLOCK,
    kind: 'msm:block',
    data: {
      format: 1,
      display_name: 'Lucky Block',
      model: ns('block/lucky_block'),
      sound_type: 'stone',
      loot: 'self',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: { 'msm:breakable': { hardness: 0.8, resistance: 0.8 } },
    },
  },
  blockModel('lucky_block'),
  {
    id: RALLY_HORN,
    kind: 'msm:item',
    data: {
      format: 1,
      display_name: 'Rally Horn',
      model: ns('item/rally_horn'),
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
    },
  },
  itemModel('rally_horn'),
  ...SENTINEL_ELEMENTS,
];

const SAMPLE_ASSETS: readonly SampleAsset[] = [
  texture('item/ruby', 'gem', COLOURS.ruby),
  texture('block/chime_block', 'plain', COLOURS.chime),
  texture('block/lucky_block', 'gem', COLOURS.lucky),
  texture('item/rally_horn', 'totem', COLOURS.horn),
  {
    path: 'textures/entity/sentinel.png',
    bytes: presetSkinPng('biped', { colour: COLOURS.sentinel }),
  },
  texture('item/sentinel_spawn_egg', 'egg', COLOURS.sentinel),
];

const nameOf = (id: string): string => id.split(':')[1] as string;
const ofKind = (kind: string): string[] =>
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === kind).map((entry) => nameOf(entry.id));
const BLOCK_NAMES = ofKind('msm:block');
const ITEM_NAMES = ofKind('msm:item');
const ENTITY_NAMES = ofKind('msm:entity');

/**
 * Each rule's subject event: `[subject, trigger, plain]` (a plain event holds format actions
 * only; the others hold one `run_script` action).
 */
const DEFINITION_EVENTS: readonly (readonly [string, string, string, boolean])[] = [
  [CHIME_BOOK, CHIME_BLOCK, 'block_used', true],
  [LUCKY_BOOK, LUCKY_BLOCK, 'block_used', false],
  [HORN_BOOK, RALLY_HORN, 'item_used', false],
  [SENTINEL_BOOK, SENTINEL, 'mob_every', true],
];

/** The books that need a script (any rule with logic or a script-only trigger). */
const SCRIPT_BOOKS = [HORN_BOOK, LUCKY_BOOK, WORLD_BOOK] as const;

/** What the runtime registers: two blocks, their items, two items and the spawn egg. */
const EXPECTED_BLOCKS = BLOCK_NAMES.length;
const EXPECTED_ITEMS = BLOCK_NAMES.length + ITEM_NAMES.length + ENTITY_NAMES.length;

/** Builds the sample into a project the way the app's `newProject` does, then saves it. */
async function buildSample(): Promise<MemoryFileSystem> {
  const project = createEmptyProject(PROJECT_NAME, {
    targets: [defaultTarget().target.id],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  const namespace = {
    name: NAMESPACE,
    elements: [] as Element[],
    assets: [] as { path: string; mediaType: string }[],
  };
  for (const entry of SAMPLE_ELEMENTS) {
    namespace.elements.push(
      createElement({
        id: entry.id as Element['id'],
        kind: entry.kind,
        data: structuredClone(entry.data),
        now: () => NOW,
      }),
    );
  }
  const fs = createMemoryFileSystem();
  for (const asset of SAMPLE_ASSETS) {
    const file = `assets/${NAMESPACE}/${asset.path}`;
    await fs.mkdirp(file.slice(0, file.lastIndexOf('/')));
    await fs.writeFile(file, asset.bytes);
    namespace.assets.push({ path: asset.path, mediaType: 'image/png' });
  }
  project.namespaces.push(namespace);
  await saveProject(fs, project, registry);
  return fs;
}

const resolvePath = (path: string): string => join(sampleRoot, ...path.split('/'));
const readOnly = async (): Promise<never> => {
  throw new Error('The sample project is read-only in tests.');
};

/** A read-only file system over the fixture directory. */
const sampleFs: ProjectFileSystem = {
  readFile: async (path) => new Uint8Array(await readFile(resolvePath(path))),
  async readDir(path) {
    const entries = await readdir(resolvePath(path), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map(
        (entry): DirEntry => ({
          name: entry.name,
          kind: entry.isDirectory() ? 'directory' : 'file',
        }),
      );
  },
  async exists(path) {
    try {
      await stat(resolvePath(path));
      return true;
    } catch {
      return false;
    }
  },
  writeFile: readOnly,
  mkdirp: readOnly,
  remove: readOnly,
};

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

async function loadSample(): Promise<Project> {
  const { project, problems } = await loadProject(sampleFs, registry);
  expect(problems).toEqual([]);
  return project;
}

/**
 * The project as the app's session validates and exports it (ADR 0082 D9, B371): expanded by
 * every plugin's project expanders in registration order, with zero expansion problems.
 */
async function expandSample(target: TargetFacts): Promise<Project> {
  const expansion = await expandProject(await loadSample(), PLUGINS, target);
  expect(expansion.problems).toEqual([]);
  return expansion.project;
}

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

const dataOf = (project: Project, id: string): JsonRecord =>
  elementsOf(project).find((element) => element.id === id)?.data as JsonRecord;

/** The generated script lines of every rule book of an expanded project, by book id. */
function ruleScripts(expanded: Project): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const element of elementsOf(expanded)) {
    if (element.kind !== RULES_KIND) continue;
    const lines = generatedScript(element.data);
    if (lines !== undefined) out.set(element.id, lines);
  }
  return out;
}

/**
 * `problems` without the `scripting.unknown-handler` warnings for handlers a generated rule
 * script defines, as the app's session drops them (B371).
 */
function withoutRuleHandlers(problems: readonly Problem[], expanded: Project): Problem[] {
  const defined = new Set<string>();
  for (const lines of ruleScripts(expanded).values()) {
    for (const definition of findHandlerDefinitions(lines)) defined.add(definition.handler);
  }
  return problems.filter(
    (problem) =>
      problem.code !== 'scripting.unknown-handler' ||
      ![...defined].some((handler) => problem.message.includes(`"${handler}"`)),
  );
}

/**
 * Type-checks scripts against the generated typings with `lib.es5` only, as
 * `sample-script.golden.test.ts` does.
 */
function typeCheckScripts(scripts: ReadonlyMap<string, string[]>): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS]]);
  for (const [id, lines] of scripts) files.set(`/script/${nameOf(id)}.ts`, `${lines.join('\n')}\n`);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    lib: ['lib.es5.d.ts'],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  host.getDefaultLibLocation = () => libDir;
  host.getSourceFile = (fileName, languageVersion) => {
    const text =
      files.get(fileName) ?? readFileSync(join(libDir, fileName.split('/').pop() ?? ''), 'utf8');
    return ts.createSourceFile(fileName, text, languageVersion);
  };
  host.fileExists = (fileName) => files.has(fileName) || fileName.startsWith(libDir);
  host.directoryExists = (name) => name === '/' || name === '/script' || name.startsWith(libDir);
  host.readFile = (fileName) => files.get(fileName);
  const program = ts.createProgram([...files.keys()], options, host);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file === undefined ? '' : `${d.file.fileName}: `;
    return `${where}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });
}

// Registries and checkers -------------------------------------------------------------------

/**
 * The project's own ids per registry, as the app derives them: element ids under their kind's
 * registry, each block's item and generated models, the spawn egg and its generated item
 * model, and the textures of the namespace's PNG assets.
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const name = registry.get(element.kind)?.registry;
      if (name === undefined) {
        if (element.kind.startsWith('minecraft:'))
          add(element.kind.slice('minecraft:'.length), element.id);
        continue;
      }
      add(name, element.id);
      if (element.kind === 'msm:block') {
        const itemId = blockItemIdOf(element.id, element.data);
        if (itemId !== undefined) add('item', itemId);
        for (const id of blockGeneratedModelIds(element.id, element.data as Json)) add('model', id);
      }
      const egg = (element.data as { spawn_egg?: Json }).spawn_egg;
      if (name === 'entity_type' && egg !== undefined && egg !== false) {
        add('item', `${element.id}_spawn_egg`);
        add('model', `${namespace.name}:item/${nameOf(element.id)}_spawn_egg`);
      }
    }
    for (const asset of namespace.assets) {
      const match = /^textures\/(.+)\.png$/.exec(asset.path);
      if (match !== null) add('texture', `${namespace.name}:${match[1]}`);
    }
  }
  for (const [name, list] of Object.entries(ids)) ids[name] = [...new Set(list)].sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
  mcfunction: McfunctionService;
  functionIds: Record<string, string[]>;
  ids: Record<string, string[]>;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const ids = projectIds(project);
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: ids,
    }),
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries: vanilla as Record<string, string[]> },
      { mcVersion: bundle.target.mcVersion },
    ),
    functionIds: {
      block: ids.block ?? [],
      item: ids.item ?? [],
      function: ids.function ?? [],
      'tag/function': ['minecraft:load', 'minecraft:tick'],
    },
    ids,
  };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Runs `body` with `process.env.TZ` set to `zone`, restoring the previous value after. */
async function inTimeZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

/** The `version` of the `fabric.mod.json` inside a mod jar. */
function jarModVersion(jar: Uint8Array): string {
  const files = unzipSync(jar, { filter: (file) => file.name === 'fabric.mod.json' });
  const modJson = files['fabric.mod.json'];
  if (modJson === undefined) throw new Error('The runtime jar has no fabric.mod.json');
  const version = (JSON.parse(utf8.decode(modJson)) as { version?: unknown }).version;
  if (typeof version !== 'string') throw new Error('The runtime fabric.mod.json has no version');
  return version;
}

// Tests -------------------------------------------------------------------------------------

describe('sample rules project', () => {
  it('equals SAMPLE_ELEMENTS and SAMPLE_ASSETS saved as a project', async () => {
    const generated = (await buildSample()).snapshot();
    if (update) {
      for (const path of await listFiles(sampleRoot)) {
        if (!HAND_WRITTEN.has(path)) await rm(join(sampleRoot, ...path.split('/')));
      }
      await rm(join(sampleRoot, 'content'), { recursive: true, force: true });
      await rm(join(sampleRoot, 'assets'), { recursive: true, force: true });
      for (const [path, bytes] of Object.entries(generated)) {
        const file = join(sampleRoot, ...path.split('/'));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, bytes);
      }
    }
    const onDisk = (await listFiles(sampleRoot)).filter((path) => !HAND_WRITTEN.has(path));
    expect(onDisk).toEqual(Object.keys(generated).sort());
    for (const [path, bytes] of Object.entries(generated)) {
      const file = new Uint8Array(await readFile(join(sampleRoot, ...path.split('/'))));
      expect(Buffer.from(file).equals(Buffer.from(bytes)), path).toBe(true);
    }
  });

  it('loads with zero problems and has the rules B380 names', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const books = elementsOf(project).filter((element) => element.kind === RULES_KIND);
    expect(books.map((element) => element.id).sort()).toEqual(
      [CHIME_BOOK, HORN_BOOK, LUCKY_BOOK, SENTINEL_BOOK, WORLD_BOOK].sort(),
    );
    const triggers = books.flatMap((element) =>
      ((element.data as JsonRecord).rules as { when: { trigger: string } }[]).map(
        (rule) => rule.when.trigger,
      ),
    );
    expect(triggers.sort()).toEqual(
      [
        'any_block_broken',
        'block_used',
        'block_used',
        'item_used',
        'mob_every',
        'player_joined',
        'world_every',
      ].sort(),
    );
    expect(JSON.stringify(dataOf(project, LUCKY_BOOK))).toContain('"player_sneaking"');
    expect(JSON.stringify(dataOf(project, HORN_BOOK))).toContain('"for_each_player"');
    expect(JSON.stringify(dataOf(project, HORN_BOOK))).toContain('"wait"');
    expect(JSON.stringify(dataOf(project, WORLD_BOOK))).toContain('"set_weather"');
    expect(JSON.stringify(dataOf(project, WORLD_BOOK))).toContain('"time_of_day"');
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:model',
      'msm:animation',
      'msm:block',
      'msm:entity',
      'msm:geo_model',
      'msm:item',
      'msm:mod',
      'msm:rules',
    ]);
    expect(project.namespaces[0]?.assets.map((asset) => asset.path).sort()).toEqual(
      SAMPLE_ASSETS.map((asset) => asset.path).sort(),
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample rules export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 120_000);

    async function validateText(file: { language?: string; contents: unknown; path: string }) {
      if (file.language !== 'mcfunction') return [];
      const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
      const found = await context.mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: context.functionIds,
      });
      return found.map(
        (problem): Problem => ({
          severity: problem.severity,
          code: problem.code,
          message: `line ${problem.line + 1}: ${problem.message}`,
          file: file.path,
        }),
      );
    }

    async function exportJar(
      factory: FabricContentJarOptions = { loadRuntimeJar: async () => stubRuntimeJar },
    ): Promise<Uint8Array> {
      const sink = createZipSink();
      const report = await runExport({
        project: await expandSample(target),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: createFabricContentJarExporter({
          ...factory,
          transpileScript: async (source, name) => typescriptTranspile(source, name),
        }),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText,
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(report.ok).toBe(true);
      return sink.finish();
    }

    it('validates every element with zero problems', async () => {
      const problems: string[] = [];
      for (const element of elementsOf(await loadSample())) {
        const kind = registry.get(element.kind);
        if (kind === undefined) throw new Error(`unknown kind ${element.kind}`);
        const hidden = kind.hiddenPaths ?? [];
        const node = context.schemaIndex.resolveSchemaRef(kind.schema);
        for (const problem of validateJson(element.data, node, {
          registries: context.registries,
        })) {
          if (hidden.some((path) => problem.path === path || problem.path.startsWith(`${path}/`))) {
            continue;
          }
          problems.push(`${element.id} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it('expands with no problems and passes every project validator with no problems at all', async () => {
      const expanded = await expandSample(target);
      const elements = elementsOf(expanded);
      const found = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(withoutRuleHandlers(found, expanded)).toEqual([]);
    });

    it('compiles plain rules to actions and the others to three type-checked scripts', async () => {
      const expanded = await expandSample(target);
      const scripts = ruleScripts(expanded);
      expect([...scripts.keys()].sort()).toEqual([...SCRIPT_BOOKS].sort());
      expect(typeCheckScripts(scripts)).toEqual([]);
      for (const [bookId, subject, trigger, plain] of DEFINITION_EVENTS) {
        const events = dataOf(expanded, subject).events as JsonRecord;
        const event = events[ruleEventId(subject, trigger)] as { actions: JsonRecord[] };
        expect(event, `${subject} ${trigger}`).toBeDefined();
        const types = event.actions.map((action) => action.type);
        if (plain) {
          expect(types, subject).not.toContain('run_script');
        } else {
          expect(event.actions, subject).toEqual([
            expect.objectContaining({
              type: 'run_script',
              handler: ruleHandlerId(bookId, subject, trigger),
            }),
          ]);
        }
      }
      // The plain events, action by action.
      const chime = (dataOf(expanded, CHIME_BLOCK).events as JsonRecord)[
        ruleEventId(CHIME_BLOCK, 'block_used')
      ] as { actions: JsonRecord[] };
      expect(chime.actions.map((action) => action.type)).toEqual(['play_sound', 'give_item']);
      expect(chime.actions[1]).toMatchObject({ item: RUBY, count: 1 });
      const sentinel = (dataOf(expanded, SENTINEL).events as JsonRecord)[
        ruleEventId(SENTINEL, 'mob_every')
      ] as { actions: JsonRecord[] };
      expect(sentinel.actions.map((action) => action.type)).toEqual([
        'play_sound',
        'spawn_particle',
        'apply_effect',
      ]);
      expect(sentinel.actions[2]).toMatchObject({ effect: 'minecraft:glowing', target: 'self' });
      expect(
        ((dataOf(expanded, SENTINEL).components as JsonRecord)['msm:on_tick'] as JsonRecord)
          .interval_ticks,
      ).toBe(100);
      // The world book's script listens to the three script-only triggers.
      const world = (scripts.get(WORLD_BOOK) ?? []).join('\n');
      for (const event of ['block.break', 'player.join', 'server.tick']) {
        expect(world, event).toContain(`"${event}"`);
      }
      expect(world).toContain('minecraft:stone');
    });

    it('holds the definitions (valid) with the rules events and the generated scripts', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const resource = target.folders.resource;
      const data = target.folders.data;
      const definitions: [string, string][] = [
        ...BLOCK_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/block/${name}.json`,
          MSM_SCHEMA_REFS.blockDefinition,
        ]),
        ...ITEM_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/item/${name}.json`,
          MSM_SCHEMA_REFS.itemDefinition,
        ]),
        ...ENTITY_NAMES.map((name): [string, string] => [
          `msm/${NAMESPACE}/entity/${name}.json`,
          MSM_SCHEMA_REFS.entityDefinition,
        ]),
      ];
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [
          ...definitions.map(([path]) => path),
          ...SCRIPT_BOOKS.map((id) => ruleScriptPath(id).replace(/\.ts$/, '.js')),
        ].sort(),
      );
      expect(paths.filter((path) => path.endsWith('.ts'))).toEqual([]);
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `assets/${NAMESPACE}/${resource.lang}/en_us.json`,
        ...BLOCK_NAMES.map((name) => `assets/${NAMESPACE}/blockstates/${name}.json`),
        ...BLOCK_NAMES.map((name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`),
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths).not.toContain('pack.mcmeta');

      const json = (path: string): Json => JSON.parse(utf8.decode(files[path] as Uint8Array));
      const problems: string[] = [];
      for (const [path, ref] of definitions) {
        for (const problem of validateJson(json(path), context.schemaIndex.resolveSchemaRef(ref), {
          registries: context.registries,
        })) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);

      // Each definition subject carries its rules' event on the trigger component.
      const component: Record<string, [string, string]> = {
        block_used: ['block', 'msm:on_interact'],
        item_used: ['item', 'msm:on_use'],
        mob_every: ['entity', 'msm:on_tick'],
      };
      for (const [, subject, trigger] of DEFINITION_EVENTS) {
        const [folder, name] = component[trigger] as [string, string];
        const definition = json(`msm/${NAMESPACE}/${folder}/${nameOf(subject)}.json`) as JsonRecord;
        const eventId = ruleEventId(subject, trigger);
        expect((definition.components as JsonRecord)[name], subject).toMatchObject({
          event: eventId,
        });
        expect((definition.events as JsonRecord)[eventId], subject).toBeDefined();
      }

      for (const id of SCRIPT_BOOKS) {
        const js = utf8.decode(files[ruleScriptPath(id).replace(/\.ts$/, '.js')] as Uint8Array);
        expect(js, id).toContain('require("msm:runtime")');
      }
      const lucky = utf8.decode(
        files[ruleScriptPath(LUCKY_BOOK).replace(/\.ts$/, '.js')] as Uint8Array,
      );
      expect(lucky).toContain(ruleHandlerId(LUCKY_BOOK, LUCKY_BLOCK, 'block_used'));
      expect(lucky).toContain('"rules.counter."');
      expect(lucky).toContain(`"${LUCKY_COUNTER}"`);

      const lang = json(`assets/${NAMESPACE}/${resource.lang}/en_us.json`) as JsonRecord;
      for (const name of BLOCK_NAMES)
        expect(lang[`block.${NAMESPACE}.${name}`], name).toBeDefined();
      for (const name of ITEM_NAMES) expect(lang[`item.${NAMESPACE}.${name}`], name).toBeDefined();

      const modJson = json('fabric.mod.json') as { id: string; depends: Record<string, string> };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      const runtimePath = nestedRuntimePath(meta.msmVersion);
      expect(files[runtimePath]).toEqual(stubRuntimeJar);
      // The Sentinel is drawn by the runtime's vanilla renderer: no GeckoLib on any target.
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([runtimePath]);
    });

    it('leaves the rules and the loot tables out of the vanilla data pack', async () => {
      const modOnly = modOnlyIdsOf(context.ids);
      const sink = createMemorySink();
      const report = await runExport({
        project: await expandSample(target),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnly),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText,
      });
      const safety: ReadonlySet<string> = new Set([MOD_ONLY_REFERENCE, MOD_ONLY_FUNCTION]);
      expect(
        report.problems.filter(
          (problem) => problem.severity !== 'info' && !safety.has(problem.code),
        ),
      ).toEqual([]);
      expect(report.ok).toBe(true);
      expect([...sink.files().keys()].sort()).toEqual(['msm.export.json', 'pack.mcmeta']);
      const data = target.folders.data;
      expect(
        report.problems
          .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
          .map((problem) => problem.file ?? '')
          .sort(),
      ).toEqual(
        BLOCK_NAMES.map(
          (name) => `data/${NAMESPACE}/${data.loot_table}/blocks/${name}.json`,
        ).sort(),
      );
    });

    it('leaves the rules out of the vanilla resource pack', async () => {
      const sink = createMemorySink();
      const report = await runExport({
        project: await expandSample(target),
        registry,
        target,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: resourcePackExporter,
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      const paths = [...sink.files().keys()];
      expect(paths.some((path) => path.startsWith('msm/') || path.includes('/script/'))).toBe(
        false,
      );
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-rules-jar.sha256');
      const savedZone = process.env.TZ;
      afterAll(() => {
        expect(process.env.TZ).toBe(savedZone);
      });

      it('has the recorded SHA-256 in two time zones', async () => {
        const offsets: number[] = [];
        const hashes: string[] = [];
        for (const zone of TIME_ZONES) {
          await inTimeZone(zone, async () => {
            offsets.push(new Date(2000, 0, 1).getTimezoneOffset());
            hashes.push(sha256(await exportJar()));
          });
        }
        expect(new Set(offsets).size).toBe(TIME_ZONES.length);
        expect(new Set(hashes).size).toBe(1);
        const actual = hashes[0] as string;
        if (update) {
          await mkdir(dirname(hashFile), { recursive: true });
          await writeFile(hashFile, `${actual}\n`);
        }
        const expected = (await readFile(hashFile, 'utf8')).trim();
        expect(actual).toBe(expected);
      });
    });

    const runtimeJarPath = process.env.MSM_RUNTIME_JAR;
    const outDir = process.env.MSM_SAMPLE_RULES_OUT;
    it.runIf(runtimeJarPath !== undefined && outDir !== undefined && bundle === selectedTarget())(
      'writes the jar with the real runtime for the headless server check',
      async () => {
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const jar = await exportJar({ loadRuntimeJar: async () => runtimeJar, runtimeVersion });
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS,
          expectEntities: ENTITY_NAMES.length,
          expectItems: EXPECTED_ITEMS,
          expectScripts: SCRIPT_BOOKS.length,
          fabricApi: fabric.api,
          java: target.java,
          loader: fabric.loader,
          minecraft: target.mcVersion,
          runtimeVersion,
        };
        await writeFile(
          join(outDir as string, 'fabric-facts.json'),
          `${JSON.stringify(facts, null, 2)}\n`,
        );
        expect(unzipSync(jar)[nestedRuntimePath(runtimeVersion)]).toEqual(runtimeJar);
      },
      120_000,
    );
  },
);
