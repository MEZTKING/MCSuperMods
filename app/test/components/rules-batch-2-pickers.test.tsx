// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B538 (ADR 0111 D1, D3–D6; B534's catalogue): the Rule book Studio's pickers and chip words for
 * the six new slot types (a dialog, a game rule and its value, a statistic, an advancement, what
 * the player typed for a command's argument), the optional advancement subject of "A player gets
 * an advancement", and the item triggers offered in an item's own Rules section.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import rulesPlugin, { RULES_KIND, triggerById, valueById } from '@msm/plugin-rules';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import { ElementForm } from '../../src/renderer/src/studios/ElementForm';
import {
  commandArgumentsOf,
  gameRuleKindOf,
  idChoices,
  isFullId,
} from '../../src/renderer/src/studios/rules/id-pickers';
import { takesAnySubject } from '../../src/renderer/src/studios/rules/RuleCard';
import { getAt, offeredValues, ruleScope } from '../../src/renderer/src/studios/rules/rules-model';
import { emptyWords, slotWords } from '../../src/renderer/src/studios/rules/slot-words';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element } from './fixtures';
import { schemaIndex } from './forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from './lazy-chunks';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const rulesKind = rulesPlugin.contributes.elementKinds?.find((kind) => kind.id === RULES_KIND);
const VANILLA = {
  dialog: ['minecraft:server_links'],
  game_rule: ['minecraft:keep_inventory'],
  custom_stat: ['minecraft:jump'],
  advancement: ['minecraft:story/mine_stone'],
};
const PROJECT = {
  game_rule: ['demo:gem_drops', 'demo:gem_count'],
  custom_stat: ['demo:gems_found'],
};
const registries = createRegistryIndex({ vanilla: VANILLA, project: PROJECT });
let schema: SchemaContextState;

