import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_SEARCH_LIMITS,
  definePlugin,
  type PluginSearchData,
  type SearchOwnThings,
  searchOwnThingsOf,
  THIRD_PARTY_SEARCH_LIMITS,
  validateSearchContributions,
} from '../src/index';

const own: SearchOwnThings = {
  kinds: ['test:greeting'],
  templates: ['greeting'],
  starters: ['greeter'],
  examples: ['hello-example'],
  commands: ['test.say-hello'],
  questions: { greeter: { name: [], colour: [], style: ['loud', 'quiet'] } },
};

const good: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'greeting',
        same: ['hello', 'hi'],
        near: ['welcome'],
        slang: ['yo'],
        phrases: ['says hello'],
        misspellings: ['greating'],
        vanillaIds: ['minecraft:bell'],
      },
    ],
    colours: [{ names: ['sky blue'], colour: '#3ab3da' }],
  },
  behaviours: [
    {
      id: 'shouts',
      phrases: ['shouts'],
      sentence: 'It greets every player loudly.',
      appliesTo: ['block'],
      answers: { greeter: { style: 'loud' } },
    },
  ],
  entries: [
    {
      id: 'loud-greeting',
      title: 'Loud greeting',
      sentence: 'A greeting that shouts.',
      words: ['shout'],
      opens: { type: 'starter', id: 'greeter', values: { style: 'loud' } },
    },
  ],
  keywords: { greeting: ['salute'], 'test:greeting': ['message'] },
  questions: {
    greeter: {
      name: { role: 'name', after: ['called'] },
      colour: { role: 'main-colour', sameAs: 'name' },
      style: { choiceWords: { loud: ['shouting'] }, appliesWhen: { colour: ['#3ab3da'] } },
    },
  },
};

