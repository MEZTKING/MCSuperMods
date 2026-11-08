/**
 * The tool catalogue (ADR 0041 D4) in its fixed, deterministic order (read-only, proposals,
 * checks, user decisions), its JSON Schema rendering for the API and input validation.
 *
 * The order and the rendered schemas never change between requests: tools render first in the
 * prompt, so any change would invalidate the prompt cache.
 */
import { z } from 'zod';
import type { BetaTool } from '../sdk-types';
import { CHECK_TOOLS } from './check';
import { DECIDE_TOOLS } from './decide';
import { NOTE_TOOLS } from './note';
import { PROPOSE_TOOLS } from './propose';
import { READ_TOOLS } from './read';

const ALL_TOOLS = [
  ...READ_TOOLS,
  ...PROPOSE_TOOLS,
  ...CHECK_TOOLS,
  ...DECIDE_TOOLS,
  ...NOTE_TOOLS,
] as const;

type AnyToolEntry = (typeof ALL_TOOLS)[number];

/** Every tool name. */
export type AiToolName = AnyToolEntry['name'];

/** The validated input type of each tool, by name. */
export type AiToolInputs = {
  [E in AnyToolEntry as E['name']]: z.infer<E['input']>;
};

/** One tool of the catalogue. */
export interface AiToolDefinition {
  name: AiToolName;
  /** The model's instructions for this tool. */
  description: string;
  input: z.ZodType;
  group: 'read' | 'propose' | 'check' | 'decide' | 'note';
}

/** The catalogue, in request order. */
export const TOOL_CATALOGUE: readonly AiToolDefinition[] = Object.freeze(
  ALL_TOOLS.map((t) =>
    Object.freeze({ name: t.name, description: t.description, input: t.input, group: t.group }),
  ),
);

/** Every tool name, in catalogue order. */
export const AI_TOOL_NAMES: readonly AiToolName[] = Object.freeze(
  TOOL_CATALOGUE.map((t) => t.name),
);

const BY_NAME = new Map<string, AiToolDefinition>(TOOL_CATALOGUE.map((t) => [t.name, t]));

/** The catalogue entry of a tool name, if any. */
export function toolDefinition(name: string): AiToolDefinition | undefined {
  return BY_NAME.get(name);
}

/** Whether a string is a tool name of the catalogue. */
export function isAiToolName(name: string): name is AiToolName {
  return BY_NAME.has(name);
}

type JsonSchemaNode = { [key: string]: unknown };

function isNode(value: unknown): value is JsonSchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Adjusts zod's JSON Schema for the API: drops `$schema`, the redundant `propertyNames` of string
 * records and zod's safe-integer bounds, makes free-form records `additionalProperties: true`, and
 * closes every object with declared properties with `additionalProperties: false`.
 */
export function normaliseJsonSchema(node: unknown, top = true): unknown {
  if (Array.isArray(node)) return node.map((n) => normaliseJsonSchema(n, false));
  if (!isNode(node)) return node;
  const out: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (top && key === '$schema') continue;
    if (key === 'propertyNames' && isNode(value) && value.type === 'string') continue;
    if (key === 'maximum' && value === Number.MAX_SAFE_INTEGER) continue;
    if (key === 'minimum' && value === Number.MIN_SAFE_INTEGER) continue;
    if (key === 'additionalProperties' && isNode(value) && Object.keys(value).length === 0) {
      out[key] = true;
      continue;
    }
    out[key] = normaliseJsonSchema(value, false);
  }
  if (out.type === 'object' && isNode(out.properties) && out.additionalProperties === undefined) {
    out.additionalProperties = false;
  }
  return out;
}

let cachedParams: BetaTool[] | undefined;

function buildParams(): BetaTool[] {
  return TOOL_CATALOGUE.map((t) => {
    const schema = normaliseJsonSchema(z.toJSONSchema(t.input)) as BetaTool['input_schema'];
    return {
      name: t.name,
      description: t.description,
      input_schema: schema,
      eager_input_streaming: true,
    };
  });
}

/**
 * The catalogue as API tool params: JSON Schema inputs and `eager_input_streaming: true` on each
 * (the loop validates every input itself). Returns a fresh copy of the same bytes on every call.
 */
export function toolParams(): BetaTool[] {
  cachedParams ??= buildParams();
  return structuredClone(cachedParams);
}

/** The outcome of {@link parseToolInput}. */
export type ParsedToolInput =
  | { ok: true; name: AiToolName; input: unknown }
  | { ok: false; error: { UNKNOWN_TOOL: string } | { INVALID_INPUT: z.core.$ZodIssue[] } };

/** Validates a tool input against the tool's zod schema. */
export function parseToolInput(name: string, input: unknown): ParsedToolInput {
  const def = BY_NAME.get(name);
  if (def === undefined) return { ok: false, error: { UNKNOWN_TOOL: name } };
  const result = def.input.safeParse(input);
  if (!result.success) return { ok: false, error: { INVALID_INPUT: result.error.issues } };
  return { ok: true, name: def.name, input: result.data };
}
