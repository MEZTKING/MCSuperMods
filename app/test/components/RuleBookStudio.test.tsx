// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Rule book Studio (B372, ADR 0082 D1, D6, D7 (a)): rendered through `ElementForm` (so the
 * lazy Studio comes from the registry) on a real `CommandStack`, so each edit is one undo step.
 * Covers adding rules, the When chip and the thing picker, steps and their chips, typing
 * coalescing, Alt+Up and Alt+Down, problems at the chip in plain words, the actors a trigger
 * has, Very easy and Advanced, and "Show me" focus.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Problem,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import rulesPlugin, { RULES_KIND } from '@msm/plugin-rules';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode, useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../src/renderer/src/studios/blocks-items/host';
import { ElementForm } from '../../src/renderer/src/studios/ElementForm';
import { rulesModeOf } from '../../src/renderer/src/studios/rules/mode';
import { PlainProblemWordsContext } from '../../src/renderer/src/studios/rules/problem-words';
import { getAt } from '../../src/renderer/src/studios/rules/rules-model';
import { DISCOVERED_STUDIOS, studioFor } from '../../src/renderer/src/studios/studio-registry';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { fakePlayer, fakeVanilla, oggOf, SoundHarness } from './audio/fake-player';
import { element } from './fixtures';
import { schemaIndex } from './forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from './lazy-chunks';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const rulesKind = rulesPlugin.contributes.elementKinds?.find((kind) => kind.id === RULES_KIND);
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const vanilla = {
    item: ['diamond', 'apple'],
    block: ['stone'],
    entity_type: ['zombie'],
    sound_event: ['block.note_block.chime'],
  };
  const registries = createRegistryIndex({
    vanilla,
    project: { item: ['demo:ruby', 'demo:ruby_block'], block: ['demo:ruby_block'] },
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
  // The Studio is a lazy chunk: load it here, not inside the first findBy.
  await preloadChunks(() => import('../../src/renderer/src/studios/rules/RuleBookStudio'));
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const BOOK_ID = 'demo:rules' as ResourceLocation;

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
          element('demo:ruby' as ResourceLocation, 'msm:item', { display_name: 'Ruby', format: 1 }),
          element('demo:ruby_block' as ResourceLocation, 'msm:block', {
            display_name: 'Ruby Block',
            format: 1,
          }),
        ],
        assets: [],
      },
    ],
  };
}

function Harness(props: {
  stack: CommandStack;
  problems: readonly Problem[];
  focusPointer: string | null;
  onFocused(): void;
}) {
  const { stack } = props;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const book = stack.state.namespaces[0]?.elements.find((entry) => entry.id === BOOK_ID) as Element;
  return (
    <ElementForm
      project={stack.state}
      element={book}
      kind={rulesKind}
      problems={props.problems}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(BOOK_ID, pointer, value, options ?? {}))
      }
      focusPointer={props.focusPointer}
      onFocused={props.onFocused}
    />
  );
}

async function renderBook(
  book: Json,
  options: {
    problems?: Problem[];
    focusPointer?: string | null;
    words?: (problem: Problem) => string | undefined;
    host?: BlocksItemsStudioHost;
    wrap?: (children: ReactNode) => ReactNode;
  } = {},
) {
  const stack = new CommandStack(projectOf(book), { coalesceWindowMs: 60_000 });
  const onFocused = vi.fn();
  const tree = (
    <Harness
      stack={stack}
      problems={options.problems ?? []}
      focusPointer={options.focusPointer ?? null}
      onFocused={onFocused}
    />
  );
  const worded =
    options.words === undefined ? (
      tree
    ) : (
      <PlainProblemWordsContext.Provider value={options.words}>
        {tree}
      </PlainProblemWordsContext.Provider>
    );
  const hosted =
    options.host === undefined ? (
      worded
    ) : (
      <BlocksItemsStudioHostContext.Provider value={options.host}>
        {worded}
      </BlocksItemsStudioHostContext.Provider>
    );
  render(options.wrap === undefined ? hosted : options.wrap(hosted));
  await screen.findByTestId('rule-book-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
  const data = (): Json =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === BOOK_ID)?.data ?? null;
  return { stack, data, onFocused };
}

const EMPTY: Json = { counters: [], format: 1, rules: [] };

