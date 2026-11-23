/**
 * Ask the AI helper from search (ADR 0124 D12, B669): the hints block (at most five lines of
 * library ids and understood answers, nothing of the mod, no name from the user's jar) and
 * `askAi`'s routes (the panel, New project with the AI helper, the quiet line without a key).
 */

import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import type { SearchEntry, SearchHit } from '@msm/search';
import { describe, expect, it } from 'vitest';
import {
  AiController,
  useAiPanelStore,
} from '../../../src/renderer/src/components/ai/ai-controller';
import {
  type AskAiContext,
  type AskAiController,
  type AskAiDraft,
  askAi,
  askAiHints,
  HINTS_CHIP,
  MAX_HINT_LINES,
  NO_HELPER_LINE,
  NO_KEY_LINE,
} from '../../../src/renderer/src/search/ask-ai';
import { useAiStore } from '../../../src/renderer/src/store/ai-store';
import { useUiStore } from '../../../src/renderer/src/store/ui-store';
import type { AiKeyStatus } from '../../../src/shared/platform';
import { aiSession, fakeAi } from '../ai-fixtures';

function hit(
  entry: Partial<SearchEntry> & Pick<SearchEntry, 'id' | 'source' | 'action'>,
  answers?: SearchHit['answers'],
): SearchHit {
  return {
    entry: { title: entry.id, available: true, preview: { type: 'text' }, ...entry } as SearchEntry,
    score: 1,
    why: [],
    ...(answers === undefined ? {} : { answers }),
  };
}

/** A jar name: what the user's own game calls a block (never sent to the helper). */
const JAR_NAME = 'Glimmering Oak Timber';

const HITS: SearchHit[] = [
  // A thing of the open mod: its id, its name and its data stay out.
  hit({
    id: 'project:element:ruby:secret_sword',
    source: 'project',
    title: 'My Secret Sword',
    action: { type: 'element', element: 'ruby:secret_sword' },
  }),
  hit(
    {
      id: 'flow:weapon',
      source: 'flow',
      title: 'Sword',
      action: { type: 'flow', starter: 'weapon' },
    },
    // An answer naming one of the mod's ids is left out; the others stay.
    { colour: '#3c44aa', weapon_type: 'sword', repair_item: 'ruby:secret_gem' },
  ),
  hit({
    id: 'vanilla:thing:oak_log',
    source: 'vanilla',
    title: JAR_NAME,
    action: { type: 'vanilla', id: 'minecraft:oak_log', sort: 'thing' },
  }),
  hit({
    id: 'project:rule:ruby:rules#0',
    source: 'project',
    title: 'When I hit a zombie',
    action: { type: 'rule', book: 'ruby:rules', index: 0 },
  }),
  hit({
    id: 'template:recipe_shaped',
    source: 'template',
    title: 'Shaped recipe',
    action: { type: 'template', template: 'recipe_shaped', kind: 'minecraft:recipe' },
  }),
  hit({
    id: 'problem:abc',
    source: 'problem',
    title: 'Ruby sword has no picture',
    action: { type: 'problem', code: 'x', element: 'ruby:secret_sword' },
  }),
  hit({
    id: 'example:example_recipe',
    source: 'example',
    title: 'Shaped recipe with a named result',
    action: { type: 'example', example: 'example_recipe' },
  }),
  hit({
    id: 'kind:msm:item',
    source: 'kind',
    title: 'Item',
    action: { type: 'kind', kind: 'msm:item' },
  }),
];

describe('askAiHints (ADR 0124 D12)', () => {
  it('holds at most five lines: library ids and the understood answers, best first', () => {
    const block = askAiHints(HITS);
    expect(block).not.toBeNull();
    const lines = (block as string).split('\n');
    expect(lines.length).toBeLessThanOrEqual(MAX_HINT_LINES);
    expect(lines.slice(1)).toEqual([
      '- flow weapon (add_starter): colour "#3c44aa", weapon_type "sword"',
      '- vanilla thing minecraft:oak_log',
      '- template recipe_shaped (minecraft:recipe)',
      '- example example_recipe',
    ]);
  });

  it('holds no project content and no name from the jar', () => {
    const block = askAiHints(HITS) as string;
    for (const word of [
      'ruby:',
      'secret',
      'Secret',
      'My Secret Sword',
      'When I hit a zombie',
      'no picture',
      JAR_NAME,
      'Glimmering',
    ]) {
      expect(block).not.toContain(word);
    }
    // No title at all: titles of vanilla things may be the jar's names.
    expect(block).not.toContain('Sword');
    expect(block).not.toContain('Shaped recipe');
  });

  it('is null when no hit is a library or game thing, and cuts long lines', () => {
    expect(askAiHints([])).toBeNull();
    expect(
      askAiHints([HITS[0] as SearchHit, HITS[3] as SearchHit, HITS[5] as SearchHit]),
    ).toBeNull();
    const long = hit(
      { id: 'flow:weapon', source: 'flow', action: { type: 'flow', starter: 'weapon' } },
      { weapon_name: 'x'.repeat(500) },
    );
    const line = (askAiHints([long]) as string).split('\n')[1] as string;
    expect(line.length).toBeLessThanOrEqual(240);
    expect(line.endsWith('…')).toBe(true);
  });
});

