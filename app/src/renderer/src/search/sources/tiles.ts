/**
 * The Home tiles source (ADR 0124 D3, D6; B660; B658's note): one entry per Home tile that shows
 * on the target, and one per Very easy pick ("Sign", "Bush with berries"). A flow tile that offers
 * exactly one flow and no starter carries that flow's own action, so it folds into the flow's
 * result; a tile with a chooser carries the list of its flows (and starters), which a Showcase card
 * with the same flows folds into. A pick carries its flow's action: its words reach the flow.
 * "Surprise me", the Rule book, the painter and the AI helper are tiles of their own.
 *
 * @packageDocumentation
 */

import type { SearchEntry } from '@msm/search';
import { MINECRAFT_TEXTURE_COMMAND } from '../../components/home/minecraft-texture-tile';
import {
  MAKE_BLOCK_PICKS,
  MAKE_ITEM_PICKS,
  MAKE_TILES,
  MAKE_WORLD_PICKS,
  type MakeTile,
  type MakeTileAction,
  shownTiles,
  type VeryEasyPick,
} from '../../components/home/tiles';
import { asAction, asPreview, entryIds, flowAction, type SearchActionDescriptor } from './shared';

/** Which flows and starters the target can use (the flow and starter entries' availability). */
export interface FlowAvailability {
  flowAvailable(flowId: string): boolean;
  starterAvailable(starterId: string): boolean;
  /** Whether the rule book kind is registered. */
  rules: boolean;
}

/** The action of a flows choice: one flow folds into it, more are a chooser. */
export function flowsAction(
  flowIds: readonly string[],
  starterIds: readonly string[],
): SearchActionDescriptor | undefined {
  if (flowIds.length === 1 && starterIds.length === 0) return flowAction(flowIds[0] as string);
  if (flowIds.length === 0 && starterIds.length === 1) {
    return { type: 'starter', starter: starterIds[0] as string };
  }
  if (flowIds.length + starterIds.length === 0) return undefined;
  return {
    type: 'flows',
    flows: [...flowIds],
    ...(starterIds.length > 0 ? { starters: [...starterIds] } : {}),
  };
}

function otherAction(action: MakeTileAction): SearchActionDescriptor | undefined {
  switch (action.type) {
    case 'surprise':
      return { type: 'surprise' };
    case 'rules':
      return { type: 'rules-book' };
    case 'paint':
      return { type: 'paint' };
    case 'ai':
      return { type: 'ai' };
    case 'minecraft-texture':
      return { type: 'command', command: MINECRAFT_TEXTURE_COMMAND };
    default:
      return undefined;
  }
}

function tileEntry(tile: MakeTile, action: SearchActionDescriptor): SearchEntry {
  return {
    id: entryIds.tile(tile.id),
    source: 'tile',
    title: tile.label,
    sentence: tile.sentence,
    words: ['make'],
    available: true,
    action: asAction(action),
    preview: asPreview(action),
  };
}

function pickEntry(pick: VeryEasyPick): SearchEntry {
  const action = flowAction(pick.flowId);
  return {
    id: entryIds.pick(pick.id),
    source: 'tile',
    title: pick.label,
    sentence: pick.sentence,
    available: true,
    action: asAction(action),
    preview: asPreview(action),
  };
}

/** The tile and pick entries that show on the target. */
export function tileEntries(
  availability: FlowAvailability,
  tiles: readonly MakeTile[] = MAKE_TILES,
  picks: readonly VeryEasyPick[] = [...MAKE_BLOCK_PICKS, ...MAKE_ITEM_PICKS, ...MAKE_WORLD_PICKS],
): SearchEntry[] {
  const out: SearchEntry[] = [];
  const shown = shownTiles(
    {
      flowAvailable: availability.flowAvailable,
      starterAvailable: availability.starterAvailable,
      rules: availability.rules,
      // The AI tile's own action says whether a key is set; the search shows it either way.
      ai: true,
    },
    tiles,
  );
  for (const { tile, flowIds, starterIds } of shown) {
    const action =
      tile.action.type === 'flows' ? flowsAction(flowIds, starterIds) : otherAction(tile.action);
    if (action !== undefined) out.push(tileEntry(tile, action));
  }
  const seen = new Set<string>();
  for (const pick of picks) {
    if (seen.has(pick.id) || !availability.flowAvailable(pick.flowId)) continue;
    seen.add(pick.id);
    out.push(pickEntry(pick));
  }
  return out;
}
