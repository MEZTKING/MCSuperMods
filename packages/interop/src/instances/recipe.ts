/**
 * Run recipes (ADR 0133 D1): what a play, test or open action needs, worked out as pure data
 * from the action, the project's facts and the target's facts. Every screen and every launcher
 * writer reads the same recipe: `describeRecipe` gives the offer card's sentences,
 * `ensureInstance` (`install.ts`) makes or updates the launcher instance, and the local server
 * (`server/`, B762) reads the server recipes.
 *
 * Which instance an action uses (D2):
 * - `test` (Play, Test in Minecraft) and `game` (Play my game): the test instance
 *   `MCSuperMods Test (<mc>)`, Fabric, with the content jar and Fabric API, on the test world
 *   `msm-test-<ns>` or the game world `msm-game-<ns>`, both made by the game itself;
 * - `plain` (a game played without mods): `MCSuperMods Plain (<mc>)`, no loader, no mods, on a
 *   world copied into it;
 * - `modpack`: `MCSuperMods Pack <name> (<mc>)`, Fabric, the modpack's jars, Fabric API and its
 *   Modrinth mods;
 * - `map`: a map that plays without mods opens in the Plain instance; one that needs the mod
 *   gets `MCSuperMods Map <name> (<mc>)`, Fabric, with the content jar and Fabric API;
 * - `server`: a local server folder (`<msmHome>/servers/<name>/`, B762), never an instance.
 */

import type { TargetFacts } from '@msm/plugin-api';
import { devWorldFolder, gameWorldFolder } from '../fabric/dev-session';
import { fabricApiFileName } from '../fabric/download';
import { contentJarModsFileName } from '../fabric/mods-install';
import { FABRIC_MOD_ID, SAFE_VERSION } from '../fabric/types';
import { isSafeSegment } from '../launchers/paths';
import { instanceBaseName, isSafeOwner, serverBaseName } from './names';

/** What an action is for. */
export type RunPurpose = 'test' | 'game' | 'plain' | 'modpack' | 'map' | 'server';

/** Which managed instance a recipe runs in; the marker's `purpose`. */
export type InstanceRole = 'test' | 'plain' | 'pack' | 'map';

/**
 * A recipe's mod loader. Only `none` and `fabric` are made today; the others are in the
 * component table (`mmc-writer.ts`) and refused until their plans exist.
 */
export type RecipeLoaderKind = 'none' | 'fabric' | 'quilt' | 'neoforge' | 'forge';

/** The loader and its version (`null` for `none`). */
export interface RecipeLoader {
  kind: RecipeLoaderKind;
  version: string | null;
}

/** A mod a recipe puts into `mods/`. Each is recorded in `mods/.msm-installed.json`. */
export type RecipeMod =
  /** A project's content jar, written as `<modId>.jar`. */
  | { role: 'content'; fileName: string; modId: string }
  /** Fabric API from the Fabric Maven, written as `fabric-api-<version>.jar`. */
  | { role: 'fabric-api'; fileName: string; version: string }
  /** A modpack's Modrinth mod (ADR 0046 D5). */
  | { role: 'extra'; fileName: string; projectId: string };

/** A resource pack a recipe puts into `resourcepacks/` and enables. */
export interface RecipePack {
  /** The file name in `resourcepacks/`, a `.zip`. */
  fileName: string;
  /** Where the caller gets its bytes from (opaque here; handed back to `bytesOf`). */
  source: string;
}

/** The world a recipe opens. */
export interface RecipeWorld {
  /** The folder name in `saves/`. */
  folder: string;
  /**
   * An absolute world folder to copy into `saves/<folder>`, or `null` when the game makes the
   * world itself (the test and game worlds, ADR 0084).
   */
  source: string | null;
  /** Whether a copy MSM made earlier is replaced; a copy is otherwise kept as it was played. */
  replace: boolean;
}

/** A server to join on launch (`--server <host>:<port>`, B760 N3). */
export interface ServerAddress {
  host: string;
  port: number;
}

/** Where a recipe runs. */
export type RecipePlace =
  /** A managed launcher instance; `name` is its base folder name before the taken-name rule. */
  | { kind: 'instance'; role: InstanceRole; owner: string | null; name: string }
  /** A local server folder under `<msmHome>/servers/` (B762). */
  | { kind: 'server'; owner: string; name: string };

