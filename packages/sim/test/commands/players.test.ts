/**
 * `team`, `spawnpoint` and `advancement` in Try it (the forms B557's game flows write into
 * project functions): each form against the area, the game's answers and its errors for a wrong
 * target, a missing team, a missing advancement or criterion, `team=` in selectors, and reward
 * functions run as the game runs them.
 */
import { describe, expect, it } from 'vitest';
import { type CatalogueTarget, LocalWorldSource, lineSupport } from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';
import { mobFiles } from '../entities/helpers.js';

const TARGET = {
  ...FAKE_TARGET,
  folders: {
    ...FAKE_TARGET.folders,
    data: {
      tags: 'tags',
      function: 'function',
      predicate: 'predicate',
      advancement: 'advancement',
    },
  },
  commands: { vanillaNames: ['give', 'say', 'team'], argumentTypes: {} },
} as unknown as CatalogueTarget;

function fn(path: string, lines: readonly string[]): [string, string] {
  return [`data/fx/function/${path}.mcfunction`, `${lines.join('\n')}\n`];
}

function adv(path: string, data: object): [string, string] {
  return [`data/fx/advancement/${path}.json`, JSON.stringify(data)];
}

function area(extra: readonly [string, string][] = []) {
  const files = new Map<string, string>([...testFiles(), ...mobFiles(), ...extra]);
  const source = new LocalWorldSource({ files, target: TARGET, seed: 3, logLimit: 100_000 });
  return {
    source,
    lines: () => source.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text),
    only: () => source.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text),
  };
}

const run = (source: LocalWorldSource, line: string) => source.chat(line);

