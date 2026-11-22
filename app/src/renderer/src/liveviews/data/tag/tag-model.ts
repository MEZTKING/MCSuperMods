/**
 * What the tag view shows, worked out from a resolved tag (`@msm/sim`'s `ResolvedTag`, B604) and
 * the tag file as written (B612): the members grouped by the tag they came through, where each
 * came from, the tag's own optional entries, the reasons the game drops it, and **What changed**
 * against vanilla's tag of the same id. Pure: no file reads, no React.
 */

import type { Json, Project } from '@msm/plugin-api';
import type { ResolvedTag, TagMember } from '@msm/sim';
import { vanillaFileId } from '../../vanilla-data';

/** The registry of a tag kind (`minecraft:tag/item` to `item`), or `null` for another kind. */
export function tagRegistryOf(kind: string): string | null {
  const prefix = 'minecraft:tag/';
  return kind.startsWith(prefix) ? kind.slice(prefix.length) : null;
}

/** One entry of a tag file as written. */
export interface WrittenEntry {
  /** Namespaced, without `#`. */
  readonly id: string;
  readonly tag: boolean;
  readonly required: boolean;
}

/** The entries of a tag file (`values`: ids, `#tag` ids, or `{ id, required }`). */
export function writtenEntries(data: Json | undefined): WrittenEntry[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
  const values = data.values;
  if (!Array.isArray(values)) return [];
  const out: WrittenEntry[] = [];
  for (const value of values) {
    let raw: string | undefined;
    let required = true;
    if (typeof value === 'string') raw = value;
    else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      if (typeof value.id === 'string') raw = value.id;
      if (value.required === false) required = false;
    }
    if (raw === undefined || raw.trim() === '') continue;
    out.push({ id: vanillaFileId(raw.trim()), tag: raw.trim().startsWith('#'), required });
  }
  return out;
}

const namespaceOf = (id: string): string => {
  const colon = id.indexOf(':');
  return colon < 0 ? 'minecraft' : id.slice(0, colon);
};

/** Whether a namespaced id is Minecraft's own. */
export function isMinecraftId(id: string): boolean {
  return namespaceOf(vanillaFileId(id)) === 'minecraft';
}

/**
 * Whether resolving the tag reads a vanilla file: its id is Minecraft's (vanilla's tag of the
 * same id merges in), or it names one of Minecraft's tags.
 */
export function namesVanillaFile(id: string, data: Json | undefined): boolean {
  if (isMinecraftId(id)) return true;
  return writtenEntries(data).some((entry) => entry.tag && isMinecraftId(entry.id));
}

/** Members that came through the same tag (or the tag's own entries, `via` `null`). */
export interface MemberGroup {
  /** The tag named in this tag's own list that they came through, or `null` for direct ones. */
  readonly via: string | null;
  readonly members: readonly TagMember[];
}

/** The members grouped by the first tag of their chain, in the order they first appear. */
export function groupMembers(members: readonly TagMember[]): MemberGroup[] {
  const groups = new Map<string | null, TagMember[]>();
  for (const member of members) {
    const via = member.chain[0] ?? null;
    let list = groups.get(via);
    if (list === undefined) {
      list = [];
      groups.set(via, list);
    }
    list.push(member);
  }
  return [...groups].map(([via, list]) => ({ via, members: list }));
}

/**
 * Where a member comes from, in plain words: the file that lists it (this tag's, or the
 * innermost tag of its chain), yours or Minecraft's, and the tags between.
 */
export function comesFrom(member: TagMember, tagId: string): string {
  const owner = member.origin === 'project' ? 'your' : 'Minecraft’s';
  const inner = member.chain[member.chain.length - 1];
  if (inner === undefined) {
    return `comes from ${owner} #${tagId}`;
  }
  const between = member.chain.slice(0, -1);
  const through =
    between.length === 0 ? '' : `, through ${between.map((id) => `#${id}`).join(', ')}`;
  return `comes from ${owner} #${inner}${through}`;
}

