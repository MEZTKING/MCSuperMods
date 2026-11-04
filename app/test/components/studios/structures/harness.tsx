/**
 * Test harness for the structure Studios: renders `ElementForm` (so the Studio comes from
 * the registry) over the real schema index, with chosen vanilla ids and an optional host.
 */
import type { Element, Project } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import { structureKinds } from '@msm/plugin-structures';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { type RenderResult, render } from '@testing-library/react';
import { type Mock, vi } from 'vitest';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import {
  type StructureStudioHost,
  StructureStudioHostContext,
} from '../../../../src/renderer/src/studios/structures/host';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { schemaIndex } from '../../forms/schemas';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

/** Vanilla ids the tests rely on (unnamespaced, as mcmeta lists them). */
export const VANILLA: Readonly<Record<string, readonly string[]>> = {
  'worldgen/template_pool': ['empty', 'village/plains/streets'],
  'worldgen/structure_pool_element': [
    'empty_pool_element',
    'feature_pool_element',
    'legacy_single_pool_element',
    'list_pool_element',
    'single_pool_element',
  ],
  structure: ['village/plains/houses/plains_small_house_1'],
  'worldgen/processor_list': ['empty', 'mossify_10_percent'],
};

/** The schema context state over the real schema index. */
export async function readySchema(): Promise<SchemaContextState> {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: VANILLA });
  return {
    status: 'ready',
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: VANILLA,
      registries: () => registries,
    },
  };
}

export function kindOf(id: string): ElementKind {
  const kind = structureKinds.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}`);
  return kind;
}

/** A {@link StructureStudioHost} whose actions are spies. */
export interface FakeHost extends StructureStudioHost {
  replaceFromFile: Mock<StructureStudioHost['replaceFromFile']>;
  exportStructures: Mock<StructureStudioHost['exportStructures']>;
  openElement: Mock<StructureStudioHost['openElement']>;
}

/** A fake host whose actions are spies. */
export function fakeHost(): FakeHost {
  return {
    replaceFromFile: vi.fn<StructureStudioHost['replaceFromFile']>(),
    exportStructures: vi.fn<StructureStudioHost['exportStructures']>(),
    openElement: vi.fn<StructureStudioHost['openElement']>(),
  };
}

/** Renders the Form tab for `subject` in `project`. */
export function renderStudio(options: {
  project: Project;
  subject: Element;
  schema: SchemaContextState;
  host?: StructureStudioHost;
}): RenderResult & { onChange: Mock<StudioProps['onChange']> } {
  const onChange = vi.fn<StudioProps['onChange']>();
  const form = (
    <ElementForm
      project={options.project}
      element={options.subject}
      kind={kindOf(options.subject.kind)}
      problems={[]}
      schema={options.schema}
      onChange={onChange}
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
  const result = render(
    options.host === undefined ? (
      form
    ) : (
      <StructureStudioHostContext.Provider value={options.host}>
        {form}
      </StructureStudioHostContext.Provider>
    ),
  );
  return { ...result, onChange };
}

/** A one-namespace project holding `elements`. */
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
