// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewTextureDialog } from '../../src/renderer/src/components/texture-editor/NewTextureDialog';

afterEach(cleanup);

describe('NewTextureDialog', () => {
  it('paints a new texture in the folder and size of its kind', async () => {
    const onPaint = vi.fn();
    render(
      <NewTextureDialog namespace="ruby_mod" existing={[]} onPaint={onPaint} onClose={vi.fn()} />,
    );
    const user = userEvent.setup();
    const submit = screen.getByRole('button', { name: 'Paint…' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByTestId('new-texture-name'), 'ruby');
    await user.selectOptions(screen.getByTestId('new-texture-kind'), 'armour');
    await user.click(submit);
    expect(onPaint).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ruby',
        path: 'textures/entity/equipment/humanoid/ruby.png',
        kind: expect.objectContaining({ width: 64, height: 32 }),
      }),
    );
  });

  it('paints an 18 by 18 effect icon in textures/mob_effect', async () => {
    const onPaint = vi.fn();
    render(
      <NewTextureDialog namespace="ruby_mod" existing={[]} onPaint={onPaint} onClose={vi.fn()} />,
    );
    const user = userEvent.setup();
    const kind = screen.getByTestId('new-texture-kind') as HTMLSelectElement;
    expect([...kind.options].map((option) => option.textContent)).toContain(
      'Effect icon (18 × 18)',
    );
    await user.type(screen.getByTestId('new-texture-name'), 'ruby_rush');
    await user.selectOptions(kind, 'effect_icon');
    expect(screen.getByText(/the game finds the icon by name/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Paint…' }));
    expect(onPaint).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ruby_rush',
        path: 'textures/mob_effect/ruby_rush.png',
        kind: expect.objectContaining({ id: 'effect_icon', width: 18, height: 18 }),
      }),
    );
  });

  it('refuses bad names and textures that already exist', async () => {
    render(
      <NewTextureDialog
        namespace="ruby_mod"
        existing={['textures/item/ruby.png']}
        onPaint={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const name = screen.getByTestId('new-texture-name');
    await user.type(name, 'ruby');
    expect(screen.getByText(/already exists/)).toBeTruthy();
    await user.clear(name);
    await user.type(name, '_x!');
    expect(screen.getByText(/lower case letters/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Paint…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
