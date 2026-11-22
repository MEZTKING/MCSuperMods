import { AI_ERROR_CLASSES, AI_MODEL_IDS, AI_TOOL_NAMES, type AiUsage } from '@msm/ai';
import { describe, expect, it } from 'vitest';
import {
  AI_STATUS_ACTIONS,
  AI_STATUS_STATES,
  type AiFailure,
  type AiStatus,
  type AiStatusState,
} from '../src/renderer/src/components/ai/ai-status';
import {
  appliedWords,
  applyFailedWords,
  closedPlanWords,
  costSentence,
  discardedWords,
  doneSentence,
  EXAMPLE_ASKS,
  explainChip,
  fallbackWords,
  forbiddenIn,
  modelChangeWords,
  nothingAppliedWords,
  noticeWords,
  planLineWords,
  readySentence,
  reviewHeading,
  statusWords,
  toolLine,
  type UiMode,
  WORDS_MODES,
  wordsFor,
} from '../src/renderer/src/components/ai/ai-words';
import type { AiAppliedStep, AiDisplayMessage } from '../src/renderer/src/store/ai-store';

/** Every string leaf of a value. */
function leaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(leaves);
  return [];
}

const FAILURES: AiFailure[] = [
  { reason: 'cancelled' },
  { reason: 'limit', limit: { toolTurns: 24, outputTokens: 100_000 } },
  { reason: 'max_tokens' },
  { reason: 'refusal', explanation: 'Not this.' },
  { reason: 'no_key' },
  { reason: 'error', message: 'socket hang up' },
  ...AI_ERROR_CLASSES.map((errorClass): AiFailure => ({ reason: 'error', errorClass })),
];

function statusOf(state: AiStatusState, extra: Partial<AiStatus> = {}): AiStatus {
  return {
    state,
    things: 2,
    changes: 6,
    seconds: state === 'thinking' || state === 'making' ? 12 : null,
    action: null,
    empty: false,
    ...extra,
  };
}

function steps(): AiAppliedStep[] {
  const all: AiAppliedStep[] = [];
  for (const phase of ['added', 'taken-out', 'put-back'] as const) {
    for (const onTop of [true, false]) {
      for (const things of [
        [],
        [
          { id: 'demo:ruby_sword', name: 'Ruby Sword', what: 'Item', op: 'added' as const },
          { id: 'demo:ruby_pickaxe', name: 'Ruby Pickaxe', what: 'Item', op: 'added' as const },
          { id: 'demo:ruby_ore', name: 'Ruby Ore', what: 'Block', op: 'changed' as const },
          { id: 'demo:old_gem', name: 'Old Gem', what: 'Item', op: 'removed' as const },
        ],
      ]) {
        all.push({
          label: 'Apply AI helper changes',
          things,
          changes: 9,
          skipped: onTop ? 0 : 1,
          createdIds: [],
          phase,
          onTop,
          addedText: 'Applied 9 changes. Undo reverts them in one step.',
        });
      }
    }
  }
  return all;
}

const usage: AiUsage = {
  inputTokens: 1200,
  outputTokens: 420,
  cacheReadInputTokens: 30_000,
  cacheCreationInputTokens: 28_000,
  requests: 4,
};

