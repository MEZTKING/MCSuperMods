/**
 * The code the AI helper's prompt is checked against (ADR 0125 D7, B683), gathered in one place
 * so `ai-prompt-truth.test.ts` can run every check on the real sources and again on a copy with
 * one fact changed (the mutation cases that prove each check bites).
 *
 * Everything here is read from the merged code, never from the prompt: the plugin registry's kinds
 * and the session library's templates, the library's starters and drawn recipes, the Script API's
 * JSON, both targets' facts, the MSM mcdoc, Try it's constants and the components' source text.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createMemoryFileSystem } from '@msm/core';
import type { ProjectStarter, TargetFacts } from '@msm/plugin-api';
import { ENTITIES_MOB_PROBLEM_CODES } from '@msm/plugin-entities';
import { ART_RECIPE_INFO, libraryStarters } from '@msm/plugin-library';
import {
  MAX_DEPTH,
  MAX_DROP_COUNT,
  MAX_EXPLOSION_POWER,
  MAX_RADIUS,
  MAX_REPEAT,
  MAX_STEPS,
} from '@msm/plugin-rules';
import {
  AREA_SIZE_X,
  AREA_SIZE_Y,
  AREA_SIZE_Z,
  SIM_ACTIONS,
  SIM_TOOLS,
  TICK_COMMAND_CAP,
  VANILLA_COMMANDS,
} from '@msm/sim';
import { builtInTargets } from '@msm/targets';
import { newSession } from './session-fixture';

/** The repository's root folder. */
const ROOT = new URL('../../', import.meta.url);

/** Reads a file of the repository by its path from the root. */
export function readRepoFile(path: string): string {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

/** One member, event or type of the Script API's JSON, as far as the checks read it. */
export interface ScriptApiNode {
  readonly kind?: string;
  readonly doc?: string;
  readonly cancellable?: boolean;
  readonly members?: Readonly<Record<string, ScriptApiNode>>;
  readonly overloads?: readonly ScriptApiNode[];
}

/** `script-api-v1.json` as the checks read it. */
export interface ScriptApiJson {
  readonly types: Readonly<Record<string, ScriptApiNode>>;
  readonly globals: Readonly<Record<string, ScriptApiNode>>;
  readonly events: Readonly<Record<string, ScriptApiNode>>;
  readonly aliases: Readonly<Record<string, ScriptApiNode>>;
}

/** A library template as the checks read it. */
export interface TemplateRow {
  readonly id: string;
  readonly kind: string;
}

/** Try it's facts from `@msm/sim` and the Try it view. */
export interface TryItSources {
  readonly area: { readonly x: number; readonly z: number; readonly y: number };
  readonly tickCap: number;
  readonly commands: readonly string[];
  /** The tool strip: `SIM_TOOLS`' labels, then the view's own buttons after them. */
  readonly toolLabels: readonly string[];
  readonly groundLabels: readonly string[];
  readonly actions: Readonly<Record<string, string>>;
}

/** Everything the prompt is checked against. */
export interface TruthSources {
  readonly kinds: readonly string[];
  readonly templates: readonly TemplateRow[];
  readonly starters: readonly ProjectStarter[];
  readonly art: typeof ART_RECIPE_INFO;
  readonly scriptApi: ScriptApiJson;
  readonly targets: readonly TargetFacts[];
  /** Every MSM mcdoc file, joined. */
  readonly mcdoc: string;
  readonly rulesLimits: {
    readonly depth: number;
    readonly steps: number;
    readonly repeat: number;
    readonly radius: number;
    readonly explosionPower: number;
    readonly dropItem: number;
  };
  readonly tryIt: TryItSources;
  readonly mobProblemCodes: readonly string[];
  /** Source text of app and engine files by repository path, read on first use. */
  readonly files: Readonly<Record<string, string>>;
}

/** The app and engine files the checks read as text. */
export const SOURCE_FILES = Object.freeze({
  preferences: 'app/src/renderer/src/store/preferences.ts',
  playStore: 'app/src/renderer/src/store/play-store.ts',
  toolbar: 'app/src/renderer/src/components/Toolbar.tsx',
  tiles: 'app/src/renderer/src/components/home/tiles.ts',
  minecraftTextureTile: 'app/src/renderer/src/components/home/minecraft-texture-tile.ts',
  makeTiles: 'app/src/renderer/src/components/home/MakeTiles.tsx',
  myThings: 'app/src/renderer/src/components/home/MyThings.tsx',
  home: 'app/src/renderer/src/components/home/Home.tsx',
  app: 'app/src/renderer/src/App.tsx',
  showcaseCard: 'app/src/renderer/src/showcase/ShowcaseCard.tsx',
  thingsToFix: 'app/src/renderer/src/components/ThingsToFix.tsx',
  rightDock: 'app/src/renderer/src/components/RightDock.tsx',
  editorArea: 'app/src/renderer/src/components/EditorArea.tsx',
  drawButton: 'app/src/renderer/src/components/art/DrawButton.tsx',
  makeWithAiButton: 'app/src/renderer/src/components/ai-pictures/MakeWithAiButton.tsx',
  aiPicturesSettings: 'app/src/renderer/src/components/ai-pictures/AiPicturesSettingsSection.tsx',
  aiPictures: 'app/src/shared/ai-pictures.ts',
  menu: 'app/src/main/menu.ts',
  shortcuts: 'app/src/renderer/src/shortcuts.ts',
  tryItInput: 'app/src/renderer/src/tryit/input.ts',
  tryItView: 'app/src/renderer/src/tryit/TryItView.tsx',
  whatHappened: 'app/src/renderer/src/tryit/WhatHappened.tsx',
  scriptWorker: 'app/src/renderer/src/tryit/script-worker.ts',
  grounds: 'app/src/renderer/src/tryit/grounds.ts',
  geoAnimationReader:
    'engine-mod/src/main/java/dev/mcsupermods/runtime/model/GeoAnimationReader.java',
  msmMob: 'engine-mod/src/main/java/dev/mcsupermods/runtime/registry/MsmMob.java',
} as const);

/** The folders whose source the world map paragraph's labels are found in. */
export const WORLD_MAP_SOURCE_DIRS = Object.freeze([
  'app/src/renderer/src/terrain',
  'app/src/renderer/src/tryit',
  'app/src/renderer/src/studios/worldgen',
  'app/src/renderer/src/components/creator',
]);

/** Every `.ts` and `.tsx` file under the given folders (not tests), joined. */
export function sourceOfDirs(dirs: readonly string[]): string {
  const texts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) texts.push(readRepoFile(path));
    }
  };
  for (const dir of dirs) walk(dir);
  return texts.join('\n');
}

