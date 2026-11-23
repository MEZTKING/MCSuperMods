/**
 * The runner of the fixed query set (ADR 0124 D16; B666): the search as the app builds it (the
 * host over the sources: the static layer from the built-in plugins and the app's lists, the
 * guide layer from `docs/guide` through main's guide service, the vanilla layer from the
 * target's vendored registries with or without a names file, the project layer of an empty mod or
 * of `fixtures/sample-mod`), the queries of `golden-queries.json`, and the scores per class:
 * first, top three and mean reciprocal rank.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  type Project,
  type ProjectFileSystem,
  registerPlugin,
} from '@msm/core';
import type { Json } from '@msm/plugin-api';
import type { SearchEntry, SearchHitSlim } from '@msm/search';
import { createGuideService } from '../../src/main/guide';
import type { SearchOutbound, SlimAnswer, StaticSpec } from '../../src/renderer/src/search/client';
import { gatherSearchData } from '../../src/renderer/src/search/plugin-data';
import { type AppLists, collectStatic } from '../../src/renderer/src/search/sources';
import { guideEntries } from '../../src/renderer/src/search/sources/guide';
import {
  inModIds,
  projectEntries,
  projectThings,
} from '../../src/renderer/src/search/sources/project';
import { vanillaLayer } from '../../src/renderer/src/search/sources/vanilla';
import type { GuideIndex } from '../../src/shared/platform';
import {
  appLists,
  builtInPlugins,
  factsOf,
  madeUpNames,
  projectWith,
  registriesOf,
  syncHost,
} from './fixtures';

const REPO = join(import.meta.dirname, '..', '..', '..');

/** The classes of D16, in the report's order. */
export const CLASSES = [
  'plain',
  'misspelt',
  'american',
  'slang',
  'how-to',
  'id',
  'mine',
  'setting',
  'command',
  'behaviour',
  'nonsense',
] as const;
export type QueryClass = (typeof CLASSES)[number];

/** The classes held to 100 % (B650's bars). */
export const STRICT_CLASSES: readonly QueryClass[] = ['id', 'command', 'nonsense'];

/** One query of the set. */
export interface GoldenQuery {
  readonly q: string;
  readonly class: QueryClass;
  readonly mode: 'very-easy' | 'easy' | 'advanced';
  /** The open mod: `sample-mod` (`fixtures/sample-mod`), else an empty mod. */
  readonly project?: 'sample-mod';
  /** The expected first result's entry id; `null`: no Best match (nonsense). */
  readonly expect: string | null;
  /** Other ids that may stand in the top three (for the reader; not scored). */
  readonly top3?: readonly string[];
  /**
   * Ids that count as the expected result: a plugin's door that opens the expected flow (the
   * same Creator, with a choice made), a tile and the card that folds into it, a guide page and
   * the section it opens at. Each is a reviewed edit with its `reason`.
   */
  readonly same?: readonly string[];
  /** Expected answers of the expected hit (a subset). */
  readonly answers?: Readonly<Record<string, Json>>;
  /** Expected behaviour id of the expected hit. */
  readonly behaviour?: string;
  /** The corrected text the chips should show. */
  readonly corrected?: string;
  /**
   * A condition on later work (SQ16) without which the expectation cannot hold: the query is run
   * and reported, but not counted in the bars until the work lands and the line is removed.
   */
  readonly needs?: string;
  readonly notes?: string;
  /** Why the expectation was changed after it was first written (D16: never regenerated). */
  readonly reason?: string;
}

/** The set as stored. */
export interface GoldenSet {
  readonly about: string;
  readonly queries: readonly GoldenQuery[];
}

/** Reads `golden-queries.json`. */
export async function readGoldenSet(): Promise<GoldenSet> {
  return JSON.parse(
    await readFile(join(import.meta.dirname, 'golden-queries.json'), 'utf8'),
  ) as GoldenSet;
}

/** A read-only project file system over a folder. */
function readOnlyFs(root: string): ProjectFileSystem {
  const resolve = (path: string): string => join(root, ...path.split('/'));
  const refuse = async (): Promise<never> => {
    throw new Error('read-only');
  };
  return {
    readFile: async (path) => new Uint8Array(await readFile(resolve(path))),
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map(
          (entry): DirEntry => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'directory' : 'file',
          }),
        );
    },
    async exists(path) {
      try {
        await stat(resolve(path));
        return true;
      } catch {
        return false;
      }
    },
    writeFile: refuse,
    mkdirp: refuse,
    remove: refuse,
  };
}

