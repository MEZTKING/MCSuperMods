// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Rule book pickers for Rules 3's games slot types (B553; the gap B562 found): a loot table,
 * a structure and the project's teams, scores, timers, areas and magic blocks each open the
 * ThingPicker, list the things by their names, write the id into the rule and show the name;
 * the game triggers' subjects and the score, time left and team size readings pick the same
 * way; "Make a new one" makes a team (and the others) in one undo step with the rule; a Very
 * easy sweep over a book with a games rule shows no id.
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
import { type ChangeItem, planChangeItems } from '../../src/renderer/src/changeset/changeset';
import { forbiddenIn } from '../../src/renderer/src/components/ai/ai-words';
import { thingSections } from '../../src/renderer/src/components/thing-picker/thing-sources';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../src/renderer/src/studios/blocks-items/host';
import { ElementForm } from '../../src/renderer/src/studios/ElementForm';
import { newGameThing, newThingLabel } from '../../src/renderer/src/studios/rules/book-changes';
import { getAt } from '../../src/renderer/src/studios/rules/rules-model';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element } from './fixtures';
import { schemaIndex } from './forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from './lazy-chunks';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const rulesKind = rulesPlugin.contributes.elementKinds?.find((kind) => kind.id === RULES_KIND);
const VANILLA = {
  item: ['diamond'],
  block: ['stone'],
  entity_type: ['zombie'],
  loot_table: ['chests/simple_dungeon', 'blocks/stone'],
  structure: ['village/plains/houses/plains_small_house_1'],
};
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
  usePreferences.setState({ mode: 'easy' });
});
afterEach(cleanup);

const BOOK_ID = 'demo:rules' as ResourceLocation;
const RED = 'demo:red' as ResourceLocation;
const POINTS = 'demo:points' as ResourceLocation;
const ROUND = 'demo:round' as ResourceLocation;
const ARENA = 'demo:arena' as ResourceLocation;
const MAGIC = 'demo:magic' as ResourceLocation;
const TREASURE = 'demo:chests/treasure' as ResourceLocation;
const TOWER = 'demo:tower' as ResourceLocation;

function projectOf(book: Json): Project {
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
          element(POINTS, 'msm:objective', { criterion: 'dummy', name: 'Points' }),
          element(ROUND, 'msm:timer', { name: 'Round timer', seconds: 60 }),
          element(ARENA, 'msm:area', { from: [0, 64, 0], name: 'The arena', to: [9, 70, 9] }),
          element(MAGIC, 'msm:one_block', { at: [0, 64, 0], phases: [] }),
          element(TREASURE, 'minecraft:loot_table', { pools: [], type: 'minecraft:chest' }),
          element(TOWER, 'minecraft:structure_template', { size: [1, 1, 1] }),
        ],
        assets: [],
      },
    ],
  };
}

/** A host whose `applyChanges` applies the items to the stack as one step, like the session. */
function hostFor(stack: CommandStack): BlocksItemsStudioHost {
  return {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    applyChanges: async (items: readonly ChangeItem[], label: string) => {
      const plan = planChangeItems(stack.state, items);
      if (plan.skipped.length > 0) throw new Error('The project changed meanwhile.');
      const parts = plan.commands;
      stack.execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of parts) part.apply(draft);
        },
      });
    },
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

