// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B375 (ADR 0082 D7 (b), (c), D10): the Rules section of the Block, Item, Mob and Effect
 * Studios (the thing's rules as cards with the thing fixed; "Add a rule" into the default book,
 * created on demand, one undo step; edits sent to the book, typing as one step), the events
 * editor's read-only "From rules" list and "Turn into rules" (one undo step, Undo restores the
 * data exactly), and the Export Java project dialog's list of rules left out.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
  stableStringify,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import entitiesPlugin from '@msm/plugin-entities';
import { RULES_KIND, ruleEventId } from '@msm/plugin-rules';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode, useEffect, useReducer } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChangeItem, planChangeItems } from '../../src/renderer/src/changeset/changeset';
import {
  ExportJavaProjectDialog,
  rulesNotInEject,
} from '../../src/renderer/src/components/ExportJavaProjectDialog';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../src/renderer/src/studios/blocks-items/host';
import { ElementForm } from '../../src/renderer/src/studios/ElementForm';
import { noRulesNote, TYPING_DELAY_MS } from '../../src/renderer/src/studios/rules/RulesSection';
import { subjectRules } from '../../src/renderer/src/studios/rules/turn-into-rules';
import { StructureStudioHostContext } from '../../src/renderer/src/studios/structures/host';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element } from './fixtures';
import { schemaIndex } from './forms/schemas';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const vanilla = { item: ['diamond'], block: ['stone'], sound_event: ['block.note_block.chime'] };
  const registries = createRegistryIndex({
    vanilla,
    project: { item: ['demo:ruby'], block: ['demo:ruby_block'] },
  });
  schema = {
    status: 'ready',
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: vanilla,
      registries: () => registries,
    },
  };
});
beforeEach(() => {
  usePreferences.setState({ mode: 'easy' });
});
afterEach(cleanup);

const BLOCK = 'demo:ruby_block' as ResourceLocation;
const BOOK = 'demo:rules' as ResourceLocation;

function kindOf(id: string): ElementKind {
  const kind = [
    ...(blocksItemsPlugin.contributes.elementKinds ?? []),
    ...(entitiesPlugin.contributes.elementKinds ?? []),
  ].find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
}

function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements, assets: [] }],
  };
}

const RUBY = element('demo:ruby' as ResourceLocation, 'msm:item', {
  display_name: 'Ruby',
  format: 1,
});

const blockData = (extra: Record<string, Json> = {}): Json => ({
  display_name: 'Ruby Block',
  format: 1,
  model: 'minecraft:block/stone',
  ...extra,
});

const GIFT = {
  do: [
    { count: 2, item: 'demo:ruby', step: 'give_item' },
    { sound: 'minecraft:block.note_block.chime', step: 'play_sound' },
  ],
  key: 'gift',
  name: 'Ruby gift',
  when: { subject: BLOCK, trigger: 'block_used' },
};
const ELSEWHERE = { do: [], key: 'hello', when: { trigger: 'player_joined' } };

function Harness(props: { stack: CommandStack; id: ResourceLocation }) {
  const { stack, id } = props;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={kindOf(subject.kind)}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
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

async function renderThing(
  subject: Element,
  others: Element[] = [],
  options: { host?: boolean } = {},
) {
  const stack = new CommandStack(projectOf(subject, RUBY, ...others));
  const openElement = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StructureStudioHostContext.Provider
      value={{ openElement, replaceFromFile: vi.fn(), exportStructures: vi.fn() }}
    >
      <BlocksItemsStudioHostContext.Provider value={options.host === false ? null : hostFor(stack)}>
        {children}
      </BlocksItemsStudioHostContext.Provider>
    </StructureStudioHostContext.Provider>
  );
  render(<Harness stack={stack} id={subject.id} />, { wrapper });
  await screen.findByTestId('rules-section');
  const find = (id: string): Json | undefined =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data;
  return { stack, find, openElement };
}

const rulesOfBook = (data: Json | undefined): Json[] =>
  ((data as { rules?: Json[] } | undefined)?.rules ?? []) as Json[];

