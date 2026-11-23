// @vitest-environment happy-dom
/**
 * The search panel's words per mode (B663; ADR 0124 D11 and its findings on the
 * plan's "Very easy wording"): the fixed words of each mode, the examples taken from the fixed query set, the
 * headings equal to the engine's, the chips, the buttons, the plain text of Very easy, removing a
 * chip's words, and, over the real engine and the built-in plugins, every result of every query
 * of the fixed set shown in Very easy with no id and none of the words template, element,
 * starter, kind, namespace or JSON.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTION_TITLES, type SearchAnswer, type SearchHit } from '@msm/search';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import { SearchClient, type SearchWorkerLike } from '../../../src/renderer/src/search/client';
import { createSearchHost } from '../../../src/renderer/src/search/host';
import { gatherSearchData } from '../../../src/renderer/src/search/plugin-data';
import { SearchPanel } from '../../../src/renderer/src/search/SearchPanel';
import { collectStatic } from '../../../src/renderer/src/search/sources';
import { projectEntries, projectThings } from '../../../src/renderer/src/search/sources/project';
import {
  parseVanillaRegistries,
  type VanillaRegistries,
  vanillaLayer,
} from '../../../src/renderer/src/search/sources/vanilla';
import { textWithout } from '../../../src/renderer/src/search/UnderstoodChips';
import {
  actionsFor,
  answerWords,
  chipText,
  liveSentence,
  plainText,
  readPrefix,
  rowText,
  SCOPE_LABELS,
  SEARCH_WORDS,
  SECTION_HEADINGS,
  searchForbiddenIn,
  showMoreLabel,
} from '../../../src/renderer/src/search/wording';
import { BLUE, BLUE_SWORD_HIT, entry, hit, TEMPLATE, WEAPON } from './panel-fixtures';

afterEach(cleanup);

type StaticInput = Parameters<typeof collectStatic>[0];

/**
 * The search tests' shared fixtures (`test/search/fixtures.ts`: the app's lists as the doors hand
 * them in, a made-up names file, a small project), loaded by path at run time: that file belongs
 * to the Node test project, not to this one.
 */
interface SearchFixtures {
  appLists(): Promise<StaticInput['lists']>;
  factsOf(id: string): StaticInput['target'];
  madeUpNames(): Parameters<typeof vanillaLayer>[1];
  projectWith(
    elements: { id: `${string}:${string}`; kind: string; data?: unknown }[],
  ): NonNullable<Parameters<typeof projectEntries>[0]['project']>;
}
const FIXTURES = '../../search/fixtures';

/**
 * A target's vendored registries (as `test/search/fixtures.ts` reads them, through the path: the
 * happy-dom window's `URL` is not one `readFileSync` takes).
 */
function registriesOf(id: string): VanillaRegistries {
  const bundle = builtInTargets.find((candidate) => candidate.target.id === id);
  if (bundle === undefined) throw new Error(`No target ${id}`);
  const url = String(bundle.vendored.mcmetaRegistries);
  const inRepo = url.slice(url.indexOf('/packages/targets/') + 1);
  const path = url.startsWith('file:')
    ? fileURLToPath(url)
    : join(import.meta.dirname, '..', '..', '..', '..', decodeURIComponent(inRepo));
  return parseVanillaRegistries(JSON.parse(readFileSync(path, 'utf8')));
}

interface GoldenQuery {
  readonly q: string;
  readonly mode: 'very-easy' | 'easy' | 'advanced';
}

const GOLDEN: readonly GoldenQuery[] = (
  JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'search', 'golden-queries.json'), 'utf8'),
  ) as { queries: GoldenQuery[] }
).queries;

/**
 * Every Very easy string must pass the AI helper's check (`forbiddenIn`: ids and its words) and
 * the search's own words. The AI helper's words count as whole words: its check finds "api" in
 * "Lapis ore" and "Leaping", Minecraft's own names, which Very easy shows.
 */
const veryEasyProblems = (text: string): string[] => {
  const kept = text.replace(/smithing templates?/gi, '');
  const ai = forbiddenIn(kept).filter(
    (word) => word.includes(':') || new RegExp(`\\b${word}s?\\b`, 'i').test(kept),
  );
  return [...new Set([...ai, ...searchForbiddenIn(text)])];
};

/** Every text node's words (`textContent` would join "I understood:" and "blue" into an id). */
function textNodes(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? '';
    if (text !== '') out.push(text);
  }
  return out;
}

