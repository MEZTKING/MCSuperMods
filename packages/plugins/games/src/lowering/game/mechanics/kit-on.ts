/**
 * The mechanic `kit_on` of `msm:game` (ADR 0132 D2; B726): which kit a player gets when the round
 * puts them in (`start`) and when they come back after dying (`respawn`). A player whose role has
 * a kit carries the round's `own_kit` tag and gets the role's kit instead (the round gives it
 * when roles are dealt and again at a respawn, B724), so both are left out here; so is a player
 * no longer in the round.
 *
 * Functions under `<ns>:msm_games/game/<path>/kit_on/`: `start` (hook `player_in`) and `respawn`
 * (hook `player_respawned`), each one line running the kit's own `give` function
 * (`<ns>:msm_games/kit/<path>/give`, `../../kit.ts`) as the player.
 */
import type { JsonObject, OutputFile } from '@msm/plugin-api';
import { gameBuild } from '../build';
import { kitGiveFunction, refOrUndefined } from '../names';
import type { MechanicLowering } from './index';
import { addGameIds, IdList, type MechanicIds, namesOf } from './kill-pair';

/** The kits of a `kit_on` mechanic: at the start and at a respawn, either may be absent. */
export function readKitOn(mechanic: JsonObject): { start?: string; respawn?: string } {
  const start = refOrUndefined(mechanic.start);
  const respawn = refOrUndefined(mechanic.respawn);
  return {
    ...(start === undefined ? {} : { start }),
    ...(respawn === undefined ? {} : { respawn }),
  };
}

/** Lowers the `kit_on` mechanic. */
export const lowerKitOn: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = gameBuild(context);
  const { names } = build;
  const kits = readKitOn(mechanic);
  const giveLine = (kit: string): string =>
    build.form('if_entity_run', {
      entities: `@s[tag=${names.tag('in')},tag=!${names.tag('own_kit')}]`,
      command: build.runId(kitGiveFunction(kit)),
    });
  const files: OutputFile[] = [];
  if (kits.start !== undefined) {
    files.push(
      build.file('kit_on/start', [giveLine(kits.start)]),
      build.hookFile('player_in', [names.fn('kit_on/start')]),
    );
  }
  if (kits.respawn !== undefined) {
    files.push(
      build.file('kit_on/respawn', [giveLine(kits.respawn)]),
      build.hookFile('player_respawned', [names.fn('kit_on/respawn')]),
    );
  }
  return files;
};

/** The ids the `kit_on` mechanic writes, for `gamesGeneratedIds`. */
export const kitOnGeneratedIds: MechanicIds = (mechanic, element) => {
  const kits = readKitOn(mechanic);
  const functions: string[] = [];
  const hooks: string[] = [];
  if (kits.start !== undefined) {
    functions.push('kit_on/start');
    hooks.push('player_in');
  }
  if (kits.respawn !== undefined) {
    functions.push('kit_on/respawn');
    hooks.push('player_respawned');
  }
  return addGameIds(new IdList(), namesOf(element), functions, hooks).done();
};