const SAMPLE_INPUTS: Record<string, unknown> = {
  create_elements: {
    elements: [
      { id: 'demo:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
      { id: 'demo:ruby_sword', kind: 'minecraft:model', data: {} },
    ],
  },
  update_element: { id: 'demo:ruby_sword', data: {} },
  delete_element: { id: 'demo:ruby_sword' },
  rename_element: { from: 'demo:a', to: 'demo:b' },
  create_texture: { namespace: 'demo', path: 'item/ruby_sword' },
  add_starter: { starterId: 'custom-sword' },
  read_element: { id: 'demo:ruby_sword' },
  kind_schema: { kind: 'msm:item' },
  template_data: { templateId: 'datapack/recipe' },
  propose_plan: { title: 'Ruby tools' },
  checkpoint: { completedItemIds: ['sword'], summary: 'The sword is made.' },
  note_missing_feature: { title: 'Set the player’s speed', request: 'x', missing: 'y' },
};

/** Every string the conversation can show in `mode`. */
function everyString(mode: UiMode): string[] {
  const strings = [...leaves(wordsFor(mode))];
  for (const state of AI_STATUS_STATES) {
    for (const action of [null, ...AI_STATUS_ACTIONS]) {
      for (const failure of state === 'stopped' || state === 'failed' ? FAILURES : [undefined]) {
        const status = statusOf(state, {
          action,
          ...(failure === undefined ? {} : { failure }),
        });
        const words = statusWords(status, mode);
        strings.push(words.text, ...(words.action === null ? [] : [words.action.label]));
      }
    }
    if (state === 'idle') {
      strings.push(statusWords(statusOf('idle', { empty: true }), mode).text);
      for (const applied of steps()) {
        strings.push(statusWords(statusOf('idle', { applied }), mode).text);
      }
    }
    if (state === 'making' || state === 'ready') {
      strings.push(statusWords(statusOf(state, { things: 0, changes: 1 }), mode).text);
      strings.push(statusWords(statusOf(state, { things: 0, changes: 0 }), mode).text);
    }
  }
  for (const failure of FAILURES) strings.push(doneSentence(failure, mode));
  for (const step of steps()) {
    const words = appliedWords(step, mode);
    strings.push(words.text, ...words.actions.map((action) => action.label));
  }
  const notice = (
    kind: Extract<AiDisplayMessage, { role: 'notice' }>['kind'],
    extra: Partial<Extract<AiDisplayMessage, { role: 'notice' }>> = {},
  ): Extract<AiDisplayMessage, { role: 'notice' }> => ({
    seq: 0,
    role: 'notice',
    kind,
    text: 'Stopped.',
    ...extra,
  });
  for (const kind of ['cancelled', 'limit', 'refusal', 'max_tokens', 'no_key', 'error'] as const) {
    const words = noticeWords(notice(kind), mode);
    strings.push(words.text, ...words.actions.map((action) => action.label));
  }
  strings.push(
    noticeWords(
      notice('fallback', { text: 'claude-opus-5-5 declined this request; x answered.' }),
      mode,
    ).text,
  );
  for (const name of AI_TOOL_NAMES) {
    for (const result of [undefined, '{"counts":{"error":0}}', '{"counts":{"error":2}}']) {
      const line = toolLine(
        { name, input: SAMPLE_INPUTS[name] ?? {}, ...(result === undefined ? {} : { result }) },
        mode,
      );
      if (line !== null) strings.push(line);
    }
  }
  strings.push(
    readySentence(2, 6, mode),
    readySentence(0, 1, mode),
    nothingAppliedWords(0, mode),
    nothingAppliedWords(2, mode),
    discardedWords(mode),
    applyFailedWords('ENOENT: demo:x', mode),
    modelChangeWords('Opus 5.5', mode),
    fallbackWords('claude-opus-5-5', 'claude-sonnet-5-5', mode),
    closedPlanWords('Ruby tools', 2, 3, true),
    closedPlanWords('Ruby tools', 0, 3, false),
    reviewHeading({ things: 2, files: 6, kept: 9, total: 9 }, mode),
    explainChip(
      { code: 'blocks-items.missing-texture', elementId: 'demo:ruby_sword' },
      'Ruby Sword',
      'A picture is missing.',
      mode,
    ),
  );
  if (mode !== 'advanced') {
    strings.push(
      planLineWords(
        { name: 'Ruby Pickaxe', what: 'Tool', kind: 'msm:item', elementId: 'demo:ruby_pickaxe' },
        mode,
      ),
    );
  }
  for (const model of AI_MODEL_IDS) {
    const sentence = costSentence(usage, model, mode);
    if (sentence !== null) strings.push(sentence);
  }
  strings.push(...EXAMPLE_ASKS.map((ask) => ask.text));
  return strings;
}

describe('ai-words', () => {
  it('shows no forbidden word and no id in any Very easy string', () => {
    const strings = everyString('very-easy');
    expect(strings.length).toBeGreaterThan(200);
    const offending = strings
      .map((text) => ({ text, found: forbiddenIn(text) }))
      .filter((entry) => entry.found.length > 0);
    expect(offending).toEqual([]);
  });

  it('has a non-empty line for every state in every mode', () => {
    for (const mode of WORDS_MODES) {
      for (const state of AI_STATUS_STATES) {
        expect(statusWords(statusOf(state), mode).text.trim(), `${mode} ${state}`).not.toBe('');
      }
      for (const action of AI_STATUS_ACTIONS) {
        expect(wordsFor(mode).actions[action].trim(), `${mode} ${action}`).not.toBe('');
      }
      for (const text of everyString(mode)) {
        expect(text.trim(), mode).not.toBe('');
        // British English without emojis.
        expect(text, mode).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(text, mode).not.toMatch(/\b(color|behavior|favorite|armor)\b/i);
      }
    }
  });

  it('finds an id and the forbidden words where they are', () => {
    expect(forbiddenIn('Made gem_mod:ruby_sword')).toEqual(['gem_mod:ruby_sword']);
    expect(forbiddenIn('The JSON of the element')).toEqual(['json', 'element']);
    expect(forbiddenIn('Ruby Pickaxe, a tool')).toEqual([]);
  });

  it('says the wording table’s words', () => {
    const veryEasy = wordsFor('very-easy');
    const advanced = wordsFor('advanced');
    expect(veryEasy.emptyTitle).toBe('What would you like to make?');
    expect(veryEasy.newChat).toBe('New chat');
    expect(veryEasy.showThinking).toBe(false);
    expect(wordsFor('easy').showThinking).toBe(true);
    expect(veryEasy.review.add).toBe('Add to my mod');
    expect(advanced.review.add).toBe('Apply');
    expect(veryEasy.review.throwAway).toBe('Throw away');
    expect(advanced.review.throwAway).toBe('Discard');
    expect(advanced.review.pictures).toBe('Textures');
    expect(veryEasy.explain).toBe('Ask the helper');
    expect(advanced.emptyExtra).toBe('Ask about a problem or an element.');
    expect(EXAMPLE_ASKS).toHaveLength(4);
    expect(EXAMPLE_ASKS.filter((ask) => ask.size === 'build')).toHaveLength(1);
    expect(reviewHeading({ things: 2, files: 6, kept: 9, total: 9 }, 'easy')).toBe(
      'Ready to add: 2 things, 6 files behind them',
    );
    expect(reviewHeading({ things: 2, files: 6, kept: 9, total: 9 }, 'advanced')).toBe(
      'Proposed changes (9 of 9 kept)',
    );
    expect(
      planLineWords(
        { name: 'Ruby Pickaxe', what: 'Tool', kind: 'msm:item', elementId: 'demo:ruby_pickaxe' },
        'advanced',
      ),
    ).toBe('Ruby Pickaxe, a tool (msm:item demo:ruby_pickaxe)');
    expect(
      explainChip({ code: 'x.missing' }, 'Ruby Sword', 'A picture is missing.', 'very-easy'),
    ).toBe('About: Ruby Sword, a picture is missing');
    expect(costSentence({ ...usage, requests: 0 }, 'claude-opus-5-5', 'easy')).toBeNull();
    expect(costSentence(usage, 'claude-opus-5-5', 'very-easy')).toMatch(
      /^This chat has cost (about \$\d+\.\d\d|less than \$0\.01) so far\.$/,
    );
  });

  it('words the failures with their one action', () => {
    const words = (errorClass: string, mode: UiMode = 'very-easy') =>
      noticeWords({ seq: 0, role: 'notice', kind: 'error', text: '', errorClass }, mode);
    expect(words('AuthenticationError')).toEqual({
      text: 'Your key was not accepted.',
      actions: [{ id: 'check-key', label: 'Check my key' }],
    });
    expect(words('BillingError').text).toBe(
      "Your Anthropic account has no credit left. Add credit on Anthropic's site.",
    );
    expect(words('BillingError').actions[0]?.label).toBe('Try again');
    for (const busy of ['RateLimitError', 'OverloadedError', 'InternalServerError']) {
      expect(words(busy)).toEqual({
        text: 'Anthropic is busy just now.',
        actions: [{ id: 'try-again', label: 'Try again' }],
      });
    }
    expect(words('APIConnectionError').text).toBe(
      'No connection to Anthropic. Check the internet.',
    );
    expect(words('TimeoutError').actions[0]?.id).toBe('try-again');
    expect(words('ContextWindowExceeded').actions[0]).toEqual({
      id: 'new-chat',
      label: 'New chat',
    });
    expect(words('AuthenticationError', 'advanced').text).toBe(
      'Your key was not accepted. (AuthenticationError)',
    );
    expect(doneSentence({ reason: 'refusal', explanation: 'Not this.' }, 'advanced')).toBe(
      "The helper would not do that. Try asking another way. Anthropic's reason: Not this.",
    );
    expect(doneSentence({ reason: 'refusal', explanation: 'Not this.' }, 'easy')).toBe(
      'The helper would not do that. Try asking another way.',
    );
  });

  it('shows only the plain tool lines in Very easy and Easy, and every line in Advanced', () => {
    const line = (name: string, mode: UiMode, result?: string) =>
      toolLine(
        { name, input: SAMPLE_INPUTS[name] ?? {}, ...(result === undefined ? {} : { result }) },
        mode,
      );
    expect(line('create_elements', 'very-easy')).toBe('Made Ruby Sword');
    expect(line('run_checks', 'easy', '{"counts":{"error":0}}')).toBe('Checked: no problems');
    expect(line('note_missing_feature', 'very-easy')).toBe(
      'Wrote down a wish: Set the player’s speed',
    );
    expect(line('checkpoint', 'easy')).toBe('Finished: The sword is made.');
    expect(line('read_element', 'very-easy')).toBeNull();
    expect(line('run_checks', 'very-easy')).toBeNull();
    for (const name of AI_TOOL_NAMES) {
      expect(line(name, 'advanced'), name).not.toBeNull();
      expect(line(name, 'advanced'), name).not.toMatch(/^Used /);
    }
    expect(line('read_element', 'advanced')).toBe('Read `demo:ruby_sword`');
    expect(line('checkpoint', 'advanced')).toBe('Finished a step: The sword is made.');
  });
});