/** `fixtures/sample-mod` loaded with the built-in plugins. */
export async function loadSampleMod(): Promise<Project> {
  const registry = new ElementKindRegistry();
  for (const plugin of builtInPlugins) registerPlugin(registry, plugin);
  const loaded = await loadProject(readOnlyFs(join(REPO, 'fixtures', 'sample-mod')), registry);
  return loaded.project;
}

/** An empty mod: one namespace, no element. */
export function emptyMod(): Project {
  const project = projectWith([]);
  return { ...project, namespaces: [{ name: 'my_mod', elements: [], assets: [] }] };
}

/** What stays the same across the runs of a target. */
export interface Shared {
  readonly lists: AppLists;
  readonly data: Awaited<ReturnType<typeof gatherSearchData>>;
  readonly guide: GuideIndex;
  readonly sampleMod: Project;
}

/** Loads what every run shares (the app's lists, the plugins' data, the guide, the sample mod). */
export async function loadShared(): Promise<Shared> {
  const [lists, data, guide, sampleMod] = await Promise.all([
    appLists(),
    gatherSearchData(builtInPlugins),
    createGuideService({ dir: join(REPO, 'docs', 'guide') }).index(),
    loadSampleMod(),
  ]);
  return { lists, data, guide, sampleMod };
}

/** One configuration of the runner. */
export interface RunConfig {
  readonly target: string;
  /** The made-up names file (as the user's jar would give names), or words from the ids. */
  readonly names: boolean;
  readonly project: 'empty' | 'sample-mod';
  /**
   * Flows to mark unavailable after collecting (as a target that cannot make them would), with
   * the doors and tiles that open them: no built-in flow is unavailable on either target today,
   * so the availability rule is checked this way.
   */
  readonly unavailableFlows?: readonly string[];
}

/** A search built for one configuration. */
export interface GoldenSearch {
  readonly config: RunConfig;
  readonly spec: StaticSpec;
  /** Every entry of every layer, by id. */
  readonly entries: ReadonlyMap<string, SearchEntry>;
  ask(text: string, mode: GoldenQuery['mode']): SlimAnswer;
}

/** Builds the search of one configuration as the app's feed does (layers, then the context). */
export function buildSearch(shared: Shared, config: RunConfig): GoldenSearch {
  const collected = collectStatic({
    plugins: builtInPlugins,
    target: factsOf(config.target),
    data: shared.data,
    lists: shared.lists,
  });
  const off = new Set(config.unavailableFlows ?? []);
  const spec: StaticSpec =
    off.size === 0
      ? collected
      : {
          ...collected,
          entries: collected.entries.map((entry) => {
            const action = entry.action as { type?: string; starter?: string };
            return action.type === 'flow' && off.has(action.starter ?? '')
              ? { ...entry, available: false, unavailableReason: 'Not on this Minecraft version.' }
              : entry;
          }),
        };
  const run = syncHost();
  run.send({ type: 'static', spec });
  const guide = guideEntries(shared.guide);
  run.send({ type: 'layer', layer: 'guide', entries: guide });
  const vanilla = vanillaLayer(registriesOf(config.target), config.names ? madeUpNames() : null);
  run.send({
    type: 'layer',
    layer: 'vanilla',
    entries: vanilla.entries,
    things: vanilla.things,
    protect: vanilla.protect,
  });
  const project = config.project === 'sample-mod' ? shared.sampleMod : emptyMod();
  const own = projectEntries({ project, problems: [] });
  run.send({ type: 'layer', layer: 'project', entries: own, things: projectThings(project) });
  run.send({ type: 'context', context: { inMod: inModIds(project), history: {} } });
  const failed = run.out.find((message) => message.type === 'failed');
  if (failed !== undefined && failed.type === 'failed') throw new Error(failed.message);
  const entries = new Map<string, SearchEntry>();
  for (const entry of [...spec.entries, ...guide, ...vanilla.entries, ...own]) {
    if (!entries.has(entry.id)) entries.set(entry.id, entry);
  }
  let token = 1;
  return {
    config,
    spec,
    entries,
    ask(text, mode) {
      const asked = token++;
      run.send({ type: 'query', token: asked, request: { text, mode } });
      const index = run.out.findIndex(
        (message) => message.type === 'answer' && message.token === asked,
      );
      const message = run.out[index] as Extract<SearchOutbound, { type: 'answer' }> | undefined;
      if (message === undefined) throw new Error(`No answer to ${JSON.stringify(text)}`);
      // Keep the outbox small over hundreds of queries.
      run.out.length = 0;
      return message.answer;
    },
  };
}

