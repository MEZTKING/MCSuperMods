/**
 * Tag resolution as the game loads tags (ADR 0120 D5; behaviour observed by B600, 2S5, never
 * from the game's code):
 *
 * - a project file merges into vanilla's tag of the same id, vanilla's entries first; with
 *   `replace: true` it replaces them;
 * - tags naming tags resolve; a member is kept once, where it first appears;
 * - an optional entry (`required: false`) that is missing, element or tag, is skipped;
 * - a missing required entry drops the whole tag, and a tag naming a dropped tag (required) is
 *   dropped too;
 * - a cycle drops every tag in it.
 */

import type { Json } from '@msm/plugin-api';
import type { DataLookup, ResolvedTag, TagMember, TagOrigin } from './api.js';
import { bareName, isLayered, normaliseId } from './lookup.js';

/** What {@link createTagResolver} and `resolveTag` take beside the lookup. */
export interface TagOptions {
  /**
   * The project's files, when `lookup` holds vanilla's only. Not needed with a lookup made by
   * `layeredLookup`, which keeps both layers. Without either, every file counts as vanilla's.
   */
  readonly project?: DataLookup;
  /**
   * Whether an element exists in its registry (`registry` without `minecraft:`). `undefined`
   * (or no function) means "cannot tell": the element is kept, as the game would if it existed.
   */
  readonly exists?: (registry: string, id: string) => boolean | undefined;
  /** The parent folder of the tag folders: the target's `folders.data.tags`. Default `tags`. */
  readonly tagsFolder?: string;
}

/** Resolves tags of any registry, each tag once (the answers are kept). */
export type TagResolver = (registry: string, id: string) => ResolvedTag;

interface Entry {
  readonly id: string;
  readonly tag: boolean;
  readonly required: boolean;
  readonly origin: TagOrigin;
}

interface Definition {
  readonly entries: readonly Entry[];
  readonly replaced: boolean;
}

function readEntries(file: Json | undefined, origin: TagOrigin): Entry[] {
  if (file === null || typeof file !== 'object' || Array.isArray(file)) return [];
  const values = file.values;
  if (!Array.isArray(values)) return [];
  const entries: Entry[] = [];
  for (const value of values) {
    let raw: string | undefined;
    let required = true;
    if (typeof value === 'string') raw = value;
    else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      if (typeof value.id === 'string') raw = value.id;
      if (value.required === false) required = false;
    }
    if (raw === undefined) continue;
    entries.push({ id: normaliseId(raw), tag: raw.startsWith('#'), required, origin });
  }
  return entries;
}

function replaces(file: Json | undefined): boolean {
  return file !== null && typeof file === 'object' && !Array.isArray(file) && file.replace === true;
}

/** The tags of one registry. */
class RegistryTags {
  private readonly definitions = new Map<string, Definition | null>();
  private readonly answers = new Map<string, ResolvedTag>();

  private readonly registry: string;
  private readonly folder: string;
  private readonly vanilla: DataLookup;
  private readonly project: DataLookup | undefined;
  private readonly exists: TagOptions['exists'];

  constructor(
    registry: string,
    folder: string,
    vanilla: DataLookup,
    project: DataLookup | undefined,
    exists: TagOptions['exists'],
  ) {
    this.registry = registry;
    this.folder = folder;
    this.vanilla = vanilla;
    this.project = project;
    this.exists = exists;
  }

  private definition(id: string): Definition | null {
    const known = this.definitions.get(id);
    if (known !== undefined) return known;
    const vanillaFile = this.vanilla(this.folder, id);
    const projectFile = this.project?.(this.folder, id);
    let definition: Definition | null = null;
    if (vanillaFile !== undefined || projectFile !== undefined) {
      const replaced = projectFile !== undefined && replaces(projectFile);
      const entries = [
        ...(replaced ? [] : readEntries(vanillaFile, 'vanilla')),
        ...readEntries(projectFile, 'project'),
      ];
      definition = { entries, replaced: replaced && vanillaFile !== undefined };
    }
    this.definitions.set(id, definition);
    return definition;
  }

  resolve(rootId: string): ResolvedTag {
    const root = normaliseId(rootId);
    const cached = this.answers.get(root);
    if (cached !== undefined) return cached;

    // Strongly connected components over the tags reachable from the root (Tarjan): each
    // component is finished after every component it reaches, so answers build bottom up.
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];
    let counter = 0;

