/**
 * `server.properties` (B760 N11), written key by key: MSM sets only its own keys and keeps
 * every other line as it is. The server rewrites the whole file at every start (sorted keys,
 * comments dropped, `:` written `\:`), so MSM writes it only while the server is stopped (the
 * caller's duty: interop starts nothing) and keeps nothing in comments.
 *
 * A key of MSM's is written when the file does not have it, when its value is still the one
 * MSM wrote last (recorded in the server's marker), or when MSM never wrote it and it is the
 * game's own default; a value the user chose themselves is kept, unless the caller forces the key (a port found
 * taken). The game's defaults are those both targets' servers write (B760 N11).
 */

/** The usual Minecraft server port. */
export const DEFAULT_SERVER_PORT = 25565;

/** The `server.properties` file name. */
export const SERVER_PROPERTIES_FILE = 'server.properties';

/** The keys MSM writes, and nothing else. */
export const MSM_SERVER_KEYS = [
  'level-name',
  'level-type',
  'motd',
  'online-mode',
  'server-port',
  'spawn-protection',
  'white-list',
] as const;

/** One of {@link MSM_SERVER_KEYS}. */
export type MsmServerKey = (typeof MSM_SERVER_KEYS)[number];

/**
 * The values the game writes when a key is missing (both targets' servers; B760 N11). A
 * key still at its game default was not chosen by the user, so MSM may set it.
 */
export const GAME_PROPERTY_DEFAULTS: Readonly<Record<MsmServerKey, string>> = {
  'level-name': 'world',
  'level-type': 'minecraft:normal',
  motd: 'A Minecraft Server',
  'online-mode': 'true',
  'server-port': String(DEFAULT_SERVER_PORT),
  'spawn-protection': '16',
  'white-list': 'true',
};

/**
 * What MSM sets on a local server. Defaults (ADR 0133 D7, vetoable): online mode on, the white
 * list off (Play with friends is for people on the same network), no spawn protection (no
 * operators are set, so it would stop every player building near the spawn).
 */
export interface ServerSettings {
  /** The port (default {@link DEFAULT_SERVER_PORT}); the caller checks it is free. */
  port?: number;
  /** Default `true`: players sign in with their Microsoft account. */
  onlineMode?: boolean;
  /** Default `false`: anyone who can reach the server can join. */
  whiteList?: boolean;
  /** The world folder in the server folder (default `world`). */
  levelName?: string;
  /**
   * A world preset id for a new world (`minecraft:normal`, a game's own preset). Only used when
   * the server makes the world. Left as it is when not given.
   */
  levelType?: string;
  /** Default `0`. */
  spawnProtection?: number;
  /** The line players see in their server list. Left as it is when not given. */
  motd?: string;
}

