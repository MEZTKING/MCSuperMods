/**
 * The scripts among the lowered files (B400): `msm/<ns>/script/<path>.ts` (ADR 0032 D3), in the
 * runtime's load order (namespace, then path), with the rule book of a script Rules generated
 * (ADR 0082 D3). The app transpiles each source to ES5 (ADR 0031 D2) and hands the results to
 * the bridge as {@link CompiledScript}s.
 */
import type { SimFiles } from '../types.js';

/** One script's source. */
export interface ScriptSource {
  /** `<namespace>:<path>`: the `msm:script` element id, and what `require` resolves. */
  readonly id: string;
  /** The lowered path (`msm/<ns>/script/<path>.ts`). */
  readonly path: string;
  /** The TypeScript source. */
  readonly source: string;
  /** The rule book, for a script Rules generated. */
  readonly book?: string;
}

/** One script transpiled to ES5 CommonJS. */
export interface CompiledScript {
  readonly id: string;
  readonly path: string;
  /** The JavaScript the runtime runs. */
  readonly js: string;
  readonly book?: string;
}

/** A script that could not be transpiled: it does not run. */
export interface ScriptProblem {
  readonly id: string;
  readonly path: string;
  readonly message: string;
  readonly book?: string;
}

const SCRIPT_PATH = /^msm\/([a-z0-9_.-]+)\/script\/(.+)\.ts$/;
const BOOK_LINE = /^\/\/ Made by Rules from ([a-z0-9_.-]+:[a-z0-9_./-]+);/;

/** The scripts of the lowered files, in load order. */
export function scriptSources(files: SimFiles): ScriptSource[] {
  const out: ScriptSource[] = [];
  for (const [path, raw] of files) {
    const match = SCRIPT_PATH.exec(path);
    if (match === null) continue;
    const source = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const book = BOOK_LINE.exec(source)?.[1];
    out.push({
      id: `${match[1]}:${match[2]}`,
      path,
      source,
      ...(book === undefined ? {} : { book }),
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
