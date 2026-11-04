// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstallTargetOption } from '../../src/renderer/src/components/install-target';
import {
  minecraftSummary,
  SettingsDialog,
  type SettingsDialogProps,
} from '../../src/renderer/src/components/SettingsDialog';
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

const VIEW: AppSettingsView = {
  minecraftDir: null,
  updates: { autoCheck: true },
  detectedMinecraftDir: '/home/me/.minecraft',
};

const LOCATIONS: InstallTargetOption[] = [
  {
    id: 'official:default',
    launcher: 'official',
    displayName: 'Official launcher',
    mcVersion: null,
    loader: null,
    gameDir: '/home/me/.minecraft',
    warnings: [],
    problems: [],
    installable: true,
  },
  {
    id: 'prism:Fabric-Pack',
    launcher: 'prism',
    displayName: 'Fabric Pack',
    mcVersion: '9.9-msm-test',
    loader: { kind: 'fabric', version: '0.1.2' },
    gameDir: '/home/me/.local/share/PrismLauncher/instances/Fabric-Pack/minecraft',
    warnings: ['This instance runs Minecraft 9.9-msm-test; the project targets 1.0-test.'],
    problems: [],
    installable: true,
  },
  {
    id: 'curseforge:Broken',
    launcher: 'curseforge',
    displayName: 'Broken',
    mcVersion: null,
    loader: null,
    gameDir: '/home/me/curseforge/minecraft/Instances/Broken',
    warnings: [],
    problems: ['Start the instance once so its game folder exists.'],
    installable: false,
  },
];

function renderLocations(overrides: Partial<SettingsDialogProps> = {}) {
  const props: SettingsDialogProps = {
    mcVersion: '1.0-test',
    status: null,
    progress: null,
    load: async () => VIEW,
    save: vi.fn(async () => {}),
    browse: async () => null,
    extract: async () => null,
    onClose: vi.fn(),
    locations: LOCATIONS,
    selectedId: 'official:default',
    onSelectTarget: vi.fn(),
    onAddLauncherRoot: vi.fn(async () => {}),
    manualRoots: [
      { kind: 'multimc', path: '/opt/multimc', found: 0 },
      { kind: 'prism', path: '/data/prism', found: 2 },
    ],
    onRemoveLauncherRoot: vi.fn(),
    ...overrides,
  };
  render(<SettingsDialog {...props} />);
  return props;
}

describe('SettingsDialog game locations', () => {
  it('lists locations with launcher, version and loader badges and problems', () => {
    renderLocations();
    expect(screen.getByTestId('settings-locations')).toBeTruthy();
    expect(screen.getByTestId('location-launcher-prism:Fabric-Pack').textContent).toBe(
      'Prism Launcher',
    );
    expect(screen.getByTestId('location-version-prism:Fabric-Pack').textContent).toBe(
      'MC 9.9-msm-test',
    );
    expect(screen.getByTestId('location-loader-prism:Fabric-Pack').textContent).toBe(
      'Fabric 0.1.2',
    );
    expect(screen.queryByTestId('location-version-official:default')).toBeNull();
    expect(screen.getByTestId('location-row-curseforge:Broken').textContent).toContain(
      'Start the instance once so its game folder exists.',
    );
    expect(screen.getByTestId('location-row-prism:Fabric-Pack').textContent).toContain(
      'the project targets 1.0-test',
    );
    const checked = screen.getByTestId('location-select-official:default') as HTMLInputElement;
    expect(checked.checked).toBe(true);
  });

  it('labels every radio', () => {
    renderLocations();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-label')).toBeTruthy();
    }
    expect(
      screen.getByRole('radio', { name: 'Prism Launcher — Fabric Pack (MC 9.9-msm-test)' }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Official launcher' })).toBeTruthy();
  });

  it('selects a location', async () => {
    const props = renderLocations();
    await userEvent.setup().click(screen.getByTestId('location-select-prism:Fabric-Pack'));
    expect(props.onSelectTarget).toHaveBeenCalledExactlyOnceWith('prism:Fabric-Pack');
  });

  it('adds and removes launcher folders', async () => {
    const props = renderLocations();
    const user = userEvent.setup();
    for (const kind of ['prism', 'multimc', 'curseforge'] as const) {
      await user.click(screen.getByTestId(`settings-add-${kind}`));
      expect(props.onAddLauncherRoot).toHaveBeenLastCalledWith(kind);
    }
    expect(screen.getByTestId('settings-root-0').textContent).toContain(
      'No instances found in this folder.',
    );
    expect(screen.getByTestId('settings-root-1').textContent).not.toContain('No instances');
    await user.click(screen.getByTestId('settings-remove-root-1'));
    expect(props.onRemoveLauncherRoot).toHaveBeenCalledExactlyOnceWith('prism', '/data/prism');
    expect(props.save).not.toHaveBeenCalled();
  });

  it('reports a failure to add a folder', async () => {
    renderLocations({
      onAddLauncherRoot: vi.fn(async () => {
        throw new Error('Not a Prism Launcher folder');
      }),
    });
    await userEvent.setup().click(screen.getByTestId('settings-add-prism'));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Not a Prism Launcher folder',
    );
  });

  it('says when nothing was found, and when the chosen target is missing', () => {
    renderLocations({ locations: [], manualRoots: [], targetMissing: true });
    expect(screen.getByTestId('settings-locations-empty').textContent).toMatch(
      /No game locations found/,
    );
    expect(screen.getByTestId('settings-target-missing').textContent).toMatch(
      /chosen instance was not found/,
    );
  });

  it('keeps the official folder override without the new props', async () => {
    renderDialog(VIEW);
    expect(screen.queryByTestId('settings-locations')).toBeNull();
    expect(screen.queryByTestId('settings-add-prism')).toBeNull();
    expect(screen.getByTestId('settings-minecraft-folder')).toBeTruthy();
    await waitFor(() => expect(toggle().disabled).toBe(false));
  });
});

describe('minecraftSummary', () => {
  const status = { minecraftDir: null, installed: [], chosen: null, cache: null };

  it('names the jar source, even without an official folder', () => {
    expect(minecraftSummary('1.0-test', status)).toBe('No Minecraft folder found.');
    expect(minecraftSummary('1.0-test', status, 'Prism Launcher — 1.0-test')).toBe(
      'Minecraft 1.0-test is installed; its vanilla assets are not extracted yet. Client jar: Prism Launcher — 1.0-test.',
    );
  });

  it('enables Extract when only a launcher jar is known', async () => {
    renderLocations({ status, jarSource: 'CurseForge — 1.0-test' });
    expect(screen.getByTestId('settings-status').textContent).toContain(
      'Client jar: CurseForge — 1.0-test.',
    );
    await waitFor(() =>
      expect((screen.getByTestId('settings-extract') as HTMLButtonElement).disabled).toBe(false),
    );
  });
});
