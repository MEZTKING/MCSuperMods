/**
 * The textures of the user's own Minecraft as **Start from a Minecraft texture** lists them (ADR
 * 0129 D4): the jar paths of the local asset cache (ADR 0011, read from the user's client jar; MSM
 * ships none) as entries with a name made from the file name, a folder (blocks, items, mobs,
 * particles, GUI, paintings), the texture id (shown only in Advanced mode) and whether a
 * `.png.mcmeta` makes it an animation strip. Pure: no DOM, so it runs in Node tests.
 *
 * @packageDocumentation
 */

/** The folders the picker offers, in order, with their words. */
export const MC_TEXTURE_FOLDERS = [
  { id: 'block', label: 'Blocks' },
  { id: 'item', label: 'Items' },
  { id: 'entity', label: 'Mobs' },
  { id: 'particle', label: 'Particles' },
  { id: 'gui', label: 'GUI' },
  { id: 'painting', label: 'Paintings' },
] as const;

/** A folder id. */
export type McTextureFolder = (typeof MC_TEXTURE_FOLDERS)[number]['id'];

/** The jar folder all vanilla textures live in. */
export const MC_TEXTURES_PREFIX = 'assets/minecraft/textures/';

/** One texture of the user's Minecraft. */
export interface McTexture {
  /** The jar path, `assets/minecraft/textures/block/stone.png`. */
  readonly jarPath: string;
  /** The asset path in the `minecraft` namespace, `textures/block/stone.png`. */
  readonly assetPath: string;
  /** The texture id, `minecraft:block/stone` (Advanced mode only). */
  readonly id: string;
  readonly folder: McTextureFolder;
  /** The name made from the file name: `Stone`, `Full (heart)`. */
  readonly name: string;
  /** Whether a `.png.mcmeta` beside it makes it an animation strip. */
  readonly animated: boolean;
}

const FOLDER_IDS: ReadonlySet<string> = new Set(MC_TEXTURE_FOLDERS.map((entry) => entry.id));

/** `brown_mooshroom` as `Brown mooshroom`. */
function words(part: string): string {
  const text = part.replace(/[_-]+/g, ' ').trim();
  return text === '' ? part : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The name of a texture from its path below its folder (`stone`, `cow/brown_mooshroom`,
 * `sprites/hud/heart/full`): the file name in words, and the folder it sits in when the file
 * name does not already say it (`Full (heart)`, `Normal (chest)`).
 */
export function textureName(pathInFolder: string): string {
  const parts = pathInFolder.split('/');
  const file = parts[parts.length - 1] ?? pathInFolder;
  const parent = parts.length > 1 ? parts[parts.length - 2] : undefined;
  const name = words(file);
  if (parent === undefined || parent === 'sprites' || file.includes(parent)) return name;
  return `${name} (${words(parent).toLowerCase()})`;
}

/**
 * The textures among `paths` (jar paths, as `minecraft:listAssets` answers for
 * {@link MC_TEXTURES_PREFIX}): one entry per `.png` in an offered folder, sorted by folder and
 * then name.
 */
export function minecraftTextures(paths: readonly string[]): McTexture[] {
  const all = new Set(paths);
  const out: McTexture[] = [];
  for (const jarPath of paths) {
    if (!jarPath.startsWith(MC_TEXTURES_PREFIX) || !jarPath.endsWith('.png')) continue;
    const rest = jarPath.slice(MC_TEXTURES_PREFIX.length, -'.png'.length);
    const slash = rest.indexOf('/');
    if (slash < 0) continue;
    const folder = rest.slice(0, slash);
    if (!FOLDER_IDS.has(folder)) continue;
    out.push({
      jarPath,
      assetPath: `textures/${rest}.png`,
      id: `minecraft:${rest}`,
      folder: folder as McTextureFolder,
      name: textureName(rest.slice(slash + 1)),
      animated: all.has(`${jarPath}.mcmeta`),
    });
  }
  const order = MC_TEXTURE_FOLDERS.map((entry) => entry.id as string);
  return out.sort(
    (a, b) =>
      order.indexOf(a.folder) - order.indexOf(b.folder) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The textures of `folder` (`'all'`: every folder) whose name, or id, holds every word of
 * `query`: a name that is the query comes first, then names that start with it, then the rest in
 * their order.
 */
export function filterTextures(
  textures: readonly McTexture[],
  folder: McTextureFolder | 'all',
  query: string,
): McTexture[] {
  const inFolder = folder === 'all' ? [...textures] : textures.filter((t) => t.folder === folder);
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return inFolder;
  const tokens = wanted.split(/[\s_:/]+/).filter((token) => token !== '');
  const rank = (texture: McTexture): number => {
    const name = texture.name.toLowerCase();
    if (name === wanted) return 0;
    if (name.startsWith(wanted)) return 1;
    return 2;
  };
  return inFolder
    .filter((texture) => {
      const text = `${texture.name} ${texture.id}`.toLowerCase();
      return tokens.every((token) => text.includes(token));
    })
    .map((texture, index) => ({ texture, index, rank: rank(texture) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.texture);
}

/** The folder a texture path names (`textures/block/x.png` -> `block`), when it is offered. */
export function folderOfPath(path: string): McTextureFolder | undefined {
  const folder = /(?:^|[/:])textures\/([^/]+)\//.exec(path)?.[1];
  return folder !== undefined && FOLDER_IDS.has(folder) ? (folder as McTextureFolder) : undefined;
}

type JsonObject = { [key: string]: unknown };

/**
 * MSM's own `.png.mcmeta` for a texture started from an animated Minecraft texture: the
 * `animation` timing read from the vanilla sidecar (frame time, interpolation, frame order and
 * frame size: numbers, not pictures), written with sorted keys, so the user's strip animates as
 * the game's does. `null` when the sidecar has no animation or cannot be read.
 */
export function animationMeta(vanilla: Uint8Array | null): Uint8Array | null {
  if (vanilla === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(vanilla));
  } catch {
    return null;
  }
  const animation =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as JsonObject).animation
      : undefined;
  if (typeof animation !== 'object' || animation === null || Array.isArray(animation)) return null;
  const source = animation as JsonObject;
  const out: JsonObject = {};
  for (const key of ['frames', 'frametime', 'height', 'interpolate', 'width'] as const) {
    const value = source[key];
    if (key === 'interpolate' ? typeof value === 'boolean' : value !== undefined) {
      if (key === 'frames' ? Array.isArray(value) : key === 'interpolate' || isCount(value)) {
        out[key] = value;
      }
    }
  }
  return new TextEncoder().encode(`${JSON.stringify({ animation: out }, null, 2)}\n`);
}

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Whether a picture of `width` by `height` is an animation strip (frames stacked, square). */
export function isStrip(width: number, height: number): boolean {
  return width > 0 && height > width && height % width === 0;
}
