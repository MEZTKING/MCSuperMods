/**
 * The plugin API version.
 *
 * @packageDocumentation
 */

/**
 * The semver version of this plugin API. A plugin's {@link Plugin.apiVersion} range must
 * include it for the plugin to load. Breaking changes bump the major version and are listed
 * with migration notes in `CHANGELOG.md`.
 */
export const API_VERSION = '0.1.0' as const;
