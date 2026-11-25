// @vitest-environment happy-dom
/**
 * The panel's practice players (B728, ADR 0132 D10): adding stand-ins, their hearts and what
 * each does, Remove, the most of seven, and Watch a round playing Lifesteal's round script on the
 * real lowered game to its win; the panel shows for a project that has only a game.
 */
import type { Project } from '@msm/core';
import { LocalWorldSource, MAX_PRACTICE_PLAYERS } from '@msm/sim';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GamesPanel from '../../../src/renderer/src/tryit/games/GamesPanel';
import { PracticePlayers } from '../../../src/renderer/src/tryit/games/PracticePlayers';
import { gamesProjectOf, projectHasGames } from '../../../src/renderer/src/tryit/grounds';
import { BED_STATES, LIFESTEAL, lowered } from '../gamehub/round-support';
import { expectPlain } from '../plain-sweep';
import { TARGET } from './tryit-fixture';

afterEach(cleanup);

const project = (): Project =>
  ({
    formatVersion: 1,
    name: 'Practice',
    namespaces: [{ name: 'demo', elements: LIFESTEAL, assets: [] }],
  }) as unknown as Project;

async function lifesteal(): Promise<LocalWorldSource> {
  const source = new LocalWorldSource({
    files: await lowered(LIFESTEAL, TARGET),
    target: TARGET as never,
    seed: 3,
    logLimit: 100_000,
    vanillaBlockstates: BED_STATES,
  });
  source.tick();
  return source;
}

const select = (index: number) =>
  screen.getAllByTestId('tryit-practice-do')[index] as HTMLSelectElement;

describe('practice players in "Your game"', () => {
  it('shows for a project with a game, adds stand-ins with their hearts, and acts for them', async () => {
    expect(projectHasGames(project())).toBe(true);
    const source = await lifesteal();
    let changed = 0;
    await act(async () => {
      render(
        <PracticePlayers
          source={source}
          games={gamesProjectOf(project())}
          onChanged={() => (changed += 1)}
        />,
      );
    });
    fireEvent.click(screen.getByText('Add a practice player'));
    fireEvent.click(screen.getByText('Add a practice player'));
    const rows = screen.getAllByTestId('tryit-practice-row');
    expect(rows.map((row) => row.textContent?.split(/\d/)[0])).toEqual(['You', 'Alex', 'Sam']);
    expect(screen.getAllByTestId('tryit-practice-hearts')[1]?.textContent).toBe('10 of 10 hearts');
    const labels = [...select(0).options].map((option) => option.textContent);
    expect(labels).toEqual([
      'What Alex does…',
      'Walks to you',
      'Hits you',
      'Knocks you out',
      'Breaks the block under you',
      'Hits Sam',
      'Knocks Sam out',
      'Breaks the block under Sam',
      'Leaves the game',
    ]);
    fireEvent.change(select(0), { target: { value: 'hit:Sam' } });
    expect(source.functions.state.games.healthOf('Sam')).toBe(15);
    expect(screen.getAllByTestId('tryit-practice-hearts')[2]?.textContent).toBe('8 of 10 hearts');
    fireEvent.change(select(1), { target: { value: 'leave' } });
    expect(screen.getAllByTestId('tryit-practice-hearts')[2]?.textContent).toBe('Away');
    expect(changed).toBe(4);
    expectPlain(screen.getByTestId('tryit-practice'));
    fireEvent.click(screen.getAllByText('Remove')[0] as HTMLElement);
    expect(source.practice.all().map((one) => one.name)).toEqual(['Sam']);
  });

  it('stands in at most seven', async () => {
    const source = await lifesteal();
    await act(async () => {
      render(
        <PracticePlayers source={source} games={gamesProjectOf(project())} onChanged={() => {}} />,
      );
    });
    for (let i = 0; i < MAX_PRACTICE_PLAYERS; i += 1) {
      fireEvent.click(screen.getByText('Add a practice player'));
    }
    expect((screen.getByTestId('tryit-practice-add') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Seven practice players is the most Try it stands in.')).toBeTruthy();
  });

  it('Watch a round plays the game type’s round to its win, and Done brings you back', async () => {
    const source = await lifesteal();
    await act(async () => {
      render(<GamesPanel source={source} project={project()} onChanged={() => {}} />);
    });
    fireEvent.click(screen.getByText('Watch a round'));
    expect(source.practice.userAway).toBe(true);
    await act(async () => {
      for (let i = 0; i < 2000 && screen.queryByText('Done') === null; i += 1) source.tick();
    });
    expect(screen.getByTestId('tryit-practice-round').textContent).toContain(
      'Round over: Alex won.',
    );
    expect(source.lines.map((line) => line.text)).toContain('Alex took a heart from Sam.');
    expectPlain(screen.getByTestId('tryit-practice'));
    fireEvent.click(screen.getByText('Done'));
    expect(source.practice.userAway).toBe(false);
    expect(source.practice.all()).toEqual([]);
  });
});
