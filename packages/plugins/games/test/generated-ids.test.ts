/**
 * `gamesGeneratedIds` (B551b) against the lowering's actual output on every built-in target:
 * for each piece sample, each world setup case and each template, every id the lowered files
 * define (by folder) or make in their function lines (objectives, teams, entity tags, boss bars)
 * is listed, and no other.
 */
import type { Element, Json, OutputFile, TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  GAMES_CHECKER_CATEGORIES,
  gamesGeneratedIds,
  gamesKinds,
  piecesTemplates,
  worldSetupKind,
  worldSetupTemplates,
} from '../src/index';
import { SAMPLES } from './pieces-samples';
import { element, textOf } from './pieces-support';
import { WORLD_SETUP_CASES } from './world-setup-samples';

/** Every element the test lowers: the samples, the cases, the templates and each default. */
const ELEMENTS: readonly [string, Element][] = [
  ...SAMPLES.map(
    (sample) =>
      [`${sample.folder}/${sample.name}`, element(sample.kind, sample.id, sample.data)] as [
        string,
        Element,
      ],
  ),
  ...Object.entries(WORLD_SETUP_CASES).map(
    ([name, data]) =>
      [`world_setup/${name}`, element(worldSetupKind.id, `sky:${name}`, data)] as [string, Element],
  ),
  ...[...piecesTemplates, ...worldSetupTemplates].map(
    (template) =>
      [
        `template/${template.id}`,
        element(template.kind, `demo:${template.id}`, template.data({} as never) as Json),
      ] as [string, Element],
  ),
  ...gamesKinds.map(
    (kind) =>
      [`default/${kind.id}`, element(kind.id, 'demo:games/default', kind.defaultData as Json)] as [
        string,
        Element,
      ],
  ),
];

/** The registries a data folder below `data/<ns>/` holds, two segments deep under worldgen. */
function registryOf(rest: string): [string, string] | undefined {
  const parts = rest.split('/');
  const depth = parts[0] === 'worldgen' ? 2 : 1;
  if (parts.length <= depth) return undefined;
  return [parts.slice(0, depth).join('/'), parts.slice(depth).join('/')];
}

/** The ids the files define or make, by registry or checker category. */
function idsOfFiles(files: readonly OutputFile[], target: TargetFacts): Record<string, string[]> {
  const folderNames = new Map(
    Object.entries(target.folders.data).map(([key, folder]) => [folder, key]),
  );
  const ids = new Map<string, Set<string>>();
  const add = (category: string, id: string | undefined): void => {
    if (id === undefined) return;
    const set = ids.get(category) ?? new Set<string>();
    set.add(id);
    ids.set(category, set);
  };
  for (const file of files) {
    const match = /^data\/([^/]+)\/(.+)\.(json|mcfunction|nbt)$/.exec(file.path);
    if (match !== null) {
      const [, namespace, rest] = match as unknown as [string, string, string];
      const tagsFolder = `${target.folders.data.tags}/`;
      const tagged = rest.startsWith(tagsFolder);
      const found = registryOf(tagged ? rest.slice(tagsFolder.length) : rest);
      if (found !== undefined) {
        const [folder, path] = found;
        const registry = folderNames.get(folder) ?? folder;
        add(tagged ? `tag/${registry}` : registry, `${namespace}:${path}`);
      }
    }
    if (file.language !== 'mcfunction') continue;
    for (const line of textOf(file).split('\n')) {
      for (const m of line.matchAll(/scoreboard objectives add (\S+)/g)) add('objective', m[1]);
      for (const m of line.matchAll(/team add (\S+)/g)) add('team', m[1]);
      for (const m of line.matchAll(/tag @s add (\S+)/g)) add('tag', m[1]);
      for (const m of line.matchAll(/bossbar add (\S+)/g)) add('bossbar', m[1]);
    }
  }
  return Object.fromEntries(
    [...ids]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([category, set]) => [category, [...set].sort()]),
  );
}

const kindOf = (id: string) => {
  const kind = gamesKinds.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`no kind ${id}`);
  return kind;
};

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'gamesGeneratedIds on %s',
  (_targetId, bundle) => {
    it.each(ELEMENTS)('%s lists every id its files define and no other', async (_name, el) => {
      const files = await kindOf(el.kind).lower(el, bundle.target);
      expect(files.length).toBeGreaterThan(0);
      expect(gamesGeneratedIds(el)).toEqual(idsOfFiles(files, bundle.target));
    });
  },
);

describe('gamesGeneratedIds', () => {
  it('names the checker-only categories', () => {
    expect([...GAMES_CHECKER_CATEGORIES].sort()).toEqual(['bossbar', 'objective', 'tag', 'team']);
  });

  it('is empty for another kind and for an element that cannot be lowered', () => {
    expect(gamesGeneratedIds(element('minecraft:function', 'demo:a', { lines: [] }))).toEqual({});
    expect(gamesGeneratedIds(element('msm:team', 'Not An Id', {}))).toEqual({});
    expect(gamesGeneratedIds(element('msm:world_setup', 'demo:w', {}))).toEqual({});
  });
});
