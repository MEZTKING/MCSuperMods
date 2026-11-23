/**
 * The mechanic `head_start` of `msm:game` (ADR 0132 D2; B725, the spike's K9): the players of one
 * role are held still for some seconds when a round starts while the others get away. K9 chose
 * attribute modifiers, the kindest and cheapest way (nothing runs per tick, nothing is built in
 * the world): `minecraft:movement_speed` and `minecraft:jump_strength` with a modifier of `-1`
 * `add_multiplied_total` read 0, and the camera still turns; blindness is optional. Under
 * `<ns>:msm_games/game/<path>/head_start/`:
 *
 * - `start` (hook `started`): the seconds on `#<path>.head_start`, and `hold` as each held player;
 * - `hold` (as a player): the two modifiers, blindness, and the tag `held`;
 * - `second` (hook `second`) and `count`: the seconds counted down on the held players' action
 *   bar, then `release`;
 * - `respawned` (hook `player_respawned`): a held player who died during the head start is held
 *   again;
 * - `release` and `free`: the modifiers and blindness taken off;
 * - `reset` (hooks `starting`, `ended`, `stopped`): anyone still held is freed (K9: the modifier
 *   is the one thing left behind when a round is stopped).
 *
 * Whether movement really stops on the player's screen is an in-game check (K9: the stand-ins
 * had no client; attributes are sent to the client).
 */
import type { OutputFile } from '@msm/plugin-api';
import { bool, num, str } from '../../shared-functions';
import { readGame } from '../names';
import type { MechanicLowering } from './index';
import { addGameIds, IdList, type MechanicIds, mechanicBuild, namesOf } from './kill-pair';

/** The attributes a held player has a modifier on (K9). */
export const HELD_ATTRIBUTES = Object.freeze([
  'minecraft:movement_speed',
  'minecraft:jump_strength',
]);

/** Lowers the `head_start` mechanic; nothing when its role is not one of the game's. */
export const lowerHeadStart: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = mechanicBuild(context);
  const { names, form } = build;
  const role = build.game.roles.find((entry) => entry.id === str(mechanic.held, ''));
  if (role === undefined) return [];
  const seconds = Math.min(600, Math.max(1, Math.trunc(num(mechanic.seconds, 30))));
  const blind = bool(mechanic.blind, false);
  const fn = (name: string): string => `head_start/${name}`;
  const run = (name: string): string => build.run(fn(name));
  const held = `@a[tag=${names.roleTag(role.id)},tag=${names.tag('in')}]`;
  const heldTag = names.tag('held');
  const modifier = names.fn('head_start');
  const holder = 'head_start';

  const start = [
    build.setHolder(holder, seconds),
    form('as_run', { entities: held, command: run('hold') }),
    build.tell('@a', {
      text: `${role.name}: wait ${seconds === 1 ? 'a second' : `${seconds} seconds`} while the others get away.`,
    }),
  ];
  const hold = [
    ...HELD_ATTRIBUTES.map((attribute) =>
      form('attribute_modifier_add', {
        entity: '@s',
        attribute,
        modifier,
        amount: -1,
        operation: 'add_multiplied_total',
      }),
    ),
    ...(blind
      ? [
          form('effect_give', {
            entities: '@s',
            effect: 'minecraft:blindness',
            seconds,
            amplifier: 0,
            hide_particles: true,
          }),
        ]
      : []),
    form('tag_add', { entities: '@s', tag: heldTag }),
  ];
  const second = [build.ifHolder(holder, '1..', run('count'))];
  const count = [
    form('score_remove', {
      holders: names.holder(holder),
      objective: names.objective,
      score: 1,
    }),
    build.ifHolder(
      holder,
      '1..',
      form('actionbar', {
        players: held,
        text: JSON.stringify([
          { text: 'You can move in ' },
          { score: { name: names.holder(holder), objective: names.objective } },
          { text: ' s' },
        ]),
      }),
    ),
    build.ifHolder(holder, '..0', run('release')),
  ];
  const release = [
    form('as_run', { entities: `@a[tag=${heldTag}]`, command: run('free') }),
    build.tell('@a', { text: `Go! ${role.name} can move.` }),
  ];
  const free = [
    ...HELD_ATTRIBUTES.map((attribute) =>
      form('attribute_modifier_remove', { entity: '@s', attribute, modifier }),
    ),
    ...(blind ? [form('effect_clear', { entities: '@s', effect: 'minecraft:blindness' })] : []),
    form('tag_remove', { entities: '@s', tag: heldTag }),
  ];
  const respawned = [
    build.ifHolder(
      holder,
      '1..',
      form('if_entity_run', {
        entities: `@s[tag=${names.roleTag(role.id)},tag=${names.tag('in')}]`,
        command: run('hold'),
      }),
    ),
  ];
  const reset = [
    build.setHolder(holder, 0),
    form('as_run', { entities: `@a[tag=${heldTag}]`, command: run('free') }),
  ];

  return [
    build.file(fn('start'), start),
    build.onHook('started', fn('start')),
    build.file(fn('hold'), hold),
    build.file(fn('second'), second),
    build.onHook('second', fn('second')),
    build.file(fn('count'), count),
    build.file(fn('release'), release),
    build.file(fn('free'), free),
    build.file(fn('respawned'), respawned),
    build.onHook('player_respawned', fn('respawned')),
    build.file(fn('reset'), reset),
    build.onHook('starting', fn('reset')),
    build.onHook('ended', fn('reset')),
    build.onHook('stopped', fn('reset')),
  ];
};

/** The ids the `head_start` mechanic of a game writes. */
export const headStartGeneratedIds: MechanicIds = (mechanic, element) => {
  const names = namesOf(element);
  const held = str(mechanic.held, '');
  if (!readGame(element).roles.some((role) => role.id === held)) return {};
  return addGameIds(
    new IdList(),
    names,
    ['start', 'hold', 'second', 'count', 'release', 'free', 'respawned', 'reset'].map(
      (name) => `head_start/${name}`,
    ),
    ['started', 'second', 'player_respawned', 'starting', 'ended', 'stopped'],
  )
    .add('tag', names.tag('held'))
    .done();
};
