/**
 * Drafts of the facts that come from upstream services (B810 V20, kind "U"): Fabric Loader from
 * Fabric's meta service, Fabric API and Loom from Fabric's Maven, Java from Mojang's version
 * JSON, and the `fabric.mod.json` range by the rule the targets use. Every value is a draft
 * marked "(verify at implementation)" until a person records it in `CHANGES.md`; a value that
 * could not be read is said so, and the run goes on.
 *
 * @packageDocumentation
 */

import { releaseLine } from './derive.ts';
import { type FetchText, javaVersionOf, type Manifest } from './upstream.ts';

export const FABRIC_META = 'https://meta.fabricmc.net/v2';
export const FABRIC_MAVEN = 'https://maven.fabricmc.net/net/fabricmc';
export const FABRIC_API_METADATA = `${FABRIC_MAVEN}/fabric-api/fabric-api/maven-metadata.xml`;
export const LOOM_METADATA = `${FABRIC_MAVEN}/fabric-loom/maven-metadata.xml`;

/** One drafted value: what it is, where it came from, or why it could not be read. */
export interface DraftValue {
  value?: string;
  source: string;
  problem?: string;
}

/** The drafts for one Minecraft version. */
export interface UpstreamDraft {
  version: string;
  loader: DraftValue;
  api: DraftValue;
  loom: DraftValue;
  java: DraftValue;
  minecraftDependency: DraftValue;
}

/** Compares dotted numbers (`0.165.10` after `0.165.4`); a part that is not a number sorts first. */
export function compareDotted(a: string, b: string): number {
  const x = a.split('.');
  const y = b.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = Number(x[i] ?? 0);
    const q = Number(y[i] ?? 0);
    const pn = Number.isFinite(p) ? p : -1;
    const qn = Number.isFinite(q) ? q : -1;
    if (pn !== qn) return pn - qn;
  }
  return 0;
}

/** The `<version>` entries of a Maven `maven-metadata.xml`. */
export function mavenVersions(xml: string): string[] {
  return [...xml.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)].map((m) => m[1] as string);
}

/** The newest Fabric API build for a release line (`0.165.4+26.4` for `26.4`). */
export function newestFabricApi(versions: readonly string[], line: string): string | undefined {
  const suffix = `+${line}`;
  return versions
    .filter((v) => v.endsWith(suffix) && /^[0-9.]+$/.test(v.slice(0, -suffix.length)))
    .sort((a, b) => compareDotted(a.slice(0, -suffix.length), b.slice(0, -suffix.length)))
    .at(-1);
}

/** The newest Loom release (no `-alpha`, `-beta` or `-SNAPSHOT`). */
export function newestLoom(versions: readonly string[]): string | undefined {
  return versions
    .filter((v) => /^[0-9]+\.[0-9]+\.[0-9]+$/.test(v))
    .sort(compareDotted)
    .at(-1);
}

/** The newest Fabric Loader Fabric's meta lists for a game version, stable ones first. */
export function newestLoader(json: unknown): string | undefined {
  if (!Array.isArray(json)) return undefined;
  const loaders = json
    .map((entry) => (entry as { loader?: { version?: unknown; stable?: unknown } }).loader)
    .filter((l): l is { version: string; stable?: unknown } => typeof l?.version === 'string');
  return (loaders.find((l) => l.stable === true) ?? loaders[0])?.version;
}

/**
 * The `fabric.mod.json` `minecraft` range by the targets' rule: `~<line>` for a release; for a
 * test version, which Fabric Loader reads as an alpha of the line, `>=<line>- <next>-` (ADR 0037
 * Status), which also admits the release.
 */
export function minecraftDependency(version: string): string {
  const line = releaseLine(version);
  if (line === version) return `~${line}`;
  const parts = line.split('.');
  const last = Number(parts.at(-1));
  const next = [...parts.slice(0, -1), String(Number.isFinite(last) ? last + 1 : 0)].join('.');
  return `>=${line}- <${next}-`;
}

async function attempt(
  source: string,
  read: () => Promise<string | undefined>,
): Promise<DraftValue> {
  try {
    const value = await read();
    return value === undefined ? { source, problem: 'not listed' } : { value, source };
  } catch (error) {
    return { source, problem: (error as Error).message };
  }
}

/** Reads every upstream draft for `version`; a failure is recorded on its value, never thrown. */
export async function draftUpstream(
  version: string,
  fetcher: FetchText,
  manifest: Manifest | undefined,
): Promise<UpstreamDraft> {
  const loaderUrl = `${FABRIC_META}/versions/loader/${encodeURIComponent(version)}`;
  return {
    version,
    loader: await attempt(loaderUrl, async () =>
      newestLoader(JSON.parse(await fetcher(loaderUrl))),
    ),
    api: await attempt(FABRIC_API_METADATA, async () =>
      newestFabricApi(mavenVersions(await fetcher(FABRIC_API_METADATA)), releaseLine(version)),
    ),
    loom: await attempt(LOOM_METADATA, async () =>
      newestLoom(mavenVersions(await fetcher(LOOM_METADATA))),
    ),
    java: await attempt("Mojang's version JSON (`javaVersion.majorVersion`)", async () => {
      if (manifest === undefined) throw new Error("Mojang's version manifest could not be read");
      const major = await javaVersionOf(manifest, version, fetcher);
      return major === undefined ? undefined : String(major);
    }),
    minecraftDependency: {
      value: minecraftDependency(version),
      source: "the targets' rule (`~<line>` for a release, `>=<line>- <next>-` for a test version)",
    },
  };
}

/** The draft of `engine-mod/versions/<line>.properties`. */
export function propertiesDraft(draft: UpstreamDraft, date: string): string {
  const value = (d: DraftValue) => d.value ?? '';
  const line = releaseLine(draft.version);
  return [
    `# Draft for \`./gradlew build -Pmc=${line}\`, written by tools/new-target on ${date}.`,
    '# Every value is a draft (verify at implementation): check each one, record it with its date',
    `# and source in CHANGES.md, then copy this file to engine-mod/versions/${line}.properties.`,
    ...[draft.loader, draft.api, draft.loom]
      .filter((d) => d.problem !== undefined)
      .map((d) => `# Not read: ${d.source}: ${d.problem}`),
    `minecraft_version=${draft.version}`,
    `loader_version=${value(draft.loader)}`,
    `fabric_api_version=${value(draft.api)}`,
    `loom_version=${value(draft.loom)}`,
    '# GeckoLib is not looked up here: Modrinth lists a build some days after a release and none',
    '# for test versions; leave both blank until one exists (verify at implementation).',
    'geckolib_version=',
    'geckolib_modrinth_version_id=',
    '# fabric.mod.json "minecraft" range (verify at implementation)',
    `minecraft_dependency=${value(draft.minecraftDependency)}`,
    '',
  ].join('\n');
}
