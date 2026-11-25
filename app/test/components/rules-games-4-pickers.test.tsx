// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Rule book pickers for Rules 4 for games (B729): a kit and a game slot list the project's
 * own kits or games by their names (nothing else), write the id into the rule and show the
 * name; a game trigger's subject picks one of the project's games; with none, the menu says how
 * to make one; the default view of a book with every Rules 4 entry is in plain words.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import rulesPlugin, { RULES_KIND } from '@msm/plugin-rules';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementForm } from '../../src/renderer/src/studios/ElementForm';
import { projectIdChoices } from '../../src/renderer/src/studios/rules/id-pickers';
import { getAt } from '../../src/renderer/src/studios/rules/rules-model';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element } from './fixtures';
import { schemaIndex } from './forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from './lazy-chunks';
import { expectPlain } from './plain-sweep';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const rulesKind = rulesPlugin.contributes.elementKinds?.find((kind) => kind.id === RULES_KIND);
const VANILLA = { item: ['diamond'], block: ['stone'], entity_type: ['zombie'] };
const registries = createRegistryIndex({ vanilla: VANILLA, project: {} });
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  schema = {
    status: 'ready',
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: VANILLA,
      registries: () => registries,
    },
  };
  await preloadChunks(() => import('../../src/renderer/src/studios/rules/RuleBookStudio'));
}, PRELOAD_TIMEOUT_MS);
beforeEach(() => {
  window.msmMoreOptionsOpen = true;
});
afterEach(cleanup);

const BOOK_ID = 'demo:rules' as ResourceLocation;
const LIFESTEAL = 'demo:lifesteal' as ResourceLocation;
const DUEL = 'demo:duel' as ResourceLocation;
const STARTER = 'demo:fighter' as ResourceLocation;
const RED = 'demo:red' as ResourceLocation;

function projectOf(book: Json, games = true): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements: [
          element(BOOK_ID, RULES_KIND, book),
          element(RED, 'msm:team', { colour: 'red', name: 'Red team' }),
          ...(games
            ? [
                element(LIFESTEAL, 'msm:game', {
                  mechanics: [{ type: 'hearts' }],
                  name: 'Lifesteal',
                  type: 'lifesteal',
                }),
                element(DUEL, 'msm:game', { mechanics: [], name: 'Sword duel', type: 'custom' }),
                element(STARTER, 'msm:kit', { items: [], name: 'Fighter kit' }),
              ]
            : []),
        ],
        assets: [],
      },
    ],
  };
}

