/** Shared zod pieces of the tool inputs. */
import { z } from 'zod';

/** A resource location `namespace:path`, as every element id is. */
export const resourceIdSchema = z
  .string()
  .regex(/^[a-z0-9_.-]+:[a-z0-9_./-]+$/)
  .max(256)
  .describe('A resource location "namespace:path", lower case, for example "ruby_tools:ruby_ore".');

/** A namespace on its own. */
export const namespaceSchema = z
  .string()
  .regex(/^[a-z0-9_.-]+$/)
  .max(64)
  .describe('A namespace, lower case, for example "ruby_tools".');

/** An element kind id such as `minecraft:recipe` or `msm:block`. */
export const kindIdSchema = z
  .string()
  .regex(/^[a-z0-9_.-]+:[a-z0-9_./-]+$/)
  .max(128)
  .describe('An element kind id as listed by list_kinds, for example "minecraft:recipe".');

/** A paging cursor returned by an earlier call as `nextCursor`. */
export const cursorSchema = z
  .string()
  .max(64)
  .describe('The nextCursor of the previous page; omit for the first page.');

/** The element data: a JSON object shaped by the kind's schema. */
export const elementDataSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "The element's data: a JSON object that matches the kind's schema (see kind_schema or template_data).",
  );

/** Most items a list tool returns per page. */
export const LIST_PAGE_SIZE = 200;

/** Element data above this many bytes of JSON is truncated in `read_element` results. */
export const READ_ELEMENT_MAX_BYTES = 64 * 1024;
