import { delimiter } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyE2eHooks,
  readE2eHooks,
  readE2eNewInstall,
  readE2eRuntimeDir,
} from '../src/main/e2e-hooks';
import type { NativeDialogs } from '../src/main/platform/node-platform';

const native: NativeDialogs = {
  pickDirectory: async () => '/native',
  pickExportFolder: async () => '/native/exports',
  confirmDiscard: async () => false,
  openFiles: async () => ['/native/a.png'],
  saveFilePath: async () => '/native/out.zip',
};

describe('e2e hooks', () => {
  it('are off unless MSM_E2E_PROJECT_DIR is set', () => {
    expect(readE2eHooks({})).toBeNull();
    expect(applyE2eHooks(native, null)).toBe(native);
  });

  it('replace every dialog', async () => {
    const hooks = readE2eHooks({
      MSM_E2E_PROJECT_DIR: '/e2e/project',
      MSM_E2E_OUT_DIR: '/e2e/out',
      MSM_E2E_PICK_FILES: ['/e2e/a.png', '/e2e/b.png'].join(delimiter),
      MSM_E2E_MODPACK_DIR: '/e2e/pack',
    });
    expect(hooks).toEqual({
      projectDir: '/e2e/project',
      outDir: '/e2e/out',
      pickFiles: ['/e2e/a.png', '/e2e/b.png'],
      modpackDir: '/e2e/pack',
    });
    const dialogs = applyE2eHooks(native, hooks);
    expect(await dialogs.pickDirectory({ title: 'x', mustBeEmpty: true })).toBe('/e2e/project');
    expect(
      await dialogs.pickDirectory({
        title: 'Choose an empty folder for the modpack',
        mustBeEmpty: true,
      }),
    ).toBe('/e2e/pack');
    expect(await dialogs.pickExportFolder?.({ title: 'x' })).toBe('/e2e/out');
    expect(await dialogs.confirmDiscard('?')).toBe(true);
    expect(await dialogs.openFiles({ title: 'x' })).toEqual(['/e2e/a.png', '/e2e/b.png']);
    expect(await dialogs.saveFilePath({ title: 'x', defaultName: 'pack.zip' })).toMatch(
      /e2e[/\\]out[/\\]pack\.zip$/,
    );
  });

  it('cancel saving without an out dir and reject relative paths', async () => {
    const dialogs = applyE2eHooks(native, readE2eHooks({ MSM_E2E_PROJECT_DIR: '/e2e/p' }));
    expect(await dialogs.saveFilePath({ title: 'x', defaultName: 'pack.zip' })).toBeNull();
    expect(await dialogs.pickExportFolder?.({ title: 'x' })).toBeNull();
    expect(await dialogs.openFiles({ title: 'x' })).toEqual([]);
    expect(() => readE2eHooks({ MSM_E2E_PROJECT_DIR: 'relative' })).toThrow(/absolute/);
    expect(() => readE2eHooks({ MSM_E2E_PROJECT_DIR: '/p', MSM_E2E_PICK_FILES: 'a.png' })).toThrow(
      /absolute/,
    );
  });

  it('read the runtime folder and the new-install switch (B379)', () => {
    expect(readE2eRuntimeDir({})).toBeNull();
    expect(readE2eRuntimeDir({ MSM_E2E_RUNTIME_DIR: '' })).toBeNull();
    expect(readE2eRuntimeDir({ MSM_E2E_RUNTIME_DIR: '/e2e/runtime' })).toBe('/e2e/runtime');
    expect(() => readE2eRuntimeDir({ MSM_E2E_RUNTIME_DIR: 'runtime' })).toThrow(/absolute/);
    expect(readE2eNewInstall({})).toBe(false);
    expect(readE2eNewInstall({ MSM_E2E_NEW_INSTALL: '0' })).toBe(false);
    expect(readE2eNewInstall({ MSM_E2E_NEW_INSTALL: '1' })).toBe(true);
  });
});
