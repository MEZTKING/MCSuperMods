/**
 * The win condition `role_dies` (ADR 0132 D2; B724, the spike's K8): the round ends when every
 * player of a role is down, and the players of the winning role win (a hunt: the runner dies,
 * the hunters win). A player of the role is down once they are out of the round; in a game
 * without the `elimination` mechanic a death also counts (the runner of a hunt has one life),
 * read from the round's own death count (`<ns>.msm_died`). A round dealt no player of the role
 * never ends this way.
 */
import type { JsonObject } from '@msm/plugin-api';
import type { GameBuild } from '../build';
import { NO_WIN, tagWinners, type WinLowering } from './shared';

export function lowerRoleDiesWin(build: GameBuild, win: JsonObject, index: number): WinLowering {
  const { game, names } = build;
  const roleIds = new Set(game.roles.map((role) => role.id));
  const role = win.role;
  const winner = win.winner;
  if (typeof role !== 'string' || typeof winner !== 'string') return NO_WIN;
  if (!roleIds.has(role) || !roleIds.has(winner)) return NO_WIN;
  const objective = names.objective;
  const oneLife = !game.mechanics.some((mechanic) => mechanic.type === 'elimination');
  const standing = `@a[tag=${names.tag('in')},tag=${names.roleTag(role)}${
    oneLife ? `,scores={${names.died}=0}` : ''
  }]`;
  const check = [
    ...build.count('alive', standing),
    ...build.count('count', `@a[tag=${names.tag('player')},tag=${names.roleTag(role)}]`),
    build.form('if_score_if_score_run', {
      holder: names.holder('count'),
      objective,
      range: '1..',
      holder_2: names.holder('alive'),
      objective_2: objective,
      range_2: '..0',
      command: build.run(`win/${index}/won`),
    }),
  ];
  const won = [
    tagWinners(build, `@a[tag=${names.tag('player')},tag=${names.roleTag(winner)}]`),
    build.run('end'),
  ];
  return { check, files: [build.file(`win/${index}/won`, won)], begin: [], end: [] };
}