/** The current recipe format. */
export const RUN_RECIPE_FORMAT = 1;

/** Everything an action needs (ADR 0133 D1). */
export interface RunRecipe {
  formatVersion: typeof RUN_RECIPE_FORMAT;
  purpose: RunPurpose;
  /** Whose it is: the project's namespace, or the modpack's or map's name. */
  owner: string;
  /** The Minecraft version (the target's). */
  mcVersion: string;
  /** Whether that version is a release or a snapshot. */
  channel: TargetFacts['channel'];
  /** The Java feature release the game needs (for a server's Java search). */
  java: number;
  loader: RecipeLoader;
  place: RecipePlace;
  mods: RecipeMod[];
  resourcePacks: RecipePack[];
  world: RecipeWorld | null;
  join: ServerAddress | null;
}

/** A world to copy, as an action names it. */
export interface RecipeWorldSource {
  /** The folder name in `saves/`. */
  folder: string;
  /** The absolute world folder to copy. */
  source: string;
  /** Replace MSM's earlier copy (default: keep it). */
  replace?: boolean;
}

/** A modpack's Modrinth mod, as an action names it. */
export interface RecipeExtraMod {
  fileName: string;
  projectId: string;
}

/** What the user asked for. */
export type RunAction =
  /** Play and Test in Minecraft: the test world in the test instance. */
  | { kind: 'test'; join?: ServerAddress }
  /** Play my game: the game world in the test instance. */
  | { kind: 'game'; join?: ServerAddress }
  /** A game that plays without mods, in the Plain instance on a copied world. */
  | { kind: 'plain'; world?: RecipeWorldSource; resourcePacks?: RecipePack[] }
  /** Test a modpack in its own instance. */
  | { kind: 'modpack'; name: string; modIds: string[]; extraMods?: RecipeExtraMod[] }
  /** Open an exported map. */
  | { kind: 'map'; name: string; world: RecipeWorldSource; resourcePacks?: RecipePack[] }
  /** A local server for the project. */
  | { kind: 'server'; world?: RecipeWorldSource };

/** The project's facts a recipe needs. */
export interface RecipeProjectFacts {
  /** The project's first namespace. */
  namespace: string;
  /** The content jar's mod id, or `null` when the project has no jar. */
  modId: string | null;
  /** Whether the project plays without mods (a data-pack-only game or map). */
  playsWithoutMods: boolean;
}

/** The target's facts a recipe needs. */
export type RecipeTargetFacts = Pick<TargetFacts, 'mcVersion' | 'channel' | 'java' | 'fabric'>;

/** Why a recipe or an instance step failed. */
export type InstanceErrorCode =
  | 'recipe.bad-input'
  | 'recipe.needs-mod'
  | 'recipe.no-fabric'
  | 'instance.server-recipe'
  | 'instance.loader-not-supported'
  | 'instance.no-launcher'
  | 'instance.no-free-name'
  | 'instance.outside-root'
  | 'instance.foreign-file'
  | 'instance.foreign-world'
  | 'instance.cannot-stage'
  | 'instance.taken';

/** An error with a stable code; its message is written for the user. */
export class InstanceError extends Error {
  readonly code: InstanceErrorCode;

  constructor(code: InstanceErrorCode, message: string) {
    super(message);
    this.name = 'InstanceError';
    this.code = code;
  }
}

