// @vitest-environment happy-dom
import type { Element, Json, Project } from '@msm/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CreatorCreated,
  CreatorDialog,
  type CreatorEditRequest,
} from '../../src/renderer/src/components/creator/CreatorDialog';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { aiSession } from './ai-fixtures';

afterEach(cleanup);

const SET_ID = 'set-1';

function projectOf(session: ProjectSession): Project {
  return session.snapshot.project as Project;
}

function renderDialog(
  session: ProjectSession,
  options: { edit?: CreatorEditRequest; onCreated?: (result: CreatorCreated) => void } = {},
) {
  const onClose = vi.fn();
  const onCreated = vi.fn(options.onCreated ?? (() => {}));
  const view = render(
    <CreatorDialog
      session={session}
      project={projectOf(session)}
      namespaces={['demo']}
      edit={options.edit ?? null}
      folders={session.target.folders.resource}
      readProjectAsset={(namespace, path) => session.readAsset(namespace, path).catch(() => null)}
      vanilla={null}
      onClose={onClose}
      onCreated={onCreated}
      newSetId={() => SET_ID}
      webgl={false}
      debounceMs={5}
    />,
  );
  return { onClose, onCreated, view, user: userEvent.setup() };
}

async function openGearSet(session: ProjectSession) {
  const setup = renderDialog(session);
  await setup.user.click(screen.getByTestId('creator-flow-gear-set'));
  await screen.findByTestId('creator-tab-elements');
  return setup;
}

function element(session: ProjectSession, id: string): Element | undefined {
  return projectOf(session)
    .namespaces.flatMap((namespace) => namespace.elements)
    .find((entry) => entry.id === id);
}