function Harness(props: { stack: CommandStack }) {
  const { stack } = props;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const book = stack.state.namespaces[0]?.elements.find((entry) => entry.id === BOOK_ID) as Element;
  return (
    <ElementForm
      project={stack.state}
      element={book}
      kind={rulesKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(BOOK_ID, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

async function renderBook(book: Json, games = true) {
  const stack = new CommandStack(projectOf(book, games), { coalesceWindowMs: 60_000 });
  render(<Harness stack={stack} />);
  await screen.findByTestId('rule-book-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
  const data = (): Json =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === BOOK_ID)?.data ?? null;
  return { data };
}

const bookWith = (...rules: Json[]): Json => ({ counters: [], format: 1, rules });
const joined = (step: Json): Json =>
  bookWith({ do: [step], key: 'rule', when: { trigger: 'player_joined' } });

/** Opens a chip's menu, checks what it lists, picks `name`. */
async function pickIn(chip: string, menu: string, name: string, notListed: readonly string[]) {
  fireEvent.click(screen.getByRole('button', { name: chip }));
  const list = await screen.findByTestId(menu);
  for (const other of notListed) {
    expect(within(list).queryByRole('button', { name: other })).toBeNull();
  }
  await act(async () => {
    fireEvent.click(within(list).getByRole('button', { name }));
  });
}

describe('the kit and game slots of Rules 4', () => {
  it('a kit chip lists the kits only, writes the id and shows the name', async () => {
    const { data } = await renderBook(joined({ step: 'give_kit' }));
    await pickIn('Kit: pick one of your kits', 'rules-project-menu-kit', 'Fighter kit', [
      'Lifesteal',
      'Red team',
    ]);
    expect(getAt(data(), '/rules/0/do/0/kit')).toBe(STARTER);
    expect(screen.getByRole('button', { name: 'Kit: Fighter kit' })).toBeTruthy();
  });

  it('a game chip lists the games only, writes the id and shows the name', async () => {
    const { data } = await renderBook(joined({ step: 'take_out_of_game' }));
    await pickIn('Game: pick one of your games', 'rules-project-menu-game', 'Sword duel', [
      'Fighter kit',
    ]);
    expect(getAt(data(), '/rules/0/do/0/game')).toBe(DUEL);
    expect(screen.getByTestId('rule-sentence').textContent).toContain(
      'take the player out of Sword duel',
    );
  });

  it('the condition picks a game', async () => {
    const { data } = await renderBook(
      bookWith({
        do: [],
        key: 'rule',
        only_if: { conditions: [{ condition: 'only_one_left' }], match: 'all' },
        when: { trigger: 'player_died' },
      }),
    );
    await pickIn('Game: pick one of your games', 'rules-project-menu-game', 'Lifesteal', []);
    expect(getAt(data(), '/rules/0/only_if/conditions/0/game')).toBe(LIFESTEAL);
  });

  it('a game trigger picks its game as the subject', async () => {
    const { data } = await renderBook(
      bookWith({ do: [], key: 'rule', when: { trigger: 'game_started' } }),
    );
    await pickIn('Thing: pick one of your games', 'rules-project-menu-game', 'Lifesteal', [
      'Fighter kit',
    ]);
    expect(getAt(data(), '/rules/0/when/subject')).toBe(LIFESTEAL);
    expect(screen.getByTestId('rule-sentence').textContent).toContain(
      'When a round of Lifesteal starts',
    );
  });

  it('says how to make one when the project has none', async () => {
    await renderBook(joined({ step: 'give_kit' }), false);
    fireEvent.click(screen.getByRole('button', { name: 'Kit: pick one of your kits' }));
    expect((await screen.findByTestId('rules-project-none')).textContent).toContain('Add element');
  });

  it('narrows the choices by name or id, by name then id', () => {
    const project = projectOf(bookWith());
    expect(projectIdChoices(project, 'msm:game', '').map((choice) => choice.name)).toEqual([
      'Lifesteal',
      'Sword duel',
    ]);
    expect(projectIdChoices(project, 'msm:game', 'duel').map((choice) => choice.id)).toEqual([
      DUEL,
    ]);
    expect(projectIdChoices(project, 'msm:kit', 'FIGHT').map((choice) => choice.id)).toEqual([
      STARTER,
    ]);
  });
});

describe('the default view', () => {
  it('a book with every Rules 4 entry is in plain words', async () => {
    window.msmMoreOptionsOpen = false;
    await renderBook(
      bookWith(
        {
          do: [
            { game: LIFESTEAL, hearts: 1, step: 'add_most_hearts', who: 'other' },
            { hearts: 12, step: 'set_most_hearts' },
            { kit: STARTER, step: 'give_kit' },
            { game: LIFESTEAL, step: 'take_out_of_game' },
            { game: DUEL, step: 'end_game', winners: 'other' },
          ],
          key: 'death',
          only_if: { conditions: [{ condition: 'only_one_left', game: DUEL }], match: 'all' },
          when: { trigger: 'player_died' },
        },
        {
          do: [{ game: DUEL, step: 'start_game' }],
          key: 'started',
          when: { subject: LIFESTEAL, trigger: 'game_started' },
        },
      ),
    );
    const studio = screen.getByTestId('rule-book-studio');
    expectPlain(studio);
    for (const name of ['Lifesteal', 'Sword duel', 'Fighter kit']) {
      expect(studio.textContent).toContain(name);
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'Kit: Fighter kit' })[0] as HTMLElement);
    expectPlain(await screen.findByTestId('rules-project-menu-kit'));
  });
});
