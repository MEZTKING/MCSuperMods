/**
 * A compact text rendering of a kind's schema for the AI helper's `kind_schema` tool
 * (ADR 0041 D4): fields with their types, optional markers, enum values and id registries,
 * bounded in depth and length.
 *
 * @packageDocumentation
 */

import type { SchemaField, SchemaNode } from '@msm/schemas';

/** Bounds of {@link kindSchemaSummary}. */
export interface SchemaSummaryOptions {
  /** Nesting levels rendered in full; deeper structs are shown as `{...}`. */
  maxDepth: number;
  /** The text is cut at this many characters, with a note. */
  maxChars: number;
}

/** The bounds the `kind_schema` tool uses. */
export const KIND_SCHEMA_SUMMARY_OPTIONS: Readonly<SchemaSummaryOptions> = Object.freeze({
  maxDepth: 4,
  maxChars: 12_000,
});

/** Most enum values, dispatcher keys and union members listed inline. */
const MAX_LIST = 40;

/** Most dispatcher cases rendered with their own structure. */
const MAX_CASES = 16;

const TRUNCATED = '\n... (truncated; read a template with template_data for a full example)';

class Budget {
  readonly lines: string[] = [];
  #chars = 0;
  constructor(readonly maxChars: number) {}
  get full(): boolean {
    return this.#chars >= this.maxChars;
  }
  push(line: string): void {
    if (this.full) return;
    this.lines.push(line);
    this.#chars += line.length + 1;
  }
}

function resolveRef(node: SchemaNode): SchemaNode | undefined {
  try {
    return node.kind === 'reference' ? node.resolve() : node;
  } catch {
    return undefined;
  }
}

/** Follows references to the node they name (cycle-safe, bounded). */
function deref(node: SchemaNode): SchemaNode | undefined {
  let current: SchemaNode | undefined = node;
  for (let hops = 0; current?.kind === 'reference' && hops < 16; hops += 1) {
    current = resolveRef(current);
  }
  return current?.kind === 'reference' ? undefined : current;
}

function listText(values: readonly string[]): string {
  const shown = values.slice(0, MAX_LIST).join(' | ');
  return values.length > MAX_LIST ? `${shown} | ... (${values.length} in all)` : shown;
}

function rangeText(range: { min?: number; max?: number } | undefined): string {
  if (range === undefined || (range.min === undefined && range.max === undefined)) return '';
  return ` ${range.min ?? ''}..${range.max ?? ''}`;
}

/** A one-line type for scalar nodes; `undefined` for nodes that need their own lines. */
function inlineType(node: SchemaNode): string | undefined {
  switch (node.kind) {
    case 'string': {
      if (node.idRegistry !== undefined) {
        return `id(${node.idRegistry}${node.idPath === undefined ? '' : `, path ${node.idPath}`})`;
      }
      return `string${rangeText(node.lengthRange)}`;
    }
    case 'number':
      return `${node.numberKind}${rangeText(node.range)}`;
    case 'boolean':
      return 'boolean';
    case 'literal':
      return JSON.stringify(node.value);
    case 'enum':
      return `enum(${listText(node.values.map((value) => JSON.stringify(value.value)))})`;
    case 'any':
      return 'any';
    case 'unsupported':
      return 'any (not modelled)';
    case 'list': {
      const item = deref(node.item);
      const inner = item === undefined ? 'any' : inlineType(item);
      return inner === undefined ? undefined : `list<${inner}>${rangeText(node.lengthRange)}`;
    }
    case 'union': {
      const members = node.members.map(deref);
      const texts = members.map((member) => (member === undefined ? 'any' : inlineType(member)));
      if (texts.some((text) => text === undefined)) return undefined;
      return listText(texts as string[]);
    }
    default:
      return undefined;
  }
}

function tagsText(node: SchemaNode): string {
  const tags = node.tags?.filter((tag) => tag !== 'id') ?? [];
  return tags.length > 0 ? ` #[${tags.join(', ')}]` : '';
}

function fieldName(field: SchemaField): string {
  if (field.key !== '*') return `${field.key}${field.optional ? '?' : ''}`;
  const keyType = field.keyType === undefined ? undefined : deref(field.keyType);
  const keyText = keyType === undefined ? 'string' : (inlineType(keyType) ?? 'string');
  return `[${keyText}]?`;
}

