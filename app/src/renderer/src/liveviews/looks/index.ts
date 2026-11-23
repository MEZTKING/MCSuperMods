/**
 * Batch 3's views (ADR 0121, Live views 3: looks and sounds): one entry per kind, each lazily
 * importing a stub file of this folder that says "not yet" inside the frame until its brief
 * builds it: B622 sounds, B624 fonts, B625 flat looks, B626 the day strip, B627 variants,
 * villagers and the sulfur cube, B628 paintings, banners, trims and pots, B629 shaders and post
 * effects, B630 songs and horns. A brief edits its own files only; this index is B620's and is
 * not touched again.
 *
 * **Overlap with `existing/index.ts` (B615).** Nine kinds already had a view for the Creator
 * and the AI review only. They are registered here and nowhere else (a test checks that no kind
 * is in two indexes, because a later spread of the same key wins silently in `registry.ts`):
 * the entry survives here, pointing at a file of this folder that re-exports B615's view, so
 * nothing regresses until the brief that builds the look replaces the file's body.
 */

import type { LiveViewLoader } from '../registry';

const sounds: LiveViewLoader = () => import('./sounds/SoundsView');
const font: LiveViewLoader = () => import('./font/FontView');
const particle: LiveViewLoader = () => import('./particle/ParticleSprites');
const waypoint: LiveViewLoader = () => import('./waypoint/WaypointStyleView');
const potion: LiveViewLoader = () => import('./potion/PotionLook');
const tab: LiveViewLoader = () => import('./tab/CreativeTabView');
const effect: LiveViewLoader = () => import('./effect/EffectLook');
const day: LiveViewLoader = () => import('./day/DayStrip');
const variant: LiveViewLoader = () => import('./variant/VariantView');
const soundVariant: LiveViewLoader = () => import('./variant/SoundVariantView');
const sulfurCube: LiveViewLoader = () => import('./sulfur-cube/SulfurCubeView');
const villagerType: LiveViewLoader = () => import('./villager/VillagerTypeView');
const profession: LiveViewLoader = () => import('./villager/ProfessionLook');
const painting: LiveViewLoader = () => import('./painting/PaintingView');
const banner: LiveViewLoader = () => import('./banner/BannerView');
const trim: LiveViewLoader = () => import('./trim/TrimView');
const pot: LiveViewLoader = () => import('./pot/PotPatternView');
const shader: LiveViewLoader = () => import('./shader/ShaderView');
const postEffect: LiveViewLoader = () => import('./post/PostEffectView');
const song: LiveViewLoader = () => import('./jukebox/JukeboxSongView');
const instrument: LiveViewLoader = () => import('./instrument/InstrumentView');

/**
 * The kinds of the audit's 30 rows for Live views 3 whose view is in the preview panel
 * (`previewKind: 'live_view'`). The potion, the creative tab and the villager type show theirs
 * in their Studios and keep no panel view ({@link LOOKS_STUDIO_KINDS}).
 */
export const LOOKS_PANEL_KINDS: readonly string[] = Object.freeze([
  'minecraft:sounds',
  'minecraft:font',
  'minecraft:particle',
  'minecraft:waypoint_style',
  'minecraft:timeline',
  'minecraft:world_clock',
  'minecraft:wolf_variant',
  'minecraft:cat_variant',
  'minecraft:pig_variant',
  'minecraft:cow_variant',
  'minecraft:chicken_variant',
  'minecraft:frog_variant',
  'minecraft:zombie_nautilus_variant',
  'minecraft:cat_sound_variant',
  'minecraft:pig_sound_variant',
  'minecraft:cow_sound_variant',
  'minecraft:chicken_sound_variant',
  'minecraft:sulfur_cube_archetype',
  'minecraft:painting_variant',
  'minecraft:banner_pattern',
  'minecraft:trim_pattern',
  'minecraft:trim_material',
  'minecraft:decorated_pot_pattern',
  'minecraft:shader',
  'minecraft:post_effect',
  'minecraft:jukebox_song',
  'minecraft:instrument',
]);

/**
 * Kinds of this batch that have a view for a Studio or the Creator but declare no panel view:
 * the three audit rows whose view is a Studio's Preview (potion, creative tab, villager type)
 * and the two kinds that already had one (effect, village job) whose look this batch adds to.
 */
export const LOOKS_STUDIO_KINDS: readonly string[] = Object.freeze([
  'msm:potion',
  'msm:creative_tab',
  'msm:villager_type',
  'msm:effect',
  'msm:villager_profession',
]);

/** The views of batch 3 by element kind id. */
export const LOOKS_VIEWS: Readonly<Record<string, LiveViewLoader>> = Object.freeze({
  // B622: Play on every sound.
  'minecraft:sounds': sounds,
  // B624: a line in the font.
  'minecraft:font': font,
  // B625: sprites, the locator bar, the bottles, the tab page, the effect frame.
  'minecraft:particle': particle,
  'minecraft:waypoint_style': waypoint,
  'msm:potion': potion,
  'msm:creative_tab': tab,
  'msm:effect': effect,
  // B626: the day strip.
  'minecraft:timeline': day,
  'minecraft:world_clock': day,
  // B627: the mob bodies, their voices, the cube and the villager.
  'minecraft:wolf_variant': variant,
  'minecraft:cat_variant': variant,
  'minecraft:pig_variant': variant,
  'minecraft:cow_variant': variant,
  'minecraft:chicken_variant': variant,
  'minecraft:frog_variant': variant,
  'minecraft:zombie_nautilus_variant': variant,
  'minecraft:cat_sound_variant': soundVariant,
  'minecraft:pig_sound_variant': soundVariant,
  'minecraft:cow_sound_variant': soundVariant,
  'minecraft:chicken_sound_variant': soundVariant,
  'minecraft:sulfur_cube_archetype': sulfurCube,
  'msm:villager_type': villagerType,
  'msm:villager_profession': profession,
  // B628: paintings, banners, trims and pots.
  'minecraft:painting_variant': painting,
  'minecraft:banner_pattern': banner,
  'minecraft:trim_pattern': trim,
  'minecraft:trim_material': trim,
  'minecraft:decorated_pot_pattern': pot,
  // B629: shaders and post effects.
  'minecraft:shader': shader,
  'minecraft:post_effect': postEffect,
  // B630: songs and horns.
  'minecraft:jukebox_song': song,
  'minecraft:instrument': instrument,
});
