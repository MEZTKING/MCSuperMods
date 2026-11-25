/**
 * What `new-target` reads from outside: Mojang's version manifest (for `--check` and the Java
 * version), the vendoring tools it runs, and the newest vanilla-mcdoc commit. Every reader is
 * injectable, so the tests run offline on fixtures; only a run by hand fetches.
 *
 * Everything fetched is untrusted data: parsed and checked, never executed.
 *
 * @packageDocumentation
 */

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { syncFeatureOrder } from '../sync-feature-order/index.ts';
import { syncMcdoc } from '../sync-mcdoc/index.ts';
import { type FetchFile, syncMcmeta } from '../sync-mcmeta/index.ts';
import { releaseLine, VERSION_PATTERN } from './derive.ts';

const run = promisify(execFile);

/**
 * The client name sent with every request this tool makes: the app and its repository only,
 * nothing of the person running it.
 */
export const USER_AGENT = 'MCSuperMods-new-target (+https://github.com/MEZTKING/MCSuperMods)';

/** Mojang's version manifest. */
export const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

/** The vanilla-mcdoc repository whose export the targets vendor. */
export const VANILLA_MCDOC_URL = 'https://github.com/SpyglassMC/vanilla-mcdoc';

/** Fetches a URL as text; throws on a failure. Injectable for tests. */
export type FetchText = (url: string) => Promise<string>;

/** The default fetcher: global `fetch` with the tool's client name. */
export const fetchText: FetchText = async (url) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  return await response.text();
};

/** One version in Mojang's manifest. */
export interface ManifestVersion {
  id: string;
  type: string;
  url: string;
  releaseTime: string;
}

/** Mojang's version manifest, as far as this tool reads it. */
export interface Manifest {
  latest: { release: string; snapshot: string };
  versions: ManifestVersion[];
}

/** Parses and checks the manifest's text. */
export function parseManifest(text: string): Manifest {
  const value = JSON.parse(text) as Partial<Manifest>;
  if (!Array.isArray(value.versions) || typeof value.latest !== 'object' || !value.latest) {
    throw new Error('the version manifest has no "versions" list or "latest" object');
  }
  for (const v of value.versions) {
    if (typeof v?.id !== 'string' || typeof v.releaseTime !== 'string') {
      throw new Error('the version manifest has a version without an id or release time');
    }
  }
  return value as Manifest;
}

export async function readManifest(fetcher: FetchText): Promise<Manifest> {
  return parseManifest(await fetcher(MANIFEST_URL));
}

/** The Java major version a Minecraft version's own JSON asks for. */
export async function javaVersionOf(
  manifest: Manifest,
  version: string,
  fetcher: FetchText,
): Promise<number | undefined> {
  const entry = manifest.versions.find((v) => v.id === version);
  if (entry === undefined || typeof entry.url !== 'string') return undefined;
  const json = JSON.parse(await fetcher(entry.url)) as { javaVersion?: { majorVersion?: unknown } };
  const major = json.javaVersion?.majorVersion;
  return typeof major === 'number' ? major : undefined;
}

/** A target as `--check` sees it: its id and the version it is pinned to. */
export interface PinnedTarget {
  id: string;
  version: string;
}

/** Every `packages/targets/mc-*` folder with its pinned version, newest id last. */
export async function pinnedTargets(root: string): Promise<PinnedTarget[]> {
  const folder = join(root, 'packages', 'targets');
  const out: PinnedTarget[] = [];
  for (const name of (await readdir(folder)).sort()) {
    if (!name.startsWith('mc-')) continue;
    try {
      const text = await readFile(join(folder, name, 'vendor', 'mcmeta', 'version.json'), 'utf8');
      const id = (JSON.parse(text) as { id?: unknown }).id;
      if (typeof id === 'string') out.push({ id: name, version: id });
    } catch {
      // A folder without vendored data is not a target yet.
    }
  }
  return out;
}

/** What `--check` found for one target or one release line. */
export interface CheckFinding {
  /** `repin`: a newer version on a target's own line; `new`: a line no target covers. */
  kind: 'repin' | 'new';
  target: string;
  /** The version the target is pinned to (repin), or the newest target's (new). */
  current: string;
  newer: ManifestVersion;
  /** Whether `newer` is a release (else a snapshot, pre-release or release candidate). */
  release: boolean;
  /** The command that would act on it. */
  command: string;
}

/**
 * Compares the pinned targets with the manifest: for each target, the newest version on its own
 * line released after its pin; for each newer line no target covers, its newest version.
 */