interface FakeController extends AskAiController {
  filled: { text: string; context: AskAiContext | null }[];
}

function controller(key: AiKeyStatus | null, root: string | null = '/mods/ruby'): FakeController {
  const filled: FakeController['filled'] = [];
  return {
    root,
    filled,
    refreshKey: async () => key,
    prefillMessage(text, context) {
      if (this.root === null) return false;
      filled.push({ text, context });
      return true;
    },
  };
}

const KEY: AiKeyStatus = { set: true, tail: 'abcd', encryptionAvailable: true };

describe('askAi (ADR 0124 D12)', () => {
  it('with a mod open fills the panel with the words and the hints, and sends nothing', async () => {
    const fake = controller(KEY);
    const started: AskAiDraft[] = [];
    const outcome = await askAi('  a blue sword  ', HITS, {
      controller: fake,
      newProjectWithAi: (draft) => started.push(draft),
    });
    expect(outcome).toEqual({ status: 'opened', where: 'panel' });
    expect(started).toEqual([]);
    expect(fake.filled).toHaveLength(1);
    expect(fake.filled[0]?.text).toBe('a blue sword');
    expect(fake.filled[0]?.context?.label).toBe(HINTS_CHIP);
    expect(fake.filled[0]?.context?.block).toBe(askAiHints(HITS));
  });

  it('with no mod open opens New project with the AI helper with the words', async () => {
    const fake = controller(KEY, null);
    const started: AskAiDraft[] = [];
    const outcome = await askAi('a blue sword', HITS, {
      controller: fake,
      newProjectWithAi: (draft) => started.push(draft),
    });
    expect(outcome).toEqual({ status: 'opened', where: 'new-project' });
    expect(fake.filled).toEqual([]);
    expect(started).toEqual([
      { text: 'a blue sword', context: { label: HINTS_CHIP, block: askAiHints(HITS) } },
    ]);
  });

  it('with no hints sends the words alone', async () => {
    const fake = controller(KEY);
    await askAi('hello', [], { controller: fake, newProjectWithAi: () => {} });
    expect(fake.filled).toEqual([{ text: 'hello', context: null }]);
  });

  it('without a key opens nothing and gives the one quiet line', async () => {
    const fake = controller({ set: false, tail: null, encryptionAvailable: true });
    const started: AskAiDraft[] = [];
    const outcome = await askAi('a blue sword', HITS, {
      controller: fake,
      newProjectWithAi: (draft) => started.push(draft),
    });
    expect(outcome).toEqual({ status: 'unavailable', reason: 'no-key', line: NO_KEY_LINE });
    expect(fake.filled).toEqual([]);
    expect(started).toEqual([]);
    expect(NO_KEY_LINE.split('\n')).toHaveLength(1);
  });

  it('without the helper (or a key status that fails) opens nothing', async () => {
    const none = await askAi('x', HITS, { controller: null, newProjectWithAi: () => {} });
    expect(none).toEqual({ status: 'unavailable', reason: 'no-helper', line: NO_HELPER_LINE });
    const failing: AskAiController = {
      root: '/m',
      refreshKey: async () => {
        throw new Error('down');
      },
      prefillMessage: () => true,
    };
    const outcome = await askAi('x', HITS, { controller: failing, newProjectWithAi: () => {} });
    expect(outcome.status).toBe('unavailable');
  });
});

describe('askAi with the real controller (ADR 0124 D12, ADR 0125 D2)', () => {
  it('opens the panel with the words and the hints waiting, and starts no run', async () => {
    useAiStore.setState({ conversations: {} });
    useAiPanelStore.setState({ drafts: {}, focusRequest: 0 });
    useUiStore.setState({ rightDock: 'problems' });
    const ai = fakeAi({ set: true, tail: 'abcd' });
    const { session } = await aiSession();
    const real = new AiController({
      session,
      ai,
      loadSettings: async () => ({
        minecraftDir: null,
        updates: { autoCheck: true },
        detectedMinecraftDir: null,
        ai: DEFAULT_AI_SETTINGS,
      }),
      newId: () => 'id-1',
    });
    real.setDraft({ text: 'an older draft', context: null });
    const outcome = await askAi('a blue sword', HITS, {
      controller: real,
      newProjectWithAi: () => {},
    });
    expect(outcome).toEqual({ status: 'opened', where: 'panel' });
    expect(useUiStore.getState().rightDock).toBe('assistant');
    expect(real.draft()).toMatchObject({
      text: 'a blue sword',
      context: { label: HINTS_CHIP, block: askAiHints(HITS) },
    });
    expect(useAiPanelStore.getState().focusRequest).toBe(1);
    expect(ai.starts).toEqual([]);
  });
});
