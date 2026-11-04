/**
 * The plugin entry point: {@link Plugin} and {@link definePlugin}.
 *
 * @packageDocumentation
 */

import type { PluginContributions } from './contributions';

/**
 * A plugin: an id, the API versions it supports, and what it contributes.
 *
 * A plugin package's default export is the result of {@link definePlugin}.
 */
export interface Plugin {
  /** /^[a-z][a-z0-9.-]*$/ */
  id: string;
  /** semver range, e.g. "^0.2.0" */
  apiVersion: string;
  /** What the plugin adds; see {@link PluginContributions}. */
  contributes: PluginContributions;
}

/**
 * Thrown by {@link definePlugin} when a plugin definition is malformed.
 */
export class PluginDefinitionError extends Error {
  /**
   * @param message - Why the definition was rejected.
   */
  constructor(message: string) {
    super(message);
    this.name = 'PluginDefinitionError';
  }
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9.-]*$/;

/**
 * Declares a plugin.
 *
 * Validates the id pattern and that `apiVersion` is a non-empty string, then freezes and
 * returns the plugin. The freeze is shallow: `contributes` itself is not frozen. Does not
 * evaluate the semver range; `@msm/core` checks it against {@link API_VERSION} when loading.
 *
 * @example
 * ```ts
 * export default definePlugin({
 *   id: 'msm.blocks-items',
 *   apiVersion: '^0.2.0',
 *   contributes: { elementKinds: [blockKind] },
 * });
 * ```
 *
 * @param plugin - The plugin definition.
 * @returns The same plugin, frozen.
 * @throws {@link PluginDefinitionError} If the id or `apiVersion` is invalid.
 */
export function definePlugin(plugin: Plugin): Readonly<Plugin> {
  if (typeof plugin.id !== 'string' || !PLUGIN_ID_PATTERN.test(plugin.id)) {
    throw new PluginDefinitionError(
      `Invalid plugin id ${JSON.stringify(plugin.id)}: it must match ${PLUGIN_ID_PATTERN}.`,
    );
  }
  if (typeof plugin.apiVersion !== 'string' || plugin.apiVersion.trim() === '') {
    throw new PluginDefinitionError(
      `Plugin ${plugin.id} has an empty apiVersion: it must be a semver range such as "^0.2.0".`,
    );
  }
  return Object.freeze(plugin);
}
