/**
 * The plugin's search data (B655, ADR 0124 D5, D13): it passes `validateSearchContributions`
 * with the built-in limits and no problem at all, names only the plugin's own things, gives
 * plain words to every kind and template, keeps its words tidy, and names only vanilla ids that both
 * built-in targets have; every behaviour's rule, with a project subject of its sort in place of
 * `$thing`, validates against `rules.mcdoc` and compiles with the plugin's own compiler on both
 * targets.
 */
import { readFile } from 'node:fs/promises';
import type { Json, JsonObject, SearchBehaviourSubject, TargetFacts } from '@msm/plugin-api';
import {
  BUILT_IN_SEARCH_LIMITS,
  type PluginSearchData,
  searchOwnThingsOf,
  validateSearchContributions,
} from '@msm/plugin-api';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import plugin, { compileRuleBook, triggerById } from '../src/index';
import { SEARCH } from '../src/search';
import { THING } from '../src/search/behaviours';
import { blockingProblems, book, indexesFor, PROJECT } from './support';

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

/** Every string of the search data's word lists, with where it is. */
function allWords(data: PluginSearchData): { where: string; word: string }[] {
  const out: { where: string; word: string }[] = [];
  const add = (where: string, words: readonly string[] | undefined) => {
    for (const word of words ?? []) out.push({ where, word });
  };
  for (const group of data.vocabulary?.words ?? []) {
    add(`group ${group.idea}`, [group.idea]);
    add(`group ${group.idea}`, group.same);
    add(`group ${group.idea}`, group.near);
    add(`group ${group.idea}`, group.slang);
    add(`group ${group.idea}`, group.phrases);
    add(`group ${group.idea}`, group.misspellings);
  }
  for (const colour of data.vocabulary?.colours ?? []) add(`colour ${colour.colour}`, colour.names);
  for (const behaviour of data.behaviours ?? [])
    add(`behaviour ${behaviour.id}`, behaviour.phrases);
  for (const entry of data.entries ?? []) add(`entry ${entry.id}`, entry.words);
  for (const [id, words] of Object.entries(data.keywords ?? {})) add(`keywords ${id}`, words);
  return out;
}

/** The vanilla ids the vocabulary names. */
const vanillaIds = (data: PluginSearchData): string[] =>
  (data.vocabulary?.words ?? []).flatMap((group) => group.vanillaIds ?? []);

describe(`${plugin.id} search data (B655)`, () => {
  const registries = new Map<string, ReadonlySet<string>>();

  beforeAll(async () => {
    for (const bundle of builtInTargets) {
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      registries.set(
        bundle.target.id,
        new Set(Object.values(vanilla).flatMap((ids) => ids.map((id) => `minecraft:${id}`))),
      );
    }
  });

  it('is what searchData returns', async () => {
    expect(await plugin.contributes.searchData?.()).toBe(SEARCH);
  });

  it('passes validateSearchContributions with the built-in limits and no problem', () => {
    const { data, problems } = validateSearchContributions(
      SEARCH,
      searchOwnThingsOf(plugin.contributes),
      BUILT_IN_SEARCH_LIMITS,
    );
    expect(problems).toEqual([]);
    expect(data).toEqual(SEARCH);
  });

  it('gives plain words to every kind and template of the plugin', () => {
    const missing = [
      ...(plugin.contributes.elementKinds ?? []).map((kind) => kind.id),
      ...(plugin.contributes.elementTemplates ?? []).map((template) => template.id),
    ].filter((id) => (SEARCH.keywords?.[id] ?? []).length === 0);
    expect(missing).toEqual([]);
  });

  it('keeps its words trimmed, lower case and without repeats in one list', () => {
    const untidy = allWords(SEARCH).filter(
      ({ word }) => word !== word.trim() || /\s{2}/.test(word) || word !== word.toLowerCase(),
    );
    expect(untidy).toEqual([]);
    const repeats: string[] = [];
    const lists: [string, readonly string[]][] = [
      ...Object.entries(SEARCH.keywords ?? {}),
      ...(SEARCH.vocabulary?.words ?? []).map(
        (group) =>
          [
            `group ${group.idea}`,
            [
              group.idea,
              ...group.same,
              ...(group.near ?? []),
              ...(group.slang ?? []),
              ...(group.phrases ?? []),
              ...(group.misspellings ?? []),
            ],
          ] as [string, readonly string[]],
      ),
    ];
    for (const [where, words] of lists) {
      const seen = new Set<string>();
      for (const word of words) {
        if (seen.has(word)) repeats.push(`${where}: ${word}`);
        seen.add(word);
      }
    }
    expect(repeats).toEqual([]);
    const ideas = (SEARCH.vocabulary?.words ?? []).map((group) => group.idea);
    expect(new Set(ideas).size).toBe(ideas.length);
  });

  it('names only vanilla ids both built-in targets have', () => {
    expect(registries.size).toBe(builtInTargets.length);
    for (const [targetId, known] of registries) {
      const unknown = vanillaIds(SEARCH).filter((id) => !known.has(id));
      expect(unknown, targetId).toEqual([]);
    }
  });
});

