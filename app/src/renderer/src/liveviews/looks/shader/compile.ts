/**
 * Compiles one translated shader stage and reads the compiler's lines back to the user's own
 * lines (ADR 0121 D8; B629). The compiler is the app's own WebGL 2 (ANGLE); its log lines look
 * like `ERROR: 0:12: 'texture2D' : no matching overloaded function found`, where 12 is a line of
 * the translated text. The translation's line map turns that into the user's line 7.
 */

import type { LineOrigin } from './translate';

/** One line of the compiler's log, on the user's own line. */
export interface CompilerLine {
  /** The line in the shader's own file (0 when the compiler named no line). */
  line: number;
  /** The compiler's words, as it wrote them. */
  message: string;
  /** Set when the line is in an included file: its id and its own line there. */
  include?: { readonly id: string; readonly line: number };
  /** `warning` for a compiler warning; errors otherwise. */
  severity?: 'error' | 'warning';
}

/** The answer of a compile. */
export interface CompileResult {
  ok: boolean;
  lines: CompilerLine[];
}

/** The part of a WebGL 2 context a compile uses (a fake in tests). */
export interface ShaderCompilerGl {
  readonly VERTEX_SHADER: number;
  readonly FRAGMENT_SHADER: number;
  readonly COMPILE_STATUS: number;
  createShader(type: number): WebGLShader | null;
  shaderSource(shader: WebGLShader, source: string): void;
  compileShader(shader: WebGLShader): void;
  getShaderParameter(shader: WebGLShader, name: number): unknown;
  getShaderInfoLog(shader: WebGLShader): string | null;
  deleteShader(shader: WebGLShader | null): void;
}

const LOG_LINE = /^\s*(ERROR|WARNING):\s*(\d+):(\d+):\s*(.*)$/;

/**
 * The compiler's log as lines of the user's file. `lineMap` gives each translated line's source
 * line; `origins` (optional) the include a line came from. Lines without a place keep line 0;
 * the closing count ("2 compilation errors") is left out.
 */
export function parseCompilerLog(
  log: string,
  lineMap: readonly number[],
  origins?: readonly LineOrigin[],
): CompilerLine[] {
  const out: CompilerLine[] = [];
  const seen = new Set<string>();
  for (const raw of log.split('\n')) {
    const text = raw.trim();
    if (text.length === 0) continue;
    const match = LOG_LINE.exec(text);
    let entry: CompilerLine;
    if (match !== null) {
      const translated = Number(match[3]);
      const severity = match[1] === 'WARNING' ? 'warning' : 'error';
      const message = (match[4] ?? '').trim();
      const origin = origins?.[translated - 1];
      entry = { line: lineMap[translated - 1] ?? 0, message, severity };
      if (origin?.include !== null && origin?.include !== undefined) {
        entry.include = { id: origin.include, line: origin.line };
      }
    } else {
      if (/\d+\s+compilation errors?/i.test(text)) continue;
      entry = { line: 0, message: text.replace(/^ERROR:\s*/, ''), severity: 'error' };
    }
    const key = `${entry.line}|${entry.include?.id ?? ''}|${entry.include?.line ?? ''}|${entry.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** A compile that keeps the shader object for linking (the caller deletes it). */
export interface KeptCompile extends CompileResult {
  shader: WebGLShader | null;
}

/** Compiles a stage and keeps the shader when it compiled (see {@link compileShader}). */
export function compileStage(
  gl: ShaderCompilerGl,
  text: string,
  stage: 'vertex' | 'fragment',
  lineMap: readonly number[],
  origins?: readonly LineOrigin[],
): KeptCompile {
  const shader = gl.createShader(stage === 'vertex' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
  if (shader === null) {
    return {
      ok: false,
      lines: [{ line: 0, message: 'The graphics could not make a shader.', severity: 'error' }],
      shader: null,
    };
  }
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true;
  const lines = parseCompilerLog(gl.getShaderInfoLog(shader) ?? '', lineMap, origins);
  if (!ok) {
    gl.deleteShader(shader);
    const errors = lines.length > 0 ? lines : [{ line: 0, message: 'It did not compile.' }];
    return { ok: false, lines: errors, shader: null };
  }
  return { ok: true, lines, shader };
}

/** Compiles a shader stage and answers the compiler's lines on the user's lines. */
export function compileShader(
  gl: ShaderCompilerGl,
  text: string,
  stage: 'vertex' | 'fragment',
  lineMap: readonly number[],
  origins?: readonly LineOrigin[],
): CompileResult {
  const { ok, lines, shader } = compileStage(gl, text, stage, lineMap, origins);
  if (shader !== null) gl.deleteShader(shader);
  return { ok, lines };
}
