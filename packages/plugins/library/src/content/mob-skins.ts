/**
 * Mob skins (ADR 0064 D6): the vanilla mob variant kinds the Mob skin flow and the examples
 * write, with the texture sizes their models map (read from the client jars of both built-in
 * targets, where they agree). Textures are generated two-tone placeholders,
 * never Mojang files.
 */
import type { ContentBundleAsset, Json, JsonObject } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { KINDS, mobSkinTexture } from './bundle';

/** An animal the Mob skin flow offers. */
export type SkinAnimal = 'wolf' | 'cat' | 'pig' | 'cow' | 'chicken' | 'frog';

/** What the flow and the examples need to know about one animal's variants. */
export interface SkinAnimalFacts {
  /** The element kind of its variants. */
  kind: string;
  /** The English name, lower case. */
  label: string;
  /** The texture size of an adult, in pixels. */
  adult: { width: number; height: number };
  /** The texture size of a baby, in pixels; absent when babies use the adult texture. */
  baby?: { width: number; height: number };
  /** Wolves have a wild, tame and angry texture for each age. */
  wolfLayout?: true;
  /** Where the animal spawns, for the notes. */
  spawns: string;
}

/** The animals of the Mob skin flow, in choice order. */
export const SKIN_ANIMALS: Readonly<Record<SkinAnimal, SkinAnimalFacts>> = Object.freeze({
  wolf: {
    kind: KINDS.wolfVariant,
    label: 'wolf',
    adult: { width: 64, height: 32 },
    baby: { width: 32, height: 32 },
    wolfLayout: true,
    spawns: 'Wolves spawn in forests, taigas, groves, savannas and badlands.',
  },
  cat: {
    kind: KINDS.catVariant,
    label: 'cat',
    adult: { width: 64, height: 32 },
    baby: { width: 32, height: 32 },
    spawns: 'Cats spawn in villages and swamp huts.',
  },
  pig: {
    kind: KINDS.pigVariant,
    label: 'pig',
    adult: { width: 64, height: 64 },
    baby: { width: 32, height: 32 },
    spawns: 'Pigs spawn on grass in most temperate biomes.',
  },
  cow: {
    kind: KINDS.cowVariant,
    label: 'cow',
    adult: { width: 64, height: 64 },
    baby: { width: 64, height: 64 },
    spawns: 'Cows spawn on grass in most biomes.',
  },
  chicken: {
    kind: KINDS.chickenVariant,
    label: 'chicken',
    adult: { width: 64, height: 32 },
    baby: { width: 16, height: 16 },
    spawns: 'Chickens spawn on grass in most biomes.',
  },
  frog: {
    kind: KINDS.frogVariant,
    label: 'frog',
    adult: { width: 48, height: 48 },
    spawns: 'Frogs spawn in swamps; a tadpole picks its skin when it grows up.',
  },
});

/** The shades of a skin colour the variants use: the colour, the tame look, the angry look. */
export const SKIN_SHADES: readonly number[] = Object.freeze([0, 24, -32]);

/** A colour a shade lighter (`amount` > 0) or darker (`amount` < 0). */
export function shade(colour: Rgb, amount: number): Rgb {
  const channel = (value: number): number => Math.max(0, Math.min(255, Math.round(value + amount)));
  return [channel(colour[0]), channel(colour[1]), channel(colour[2])];
}

/** A spawn condition list: in `biomes` with priority 1, or everywhere with priority 0. */
export function spawnConditions(biomes: string | readonly string[] | undefined): Json {
  if (biomes === undefined) return [{ priority: 0 }];
  return [
    {
      priority: 1,
      condition: {
        type: 'minecraft:biome',
        biomes: typeof biomes === 'string' ? biomes : [...biomes],
      },
    },
  ];
}

/**
 * The data and textures of one mob variant `<namespace>:<path>`: textures under
 * `entity/<animal>/<path>` (wolves add `_tame` and `_angry`, babies `_baby`), tinted
 * `colour`, and `spawn` as its `spawn_conditions`.
 */
export function mobSkinVariant(
  animal: SkinAnimal,
  namespace: string,
  path: string,
  colour: Rgb,
  spawn: Json,
): { data: JsonObject; assets: ContentBundleAsset[]; textures: string[] } {
  const facts = SKIN_ANIMALS[animal];
  const assets: ContentBundleAsset[] = [];
  const textures: string[] = [];
  const add = (suffix: string, size: { width: number; height: number }, tint: Rgb): string => {
    const texturePath = `entity/${animal}/${path}${suffix}`;
    assets.push(mobSkinTexture(namespace, texturePath, size.width, size.height, tint));
    textures.push(`textures/${texturePath}.png`);
    return `${namespace}:${texturePath}`;
  };
  if (facts.wolfLayout === true) {
    const baby = facts.baby ?? facts.adult;
    const data: JsonObject = {
      assets: {
        wild: add('', facts.adult, colour),
        tame: add('_tame', facts.adult, shade(colour, 24)),
        angry: add('_angry', facts.adult, shade(colour, -32)),
      },
      baby_assets: {
        wild: add('_baby', baby, colour),
        tame: add('_tame_baby', baby, shade(colour, 24)),
        angry: add('_angry_baby', baby, shade(colour, -32)),
      },
      spawn_conditions: spawn,
    };
    return { data, assets, textures };
  }
  const data: JsonObject = { asset_id: add('', facts.adult, colour) };
  if (facts.baby !== undefined) data.baby_asset_id = add('_baby', facts.baby, shade(colour, 24));
  data.spawn_conditions = spawn;
  return { data, assets, textures };
}
