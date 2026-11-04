// @vitest-environment happy-dom
import type { Element, Problem } from '@msm/core';
import { langKind, modelKind, packMcmetaKind } from '@msm/plugin-resourcepack';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ElementForm, type ElementFormProps } from '../../src/renderer/src/studios/ElementForm';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element, sampleProject } from './fixtures';
import { schemaIndex } from './forms/schemas';

afterEach(cleanup);

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: {} });
  schema = {
    status: 'ready',
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: {},
      registries: () => registries,
    },
  };
});

function renderForm(subject: Element, overrides: Partial<ElementFormProps> = {}) {
  const props: ElementFormProps = {
    project: sampleProject(),
    element: subject,
    kind: [modelKind, langKind, packMcmetaKind].find((kind) => kind.id === subject.kind),
    problems: [],
    schema,
    onChange: vi.fn(),
    focusPointer: null,
    onFocused: vi.fn(),
    ...overrides,
  };
  render(<ElementForm {...props} />);
  return props;
}

const model = element('demo:block/ruby_block', 'minecraft:model', {
  parent: 'minecraft:block/cube_all',
  textures: { all: 'demo:block/ruby_block' },
});

function textureInput(): HTMLInputElement {
  const field = document.querySelector('[data-pointer="/textures/all"]');
  const input = field?.querySelector('input[type="text"]:not([aria-label^="Key "])');
  if (!(input instanceof HTMLInputElement)) throw new Error('No /textures/all input.');
  return input;
}

describe('ElementForm', () => {
  it('edits through pointers with typing coalesced', async () => {
    const props = renderForm(model);
    expect(screen.getByTestId('schema-form')).toBeTruthy();
    const user = userEvent.setup();
    await user.type(textureInput(), 'x');
    expect(props.onChange).toHaveBeenLastCalledWith('/textures/all', 'demo:block/ruby_blockx', {
      coalesce: 'typing:/textures/all',
    });
  });

  it('shows problems under the field and focuses a requested pointer', async () => {
    const problem: Problem = {
      severity: 'error',
      code: 'schema.type',
      elementId: model.id,
      path: '/textures/all',
      message: 'Texture is wrong.',
    };
    const props = renderForm(model, { problems: [problem], focusPointer: '/textures/all' });
    expect(screen.getByText('Texture is wrong.')).toBeTruthy();
    await waitFor(() => expect(props.onFocused).toHaveBeenCalled());
    // The form focuses the entry's value control, not the map key input.
    expect(document.activeElement).toBe(textureInput());
  });

  it('says when the schemas failed to load', () => {
    renderForm(model, { schema: { status: 'failed', message: 'boom' } });
    expect(screen.getByRole('alert').textContent).toMatch(/boom/);
  });

  it('wraps language files with search and Add key', async () => {
    const lang = element('demo:en_us', 'minecraft:lang', {
      'block.demo.ruby_block': 'Ruby Block',
      'item.demo.ruby': 'Ruby',
    });
    const props = renderForm(lang);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('lang-search'), 'item.demo.sapphire');
    expect(screen.getByText(/2 key\(s\), 0 shown/)).toBeTruthy();
    await user.click(screen.getByTestId('lang-add-key'));
    expect(props.onChange).toHaveBeenCalledWith('/item.demo.sapphire', '');
  });

  it('shows pack settings with the target and hides pack formats', () => {
    const pack = element('demo:pack', 'minecraft:pack_mcmeta', {
      pack: { description: 'Demo', pack_format: 1 },
    });
    renderForm(pack);
    expect(screen.getByTestId('pack-target').textContent).toContain(target.id);
    expect(document.querySelector('[data-pointer="/pack/description"]')).not.toBeNull();
    expect(document.querySelector('[data-pointer="/pack/pack_format"]')).toBeNull();
  });
});