describe('CreatorDialog', () => {
  it('lists the flows in their groups', async () => {
    const { session } = await aiSession();
    renderDialog(session);
    const gear = screen.getByTestId('creator-group-gear');
    expect(within(gear).getByTestId('creator-flow-gear-set').textContent).toContain('Gear set');
    expect(
      within(screen.getByTestId('creator-group-blocks')).getByTestId('creator-flow-simple-block'),
    ).toBeTruthy();
    expect(screen.getByTestId('creator-group-food')).toBeTruthy();
    expect(screen.getByTestId('creator-group-scripts')).toBeTruthy();
    expect((screen.getByTestId('creator-create') as HTMLButtonElement).disabled).toBe(true);
  });

  it('previews the bundle and rebuilds it after a field changes', async () => {
    const { session } = await aiSession();
    const { user } = await openGearSet(session);
    // Items: every piece with its generated texture.
    const sword = await screen.findByTestId('creator-item-demo:ruby_sword');
    expect(sword.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(sword.textContent).toContain('Ruby Sword');
    expect(screen.getAllByTestId(/^creator-item-/)).toHaveLength(10);

    await user.click(screen.getByTestId('creator-tab-elements'));
    expect(screen.getByTestId('creator-element-demo:ruby_sword').dataset.status).toBe('create');
    // The blank project's pack.mcmeta conflicts.
    expect(screen.getByTestId('creator-conflict-demo:pack')).toBeTruthy();

    const name = screen.getByTestId('param-material_name');
    await user.clear(name);
    await user.type(name, 'Sapphire');
    await waitFor(() =>
      expect(screen.getByTestId('creator-element-demo:sapphire_sword')).toBeTruthy(),
    );
    expect(screen.queryByTestId('creator-element-demo:ruby_sword')).toBeNull();
  });

  it('shows recipes, armour layers and stats', async () => {
    const { session } = await aiSession();
    const { user } = await openGearSet(session);
    await user.click(screen.getByTestId('creator-tab-recipes'));
    const recipes = screen.getByTestId('creator-recipes');
    expect(within(recipes).getByLabelText('demo:ruby_sword_from_ruby')).toBeTruthy();
    await user.click(screen.getByTestId('creator-tab-armour'));
    expect(screen.getByTestId('creator-armour-layer-1').getAttribute('src')).toMatch(/^data:/);
    expect(screen.getByTestId('creator-armour-layer-2')).toBeTruthy();
    expect(screen.getByText(/WebGL is disabled/)).toBeTruthy();
    await user.click(screen.getByTestId('creator-tab-stats'));
    expect(screen.getByTestId('creator-stats-demo:ruby_helmet').textContent).toContain(
      '3 armour points',
    );
  });

  it('shows the field errors and blocks Create while a value is invalid', async () => {
    const { session } = await aiSession();
    const { user } = await openGearSet(session);
    await user.clear(screen.getByTestId('param-material_name'));
    expect(await screen.findByTestId('param-material_name-error')).toBeTruthy();
    expect((screen.getByTestId('creator-create') as HTMLButtonElement).disabled).toBe(true);
  });

  it('creates the set as one undo step labelled with the flow', async () => {
    const { session } = await aiSession();
    const { user, onCreated } = await openGearSet(session);
    await user.click(screen.getByTestId('param-pieces-hoe'));
    await waitFor(() => expect(screen.queryByTestId('creator-item-demo:ruby_hoe')).toBeNull());
    await user.click(screen.getByTestId('creator-create'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const result = onCreated.mock.calls[0]?.[0] as CreatorCreated;
    expect(result.label).toBe('Create Gear set');
    expect(result.created).toContain('demo:ruby_sword');
    expect(session.snapshot.undoLabel).toBe('Create Gear set');
    expect(element(session, 'demo:ruby_hoe')).toBeUndefined();
    expect(element(session, 'demo:ruby_helmet')?.meta.creator).toMatchObject({
      flowId: 'gear-set',
      setId: SET_ID,
      generatedId: 'demo:ruby_helmet',
    });
    expect(element(session, 'demo:ruby_helmet')?.meta.creator?.values.pieces).not.toContain('hoe');
  });

  it('reopens a set with its values and lists hand-edited pieces under "Kept your edits"', async () => {
    const { session } = await aiSession();
    const first = await openGearSet(session);
    await first.user.click(screen.getByTestId('creator-create'));
    await waitFor(() => expect(first.onCreated).toHaveBeenCalled());
    cleanup();
    const sword = element(session, 'demo:ruby_sword') as Element;
    session.setElementData('demo:ruby_sword', { ...(sword.data as object), edited: 1 } as Json);
    const helmet = element(session, 'demo:ruby_helmet') as Element;
    const meta = helmet.meta.creator;
    if (meta === undefined) throw new Error('No meta.creator');

    const { user, onCreated } = renderDialog(session, {
      edit: { flowId: meta.flowId, setId: meta.setId, values: meta.values, namespace: 'demo' },
    });
    expect(screen.getByRole('heading', { name: 'Edit: Gear set' })).toBeTruthy();
    expect((screen.getByTestId('param-material_name') as HTMLInputElement).value).toBe('Ruby');
    const kept = await screen.findByTestId('creator-kept-demo:ruby_sword');
    expect(kept.closest('section')?.getAttribute('aria-label')).toBe('Kept your edits');
    expect(screen.getByTestId('creator-element-demo:ruby_helmet').dataset.status).toBe('unchanged');

    fireEvent.input(screen.getByTestId('param-colour'), { target: { value: '#2050e0' } });
    await waitFor(() =>
      expect(
        screen.getByTestId('creator-element-demo:textures/item/ruby_helmet.png').dataset.status,
      ).toBe('replace'),
    );
    // The helmet's data does not depend on the colour; only its stored values change.
    expect(screen.getByTestId('creator-element-demo:ruby_helmet').dataset.status).toBe('unchanged');
    expect(screen.getByTestId('creator-kept-demo:ruby_sword')).toBeTruthy();
    expect(
      (screen.getByTestId('creator-overwrite-demo:ruby_sword') as HTMLInputElement).checked,
    ).toBe(false);
    await user.click(screen.getByTestId('creator-create'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(session.snapshot.undoLabel).toBe('Update Gear set');
    expect(element(session, 'demo:ruby_sword')?.data).toMatchObject({ edited: 1 });
    expect(element(session, 'demo:ruby_helmet')?.meta.creator?.values.colour).toBe('#2050e0');
  });

  it('Cancel closes without changing the project', async () => {
    const { session } = await aiSession();
    const before = session.snapshot.project;
    const { user, onClose } = await openGearSet(session);
    await user.click(screen.getByTestId('creator-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(session.snapshot.project).toBe(before);
  });
});
