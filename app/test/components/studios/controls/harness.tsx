/// <reference types="node" />
/**
 * Test helper for the controls Studios (B420): an `ElementForm` over a real `CommandStack` (each
 * edit one undo step) for a key bind or HUD element, the controls plugin's kinds and templates,
 * and session problems passed in as the validators would report them.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Problem,
  type ResourceLocation,
  requireSyncResult,
} from '@msm/core';
import type { ElementKind, TemplateContext } from '@msm/plugin-api';
import controlsPlugin from '@msm/plugin-controls';
import { builtInTargets } from '@msm/targets';
import { render, screen } from '@testing-library/react';
import { type ComponentType, type ReactNode, useEffect, useReducer } from 'react';
import { vi } from 'vitest';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { projectOf } from '../blocks-items/harness';

export const bundle = builtInTargets[0] as (typeof builtInTargets)[number];

/** The controls plugin's kind `id`. */
export function controlsKind(id: string): ElementKind {
  const kind = controlsPlugin.contributes.elementKinds?.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
}

/** The data of the controls template `templateId` for element `id`. */
export function templateData(templateId: string, id: string): Json {
  const entry = controlsPlugin.contributes.elementTemplates?.find((t) => t.id === templateId);
  if (entry === undefined) throw new Error(`No template ${templateId}.`);
  const [namespace = 'demo', path = ''] = id.split(':');
  const context: TemplateContext = {
    id: id as TemplateContext['id'],
    namespace,
    path,
    projectNamespace: namespace,
    namespaces: [namespace],
    kindDefault: undefined,
    target: bundle.target,
  };
  return requireSyncResult(entry.data(context), templateId);
}

function Harness(props: {
  stack: CommandStack;
  id: ResourceLocation;
  schema: SchemaContextState;
  problems: readonly Problem[];
}) {
  const { stack, id, schema } = props;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={controlsKind(subject.kind)}
      problems={props.problems}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

/** Renders `subject` (with `others` in the project) and waits for `studioTestId`. */
export async function openStudio(
  subject: Element,
  schema: SchemaContextState,
  studioTestId: string,
  options: {
    others?: Element[];
    problems?: readonly Problem[];
    wrapper?: ComponentType<{ children: ReactNode }>;
  } = {},
): Promise<{ stack: CommandStack; data: () => Json }> {
  const stack = new CommandStack(projectOf(subject, ...(options.others ?? [])));
  render(
    <Harness stack={stack} id={subject.id} schema={schema} problems={options.problems ?? []} />,
    options.wrapper === undefined ? {} : { wrapper: options.wrapper },
  );
  await screen.findByTestId(studioTestId);
  const data = (): Json =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === subject.id)?.data ?? null;
  return { stack, data };
}
