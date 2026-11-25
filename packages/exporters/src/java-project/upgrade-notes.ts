/**
 * Upgrade notes for an ejected Java project (ADR 0136 D8, brief B822). MCSuperMods does not own
 * an ejected project's Java, so a move to another Minecraft version only advises: one Markdown
 * file the user saves where they choose, built from facts and from a read-only scan of the
 * project folder (B810 V16):
 *
 * - the build lines that change: every line of the Gradle files, `fabric.mod.json`, the wrapper
 *   properties, `README.md` and `LICENSE-NOTES.md` that names a version the two targets' facts
 *   give differently (Minecraft, Fabric Loader, Loom, Fabric API, the `minecraft` dependency,
 *   Gradle, Java, GeckoLib), with the line as it is and as it should be;
 * - the removed and renamed ids, removed commands and changed formats found in
 *   `src/main/resources` (`data/` and `assets/`), with file and line: `@msm/core`'s
 *   `matchChanges` (the walk the upgrade report uses) over each file read as one element, and the
 *   token search of ids inside longer text (ADR 0136 D3);
 * - the change sets' Java notes (area `java`), or that there are none;
 * - whether MCSuperMods can eject for the newer version (a target fact the host passes), and the
 *   advice to export again into a new folder where the Java was not edited by hand.
 *
 * Pure: no file system. The host scans (only the paths {@link isUpgradeScanPath} accepts) and
 * writes the notes. Every version in the text comes from the facts; nothing here names one.
 *
 * @packageDocumentation
 */

import { matchChanges } from '@msm/core';
import type {
  Element,
  Json,
  Project,
  ResourceLocation,
  TargetChange,
  TargetChangeSet,
  TargetFacts,
} from '@msm/plugin-api';
import { EXPORT_MANIFEST_FILE } from '../manifest';

/** One text file of the scanned project, its path relative to the project folder with `/`. */
export interface UpgradeScanFile {
  path: string;
  text: string;
}

/** What a read-only scan of an ejected Java project found. */
export interface JavaProjectScan {
  /** The project folder, as the user chose it (shown in the notes, never written). */
  folder: string;
  /** The files {@link isUpgradeScanPath} accepts, sorted by path. */
  files: UpgradeScanFile[];
  /** How many `.java` files the project has (counted, never read). */
  javaFiles: number;
  /** Set when the scan stopped at a limit of {@link UPGRADE_SCAN_LIMITS}. */
  truncated?: boolean;
}

/** The scan's limits: files read, bytes per file, bytes in all. */
export const UPGRADE_SCAN_LIMITS = {
  maxFiles: 8000,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  /** Folders deeper than this are not entered. */
  maxDepth: 24,
} as const;

/** The project files that name versions (B810 V16), by path from the project folder. */
export const UPGRADE_BUILD_FILES: readonly string[] = [
  'gradle.properties',
  'build.gradle.kts',
  'settings.gradle.kts',
  'gradle/wrapper/gradle-wrapper.properties',
  'src/main/resources/fabric.mod.json',
  'README.md',
  'LICENSE-NOTES.md',
];

const RESOURCES = 'src/main/resources/';
const RESOURCE_FILE =
  /^src\/main\/resources\/(data|assets)\/[a-z0-9_.-]+\/.+\.(json|mcfunction|mcmeta)$/;

/** Whether a read-only scan reads the file at `path` (relative, `/`-separated). */
export function isUpgradeScanPath(path: string): boolean {
  return (
    UPGRADE_BUILD_FILES.includes(path) || path === EXPORT_MANIFEST_FILE || RESOURCE_FILE.test(path)
  );
}

/** Whether `path` is a Java source the scan counts (and never reads). */
export function isJavaSourcePath(path: string): boolean {
  return path.startsWith('src/') && path.endsWith('.java');
}

/**
 * Whether the user changed the project's Java by hand: `yes`, `no`, or `unknown` (nothing
 * records it, B810 V16, so only the user can say).
 */
export type JavaEditedByHand = 'yes' | 'no' | 'unknown';

/** What {@link upgradeNotes} needs. */
export interface UpgradeNotesInput {
  scan: JavaProjectScan;
  /** The target the project was ejected for (the move's start). */
  from: TargetFacts;
  /** The target moved to (the move's end). */
  to: TargetFacts;
  /**
   * Whether MCSuperMods can export a Java project for {@link to}: the target has
   * `javaProject` or `loadJavaProject`.
   */
  canEject: boolean;
  /** The change sets of the move's hops, in order. */
  changeSets: readonly TargetChangeSet[];
  javaEdited: JavaEditedByHand;
}