describe('the fixed words of each mode', () => {
  it("says the plan's Very easy sentences", () => {
    const words = SEARCH_WORDS['very-easy'];
    expect(words.placeholder.start).toBe('What do you want to make?');
    expect(words.placeholder.toolbar).toBe('Search or make anything');
    expect(words.understoodLead).toBe('I understood:');
    expect(words.closest).toBe('Closest things');
    expect(words.nothingClose).toBe(
      'Nothing close to that yet. Try other words, or add it to your Wishlist.',
    );
    expect(words.minecraftFolder).toBe(
      "Set up your Minecraft folder to see Minecraft's own names and pictures.",
    );
    expect(words.privacy).toBe('Nothing you type here leaves your computer.');
    expect(words.askAi).toBe('Ask the AI helper');
    expect(words.hint).toBeNull();
    expect(SEARCH_WORDS.advanced.hint).toContain('>');
  });

  it('takes the examples of every mode from the fixed query set', () => {
    const queries = new Set(GOLDEN.map((query) => query.q));
    for (const words of Object.values(SEARCH_WORDS)) {
      expect(words.examples).toHaveLength(3);
      for (const example of words.examples) expect(queries.has(example), example).toBe(true);
    }
  });

  it('heads the sections as the engine names them', () => {
    expect(SECTION_HEADINGS).toEqual(SECTION_TITLES);
  });

  it('keeps every fixed Very easy string free of ids and technical words', () => {
    const words = SEARCH_WORDS['very-easy'];
    const strings = [
      ...Object.values(words).filter((value): value is string => typeof value === 'string'),
      ...Object.values(words.placeholder),
      ...words.examples,
      ...Object.values(SECTION_HEADINGS),
      ...Object.values(SCOPE_LABELS),
      showMoreLabel('very-easy', 12),
    ];
    for (const text of strings) expect(veryEasyProblems(text), text).toEqual([]);
    expect(showMoreLabel('very-easy', 12)).toBe('Show more');
    expect(showMoreLabel('easy', 12)).toBe('Show more (12)');
  });
});

describe('the buttons', () => {
  const kinds = [
    ['flow', { type: 'flow', starter: 'weapon' }],
    ['starter', { type: 'starter', starter: 'x' }],
    ['example', { type: 'example', example: 'x' }],
    ['template', { type: 'template', template: 'x', kind: 'msm:item' }],
    ['kind', { type: 'kind', kind: 'msm:item' }],
    ['project', { type: 'element', element: 'gems:ruby' }],
    ['vanilla', { type: 'vanilla', id: 'minecraft:pig', sort: 'mob' }],
    ['rule', { type: 'rule-part', part: 'trigger', id: 'x' }],
    ['setting', { type: 'setting', setting: 'x' }],
    ['command', { type: 'command', command: 'save' }],
    ['guide', { type: 'guide', page: 'creator', anchor: 'x' }],
    ['problem', { type: 'problem', code: 'x' }],
    ['tile', { type: 'surprise' }],
  ] as const;

  it("follows ADR 0124 D9's table, per mode and with or without a mod", () => {
    const labels = (mode: 'very-easy' | 'easy' | 'advanced', hasMod: boolean) =>
      Object.fromEntries(
        kinds.map(([source, action]) => [
          action.type,
          actionsFor(entry('x', source, 'X', { action }), { mode, hasMod }).map((b) => b.label),
        ]),
      );
    expect(labels('very-easy', true)).toEqual({
      flow: ['Make this', 'Add to my mod'],
      starter: ['Add to my mod'],
      example: ['Add to my mod', 'See the example'],
      template: ['Add to my mod'],
      kind: ['Make a new one', 'Show mine'],
      element: ['Open', 'Rename'],
      vanilla: ['Make something with it'],
      'rule-part': ['Add this rule'],
      setting: ['Open'],
      command: ['Run'],
      guide: ['Show me how'],
      problem: ['Show me'],
      surprise: ['Surprise me'],
    });
    expect(labels('very-easy', false)).toMatchObject({
      flow: ['Make this', 'Start a mod with this'],
      starter: ['Start a mod with this'],
      kind: ['Make a new one'],
    });
    expect(labels('advanced', true)).toMatchObject({
      element: ['Open', 'Rename', 'Find usages', 'Edit in Creator'],
      vanilla: ['Make something with it', 'Copy id'],
    });
    const problem = entry('x', 'problem', 'X', { action: { type: 'problem', code: 'x' } });
    expect(actionsFor(problem, { mode: 'easy', hasMod: true, canFix: true })[0]?.label).toBe(
      'Fix it',
    );
    expect(
      actionsFor(entry('x', 'flow', 'X', { available: false }), { mode: 'easy', hasMod: true }),
    ).toEqual([]);
  });
});

