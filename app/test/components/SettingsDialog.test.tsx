// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../../src/renderer/src/components/SettingsDialog';
import type { AppSettingsPatch, AppSettingsView } from '../../src/shared/platform';

afterEach(cleanup);

function renderDialog(view: AppSettingsView, save = vi.fn(async (_patch: AppSettingsPatch) => {})) {
  render(
    <SettingsDialog
      mcVersion="1.0-test"
      status={null}
      progress={null}
      load={async () => view}
      save={save}
      browse={async () => null}
      extract={async () => null}
      onClose={vi.fn()}
    />,
  );
  return save;
}

const toggle = () =>
  screen.getByRole('checkbox', { name: 'Check for updates automatically' }) as HTMLInputElement;

describe('SettingsDialog updates toggle', () => {
  it('reflects the stored setting and saves only the updates field', async () => {
    const save = renderDialog({
      minecraftDir: '/games/mc',
      updates: { autoCheck: true },
      detectedMinecraftDir: null,
    });
    await waitFor(() => expect(toggle().disabled).toBe(false));
    expect(toggle().checked).toBe(true);
    await userEvent.setup().click(toggle());
    expect(save).toHaveBeenCalledWith({ updates: { autoCheck: false } });
    expect(toggle().checked).toBe(false);
  });

  it('starts unchecked when turned off, and reverts when saving fails', async () => {
    const save = vi.fn(async () => {
      throw new Error('Disk full');
    });
    renderDialog(
      { minecraftDir: null, updates: { autoCheck: false }, detectedMinecraftDir: null },
      save,
    );
    await waitFor(() => expect(toggle().disabled).toBe(false));
    expect(toggle().checked).toBe(false);
    await userEvent.setup().click(toggle());
    expect(save).toHaveBeenCalledWith({ updates: { autoCheck: true } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Disk full');
    expect(toggle().checked).toBe(false);
  });

  it('saves the Minecraft folder without touching the updates setting', async () => {
    const save = renderDialog({
      minecraftDir: null,
      updates: { autoCheck: true },
      detectedMinecraftDir: null,
    });
    await waitFor(() => expect(toggle().disabled).toBe(false));
    const user = userEvent.setup();
    await user.type(screen.getByTestId('settings-minecraft-folder'), '/games/mc');
    await user.click(screen.getByTestId('settings-save'));
    expect(save).toHaveBeenCalledWith({ minecraftDir: '/games/mc' });
  });
});
