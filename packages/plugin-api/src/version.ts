/**
 * The plugin API version.
 *
 * @packageDocumentation
 */

/**
 * The semver version of this plugin API. A plugin's {@link Plugin.apiVersion} range must
 * include it for the plugin to load. From 1.0.0 the API follows semver: 1.x releases only add
 * optional fields and new contribution points, anything that removes or narrows a member is a
 * major release with a migration note in `CHANGELOG.md`, and a deprecated member stays for at
 * least one minor release, marked `@deprecated` with its replacement. Plugins declare a caret
 * range such as `^1.0.0`.
 */
export const API_VERSION = '1.6.0' as const;
