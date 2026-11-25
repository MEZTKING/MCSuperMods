import { describe, expect, it, vi } from 'vitest';

const sent: unknown[] = [];
const templates: unknown[] = [];
vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => [
      { webContents: { send: (_channel: string, command: unknown) => sent.push(command) } },
    ],
  },
  Menu: {
    buildFromTemplate: (template: unknown) => {
      templates.push(template);
      return {};
    },
    setApplicationMenu: () => {},
  },
}));

const { installMenu, pluginExportItems, recentLabel, recentSubmenu, shortenPath } = await import(
  '../src/main/menu'
);
const { isMenuPluginExports, isMenuPluginExport } = await import('../src/shared/ipc-channels');

type MenuEntry = {
  label?: string;
  accelerator?: string;
  role?: string;
  type?: string;
  submenu?: MenuEntry[];
  click?: () => void;
};

/** The menu as installed last. */
function latest(): MenuEntry[] {
  installMenu();
  return templates.at(-1) as MenuEntry[];
}

/** One top-level menu's entries. */
function menu(name: string): MenuEntry[] {
  return latest().find((entry) => entry.label === name)?.submenu ?? [];
}

/** Every entry of the menu, submenus included. */
function everyEntry(entries: readonly MenuEntry[]): MenuEntry[] {
  return entries.flatMap((entry) => [entry, ...everyEntry(entry.submenu ?? [])]);
}

/** The labels of a menu, `—` for a separator. */
function labelsOf(entries: readonly MenuEntry[]): (string | undefined)[] {
  return entries.map((entry) => (entry.type === 'separator' ? '—' : (entry.label ?? entry.role)));
}

