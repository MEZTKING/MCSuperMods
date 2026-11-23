/**
 * Where a shader's files come from (ADR 0121 D8; B629): the project's own files first
 * (`assets/<ns>/shaders/<path>.vsh|.fsh`, includes under `shaders/include/`), then the jar's
 * cached copy (B621: `assets/minecraft/shaders/` from the user's own client jar, never bundled).
 * A file is named by the target's jar alone, so a name only another version uses is reported
 * missing (B619 3S9: the full-screen vertex shader of a post pass has a different name on each
 * supported version), with the name this version's jar has.
 */

import type { VanillaAssetReader } from '../../../preview/model-chain';
import type { StageSource } from './program';
import { gatherIncludes, type ShaderDefines, translateShader } from './translate';

/** Where a file was read from. */
export type ShaderOrigin = 'project' | 'vanilla';

/** One shader file read, or why not. */
export type ShaderFile =
  | { readonly ok: true; readonly text: string; readonly from: ShaderOrigin; readonly path: string }
  | { readonly ok: false; readonly reason: 'missing' | 'not_set_up'; readonly path: string };

/** The readers a view has. */
export interface ShaderReaders {
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  readonly vanillaAssets: VanillaAssetReader | null;
}

/** The namespace and path of an id (`minecraft` when none is written). */
export function splitId(id: string): [string, string] {
  const at = id.indexOf(':');
  return at < 0 ? ['minecraft', id] : [id.slice(0, at), id.slice(at + 1)];
}

/** The path of a shader stage's file (`assets/msm/shaders/post/sepia.fsh`). */
export function shaderPath(id: string, stage: 'vertex' | 'fragment'): string {
  const [namespace, path] = splitId(id);
  return `assets/${namespace}/shaders/${path}.${stage === 'vertex' ? 'vsh' : 'fsh'}`;
}

/** The path of an include (`assets/minecraft/shaders/include/globals.glsl`). */
export function includePath(id: string): string {
  const [namespace, path] = splitId(id);
  return `assets/${namespace}/shaders/include/${path}`;
}

const decoder = new TextDecoder();

/** Reads a file: the project's first, then (for `minecraft`) the jar's. */
export async function readShaderFile(path: string, readers: ShaderReaders): Promise<ShaderFile> {
  const own = await readers.readProject?.(path).catch(() => null);
  if (own !== null && own !== undefined) {
    return { ok: true, text: decoder.decode(own), from: 'project', path };
  }
  if (!path.startsWith('assets/minecraft/')) return { ok: false, reason: 'missing', path };
  if (readers.vanillaAssets === null) return { ok: false, reason: 'not_set_up', path };
  const jar = await readers.vanillaAssets.readAsset(path).catch(() => null);
  if (jar === null) return { ok: false, reason: 'missing', path };
  return { ok: true, text: decoder.decode(jar), from: 'vanilla', path };
}

/** A stage read and translated, or why it could not be. */
export type PreparedStage =
  | {
      readonly ok: true;
      readonly file: Extract<ShaderFile, { ok: true }>;
      readonly source: StageSource;
      readonly notes: readonly string[];
      readonly missingIncludes: readonly string[];
      /** Include files read and where from. */
      readonly includes: ReadonlyMap<string, ShaderOrigin>;
      /** Whether an include needed the Minecraft folder and it was not set up. */
      readonly includesNeedSetUp: boolean;
    }
  | { readonly ok: false; readonly id: string; readonly file: Extract<ShaderFile, { ok: false }> };

/** Reads, gathers the includes of and translates one stage. */
export async function prepareStage(
  id: string,
  stage: 'vertex' | 'fragment',
  readers: ShaderReaders,
  defines?: ShaderDefines,
): Promise<PreparedStage> {
  const file = await readShaderFile(shaderPath(id, stage), readers);
  if (!file.ok) return { ok: false, id, file };
  const origins = new Map<string, ShaderOrigin>();
  let needSetUp = false;
  const found = await gatherIncludes([file.text], async (include) => {
    const read = await readShaderFile(includePath(include), readers);
    if (!read.ok) {
      if (read.reason === 'not_set_up') needSetUp = true;
      return null;
    }
    origins.set(include, read.from);
    return read.text;
  });
  const translated = translateShader(
    file.text,
    stage,
    (include) => found.get(include) ?? null,
    defines === undefined ? {} : { defines },
  );
  return {
    ok: true,
    file,
    source: {
      id,
      stage,
      text: translated.text,
      lineMap: translated.lineMap,
      origins: translated.origins,
    },
    notes: translated.notes,
    missingIncludes: translated.missingIncludes,
    includes: origins,
    includesNeedSetUp: needSetUp,
  };
}

/** The full-screen vertex shaders of the supported targets, to name the right one (3S9). */
export const FULL_SCREEN_VERTEX_SHADERS: readonly string[] = [
  'minecraft:core/screenquad',
  'minecraft:core/screentriangle',
];

/**
 * When `id` is a full-screen vertex shader this version's jar lacks, the one it has, so the view
 * can say which name this version uses. Never substituted: the game would not find it either.
 */
export async function otherFullScreenShader(
  id: string,
  readers: ShaderReaders,
): Promise<string | null> {
  if (!FULL_SCREEN_VERTEX_SHADERS.includes(id) || readers.vanillaAssets === null) return null;
  for (const other of FULL_SCREEN_VERTEX_SHADERS) {
    if (other === id) continue;
    const file = await readShaderFile(shaderPath(other, 'vertex'), {
      vanillaAssets: readers.vanillaAssets,
    });
    if (file.ok) return other;
  }
  return null;
}
