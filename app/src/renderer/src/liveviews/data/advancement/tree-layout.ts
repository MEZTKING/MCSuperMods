/**
 * An advancement tab laid out as a tidy tree (B611; ADR 0120 D6, limit 2L5). What the game was
 * seen to do (B600 2S8, on both targets, by observation only): every root with a display is a
 * tab; x is the depth among advancements that have a display, so one without a display is
 * skipped and its children hang from the nearest shown ancestor; siblings sit at least one row
 * apart at every depth, and a parent at the midpoint of its first and last child; the whole tab
 * is moved so its smallest row is 0. That is a tidy tree with contours (Reingold and Tilford).
 *
 * Given the game's own order of siblings this layout put 98 to 100 % of the nodes in the game's
 * rows (`app/test/components/liveviews/data/tree-layout.test.ts` replays the spike's tab). That
 * order is the game's and differs between versions and between the server and the client, so
 * MSM orders siblings by id: same parents, children and columns, rows about right.
 */

import type { Json } from '@msm/plugin-api';

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A frame of an advancement's display. */
export type AdvancementFrame = 'task' | 'goal' | 'challenge';

/** What a shown advancement looks like. */
export interface AdvancementDisplay {
  readonly icon: { readonly id: string; readonly count: number };
  readonly title: Json;
  readonly description: Json;
  readonly frame: AdvancementFrame;
  /** Texture id of the tab's background (roots only). */
  readonly background: string | null;
  readonly showToast: boolean;
  readonly announceToChat: boolean;
  readonly hidden: boolean;
}

/** Where an advancement came from. */
export type AdvancementOrigin = 'project' | 'vanilla' | 'missing';

/** One advancement as the tree reads it. */
export interface AdvancementNode {
  readonly id: string;
  readonly parent: string | null;
  /** `null` for one without a display (not drawn; its children hang from its shown ancestor). */
  readonly display: AdvancementDisplay | null;
  /** The criteria's names and triggers, in the file's order. */
  readonly criteria: readonly { readonly name: string; readonly trigger: string }[];
  /** Groups of criteria names: every group must be met, any one name of a group meets it. */
  readonly requirements: readonly (readonly string[])[];
  readonly rewards: Readonly<Record<string, Json>>;
  readonly origin: AdvancementOrigin;
}

const FRAMES: readonly AdvancementFrame[] = ['task', 'goal', 'challenge'];

/** An advancement file read for the tree (missing fields take the game's defaults). */
export function readAdvancement(
  id: string,
  json: Json | undefined,
  origin: AdvancementOrigin,
): AdvancementNode {
  const data = isRecord(json) ? json : {};
  const parent = typeof data.parent === 'string' ? withNamespace(data.parent) : null;
  let display: AdvancementDisplay | null = null;
  if (isRecord(data.display)) {
    const d = data.display;
    const icon = isRecord(d.icon) ? d.icon : {};
    const frame = FRAMES.find((name) => name === d.frame) ?? 'task';
    display = {
      icon: {
        id: typeof icon.id === 'string' ? withNamespace(icon.id) : 'minecraft:air',
        count: typeof icon.count === 'number' ? icon.count : 1,
      },
      title: d.title ?? '',
      description: d.description ?? '',
      frame,
      background: typeof d.background === 'string' ? d.background : null,
      showToast: d.show_toast !== false,
      announceToChat: d.announce_to_chat !== false,
      hidden: d.hidden === true,
    };
  }
  const criteria = isRecord(data.criteria)
    ? Object.entries(data.criteria).map(([name, criterion]) => ({
        name,
        trigger:
          isRecord(criterion) && typeof criterion.trigger === 'string' ? criterion.trigger : '',
      }))
    : [];
  const requirements = Array.isArray(data.requirements)
    ? data.requirements
        .filter((group): group is Json[] => Array.isArray(group))
        .map((group) => group.filter((name): name is string => typeof name === 'string'))
    : criteria.map((criterion) => [criterion.name]);
  return {
    id,
    parent,
    display,
    criteria,
    requirements,
    rewards: isRecord(data.rewards) ? data.rewards : {},
    origin,
  };
}

/** `story/root` to `minecraft:story/root`. */
export function withNamespace(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** A placeholder for a parent MSM could not find (drawn as a plain task named by its id). */
export function missingNode(id: string): AdvancementNode {
  return {
    id,
    parent: null,
    display: {
      icon: { id: 'minecraft:air', count: 1 },
      title: id,
      description: '',
      frame: 'task',
      background: null,
      showToast: false,
      announceToChat: false,
      hidden: false,
    },
    criteria: [],
    requirements: [],
    rewards: {},
    origin: 'missing',
  };
}

/** Advancements by id. */
export type AdvancementMap = ReadonlyMap<string, AdvancementNode>;

/** Each advancement's children (every child, shown or not), in id order. */
export function childrenIndex(nodes: AdvancementMap): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const node of nodes.values()) {
    if (node.parent === null) continue;
    const list = out.get(node.parent);
    if (list === undefined) out.set(node.parent, [node.id]);
    else list.push(node.id);
  }
  for (const list of out.values()) list.sort(byId);
  return out;
}

/** Ids in code-point order (MSM's order of siblings). */
export function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The ancestors of an advancement, nearest first, following `parent` through `nodes`. Stops at a
 * root, at a parent not in `nodes` (`missing`), or at a loop (`loop`).
 */