const NAMESPACE = /^[a-z0-9_.-]{1,64}$/;
/** A world folder name: one safe segment, no leading dot or space, no trailing dot or space. */
const WORLD_FOLDER = /^[A-Za-z0-9_(][A-Za-z0-9 ._()'+-]{0,126}[A-Za-z0-9_)]$|^[A-Za-z0-9_]$/;
const PACK_FILE = /^[A-Za-z0-9_(][A-Za-z0-9 ._()'+-]{0,250}\.zip$/;
const HOST =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const MODRINTH_ID = /^[A-Za-z0-9]{1,64}$/;
const MOD_FILE = /^[A-Za-z0-9][A-Za-z0-9._+ ()-]{0,250}\.jar$/;

function bad(message: string): InstanceError {
  return new InstanceError('recipe.bad-input', message);
}

/** Checks a world folder name (`saves/<folder>`). */
export function isWorldFolderName(folder: string): boolean {
  return isSafeSegment(folder) && WORLD_FOLDER.test(folder);
}

/** Checks a resource pack file name (`resourcepacks/<fileName>`). */
export function isPackFileName(fileName: string): boolean {
  return isSafeSegment(fileName) && PACK_FILE.test(fileName);
}

/** Checks a server address: a host name or IPv4 address, and a port from 1 to 65535. */
export function isServerAddress(address: ServerAddress): boolean {
  return (
    address.host.length <= 253 &&
    HOST.test(address.host) &&
    Number.isInteger(address.port) &&
    address.port >= 1 &&
    address.port <= 65535
  );
}

function world(source: RecipeWorldSource): RecipeWorld {
  if (!isWorldFolderName(source.folder)) {
    throw bad(`${JSON.stringify(source.folder)} is not a world folder name MCSuperMods can use.`);
  }
  if (source.source === '') throw bad('The world to copy has no folder.');
  return { folder: source.folder, source: source.source, replace: source.replace === true };
}

function packs(list: readonly RecipePack[] | undefined): RecipePack[] {
  const out: RecipePack[] = [];
  const seen = new Set<string>();
  for (const pack of list ?? []) {
    if (!isPackFileName(pack.fileName)) {
      throw bad(`${JSON.stringify(pack.fileName)} is not a resource pack file name.`);
    }
    const key = pack.fileName.toLowerCase();
    if (seen.has(key)) throw bad(`The resource pack ${pack.fileName} is named twice.`);
    seen.add(key);
    out.push({ fileName: pack.fileName, source: pack.source });
  }
  return out;
}

function join(address: ServerAddress | undefined): ServerAddress | null {
  if (address === undefined) return null;
  if (!isServerAddress(address)) {
    throw bad(`${address.host}:${address.port} is not a server address MCSuperMods can join.`);
  }
  return { host: address.host, port: address.port };
}

function fabricOf(target: RecipeTargetFacts): { loader: string; api: string } {
  const fabric = target.fabric;
  if (fabric === undefined) {
    throw new InstanceError(
      'recipe.no-fabric',
      `Minecraft ${target.mcVersion} has no Fabric versions in MCSuperMods, so it cannot run mods.`,
    );
  }
  if (!SAFE_VERSION.test(fabric.loader) || !SAFE_VERSION.test(fabric.api)) {
    throw bad('The target names a Fabric version MCSuperMods cannot use.');
  }
  return { loader: fabric.loader, api: fabric.api };
}

function contentMod(modId: string | null): RecipeMod {
  if (modId === null || !FABRIC_MOD_ID.test(modId)) {
    throw bad('The project has no mod to put into the instance. Export it once, then try again.');
  }
  return { role: 'content', fileName: contentJarModsFileName(modId), modId };
}

function fabricApiMod(version: string): RecipeMod {
  return { role: 'fabric-api', fileName: fabricApiFileName(version), version };
}

function needsModError(what: string): InstanceError {
  return new InstanceError(
    'recipe.needs-mod',
    `This ${what} needs its mod, so it cannot be played without mods. Use Play instead.`,
  );
}

/**
 * The recipe for `action` on a project with `project`'s facts and the target's `target` facts.
 * Pure: reads nothing and writes nothing. Throws {@link InstanceError} for an action the
 * project cannot do (`recipe.needs-mod`: a game that needs its mod played without mods;
 * `recipe.no-fabric`: a target without Fabric) or unsafe input (`recipe.bad-input`).
 */
export function recipeFor(
  action: RunAction,
  project: RecipeProjectFacts,
  target: RecipeTargetFacts,
): RunRecipe {
  if (!NAMESPACE.test(project.namespace)) {
    throw bad(`${JSON.stringify(project.namespace)} is not a valid namespace.`);
  }
  if (!SAFE_VERSION.test(target.mcVersion)) {
    throw bad(`${JSON.stringify(target.mcVersion)} is not a valid Minecraft version.`);
  }
  const base = {
    formatVersion: RUN_RECIPE_FORMAT,
    mcVersion: target.mcVersion,
    channel: target.channel,
    java: target.java,
  } as const;
  const none: RecipeLoader = { kind: 'none', version: null };
  const ns = project.namespace;

  switch (action.kind) {
    case 'test':
    case 'game': {
      const fabric = fabricOf(target);
      return {
        ...base,
        purpose: action.kind,
        owner: ns,
        loader: { kind: 'fabric', version: fabric.loader },
        place: {
          kind: 'instance',
          role: 'test',
          owner: null,
          name: instanceBaseName('test', target.mcVersion, null),
        },
        mods: [contentMod(project.modId), fabricApiMod(fabric.api)],
        resourcePacks: [],
        world: {
          folder: action.kind === 'game' ? gameWorldFolder(ns) : devWorldFolder(ns),
          source: null,
          replace: false,
        },
        join: join(action.join),
      };
    }
    case 'plain': {
      if (!project.playsWithoutMods) throw needsModError('game');
      return {
        ...base,
        purpose: 'plain',
        owner: ns,
        loader: none,
        place: plainPlace(target.mcVersion),
        mods: [],
        resourcePacks: packs(action.resourcePacks),
        world: action.world === undefined ? null : world(action.world),
        join: null,
      };
    }
    case 'modpack': {
      const name = action.name.trim();
      if (!isSafeOwner(name)) throw bad('The modpack needs a name.');
      const fabric = fabricOf(target);
      const mods: RecipeMod[] = [];
      const seen = new Set<string>();
      const add = (mod: RecipeMod): void => {
        const key = mod.fileName.toLowerCase();
        if (seen.has(key)) throw bad(`The modpack names ${mod.fileName} twice.`);
        seen.add(key);
        mods.push(mod);
      };
      if (action.modIds.length === 0) throw bad('The modpack has no mods of yours in it.');
      for (const modId of action.modIds) add(contentMod(modId));
      for (const extra of action.extraMods ?? []) {
        if (!MOD_FILE.test(extra.fileName) || !isSafeSegment(extra.fileName)) {
          throw bad(`${JSON.stringify(extra.fileName)} is not a jar file name.`);
        }
        if (!MODRINTH_ID.test(extra.projectId)) {
          throw bad(`${JSON.stringify(extra.projectId)} is not a Modrinth project id.`);
        }
        add({ role: 'extra', fileName: extra.fileName, projectId: extra.projectId });
      }
      add(fabricApiMod(fabric.api));
      return {
        ...base,
        purpose: 'modpack',
        owner: name,
        loader: { kind: 'fabric', version: fabric.loader },
        place: {
          kind: 'instance',
          role: 'pack',
          owner: name,
          name: instanceBaseName('pack', target.mcVersion, name),
        },
        mods,
        resourcePacks: [],
        world: null,
        join: null,
      };
    }
    case 'map': {
      const name = action.name.trim();
      if (!isSafeOwner(name)) throw bad('The map needs a name.');
      const mapWorld = world(action.world);
      const resourcePacks = packs(action.resourcePacks);
      if (project.playsWithoutMods) {
        return {
          ...base,
          purpose: 'map',
          owner: name,
          loader: none,
          place: plainPlace(target.mcVersion),
          mods: [],
          resourcePacks,
          world: mapWorld,
          join: null,
        };
      }
      const fabric = fabricOf(target);
      return {
        ...base,
        purpose: 'map',
        owner: name,
        loader: { kind: 'fabric', version: fabric.loader },
        place: {
          kind: 'instance',
          role: 'map',
          owner: name,
          name: instanceBaseName('map', target.mcVersion, name),
        },
        mods: [contentMod(project.modId), fabricApiMod(fabric.api)],
        resourcePacks,
        world: mapWorld,
        join: null,
      };
    }
    case 'server': {
      const fabric = fabricOf(target);
      return {
        ...base,
        purpose: 'server',
        owner: ns,
        // The Fabric server launcher runs every local server (ADR 0133 D7). A game that plays
        // without mods gets none, so friends without mods can join it.
        loader: { kind: 'fabric', version: fabric.loader },
        place: { kind: 'server', owner: ns, name: serverBaseName(ns, target.mcVersion) },
        mods: project.playsWithoutMods ? [] : [contentMod(project.modId), fabricApiMod(fabric.api)],
        resourcePacks: [],
        world: action.world === undefined ? null : world(action.world),
        join: null,
      };
    }
  }
}

function plainPlace(mcVersion: string): RecipePlace {
  return {
    kind: 'instance',
    role: 'plain',
    owner: null,
    name: instanceBaseName('plain', mcVersion, null),
  };
}

/** The launchers a recipe can be described for. */
export type RecipeLauncher = 'prism' | 'multimc' | 'polymc';

const LAUNCHER_NAMES: Readonly<Record<RecipeLauncher, string>> = {
  prism: 'Prism Launcher',
  multimc: 'MultiMC',
  polymc: 'PolyMC',
};

/** The offer card's words for a recipe (ADR 0133 D3). */
export interface RecipeDescription {
  /** A short heading. */
  title: string;
  /** What will be made, in plain sentences, in order. */
  sentences: string[];
}

function count(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

function contentsOf(recipe: RunRecipe): string {
  const parts: string[] = [];
  if (recipe.loader.kind !== 'none') {
    parts.push(
      `${recipe.loader.kind === 'fabric' ? 'Fabric Loader' : recipe.loader.kind} ${recipe.loader.version ?? ''}`.trim(),
    );
  }
  const content = recipe.mods.filter((mod) => mod.role === 'content').length;
  const extras = recipe.mods.filter((mod) => mod.role === 'extra').length;
  if (recipe.purpose === 'modpack') {
    parts.push(`the modpack's ${count(content + extras, 'mod', 'mods')}`);
  } else if (content > 0) {
    parts.push(content === 1 ? 'your mod' : `your ${content} mods`);
  }
  if (recipe.mods.some((mod) => mod.role === 'fabric-api')) parts.push('Fabric API');
  if (recipe.resourcePacks.length > 0) {
    parts.push(count(recipe.resourcePacks.length, 'resource pack', 'resource packs'));
  }
  if (parts.length === 0) return `Minecraft ${recipe.mcVersion} and nothing else`;
  const last = parts.pop() as string;
  const list = parts.length === 0 ? last : `${parts.join(', ')} and ${last}`;
  return `Minecraft ${recipe.mcVersion}, ${list}`;
}

/**
 * The offer card's sentences for `recipe`: what will be made and what it holds, which world
 * it opens or which server it joins, and that nothing else is touched. Plain words: the
 * launcher's and the instance's names, never a path or an id.
 */
export function describeRecipe(
  recipe: RunRecipe,
  options: { launcher?: RecipeLauncher } = {},
): RecipeDescription {
  const sentences: string[] = [];
  const contents = contentsOf(recipe);
  if (recipe.place.kind === 'server') {
    sentences.push(
      `A server on this computer named ${recipe.place.name}, with ${contents}.`,
      'It runs only while MCSuperMods is open, and it does not start until you accept the Minecraft EULA.',
    );
    if (recipe.world !== null) sentences.push(`Its world is a copy of "${recipe.world.folder}".`);
    sentences.push('Your launcher and its instances are not touched.');
    return { title: 'Make a server', sentences };
  }
  const launcher = LAUNCHER_NAMES[options.launcher ?? 'prism'];
  sentences.push(`A ${launcher} instance named ${recipe.place.name}, with ${contents}.`);
  if (recipe.world !== null) {
    sentences.push(
      recipe.world.source === null
        ? `The game makes the world "${recipe.world.folder}" itself the first time.`
        : `It opens a copy of the world "${recipe.world.folder}".`,
    );
  }
  if (recipe.join !== null) {
    sentences.push(`It joins the server at ${recipe.join.host}:${recipe.join.port}.`);
  }
  sentences.push('Your other instances are not touched.');
  const title =
    recipe.place.role === 'plain'
      ? 'Make an instance without mods'
      : recipe.place.role === 'pack'
        ? "Make the modpack's instance"
        : recipe.place.role === 'map'
          ? "Make the map's instance"
          : 'Make the test instance';
  return { title, sentences: withSnapshot(recipe, sentences) };
}

function withSnapshot(recipe: RunRecipe, sentences: string[]): string[] {
  if (recipe.channel !== 'snapshot') return sentences;
  return [
    ...sentences,
    `Minecraft ${recipe.mcVersion} is a snapshot: if the launcher does not offer it, the launcher says so when the game starts.`,
  ];
}
