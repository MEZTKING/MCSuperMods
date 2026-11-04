/**
 * The Form tab: a `SchemaForm` over the selected element, with the kind's hidden paths, the
 * element's live problems and project completions. Language files and pack metadata get their
 * Studio wrappers. Edits go to `session.setElementValue`, so the Raw JSON tab stays in sync.
 *
 * @packageDocumentation
 */

import type { Element, Json, Problem, Project } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import type { SchemaNode } from '@msm/schemas';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type ChangeOptions, type FormProblem, SchemaForm, type SchemaFormHandle } from '../forms';
import { createCompletionSource } from './completions';
import { LangStudio } from './LangStudio';
import { PackSettings } from './PackSettings';
import type { SchemaContextState } from './use-schema-context';

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
  const change = useCallback(
    (pointer: string, value: Json | undefined, options?: ChangeOptions) => {
      if (options === undefined) onChange(pointer, value);
      else onChange(pointer, value, options);
    },
    [onChange],
  );

  const ready = node !== null && !(node instanceof Error);
  useEffect(() => {
    if (!ready || focusPointer === null) return;
    const form = formRef.current;
    if (form === null) return;
    void form.focusPointer(focusPointer).finally(onFocused);
  }, [ready, focusPointer, onFocused]);

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
  return <div data-testid="schema-form">{form}</div>;
}
