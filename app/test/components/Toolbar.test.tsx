// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, Toast, Tooltip } from 'radix-ui';
import { useState } from 'react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  describeInstallTarget,
  type InstallTargetOption,
} from '../../src/renderer/src/components/install-target';
import {
  BUSY_REASON,
  historyTip,
  NO_MOD_REASON,
  saveLook,
  Toolbar,
  type ToolbarProps,
} from '../../src/renderer/src/components/Toolbar';
import { connectPlay } from '../../src/renderer/src/store/play-store';
import { fakeBridge, fakeSession } from './play-fixtures';
import { chooseInToolbarMenu, entryDisabled, openToolbarMenu } from './toolbar-menu';

let disconnect: (() => void) | null = null;

afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = null;
});

function props(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    hasProject: true,
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    redoLabel: undefined,
    saveDisabledReason: null,
    canAddElement: true,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddElement: vi.fn(),
    ...overrides,
  };
}

/** Every handler the toolbar offers, each a mock. */
function everything(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return props({
    canUndo: true,
    canRedo: true,
    undoLabel: 'Add a thing',
    redoLabel: 'Add a thing',
    onNewFromStarter: vi.fn(),
    onExamples: vi.fn(),
    onNewWithAi: vi.fn(),
    onHome: vi.fn(),
    onShare: vi.fn(),
    onFirstMod: vi.fn(),
    onWhatsNew: vi.fn(),
    onGuide: vi.fn(),
    onTryIt: vi.fn(),
    onSearch: vi.fn(),
    recentProjects: [{ root: '/p/beta', name: 'Beta', openedAt: '2', exists: true }],
    onOpenRecent: vi.fn(),
    onRemoveRecent: vi.fn(),
    onClearRecent: vi.fn(),
    onRecentMenuOpen: vi.fn(),
    onImportAssets: vi.fn(),
    onExportZip: vi.fn(),
    onExportDataZip: vi.fn(),
    onExportCombined: vi.fn(),
    onExportMap: vi.fn(),
    onExportStructures: vi.fn(),
    onExportSchematics: vi.fn(),
    pluginExports: [
      { id: 'greetings', label: 'Greetings into a folder…', reason: null, onSelect: vi.fn() },
    ],
    onExportFabricJar: vi.fn(),
    onExportJavaProject: vi.fn(),
    onTestInMinecraft: vi.fn(),
    onInstall: vi.fn(),
    onInstallData: vi.fn(),
    onModpacks: vi.fn(),
    onSettings: vi.fn(),
    onAiHelper: vi.fn(),
    onCreator: vi.fn(),
    ...overrides,
  });
}