    const visit = (id: string): void => {
      index.set(id, counter);
      low.set(id, counter);
      counter++;
      stack.push(id);
      onStack.add(id);
      const definition = this.definition(id);
      let selfLoop = false;
      for (const entry of definition?.entries ?? []) {
        if (!entry.tag) continue;
        if (entry.id === id) selfLoop = true;
        if (this.definition(entry.id) === null || this.answers.has(entry.id)) continue;
        if (!index.has(entry.id)) {
          visit(entry.id);
          low.set(id, Math.min(low.get(id) ?? 0, low.get(entry.id) ?? 0));
        } else if (onStack.has(entry.id)) {
          low.set(id, Math.min(low.get(id) ?? 0, index.get(entry.id) ?? 0));
        }
      }
      if (low.get(id) === index.get(id)) {
        const component: string[] = [];
        for (;;) {
          const top = stack.pop() as string;
          onStack.delete(top);
          component.push(top);
          if (top === id) break;
        }
        component.reverse();
        if (component.length > 1 || selfLoop) {
          cycles.push(component);
          for (const member of component) this.settle(member, null, component);
        } else if (!this.answers.has(id)) {
          this.settle(id, definition, undefined);
        }
      }
    };

    if (this.definition(root) === null) {
      const absent: ResolvedTag = {
        registry: this.registry,
        id: root,
        members: [],
        missing: [`#${root}`],
        cycles: [],
        dropped: true,
        replaced: false,
      };
      this.answers.set(root, absent);
      return absent;
    }
    if (!this.answers.has(root)) visit(root);
    const answer = this.answers.get(root) as ResolvedTag;
    // Report every cycle found on the way, also those below the root.
    if (cycles.length === 0 || answer.cycles.length > 0) return answer;
    const withCycles: ResolvedTag = { ...answer, cycles };
    this.answers.set(root, withCycles);
    return withCycles;
  }

  /** Works out one tag once every tag it names is settled. */
  private settle(id: string, definition: Definition | null, cycle: string[] | undefined): void {
    const own = this.definition(id);
    if (cycle !== undefined) {
      const inCycle = (own?.entries ?? []).filter((entry) => entry.tag && cycle.includes(entry.id));
      this.answers.set(id, {
        registry: this.registry,
        id,
        members: [],
        missing: [...new Set(inCycle.map((entry) => `#${entry.id}`))],
        cycles: [cycle],
        dropped: true,
        replaced: own?.replaced ?? false,
      });
      return;
    }
    const missing: string[] = [];
    const members: TagMember[] = [];
    const seen = new Set<string>();
    const nestedCycles: (readonly string[])[] = [];
    for (const entry of definition?.entries ?? []) {
      if (entry.tag) {
        const inner = this.definition(entry.id) === null ? undefined : this.answers.get(entry.id);
        if (inner === undefined || inner.dropped) {
          if (entry.required) missing.push(`#${entry.id}`);
          if (inner !== undefined) nestedCycles.push(...inner.cycles);
          continue;
        }
        for (const member of inner.members) {
          if (seen.has(member.id)) continue;
          seen.add(member.id);
          members.push({
            id: member.id,
            origin: member.origin,
            chain: [entry.id, ...member.chain],
          });
        }
      } else {
        if (this.exists?.(this.registry, entry.id) === false) {
          if (entry.required) missing.push(entry.id);
          continue;
        }
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        members.push({ id: entry.id, origin: entry.origin, chain: [] });
      }
    }
    const dropped = missing.length > 0;
    this.answers.set(id, {
      registry: this.registry,
      id,
      members: dropped ? [] : members,
      missing,
      cycles: nestedCycles,
      dropped,
      replaced: own?.replaced ?? false,
    });
  }
}

/**
 * A resolver that keeps its answers: the same tag is worked out once (ADR 0120 D5). `lookup`
 * is vanilla's files, or the project over vanilla made by `layeredLookup`.
 */
export function createTagResolver(lookup: DataLookup, options: TagOptions = {}): TagResolver {
  const registries = new Map<string, RegistryTags>();
  const tagsFolder = options.tagsFolder ?? 'tags';
  let vanilla = lookup;
  let project = options.project;
  if (project === undefined && isLayered(lookup)) {
    vanilla = lookup.vanilla;
    project = lookup.project;
  }
  return (registry, id) => {
    let name = bareName(registry);
    if (name.startsWith(`${tagsFolder}/`)) name = name.slice(tagsFolder.length + 1);
    let tags = registries.get(name);
    if (tags === undefined) {
      tags = new RegistryTags(name, `${tagsFolder}/${name}`, vanilla, project, options.exists);
      registries.set(name, tags);
    }
    return tags.resolve(id);
  };
}
