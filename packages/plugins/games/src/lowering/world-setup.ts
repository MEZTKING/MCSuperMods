/**
 * Lowering of `msm:world_setup` (ADR 0113 D2, D9; ADR 0114 D1 to D3): plain data pack files
 * only, so a game made of them works as vanilla packs.
 *
 * - The world type ({@link lowerWorldType}): a world preset in `#minecraft:normal`, its sky
 *   biome and its English name.
 * - The world start, once for the world: `<ns>:msm_games/world_setup/load` joins the plugin's
 *   `#<ns>:msm_games/load` (B552's shared functions, itself in `#minecraft:load`) and runs `<ns>:msm_games/world_setup/world_start` unless the flag
 *   `world_setup` is set in the storage `<ns>:msm_games` (B547 Y3: the flag survives restarts,
 *   `/reload` and a copied world). It sets the difficulty, the default game mode, the
 *   `respawn_radius` game rule (`spawn_radius`), the vanilla game rules, then the flag.
 * - The start structure ({@link lowerStart}) and the new player's first join
 *   ({@link lowerFirstJoin}).
 *
 * Project game rules (a namespace other than `minecraft`) need the Fabric mod jar and the
 * function checker refuses them, so they are left out here (the validators warn; a rule sets
 * them, ADR 0113 plan "Data packs first").
 */
import type { Element, OutputFile, TargetFacts } from '@msm/plugin-api';
import { lowerFirstJoin } from './first-join';
import { fillForm, functionFile, sharedFunctionFiles } from './shared-functions';
import { lowerStart, startStructureSets } from './start';
import {
  bareVanilla,
  isVanillaRuleName,
  readWorldSetup,
  type WorldSetup,
  type WorldSetupNames,
  worldSetupNames,
} from './world-setup-files';
import { lowerWorldType, usesSkyBiome } from './world-type';

/** The storage flag set once the world start has run. */
export const WORLD_FLAG = 'world_setup';

/** The vanilla game rule `spawn_radius` sets. */
export const RESPAWN_RADIUS_RULE = 'respawn_radius';

/** The function the world setup adds to the plugin's `#<ns>:msm_games/load`. */
export const worldSetupLoadFunction = (id: string): string => worldSetupNames(id).fn('load');

/** The vanilla game rules the world start sets, in the element's order. */
function gameRuleLines(setup: WorldSetup, target: TargetFacts): string[] {
  const lines: string[] = [];
  const rules = Object.entries(setup.gameRules).filter(([name]) => isVanillaRuleName(name));
  const vanilla = target.gameRules?.vanillaNames;
  const named = new Set(rules.map(([name]) => bareVanilla(name)));
  if (!named.has(RESPAWN_RADIUS_RULE) && (vanilla?.includes(RESPAWN_RADIUS_RULE) ?? true)) {
    lines.push(
      fillForm(target, 'game_rule', { rule: RESPAWN_RADIUS_RULE, rule_value: setup.spawnRadius }),
    );
  }
  for (const [name, value] of rules) {
    lines.push(fillForm(target, 'game_rule', { rule: bareVanilla(name), rule_value: value }));
  }
  return lines;
}

/**
 * The world setup's `load` contribution to the plugin's `#<ns>:msm_games/load` (B552's shared
 * functions) and the world start function it runs once.
 */
function worldStartFiles(
  setup: WorldSetup,
  names: WorldSetupNames,
  target: TargetFacts,
): OutputFile[] {
  return [
    ...sharedFunctionFiles(target, names.namespace, [
      {
        phase: 'load',
        path: names.fnPath('load'),
        lines: [
          '# Runs the world start once for the world (the flag survives restarts and /reload).',
          fillForm(target, 'unless_storage_run', {
            storage: names.storage,
            nbt_path: `{${WORLD_FLAG}:1b}`,
            command: fillForm(target, 'run_function', { function: names.fn('world_start') }),
          }),
        ],
      },
    ]),
    functionFile(target, names.namespace, names.fnPath('world_start'), [
      '# The world start: difficulty, game mode and game rules, set once.',
      fillForm(target, 'difficulty', { difficulty: setup.difficulty }),
      fillForm(target, 'default_game_mode', { game_mode: setup.gameMode }),
      ...gameRuleLines(setup, target),
      fillForm(target, 'storage_set_value', {
        storage: names.storage,
        nbt_path: WORLD_FLAG,
        nbt: '1b',
      }),
    ]),
  ];
}

/**
 * Lowers one `msm:world_setup` to its data pack and resource pack files.
 *
 * @throws If the data cannot be lowered or the target lacks the game kits' facts.
 */
export function lowerWorldSetup(element: Element, target: TargetFacts): OutputFile[] {
  const setup = readWorldSetup(element);
  const names = worldSetupNames(element.id);
  return [
    ...lowerWorldType(setup, names, target, startStructureSets(setup, names)),
    ...worldStartFiles(setup, names, target),
    ...lowerStart(setup, names, target),
    ...lowerFirstJoin(setup, names, target),
  ];
}

/**
 * The ids a world setup's lowering writes, by registry (as the app's registry view and the
 * function checker need them, like the companion ids of other kinds): the world preset and the
 * sky biome when written, the four functions (three without a start), the first-join
 * advancement and, on the `world_generation` route, the start's jigsaw, pool and set.
 */
export function worldSetupGeneratedIds(element: Element): Record<string, string[]> {
  const setup = readWorldSetup(element);
  const names = worldSetupNames(element.id);
  const type = setup.world.type;
  const ids: Record<string, string[]> = {
    function: [
      names.fn('load'),
      names.fn('world_start'),
      ...(setup.start === undefined ? [] : [names.fn('start')]),
      names.fn('first_join'),
    ],
    advancement: [names.firstJoin],
  };
  if (type === 'void' || type === 'flat' || type === 'sky_islands') {
    ids['worldgen/world_preset'] = [names.preset];
  }
  if (usesSkyBiome(setup)) ids['worldgen/biome'] = [names.skyBiome];
  if (setup.start?.when === 'world_generation') {
    for (const registry of [
      'worldgen/structure',
      'worldgen/template_pool',
      'worldgen/structure_set',
    ]) {
      ids[registry] = [names.startStructure];
    }
  }
  return ids;
}