describe('team', () => {
  it('adds, modifies, lists and removes teams', () => {
    const { source, only } = area();
    const { state } = source.functions;
    expect(run(source, '/team add fx.red {"text":"Red"}').answer).toEqual(['Created team [Red].']);
    expect(run(source, '/team add fx.red').answer).toEqual(['A team already exists by that name']);
    expect(run(source, '/team add fx.blue').result).toBe('ran');
    expect(run(source, '/team modify fx.red color red').answer).toEqual([
      'Updated the color for team [Red] to red.',
    ]);
    expect(run(source, '/team modify fx.red color red').answer).toEqual([
      'Nothing changed. That team already has that color',
    ]);
    expect(run(source, '/team modify fx.red color pink').result).toBe('error');
    run(source, '/team modify fx.red prefix "[R] "');
    run(source, '/team modify fx.red suffix {"text":"!"}');
    expect(run(source, '/team modify fx.red friendlyFire false').answer).toEqual([
      'Disabled friendly fire for team [Red].',
    ]);
    expect(run(source, '/team modify fx.red friendlyFire false').answer).toEqual([
      'Nothing changed. Friendly fire is already disabled for that team',
    ]);
    expect(run(source, '/team modify fx.red seeFriendlyInvisibles false').answer).toEqual([
      'Updated team [Red] to no longer see invisible teammates.',
    ]);
    expect(run(source, '/team modify fx.red nametagVisibility hideForOtherTeams').answer).toEqual([
      'Nametag visibility for team [Red] is now "hideForOtherTeams".',
    ]);
    expect(run(source, '/team modify fx.red deathMessageVisibility never').result).toBe('ran');
    expect(run(source, '/team modify fx.red collisionRule pushOwnTeam').answer).toEqual([
      'Collision rule for team [Red] is now "pushOwnTeam".',
    ]);
    expect(run(source, '/team modify fx.red collisionRule sideways').result).toBe('error');
    expect(run(source, '/team modify fx.red displayName "Reds"').answer).toEqual([
      'Updated the name of team [Reds].',
    ]);
    expect(state.teams.get('fx.red')).toMatchObject({
      displayName: 'Reds',
      colour: 'red',
      prefix: '[R] ',
      suffix: '!',
      friendlyFire: false,
      seeFriendlyInvisibles: false,
      nametagVisibility: 'hideForOtherTeams',
      deathMessageVisibility: 'never',
      collisionRule: 'pushOwnTeam',
    });
    expect(only().some((line) => line.includes('friendly fire'))).toBe(true);
    expect(run(source, '/team list').answer).toEqual(['There are 2 teams: [Reds], [fx.blue]']);
    expect(run(source, '/team list fx.red').answer).toEqual([
      'There are no members on team [Reds].',
    ]);
    expect(run(source, '/team remove fx.blue').answer).toEqual(['Removed team [fx.blue].']);
    expect(run(source, '/team remove fx.blue').answer).toEqual(["Unknown team 'fx.blue'"]);
    expect(run(source, '/team modify fx.green color red').answer).toEqual([
      "Unknown team 'fx.green'",
    ]);
  });

  it('joins, leaves and empties, and selectors find by team=', () => {
    const { source } = area();
    const { state } = source.functions;
    run(source, '/team add fx.red');
    run(source, '/team add fx.blue');
    expect(run(source, '/team join fx.green @s').answer).toEqual(["Unknown team 'fx.green'"]);
    // Nobody without a team: the game's error for an empty selector.
    expect(run(source, '/team join fx.red @r[team=]').answer).toEqual([
      'Added Player to team [fx.red].',
    ]);
    expect(state.teamOf.get('Player')).toBe('fx.red');
    expect(run(source, '/team join fx.blue @r[team=]').answer).toEqual(['No entity was found']);
    expect(run(source, '/say @a[team=fx.red]').answer).toEqual(['[Player] Player']);
    expect(run(source, '/say @a[team=!fx.red]').answer).toEqual(['[Player] ']);
    expect(run(source, '/say @a[team=!]').answer).toEqual(['[Player] Player']);
    // `*` is every holder the scoreboard knows (one argument takes one name or selector).
    expect(run(source, '/team join fx.blue #holder bob').result).toBe('error');
    run(source, '/scoreboard objectives add fx.s dummy');
    run(source, '/scoreboard players set #holder fx.s 1');
    run(source, '/scoreboard players set bob fx.s 2');
    expect(run(source, '/team join fx.blue *').answer).toEqual([
      'Added 2 members to team [fx.blue].',
    ]);
    expect(run(source, '/team list fx.blue').answer).toEqual([
      'Team [fx.blue] has 2 members: #holder, bob',
    ]);
    // Without members, the command's own entity joins.
    run(source, '/team join fx.blue');
    expect(state.teamOf.get('Player')).toBe('fx.blue');
    expect(run(source, '/team leave @a').answer).toEqual(['Removed Player from any team.']);
    expect(state.teamOf.has('Player')).toBe(false);
    expect(run(source, '/team empty fx.blue').answer).toEqual([
      'Removed 2 members from team [fx.blue].',
    ]);
    expect(run(source, '/team empty fx.blue').answer).toEqual([
      'Nothing changed. That team is already empty',
    ]);
    run(source, '/team join fx.red @s');
    run(source, '/team remove fx.red');
    expect(state.teamOf.has('Player')).toBe(false);
  });

  it('needs an entity for a bare join from the server, and Clear the area forgets teams', () => {
    const { source } = area([fn('join', ['team join fx.red'])]);
    run(source, '/team add fx.red');
    const server = source.functions.runFunction('fx:join', { as: null });
    expect(server.answer).toEqual(['An entity is required to run this command here']);
    source.clear();
    expect(source.functions.state.teams.size).toBe(0);
  });
});

