/**
 * The GeckoLib jar the Fabric content jar nests for projects with entities (ADR 0029 D4).
 *
 * Given a target's `geckolib` facts, the jar comes from the download cache
 * (`<cacheDir>/geckolib/<fileName>`, the same cache folder as Test in Minecraft's Fabric API
 * download) when its bytes still match the facts' SHA-512; otherwise it is downloaded once
 * from the facts' URL with the same downloader as Fabric API, checked against the SHA-512 and
 * written atomically (the install file system goes through `withAtomicWrites`).
 *
 * Every failure (no facts, offline, bad hash, unwritable cache) is `null`, never an error: the
 * exporter then reports `export.geckolib-missing`, and the user can still choose "Separate
 * runtime and GeckoLib (for modpacks)". A download whose hash does not match is never cached.
 *
 * @packageDocumentation
 */

import {
  type Downloader,
  fetchDownloader,
  type InstallFileSystem,
  joinInstallPath,
  type Sha512,
  webCryptoSha512,
} from '@msm/interop';
import type { GeckolibFacts } from '@msm/plugin-api';
import { targetById } from '@msm/targets';

/** The cache subfolder GeckoLib jars are kept in. */
export const GECKOLIB_CACHE_FOLDER = 'geckolib';

/** A safe jar file name: one path segment ending in `.jar`. */
const SAFE_JAR_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.jar$/;

/** What the service needs from its host. */
export interface GeckolibJarDeps {
  fs: InstallFileSystem;
  /** The download cache folder (absolute), shared with Test in Minecraft. */
  cacheDir: string;
  /** Defaults to `fetch` over HTTPS. */
  download?: Downloader;
  /** Defaults to Web Crypto. */
  sha512?: Sha512;
  /** The GeckoLib facts of a target. Defaults to the built-in targets' `Target.geckolib`. */
  facts?(targetId: string): GeckolibFacts | undefined;
}

/** The main-process GeckoLib jar service. */
export interface GeckolibJarService {
  /** The GeckoLib jar for `targetId`, or `null` when it is not cached and cannot be downloaded. */
  jar(targetId: string): Promise<Uint8Array | null>;
}

/** The GeckoLib facts of a built-in target, or `undefined`. */
export function builtInGeckolibFacts(targetId: string): GeckolibFacts | undefined {
  return targetById(targetId)?.target.geckolib;
}

/** Where `facts`' jar is cached, or `null` when its file name is not a safe segment. */
export function geckolibCachePath(cacheDir: string, facts: GeckolibFacts): string | null {
  if (!SAFE_JAR_NAME.test(facts.fileName)) return null;
  return joinInstallPath(joinInstallPath(cacheDir, GECKOLIB_CACHE_FOLDER), facts.fileName);
}

/** Creates the service. Concurrent requests for the same jar share one download. */
export function createGeckolibJarService(deps: GeckolibJarDeps): GeckolibJarService {
  const download = deps.download ?? fetchDownloader;
  const sha512 = deps.sha512 ?? webCryptoSha512;
  const factsFor = deps.facts ?? builtInGeckolibFacts;
  const pending = new Map<string, Promise<Uint8Array | null>>();

  const matches = async (bytes: Uint8Array, facts: GeckolibFacts): Promise<boolean> =>
    bytes.length > 0 && (await sha512(bytes)) === facts.sha512.toLowerCase();

  const load = async (facts: GeckolibFacts, path: string): Promise<Uint8Array | null> => {
    try {
      if (await deps.fs.exists(path)) {
        const cached = await deps.fs.readFile(path);
        if (await matches(cached, facts)) return cached;
      }
    } catch {
      // A damaged or unreadable cache entry is downloaded again.
    }
    let bytes: Uint8Array;
    try {
      bytes = await download(facts.url);
    } catch {
      return null;
    }
    if (!(await matches(bytes, facts))) return null;
    try {
      await deps.fs.mkdirp(joinInstallPath(deps.cacheDir, GECKOLIB_CACHE_FOLDER));
      await deps.fs.writeFile(path, bytes);
    } catch {
      // The verified bytes are still usable for this export; the next one downloads again.
    }
    return bytes;
  };

  return {
    async jar(targetId) {
      const facts = factsFor(targetId);
      if (facts === undefined) return null;
      const path = geckolibCachePath(deps.cacheDir, facts);
      if (path === null) return null;
      const running = pending.get(path);
      if (running !== undefined) return running;
      const next = load(facts, path).finally(() => pending.delete(path));
      pending.set(path, next);
      return next;
    },
  };
}