/** The hits in the order the panel shows them: Best matches, then each section's rows. */
export function ranked(answer: SlimAnswer): SearchHitSlim[] {
  const seen = new Set<string>();
  const out: SearchHitSlim[] = [];
  for (const hit of [...answer.best, ...answer.sections.flatMap((section) => section.hits)]) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
  }
  return out;
}

/** One query's outcome. */
export interface QueryResult {
  readonly query: GoldenQuery;
  readonly first: boolean;
  readonly top3: boolean;
  /** 1 / rank of the expected id among the shown rows (0 when not shown). */
  readonly reciprocal: number;
  /** Whether the expected answers and behaviour were read (undefined: none expected). */
  readonly answers?: boolean;
  readonly confident: boolean;
  readonly got: readonly string[];
  readonly gotAnswers?: Readonly<Record<string, Json>>;
  readonly gotBehaviour?: string;
}

const same = (a: Json | undefined, b: Json): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Scores one query against its answer. `values` gives the answers a door opens its flow with
 * (they count as read: the Sword door's flow has its weapon type).
 */
export function score(
  query: GoldenQuery,
  answer: SlimAnswer,
  values: (id: string) => Readonly<Record<string, Json>> | undefined = () => undefined,
): QueryResult {
  const hits = ranked(answer);
  const ids = hits.map((hit) => hit.id);
  if (query.expect === null) {
    const none = answer.best.length === 0;
    return {
      query,
      first: none,
      top3: none,
      reciprocal: none ? 1 : 0,
      confident: answer.confident,
      got: ids.slice(0, 5),
    };
  }
  const expected = new Set([query.expect, ...(query.same ?? [])]);
  const at = ids.findIndex((id) => expected.has(id));
  const hit = at >= 0 ? hits[at] : undefined;
  const read = { ...(hit === undefined ? {} : values(hit.id)), ...hit?.answers };
  let answersOk: boolean | undefined;
  if (query.answers !== undefined) {
    answersOk = Object.entries(query.answers).every(([key, value]) => same(read[key], value));
  }
  if (query.behaviour !== undefined) {
    answersOk = (answersOk ?? true) && hit?.behaviour?.id === query.behaviour;
  }
  return {
    query,
    first: at === 0,
    top3: at >= 0 && at < 3,
    reciprocal: at >= 0 ? 1 / (at + 1) : 0,
    ...(answersOk !== undefined ? { answers: answersOk } : {}),
    confident: answer.confident,
    got: ids.slice(0, 5),
    ...(hit !== undefined ? { gotAnswers: read } : {}),
    ...(hit?.behaviour !== undefined ? { gotBehaviour: hit.behaviour.id } : {}),
  };
}

/** Counts of a group of results. */
export interface Tally {
  readonly n: number;
  readonly first: number;
  readonly top3: number;
  readonly mrr: number;
  readonly answersN: number;
  readonly answers: number;
}

/** Tallies results. */
export function tally(results: readonly QueryResult[]): Tally {
  let first = 0;
  let top3 = 0;
  let reciprocal = 0;
  let answersN = 0;
  let answers = 0;
  for (const result of results) {
    if (result.first) first++;
    if (result.top3) top3++;
    reciprocal += result.reciprocal;
    if (result.answers !== undefined) {
      answersN++;
      if (result.answers) answers++;
    }
  }
  const n = results.length;
  return { n, first, top3, mrr: n === 0 ? 0 : reciprocal / n, answersN, answers };
}

/** The bars (B650, D16): overall and per class, as fractions. */
export const BARS = {
  overall: { first: 0.85, top3: 0.95 },
  perClass: { first: 0.75, top3: 0.85 },
  strict: 1,
} as const;

/** The bars a tally misses (empty: all met). */
export function missedBars(cls: QueryClass | 'overall', t: Tally): string[] {
  if (t.n === 0) return [];
  const bar =
    cls === 'overall'
      ? BARS.overall
      : STRICT_CLASSES.includes(cls)
        ? { first: BARS.strict, top3: BARS.strict }
        : BARS.perClass;
  const out: string[] = [];
  if (t.first / t.n < bar.first) out.push(`${cls} first ${t.first}/${t.n}`);
  if (t.top3 / t.n < bar.top3) out.push(`${cls} top three ${t.top3}/${t.n}`);
  return out;
}

/** Runs the queries a configuration covers: the sample mod's own on it, the rest on both. */
export function runQueries(search: GoldenSearch, queries: readonly GoldenQuery[]): QueryResult[] {
  const opened = new Map<string, Readonly<Record<string, Json>>>();
  for (const entry of search.spec.entries) {
    const values = (entry.action as { values?: Record<string, Json> }).values;
    if (values !== undefined) opened.set(entry.id, values);
  }
  return queries
    .filter((query) => query.project === undefined || search.config.project === 'sample-mod')
    .map((query) => score(query, search.ask(query.q, query.mode), (id) => opened.get(id)));
}

/** The results the bars count: every query but those that wait on later work (`needs`). */
export function counted(results: readonly QueryResult[]): QueryResult[] {
  return results.filter((result) => result.query.needs === undefined);
}

/** Counted results by class. */
export function byClass(results: readonly QueryResult[]): Map<QueryClass, QueryResult[]> {
  const out = new Map<QueryClass, QueryResult[]>();
  for (const cls of CLASSES) out.set(cls, []);
  for (const result of counted(results)) out.get(result.query.class)?.push(result);
  return out;
}

/** A configuration's name in the report. */
export const configName = (config: RunConfig): string =>
  `${config.target}, ${config.names ? 'names file' : 'no names'}, ${config.project === 'empty' ? 'empty mod' : 'sample mod'}`;

/** One configuration's results, for the report. */
export interface ConfigResults {
  readonly config: RunConfig;
  readonly results: readonly QueryResult[];
}

const pct = (part: number, whole: number): string =>
  whole === 0 ? '-' : `${((100 * part) / whole).toFixed(1)} %`;

/**
 * The report's tables in Markdown: per configuration, first, top three and mean reciprocal rank
 * per class and overall (counted queries), the answers read right, and the queries that wait on
 * later work. Written when `GOLDEN_REPORT` names a file (`golden.test.ts`).
 */
export function reportMarkdown(runs: readonly ConfigResults[]): string {
  const lines: string[] = [];
  for (const { config, results } of runs) {
    lines.push(`### ${configName(config)}`, '');
    lines.push('| Class | Queries | First | Top three | MRR |', '|---|---|---|---|---|');
    for (const [cls, group] of byClass(results)) {
      const t = tally(group);
      if (t.n === 0) continue;
      lines.push(
        `| ${cls} | ${t.n} | ${t.first} (${pct(t.first, t.n)}) | ${t.top3} (${pct(t.top3, t.n)}) | ${t.mrr.toFixed(3)} |`,
      );
    }
    const all = tally(counted(results));
    lines.push(
      `| **overall** | ${all.n} | ${all.first} (${pct(all.first, all.n)}) | ${all.top3} (${pct(all.top3, all.n)}) | ${all.mrr.toFixed(3)} |`,
      '',
      `Answers and behaviours read right: ${all.answers} of ${all.answersN}.`,
      '',
    );
    const waiting = results.filter((result) => result.query.needs !== undefined);
    if (waiting.length > 0) {
      lines.push(
        `Waiting on later work (not counted): ${waiting
          .map(
            (result) =>
              `\`${result.query.q}\` ${result.first ? 'first' : result.top3 ? 'top three' : 'missed'}`,
          )
          .join(', ')}.`,
        '',
      );
    }
    const misses = counted(results).filter((result) => !result.first || result.answers === false);
    if (misses.length > 0) {
      lines.push('Misses:', '');
      for (const miss of misses) {
        lines.push(
          `- \`${miss.query.q}\` (${miss.query.class}): expected \`${miss.query.expect}\`${
            miss.first
              ? ' first, answers not read'
              : `, got ${miss.got
                  .slice(0, 3)
                  .map((id) => `\`${id}\``)
                  .join(', ')}`
          }`,
        );
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}
