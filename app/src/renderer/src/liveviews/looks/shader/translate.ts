/**
 * The mechanical translation of a game shader for WebGL 2 (ADR 0121 D8; B629). The seven rules
 * the B619 spike measured (3S8), and nothing else:
 *
 * 1. the version line becomes `#version 300 es` with precision lines (a header, the version line
 *    itself is kept as a comment so line numbers stay put);
 * 2. the `GL_ARB_separate_shader_objects` extension line is dropped;
 * 3. `#include <ns:path>` (and the older `#moj_import`) is inlined once each, from the project,
 *    then the jar (the caller's `include` lookup);
 * 4. `binding =` is stripped from `layout(...)`;
 * 5. `layout(location = N)` is stripped from vertex outputs and fragment inputs;
 * 6. `gl_VertexIndex` and `gl_InstanceIndex` become `gl_VertexID` and `gl_InstanceID`;
 * 7. every other line is kept as written, with a line map back to the user's lines.
 *
 * The game's `defines` (a shader program's `#define` lines) are added after the header, as the
 * game adds them at the top. No other line is ever rewritten: a construct WebGL 2 refuses is
 * reported by the compiler against the user's line (`compile.ts`), never guessed at.
 */

/** The header every translated stage starts with (ES 3.00 and default precisions). */
export const SHADER_HEADER: readonly string[] = Object.freeze([
  '#version 300 es',
  'precision highp float;',
  'precision highp int;',
  'precision highp sampler2D;',
  'precision highp sampler3D;',
  'precision highp samplerCube;',
  'precision highp sampler2DArray;',
  'precision highp isampler2D;',
  'precision highp usampler2D;',
]);

/** Where a line of the translated text came from. */
export interface LineOrigin {
  /** The include id the line came from, or `null` for the shader's own file (or an added line). */
  readonly include: string | null;
  /** The line in that file (1-based), or 0 for a line the translation added. */
  readonly line: number;
}

/** What a translation gives. */
export interface TranslatedShader {
  /** The text WebGL 2 compiles. */
  text: string;
  /**
   * For each line of `text`, the line of the source it came from (0 for an added line). A line
   * of an included file maps to the line of the `#include` that brought it in.
   */
  lineMap: number[];
  /** For each line of `text`, its own file and line ({@link LineOrigin}). */
  origins: LineOrigin[];
  /** One plain line per rule that changed something. */
  notes: string[];
  /** The `#include` ids the lookup could not give. */
  missingIncludes: string[];
  /** Every include id inlined, in the order met. */
  includes: string[];
}

/** The game's `defines` of a shader program (ADR 0106: `values` and `flags`). */
export interface ShaderDefines {
  readonly values?: Readonly<Record<string, string>>;
  readonly flags?: readonly string[];
}

/** Optional parts of a translation. */
export interface TranslateOptions {
  readonly defines?: ShaderDefines;
}

type RuleId = 'version' | 'extension' | 'include' | 'binding' | 'location' | 'builtins' | 'defines';

const NOTE_WORDS: Readonly<Record<RuleId, string>> = {
  version: 'The version line is read as WebGL 2’s (#version 300 es), with precision lines.',
  extension: 'The separate shader objects extension line is left out (WebGL 2 has no such line).',
  include: 'Included files are put in place, once each.',
  binding: 'binding = numbers are left out of layout(…) (WebGL 2 binds by name).',
  location:
    'layout(location = …) is left out on the values passed from the vertex to the fragment shader.',
  builtins: 'gl_VertexIndex and gl_InstanceIndex are read as gl_VertexID and gl_InstanceID.',
  defines: 'The program’s defines are added at the top, as the game adds them.',
};

const RULE_ORDER: readonly RuleId[] = [
  'version',
  'extension',
  'include',
  'binding',
  'location',
  'builtins',
  'defines',
];

const VERSION_LINE = /^\s*#\s*version\b/;
const EXTENSION_LINE = /^\s*#\s*extension\s+GL_ARB_separate_shader_objects\b/;
const INCLUDE_LINE = /^\s*#\s*(?:moj_import|include)\s*[<"]([^>"]+)[>"]/;
const BINDING = /layout\s*\([^)]*\bbinding\s*=/;
const VERTEX_OUT =
  /layout\s*\(\s*location\s*=\s*\d+\s*\)\s*((?:flat\s+|smooth\s+|noperspective\s+|centroid\s+)*out\b)/;
const FRAGMENT_IN =
  /layout\s*\(\s*location\s*=\s*\d+\s*\)\s*((?:flat\s+|smooth\s+|noperspective\s+|centroid\s+)*in\b)/;
const BUILTINS = /\bgl_(?:VertexIndex|InstanceIndex)\b/;

/**
 * The id of an include as the game reads it: `ns:path`, `minecraft` when no namespace is
 * written (as `#moj_import <fog.glsl>` meant). The path keeps its extension.
 */