describe("The menu bar speaks the toolbar's words (ADR 0131 D1, B711)", () => {
  it("lays out File in the order of the toolbar's More menu", () => {
    expect(labelsOf(menu('File'))).toEqual([
      'New mod…',
      'Start from a ready-made mod…',
      'Examples…',
      'New mod with the AI helper…',
      'Surprise me…',
      '—',
      'Open a mod…',
      'Recent mods',
      'Save',
      '—',
      'Make something…',
      'Bring in pictures or sounds…',
      'Bring in a building…',
      'Bring in a Blockbench model…',
      'Turn a photo into a picture…',
      '—',
      'Export',
      'Install',
      'Test in Minecraft…',
      'Modpacks…',
      'Move to another Minecraft version…',
      '—',
      'Play',
      'Reload in the game',
      'Try it',
      '—',
      'Settings…',
      '—',
      'Quit',
    ]);
    const file = menu('File');
    const exports = file.find((entry) => entry.label === 'Export')?.submenu ?? [];
    expect(labelsOf(exports)).toEqual([
      'Resource pack (.zip)…',
      'Data pack (.zip)…',
      'Both packs into a folder…',
      'Fabric mod (.jar)…',
      'Fabric Java project (eject)…',
      'Export as a map…',
      '—',
      'Structures (.nbt) into a folder…',
      'Structures as Sponge schematics (.schem)…',
    ]);
    const install = file.find((entry) => entry.label === 'Install')?.submenu ?? [];
    expect(labelsOf(install)).toEqual([
      'Resource pack to the resourcepacks folder',
      'Data pack to a world…',
    ]);
  });

  it("has the toolbar's Help menu, then the Wishlist and updates; Edit and View in plain words", () => {
    expect(labelsOf(menu('Help'))).toEqual([
      'Your first mod…',
      'Examples…',
      'What’s new…',
      'Guide…',
      'Wishlist…',
      '—',
      'Check for updates…',
    ]);
    expect(labelsOf(menu('Edit')).slice(0, 7)).toEqual([
      'Undo',
      'Redo',
      'Redo',
      '—',
      'Rename…',
      'Command palette',
      'Search…',
    ]);
    expect(labelsOf(menu('View'))).toEqual([
      'Home',
      'Try it',
      'AI helper',
      '—',
      'Reload window',
      'Developer tools',
    ]);
  });

  it('says mod, never "Project", "Element" or "Assets", in sentence case', () => {
    const labels = everyEntry(latest())
      .map((entry) => entry.label)
      .filter((label): label is string => label !== undefined);
    for (const word of ['Project', 'Element', 'Assets']) {
      expect(labels.filter((label) => label.includes(word))).toEqual([]);
    }
    // Sentence case: after the first word only names keep their capitals.
    const names = /^(Minecraft|Blockbench|Fabric|Java|Sponge|AI)\b/;
    const titleCased = labels.filter((label) =>
      label
        .split(' ')
        .slice(1)
        .some((word) => /^[A-Z]/.test(word) && !names.test(word)),
    );
    expect(titleCased).toEqual([]);
  });

  it('keeps every accelerator and its command as before', () => {
    const commands: Record<string, unknown> = {};
    for (const entry of everyEntry(latest())) {
      if (entry.accelerator === undefined) continue;
      // An entry with a role and no click is run by Electron: record the role.
      sent.push(entry.role ?? null);
      entry.click?.();
      commands[`${entry.label} ${entry.accelerator}`] = sent.at(-1);
    }
    expect(commands).toEqual({
      'New mod… CmdOrCtrl+Shift+N': 'new',
      'Open a mod… CmdOrCtrl+O': 'open',
      'Save CmdOrCtrl+S': 'save',
      'Play F5': 'play',
      'Reload in the game CmdOrCtrl+R': 'reloadGame',
      'Undo CmdOrCtrl+Z': 'undo',
      'Redo CmdOrCtrl+Shift+Z': 'redo',
      'Redo Ctrl+Y': 'redo',
      'Rename… F2': 'renameElement',
      'Command palette CmdOrCtrl+Shift+P': 'commandPalette',
      'Search… CmdOrCtrl+K': 'search',
      'Try it F6': 'tryIt',
      'AI helper CmdOrCtrl+Shift+A': 'toggleAiHelper',
      'Reload window CmdOrCtrl+Shift+R': 'reload',
    });
  });

  it("sends each entry's command, unchanged", () => {
    const wanted: Record<string, string> = {
      'Start from a ready-made mod…': 'newProjectFromStarter',
      'New mod with the AI helper…': 'newWithAi',
      'Surprise me…': 'surpriseMe',
      'Make something…': 'creator',
      'Bring in pictures or sounds…': 'importAssets',
      'Bring in a building…': 'importStructure',
      'Bring in a Blockbench model…': 'importBlockbench',
      'Turn a photo into a picture…': 'pictureToTexture',
      'Resource pack (.zip)…': 'exportResourcePack',
      'Data pack (.zip)…': 'exportDataPack',
      'Both packs into a folder…': 'exportCombined',
      'Fabric mod (.jar)…': 'exportFabricJar',
      'Fabric Java project (eject)…': 'exportJavaProject',
      'Export as a map…': 'exportMap',
      'Structures (.nbt) into a folder…': 'exportStructures',
      'Structures as Sponge schematics (.schem)…': 'exportSchematics',
      'Resource pack to the resourcepacks folder': 'installResourcePack',
      'Data pack to a world…': 'installDataPack',
      'Test in Minecraft…': 'testInMinecraft',
      'Modpacks…': 'modpacks',
      'Move to another Minecraft version…': 'upgradeTarget',
      'Settings…': 'settings',
      Home: 'home',
      'Your first mod…': 'firstMod',
      'Examples…': 'examples',
      'What’s new…': 'whatsNew',
      'Guide…': 'guide',
      'Wishlist…': 'wishlist',
      'Check for updates…': 'checkForUpdates',
    };
    const entries = everyEntry(latest());
    for (const [label, command] of Object.entries(wanted)) {
      const entry = entries.find((candidate) => candidate.label === label);
      expect(entry, label).toBeDefined();
      entry?.click?.();
      expect(sent.at(-1), label).toBe(command);
    }
  });

  it('offers Edit > "Search…" showing CmdOrCtrl+K that the renderer handles (ADR 0124 SQ9)', () => {
    const search = menu('Edit').find((entry) => entry.label === 'Search…') as
      | (MenuEntry & { registerAccelerator?: boolean })
      | undefined;
    expect(search?.registerAccelerator).toBe(false);
  });

  it('has F6 once, and the window reload off F5 and CmdOrCtrl+R (ADR 0084 D6, ADR 0085 D13)', () => {
    const keys = everyEntry(latest()).map((entry) => entry.accelerator);
    expect(keys.filter((key) => key === 'F6')).toEqual(['F6']);
    expect(keys.filter((key) => key === 'F5' || key === 'CmdOrCtrl+R')).toEqual([
      'F5',
      'CmdOrCtrl+R',
    ]);
    expect(menu('File').find((entry) => entry.label === 'Try it')?.accelerator).toBeUndefined();
  });

  it('has no mode entries (ADR 0130 D1)', () => {
    const labels = everyEntry(latest()).map((entry) => entry.label);
    expect(labels.filter((label) => label?.endsWith(' mode') || label?.endsWith(' Mode'))).toEqual(
      [],
    );
  });
});

