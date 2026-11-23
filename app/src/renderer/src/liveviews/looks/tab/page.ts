/**
 * The creative tab page's numbers and contents (ADR 0121 D7, B625; B619 3S11): the 195 by 136
 * panel, a 9 by 5 grid of slots at (9, 18) with a step of 18, the hotbar row at y 112, tabs
 * above the panel. The things in it, in the order the game shows them, come from the Creative
 * Tab Studio's own rule (`creative-tab-model.ts`): for "In your own order" the hand list first
 * (Minecraft's items too), then the other members in the order the mod adds them.
 */

import type { Element, Project } from '@msm/plugin-api';
import {
  handOrderOf,
  tabMembers,
  tabOrderOf,
} from '../../../studios/blocks-items/creative-tab-model';

/** The panel and grid in GUI pixels. */
export const PAGE = Object.freeze({
  width: 195,
  height: 136,
  gridX: 9,
  gridY: 18,
  step: 18,
  columns: 9,
  rows: 5,
  hotbarY: 112,
  tabWidth: 26,
  tabHeight: 32,
  /** How far a selected top tab reaches above the panel. */
  tabRise: 28,
  titleX: 8,
  titleY: 6,
});

/** Slots on one page. */
export const SLOTS_PER_PAGE = PAGE.columns * PAGE.rows;

/** One thing on the page. */
export interface PageThing {
  /** The item id the game registers. */
  readonly itemId: string;
  /** Its name (the display name, or words from the id). */
  readonly name: string;
  /** Whether it is the project's own (else one of Minecraft's, named in the hand order). */
  readonly own: boolean;
}

const full = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The things in the tab in the order the page shows them. */
export function tabPageThings(project: Project, element: Element): PageThing[] {
  const order = tabOrderOf(element.data);
  const hand = order === 'by_hand' ? handOrderOf(element.data) : [];
  const members = tabMembers(project, element.id, order, hand);
  if (order !== 'by_hand') {
    return members.map((member) => ({ itemId: member.itemId, name: member.name, own: true }));
  }
  const byItem = new Map(members.map((member) => [full(member.itemId), member]));
  const out: PageThing[] = [];
  const seen = new Set<string>();
  for (const id of hand) {
    const key = full(id);
    if (seen.has(key)) continue;
    seen.add(key);
    const member = byItem.get(key);
    out.push(
      member === undefined
        ? { itemId: key, name: '', own: !key.startsWith('minecraft:') }
        : { itemId: member.itemId, name: member.name, own: true },
    );
  }
  for (const member of members) {
    if (seen.has(full(member.itemId))) continue;
    seen.add(full(member.itemId));
    out.push({ itemId: member.itemId, name: member.name, own: true });
  }
  return out;
}

/** The slot of the `index`th thing on its page, in GUI pixels from the panel's corner. */
export function slotOf(index: number): { page: number; x: number; y: number } {
  const page = Math.floor(index / SLOTS_PER_PAGE);
  const at = index % SLOTS_PER_PAGE;
  return {
    page,
    x: PAGE.gridX + (at % PAGE.columns) * PAGE.step,
    y: PAGE.gridY + Math.floor(at / PAGE.columns) * PAGE.step,
  };
}