const NAMESPACED_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/** The values for MSM's keys from `settings`, checked. Throws a plain `Error` on bad input. */
export function serverPropertyValues(
  settings: ServerSettings,
): Partial<Record<MsmServerKey, string>> {
  const port = settings.port ?? DEFAULT_SERVER_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${port} is not a port a server can listen on.`);
  }
  const spawn = settings.spawnProtection ?? 0;
  if (!Number.isInteger(spawn) || spawn < 0 || spawn > 1000) {
    throw new Error(`${spawn} is not a spawn protection size.`);
  }
  const values: Partial<Record<MsmServerKey, string>> = {
    'level-name': settings.levelName ?? 'world',
    'online-mode': String(settings.onlineMode ?? true),
    'server-port': String(port),
    'spawn-protection': String(spawn),
    'white-list': String(settings.whiteList ?? false),
  };
  if (settings.levelType !== undefined) {
    if (!NAMESPACED_ID.test(settings.levelType)) {
      throw new Error(`${JSON.stringify(settings.levelType)} is not a world preset id.`);
    }
    values['level-type'] = settings.levelType;
  }
  if (settings.motd !== undefined) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused
    if (settings.motd.length > 256 || /[\u0000-\u001f\u007f]/.test(settings.motd)) {
      throw new Error('The server list line has characters a server cannot show.');
    }
    values.motd = settings.motd;
  }
  return values;
}

/** One logical line of a properties file: its key and value, or `null` for a comment or blank. */
interface LogicalLine {
  /** The physical lines it spans (a value can continue over several). */
  raw: string[];
  entry: { key: string; value: string } | null;
}

function isWhite(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\f';
}

/** Whether a physical line continues on the next one (an odd number of trailing `\`). */
function continues(line: string): boolean {
  let count = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

function unescapeText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = text[++i];
    if (next === undefined) break;
    if (next === 't') out += '\t';
    else if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 'f') out += '\f';
    else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) {
      out += String.fromCharCode(Number.parseInt(text.slice(i + 1, i + 5), 16));
      i += 4;
    } else out += next;
  }
  return out;
}

/** Splits a logical line (continuations joined) into key and value, as `java.util.Properties`. */
function splitEntry(logical: string): { key: string; value: string } {
  let i = 0;
  while (isWhite(logical[i])) i++;
  const keyStart = i;
  let escaped = false;
  for (; i < logical.length; i++) {
    const char = logical[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') escaped = true;
    else if (char === '=' || char === ':' || isWhite(char)) break;
  }
  const key = logical.slice(keyStart, i);
  while (isWhite(logical[i])) i++;
  if (logical[i] === '=' || logical[i] === ':') {
    i++;
    while (isWhite(logical[i])) i++;
  }
  return { key: unescapeText(key), value: unescapeText(logical.slice(i)) };
}

function logicalLines(text: string): LogicalLine[] {
  const physical = text.replace(/^﻿/, '').split(/\r?\n/);
  if (physical.length > 0 && physical[physical.length - 1] === '') physical.pop();
  const out: LogicalLine[] = [];
  for (let i = 0; i < physical.length; i++) {
    const first = physical[i] as string;
    const trimmed = first.replace(/^[ \t\f]+/, '');
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      out.push({ raw: [first], entry: null });
      continue;
    }
    const raw = [first];
    let logical = first;
    while (continues(logical) && i + 1 < physical.length) {
      const next = physical[++i] as string;
      raw.push(next);
      logical = logical.slice(0, -1) + next.replace(/^[ \t\f]+/, '');
    }
    if (continues(logical)) logical = logical.slice(0, -1);
    out.push({ raw, entry: splitEntry(logical) });
  }
  return out;
}

/** Parses properties text; of two lines with the same key the last wins (as the game reads it). */
export function parseProperties(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of logicalLines(text)) {
    if (line.entry !== null) map.set(line.entry.key, line.entry.value);
  }
  return map;
}

function escapeText(text: string, isKey: boolean): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (char === '\\') out += '\\\\';
    else if (char === '\t') out += '\\t';
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === '\f') out += '\\f';
    else if (char === '=' || char === ':' || char === '#' || char === '!') out += `\\${char}`;
    else if (char === ' ' && (isKey || i === 0)) out += '\\ ';
    else out += char;
  }
  return out;
}

/** One `key=value` line as `java.util.Properties` writes it (`:` as `\:`). */
export function propertyLine(key: string, value: string): string {
  return `${escapeText(key, true)}=${escapeText(value, false)}`;
}

/**
 * `text` with each of `values` set: the last line defining a key is replaced, missing keys are
 * added at the end, and every other line (comments, other keys, earlier duplicates) is kept as
 * it was. `null` text starts an empty file. Line ends follow the file's (CRLF when it has them).
 */
export function setProperties(
  text: string | null,
  values: Readonly<Record<string, string>>,
): string {
  const source = text ?? '';
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = logicalLines(source);
  const lastIndex = new Map<string, number>();
  lines.forEach((line, index) => {
    if (line.entry !== null) lastIndex.set(line.entry.key, index);
  });
  const missing: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const index = lastIndex.get(key);
    if (index === undefined) missing.push(propertyLine(key, value));
    else (lines[index] as LogicalLine).raw = [propertyLine(key, value)];
  }
  const out = [...lines.flatMap((line) => line.raw), ...missing];
  return out.length === 0 ? '' : `${out.join(eol)}${eol}`;
}

/** What {@link applyServerProperties} wrote and kept. */
export interface AppliedServerProperties {
  /** The new file text (equal to the old one when nothing changed). */
  text: string;
  /** What MSM wrote for each of its keys, now or earlier: the record for the marker. */
  written: Partial<Record<MsmServerKey, string>>;
  /** MSM's keys the user had set themselves, kept as they were. */
  keptUserValues: MsmServerKey[];
  /** The values in effect for every key of MSM's that the file has. */
  effective: Partial<Record<MsmServerKey, string>>;
}

/**
 * Sets MSM's keys in `current` (the file's text, or `null` when there is none) to `wanted`:
 * a key is written when it is missing, still holds the value in `lastWritten` (what MSM wrote
 * before), still holds the game's default while MSM never wrote it, or is in `force`;
 * otherwise the user's value is kept. Keys outside {@link MSM_SERVER_KEYS} are refused; every other line is kept.
 */
export function applyServerProperties(
  current: string | null,
  wanted: Readonly<Partial<Record<MsmServerKey, string>>>,
  lastWritten: Readonly<Partial<Record<MsmServerKey, string>>>,
  force: ReadonlySet<MsmServerKey> = new Set(),
): AppliedServerProperties {
  for (const key of Object.keys(wanted)) {
    if (!(MSM_SERVER_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${key} is not a server setting MCSuperMods writes.`);
    }
  }
  const existing = parseProperties(current ?? '');
  const toWrite: Record<string, string> = {};
  const written: Partial<Record<MsmServerKey, string>> = {};
  const keptUserValues: MsmServerKey[] = [];
  for (const key of MSM_SERVER_KEYS) {
    const value = wanted[key];
    const last = lastWritten[key];
    // What MSM wrote stays recorded, so a value the user chose later is still known as theirs.
    if (last !== undefined) written[key] = last;
    if (value === undefined) continue;
    const now = existing.get(key);
    // The game's default counts as unchosen only for a key MSM never wrote: once MSM wrote
    // one, any other value is the user's, even the default (a white list turned back on).
    const free =
      now === undefined ||
      force.has(key) ||
      (last !== undefined ? now === last : now === GAME_PROPERTY_DEFAULTS[key]);
    if (free) {
      if (now !== value) toWrite[key] = value;
      written[key] = value;
    } else {
      keptUserValues.push(key);
    }
  }
  const text =
    Object.keys(toWrite).length === 0 && current !== null
      ? current
      : setProperties(current, toWrite);
  const after = parseProperties(text);
  const effective: Partial<Record<MsmServerKey, string>> = {};
  for (const key of MSM_SERVER_KEYS) {
    const value = after.get(key);
    if (value !== undefined) effective[key] = value;
  }
  return { text, written, keptUserValues, effective };
}
