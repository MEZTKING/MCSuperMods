# Live view audit

Written by brief B575 of [the live world generation plan](PLAN-live-worldgen.md) on 2026-11-22, at commit 14bfec1. It applies the standing rule **Everything visible live** ([ADR 0119 D1](adr/0119-live-worldgen-preview.md)): every kind that makes something a player can see or hear has a live view in the app (the preview panel, its Studio or Try it) that follows an edit by itself; a kind with nothing to see is exempt, with the reason. A kind without a live view is a gap here, with the batch that closes it. A brief that adds a kind, a Studio or a Creator flow adds or updates its row.

## How it was counted and checked

- **Counted from the code.** The kinds are the `contributes.elementKinds` of the ten built-in plugins that contribute kinds (`packages/plugins/*/src/index.ts`), read by loading the plugins themselves, not from any document. `@msm/plugin-library` contributes starters and examples only.
- **Live view today** comes from `previewKind` (`app/src/renderer/src/preview/PreviewPanel.tsx`: `model`, `block_definition`, `item_definition`, `structure`, `climate_map`, `geo_model`, `animation`, `entity`, plus the `model` field of `msm:block` and `msm:item`, the armour figure and the recipe picture), the Studio registry (`studios/*/studios.tsx` and `ElementForm.tsx`'s built-in Studios, with each Studio's own Preview section), and Try it (`app/src/renderer/src/tryit/`, `packages/sim/src/`: the files each catalogue reads).
- **Checked in the running app** (`pnpm build`, then the built app under `xvfb-run -a` with SwiftShader WebGL, driven by a throwaway Playwright script outside the repository; `app/out` deleted afterwards). Copies of `fixtures/sample-worldgen` (with a dimension, noise settings, a density function and a noise added in the copy), `sample-mod`, `sample-datapack`, `sample-particles`, `sample-villagers-and-fluids` and `sample-vehicles` were opened; each element was selected and the preview panel, the editor's side preview and the Studio's preview sections were read. For a sample, the element's data was replaced through Raw JSON and Apply, and the time until the preview's text or pixels changed was measured. Try it was opened on `sample-villagers-and-fluids`. Without the client jar (as in CI), so vanilla models draw with the missing texture.
- **Measured** (time from Apply to a changed preview, SwiftShader, one run each): the climate map of a dimension 0.20 and 0.25 s; the recipe picture 16 ms; the Particle Studio preview 9 ms; the Potion Studio preview 34 and 105 ms; a block's model preview 68 and 146 ms. Try it opened in 0.76 s with the project's job block, three spawn eggs and two buckets in the hotbar, and lowers the project again 300 ms after an edit (`LOWER_DEBOUNCE_MS`, `tryit/session-source.ts`; the edits themselves are covered by `e2e/tryit-path.spec.ts`). Edits to kinds without a view (biome, noise settings, density function, noise, loot table) changed nothing on screen, as expected. A few Raw JSON replacements did not take in the script (Monaco focus), so the effect and armour rows rest on the code (both views read the element directly).
- **Verdicts.** *Has one*: a view that follows edits without a button, an export or the game. *Needs one*, with its batch: **this plan** (`docs/PLAN-live-worldgen.md`, brief named), **Live views 2: data**, **Live views 3: looks**, **Live views 4: assembled structures** (the ROADMAP ideas of the plan's section (e)). *Exempt*: nothing to see, with the reason. A row whose view covers only part of what the player sees keeps *Has one* when the main thing is shown, and names the rest in the note. Since 2026-11-22 each *Needs one: Live views 2, 3 or 4* row also names the brief of [`docs/PLAN-live-views.md`](PLAN-live-views.md) that covers it (batch 2 data B600–B618, batch 3 looks and sounds B619–B633, batch 4 assembled structures B634–B645).

## Count

**Count:** 118 kinds from the contributions (resourcepack 13, datapack 62, structures 5, worldgen 14, blocks-items 11, models-anim 2, entities 4, scripting 4, rules 1, controls 2; `library` contributes none). Has one **28**; needs one **81** (this plan 14, Live views 2 34, Live views 3 30, Live views 4 3); exempt **9**. Checked in the running app: 42 kinds (marked *checked*).

## Kinds

### Resource pack (`@msm/plugin-resourcepack`): 13 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `minecraft:model` | Block and item shapes | Preview panel 3D (`model`); Try it draws project models | yes, at once (the panel rebuilds from the element) | Has one |  |
| `minecraft:block_definition` | Which model each block state shows | Preview panel 3D (`block_definition`); Try it | yes, at once | Has one |  |
| `minecraft:item_definition` | How an item looks in hand and in slots | Preview panel 3D (`item_definition`); Try it hotbar | yes, at once | Has one |  |
| `minecraft:lang` | Every name and line of text | Try it names (hotbar, picker, What happened, chat feedback read `en_us.json`) | yes, Try it lowers the project again 300 ms after an edit | Has one | Only `en_us` is read; other languages show nowhere. |
| `minecraft:sounds` *checked* | Sounds and their subtitles | None in the panel or a Studio (no play button); Try it plays a project sound only when the simulation fires its event, vanilla sounds stay a caption | only through Try it events | Needs one: Live views 3 (looks), B622 | A play button per event, with the subtitle. |
| `minecraft:pack_mcmeta` | The pack name and description in the pack list | Pack settings form | — | Exempt | Settings, not content: ADR 0119 D1 names pack settings exempt. |
| `minecraft:equipment` *checked* | The worn armour layers | Preview panel armour figure (`ArmourPreviewView`) | yes, at once | Has one |  |
| `minecraft:atlas` | Nothing directly: which pictures are stitched together | Schema form | — | Exempt | An atlas list: ADR 0119 D1 names it exempt. |
| `minecraft:font` | Letters on screen | Schema form | — | Needs one: Live views 3 (looks), B624 | Sample text drawn with the font. |
| `minecraft:particle` | The sprites of a vanilla-style particle type | Schema form (the Particle Studio is for `msm:particle`) | — | Needs one: Live views 3 (looks), B625 | The frames played as the Particle Studio plays its own. |
| `minecraft:post_effect` | Whole-screen effects (spectator mob views, glowing outlines) | Schema form | — | Needs one: Live views 3 (looks), B629 | The effect on a still frame. |
| `minecraft:waypoint_style` | The locator bar icons | Schema form | — | Needs one: Live views 3 (looks), B625 | The icon strip at each distance. |
| `minecraft:shader` | How the game draws things | Raw file, unchecked (ADR 0106) | — | Needs one: Live views 3 (looks), B629 | The shader on a still frame. |

### Data pack (`@msm/plugin-datapack`): 62 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `minecraft:recipe` *checked* | The recipe in the recipe book and the crafting screen | Preview panel crafting picture (`preview-recipe`); the Recipe Studio grid is the editor | yes, measured 16 ms after Apply | Has one | Shaped, shapeless and cooking types; smithing, stonecutting and the machine types show only the form. |
| `minecraft:loot_table` *checked* | What drops and what a chest holds | None | no | Needs one: Live views 2 (data), B609 | A **Roll it** list. |
| `minecraft:advancement` *checked* | Toasts and the advancement screen | None | no | Needs one: Live views 2 (data), B611 | The tab as a tree. |
| `minecraft:predicate` *checked* | Nothing by itself; decides when other things happen | None | no | Needs one: Live views 2 (data), B610 | Tried on a sample player or block. |
| `minecraft:item_modifier` *checked* | Changes to items (counts, names, enchantments) | None | no | Needs one: Live views 2 (data), B610 | Tried on a sample item. |
| `minecraft:function` *checked* | Whatever its commands do | Function editor with live Spyglass problems; Try it does not run functions (only in the game, `sim/commands/run.ts`) | problems only | Needs one: Live views 2 (data), B613 | What Try it's command reader understands of it. |
| `minecraft:tag/block` | Nothing by itself; which things count as members | Tag Studio (the list as typed); Try it reads `climbable` and `wooden_fences` only | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/item` *checked* | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/entity_type` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/fluid` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/game_event` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/function` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/damage_type` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/enchantment` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/painting_variant` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/villager_trade` *checked* | Which trades a job offers at each level | Tag Studio; Try it merchant mock-up reads it (`sim/traders/catalogue.ts`) | yes, Try it lowers the project again 300 ms after an edit | Has one |  |
| `minecraft:tag/banner_pattern` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/dialog` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/instrument` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/point_of_interest_type` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/potion` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/timeline` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/worldgen/biome` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/worldgen/feature` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/worldgen/flat_level_generator_preset` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/worldgen/structure` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:tag/worldgen/world_preset` | Nothing by itself; which things count as members | Tag Studio (the list as typed) | no | Needs one: Live views 2 (data), B612 | The resolved members, vanilla tags expanded. |
| `minecraft:enchantment` | The tooltip line and what it does | None (the Creator's Card tab shows a card only inside the Creator) | no | Needs one: Live views 2 (data), B610 | The tooltip and level table. |
| `minecraft:damage_type` | Death messages, hurt sounds | None | no | Needs one: Live views 2 (data), B611 | A sample death line. |
| `minecraft:dimension_type` *checked* | Sky, light, height of a dimension | Dimension Type Studio sky swatch; Try it's Sky choice for a project dimension that uses it | yes, Try it lowers the project again 300 ms after an edit | Has one | This plan adds its lowest and highest lines to the side cut (B582). |
| `minecraft:chat_type` | How chat lines are formatted | None | no | Needs one: Live views 2 (data), B611 | A sample chat line. |
| `minecraft:jukebox_song` | The song a disc plays | None | no | Needs one: Live views 3 (looks), B630 | Play the song. |
| `minecraft:banner_pattern` | A pattern on banners and shields | None | no | Needs one: Live views 3 (looks), B628 | On a banner model. |
| `minecraft:painting_variant` | A painting on a wall | None outside the Creator (its Card tab hangs a painting while the flow runs) | no | Needs one: Live views 3 (looks), B628 | On a wall at its size. |
| `minecraft:trim_material` | The colour of armour trims | None | no | Needs one: Live views 3 (looks), B628 | On the armour figure. |
| `minecraft:trim_pattern` | Lines drawn on armour | None | no | Needs one: Live views 3 (looks), B628 | On the armour figure. |
| `minecraft:dialog` | A screen with text and buttons | None | no | Needs one: Live views 2 (data), B611 | A mock-up screen. |
| `minecraft:villager_trade` *checked* | A trade in the merchant screen | Try it merchant mock-up (`MerchantScreen`) | yes, Try it lowers the project again 300 ms after an edit | Has one |  |
| `minecraft:trade_set` | A trader's list of trades | Try it merchant mock-up | yes, Try it lowers the project again 300 ms after an edit | Has one |  |
| `minecraft:wolf_variant` *checked* | A wolf skin and where it spawns | None | no | Needs one: Live views 3 (looks), B627 | The vanilla mob wearing it. |
| `minecraft:cat_variant` | A cat skin and where it spawns | None | no | Needs one: Live views 3 (looks), B627 | The vanilla mob wearing it. |
| `minecraft:pig_variant` | A pig skin and where it spawns | None | no | Needs one: Live views 3 (looks), B627 | The vanilla mob wearing it. |
| `minecraft:cow_variant` | A cow skin and where it spawns | None | no | Needs one: Live views 3 (looks), B627 | The vanilla mob wearing it. |
| `minecraft:chicken_variant` | A chicken skin and where it spawns | None | no | Needs one: Live views 3 (looks), B627 | The vanilla mob wearing it. |
| `minecraft:frog_variant` | A frog skin and where it spawns | None | no | Needs one: Live views 3 (looks), B627 | The vanilla mob wearing it. |
| `minecraft:zombie_nautilus_variant` | A zombie nautilus skin and where it spawns | None | no | Needs one: Live views 3 (looks), B627 | The vanilla mob wearing it. |
| `minecraft:cat_sound_variant` | The cat's voice | None | no | Needs one: Live views 3 (looks), B627 | Play each sound. |
| `minecraft:pig_sound_variant` | The pig's voice | None | no | Needs one: Live views 3 (looks), B627 | Play each sound. |
| `minecraft:cow_sound_variant` | The cow's voice | None | no | Needs one: Live views 3 (looks), B627 | Play each sound. |
| `minecraft:chicken_sound_variant` | The chicken's voice | None | no | Needs one: Live views 3 (looks), B627 | Play each sound. |
| `minecraft:instrument` *checked* | A goat horn's call | None | no | Needs one: Live views 3 (looks), B630 | Play the call. |
| `minecraft:enchantment_provider` | Enchantments on mobs' gear and in loot | None | no | Needs one: Live views 2 (data), B609 | Roll it, as for loot. |
| `minecraft:trial_spawner` | What a trial spawner spawns and drops | None | no | Needs one: Live views 2 (data), B609 | Roll the waves and the reward. |
| `minecraft:timeline` | Sky and light changes over the day | None | no | Needs one: Live views 3 (looks), B626 | A day strip of the values it sets. |
| `minecraft:world_clock` | How fast a day goes | None | no | Needs one: Live views 3 (looks), B626 | Shown with its timelines' day strip. |
| `minecraft:decorated_pot_pattern` | A picture on a decorated pot | None | no | Needs one: Live views 3 (looks), B628 | On a pot model. |
| `minecraft:block_transformer` | A block changing when used, with particles (scraping, waxing) | None | no | Needs one: Live views 2 (data), B614 | Tried on a block in Try it. |
| `minecraft:test_environment` | Nothing in play: GameTest set-up for map makers | Schema form | — | Exempt | Only the game's test runner uses it (ADR 0106: offered for map makers). |
| `minecraft:test_instance` | Nothing in play: a GameTest for map makers | Schema form | — | Exempt | As above. |
| `minecraft:sulfur_cube_archetype` | A sulfur cube's look, sounds and bounce | None | no | Needs one: Live views 3 (looks), B627 | The cube with its sounds. |
| `minecraft:context_int_provider` | Nothing directly: a number other data reads (compost chances) | Schema form; the Item Studio shows the compost chance it feeds | — | Exempt | A value, seen where the data that reads it is edited. |
| `minecraft:context_float_provider` | Nothing directly: a number other data reads | Schema form | — | Exempt | As above. |

### Structures (`@msm/plugin-structures`): 5 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `minecraft:structure_template` *checked* | A building or piece | Preview panel 3D (`structure`); Structure Studio | yes, at once | Has one |  |
| `minecraft:worldgen/template_pool` *checked* | Which pieces a jigsaw structure joins | Template Pool Studio (pieces, connections); no picture | no | Needs one: Live views 4 (assembled structures), B640 | The assembly from a start pool. |
| `minecraft:worldgen/structure` | A structure in the world | None | no | Needs one: Live views 4 (assembled structures), B640 | Assembled; start markers on the map come with this plan (B585). |
| `minecraft:worldgen/structure_set` *checked* | Where structures start | None | no | Needs one: this plan | Markers on the map, approximate (B585, WL5). |
| `minecraft:worldgen/processor_list` *checked* | Weathered or changed blocks in a structure | None | no | Needs one: Live views 4 (assembled structures), B641 | Applied to the template preview. |

### World generation (`@msm/plugin-worldgen`): 14 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `minecraft:worldgen/biome` *checked* | The land, colours, sky, mobs and music of a biome | Biome Studio (colour pickers); no picture | no | Needs one: this plan | Lit on the host map, Find it (B582). |
| `minecraft:worldgen/feature` *checked* | Trees, ores, plants in the world | Tree Studio for trees (form only); schema form for the rest | no | Needs one: this plan | Scatter and Walk in it (B583, B584, B585). |
| `minecraft:worldgen/placed_feature` *checked* | How often and where a feature appears | Placed Feature Studio (form only) | no | Needs one: this plan | Scatter (B583, B585). |
| `minecraft:dimension` *checked* | A whole world | Preview panel climate map (`climate_map`) | yes, measured 0.20 to 0.25 s after Apply | Has one | This plan replaces the map with Map, Side cut and Climate (B582). |
| `minecraft:worldgen/world_preset` *checked* | A world type in Create New World | Preview panel climate map | yes (same view) | Has one | This plan adds a tab per dimension (B582). |
| `minecraft:worldgen/noise_settings` *checked* | The shape of the land, sea level, blocks | None | no | Needs one: this plan | Map and Side cut in a host (B582). |
| `minecraft:worldgen/density_function` *checked* | The land's shape, indirectly | None | no | Needs one: this plan | Value map (B585). |
| `minecraft:worldgen/noise` *checked* | The land's shape, indirectly | None | no | Needs one: this plan | Value map (B585). |
| `minecraft:worldgen/carver` | Carved caves and canyons | None | no | Needs one: this plan | A line "Carved caves show only in the game" (B585); drawn only if reserve B593 holds (limit WL4). |
| `minecraft:worldgen/flat_level_generator_preset` | A superflat world type | None | no | Needs one: this plan | Layer column (B582); also a Try it ground. |
| `minecraft:worldgen/multi_noise_biome_source_parameter_list` | Where biomes lie | None | no | Needs one: this plan | Map (Biomes) in a plain host (B582). |
| `minecraft:worldgen/block_state_provider` | Which blocks a feature places | None | no | Needs one: this plan | A strip of sample picks (B585). |
| `minecraft:worldgen/material_condition` | Where surface blocks go | None | no | Needs one: this plan | Side cut and top blocks map in a host (B582). |
| `minecraft:worldgen/material_rule` | Grass, sand, snow on top of the land | None | no | Needs one: this plan | Side cut and top blocks map in a host (B582). |

### Blocks and items (`@msm/plugin-blocks-items`): 11 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `msm:block` *checked* | The block, placed, broken, used | Preview panel model (from its `model` field); Block Studio type preview and shape preview; Try it | yes, measured 68 to 146 ms after Apply; Try it 300 ms | Has one |  |
| `msm:item` *checked* | The item in hand, worn, used | Preview panel model and armour figure; Try it hotbar | yes, at once; Try it 300 ms | Has one |  |
| `msm:effect` *checked* | The icon, name, particles and what it does | Effect Studio Preview (icon, name in its category colour, per level); Try it chips | yes, at once (the Studio reads the element) | Has one | The particle swirl and the HUD icon in place come with Live views 3 (looks). |
| `msm:mod` *checked* | Nothing in play: the mod list entry | Mod settings form | — | Exempt | The mod's own settings: ADR 0119 D1 names them exempt. |
| `msm:biome_addition` *checked* | Features and mobs added to vanilla biomes | World addition Studio (form only) | no | Needs one: this plan | Scatter and the ground with the addition on or off (B583, B585). |
| `msm:loot_addition` *checked* | Extra drops | Extra drops Studio (form only) | no | Needs one: Live views 2 (data), B609 | Roll it, with and without the addition. |
| `msm:potion` *checked* | The bottle's colour, names, effects | Potion Studio Preview (the four names and the ids) | yes, measured 34 to 105 ms after Apply (names only) | Needs one: Live views 3 (looks), B625 | The bottles in their colour; the names already follow edits. |
| `msm:particle` *checked* | The particle | Particle Studio Preview (Burst, Stream); Try it | yes, measured 9 ms after Apply | Has one |  |
| `msm:creative_tab` | A tab in the creative inventory | Creative Tab Studio "Preview" (title, icon id and item count as text) | yes, at once (text only) | Needs one: Live views 3 (looks), B625 | A mock-up of the tab with its icons. |
| `msm:fluid` *checked* | The liquid and its bucket | Fluid Studio Preview (still, flowing, bucket, tint); Try it buckets | yes, at once; Try it 300 ms | Has one |  |
| `msm:vanilla_block_rules` | Vanilla blocks flattened, tilled, sounding differently | Vanilla block rules Studio (form only) | no | Needs one: Live views 2 (data), B614 | Tried on the vanilla block in Try it. |

### Models and animation (`@msm/plugin-models-anim`): 2 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `msm:geo_model` *checked* | A mob's or vehicle's body | Preview panel geo renderer | yes, at once | Has one |  |
| `msm:animation` | How a body moves | Preview panel geo renderer with playback | yes, at once | Has one |  |

### Entities (`@msm/plugin-entities`): 4 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `msm:entity` *checked* | The mob, how it moves and acts | Preview panel geo renderer with animations, variants and baby; Try it (spawn eggs, wandering, hits) | yes, at once; Try it 300 ms | Has one |  |
| `msm:vehicle` *checked* | The vehicle, driven | Vehicle Studio Preview (turret, wheels, seats); Try it driving | yes, at once; Try it 300 ms | Has one |  |
| `msm:villager_profession` *checked* | A villager job: its look, work block and trades | Profession Studio pictures; Try it merchant mock-up | yes, Try it lowers the project again 300 ms after an edit | Has one | The job's look on a villager model comes with Live views 3. |
| `msm:villager_type` | Villagers' clothes in a biome | Villager look Studio pictures (flat) | yes, at once (flat pictures only) | Needs one: Live views 3 (looks), B627 | On a villager model. |

### Scripting (`@msm/plugin-scripting`): 4 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `msm:script` *checked* | Whatever the script does | Try it runs it in a sandboxed worker; What happened | yes, Try it lowers the project again 300 ms after an edit | Has one |  |
| `msm:command` | A command in chat | Command Studio "How it is typed" (`command-usage`); Try it chat box | yes, at once; Try it 300 ms | Has one |  |
| `msm:game_rule` | A line in the game rule screen | Game rule Studio (name and description as typed) | — | Exempt | One text line the Studio already shows; nothing else to see. |
| `msm:stat` | A line in the Statistics screen | Statistic Studio (name and how its number is shown) | — | Exempt | As above. |

### Rules (`@msm/plugin-rules`): 1 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `msm:rules` | Whatever the rules do | Try it (generated scripts, What happened); Rule book "What this becomes" in Advanced | yes, Try it lowers the project again 300 ms after an edit | Has one |  |

### Controls (`@msm/plugin-controls`): 2 kinds

| Kind | What a player sees or hears | Live view today | Follows an edit | Verdict | Note |
|---|---|---|---|---|---|
| `msm:key_bind` *checked* | A key in Controls and what it does | Try it keys | yes, Try it lowers the project again 300 ms after an edit | Has one |  |
| `msm:hud` *checked* | An element on screen | HUD Studio Preview (GUI scale 2 to 4, riding) | yes, at once | Has one |  |

## Surfaces that are not kinds

| Surface | What it shows today | Follows an edit | Verdict | Note |
|---|---|---|---|---|
| The Creator's steps (57 flows) | `CreatorPreview`: tabs Items, Blocks (with the set row), Recipes, Armour, Stats, Card (paintings, enchantments) and Elements, over the bundle the flow builds in memory | yes, 150 ms after an answer (`CREATOR_DEBOUNCE_MS`) | Has one for the flows that make blocks, items, gear, food, recipes, paintings and enchantments (most of the 19 block, 9 gear and 3 food flows, Status effect, Potion); the gaps: B615 (mobs, vehicles, particle, fluid, the villager flows, extra drop), B630 (sounds, patterns, creative tab, villager look) | Gaps: the 9 mob flows (Mob skin and Wandering merchant among them) and 4 vehicle flows show only their items and the element list (no body), the Particle and Fluid flows show no particle or liquid, the Music disc and Goat horn flows play nothing, the villager flows show no merchant screen or look, Creative tab shows no tab, Banner pattern, Armour trim and Pot pattern show their items but not the pattern on a banner, armour or pot. Batches: Dimension flow, **this plan** (B587, live map in the wizard); mobs, vehicles, particle, fluid, villager look, creative tab, patterns, sounds, **Live views 3** (reuse the Studio previews in the Creator's preview); villager trade and village job, extra drop, **Live views 2** (merchant mock-up, Roll it). Custom command, Game rule and Scripted behaviour: as their kinds (Command Studio's usage line; game rules exempt; scripts in Try it after Create). |
| The AI helper's proposed changes | `AiChangesetReview`: the JSON before and after as a line diff per element, and placeholder textures as pictures | the review is fixed per proposal; after Apply, each element's own view applies | Needs one: Live views 2 (data), B615 (moved forward from Live views 3 by ADR 0120 D7) | Show a proposal through the Creator's in-memory preview (`preview/bundle-source.ts`), so a proposed block, item or mob is seen before Apply. Worldgen proposals get this plan's map after Apply (B590 says so in the helper's words). |
| Very easy's My things | Home's cards (`components/home/MyThings.tsx`): one card per set or thing (vehicle, village job, liquid, block, item, mob, effect, potion, rules, command, key, on-screen element, creative tab) with its picture from the project, opening the thing's Studio with its preview | yes, the card pictures are read from the project as it is | Has one | No card for worlds, dimensions, particles or sounds: worlds come with this plan's Make a world tile (B586); particles and sounds with Live views 3. |

## Biggest gaps

1. **World generation as a whole** (12 kinds plus `msm:biome_addition` and structure sets: 14 rows for this plan). Only dimensions and world presets show anything (the climate map); biomes, noise settings, density functions, features and surface rules show nothing. This plan closes them (B582, B583, B585), with carvers left as a line (WL4).
2. **Data pack data with nothing to look at** (34 rows for Live views 2): loot tables and extra drops (no Roll it), advancements, enchantments, dialogs, predicates and item modifiers, functions (Try it does not run them), and the 20 tag kinds (no resolved members). Loot tables and functions are the most used.
3. **Looks and sounds** (30 rows for Live views 3): every sound is silent in the editor (`minecraft:sounds`, sound variants, jukebox songs, goat horns; Try it plays a project sound only when an event fires it), the seven mob variants and villager looks, paintings, banners, trims, pot patterns, fonts, shaders, post effects, waypoint styles, potion bottles and the creative tab.
4. **Jigsaw structures** (3 rows for Live views 4): a template pool, a structure and a processor list show no assembled building; only single templates draw.
5. **The Creator's mob and vehicle flows** show no body although the Studios have one, and the AI helper's proposals are seen only as JSON.

## Differences from the plan's grouped reading

- `msm:effect` has a live view: the Effect Studio's Preview (icon, name in its category colour, the levels) follows edits; only the in-world look waits for Live views 3.
- `minecraft:dimension_type`, the merchant kinds (`villager_trade`, `trade_set`, `tag/villager_trade`, `msm:villager_profession`), `minecraft:lang`, `msm:command`, `msm:key_bind` and `msm:fluid` have live views through their Studios or Try it.
- `minecraft:sounds` was checked: there is no play button anywhere outside Try it.
- `msm:potion` and `msm:creative_tab` have text previews that follow edits, but not the look (bottle colour, the tab), so they stay *needs one* in Live views 3.
- `minecraft:function` is not run by Try it (`sim/commands/run.ts`: "only in the game"); it stays in Live views 2.
- `msm:game_rule`, `msm:stat`, `minecraft:test_environment`, `minecraft:test_instance` and the two context providers are exempt; `minecraft:timeline` and `world_clock` go to Live views 3 (they change the sky over a day); `minecraft:block_transformer`, `trial_spawner` and `enchantment_provider` go to Live views 2.
- The contributions give 118 kinds (the datapack plugin's 62 include 21 tag kinds and 35 generic data kinds); root `CLAUDE.md` says 115. The library has 57 Creator flows; root `CLAUDE.md` says 55.
