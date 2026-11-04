/**
 * Shared, render-stable state of one `SchemaForm`: the change callback, problems by
 * pointer, hidden pointers, completions and the depth limit.
 */
import type { Json } from '@msm/core';
import { createContext, useContext } from 'react';

/** Suggestions for id-like strings. Implemented by the host (registries, project ids). */
export interface CompletionSource {
  /**
   * Registry ids (e.g. `item`, `model`, `translation_key`) starting with `prefix`. `idPath`
   * is the field's `#[id(path=...)]`: only ids under it are offered, written without it.
   */
  suggest(registry: string, prefix: string, idPath?: string): string[];
  /** Ids defined in the project (textures, models, elements) starting with `prefix`. */
  projectIds(kind: 'texture' | 'model' | 'element', prefix: string, idPath?: string): string[];
}

/** One problem shown by the form, addressed by an RFC 6901 pointer into the value. */
export interface FormProblem {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/** Options passed with every edit; `coalesce` merges typing into one undo step. */
export interface ChangeOptions {
  coalesce?: string;
}

/** The edit callback: `undefined` deletes the value at `pointer`. */
export type FormChange = (
  pointer: string,
  value: Json | undefined,
  options?: ChangeOptions,
) => void;

export interface FormContextValue {
  onChange: FormChange;
  problems: ReadonlyMap<string, readonly FormProblem[]>;
  hidden: ReadonlySet<string>;
  completions: CompletionSource | undefined;
  maxDepth: number;
}

export const FormContext = createContext<FormContextValue | null>(null);

/** The enclosing form's context; throws outside a `SchemaForm`. */
export function useForm(): FormContextValue {
  const value = useContext(FormContext);
  if (value === null) throw new Error('Form controls must be rendered inside a SchemaForm.');
  return value;
}

/** The coalescing key for typing into the control at `pointer`. */
export function typingKey(pointer: string): string {
  return `typing:${pointer}`;
}

const NO_PROBLEMS: readonly FormProblem[] = [];

/** Problems addressed exactly at `pointer`. */
export function useProblems(pointer: string): readonly FormProblem[] {
  return useForm().problems.get(pointer) ?? NO_PROBLEMS;
}
