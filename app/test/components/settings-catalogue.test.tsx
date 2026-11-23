// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_COMMAND_IDS,
  BUILT_IN_COMMANDS,
  paletteCommands,
} from '../../src/renderer/src/commands/built-in-commands';
import type { InstallTargetOption } from '../../src/renderer/src/components/install-target';
import {
  SETTING_MARK_MS,
  SettingsDialog,
  type SettingsDialogProps,
} from '../../src/renderer/src/components/SettingsDialog';
import { SETTINGS_CATALOGUE } from '../../src/renderer/src/components/settings-catalogue';
import { EMPTY_HISTORY } from '../../src/renderer/src/search/history';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import type {
  AppSettingsView,
  InstancesPlatform,
  WorldBackupList,
  WorldBackupsPlatform,
} from '../../src/shared/platform';
import { fakeAi } from './ai-fixtures';
import { fakePictures } from './ai-pictures-fake';

const VIEW: AppSettingsView = {
  minecraftDir: null,
  updates: { autoCheck: true },
  backups: { beforeInstall: true, keep: 5 },
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
];

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
  ],
};

const backups = (): WorldBackupsPlatform => ({
  list: vi.fn(async () => LIST),
  restore: vi.fn(async () => ({ dir: 'x', path: '/x' })),
  openFolder: vi.fn(async () => {}),
});

const instances = {
  list: vi.fn(async () => [
    {
      id: 'instance:/prism/instances/MCSuperMods Test (26.3)',
      kind: 'test' as const,
      name: 'MCSuperMods Test (26.3)',
      owner: null,
      mcVersion: '26.3',
      loader: { kind: 'fabric' as const, version: '0.20.1' },
      launcher: 'prism' as const,
      path: '/prism/instances/MCSuperMods Test (26.3)',
      eulaAccepted: null,
      running: false,
    },
  ]),
  remove: vi.fn(async () => ({ ok: true as const })),
  showInFolder: vi.fn(async () => ({ ok: true as const })),
} as unknown as InstancesPlatform;

/** The dialog with every section and every line a control can sit in. */
function renderFull(extra: Partial<SettingsDialogProps> = {}) {
  return render(
    <SettingsDialog
      mcVersion="1.0-test"
      status={{ minecraftDir: '/home/me/.minecraft', chosen: null, cache: null } as never}
      progress={null}
      load={async () => VIEW}
      save={vi.fn(async () => {})}
      browse={async () => null}
      extract={async () => null}
      onClose={vi.fn()}
      locations={LOCATIONS}
      selectedId="official:default"
      onSelectTarget={vi.fn()}
      onAddLauncherRoot={vi.fn(async () => {})}
      manualRoots={[{ kind: 'prism', path: '/opt/prism', found: 0 }]}
      onRemoveLauncherRoot={vi.fn()}
      plugins={[]}
      onOpenPluginsFolder={vi.fn(async () => {})}
      ai={fakeAi()}
      aiPictures={fakePictures()}
      worldBackups={backups()}
      instances={instances}
      {...extra}
    />,
  );
}