let cached: TruthSources | undefined;

/** The sources of the merged code (read once). */
export function truthSources(): TruthSources {
  if (cached !== undefined) return cached;
  const { session } = newSession(createMemoryFileSystem());
  const mcdocDir = 'packages/schemas/mcdoc/msm';
  const mcdoc = readdirSync(new URL(`${mcdocDir}/`, ROOT))
    .filter((name) => name.endsWith('.mcdoc'))
    .sort()
    .map((name) => readRepoFile(`${mcdocDir}/${name}`))
    .join('\n');
  const files: Record<string, string> = {};
  for (const path of Object.values(SOURCE_FILES)) files[path] = readRepoFile(path);
  cached = Object.freeze({
    kinds: Object.freeze(session.registry.all().map((kind) => kind.id)),
    templates: Object.freeze(
      session.library.templates.map((template) => ({ id: template.id, kind: template.kind })),
    ),
    starters: libraryStarters,
    art: ART_RECIPE_INFO,
    scriptApi: JSON.parse(
      readRepoFile('packages/plugins/scripting/api/script-api-v1.json'),
    ) as ScriptApiJson,
    targets: Object.freeze(builtInTargets.map((bundle) => bundle.target)),
    mcdoc,
    rulesLimits: Object.freeze({
      depth: MAX_DEPTH,
      steps: MAX_STEPS,
      repeat: MAX_REPEAT,
      radius: MAX_RADIUS,
      explosionPower: MAX_EXPLOSION_POWER,
      dropItem: MAX_DROP_COUNT,
    }),
    tryIt: Object.freeze({
      area: Object.freeze({ x: AREA_SIZE_X, z: AREA_SIZE_Z, y: AREA_SIZE_Y }),
      tickCap: TICK_COMMAND_CAP,
      commands: VANILLA_COMMANDS,
      toolLabels: Object.freeze(SIM_TOOLS.map((tool) => tool.label)),
      groundLabels: Object.freeze(
        [
          ...constBlock(files[SOURCE_FILES.grounds] ?? '', 'GROUND_CHOICES').matchAll(
            /label: '([^']+)'/g,
          ),
        ].map((match) => match[1] as string),
      ),
      actions: SIM_ACTIONS,
    }),
    mobProblemCodes: ENTITIES_MOB_PROBLEM_CODES,
    files: Object.freeze(files),
  });
  return cached;
}

// ---------------------------------------------------------------------------------------------
// Reading source text. The app's node tests may import only the renderer files
// `tsconfig.node.json` lists, so the stores' and the Try it view's constants are read from their
// source as written.

/** The text of `export const NAME ... ;` up to the line that closes it (`];` or `};`). */
export function constBlock(source: string, name: string): string {
  const start = source.search(new RegExp(`export const ${name}\\b`));
  if (start < 0) return '';
  const end = source.slice(start).search(/^[\]}]\)?;/m);
  return end < 0 ? source.slice(start) : source.slice(start, start + end);
}

