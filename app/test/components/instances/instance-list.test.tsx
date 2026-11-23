// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readinessOf, thingPurpose } from '../../../src/renderer/src/components/instances/words';
import { SettingsDialog } from '../../../src/renderer/src/components/SettingsDialog';
import type {
  AppSettingsPatch,
  AppSettingsView,
  InstancesPlatform,
  ManagedThing,
} from '../../../src/shared/platform';
import { expectPlain } from '../plain-sweep';
import { planFor } from './plans';

const THINGS: ManagedThing[] = [
  {
    id: 'instance:/prism/instances/MCSuperMods Test (26.3)',
    kind: 'test',
    name: 'MCSuperMods Test (26.3)',
    owner: null,
    mcVersion: '26.3',
    loader: { kind: 'fabric', version: '0.20.1' },
    launcher: 'prism',
    path: '/prism/instances/MCSuperMods Test (26.3)',
    eulaAccepted: null,
    running: false,
  },
  {
    id: 'instance:/prism/instances/MCSuperMods Plain (26.4-snapshot-7)',
    kind: 'plain',
    name: 'MCSuperMods Plain (26.4-snapshot-7)',
    owner: null,
    mcVersion: '26.4-snapshot-7',
    loader: { kind: 'none', version: null },
    launcher: 'prism',
    path: '/prism/instances/MCSuperMods Plain (26.4-snapshot-7)',
    eulaAccepted: null,
    running: false,
  },
  {
    id: 'instance:/prism/instances/MCSuperMods Pack Cosy Pack (26.3)',
    kind: 'pack',
    name: 'MCSuperMods Pack Cosy Pack (26.3)',
    owner: 'Cosy Pack',
    mcVersion: '26.3',
    loader: { kind: 'fabric', version: '0.20.1' },
    launcher: 'prism',
    path: '/prism/instances/MCSuperMods Pack Cosy Pack (26.3)',
    eulaAccepted: null,
    running: false,
  },
  {
    id: 'server:/home/me/.msm/servers/ruby_mod-26.3',
    kind: 'server',
    name: 'ruby_mod-26.3',
    owner: 'ruby_mod',
    mcVersion: '26.3',
    loader: { kind: 'fabric', version: '0.20.1' },
    launcher: null,
    path: '/home/me/.msm/servers/ruby_mod-26.3',
    eulaAccepted: true,
    running: true,
  },
];

function setup(
  things: ManagedThing[] = THINGS,
  settings: AppSettingsView['instances'] = { ask: 'first-time', madeByItself: ['test'] },
) {
  let list = [...things];
  const instances = {
    list: vi.fn(async () => list),
    remove: vi.fn(async (id: string) => {
      list = list.filter((thing) => thing.id !== id);
      return { ok: true as const };
    }),
    showInFolder: vi.fn(async () => ({ ok: true as const })),
  } satisfies Pick<InstancesPlatform, 'list' | 'remove' | 'showInFolder'>;
  const save = vi.fn(async (_patch: AppSettingsPatch) => {});
  const view: AppSettingsView = {
    minecraftDir: null,
    updates: { autoCheck: true },
    detectedMinecraftDir: null,
    ...(settings === undefined ? {} : { instances: settings }),
  };
  render(
    <SettingsDialog
      mcVersion="26.3"
      status={null}
      progress={null}
      load={async () => view}
      save={save}
      browse={async () => null}
      extract={async () => null}
      onClose={vi.fn()}
      instances={instances as unknown as InstancesPlatform}
    />,
  );
  return { instances, save };
}

beforeEach(() => {
  window.msmMoreOptionsOpen = false;
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.msmMoreOptionsOpen = true;
});

