/**
 * The sources (ADR 0124 D3; B660): what the search finds, collected on the main thread from the
 * plugin list, the session and the app's own lists, and sent to the engine by the client.
 *
 * - **Static layer** (`collectStatic`), once per target after the first paint, with no mod open
 *   too (the default target then): flows and starters, templates, examples, kinds, commands, the
 *   Rules catalogue, settings, Home's tiles and picks, Showcase cards and the plugins' extra
 *   doors, with the plugins' vocabulary, protected headwords, search data and flow facts.
 * - **Guide layer**, when main's guide index arrives.
 * - **Vanilla layer** on first need (`SearchFeed.prepare`): the target's registries named from
 *   the user's jar, else words from the ids.
 * - **Project layer**: the open mod's things, rules and Things to fix, sent whole when a mod opens
 *   and then as deltas 300 ms after an edit, with the context (the ids the mod uses, the history).
 *
 * @packageDocumentation
 */

import type { Problem, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import type { SearchContext, SearchEntry, SearchThing } from '@msm/search';
import type { GuideIndex } from '../../../../shared/platform';
import type { SettingsCatalogueEntry } from '../../components/settings-catalogue';
import type { StaticSpec } from '../client';
import { type ChosenResult, historyCounts, type SearchHistory } from '../history';
import type { GatheredPluginData, SearchDataPlugin } from '../plugin-data';
import { gatherSearchData } from '../plugin-data';
import { type ReadVanillaNames, vanillaNamesFor } from '../vanilla-names';
import { type CommandLine, commandEntries } from './commands';
import { contributionEntries } from './contributions';
import { exampleEntries, registeredExamples } from './examples';
import { flowEntries, flowFacts } from './flows';
import { guideEntries } from './guide';
import { kindEntries } from './kinds';
import { inModIds, projectEntries, projectThings } from './project';
import { ruleCatalogueEntries } from './rules';
import { settingEntries } from './settings';
import { entryIds, registeredKinds, type StaticSourceInput, searchWordsOf } from './shared';
import { showcaseEntries } from './showcases';
import { type KindWords, templateEntries } from './templates';
import { tileEntries } from './tiles';
import { parseVanillaRegistries, type VanillaRegistries, vanillaLayer } from './vanilla';

export type { CommandLine } from './commands';
export type { FlowSpec } from './flows';
export type {
  RulePart,
  SearchActionDescriptor,
  SearchPreviewDescriptor,
  VanillaSort,
} from './shared';
export { actionOf, entryIds } from './shared';
export type { KindWords } from './templates';

/** The app's own lists the static layer reads (handed in: they live beside their screens). */
export interface AppLists {
  /** The palette's built-in commands (`commands/built-in-commands.ts`). */
  readonly commands: readonly CommandLine[];
  /** The settings catalogue (`components/settings-catalogue.ts`). */
  readonly settings: readonly SettingsCatalogueEntry[];
  /** The sidebar's friendly kind names and technical kinds. */
  readonly kinds: KindWords;
}

/** What {@link collectStatic} reads. */
export interface StaticInput {
  readonly plugins: readonly SearchDataPlugin[];
  readonly target: TargetFacts;
  readonly data: readonly GatheredPluginData[];
  readonly lists: AppLists;
}

/** The static layer's entries per source, for tests and the report. */
export type SourceCounts = Readonly<Record<string, number>>;

/** Counts entries by source. */
export function countBySource(entries: readonly SearchEntry[]): SourceCounts {
  const out: Record<string, number> = {};
  for (const entry of entries) out[entry.source] = (out[entry.source] ?? 0) + 1;
  return out;
}

/** The vocabulary's headwords: the stemmer leaves them as they are (B658). */
export function headwords(data: readonly GatheredPluginData[]): string[] {
  const out = new Set<string>();
  for (const { data: lines } of data) {
    for (const group of lines.vocabulary?.words ?? []) {
      for (const word of group.idea.split(/\s+/)) if (word !== '') out.add(word.toLowerCase());
    }
  }
  return [...out].sort();
}

/** The static layer of a target: every entry of the static sources and what goes with them. */
export function collectStatic(input: StaticInput): StaticSpec {
  const words = searchWordsOf(input.data);
  const source: StaticSourceInput = { plugins: input.plugins, target: input.target, words };
  const flows = flowEntries(source);
  const byId = new Map<string, SearchEntry>();
  const add = (entries: readonly SearchEntry[]): void => {
    for (const entry of entries) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  };
  add(flows);
  add(templateEntries(source, input.lists.kinds));
  add(exampleEntries(source));
  add(kindEntries(source, input.lists.kinds));
  add(commandEntries(source, input.lists.commands));
  add(ruleCatalogueEntries(source));
  add(settingEntries(input.lists.settings));
  const usable = (id: string): boolean => byId.get(id)?.available === true;
  const availability = {
    flowAvailable: (flowId: string) => usable(entryIds.flow(flowId)),
    starterAvailable: (starterId: string) => usable(entryIds.starter(starterId)),
    rules: registeredKinds(source).has('msm:rules'),
  };
  add(tileEntries(availability));
  add(
    showcaseEntries(
      input.target,
      registeredExamples(source).map(({ example }) => example),
      availability,
    ),
  );
  add(contributionEntries(input.data, byId));
  return {
    targetId: input.target.id,
    entries: [...byId.values()],
    vocabulary: input.data.flatMap(({ data }) =>
      data.vocabulary !== undefined ? [data.vocabulary] : [],
    ),
    protect: headwords(input.data),
    plugins: input.data.map(({ plugin, data }) => ({ plugin, data })),
    flows: flowFacts(source),
  };
}

// The feed ---------------------------------------------------------------------------------

/** What the feed needs of the session. */
export interface SearchSessionLike {
  readonly snapshot: { readonly project: Project | null; readonly problems: readonly Problem[] };
  subscribe(listener: () => void): () => void;
}

/** What the feed needs of the client (`SearchClient`). */
export interface SearchFeedClient {
  setStatic(spec: StaticSpec): void;
  setLayer(
    layer: string,
    entries: readonly SearchEntry[],
    extras?: { things?: readonly SearchThing[]; protect?: readonly string[] },
  ): void;
  patchLayer(
    layer: string,
    upserts: readonly SearchEntry[],
    removes: readonly string[],
    things?: readonly SearchThing[],
  ): void;
  setContext(context: SearchContext): void;
  layerEntries(layer: string): ReadonlyMap<string, SearchEntry>;
}

/** Options of {@link SearchFeed}. */
export interface SearchFeedOptions {
  readonly client: SearchFeedClient;
  /** The registered plugins (built-in, then third-party facades), read at each build. */
  readonly plugins: () => readonly SearchDataPlugin[];
  readonly lists: AppLists;
  /** The target with no mod open (the newest release). */
  readonly defaultTargetId: string;
  /** A built-in target's facts, or `undefined` for an unknown id. */
  readonly targetFacts: (id: string) => TargetFacts | undefined;
  readonly session?: SearchSessionLike | null;
  /** The jar's names; default the preload bridge's `minecraft.readNames`. */
  readonly readNames?: ReadVanillaNames;
  /** The target's vendored registries; default through the preload bridge. */
  readonly readRegistries?: (targetId: string) => Promise<VanillaRegistries>;
  /** The guide's index; default the preload bridge's `guide.index`, else none. */
  readonly readGuide?: () => Promise<GuideIndex | null>;
  /** The local history (the preferences store's), read for the context. */
  readonly history?: () => SearchHistory;
  /** The project delta's debounce in milliseconds (default 300, ADR 0124 D3). */
  readonly delay?: number;
}

/** The project delta's debounce (ADR 0124 D3). */
export const PROJECT_DELAY_MS = 300;

type Bridge = {
  targets?: { readVendored?(targetId: string, key: string): Promise<Uint8Array> };
  guide?: { index?(): Promise<GuideIndex> };
};

const bridge = (): Bridge | undefined => (globalThis as { msm?: Bridge }).msm;

/** The target's vendored registries through the preload bridge. */
export async function bridgeRegistries(targetId: string): Promise<VanillaRegistries> {
  const read = bridge()?.targets?.readVendored;
  if (read === undefined) return {};
  const bytes = await read.call(bridge()?.targets, targetId, 'mcmetaRegistries');
  return parseVanillaRegistries(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
}

/** The guide's index through the preload bridge, or `null`. */
export async function bridgeGuide(): Promise<GuideIndex | null> {
  const guide = bridge()?.guide;
  if (guide?.index === undefined) return null;
  return guide.index();
}

const stable = (entry: SearchEntry): string => JSON.stringify(entry);

/** The difference between the entries held and the entries now. */
export function layerDelta(
  held: ReadonlyMap<string, SearchEntry>,
  next: readonly SearchEntry[],
): { upserts: SearchEntry[]; removes: string[] } {
  const upserts: SearchEntry[] = [];
  const seen = new Set<string>();
  for (const entry of next) {
    seen.add(entry.id);
    const before = held.get(entry.id);
    if (before === undefined || stable(before) !== stable(entry)) upserts.push(entry);
  }
  const removes = [...held.keys()].filter((id) => !seen.has(id));
  return { upserts, removes };
}

/**
 * Keeps the client's layers in step with the plugin list, the target and the session (see the
 * module comment). Builds never throw: a source that fails leaves its layer as it was.
 */
export class SearchFeed {
  readonly #options: SearchFeedOptions;
  readonly #delay: number;
  #session: SearchSessionLike | null;
  #unsubscribe: (() => void) | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #staticTarget: string | null = null;
  #staticBuild: Promise<void> | null = null;
  #vanillaTarget: string | null = null;
  #vanillaBuild: Promise<void> | null = null;
  #guideBuild: Promise<void> | null = null;
  #flowTitles: Record<string, string> = {};
  #lean: SearchContext['lean'] | undefined;
  #projectSent = false;
  #disposed = false;
  /** Counts of the last static layer by source (tests, the report). */
  counts: SourceCounts = {};

  constructor(options: SearchFeedOptions) {
    this.#options = options;
    this.#delay = options.delay ?? PROJECT_DELAY_MS;
    this.#session = options.session ?? null;
  }

  /** The target the layers are for: the open mod's when it is a known one, else the default. */
  get targetId(): string {
    const project = this.#session?.snapshot.project ?? null;
    const wanted = project?.targets[0];
    return wanted !== undefined && this.#options.targetFacts(wanted) !== undefined
      ? wanted
      : this.#options.defaultTargetId;
  }

  /** Builds the static and guide layers and sends the open mod's layer; listens to the session. */
  async start(): Promise<void> {
    this.#listen();
    await this.#ensureStatic();
    void this.#ensureGuide();
    this.#sendProject();
  }

  /** Builds the vanilla layer of the current target, once (the first time search is opened). */
  prepare(): Promise<void> {
    const target = this.targetId;
    if (this.#vanillaTarget === target && this.#vanillaBuild !== null) return this.#vanillaBuild;
    this.#vanillaTarget = target;
    this.#vanillaBuild = this.#buildVanilla(target);
    return this.#vanillaBuild;
  }

  /** Follows another session (a mod opened or closed). */
  setSession(session: SearchSessionLike | null): void {
    this.#session = session;
    this.#listen();
    this.#changed();
  }

  /** The door's lean when the words carry no intent (Home: make; the palette: command). */
  setLean(lean: SearchContext['lean'] | undefined): void {
    this.#lean = lean;
    this.refreshContext();
  }

  /** Sends the context again (the history changed). */
  refreshContext(): void {
    if (this.#disposed) return;
    const project = this.#session?.snapshot.project ?? null;
    const history = this.#options.history?.() ?? { chosen: [] as ChosenResult[], searches: [] };
    this.#options.client.setContext({
      inMod: inModIds(project),
      history: historyCounts(history),
      ...(this.#lean !== undefined ? { lean: this.#lean } : {}),
    });
  }

  /** Sends a pending project delta now (tests; before a query that must see the last edit). */
  async flush(): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    await this.#ensureStatic();
    this.#sendProject();
  }

  /** Stops listening. */
  dispose(): void {
    this.#disposed = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #listen(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.#session?.subscribe(() => this.#changed()) ?? null;
  }

  /** A session change: a new target rebuilds the static layer; any change schedules the delta. */
  #changed(): void {
    if (this.#disposed) return;
    if (this.#staticTarget !== null && this.#staticTarget !== this.targetId) {
      this.#staticBuild = null;
      void this.#ensureStatic().then(() => {
        if (this.#vanillaTarget !== null) void this.prepare();
        this.#sendProject();
      });
      return;
    }
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#sendProject();
    }, this.#delay);
  }

  #ensureStatic(): Promise<void> {
    const target = this.targetId;
    if (this.#staticBuild !== null && this.#staticTarget === target) return this.#staticBuild;
    this.#staticTarget = target;
    this.#staticBuild = this.#buildStatic(target);
    return this.#staticBuild;
  }

  async #buildStatic(targetId: string): Promise<void> {
    const target = this.#options.targetFacts(targetId);
    if (target === undefined) return;
    const plugins = this.#options.plugins();
    const data = await gatherSearchData(plugins);
    if (this.#disposed || this.#staticTarget !== targetId) return;
    const spec = collectStatic({ plugins, target, data, lists: this.#options.lists });
    this.counts = countBySource(spec.entries);
    this.#flowTitles = {};
    for (const entry of spec.entries) {
      if (entry.source === 'flow' && entry.id.startsWith('flow:')) {
        this.#flowTitles[entry.id.slice('flow:'.length)] = entry.title;
      }
    }
    this.#options.client.setStatic(spec);
  }

  #ensureGuide(): Promise<void> {
    if (this.#guideBuild !== null) return this.#guideBuild;
    const read = this.#options.readGuide ?? bridgeGuide;
    this.#guideBuild = (async () => {
      try {
        const index = await read();
        if (this.#disposed || index === null) return;
        this.#options.client.setLayer('guide', guideEntries(index));
      } catch {
        // No guide (tests, a bridge without it): the layer stays empty.
      }
    })();
    return this.#guideBuild;
  }

  async #buildVanilla(targetId: string): Promise<void> {
    const readRegistries = this.#options.readRegistries ?? bridgeRegistries;
    try {
      const [registries, names] = await Promise.all([
        readRegistries(targetId),
        vanillaNamesFor(targetId, this.#options.readNames),
      ]);
      if (this.#disposed || this.#vanillaTarget !== targetId) return;
      const layer = vanillaLayer(registries, names);
      this.#options.client.setLayer('vanilla', layer.entries, {
        things: layer.things,
        protect: layer.protect,
      });
    } catch {
      // The registries could not be read: no vanilla layer for now; the next prepare tries again.
      if (this.#vanillaTarget === targetId) {
        this.#vanillaTarget = null;
        this.#vanillaBuild = null;
      }
    }
  }

  /** Sends the project layer: whole the first time, else the delta. */
  #sendProject(): void {
    if (this.#disposed || this.#staticBuild === null) return;
    const snapshot = this.#session?.snapshot;
    const project = snapshot?.project ?? null;
    const entries = projectEntries({
      project,
      problems: snapshot?.problems ?? [],
      flowTitles: this.#flowTitles,
      kinds: this.#options.lists.kinds,
    });
    const things = projectThings(project);
    const client = this.#options.client;
    if (!this.#projectSent) {
      client.setLayer('project', entries, { things });
      this.#projectSent = true;
    } else {
      const { upserts, removes } = layerDelta(client.layerEntries('project'), entries);
      if (upserts.length > 0 || removes.length > 0)
        client.patchLayer('project', upserts, removes, things);
    }
    this.refreshContext();
  }
}
