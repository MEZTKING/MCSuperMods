/**
 * Project validators of `msm:world_setup` (ADR 0113 D2, D9; ADR 0114 D1, D2; B547):
 *
 * - `games.world-setup.one-per-project` (error): a project has at most one world setup.
 * - `games.world-setup.start-missing` (error): the start structure is neither a project
 *   structure template nor a known structure id.
 * - `games.world-setup.spawn-outside` (error): the spawn is outside the start structure's box
 *   (standing on its top, one above its height, counts as inside).
 * - `games.world-setup.start-too-large` (error): on the first-join route a start wider than 48
 *   on x or z, which the start's loaded area does not cover (limit M4: make it jigsaw pieces).
 * - `games.world-setup.start-turned` (warning): on the `world_generation` route the game turns
 *   the start at random about x 0, z 0 and places nothing with "Generate structures" off; also
 *   when `at` is not at x 0, z 0, where the game puts it.
 * - `games.world-setup.no-origin-placement` (error): the target has no `dimension_origin`.
 * - `games.world-setup.unknown-game-rule` (error): a game rule name that is neither one of
 *   `target.gameRules.vanillaNames` nor a project `msm:game_rule`.
 * - `games.world-setup.project-game-rule` (warning): a project game rule, which needs the
 *   Fabric mod jar, is not set by the world setup's data pack (a rule sets it).
 * - `games.world-setup.kit-both` (error): the kit has `items` and a `loot_table`.
 * - `games.world-setup.void-end` (warning): a void End is reached only through an End portal
 *   frame in the start structure, with at least one eye left out (B547 Y5).
 * - `games.world-setup.void-nether` (info): a void Nether is reached by a Nether portal the
 *   players build; the game builds the way back on an obsidian platform.
 * - `games.world-setup.no-start` (warning): a void or sky islands world without a start
 *   structure, where new players fall.
 * - `games.world-setup.flat-without-layers` (warning): a flat world with no layers is a void.
 * - `games.world-setup.preset-missing` (error): the type `preset` without a preset.
 * - `games.world-setup.preset-dimensions` (warning): a void Nether or End is not applied to a
 *   project preset, whose own dimensions are kept.
 * - `games.generated-path` (error): a project function under `<ns>:msm_games/`, where the
 *   games plugin writes its own (ADR 0113 D9).
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationInput,
} from '@msm/plugin-api';
import { GAMES_FUNCTION_ROOT } from './lowering/shared-functions';
import { DIMENSION_ORIGIN, START_AREA } from './lowering/start';
import { bareVanilla, isVanillaRuleName } from './lowering/world-setup-files';

/** The kind this file validates. */
const WORLD_SETUP = 'msm:world_setup';
/** The structures plugin's template kind (a start structure is one of these, or a known id). */
const STRUCTURE_TEMPLATE = 'minecraft:structure_template';
/** The scripting plugin's project game rule kind. */
const GAME_RULE = 'msm:game_rule';
/** Project functions. */
const FUNCTION = 'minecraft:function';

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPos = (value: Json | undefined): value is number[] =>
  Array.isArray(value) && value.length === 3 && value.every((axis) => typeof axis === 'number');

/** The size of a project structure template, or `undefined`. */
function templateSize(elements: readonly Element[], id: string): number[] | undefined {
  const template = elements.find(
    (element) => element.kind === STRUCTURE_TEMPLATE && element.id === id,
  );
  if (template === undefined || !isObject(template.data)) return undefined;
  return isPos(template.data.size) ? template.data.size : undefined;
}

