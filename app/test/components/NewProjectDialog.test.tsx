// @vitest-environment happy-dom
import type { ProjectStarter } from '@msm/plugin-api';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NewProjectDialog,
  starterOptions,
} from '../../src/renderer/src/components/NewProjectDialog';
import { fakeStarter } from './library-fixtures';

afterEach(cleanup);

const blank: ProjectStarter = {
  ...fakeStarter,
  id: 'plugin_blank',
  title: 'Empty',
  category: 'blank',
  layers: ['resourcepack', 'datapack'],
};
const packStarter: ProjectStarter = {
  ...fakeStarter,
  id: 'data_only',
  title: 'Data pack',
  category: 'pack',
  layers: ['datapack'],
};

function renderDialog(starters: readonly ProjectStarter[]) {
  const onSubmit = vi.fn<(starter: ProjectStarter | null) => void>();
  const onCancel = vi.fn();
  render(<NewProjectDialog starters={starters} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
}

describe('NewProjectDialog', () => {
  it('groups starters as blank, pack and content with layer badges', () => {
    renderDialog([fakeStarter, packStarter, blank]);
    const groups = screen.getAllByRole('group').map((group) => group.getAttribute('data-testid'));
    expect(groups).toEqual(['starter-group-blank', 'starter-group-pack', 'starter-group-content']);
    expect(
      within(screen.getByTestId('starter-group-content')).getByText('Test starter'),
    ).toBeTruthy();
    expect(screen.getByTestId('starter-data_only-layer-datapack').textContent).toBe('Data pack');
    expect(screen.queryByTestId('starter-data_only-layer-resourcepack')).toBeNull();
    expect(screen.getByTestId('starter-test_starter-layer-resourcepack').textContent).toBe(
      'Resource pack',
    );
    // A plugin blank starter replaces the host's own entry and is preselected.
    expect(screen.queryByTestId('starter-blank')).toBeNull();
    expect((screen.getByTestId('starter-plugin_blank') as HTMLInputElement).checked).toBe(true);
  });

  it('submits the chosen starter', async () => {
    const { onSubmit } = renderDialog([fakeStarter, packStarter]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: /^Test starter/ }));
    await user.click(screen.getByTestId('new-project-dialog-submit'));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(fakeStarter);
  });

  it('offers a host blank project without a plugin blank starter and submits null', async () => {
    const { onSubmit } = renderDialog([fakeStarter]);
    expect((screen.getByTestId('starter-blank') as HTMLInputElement).checked).toBe(true);
    await userEvent.setup().click(screen.getByTestId('new-project-dialog-submit'));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(null);
    expect(starterOptions([]).map((option) => option.id)).toEqual(['blank']);
  });

  it('cancels', async () => {
    const { onCancel, onSubmit } = renderDialog([fakeStarter]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
