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
  /** Most enum values, dispatcher keys and union members listed inline (default 40). */
  maxList?: number;
  /** Most dispatcher cases rendered with their own structure (default 16). */
  maxCases?: number;
}

/** The bounds the `kind_schema` tool uses. */
export const KIND_SCHEMA_SUMMARY_OPTIONS: Readonly<SchemaSummaryOptions> = Object.freeze({
  maxDepth: 4,
  maxChars: 12_000,
});

/**
 * Larger bounds for kinds whose schema the default bounds cut short. `msm:rules` (ADR 0082)
 * has 43 triggers and 36 steps behind dispatchers below the rule's `when` and `do`: depth 8
 * shows every trigger and step case with its fields (value objects and steps nested in logic
 * steps stay `{...}`), and lists up to 64 show every id; the text is about 18,000 characters.
 *
 * `msm:block` has 38 block types (ADR 0094 adds twenty) behind the `type` dispatchers: cases up
 * to 48 show every type's fields at the default depth (about 17,200 characters). `msm:vehicle`
 * (ADR 0090), `msm:key_bind` (ADR 0088) and `msm:command` (ADR 0096) go one level deeper than
 * the default, so their fuel items and the action types of their events show (about 3,200, 750
 * and 850 characters). `msm:hud`, `msm:creative_tab` and the bag and bundle components of
 * `msm:item` are complete within the defaults.
 *
 * Batch 2 (ADRs 0098 to 0100): `msm:entity` goes one level deeper so the levels of `msm:trader`
 * show `trade_set` and `xp_to_next` (about 5,000 characters), and `msm:fluid` so the action
 * types of its events show (about 850). `minecraft:dimension_type` keys its `attributes` by the
 * target's environment attributes (51 or 52), more than the default list and case bounds: 64
 * shows every id and case (about 9,800 characters). `msm:villager_profession`,
 * `minecraft:villager_trade`, `minecraft:trade_set` and `minecraft:tag/villager_trade` show
 * every field within the defaults (a trade's item components list their first ids, as every
 * item stack's do).
 *
 * Vanilla parity 3 batch 1 (B506): the five plant and pot types of ADR 0103, `block_sounds`,
 * own set types and the flattening and tilling components of ADR 0105 bring `msm:block` to
 * about 20,300 characters, so its allowance is 22,000. The addition kind
 * `msm:vanilla_block_rules` (ADR 0105 D4, B515) shows its six lists (strip, flatten, till, wax,
 * age, burn) within the defaults (about 600 characters). An own set type object and a chest's
 * `double` and `per_player` sit below the default depth (`{...}`), so the system prompt spells
 * them out (B522).
 *
 * Vanilla parity 3 batch 2 (B543): `msm:rules` has 62 triggers, 47 steps, 21 conditions and 14
 * values (B534) and its text is about 23,500 characters, so its lists and cases go to 80 and its
 * length to 27,000, with room for the next catalogue additions. `msm:entity` has 16 goal types
 * (ADR 0109 adds six) and 18 event action types: depth 7 with cases up to 24 shows every goal's
 * and action's fields, the bucket, the dash and the trader's reputation (about 11,100
 * characters). The fluid's mixing, cauldron and bottle, the item's `msm:boat` and boat
 * pictures, `msm:villager_type`, `msm:game_rule`, `msm:stat` and the hand-ordered
 * `msm:creative_tab` are complete within their bounds.
 */
export const KIND_SCHEMA_SUMMARY_ALLOWANCES: Readonly<
  Record<string, Readonly<SchemaSummaryOptions>>
