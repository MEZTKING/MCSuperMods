/**
 * The command report adapter (B831): converts mcmeta's command report from the format Mojang
 * uses from `26.4-snapshot-8` on to the format every vendored target and the vendored Spyglass
 * (`@spyglassmc/java-edition` 0.3.70) read.
 *
 * Two formats are known:
 *
 * - **parser and properties** (every report up to `26.4-snapshot-7`): an argument node carries
 *   `parser` and, when it has any, `properties` beside `type`, `children`, `executable` and
 *   `redirect`; a node carries `permissions` only when it needs one;
 * - **nested argument** (from `26.4-snapshot-8`): an argument node carries
 *   `argument: { type, ...properties }` instead, every node carries `permissions`
 *   (`minecraft:always_pass` when it needs none) and some carry `custom_suggestion`.
 *
 * The nested format also renamed and reshaped argument types. Checked node by node against the
 * real reports of `26.4-snapshot-7` and `26.4-pre-1` (all 2,474 nodes; B831) and against
 * Spyglass's own forward migration (`@spyglassmc/java-edition` 0.3.74,
 * `lib/mcfunction/tree/migrations.js`):
 *
 * | Nested format | Parser and properties |
 * |---|---|
 * | `minecraft:bool`, `double`, `float`, `integer`, `long` | `brigadier:bool` and the rest, `min`/`max` kept |
 * | `minecraft:word`, `quoted_string`, `greedy_string` | `brigadier:string` with `type` `word`, `phrase`, `greedy` |
 * | `minecraft:entity` `players_only`, `single_result` | `type` `players` or `entities`, `amount` `single` or `multiple` |
 * | `minecraft:score_holder` `multiple` | `amount` `multiple` or `single` |
 * | `minecraft:time` without `min` | `min` -2147483648 (the old report always wrote it) |
 * | `minecraft:resource`, `resource_or_tag` | unchanged: Mojang merged `resource_key` and `resource_or_tag_key` into them |
 *
 * Mojang's merge of the key types cannot be undone from the report, and needs not be: the
 * vendored checker parses `resource_key` and `resource` alike. Properties the old format never
 * had and the vendored checker never reads are dropped and counted: `context` (loot tables,
 * modifiers, predicates, slot sources and the context providers), `auto_center` (`vec2`,
 * `vec3`), `custom_suggestion` and `minecraft:always_pass` permissions. A converted
 * `26.4-pre-1` report then equals `26.4-snapshot-7`'s but for the 13 nodes of the merged key
 * types. A node already in the old format is left as it is, so the adapter is idempotent.
 *
 * The input is untrusted data: it is only read and copied, never executed.
 *
 * @packageDocumentation
 */

/** A node of mcmeta's command report, in either format. */
export interface CommandReportNode {
  type?: string;
  children?: Record<string, CommandReportNode>;
  executable?: boolean;
  parser?: string;
  properties?: Record<string, unknown>;
  redirect?: string[];
  /** The nested-argument format's argument: its `type` and properties. */
  argument?: { type: string; [property: string]: unknown };
  permissions?: unknown;
  custom_suggestion?: unknown;
}

/** Which of the two known formats a report is in. */
export type CommandReportFormat = 'parser-properties' | 'nested-argument';

/** The nested format's number and boolean types and the Brigadier names they replaced. */
export const LEGACY_PARSER_OF: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:bool': 'brigadier:bool',
  'minecraft:double': 'brigadier:double',
  'minecraft:float': 'brigadier:float',
  'minecraft:integer': 'brigadier:integer',
  'minecraft:long': 'brigadier:long',
});

/** The nested format's string types and the `brigadier:string` `type` each replaced. */
export const LEGACY_STRING_TYPE_OF: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:word': 'word',
  'minecraft:quoted_string': 'phrase',
  'minecraft:greedy_string': 'greedy',
});

/** `minecraft:time`'s `min` when the nested format leaves it out (Java's `Integer.MIN_VALUE`). */
export const TIME_DEFAULT_MIN = -2147483648;

/** Argument properties only the nested format has, which the vendored checker never reads. */
export const DROPPED_ARGUMENT_PROPERTIES: readonly string[] = Object.freeze([
  'auto_center',
  'context',
]);

/** The permission the nested format writes on a node that needs none. */
const ALWAYS_PASS = 'minecraft:always_pass';

