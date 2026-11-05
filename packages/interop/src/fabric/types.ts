/**
 * Shared types of the "Test in Minecraft" support (ADR 0026 D5): the Fabric facts of a target,
 * the injected downloader and hasher, and the errors the module throws.
 */

/** The Fabric versions a test run needs, taken from the project's target (`Target.fabric`). */
export interface FabricTestFacts {
  /** The Minecraft version the project targets (`Target.mcVersion`). */
  mcVersion: string;
  /** Fabric Loader version (`Target.fabric.loader`). */
  loader: string;
  /** Fabric API version as published on the Fabric Maven (`Target.fabric.api`). */
  api: string;
}

/** Fetches a URL's bytes; rejects on a network error or a non-success status. */
export type Downloader = (url: string) => Promise<Uint8Array>;

/** Lower-case hex SHA-512 of the bytes. */
export type Sha512 = (bytes: Uint8Array) => Promise<string>;

/** Why a Test in Minecraft step failed. */
export type FabricTestErrorCode =
  | 'fabric.bad-mod-id'
  | 'fabric.bad-version'
  | 'fabric.foreign-file'
  | 'fabric.instance-not-managed'
  | 'fabric.download-failed'
  | 'fabric.checksum-mismatch';

/** An error with a stable code; its message is written for the user. */
export class FabricTestError extends Error {
  readonly code: FabricTestErrorCode;

  constructor(code: FabricTestErrorCode, message: string) {
    super(message);
    this.name = 'FabricTestError';
    this.code = code;
  }
}

/** A Fabric mod id: 2 to 64 characters, a lower-case letter first, then `a-z0-9_-`. */
export const FABRIC_MOD_ID = /^[a-z][a-z0-9_-]{1,63}$/;

/** A version string safe as one path segment and in a Maven URL. */
export const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

/** Throws `fabric.bad-version` unless `version` matches {@link SAFE_VERSION}. */
export function assertSafeVersion(version: string, what: string): void {
  if (!SAFE_VERSION.test(version)) {
    throw new FabricTestError(
      'fabric.bad-version',
      `${JSON.stringify(version)} is not a valid ${what} version.`,
    );
  }
}

/**
 * Compares two dotted version strings by their leading numeric parts (`0.20.1` < `0.21`).
 * Non-numeric suffixes (`+build`, `-beta`) are ignored. Returns a negative number, zero or a
 * positive number.
 */
export function compareDottedVersions(a: string, b: string): number {
  const parts = (value: string): number[] =>
    (/^[0-9]+(?:\.[0-9]+)*/.exec(value)?.[0] ?? '0').split('.').map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** JSON text with sorted keys, 2-space indented, ending in a newline. */
export function stableJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (typeof input === 'object' && input !== null) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(input).sort()) {
        out[key] = sort((input as Record<string, unknown>)[key]);
      }
      return out;
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
