/**
 * A new player's first join (ADR 0113 D2; B547 Y4): the advancement
 * `<ns>:msm_games/first_join` on the target's first-join criterion (`target.worlds`, the vanilla
 * `minecraft:tick` pattern) with the reward function `<ns>:msm_games/world_setup/first_join`.
 * The reward runs once per player, as the player, on their first tick after being placed, and
 * never again after death, respawn or leaving (a map copied without its players gives it again;
 * the world flag keeps the start from being placed twice).
 *
 * The function places the start the first time (the start function, behind the world flag),
 * sets the player's game mode, gives the kit (`items`, each into its slot or the first free
 * one, or a `loot_table` rolled into the inventory), the effects, the message, a line naming
 * the goals, and opens the dialog.
 */
import type { JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { fillForm, functionFile, textComponent } from './shared-functions';
import { START_FLAG } from './start';
import { dataFile, type WorldSetup, type WorldSetupNames, worldFacts } from './world-setup-files';

/** The text naming the goals: the advancements key, as the player has bound it. */
const GOALS_TEXT =
  '{text:"Your goals are on the Advancements screen (",extra:[{keybind:"key.advancements"},")."]}';

/** The lines of the first-join function. */
function firstJoinLines(setup: WorldSetup, names: WorldSetupNames, target: TargetFacts): string[] {
  const lines = ["# A new player's first join: runs once per player, as the player."];
  if (setup.start !== undefined) {
    lines.push(
      fillForm(target, 'unless_storage_run', {
        storage: names.storage,
        nbt_path: `{${START_FLAG}:1b}`,
        command: fillForm(target, 'run_function', { function: names.fn('start') }),
      }),
    );
  }
  lines.push(fillForm(target, 'game_mode', { game_mode: setup.gameMode, players: '@s' }));
  const kit = setup.newPlayer;
  if (kit !== undefined) {
    for (const entry of kit.items ?? []) {
      lines.push(
        entry.slot === undefined || entry.slot === ''
          ? fillForm(target, 'give', { players: '@s', item: entry.item, count: entry.count })
          : fillForm(target, 'item_replace_entity', {
              entities: '@s',
              item_slot: entry.slot,
              item: entry.item,
              count: entry.count,
            }),
      );
    }
    if (kit.loot_table !== undefined && (kit.items ?? []).length === 0) {
      lines.push(fillForm(target, 'loot_give', { players: '@s', loot_table: kit.loot_table }));
    }
    for (const effect of kit.effects ?? []) {
      lines.push(
        fillForm(target, 'effect_give', {
          entities: '@s',
          effect: effect.effect,
          seconds: effect.seconds,
          amplifier: effect.amplifier ?? 0,
          hide_particles: effect.hide_particles === true,
        }),
      );
    }
    if (kit.message !== undefined && kit.message !== '') {
      lines.push(fillForm(target, 'tellraw', { players: '@s', text: textComponent(kit.message) }));
    }
  }
  if (setup.goals !== undefined) {
    lines.push(fillForm(target, 'tellraw', { players: '@s', text: GOALS_TEXT }));
  }
  if (kit?.dialog !== undefined) {
    lines.push(fillForm(target, 'dialog_show', { players: '@s', dialog: kit.dialog }));
  }
  return lines;
}

/** The first-join advancement and its reward function. */
export function lowerFirstJoin(
  setup: WorldSetup,
  names: WorldSetupNames,
  target: TargetFacts,
): OutputFile[] {
  const advancement: JsonObject = {
    criteria: { first_join: { trigger: worldFacts(target).firstJoinCriterion } },
    rewards: { function: names.fn('first_join') },
  };
  return [
    dataFile(target.folders.data.advancement, names.firstJoin, advancement, 'resource:advancement'),
    functionFile(
      target,
      names.namespace,
      names.fnPath('first_join'),
      firstJoinLines(setup, names, target),
    ),
  ];
}