/** One version fact the two targets give differently. */
export interface VersionFactChange {
  /** What it is, in plain words: `Minecraft`, `Fabric Loader`, `Java`… */
  label: string;
  from: string;
  /** `undefined` when the newer target has none (GeckoLib without a build). */
  to: string | undefined;
}

/** One line of a build file that names a version that changes. */
export interface BuildLineNote {
  file: string;
  /** From 1. */
  line: number;
  /** The line as it is. */
  now: string;
  /** The line with the newer versions; `undefined` when one of them has no value there. */
  next: string | undefined;
  /** The labels of the facts the line names. */
  facts: string[];
}

/** One place in the project's data or assets that a change touches. */
export interface FoundChangeNote {
  file: string;
  /** From 1. */
  line: number;
  /** The change's id in its change set. */
  changeId: string;
  /** The target the change set leads to. */
  targetId: string;
  /** What is written there, when the change is an id: as written (`#`, namespace). */
  written?: string;
  /** The plain sentence for the change. */
  sentence: string;
  /** How to make the change by hand, when the change set says. */
  hint?: string;
  /** The likely new name or names, when the change set records them. */
  to?: string[];
}

/** One Java note of a change set (area `java`). */
export interface JavaNote {
  changeId: string;
  sentence: string;
  hint?: string;
}

/** The advice the notes open with. */
export type UpgradeAdvice =
  /** MCSuperMods cannot eject for the newer version: change by hand. */
  | 'by-hand'
  /** The Java was not edited by hand: export again into a new folder. */
  | 'eject-again'
  /** The Java was edited by hand: change by hand, or export again and carry the edits over. */
  | 'edited'
  /** Not known whether the Java was edited: both, conditionally. */
  | 'eject-again-if-not-edited';

/** The notes, before they are written as Markdown. */
export interface UpgradeNotes {
  fromVersion: string;
  toVersion: string;
  /** The mod's name from `fabric.mod.json`, else its id, else the folder's last name. */
  modName: string;
  advice: UpgradeAdvice;
  canEject: boolean;
  /** The version the folder says it was made for (`msm.export.json`), when it says. */
  madeFor?: string;
  /** Whether that differs from the move's start. */
  madeForOther: boolean;
  /** Whether the folder looks like an ejected project (a Gradle properties file or the manifest). */
  looksEjected: boolean;
  facts: VersionFactChange[];
  buildLines: BuildLineNote[];
  found: FoundChangeNote[];
  javaNotes: JavaNote[];
  /** Data files the scan could not read as JSON. */
  unreadable: string[];
  javaFiles: number;
  truncated: boolean;
}