function renderToolbar(p: ToolbarProps) {
  return render(
    <Tooltip.Provider>
      <Toolbar {...p} />
    </Tooltip.Provider>,
  );
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

/** The test id of each direct child of the row (a wrapper's control, for wrapped ones). */
function rowIds(): string[] {
  const row = screen.getByRole('toolbar');
  return Array.from(row.children)
    .filter(
      (child) => child.getAttribute('role') !== 'separator' && !child.hasAttribute('aria-hidden'),
    )
    .map(
      (child) =>
        child.getAttribute('data-testid') ??
        child.querySelector('[data-testid]')?.getAttribute('data-testid') ??
        '?',
    );
}

describe('the row (ADR 0131 D1 to D4)', () => {
  it('holds Home, Undo, Redo, Save, Try it, Share my mod, the search, AI helper, Help and More', () => {
    renderToolbar(everything());
    expect(rowIds()).toEqual([
      'toolbar-home',
      'toolbar-undo',
      'toolbar-redo',
      'toolbar-save',
      'toolbar-try-it',
      'toolbar-share',
      'toolbar-search',
      'toolbar-ai-helper',
      'toolbar-help',
      'toolbar-more',
    ]);
  });

  it('puts the Play controls after Try it, and has at most 12 controls with them as one', async () => {
    disconnect = connectPlay(fakeSession(), fakeBridge(), {
      notify: () => {},
      showProblems: () => {},
    });
    renderToolbar(everything());
    await screen.findByTestId('play-controls');
    const ids = rowIds();
    expect(ids.indexOf('play-controls')).toBe(ids.indexOf('toolbar-try-it') + 1);
    expect(ids.indexOf('toolbar-share')).toBe(ids.indexOf('play-controls') + 1);
    expect(ids.length).toBeLessThanOrEqual(12);
  });

  it('never wraps: the row is nowrap, and Try it and Share my mod keep their words for 1200 px up', () => {
    renderToolbar(everything());
    const row = screen.getByRole('toolbar', { name: 'Mod' });
    expect(row.className).toContain('flex-nowrap');
    expect(row.className).not.toContain('flex-wrap ');
    for (const [id, words] of [
      ['toolbar-try-it', 'Try it'],
      ['toolbar-share', 'Share my mod'],
    ] as const) {
      const control = screen.getByTestId(id);
      expect(control.getAttribute('aria-label')).toBe(words);
      const label = control.querySelector('span');
      expect(label?.textContent).toBe(words);
      expect(label?.className).toContain('min-[1200px]:inline');
    }
    // Below 1000 px the search field's words hide and it is an icon button with the same name.
    const search = screen.getByTestId('toolbar-search');
    expect(search.getAttribute('aria-label')).toBe('Search or make anything');
    for (const part of search.querySelectorAll('span, kbd')) {
      expect(part.className).toContain('min-[1000px]:inline');
    }
  });

  it('shows the secondary buttons as icons named by their labels', () => {
    renderToolbar(everything());
    for (const name of ['Home', 'Undo', 'Redo', 'AI helper', 'Help']) {
      const found = button(name);
      expect(found.getAttribute('aria-label')).toBe(name);
      expect(found.textContent).toBe('');
    }
    expect(button('Save').textContent).toBe('Save');
    expect(screen.getByTestId('toolbar-more').textContent).toBe('More');
  });

  it('enables Save with a mod and reports clicks', async () => {
    const p = props({ canUndo: true, undoLabel: 'Add element' });
    renderToolbar(p);
    expect(button('Save').disabled).toBe(false);
    expect(button('Redo').disabled).toBe(true);
    const user = userEvent.setup();
    await user.click(button('Save'));
    await user.click(button('Undo'));
    expect(p.onSave).toHaveBeenCalledOnce();
    expect(p.onUndo).toHaveBeenCalledOnce();
  });

  it('is a labelled toolbar', () => {
    renderToolbar(props());
    expect(screen.getByRole('toolbar', { name: 'Mod' })).toBeTruthy();
  });
});

describe('Undo and Redo tips', () => {
  it('say what they undo in plain words, never an id', () => {
    expect(historyTip('undo', 'Edit demo:ruby_sword')).toMatch(
      /^Undo Edit ruby sword \((Ctrl|Cmd)\+Z\)$/,
    );
    expect(historyTip('redo', 'Edit demo:ruby_sword')).toMatch(
      /^Redo Edit ruby sword \((Ctrl|Cmd)\+Shift\+Z\)$/,
    );
    expect(historyTip('undo', undefined)).toBe('Nothing to undo');
    expect(historyTip('redo', undefined)).toBe('Nothing to redo');
  });
});

describe('Save and unsaved changes (ADR 0131 D2)', () => {
  it('is accented while there are unsaved changes, quiet when everything is saved', () => {
    expect(saveLook(props({ unsaved: true })).tip).toMatch(
      /^Save your mod \((Ctrl|Cmd)\+S\)\. You have changes that are not saved\.$/,
    );
    expect(saveLook(props({ unsaved: true })).className).toContain('border-accent');
    expect(saveLook(props({ unsaved: false }))).toEqual({
      tip: 'Everything is saved.',
      className: 'text-muted',
    });
    expect(saveLook(props()).tip).toMatch(/^Save your mod \((Ctrl|Cmd)\+S\)$/);
    expect(saveLook(props()).className).toBe('');
    expect(saveLook(props({ unsaved: true, saveDisabledReason: 'No mod is open.' })).tip).toBe(
      'No mod is open.',
    );
  });

  it('stays enabled both ways with a mod open', () => {
    for (const unsaved of [true, false]) {
      renderToolbar(props({ unsaved }));
      const save = screen.getByTestId('toolbar-save') as HTMLButtonElement;
      expect(save.disabled).toBe(false);
      expect(save.classList.contains('border-accent')).toBe(unsaved);
      cleanup();
    }
  });

  it('is disabled without a mod', () => {
    renderToolbar(
      props({ hasProject: false, canAddElement: false, saveDisabledReason: 'No mod is open.' }),
    );
    expect(button('Save').disabled).toBe(true);
  });
});

type Handler = keyof ToolbarProps;

/**
 * Every action the toolbar had before ADR 0131, by its old test id: where it is now (`row`, or
 * the menu path to it) and the handler it runs.
 */
const MOVED: readonly (readonly [string, readonly string[] | 'row', string, Handler])[] = [
  ['toolbar-home', 'row', 'toolbar-home', 'onHome'],
  ['toolbar-new-project', [], 'toolbar-new-project', 'onNew'],
  ['toolbar-new-blank', [], 'toolbar-new-project', 'onNew'],
  ['toolbar-new-from-starter', [], 'toolbar-new-from-starter', 'onNewFromStarter'],
  ['toolbar-examples', [], 'toolbar-examples', 'onExamples'],
  ['toolbar-new-with-ai', [], 'toolbar-new-with-ai', 'onNewWithAi'],
  ['toolbar-open-project', [], 'toolbar-open-project', 'onOpen'],
  ['toolbar-open-menu', ['toolbar-open-menu'], 'recent-project-0', 'onOpenRecent'],
  ['toolbar-save', 'row', 'toolbar-save', 'onSave'],
  ['toolbar-undo', 'row', 'toolbar-undo', 'onUndo'],
  ['toolbar-redo', 'row', 'toolbar-redo', 'onRedo'],
  ['toolbar-creator', [], 'toolbar-creator', 'onCreator'],
  ['toolbar-add-element', [], 'toolbar-add-element', 'onAddElement'],
  ['toolbar-import-assets', [], 'toolbar-import-assets', 'onImportAssets'],
  ['toolbar-export-zip', ['toolbar-export-menu'], 'export-resource-zip', 'onExportZip'],
  ['export-resource-zip', ['toolbar-export-menu'], 'export-resource-zip', 'onExportZip'],
  ['export-data-zip', ['toolbar-export-menu'], 'export-data-zip', 'onExportDataZip'],
  ['export-combined', ['toolbar-export-menu'], 'export-combined', 'onExportCombined'],
  ['export-fabric-jar', ['toolbar-export-menu'], 'export-fabric-jar', 'onExportFabricJar'],
  ['export-java-project', ['toolbar-export-menu'], 'export-java-project', 'onExportJavaProject'],
  ['export-structures', ['toolbar-export-menu'], 'export-structures', 'onExportStructures'],
  ['export-schematics', ['toolbar-export-menu'], 'export-schematics', 'onExportSchematics'],
  ['export-test-in-minecraft', [], 'export-test-in-minecraft', 'onTestInMinecraft'],
  ['install-resource', ['toolbar-install-menu'], 'install-resource', 'onInstall'],
  ['install-data', ['toolbar-install-menu'], 'install-data', 'onInstallData'],
  ['toolbar-share', 'row', 'toolbar-share', 'onShare'],
  ['toolbar-try-it', 'row', 'toolbar-try-it', 'onTryIt'],
  ['toolbar-ai-helper', 'row', 'toolbar-ai-helper', 'onAiHelper'],
  ['toolbar-help-first-mod', ['toolbar-help'], 'toolbar-help-first-mod', 'onFirstMod'],
  ['toolbar-help-examples', ['toolbar-help'], 'toolbar-help-examples', 'onExamples'],
  ['toolbar-help-whats-new', ['toolbar-help'], 'toolbar-help-whats-new', 'onWhatsNew'],
  ['toolbar-settings', [], 'toolbar-settings', 'onSettings'],
];

describe('every former toolbar action is in the row or the More menu', () => {
  it.each(MOVED)('%s', async (_old, where, id, handler) => {
    const p = everything();
    renderToolbar(p);
    if (where === 'row') {
      await userEvent.setup().click(screen.getByTestId(id));
    } else if (where[0] === 'toolbar-help') {
      await userEvent.setup().click(screen.getByTestId('toolbar-help'));
      fireEvent.click(await screen.findByTestId(id));
    } else {
      await chooseInToolbarMenu(...where, id);
    }
    expect(p[handler] as Mock).toHaveBeenCalledOnce();
  });

  it('the search field opens the search', async () => {
    const p = everything();
    renderToolbar(p);
    await userEvent.setup().click(screen.getByTestId('toolbar-search'));
    expect(p.onSearch).toHaveBeenCalledWith('');
  });

  it('a plugin exporter is in the Export submenu after the structure exports', async () => {
    const p = everything();
    renderToolbar(p);
    await openToolbarMenu('toolbar-export-menu');
    const ids = screen.getAllByRole('menuitem').map((entry) => entry.getAttribute('data-testid'));
    expect(ids.indexOf('export-plugin-greetings')).toBe(ids.indexOf('export-schematics') + 1);
    fireEvent.click(screen.getByTestId('export-plugin-greetings'));
    expect(p.pluginExports?.[0]?.onSelect).toHaveBeenCalledOnce();
  });

  it('the old split arrows and the Export .zip button are gone', () => {
    renderToolbar(everything());
    for (const id of [
      'toolbar-export-zip',
      'toolbar-new-menu',
      'toolbar-new-blank',
      'export-more',
    ]) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
  });

  it('lists More in its order, with the entries that need nothing else enabled', async () => {
    renderToolbar(everything());
    await openToolbarMenu();
    const ids = screen.getAllByRole('menuitem').map((entry) => entry.getAttribute('data-testid'));
    expect(ids).toEqual([
      'toolbar-new-project',
      'toolbar-new-from-starter',
      'toolbar-examples',
      'toolbar-new-with-ai',
      'toolbar-open-project',
      'toolbar-open-menu',
      'toolbar-creator',
      'toolbar-add-element',
      'toolbar-import-assets',
      'toolbar-export-menu',
      'toolbar-install-menu',
      'export-test-in-minecraft',
      'toolbar-modpacks',
      'toolbar-settings',
    ]);
    expect(screen.getByTestId('toolbar-new-project').textContent).toMatch(
      /^New mod…(Ctrl|Cmd)\+Shift\+N$/,
    );
    expect(screen.getByTestId('toolbar-open-project').textContent).toMatch(
      /^Open a mod…(Ctrl|Cmd)\+O$/,
    );
    expect(screen.getByTestId('toolbar-add-element').textContent).toMatch(
      /^Add from the full list…(Ctrl|Cmd)\+N$/,
    );
  });
});

describe('reasons on disabled entries', () => {
  it('without a mod, the entries that need one say "Open a mod first."', async () => {
    renderToolbar(
      everything({
        hasProject: false,
        canAddElement: false,
        saveDisabledReason: 'No mod is open.',
        fabricJarExportDisabledReason: 'No project is open.',
      }),
    );
    expect(NO_MOD_REASON).toBe('Open a mod first.');
    await openToolbarMenu();
    for (const id of [
      'toolbar-creator',
      'toolbar-add-element',
      'toolbar-import-assets',
      'toolbar-export-menu',
      'toolbar-install-menu',
      'export-test-in-minecraft',
    ]) {
      expect(entryDisabled(id), id).toBe(true);
      expect(screen.getByTestId(`${id}-reason`).textContent, id).toBe(NO_MOD_REASON);
    }
    for (const id of ['toolbar-new-project', 'toolbar-open-project', 'toolbar-settings']) {
      expect(entryDisabled(id), id).toBe(false);
    }
  });

  it('while an export runs, the exports, installs and Test in Minecraft say so', async () => {
    renderToolbar(everything({ exporting: true }));
    expect(BUSY_REASON).toBe('An export is running.');
    await openToolbarMenu();
    for (const id of ['toolbar-export-menu', 'toolbar-install-menu', 'export-test-in-minecraft']) {
      expect(screen.getByTestId(`${id}-reason`).textContent, id).toBe(BUSY_REASON);
    }
    expect((screen.getByTestId('toolbar-share') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows why the Fabric mod jar, the eject and Test in Minecraft are off', async () => {
    const reason = 'Fix 2 errors first (see Problems).';
    renderToolbar(everything({ fabricJarExportDisabledReason: reason }));
    await openToolbarMenu();
    expect(screen.getByTestId('export-test-in-minecraft-reason').textContent).toBe(reason);
    expect(entryDisabled('export-test-in-minecraft')).toBe(true);
    await userEvent.setup().click(screen.getByTestId('toolbar-export-menu'));
    for (const id of ['export-fabric-jar', 'export-java-project']) {
      expect(screen.getByTestId(`${id}-reason`).textContent).toBe(reason);
      expect(screen.getByTestId(id).getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('shows why the structure exports and a plugin export are off', async () => {
    const reason = 'Fix 1 error first (see Problems).';
    renderToolbar(
      everything({
        structureExportDisabledReason: reason,
        pluginExports: [
          { id: 'blocked', label: 'Blocked into a folder…', reason, onSelect: vi.fn() },
        ],
      }),
    );
    await openToolbarMenu('toolbar-export-menu');
    for (const id of ['export-structures', 'export-schematics', 'export-plugin-blocked']) {
      expect(screen.getByTestId(`${id}-reason`).textContent, id).toBe(reason);
      expect(entryDisabled(id), id).toBe(true);
    }
  });

  it('says "mod", never "project", in its words', async () => {
    renderToolbar(
      everything({
        hasProject: false,
        canAddElement: false,
        saveDisabledReason: 'No mod is open.',
        recentProjects: [{ root: '/p/alpha', name: 'Alpha', openedAt: '1', exists: false }],
      }),
    );
    const words = (): string[] =>
      Array.from(document.querySelectorAll('*')).flatMap((node) => [
        node.childNodes.length > 0
          ? Array.from(node.childNodes)
              .filter((child) => child.nodeType === 3)
              .map((child) => child.textContent ?? '')
              .join(' ')
          : '',
        node.getAttribute('aria-label') ?? '',
        node.getAttribute('title') ?? '',
      ]);
    await openToolbarMenu('toolbar-open-menu');
    expect(words().filter((text) => /project/i.test(text))).toEqual([]);
  });
});

describe('the optional entries', () => {
  it('render nothing while their props are absent', async () => {
    renderToolbar(props({ onExportZip: vi.fn() }));
    await openToolbarMenu('toolbar-export-menu');
    for (const id of ['export-map', 'toolbar-modpacks', 'toolbar-new-with-ai', 'toolbar-creator']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    cleanup();
    renderToolbar(props());
    await userEvent.setup().click(screen.getByTestId('toolbar-help'));
    expect(screen.queryByTestId('toolbar-help-guide')).toBeNull();
    expect(screen.queryByTestId('toolbar-try-it')).toBeNull();
    expect(screen.queryByTestId('toolbar-search')).toBeNull();
    expect(screen.queryByTestId('toolbar-ai-helper')).toBeNull();
  });

  it('Export as a map…, Modpacks… and Guide… run their handlers', async () => {
    const p = everything();
    renderToolbar(p);
    await openToolbarMenu('toolbar-export-menu');
    expect(screen.getByTestId('export-map').textContent).toBe('Export as a map…');
    fireEvent.click(screen.getByTestId('export-map'));
    expect(p.onExportMap).toHaveBeenCalledOnce();
    await openToolbarMenu();
    expect(screen.getByTestId('toolbar-modpacks').textContent).toBe('Modpacks…');
    fireEvent.click(screen.getByTestId('toolbar-modpacks'));
    expect(p.onModpacks).toHaveBeenCalledOnce();
    await userEvent.setup().click(screen.getByTestId('toolbar-help'));
    expect(screen.getByTestId('toolbar-help-guide').textContent).toBe('Guide…');
    fireEvent.click(screen.getByTestId('toolbar-help-guide'));
    expect(p.onGuide).toHaveBeenCalledOnce();
  });
});

describe('the keyboard', () => {
  it('arrow keys move along the row', async () => {
    renderToolbar(everything());
    const user = userEvent.setup();
    screen.getByTestId('toolbar-home').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId('toolbar-undo'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByTestId('toolbar-more'));
  });

  it('reaches every More entry and the submenus by keyboard alone', async () => {
    renderToolbar(everything());
    const user = userEvent.setup();
    screen.getByTestId('toolbar-more').focus();
    await user.keyboard('{Enter}');
    const seen: string[] = [];
    await waitFor(() => expect(document.activeElement?.getAttribute('data-testid')).toBeTruthy());
    for (let step = 0; step < 14; step += 1) {
      seen.push(document.activeElement?.getAttribute('data-testid') ?? '?');
      await user.keyboard('{ArrowDown}');
    }
    expect(new Set(seen)).toEqual(
      new Set([
        'toolbar-new-project',
        'toolbar-new-from-starter',
        'toolbar-examples',
        'toolbar-new-with-ai',
        'toolbar-open-project',
        'toolbar-open-menu',
        'toolbar-creator',
        'toolbar-add-element',
        'toolbar-import-assets',
        'toolbar-export-menu',
        'toolbar-install-menu',
        'export-test-in-minecraft',
        'toolbar-modpacks',
        'toolbar-settings',
      ]),
    );
    for (const [sub, first] of [
      ['toolbar-open-menu', 'recent-project-0'],
      ['toolbar-export-menu', 'export-resource-zip'],
      ['toolbar-install-menu', 'install-resource'],
    ] as const) {
      screen.getByTestId(sub).focus();
      await user.keyboard('{ArrowRight}');
      const entry = await screen.findByTestId(first);
      await waitFor(() => expect(document.activeElement).toBe(entry));
      await user.keyboard('{ArrowLeft}');
      await waitFor(() => expect(screen.queryByTestId(first)).toBeNull());
    }
  });
});

describe('Recent mods', () => {
  it('lists recent mods, with missing ones disabled', async () => {
    const onOpenRecent = vi.fn();
    const onRemoveRecent = vi.fn();
    const onClearRecent = vi.fn();
    const onRecentMenuOpen = vi.fn();
    renderToolbar(
      props({
        recentProjects: [
          { root: '/p/beta', name: 'Beta', openedAt: '2', exists: true },
          { root: '/p/alpha', name: 'Alpha', openedAt: '1', exists: false },
        ],
        onOpenRecent,
        onRemoveRecent,
        onClearRecent,
        onRecentMenuOpen,
      }),
    );
    await openToolbarMenu('toolbar-open-menu');
    expect(onRecentMenuOpen).toHaveBeenCalledOnce();
    const beta = screen.getByTestId('recent-project-0');
    expect(beta.textContent).toContain('Beta');
    expect(beta.textContent).toContain('/p/beta');
    const alpha = screen.getByTestId('recent-project-1');
    expect(alpha.textContent).toContain('Alpha (missing)');
    expect(alpha.hasAttribute('data-disabled')).toBe(true);
    expect(screen.queryByTestId('recent-project-remove-0')).toBeNull();
    expect(screen.getByTestId('recent-project-remove-1').getAttribute('aria-label')).toBe(
      'Remove Alpha from recent mods',
    );
    fireEvent.click(screen.getByTestId('recent-project-remove-1'));
    expect(onRemoveRecent).toHaveBeenCalledWith('/p/alpha');
    await chooseInToolbarMenu('toolbar-open-menu', 'recent-project-0');
    expect(onOpenRecent).toHaveBeenCalledWith('/p/beta');
    await chooseInToolbarMenu('toolbar-open-menu', 'recent-projects-clear');
    expect(onClearRecent).toHaveBeenCalledOnce();
  });

  it('says so when there are no recent mods', async () => {
    renderToolbar(props({ recentProjects: [], onClearRecent: vi.fn() }));
    await openToolbarMenu('toolbar-open-menu');
    expect(screen.getByTestId('recent-projects-empty').textContent).toBe('No recent mods');
    expect(screen.getByTestId('recent-projects-clear').hasAttribute('data-disabled')).toBe(true);
  });
});

const TARGETS: InstallTargetOption[] = [
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
    id: 'prism:My-Instance',
    launcher: 'prism',
    displayName: 'My Instance',
    mcVersion: '9.9-msm-test',
    loader: { kind: 'neoforge', version: '1.2.3' },
    gameDir: '/data/prism/instances/My-Instance/minecraft',
    warnings: [],
    problems: [],
    installable: true,
  },
];

describe('describeInstallTarget', () => {
  it('names the launcher, instance and version', () => {
    expect(describeInstallTarget(TARGETS[1] ?? null)).toBe(
      'Install to: Prism Launcher — My Instance (MC 9.9-msm-test)',
    );
    expect(describeInstallTarget(TARGETS[0] ?? null)).toBe('Install to: Official launcher');
    expect(describeInstallTarget(null)).toBe('No install target: choose one in Settings');
  });
});

describe('Toolbar install target', () => {
  it('shows the target sentence and switches targets through the submenu', async () => {
    const onChooseInstallTarget = vi.fn();
    const p = props({
      installTarget: TARGETS[0] ?? null,
      installTargets: TARGETS,
      onChooseInstallTarget,
      onInstall: vi.fn(),
      onInstallData: vi.fn(),
    });
    renderToolbar(p);
    const user = await openToolbarMenu('toolbar-install-menu');
    const target = screen.getByTestId('install-target');
    expect(target.textContent).toBe('Install to: Official launcher');
    expect(target.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByTestId('install-resource')).toBeTruthy();
    expect(screen.getByTestId('install-data')).toBeTruthy();
    // By keyboard: a pointer leaving a sub trigger closes its submenu in happy-dom.
    screen.getByTestId('install-target-change').focus();
    await user.keyboard('{ArrowRight}');
    const item = await screen.findByTestId('install-target-prism:My-Instance');
    expect(item.getAttribute('aria-label')).toBe(
      'Install to Prism Launcher — My Instance (MC 9.9-msm-test), NeoForge 1.2.3',
    );
    expect(screen.getByTestId('install-target-official:default').getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(item);
    expect(onChooseInstallTarget).toHaveBeenCalledExactlyOnceWith('prism:My-Instance');
  });

  it('reaches the submenu and its targets with the keyboard', async () => {
    const onChooseInstallTarget = vi.fn();
    renderToolbar(
      props({
        installTarget: null,
        installTargets: TARGETS,
        onChooseInstallTarget,
        onInstall: vi.fn(),
      }),
    );
    const user = userEvent.setup();
    screen.getByTestId('toolbar-more').focus();
    await user.keyboard('{Enter}');
    screen.getByTestId('toolbar-install-menu').focus();
    await user.keyboard('{ArrowRight}');
    expect((await screen.findByTestId('install-target')).textContent).toBe(
      'No install target: choose one in Settings',
    );
    const change = screen.getByTestId('install-target-change');
    change.focus();
    await user.keyboard('{ArrowRight}');
    const first = await screen.findByTestId('install-target-official:default');
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByTestId('install-target-prism:My-Instance'));
    await user.keyboard('{Enter}');
    expect(onChooseInstallTarget).toHaveBeenCalledExactlyOnceWith('prism:My-Instance');
  });

  it('keeps the Install submenu unchanged without a target', async () => {
    renderToolbar(props({ onInstall: vi.fn() }));
    await openToolbarMenu('toolbar-install-menu');
    expect(screen.queryByTestId('install-target')).toBeNull();
    expect(screen.queryByTestId('install-target-change')).toBeNull();
    expect(screen.getByTestId('install-resource')).toBeTruthy();
  });
});

describe('the Export submenu', () => {
  it('lists the packs, the jar, the eject and then the structure exports, with no third level', async () => {
    const p = everything();
    renderToolbar(p);
    await openToolbarMenu('toolbar-export-menu');
    const ids = screen.getAllByRole('menuitem').map((entry) => entry.getAttribute('data-testid'));
    const exports = ids.slice(ids.indexOf('export-resource-zip'));
    expect(exports).toEqual([
      'export-resource-zip',
      'export-data-zip',
      'export-combined',
      'export-fabric-jar',
      'export-java-project',
      'export-map',
      'export-structures',
      'export-schematics',
      'export-plugin-greetings',
    ]);
    expect(screen.getByTestId('export-structures').textContent).toBe(
      'Structures (.nbt) into a folder…',
    );
    expect(screen.getByTestId('export-fabric-jar').textContent).toBe('Fabric mod (.jar)…');
    expect(screen.getByTestId('export-java-project').textContent).toBe(
      'Fabric Java project (eject)…',
    );
  });
});

describe('Toolbar Try it (ADR 0085 D13)', () => {
  it('shows Try it, enabled only with a mod', async () => {
    for (const open of [true, false]) {
      const onTryIt = vi.fn();
      renderToolbar(props({ onTryIt, tryItOpen: open }));
      const tryIt = screen.getByTestId('toolbar-try-it') as HTMLButtonElement;
      expect(tryIt.disabled).toBe(false);
      expect(tryIt.getAttribute('aria-pressed')).toBe(String(open));
      await userEvent.setup().click(tryIt);
      expect(onTryIt).toHaveBeenCalledOnce();
      cleanup();
      renderToolbar(props({ onTryIt, hasProject: false }));
      expect((screen.getByTestId('toolbar-try-it') as HTMLButtonElement).disabled).toBe(true);
      cleanup();
    }
  });
});

describe('the search field (ADR 0124 D10, B667)', () => {
  it('shows the field, opening on a click, Down or a typed letter', async () => {
    const onSearch = vi.fn();
    renderToolbar(props({ onSearch, searchPlaceholder: 'Search or make anything' }));
    const field = screen.getByTestId('toolbar-search');
    expect(field.getAttribute('aria-label')).toBe('Search or make anything');
    expect(field.getAttribute('aria-haspopup')).toBe('dialog');
    expect(field.getAttribute('aria-keyshortcuts')).toMatch(/^(Control|Meta)\+K$/);
    await userEvent.setup().click(field);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'r' });
    fireEvent.keyDown(field, { key: 'c', ctrlKey: true });
    expect(onSearch.mock.calls).toEqual([[''], [''], ['r']]);
  });
});

describe('a toast that appears while a toolbar menu is open (B701, the launchers-path flake)', () => {
  /** A status toast that the test shows while the menu is open, as `StatusToast` does. */
  function ToastLater(props: { show: boolean }) {
    return (
      <>
        {props.show && (
          <Toast.Root duration={60_000}>
            <Toast.Description>Packs now install to Prism Launcher.</Toast.Description>
          </Toast.Root>
        )}
        <Toast.Viewport />
      </>
    );
  }

  function withToast(p: ToolbarProps, show: boolean) {
    return (
      <Toast.Provider>
        <Tooltip.Provider>
          <Toolbar {...p} />
        </Tooltip.Provider>
        <ToastLater show={show} />
      </Toast.Provider>
    );
  }

  it('Escape still closes the menu, so the next press on its button opens it', async () => {
    const p = props({ installTarget: TARGETS[0] ?? null, onInstall: vi.fn() });
    const view = render(withToast(p, false));
    const user = await openToolbarMenu('toolbar-install-menu');
    expect(screen.getByTestId('install-target')).toBeTruthy();
    // The message of a target change lands after the menu opened: a newer dismissable layer.
    view.rerender(withToast(p, true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('install-target')).toBeNull());
    const more = screen.getByTestId('toolbar-more');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    // The next press opens the menu again (before the fix it toggled the open menu shut).
    await user.click(more);
    expect(screen.getByTestId('toolbar-install-menu')).toBeTruthy();
  });
});

describe('a dialog opened from More by keyboard keeps the focus (B701)', () => {
  function WithDialog() {
    const [open, setOpen] = useState(false);
    return (
      <Tooltip.Provider>
        <Toolbar {...props({ onSettings: () => setOpen(true) })} />
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Content data-testid="test-dialog" aria-describedby={undefined}>
              <Dialog.Title>Settings</Dialog.Title>
              <input data-testid="test-dialog-field" />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </Tooltip.Provider>
    );
  }

  it('Escape then closes the dialog, not a tooltip of the More button', async () => {
    render(<WithDialog />);
    const user = userEvent.setup();
    screen.getByTestId('toolbar-more').focus();
    await user.keyboard('{Enter}');
    screen.getByTestId('toolbar-settings').focus();
    await user.keyboard('{Enter}');
    const field = await screen.findByTestId('test-dialog-field');
    // Radix hands focus back to the menu's button a moment after the menu closes.
    await new Promise((settle) => setTimeout(settle, 50));
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('test-dialog')).toBeNull());
  });

  it('focus goes back to More when the entry opened nothing', async () => {
    const onNew = vi.fn();
    renderToolbar(props({ onNew }));
    const user = userEvent.setup();
    const more = screen.getByTestId('toolbar-more');
    more.focus();
    await user.keyboard('{Enter}');
    screen.getByTestId('toolbar-new-project').focus();
    await user.keyboard('{Enter}');
    expect(onNew).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});

describe('More opened again straight after it closed (B701)', () => {
  it('stays open: the closed menu does not take the focus back late', async () => {
    renderToolbar(everything());
    const more = screen.getByTestId('toolbar-more');
    more.focus();
    fireEvent.keyDown(more, { key: 'Enter' });
    await screen.findByTestId('toolbar-settings');
    // Escape closes it; before Radix hands the focus back (a timer), More opens again.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByTestId('toolbar-settings')).toBeNull();
    more.focus();
    fireEvent.keyDown(more, { key: 'Enter' });
    expect(screen.getByTestId('toolbar-settings')).toBeTruthy();
    await new Promise((settle) => setTimeout(settle, 50));
    expect(screen.queryByTestId('toolbar-settings')).not.toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });
});
