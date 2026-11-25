/**
 * Command tree changes, from mcmeta's command report (`commands.json`).
 *
 * The report is normalised to one shape before diffing. Two formats are known (see
 * `tools/sync-mcmeta/commands.ts`): **parser and properties** (every vendored target) and
 * **nested argument** (mcmeta from `26.4-snapshot-8`). A nested argument is converted with
 * `sync-mcmeta`'s adapter (`legacyArgument`), renames and reshapes included, so the format alone
 * is no change: a diff across the two formats lists only what Mojang changed (for
 * `26.4-snapshot-7` to `26.4-pre-1`, the 13 nodes of the merged key types `resource_key` and
 * `resource_or_tag_key`). `permissions`, `custom_suggestion` and the properties the adapter drops
 * are left out. Since `sync-mcmeta` converts every report it vendors, a vendored target is
 * always in the first format; the nested path serves raw reports.
 *
 * @packageDocumentation
 */

import {
  type CommandReportFormat,
  type CommandReportNode,
  commandReportFormat,
  legacyArgument,
} from '../sync-mcmeta/commands.ts';
import { makeChange, sortedStrings } from './change.ts';
import type { TargetAddition, TargetChange } from './types.ts';

export { type CommandReportFormat, type CommandReportNode, commandReportFormat };

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
        const legacy = legacyArgument(child.argument);
        parser = legacy.parser;
        properties = legacy.properties;
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