describe('Recent mods menu', () => {
  it('shortens long paths in the middle and keeps short ones', () => {
    expect(shortenPath('/home/a/ruby')).toBe('/home/a/ruby');
    const long = '/home/someone/Documents/Minecraft/projects/mods/2026/november/ruby_tools';
    const short = shortenPath(long, 40);
    expect(short.length).toBeLessThanOrEqual(40);
    expect(short.startsWith('/home/…/')).toBe(true);
    expect(short.endsWith('/ruby_tools')).toBe(true);
    const windows = 'C:\\Users\\someone\\Documents\\Minecraft\\projects\\mods\\ruby_tools';
    expect(shortenPath(windows, 30)).toBe('C:\\…\\projects\\mods\\ruby_tools');
    // The last segment is kept even when it alone is too long.
    expect(shortenPath(`/a/${'x'.repeat(80)}`, 20)).toBe(`/a/…/${'x'.repeat(80)}`);
  });

  it('labels entries with the name and path, escaping mnemonics', () => {
    expect(recentLabel({ name: 'Rock & Roll', root: '/p/rock' })).toBe('Rock && Roll — /p/rock');
  });

  it('lists entries, then a separator and Clear; an empty list says so', () => {
    const opened: string[] = [];
    let cleared = 0;
    const items = recentSubmenu(
      [
        { root: '/p/b', name: 'B', openedAt: '2' },
        { root: '/p/a', name: 'A', openedAt: '1' },
      ],
      (root) => opened.push(root),
      () => {
        cleared += 1;
      },
    );
    expect(items.map((item) => item.label ?? item.type)).toEqual([
      'B — /p/b',
      'A — /p/a',
      'separator',
      'Clear list',
    ]);
    const click = (index: number) => (items[index]?.click as (() => void) | undefined)?.();
    click(1);
    click(3);
    expect(opened).toEqual(['/p/a']);
    expect(cleared).toBe(1);

    const empty = recentSubmenu(
      [],
      () => {},
      () => {},
    );
    expect(empty[0]).toEqual({ label: 'No recent mods', enabled: false });
    expect(empty[2]).toMatchObject({ label: 'Clear list', enabled: false });
  });
});

describe('File > Export plugin exporters', () => {
  it('lists plugin exporters after a separator, disabled ones greyed, & kept literal', () => {
    const chosen: string[] = [];
    expect(pluginExportItems([], (id) => chosen.push(id))).toEqual([]);
    const items = pluginExportItems(
      [
        { id: 'a', label: 'Lists & tables into a folder…', enabled: true },
        { id: 'b', label: 'Other into a folder…', enabled: false },
      ],
      (id) => chosen.push(id),
    );
    expect(items[0]).toEqual({ type: 'separator' });
    expect(items[1]).toMatchObject({ label: 'Lists && tables into a folder…', enabled: true });
    expect(items[2]).toMatchObject({ enabled: false });
    (items[1] as { click: () => void }).click();
    expect(chosen).toEqual(['a']);
  });

  it('checks the payloads both ways', () => {
    expect(isMenuPluginExports([{ id: 'a', label: 'A', enabled: true }])).toBe(true);
    expect(isMenuPluginExports([{ id: '', label: 'A', enabled: true }])).toBe(false);
    expect(isMenuPluginExports([{ id: 'a', label: 'A' }])).toBe(false);
    expect(isMenuPluginExports('a')).toBe(false);
    expect(isMenuPluginExport({ id: 'a' })).toBe(true);
    expect(isMenuPluginExport({ id: 3 })).toBe(false);
  });
});
