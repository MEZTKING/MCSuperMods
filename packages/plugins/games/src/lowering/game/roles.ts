/**
 * Lowering of a game's roles (ADR 0132 D1; B724): the roles dealt at random when a round starts.
 * `roles/deal` (run by the round's `begin`) gives each role with a number to that many players
 * still without a role, in the game's order and picked at random (`sort=random`), then the role
 * whose count is `rest` to everyone left. `role/<id>/give` (run as the player) tags them with
 * the role, puts them on the role's team and gives the role's kit; a role with a kit also tags
 * its players `own_kit`, so the `kit_on` mechanic leaves them out, and the round gives the kit
 * again when they respawn (`respawned`). In an endless game a player who joins later gets the
 * `rest` role, if there is one.
 */
import type { OutputFile } from '@msm/plugin-api';
import { type GameBuild, gameBuild } from './build';
import type { GameLoweringContext } from './mechanics/index';
import { type GameRole, kitGiveFunction } from './names';

/** The role every player left over gets, if the game has one. */
export const restRole = (roles: readonly GameRole[]): GameRole | undefined =>
  roles.find((role) => role.count === 'rest');

/** The lines that give a role to the players of `selector`. */
export const giveRoleLines = (build: GameBuild, role: GameRole, selector: string): string =>
  build.form('as_run', { entities: selector, command: build.run(`role/${role.id}/give`) });

/** The line that gives each role's kit again to `@s` when they carry the role (a respawn). */
export function roleKitLines(build: GameBuild): string[] {
  const { names } = build;
  return build.game.roles.flatMap((role) =>
    role.kit === undefined
      ? []
      : [
          build.form('if_entity_run', {
            entities: `@s[tag=${names.tag('in')},tag=${names.roleTag(role.id)}]`,
            command: build.runId(kitGiveFunction(role.kit)),
          }),
        ],
  );
}

/** The files of the game's roles; none for a game without roles. */
export function rolesFiles(context: GameLoweringContext): OutputFile[] {
  const build = gameBuild(context);
  const { game, names } = build;
  if (game.roles.length === 0) return [];
  const without = `tag=${names.tag('in')},tag=!${names.tag('has_role')}`;
  const deal: string[] = [];
  for (const role of game.roles) {
    if (role.count === 'rest') continue;
    deal.push(giveRoleLines(build, role, `@a[${without},sort=random,limit=${role.count}]`));
  }
  const rest = restRole(game.roles);
  if (rest !== undefined) deal.push(giveRoleLines(build, rest, `@a[${without}]`));

  const files = [build.file('roles/deal', deal)];
  for (const role of game.roles) {
    const give = [
      build.form('tag_add', { entities: '@s', tag: names.tag('has_role') }),
      build.form('tag_add', { entities: '@s', tag: names.roleTag(role.id) }),
    ];
    if (role.team !== undefined) {
      give.push(build.form('team_join', { team: names.team(role.team), members: '@s' }));
    }
    if (role.kit !== undefined) {
      give.push(
        build.form('tag_add', { entities: '@s', tag: names.tag('own_kit') }),
        build.runId(kitGiveFunction(role.kit)),
      );
    }
    give.push(
      build.form('tellraw', {
        players: '@s',
        text: JSON.stringify([
          { text: 'You are ' },
          { text: role.name, bold: true },
          { text: '.' },
        ]),
      }),
    );
    files.push(build.file(`role/${role.id}/give`, give));
  }
  return files;
}
