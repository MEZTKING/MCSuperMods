/**
 * Resource location parsing and validation.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from '@msm/plugin-api';

/** Characters allowed in a resource-location namespace. */
export const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;

/** Characters allowed in a resource-location path. */
export const PATH_PATTERN = /^[a-z0-9_./-]+$/;

/**
 * Thrown when a string is not a valid `namespace:path` resource location.
 */
export class InvalidResourceLocationError extends Error {
  /**
   * @param message - Why the value was rejected.
   */
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResourceLocationError';
  }
}

/**
 * Whether a string is a valid namespace name.
 *
 * @param name - The candidate namespace.
 */
export function isValidNamespace(name: string): boolean {
  return NAMESPACE_PATTERN.test(name);
}

/**
 * Splits a resource location into its namespace and path.
 *
 * Both halves are required: there is no implicit `minecraft:` namespace in project files.
 * The path may not contain empty, `.` or `..` segments, because it becomes a file path.
 *
 * @param id - The resource location, for example `my_mod:blocks/ruby_ore`.
 * @returns The namespace and path.
 * @throws {@link InvalidResourceLocationError} If the value is malformed.
 */
export function parseResourceLocation(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  if (colon < 0) {
    throw new InvalidResourceLocationError(
      `Invalid resource location ${JSON.stringify(id)}: expected "namespace:path".`,
    );
  }
  const namespace = id.slice(0, colon);
  const path = id.slice(colon + 1);
  if (!NAMESPACE_PATTERN.test(namespace)) {
    throw new InvalidResourceLocationError(
      `Invalid resource location ${JSON.stringify(id)}: the namespace must match ${NAMESPACE_PATTERN}.`,
    );
  }
  if (!PATH_PATTERN.test(path)) {
    throw new InvalidResourceLocationError(
      `Invalid resource location ${JSON.stringify(id)}: the path must match ${PATH_PATTERN}.`,
    );
  }
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new InvalidResourceLocationError(
        `Invalid resource location ${JSON.stringify(id)}: the path has an empty, "." or ".." segment.`,
      );
    }
  }
  return { namespace, path };
}

/**
 * Whether a string is a valid resource location.
 *
 * @param value - The candidate value.
 */
export function isResourceLocation(value: string): value is ResourceLocation {
  try {
    parseResourceLocation(value);
    return true;
  } catch (error) {
    if (error instanceof InvalidResourceLocationError) return false;
    throw error;
  }
}