> = Object.freeze({
  'msm:rules': Object.freeze({ maxDepth: 8, maxChars: 27_000, maxList: 80, maxCases: 80 }),
  'msm:block': Object.freeze({ maxDepth: 4, maxChars: 22_000, maxList: 48, maxCases: 48 }),
  'msm:vehicle': Object.freeze({ maxDepth: 5, maxChars: 6_000 }),
  'msm:key_bind': Object.freeze({ maxDepth: 5, maxChars: 3_000 }),
  // 44 argument types since B527 (plugin API 1.20.0): the list is shown whole.
  'msm:command': Object.freeze({ maxDepth: 5, maxChars: 4_000, maxList: 48 }),
  'msm:entity': Object.freeze({ maxDepth: 7, maxChars: 13_000, maxCases: 24 }),
  'msm:fluid': Object.freeze({ maxDepth: 5, maxChars: 3_000 }),
  'minecraft:dimension_type': Object.freeze({
    maxDepth: 4,
    maxChars: 14_000,
    maxList: 64,
    maxCases: 64,
  }),
});

/** The bounds of the `kind_schema` tool for `kindId`: its allowance, else the defaults. */
export function kindSchemaSummaryOptions(kindId: string): Readonly<SchemaSummaryOptions> {
  return KIND_SCHEMA_SUMMARY_ALLOWANCES[kindId] ?? KIND_SCHEMA_SUMMARY_OPTIONS;
}

/** Most enum values, dispatcher keys and union members listed inline, by default. */
const MAX_LIST = 40;

/** Most dispatcher cases rendered with their own structure, by default. */
const MAX_CASES = 16;

const TRUNCATED = '\n... (truncated; read a template with template_data for a full example)';

class Budget {
  readonly lines: string[] = [];
  readonly maxChars: number;
  #chars = 0;
  constructor(maxChars: number) {
    this.maxChars = maxChars;
  }
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

function listText(values: readonly string[], max: number): string {
  const shown = values.slice(0, max).join(' | ');
  return values.length > max ? `${shown} | ... (${values.length} in all)` : shown;
}

function rangeText(range: { min?: number; max?: number } | undefined): string {
  if (range === undefined || (range.min === undefined && range.max === undefined)) return '';
  return ` ${range.min ?? ''}..${range.max ?? ''}`;
}

/**
 * A one-line type for scalar nodes; `undefined` for nodes that need their own lines. `open`
 * holds the lists and unions being rendered further up, so a type that contains itself (such
 * as a text component inside `minecraft:villager_trade`) reads as `{...} (recursive)` instead
 * of recursing without end.
 */
function inlineType(
  node: SchemaNode,
  max = MAX_LIST,
  open: ReadonlySet<SchemaNode> = new Set(),
): string | undefined {
  if (open.has(node)) return '{...} (recursive)';
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
      return `enum(${listText(
        node.values.map((value) => JSON.stringify(value.value)),
        max,
      )})`;
    case 'any':
      return 'any';
    case 'unsupported':
      return 'any (not modelled)';
    case 'list': {
      const item = deref(node.item);
      const inner = item === undefined ? 'any' : inlineType(item, max, new Set(open).add(node));
      return inner === undefined ? undefined : `list<${inner}>${rangeText(node.lengthRange)}`;
    }
    case 'union': {
      const members = node.members.map(deref);
      const inside = new Set(open).add(node);
      const texts = members.map((member) =>
        member === undefined ? 'any' : inlineType(member, max, inside),
      );
      if (texts.some((text) => text === undefined)) return undefined;
      return listText(texts as string[], max);
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
  const maxList = options.maxList ?? MAX_LIST;
  const maxCases = options.maxCases ?? MAX_CASES;
  const inline = inlineType(resolved, maxList);
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
      for (const member of resolved.members.slice(0, maxList)) {
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
      const head = `depends on ${resolved.registry}${by}; cases: ${listText(keys, maxList)}`;
      for (const key of keys.slice(0, maxCases)) {
        if (budget.full) break;
        const member = resolved.dispatch(key);
        if (member === undefined) continue;
        child(
          `${indent}  case ${key}: `,
          member,
          depth + 1,
          `${indent}    `,
          budget,
          options,
          nextSeen,
        );
      }
      if (keys.length > maxCases) budget.push(`${indent}  (other cases not shown)`);
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
