// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../../src/renderer/src/components/SettingsDialog';
import { backupLabel, sizeLabel } from '../../src/renderer/src/components/WorldBackupsSection';
import type {
  AppSettingsPatch,
  AppSettingsView,
  WorldBackupList,
  WorldBackupsPlatform,
} from '../../src/shared/platform';

afterEach(cleanup);

const VIEW: AppSettingsView = {
  minecraftDir: null,
  updates: { autoCheck: true },
  backups: { beforeInstall: true, keep: 5 },
  detectedMinecraftDir: null,
};

const LIST: WorldBackupList = {
  folder: '/home/me/.msm/backups',
  groups: [
    {
      location: 'official-default-0a1b2c3d',
      locationName: 'Official launcher',
      available: true,
      worldDir: 'Survival',
      backups: [
        {
          fileName: '2026-11-21_10-05-09.zip',
          path: '/home/me/.msm/backups/official-default-0a1b2c3d/Survival/2026-11-21_10-05-09.zip',
          size: 2_400_000,
          createdAt: '2026-11-21T10:05:09.000Z',
        },
      ],
    },
    {
      location: 'prism-Gone-11111111',
      locationName: 'prism-Gone-11111111',
      available: false,
      worldDir: 'Old',
      backups: [
        {
          fileName: '2026-11-20_09-00-00.zip',
          path: '/home/me/.msm/backups/prism-Gone-11111111/Old/2026-11-20_09-00-00.zip',
          size: 900,
          createdAt: '2026-11-20T09:00:00.000Z',
        },
      ],
    },
  ],
};

function setup(list: WorldBackupList = LIST) {
  const save = vi.fn(async (_patch: AppSettingsPatch) => {});
  const backups: WorldBackupsPlatform = {
    list: vi.fn(async () => list),
    restore: vi.fn(async (request) => ({
      dir: `${request.worldDir}-restored-2026-11-21_11-00-00`,
      path: `/home/me/.minecraft/saves/${request.worldDir}-restored-2026-11-21_11-00-00`,
    })),
    openFolder: vi.fn(async () => {}),
  };
  render(
    <SettingsDialog
      mcVersion="1.0-test"
      status={null}
      progress={null}
      load={async () => VIEW}
      save={save}
      browse={async () => null}
      extract={async () => null}
      onClose={vi.fn()}
      worldBackups={backups}
    />,
  );
  return { save, backups };
}

describe('Settings > World backups', () => {
  it('shows the folder, the two settings and the backups per world', async () => {
    const { backups } = setup();
    const section = await screen.findByTestId('settings-world-backups');
    expect(within(section).getByRole('heading', { name: 'World backups' })).toBeTruthy();
    expect(await within(section).findByText('/home/me/.msm/backups')).toBeTruthy();
    const before = within(section).getByRole('checkbox', {
      name: 'Back up a world before installing into it',
    }) as HTMLInputElement;
    await waitFor(() => expect(before.disabled).toBe(false));
    expect(before.checked).toBe(true);
    const keep = within(section).getByLabelText('Backups to keep per world') as HTMLInputElement;
    expect(keep.value).toBe('5');
    expect(within(section).getByTestId('backup-group-0').textContent).toContain(
      'Survival in Official launcher',
    );
    expect(within(section).getByTestId('backup-0-0').textContent).toContain('2026-11-21 10:05:09');
    // A location that is no longer found cannot be restored.
    expect((within(section).getByTestId('backup-restore-1-0') as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.setup().click(within(section).getByRole('button', { name: 'Open folder' }));
    expect(backups.openFolder).toHaveBeenCalledTimes(1);
  });

  it('saves the settings', async () => {
    const { save } = setup();
    const section = await screen.findByTestId('settings-world-backups');
    const before = within(section).getByRole('checkbox', {
      name: 'Back up a world before installing into it',
    }) as HTMLInputElement;
    await waitFor(() => expect(before.disabled).toBe(false));
    const user = userEvent.setup();
    await user.click(before);
    expect(save).toHaveBeenLastCalledWith({ backups: { beforeInstall: false, keep: 5 } });
    const keep = within(section).getByLabelText('Backups to keep per world');
    await user.clear(keep);
    await user.type(keep, '3{Enter}');
    expect(save).toHaveBeenLastCalledWith({ backups: { beforeInstall: false, keep: 3 } });
    await user.clear(keep);
    await user.type(keep, '0{Enter}');
    expect(save).toHaveBeenCalledTimes(2);
    expect(within(section).getByRole('alert').textContent).toMatch(/from 1 to 50/);
  });

  it('restores beside the world and says so', async () => {
    const { backups } = setup();
    const section = await screen.findByTestId('settings-world-backups');
    await userEvent
      .setup()
      .click(await within(section).findByRole('button', { name: /Restore Survival from/ }));
    expect(backups.restore).toHaveBeenCalledWith({
      location: 'official-default-0a1b2c3d',
      worldDir: 'Survival',
      fileName: '2026-11-21_10-05-09.zip',
    });
    expect((await within(section).findByTestId('settings-backups-notice')).textContent).toContain(
      'Restored as the world folder "Survival-restored-2026-11-21_11-00-00" beside "Survival".',
    );
  });

  it('says when there are no backups, and is hidden without the platform', async () => {
    setup({ folder: '/b', groups: [] });
    expect(await screen.findByTestId('settings-backups-empty')).toBeTruthy();
    cleanup();
    render(
      <SettingsDialog
        mcVersion="1.0-test"
        status={null}
        progress={null}
        load={async () => VIEW}
        save={vi.fn()}
        browse={async () => null}
        extract={async () => null}
        onClose={vi.fn()}
      />,
    );
    await screen.findByTestId('settings-dialog');
    expect(screen.queryByTestId('settings-world-backups')).toBeNull();
  });

  it('formats backup names and sizes', () => {
    expect(backupLabel('2026-11-21_10-05-09-2.zip')).toBe('2026-11-21 10:05:09 (2)');
    expect(backupLabel('other.zip')).toBe('other.zip');
    expect(sizeLabel(900)).toBe('900 bytes');
    expect(sizeLabel(2_400_000)).toBe('2.3 MB');
  });
});