/** Waits until every section has loaded (the backups list, the AI and AI pictures settings). */
async function loaded(): Promise<HTMLElement> {
  const dialog = screen.getByTestId('settings-dialog');
  await waitFor(() => {
    expect(dialog.querySelector('[data-setting="backups-restore"]')).not.toBeNull();
    expect(dialog.querySelector('[data-testid="settings-instance-0"]')).not.toBeNull();
    expect((screen.getByTestId('settings-instances-ask') as HTMLSelectElement).disabled).toBe(
      false,
    );
    expect((screen.getByTestId('settings-ai-model') as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByTestId('settings-ai-pictures-status').textContent).not.toBe('Checking…');
    expect((screen.getByTestId('settings-auto-update') as HTMLInputElement).disabled).toBe(false);
  });
  return dialog;
}

const words = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** The label a line shows: its `data-setting-label` element, else its first label or legend. */
function lineLabel(line: Element): string {
  const label = line.querySelector('[data-setting-label]') ?? line.querySelector('label, legend');
  return words(label?.textContent);
}

/** The section heading a line sits under: the last `h3` before it or inside it. */
function lineSection(dialog: Element, line: Element): string {
  let section = '';
  for (const heading of dialog.querySelectorAll('h3')) {
    const before = heading.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (before !== 0 || line.contains(heading)) section = words(heading.textContent);
  }
  return section;
}

beforeEach(() => {
  usePreferences.setState({ rememberSearches: true, searchHistory: EMPTY_HISTORY });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the settings catalogue (B662)', () => {
  it('has one well-formed line per id', () => {
    const ids = SETTINGS_CATALOGUE.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const line of SETTINGS_CATALOGUE) {
      expect(line.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(line.title.trim()).toBe(line.title);
      // One plain sentence: a capital, one full stop at the end, within the length limit.
      expect(line.sentence).toMatch(/^[A-Z].*\.$/);
      expect(line.sentence).not.toMatch(/\.\s/);
      expect(line.sentence.length).toBeLessThanOrEqual(200);
      expect(line.sentence).not.toMatch(/\b(color|armor|favorite|center|gray)\b/i);
      expect(line.words?.length ?? 0).toBeGreaterThan(0);
      for (const word of line.words ?? []) {
        expect(word.length).toBeLessThanOrEqual(64);
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  for (const open of [true, false]) {
    it(`matches the dialog's lines and controls with More options ${open ? 'open' : 'closed'}`, async () => {
      window.msmMoreOptionsOpen = open;
      globalThis.localStorage.clear();
      renderFull();
      const dialog = await loaded();
      const expected = SETTINGS_CATALOGUE.filter((line) => open || line.more !== true);
      const lines = [...dialog.querySelectorAll('[data-setting]')];
      const shown = lines.map((line) => line.getAttribute('data-setting'));
      // Every catalogue line is a line of the dialog, and every line of the dialog is in it.
      expect([...shown].sort()).toEqual(expected.map((line) => line.id).sort());
      for (const entry of expected) {
        const line = dialog.querySelector(`[data-setting="${entry.id}"]`);
        expect(line, entry.id).not.toBeNull();
        if (line === null) continue;
        expect(lineLabel(line), entry.id).toBe(entry.title);
        expect(lineSection(dialog, line), entry.id).toBe(entry.section);
        expect(
          line.querySelector('input, select, textarea, button'),
          `${entry.id} holds a control`,
        ).not.toBeNull();
      }
      // Every control of the dialog sits in a catalogue line (Close only closes it).
      for (const control of dialog.querySelectorAll('input, select, textarea, button')) {
        if (control.getAttribute('data-testid') === 'settings-close') continue;
        // A More options toggle opens lines; it is not a setting itself (ADR 0130).
        if (control.getAttribute('data-testid')?.startsWith('more-options-') === true) continue;
        expect(
          control.closest('[data-setting]'),
          `${control.outerHTML.slice(0, 120)} is in a settings line`,
        ).not.toBeNull();
      }
      window.msmMoreOptionsOpen = true;
    });
  }
});

describe('Search settings (ADR 0124 D11)', () => {
  it('turns Remember my searches off and on', async () => {
    usePreferences.setState({
      searchHistory: { chosen: [{ id: 'flow:x', count: 1 }], searches: ['ruby'] },
    });
    renderFull();
    const box = screen.getByRole('checkbox', { name: 'Remember my searches' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    const user = userEvent.setup();
    await user.click(box);
    expect(usePreferences.getState().rememberSearches).toBe(false);
    expect(usePreferences.getState().searchHistory).toEqual(EMPTY_HISTORY);
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(usePreferences.getState().rememberSearches).toBe(true);
  });

  it('clears the searches and says so, keeping the setting', async () => {
    usePreferences.setState({ searchHistory: { chosen: [], searches: ['ruby sword'] } });
    renderFull();
    const clear = screen.getByRole('button', { name: 'Clear my searches' }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    await userEvent.setup().click(clear);
    expect(usePreferences.getState().searchHistory).toEqual(EMPTY_HISTORY);
    expect(usePreferences.getState().rememberSearches).toBe(true);
    expect(screen.getByTestId('settings-searches-cleared').textContent).toBe(
      'Your searches are forgotten.',
    );
    expect(clear.disabled).toBe(true);
  });
});

describe('SettingsDialog focusSetting', () => {
  const scrolls: { line: string | null; options: unknown }[] = [];
  beforeEach(() => {
    scrolls.length = 0;
    Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
      scrolls.push({ line: this.getAttribute('data-setting'), options });
    } as Element['scrollIntoView'];
  });

  const reducedMotion = (reduce: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));

  it('scrolls to the line, focuses its control and marks it for a moment', () => {
    reducedMotion(false);
    vi.useFakeTimers();
    renderFull({ focusSetting: 'showcase-clips' });
    const line = screen
      .getByTestId('settings-dialog')
      .querySelector('[data-setting="showcase-clips"]');
    expect(line?.getAttribute('data-marked')).toBe('true');
    expect(line?.classList.contains('outline-accent')).toBe(true);
    expect(line?.classList.contains('transition-[outline-color]')).toBe(true);
    expect(scrolls[0]).toEqual({
      line: 'showcase-clips',
      options: { block: 'center', behavior: 'smooth' },
    });
    expect(document.activeElement).toBe(screen.getByTestId('settings-showcase-clips'));
    act(() => {
      vi.advanceTimersByTime(SETTING_MARK_MS);
    });
    expect(line?.hasAttribute('data-marked')).toBe(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(line?.classList.contains('outline-2')).toBe(false);
  });

  it('jumps without motion under reduced motion', () => {
    reducedMotion(true);
    renderFull({ focusSetting: 'remember-searches' });
    const line = screen
      .getByTestId('settings-dialog')
      .querySelector('[data-setting="remember-searches"]');
    expect(line?.getAttribute('data-marked')).toBe('true');
    expect(line?.classList.contains('transition-[outline-color]')).toBe(false);
    expect(scrolls[0]).toEqual({
      line: 'remember-searches',
      options: { block: 'center', behavior: 'auto' },
    });
  });

  it('finds a line that appears once its section loads, and focuses it once enabled', async () => {
    reducedMotion(false);
    renderFull({ focusSetting: 'backups-restore' });
    await waitFor(() =>
      expect(
        screen
          .getByTestId('settings-dialog')
          .querySelector('[data-setting="backups-restore"]')
          ?.getAttribute('data-marked'),
      ).toBe('true'),
    );
    expect(scrolls.some((scroll) => scroll.line === 'backups-restore')).toBe(true);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('backup-restore-0-0');
  });

  it('stops following the line once the user scrolls', async () => {
    reducedMotion(false);
    renderFull({ focusSetting: 'plugins-folder' });
    const first = scrolls.length;
    expect(first).toBeGreaterThan(0);
    const dialog = screen.getByTestId('settings-dialog');
    dialog.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    await loaded();
    expect(scrolls.filter((scroll) => scroll.line === 'plugins-folder')).toHaveLength(first);
  });
});

describe('built-in command words (B662)', () => {
  it('gives every command one sentence and extra words', () => {
    // 53 with "Search everything" (B667); 55 with More ideas and Your mods (ADR 0128 D6); 52
    // without the four mode commands (ADR 0130 D1).
    expect(BUILT_IN_COMMAND_IDS).toHaveLength(52);
    for (const id of BUILT_IN_COMMAND_IDS) {
      const command = BUILT_IN_COMMANDS[id];
      expect(command.sentence, id).toMatch(/^[A-Z].*\.$/);
      expect(command.sentence, id).not.toMatch(/\.\s/);
      expect(command.sentence.length, id).toBeLessThanOrEqual(200);
      expect(command.sentence, id).not.toMatch(/\b(color|armor|favorite|center|gray)\b/i);
      expect(command.words.length, id).toBeGreaterThan(0);
      for (const word of command.words) {
        expect(word.length).toBeLessThanOrEqual(64);
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  it('keeps the palette showing titles only', () => {
    const handlers = Object.fromEntries(BUILT_IN_COMMAND_IDS.map((id) => [id, vi.fn()]));
    const commands = paletteCommands(handlers, [], { modKey: 'Ctrl', onError: vi.fn() });
    expect(commands.map((command) => command.title)).toEqual(
      BUILT_IN_COMMAND_IDS.map((id) => BUILT_IN_COMMANDS[id].title),
    );
    for (const command of commands) {
      expect(Object.keys(command)).not.toContain('sentence');
      expect(Object.keys(command)).not.toContain('words');
    }
  });
});