export function checkTargets(manifest: Manifest, targets: readonly PinnedTarget[]): CheckFinding[] {
  const time = (id: string): string | undefined =>
    manifest.versions.find((v) => v.id === id)?.releaseTime;
  const findings: CheckFinding[] = [];
  const lines = new Set(targets.map((t) => releaseLine(t.version)));
  const newest = (versions: ManifestVersion[]) =>
    versions.reduce<ManifestVersion | undefined>(
      (best, v) => (best === undefined || v.releaseTime > best.releaseTime ? v : best),
      undefined,
    );
  for (const t of targets) {
    const pinned = time(t.version);
    if (pinned === undefined) continue;
    const newer = newest(
      manifest.versions.filter(
        (v) => releaseLine(v.id) === releaseLine(t.version) && v.releaseTime > pinned,
      ),
    );
    if (newer !== undefined) {
      findings.push({
        kind: 'repin',
        target: t.id,
        current: t.version,
        newer,
        release: newer.type === 'release',
        command: `node tools/new-target/index.ts --repin ${t.id} --version ${newer.id}`,
      });
    }
  }
  const latest = [...targets]
    .filter((t) => time(t.version) !== undefined)
    .sort((a, b) => ((time(a.version) as string) < (time(b.version) as string) ? -1 : 1))
    .at(-1);
  if (latest !== undefined) {
    const after = time(latest.version) as string;
    const byLine = new Map<string, ManifestVersion[]>();
    for (const v of manifest.versions) {
      const line = releaseLine(v.id);
      if (lines.has(line) || v.releaseTime <= after) continue;
      if (v.type !== 'release' && v.type !== 'snapshot') continue;
      if (!VERSION_PATTERN.test(v.id)) continue;
      byLine.set(line, [...(byLine.get(line) ?? []), v]);
    }
    for (const [, versions] of [...byLine].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const v = newest(versions) as ManifestVersion;
      findings.push({
        kind: 'new',
        target: `mc-${releaseLine(v.id)}`,
        current: latest.version,
        newer: v,
        release: v.type === 'release',
        command: `node tools/new-target/index.ts --from ${latest.id} --version ${v.id}`,
      });
    }
  }
  return findings;
}

/** The lines `--check` prints. */
export function checkLines(targets: readonly PinnedTarget[], findings: CheckFinding[]): string[] {
  const out: string[] = [];
  for (const t of targets) {
    const f = findings.find((x) => x.kind === 'repin' && x.target === t.id);
    out.push(
      f === undefined
        ? `${t.id} (${t.version}): nothing newer on its line.`
        : `${t.id} (${t.version}): ${f.newer.id} (${f.release ? 'release' : 'test version'}, ${f.newer.releaseTime.slice(0, 10)}) is newer. Re-pin: ${f.command}`,
    );
  }
  for (const f of findings.filter((x) => x.kind === 'new')) {
    out.push(
      `${f.target}: no target yet; newest ${f.newer.id} (${f.release ? 'release' : 'test version'}, ${f.newer.releaseTime.slice(0, 10)}). Make it: ${f.command}`,
    );
  }
  return out;
}

/** The vendoring steps a run takes; each writes into the folder it is given. */
export interface Syncers {
  /** `tools/sync-mcmeta` into `<target>/vendor/mcmeta`. */
  mcmeta(version: string, out: string, log: (line: string) => void): Promise<void>;
  /** `tools/sync-mcdoc` (build mode) into `<target>/vendor/vanilla-mcdoc`. */
  mcdoc(ref: string, out: string, log: (line: string) => void): Promise<void>;
  /** `tools/sync-feature-order` into `<target>/vendor/worldgen/feature-order.json`. */
  featureOrder(version: string, outFile: string, log: (line: string) => void): Promise<void>;
  /** The newest commit of vanilla-mcdoc's default branch, when no `--mcdoc-ref` is given. */
  latestMcdocRef(log: (line: string) => void): Promise<string>;
}

/** The real vendoring steps; `fetchFile` reaches `sync-mcmeta` and `sync-feature-order`. */
export function defaultSyncers(options: { fetchFile?: FetchFile } = {}): Syncers {
  const fetchFile = options.fetchFile === undefined ? {} : { fetchFile: options.fetchFile };
  return {
    async mcmeta(version, out, log) {
      await syncMcmeta({ version, out, log, ...fetchFile });
    },
    async mcdoc(ref, out, log) {
      await syncMcdoc({ ref, out, fromGenerated: false, log });
    },
    async featureOrder(version, outFile, log) {
      await syncFeatureOrder({ version, out: outFile, log, ...fetchFile });
    },
    async latestMcdocRef(log) {
      log(`reading the newest commit of ${VANILLA_MCDOC_URL}`);
      const { stdout } = await run('git', ['ls-remote', VANILLA_MCDOC_URL, 'HEAD'], {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      const sha = stdout.trim().split(/\s+/)[0] ?? '';
      if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`git ls-remote gave no commit: ${stdout}`);
      return sha;
    },
  };
}