beforeAll(async () => {
  schema = {
    status: 'ready',
    context: {
      target,
      schemaIndex: await schemaIndex(),
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
const COMMAND = 'demo:gems' as ResourceLocation;
const OTHERS: Element[] = [
  element('demo:gem_drops' as ResourceLocation, 'msm:game_rule', {
    kind: 'boolean',
    display_name: 'Gem drops',
  }),
  element('demo:gem_count' as ResourceLocation, 'msm:game_rule', { kind: 'integer' }),
  element('demo:gems_found' as ResourceLocation, 'msm:stat', { display_name: 'Gems found' }),
  element(COMMAND, 'msm:command', {
    format: 1,
    name: 'gems',
    arguments: [
      { name: 'amount', type: 'integer' },
      { name: 'where', type: 'block_position' },
      { name: 'mode', type: 'game_mode' },
    ],
  }),
];

function projectOf(book: Json): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      { name: 'demo', elements: [element(BOOK_ID, RULES_KIND, book), ...OTHERS], assets: [] },
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

async function renderBook(book: Json) {
  const stack = new CommandStack(projectOf(book), { coalesceWindowMs: 60_000 });
  render(<Harness stack={stack} />);
  await screen.findByTestId('rule-book-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
  const data = (): Json =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === BOOK_ID)?.data ?? null;
  return { stack, data };
}

const bookWith = (...rules: Json[]): Json => ({ counters: [], format: 1, rules });

describe('the pure parts', () => {
  it('lists ids the project’s own first, narrowed by typing', () => {
    const project = projectOf(bookWith());
    const { choices } = idChoices(project, registries, 'game_rule', '');
    expect(choices.map((choice) => [choice.id, choice.name, choice.own])).toEqual([
      ['demo:gem_count', 'Gem count', true],
      ['demo:gem_drops', 'Gem drops', true],
      ['minecraft:keep_inventory', 'Keep inventory', false],
    ]);
    expect(idChoices(project, registries, 'game_rule', 'keep').choices).toHaveLength(1);
    expect(idChoices(project, registries, 'game_rule', '', 1).more).toBe(2);
    expect(isFullId('demo:welcome')).toBe(true);
    expect(isFullId('welcome')).toBe(false);
  });

  it("reads a command's arguments and a project game rule's kind", () => {
    const project = projectOf(bookWith());
    expect(commandArgumentsOf(project, COMMAND)).toEqual([
      { name: 'amount', type: 'integer' },
      { name: 'where', type: 'block_position' },
      { name: 'mode', type: 'game_mode' },
    ]);
    expect(commandArgumentsOf(project, undefined)).toEqual([]);
    expect(gameRuleKindOf(project, 'demo:gem_drops')).toBe('boolean');
    expect(gameRuleKindOf(project, 'demo:gem_count')).toBe('integer');
    expect(gameRuleKindOf(project, 'minecraft:keep_inventory')).toBeUndefined();
  });

  it('offers "What the player typed" only on the command trigger', () => {
    const on = offeredValues(ruleScope(triggerById('command_used')), { veryEasy: false });
    expect(on.map((entry) => entry.id)).toContain('command_argument');
    const off = offeredValues(ruleScope(triggerById('player_joined')), { veryEasy: false });
    expect(off.map((entry) => entry.id)).not.toContain('command_argument');
  });

  it('words the new chips as the plugin’s sentences do', () => {
    const context = {
      names: (id: string) => (id === 'demo:gem_drops' ? 'Gem drops' : id),
      trigger: undefined,
    };
    const slot = (type: string, name: string) => ({ name, type }) as never;
    expect(emptyWords(slot('game_rule', 'game_rule'))).toBe('pick a game rule');
    expect(emptyWords(slot('stat', 'stat'))).toBe('pick a statistic');
    expect(emptyWords(slot('dialog', 'dialog'))).toBe('pick a dialog');
    expect(emptyWords(slot('advancement', 'subject'))).toBe('pick an advancement');
    expect(emptyWords(slot('argument', 'name'))).toBe('pick what the player typed');
    expect(
      slotWords(slot('game_rule', 'game_rule'), { game_rule: 'demo:gem_drops' }, context),
    ).toBe('Gem drops');
    expect(slotWords(slot('game_rule_value', 'value'), { value: false }, context)).toBe('false');
    expect(slotWords(slot('argument', 'name'), { name: 'how_many' }, context)).toBe('"how many"');
    const name = valueById('command_argument')?.slots.find((entry) => entry.name === 'name');
    expect(name?.type).toBe('argument');
  });

  it('offers the crafting, picking up and eating triggers in an item’s own section', () => {
    const crafted = triggerById('player_crafted');
    if (crafted === undefined) throw new Error('No player_crafted.');
    expect(takesAnySubject(crafted, 'msm:item')).toBe(true);
    expect(takesAnySubject(crafted, 'msm:entity')).toBe(false);
    const advancement = triggerById('player_advancement');
    if (advancement === undefined) throw new Error('No player_advancement.');
    expect(takesAnySubject(advancement, 'msm:item')).toBe(false);
  });
});

describe('the chips', () => {
  it('picks a project game rule and then true or false for it', async () => {
    const { data } = await renderBook(
      bookWith({
        do: [{ step: 'set_game_rule' }],
        key: 'rule',
        when: { trigger: 'player_joined' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Game rule: pick a game rule' }));
    const menu = await screen.findByTestId('rules-id-menu-game_rule');
    expect(within(menu).getByText('Your game rules')).toBeTruthy();
    fireEvent.click(within(menu).getByTestId('rules-id-demo:gem_drops'));
    expect(getAt(data(), '/rules/0/do/0/game_rule')).toBe('demo:gem_drops');
    fireEvent.click(screen.getByRole('button', { name: 'Value: set the value' }));
    const value = await screen.findByTestId('rules-game-rule-value');
    // An on-or-off rule takes no number.
    expect(within(value).queryByTestId('rules-value-editor')).toBeNull();
    fireEvent.click(within(value).getByTestId('rules-game-rule-true'));
    expect(getAt(data(), '/rules/0/do/0/value')).toBe(true);
    expect(screen.getByTestId('rule-sentence').textContent).toContain(
      'set the game rule Gem drops to true',
    );
  });

  it("finds Minecraft's statistic by typing", async () => {
    const { data } = await renderBook(
      bookWith({
        do: [{ amount: 1, step: 'add_to_stat' }],
        key: 'rule',
        when: { trigger: 'player_joined' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Statistic: pick a statistic' }));
    fireEvent.change(await screen.findByTestId('rules-id-filter'), { target: { value: 'jump' } });
    fireEvent.click(screen.getByTestId('rules-id-minecraft:jump'));
    expect(getAt(data(), '/rules/0/do/0/stat')).toBe('minecraft:jump');
    expect(screen.getByRole('button', { name: 'Statistic: Jump' })).toBeTruthy();
  });

  it('uses a dialog id typed in full', async () => {
    const { data } = await renderBook(
      bookWith({ do: [{ step: 'open_dialog' }], key: 'rule', when: { trigger: 'player_joined' } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dialog: pick a dialog' }));
    fireEvent.change(await screen.findByTestId('rules-id-filter'), {
      target: { value: 'demo:welcome' },
    });
    expect(screen.getByTestId('rules-id-none')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rules-id-use-typed'));
    expect(getAt(data(), '/rules/0/do/0/dialog')).toBe('demo:welcome');
  });

  it('reads the advancement subject as any advancement until one is picked', async () => {
    const { data } = await renderBook(
      bookWith({ do: [], key: 'rule', when: { trigger: 'player_advancement' } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thing: any advancement' }));
    const menu = await screen.findByTestId('rules-id-menu-advancement');
    expect(within(menu).getByTestId('rules-id-any')).toBeTruthy();
    fireEvent.click(within(menu).getByTestId('rules-id-minecraft:story/mine_stone'));
    expect(getAt(data(), '/rules/0/when/subject')).toBe('minecraft:story/mine_stone');
    expect(screen.getByRole('button', { name: 'Thing: Mine stone' })).toBeTruthy();
  });

  it('reads what the player typed for a command argument, a place by its part', async () => {
    const { data } = await renderBook(
      bookWith({
        do: [{ amount: 1, step: 'add_to_stat', stat: 'demo:gems_found' }],
        key: 'rule',
        when: { subject: COMMAND, trigger: 'command_used' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Amount: / }));
    const kind = (await screen.findByTestId('rules-value-kind')) as HTMLSelectElement;
    fireEvent.change(kind, { target: { value: 'command_argument' } });
    expect(getAt(data(), '/rules/0/do/0/amount')).toEqual({
      name: 'amount',
      value: 'command_argument',
    });
    const name = screen.getByTestId('rules-command-argument-name') as HTMLSelectElement;
    // A game mode is not readable by Rules, so it is not offered.
    expect([...name.options].map((option) => option.value)).toEqual(['amount', 'where']);
    fireEvent.change(name, { target: { value: 'where' } });
    expect(getAt(data(), '/rules/0/do/0/amount')).toEqual({
      axis: 'y',
      name: 'where',
      value: 'command_argument',
    });
    fireEvent.change(screen.getByTestId('rules-command-argument-axis'), { target: { value: 'x' } });
    expect(getAt(data(), '/rules/0/do/0/amount/axis')).toBe('x');
  });
});