describe('rows and chips per mode', () => {
  it('reads a flow with answers as a sentence; Advanced adds the id and the colour code', () => {
    const veryEasy = rowText(BLUE_SWORD_HIT, BLUE, 'very-easy');
    expect(veryEasy).toMatchObject({
      title: 'Weapon',
      detail: 'Sword, blue, called Blue Sword.',
      id: null,
      source: { word: 'Make', picture: 'make' },
    });
    expect(answerWords(BLUE_SWORD_HIT, BLUE, 'very-easy').find((a) => a.swatch)).toMatchObject({
      swatch: '#3c44aa',
    });
    const advanced = rowText(BLUE_SWORD_HIT, BLUE, 'advanced');
    expect(advanced.detail).toBe('Sword, blue (#3c44aa), called Blue Sword.');
    expect(advanced.id).toBe('flow:weapon');
    expect(rowText(hit(WEAPON), BLUE, 'easy').detail).toBe(WEAPON.sentence);
  });

  it("names a row's source by a word in every mode, without the technical words in Very easy", () => {
    expect(rowText(hit(TEMPLATE), BLUE, 'very-easy')).toMatchObject({
      title: 'Sword pattern',
      source: { word: 'Make' },
      detail: 'A sword thing with item data.',
    });
    expect(rowText(hit(TEMPLATE), BLUE, 'easy')).toMatchObject({
      title: 'Sword template',
      source: { word: 'Template' },
      detail: 'A sword element with msm:item data.',
    });
    const kind = entry('kind:msm:item', 'kind', 'Items', { ids: ['msm:item'] });
    expect(rowText(hit(kind), BLUE, 'advanced')).toMatchObject({
      source: { word: 'Kind' },
      id: 'msm:item',
    });
    expect(rowText(hit(kind), BLUE, 'easy').source.word).toBe('Studio');
  });

  it('says chips plainly, and what each is in Advanced', () => {
    expect(chipText({ text: 'blue', kind: 'colour' }, 'very-easy').text).toBe('blue');
    expect(chipText({ text: 'blue', kind: 'colour' }, 'advanced').text).toBe('colour: blue');
    expect(chipText({ text: 'drops xp', kind: 'behaviour' }, 'advanced').text).toBe(
      'does: drops xp',
    );
    expect(chipText({ text: 'minecraft:pig', kind: 'thing' }, 'very-easy').text).toBe('pig');
    expect(chipText({ text: 'zzzz', kind: 'not-understood', struck: true }, 'easy')).toEqual({
      text: 'zzzz',
      removeLabel: 'Remove zzzz',
      struck: true,
    });
  });

  it('rewrites ids and technical words for Very easy and leaves the other modes alone', () => {
    expect(
      plainText('Runs <namespace>:load when the data pack loads (#minecraft:load).', 'very-easy'),
    ).toBe('Runs load when the data pack loads (load).');
    expect(plainText('New element', 'very-easy')).toBe('New thing');
    expect(plainText('Toggle Raw JSON', 'very-easy')).toBe('Toggle File text');
    expect(plainText('Netherite upgrade smithing template', 'very-easy')).toBe(
      'Netherite upgrade smithing template',
    );
    expect(plainText('Sulfur cube kinds', 'very-easy')).toBe('Sulfur cube sorts');
    expect(plainText('New element', 'easy')).toBe('New element');
    // Minecraft's own names keep their words: "api" inside "Lapis" is no technical word.
    expect(plainText('Deepslate lapis ore', 'very-easy')).toBe('Deepslate lapis ore');
    expect(plainText('Strong leaping', 'very-easy')).toBe('Strong leaping');
    expect(searchForbiddenIn('The API key')).toEqual(['api']);
  });

  it('reads the live region in every mode', () => {
    const base = { text: 'blue sword', count: 4, first: BLUE_SWORD_HIT, understood: BLUE };
    expect(liveSentence({ ...base, mode: 'very-easy', confident: true })).toBe(
      '4 results. Best match: Weapon.',
    );
    expect(liveSentence({ ...base, mode: 'easy', confident: false })).toBe(
      '4 results. Closest things: Weapon.',
    );
    expect(liveSentence({ ...base, mode: 'advanced', count: 0, confident: false })).toBe(
      'Nothing close to that yet. Try other words, or add it to your Wishlist.',
    );
    expect(liveSentence({ ...base, mode: 'easy', text: ' ', confident: true })).toBe('');
  });

  it('reads prefixes for everyone (ADR 0130)', () => {
    expect(readPrefix('> export', 'advanced')).toEqual({ scope: 'commands', text: 'export' });
    expect(readPrefix('@ruby', 'advanced')).toEqual({ scope: 'mine', text: 'ruby' });
    expect(readPrefix('#pig', 'advanced')).toEqual({ scope: 'minecraft', text: 'pig' });
    expect(readPrefix('?recipe', 'advanced')).toEqual({ scope: 'help', text: 'recipe' });
    expect(readPrefix('?recipe', 'easy')).toEqual({ scope: 'help', text: 'recipe' });
    expect(readPrefix('@ruby')).toEqual({ scope: 'mine', text: 'ruby' });
  });
});