export function ancestorsOf(
  nodes: AdvancementMap,
  id: string,
): { readonly chain: readonly string[]; readonly missing: string | null; readonly loop: boolean } {
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  let current = nodes.get(id)?.parent ?? null;
  while (current !== null) {
    if (seen.has(current)) return { chain, missing: null, loop: true };
    seen.add(current);
    const node = nodes.get(current);
    if (node === undefined) return { chain, missing: current, loop: false };
    chain.push(current);
    current = node.parent;
  }
  return { chain, missing: null, loop: false };
}

/** One node of a laid out tab. */
export interface PlacedNode {
  readonly id: string;
  /** Column: the depth among shown advancements. */
  readonly x: number;
  /** Row (halves happen: a parent sits at the midpoint of its children). */
  readonly y: number;
}

/** A tab laid out. */
export interface TabLayout {
  readonly root: string;
  readonly nodes: readonly PlacedNode[];
  /** Shown parent to shown child (skipping advancements without a display). */
  readonly edges: readonly { readonly from: string; readonly to: string }[];
  readonly columns: number;
  readonly rows: number;
}

/** The children an advancement shows: its own with a display, else theirs, in sibling order. */
export function shownChildren(
  nodes: AdvancementMap,
  children: ReadonlyMap<string, readonly string[]>,
  id: string,
  order: (a: string, b: string) => number = byId,
  seen: Set<string> = new Set(),
): string[] {
  const out: string[] = [];
  for (const child of children.get(id) ?? []) {
    if (seen.has(child)) continue;
    seen.add(child);
    if (nodes.get(child)?.display !== null) out.push(child);
    else out.push(...shownChildren(nodes, children, child, order, seen));
  }
  return out.sort(order);
}

interface Placed {
  /** Per depth below the subtree's root: the least and most row, relative to the root. */
  readonly contour: [number, number][];
  readonly members: string[];
}

/**
 * Rows of a tidy tree: each subtree is placed as close below the previous ones as its contour
 * allows (one row apart at every depth), the parent at the midpoint of its first and last child,
 * then everything moved so the smallest row is 0. `childrenOf` gives a node's children in order.
 */
export function tidyRows(
  root: string,
  childrenOf: (id: string) => readonly string[],
): Map<string, number> {
  const rows = new Map<string, number>();
  const visiting = new Set<string>();
  const place = (node: string): Placed => {
    visiting.add(node);
    const kids = childrenOf(node).filter((kid) => !visiting.has(kid));
    rows.set(node, 0);
    if (kids.length === 0) {
      visiting.delete(node);
      return { contour: [[0, 0]], members: [node] };
    }
    const subs = kids.map(place);
    const offsets: number[] = [0];
    const first = subs[0] as Placed;
    const acc: [number, number][] = first.contour.map(([a, b]) => [a, b]);
    for (let i = 1; i < subs.length; i += 1) {
      const sub = subs[i] as Placed;
      let offset = Number.NEGATIVE_INFINITY;
      const depth = Math.min(acc.length, sub.contour.length);
      for (let d = 0; d < depth; d += 1) {
        offset = Math.max(
          offset,
          (acc[d] as [number, number])[1] - (sub.contour[d] as [number, number])[0] + 1,
        );
      }
      offsets.push(offset);
      sub.contour.forEach(([low, high], d) => {
        const moved: [number, number] = [low + offset, high + offset];
        const at = acc[d];
        if (at === undefined) acc.push(moved);
        else acc[d] = [Math.min(at[0], moved[0]), Math.max(at[1], moved[1])];
      });
    }
    const mid = ((offsets[0] as number) + (offsets[offsets.length - 1] as number)) / 2;
    const members = [node];
    subs.forEach((sub, i) => {
      const shift = (offsets[i] as number) - mid;
      for (const member of sub.members) {
        rows.set(member, (rows.get(member) as number) + shift);
        members.push(member);
      }
    });
    visiting.delete(node);
    return {
      contour: [[0, 0], ...acc.map(([a, b]): [number, number] => [a - mid, b - mid])],
      members,
    };
  };
  place(root);
  let least = Number.POSITIVE_INFINITY;
  for (const row of rows.values()) least = Math.min(least, row);
  for (const [node, row] of rows) rows.set(node, row - least);
  return rows;
}

/**
 * The tab whose root is `root`, laid out (`null` when the root has no display: the game makes
 * no tab of it). `order` is the order of siblings (MSM's: by id).
 */
export function layoutTab(
  nodes: AdvancementMap,
  root: string,
  order: (a: string, b: string) => number = byId,
): TabLayout | null {
  if (nodes.get(root)?.display == null) return null;
  const children = childrenIndex(nodes);
  const kidsCache = new Map<string, string[]>();
  const childrenOf = (id: string): string[] => {
    let kids = kidsCache.get(id);
    if (kids === undefined) {
      kids = shownChildren(nodes, children, id, order);
      kidsCache.set(id, kids);
    }
    return kids;
  };
  const rows = tidyRows(root, childrenOf);
  const columns = new Map<string, number>([[root, 0]]);
  const edges: { from: string; to: string }[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const kid of childrenOf(id)) {
      if (columns.has(kid)) continue;
      columns.set(kid, (columns.get(id) as number) + 1);
      edges.push({ from: id, to: kid });
      queue.push(kid);
    }
  }
  const placed: PlacedNode[] = [...rows].map(([id, y]) => ({ id, x: columns.get(id) ?? 0, y }));
  let maxX = 0;
  let maxY = 0;
  for (const node of placed) {
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  return { root, nodes: placed, edges, columns: maxX + 1, rows: maxY + 1 };
}
