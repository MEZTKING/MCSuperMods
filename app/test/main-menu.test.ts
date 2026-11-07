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

describe('File menu', () => {
  it('offers "Export Java Project…" after "Export Fabric Mod Jar…"', () => {
    installMenu();
    const template = templates.at(-1) as {
      label?: string;
      submenu?: { label?: string; click?: () => void }[];
    }[];
    const file = template.find((entry) => entry.label === 'File')?.submenu ?? [];
    const labels = file.map((item) => item.label);
    const jar = labels.indexOf('Export Fabric Mod Jar…');
    expect(jar).toBeGreaterThan(-1);
    expect(labels[jar + 1]).toBe('Export Java Project…');
    file[jar + 1]?.click?.();
    expect(sent.at(-1)).toBe('exportJavaProject');
  });

  it('offers "Upgrade Project Target…" right after "Open Recent" (ADR 0037 D4)', () => {
    installMenu();
    const template = templates.at(-1) as {
      label?: string;
      submenu?: { label?: string; click?: () => void }[];
    }[];
    const file = template.find((entry) => entry.label === 'File')?.submenu ?? [];
    const labels = file.map((item) => item.label);
    const recent = labels.indexOf('Open Recent');
    expect(recent).toBeGreaterThan(-1);
    expect(labels[recent + 1]).toBe('Upgrade Project Target…');
    file[recent + 1]?.click?.();
    expect(sent.at(-1)).toBe('upgradeTarget');
  });
});

type MenuEntry = {
  label?: string;
  accelerator?: string;
  submenu?: MenuEntry[];
  click?: () => void;
};

describe('AI helper and Creator menu items', () => {
  it('offers View > "AI Helper" with CmdOrCtrl+Shift+A (ADR 0041 D8)', () => {
    installMenu();
    const template = templates.at(-1) as MenuEntry[];
    const view = template.find((entry) => entry.label === 'View')?.submenu ?? [];
    const item = view.find((entry) => entry.label === 'AI Helper');
    expect(item?.accelerator).toBe('CmdOrCtrl+Shift+A');
    item?.click?.();
    expect(sent.at(-1)).toBe('toggleAiHelper');
  });

  it('reserves File > "Create…" after "New Project from Starter…" for the Creator', () => {
    installMenu();
    const template = templates.at(-1) as MenuEntry[];
    const file = template.find((entry) => entry.label === 'File')?.submenu ?? [];
    const labels = file.map((item) => item.label);
    const starter = labels.indexOf('New Project from Starter…');
    expect(starter).toBeGreaterThan(-1);
    expect(labels[starter + 1]).toBe('Create…');
    file[starter + 1]?.click?.();
    expect(sent.at(-1)).toBe('creator');
  });
});

describe('Open Recent menu', () => {
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
      'Clear Recent Projects',
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
    expect(empty[0]).toEqual({ label: 'No recent projects', enabled: false });
    expect(empty[2]).toMatchObject({ label: 'Clear Recent Projects', enabled: false });
  });
});

describe('File > More Exports plugin exporters', () => {
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
