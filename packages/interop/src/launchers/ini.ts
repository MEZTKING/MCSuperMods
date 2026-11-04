/**
 * A tolerant reader for the Qt `QSettings` INI files Prism Launcher and MultiMC write
 * (`prismlauncher.cfg`, `multimc.cfg`, `instance.cfg`).
 */

/** A parsed INI file. Keys in `[General]` or before any section are bare; others are `Section/key`. */
export interface IniFile {
  /** The decoded value: surrounding quotes removed, escapes resolved. */
  get(key: string): string | undefined;
  /**
   * The value as a Qt string list: split on commas outside quotes, each item trimmed and
   * decoded, empty items dropped. Qt writes lists as `a, b, "c, d"` (verify at implementation).
   */
  list(key: string): string[];
  /** Every key, in file order. */
  keys(): string[];
}

/**
 * Parses INI text. Tolerates a `[General]` header or none (older Prism and MultiMC files have
 * none; verify at implementation), `;` and `#` comment lines, CRLF line ends, a byte-order
 * mark, quoted values and Qt escapes (`\\`, `\"`, `\n`, `\t`, `\r`, `\0` and `\xNNNN` for
 * non-ASCII characters; verify at implementation). Later duplicates win.
 */
export function parseIni(text: string): IniFile {
  const raw = new Map<string, string>();
  let section = '';
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
    const header = /^\[(.*)\]$/.exec(trimmed);
    if (header !== null) {
      section = (header[1] ?? '').trim();
      if (section.toLowerCase() === 'general') section = '';
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const key = section === '' ? name : `${section}/${name}`;
    raw.set(key, trimmed.slice(eq + 1).trim());
  }
  return {
    get(key) {
      const value = raw.get(key);
      return value === undefined ? undefined : decodeIniValue(value, false).join('');
    },
    list(key) {
      const value = raw.get(key);
      if (value === undefined) return [];
      return decodeIniValue(value, true)
        .map((item) => item.trim())
        .filter((item) => item !== '');
    },
    keys() {
      return [...raw.keys()];
    },
  };
}

/** Decodes a raw value; with `split`, unquoted commas separate items. */
function decodeIniValue(value: string, split: boolean): string[] {
  const items: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] as string;
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1] as string;
      i++;
      switch (next) {
        case 'n':
          current += '\n';
          break;
        case 't':
          current += '\t';
          break;
        case 'r':
          current += '\r';
          break;
        case '0':
          current += '\0';
          break;
        case 'x': {
          const hex = /^[0-9A-Fa-f]{1,4}/.exec(value.slice(i + 1));
          if (hex === null) {
            current += 'x';
          } else {
            current += String.fromCharCode(Number.parseInt(hex[0], 16));
            i += hex[0].length;
          }
          break;
        }
        default:
          current += next;
      }
      continue;
    }
    if (split && !quoted && ch === ',') {
      items.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  items.push(current);
  return items;
}
