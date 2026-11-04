/**
 * The contract between `ElementForm` and a Studio (DESIGN §8): what a Studio entry declares
 * and what its component receives. Studios register in `studio-registry.ts` (the built-in
 * ones) or in a `studios/<area>/studios.tsx` file that exports `studios` (one file per area,
 * discovered with `import.meta.glob`).
 *
 * @packageDocumentation
 */

import type { Element, Json, Problem, Project } from '@msm/core';
import type { ElementKind, Target } from '@msm/plugin-api';
import type { SchemaNode } from '@msm/schemas';
import type { ComponentType, ReactNode, RefObject } from 'react';
import type { ChangeOptions, FormProblem, SchemaFormHandle } from '../forms';
import type { SchemaContext } from '../session/schema-context';
import type { ProjectCompletionSource } from './completions';
import type { CompleteFunction } from './FunctionEditor';

/** Everything a Studio component receives from `ElementForm`. */
export interface StudioProps {
  project: Project;
  element: Element;
  kind: ElementKind;
  /** The resolved schema node of the kind. */
  node: SchemaNode;
  /** The loaded schema context (target, schema index, registries). */
  context: SchemaContext;
  /** The target the project exports for. */
  target: Target;
  /** The element's live problems in the form's shape. */
  problems: readonly FormProblem[];
  /** The element's live problems as the session reports them. */
  sessionProblems: readonly Problem[];
  /** Registry and project id completions. */
  completions: ProjectCompletionSource;
  /** Registry id suggestions for a prefix. */
  suggest(registry: string, prefix: string): string[];
  /**
   * Applies one edit. A `coalesce` key listed in the entry's `coalesceKeys` merges the edits
   * of one synchronous gesture into one undo step.
   */
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  /**
   * The full schema form for the element, for an "Advanced" section (the Recipe Studio
   * pattern). It is bound to {@link formRef}.
   */
  form: ReactNode;
  /** The handle `ElementForm` focuses problems through; bind it when not rendering `form`. */
  formRef: RefObject<SchemaFormHandle | null>;
  /** The field the UI asked to focus, for entries with `handlesFocus`. */
  focusPointer: string | null;
  /** The caret column within the focused line, for entries with `handlesFocus`. */
  focusColumn?: number | undefined;
  /** Call once {@link focusPointer} has been handled (entries with `handlesFocus`). */
  onFocused(): void;
  /** Completions for the function editor. */
  complete?: CompleteFunction | undefined;
}

/** One Studio: which elements it edits and the component that edits them. */
export interface StudioEntry {
  /** A unique id, for example `msm.structure-template`. */
  id: string;
  /** The kind id this Studio edits; give this or {@link matches}. */
  kindId?: string;
  /** Whether this Studio edits `element` (checked after {@link kindId}, when both are set). */
  matches?(element: Element, kind: ElementKind): boolean;
  /** The Studio component. */
  component: ComponentType<StudioProps>;
  /**
   * `coalesce` keys whose edits within one synchronous gesture become one undo step (each
   * gesture gets its own key, so the next gesture is a separate step).
   */
  coalesceKeys?: readonly string[];
  /**
   * When `true`, the Studio focuses `focusPointer` itself; otherwise `ElementForm` focuses it
   * through `formRef`.
   */
  handlesFocus?: boolean;
}
