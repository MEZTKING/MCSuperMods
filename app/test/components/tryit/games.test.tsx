// @vitest-environment happy-dom
/**
 * Try it for games (B558, ADR 0117 D4), the app side: the games grounds in `grounds.ts` (the
 * project's games and buildings, the void and structure grounds, the areas' outline added to the
 * picked block's) and the lazy `GamesPanel` (boss bar, action bar, sidebar, "Your game") over a
 * real `LocalWorldSource` whose scores and tags are set by the game's own commands.
 */
import type { Project } from '@msm/core';
import type { Json } from '@msm/plugin-api';
import { type LocalSourceTarget, LocalWorldSource } from '@msm/sim';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import GamesPanel from '../../../src/renderer/src/tryit/games/GamesPanel';
import {
  describeGround,
  GROUND_CHOICES,
  gamesGroundFor,
  gamesProjectOf,
  groundBuildings,
  projectHasGames,
  voidGroundWords,
  withAreaOutline,
} from '../../../src/renderer/src/tryit/grounds';
import { NS, TARGET } from './tryit-fixture';

afterEach(cleanup);

const element = (kind: string, path: string, data: Json) => ({
  formatVersion: 1,
  id: `${NS}:${path}`,
  kind,
  data,
  meta: { createdAt: '2026-11-23T00:00:00.000Z' },
});

const ISLAND = {
  size: [3, 2, 3],
  palette: ['minecraft:dirt', 'minecraft:grass_block'],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 1, 0],
    [1, 1, 1, 1],
  ],
};

function project(withGames = true): Project {
  const elements = [
    element('minecraft:structure_template', 'island', ISLAND),
    ...(withGames
      ? [
          element('msm:world_setup', 'skyblock', {
            world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
            start: { structure: `${NS}:island`, at: [0, 64, 0], spawn: [1, 2, 1] },
            game_mode: 'adventure',
            difficulty: 'normal',
            game_rules: {},
          }),
          element('msm:timer', 'round', {
            name: 'Round',
            seconds: 60,
            count: 'down',
            show: 'boss_bar',
            colour: 'red',
            repeat: false,
            starts: 'manual',
          }),
          element('msm:timer', 'race', {
            seconds: 60,
            count: 'up',
            show: 'action_bar',
            colour: 'white',
            repeat: false,
            starts: 'manual',
          }),
          element('msm:team', 'blue', {
            name: 'Blue',
            colour: 'blue',
            friendly_fire: false,
            see_invisible_friends: true,
            name_tags: 'always',
            collision: 'always',
            prefix: '[B] ',
          }),
          element('msm:objective', 'points', {
            criterion: 'dummy',
            name: 'Points',
            display: 'sidebar',
            render: 'integer',
          }),
          element('msm:area', 'home', {
            name: 'Home',
            dimension: 'minecraft:overworld',
            from: [0, 64, 0],
            to: [2, 66, 2],
            reset: { structures: [{ structure: `${NS}:island`, at: [0, 64, 0] }] },
          }),
        ]
      : []),
  ];
  return {
    formatVersion: 1,
    name: 'Games',
    namespaces: [{ name: NS, elements, assets: [] }],
    targets: [TARGET.id],
    plugins: ['msm.games', 'msm.structures'],
    settings: {},
  } as unknown as Project;
}

describe('the games grounds in the picker', () => {
  it('are the last two grounds, in plain words', () => {
    expect(GROUND_CHOICES.slice(-2).map((choice) => [choice.kind, choice.label])).toEqual([
      ['void', 'Empty sky'],
      ['structure', 'One of my buildings'],
    ]);
    for (const choice of GROUND_CHOICES) expect(forbiddenIn(choice.line)).toEqual([]);
    expect(describeGround({ kind: 'void' })).toBe('Empty sky');
    expect(describeGround({ kind: 'structure', structure: `${NS}:island` })).toBe('Island');
  });

  it('read the project’s games and buildings', () => {
    expect(projectHasGames(project())).toBe(true);
    expect(projectHasGames(project(false))).toBe(false);
    const games = gamesProjectOf(project());
    expect(games.elements.map((one) => one.kind)).toContain('msm:world_setup');
    expect([...games.templates.keys()]).toEqual([`${NS}:island`]);
    expect(groundBuildings(games)).toEqual([{ id: `${NS}:island`, label: 'Island' }]);
    expect(voidGroundWords(games)).toContain('start island');
    expect(voidGroundWords(gamesProjectOf(project(false)))).toContain('no world setup');
  });

  it('make the void and structure grounds, or say why not', () => {
    const games = gamesProjectOf(project());
    const made = gamesGroundFor({ kind: 'void' }, games);
    if (typeof made === 'string') throw new Error(made);
    expect(made.plan.join?.gameMode).toBe('adventure');
    expect(made.ground.placedAt).not.toBeNull();
    const building = gamesGroundFor({ kind: 'structure', structure: `${NS}:island` }, games);
    expect(typeof building).not.toBe('string');
    expect(gamesGroundFor({ kind: 'structure', structure: `${NS}:gone` }, games)).toContain(
      'no longer in your project',
    );
  });

  it('add the areas’ boxes to the picked block’s outline', () => {
    const areas = { pos: { x: 0, y: 0, z: 0 }, boxes: [[1, 2, 3, 4, 5, 6] as const] };
    expect(withAreaOutline(null, null)).toBeNull();
    expect(withAreaOutline(null, areas)).toBe(areas);
    expect(
      withAreaOutline({ pos: { x: 1, y: 1, z: 1 }, boxes: [[0, 0, 0, 1, 1, 1]] }, areas)?.boxes,
    ).toEqual([
      [0, 0, 0, 1, 1, 1],
      [0, 1, 2, 3, 4, 5],
    ]);
  });
});