function render(
  node: SchemaNode,
  depth: number,
  indent: string,
  budget: Budget,
  options: SchemaSummaryOptions,
  seen: ReadonlySet<SchemaNode>,
): string {
  // Returns the inline head; nested lines are pushed to the budget.
  const resolved = deref(node);
  if (resolved === undefined) return 'any (unresolved reference)';
  const inline = inlineType(resolved);
  if (inline !== undefined) return `${inline}${tagsText(resolved)}`;
  if (seen.has(resolved)) return '{...} (recursive)';
  if (depth >= options.maxDepth) return '{...}';
  const nextSeen = new Set(seen).add(resolved);
  switch (resolved.kind) {
    case 'struct': {
      const head = `{${tagsText(resolved)}`;
      renderStructBody(resolved, depth, indent, budget, options, nextSeen);
      return head;
    }
    case 'list': {
      child(`${indent}  - `, resolved.item, depth + 1, `${indent}  `, budget, options, nextSeen);
      return `list${rangeText(resolved.lengthRange)} of`;
    }
    case 'tuple': {
      resolved.items.forEach((item, index) => {
        child(`${indent}  [${index}]: `, item, depth + 1, `${indent}  `, budget, options, nextSeen);
      });
      return 'tuple';
    }
    case 'union': {
      for (const member of resolved.members.slice(0, MAX_LIST)) {
        child(`${indent}  | `, member, depth + 1, `${indent}    `, budget, options, nextSeen);
      }
      return 'one of:';
    }
    case 'dispatcher': {
      const keys = resolved.keys();
      const by =
        resolved.discriminator.length === 0
          ? ''
          : ` by ${resolved.discriminator.map((step) => (step === '%key' ? 'the map key' : step === '%parent' ? 'the parent' : `"${step}"`)).join('.')}`;
      const head = `depends on ${resolved.registry}${by}; cases: ${listText(keys)}`;
      for (const key of keys.slice(0, MAX_CASES)) {
        if (budget.full) break;
        const member = resolved.dispatch(key);
        if (member === undefined) continue;
        child(`${indent}  case ${key}: `, member, depth + 1, `${indent}    `, budget, options, nextSeen);
      }
      if (keys.length > MAX_CASES) budget.push(`${indent}  (other cases not shown)`);
      return head;
    }
    default:
      return 'any';
  }
}

/** Reserves a line, renders `node` (its nested lines follow) and fills the line in. */
function child(
  prefix: string,
  node: SchemaNode,
  depth: number,
  indent: string,
  budget: Budget,
  options: SchemaSummaryOptions,
  seen: ReadonlySet<SchemaNode>,
  suffix = '',
): void {
  if (budget.full) return;
  const lineIndex = budget.lines.length;
  budget.push('');
  const inner = render(node, depth, indent, budget, options, seen);
  budget.lines[lineIndex] = `${prefix}${inner}${suffix}`;
}

function renderStructBody(
  node: Extract<SchemaNode, { kind: 'struct' }>,
  depth: number,
  indent: string,
  budget: Budget,
  options: SchemaSummaryOptions,
  seen: ReadonlySet<SchemaNode>,
): void {
  for (const field of node.fields) {
    const deprecated = field.deprecated === true ? ' (deprecated)' : '';
    const prefix = `${indent}  ${fieldName(field)}: `;
    child(prefix, field.type, depth + 1, `${indent}  `, budget, options, seen, deprecated);
  }
  for (const spread of node.spreads) {
    child(`${indent}  ...`, spread, depth + 1, `${indent}  `, budget, options, seen);
  }
  budget.push(`${indent}}`);
}

/**
 * Renders a kind's schema node as indented text: one line per field (`name?: type` for
 * optional fields, `[key]?: type` for maps), enums and unions inline when short, dispatchers
 * with their cases, id strings as `id(<registry>)`. Structs deeper than `maxDepth` show as
 * `{...}`; the text is cut at `maxChars` with a note.
 */
export function kindSchemaSummary(
  node: SchemaNode,
  options: SchemaSummaryOptions = KIND_SCHEMA_SUMMARY_OPTIONS,
): string {
  const budget = new Budget(options.maxChars);
  child('', node, 0, '', budget, options, new Set());
  let text = budget.lines.join('\n');
  if (budget.full || text.length > options.maxChars) {
    text = `${text.slice(0, options.maxChars)}${TRUNCATED}`;
  }
  return text;
}
