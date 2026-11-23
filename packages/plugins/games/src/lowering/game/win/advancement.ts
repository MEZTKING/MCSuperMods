/**
 * The win condition `advancement` (ADR 0132 D2; B724, the spike's K8): the first player still in
 * (of a role, if the condition names one) to have the advancement wins, read by the selector's
 * `advancements` filter. The advancement is taken back from every player when a round starts, so
 * one got in an earlier round does not count.
 */
import type { JsonObject } from '@msm/plugin-api';
import type { GameBuild } from '../build';
import { endIfWinners, NO_WIN, tagWinners, type WinLowering } from './shared';

const RESOURCE = /^(?:[a-z0-9_.-]+:)?[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

export function lowerAdvancementWin(
  build: GameBuild,
  win: JsonObject,
  _index: number,
): WinLowering {
  const { game, names } = build;
  const advancement = win.advancement;
  if (typeof advancement !== 'string' || !RESOURCE.test(advancement)) return NO_WIN;
  const role = typeof win.role === 'string' ? win.role : undefined;
  if (role !== undefined && !game.roles.some((entry) => entry.id === role)) return NO_WIN;
  const id = advancement.includes(':') ? advancement : `minecraft:${advancement}`;
  const who = `tag=${names.tag('in')}${role === undefined ? '' : `,tag=${names.roleTag(role)}`}`;
  return {
    check: [tagWinners(build, `@a[${who},advancements={${id}=true}]`), endIfWinners(build)],
    files: [],
    begin: [build.form('advancement_revoke_only', { players: '@a', advancement: id })],
    end: [],
  };
}