describe('Rules section', () => {
  it('is in the Block, Item, Mob and Effect Studios', async () => {
    const things: Element[] = [
      element(BLOCK, 'msm:block', blockData()),
      element('demo:wand' as ResourceLocation, 'msm:item', { display_name: 'Wand', format: 1 }),
      element('demo:imp' as ResourceLocation, 'msm:entity', { display_name: 'Imp', format: 1 }),
      element('demo:glow' as ResourceLocation, 'msm:effect', { display_name: 'Glow', format: 1 }),
    ];
    for (const thing of things) {
      await renderThing(thing);
      const section = screen.getByTestId('rules-section');
      expect(within(section).getByTestId('rules-section-empty').textContent).toBe(
        noRulesNote(thing.kind),
      );
      expect(within(section).getByTestId('rules-section-add')).toBeTruthy();
      cleanup();
    }
  });

  it('adds a rule into the default book, created on demand, as one undo step', async () => {
    const { stack, find } = await renderThing(element(BLOCK, 'msm:block', blockData()));
    expect(find(BOOK)).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByTestId('rules-section-add'));
    });
    expect(find(BOOK)).toEqual({
      counters: [],
      format: 1,
      rules: [{ do: [], key: 'rule', when: { subject: BLOCK, trigger: 'block_used' } }],
    });
    expect(stack.undoLabel()).toBe('Add a rule');
    const card = await screen.findByTestId('rule-card');
    // The When chip is pre-filled and the thing is fixed (not a choice).
    expect(within(card).getByTestId('rules-chip-trigger').textContent).toContain('When');
    expect(within(card).getByTestId('rules-chip-subject').tagName).toBe('SPAN');
    // A second rule goes into the same book.
    await act(async () => {
      fireEvent.click(screen.getByTestId('rules-section-add'));
    });
    expect(rulesOfBook(find(BOOK))).toHaveLength(2);
    expect(stack.undo()).toBe(true);
    expect(stack.undo()).toBe(true);
    expect(find(BOOK)).toBeUndefined();
  });

  it('lists only the thing’s rules and sends edits to their book', async () => {
    const book = element(BOOK, RULES_KIND, { counters: [], format: 1, rules: [ELSEWHERE, GIFT] });
    const { stack, find, openElement } = await renderThing(
      element(BLOCK, 'msm:block', blockData()),
      [book],
    );
    const cards = screen.getAllByTestId('rule-card');
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;
    expect(within(card).getByTestId('rule-sentence').textContent).toContain('Ruby');
    // Turning it off is sent at once.
    await act(async () => {
      fireEvent.click(within(card).getByTestId('rule-enabled'));
    });
    expect((rulesOfBook(find(BOOK))[1] as { enabled?: boolean }).enabled).toBe(false);
    expect(rulesOfBook(find(BOOK))[0]).toEqual(ELSEWHERE);
    // Typing is held back, then sent as one step.
    const name = within(card).getByTestId('rule-name');
    fireEvent.change(name, { target: { value: 'Ruby' } });
    fireEvent.change(name, { target: { value: 'Ruby present' } });
    expect((rulesOfBook(find(BOOK))[1] as { name?: string }).name).toBe('Ruby gift');
    await waitFor(
      () => expect((rulesOfBook(find(BOOK))[1] as { name?: string }).name).toBe('Ruby present'),
      { timeout: TYPING_DELAY_MS * 4 },
    );
    expect(stack.undo()).toBe(true);
    expect((rulesOfBook(find(BOOK))[1] as { name?: string }).name).toBe('Ruby gift');
    fireEvent.click(screen.getByTestId('rules-section-open-book'));
    expect(openElement).toHaveBeenCalledWith(BOOK);
  });

  it('shows the rules read-only without a host that can write', async () => {
    const book = element(BOOK, RULES_KIND, { counters: [], format: 1, rules: [GIFT] });
    await renderThing(element(BLOCK, 'msm:block', blockData()), [book], { host: false });
    expect(screen.getAllByTestId('rule-card')).toHaveLength(1);
    expect(screen.queryByTestId('rules-section-add')).toBeNull();
  });
});

