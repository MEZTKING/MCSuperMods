// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Block Studio block item Rarity: `item` is a union (`BlockItem | false`), so the choices are
 * found through the union (`choicesThrough`), not by plain struct fields (`choicesAt`).
 */
import { type Element, type Json, type Project, requireSyncResult } from '@msm/core';
import type { ElementKind, TemplateContext } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: {} });
  schema = {
    status: 'ready',
    context: { target, schemaIndex: index, vanillaRegistries: {}, registries: () => registries },
  };
});
afterEach(cleanup);

const blockKind = (): ElementKind => {
  const kind = blocksItemsPlugin.contributes.elementKinds?.find(
    (entry) => entry.id === 'msm:block',
  );
  if (kind === undefined) throw new Error('No kind msm:block.');
  return kind;
};

function simpleBlock(id: string): Json {
  const template = blocksItemsPlugin.contributes.elementTemplates?.find(
    (entry) => entry.id === 'msm_block_simple',
  );
  if (template === undefined) throw new Error('No template msm_block_simple.');
  const context: TemplateContext = {
    id: id as TemplateContext['id'],
    namespace: 'demo',
    path: id.slice(id.indexOf(':') + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: undefined,
    target,
  };
  return requireSyncResult(template.data(context), 'msm_block_simple');
}

function renderBlock(subject: Element) {
  const project: Project = {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements: [subject], assets: [] }],
  };
  const onChange = vi.fn<StudioProps['onChange']>();
  render(
    <ElementForm
      project={project}
      element={subject}
      kind={blockKind()}
      problems={[]}
      schema={schema}
      onChange={onChange}
      focusPointer={null}
      onFocused={vi.fn()}
    />,
  );
  return onChange;
}

describe('Block Studio block item rarity', () => {
  it('offers the rarities through the item union and writes the pick', () => {
    const subject = element('demo:b', 'msm:block', {
      ...(simpleBlock('demo:b') as object),
      item: { rarity: 'rare' },
    });
    const onChange = renderBlock(subject);
    const select = screen.getByTestId('block-item-rarity') as HTMLSelectElement;
    expect(select.value).toBe('rare');
    const values = [...select.options].map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['common', 'uncommon', 'rare', 'epic']));
    fireEvent.change(select, { target: { value: 'epic' } });
    expect(onChange.mock.lastCall?.slice(0, 2)).toEqual(['/item/rarity', 'epic']);
  });

  it('offers the rarities when the block item has no data yet', () => {
    const subject = element('demo:b', 'msm:block', simpleBlock('demo:b'));
    renderBlock(subject);
    const values = [...(screen.getByTestId('block-item-rarity') as HTMLSelectElement).options].map(
      (option) => option.value,
    );
    expect(values).toEqual(expect.arrayContaining(['common', 'uncommon', 'rare', 'epic']));
  });
});