describe('removing a chip', () => {
  it.each([
    ['blue sword', 'blue', 'sword'],
    ['Blue swords', 'blue', 'swords'],
    ['custom ore that drops xp', 'drops xp', 'custom ore'],
    ['a sword called "Ruby"', 'Ruby', 'a sword'],
    ['qwerty uiop', 'uiop', 'qwerty'],
    ['café sword', 'cafe', 'sword'],
    ['a pig that flies', 'flying', 'a pig that flies'],
    ['blue colored lights', 'colored', 'blue lights'],
  ])('%s without %s reads %s', (text, chip, out) => {
    expect(textWithout(text, chip)).toBe(out);
  });
});

describe('the whole query set in Very easy', () => {
  const answers = new Map<string, SearchAnswer>();
  const opened = new Map<string, SearchAnswer>();
  beforeAll(async () => {
    const { appLists, factsOf, madeUpNames, projectWith } = (await import(
      /* @vite-ignore */ FIXTURES
    )) as SearchFixtures;
    const target = builtInTargets[builtInTargets.length - 1]?.target.id as string;
    const lists = await appLists();
    const data = await gatherSearchData(builtInPlugins);
    const worker: SearchWorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(message) {
        host.receive(message);
      },
      terminate() {},
    };
    const host = createSearchHost((message) => worker.onmessage?.({ data: message }), {
      schedule: (run) => run(),
    });
    const client = new SearchClient({ createWorker: () => worker });
    client.setStatic(
      collectStatic({ plugins: builtInPlugins, target: factsOf(target), data, lists }),
    );
    const vanilla = vanillaLayer(registriesOf(target), madeUpNames());
    client.setLayer('vanilla', vanilla.entries, {
      things: vanilla.things,
      protect: vanilla.protect,
    });
    const project = projectWith([
      { id: 'gems:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
      { id: 'gems:ruby_block', kind: 'msm:block', data: { display_name: 'Block of Ruby' } },
    ]);
    client.setLayer('project', projectEntries({ project, problems: [] }), {
      things: projectThings(project),
    });
    for (const { q } of GOLDEN) {
      const shown = await client.query({ text: q, mode: 'very-easy' });
      const all = await client.query({ text: q, mode: 'very-easy', limit: 50 });
      if (shown === null || all === null) throw new Error(`No answer to ${q}`);
      answers.set(q, shown);
      opened.set(q, all);
    }
  }, 60_000);

  it('gives every row, sentence, answer, behaviour and button plain words', () => {
    const problems: string[] = [];
    let rows = 0;
    for (const { q } of GOLDEN) {
      const answer = opened.get(q) as SearchAnswer;
      const hits: SearchHit[] = [...answer.best, ...answer.sections.flatMap((s) => s.hits)];
      for (const found of hits) {
        rows++;
        const text = rowText(found, answer.understood, 'very-easy');
        const strings = [
          text.title,
          text.detail ?? '',
          text.behaviour ?? '',
          text.reason ?? '',
          text.source.word,
          ...text.answers.map((a) => a.text),
          ...[true, false].flatMap((hasMod) =>
            actionsFor(found.entry, { mode: 'very-easy', hasMod }).map((b) => b.label),
          ),
        ];
        for (const value of strings) {
          const bad = veryEasyProblems(value);
          if (bad.length > 0)
            problems.push(`${q} / ${found.entry.id}: ${value} (${bad.join(', ')})`);
        }
      }
      for (const chip of answer.understood.chips) {
        const bad = veryEasyProblems(chipText(chip, 'very-easy').text);
        if (bad.length > 0) problems.push(`${q} / chip ${chip.text} (${bad.join(', ')})`);
      }
    }
    expect(rows).toBeGreaterThan(1000);
    expect(problems).toEqual([]);
  });

  it.each(GOLDEN.map((query) => query.q))(
    'draws the panel of "%s" in Very easy with no id or technical word anywhere',
    async (q) => {
      const answer = answers.get(q) as SearchAnswer;
      render(
        <SearchPanel
          query={() => Promise.resolve(answer)}
          mode="very-easy"
          door="start"
          hasMod={false}
          initialText={q}
          delayMs={0}
          reducedMotion
          onAction={() => {}}
          onWishlist={() => {}}
          onAskAi={() => {}}
          minecraftNames={false}
        />,
      );
      await waitFor(() => expect(screen.getByTestId('search-live').textContent).not.toBe(''));
      const panel = screen.getByTestId('search-panel');
      const shown = [
        ...textNodes(panel),
        ...[...panel.querySelectorAll('[aria-label]')].map(
          (el) => el.getAttribute('aria-label') ?? '',
        ),
      ];
      expect(shown.flatMap(veryEasyProblems)).toEqual([]);
      expect(panel.querySelector('[data-testid="search-row-id"]')).toBeNull();
    },
  );
});
