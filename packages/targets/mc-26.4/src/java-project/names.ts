/**
 * Java identifiers derived from resource locations: constant names (`ruby_ore` to
 * `RUBY_ORE`), class names (`ruby_ore` to `RubyOreBlock`) and event method names
 * (`example:wake` to `event_wake`). Pure string functions; no version facts.
 *
 * @packageDocumentation
 */

/** Java reserved words and literals, which no generated identifier may equal. */
export const JAVA_KEYWORDS: ReadonlySet<string> = new Set([
  '_',
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'void',
  'volatile',
  'while',
]);

/** Splits a resource location into its namespace and path (`minecraft` when absent). */
export function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** The words of a string: runs of ASCII letters and digits. */
function words(value: string): string[] {
  return value.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
}

/**
 * A constant name from an id path: upper case, words joined with `_`; a leading digit gains
 * an `ID_` prefix. `ruby_ore` is `RUBY_ORE`, `ores/deep-ruby` is `ORES_DEEP_RUBY`.
 *
 * @param path - The path of a resource location (or any text).
 */
export function constantName(path: string): string {
  const name = words(path).join('_').toUpperCase();
  if (name === '') return 'ID';
  return /^[0-9]/.test(name) ? `ID_${name}` : name;
}

/**
 * A class name from an id path and a suffix: each word capitalised, then the suffix unless
 * the name already ends with it; a leading digit gains an `Id` prefix. `ruby_ore` with
 * `Block` is `RubyOreBlock`, `chime_block` with `Block` is `ChimeBlock`.
 *
 * @param path - The path of a resource location.
 * @param suffix - `Block`, `Item`, `Entity`, `Model` or empty.
 */
export function className(path: string, suffix: string): string {
  let name = words(path)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  if (name === '') name = 'Unnamed';
  if (/^[0-9]/.test(name)) name = `Id${name}`;
  return suffix !== '' && name.endsWith(suffix) ? name : `${name}${suffix}`;
}

/**
 * An event method name from an event id: `event_` and the path's words in lower case joined
 * with `_`. `example:wake` is `event_wake`. With `withNamespace`, the namespace is included
 * (`event_example_wake`), for events whose paths collide.
 *
 * @param id - The event id.
 * @param withNamespace - Whether to include the namespace.
 */
export function eventMethodName(id: string, withNamespace = false): string {
  const { namespace, path } = splitId(id);
  const parts = withNamespace ? [...words(namespace), ...words(path)] : words(path);
  return `event_${parts.join('_').toLowerCase() || 'unnamed'}`;
}

/**
 * Hands out unique names. A name is taken together with derived names (such as `X_KEY` for a
 * constant `X`), so two bases never produce clashing derived names; a clash appends `_2`,
 * `_3`, and so on (or `2`, `3` for class names).
 */
export class NameTable {
  private readonly used = new Set<string>();

  /** Reserves names that are already in use, such as fixed class names. */
  reserve(...names: string[]): void {
    for (const name of names) this.used.add(name);
  }

  /**
   * Takes a unique name based on `base`.
   *
   * @param base - The preferred name.
   * @param derived - Turns a candidate into every name it implies (including itself).
   * @param separator - Put between the base and the counter on a clash.
   */
  take(
    base: string,
    derived: (name: string) => string[] = (name) => [name],
    separator = '_',
  ): string {
    let candidate = base;
    for (let n = 2; derived(candidate).some((name) => this.used.has(name)); n++) {
      candidate = `${base}${separator}${n}`;
    }
    for (const name of derived(candidate)) this.used.add(name);
    return candidate;
  }
}

/** Event method names for one definition's event ids, unique within the definition. */
export function eventMethodNames(ids: readonly string[]): Map<string, string> {
  const plain = new Map<string, number>();
  for (const id of ids) {
    const name = eventMethodName(id);
    plain.set(name, (plain.get(name) ?? 0) + 1);
  }
  const table = new NameTable();
  const out = new Map<string, string>();
  for (const id of [...ids].sort()) {
    const short = eventMethodName(id);
    out.set(id, table.take((plain.get(short) ?? 0) > 1 ? eventMethodName(id, true) : short));
  }
  return out;
}
