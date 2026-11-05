/**
 * `@msm/targets`: aggregator over every built-in Minecraft version target (ADR 0013).
 *
 * Tests and the app's main process use this package so they never name a specific version
 * package. Shipped plugin and exporter code must not import it (Biome override); they receive
 * a `Target` from the host instead.
 *
 * No `node:` imports here: callers inject their own file reader.
 */

import type { Target, TargetFacts } from '@msm/plugin-api';
import * as mc_26_3 from '@msm/target-mc-26.3';
import * as mc_26_4 from '@msm/target-mc-26.4';

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

/** Every built-in target, newest first (by `mcVersion`), snapshots included. */
export const builtInTargets: readonly TargetBundle[] = Object.freeze([
  Object.freeze({ target: mc_26_4.target, vendored: mc_26_4.vendored }),
  Object.freeze({ target: mc_26_3.target, vendored: mc_26_3.vendored }),
]);

/** The built-in targets whose `channel` is `release`, newest first. */
export const releaseTargets: readonly TargetBundle[] = Object.freeze(
  builtInTargets.filter((bundle) => bundle.target.channel === 'release'),
);

/**
 * The id of the newest release target, used for new projects (ADR 0037 D4): snapshot targets
 * are offered but never the default.
 */
export const defaultTargetId: string = (releaseTargets[0] as TargetBundle).target.id;

/** The built-in bundle whose `target.id` is `id`, or `undefined`. */
export function targetById(id: string): TargetBundle | undefined {
  return builtInTargets.find((bundle) => bundle.target.id === id);
}

/**
 * The facts of the built-in target `id` without its hooks (`javaProject`, `migrateFrom`), or
 * `undefined`. The result is plain data, so it survives `structuredClone` (and `postMessage`
 * to a worker); a fresh object on every call.
 */
export function targetFacts(id: string): TargetFacts | undefined {
  const target = targetById(id)?.target;
  if (target === undefined) return undefined;
  const { javaProject: _javaProject, migrateFrom: _migrateFrom, ...facts } = target;
  return structuredClone(facts);
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