/** The checks of one world setup. */
function checkWorldSetup(
  element: Element,
  elements: readonly Element[],
  input: ValidationInput,
): Problem[] {
  const problems: Problem[] = [];
  const data = element.data;
  if (!isObject(data)) return problems;
  const report = (
    severity: Problem['severity'],
    code: string,
    path: string,
    message: string,
  ): void => {
    problems.push({ severity, code, message, elementId: element.id, path });
  };
  const world = isObject(data.world) ? data.world : {};
  const type = world.type;

  // The world type.
  if (type === 'preset' && typeof world.preset !== 'string') {
    report(
      'error',
      'games.world-setup.preset-missing',
      '/world/preset',
      'Pick the world preset this world type uses.',
    );
  }
  if (type === 'preset' && (world.nether === 'void' || world.end === 'void')) {
    report(
      'warning',
      'games.world-setup.preset-dimensions',
      world.end === 'void' ? '/world/end' : '/world/nether',
      'A void Nether or End is not applied to a world preset of your own: its own dimensions are kept. Change them in the preset.',
    );
  } else {
    if (world.end === 'void') {
      report(
        'warning',
        'games.world-setup.void-end',
        '/world/end',
        'Players reach a void End only through an End portal frame in the start structure. Leave at least one eye of ender out of the frame: a frame filled in a structure does not light.',
      );
    }
    if (world.nether === 'void') {
      report(
        'info',
        'games.world-setup.void-nether',
        '/world/nether',
        'Players reach a void Nether through a Nether portal they build; the game builds the way back on a small obsidian platform.',
      );
    }
  }
  if (type === 'flat' && (!Array.isArray(world.layers) || world.layers.length === 0)) {
    report(
      'warning',
      'games.world-setup.flat-without-layers',
      '/world/layers',
      'A flat world with no layers is empty sky. Add layers, or choose the type "void".',
    );
  }

  // The start structure.
  const start = isObject(data.start) ? data.start : undefined;
  if (start === undefined && (type === 'void' || type === 'sky_islands')) {
    report(
      'warning',
      'games.world-setup.no-start',
      '/world/type',
      'New players start in the air and fall: add a start structure for them to stand on.',
    );
  }
  if (start !== undefined && typeof start.structure === 'string') {
    const structure = start.structure;
    const size = templateSize(elements, structure);
    const known = size !== undefined || input.registry.has('structure', structure);
    if (!known) {
      report(
        'error',
        'games.world-setup.start-missing',
        '/start/structure',
        `The start structure ${structure} is not in the project. Make it in the Structure Studio or pick another.`,
      );
    }
    const when = start.when === 'world_generation' ? 'world_generation' : 'first_join';
    const at = isPos(start.at) ? start.at : [0, 64, 0];
    if (size !== undefined && isPos(start.spawn)) {
      const [x, y, z] = start.spawn as [number, number, number];
      const inside =
        x >= 0 &&
        z >= 0 &&
        y >= 0 &&
        x < (size[0] ?? 0) &&
        z < (size[2] ?? 0) &&
        y <= (size[1] ?? 0);
      if (!inside) {
        report(
          'error',
          'games.world-setup.spawn-outside',
          '/start/spawn',
          `The spawn ${start.spawn.join(' ')} is outside the start structure, which is ${size.join(' by ')} blocks. Put it on the structure, counted from its corner.`,
        );
      }
    }
    if (when === 'first_join' && size !== undefined) {
      if ((size[0] ?? 0) > START_AREA || (size[2] ?? 0) > START_AREA) {
        report(
          'error',
          'games.world-setup.start-too-large',
          '/start/structure',
          `The start structure is ${size.join(' by ')} blocks; at the first join at most ${START_AREA} by ${START_AREA} is placed. Make a larger start of jigsaw pieces, or place it while the world generates.`,
        );
      }
    }
    if (when === 'world_generation') {
      if (!(input.target.worlds?.structurePlacements.includes(DIMENSION_ORIGIN) ?? false)) {
        report(
          'error',
          'games.world-setup.no-origin-placement',
          '/start/when',
          `Minecraft ${input.target.mcVersion} cannot place a structure while the world generates this way. Place it at the first join.`,
        );
      }
      report(
        'warning',
        'games.world-setup.start-turned',
        '/start/when',
        `${at[0] !== 0 || at[2] !== 0 ? 'The game places the start at x 0, z 0, not at the corner given. ' : ''}It turns the start at random about x 0, z 0, so keep the spawn near the middle, and places nothing when "Generate structures" is off.`,
      );
    }
  }

  // Game rules.
  if (isObject(data.game_rules)) {
    const vanilla = input.target.gameRules?.vanillaNames;
    const projectRules = new Set<string>(
      elements.filter((entry) => entry.kind === GAME_RULE).map((entry) => entry.id),
    );
    for (const name of Object.keys(data.game_rules)) {
      const path = `/game_rules/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      if (isVanillaRuleName(name)) {
        if (vanilla !== undefined && !vanilla.includes(bareVanilla(name))) {
          report(
            'error',
            'games.world-setup.unknown-game-rule',
            path,
            `Minecraft ${input.target.mcVersion} has no game rule ${bareVanilla(name)}.`,
          );
        }
      } else if (projectRules.has(name)) {
        report(
          'warning',
          'games.world-setup.project-game-rule',
          path,
          `The game rule ${name} is your own and needs the Fabric mod jar, so the world setup's data pack does not set it. Set it with a rule ("Set a game rule") instead.`,
        );
      } else {
        report(
          'error',
          'games.world-setup.unknown-game-rule',
          path,
          `There is no game rule ${name}: not a vanilla rule and not one of the project's.`,
        );
      }
    }
  }

  // The kit.
  const kit = isObject(data.new_player) ? data.new_player : undefined;
  if (
    kit !== undefined &&
    Array.isArray(kit.items) &&
    kit.items.length > 0 &&
    kit.loot_table !== undefined
  ) {
    report(
      'error',
      'games.world-setup.kit-both',
      '/new_player/loot_table',
      'Give new players either a list of items or a loot table, not both.',
    );
  }
  return problems;
}

/** The world setup checks. */
export const worldSetupValidator: ProjectValidator = {
  id: 'msm.games.world-setup',
  kinds: [WORLD_SETUP, STRUCTURE_TEMPLATE, GAME_RULE],
  validate(input) {
    const elements = input.elements;
    const setups = elements.filter((element) => element.kind === WORLD_SETUP);
    const problems: Problem[] = [];
    if (setups.length > 1) {
      for (const setup of setups.slice(1)) {
        problems.push({
          severity: 'error',
          code: 'games.world-setup.one-per-project',
          message: `A project has one world setup; ${setups[0]?.id} is the first. Remove this one or merge it into that one.`,
          elementId: setup.id,
          path: '',
        });
      }
    }
    for (const setup of setups) problems.push(...checkWorldSetup(setup, elements, input));
    return problems;
  },
};

/** Project functions under `<ns>:msm_games/`, where the games plugin writes its own. */
export const generatedPathValidator: ProjectValidator = {
  id: 'msm.games.generated-path',
  kinds: [FUNCTION],
  validate: ({ elements }) =>
    elements
      .filter(
        (element) =>
          element.kind === FUNCTION &&
          element.id.slice(element.id.indexOf(':') + 1).startsWith(`${GAMES_FUNCTION_ROOT}/`),
      )
      .map(
        (element): Problem => ({
          severity: 'error',
          code: 'games.generated-path',
          message: `Functions under ${GAMES_FUNCTION_ROOT}/ are made by MSM's game kits. Give this function another name.`,
          elementId: element.id,
          path: '',
        }),
      ),
};

/** The validators of `msm:world_setup`, in order. */
export const worldSetupValidators: readonly ProjectValidator[] = Object.freeze([
  worldSetupValidator,
  generatedPathValidator,
]);
