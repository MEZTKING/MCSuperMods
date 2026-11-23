# ADR 0121: Live views 3, looks and sounds

## Context

The second follow-up batch of "Everything visible live" ([ADR 0119](0119-live-worldgen-preview.md) D1). The audit [`docs/LIVE-VIEW-AUDIT.md`](../LIVE-VIEW-AUDIT.md) gives it 30 kinds: `minecraft:sounds`, fonts, vanilla-style particles, post effects, waypoint styles, shaders, jukebox songs, banner patterns, painting variants, trim materials and patterns, the seven mob variants, the four sound variants, instruments, timelines and world clocks, pot patterns, the sulfur cube archetype, `msm:potion`, `msm:creative_tab` and `msm:villager_type`. It also notes that no sound can be heard anywhere in the editor: Try it plays a project sound only when the simulation fires its event, and a vanilla sound is a caption.

Facts at 505d7c3 (the fact table 3F1–3F12, below since the close): Try it has a Web Audio player for Ogg Vorbis bytes; the jar extraction keeps only block and item textures; the art generator states that vanilla mob texture layouts are "not MSM's to know"; `minecraft:shader` is a raw, unchecked file. Two facts are to be verified by the spike B619: vanilla sound files are not in the client jar but in the launcher's asset store, and vanilla mob shapes are code, so no file holds a body to draw. The spike confirmed both (3S1, 3S3).

The machinery (the `live_view` route, the registry, the frame, the fidelity levels, the bundle route for the Creator and the AI review) is [ADR 0120](0120-live-views-data.md)'s and is used unchanged.

## Decision

### D1 Scope

Every one of the 30 kinds gets a live view, in the place listed in the plan's batch 3 table. `msm:effect` (which has a view) gains its corner frame and swirl colour; My things gains cards for particles and sounds.

### D2 A Play button everywhere a sound is picked or defined

- One shared `audio/` module in the renderer (the player moved out of Try it, which then uses it) and one `SoundPlayButton`.
- The button resolves an event through the project's `sounds.json`, then vanilla's; picks a file by weight as the data says; plays at the event's volume and pitch. One sound at a time.
- It is placed in the sounds form, in every Sounds section and sound picker of the Studios, Rules and the Creator, and in the views of jukebox songs, instruments, sound variants, damage types and the sulfur cube. A test walks the sound pickers and fails when one has no button.
- A sound is heard flat: no distance, category volume or echo.

### D3 Vanilla sounds and looks come from the user's own Minecraft files

- Vanilla sound files and `sounds.json` are read from the asset store of the user's own Minecraft folder, found through the install `@msm/interop` already knows, on demand through IPC. They are not copied into MSM's cache and never leave the machine. Without a set-up folder the button is off for vanilla ids, with the set-up link; project sounds always play.
- The jar extraction ([ADR 0011](0011-client-jar-asset-extraction.md)) is extended to the texture folders these views read (entity, painting, banner and shield patterns, trims and palettes, pot patterns, GUI sprites, particle, font) and to shader and post effect files. As ever: never committed, bundled, exported, written into a project or sent to the AI helper.

### D4 Stand-in bodies

