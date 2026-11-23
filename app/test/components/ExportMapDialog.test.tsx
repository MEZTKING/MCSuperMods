// @vitest-environment happy-dom
import { targetById } from '@msm/targets';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExportMapDialog, {
  gameWorldOf,
  mapExportMessage,
  mapMrpackIndex,
} from '../../src/renderer/src/components/ExportMapDialog';
import type { MapContent } from '../../src/renderer/src/session/project-session';
import type { MapExportRequest, MapsPlatform } from '../../src/shared/platform';

afterEach(cleanup);

const target = targetById('mc-26.3')?.target;
if (target === undefined) throw new Error('mc-26.3 is missing');

const sources = [
  {
    id: 'msm-play',
    name: 'MCSuperMods Test (26.3)',
    managed: true,
    worlds: [
      { dir: 'msm-test-ruby', name: 'MCSuperMods test', lastModified: '2026-11-23T10:00:00.000Z' },
      { dir: 'msm-game-ruby', name: 'MCSuperMods game', lastModified: '2026-11-22T10:00:00.000Z' },
    ],
  },
  {
    id: 'official:default',
    name: 'Official launcher',
    managed: false,
    worlds: [{ dir: 'My World', name: 'My World', lastModified: '2026-11-01T10:00:00.000Z' }],
  },
];

function maps(): MapsPlatform & { requests: MapExportRequest[] } {
  const requests: MapExportRequest[] = [];
  return {
    requests,
    listWorlds: async () => sources,
    exportMap: async (request) => {
      requests.push(request);
      return {
        path: `/out/${request.mapName}.${request.mrpack === undefined ? 'zip' : 'mrpack'}`,
        kind: request.mrpack === undefined ? 'world-zip' : 'mrpack',
        entries: 9,
        leftOut: [{ path: 'players', reason: 'player-data' }],
      };
    },
    listStructureSaves: async () => [],
    readStructureSave: async () => new Uint8Array(),
  };
}

const report = { ok: true, problems: [], files: [] };
const data = new Uint8Array([1]);

describe('ExportMapDialog (ADR 0116 D2)', () => {
  it('picks msm-game-<ns> first and exports the packs as a world zip', async () => {
    const platform = maps();
    const recordExport = vi.fn(async () => {});
    const build = vi.fn(
      async (): Promise<MapContent> => ({
        report,
        needsJar: false,
        dataPack: { fileName: 'ruby-data.zip', data },
        resourcePack: data,
        recordExport,
      }),
    );
    const onDone = vi.fn();
    render(
      <ExportMapDialog
        maps={platform}
        target={target}
        namespace="ruby"
        projectName="Ruby: Sky"
        build={build}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    expect(await screen.findByTestId('export-map-source')).toBeTruthy();
    expect((screen.getByTestId('export-map-name') as HTMLInputElement).value).toBe('Ruby_ Sky');
    await user.click(screen.getByTestId('export-map-keep-player-data'));
    await user.click(screen.getByRole('button', { name: 'Choose world…' }));
    // The game world starts selected though the test world is newer.
    const game = screen.getByTestId('world-row-msm-game-ruby').querySelector('input');
    expect(game?.checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(platform.requests).toEqual([
      {
        targetId: 'mc-26.3',
        sourceId: 'msm-play',
        worldDir: 'msm-game-ruby',
        keepPlayerData: true,
        mapName: 'Ruby_ Sky',
        dataPack: { fileName: 'ruby-data.zip', data },
        resourcePack: data,
      },
    ]);
    expect(recordExport).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0]?.[0]).toContain('/out/Ruby_ Sky.zip');
  });

  it('exports a project that needs the jar as a .mrpack with Fabric API in its index', async () => {
    const platform = maps();
    render(
      <ExportMapDialog
        maps={platform}
        target={target}
        namespace="ruby"
        projectName="Ruby"
        build={async () => ({
          report,
          needsJar: true,
          jar: { modId: 'ruby', data },
          recordExport: async () => {},
        })}
        onDone={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByTestId('export-map-source'), 'official:default');
    await user.click(screen.getByRole('button', { name: 'Choose world…' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(platform.requests).toHaveLength(1));
    const request = platform.requests[0];
    expect(request?.worldDir).toBe('My World');
    expect(request?.dataPack).toBeUndefined();
    expect(request?.mrpack?.jars).toEqual([{ fileName: 'ruby.jar', data }]);
    const index = JSON.parse(request?.mrpack?.index ?? '{}') as Record<string, unknown>;
    expect(index.formatVersion).toBe(1);
    expect(index.dependencies).toEqual({
      'fabric-loader': target.fabric?.loader,
      minecraft: target.mcVersion,
    });
  });

  it('shows the first error and writes nothing when the project is blocked', async () => {
    const platform = maps();
    render(
      <ExportMapDialog
        maps={platform}
        target={target}
        namespace={null}
        projectName="Ruby"
        build={async () => ({
          report: {
            ok: false,
            problems: [{ severity: 'error', code: 'x', message: 'The block has no name.' }],
            files: [],
          },
          needsJar: false,
          recordExport: async () => {},
        })}
        onDone={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await screen.findByTestId('export-map-source');
    await user.click(screen.getByRole('button', { name: 'Choose world…' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The block has no name.');
    expect(platform.requests).toEqual([]);
  });

  it('words the result and the first pick', () => {
    expect(gameWorldOf('ruby')).toBe('msm-game-ruby');
    expect(gameWorldOf(null)).toBeUndefined();
    expect(
      mapExportMessage({ path: '/a/M.mrpack', kind: 'mrpack', entries: 3, leftOut: [] }),
    ).toContain('Modrinth modpack');
    expect(JSON.parse(mapMrpackIndex('M', target)).files).toHaveLength(1);
  });
});