async function renderBook(book: Json, options: { host?: boolean } = {}) {
  const stack = new CommandStack(projectOf(book), { coalesceWindowMs: 60_000 });
  const tree = <Harness stack={stack} />;
  render(
    options.host === true ? (
      <BlocksItemsStudioHostContext.Provider value={hostFor(stack)}>
        {tree}
      </BlocksItemsStudioHostContext.Provider>
    ) : (
      tree
    ),
  );
  await screen.findByTestId('rule-book-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
  const find = (id: string): Element | undefined =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  const data = (): Json => find(BOOK_ID)?.data ?? null;
  return { stack, data, find };
}

const bookWith = (...rules: Json[]): Json => ({ counters: [], format: 1, rules });
const joined = (step: Json): Json =>
  bookWith({ do: [step], key: 'rule', when: { trigger: 'player_joined' } });

/** Opens a chip's picker, checks what it lists, picks `name`. */
async function pickIn(chip: string, name: string, notListed: readonly string[] = []) {
  fireEvent.click(screen.getByRole('button', { name: chip }));
  const picker = await screen.findByTestId('thing-picker');
  for (const other of notListed)
    expect(within(picker).queryByRole('button', { name: other })).toBeNull();
  fireEvent.click(within(picker).getByRole('button', { name }));
  expect(screen.queryByTestId('thing-picker')).toBeNull();
}

describe('the games slot types in the ThingPicker', () => {
  it.each([
    {
      type: 'loot_table',
      step: { step: 'give_loot' },
      chip: 'Loot table: pick a loot table',
      pick: 'Treasure',
      pointer: '/rules/0/do/0/loot_table',
      id: TREASURE,
      shown: 'Loot table: Treasure',
    },
    {
      type: 'loot_table (Minecraft)',
      step: { step: 'drop_loot' },
      chip: 'Loot table: pick a loot table',
      pick: 'Simple dungeon',
      pointer: '/rules/0/do/0/loot_table',
      id: 'minecraft:chests/simple_dungeon',
      shown: 'Loot table: Simple dungeon',
    },
    {
      type: 'structure',
      step: { step: 'place_structure' },
      chip: 'Structure: pick a structure',
      pick: 'Tower',
      pointer: '/rules/0/do/0/structure',
      id: TOWER,
      shown: 'Structure: Tower',
    },
    {
      type: 'team',
      step: { step: 'join_team' },
      chip: 'Team: pick a team',
      pick: 'Red team',
      pointer: '/rules/0/do/0/team',
      id: RED,
      shown: 'Team: Red team',
      notListed: ['Points', 'Round timer', 'Diamond'],
    },
    {
      type: 'objective',
      step: { amount: 1, step: 'set_score' },
      chip: 'Score: pick a score',
      pick: 'Points',
      pointer: '/rules/0/do/0/objective',
      id: POINTS,
      shown: 'Score: Points',
      notListed: ['Red team'],
    },
    {
      type: 'timer',
      step: { step: 'start_timer' },
      chip: 'Timer: pick one of your timers',
      pick: 'Round timer',
      pointer: '/rules/0/do/0/timer',
      id: ROUND,
      shown: 'Timer: Round timer',
    },
    {
      type: 'area',
      step: { step: 'reset_area' },
      chip: 'Area: pick one of your areas',
      pick: 'The arena',
      pointer: '/rules/0/do/0/area',
      id: ARENA,
      shown: 'Area: The arena',
    },
  ])(
    '$type: the chip opens its picker, picks by name, writes the id and shows the name',
    async (row) => {
      const { data } = await renderBook(joined(row.step as Json));
      await pickIn(row.chip, row.pick, row.notListed ?? []);
      expect(getAt(data(), row.pointer)).toBe(row.id);
      expect(screen.getByRole('button', { name: row.shown })).toBeTruthy();
    },
  );

  it('one_block: the trigger subject picks one of your magic blocks by name', async () => {
    const { data } = await renderBook(
      bookWith({ do: [], key: 'rule', when: { trigger: 'one_block_broken' } }),
    );
    await pickIn('Thing: pick one of your magic blocks', 'Magic', ['Stone', 'The arena']);
    expect(getAt(data(), '/rules/0/when/subject')).toBe(MAGIC);
    expect(screen.getByRole('button', { name: 'Thing: Magic' })).toBeTruthy();
    expect(screen.getByTestId('rule-sentence').textContent).toContain('When Magic is broken');
  });

  it('area_entered: the subject lists the areas only, not blocks', async () => {
    const { data } = await renderBook(
      bookWith({ do: [], key: 'rule', when: { trigger: 'area_entered' } }),
    );
    await pickIn('Thing: pick one of your areas', 'The arena', ['Stone']);
    expect(getAt(data(), '/rules/0/when/subject')).toBe(ARENA);
    expect(screen.getByTestId('rule-sentence').textContent).toContain(
      'When a player enters The arena',
    );
  });

  it('the conditions pick a team and a score', async () => {
    const { data } = await renderBook(
      bookWith({
        do: [],
        key: 'rule',
        only_if: {
          conditions: [{ condition: 'on_team' }, { condition: 'score_at_least', number: 3 }],
          match: 'all',
        },
        when: { trigger: 'player_joined' },
      }),
    );
    await pickIn('Team: pick a team', 'Red team');
    await pickIn('Score: pick a score', 'Points');
    expect(getAt(data(), '/rules/0/only_if/conditions/0/team')).toBe(RED);
    expect(getAt(data(), '/rules/0/only_if/conditions/1/objective')).toBe(POINTS);
  });

  it('the time left reading picks its timer inside the number editor', async () => {
    const { data } = await renderBook(
      joined({ amount: { value: 'timer_left' }, objective: POINTS, step: 'set_score' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Amount:/ }));
    const reading = await screen.findByTestId('rules-reading-game');
    fireEvent.click(
      within(reading).getByRole('button', { name: 'Timer: pick one of your timers' }),
    );
    const picker = await screen.findByTestId('thing-picker');
    fireEvent.click(within(picker).getByRole('button', { name: 'Round timer' }));
    expect(getAt(data(), '/rules/0/do/0/amount')).toEqual({ timer: ROUND, value: 'timer_left' });
  });

  it('a team made elsewhere is shown by its own name in quotes', async () => {
    await renderBook(joined({ step: 'join_team', team: 'blue' }));
    expect(screen.getByRole('button', { name: 'Team: "blue"' })).toBeTruthy();
  });

  it('Minecraft loot tables are grouped by their first folder', () => {
    const sections = thingSections({
      project: projectOf(bookWith()),
      registries,
      sort: 'loot_table',
      texturesFolder: 'textures',
    });
    expect(sections.map((section) => section.label)).toEqual([
      'Your things',
      'Minecraft chests',
      "Minecraft blocks' drops",
    ]);
  });
});

describe('Make a new one', () => {
  it('makes a team with a free name and picks it in one undo step', async () => {
    const { data, find, stack } = await renderBook(joined({ step: 'join_team' }), { host: true });
    fireEvent.click(screen.getByRole('button', { name: 'Team: pick a team' }));
    const picker = await screen.findByTestId('thing-picker');
    const make = within(picker).getByTestId('thing-make-new');
    expect(make.textContent).toContain('Make a new team');
    await act(async () => {
      fireEvent.click(make);
    });
    expect(find('demo:team')).toMatchObject({ kind: 'msm:team', data: { name: 'My team' } });
    expect(getAt(data(), '/rules/0/do/0/team')).toBe('demo:team');
    expect(screen.getByRole('button', { name: 'Team: My team' })).toBeTruthy();
    act(() => stack.undo());
    expect(find('demo:team')).toBeUndefined();
    expect(getAt(data(), '/rules/0/do/0/team')).toBeUndefined();
  });

  it('is not offered for structures, nor without a host that can make things', async () => {
    await renderBook(joined({ step: 'place_structure' }), { host: true });
    fireEvent.click(screen.getByRole('button', { name: 'Structure: pick a structure' }));
    expect(
      within(await screen.findByTestId('thing-picker')).queryByTestId('thing-make-new'),
    ).toBeNull();
    cleanup();
    await renderBook(joined({ step: 'join_team' }));
    fireEvent.click(screen.getByRole('button', { name: 'Team: pick a team' }));
    expect(
      within(await screen.findByTestId('thing-picker')).queryByTestId('thing-make-new'),
    ).toBeNull();
  });

  it('gives each sort a free id and name', () => {
    const project = projectOf(bookWith());
    expect(newGameThing(project, 'objective', 'demo')).toMatchObject({
      id: 'demo:score',
      kind: 'msm:objective',
      data: { criterion: 'dummy', name: 'Score' },
    });
    expect(newGameThing(project, 'timer', 'demo')?.data).toMatchObject({
      name: 'Timer',
      seconds: 300,
    });
    expect(newGameThing(project, 'area', 'demo')?.data).toMatchObject({ name: 'My area' });
    expect(newGameThing(project, 'one_block', 'demo')).toMatchObject({ id: 'demo:one_block' });
    expect(newGameThing(project, 'loot_table', 'demo')).toMatchObject({
      id: 'demo:chests/loot',
      data: { pools: [], type: 'minecraft:chest' },
    });
    expect(newGameThing(project, 'structure', 'demo')).toBeUndefined();
    const withTeam: Project = {
      ...project,
      namespaces: project.namespaces.map((namespace) => ({
        ...namespace,
        elements: [
          ...namespace.elements,
          element('demo:team' as ResourceLocation, 'msm:team', { name: 'My team' }),
        ],
      })),
    };
    expect(newGameThing(withTeam, 'team', 'demo')).toMatchObject({
      id: 'demo:team_2',
      data: { name: 'My team 2' },
    });
    expect(newThingLabel('one_block')).toBe('Make a new magic block');
    expect(newThingLabel('area')).toBe('Make a new area');
  });
});

describe('Very easy', () => {
  it('a book with a games rule shows no id, in the cards or the pickers', async () => {
    usePreferences.setState({ mode: 'very-easy' });
    await renderBook(
      bookWith(
        {
          do: [
            { loot_table: 'minecraft:chests/simple_dungeon', step: 'give_loot' },
            { step: 'place_structure', structure: TOWER },
            { step: 'join_team', team: RED },
            { amount: { timer: ROUND, value: 'timer_left' }, objective: POINTS, step: 'set_score' },
            { step: 'start_timer', timer: ROUND },
            { area: ARENA, step: 'reset_area' },
          ],
          key: 'arena',
          only_if: {
            conditions: [{ condition: 'on_team', team: RED }],
            match: 'all',
          },
          when: { subject: ARENA, trigger: 'area_entered' },
        },
        { do: [], key: 'magic', when: { subject: MAGIC, trigger: 'one_block_broken' } },
      ),
      { host: true },
    );
    const studio = screen.getByTestId('rule-book-studio');
    // Every text node on its own (textContent runs neighbours together, "hold:" and "the"),
    // and the words in labels, titles and placeholders.
    const texts = (node: Node): string[] => {
      const out: string[] = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let next = walker.nextNode(); next !== null; next = walker.nextNode()) {
        out.push(next.textContent ?? '');
      }
      return out;
    };
    const shown = (node: HTMLElement): string[] => [
      ...texts(node),
      ...[...node.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((child) =>
        ['aria-label', 'title', 'placeholder'].map((name) => child.getAttribute(name) ?? ''),
      ),
    ];
    expect(shown(studio).flatMap(forbiddenIn)).toEqual([]);
    for (const name of ['Red team', 'Points', 'Round timer', 'The arena', 'Magic', 'Tower']) {
      expect(studio.textContent).toContain(name);
    }
    // Each games picker lists names only.
    for (const chip of [
      'Loot table: Simple dungeon',
      'Structure: Tower',
      'Team: Red team',
      'Timer: Round timer',
      'Area: The arena',
      'Thing: Magic',
    ]) {
      fireEvent.click(screen.getAllByRole('button', { name: chip })[0] as HTMLElement);
      const picker = await screen.findByTestId('thing-picker');
      expect(shown(picker).flatMap(forbiddenIn)).toEqual([]);
      fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByTestId('thing-picker')).toBeNull();
    }
  });
});