/** `UI_MODES` of `store/preferences.ts`: each mode's id and label. */
export function uiModesOf(source: string): { mode: string; label: string }[] {
  return [...constBlock(source, 'UI_MODES').matchAll(/mode: '([a-z-]+)',\s*label: '([^']+)'/g)].map(
    (match) => ({ mode: match[1] as string, label: match[2] as string }),
  );
}

/** `PLAY_CONTROL_LABELS` of `store/play-store.ts`, by key. */
export function playLabelsOf(source: string): Record<string, string> {
  return Object.fromEntries(
    [...constBlock(source, 'PLAY_CONTROL_LABELS').matchAll(/^\s*(\w+): '([^']*)',/gm)].map(
      (match) => [match[1] as string, match[2] as string],
    ),
  );
}

/** The value of `export const NAME = '...'` (or a number) in a source file; `undefined` if none. */
export function exportedLiteral(source: string, name: string): string | number | undefined {
  const match = new RegExp(
    `export const ${name}(?::[^=]+)? =\\s*(?:'([^']*)'|"([^"]*)"|(-?[\\d_]+(?:\\.\\d+)?))`,
  ).exec(source);
  if (match === null) return undefined;
  if (match[3] !== undefined) return Number(match[3].replaceAll('_', ''));
  return match[1] ?? match[2];
}

/**
 * Whether a label is written in a component's source as the app shows it: a string literal
 * (`'label'`, `"label"`, `` `label` ``, or the start of one), or JSX text (a line that is the
 * label, or starts with it and goes on with a space, a bracket or a brace).
 */
export function labelInSource(source: string, label: string): boolean {
  const quotes = ["'", '"', '`'];
  if (quotes.some((quote) => source.includes(`${quote}${label}${quote}`))) return true;
  if (quotes.some((quote) => source.includes(`${quote}${label} `))) return true;
  if (source.includes(`>${label}<`)) return true;
  return source.split('\n').some((line) => {
    const text = line.trim();
    return text === label || (text.startsWith(label) && /^[\s({:]/.test(text.slice(label.length)));
  });
}

// ---------------------------------------------------------------------------------------------
// Reading the MSM mcdoc.

/** The body of `struct NAME {...}` or `enum(...) NAME {...}`, or `undefined`. */
function blockBody(mcdoc: string, header: RegExp): string | undefined {
  const match = header.exec(mcdoc);
  if (match === null) return undefined;
  let depth = 0;
  for (let index = match.index + match[0].length - 1; index < mcdoc.length; index += 1) {
    const char = mcdoc[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return mcdoc.slice(match.index + match[0].length, index);
    }
  }
  return undefined;
}

/** The lines of a body at its own level (nested braces left out), comments removed. */
function topLevelLines(body: string): string[] {
  const lines: string[] = [];
  let depth = 0;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '');
    if (depth === 0) lines.push(line);
    for (const char of line) {
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
    }
  }
  return lines;
}

/** The values of `enum(string) NAME`. */
export function enumValues(mcdoc: string, name: string): string[] {
  const body = blockBody(mcdoc, new RegExp(`enum\\(string\\) ${name} \\{`));
  if (body === undefined) return [];
  return [...body.matchAll(/=\s*"([^"]+)"/g)].map((match) => match[1] as string);
}

/**
 * The field names of `struct NAME`, with the fields of its spreads (`...Other` and dispatched
 * spreads such as `...msm:container_layout[[layout]]`, every case of the dispatcher).
 */
export function structFields(mcdoc: string, name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const body = blockBody(mcdoc, new RegExp(`(?:^|\\s)struct ${name} \\{`, 'm'));
  if (body === undefined) return [];
  const fields: string[] = [];
  for (const line of topLevelLines(body)) {
    const field = /^\s*"?([a-z0-9_:]+)"?\??:/.exec(line);
    if (field !== null) fields.push(field[1] as string);
    const spread = /^\s*\.\.\.([A-Za-z0-9_]+)\s*,?\s*$/.exec(line);
    if (spread !== null) fields.push(...structFields(mcdoc, spread[1] as string, seen));
    const dispatched = /^\s*\.\.\.([a-z]+:[a-z_]+)\[\[/.exec(line);
    if (dispatched !== null) {
      const cases = new RegExp(
        `dispatch ${dispatched[1]}\\[[^\\]]*\\] to struct ([A-Za-z0-9_]+)`,
        'g',
      );
      for (const match of mcdoc.matchAll(cases)) {
        fields.push(...structFields(mcdoc, match[1] as string, seen));
      }
    }
  }
  return fields;
}

/** Every `"msm:..."` component key the mcdoc declares. */
export function componentKeys(mcdoc: string): Set<string> {
  return new Set([...mcdoc.matchAll(/"(msm:[a-z_]+)"\??:/g)].map((match) => match[1] as string));
}
