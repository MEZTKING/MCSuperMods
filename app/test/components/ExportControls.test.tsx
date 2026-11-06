// @vitest-environment happy-dom
import type { Problem } from '@msm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toolbar, type ToolbarProps } from '../../src/renderer/src/components/Toolbar';
import {
  dataExportDisabledReason,
  dataInstallDisabledReason,
  elementLayers,
  exportDisabledReason,
  exporterProblems,
  hasLayerOutput,
  installDisabledReason,
  layerProblems,
  NO_DATA_PACK_CONTENT,
  userFacingExportProblems,
} from '../../src/renderer/src/studios/export-state';
import type { MinecraftStatus } from '../../src/shared/platform';

afterEach(cleanup);

const error: Problem = { severity: 'error', code: 'schema.type', message: 'Expected a string.' };
const warning: Problem = { severity: 'warning', code: 'schema.unknown-id', message: 'Unknown.' };
const withFolder: MinecraftStatus = {
  minecraftDir: '/home/me/.minecraft',
  installed: [],
  chosen: null,
  cache: null,
};

function props(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    hasProject: true,
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    redoLabel: undefined,
    saveDisabledReason: null,
    canAddElement: true,
    exportDisabledReason: null,
    installDisabledReason: null,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddNamespace: vi.fn(),
    onAddElement: vi.fn(),
    onImportAssets: vi.fn(),
    onExportZip: vi.fn(),
    onExportDataZip: vi.fn(),
    onExportCombined: vi.fn(),
    onInstall: vi.fn(),
    onInstallData: vi.fn(),
    onSettings: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(p: ToolbarProps) {
  render(
    <Tooltip.Provider>
      <Toolbar {...p} />
    </Tooltip.Provider>,
  );
}

const byTestId = (id: string) => screen.getByTestId(id) as HTMLButtonElement;

describe('export availability', () => {
  it('blocks export and install while error problems exist, not for warnings', () => {
    expect(exportDisabledReason(true, [warning])).toBeNull();
    expect(exportDisabledReason(true, [error, error, warning])).toBe(
      'Fix 2 errors first (see Problems).',
    );
    expect(exportDisabledReason(true, [error])).toBe('Fix 1 error first (see Problems).');
    expect(exportDisabledReason(false, [])).toBe('No project is open.');
    expect(installDisabledReason(true, [error], withFolder)).toMatch(/Fix 1 error/);
  });

  it('needs a Minecraft folder to install', () => {
    expect(installDisabledReason(true, [], null)).toMatch(/No Minecraft folder/);
    expect(installDisabledReason(true, [], { ...withFolder, minecraftDir: null })).toMatch(
      /Settings/,
    );
    expect(installDisabledReason(true, [warning], withFolder)).toBeNull();
  });

  it('needs data pack content for the data pack and says so', () => {
    expect(dataExportDisabledReason(true, [], false)).toBe(NO_DATA_PACK_CONTENT);
    expect(dataExportDisabledReason(true, [], true)).toBeNull();
    expect(dataExportDisabledReason(true, [error], true)).toMatch(/Fix 1 error/);
    expect(dataInstallDisabledReason(true, [], null, true)).toMatch(/Settings/);
    expect(dataInstallDisabledReason(true, [], withFolder, false)).toBe(NO_DATA_PACK_CONTENT);
    expect(dataInstallDisabledReason(true, [], withFolder, true)).toBeNull();
  });

  it('finds layer output, ignoring pack.mcmeta and counting lowering failures', () => {
    const element = (id: string, kind: string) => ({
      id: id as `${string}:${string}`,
      kind,
      data: {},
      created: '',
      modified: '',
    });
    const project = {
      name: 'demo',
      namespaces: [
        {
          name: 'demo',
          elements: [
            element('demo:pack', 'minecraft:pack_mcmeta'),
            element('demo:m', 'minecraft:model'),
          ],
          assets: [],
        },
      ],
    } as unknown as Parameters<typeof hasLayerOutput>[0];
    const lower = (layer: 'resourcepack' | 'datapack') => () => [{ layer }];
    expect(hasLayerOutput(project, 'datapack', lower('resourcepack'))).toBe(false);
    expect(hasLayerOutput(project, 'resourcepack', lower('resourcepack'))).toBe(true);
    expect(
      hasLayerOutput(project, 'datapack', () => {
        throw new Error('broken');
      }),
    ).toBe(true);
  });
});

describe('per-pack export gating', () => {
  const element = (id: string, kind: string) => ({
    id: id as `${string}:${string}`,
    kind,
    data: {},
    created: '',
    modified: '',
  });
  const project = {
    name: 'demo',
    namespaces: [
      {
        name: 'demo',
        elements: [
          element('demo:pack', 'minecraft:pack_mcmeta'),
          element('demo:model', 'minecraft:model'),
          element('demo:fn', 'minecraft:function'),
          element('demo:broken', 'minecraft:recipe'),
          element('demo:empty', 'minecraft:lang'),
        ],
        assets: [],
      },
    ],
  } as unknown as Parameters<typeof elementLayers>[0];
  const layers = elementLayers(project, (entry) => {
    if (entry.kind === 'minecraft:pack_mcmeta') {
      return [{ layer: 'resourcepack' }, { layer: 'datapack' }];
    }
    if (entry.kind === 'minecraft:model') return [{ layer: 'resourcepack' }];
    if (entry.kind === 'minecraft:function') return [{ layer: 'datapack' }];
    if (entry.kind === 'minecraft:lang') return [];
    throw new Error('broken');
  });
  const errorOf = (elementId: string): Problem => ({ ...error, elementId: elementId as never });
  const reasons = (problems: readonly Problem[]) => ({
    resource: exportDisabledReason(true, layerProblems(problems, layers, 'resourcepack')),
    data: dataExportDisabledReason(true, layerProblems(problems, layers, 'datapack'), true),
  });

  it('a data pack error leaves the resource pack export enabled', () => {
    expect(reasons([errorOf('demo:fn')])).toEqual({
      resource: null,
      data: 'Fix 1 error first (see Problems).',
    });
  });

  it('a resource pack error leaves the data pack export enabled', () => {
    expect(reasons([errorOf('demo:model')])).toEqual({
      resource: 'Fix 1 error first (see Problems).',
      data: null,
    });
  });

  it('errors of elements that fail to lower, lower to nothing or are not tied to one block both', () => {
    const blocked = 'Fix 1 error first (see Problems).';
    for (const problem of [errorOf('demo:broken'), errorOf('demo:empty'), error]) {
      expect(reasons([problem])).toEqual({ resource: blocked, data: blocked });
    }
    expect(layers.get('demo:pack')).toEqual(new Set(['resourcepack', 'datapack']));
  });

  it('a plugin exporter is blocked by errors in any layer it packages', () => {
    const problems = [errorOf('demo:fn'), errorOf('demo:model')];
    expect(exporterProblems(problems, layers, ['datapack'])).toEqual([errorOf('demo:fn')]);
    expect(exporterProblems(problems, layers, ['resourcepack', 'datapack'])).toEqual(problems);
    expect(exporterProblems([error], layers, ['msm'])).toEqual([error]);
    expect(exporterProblems(problems, layers, ['msm'])).toEqual([]);
  });

  it('hides the layer-skipped info of single-pack exports from the user', () => {
    const skipped: Problem = {
      severity: 'info',
      code: 'export.layer-skipped',
      message: '3 resourcepack file(s) are not packaged by Vanilla data pack and were left out.',
    };
    expect(userFacingExportProblems([skipped, warning])).toEqual([warning]);
  });
});

async function openMenu(testId: string) {
  const user = userEvent.setup();
  await user.click(byTestId(testId));
  return user;
}

const item = (id: string) => screen.getByTestId(id);
const isDisabled = (id: string) => item(id).hasAttribute('data-disabled');

describe('Toolbar export buttons', () => {
  it('are disabled while errors exist, with the reason in the menus', async () => {
    const reason = exportDisabledReason(true, [error]);
    renderToolbar(
      props({
        exportDisabledReason: reason,
        installDisabledReason: reason,
        dataExportDisabledReason: reason,
        dataInstallDisabledReason: reason,
      }),
    );
    expect(byTestId('toolbar-export-zip').disabled).toBe(true);
    expect(byTestId('toolbar-save').disabled).toBe(false);
    await openMenu('toolbar-export-menu');
    for (const id of ['export-resource-zip', 'export-data-zip', 'export-combined']) {
      expect(isDisabled(id)).toBe(true);
      expect(screen.getByTestId(`${id}-reason`).textContent).toBe(reason);
    }
  });

  it('report clicks when enabled', async () => {
    const p = props();
    renderToolbar(p);
    const user = userEvent.setup();
    await user.click(byTestId('toolbar-export-zip'));
    await user.click(byTestId('toolbar-import-assets'));
    await user.click(byTestId('toolbar-settings'));
    expect(p.onExportZip).toHaveBeenCalledOnce();
    expect(p.onImportAssets).toHaveBeenCalledOnce();
    expect(p.onSettings).toHaveBeenCalledOnce();
  });

  it('runs every Export menu entry', async () => {
    const p = props();
    renderToolbar(p);
    for (const [id, handler] of [
      ['export-resource-zip', p.onExportZip],
      ['export-data-zip', p.onExportDataZip],
      ['export-combined', p.onExportCombined],
    ] as const) {
      const user = await openMenu('toolbar-export-menu');
      await user.click(item(id));
      expect(handler).toHaveBeenCalledOnce();
    }
  });

  it('runs both Install menu entries', async () => {
    const p = props();
    renderToolbar(p);
    let user = await openMenu('toolbar-install-menu');
    await user.click(item('install-resource'));
    expect(p.onInstall).toHaveBeenCalledOnce();
    user = await openMenu('toolbar-install-menu');
    await user.click(item('install-data'));
    expect(p.onInstallData).toHaveBeenCalledOnce();
  });

  it('says why the data pack is unavailable', async () => {
    renderToolbar(
      props({
        dataExportDisabledReason: NO_DATA_PACK_CONTENT,
        dataInstallDisabledReason: NO_DATA_PACK_CONTENT,
      }),
    );
    await openMenu('toolbar-export-menu');
    expect(isDisabled('export-resource-zip')).toBe(false);
    expect(isDisabled('export-data-zip')).toBe(true);
    expect(screen.getByTestId('export-data-zip-reason').textContent).toBe(NO_DATA_PACK_CONTENT);
  });

  it('exports the data pack from the main button for data-only projects', async () => {
    const p = props({ primaryExport: 'data' });
    renderToolbar(p);
    await userEvent.setup().click(byTestId('toolbar-export-zip'));
    expect(p.onExportDataZip).toHaveBeenCalledOnce();
    expect(p.onExportZip).not.toHaveBeenCalled();
  });

  it('disables export and install while an export runs', () => {
    renderToolbar(props({ exporting: true }));
    expect(byTestId('toolbar-export-zip').disabled).toBe(true);
    expect(byTestId('toolbar-export-menu').disabled).toBe(true);
    expect(byTestId('toolbar-install-menu').disabled).toBe(true);
  });
});