/** The version facts the two targets give differently, in a fixed order. */
export function versionFactChanges(from: TargetFacts, to: TargetFacts): VersionFactChange[] {
  const out: VersionFactChange[] = [];
  const add = (label: string, a: string | undefined, b: string | undefined): void => {
    if (a !== undefined && a !== b) out.push({ label, from: a, to: b });
  };
  add('Minecraft', from.mcVersion, to.mcVersion);
  add('Fabric Loader', from.fabric?.loader, to.fabric?.loader);
  add('Fabric Loom', from.fabric?.loom, to.fabric?.loom);
  add('Fabric API', from.fabric?.api, to.fabric?.api);
  add(
    'the Minecraft versions the mod accepts',
    from.fabric?.minecraftDependency,
    to.fabric?.minecraftDependency,
  );
  add('Gradle', from.fabric?.gradle, to.fabric?.gradle);
  add('Java', String(from.java), String(to.java));
  const geckoFrom = from.geckolib?.modrinthVersionId ?? from.geckolib?.version;
  const geckoTo = to.geckolib?.modrinthVersionId ?? to.geckolib?.version;
  add('GeckoLib (Modrinth version)', geckoFrom, geckoTo);
  if (from.geckolib?.version !== geckoFrom) {
    add('GeckoLib', from.geckolib?.version, to.geckolib?.version);
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A version written as such: not part of a longer number or name. */
function versionPattern(text: string): string {
  return `(?<![0-9A-Za-z.])${escapeRegExp(text)}(?![0-9A-Za-z])`;
}

/** The Java version as Gradle files and the README name it. */
const JAVA_FORMS: readonly ((java: string) => string)[] = [
  (java) => `release = ${java}`,
  (java) => `VERSION_${java}`,
  (java) => `JDK ${java}`,
];

/** Every line of the build files naming a fact that changes, with its replacement. */
export function buildLineNotes(
  files: readonly UpgradeScanFile[],
  facts: readonly VersionFactChange[],
): BuildLineNote[] {
  const pairs: { pattern: string; from: string; to: string | undefined; label: string }[] = [];
  for (const fact of facts) {
    if (fact.label === 'Java') {
      for (const form of JAVA_FORMS) {
        pairs.push({
          pattern: `${escapeRegExp(form(fact.from))}(?![0-9])`,
          from: form(fact.from),
          to: fact.to === undefined ? undefined : form(fact.to),
          label: fact.label,
        });
      }
    } else {
      pairs.push({
        pattern: versionPattern(fact.from),
        from: fact.from,
        to: fact.to,
        label: fact.label,
      });
    }
  }
  if (pairs.length === 0) return [];
  // Longest first, so `<api>+<game>` is replaced whole before the game version alone.
  pairs.sort((a, b) => b.from.length - a.from.length);
  const pattern = new RegExp(pairs.map((pair) => `(${pair.pattern})`).join('|'), 'g');
  const out: BuildLineNote[] = [];
  for (const path of UPGRADE_BUILD_FILES) {
    const file = files.find((candidate) => candidate.path === path);
    if (file === undefined) continue;
    file.text.split(/\r?\n/).forEach((now, index) => {
      const labels = new Set<string>();
      let missing = false;
      const next = now.replace(pattern, (...match: unknown[]) => {
        const groups = match.slice(1, pairs.length + 1) as (string | undefined)[];
        const pair = pairs[groups.findIndex((group) => group !== undefined)];
        if (pair === undefined) return String(match[0]);
        labels.add(pair.label);
        if (pair.to === undefined) {
          missing = true;
          return String(match[0]);
        }
        return pair.to;
      });
      if (labels.size === 0) return;
      out.push({
        file: path,
        line: index + 1,
        now,
        next: missing ? undefined : next,
        facts: [...labels],
      });
    });
  }
  return out;
}

/** The line (from 1) where each JSON value starts, by RFC 6901 pointer; `null` if not JSON. */
export function jsonValueLines(text: string): Map<string, number> | null {
  const lines = new Map<string, number>();
  let at = 0;
  let line = 1;
  const fail = (): never => {
    throw new SyntaxError('not JSON');
  };
  const space = (): void => {
    while (at < text.length) {
      const char = text[at];
      if (char === '\n') line++;
      else if (char !== ' ' && char !== '\t' && char !== '\r') break;
      at++;
    }
  };
  const string = (): string => {
    const start = at;
    at++;
    while (at < text.length && text[at] !== '"') {
      if (text[at] === '\\') at++;
      else if (text[at] === '\n') fail();
      at++;
    }
    if (at >= text.length) fail();
    at++;
    return JSON.parse(text.slice(start, at)) as string;
  };
  const escapeSegment = (segment: string): string =>
    segment.replaceAll('~', '~0').replaceAll('/', '~1');
  const value = (pointer: string): void => {
    space();
    lines.set(pointer, line);
    const char = text[at];
    if (char === '{') {
      at++;
      space();
      if (text[at] === '}') {
        at++;
        return;
      }
      for (;;) {
        space();
        if (text[at] !== '"') fail();
        const key = string();
        space();
        if (text[at] !== ':') fail();
        at++;
        value(`${pointer}/${escapeSegment(key)}`);
        space();
        if (text[at] === ',') {
          at++;
          continue;
        }
        if (text[at] === '}') {
          at++;
          return;
        }
        fail();
      }
    }
    if (char === '[') {
      at++;
      space();
      if (text[at] === ']') {
        at++;
        return;
      }
      for (let index = 0; ; index++) {
        value(`${pointer}/${index}`);
        space();
        if (text[at] === ',') {
          at++;
          continue;
        }
        if (text[at] === ']') {
          at++;
          return;
        }
        fail();
      }
    }
    if (char === '"') {
      string();
      return;
    }
    const literal =
      /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
        text.slice(at, at + 64),
      );
    if (literal === null) fail();
    at += (literal as RegExpExecArray)[0].length;
  };
  try {
    if (text.charCodeAt(0) === 0xfeff) at = 1;
    value('');
    space();
    if (at !== text.length) fail();
  } catch {
    return null;
  }
  return lines;
}

/** A `minecraft:` id inside text, as the migration engine's token search finds it (ADR 0136 D3). */
const TEXT_ID = /(?<![A-Za-z0-9_.:/#-])(#?)minecraft:([a-z0-9_./-]+)/g;

/** The removed or renamed member of an `ids` change, or `undefined`. */
function removedMember(change: TargetChange): { token: string; tag: boolean } | undefined {
  if (change.area !== 'ids') return undefined;
  if (change.what !== 'member-removed' && change.what !== 'member-renamed') return undefined;
  const registry = change.registry;
  if (registry === undefined || !change.subject.startsWith(`${registry}/`)) return undefined;
  const tag = registry.startsWith('tag/');
  return { token: `${tag ? '#' : ''}${change.subject.slice(registry.length + 1)}`, tag };
}

function stringsOf(
  node: Json,
  segments: string,
  visit: (value: string, pointer: string) => void,
): void {
  if (typeof node === 'string') visit(node, segments);
  else if (Array.isArray(node)) {
    node.forEach((item, index) => {
      stringsOf(item, `${segments}/${index}`, visit);
    });
  } else if (node !== null && typeof node === 'object') {
    for (const [key, item] of Object.entries(node)) {
      stringsOf(item, `${segments}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`, visit);
    }
  }
}

/** The new names a change records (`to`, or a candidate's). */
function newNamesOf(change: TargetChange): string[] | undefined {
  if (change.area !== 'ids') return undefined;
  const names = Array.isArray(change.to)
    ? change.to.filter((name): name is string => typeof name === 'string')
    : typeof change.to === 'string'
      ? [change.to]
      : [];
  if (names.length === 0 && change.candidate !== undefined) names.push(change.candidate.to);
  return names.length === 0 ? undefined : names;
}

/** Words for a subject (`worldgen/noise_settings` → `worldgen noise settings`). */
function words(text: string): string {
  return text.replace(/^minecraft:/, '').replace(/[/_]+/g, ' ');
}

/** The plain sentence for a change found in a file: the curated one, else a template. */
export function foundChangeSentence(change: TargetChange, toVersion: string): string {
  if (change.sentence !== undefined) return change.sentence;
  const member =
    change.registry !== undefined
      ? change.subject.slice(change.registry.length + 1)
      : change.subject;
  switch (change.area) {
    case 'ids':
      return change.what === 'member-renamed'
        ? `Minecraft ${toVersion} renamed ${member}.`
        : `Minecraft ${toVersion} no longer has ${member}.`;
    case 'commands':
      return `Minecraft ${toVersion} no longer has the command "${change.subject}".`;
    case 'block-states':
      return `Minecraft ${toVersion} changed the block state ${change.field ?? ''} of ${words(change.subject)}.`;
    case 'formats':
      return change.field === undefined
        ? `Minecraft ${toVersion} changed how ${words(member)} is written.`
        : `Minecraft ${toVersion} changed ${change.field.replace(/^\//, '')} in ${words(member)}.`;
    default:
      return `Minecraft ${toVersion} changed this (${change.what.replace(/-/g, ' ')}).`;
  }
}

/** One resource file read as an element for `matchChanges`. */
interface ResourceElement {
  file: UpgradeScanFile;
  element: Element;
  /** Pointer to line, for JSON. */
  lineOf(pointer: string): number;
}

/**
 * The kind a resource file is read as: `minecraft:<folder>` for the longest `minecraft:resource`
 * member a change names that the file's folder starts with, else `minecraft:<first folder>`.
 */
function kindOf(path: string, members: readonly string[]): string {
  const rest = path.slice(RESOURCES.length).split('/').slice(2).join('/');
  let best = rest.split('/')[0] ?? '';
  for (const member of members) {
    if (rest.startsWith(`${member}/`) && member.length > best.length) best = member;
  }
  return `minecraft:${best}`;
}

const LANG_FILE = /^src\/main\/resources\/assets\/[^/]+\/lang\//;

/** Every place in the project's data and assets that a change of `changeSets` touches. */
export function foundChanges(
  files: readonly UpgradeScanFile[],
  changeSets: readonly TargetChangeSet[],
  toVersion: string,
): { found: FoundChangeNote[]; unreadable: string[] } {
  const unreadable: string[] = [];
  const members = changeSets.flatMap((set) =>
    set.changes
      .filter((change) => change.registry === 'minecraft:resource')
      .map((change) => change.subject.slice('minecraft:resource/'.length)),
  );
  const elements: ResourceElement[] = [];
  files.forEach((file, index) => {
    if (!RESOURCE_FILE.test(file.path) || LANG_FILE.test(file.path)) return;
    const id = `upgrade_scan:file_${index}` as ResourceLocation;
    const base = { formatVersion: 1, id, kind: kindOf(file.path, members), meta: {} };
    if (file.path.endsWith('.mcfunction')) {
      const lines = file.text.split(/\r?\n/);
      elements.push({
        file,
        element: { ...base, data: lines } as unknown as Element,
        lineOf: (pointer) => Number(pointer.split('/')[1] ?? '0') + 1,
      });
      return;
    }
    const positions = jsonValueLines(file.text);
    if (positions === null) {
      unreadable.push(file.path);
      return;
    }
    elements.push({
      file,
      element: { ...base, data: JSON.parse(file.text) as Json } as unknown as Element,
      lineOf: (pointer) => positions.get(pointer) ?? 1,
    });
  });
  const project: Project = {
    formatVersion: 1,
    name: 'scan',
    namespaces: [{ name: 'upgrade_scan', elements: elements.map((e) => e.element), assets: [] }],
    targets: [],
    plugins: [],
    settings: {},
  };
  const byId = new Map(elements.map((entry) => [entry.element.id as string, entry]));
  const changes = new Map<string, { set: TargetChangeSet; change: TargetChange }>();
  for (const set of changeSets) {
    for (const change of set.changes) changes.set(`${set.to}\u0000${change.id}`, { set, change });
  }
  const found: FoundChangeNote[] = [];
  const seen = new Set<string>();
  const add = (
    entry: ResourceElement,
    pointer: string,
    set: TargetChangeSet,
    change: TargetChange,
    written: string | undefined,
  ): void => {
    const line = entry.lineOf(pointer);
    const key = `${entry.file.path}\u0000${line}\u0000${set.to}\u0000${change.id}\u0000${written ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const to = newNamesOf(change);
    found.push({
      file: entry.file.path,
      line,
      changeId: change.id,
      targetId: set.to,
      ...(written === undefined ? {} : { written }),
      sentence: foundChangeSentence(change, toVersion),
      ...(change.hint === undefined ? {} : { hint: change.hint }),
      ...(to === undefined ? {} : { to }),
    });
  };
  // Whole strings, formats, block states and commands: the report's own walk.
  for (const touch of matchChanges(changeSets, project)) {
    const entry = byId.get(touch.elementId);
    const pair = changes.get(`${touch.targetId}\u0000${touch.changeId}`);
    if (entry === undefined || pair === undefined) continue;
    const pointer = touch.path ?? '';
    let written: string | undefined;
    if (removedMember(pair.change) !== undefined) {
      const segments = pointer.split('/').slice(1);
      let node: Json | undefined = entry.element.data;
      for (const segment of segments) {
        const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
        node = Array.isArray(node)
          ? node[Number(key)]
          : node !== null && typeof node === 'object'
            ? node[key]
            : undefined;
      }
      if (typeof node === 'string') written = node;
    }
    add(entry, pointer, pair.set, pair.change, written);
  }
  // Ids inside longer text (a function line, SNBT): the engine's token search, reported only.
  const byToken = new Map<string, { set: TargetChangeSet; change: TargetChange }[]>();
  for (const set of changeSets) {
    for (const change of set.changes) {
      const member = removedMember(change);
      if (member === undefined || (change.stillIn ?? []).length > 0) continue;
      byToken.set(member.token, [...(byToken.get(member.token) ?? []), { set, change }]);
    }
  }
  if (byToken.size > 0) {
    for (const entry of elements) {
      stringsOf(entry.element.data, '', (value, pointer) => {
        for (const token of value.matchAll(TEXT_ID)) {
          if (token[0] === value) continue;
          const id = (token[2] ?? '').replace(/[./-]+$/, '');
          for (const { set, change } of byToken.get(`${token[1] ?? ''}${id}`) ?? []) {
            add(entry, pointer, set, change, `${token[1] ?? ''}minecraft:${id}`);
          }
        }
      });
    }
  }
  found.sort(
    (a, b) =>
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
      a.line - b.line ||
      (a.changeId < b.changeId ? -1 : a.changeId > b.changeId ? 1 : 0),
  );
  return { found, unreadable: unreadable.sort() };
}

function manifestOf(files: readonly UpgradeScanFile[]): { minecraft?: string } | undefined {
  const file = files.find((candidate) => candidate.path === EXPORT_MANIFEST_FILE);
  if (file === undefined) return undefined;
  try {
    const data = JSON.parse(file.text) as unknown;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined;
    const minecraft = (data as Record<string, unknown>).minecraft;
    return typeof minecraft === 'string' ? { minecraft } : {};
  } catch {
    return undefined;
  }
}

function modNameOf(scan: JavaProjectScan): string {
  const file = scan.files.find((candidate) => candidate.path === `${RESOURCES}fabric.mod.json`);
  if (file !== undefined) {
    try {
      const data = JSON.parse(file.text) as Record<string, unknown>;
      if (typeof data.name === 'string' && data.name.trim() !== '') return data.name.trim();
      if (typeof data.id === 'string' && data.id !== '') return data.id;
    } catch {
      // Fall back to the folder's name.
    }
  }
  return (
    scan.folder
      .split(/[\\/]/)
      .filter((part) => part !== '')
      .pop() ?? scan.folder
  );
}

/** Builds the notes from the scan and the facts. */
export function upgradeNotes(input: UpgradeNotesInput): UpgradeNotes {
  const { scan, from, to } = input;
  const facts = versionFactChanges(from, to);
  const { found, unreadable } = foundChanges(scan.files, input.changeSets, to.mcVersion);
  const manifest = manifestOf(scan.files);
  const madeFor = manifest?.minecraft;
  const javaNotes: JavaNote[] = [];
  for (const set of input.changeSets) {
    for (const change of set.changes) {
      if (change.area !== 'java') continue;
      javaNotes.push({
        changeId: change.id,
        sentence: change.sentence ?? foundChangeSentence(change, to.mcVersion),
        ...(change.hint === undefined ? {} : { hint: change.hint }),
      });
    }
  }
  const advice: UpgradeAdvice = !input.canEject
    ? 'by-hand'
    : input.javaEdited === 'no'
      ? 'eject-again'
      : input.javaEdited === 'yes'
        ? 'edited'
        : 'eject-again-if-not-edited';
  return {
    fromVersion: from.mcVersion,
    toVersion: to.mcVersion,
    modName: modNameOf(scan),
    advice,
    canEject: input.canEject,
    ...(madeFor === undefined ? {} : { madeFor }),
    madeForOther: madeFor !== undefined && madeFor !== from.mcVersion,
    looksEjected:
      manifest !== undefined || scan.files.some((file) => file.path === 'gradle.properties'),
    facts,
    buildLines: buildLineNotes(scan.files, facts),
    found,
    javaNotes,
    unreadable,
    javaFiles: scan.javaFiles,
    truncated: scan.truncated === true,
  };
}

/** The plain advice sentences the notes and the report part open with. */
export function upgradeAdviceSentences(notes: UpgradeNotes): string[] {
  const to = notes.toVersion;
  const handWork = `Change the build lines these notes list by hand, build the project, and fix what the Java compiler reports: these notes cannot see how your Java uses Minecraft's code.`;
  switch (notes.advice) {
    case 'by-hand':
      return [
        `MCSuperMods cannot export a Java project for Minecraft ${to} yet, so it cannot make this project again for you.`,
        handWork,
      ];
    case 'eject-again':
      return [
        `You have not changed this project's Java by hand, so the simplest way is to export the Java project again from your moved mod (Export Java project) into a new folder, and keep this folder until the new one builds.`,
      ];
    case 'edited':
      return [
        `You changed this project's Java by hand. ${handWork}`,
        `Or export the Java project again from your moved mod into a new folder and carry your own changes across.`,
      ];
    case 'eject-again-if-not-edited':
      return [
        `If you have not changed this project's Java by hand, export the Java project again from your moved mod (Export Java project) into a new folder.`,
        `If you have, ${handWork.charAt(0).toLowerCase()}${handWork.slice(1)}`,
      ];
  }
}

/** `text` ending in a full stop. */
function withStop(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('`', "'");
}

/** The notes as one Markdown file. */
export function upgradeNotesMarkdown(notes: UpgradeNotes): string {
  const out: string[] = [
    `# Upgrade notes: ${notes.modName}, from Minecraft ${notes.fromVersion} to ${notes.toVersion}`,
    '',
    'Written by MCSuperMods from a read-only look at this folder. It changed nothing here but this file.',
    '',
    '## What to do',
    '',
    ...upgradeAdviceSentences(notes).flatMap((sentence) => [sentence, '']),
  ];
  if (!notes.looksEjected) {
    out.push(
      'This folder does not look like a Java project MCSuperMods exported: it has neither `gradle.properties` nor `msm.export.json`.',
      '',
    );
  }
  if (notes.madeForOther && notes.madeFor !== undefined) {
    out.push(
      `This folder says it was made for Minecraft ${notes.madeFor}, not ${notes.fromVersion}: the lines below compare ${notes.fromVersion} with ${notes.toVersion}.`,
      '',
    );
  }
  out.push('## Versions that change', '');
  if (notes.facts.length === 0) out.push('None.', '');
  else {
    out.push('| What | Now | Then |', '|---|---|---|');
    for (const fact of notes.facts) {
      out.push(
        `| ${cell(fact.label)} | ${cell(fact.from)} | ${fact.to === undefined ? `none for Minecraft ${cell(notes.toVersion)}` : cell(fact.to)} |`,
      );
    }
    out.push('');
    if (notes.facts.some((fact) => fact.to === undefined)) {
      out.push(
        `MCSuperMods knows of no build of the versions marked "none" for Minecraft ${notes.toVersion}; whatever uses them cannot be built there yet.`,
        '',
      );
    }
  }
  out.push('## Build lines to change', '');
  if (notes.buildLines.length === 0) {
    out.push('No line of the build files names a version that changes.', '');
  } else {
    for (const note of notes.buildLines) {
      out.push(
        `- \`${note.file}\` line ${note.line} (${note.facts.join(', ')}):`,
        '',
        '  ```',
        `  ${note.now}`,
        '  ```',
        '',
      );
      if (note.next === undefined) {
        out.push('  There is no newer value to put here: see the versions above.', '');
      } else {
        out.push('  becomes', '', '  ```', `  ${note.next}`, '  ```', '');
      }
    }
  }
  out.push('## Your data and assets', '');
  if (notes.found.length === 0) {
    out.push(
      `Nothing in \`src/main/resources\` names an id, command or format that Minecraft ${notes.toVersion} removed or changed, as far as MCSuperMods knows.`,
      '',
    );
  } else {
    for (const note of notes.found) {
      const parts = [`- \`${note.file}\` line ${note.line}`];
      if (note.written !== undefined) parts.push(`: \`${note.written}\``);
      parts.push(`. ${note.sentence}`);
      if (note.to !== undefined) {
        parts.push(` It may now be ${note.to.map((name) => `\`${name}\``).join(' or ')}.`);
      }
      if (note.hint !== undefined) parts.push(` How: ${withStop(note.hint)}`);
      parts.push(` (change \`${note.changeId}\`)`);
      out.push(parts.join(''));
    }
    out.push('');
  }
  if (notes.unreadable.length > 0) {
    out.push(
      'These files could not be read as JSON, so they were not searched:',
      '',
      ...notes.unreadable.map((path) => `- \`${path}\``),
      '',
    );
  }
  out.push("## Minecraft's Java", '');
  if (notes.javaNotes.length === 0) {
    out.push(
      `MCSuperMods has no notes on how Minecraft's own Java changed in ${notes.toVersion}. Building the project shows what your Java needs.`,
      '',
    );
  } else {
    for (const note of notes.javaNotes) {
      out.push(
        `- ${note.sentence}${note.hint === undefined ? '' : ` How: ${withStop(note.hint)}`} (change \`${note.changeId}\`)`,
      );
    }
    out.push('');
  }
  out.push(
    '## What these notes cannot see',
    '',
    `- How the project's ${notes.javaFiles} Java file${notes.javaFiles === 1 ? '' : 's'} use${notes.javaFiles === 1 ? 's' : ''} Minecraft's and Fabric's code, and whether the project builds.`,
    '- Changes in how the game behaves that no data file shows.',
  );
  if (notes.truncated) {
    out.push('- Every file: the folder is large, and the look stopped before the end.');
  }
  out.push('');
  return out.join('\n');
}
