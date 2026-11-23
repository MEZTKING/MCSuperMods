# B619 spike: looks and sounds (live views, batch 3)

This folder answers 3S1 to 3S12 of [`docs/PLAN-live-views.md`](../../../PLAN-live-views.md) (batch 3) for [ADR 0121](../../../adr/0121-live-views-looks-and-sounds.md). The measurements were made on 2026-11-23 from b619 at 29b3920, on this cloud machine (4 cores, 15 GB, shared with two other workers), for the targets 26.3 and 26.4-snapshot-7. Fabric reports 26.4-snapshot-7 as 26.4-alpha.7, so some result files carry that name. Nothing here is built, linted or shipped.

**Clean room.** Mojang classes were read with `javap` signatures only (no `-c`), and no method body was read. Every picture the game drew was MSM's own:

- coded test pictures registered in place of the mob textures at run time;
- MSM's own trim patterns, palettes, banner patterns, waypoint sprites and fonts.

Vanilla files (the client jars and the asset store in Loom's cache) were read only at run time, into memory or the scratchpad, and deleted afterwards. From them come only counts, sizes, ids, field names and compiler error categories with identifiers stripped.

No screenshot of the game is kept. `bodies-sheet-*.png` and `wolf-reconstruction-26.3.png` show MSM's decoded codes (which texel of MSM's picture landed where), not game pixels.

## What was run

