/**
 * The looks and sounds topic (Live views 3, B632; ADR 0121): which kinds now show a look or a
 * Play button in the editor's Preview tab, their Studios and My things, by the app's own labels,
 * and the limits 3L1 to 3L12 in plain words. Only kinds, labels and limits: the helper cannot see
 * or hear a view, so it never says what one shows.
 *
 * The app's truth test (`app/test/ai-prompt-truth.looks.test.ts`) pins the kinds both ways
 * against the looks registry (`liveviews/looks/index.ts`) and every quoted label against the
 * components' source.
 */

/**
 * Every kind of the looks registry (`LOOKS_VIEWS`), with the words the paragraph names it by;
 * kinds that share one view share its words.
 */
export const LOOKS_PROMPT_KINDS = Object.freeze({
  'minecraft:sounds': 'sounds',
  'minecraft:font': 'fonts',
  'minecraft:particle': 'particle sprites',
  'minecraft:waypoint_style': 'waypoint styles',
  'minecraft:timeline': 'timelines and world clocks',
  'minecraft:world_clock': 'timelines and world clocks',
  'minecraft:wolf_variant': 'the seven mob variants',
  'minecraft:cat_variant': 'the seven mob variants',
  'minecraft:pig_variant': 'the seven mob variants',
  'minecraft:cow_variant': 'the seven mob variants',
  'minecraft:chicken_variant': 'the seven mob variants',
  'minecraft:frog_variant': 'the seven mob variants',
  'minecraft:zombie_nautilus_variant': 'the seven mob variants',
  'minecraft:cat_sound_variant': 'their four sound sets',
  'minecraft:pig_sound_variant': 'their four sound sets',
  'minecraft:cow_sound_variant': 'their four sound sets',
  'minecraft:chicken_sound_variant': 'their four sound sets',
  'minecraft:sulfur_cube_archetype': 'sulfur cubes',
  'minecraft:painting_variant': 'paintings',
  'minecraft:banner_pattern': 'banner patterns',
  'minecraft:trim_pattern': 'armour trims',
  'minecraft:trim_material': 'armour trims',
  'minecraft:decorated_pot_pattern': 'pot patterns',
  'minecraft:shader': 'shaders',
  'minecraft:post_effect': 'post effects',
  'minecraft:jukebox_song': 'jukebox songs',
  'minecraft:instrument': 'horn calls',
  'msm:potion': 'potions',
  'msm:creative_tab': 'creative tabs',
  'msm:effect': 'effects',
  'msm:villager_type': 'villager looks',
  'msm:villager_profession': 'village jobs',
} as const);

/** Every label the two paragraphs quote, as the app shows it. */
export const LOOKS_PROMPT_LABELS = Object.freeze({
  preview: 'Preview',
  play: 'Play',
  findMinecraft: 'Find my Minecraft',
  myThings: 'Particles and sounds',
  aboutRight: 'About right',
  onlyInGame: 'Only in the game',
  seeIt: 'See it',
});

const L = LOOKS_PROMPT_LABELS;

export const LOOKS = `- Live views of looks and sounds: the "${L.preview}" tab also draws sounds, with "${L.play}" per event and per file (also beside every sound picker), fonts, particle sprites, waypoint styles, timelines and world clocks as a day strip, the seven mob variants on MSM's own stand-in bodies and their four sound sets, sulfur cubes, paintings, banner patterns, armour trims, pot patterns, shaders and post effects, jukebox songs and horn calls; potions, creative tabs, effects, villager looks and village jobs draw theirs in their Studios; My things' "${L.myThings}" opens each particle and sound. To check one, send the user to "${L.preview}" (your proposal: "${L.seeIt}"); you cannot see or hear them, so never say what they show.
- Limits of the looks: Play is the real check; Minecraft's own sounds and pictures need the Minecraft folder set up (the button says "${L.findMinecraft}"); sounds are heard flat, with no distance or echo; bodies are MSM's stand-ins, "${L.aboutRight}", turning but never walking, and the zombie nautilus is a flat sheet with its parts named; villager hats and babies and pets' collars are not drawn; without WebGL looks are flat pictures, and sounds still play; a bottle leaves Minecraft's own effect colours out; shields are not measured; shaders run only where WebGL 2 compiles them, the game's core shaders are a compile check only, and effects run on MSM's own test picture with stand-in values for what the game fills, else "${L.onlyInGame}"; TrueType and unihex fonts are about right; the creative tab page is a drawing without search or scrolling; a day strip shows values, not the sky; only English text shows.`;