describe('spawnpoint', () => {
  it('keeps the point per player and says it in What happened', () => {
    const { source, lines, only } = area();
    source.player.teleport({ x: 10.5, y: 2, z: 12.5 });
    const answer = run(source, '/spawnpoint @s ~ ~ ~');
    expect(answer.answer).toEqual([
      'Set spawn point to 10, 2, 12 [0, 0] in minecraft:overworld for Player.',
    ]);
    expect(lines()).toContain(answer.answer[0]);
    expect(only().some((line) => line.includes('never dies'))).toBe(true);
    expect(source.functions.state.spawnPoints.get('Player')).toEqual({
      pos: { x: 10, y: 2, z: 12 },
      yaw: 0,
      pitch: 0,
      dimension: 'minecraft:overworld',
    });
    run(source, '/spawnpoint Player 4 1 5 90 -10');
    expect(source.functions.state.spawnPoints.get('Player')).toMatchObject({
      pos: { x: 4, y: 1, z: 5 },
      yaw: 90,
      pitch: -10,
    });
    expect(run(source, '/spawnpoint').result).toBe('ran');
  });

  it('refuses entities and a missing player as the game does', () => {
    const { source } = area([fn('spawn', ['spawnpoint'])]);
    expect(run(source, '/spawnpoint @e[type=zoo:cow]').answer[0]).toContain('Only players');
    expect(run(source, '/spawnpoint Somebody').answer).toEqual(['No player was found']);
    expect(source.functions.runFunction('fx:spawn', { as: null }).answer).toEqual([
      'A player is required to run this command here',
    ]);
    expect(source.functions.state.spawnPoints.size).toBe(0);
  });
});

