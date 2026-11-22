/**
 * The showcase's taken stills (ADR 0118 D7, B568): the frame a clip drew at its `stillAt`, as a
 * PNG `data:` URL, kept by clip, target and whether the user's client jar is present (the jar
 * changes how vanilla blocks look). In memory only: nothing is written to disk, and a still is
 * taken once per clip per session (B565: only inside `onFrameDrawn`).
 *
 * Cards read it with `useSyncExternalStore` through {@link subscribeStills} and
 * {@link stillsVersion}.
 *
 * @packageDocumentation
 */

const stills = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

/** The key of a still: the clip, the target and whether the client jar draws vanilla blocks. */
export function stillKey(clipId: string, targetId: string, withJar: boolean): string {
  return `${clipId}\u0000${targetId}\u0000${withJar ? 'jar' : 'no-jar'}`;
}

/** The taken still of `key`, or `null` before the clip has played to its `stillAt`. */
export function takenStill(key: string): string | null {
  return stills.get(key) ?? null;
}

/** Whether `key` has a taken still. */
export function hasStill(key: string): boolean {
  return stills.has(key);
}

/**
 * Keeps the still of `key`. The first one wins: a still is taken once per clip per session, so
 * a later call for the same key changes nothing and returns `false`.
 */
export function keepStill(key: string, dataUrl: string): boolean {
  if (stills.has(key) || !dataUrl.startsWith('data:image/')) return false;
  stills.set(key, dataUrl);
  version += 1;
  for (const listener of [...listeners]) listener();
  return true;
}

/** Calls `listener` whenever a still is kept; returns the unsubscribe. */
export function subscribeStills(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A number that grows with every kept still (`useSyncExternalStore`'s snapshot). */
export function stillsVersion(): number {
  return version;
}

/** Forgets every still (tests). */
export function clearStills(): void {
  stills.clear();
  version += 1;
  for (const listener of [...listeners]) listener();
}
