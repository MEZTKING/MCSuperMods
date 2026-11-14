/**
 * The `resourcePacks` line of a game folder's `options.txt` (ADR 0084 D3, F21). Main keeps the
 * dev resource pack `file/msm-dev` enabled, last (so it wins), by changing only that line:
 * every other line, the line endings and a missing final newline are kept as they are.
 *
 * The line holds a JSON list such as `["vanilla","fabric","file/msm-dev"]`. When the file or
 * the line is missing (or the list cannot be read) the line is written with
 * {@link DEFAULT_RESOURCE_PACKS} before the pack, so the built-in packs stay first; the game
 * takes its defaults for every other key of a file holding only some keys (verify at
 * implementation, F21).
 */

/** The `options.txt` key. */
export const RESOURCE_PACKS_KEY = 'resourcePacks';

/**
 * The packs written before the dev pack when the line is new: vanilla's own pack and Fabric's
 * mod resources pack (`fabric`; verify at implementation that the game keeps its own order
 * for required packs).
 */
export const DEFAULT_RESOURCE_PACKS: readonly string[] = ['vanilla', 'fabric'];

/**
 * `options.txt` text with `pack` enabled last in `resourcePacks`. `null` (no file) gives a
 * file holding that line alone. An earlier copy of `pack` in the list is moved to the end;
 * text already in that state is returned unchanged.
 */
export function withResourcePack(text: string | null, pack: string): string {
  if (text === null || text === '') {
    return `${RESOURCE_PACKS_KEY}:${packList([...DEFAULT_RESOURCE_PACKS, pack])}\n`;
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  // Split keeping each line's own ending.
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|\r)|[^\r\n]+$/g) ?? [];
  const prefix = `${RESOURCE_PACKS_KEY}:`;
  let found = false;
  const out = lines.map((line) => {
    const body = line.replace(/(?:\r\n|\n|\r)$/, '');
    if (found || !body.startsWith(prefix)) return line;
    found = true;
    const ending = line.slice(body.length);
    const current = readList(body.slice(prefix.length));
    // Keep the original text when the pack is already last, once (whatever the spacing).
    if (current !== null && current.length > 0 && current.indexOf(pack) === current.length - 1) {
      return line;
    }
    const packs =
      current === null
        ? [...DEFAULT_RESOURCE_PACKS, pack]
        : [...current.filter((p) => p !== pack), pack];
    return `${prefix}${packList(packs)}${ending}`;
  });
  if (found) return out.join('');
  const last = lines.at(-1) ?? '';
  const needsBreak = !/(?:\r\n|\n|\r)$/.test(last);
  return `${text}${needsBreak ? eol : ''}${prefix}${packList([...DEFAULT_RESOURCE_PACKS, pack])}${eol}`;
}

/** The packs listed in an `options.txt` text's `resourcePacks` line, or `null` without one. */
export function readResourcePacks(text: string | null): string[] | null {
  if (text === null) return null;
  const prefix = `${RESOURCE_PACKS_KEY}:`;
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (line.startsWith(prefix)) return readList(line.slice(prefix.length));
  }
  return null;
}

function readList(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

function packList(packs: readonly string[]): string {
  return JSON.stringify(packs);
}
