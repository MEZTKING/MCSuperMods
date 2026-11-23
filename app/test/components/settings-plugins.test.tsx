// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginsSection, SettingsDialog } from '../../src/renderer/src/components/SettingsDialog';
import type { ExternalPluginState } from '../../src/renderer/src/plugins/external-plugins';

afterEach(cleanup);

const plugins: ExternalPluginState[] = [
  { id: 'sample.greetings', name: 'Greetings', version: '1.0.0', state: 'loaded', problems: [] },
  {
    id: 'broken',
    name: 'broken',
    version: '',
    state: 'refused',
    problems: [
      { severity: 'error', code: 'plugin.manifest-invalid', message: 'msm-plugin.json /id: bad.' },
    ],
  },
  {
    id: 'slow.plugin',
    name: 'Slow',
    version: '0.2.0',
    state: 'failed',
    problems: [{ severity: 'error', code: 'plugin.timeout', message: 'Did not start.' }],
  },
];

describe('Settings > Plugins', () => {
  it('lists every plugin folder with its state and problems', () => {
    render(<PluginsSection plugins={plugins} onOpenFolder={async () => undefined} />);
    const section = screen.getByTestId('settings-plugins');
    expect(within(section).getByRole('heading', { name: 'Plugins' })).toBeTruthy();
    const loaded = screen.getByTestId('plugin-sample.greetings');
    expect(loaded.textContent).toBe('Greetings1.0.0sample.greetingsLoaded');
    expect(screen.getByTestId('plugin-broken-state').textContent).toBe('Refused');
    expect(screen.getByTestId('plugin-broken').textContent).toContain(
      'plugin.manifest-invalid: msm-plugin.json /id: bad.',
    );
    expect(screen.getByTestId('plugin-slow.plugin-state').textContent).toBe('Failed');
    expect(section.textContent).toContain('Changes take effect after restarting MCSuperMods.');
    expect(section.textContent).toContain('install them only from sources you trust');
  });

  it("says whether a plugin's search words are in the search (ADR 0124 D13)", () => {
    render(
      <PluginsSection
        plugins={[
          { ...(plugins[0] as ExternalPluginState), search: { state: 'included', lines: 3 } },
          {
            id: 'other.words',
            name: 'Other words',
            version: '1.0.0',
            state: 'loaded',
            search: { state: 'left-out', lines: 0 },
            problems: [
              {
                severity: 'warning',
                code: 'plugin.search-data-refused',
                message: 'other.words loads without its search words.',
              },
              {
                severity: 'warning',
                code: 'search.not-own',
                message: '/entries/0/opens/id: weapon is not one of its own things.',
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByTestId('plugin-sample.greetings-search').textContent).toBe(
      'Search finds it by its own words (3 lines).',
    );
    expect(screen.getByTestId('plugin-other.words-state').textContent).toBe('Loaded');
    expect(screen.getByTestId('plugin-other.words-search').textContent).toBe(
      'Loaded without its search words: they did not pass the check.',
    );
    expect(screen.getByTestId('plugin-other.words').textContent).toContain(
      'search.not-own: /entries/0/opens/id',
    );
  });

  it('opens the plugins folder and shows a failure', async () => {
    const open = vi.fn(async () => {
      throw new Error('The plugins folder could not be opened: no shell');
    });
    render(<PluginsSection plugins={[]} onOpenFolder={open} />);
    expect(screen.getByTestId('settings-plugins-empty').textContent).toContain(
      'No plugins installed.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open plugins folder' }));
    expect(open).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no shell'));
  });

  it('is part of the Settings dialog', async () => {
    render(
      <SettingsDialog
        mcVersion="1.0-test"
        status={null}
        progress={null}
        load={async () => ({
          minecraftDir: null,
          updates: { autoCheck: true },
          detectedMinecraftDir: null,
        })}
        save={async () => undefined}
        browse={async () => null}
        extract={async () => null}
        onClose={vi.fn()}
        plugins={plugins}
      />,
    );
    expect(screen.getByTestId('plugin-sample.greetings')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Open plugins folder' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
