/**
 * The Form tab: a `SchemaForm` over the selected element, with the kind's hidden paths, the
 * element's live problems and project completions. Studios route by kind: language files
 * (`LangStudio`), pack metadata (`PackSettings`), recipes of the common types
 * (`RecipeStudio`, with the schema form behind its "Advanced" toggle), tags (`TagStudio`)
 * and functions (`FunctionEditor`). Edits go to `session.setElementValue`, so the Raw JSON
 * tab stays in sync.
 *
 * @packageDocumentation
 */

import type { Element, Json, Problem, Project } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import type { SchemaNode } from '@msm/schemas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ChangeOptions, type FormProblem, SchemaForm, type SchemaFormHandle } from '../forms';
import { literalChoices, resolveNode, structShape } from '../forms/schema-utils';
import { createCompletionSource } from './completions';
import {
  type CompleteFunction,
  FunctionEditor,
  type FunctionFocus,
  type FunctionProblem,
} from './FunctionEditor';
import { LangStudio } from './LangStudio';
import { PackSettings } from './PackSettings';
import { RECIPE_GRID_COALESCE, RecipeStudio, recipeLayout } from './RecipeStudio';
import { TagStudio } from './TagStudio';
import type { SchemaContextState } from './use-schema-context';

/** The kinds with their own Studio. */
export const RECIPE_KIND = 'minecraft:recipe';
export const FUNCTION_KIND = 'minecraft:function';
const TAG_KIND_PREFIX = 'minecraft:tag/';

/** Props of {@link ElementForm}. */
export interface ElementFormProps {
  project: Project;
  element: Element;
  kind: ElementKind | undefined;
  /** The element's live problems. */
  problems: readonly Problem[];
  schema: SchemaContextState;
  /** Applies one edit to the element. */
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  /** The field the UI asked to focus (from the Problems panel), or `null`. */
  focusPointer: string | null;
  /** Called once the form has handled {@link focusPointer}. */
  onFocused(): void;
  /** Completions for the function editor (the source and the caret offset). */
  complete?: CompleteFunction | undefined;
}

function recipeType(data: Json): Json | undefined {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? data.type : undefined;
}

/** `data.lines` when it is a list of strings, else `undefined` (the schema form shows it). */
function functionLinesOf(data: Json): string[] | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const lines = data.lines;
  if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) return undefined;
  return lines as string[];
}

/** Maps session problems to the form's problem shape. */
export function formProblems(problems: readonly Problem[]): FormProblem[] {
  return problems.map((problem) => ({
    path: problem.path ?? '',
    message: problem.message,
    severity: problem.severity === 'error' ? 'error' : 'warning',
  }));
}

const EMPTY_HIDDEN: readonly string[] = [];

/** Maps session problems to the function editor's shape (`/lines/<n>` plus `range`). */
export function functionProblems(problems: readonly Problem[]): FunctionProblem[] {
  return problems.map((problem) => ({
    path: problem.path ?? '',
    message: problem.message,
    severity: problem.severity,
    range: problem.range,
  }));
}

const LINE_POINTER = /^\/lines\/(\d+)(?:\/|$)/;

/** The function line a pointer addresses (`/lines/<n>`), or `null`. */
export function focusedLine(pointer: string | null): FunctionFocus | null {
  if (pointer === null) return null;
  const match = LINE_POINTER.exec(pointer);
  return match === null ? null : { line: Number(match[1]) };
}

/**
 * The `category` values the schema allows for a recipe's current `type`: the enum or literal
 * union of the `category` field of the member the type selects. Empty when there is none.
 */
export function recipeCategories(node: SchemaNode, data: Json): string[] {
  const root = resolveNode(node);
  if (root.kind !== 'struct' && root.kind !== 'dispatcher') return [];
  const field = structShape(root, data).fields.find((entry) => entry.key === 'category');
  if (field === undefined) return [];
  const type = resolveNode(field.type);
  if (type.kind === 'enum') return type.values.map((entry) => String(entry.value));
  if (type.kind === 'union') {
    return (literalChoices(type) ?? []).filter(
      (value): value is string => typeof value === 'string',
    );
  }
  return [];
}

/**
 * Gives each recipe-grid gesture its own coalescing key. The grid reports `pattern` and
 * `key` with the same key synchronously, so they merge into one undo step; the nonce keeps
 * the next cell edit (even within the stack's coalescing window) a separate step.
 */
function useGestureCoalesce(): (options: ChangeOptions | undefined) => ChangeOptions | undefined {
  const gesture = useRef<string | null>(null);
  const counter = useRef(0);
  return useCallback((options) => {
    if (options?.coalesce !== RECIPE_GRID_COALESCE) return options;
    if (gesture.current === null) {
      counter.current += 1;
      gesture.current = `${RECIPE_GRID_COALESCE}:${counter.current}`;
      queueMicrotask(() => {
        gesture.current = null;
      });
    }
    return { ...options, coalesce: gesture.current };
  }, []);
}

