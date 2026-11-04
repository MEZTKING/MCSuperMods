// @vitest-environment happy-dom
import type { Problem } from '@msm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toolbar, type ToolbarProps } from '../../src/renderer/src/components/Toolbar';
import {
  exportDisabledReason,
  installDisabledReason,
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
    onInstall: vi.fn(),
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
});

describe('Toolbar export buttons', () => {
  it('are disabled while errors exist', () => {
    const reason = exportDisabledReason(true, [error]);
    renderToolbar(props({ exportDisabledReason: reason, installDisabledReason: reason }));
    expect(byTestId('toolbar-export-zip').disabled).toBe(true);
    expect(byTestId('toolbar-install').disabled).toBe(true);
    expect(byTestId('toolbar-save').disabled).toBe(false);
  });

  it('report clicks when enabled', async () => {
    const p = props();
    renderToolbar(p);
    const user = userEvent.setup();
    await user.click(byTestId('toolbar-export-zip'));
    await user.click(byTestId('toolbar-install'));
    await user.click(byTestId('toolbar-import-assets'));
    await user.click(byTestId('toolbar-settings'));
    expect(p.onExportZip).toHaveBeenCalledOnce();
    expect(p.onInstall).toHaveBeenCalledOnce();
    expect(p.onImportAssets).toHaveBeenCalledOnce();
    expect(p.onSettings).toHaveBeenCalledOnce();
  });

  it('disables both while an export runs', () => {
    renderToolbar(props({ exporting: true }));
    expect(byTestId('toolbar-export-zip').disabled).toBe(true);
    expect(byTestId('toolbar-install').disabled).toBe(true);
  });
});