- **Client GameTest.** The throwaway `spike-src/spike619/B619ClientGameTest.java` ran in the runtime's GameTest source set. The source set's `fabric.mod.json` was swapped for `fabric.mod.json.spike` during the run, and its resources were written by `make_fixture.py`. Both have since been removed from `engine-mod/`. The test ran as `runClientGameTest` (Mesa EGL, Xvfb, `-Xmx2g`) on both versions and recorded:
  - **Bodies (3S3).** Each mob texture folder was replaced in the texture manager by MSM's coded pictures. The coded value is `u | v << ubits`, three bits per frame in R, G and B, plus a black and a white frame. Each mob was shot from six sides and once more from the front at the end, at 1200 by 1200 with FOV 30. Every screen pixel was decoded back to its texel. 28 bodies were shot, with the variant set on the server through the variant component, because `/summon`'s `variant` NBT is not applied.
  - **Looks (3S5, 3S6).** Armour stands wore MSM's trims on a clear equipment asset. Wall banners and item-framed shields carried MSM's patterns.
  - **Fonts and screens (3S7, 3S11).** Widths of MSM's fonts came from `Font.width`. The HUD screenshots showed MSM's waypoint style at 12 distances, plus the effect frames, the inventory and the creative screen (slot positions from the screen's slots).
- **Electron 45.2.2 (Chrome 156)** ran under Xvfb with SwiftShader (`spike-src/electron/`):
  - every vanilla sound decoded by Web Audio;
  - a long track through an `<audio>` element;
  - IPC reads;
  - every jar shader compiled under WebGL 2 after the mechanical translation, together with MSM's own 14;
  - the five jar post effects and one of MSM's own chains run on a still frame;
  - TrueType widths measured by the browser.
- **Node and Python** (`asset-index.mjs`, `unihex.mjs`, `extract-time.mjs`, `jarscan.py`, `pathlist.py`, `timelines.py`, `envattr.cjs`, `bodies.py`, `looks_measure.py`, `sheet.py`) measured:
  - the asset index;
  - unifont parsing;
  - extraction time;
  - folder counts;
  - the timeline shapes;
  - the body reconstruction (below);
  - colour sampling.
- **`pnpm build`** of the app measured the renderer size.

Both targets gave the same answers everywhere below unless a line says otherwise.

## 3S1 Where the asset store is, and reading one sound

- **Layout** (the launcher's own, verified on Loom's copy, which uses the same `objects/<first two hex>/<sha1>` layout):
  - the version JSON's `assetIndex.id` (26.3: `34`; 26.4-snapshot-7: `36`) names `assets/indexes/<id>.json`;
  - its `objects` map an index key such as `minecraft/sounds/mob/wolf/angry/bark1.ogg` to `{hash, size}`;
  - the file is `assets/objects/<hash[0..2]>/<hash>`.
- **Per launcher kind**, from the store `@msm/interop` already finds the client jar in (`ClientJarMatch.launcher` and `root`):

  | Launcher | Version JSON | Asset store |
  |---|---|---|
  | `official` | `<root>/versions/<id>/<id>.json` | `<root>/assets/` |
  | `prism`, `multimc` | `<root>/meta/net.minecraft/<v>.json`, which `mmc.ts` already records as `jsonPath` (verify at implementation) | `<root>/assets/` (verify at implementation) |
  | `curseforge` | `<root>/Install/versions/<v>/<v>.json` | `<root>/Install/assets/` (verify at implementation) |

  A missing version JSON or index means the button stays off, with the set-up line.
- **Not in the client jar, only in the asset store:**
  - `minecraft/sounds.json` (0.64 MB on 26.3, 0.66 MB on 26.4; 1,991 and 2,049 events);
  - the 4,961 and 5,231 `.ogg` files (377 and 384 MB);
  - `minecraft/font/unifont.zip`, `unifont_jp.zip`, `unifont_pua.zip` and `font/include/unifont*.json` (needed for unihex);
  - the non-English `lang` files.
- **Times** (warm, median of 15):
  - version JSON: 0.3 ms;
  - index parse: 4.0 to 4.3 ms;
  - `sounds.json` read and parse: 3.8 to 4.3 ms;
  - one small sound: 0.07 ms, a 1.5 MB disc 0.5 ms, the 11.3 MB longest track 6 ms.
  - Through Electron IPC (`ipcRenderer.invoke`, main reads the file; `results/3s1-ipc-26.3.json`), median and first call: a small sound 0.7 ms (first 34 ms), a disc 11 ms, the 11.3 MB track 31 ms, `sounds.json` 2 ms.
- **D11 budgets.** A project sound starts in about 5 ms after decoding (median 3 ms, p95 11 ms), well under 200 ms. A vanilla sound's first press costs IPC, index and `sounds.json` (about 45 ms), then reading and decoding the file. Proposed: 200 ms for a project sound and 300 ms for the first vanilla press.

## 3S2 Decoding every vanilla sound

- **All files decode:** 4,961 of 4,961 (26.3) and 5,231 of 5,231 (26.4) through `OfflineAudioContext.decodeAudioData`, with no failure. Files are mono 4,717 and 4,987 times and stereo 244 times. Their rates are 48 kHz (4,262 and 4,531), 44.1 kHz (696 and 697), 11,025 Hz (1) and 192 kHz (2).
- **Short sounds** (under 10 s; 4,784 and 5,030 files): decode median 3.0 to 3.5 ms, p95 10.3 to 11.4 ms, at most 36 to 118 ms (the busy machine).
- **Long sounds:** decoding the whole file is too heavy for music.

  | File | Length | Decode | Decoded PCM (Float32) |
  |---|---|---|---|
  | Longest music track | 904.5 s | 2.9 to 3.4 s | 319 to 347 MB (process private memory +326 MB) |
  | A music disc | 148 s | 0.5 s | 26 MB |

  An `<audio>` element on a blob URL has its metadata in 17 to 33 ms and grows memory by about 5 MB.
- **Answer: whole-file decode for short sounds, streaming for long ones.** Sounds whose `sounds.json` entry has `"stream": true` (vanilla marks music and records that way), or files over about 2 MB, play through a media element. The renderer's CSP has no `media-src`, so `default-src 'self'` blocks `blob:` media. B620 or B622 must add `media-src 'self' blob:` to `app/src/renderer/index.html`. Pitch on an element is `playbackRate` with `preservesPitch = false`. `tryit/effects.ts` keeps every decoded buffer forever, so the moved player needs a byte-capped cache and must never cache a streamed sound.

## 3S3 Stand-in bodies

**Method.** The decode of each view (`bodies-sheet-*.png`) was cut into faces: connected pixels whose texels differ by at most one, split by robust refits. Each face got a texel-to-screen map, and every face fitted to 0.1 to 0.4 px. A face seen square on lies parallel to the picture. Its depth came from UV-adjacent faces seen square on in the perpendicular views; a UV edge counts as shared when it runs along the same world axis in both. Where no such face existed, the depth came from two-view triangulation of the shared UV points, and parts at an angle came from their corners, triangulated the same way. The faces were then drawn again with the same cameras and compared texel by texel with the game's decode.

`results/bodies-<mc>.json` holds per body:

- the faces kept, with their UV rectangle and corners in model pixels from the entity's feet;
- the texel scale and the fit;
- how each face's depth was found;
- the share of the game's pixels the re-drawing matches exactly;
- the unstable pixels.

`wolf-reconstruction-26.3.png` shows the game's decode, the re-drawing and the matches (green) and misses (red).

**Findings.**

- **The bodies are boxes with the standard box texture layout.** One texel is one model pixel, with these exceptions:
  - the cat model is scaled 0.8;
  - the sulfur cube scales with `Size`: 1.5 at Size 2, 0.5 at Size 0;
  - outer layers are inflated 1.06 to 1.19 (the villager's robe and hat, pig and cow parts).
- **Both targets have the same bodies.** Every match rate is the same on both to two decimals, except the bodies that move.
- **The automatic re-drawing matches 66 to 84 % of the game's texels exactly** for the wolf, pig, cow, frog and sulfur cube, without hand work. What it misses can be seen and measured:
  - ears and other small boxes whose neighbours are hidden;
  - legs that share one UV rectangle;
  - the wolf's mane ring behind the head;
  - parts at an angle (tails, the villager's crossed arms), which it only partly places.

  A person or a box-level solver completes them from the same face lists.
- **Babies have their own models** (since 26.1, `baby_asset_id`). The cold and temperate pig babies are the same model.
- **Model names.** Variants offer a `model`:

  | Mob | Models |
  |---|---|
  | `pig_variant` | `normal`, `cold` |
  | `cow_variant` | `normal`, `cold`, `warm` |
  | `chicken_variant` | `normal`, `cold` |
  | `zombie_nautilus_variant` | `normal`, `warm` |
  | wolf, cat, frog | none |

  They are the same on both targets (vendored mcdoc). Vanilla's `cold` and `warm` variants use the model of that name; geometry differs for the cold pig, the cold and warm cows, the cold chicken and the warm zombie nautilus.
- **The sulfur cube archetype has no look field.** The body is one outer and one inner box from `textures/entity/sulfur_cube/` (`_small` pictures for small sizes). Archetypes differ in behaviour, items and sounds.
- **Movement.** The chicken's wings flap even standing on a block (75,000 to 100,000 unstable pixels). The zombie nautilus moves all the time out of water (158,000 and 51,000).

**Go or no-go per body** (texel match on 26.3 and 26.4):

| Body | Match | Verdict |
|---|---|---|
| Wolf, adult and baby | 0.75; 0.68 | **Go** |
| Cat, adult (scale 0.8) and baby | 0.73; 0.33 | **Go**; the baby by hand |
| Pig `normal`, `cold`, baby (one model) | 0.84; 0.81; 0.73 | **Go** |
| Cow `normal`, `cold`, `warm`, baby | 0.77; 0.79; 0.84; 0.66 | **Go** |
| Chicken `normal`, `cold`, baby | 0.56 to 0.71; 0.58 to 0.60; 0.68 to 0.70 | **Go**; wings in their rest pose, About right |
| Frog | 0.76 | **Go** |
| Villager: base, type layer, profession layer, level badge, baby, baby type layer | 0.44; 0.23; 0.44; 0.44; 0.72; 0.75 | **Go, by hand**: crossed arms at an angle, inflated robe and hat; every face is measured |
| Sulfur cube: outer and inner, both sizes | 0.84 (small outer 0.47 to 0.63) | **Go** |
| Zombie nautilus `normal`, `warm` | 0.66 to 0.68; 0.45 | **No-go**: never still, and the coral adds many parts at an angle. The flat sheet with its parts named (3L5); reserve B646 |

**3S3 answer.** A stand-in can be written for eight of the nine bodies so that the user's texture sits on it texel for texel; the zombie nautilus shows the flat sheet.

## 3S4 Texture folders and cache growth (paths in "Path lists for B621")

The batch 3 additions add up to:

| | 26.3 | 26.4-snapshot-7 |
|---|---|---|
| Textures (`.png` and `.png.mcmeta`) | 906 files, 0.40 MB | 913 files, 0.40 MB |
| Asset JSON and shaders | 263 files, 0.15 MB | 268 files, 0.15 MB |
| Data folders | 259 files, 0.08 MB | 398 files, 0.12 MB (26.4 adds `block_sound_set`, 137) |
| All of batch 3 | +1,423 files, +0.63 MB | +1,574 files, +0.67 MB |

Extraction of today's patterns takes 101 to 103 ms; with batch 3 it takes 169 to 276 ms (busy machine; `results/3s4-extract-time.txt`). The cache moves from schema 5 to 6. The `.png.mcmeta` files are needed: palette sections since 26.3 (3S5), animation, GUI scaling.

## 3S5 Trim colouring

Confirmed by screenshot on both targets, MSM's eight-colour palette against MSM's patterns:

- **Pixels at key level i become material colour i.** The key palette is `textures/palettes/trim_base.png`: eight greys, applied in file order. The material palette is `textures/palettes/<palette_id path>.png`. Chroma error was at most 0.021 (light 0.74 on front faces).
- **Since 26.3 the pattern picture names its key** in its `.png.mcmeta`: `{"palette": {"base_palette": "trim_base"}}` (texture_meta `palette`). Without it nothing is mapped and the pattern shows as drawn. MSM's Armour trim flow already writes this `.mcmeta` and its own key (`starters/armour-trim.ts`), so the view must read the key the `.mcmeta` names.
- Colours outside the key pass through unchanged (pure red, a mid grey). A half-alpha pattern pixel shows fully (cutout).
- A vanilla material on MSM's pattern works.
- `trim_material` has `palette_id` since 26.3 (`asset_name` before). Equipment assets may swap the palette per material through `trim_overrides` (vanilla iron armour uses `trim/iron_darker` for iron trims), and the view must apply that too.

## 3S6 Banner and shield layers and dye colours

Confirmed on both targets:

- **Layering.** Each layer is the pattern picture times the dye's colour, alpha-blended over what is below, in list order, on top of the base colour.
- **Dye colours.** All 16 dyes on a full white pattern matched `pattern × dye` within 5.4 of 255 (26.3) and 5.2 (26.4).
- **Multiply and blend.** Grey 128 × dye gives half (error 1.1 to 2.4). Alpha 128 blends half (1.4 to 4.6). A later full layer covers an earlier one (2.0).
- **Dye values.** 26.3's `DyeColor.getTextureDiffuseColor()` gave the 16 values (`results/client-26.3.json`, `dyes.textureDiffuseColor`). **26.4-snapshot-7's `DyeColor` has no colour accessor at all**, but its banners measure the same values within 5.2.
- **The app needs these values**, and `TargetFacts.dyeColours` holds only names. A target fact for the values is a plugin API minor (1.22.0 and 1.23.0 are taken); an app table is the alternative. Main session's call.
- **Shields were not measured**: the item frame drew them too small. They use `entity/shield/<asset>` pictures; the same rule is assumed (About right).

## 3S7 Fonts

- **Provider types** on both targets: `bitmap`, `space`, `ttf`, `unihex`, `reference` (`legacy_unicode` ended at 1.20).
- **Bitmap: exact.** Advance = round(w × height ÷ cell height) + 1, where w is the rightmost column holding any opaque pixel, plus one. Leading empty columns count, an empty glyph has advance 1, and halves round up. This was measured on MSM's glyph sheet at heights 4, 8 and 16 (`fonts.widths`).
- **A character the font lacks** draws the missing glyph (advance 6), not the default font's glyph.
- **Space: exact.** Advances as given; fractional sums round up (12.5 becomes 13); negatives are allowed.
- **Reference: exact.** Providers are tried in order, and later ones fill gaps.
- **TrueType: About right.** The game's widths against the browser's own at size 11 were A 8 against 7.52, "Hello" 28 against 27.88, "AAAA" 30 against 31.02: within about 1 px a word.
- **Unihex: cheap, so go.** The unifont zips are in the asset store, not the jar. Inflating `unifont.zip` (1.56 MB) gives 7.7 MB, 114,432 glyphs, in 140 ms plus 112 ms to parse; `unifont_jp` and `unifont_pua` take 18 and 17 ms. This belongs in a worker, on demand. The width rule was checked for one wide glyph only (中 = 9), so widths are About right until measured.

## 3S8 Shaders under WebGL 2

**26.x shaders do not use `#moj_import`.** They start with `#version 330`, then `#extension GL_ARB_separate_shader_objects : require` and `#include <minecraft:…>`. Their varyings carry `layout(location = N)`, and they use the Vulkan built-in `gl_VertexIndex`.

**The mechanical translation** is seven rules:

1. Replace the version line with `#version 300 es` and the precision lines.
2. Drop the separate-shader-objects extension line.
3. Inline `#include <ns:path>` (and `#moj_import`) once each, from the project, then the jar.
4. Strip `binding =`.
5. Strip `layout(location)` from vertex outputs and fragment inputs.
6. Map `gl_VertexIndex` and `gl_InstanceIndex` to `gl_VertexID` and `gl_InstanceID`.
7. Keep every other line as written, with a line map back to the user's lines.

**Compile results** (no shader compiles without the translation):

| Set | 26.3 | 26.4-snapshot-7 |
|---|---|---|
| Post programs (`shaders/post`) | 9 of 9 | 9 of 9 |
| Core | 46 of 63 (73 %) | 50 of 66 (76 %) |
| Include files compiled alone | 11 of 17 | 11 of 18 |
| MSM's own 14 | 9 of 14 | 9 of 14 |

**Why the rest fail.** Core and include failures come from:

- implicit int-to-float conversion, which ES does not allow ("wrong operand types", "no matching overloaded function", return types);
- identifiers the game defines from its code (undeclared identifiers);
- one reserved word.

MSM's five failures are exactly the desktop-only constructs a modder writes: `const float k = 2;`, `vec2 / 4`, `* 40` int literals, `vec3 * int`, and `texture2D`. The last fails in the game's own core profile too. None is rewritten (D8): the view shows the compiler's line.

**Core shaders can be shown as a compile check only.** Their pictures need the game's vertex formats and uniforms. **Go for post shaders and self-written shaders: compile, then run.**

## 3S9 Post effects

- **Fields** (both targets):
  - `targets`: name to `{width?, height?, persistent?, clear_color?}`;
  - `passes`: `{vertex_shader, fragment_shader, inputs, output, uniforms}`;
  - `inputs`: a target input `{target, sampler_name, use_depth_buffer?, bilinear?}` or a texture input `{location, sampler_name, width, height, bilinear?}`;
  - `uniforms`: block name to a list of `{name, type: int|ivec3|float|vec2|vec3|vec4|matrix4x4, value}`.
- **A version difference.** The full-screen vertex shader is `minecraft:core/screenquad` on 26.3 and `minecraft:core/screentriangle` on 26.4. A chain written for one target names a shader the other lacks (measured: "missing"). The view resolves the name from the target's jar and names a missing shader.
- **Inputs.** A sampler binds as `<sampler_name>Sampler`. Sizes are filled by member name (`InSize`, `OutSize`). The game's own targets (`minecraft:entity_outline`) are blank, and the view says so.
- **Speed under SwiftShader at 854 by 480**, per frame (`results/3s9-post-*.json`):

  | Effect | ms per frame |
  |---|---|
  | invert (2 passes) | 18 to 23 |
  | creeper | 49 to 56 |
  | entity outline | 132 to 162 |
  | blur (6 passes) | 133 to 254 |
  | spider (10 passes) | 472 to 554 |
  | MSM's 3-pass chain | 34 to 62 |

- **One still frame, in the worker (OffscreenCanvas) or after Apply: go.** Try it's canvas has no `preserveDrawingBuffer`, so the still is read in the same task as a render (as the Showcase's stills are, ADR 0118 D7). The spike used a synthetic 854 by 480 frame.

## 3S10 Timelines and world clocks

- **Both registries exist on both targets.**
  - A **timeline** has `period_ticks?`, `clock` (26.1+), `time_markers` (name to ticks, or `{ticks, show_in_commands?}`) and `tracks`. `tracks` map an environment attribute to `{ease?, modifier?, keyframes: [{ticks, value}]}`. `ease` is one of 31 named easings or `{cubic_bezier}`.
  - **A world clock is an empty object** on both targets. The day's length is the timeline's `period_ticks`, so B626's exit criterion "a clock's length rescales it" cannot hold as written.
- **Of 52 environment attributes, 45 can be drawn on a strip:**
  - 14 boolean;
  - 18 number;
  - 9 colour (RGB or ARGB);
  - 4 choice (moon phase, the two villager activities, eyeblossom);

  The other 7 are structured and are named (ambient sounds, music, the two bed rules, mob spawns, ambient particles, dripstone particle). A track with a `modifier` changes the attribute's value rather than setting it, so the strip shows it relative.
- **Vanilla's timelines:**
  - `day`: 24,000 ticks, 18 tracks, 6 markers;
  - `moon`: 192,000 ticks, 2 tracks;
  - `villager_schedule`: 24,000 ticks, 2 tracks;
  - `early_game`: no period, 1 track.

## 3S11 Waypoints, the creative page, the effect frame

- **Waypoint style.** With 4 sprites, near 8 and far 32, measured at 12 distances on both targets:
  - below `near_distance` the first sprite shows;
  - at `far_distance` and beyond, the last;
  - between them the middle sprites share the range evenly: sprite 1 + ⌊(d − near) ÷ (far − near) × (n − 2)⌋.

  A sprite is drawn at its own pixel size (9 by 9 becomes 18 by 18 at GUI scale 2), centred on the locator bar at its bearing. The bar takes the experience bar's place (GUI y 209 of 240).
- **Creative page** (slots from the screen): a 9 by 5 item grid at (9, 18), step 18, with the hotbar row at y 112, in the 195-wide panel. Tabs sit above and below the panel.
- **Effect frame.** On the HUD it is a 24 by 24 frame at the top right with the 18 by 18 icon inset 3, and rows are 26 apart. In the inventory, 120 by 32 panels list the icon, name and time.

## 3S12 Size

- **Renderer at 29b3920: 19,111,771 bytes (18.23 MiB) of 19 MiB.** It has grown from 18.0 MiB at B618; `results/3s12-check-size.txt` has the largest chunks. **0.27 MiB is left before the 18.5 MiB stop line.** `app.asar` was not measured (no `dist:dir`, to spare disk).
- **Estimate for batch 3**, all lazy, about 0.35 MiB. **This does not fit** without ADR 0123 D4's follow-up (the 26.3 Java project generator loaded lazily, about 1 MB), which must land before B620's app briefs.

  | Part | Estimate |
  |---|---|
  | Audio module and button | 10 to 15 kB |
  | Shader translator, compiler lines and chain runner | about 15 kB |
  | Fonts and unihex reader | about 10 kB |
  | 26 stand-in bodies | 2 to 6 kB each, about 0.1 MB in all, one lazy module per body |
  | About 12 views | 10 to 20 kB each, about 0.2 MB |

- **The bodies fit the 100 kB renderer JSON rule** (each well under 10 kB).

## Path lists for B621 (an app list beside `LIVE_VIEW_DATA_FOLDERS`, no target fact)

- **Textures** (`assets/minecraft/textures/<folder>/`, `.png` and `.png.mcmeta`, subfolders included):
  - `entity/wolf/`, `entity/cat/`, `entity/pig/`, `entity/cow/`, `entity/chicken/`, `entity/frog/`, `entity/nautilus/`, `entity/villager/`, `entity/sulfur_cube/`;
  - `entity/banner/`, `entity/shield/`, `entity/decorated_pot/`, `entity/equipment/`;
  - `painting/`, `trims/`, `palettes/`, `mob_effect/`, `particle/`, `font/`;
  - `gui/sprites/hud/locator_bar_dot/` and the `gui/sprites/hud/locator_bar_*` files;
  - `gui/sprites/hud/effect_background*`, `gui/sprites/container/inventory/effect_background*`;
  - `gui/sprites/container/creative_inventory/`, `gui/container/creative_inventory/`.
- **Asset files** (`assets/minecraft/<folder>/`): `font/` (JSON), `particles/`, `waypoint_style/`, `equipment/`, `post_effect/` and `shaders/` (`.vsh`, `.fsh`, `.glsl`, JSON).
- **Data folders:**
  - `wolf_variant`, `cat_variant`, `pig_variant`, `cow_variant`, `chicken_variant`, `frog_variant`, `zombie_nautilus_variant`;
  - `wolf_sound_variant`, `cat_sound_variant`, `pig_sound_variant`, `cow_sound_variant`, `chicken_sound_variant`;
  - `sulfur_cube_archetype`, `painting_variant`, `banner_pattern`, `trim_pattern`, `trim_material`, `decorated_pot_pattern`, `jukebox_song`, `instrument`, `timeline`, `world_clock`;
  - `block_sound_set` (26.4 only; extracts nothing on 26.3).

  `tags/painting_variant`, `tags/banner_pattern` and `tags/instrument` are already cached (B603), and `tags/worldgen/biome` already comes from live world generation for the spawn biome lists.
- **The asset store** (read on demand through the new reader, size cap 16 MB, never cached, copied or exported). Allowed index keys:
  - `minecraft/sounds.json`;
  - `minecraft/sounds/**.ogg`;
  - `minecraft/font/unifont*.zip`;
  - `minecraft/font/include/unifont*.json`.

  The largest object is 11.3 MB. A key outside these prefixes, or a path outside the store, is refused.

## The interface for B620 to stub

- **`audio/player.ts`**, moved from `tryit/effects.ts`, which then imports it:

  ```ts
  interface SoundRequest { key: string; bytes: Uint8Array; volume: number; pitch: number; stream: boolean }
  interface PlayingSound { readonly key: string; stop(): void; readonly ended: Promise<void>; position(): number; readonly duration: number | null }
  interface SoundPlayer { play(r: SoundRequest): PlayingSound | null; stopAll(): void; readonly current: PlayingSound | null }
  function webAudioPlayer(o?: { maxCachedBytes?: number }): SoundPlayer | null
  ```

  One sound at a time, so a second `play` stops the first. `stream` plays through a media element (CSP `media-src 'self' blob:`). Decoded buffers sit in a byte-capped cache; streamed sounds are never cached.
- **`audio/resolve.ts`:**

  ```ts
  interface SoundEntry { name: string; type: 'file' | 'event'; volume: number; pitch: number; weight: number; stream: boolean }
  interface ResolvedSound { event: string; origin: 'project' | 'vanilla' | 'missing'; subtitle?: string; entries: SoundEntry[] }
  function resolveSoundEvent(id, projectSounds: Record<string, Json>, vanillaSounds: Json | null): ResolvedSound
  function pickEntry(r, random: () => number): { entry: SoundEntry; file: { namespace: string; path: string; origin: 'project' | 'vanilla' } } | null
  ```

  The project's `sounds.json` merges over vanilla's per event, and `replace` drops vanilla's entries. An `event` entry is followed once.
- **`audio/vanilla-sounds.ts`** (B621):

  ```ts
  interface VanillaSoundReader { available(): Promise<boolean>; soundsJson(): Promise<Json | null>; file(key: string): Promise<Uint8Array | null> }
  ```

  Through a new channel `msm:v1:minecraft:assetObject` `{ version, key }` → `{ ok: true, bytes } | { ok: false, reason: 'not_set_up' | 'no_index' | 'not_listed' | 'not_allowed' | 'too_large' | 'missing' }`.
- **`SoundPlayButton.tsx`** props: `{ event?: string; file?: { namespace: string; path: string }; project; sounds: VanillaSoundReader | null; label?: string }`. `LiveViewProps` gains `readonly sounds?: VanillaSoundReader | null`. The player comes from one app-level provider, not the session store.
- **`liveviews/looks/index.ts`:** one lazy entry per batch 3 kind. B620 decides, per kind it shares with `existing/index.ts` (`msm:effect`, `msm:potion`, `msm:villager_profession`, the six mob-variant kinds), which one wins, and adds the test that no kind is in two indexes.
- **`looks/bodies/index.ts`:**

  ```ts
  type BodyId = 'wolf' | 'wolf_baby' | 'cat' | 'cat_baby' | 'pig' | 'pig_cold' | 'pig_baby' | 'cow' | 'cow_cold' | 'cow_warm' | 'cow_baby'
    | 'chicken' | 'chicken_cold' | 'chicken_baby' | 'frog' | 'villager' | 'villager_baby' | 'sulfur_cube';
  function bodyFor(kind: string, model: string | undefined, baby: boolean): (() => Promise<GeoJson>) | 'flat_sheet'
  ```

  Bodies are geo JSON for the existing geo renderer (`preview/geo/geometry.ts`, bones and cubes with UV boxes, rotations and inflate). The zombie nautilus returns `'flat_sheet'`.
- **`looks/shader/translate.ts`:**

  ```ts
  translateShader(src, stage: 'vertex' | 'fragment', include: (id: string) => string | null): { text: string; lineMap: number[]; notes: string[]; missingIncludes: string[] }
  ```

  The seven rules of 3S8.
- **`looks/shader/compile.ts`:** `compileShader(gl, text, stage, lineMap) → { ok, lines: { line: number; message: string }[] }`.
- **`looks/post/chain.ts`:** `parsePostEffect(json) → PostChain` (the 3S9 fields), and `runPostChain(gl, chain, programs, frame: ImageData, cancel)`.
- **`looks/font/layout.ts`:** `advance(provider, codePoint)` with the 3S7 bitmap rule, missing glyph 6.
- **`looks/day/strip.ts`:** `sampleTrack(track, ticks, period)`, with the easings of 3S10.
- **`looks/waypoint/`:** `spriteIndex(distance, near, far, count)` (3S11).

## What the plan's briefs should change

- **ADR 0121 D8 and the plan's "Key items":** replace "`#moj_import` includes" with the seven rules of 3S8. Mark core shaders compile-check only, and post and self-written shaders as go.
- **B621:**
  - read the asset store, adding unihex's `unifont*.zip`;
  - add the CSP `media-src 'self' blob:` or leave it to B622;
  - use the path lists above;
  - give the dye values a home (26.4 has no accessor): a plugin API minor or an app table, the main session's call.
- **B622:** stream `stream: true` and large sounds; cap the decoded cache. Budgets: 200 ms for a project sound, 300 ms for the first vanilla press.
- **B623:**
  - write eighteen bodies from `results/bodies-*.json` (babies are their own models; the cat is scaled 0.8; the sulfur cube scales with `Size`; the villager's layers are inflated);
  - the zombie nautilus is the flat sheet;
  - extend the exit criterion: every face in the spike's lists lands within half a model pixel, and the spike's re-drawing method (`bodies.py`) is the check.
- **B624:** unihex is in scope (about 250 ms in a worker).
- **B625:** use the waypoint rule and proportions of 3S11.
- **B626:** "a clock's length rescales it" becomes "`period_ticks` rescales it". World clocks have no fields.
- **B628:**
  - trims read the key from the pattern's `.png.mcmeta` and apply equipment `trim_overrides`;
  - banners need the dye values;
  - shields are About right until measured.
- **B629:** the vertex shader of a post pass differs by target (`screenquad` against `screentriangle`), so names resolve from the target's jar. Run one still frame in a worker.
- **Size:** the lazy Java project generator (ADR 0123 D4 follow-up) before B620's app briefs: 0.27 MiB is left and batch 3 needs about 0.35.
