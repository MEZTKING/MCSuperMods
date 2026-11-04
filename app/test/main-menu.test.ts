import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
}));

const { recentLabel, recentSubmenu, shortenPath } = await import('../src/main/menu');

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
