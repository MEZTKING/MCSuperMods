/**
 * `@msm/targets`: aggregator over every built-in Minecraft version target (ADR 0013).
 *
 * Tests and the app's main process use this package so they never name a specific version
 * package. Shipped plugin and exporter code must not import it (Biome override); they receive
 * a `Target` from the host instead.
 *
 * No `node:` imports here: callers inject their own file reader.
 */

import type { Target } from '@msm/plugin-api';
import * as mc_26_3 from '@msm/target-mc-26.3';

/** A target together with the locations of its vendored data files. */
export interface TargetBundle {
  target: Target;
  vendored: {
    vanillaMcdocSymbols: URL;
    mcmetaVersion: URL;
    mcmetaRegistries: URL;
    mcmetaCommands: URL;
    mcmetaBlocks: URL;
  };
}

/** The keys of `TargetBundle.vendored`. */
export type VendoredKey = keyof TargetBundle['vendored'];

/** Every built-in target, newest first. */
export const builtInTargets: readonly TargetBundle[] = Object.freeze([
  Object.freeze({ target: mc_26_3.target, vendored: mc_26_3.vendored }),
]);

/** The id of the newest built-in target, used for new projects. */
export const defaultTargetId: string = (builtInTargets[0] as TargetBundle).target.id;

/** The built-in bundle whose `target.id` is `id`, or `undefined`. */
export function targetById(id: string): TargetBundle | undefined {
  return builtInTargets.find((bundle) => bundle.target.id === id);
}

/**
 * Reads and parses one vendored JSON file of `bundle` through the injected `readFile`.
 * Throws if the bytes are not valid UTF-8 JSON.
 */
export async function readVendoredJson(
  bundle: TargetBundle,
  key: VendoredKey,
  readFile: (url: URL) => Promise<Uint8Array>,
): Promise<unknown> {
  const bytes = await readFile(bundle.vendored[key]);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(text) as unknown;
}
