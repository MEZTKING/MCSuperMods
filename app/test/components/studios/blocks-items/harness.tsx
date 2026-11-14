/// <reference types="node" />
/**
 * Test helper for the B239 Studio tests: a schema context over a target's real schema index,
 * an `ElementForm` bound to a `CommandStack` (so each edit is an undo step), and the kinds of
 * the built-in plugins.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import entitiesPlugin from '@msm/plugin-entities';
import { createRegistryIndex, type SchemaIndex } from '@msm/schemas';
import type { TargetBundle } from '@msm/targets';
import { render } from '@testing-library/react';
import { type ComponentType, type ReactNode, useEffect, useReducer } from 'react';
import { vi } from 'vitest';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';

/** A ready schema context over `index`, with `vanilla` registry ids for suggestions. */
export function schemaState(
  bundle: TargetBundle,
  index: SchemaIndex,
  vanilla: Record<string, string[]> = {},
): SchemaContextState {
  const registries = createRegistryIndex({ vanilla });
  return {
    status: 'ready',
    context: {
      target: bundle.target,
      schemaIndex: index,
      vanillaRegistries: vanilla,
      registries: () => registries,
    },
  };
}

/** The registered kind `id` of the blocks-items or entities plugin. */
export function kindOf(id: string): ElementKind {
  const kind = [
    ...(blocksItemsPlugin.contributes.elementKinds ?? []),
    ...(entitiesPlugin.contributes.elementKinds ?? []),
  ].find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
}

export function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements, assets: [] }],
  };
}

function StackHarness(props: {
  stack: CommandStack;
  id: ResourceLocation;
  schema: SchemaContextState;
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
      kind={kindOf(subject.kind)}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

/**
 * Renders `subject` on a command stack (with `others` in the project and an optional host
 * `wrapper`); returns the stack and a reader of the live data.
 */
export function renderOnStack(
  subject: Element,
  schema: SchemaContextState,
  options: { wrapper?: ComponentType<{ children: ReactNode }>; others?: Element[] } = {},
) {
  const stack = new CommandStack(projectOf(subject, ...(options.others ?? [])));
  render(
    <StackHarness stack={stack} id={subject.id} schema={schema} />,
    options.wrapper === undefined ? {} : { wrapper: options.wrapper },
  );
  const data = (): Json =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === subject.id)?.data ?? null;
  return { stack, data };
}
