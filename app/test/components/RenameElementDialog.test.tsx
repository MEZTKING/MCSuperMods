// @vitest-environment happy-dom
import type { ResourceLocation } from '@msm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RENAME_ANYWAY_LABEL,
  RenameElementDialog,
} from '../../src/renderer/src/components/RenameElementDialog';

afterEach(cleanup);

describe('RenameElementDialog (ADR 0102 D5)', () => {
  it('warns before renaming an exported id and still renames', async () => {
    const onSubmit = vi.fn();
    const warning = vi.fn((newId: ResourceLocation | undefined) =>
      newId === undefined
        ? 'Exported: demo:ruby (block).'
        : `Exported: demo:ruby becomes ${newId}.`,
    );
    render(
      <RenameElementDialog
        id={'demo:ruby' as ResourceLocation}
        references={0}
        warning={warning}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId('rename-exported-warning').textContent).toBe(
      'Exported: demo:ruby (block).',
    );
    const user = userEvent.setup();
    const input = screen.getByTestId('rename-input');
    await user.clear(input);
    await user.type(input, 'demo:garnet');
    expect(screen.getByTestId('rename-exported-warning').textContent).toBe(
      'Exported: demo:ruby becomes demo:garnet.',
    );
    await user.click(screen.getByRole('button', { name: RENAME_ANYWAY_LABEL }));
    expect(onSubmit).toHaveBeenCalledWith('demo:garnet');
  });

  it('shows no warning for an id never exported', () => {
    render(
      <RenameElementDialog
        id={'demo:fresh' as ResourceLocation}
        references={2}
        warning={() => null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('rename-exported-warning')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
  });
});