describe('advancement', () => {
  const ROOT = adv('root', {
    display: { title: 'Start', icon: { id: 'minecraft:stone' }, description: '' },
    criteria: { tick: { trigger: 'minecraft:tick' } },
  });
  const MIDDLE = adv('middle', {
    parent: 'fx:root',
    display: { title: { text: 'Middle' }, frame: 'goal', icon: { id: 'minecraft:stone' } },
    criteria: { a: { trigger: 'minecraft:impossible' }, b: { trigger: 'minecraft:impossible' } },
    rewards: { function: 'fx:reward', experience: 10 },
  });
  const LEAF = adv('middle/leaf', {
    parent: 'fx:middle',
    criteria: { x: { trigger: 'minecraft:impossible' }, y: { trigger: 'minecraft:impossible' } },
    requirements: [['x', 'y']],
  });
  const OTHER = adv('other', { criteria: { z: { trigger: 'minecraft:impossible' } } });
  const files = (): [string, string][] => [
    ROOT,
    MIDDLE,
    LEAF,
    OTHER,
    fn('reward', [
      'scoreboard objectives add fx.rewards dummy',
      'scoreboard players add @s fx.rewards 1',
    ]),
  ];

  it('grants and revokes only one, with its criteria, and runs the reward function once', () => {
    const { source, lines, only } = area(files());
    const { state } = source.functions;
    const grant = run(source, '/advancement grant @s only fx:middle');
    expect(grant.answer).toContain('Granted the advancement [Middle] to Player.');
    expect(grant.answer).toContain('Player has reached the goal [Middle]');
    expect(lines()).toContain('Player has reached the goal [Middle]');
    expect(state.score('Player', 'fx.rewards')).toBe(1);
    expect(only().some((line) => line.includes('10 experience'))).toBe(true);
    expect(run(source, '/advancement grant @s only fx:middle').answer).toEqual([
      "Couldn't grant advancement [Middle] to Player as they already have it",
    ]);
    expect(run(source, '/advancement revoke @s only fx:middle a').answer).toEqual([
      "Revoked criterion 'a' of advancement [Middle] from Player.",
    ]);
    expect(run(source, '/advancement revoke @s only fx:middle a').answer).toEqual([
      "Couldn't revoke criterion 'a' of advancement [Middle] from Player as they don't have it",
    ]);
    // Granting the last criterion finishes it again and gives the reward again.
    expect(run(source, '/advancement grant @s only fx:middle a').answer).toContain(
      "Granted criterion 'a' of advancement [Middle] to Player.",
    );
    expect(state.score('Player', 'fx.rewards')).toBe(2);
    expect(run(source, '/advancement grant @s only fx:middle c').answer).toEqual([
      "The advancement fx:middle does not contain the criterion 'c'",
    ]);
    expect(run(source, '/advancement revoke @s only fx:middle').answer).toEqual([
      'Revoked the advancement [Middle] from Player.',
    ]);
    expect(state.advancements.get('Player')?.has('fx:middle')).toBe(false);
  });

  it('follows the tree: until, from, through and everything', () => {
    const { source } = area(files());
    const { state } = source.functions;
    const done = () => [...(state.advancements.get('Player')?.keys() ?? [])].sort();
    expect(run(source, '/advancement grant @s until fx:middle/leaf').answer).toContain(
      'Granted 3 advancements to Player.',
    );
    expect(done()).toEqual(['fx:middle', 'fx:middle/leaf', 'fx:root']);
    expect(run(source, '/advancement revoke @s from fx:middle').answer[0]).toBe(
      'Revoked 2 advancements from Player.',
    );
    expect(done()).toEqual(['fx:root']);
    run(source, '/advancement grant @s through fx:middle');
    expect(done()).toEqual(['fx:middle', 'fx:middle/leaf', 'fx:root']);
    expect(run(source, '/advancement grant @s everything').answer).toContain(
      'Granted 4 advancements to Player.',
    );
    expect(run(source, '/advancement grant @s everything').answer).toEqual([
      "Couldn't grant 4 advancements to Player as they already have them",
    ]);
    run(source, '/advancement revoke @s everything');
    expect(done()).toEqual([]);
  });

  it('names a missing advancement, a wrong target and Minecraft’s own', () => {
    const { source, only } = area(files());
    expect(run(source, '/advancement grant @s only fx:missing').answer).toEqual([
      'Unknown advancement: fx:missing',
    ]);
    expect(run(source, '/advancement grant @e[type=zoo:cow] only fx:root').answer[0]).toContain(
      'Only players',
    );
    expect(run(source, '/advancement grant Somebody only fx:root').answer).toEqual([
      'No player was found',
    ]);
    run(source, '/advancement grant @s only minecraft:story/root');
    expect(only().some((line) => line.includes('minecraft:story/root'))).toBe(true);
    expect(run(source, '/advancement give @s only fx:root').result).toBe('error');
  });

  it('runs a race line’s reward that revokes its own advancement (the Race flow)', () => {
    const { source } = area([
      adv('lines/start', {
        criteria: { in: { trigger: 'minecraft:location' } },
        rewards: { function: 'fx:start' },
      }),
      fn('start', [
        'scoreboard objectives add fx.clock dummy',
        'scoreboard players set @s fx.clock 0',
        'advancement revoke @s only fx:lines/start',
      ]),
    ]);
    run(source, '/advancement grant @s only fx:lines/start');
    expect(source.functions.state.score('Player', 'fx.clock')).toBe(0);
    expect(source.functions.state.advancements.get('Player')?.has('fx:lines/start')).toBe(false);
    // Revoked, so the line can be crossed again.
    expect(run(source, '/advancement grant @s only fx:lines/start').result).toBe('ran');
  });
});

describe('the forms of the library', () => {
  it('reads the lines the game flows write', () => {
    for (const line of [
      'team join msm_starter.arena.red @r[team=]',
      'team leave @a',
      'spawnpoint @s ~ ~ ~',
      'advancement revoke @s only msm_starter:sky_sprint/lines/start',
      'team add fx.x {"text":"X"}',
      'team modify fx.x color dark_aqua',
      'team list',
      'advancement grant @a everything',
    ]) {
      expect(lineSupport(line), line).toMatchObject({ runs: true });
    }
    expect(lineSupport('team modify fx.x color pink')).toMatchObject({
      runs: false,
      why: "Unknown color 'pink'",
    });
  });
});
