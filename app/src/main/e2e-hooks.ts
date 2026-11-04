/**
 * End-to-end test hooks. Playwright cannot drive native dialogs, so when
 * `MSM_E2E_PROJECT_DIR` is set the main process replaces them:
 *
 * - `MSM_E2E_PROJECT_DIR` (absolute): `pickDirectory` returns this folder.
 * - `MSM_E2E_OUT_DIR` (absolute, optional): `saveFile` writes `<MSM_E2E_OUT_DIR>/<defaultName>`
 *   without a dialog. When unset, `saveFile` behaves as if the user cancelled.
 * - `MSM_E2E_PICK_FILES` (optional): absolute paths separated by the platform's path-list
 *   delimiter (`:` on Linux and macOS, `;` on Windows); `pickFiles` returns these files.
 *   When unset, `pickFiles` returns nothing.
 * - `confirmDiscard` answers "discard" without a dialog.
 *
 * Combine with `MSM_HOME` (see `platform/settings.ts`) so settings and the asset cache live
 * in a temporary folder. The hooks are inert unless `MSM_E2E_PROJECT_DIR` is set.
 *
 * @packageDocumentation
 */

import { delimiter, isAbsolute, join } from 'node:path';
import type { NativeDialogs } from './platform/node-platform';

/** The parsed e2e settings. */
export interface E2eHooks {
  projectDir: string;
  outDir: string | null;
  pickFiles: string[];
}

/** Reads the e2e settings from the environment, or `null` when e2e mode is off. */
export function readE2eHooks(env: Readonly<Record<string, string | undefined>>): E2eHooks | null {
  const projectDir = env.MSM_E2E_PROJECT_DIR;
  if (projectDir === undefined || projectDir === '') return null;
  if (!isAbsolute(projectDir)) throw new Error('MSM_E2E_PROJECT_DIR must be an absolute path.');
  const outDir = env.MSM_E2E_OUT_DIR;
  if (outDir !== undefined && outDir !== '' && !isAbsolute(outDir)) {
    throw new Error('MSM_E2E_OUT_DIR must be an absolute path.');
  }
  const pickFiles = (env.MSM_E2E_PICK_FILES ?? '').split(delimiter).filter((path) => path !== '');
  for (const path of pickFiles) {
    if (!isAbsolute(path)) throw new Error('MSM_E2E_PICK_FILES must list absolute paths.');
  }
  return {
    projectDir,
    outDir: outDir === undefined || outDir === '' ? null : outDir,
    pickFiles,
  };
}

/** Returns `dialogs` with every method replaced by its e2e behaviour when hooks are set. */
export function applyE2eHooks(dialogs: NativeDialogs, hooks: E2eHooks | null): NativeDialogs {
  if (hooks === null) return dialogs;
  return {
    pickDirectory: async () => hooks.projectDir,
    confirmDiscard: async () => true,
    openFiles: async () => [...hooks.pickFiles],
    saveFilePath: async ({ defaultName }) =>
      hooks.outDir === null ? null : join(hooks.outDir, defaultName),
  };
}
