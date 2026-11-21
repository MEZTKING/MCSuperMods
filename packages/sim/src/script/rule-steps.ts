/**
 * Rule steps in Try it (B401, ADR 0085 D9 slice 4): a script Rules generated (ADR 0082 D3) is
 * instrumented in place before it is transpiled, so the shim can say each step of a logic rule
 * under the rule's name in "What happened": the conditions checked, chances rolled, loops, waits,
 * and which rule (and step) an error stopped.
 *
 * Only the lines with a `// rule:<key>` marker are touched, and only in the shapes the compiler
 * writes them (`packages/plugins/rules/src/compile/script.ts`); every other line, and any shape
 * not recognised, is left as it is, so a compiler change makes the preview say less, never run
 * differently. No line is added or removed, so transpile problems keep their line numbers.
 *
 * The hooks come from the shim's module `msm:try-it` (`tryIt`), imported on the line of the
 * script's own `msm:runtime` import:
 *
 * - `rule(key, () => {` becomes `__tryIt.rule(key, () => {`: the rule runs with its key known
 *   (so every op, line and `msm.schedule` callback of it carries the key), and an error stops
 *   only that rule, as the script's own `rule` helper does, but is said by the rule's name.
 * - `if (!(C)) return;` (the rule's `only if`) and `if (C) {` (an `if` step) check `C` through
 *   `__tryIt.check`; `Math.random() * 100 < P` (a `chance` condition with a number) through
 *   `__tryIt.chance(P)`, which follows the area's "Run every time".
 * - `for (let count = 0; count < N; ...)` and `if (count >= N) {` (a `repeat`, plain or with a
 *   wait inside) count through `__tryIt.repeat`; `L.forEach((player) => {` and
 *   `const playersN = L;` (a `for each player`) through `__tryIt.each`.
 * - `if (gone(...)) return;` after a wait through `__tryIt.gone`.
 *
 * Waits are the shim's `msm.schedule` on the area's clock, which says them by itself.
 */

/** The module the hooks come from. */
export const TRY_IT_MODULE = 'msm:try-it';

const BOOK_LINE = /^\/\/ Made by Rules from ([a-z0-9_.-]+:[a-z0-9_./-]+);/;
const MARKED = /^(\s*)(.*?)( \/\/ rule:[A-Za-z0-9_.-]+)$/;
const IMPORT = /^import \{ msm \} from "msm:runtime";$/;
const CHANCE = /Math\.random\(\) \* 100 < (\d+(?:\.\d+)?)(?![\d.])/g;

/** Whether `source` is a script Rules generated. */
export const isRuleScript = (source: string): boolean => BOOK_LINE.test(source);

/**
 * The generated Rules script `source` with its rule steps instrumented (see the module comment);
 * any other script comes back unchanged.
 */
export function instrumentRuleScript(source: string): string {
  if (!isRuleScript(source)) return source;
  const lines = source.split('\n');
  const importAt = lines.findIndex((line) => IMPORT.test(line));
  if (importAt < 0) return source;
  lines[importAt] =
    `${lines[importAt]} import { tryIt as __tryIt } from ${JSON.stringify(TRY_IT_MODULE)};`;
  lines.forEach((line, index) => {
    const match = MARKED.exec(line);
    if (match === null) return;
    const indent = match[1] as string;
    const code = match[2] as string;
    const marker = match[3] as string;
    const changed = instrumentLine(code, () => hasOtherwise(lines, index, indent, marker));
    if (changed !== code) lines[index] = `${indent}${changed}${marker}`;
  });
  return lines.join('\n');
}

/** Whether the `if (...) {` at `index` has an `} else {` at its own depth before it closes. */
function hasOtherwise(lines: readonly string[], index: number, indent: string, marker: string) {
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines[at] as string;
    if (!line.endsWith(marker)) return false;
    if (line === `${indent}} else {${marker}`) return true;
    if (line.startsWith(`${indent}}`)) return false;
  }
  return false;
}

/** The shapes instrumented, in order: the first that matches a line wins. */
const SHAPES: readonly {
  readonly pattern: RegExp;
  readonly to: (match: RegExpExecArray, otherwise: () => boolean) => string;
}[] = [
  { pattern: /^rule\((".*?"), \(\) => \{$/, to: (m) => `__tryIt.rule(${m[1]}, () => {` },
  {
    pattern: /^if \(!\((.*)\)\) return;$/,
    to: (m) => `if (!__tryIt.check("only", (${m[1]}))) return;`,
  },
  {
    pattern: /^if \(((?:gone\([a-z]+\)(?: \|\| )?)+)\) return;$/,
    to: (m) => `if (__tryIt.gone(${m[1]})) return;`,
  },
  { pattern: /^if \(count >= (\d+)\) \{$/, to: (m) => `if (!__tryIt.repeat(count, ${m[1]})) {` },
  { pattern: /^(if \(index >= [A-Za-z0-9_]+\.length\) \{)$/, to: (m) => m[1] as string },
  {
    pattern: /^if \((.*)\) \{$/,
    to: (m, otherwise) => `if (__tryIt.check("if", (${m[1]}), ${otherwise()})) {`,
  },
  {
    pattern: /^for \(let count = 0; count < (\d+); count \+= 1\) \{$/,
    to: (m) => `for (let count = 0; __tryIt.repeat(count, ${m[1]}); count += 1) {`,
  },
  {
    pattern: /^(.*)\.forEach\(\(player\) => \{$/,
    to: (m) => `__tryIt.each(${m[1]}).forEach((player) => {`,
  },
  {
    pattern: /^const (players\d+) = (.*);$/,
    to: (m) => `const ${m[1]} = __tryIt.each(${m[2]});`,
  },
];

function instrumentLine(code: string, otherwise: () => boolean): string {
  const text = code.replace(CHANCE, (_whole, percent: string) => `__tryIt.chance(${percent})`);
  for (const shape of SHAPES) {
    const match = shape.pattern.exec(text);
    if (match !== null) return shape.to(match, otherwise);
  }
  return text;
}