describe('validateSearchContributions (1.23.0)', () => {
  it('keeps well-formed data unchanged and copies it', () => {
    const result = validateSearchContributions(good, own);
    expect(result.problems).toEqual([]);
    expect(result.data).toEqual(good);
    expect(result.data.vocabulary?.words?.[0]).not.toBe(good.vocabulary?.words?.[0]);
  });

  it('treats no data as empty and never throws on odd input', () => {
    expect(validateSearchContributions(undefined, own)).toEqual({ data: {}, problems: [] });
    for (const odd of [42, 'words', [], () => ({}), new Map()]) {
      const result = validateSearchContributions(odd, own);
      expect(result.data).toEqual({});
      expect(result.problems.map((p) => p.code)).toEqual(['search.shape']);
    }
  });

  it('drops malformed lines with a pointer to each', () => {
    const result = validateSearchContributions(
      {
        vocabulary: {
          words: [
            { idea: '', same: [] },
            { idea: 'ok', same: ['fine'] },
            { idea: 'id', same: [], vanillaIds: ['Stone'] },
            { idea: 'long', same: ['x'.repeat(65)] },
          ],
          colours: [
            { names: ['red'], colour: '#FF0000' },
            { names: [], colour: '#ff0000' },
          ],
        },
      },
      own,
    );
    expect(result.data.vocabulary?.words).toEqual([{ idea: 'ok', same: ['fine'] }]);
    expect(result.data.vocabulary?.colours).toEqual([]);
    expect(result.problems.map((p) => [p.code, p.path])).toEqual([
      ['search.word', '/vocabulary/words/0/idea'],
      ['search.vanilla-id', '/vocabulary/words/2/vanillaIds/0'],
      ['search.word', '/vocabulary/words/3/same'],
      ['search.colour', '/vocabulary/colours/0/colour'],
      ['search.word', '/vocabulary/colours/1/names'],
    ]);
    expect(result.problems.every((p) => p.severity === 'error')).toBe(true);
  });

  it('refuses entries, keywords and hints about another plugin’s things', () => {
    const result = validateSearchContributions(
      {
        entries: [
          {
            id: 'steal',
            title: 'Blue sword',
            sentence: 'Points at the library.',
            opens: { type: 'starter', id: 'weapon' },
          },
          { id: 'bad-type', title: 'X', sentence: 'X.', opens: { type: 'page', id: 'greeter' } },
        ],
        keywords: { weapon: ['blade'] },
        questions: { weapon: {}, greeter: { size: {}, style: { choiceWords: { soft: ['x'] } } } },
      },
      own,
    );
    expect(result.data).toEqual({ entries: [], keywords: {}, questions: { greeter: {} } });
    expect(result.problems.map((p) => [p.code, p.path])).toEqual([
      ['search.not-own', '/entries/0/opens/id'],
      ['search.shape', '/entries/1/opens'],
      ['search.not-own', '/keywords/weapon'],
      ['search.not-own', '/questions/greeter/size'],
      ['search.not-own', '/questions/greeter/style/choiceWords/soft'],
      ['search.not-own', '/questions/weapon'],
    ]);
  });

  it('lets built-in behaviours name other plugins’ flows, not third-party ones', () => {
    const behaviours = [
      {
        id: 'sets-on-fire',
        phrases: ['sets mobs on fire'],
        sentence: 'Hitting a mob sets it on fire.',
        appliesTo: ['item'],
        beside: { starter: 'enchantment', values: { effect: 'fire' } },
      },
    ];
    const builtIn = validateSearchContributions({ behaviours }, own, BUILT_IN_SEARCH_LIMITS);
    expect(builtIn.problems).toEqual([]);
    expect(builtIn.data.behaviours).toEqual(behaviours);
    const thirdParty = validateSearchContributions({ behaviours }, own);
    expect(thirdParty.data.behaviours).toEqual([]);
    expect(thirdParty.problems.map((p) => [p.code, p.path])).toEqual([
      ['search.not-own', '/behaviours/0/beside/starter'],
    ]);
  });

  it('refuses behaviours that make nothing, duplicates and values that are not JSON', () => {
    const base = { phrases: ['glows'], sentence: 'It glows.', appliesTo: ['block'] };
    const result = validateSearchContributions(
      {
        behaviours: [
          { id: 'a', ...base },
          { id: 'b', ...base, flows: ['greeter'] },
          { id: 'b', ...base, flows: ['greeter'] },
          { id: 'c', ...base, rule: { when: () => 1 } },
          { id: 'd', ...base, rule: { text: 'x'.repeat(5000) } },
          { id: 'e', ...base, appliesTo: ['player'], flows: ['greeter'] },
        ],
      },
      own,
    );
    expect(result.data.behaviours?.map((b) => b.id)).toEqual(['b']);
    expect(result.problems.map((p) => [p.code, p.path])).toEqual([
      ['search.makes-nothing', '/behaviours/0'],
      ['search.duplicate', '/behaviours/2/id'],
      ['search.value', '/behaviours/3/rule'],
      ['search.value', '/behaviours/4/rule'],
      ['search.applies-to', '/behaviours/5/appliesTo'],
    ]);
  });

  it('leaves out unknown fields and functions with a warning', () => {
    const result = validateSearchContributions(
      {
        stopWords: ['the'],
        entries: [
          {
            id: 'code',
            title: 'Code',
            sentence: 'Has a function.',
            opens: { type: 'template', id: 'greeting' },
            supports: () => true,
          },
        ],
      },
      own,
    );
    expect(result.data).toEqual({
      entries: [
        {
          id: 'code',
          title: 'Code',
          sentence: 'Has a function.',
          opens: { type: 'template', id: 'greeting' },
        },
      ],
    });
    expect(result.problems.map((p) => [p.severity, p.code, p.path])).toEqual([
      ['warning', 'search.unknown-field', '/stopWords'],
      ['warning', 'search.unknown-field', '/entries/0/supports'],
    ]);
  });

  it('drops lines past the count limits with one problem each', () => {
    const words = Array.from({ length: THIRD_PARTY_SEARCH_LIMITS.lines + 5 }, (_, i) => ({
      idea: `word${i}`,
      same: [],
    }));
    const entries = Array.from({ length: THIRD_PARTY_SEARCH_LIMITS.entries + 2 }, (_, i) => ({
      id: `entry${i}`,
      title: `Entry ${i}`,
      sentence: 'An entry.',
      opens: { type: 'command', id: 'test.say-hello' },
    }));
    const result = validateSearchContributions({ vocabulary: { words }, entries }, own);
    expect(result.data.vocabulary?.words).toHaveLength(THIRD_PARTY_SEARCH_LIMITS.lines);
    expect(result.data.entries).toHaveLength(THIRD_PARTY_SEARCH_LIMITS.entries);
    expect(result.problems.map((p) => [p.code, p.path])).toEqual([
      ['search.too-many', `/vocabulary/words/${THIRD_PARTY_SEARCH_LIMITS.lines}`],
      ['search.too-many', `/entries/${THIRD_PARTY_SEARCH_LIMITS.entries}`],
    ]);
  });

  it('exports frozen limits, the built-in ones wider', () => {
    expect(Object.isFrozen(BUILT_IN_SEARCH_LIMITS)).toBe(true);
    expect(Object.isFrozen(THIRD_PARTY_SEARCH_LIMITS)).toBe(true);
    expect(BUILT_IN_SEARCH_LIMITS).toMatchObject({ lines: 3000, behaviours: 300, entries: 300 });
    expect(THIRD_PARTY_SEARCH_LIMITS).toMatchObject({ lines: 500, behaviours: 50, entries: 50 });
    expect(THIRD_PARTY_SEARCH_LIMITS).toMatchObject({ wordLength: 64, sentenceLength: 200 });
  });
});

describe('searchOwnThingsOf (1.23.0)', () => {
  it('reads the ids and questions of a plugin’s contributions', async () => {
    const plugin = definePlugin({
      id: 'test.greeter',
      apiVersion: '^1.23.0',
      contributes: {
        commands: [{ id: 'test.say-hello', title: 'Say hello', run: () => {} }],
        projectStarters: [
          {
            id: 'greeter',
            title: 'Greeter',
            description: 'A greeting.',
            category: 'content',
            layers: ['datapack'],
            requiresKinds: [],
            parameters: [
              { id: 'name', label: 'Name', type: 'string', default: 'hello' },
              {
                id: 'style',
                label: 'Style',
                type: 'choice',
                default: 'loud',
                choices: [
                  { value: 'loud', label: 'Loud' },
                  { value: 'quiet', label: 'Quiet' },
                ],
              },
            ],
            build: () => ({ elements: [], assets: [] }),
          },
        ],
        searchData: () => Promise.resolve({ keywords: { greeter: ['welcome'] } }),
      },
    });
    const things = searchOwnThingsOf(plugin.contributes);
    expect(things).toEqual({
      kinds: [],
      templates: [],
      starters: ['greeter'],
      examples: [],
      commands: ['test.say-hello'],
      questions: { greeter: { name: [], style: ['loud', 'quiet'] } },
    });
    const result = validateSearchContributions(await plugin.contributes.searchData?.(), things);
    expect(result).toEqual({ data: { keywords: { greeter: ['welcome'] } }, problems: [] });
  });
});
