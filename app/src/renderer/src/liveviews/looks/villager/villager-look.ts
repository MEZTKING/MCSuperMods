/**
 * The villager's layers (B627; ADR 0121 D4): the game draws a villager as one body wearing, from
 * the bottom, the villager picture, its look (`msm:villager_type` or one of Minecraft's), its
 * job's clothes (`msm:villager_profession`) and the badge of its trading level, all on the same
 * model, so the views lay them into one picture for the villager stand-in. Paths are jar paths
 * (`assets/<ns>/textures/....png`), read from the project first and then from the user's own jar
 * cache. Pure: no DOM.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { thingName, thingWords } from '../../../components/thing-picker/thing-sources';
import type { ResourceFolders } from '../../../preview/model-chain';
import { textureFile } from '../../existing/PieceView';
import type { BodyLayer } from '../variant/BodyLook';

type JsonObject = { [key: string]: Json };
const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The trading levels in words, Novice to Master. */
export const LEVEL_WORDS: readonly string[] = [
  'Novice',
  'Apprentice',
  'Journeyman',
  'Expert',
  'Master',
];

/** The badge picture of each level (`entity/villager/profession_level/<badge>.png`). */
export const LEVEL_BADGES: readonly string[] = ['stone', 'iron', 'gold', 'emerald', 'diamond'];

/** Each badge in words. */
export const BADGE_WORDS: Readonly<Record<string, string>> = {
  stone: 'stone',
  iron: 'iron',
  gold: 'gold',
  emerald: 'emerald',
  diamond: 'diamond',
};

/** The villager picture an element names (`textures.villager`), or `undefined`. */
export function villagerPicture(data: Json | undefined): string | undefined {
  const textures = isObject(data) && isObject(data.textures) ? data.textures : undefined;
  const picture = textures?.villager;
  return typeof picture === 'string' && picture !== '' ? picture : undefined;
}

/** A look a villager can wear: a project look or one of Minecraft's. */
export interface LookChoice {
  /** The element id or Minecraft's look id. */
  readonly key: string;
  readonly words: string;
  /** The jar path of its picture, or `null` when it names none. */
  readonly path: string | null;
}

/** A job a villager can have: a project job (or none). */
export interface JobChoice {
  readonly key: string;
  readonly words: string;
  readonly path: string | null;
}

const bareMinecraft = (id: string): string => id.replace(/^minecraft:/, '');

/** The base villager picture. */
export function basePath(folders: ResourceFolders): string {
  return `assets/minecraft/${folders.textures}/entity/villager/villager.png`;
}

/** The badge picture of a level (1 to 5). */
export function badgePath(folders: ResourceFolders, level: number): string {
  const badge = LEVEL_BADGES[Math.max(0, Math.min(4, level - 1))] ?? 'stone';
  return `assets/minecraft/${folders.textures}/entity/villager/profession_level/${badge}.png`;
}

/** The looks: the project's first, then Minecraft's (the target's `villagerTypes`). */
export function lookChoices(
  project: Project,
  folders: ResourceFolders,
  vanillaTypes: readonly string[],
): LookChoice[] {
  const own = project.namespaces.flatMap((namespace) =>
    namespace.elements
      .filter((element) => element.kind === 'msm:villager_type')
      .map((element) => lookOf(project, element, folders)),
  );
  const vanilla = vanillaTypes.map((name) => {
    const id = name.includes(':') ? name : `minecraft:${name}`;
    return {
      key: id,
      words: `${thingWords(id)} (Minecraft’s)`,
      path: `assets/minecraft/${folders.textures}/entity/villager/type/${bareMinecraft(id)}.png`,
    };
  });
  return [...own, ...vanilla];
}

/** A project look as a choice. */
export function lookOf(
  project: Project,
  element: Pick<Element, 'id' | 'data'>,
  folders: ResourceFolders,
): LookChoice {
  const picture = villagerPicture(element.data);
  return {
    key: element.id,
    words: thingName(project, element.id),
    path: picture === undefined ? null : textureFile(picture, folders),
  };
}

/** The jobs: none, then the project's. */
export function jobChoices(project: Project, folders: ResourceFolders): JobChoice[] {
  const own = project.namespaces.flatMap((namespace) =>
    namespace.elements
      .filter((element) => element.kind === 'msm:villager_profession')
      .map((element) => jobOf(project, element, folders)),
  );
  return [{ key: '', words: 'No job', path: null }, ...own];
}

/** A project job as a choice; its name is the job's display name. */
export function jobOf(
  project: Project,
  element: Pick<Element, 'id' | 'data'>,
  folders: ResourceFolders,
): JobChoice {
  const picture = villagerPicture(element.data);
  const data = isObject(element.data) ? element.data : {};
  const name =
    typeof data.display_name === 'string' && data.display_name !== ''
      ? data.display_name
      : thingName(project, element.id);
  return {
    key: element.id,
    words: name,
    path: picture === undefined ? null : textureFile(picture, folders),
  };
}

/**
 * The layers of a villager, bottom first: the villager, its look, its job's clothes and, with a
 * job, the badge of its level.
 */
export function villagerLayers(
  folders: ResourceFolders,
  look: Pick<LookChoice, 'path' | 'words'> | null,
  job: Pick<JobChoice, 'path' | 'words'> | null,
  level: number,
): BodyLayer[] {
  const layers: BodyLayer[] = [{ path: basePath(folders), label: 'The villager' }];
  if (look !== null) layers.push({ path: look.path, label: 'The clothes of the look' });
  if (job !== null) {
    layers.push({ path: job.path, label: 'The job’s clothes' });
    const badge = LEVEL_BADGES[Math.max(0, Math.min(4, level - 1))] ?? 'stone';
    layers.push({ path: badgePath(folders, level), label: `The ${BADGE_WORDS[badge]} badge` });
  }
  return layers;
}