/** What the adapter did to a report. */
export interface CommandAdaptation {
  /** The format the report came in. */
  format: CommandReportFormat;
  /** Argument nodes converted from the nested format. */
  converted: number;
  /** Type renames applied, `from -> to` with a count, sorted. */
  renamed: Record<string, number>;
  /** Keys left out (`context`, `auto_center`, `custom_suggestion`, `permissions`), with counts. */
  dropped: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether any node of the report nests its argument under `argument`. */
export function commandReportFormat(root: CommandReportNode): CommandReportFormat {
  const stack: CommandReportNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as CommandReportNode;
    if (node.argument !== undefined) return 'nested-argument';
    for (const child of Object.values(node.children ?? {})) stack.push(child);
  }
  return 'parser-properties';
}

/** A converted argument: the old format's `parser` and `properties`, and what was left out. */
export interface LegacyArgument {
  parser: string;
  /** Absent when empty, as in the old report (the checker reads an empty object differently). */
  properties?: Record<string, unknown>;
  /** Property names left out. */
  dropped: string[];
}

/**
 * Converts one nested-format argument (`{ type, ...properties }`) to the old format's parser
 * and properties. Unknown types and properties pass through unchanged; the entity and score
 * holder properties are mapped only when the nested ones are present.
 */
export function legacyArgument(argument: {
  type: string;
  [property: string]: unknown;
}): LegacyArgument {
  const { type, ...rest } = argument;
  const dropped: string[] = [];
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (DROPPED_ARGUMENT_PROPERTIES.includes(key)) dropped.push(key);
    else properties[key] = value;
  }
  let parser = type;
  const legacyNumber = LEGACY_PARSER_OF[type];
  const legacyString = LEGACY_STRING_TYPE_OF[type];
  if (legacyNumber !== undefined) {
    parser = legacyNumber;
  } else if (legacyString !== undefined) {
    parser = 'brigadier:string';
    properties.type = legacyString;
  } else if (
    type === 'minecraft:entity' &&
    ('players_only' in properties || 'single_result' in properties)
  ) {
    const { players_only: playersOnly, single_result: singleResult } = properties;
    delete properties.players_only;
    delete properties.single_result;
    properties.amount = singleResult === true ? 'single' : 'multiple';
    properties.type = playersOnly === true ? 'players' : 'entities';
  } else if (type === 'minecraft:score_holder' && 'multiple' in properties) {
    const { multiple } = properties;
    delete properties.multiple;
    properties.amount = multiple === true ? 'multiple' : 'single';
  } else if (type === 'minecraft:time' && !('min' in properties)) {
    properties.min = TIME_DEFAULT_MIN;
  }
  const result: LegacyArgument = { parser, dropped };
  if (Object.keys(properties).length > 0) result.properties = properties;
  return result;
}

function count(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function sortedCounts(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * Converts a command report to the parser-and-properties format (see the module comment).
 * Returns a new tree; the input is not changed. A report already in that format comes back
 * equal to the input.
 *
 * @throws Error - When the report is not an object.
 */
export function adaptCommandReport(report: unknown): {
  tree: CommandReportNode;
  adaptation: CommandAdaptation;
} {
  if (!isRecord(report)) throw new Error('commands.json: expected a JSON object');
  const root = report as CommandReportNode;
  const adaptation: CommandAdaptation = {
    format: commandReportFormat(root),
    converted: 0,
    renamed: {},
    dropped: {},
  };

  const convert = (node: CommandReportNode): CommandReportNode => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'children' || key === 'argument') continue;
      if (key === 'custom_suggestion') {
        count(adaptation.dropped, key);
        continue;
      }
      if (key === 'permissions' && isRecord(value) && value.type === ALWAYS_PASS) {
        count(adaptation.dropped, key);
        continue;
      }
      out[key] = value;
    }
    if (node.argument !== undefined && node.parser === undefined && isRecord(node.argument)) {
      const argument = node.argument;
      const legacy = legacyArgument(argument);
      out.parser = legacy.parser;
      if (legacy.properties !== undefined) out.properties = legacy.properties;
      for (const key of legacy.dropped) count(adaptation.dropped, key);
      if (legacy.parser !== argument.type)
        count(adaptation.renamed, `${argument.type} -> ${legacy.parser}`);
      adaptation.converted += 1;
    } else if (node.argument !== undefined) {
      // Both shapes on one node: the old one wins, as the checker reads it.
      count(adaptation.dropped, 'argument');
    }
    if (node.children !== undefined) {
      const children: Record<string, CommandReportNode> = {};
      for (const [name, child] of Object.entries(node.children)) {
        children[name] = isRecord(child) ? convert(child) : child;
      }
      out.children = children;
    }
    return out as CommandReportNode;
  };

  const tree = convert(root);
  adaptation.renamed = sortedCounts(adaptation.renamed);
  adaptation.dropped = sortedCounts(adaptation.dropped);
  return { tree, adaptation };
}
