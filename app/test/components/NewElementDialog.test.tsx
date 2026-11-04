// @vitest-environment happy-dom
import { resourcePackKinds } from '@msm/plugin-resourcepack';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NewElementDialog,
  type NewElementInput,
} from '../../src/renderer/src/components/NewElementDialog';
import {
  RESOURCE_PACK_TEMPLATES,
  templateElementId,
  templatesFor,
} from '../../src/renderer/src/studios/templates';

afterEach(cleanup);

const kinds = resourcePackKinds;
const kindDefault = (kind: string) => kinds.find((entry) => entry.id === kind)?.defaultData;

function renderDialog(onSubmit = vi.fn<(input: NewElementInput) => void>()) {
  render(
    <NewElementDialog
      namespaces={['demo', 'other']}
      templates={templatesFor(kinds.map((kind) => kind.id))}
      kindDefault={kindDefault}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

async function create(template: string, name: string | null) {
  const onSubmit = renderDialog();
  const user = userEvent.setup();
  await user.click(screen.getByTestId(`template-${template}`));
  if (name !== null) {
    const input = screen.getByTestId('new-element-name');
    await user.clear(input);
    await user.type(input, name);
  }
  await user.click(screen.getByTestId('new-element-dialog-submit'));
  expect(onSubmit).toHaveBeenCalledOnce();
  return onSubmit.mock.calls[0]?.[0] as NewElementInput;
}

describe('NewElementDialog (template picker)', () => {
  it('offers every resource pack template as a labelled radio', () => {
    renderDialog();
    for (const template of RESOURCE_PACK_TEMPLATES) {
      expect(screen.getByRole('radio', { name: new RegExp(`^${template.label}`) })).toBeTruthy();
    }
  });

  it('creates a block model with the namespace substituted', async () => {
    expect(await create('block_model', 'ruby_block')).toEqual({
      id: 'demo:block/ruby_block',
      kind: 'minecraft:model',
      data: { parent: 'minecraft:block/cube_all', textures: { all: 'demo:block/ruby_block' } },
    });
  });

  it('creates an item model from item/generated', async () => {
    expect(await create('item_model', 'ruby')).toEqual({
      id: 'demo:item/ruby',
      kind: 'minecraft:model',
      data: { parent: 'minecraft:item/generated', textures: { layer0: 'demo:item/ruby' } },
    });
  });

  it('creates a blockstate and an item definition pointing at models', async () => {
    const blockstate = await create('blockstate', 'ruby_block');
    expect(blockstate).toMatchObject({ id: 'demo:ruby_block', kind: 'minecraft:block_definition' });
    expect(blockstate.data).toEqual({ variants: { '': { model: 'demo:block/ruby_block' } } });
    cleanup();
    const item = await create('item_definition', 'ruby');
    expect(item).toMatchObject({ id: 'demo:ruby', kind: 'minecraft:item_definition' });
    expect(JSON.stringify(item.data)).toContain('"demo:item/ruby"');
  });

  it('fills in default names for language, sounds and pack files', async () => {
    expect(await create('lang', null)).toMatchObject({ id: 'demo:en_us', kind: 'minecraft:lang' });
    cleanup();
    const sounds = await create('sounds', null);
    expect(sounds).toMatchObject({ id: 'demo:sounds', kind: 'minecraft:sounds' });
    cleanup();
    expect(await create('pack', null)).toMatchObject({
      id: 'demo:pack',
      kind: 'minecraft:pack_mcmeta',
    });
  });

  it('keeps the sounds name fixed and shows errors for an empty name', async () => {
    const onSubmit = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('template-sounds'));
    expect((screen.getByTestId('new-element-name') as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByTestId('template-block_model'));
    expect((screen.getByTestId('new-element-name') as HTMLInputElement).value).toBe('');
    await user.click(screen.getByTestId('new-element-dialog-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Enter a name/);
  });
});

describe('templates', () => {
  it('adds a generic entry for kinds without a template', () => {
    const ids = templatesFor(['minecraft:model', 'example:thing']).map((entry) => entry.id);
    expect(ids).toEqual(['block_model', 'item_model', 'kind:example:thing']);
  });

  it('builds ids and rejects invalid names', () => {
    const block = RESOURCE_PACK_TEMPLATES[0];
    if (block === undefined) throw new Error('no templates');
    expect(templateElementId(block, 'demo', 'block/ore')).toBe('demo:block/ore');
    expect(() => templateElementId(block, 'demo', 'Bad Name')).toThrow(/not a valid name/);
  });
});

describe('NewElementDialog default namespace', () => {
  it('preselects a template namespace the project lacks and says it will be added', async () => {
    const onSubmit = vi.fn<(input: NewElementInput) => void>();
    const dataKinds = ['minecraft:tag/function', 'minecraft:function'];
    render(
      <NewElementDialog
        namespaces={['demo']}
        templates={templatesFor(dataKinds)}
        kindDefault={() => ({ values: [] })}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('template-function_tick'));
    const select = screen.getByTestId('new-element-namespace') as HTMLSelectElement;
    expect(select.value).toBe('minecraft');
    expect(screen.getByTestId('new-element-new-namespace').textContent).toMatch(/minecraft/);
    const submit = screen.getByTestId('new-element-dialog-submit');
    expect(submit.textContent).toBe('Add namespace and create');
    await user.click(submit);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      id: 'minecraft:tick',
      kind: 'minecraft:tag/function',
      data: { values: ['demo:tick'] },
    });
  });

  it('returns to the project namespace for templates without a default', async () => {
    render(
      <NewElementDialog
        namespaces={['demo']}
        templates={templatesFor(['minecraft:tag/function', 'minecraft:function'])}
        kindDefault={() => undefined}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('template-function_load'));
    await user.click(screen.getByTestId('template-function'));
    expect((screen.getByTestId('new-element-namespace') as HTMLSelectElement).value).toBe('demo');
    expect(screen.queryByTestId('new-element-new-namespace')).toBeNull();
  });
});
