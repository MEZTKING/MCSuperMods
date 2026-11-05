/**
 * The target the sample golden tests write their CI outputs for (B153): `MSM_TARGET_ID`, or
 * the default target (the newest release) when unset. The SHA-256 goldens are checked for
 * every built-in target regardless (`test/fixtures/<target id>/`); only the jars, trees and
 * facts files written for CI's server checks follow this choice.
 */
import { defaultTargetId, type TargetBundle, targetById } from '@msm/targets';

/** The selected target's bundle; throws on an unknown `MSM_TARGET_ID`. */
export function selectedTarget(): TargetBundle {
  const id = process.env.MSM_TARGET_ID || defaultTargetId;
  const bundle = targetById(id);
  if (bundle === undefined) throw new Error(`MSM_TARGET_ID names no built-in target: ${id}`);
  return bundle;
}

/** The bundle of the default target, which the committed sample projects are written for. */
export function defaultTarget(): TargetBundle {
  return targetById(defaultTargetId) as TargetBundle;
}