describe('Settings > Instances MSM made (ADR 0133 D5)', () => {
  it('lists each thing with its purpose in plain words, paths only under More options', async () => {
    setup();
    const section = await screen.findByTestId('settings-instances');
    await waitFor(() => expect(screen.getByTestId('settings-instance-3')).toBeTruthy());
    expect(screen.getByTestId('settings-instance-0-purpose').textContent).toBe(
      'Play and Test in Minecraft run your mod here.',
    );
    expect(screen.getByTestId('settings-instance-1-purpose').textContent).toBe(
      'Opens games and maps the way players without mods have them.',
    );
    expect(screen.getByTestId('settings-instance-2-purpose').textContent).toBe(
      'Tests the modpack Cosy Pack on its own.',
    );
    const server = screen.getByTestId('settings-instance-3');
    expect(server.textContent).toContain('Server for ruby_mod (Minecraft 26.3)');
    expect(server.textContent).toContain('Running now');
    expect(server.textContent).toContain('Stop the server before removing it.');
    expect((within(server).getByText('Remove') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('settings-instance-1').textContent).toContain('no mod loader');
    expect(section.textContent).not.toContain('/prism/');
    expect(section.textContent).not.toContain('instance:');
    expectPlain(section);
    await userEvent.setup().click(screen.getByTestId('more-options-settings-instances'));
    const more = screen.getByTestId('settings-instances-more');
    expect(more.textContent).toContain('/prism/instances/MCSuperMods Test (26.3)');
    expect(more.textContent).toContain('server:/home/me/.msm/servers/ruby_mod-26.3');
  });

  it('shows a folder', async () => {
    const { instances } = setup();
    await userEvent.setup().click(await screen.findByTestId('settings-instance-0-show'));
    expect(instances.showInFolder).toHaveBeenCalledWith(THINGS[0]?.id);
  });

  it('removes only after the question, then lists again and says so', async () => {
    const { instances } = setup();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('settings-instance-1-remove'));
    expect(instances.remove).not.toHaveBeenCalled();
    const confirm = screen.getByTestId('settings-instance-1-confirm');
    expect(confirm.textContent).toContain(
      'Move MCSuperMods Plain (26.4-snapshot-7) to the recycle bin?',
    );
    // Keep it: nothing happens.
    await user.click(screen.getByTestId('settings-instance-1-remove-no'));
    expect(instances.remove).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('settings-instance-1-remove'));
    await user.click(screen.getByTestId('settings-instance-1-remove-yes'));
    expect(instances.remove).toHaveBeenCalledWith(THINGS[1]?.id);
    await waitFor(() =>
      expect(screen.getByTestId('settings-instances-notice').textContent).toBe(
        'MCSuperMods Plain (26.4-snapshot-7) was moved to the recycle bin.',
      ),
    );
    expect(instances.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('settings-instance-3')).toBeNull();
    expect(screen.getByTestId('settings-instance-1').textContent).toContain('Cosy Pack');
  });

  it("says main's refusal in its words", async () => {
    const { instances } = setup();
    instances.remove.mockResolvedValueOnce({
      ok: false,
      code: 'not-found',
      message: 'MCSuperMods did not make this, or it is gone, so MCSuperMods leaves it alone.',
    } as never);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('settings-instance-0-remove'));
    await user.click(screen.getByTestId('settings-instance-0-remove-yes'));
    expect((await screen.findByTestId('settings-instances-error')).textContent).toContain(
      'leaves it alone',
    );
  });

  it('works with the keyboard alone: Remove, Keep it, Remove, Move to the recycle bin', async () => {
    const { instances } = setup();
    const user = userEvent.setup();
    const remove = await screen.findByTestId('settings-instance-0-remove');
    remove.focus();
    await user.keyboard('{Enter}');
    // The safe answer has the focus.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('settings-instance-0-remove-no')),
    );
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('settings-instance-0-remove')),
    );
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('settings-instance-0-remove-no')),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByTestId('settings-instance-0-remove-yes'));
    await user.keyboard('{Enter}');
    expect(instances.remove).toHaveBeenCalledWith(THINGS[0]?.id);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('settings-instances-notice')),
    );
  });

  it('says when MCSuperMods has made none yet', async () => {
    setup([]);
    expect((await screen.findByTestId('settings-instances-empty')).textContent).toContain(
      'has not made any yet',
    );
    expectPlain(screen.getByTestId('settings-instances'));
  });

  it('stores Ask before making an instance, and Ask again', async () => {
    const { save } = setup();
    const select = (await screen.findByTestId('settings-instances-ask')) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(select.value).toBe('first-time');
    expect(screen.getByTestId('settings-instances-made-by-itself').textContent).toBe(
      'Made without asking now: the test instance.',
    );
    const user = userEvent.setup();
    await user.selectOptions(select, 'always');
    expect(save).toHaveBeenLastCalledWith({
      instances: { ask: 'always', madeByItself: ['test'] },
    });
    expect(screen.queryByTestId('settings-instances-ask-again')).toBeNull();
    await user.selectOptions(select, 'first-time');
    await user.click(screen.getByTestId('settings-instances-ask-again'));
    expect(save).toHaveBeenLastCalledWith({ instances: { ask: 'first-time', madeByItself: [] } });
    expect(screen.queryByTestId('settings-instances-made-by-itself')).toBeNull();
  });

  it('is hidden without the instances service', () => {
    render(
      <SettingsDialog
        mcVersion="26.3"
        status={null}
        progress={null}
        load={async () => ({
          minecraftDir: null,
          updates: { autoCheck: true },
          detectedMinecraftDir: null,
        })}
        save={vi.fn(async () => {})}
        browse={async () => null}
        extract={async () => null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('settings-instances')).toBeNull();
  });
});

describe('words for things and for your own instances', () => {
  it('names a map and a pack by their names', () => {
    expect(thingPurpose({ ...(THINGS[2] as ManagedThing), kind: 'map', owner: 'Sky Race' })).toBe(
      'Opens the map Sky Race.',
    );
  });

  it('rates your own instances for a mod and for a game without mods', () => {
    const mod = planFor('mc-26.3', 'test').plan.recipe;
    const plain = planFor('mc-26.3', 'plain').plan.recipe;
    const base = {
      id: 'x',
      launcher: 'prism' as const,
      displayName: 'Mine',
      mcVersion: '26.3',
      loader: null,
      gameDir: '/g',
      warnings: [],
      problems: [],
      installable: true,
    };
    expect(readinessOf(base, mod)).toMatchObject({ usable: false });
    expect(readinessOf(base, plain)).toEqual({ usable: true, ready: true, text: 'Ready.' });
    const fabric = { ...base, loader: { kind: 'fabric', version: '0.20.1' } };
    expect(readinessOf(fabric, mod)).toMatchObject({ usable: true, ready: true });
    expect(readinessOf(fabric, plain)).toMatchObject({ usable: true, ready: false });
    expect(readinessOf({ ...fabric, loader: { kind: 'neoforge', version: '1' } }, mod).text).toBe(
      'It uses NeoForge 1, and your mod needs Fabric.',
    );
    expect(readinessOf({ ...fabric, launcher: 'curseforge' }, mod)).toMatchObject({
      usable: true,
      ready: false,
    });
    expect(readinessOf({ ...base, launcher: 'official', mcVersion: null }, mod).usable).toBe(false);
    expect(readinessOf({ ...base, problems: ['Unreadable.'], installable: false }, plain)).toEqual({
      usable: false,
      ready: false,
      text: 'Unreadable.',
    });
  });
});
