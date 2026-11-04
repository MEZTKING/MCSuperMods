/**
 * The Form tab: a `SchemaForm` over the selected element, with the kind's hidden paths, the
 * element's live problems and project completions. Studios are chosen through the Studio
 * registry (`studio-registry.ts`): the built-in ones here route language files
 * (`LangStudio`), pack metadata (`PackSettings`), functions (`FunctionEditor`), recipes of the
 * common types (`RecipeStudio`, with the schema form behind its "Advanced" toggle) and tags
 * (`TagStudio`); area Studios come from `studios/<area>/studios.tsx`. Edits go to
 * `session.setElementValue`, so the Raw JSON tab stays in sync.
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
import { DISCOVERED_STUDIOS, mergeStudios, studioFor } from './studio-registry';
import { TagStudio } from './TagStudio';
import type { StudioEntry, StudioProps } from './types';
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
  /** UTF-16 offset within the function line at {@link focusPointer} to put the caret at. */
  focusColumn?: number | undefined;
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

const NO_KEYS: readonly string[] = [];

/**
 * Gives each gesture of a Studio's `coalesceKeys` its own coalescing key (the recipe grid,
 * for example, reports `pattern` and `key` with the same key synchronously, so they merge
 * into one undo step); the nonce keeps the next gesture (even within the stack's coalescing
 * window) a separate step.
 */
function useGestureCoalesce(
  keys: readonly string[],
): (options: ChangeOptions | undefined) => ChangeOptions | undefined {
  const gesture = useRef<string | null>(null);
  const counter = useRef(0);
  return useCallback(
    (options) => {
      const key = options?.coalesce;
      if (key === undefined || !keys.includes(key)) return options;
      if (gesture.current === null) {
        counter.current += 1;
        gesture.current = `${key}:${counter.current}`;
        queueMicrotask(() => {
          gesture.current = null;
        });
      }
      return { ...options, coalesce: gesture.current };
    },
    [keys],
  );
}

/** The function editor with problem focus by line (`/lines/<n>`) and column. */
function FunctionStudio(props: StudioProps) {
  const { focusPointer, onFocused } = props;
  const lines = functionLinesOf(props.element.data) ?? [];
  const lineFocus = focusedLine(focusPointer);
  // A function problem that is not line-addressed has nothing to focus.
  useEffect(() => {
    if (focusPointer !== null && lineFocus === null) onFocused();
  }, [focusPointer, lineFocus, onFocused]);
  const [functionFocus, setFunctionFocus] = useState<FunctionFocus | null>(null);
  const focusColumn = props.focusColumn;
  const focusKey = lineFocus === null ? null : `${lineFocus.line}:${focusColumn ?? 0}`;
  useEffect(() => {
    if (focusKey === null) return;
    const [line = 0, column = 0] = focusKey.split(':').map(Number);
    setFunctionFocus(column === 0 ? { line } : { line, column });
  }, [focusKey]);
  const functionFocused = useCallback(() => {
    setFunctionFocus(null);
    onFocused();
  }, [onFocused]);
  return (
    <FunctionEditor
      // Keyed by element so a pending edit is flushed to the right element on switch.
      key={props.element.id}
      lines={lines}
      onChange={props.onChange}
      problems={functionProblems(props.sessionProblems)}
      {...(props.complete === undefined ? {} : { complete: props.complete })}
      focusLine={functionFocus}
      onFocused={functionFocused}
    />
  );
}

/** The built-in Studios, in priority order (before the area Studios). */
export const BUILT_IN_STUDIOS: readonly StudioEntry[] = Object.freeze([
  {
    id: 'msm.lang',
    kindId: 'minecraft:lang',
    component: (props: StudioProps) => (
      <LangStudio
        ref={props.formRef}
        element={props.element}
        node={props.node}
        problems={props.problems}
        completions={props.completions}
        onChange={props.onChange}
      />
    ),
  },
  {
    id: 'msm.pack-settings',
    kindId: 'minecraft:pack_mcmeta',
    component: (props: StudioProps) => (
      <PackSettings target={props.context.target}>{props.form}</PackSettings>
    ),
  },
  {
    id: 'msm.function',
    kindId: FUNCTION_KIND,
    matches: (element: Element) => functionLinesOf(element.data) !== undefined,
    component: FunctionStudio,
    handlesFocus: true,
  },
  {
    id: 'msm.recipe',
    kindId: RECIPE_KIND,
    matches: (element: Element) => recipeLayout(recipeType(element.data)) !== undefined,
    coalesceKeys: [RECIPE_GRID_COALESCE],
    component: (props: StudioProps) => (
      <RecipeStudio
        key={props.element.id}
        data={props.element.data}
        onChange={props.onChange}
        completions={props.completions}
        problems={props.problems}
        categories={recipeCategories(props.node, props.element.data)}
      >
        <div data-testid="schema-form">{props.form}</div>
      </RecipeStudio>
    ),
  },
  {
    id: 'msm.tag',
    matches: (element: Element) => element.kind.startsWith(TAG_KIND_PREFIX),
    component: (props: StudioProps) => (
      <TagStudio
        key={props.element.id}
        data={props.element.data}
        registry={props.element.kind.slice(TAG_KIND_PREFIX.length)}
        onChange={props.onChange}
        suggest={props.suggest}
        problems={props.problems}
      />
    ),
  },
] satisfies StudioEntry[]);

/** The built-in Studios, then the discovered area Studios. */
const ALL_STUDIOS: readonly StudioEntry[] = mergeStudios(BUILT_IN_STUDIOS, DISCOVERED_STUDIOS);

/** The Form tab content for one element. */
export function ElementForm(props: ElementFormProps & { studios?: readonly StudioEntry[] }) {
  const { project, element, kind, schema, focusPointer, onFocused } = props;
  const formRef = useRef<SchemaFormHandle>(null);
  const studios = props.studios ?? ALL_STUDIOS;

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
  const studio = kind === undefined ? undefined : studioFor(element, kind, studios);
  const onChange = props.onChange;
  const withGesture = useGestureCoalesce(studio?.coalesceKeys ?? NO_KEYS);
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

  const studioFocuses = studio?.handlesFocus === true;
  const ready = node !== null && !(node instanceof Error);
  useEffect(() => {
    if (!ready || focusPointer === null || studioFocuses) return;
    const form = formRef.current;
    if (form === null) return;
    void form.focusPointer(focusPointer).finally(onFocused);
  }, [ready, focusPointer, onFocused, studioFocuses]);

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
  if (node === null || schema.status !== 'ready') {
    return <p className="text-muted">Loading the schema…</p>;
  }
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

  if (studio === undefined) return <div data-testid="schema-form">{form}</div>;
  const Studio = studio.component;
  return (
    <Studio
      project={project}
      element={element}
      kind={kind}
      node={node}
      context={schema.context}
      target={schema.context.target}
      problems={problems}
      sessionProblems={props.problems}
      completions={completions}
      suggest={suggest}
      onChange={change}
      form={form}
      formRef={formRef}
      focusPointer={focusPointer}
      focusColumn={props.focusColumn}
      onFocused={onFocused}
      complete={props.complete}
    />
  );
}