function voidSource(): LocalWorldSource {
  const files = new Map<string, string>([
    [
      `data/${NS}/function/msm_games/area/home/reset.mcfunction`,
      `place template ${NS}:island 0 64 0\n`,
    ],
  ]);
  const games = gamesProjectOf(project());
  const source = new LocalWorldSource({
    files,
    target: TARGET as unknown as LocalSourceTarget,
    games,
  });
  const made = gamesGroundFor({ kind: 'void' }, games);
  if (typeof made === 'string') throw new Error(made);
  source.games.prepare(made.plan);
  source.loadGround('void', made.ground.ground);
  source.tick();
  return source;
}

describe('the games panel', () => {
  it('draws the boss bar, action bar, sidebar and "Your game" from the scores', async () => {
    const source = voidSource();
    for (const line of [
      `scoreboard objectives add ${NS}.msm_timers dummy`,
      `scoreboard players set #round ${NS}.msm_timers 30`,
      `scoreboard players set #round.on ${NS}.msm_timers 1`,
      `scoreboard players set #race ${NS}.msm_timers 12`,
      `scoreboard players set #race.on ${NS}.msm_timers 1`,
      `scoreboard objectives add ${NS}.points dummy`,
      `scoreboard objectives setdisplay sidebar ${NS}.points`,
      `scoreboard players set @s ${NS}.points 7`,
    ]) {
      source.chat(`/${line}`);
    }
    let changed = 0;
    await act(async () => {
      render(<GamesPanel source={source} project={project()} onChanged={() => (changed += 1)} />);
    });
    expect(screen.getByTestId('tryit-games-bossbar').textContent).toBe('Round');
    expect(screen.getByTestId('tryit-games-actionbar').textContent).toBe('12s');
    expect(screen.getByTestId('tryit-games-sidebar').textContent).toContain('Points');
    expect(screen.getByTestId('tryit-games-sidebar').textContent).toContain('Player7');
    expect((screen.getByTestId('tryit-games-mode') as HTMLSelectElement).value).toBe('adventure');
    // No team exists until the team's load lines run in the engine.
    expect(screen.queryByTestId('tryit-games-team')).toBeNull();
    const panel = screen.getByTestId('tryit-games');
    expect(forbiddenIn(panel.textContent ?? '')).toEqual([]);
  });

  it('follows the engine’s teams: a function’s team join moves the picker, picking runs it', async () => {
    const source = voidSource();
    const team = `${NS}.blue`;
    for (const line of [
      `team add ${team} "Blue"`,
      `team modify ${team} color blue`,
      `team modify ${team} prefix "[B] "`,
      `team add ${NS}.extra "Extra"`,
    ]) {
      source.chat(`/${line}`);
    }
    let changed = 0;
    const view = () => (
      <GamesPanel source={source} project={project()} onChanged={() => (changed += 1)} />
    );
    const { rerender } = await act(async () => render(view()));
    const picker = () => screen.getByTestId('tryit-games-team') as HTMLSelectElement;
    expect(picker().value).toBe('');
    expect([...picker().options].map((option) => option.textContent)).toEqual([
      'No team',
      'Blue',
      'Extra',
    ]);
    // A command (as a game's function would) puts the player on the team.
    source.chat(`/team join ${team} @s`);
    await act(async () => rerender(view()));
    expect(picker().value).toBe(`${NS}:blue`);
    expect(screen.getByTestId('tryit-games-name').textContent).toBe('[B] Player');
    expect(source.games.status().team?.colour).toBe('blue');
    // Picking in the panel runs team leave and team join in the engine.
    fireEvent.change(picker(), { target: { value: '' } });
    expect(source.functions.state.teamOf.has('Player')).toBe(false);
    fireEvent.change(picker(), { target: { value: `${NS}.extra` } });
    expect(source.functions.state.teamOf.get('Player')).toBe(`${NS}.extra`);
    expect(changed).toBe(2);
    expect(source.lines.map((line) => line.text)).toContain('Added Player to team [Extra].');
  });

  it('rebuilds an area with Rebuild now', async () => {
    const source = voidSource();
    const placed = source.games.current?.corner;
    if (placed === undefined) throw new Error('no plan');
    const grass = { x: 1 - placed.x, y: 65 - placed.y, z: 1 - placed.z };
    expect(source.world.get(grass)?.name).toBe('minecraft:grass_block');
    source.world.set(grass, null);
    await act(async () => {
      render(<GamesPanel source={source} project={project()} onChanged={() => {}} />);
    });
    fireEvent.click(screen.getByTestId('tryit-games-rebuild'));
    expect(source.world.get(grass)?.name).toBe('minecraft:grass_block');
  });
});
