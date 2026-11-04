/**
 * JSON value types shared by every part of the plugin API.
 *
 * @packageDocumentation
 */

/**
 * Any value that survives a round trip through `JSON.stringify` and `JSON.parse` unchanged.
 *
 * Element data, project settings and JSON output files are all typed as `Json` so that the
 * project can always be persisted as plain JSON files.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * A JSON object: string keys mapped to {@link Json} values.
 */
export type JsonObject = { [key: string]: Json };

/**
 * A Minecraft resource location of the form `namespace:path`, for example `minecraft:stone`
 * or `my_mod:blocks/ruby_ore`.
 *
 * Resource locations are lower-case. This type only enforces the presence of a colon; the
 * full character-set validation is performed by `@msm/core` when a project is loaded or an
 * element is created.
 */
export type ResourceLocation = `${string}:${string}`;
