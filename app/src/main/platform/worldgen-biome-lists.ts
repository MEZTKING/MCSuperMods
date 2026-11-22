/**
 * The resolved biome parameter lists of vanilla's `multi_noise` presets (ADR 0119 D4): the jar
 * holds only a preset name for the overworld and the Nether (B574 WS9), so the live world
 * generation preview draws their land in one biome colour (limit WL7). Reserve B592 fills this
 * file: the runtime's dev mode writes the lists, from vanilla's own accessors on the user's
 * machine, into the managed Play instance, and this reads them as a save is read. The lists are
 * never shipped, exported, committed or sent to the AI helper.
 *
 * Stub until B592: always `null`.
 *
 * @packageDocumentation
 */

import type { ResolvedBiomeListsView } from '../../shared/platform';

/** What {@link readResolvedBiomeLists} is given. */
export interface ResolvedBiomeListsRequest {
  /** The installed version the lists must belong to (the target's `mcVersion`). */
  mcVersion: string;
  /** The managed Play instance's game folder, when Play has reported it (ADR 0084); else `null`. */
  managedGameDir: string | null;
}

/**
 * The resolved lists by preset id for `request.mcVersion`, or `null` when there are none (no
 * Play yet, another version, an unreadable file). Never throws. Stub: always `null` (B592).
 */
export async function readResolvedBiomeLists(
  _request: ResolvedBiomeListsRequest,
): Promise<ResolvedBiomeListsView | null> {
  return null;
}