/** A project subject of each sort, from the test project (`support.ts`). */
const SUBJECTS: Record<SearchBehaviourSubject, string> = {
  block: 'demo:plain_block',
  item: 'demo:wand',
  mob: 'demo:guard',
  vehicle: 'demo:tank',
};

/** The trigger subject sort that names each sort of made thing. */
const SUBJECT_SORT: Record<SearchBehaviourSubject, string> = {
  block: 'block',
  item: 'item',
  mob: 'mob',
  vehicle: 'vehicle',
};

/** `value` with every `$thing` string replaced by `id`. */
const withSubject = (value: Json, id: string): Json =>
  JSON.parse(JSON.stringify(value).replaceAll(JSON.stringify(THING), JSON.stringify(id))) as Json;

describe('rules behaviours (B655)', () => {
  const behaviours = SEARCH.behaviours ?? [];

  it('has one rule per behaviour, on the made thing, by a trigger of its sort', () => {
    expect(behaviours.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    for (const behaviour of behaviours) {
      expect(behaviour.appliesTo, behaviour.id).toHaveLength(1);
      const sort = behaviour.appliesTo[0] as SearchBehaviourSubject;
      const rule = behaviour.rule as JsonObject;
      expect(rule, behaviour.id).toBeDefined();
      expect(
        behaviour.flows ?? behaviour.answers ?? behaviour.beside,
        behaviour.id,
      ).toBeUndefined();
      const when = rule.when as JsonObject;
      expect(when.subject, behaviour.id).toBe(THING);
      const trigger = triggerById(String(when.trigger));
      expect(trigger?.subject, behaviour.id).toBe(SUBJECT_SORT[sort]);
      expect(trigger?.subjectKinds.length, behaviour.id).toBeGreaterThan(0);
      expect(String(rule.key), behaviour.id).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(keys.has(String(rule.key)), behaviour.id).toBe(false);
      keys.add(String(rule.key));
    }
  });

  for (const bundle of builtInTargets) {
    const target = bundle.target as TargetFacts;
    it(`every rule validates against rules.mcdoc and compiles on ${target.id}`, async () => {
      const indexes = await indexesFor(bundle);
      const failures: { id: string; problems: unknown[] }[] = [];
      for (const behaviour of behaviours) {
        const sort = behaviour.appliesTo[0] as SearchBehaviourSubject;
        const rule = withSubject(behaviour.rule as Json, SUBJECTS[sort]);
        const data: Json = { counters: [], format: 1, rules: [rule] };
        const schema = blockingProblems(indexes, 'msm:rules', data);
        const compiled = compileRuleBook(book([rule]), PROJECT, target);
        if (schema.length > 0 || compiled.problems.length > 0) {
          failures.push({ id: behaviour.id, problems: [...schema, ...compiled.problems] });
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