/** Whether the resolved answer is "no file defines this tag" (the resolver's absent answer). */
export function isAbsent(tag: ResolvedTag): boolean {
  return (
    tag.dropped &&
    tag.members.length === 0 &&
    tag.cycles.length === 0 &&
    tag.missing.length === 1 &&
    tag.missing[0] === `#${tag.id}`
  );
}

/** What the project's file changed in vanilla's tag of the same id. */
export type TagChange =
  /** Vanilla has no tag of this id: everything in it is new. */
  | { readonly kind: 'new' }
  | {
      readonly kind: 'changed';
      /** In the tag now, not in vanilla's. */
      readonly added: readonly string[];
      /** In vanilla's tag, not in the tag now. */
      readonly removed: readonly string[];
    };

/** What changed against vanilla's tag (`vanilla`: the same tag resolved from vanilla's files). */
export function whatChanged(now: ResolvedTag, vanilla: ResolvedTag): TagChange {
  if (isAbsent(vanilla)) return { kind: 'new' };
  const before = new Set(vanilla.members.map((member) => member.id));
  const after = new Set(now.members.map((member) => member.id));
  return {
    kind: 'changed',
    added: now.members.map((member) => member.id).filter((id) => !before.has(id)),
    removed: vanilla.members.map((member) => member.id).filter((id) => !after.has(id)),
  };
}

/** One of the tag's own optional entries and whether anything came of it. */
export interface OptionalEntry {
  readonly id: string;
  readonly tag: boolean;
  /** Found (an element that exists, a tag that gave members), or skipped as the game skips it. */
  readonly found: boolean;
}

/**
 * The tag's own optional entries and whether each was found. An element counts as found when it
 * is among the direct members; a tag when something came through it.
 */
export function optionalEntries(data: Json | undefined, resolved: ResolvedTag): OptionalEntry[] {
  const direct = new Set(
    resolved.members.filter((member) => member.chain.length === 0).map((member) => member.id),
  );
  const via = new Set(resolved.members.map((member) => member.chain[0]).filter(Boolean));
  return writtenEntries(data)
    .filter((entry) => !entry.required)
    .map((entry) => ({
      id: entry.id,
      tag: entry.tag,
      found: entry.tag ? via.has(entry.id) : direct.has(entry.id),
    }));
}

/**
 * The missing entries split by whether vanilla's files could have held them: with the Minecraft
 * folder not set up, one of Minecraft's tags is not missing, only unread.
 */
export function splitMissing(
  missing: readonly string[],
  vanillaRead: boolean,
): { readonly missing: readonly string[]; readonly unread: readonly string[] } {
  if (vanillaRead) return { missing, unread: [] };
  const out: string[] = [];
  const unread: string[] = [];
  for (const entry of missing) {
    if (entry.startsWith('#') && isMinecraftId(entry.slice(1))) unread.push(entry);
    else out.push(entry);
  }
  return { missing: out, unread };
}

/**
 * The ids of a registry that count as existing in the preview panel, where the session's registry
 * index is not at hand: vanilla's (the target's vendored registry list) and, as taken to exist,
 * every project element id and every entry the project's tags of this registry name in the
 * project's own namespaces (Minecraft's excepted). `null` when the vendored list could not be
 * read ("cannot tell": entries are kept).
 */
export function panelRegistryIds(
  vanilla: Readonly<Record<string, readonly string[]>> | null,
  project: Pick<Project, 'namespaces'>,
  registry: string,
): readonly string[] | null {
  if (vanilla === null) return null;
  const out = new Set<string>((vanilla[registry] ?? []).map((id) => vanillaFileId(id)));
  const own = new Set(
    project.namespaces.map((namespace) => namespace.name).filter((name) => name !== 'minecraft'),
  );
  const kind = `minecraft:tag/${registry}`;
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      out.add(vanillaFileId(element.id));
      if (element.kind !== kind) continue;
      for (const entry of writtenEntries(element.data as Json)) {
        if (!entry.tag && own.has(namespaceOf(entry.id))) out.add(entry.id);
      }
    }
  }
  return [...out].sort();
}
