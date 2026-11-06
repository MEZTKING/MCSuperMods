/**
 * End-to-end test hooks. Playwright cannot drive native dialogs, so when
 * `MSM_E2E_PROJECT_DIR` is set the main process replaces them:
 *
 * - `MSM_E2E_PROJECT_DIR` (absolute): `pickDirectory` returns this folder.
 * - `MSM_E2E_OUT_DIR` (absolute, optional): `saveFile` writes `<MSM_E2E_OUT_DIR>/<defaultName>`
 *   without a dialog, and the export folder picker returns `MSM_E2E_OUT_DIR`. When unset, both
 *   behave as if the user cancelled.
 * - `MSM_E2E_PICK_FILES` (optional): absolute paths separated by the platform's path-list
 *   delimiter (`:` on Linux and macOS, `;` on Windows); `pickFiles` returns these files.
 *   When unset, `pickFiles` returns nothing.
 * - `MSM_E2E_MODPACK_DIR` (absolute, optional): folder pickers whose title names a modpack
 *   return this folder instead of `MSM_E2E_PROJECT_DIR` (ADR 0046).
 * - `confirmDiscard` answers "discard" without a dialog.
 *
 * Independently of those, `MSM_E2E_AI_SCRIPT` (absolute path to an `AiModelScript` JSON file,
 * ADR 0041 D9) makes the AI helper use `ScriptedModelClient` with that script for every
 * conversation (one client, so the script's turns run in order across the app session) and
 * report the key as set (tail `e2e!`). No key and no SDK are used then.
 *
 * Combine with `MSM_HOME` (see `platform/settings.ts`) so settings and the asset cache live
 * in a temporary folder. The hooks are inert unless `MSM_E2E_PROJECT_DIR` is set.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { type AiModelScript, aiModelScriptSchema } from '@msm/ai';
import type { NativeDialogs } from './platform/node-platform';

/** The parsed e2e settings. */
export interface E2eHooks {
  projectDir: string;
  outDir: string | null;
  pickFiles: string[];
  modpackDir: string | null;
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
  const modpackDir = env.MSM_E2E_MODPACK_DIR;
  if (modpackDir !== undefined && modpackDir !== '' && !isAbsolute(modpackDir)) {
    throw new Error('MSM_E2E_MODPACK_DIR must be an absolute path.');
  }
  return {
    projectDir,
    outDir: outDir === undefined || outDir === '' ? null : outDir,
    pickFiles,
    modpackDir: modpackDir === undefined || modpackDir === '' ? null : modpackDir,
  };
}

/** Returns `dialogs` with every method replaced by its e2e behaviour when hooks are set. */
export function applyE2eHooks(dialogs: NativeDialogs, hooks: E2eHooks | null): NativeDialogs {
  if (hooks === null) return dialogs;
  return {
    pickDirectory: async ({ title }) =>
      hooks.modpackDir !== null && /modpack/i.test(title) ? hooks.modpackDir : hooks.projectDir,
    pickExportFolder: async () => hooks.outDir,
    confirmDiscard: async () => true,
    openFiles: async () => [...hooks.pickFiles],
    saveFilePath: async ({ defaultName }) =>
      hooks.outDir === null ? null : join(hooks.outDir, defaultName),
  };
}

/**
 * Reads the AI helper's model script named by `MSM_E2E_AI_SCRIPT`, or `null` when it is unset.
 * Throws when the path is relative or the file is not a valid `AiModelScript`.
 */
export function readE2eAiScript(
  env: Readonly<Record<string, string | undefined>>,
  readText: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): AiModelScript | null {
  const path = env.MSM_E2E_AI_SCRIPT;
  if (path === undefined || path === '') return null;
  if (!isAbsolute(path)) throw new Error('MSM_E2E_AI_SCRIPT must be an absolute path.');
  const parsed = aiModelScriptSchema.safeParse(JSON.parse(readText(path)));
  if (!parsed.success) {
    throw new Error(`MSM_E2E_AI_SCRIPT is not a valid model script: ${parsed.error.message}`);
  }
  return parsed.data as AiModelScript;
}
