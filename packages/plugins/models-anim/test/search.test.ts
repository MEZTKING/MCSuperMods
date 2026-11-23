/**
 * The plugin's search data (B655, ADR 0124 D5, D13): it passes `validateSearchContributions`
 * with the built-in limits and no problem at all, names only the plugin's own things, gives
 * plain words to every kind and template, keeps its words tidy, and names only vanilla ids that both
 * built-in targets have.
 */
import { readFile } from 'node:fs/promises';
import {
  BUILT_IN_SEARCH_LIMITS,
  type PluginSearchData,
  searchOwnThingsOf,
  validateSearchContributions,
} from '@msm/plugin-api';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import plugin from '../src/index';
import { SEARCH } from '../src/search';

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