export function includeId(written: string): string {
  const trimmed = written.trim();
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

/** The include ids a shader's own lines name, in order (not followed further). */
export function includeIdsOf(src: string): string[] {
  const out: string[] = [];
  for (const line of src.split('\n')) {
    const match = INCLUDE_LINE.exec(line);
    if (match?.[1] !== undefined) out.push(includeId(match[1]));
  }
  return out;
}

/** The `#define` lines of a program's defines, values first, then flags, each sorted. */
export function defineLines(defines: ShaderDefines | undefined): string[] {
  if (defines === undefined) return [];
  const out: string[] = [];
  for (const key of Object.keys(defines.values ?? {}).sort()) {
    out.push(`#define ${key} ${defines.values?.[key] ?? ''}`.trimEnd());
  }
  for (const flag of [...(defines.flags ?? [])].sort()) out.push(`#define ${flag}`);
  return out;
}

/** Strips `binding = N` from a `layout(...)`, and the `layout()` it may leave empty. */
function stripBinding(line: string): string {
  return line.replace(/layout\s*\(([^)]*)\)/g, (whole, inner: string) => {
    if (!/\bbinding\s*=/.test(inner)) return whole;
    const kept = inner
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^binding\s*=/.test(part));
    return kept.length === 0 ? '' : `layout(${kept.join(', ')})`;
  });
}

/**
 * Translates a shader (see the module comment). `include` gives an include's text by id, or
 * `null` when neither the project nor the jar has it (the line is then left as a comment and the
 * id listed in `missingIncludes`, so the compiler names what the include would have declared).
 */
export function translateShader(
  src: string,
  stage: 'vertex' | 'fragment',
  include: (id: string) => string | null,
  options: TranslateOptions = {},
): TranslatedShader {
  const used = new Set<RuleId>();
  const seen = new Set<string>();
  const missing: string[] = [];
  const includes: string[] = [];
  const lines: string[] = [];
  const lineMap: number[] = [];
  const origins: LineOrigin[] = [];

  const add = (text: string, sourceLine: number, origin: LineOrigin) => {
    lines.push(text);
    lineMap.push(sourceLine);
    origins.push(origin);
  };

  for (const header of SHADER_HEADER) add(header, 0, { include: null, line: 0 });
  const defines = defineLines(options.defines);
  if (defines.length > 0) used.add('defines');
  for (const define of defines) add(define, 0, { include: null, line: 0 });

  const varying = stage === 'vertex' ? VERTEX_OUT : FRAGMENT_IN;

  /** Adds `text`'s lines; `sourceLine` pins lines of an include to its directive's line. */
  const walk = (text: string, file: string | null, pinned: number | null) => {
    const own = text.split('\n');
    for (let index = 0; index < own.length; index += 1) {
      const raw = (own[index] ?? '').replace(/\r$/, '');
      const lineNo = index + 1;
      const sourceLine = pinned ?? lineNo;
      const origin: LineOrigin = { include: file, line: lineNo };
      if (VERSION_LINE.test(raw)) {
        used.add('version');
        add(`// ${raw.trim()}`, sourceLine, origin);
        continue;
      }
      if (EXTENSION_LINE.test(raw)) {
        used.add('extension');
        add(`// ${raw.trim()}`, sourceLine, origin);
        continue;
      }
      const directive = INCLUDE_LINE.exec(raw);
      if (directive?.[1] !== undefined) {
        used.add('include');
        const id = includeId(directive[1]);
        if (seen.has(id)) {
          add(`// ${raw.trim()} (already included)`, sourceLine, origin);
          continue;
        }
        seen.add(id);
        const body = include(id);
        if (body === null) {
          if (!missing.includes(id)) missing.push(id);
          add(`// ${raw.trim()} (not found)`, sourceLine, origin);
          continue;
        }
        includes.push(id);
        add(`// ${raw.trim()}`, sourceLine, origin);
        walk(body, id, sourceLine);
        continue;
      }
      let line = raw;
      if (BINDING.test(line)) {
        used.add('binding');
        line = stripBinding(line);
      }
      if (varying.test(line)) {
        used.add('location');
        line = line.replace(varying, '$1');
      }
      if (BUILTINS.test(line)) {
        used.add('builtins');
        line = line
          .replace(/\bgl_VertexIndex\b/g, 'gl_VertexID')
          .replace(/\bgl_InstanceIndex\b/g, 'gl_InstanceID');
      }
      add(line, sourceLine, origin);
    }
  };
  walk(src, null, null);

  return {
    text: lines.join('\n'),
    lineMap,
    origins,
    notes: RULE_ORDER.filter((rule) => used.has(rule)).map((rule) => NOTE_WORDS[rule]),
    missingIncludes: missing,
    includes,
  };
}

/**
 * Reads every include a shader needs, following includes of includes, before the (synchronous)
 * translation. `read` answers an include's text, or `null`. Each id is read once.
 */
export async function gatherIncludes(
  sources: readonly string[],
  read: (id: string) => Promise<string | null>,
): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>();
  let queue = sources.flatMap(includeIdsOf);
  while (queue.length > 0) {
    const next: string[] = [];
    const fresh = [...new Set(queue)].filter((id) => !found.has(id));
    const texts = await Promise.all(fresh.map((id) => read(id).catch(() => null)));
    fresh.forEach((id, index) => {
      const text = texts[index] ?? null;
      found.set(id, text);
      if (text !== null) next.push(...includeIdsOf(text));
    });
    queue = next;
  }
  return found;
}