/** The Form tab content for one element. */
export function ElementForm(props: ElementFormProps) {
  const { project, element, kind, schema, focusPointer, onFocused } = props;
  const formRef = useRef<SchemaFormHandle>(null);

  const node = useMemo<SchemaNode | Error | null>(() => {
    if (schema.status !== 'ready' || kind === undefined) return null;
    try {
      return schema.context.schemaIndex.resolveSchemaRef(kind.schema);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, [schema, kind]);

  const registries = schema.status === 'ready' ? schema.context.registries(project) : null;
  const completions = useMemo(
    () => createCompletionSource(project, registries),
    [project, registries],
  );
  const problems = useMemo(() => formProblems(props.problems), [props.problems]);
  const onChange = props.onChange;
  const withGesture = useGestureCoalesce();
  const change = useCallback(
    (pointer: string, value: Json | undefined, options?: ChangeOptions) => {
      const effective = withGesture(options);
      if (effective === undefined) onChange(pointer, value);
      else onChange(pointer, value, effective);
    },
    [onChange, withGesture],
  );
  const suggest = useCallback(
    (registry: string, prefix: string) => completions.suggest(registry, prefix),
    [completions],
  );

  const isFunction = element.kind === FUNCTION_KIND;
  const lineFocus = isFunction ? focusedLine(focusPointer) : null;
  const ready = node !== null && !(node instanceof Error);
  useEffect(() => {
    if (!ready || focusPointer === null || isFunction) return;
    const form = formRef.current;
    if (form === null) return;
    void form.focusPointer(focusPointer).finally(onFocused);
  }, [ready, focusPointer, onFocused, isFunction]);
  // A function problem that is not line-addressed has nothing to focus.
  useEffect(() => {
    if (isFunction && focusPointer !== null && lineFocus === null) onFocused();
  }, [isFunction, focusPointer, lineFocus, onFocused]);
  const [functionFocus, setFunctionFocus] = useState<FunctionFocus | null>(null);
  const focusKey = lineFocus === null ? null : lineFocus.line;
  useEffect(() => {
    if (focusKey !== null) setFunctionFocus({ line: focusKey });
  }, [focusKey]);
  const functionFocused = useCallback(() => {
    setFunctionFocus(null);
    onFocused();
  }, [onFocused]);

  if (kind === undefined) {
    return (
      <p className="text-muted">
        No plugin provides the kind <code className="font-mono">{element.kind}</code>; edit it as
        raw JSON.
      </p>
    );
  }
  if (schema.status === 'failed') {
    return (
      <p role="alert" className="text-error">
        The schemas could not be loaded, so the form is unavailable: {schema.message}
      </p>
    );
  }
  if (node === null) return <p className="text-muted">Loading the schema…</p>;
  if (node instanceof Error) {
    return (
      <p role="alert" className="text-error">
        The schema {kind.schema} is not available for this target: {node.message}
      </p>
    );
  }

  const form = (
    <SchemaForm
      ref={formRef}
      node={node}
      value={element.data}
      onChange={change}
      problems={problems}
      hiddenPaths={kind.hiddenPaths ?? EMPTY_HIDDEN}
      completions={completions}
      rootLabel={element.id}
    />
  );

  if (element.kind === 'minecraft:lang') {
    return (
      <LangStudio
        ref={formRef}
        element={element}
        node={node}
        problems={problems}
        completions={completions}
        onChange={change}
      />
    );
  }
  if (element.kind === 'minecraft:pack_mcmeta' && schema.status === 'ready') {
    return <PackSettings target={schema.context.target}>{form}</PackSettings>;
  }
  if (isFunction) {
    const lines = functionLinesOf(element.data);
    if (lines !== undefined) {
      return (
        <FunctionEditor
          // Keyed by element so a pending edit is flushed to the right element on switch.
          key={element.id}
          lines={lines}
          onChange={change}
          problems={functionProblems(props.problems)}
          {...(props.complete === undefined ? {} : { complete: props.complete })}
          focusLine={functionFocus}
          onFocused={functionFocused}
        />
      );
    }
  }
  if (element.kind === RECIPE_KIND && recipeLayout(recipeType(element.data)) !== undefined) {
    return (
      <RecipeStudio
        key={element.id}
        data={element.data}
        onChange={change}
        completions={completions}
        problems={problems}
        categories={recipeCategories(node, element.data)}
      >
        <div data-testid="schema-form">{form}</div>
      </RecipeStudio>
    );
  }
  if (element.kind.startsWith(TAG_KIND_PREFIX)) {
    return (
      <TagStudio
        key={element.id}
        data={element.data}
        registry={element.kind.slice(TAG_KIND_PREFIX.length)}
        onChange={change}
        suggest={suggest}
        problems={problems}
      />
    );
  }
  return <div data-testid="schema-form">{form}</div>;
}