const GIFT: Json = {
  counters: [],
  format: 1,
  rules: [
    {
      do: [
        { count: 2, item: 'demo:ruby', step: 'give_item' },
        { sound: 'minecraft:block.note_block.chime', step: 'play_sound' },
      ],
      key: 'gift',
      when: { subject: 'demo:ruby_block', trigger: 'block_used' },
    },
    { do: [], key: 'tick', when: { subject: 'demo:ruby_block', trigger: 'block_random_tick' } },
  ],
};

/** Opens a chip's popover menu and clicks a choice in it. */
async function pickFromMenu(chip: HTMLElement, name: string | RegExp) {
  fireEvent.click(chip);
  const choice = await screen.findByRole('button', { name });
  fireEvent.click(choice);
}

describe('Rule book Studio', () => {
  it('registers through the area file and edits msm:rules books', () => {
    const entry = DISCOVERED_STUDIOS.find((studio) => studio.id === 'msm.rules.book');
    expect(entry).toMatchObject({ kindId: RULES_KIND, handlesFocus: true });
    expect(rulesKind).toBeDefined();
    const book = element(BOOK_ID, RULES_KIND, EMPTY);
    expect(
      studioFor(book, rulesKind as NonNullable<typeof rulesKind>, DISCOVERED_STUDIOS)?.id,
    ).toBe('msm.rules.book');
    const broken = element(BOOK_ID, RULES_KIND, { rules: 'nope' });
    expect(studioFor(broken, rulesKind as NonNullable<typeof rulesKind>, DISCOVERED_STUDIOS)).toBe(
      undefined,
    );
  });

  it('adds a rule in one undo step', async () => {
    const { stack, data } = await renderBook(EMPTY);
    expect(screen.getByTestId('rule-book-empty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rule-add'));
    expect(data()).toEqual({
      counters: [],
      format: 1,
      rules: [{ do: [], key: 'rule', when: { trigger: 'player_joined' } }],
    });
    const card = screen.getByTestId('rule-card');
    expect(card.getAttribute('aria-label')).toBe('Rule 1: When a player joins, nothing.');
    await waitFor(() => expect(document.activeElement).toBe(card));
    act(() => {
      stack.undo();
    });
    expect(data()).toEqual(EMPTY);
    expect(stack.canUndo).toBe(false);
  });

  it('picks the trigger and the thing it is about', async () => {
    const { data } = await renderBook({
      counters: [],
      format: 1,
      rules: [{ do: [], key: 'rule', when: { trigger: 'player_joined' } }],
    });
    await pickFromMenu(screen.getByTestId('rules-chip-trigger'), 'A player uses the block');
    expect(data()).toMatchObject({ rules: [{ when: { trigger: 'block_used' } }] });
    const subject = screen.getByRole('button', { name: 'Thing: pick one of your blocks' });
    fireEvent.click(subject);
    const picker = await screen.findByTestId('thing-picker');
    // Definition triggers offer only the project's own blocks.
    expect(within(picker).queryByRole('region', { name: 'Minecraft blocks' })).toBeNull();
    fireEvent.click(within(picker).getByRole('button', { name: 'Ruby Block' }));
    expect(data()).toMatchObject({
      rules: [{ when: { subject: 'demo:ruby_block', trigger: 'block_used' } }],
    });
    expect(screen.getByTestId('rule-sentence').textContent).toBe(
      'When a player uses Ruby Block, nothing.',
    );
  });

  it('adds steps, picks things on their chips and names each chip', async () => {
    const { data } = await renderBook({
      counters: [],
      format: 1,
      rules: [{ do: [], key: 'rule', when: { subject: 'demo:ruby_block', trigger: 'block_used' } }],
    });
    await pickFromMenu(screen.getByTestId('rules-add-step-do'), 'Give an item');
    expect(data()).toMatchObject({ rules: [{ do: [{ step: 'give_item' }] }] });
    const item = screen.getByRole('button', { name: 'Item: pick an item' });
    fireEvent.click(item);
    const picker = await screen.findByTestId('thing-picker');
    fireEvent.click(within(picker).getByRole('button', { name: 'Ruby' }));
    expect(data()).toMatchObject({ rules: [{ do: [{ item: 'demo:ruby', step: 'give_item' }] }] });
    expect(screen.getByRole('button', { name: 'Item: Ruby' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Who: the player' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'How many: 1' })).toBeTruthy();
    expect(screen.getByTestId('rule-sentence').textContent).toBe(
      'When a player uses Ruby Block, give the player 1 Ruby.',
    );
  });

  it('coalesces typing a number into one undo step', async () => {
    const { stack, data } = await renderBook(GIFT);
    fireEvent.click(screen.getAllByRole('button', { name: 'How many: 2' })[0] as HTMLElement);
    const input = await screen.findByTestId('rules-number');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(getAt(data(), '/rules/0/do/0/count')).toBe(12);
    act(() => {
      stack.undo();
    });
    expect(data()).toEqual(GIFT);
  });

  it('turns a number into a reading', async () => {
    const { data } = await renderBook(GIFT);
    fireEvent.click(screen.getAllByRole('button', { name: 'How many: 2' })[0] as HTMLElement);
    const kind = await screen.findByTestId('rules-value-kind');
    fireEvent.change(kind, { target: { value: 'random' } });
    expect(getAt(data(), '/rules/0/do/0/count')).toEqual({ max: 10, min: 1, value: 'random' });
  });

  it('moves steps and rules with Alt+Up and Alt+Down', async () => {
    const { data } = await renderBook(GIFT);
    const steps = screen.getAllByTestId('rules-step');
    fireEvent.keyDown(steps[0] as HTMLElement, { key: 'ArrowDown', altKey: true });
    expect(getAt(data(), '/rules/0/do/0/step')).toBe('play_sound');
    expect(getAt(data(), '/rules/0/do/1/step')).toBe('give_item');
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-pointer')).toBe('/rules/0/do/1'),
    );
    const cards = screen.getAllByTestId('rule-card');
    fireEvent.keyDown(cards[1] as HTMLElement, { key: 'ArrowUp', altKey: true });
    expect(getAt(data(), '/rules/0/key')).toBe('tick');
    expect(getAt(data(), '/rules/1/key')).toBe('gift');
  });

  it('turns a rule off, duplicates and deletes it', async () => {
    const { data } = await renderBook(GIFT);
    const keys = () => (getAt(data(), '/rules') as { key: string }[]).map((rule) => rule.key);
    const first = screen.getAllByTestId('rule-card')[0] as HTMLElement;
    fireEvent.click(within(first).getByTestId('rule-enabled'));
    expect(getAt(data(), '/rules/0/enabled')).toBe(false);
    fireEvent.click(within(first).getByTestId('rule-duplicate'));
    expect(keys()).toEqual(['gift', 'gift_2', 'tick']);
    fireEvent.click(
      within(screen.getAllByTestId('rule-card')[1] as HTMLElement).getByTestId('rule-delete'),
    );
    expect(keys()).toEqual(['gift', 'tick']);
  });

  it('adds an "Only if" condition with its match, and removes it again', async () => {
    const { data } = await renderBook(GIFT);
    const first = screen.getAllByTestId('rule-card')[0] as HTMLElement;
    await pickFromMenu(within(first).getByTestId('rules-add-condition'), 'The player is sneaking');
    expect(getAt(data(), '/rules/0/only_if')).toEqual({
      conditions: [{ condition: 'player_sneaking' }],
      match: 'all',
    });
    fireEvent.click(within(first).getByTestId('rules-condition-not'));
    expect(getAt(data(), '/rules/0/only_if/conditions/0')).toEqual({
      condition: 'player_sneaking',
      not: true,
    });
    expect(within(first).getByTestId('rule-sentence').textContent).toContain(
      'if the player is not sneaking',
    );
    fireEvent.click(within(first).getByTestId('rules-condition-remove'));
    expect((data() as { rules: { only_if?: Json }[] }).rules[0]?.only_if).toBeUndefined();
  });

  it('declares a counter on first use', async () => {
    const { data } = await renderBook({
      counters: [],
      format: 1,
      rules: [
        {
          do: [{ amount: 1, step: 'add_to_counter' }],
          key: 'rule',
          when: { trigger: 'player_joined' },
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Counter: pick a counter' }));
    fireEvent.change(await screen.findByTestId('rules-counter-name'), {
      target: { value: 'clicks' },
    });
    fireEvent.click(screen.getByTestId('rules-counter-new'));
    expect(data()).toMatchObject({
      counters: [{ name: 'clicks', scope: 'player', start: 0 }],
      rules: [{ do: [{ counter: 'clicks', scope: 'player', step: 'add_to_counter' }] }],
    });
    expect(screen.getByTestId('rule-counters')).toBeTruthy();
  });

  it('offers only the actors a trigger has', async () => {
    await renderBook({
      counters: [],
      format: 1,
      rules: [
        {
          do: [{ amount: 2, step: 'heal' }],
          key: 'rule',
          when: { subject: 'demo:ruby_block', trigger: 'block_random_tick' },
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /^Who:/ }));
    const menu = await screen.findByRole('group', { name: 'Who' });
    expect(within(menu).queryByRole('button', { name: 'The player' })).toBeNull();
    expect(within(menu).getByRole('button', { name: 'Every player' })).toBeTruthy();
  });

  it('shows problems at their chip, in plain words when the table has them', async () => {
    const problem: Problem = {
      severity: 'error',
      code: 'rules.unknown-subject',
      message: 'Unknown item demo:gone.',
      elementId: BOOK_ID,
      path: '/rules/0/do/0/item',
    };
    await renderBook(GIFT, {
      problems: [problem],
      words: (entry) =>
        entry.code === 'rules.unknown-subject' ? 'Pick a thing that exists.' : undefined,
    });
    const chip = screen.getByRole('button', { name: 'Item: Ruby' });
    expect(chip.getAttribute('aria-invalid')).toBe('true');
    const lines = document.getElementById(chip.getAttribute('aria-describedby') ?? '');
    expect(lines?.textContent).toBe('Pick a thing that exists.');
  });

  it('falls back to the message without the plain-words table', async () => {
    await renderBook(GIFT, {
      problems: [
        {
          severity: 'error',
          code: 'rules.duplicate-key',
          message: 'Two rules have the key "gift".',
          elementId: BOOK_ID,
          path: '/rules/1/key',
        },
        {
          severity: 'warning',
          code: 'rules.undeclared-counter',
          message: 'Counter "x" is not declared.',
          elementId: BOOK_ID,
          path: '/counters',
        },
      ],
    });
    const second = screen.getAllByTestId('rule-card')[1] as HTMLElement;
    expect(within(second).getByTestId('rule-problems').textContent).toBe(
      'Two rules have the key "gift".',
    );
    expect(screen.getByTestId('rule-book-problems').textContent).toBe(
      'Counter "x" is not declared.',
    );
  });

  it('focuses the chip of a pointer ("Show me")', async () => {
    const { onFocused } = await renderBook(GIFT, { focusPointer: '/rules/0/do/1/sound' });
    await waitFor(() => expect(onFocused).toHaveBeenCalled());
    expect(document.activeElement?.getAttribute('data-pointer')).toBe('/rules/0/do/1/sound');
  });

  it('reads the view: plain in the main area, ids inside More options', () => {
    expect(rulesModeOf(true)).toEqual({ advanced: false });
    expect(rulesModeOf(false)).toEqual({ advanced: true });
  });

  it('offers every step, and keeps the key and What this becomes under More options', async () => {
    window.msmMoreOptionsOpen = false;
    globalThis.localStorage.clear();
    try {
      await renderBook(GIFT);
      fireEvent.click(screen.getAllByTestId('rules-add-step-do')[0] as HTMLElement);
      expect(await screen.findByRole('button', { name: 'Run a command' })).toBeTruthy();
      expect(screen.queryByTestId('rules-what-this-becomes')).toBeNull();
      expect(screen.queryByTestId('rule-key')).toBeNull();
    } finally {
      window.msmMoreOptionsOpen = true;
    }
  });

  it('shows the key and "What this becomes" in their More options', async () => {
    await renderBook(GIFT);
    expect(screen.getAllByTestId('rule-key')[0]?.textContent).toBe('Key: gift');
    const drawer = screen.getByTestId('rules-what-this-becomes');
    expect(drawer.textContent).toContain('demo:ruby_block');
    expect(drawer.textContent).toContain('demo:ruby_block_rules_block_used');
    expect(within(drawer).getByTestId('rules-no-script')).toBeTruthy();
  });

  it('shows the generated script when a rule needs one', async () => {
    await renderBook({
      counters: [],
      format: 1,
      rules: [
        {
          do: [{ step: 'show_message', text: ['Hello!'] }],
          key: 'hello',
          when: { trigger: 'player_joined' },
        },
      ],
    });
    expect(screen.getByTestId('rules-script').textContent).toContain('// rule:hello');
  });

  it('offers "Copy as my own script" in Advanced, as one changeset', async () => {
    const applyChanges = vi.fn(async () => undefined);
    const host: BlocksItemsStudioHost = {
      thumbnail: async () => new Uint8Array(),
      revision: 0,
      paintTexture: () => undefined,
      applyChanges,
    };
    await renderBook(
      {
        counters: [],
        format: 1,
        rules: [
          {
            do: [{ step: 'show_message', text: ['Hello!'] }],
            key: 'hello',
            when: { trigger: 'player_joined' },
          },
        ],
      },
      { host },
    );
    fireEvent.click(screen.getByTestId('rules-copy-as-script-button'));
    await screen.findByTestId('rules-copy-as-script-done');
    expect(applyChanges).toHaveBeenCalledTimes(1);
    const [items, label] = applyChanges.mock.calls[0] as unknown as [
      { op: string; elementId: string; kind: string }[],
      string,
    ];
    expect(label).toBe('Copy demo:rules as my own script');
    expect(items.map((item) => [item.op, item.elementId, item.kind])).toEqual([
      ['create', 'demo:rules_script', 'msm:script'],
      ['update', 'demo:rules', 'msm:rules'],
    ]);
    expect(screen.getByTestId('rules-copy-as-script-done').textContent).toContain(
      'Copied to the script demo:rules_script.',
    );
  });

  it('says why "Copy as my own script" cannot copy a book with no rules on', async () => {
    const applyChanges = vi.fn(async () => undefined);
    await renderBook(EMPTY, {
      host: {
        thumbnail: async () => new Uint8Array(),
        revision: 0,
        paintTexture: () => undefined,
        applyChanges,
      },
    });
    fireEvent.click(screen.getByTestId('rules-copy-as-script-button'));
    expect((await screen.findByTestId('rules-copy-as-script-error')).textContent).toContain(
      'nothing to copy',
    );
    expect(applyChanges).not.toHaveBeenCalled();
  });

  it('shows Play beside a sound chip once a sound is picked, through the shared player', async () => {
    const fake = fakePlayer();
    const vanilla = fakeVanilla({ 'block.note_block.chime': { sounds: ['note/chime'] } });
    const wrap = (children: ReactNode) => (
      <SoundHarness
        player={fake.player}
        sources={{ project: null, sounds: vanilla, readProjectAsset: null, random: () => 0 }}
      >
        {children}
      </SoundHarness>
    );
    const { data } = await renderBook(
      {
        counters: [],
        format: 1,
        rules: [
          {
            do: [{ step: 'play_sound' }],
            key: 'rule',
            when: { subject: 'demo:ruby_block', trigger: 'block_used' },
          },
        ],
      },
      { wrap },
    );
    // Nothing picked: no Play.
    expect(screen.queryByTestId('rules-chip-sound-play')).toBeNull();
    fireEvent.click(screen.getByTestId('rules-chip-sound'));
    const picker = await screen.findByTestId('thing-picker');
    fireEvent.click(within(picker).getByTestId('thing-minecraft:block.note_block.chime'));
    expect(getAt(data(), '/rules/0/do/0/sound')).toBe('minecraft:block.note_block.chime');
    const play = await screen.findByTestId('rules-chip-sound-play');
    await waitFor(() => expect(play.getAttribute('data-state')).toBe('idle'));
    await act(async () => {
      fireEvent.click(play);
    });
    await waitFor(() => expect(fake.played).toHaveLength(1));
    expect(vanilla.files).toEqual(['minecraft/sounds/note/chime.ogg']);
    expect(fake.played[0]?.bytes).toEqual(oggOf('minecraft/sounds/note/chime.ogg'));
    // Very easy keeps the button and names no id.
    act(() => {});
    const shown = screen.getByTestId('rules-chip-sound-play');
    expect(shown.getAttribute('aria-label') ?? '').not.toMatch(/minecraft:|note_block/);
    expect(shown.getAttribute('title') ?? '').not.toMatch(/minecraft:|note_block/);
  });
});