- For the seven variant mobs, the villager and the sulfur cube MSM draws its own **stand-in bodies**: geo models written by MSM from what the game shows (client GameTest screenshots of MSM's own test textures) and from the layout of the user's texture files. They are labelled **About right** and do not animate beyond turning.
- Mojang's Bedrock geometry files are Mojang's assets and are not read or used.
- Where the spike finds a body cannot be learned well enough, that view shows the texture sheet flat with its parts named, and says so.
- Reserve B646: the runtime's dev mode writes the real part boxes, obtained through the game's own accessors on the user's machine, to the managed instance, where the app reads them like a save. Never shipped.

### D5 Paintings, banners, trims and pots on MSM's own shapes

A wall and frame, a banner and a shield, and a pot are MSM's shapes; trims are drawn on the existing armour figure, the material's palette applied to the pattern's picture as the data names them. The user picks the dye colour, the armour and the counterpart (a material for a pattern, a pattern for a material).

### D6 Fonts

A line the user types is drawn with the font at GUI scales 1 to 4. Bitmap, space and reference providers are exact from their pictures; TrueType providers are drawn by the browser (about right); a provider the view cannot draw is named.

### D7 Potions, creative tabs, particle sprites, waypoint styles, day strips

- A potion shows its four bottles in its colour (vanilla's pictures from the jar, MSM's drawn bottle without it).
- A creative tab shows its page: the icon on the tab and the items in their order. It is MSM's drawing.
- `minecraft:particle` plays its sprites as the Particle Studio plays its own; a waypoint style shows its icon at each distance.
- Timelines and world clocks show a day strip of the values they set. The sky itself is not drawn.

### D8 Shaders and post effects: where WebGL allows, and a stated limit elsewhere

- The app draws with WebGL 2; the game's shaders target desktop OpenGL. A shader is put through a small, mechanical translation (the version line, precision, includes resolved from the jar, uniform blocks) and compiled.
- Where it compiles, a shader runs on a test picture and a post effect on a still frame of Try it, labelled About right.
- Where it does not, the view shows the compiler's lines against the user's code, the pass chain as a diagram, and "the effect itself is only in the game". Nothing is rewritten by guesswork and nothing is drawn that the shader did not produce.
- How far "where it compiles" reaches is the spike's 3S8 and 3S9. If the share is too small to be useful, the views are the diagram and the compile check only, and that is the recorded limit (3L6).

### D9 Without WebGL, and reduced motion

Bodies and shapes fall back to flat pictures; sounds still play; turning bodies stand still under reduced motion, as the Showcase's stills do ([ADR 0118](0118-showcase-with-live-clips.md) D7–D9).

### D10 The Creator's flows

Music disc, Goat horn, Banner pattern, Armour trim, Pot pattern, Creative tab, Villager look and Mob skin show their result in the Creator's Live tab through ADR 0120 D7's registry. No new mechanism.

### D11 Order and budgets

After the game modes plan closes (B562). Views follow an edit in 150 ms plus 250 ms; a sound starts within 200 ms of the press for a project sound (draft; B619 sets both and the number for vanilla sounds). Code budget 0.4 MB of renderer output (ADR 0120 D10).

## Alternatives considered

- **Ship a few vanilla sounds or textures for the previews.** Rejected: never bundle Mojang assets.
- **Copy vanilla sounds into MSM's cache.** Not needed: they are already loose files on the user's disk; reading in place keeps one copy.
- **Bodies from Mojang's Bedrock geometry.** Rejected: Mojang's assets, and not the Java shapes.
- **Show variants only as flat textures.** Kept as the fallback; a body is what the user asked to see.
- **Run shaders through a full OpenGL-to-WebGL translator.** A new, large dependency against a full size budget; rejected in favour of the mechanical translation and a stated limit.
- **Leave shaders exempt.** Rejected: a shader changes what a player sees, so the rule applies; the compile check alone is already worth having.

## Consequences

- Sound becomes part of editing everywhere, not only of Try it.
- The app reads a second place in the user's Minecraft folder (the asset store), through one new reader.
- MSM takes on a set of stand-in bodies to keep in step with new variants; the target says which variants exist.
- The cache grows by more texture folders; users re-extract once.
- A new `audio/` folder, a looks area under `liveviews/`, an e2e spec, guide text.


## Findings at the close (B633, 2026-11-23)

Reviewed against the merged code of B619–B632: `app/src/renderer/src/audio/` (`player.ts`, `resolve.ts`, `provider.tsx`, `SoundPlayButton.tsx`, `sound-pickers.ts`, `vanilla-sounds.ts`), `app/src/renderer/src/liveviews/looks/` (`index.ts` and the folders `sounds/`, `font/`, `particle/`, `waypoint/`, `potion/`, `tab/`, `effect/`, `day/`, `bodies/`, `variant/`, `sulfur-cube/`, `villager/`, `painting/`, `banner/`, `trim/`, `pot/`, `shader/`, `post/`, `jukebox/`, `instrument/`), `preview/ArmourPreviewView.tsx` and `armour-preview.ts` (the trim layer), `components/home/MyThings.tsx`, the Studios that draw their own look (Potion, Effect, Creative Tab, Villager look, Profession) and `IdField` in `studios/structures/pickers.tsx`, `packages/interop/src/minecraft-install/` (`asset-index.ts`, cache schema 6), the channel `msm:v1:minecraft:assetObject`, `TargetFacts.dyes` (plugin API 1.25.0), the CSP in `app/src/renderer/index.html`, the tests under `app/test/components/audio/` and `app/test/components/liveviews/looks/`, the e2e specs `live-views-looks-path` and `live-views-shaders-path`, `packages/ai/src/prompt/looks.ts` and `docs/guide/live-views.md`. D1 to D11 hold, with the outcomes below. The close changed only docs and ran no suite; every number here is a brief's own, from its DEVLOG entry of 2026-11-23. Reserve B646 did not run.

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 Scope | Met: all 30 kinds have a live view, and `docs/LIVE-VIEW-AUDIT.md` counts 112 kinds with one, 3 waiting (Live views 4) and 9 exempt (82, 33 and 9 when the batch started, of 124). `LOOKS_VIEWS` (`liveviews/looks/index.ts`) has 32 entries: the 30 kinds plus `msm:effect` (its corner frame, the inventory panel and the swirl) and `msm:villager_profession` (the job's clothes on a villager). Nine kinds that B615 had registered in `existing/index.ts` (`msm:effect`, `msm:potion`, `msm:villager_profession` and the six mob variants) moved to the looks index in one commit (B620), and `looks-index.test.tsx` fails when a kind is in two of the data, existing and looks indexes. 27 kinds declare `previewKind: 'live_view'`; the potion, the creative tab and the villager type draw theirs in their Studios only, as the plan's table said. My things gained **Particles and sounds** (B630). No kind, editing Studio or runtime code was added. |
| D2 Play everywhere | Built: `audio/player.ts` (`webAudioPlayer`: one sound at a time, decoded buffers in a 64 MB cache, `stream` sounds and files over 2 MB through an `<audio>` element on a `blob:` URL never cached, pitch clamped 0.5 to 2, volume 0 to 1, heard flat), `resolve.ts` (the project's entry added to vanilla's, `replace`, an `event` entry followed once, the pick by weight as the game's sound manager does), `SoundPlayButton` with one app-level provider, never the session store. Placed through the shared `IdField` (every Studio field that takes a sound event id), the ThingPicker's sound tiles (so the Rules sound slots and Very easy's sound chips), the Block Studio's How it sounds, the schema form's sound fields, the Creator's song field and the starter wizard's, the sounds view, the sound variants, the sulfur cube, songs, horn calls and My things: `SOUND_PICKERS` lists 25 places and the walk in `sound-pickers.test.tsx` fails when a renderer file picks a sound without being listed. **Not built:** the damage type's hurt sound (its sample line still says "The hurt sound cannot be played here yet."; the file was batch 2's and no batch 3 brief owned it) and Play on the Rules chip once a sound is picked (only the picker's tiles have it). The CSP gained `media-src 'self' blob:` (B622). |
| D3 The user's own files | Built as decided. The asset store reader `minecraft-install/asset-index.ts` (official `<root>/assets/`, Prism and MultiMC `<root>/assets/`, CurseForge `<root>/Install/assets/`; the last two "verify at implementation"), the channel `msm:v1:minecraft:assetObject` (`{ mcVersion, key }`; keys only under `minecraft/sounds.json`, `minecraft/sounds/**.ogg`, `minecraft/font/unifont*.zip` and `minecraft/font/include/unifont*.json`; 16 MB cap; real paths inside the store's `objects/` and `indexes/`; answers `not_set_up`, `no_index`, `not_listed`, `not_allowed`, `too_large`, `missing`); main keeps the parsed index of at most two versions, never an object. Nothing is cached, copied or exported. The jar extraction gained the looks texture patterns (`LOOKS_ASSET_PATTERNS` in interop) and 23 data folders (`LOOKS_DATA_FOLDERS`, an app list beside `LIVE_VIEW_DATA_FOLDERS`, not a target fact), cache schema 5 to 6 with `byteCount`. |
| D4 Stand-in bodies | Built for eight of the nine bodies, as the spike's go said: eighteen lazy modules in `looks/bodies/` (wolf and pup, cat and kitten, pig `normal` and `cold` and piglet, cow `normal`, `cold`, `warm` and calf, chicken `normal`, `cold` and chick, frog, villager and baby, sulfur cube), Bedrock geo for the existing geo renderer, written from B619's face lists of MSM's own coded pictures (1,035 measured faces land within half a model pixel in `bodies.test.ts`), never from a Mojang model. Measured scales: the cat 0.8 and **the villager 0.9375** (all its faces measure 15/16; the spike's README named only the cat). **The zombie nautilus is the flat sheet** with its measured parts named and the line "Only in the game" (it never stands still; 3L5). About right: parts the face lists lacked (snouts, horns, ears, tails, the kitten's legs, the chick's beak and feet, the frog's arms) were placed from the decoded views to about half a pixel. Reserve B646 did not run. |
| D5 MSM's own shapes | Built (B628): banners and shields (`composeBannerPicture`: each layer the pattern mask times the dye, alpha-blended in order on the base, 3S6), trims (`applyTrimPalette`: key level i becomes palette colour i, the key read from the pattern's `.png.mcmeta`, equipment `trim_overrides` applied; the armour figure gained an optional trim layer, its earlier tests unchanged), pots on `POT_ATLAS`, paintings as an SVG front view beside MSM's own player figure, with the 3D scene where WebGL is. **The dye colours are a target fact**, `TargetFacts.dyes` in plugin API **1.25.0** (the orchestrator's decision on B619: 26.4-snapshot-7 has no dye colour accessor, the values measure the same, and version facts live only in `packages/targets`). Shields are About right and say they were not measured. |
| D6 Fonts | Built (B624): bitmap, space and reference providers **As in the game, checked**, tied by `font-checked.test.ts` to B619's in-game widths of MSM's own fonts on both targets (not to `fixtures/live-views`: a vetoable default); TrueType through the browser's `FontFace`, About right; unihex, which the plan had left as "named", is drawn from the asset store's `unifont*.zip` in a worker of its own (6.4 kB; About right, B619 measured one wide glyph); `legacy_unicode` and unknown types named. Text is drawn white without shadow, colour or bold (said). |
| D7 Flat looks and the day strip | Built (B625, B626): particle sprites played over a life you pick (nothing plays under reduced motion until Play); waypoint styles on a 182-wide locator bar by B619's rule; the potion's four items through the user's jar item definitions and their tints, or MSM's drawn bottles; the creative tab as a page (195 by 136, 9 by 5 grid, 45 a page with Back and Next); the effect's corner frame, inventory panel and tinted swirl. **Changed:** a potion that mixes a Minecraft effect is "Only in the game" for its colour, since vanilla effect colours are code and no app table was made. The day strip reads the attribute types from the target's own vendored schema (26.4-snapshot-7 52 attributes, 45 drawable; 26.3 51 and 44; the same seven structured ones named), 32 easings and `cubic_bezier`; **a world clock has no fields** (3S10), so its view draws the timelines tied to it and `period_ticks` sets the day's length. |
| D8 Shaders and post effects | Built (B629), as far as the spike's go reached. **Changed:** the translation is **the spike's seven rules** (the version line, the separate-shader-objects extension dropped, `#include <ns:path>` and `#moj_import` inlined, `binding =` and `layout(location)` stripped, `gl_VertexIndex` mapped, every other line kept with a line map), not the plan's `#moj_import` only, since 26.x shaders use `#include`. Compile after it, measured in the app's own code: post programs 9 of 9 on both targets, core 46 of 63 and 50 of 66, MSM's own 9 of 14 (the five failures are desktop-only conversions and `texture2D`, shown as the compiler's lines against the user's code, never rewritten). Post shaders and a project's own programs run; **the game's core shaders are a compile check only**. **Changed: 3L7's still frame is MSM's own test picture** (384 by 216, drawn from numbers) rather than a frame of Try it, which would need Try it open and its canvas kept; values the game fills (`OutSize`, `InSize`, `ScreenSize`, `Globals`, `ColorModulator`) are MSM's stand-ins, listed in the notes, and any other unfilled uniform stops the run with its name. The post vertex shader's name differs by target (`core/screenquad` on 26.3, `core/screentriangle` on 26.4) and is resolved from the target's jar. Runs in a worker of its own on an OffscreenCanvas; without WebGL the pass chain is a diagram. |
| D9 Without WebGL, reduced motion | Built: bodies fall back to their layers drawn flat, banners, pots and trims to their flat pictures, paintings to the SVG front view, shaders to the compiler lines and the diagram (the e2e `live-views-shaders-path` runs once with the GPU off); sounds still play. Bodies stand still, sprites wait for Play and the day strip is paused under reduced motion. |
| D10 The Creator's flows | Met: Music disc, Goat horn, Banner pattern, Armour trim, Pot pattern, Creative tab and Villager look each show their song, call, pattern, tab or look in the Live tab (`creator-looks.test.tsx`; the Music disc's song plays there); Mob skin was already shown since B615. No new mechanism. |
| D11 Order and budgets | Ran after the game modes plan closed (B562), beside AI helper 2 and search everything. **Budgets:** a press reaches the player under 200 ms for a project sound and under 300 ms for the first vanilla press (asserted with fakes; 7 to 72 ms in the e2e with real files and a fake audio out); views follow an edit 150 ms after it, sounds at once. The real-folder times are B619's (IPC 0.7 ms, 34 ms first; about 45 ms of index and `sounds.json` on the first vanilla press; 3 ms median decode). **Size:** the spike found 0.27 MB left under the old renderer stop line and about 0.35 MB needed; the route taken was [ADR 0126](0126-java-project-generator-loaded-on-first-use.md) (the 26.3 Java project generator loaded on first use, -0.98 MB of first paint) and its D4 amendment (first paint budgeted apart at 6 MB, stop 5.5; the renderer total 21 MB, stop 20.5), so batch 3's lazy chunks count against the total and the asar, not start-up. Renderer total 18.48 MB before B620 and 18.77 MB at B630 (19,686,597 B, other plans' work included; the batch's own chunks about 0.25 MB, inside the 0.4 MB draft); first paint 4.53 to 4.7 MB (with search's work; every view is lazy, only the sound providers sit in the shell); `app.asar` not measured during the batch (27.2 MB at B660). |

### Measured

- **Sounds (B619, B622, B631):** all 4,961 (26.3) and 5,231 (26.4) vanilla sounds decode in the app's Chromium; the longest track would take 3 s and 319 to 347 MB whole, so it streams. The e2e plays one project event from three places (the sounds view, a cat's voice, a goat horn call) with its volume and pitch recorded, and a song's 12-second file against its stated length.
- **Bodies (B619, B623):** the automatic re-drawing matched 66 to 84 % of the game's texels for the simple bodies; the hand-assembled bodies put every measured face within half a model pixel.
- **Looks (B619):** trims within 0.021 chroma, banners within 5.4 of 255 for all 16 dyes; fonts' bitmap, space and reference widths exactly as the game's on both targets; waypoint sprites by distance at 12 distances.
- **Shaders (B629, the app's own code under SwiftShader at 384 by 216):** a frame of invert 28 to 38 ms, creeper 32 to 46, entity outline 63 to 73, blur 147 to 182, spider 297 to 426, MSM's 3-pass chain 58 to 84; in the e2e 15 to 21 ms for a program and 21 to 29 ms for a two-pass effect.
- **Cache (B621):** 26.3 14,821 files and 8.74 MB at schema 5 to 16,229 files and 9.36 MB at schema 6; 26.4-snapshot-7 15,135 and 8.94 MB to 16,694 and 9.60 MB; extraction 193 to 264 ms on a busy machine.
- **e2e:** `live-views-looks-path` (3 tests, 41 to 46 s) and `live-views-shaders-path` (about 10 s) each green three runs in a row; the full e2e run was left to CI.

### What moved

- **Interfaces, all additively:** `LiveViewProps.sounds`; plugin API 1.25.0 `TargetFacts.dyes?` (dye name to `#rrggbb`, set on both targets, tied by tests to the spike's results file); `cache.json` `byteCount`; `translateShader` a fourth argument (defines) and `origins` and `includes` in its answer; `runPostChain` takes the chain's pictures and returns `RgbaPicture`, not `ImageData`; the asset object request carries `mcVersion`, as every `minecraft:` channel does.
- **Folders:** the plan's `looks/song/` is `looks/jukebox/`; the effect's look is `looks/effect/`; shared pixel and view helpers live in `looks/banner/` (`pixels.ts`, `look-parts.tsx`) and the particle folder (`look-pictures.ts`, `LookPicture.tsx`, `host-reader.ts`).
- **The Studios** keep their own text previews and gain the looks above them, so their tests and e2e ids stand.
- **Tags in the variant view** (biome lists) resolve in the live views worker: a first version resolved them in the page and `frame/imports.test.ts` caught it (B627).
- **B629's e2e** is a spec of its own, `live-views-shaders-path`, beside B631's `live-views-looks-path`; the looks spec writes its own project (MSM's own pictures, a two-letter font, header-only Ogg files) and needs no Minecraft folder, and its fake audio out patches `AudioContext.prototype` in the page (streamed sounds are not covered).
- **The AI helper's prompt** gained `prompt/looks.ts` (1,630 characters); its budget moved from 103,000 to 104,000 ([ADR 0125](0125-ai-helper-clarity.md) D7), confirmed at this close; `PROMPT_PREFIX_CHARS` is the measured 126,090.

### Rules that stay

ADR 0120's rules, and for batch 4 and any later brief that adds a look or a sound: Minecraft's own sounds and unifont come only from the user's asset store, in place, through `asset-index.ts` and one channel with its allowed keys, and are never cached, copied, exported or sent to the AI helper; every place that picks or defines a sound has Play and is listed in `SOUND_PICKERS`; a body or shape is MSM's own, written from MSM's measurements of MSM's own test content, never from Mojang's Bedrock geometry; no shader is rewritten by guesswork, and a picture is drawn only from what the shader produced with stated stand-ins; a colour, a size or a list that differs by version comes from a target fact, never an app table (the dyes); a body without a measured go is the flat sheet with its line.

### Follow-ups

Kept in `docs/ROADMAP.md` "Live views 2 to 4" and `docs/HANDOFF.md`:

- **Sounds:** the damage type's hurt sound Play (the sample line in `liveviews/data/lines/SampleLine.tsx` still says it cannot be played); Play on the Rules sound chip once picked (`SlotChip`); Try it's `soundFileOf` onto `audio/resolve.ts`; an e2e case for a streamed sound; the Prism, MultiMC and CurseForge asset store paths checked on a real install.
- **Looks:** a target fact for vanilla mob effect colours (a plugin API minor), so a bottle can mix Minecraft's effects; shields measured; the sulfur cube's Size 1 and its `_small` model; which villager hat hides which, villager babies, the collars of tame wolves and cats, the cold chicken's tail tuft, the frog's tongue and the chick's wings; unihex widths measured beyond one glyph; exact bodies by reserve B646 on the user's word.
- **Checked levels:** the fonts' "checked" rests on the spike's in-game measurements tied by a test, not on a fixture run by CI; a fonts case in `fixtures/live-views` would put it on the same ground as batch 2's.
- **Found in passing (B619):** `/summon`'s `variant` NBT is not applied to pig, cow and chicken variants on 26.x (the component works; check MSM's own commands and docs); `msm_test:chiming`'s effect icon draws as the missing texture in the client GameTest.
- **Guide:** `docs/guide/ai-helper.md` still says a first question costs about $0.27 (about $0.29 since B632); the guide's README row and the site's sidebar title for `live-views.md` could name looks and sounds.
- **Not run at this close:** a full e2e run and a clean-worktree run of the whole repository.

### The spike's answers (3S1 to 3S12)

The questions were the plan's; the full answers and evidence are in [`docs/reference/spikes/b619/README.md`](../reference/spikes/b619/README.md).

| # | Question | Answer |
|---|---|---|
| 3S1 | The asset store, finding it, read time | `<store>/assets/indexes/<assetIndex.id>.json` (34 on 26.3, 36 on 26.4-snapshot-7) and `objects/<hh>/<sha1>`, under the official root, the Prism or MultiMC root, or CurseForge's `Install/` (the last two verify at implementation). `sounds.json`, every `.ogg`, the unifont zips and the non-English lang files are there, not in the jar. IPC 0.7 ms a small sound (first 34 ms), 31 ms the largest object; budgets 200 ms project, 300 ms first vanilla press. |
| 3S2 | Decoding | Every vanilla sound decodes; short sounds 3 ms median; the longest track 3 s and over 300 MB whole, so `stream: true` and large files play through a media element (the CSP needs `media-src 'self' blob:`). |
| 3S3 | Stand-in bodies | Boxes with the standard texture layout, one texel one model pixel (cat 0.8, the sulfur cube by `Size`, outer layers inflated), the same on both targets; babies are their own models. Go for wolf, cat, pig, cow, chicken (wings at rest), frog, villager (by hand) and the sulfur cube, eighteen bodies; no-go for the zombie nautilus. Model names: pig `normal`, `cold`; cow `normal`, `cold`, `warm`; chicken `normal`, `cold`; zombie nautilus `normal`, `warm`. |
| 3S4 | Jar folders | +1,423 files and +0.63 MB (26.3), +1,574 and +0.67 MB (26.4); extraction 169 to 276 ms; schema 6; `.png.mcmeta` needed. |
| 3S5 | Trims | Key level i becomes material colour i, only when the pattern's `.png.mcmeta` names its key (since 26.3); other colours pass; equipment `trim_overrides` swap palettes. |
| 3S6 | Banners and dyes | Pattern times dye, alpha-blended in order (within 5.4 of 255); 26.4 has no dye colour accessor, the values are unchanged; shields not measured. |
| 3S7 | Fonts | `bitmap`, `space`, `ttf`, `unihex`, `reference` on both targets; bitmap advance from the rightmost opaque column, missing glyph 6, space and reference exact; TrueType within about 1 px a word; unihex 250 ms in a worker, in scope. |
| 3S8 | Shaders | 26.x uses `#include`, the separate-shader-objects extension, varying locations and `gl_VertexIndex`; seven mechanical rules: post programs 9 of 9, core 73 to 76 %, MSM's own 9 of 14; go for post and self-written shaders, core compile check only. |
| 3S9 | Post effects | Fields of `targets` and `passes` the same on both targets; the post vertex shader `core/screenquad` (26.3) or `core/screentriangle` (26.4); 18 to 554 ms a frame under SwiftShader at 854 by 480; one still frame in a worker: go. |
| 3S10 | Timelines and clocks | Both registries on both targets; a world clock is an empty object, the period is the timeline's `period_ticks`; 45 of 52 attribute types draw on a strip. |
| 3S11 | Waypoints, the tab page, the effect frame | First sprite below near, last from far, the middle evenly between; the creative grid 9 by 5 at (9, 18), step 18, hotbar at y 112, in a 195-wide panel; the HUD frame 24 by 24 with the icon inset 3, inventory panels 120 by 32. |
| 3S12 | Size | 18.23 MB of 19 with 0.27 MB to the old stop line against about 0.35 MB needed: the lazy Java project generator came first (ADR 0126), then the first-paint budget; every body well under the 100 kB JSON rule. |

## Fact table (3F1 to 3F12)

Moved here from the plan at its close. The facts are as at 505d7c3, when the plan was written; what changed by the close is in the findings above (3F1: the player is `audio/player.ts`, Try it imports it; 3F3: Play in 25 places; 3F5: the geo renderer draws the stand-ins and the armour figure a trim layer; 3F6: the Studios draw their looks; 3F7: shaders compile in the view; 3F8: cache schema 6 with the looks folders; 3F10 and 3F11: closed).

| # | Fact | Source |
|---|---|---|
| 3F1 | Try it's sound player: `webAudioOut`, one `AudioContext` for the app, Ogg Vorbis bytes, project sounds only; a vanilla sound is a caption with a note | `app/src/renderer/src/tryit/effects.ts`, `TryItView.tsx` |
| 3F2 | The client jar holds no sound files; `sounds.json`, the `.ogg` files and the non-English language files are in the launcher's asset store (`assets/indexes/`, `assets/objects/`) | confirmed by B619 (3S1) |
| 3F3 | No play button exists outside Try it; the Creator has an audio field (`CreatorAudioField.tsx`) and the Studios a Sounds section (`SoundsSection.tsx`) | the audit; `app/src/renderer/src/components/creator/`, `studios/blocks-items/` |
| 3F4 | The art generator draws vanilla mob variant textures as an even coat because "their layout is not MSM's to know" | `packages/plugins/library/src/art/skins.ts` |
| 3F5 | The geo renderer draws `msm:geo_model` bodies with animations; the armour figure draws equipment layers | `app/src/renderer/src/preview/geo/`, `ArmourPreviewView.tsx` |
| 3F6 | The Villager look Studio shows flat pictures; the Potion Studio the four names; the Creative Tab Studio a text summary | the audit |
| 3F7 | `minecraft:shader` is a raw file, unchecked; post effects and waypoint styles are schema forms | ADR 0106; the audit |
| 3F8 | The jar extraction keeps only `textures/block` and `textures/item` | `packages/interop/src/minecraft-install/extract.ts` |
| 3F9 | The Particle Studio plays `msm:particle` frames (`ParticlePreview.tsx`, `particle-frames.ts`) | `app/src/renderer/src/studios/blocks-items/` |
| 3F10 | The Creator's gaps: Music disc and Goat horn play nothing; Banner pattern, Armour trim and Pot pattern show items but not the pattern in place; Creative tab shows no tab | the audit |
| 3F11 | My things has no card for particles or sounds | the audit |
| 3F12 | Showcase and Try it already fall back to stills and captions without WebGL or under reduced motion | ADR 0118 D7–D9 |

## Limits (3L1 to 3L12) and their outcome

Moved here from the plan at its close; the guide's page `live-views.md` (Limits of looks and sounds) and the AI helper's topic file `looks.ts` say them in plain words.

| # | Limit | Why | What users see | Outcome at the close |
|---|---|---|---|---|
| 3L1 | **Minecraft's own sounds need your Minecraft folder.** | Never shipped; not in the jar. | The Play button is off with the set-up link; your own sounds always play. | Stands: off with "Find my Minecraft" while a Minecraft sound needs the folder; unifont fonts the same. The times with a real folder were not measured in the app (the user's check). |
| 3L2 | **A sound is heard flat.** | No world around it. | No distance, no echo, no category volume. | Stands; pitch clamped to 0.5 to 2 and volume to 0 to 1, as the game does. |
| 3L3 | **Mob bodies are MSM's stand-ins.** | The game's shapes are code. | "About right"; small parts may sit differently. | Stands: measured faces within half a model pixel; parts placed from the decoded views about right; a few small parts not drawn and named. |
| 3L4 | **No vanilla animations on stand-ins.** | As 3L3. | The body turns; it does not walk. | Stands; the chicken's wings at rest. |
| 3L5 | **Some bodies show as a flat sheet.** | Where 3S3 says no. | The texture with its parts named. | Narrower than drafted: only the zombie nautilus. Reserve B646 not run. |
| 3L6 | **Shaders run only where the app's graphics can.** | WebGL 2 is not the game's OpenGL. | Compiles and runs, or the compiler's lines and "only in the game". | Stands: post programs all compile, MSM's own 9 of 14; the game's core shaders are a compile check only. |
| 3L7 | **Post effects are shown on a still frame of Try it.** | No live game picture. | One frame, not motion. | Changed: the frame is **MSM's own test picture**, not Try it's; the game's own targets and depth inputs are blank and the stand-in values listed. |
| 3L8 | **No WebGL: flat pictures.** | As the preview panel today. | Textures and sheets instead of bodies; sounds still play. | Stands; paintings keep their SVG front view and shaders their diagram. |
| 3L9 | **TrueType and unihex fonts are about right or named.** | Browser text drawing; file size. | A label on the line. | Narrower: unihex is drawn (about right), not only named; `legacy_unicode` and unknown providers are named. |
| 3L10 | **The creative tab page is a drawing.** | The game's screen is its code. | Order and icons are the data's; search and scrolling are not there. | Stands; pages of 45 with Back and Next. |
| 3L11 | **A day strip shows values, not the sky.** | The sky's drawing is the game's. | Swatches and numbers over the day. | Stands; seven structured attribute types are named, not drawn. |
| 3L12 | **Other languages' text does not show.** | Only `en_us` is read (the audit). | English names. | Stands; an idea in the ROADMAP. |

The views also name, each in its own notes: a potion's colour when it mixes a Minecraft effect (vanilla effect colours are code); the hurt sound of a damage type; shields not measured; villager hats over hats, villager babies, the collars of tame wolves and cats; the small sulfur cube drawn with the full-size pictures; the font's colour, shadow and bold; waypoint dots untinted; the game's own post targets and depth inputs.

## Status

Accepted with findings (2026-11-23, close B633; briefs B619–B632; reserve B646 not run). The plan's fact table, limits and spike answers are above; `docs/PLAN-live-views.md` keeps batch 4. Decided by the orchestrator under the user's rule and open to the user's veto, as vetoable defaults:

- reading Minecraft's sounds and unifont in place from the user's asset store, never cached or copied, with the Play button off without the folder (D3);
- eighteen stand-in bodies written from MSM's own measurements and labelled About right, the villager at 0.9375, the zombie nautilus as the flat sheet, exact bodies only by reserve B646 (D4);
- the dye colours as a target fact (`TargetFacts.dyes`, plugin API 1.25.0) rather than an app table, and no table of vanilla effect colours (a potion mixing one says so) (D5, D7);
- the looks data folders as an app list and the cache at schema 6 (D3);
- the fonts' bitmap, space and reference widths labelled checked on the spike's in-game measurements tied by a test, not on a fixture run by CI (D6);
- shaders put through the seven mechanical rules, post and self-written programs run, the game's core shaders a compile check only, post effects on MSM's own test picture with stated stand-in values (D8);
- the Studios keeping their text previews with the looks above them (D7);
- the size route through ADR 0126 and the first-paint budget (D11);
- the AI helper's prompt budget at 104,000 characters (ADR 0125 D7, confirmed here);
- running after the game modes plan (D11).
