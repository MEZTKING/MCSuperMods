/**
 * Compiles one translated shader stage and reads the compiler's lines back to the user's own
 * lines (ADR 0121 D8; B620 interface, B629 builds it).
 */

/** One line of the compiler's log, on the user's own line. */
export interface CompilerLine {
  line: number;
  message: string;
}

/** The answer of a compile. */
export interface CompileResult {
  ok: boolean;
  lines: CompilerLine[];
}

/** Compiles a shader stage. Until B629 it says it did not run (`ok: false`, no lines). */
export function compileShader(
  _gl: unknown,
  _text: string,
  _stage: 'vertex' | 'fragment',
  _lineMap: readonly number[],
): CompileResult {
  return { ok: false, lines: [] };
}
