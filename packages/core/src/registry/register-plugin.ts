/**
 * Plugin registration.
 *
 * @packageDocumentation
 */

import { API_VERSION, type Plugin } from '@msm/plugin-api';
import semver from 'semver';
import { DuplicateKindError, type ElementKindRegistry } from './element-kind-registry';

/**
 * Thrown when a plugin's `apiVersion` range does not include the host's plugin API version.
 */
export class PluginCompatibilityError extends Error {
  /**
   * @param message - Why the plugin was rejected.
   */
  constructor(message: string) {
    super(message);
    this.name = 'PluginCompatibilityError';
  }
}

/**
 * Registers a plugin's contributions. Phase 0 registers element kinds only.
 *
 * @param registry - The registry to fill.
 * @param plugin - The plugin.
 * @param options - `apiVersion` overrides the host API version (for tests).
 * @throws {@link PluginCompatibilityError} If the plugin's range excludes the API version.
 * @throws `DuplicateKindError` If a kind id or folder is already registered.
 */
export function registerPlugin(
  registry: ElementKindRegistry,
  plugin: Plugin,
  options: { apiVersion?: string } = {},
): void {
  const apiVersion = options.apiVersion ?? API_VERSION;
  if (semver.validRange(plugin.apiVersion) === null) {
    throw new PluginCompatibilityError(
      `Plugin ${plugin.id} declares an invalid apiVersion range ${JSON.stringify(plugin.apiVersion)}.`,
    );
  }
  if (!semver.satisfies(apiVersion, plugin.apiVersion)) {
    throw new PluginCompatibilityError(
      `Plugin ${plugin.id} requires plugin API ${plugin.apiVersion}, but this build provides ${apiVersion}.`,
    );
  }
  const kinds = plugin.contributes.elementKinds ?? [];
  // Check every kind first so that a failing plugin registers nothing.
  const ids = new Set<string>();
  const folders = new Set<string>();
  for (const kind of kinds) {
    if (registry.get(kind.id) !== undefined || ids.has(kind.id)) {
      throw new DuplicateKindError(
        `Plugin ${plugin.id}: element kind ${JSON.stringify(kind.id)} is already registered.`,
      );
    }
    if (registry.kindForFolder(kind.folder) !== undefined || folders.has(kind.folder)) {
      throw new DuplicateKindError(
        `Plugin ${plugin.id}: kind-folder ${JSON.stringify(kind.folder)} is already used.`,
      );
    }
    ids.add(kind.id);
    folders.add(kind.folder);
  }
  for (const kind of kinds) registry.register(kind);
}
