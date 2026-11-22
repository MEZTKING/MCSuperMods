/**
 * Today's previews as live views (B615; ADR 0120 D7): the geo renderer for mobs, the Vehicle
 * Studio's preview, the Particle Studio's player, the liquid's pictures, the effect's card, the
 * potion's names, Try it's merchant screen, the Creator's block and item pictures and the mob
 * skins' pictures, each wrapped in the live view frame with the Preview tag, so the Creator's
 * Live tab and the AI helper's See it pane show them over a bundle or a proposal. Only kind ids
 * and loaders are here; a view's code loads when it is first shown.
 */

import type { LiveViewLoader } from '../registry';

const mob: LiveViewLoader = () => import('./MobView');
const vehicle: LiveViewLoader = () => import('./VehicleView');
const particle: LiveViewLoader = () => import('./ParticleView');
const fluid: LiveViewLoader = () => import('./FluidView');
const effect: LiveViewLoader = () => import('./EffectView');
const potion: LiveViewLoader = () => import('./PotionView');
const merchant: LiveViewLoader = () => import('./MerchantView');
const piece: LiveViewLoader = () => import('./PieceView');
const skin: LiveViewLoader = () => import('./SkinView');

/** The kinds whose view is a wrapped preview of today (`previewKind` is not `live_view`). */
export const EXISTING_VIEWS: Readonly<Record<string, LiveViewLoader>> = Object.freeze({
  'msm:entity': mob,
  'msm:vehicle': vehicle,
  'msm:particle': particle,
  'msm:fluid': fluid,
  'msm:effect': effect,
  'msm:potion': potion,
  'msm:villager_profession': merchant,
  'minecraft:trade_set': merchant,
  'minecraft:villager_trade': merchant,
  'minecraft:tag/villager_trade': merchant,
  'msm:block': piece,
  'msm:item': piece,
  'minecraft:wolf_variant': skin,
  'minecraft:cat_variant': skin,
  'minecraft:pig_variant': skin,
  'minecraft:cow_variant': skin,
  'minecraft:chicken_variant': skin,
  'minecraft:frog_variant': skin,
});
