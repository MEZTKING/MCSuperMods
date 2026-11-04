/**
 * The renderer's view of the platform: `window.msm` from the preload.
 *
 * @packageDocumentation
 */

import type { ProjectFileSystem } from '@msm/core';
import type { MsmBridge } from '../../../shared/platform';

/** The preload bridge. Throws if the preload did not run. */
export function bridge(): MsmBridge {
  const msm = (window as Partial<Window>).msm;
  if (msm === undefined) throw new Error('The MSM preload bridge is missing.');
  return msm;
}

/** A {@link ProjectFileSystem} that forwards every call to the main process. */
export function createBridgeFileSystem(source: MsmBridge = bridge()): ProjectFileSystem {
  const fs = source.fs;
  return {
    readFile: (path) => fs.readFile(path),
    writeFile: (path, data) => fs.writeFile(path, data),
    readDir: (path) => fs.readDir(path),
    exists: (path) => fs.exists(path),
    mkdirp: (path) => fs.mkdirp(path),
    remove: (path) => fs.remove(path),
  };
}
