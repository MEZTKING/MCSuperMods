/**
 * Command tree changes, from mcmeta's command report (`commands.json`).
 *
 * The report is normalised to one shape before diffing. Two formats are known:
 *
 * - **parser and properties** (every vendored target up to `26.4-snapshot-7`): an argument
 *   node carries `parser` and `properties` beside `type`, `children`, `executable` and
 *   `redirect`;
 * - **nested argument** (mcmeta from `26.4-snapshot-8`, B810 V4): an argument node carries
 *   `argument: { type, ...properties }` instead, and nodes may carry `permissions`.
 *
 * The nested shape is flattened to the first (`argument.type` becomes the parser) and
 * `permissions` is left out. The new format also renamed the argument types (`brigadier:bool`
 * became `minecraft:bool`, string types split into `word`, `quoted_string` and
 * `greedy_string`, `resource_key` became `resource`) and some entity and score-holder
 * properties; those renames are not mapped here, because no vendored report has the new
 * format yet: a diff across the two formats lists every renamed argument as changed (verify
 * at implementation, with the `sync-mcmeta` adapter B810 asks for).
 *
 * @packageDocumentation
 */

import { makeChange, sortedStrings } from './change.ts';
import type { TargetAddition, TargetChange } from './types.ts';

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
}

/** Which of the two known formats a report is in. */
export type CommandReportFormat = 'parser-properties' | 'nested-argument';

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

/** Canonical JSON with sorted keys, for property objects. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${sortedStrings(Object.keys(record))
      .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Every node of the tree as a path (`effect give <targets> <effect>`, arguments in angle
 * brackets) and a description: its parser and properties for an argument, `literal` for a
 * literal, then `exec` when it can end a command and `->` with the redirect.
 */
export function flattenCommands(root: CommandReportNode): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: CommandReportNode, path: string[]) => {
    for (const name of sortedStrings(Object.keys(node.children ?? {}))) {
      const child = node.children?.[name] as CommandReportNode;
      let parser = child.parser;
      let properties: Record<string, unknown> | undefined = child.properties;
      if (child.argument !== undefined && parser === undefined) {
        const { type, ...rest } = child.argument;
        parser = type;
        properties = Object.keys(rest).length > 0 ? rest : undefined;
      }
      const label = child.type === 'literal' ? name : `<${name}>`;
      const here = [...path, label];
      const description = [
        child.type === 'literal'
          ? 'literal'
          : `${parser ?? '?'}${properties === undefined ? '' : canonical(properties)}`,
        child.executable ? 'exec' : '',
        child.redirect ? `->${child.redirect.join(' ')}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      out.set(here.join(' '), description);
      walk(child, here);
    }
  };
  walk(root, []);
  return out;
}

/** The topmost paths of a list: those with no ancestor in it. */
function topmost(paths: readonly string[]): string[] {
  const set = new Set(paths);
  return paths.filter((p) => {
    const parts = p.split(' ');
    for (let i = 1; i < parts.length; i++) if (set.has(parts.slice(0, i).join(' '))) return false;
    return true;
  });
}

/** The command part of a diff. */
export interface CommandDiff {
  changes: TargetChange[];
  additions: TargetAddition[];
  formats: { before: CommandReportFormat; after: CommandReportFormat };
}

/**
 * Diffs two command reports. A removed root command is one `root-removed` change, a removed
 * sub-command or argument one `path-removed` at its topmost path; a node whose parser,
 * properties, executability or redirect changed is `argument-changed` with both descriptions
 * (a literal too: the plugin API has no other value for it). New paths are additions.
 */
export function diffCommands(before: CommandReportNode, after: CommandReportNode): CommandDiff {
  const a = flattenCommands(before);
  const b = flattenCommands(after);
  const removed = topmost(sortedStrings([...a.keys()].filter((k) => !b.has(k))));
  const added = topmost(sortedStrings([...b.keys()].filter((k) => !a.has(k))));
  const changes: TargetChange[] = [];
  for (const path of removed) {
    changes.push(
      makeChange({
        area: 'commands',
        what: path.includes(' ') ? 'path-removed' : 'root-removed',
        subject: path,
        handling: 'manual',
        source: 'commands',
      }),
    );
  }
  for (const path of sortedStrings(a.keys())) {
    const x = a.get(path);
    const y = b.get(path);
    if (y === undefined || x === y) continue;
    changes.push(
      makeChange({
        area: 'commands',
        what: 'argument-changed',
        subject: path,
        from: x as string,
        to: y,
        handling: 'none',
        source: 'commands',
      }),
    );
  }
  const additions: TargetAddition[] = added.map((path) => ({
    id: `commands:${path}`,
    area: 'commands',
    what: 'path-added',
    subject: path,
    source: 'commands',
  }));
  return {
    changes,
    additions,
    formats: { before: commandReportFormat(before), after: commandReportFormat(after) },
  };
}