describe('Events editor and Rules', () => {
  it('lists the events rules make, read-only, with a link to their book', async () => {
    const book = element(BOOK, RULES_KIND, { counters: [], format: 1, rules: [GIFT] });
    const { openElement } = await renderThing(element(BLOCK, 'msm:block', blockData()), [book]);
    const list = screen.getByTestId('events-from-rules');
    const entry = within(list).getByTestId(`rules-event-${ruleEventId(BLOCK, 'block_used')}`);
    expect(entry.textContent).toContain('A player uses the block');
    expect(entry.textContent).toContain('Give item');
    expect(entry.textContent).toContain('Play sound');
    // Not an editable event.
    expect(screen.queryByTestId(`msm-event-${ruleEventId(BLOCK, 'block_used')}`)).toBeNull();
    fireEvent.click(within(entry).getByTestId('rules-event-open'));
    expect(openElement).toHaveBeenCalledWith(BOOK);
  });

  it('turns a hand-made event into rules in one undo step, and back', async () => {
    const data = blockData({
      components: { 'msm:on_interact': { event: 'demo:ruby_block_use' } },
      events: {
        'demo:ruby_block_use': {
          actions: [{ count: 2, item: 'demo:ruby', type: 'give_item' }],
        },
        'demo:scripted': { actions: [{ handler: 'demo:h', type: 'run_script' }] },
      },
    });
    const { stack, find } = await renderThing(element(BLOCK, 'msm:block', data));
    const before = stableStringify(stack.state as unknown as Json);
    // Not offered on an event with an action that has no step.
    expect(screen.queryByTestId('turn-into-rules-demo:scripted')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('turn-into-rules-demo:ruby_block_use'));
    });
    expect(stack.undoLabel()).toBe('Turn demo:ruby_block_use into rules');
    const after = find(BLOCK) as { components?: Json; events: Record<string, Json> };
    expect(Object.keys(after.events)).toEqual(['demo:scripted']);
    expect(after.components).toBeUndefined();
    expect(rulesOfBook(find(BOOK))).toEqual([
      {
        do: [{ count: 2, item: 'demo:ruby', step: 'give_item' }],
        key: 'ruby_block_use',
        name: 'Ruby block use',
        when: { subject: BLOCK, trigger: 'block_used' },
      },
    ]);
    // The rule shows in the Rules section and its event under "From rules".
    expect(await screen.findAllByTestId('rule-card')).toHaveLength(1);
    expect(screen.getByTestId(`rules-event-${ruleEventId(BLOCK, 'block_used')}`)).toBeTruthy();
    expect(stack.undo()).toBe(true);
    expect(stableStringify(stack.state as unknown as Json)).toBe(before);
  });
});

describe('Export Java project dialog and Rules', () => {
  it('lists the rules that need a script', () => {
    const logic = {
      do: [{ count: 1, item: 'demo:ruby', step: 'give_item' }],
      key: 'sneaky',
      name: 'Sneaky gift',
      only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
      when: { subject: BLOCK, trigger: 'block_broken' },
    };
    const project = projectOf(
      element(BLOCK, 'msm:block', blockData()),
      RUBY,
      element(BOOK, RULES_KIND, { counters: [], format: 1, rules: [GIFT, logic] }),
    );
    const rules = rulesNotInEject(subjectRules(project, target).view);
    expect(rules).toEqual([{ bookId: BOOK, key: 'sneaky', label: 'Sneaky gift' }]);
    render(
      <ExportJavaProjectDialog scripts={[]} rules={rules} onExport={vi.fn()} onClose={vi.fn()} />,
    );
    const note = screen.getByTestId('java-project-rules-note');
    expect(within(note).getByTestId('java-project-rule-sneaky').textContent).toContain(
      'Sneaky gift',
    );
  });
});
