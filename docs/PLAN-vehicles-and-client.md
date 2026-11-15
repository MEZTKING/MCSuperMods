# Plan: Vehicles and the client side

Working plan for the user's requests of 2026-11-14 ("would it be possible to make things like tanks", then "keep going, add the vehicles too", under the rule "anything that can be made in vanilla java should be possible through this app") and for coverage audit backlog B15 ("client side for power users"). Written 2026-11-14 by the orchestrator at 293e2a2. Decisions live in [ADR 0088](adr/0088-client-channel-and-key-binds.md) (the client channel and key binds), [ADR 0089](adr/0089-hud-elements.md) (HUD), [ADR 0090](adr/0090-vehicles.md) (vehicles) and [ADR 0091](adr/0091-vehicle-flows-studios-try-it-and-tests.md) (flows, Studios, Try it, tests), all Proposed. This file holds the fact table, the limits, the rules for every brief, the briefs B406–B433 in eight waves, the overlaps with work running in parallel, and an empty "Notes from implementation" that the main session appends to. It is deleted at close (history goes to `DEVLOG.md`, the fact table and limits into ADR 0090's findings).

Nothing here starts before the user has seen the four ADRs' vetoable defaults, and nothing after Wave 0 starts before B406 reports "go" and B407's route is chosen.

## In plain words

- **What it is.** You can make vehicles: cars, tanks, planes, helicopters and boats. You place one from its item, get in, drive with W, A, S and D, and pick it up again by hitting it while sneaking. A tank's turret follows where you look and its cannon fires with R. Vehicles can need fuel, carry ammunition, take damage and be repaired, hold a chest's worth of items and be painted. A small dashboard shows fuel, health and ammunition.
- **Also for everyone, not only vehicles.** Your mod can add its own keys (they appear in Minecraft's Controls screen) that make things happen, and its own on-screen bars and numbers (mana, stamina, a score). Rules can use both: "When the player presses a key" and "Show a number on screen".
- **What it is not.** No trains on rails, trailers, upgrades or wind. Your own screens for machines, a portal overlay and particle trails wait for the next client batch. Ejected Java projects leave vehicles, keys and the HUD out for now.
- **How it moves.** As in vanilla: the driver's game moves the vehicle and the server checks it; everything else (fuel, damage, shots) is decided by the server.
- **Build first:** the spike (B406), then keys (rank 1 in the research), vehicles (rank 2), the HUD (rank 3).

## Fact table

Checked 2026-11-14 at 293e2a2 with `javap` (JDK 25, `/root/jdk/jdk-25.0.5+8`) over the Loom-cached jars: Minecraft `minecraft-merged-deobf-26.3.jar` and `-26.4-snapshot-7.jar` (`/root/.gradle/caches/fabric-loom/minecraftMaven/...`), the Fabric API module jars named in V1, and this repository. Only signatures were read; no method body of Mojang's was read (rules below). The research report `scratchpad/research/popular-mods.md` (2026-11-14) is the source of R1–R3.

| # | Fact | 26.3 | 26.4-snapshot-7 | Source |
|---|---|---|---|---|
| V1 | Fabric API modules used by this batch | 0.165.2: networking 6.4.1, key mapping 2.0.8, rendering 27.2.0, events interaction 5.3.10, lifecycle 4.1.9, screen 5.2.4, client GameTest 6.0.12 | 0.165.4: networking 6.4.2, key mapping 2.0.9, rendering 29.1.1, events interaction 5.3.15, lifecycle 4.1.11, screen 6.0.2, client GameTest 6.0.17 | `fabric-api-*.pom` in the Gradle cache |
| V2 | `PayloadTypeRegistry<B>`: static `serverboundPlay()`, `clientboundPlay()` (`RegistryFriendlyByteBuf`), `serverboundConfiguration()`, `clientboundConfiguration()`; `register(CustomPacketPayload.Type<T>, StreamCodec<? super B, T>)`, with an optional `Predicate<PacketContext>`; `registerLarge(Type, StreamCodec, int)` | same | same | networking jars |
| V3 | `ServerPlayNetworking.registerGlobalReceiver(Type<T>, PlayPayloadHandler<T>)`, `PlayPayloadHandler.receive(T, Context)`, `Context.player()`, `server()`, `responseSender()`; `send(ServerPlayer, payload)`, `canSend(ServerPlayer, Type)` | same | same | networking jars |
| V4 | `ClientPlayNetworking.registerGlobalReceiver(Type<T>, PlayPayloadHandler<T>)`, `send(payload)`, `canSend(Type)` | same | same | networking jars |
| V5 | `KeyMappingHelper.registerKeyMapping(KeyMapping)`, `getBoundKeyOf(KeyMapping)` | same | same | key mapping jars |
| V6 | `KeyMapping(String, InputConstants.Type, int, KeyMapping.Category)` (and with a trailing `int`); `isDown()`, `consumeClick()`; `KeyMapping.Category.register(Identifier)`, constants `MOVEMENT`, `MISC`, `MULTIPLAYER`, `GAMEPLAY`, `INVENTORY`, `CREATIVE`, `SPECTATOR`, `DEBUG` | same | same | Minecraft jars |
| V7 | `Input` record `(forward, backward, left, right, jump, shift, sprint)` with `STREAM_CODEC`; `ServerPlayer.getLastClientInput()`/`setLastClientInput`; `ServerGamePacketListenerImpl.handlePlayerInput(ServerboundPlayerInputPacket)` and `handleMoveVehicle(ServerboundMoveVehiclePacket)` | present | present | Minecraft jars |
| V8 | `ClientTickEvents.START_CLIENT_TICK`/`END_CLIENT_TICK`; `ClientPreAttackCallback.onClientPlayerPreAttack(Minecraft, LocalPlayer, int)` (what returning true does: verify at implementation, B406) | present | present | lifecycle, events interaction jars |
| V9 | `HudElementRegistry.addFirst`, `addLast`, `attachElementBefore`, `attachElementAfter(Identifier, Identifier, HudElement)`, `removeElement`, `replaceElement` | same | same | rendering jars |
| V10 | `HudElement` | `extractRenderState(GuiGraphicsExtractor, DeltaTracker)` | extends `Updatable`: `update(DeltaTracker)` (default) and `extractRenderState(GuiGraphicsExtractor)` | rendering jars: **differs, seam** |
| V11 | `VanillaHudElements`: `MISC_OVERLAYS`, `CROSSHAIR`, `HOTBAR`, `ARMOR_BAR`, `HEALTH_BAR`, `FOOD_BAR`, `AIR_BAR`, `MOUNT_HEALTH`, `INFO_BAR`, `EXPERIENCE_LEVEL`, `HELD_ITEM_TOOLTIP`, `MOB_EFFECTS`, `BOSS_BAR`, `SLEEP`, `SCOREBOARD`, `OVERLAY_MESSAGE`, `TITLE_AND_SUBTITLE`, `CHAT`, `PLAYER_LIST`, `SUBTITLES` and others | present | present (order of declaration differs) | rendering jars |
| V12 | `VehicleEntity extends Entity`: synched `DATA_ID_HURT`, `DATA_ID_HURTDIR`, `DATA_ID_DAMAGE` (protected); `hurtServer(ServerLevel, DamageSource, float)`, `hurtClient`, `shouldSourceDestroy`, `ignoreExplosion`, `destroy(ServerLevel, Item)`, `destroy(ServerLevel, DamageSource)`, `setDamage`/`getDamage`, hurt time and direction, abstract `getDropItem()` | identical | identical | Minecraft jars |
| V13 | Vanilla vehicle classes: `vehicle/boat/` `AbstractBoat`, `Boat`, `Raft`, `AbstractChestBoat`, `ChestBoat`, `ChestRaft`; `vehicle/minecart/` `AbstractMinecart`, `MinecartBehavior`, `OldMinecartBehavior`, `NewMinecartBehavior` and the minecart kinds; `ContainerEntity`, `DismountHelper` | present | present | Minecraft jars (names only) |
| V14 | `Entity`: `getControllingPassenger()`, `hasControllingPassenger()` (final), `isLocalInstanceAuthoritative()` (final), `positionRider(Entity, Entity.MoveFunction)` (protected), `canAddPassenger(Entity)` (protected), `getDismountLocationForPassenger(LivingEntity)`, `onPassengerTurned(Entity)`, `interact(Player, InteractionHand, Vec3)`, `isPickable()`, `getPickResult()`, `interpolationHandler` (protected), `createInterpolationHandler()`, `getInterpolation()`, `lerpMotion(Vec3)` | present | present | Minecraft jars |
| V15 | `Entity.lerpPositionAndRotationStep(int, double, double, double, double, double)` | present | **absent**: never use | Minecraft jars |
| V16 | `Attributes.CAMERA_DISTANCE`, `GRAVITY`, `SCALE`, `STEP_HEIGHT` (holders); which entity's `CAMERA_DISTANCE` the camera reads while riding: verify (B406) | present | present | Minecraft jars |
| V17 | `EntityRenderer<T, S>`: protected constructor `(EntityRendererProvider.Context)`, `createRenderState()`, `extractRenderState(T, S, float)`, `submit(S, PoseStack, SubmitNodeCollector, CameraRenderState)` | same | same | Minecraft jars |
| V18 | The runtime's mob renderer is `MsmVanillaRenderer extends MobRenderer<Mob, MsmVanillaRenderState, MsmVanillaModel>` with `MsmVanillaRenderState extends LivingEntityRenderState`: not usable for a non-living entity as it is; `GeoModelBaker` and `GeoAnimationBaker` are reusable | — | — | `engine-mod/src/main/java/.../client/vanilla/` |
| V19 | `EntityType.spawn(ServerLevel, ItemStack, LivingEntity, BlockPos, EntitySpawnReason, boolean, boolean)`, `createDefaultStackConfig(Level, ItemStack, LivingEntity)`, `appendCustomEntityStackConfig(...)` | present | present | Minecraft jars |
| V20 | Fabric rendering module has `EntityRendererRegistry` and `BlockEntityRendererRegistry` | yes | **no** (the runtime already registers entity renderers through the `EntityRendererRegistration` seam; block entity renderers would need a new seam) | rendering jars |
| V21 | Client GameTest API: `TestInput.holdKey(KeyMapping)`, `pressKey`, `releaseKey`, `holdKeyFor`, `pressMouse`; `ClientGameTestContext.worldBuilder().createServer()` gives a `TestDedicatedServerContext` with `connect()`; `assertScreenshotContains`, `takeScreenshot`, `runOnClient`, `computeOnClient` | present | present | client GameTest jars |
| V22 | The server's vehicle check resets a vehicle moved more than 10 blocks in one packet (squared 100 less its delta movement; not for the singleplayer owner) and logs "moved wrongly" at more than 0.25 blocks (squared 0.0625) from the server's own move | same | same | ADR 0070 finding M1, `MobRiding` javadoc |
| V23 | Riding today: `MobRiding` (client-moved mounts, seats 0.7 blocks apart, the happy ghast's flying input, `getRiddenInput`); `MobRanged` chooses between `ProjectileUtil.getMobArrow`, `ProjectileItem.asProjectile` + `shoot` and `MsmThrownItem` | — | — | `engine-mod/src/main/java/.../registry/mob/` |
| V24 | State at 293e2a2: plugin API 1.15.0; Script API 1.4; Rules catalogue 43 triggers; 97 kinds; `app.asar` 27.6 of 32 MB; renderer 15.0 of 16 MB; client GameTests `MsmParticleClientGameTest`, `MsmDevClientGameTest` | — | — | HANDOFF, CLAUDE.md |
| R1 | Players expect: W/A/S/D driving with the hull facing its own way, place and pick up, seats, a separate fire key (R in the surveyed tank mod), fuel, health and repair, a dashboard, storage, paint, engine and horn sounds, per-type physics | | | research §1.8 |
| R2 | Ranking of missing features: 1 key binds, 2 vehicle kind, 3 HUD, 9 custom screens, 12 client camera and poses | | | research §3 |
| R3 | The mob route (animal base, `msm:rideable` with `saddle: false`, no goals) drives today; its gaps: living-mob side effects, no `vehicle` accessor, no fire key, no turret, no gauges, no surface boat, no lift, no storage | | | research §1.8 |

Open facts that B406 answers (each answer goes into "Notes from implementation" and then into ADR 0090's findings): S1 whether vanilla sends and accepts move-vehicle packets for a custom `VehicleEntity` driven by the local player; S2 where "moved wrongly" starts at speeds 0.5, 1, 2 and 3 blocks a tick on a dedicated server; S3 whether the server's copy of a seated player's yaw and pitch follows the client's look; S4 what returning true from `ClientPreAttackCallback` does; S5 which entity's `CAMERA_DISTANCE` the third-person camera uses while seated; S6 whether a `KeyMapping` registered from definitions in the client entrypoint appears in Controls, survives `options.txt`, and is reached by `TestInput.holdKey`; S7 the payload round trip on `createServer()`/`connect()`; S8 the HUD layer drawn on both versions through the seam, found by `assertScreenshotContains`; S9 vanilla's default key for every control (a dump of `Options.keyMappings` names and default keys, the source of `TargetFacts.controls.vanillaKeys`); S10 whether `HasCustomInventoryScreen` on a vehicle opens its storage with the inventory key from a seat; S11 whether a malformed custom payload disconnects the sender; S12 frame time of the headless client with one vehicle and the HUD.

## Limits

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| V1 | **The driver's game moves the vehicle.** | Vanilla's model for boats and mounts (ADR 0090 D4). | A modified client can drive faster than the definition, up to vanilla's 10-block check, as with ice boats. | The format's speed cap of 3 blocks a tick; fuel, damage and shots stay server-side. |
| V2 | **Definitions are read on each side.** | As for mobs (ADR 0070 M4). | A server and client with different versions of a vehicle disagree about its physics. | Guide note: update both. |
| V3 | **No rail vehicles.** | Minecart rail behaviour is vanilla code we do not rebuild. | No trains or mine carts of your own. | Follow-up with custom boat types. |
| V4 | **Fire and horn have a round trip.** | Shots are server-side (ADR 0088 D2). | On a slow server a shot leaves after the ping; the sound plays at once for the shooter. | Predicted sounds only. |
| V5 | **Key binds, HUD elements and vehicles are fixed at start.** | Registry freeze; key mappings and the HUD index list are read at initialisation. | A new key, HUD element or vehicle needs Restart in Play; values and events reload. | Play's "Restart needed" reasons; the HUD hash warning. |
| V6 | **Keys do nothing inside screens or with the chat open.** | Vanilla's key handling. | Expected. | None. |
| V7 | **Fast vehicles can outrun chunk loading.** | As players do; no chunk tickets for vehicles. | Planes at full speed reach ungenerated land. | The speed cap; guide note. |
| V8 | **No custom camera.** | Client camera code is out of scope (research rank 12). | Vanilla first and third person; only the third-person distance can change, if S5 allows. | Follow-up. |
| V9 | **Hoppers do not reach vehicle storage.** | Vanilla's hopper minecart rule is code we do not rebuild. | Storage by hand only. | Follow-up. |
| V10 | **Paint is the only customisation.** | Upgrades and parts need slots and rules. | No engines, boosters or extra seats to craft. | Follow-up. |
| V11 | **Vehicles, key binds and the HUD are not ejected.** | Copying the runtime's client code belongs with B142 (ADR 0088 D10). | `export.not-in-eject` warnings. | B142. |
| V12 | **Not in vanilla packs.** | They need the Fabric mod jar. | Info on vanilla pack exports. | None. |
| V13 | **Looks and feel are in-game checks.** | CI screenshots prove something is drawn, not that it looks or drives well. | A drawing or handling bug can reach the user first. | Golden physics, client GameTests, the sample README. |
| V14 | **The vehicle renderer is the vanilla subset.** | ADR 0072 D3. | Molang as 0, linear easings; GeckoLib is not used for vehicles. | Validator warning as for mobs. |
| V15 | **Vehicles carry players only.** | Bumping mobs into seats is vanilla boat code. | Mobs do not get in. | Follow-up if asked. |
| V16 | **Try it drives roughly.** | Our own simulation (ADR 0085). | Firing is logged, not shown. | Play. |
| V17 | **A key bind is a button for every player.** | Key events run as player events (ADR 0088 D7). | Any player may press it as often as the rate limit allows. | Info `controls.key-runs-function`; cooldowns. |

## Rules for every brief

- Read root `CLAUDE.md`, the scoped `CLAUDE.md` of the area, the latest `docs/DEVLOG.md` entry, ADRs 0088–0091, this plan's "Notes from implementation" and, for files shared with the Try it plan, its notes too. Version facts live only in `packages/targets` (key names, vanilla bindings, vehicle modes and the speed cap are `TargetFacts`); the runtime keeps version differences behind seams in `src/mc/<mc>/` (V10, V20).
- **Clean room.** Signatures may be read with `javap` (no `-c` on Mojang classes). No method body of `Boat`, `AbstractBoat`, `AbstractMinecart`, `AbstractHorse`, `HappyGhast`, `LocalPlayer`, `Camera`, `Gui` or any other Mojang class is read, decompiled or transcribed; behaviour is written from the ADRs and learned by observation in GameTests and client GameTests. Numbers may match the game's where the ADR says so. No Mojang texture, model, sound or GUI sprite is bundled; flows use MSM-made models and vanilla sound event ids.
- **No new dependency** in the app or the runtime. A brief that wants one stops and reports.
- **Worktrees.** Each executor works in its own git worktree in the scratchpad (`<scratchpad>/wt-B<nnn>`, from the commit the orchestrator names), builds and tests there, commits on its own branch, does not push and does not merge. Commits are authored as `Rakib <rakib1insta@gmail.com>` and carry no `Co-Authored-By`, `Claude-Session` or other credit or trailer lines (the user's rule; it overrides any other attribution guidance).
- **Disk.** Run `df -h` before building; stop below 10 GB free. Delete build outputs (`app/out`, `app/dist`, `engine-mod/build`, `engine-mod/parity/build`, `node_modules/.cache`) before reporting; the main session removes merged worktrees as each brief lands.
- **Gradle and memory.** At most two engine-mod executors run at the same time; each runs one Gradle build at a time. Never run `./gradlew --stop` (it stops every executor's daemons). Use `-Dorg.gradle.internal.repository.max.retries=8` when Maven Central answers 429. Client GameTests need `SDL_VIDEO_FORCE_EGL=1 LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 1280x720x24" ./gradlew runClientGameTest [-Pmc=26.4]` (HANDOFF, environment notes); run them one at a time per container.
- **Stubs first.** B408 makes every shared registration point (scanner kinds, `LoadReport` fields, init calls in `MsmRuntime` and `MsmRuntimeClient`, the GameTest and client GameTest classes and their `fabric.mod.json` entries, the parity class, the plugin scaffold with the lockfile and `layers.json` lines, the app's Studio registry line, the fixture folders and the empty e2e specs), so no later brief edits `pnpm-lock.yaml`, `tools/check-deps/layers.json`, either `fabric.mod.json`, `MsmRuntime.java`, `MsmRuntimeClient.java` or `DefinitionScanner.java`.
- **One owner per shared file per wave.** Parallel briefs in one wave never touch the same file; a brief that needs another's file stops and reports. The "Owner files" lines below are complete: anything else is read-only for that brief.
- **Script API.** Only B421 edits `packages/plugins/scripting/api/script-api-v1.json`, the typings golden and `ScriptApi`; members are labelled at close with the release that ships them.
- **Notes.** Each executor ends its report with "Notes for the plan" (names, signatures, labels, test ids, measured sizes, answers to S1–S12, and what a later brief must change); the main session appends them to "Notes from implementation". Executors do not edit this file. Each executor appends one DEVLOG entry in its commit.
- **Exit criteria** always include `pnpm lint`, `pnpm typecheck` and the touched packages' tests; app briefs also `pnpm build` and `node tools/check-size/index.ts` (report `app.asar`, the renderer and the new chunks; stop and report above 31 MB asar or past B407's renderer route); engine-mod briefs `JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew build`, `-Pmc=26.4` and `-PwithoutGeckolib`, and the client GameTests on both versions when client code changed; mcdoc changes `node tools/build-msm-mcdoc/index.ts --check`; `node tools/check-deps/index.ts`.
- **Plain words.** Labels are British English, no emojis, no ids in Very easy; they go into the notes for the guide brief (B431).
- **Models.** Executors run on Opus (`claude-opus-5-5`) at medium effort; B406 and B412 at high effort; Sonnet (`claude-sonnet-5-5`) for B407, B408, B415, B423, B431. A stuck brief is rerun on Opus at high effort.

## Overlaps with work running in parallel

- **Try it** (`docs/PLAN-test-world.md`, ADR 0085): owns `packages/sim/` and `app/src/renderer/src/tryit/` until its close. B428 and B429 start only after its trigger engine (B396) and "What happened" (B398) are merged and its plan says slice 3 is closed; if Try it has not closed by Wave 6, they move into the Try it plan (ADR 0091 D6).
- **"Surprise me"** (app home and Creator, another session): B422 edits `app/src/renderer/src/components/home/tiles.ts` and the Creator's flow list; it rebases on that work and keeps its own changes to one tile and the four flows.
- **"Try it worlds"** (interop world files and main IPC, another session): this batch touches neither `packages/interop` nor `app/src/main`, except B433's reserve, which does not either.
- **ADR numbers:** 0086 and 0087 are left to those sessions; this batch uses 0088–0091.

## Waves

| Wave | Briefs (parallel) | Depends on |
|---|---|---|
| 0 | B406 spike (go or no-go); B407 renderer budget; B408 scaffold and stubs | none; B408 is merged only on "go" |
| 1 | B409 format (mcdoc and corpus); B410 plugin API 1.16.0 and target facts | B406 go, B408 |
| 2 | B411 runtime channel and key binds; B412 runtime vehicles core; B413 controls plugin; B414 entities plugin, `msm:vehicle`; B415 exporters | B409, B410 |
| 3 | B416 runtime HUD; B417 runtime weapons and turret; B418 runtime vehicle client; B419 Vehicle Studio; B420 Key bind and HUD Studios | B411 (B416, B417, B418), B412 (B417, B418), B414 and B407 (B419), B413 and B407 (B420) |
| 4 | B421 Script API 1.5; B422 Creator flows and the Very easy tile; B423 library examples | B416, B417 (B421); B419 (B422); B413, B414 (B423) |
| 5 | B424 Rules: key, HUD and vehicle cards; B425 sample vehicles fixture | B421, B413, B414 (B424); B416–B418 (B425) |
| 6 | B426 parity and CI; B427 e2e paths; B428 Try it vehicles; B429 Try it keys and HUD | B425 (B426); B422, B424 (B427); Try it slice 3 (B428, B429) |
| 7 | B430 AI helper; B431 guide, changelog, status lines; then B432 close | all |
| reserve | B433 server-moved vehicles (only if B406 says no-go on S1 or S2) | B406 |

The order follows the research's ranking (R2): keys and the vehicle core start together in Wave 2 because the vehicle core needs no key yet (it drives on vanilla's movement keys), weapons need keys (Wave 3), and the HUD follows keys on the same channel.

## Briefs

### B406 Spike: vehicles and input in the real client (wave 0; Opus, high effort; time-boxed to one session)

- **Owner files:** new `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/spike/` (throwaway: `SpikeVehicle extends VehicleEntity`, a payload, a key mapping, a HUD element through a seam stub), a temporary entry in `engine-mod/src/gametest/resources/fabric.mod.json` (removed before the report; B408 owns that file afterwards), `engine-mod/src/mc/<mc>/gametest/.../SpikeHud.java` for V10 on each version. Nothing in `src/main`.
- **Scope:** answer S1–S12 by observation, on both versions, with a client GameTest that connects to `createServer()` (dedicated) and a singleplayer world: drive the spike vehicle by holding forward and turning (`TestInput.holdKey`), read its server-side position each tick, step through speeds 0.5–3 blocks a tick and count "moved wrongly" lines; read the seated player's rotation on the server; register a `KeyMapping` at client init and hold it; send a `spike:key_v1` payload and observe the receiver; draw a coloured rectangle through `HudElementRegistry` and find it with `assertScreenshotContains`; try `ClientPreAttackCallback`; set `CAMERA_DISTANCE` on the player and on a living vehicle and compare screenshots; dump `Options.keyMappings` (name, default key) to `build/spike/vanilla-keys-<mc>.json`; send a malformed payload. Measure frame time headless.
- **Exit criteria:** a report with S1–S12 answered per version (with the evidence: log lines, numbers, screenshot names); the two key dumps attached to the notes; a go or no-go for ADR 0090 D4 (go needs S1 true and S2 showing no snap-back at 3 blocks a tick); the spike code deleted from the branch (the report keeps the snippets that worked); `./gradlew build` green on both versions after deletion.

### B407 Renderer budget (wave 0; Sonnet)

- **Owner files:** read-only measurement, plus `tools/check-size/index.ts` and its test only if route (a) needs the budget to count lazy chunks separately.
- **Scope:** ADR 0091 D5. Build the app at the current `main`, measure the renderer bundle, list its largest chunks and which are lazy, and estimate the three new Studios (from the Portal and Particle Studios' measured sizes). Recommend route (a) or (b) with numbers.
- **Exit criteria:** a table of renderer chunks; the recommendation; if (a), the check-size change with a test; the orchestrator records the chosen route in "Notes from implementation" before B419 and B420 start.

### B408 Scaffold and stubs (wave 0; Sonnet; merged after B406 says go)

- **Owner files:** `tools/new-plugin controls` output (`packages/plugins/controls/`), `pnpm-lock.yaml`, `tools/check-deps/layers.json`; `engine-mod/src/main/java/dev/mcsupermods/runtime/MsmRuntime.java` (init calls `net.MsmNetworking.init()`, `controls.KeyBinds.init(report)`, `hud.HudServer.init(report)`, `registry.vehicle.MsmVehicles.register(report)`), `client/MsmRuntimeClient.java` (calls `client.controls.ControlsClient.init()`, `client.hud.HudClient.init()`, `client.vehicle.VehicleClient.init()`), `loader/DefinitionScanner.java` (kinds `key_bind`, `hud`, `vehicle`), `loader/LoadReport.java` (lists and the log lines `registered N key bind(s)`, `N HUD element(s)`, `N vehicle type(s)`), empty stub classes for every class named in the calls and parsers `loader/KeyBindParser`, `HudParser`, `VehicleParser` returning empty lists; GameTest stubs `MsmKeyBindGameTest`, `MsmHudGameTest`, `MsmVehicleGameTest`, `MsmVehicleWeaponGameTest`, `MsmScriptApi15GameTest` and client stubs `MsmControlsClientGameTest`, `MsmVehicleClientGameTest`, each with one passing placeholder, registered in `engine-mod/src/gametest/resources/fabric.mod.json`; `engine-mod/parity/src/.../SampleVehiclesParityTest.java` (empty, registered in the parity `fabric.mod.json`); `fixtures/sample-vehicles/README.md` (title only), `fixtures/vehicle-physics/README.md`; `app/e2e/vehicles-path.spec.ts` and `controls-path.spec.ts` (skipped placeholders); `app/src/renderer/src/studios/controls/studios.tsx` (empty list) and its line in `app/src/renderer/src/studios/studio-registry.ts`.
- **Scope:** wiring only; no behaviour.
- **Exit criteria:** `pnpm i --frozen-lockfile` after the lockfile change, lint, typecheck, tests green; `./gradlew build` on both versions and `-PwithoutGeckolib` green with the three new log lines showing 0; `./gradlew -p parity build` green.

### B409 Format: key binds, HUD, vehicles, new actions (wave 1; Opus)

- **Owner files:** new `packages/schemas/mcdoc/msm/controls.mcdoc` and `vehicle.mcdoc`; `action.mcdoc` (actions `explode`, `show_hud`, `hide_hud`, `set_hud`), `definition.mcdoc` and `element.mcdoc` (the three definitions and elements), `symbols.json` (regenerated); conformance corpus files `packages/schemas/mcdoc/msm/conformance/definition/key-bind-*`, `hud-*`, `vehicle-*`, `action-explode-*`, `action-hud-*` (valid and invalid cases).
- **Scope:** ADR 0088 D3, ADR 0089 D1, D2, D6, ADR 0090 D2, D6 as closed structs with the defaults in doc comments.
- **Exit criteria:** `node tools/build-msm-mcdoc/index.ts --check` green; the schemas package's tests green with at least 40 new corpus cases; the runtime's corpus JUnit test still green (unknown kinds are skipped until their parsers land).

### B410 Plugin API 1.16.0 and target facts (wave 1; Opus)

- **Owner files:** `packages/plugin-api/src/target.ts`, `version.ts`, `package.json` (1.16.0) and their tests; `packages/targets/mc-26.3/src/target.ts`, `packages/targets/mc-26.4/src/target.ts` and the targets' tests; the plugin API changelog section.
- **Scope:** `TargetFacts.controls` (`keyNames`, `vanillaKeys` from B406's dumps; runtime-key defaults `fire` R, `second` G, `horn` H, `descend` Left Alt, each checked against `vanillaKeys` by a test and changed if taken) and `TargetFacts.vehicles` (`modes`, `maxSpeed` 3). Additive; built-ins keep `^1.0.0`.
- **Exit criteria:** plugin API and targets tests green; a test that no runtime-key default is a vanilla binding on either target; `check-deps` green.

### B411 Runtime: channel and key binds (wave 2; Opus)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/net/` (`MsmNetworking`, `KeyPayload` (`key_v1`), `HudPayload` (`hud_v1`, codec only), `InputGuard`), `controls/` (`KeyBinds`, `HeldKeys`), `loader/KeyBindParser.java`, `loader/KeyBindDefinition.java`, `client/controls/` (`ControlsClient`, `ProjectKeyMappings`, `RuntimeKeys` with the four vehicle keys of ADR 0088 D5), lang for the runtime keys in `engine-mod/src/main/resources/assets/msm_runtime/lang/en_us.json`, test definitions under `engine-mod/src/gametest/resources/msm/msm_test/key_bind/`, `MsmKeyBindGameTest`, the key half of `MsmControlsClientGameTest`, JUnit `KeyBindParserTest`, `InputGuardTest`.
- **Scope:** ADR 0088 D1–D5, D7. `RuntimeKeys` registers only when a vehicle definition is loaded and exposes `isFireDown()` and the others for B418.
- **Exit criteria:** engine-mod rules above; GameTests cover events, `when`, cooldown, hold interval, release clearing on death, leave and dimension change, unknown ids, rate limit and malformed input; the client GameTest presses a project key on a dedicated server (both versions) and sees its function run; log line `registered N key bind(s)`.

### B412 Runtime: vehicles core (wave 2; Opus, high effort)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/vehicle/` (`MsmVehicles`, `MsmVehicle extends VehicleEntity`, `VehicleDriver`, `VehiclePhysics` (pure), `VehicleMovement`, `VehicleSeats`, `VehicleFuel`, `VehicleHealth`, `VehicleStorage`, `VehiclePaint`, `MsmVehicleItem`, and stubs `VehicleWeapons`, `VehicleTurret` with empty hooks for B417), `loader/VehicleParser.java`, `loader/VehicleDefinition.java`, `events/Action.java` and `events/Events.java` (the `explode` action), `events/Explosions.java`, `fixtures/vehicle-physics/golden.json` and its writer, test definitions under `engine-mod/src/gametest/resources/msm/msm_test/vehicle/` with their geometry, `MsmVehicleGameTest`, JUnit `VehicleParserTest`, `VehiclePhysicsTest`, `VehiclePhysicsGoldenTest`.
- **Scope:** ADR 0090 D2–D5, D8 (the attribute modifier, if S5 allows), D9, D12, D13; all synched data accessors for B417 and B418 are defined here (turret yaw and pitch, steering, throttle, fuel, paint, ammunition per weapon index); the vehicle tick follows S1's answer.
- **Exit criteria:** engine-mod rules above; GameTests for placing on ground and water, picking up with state and empty storage, seats and dismount spots, server movement without a driver (falling, floating, sinking), fuel burn and refuel, damage, repair, destroy with drops and `on_destroy`, storage saved and dropped, paint, `explode` with and without breaking blocks; the golden has at least 30 steps across the five modes; log line `registered N vehicle type(s)`.

### B413 Controls plugin: `msm:key_bind` and `msm:hud` (wave 2; Opus)

- **Owner files:** `packages/plugins/controls/src/**` and its tests (kinds, lowering, validators of ADR 0088 D8 and ADR 0089 D9, templates of ADR 0091 D3).
- **Scope:** both kinds with defaults, lowering to definitions and lang, validators with codes `controls.*`, six templates; the host's mod-only ids are unaffected (no vanilla registry ids are created).
- **Exit criteria:** plugin tests with a lowering golden per kind and a test per validator code; templates create with zero problems on both targets.

### B414 Entities plugin: `msm:vehicle` (wave 2; Opus)

- **Owner files:** `packages/plugins/entities/src/kinds/index.ts` (the kind), new `kinds/vehicle.ts`, `lowering/vehicle.ts`, `validators-vehicles.ts`, `templates/vehicles/*` and their tests.
- **Scope:** ADR 0090 D2, D14; validators: bones named in `turret`, `parts` and `muzzle` exist in the geometry when the geometry is a project element (warning otherwise), projectile valid (target facts), `max_speed` within `TargetFacts.vehicles.maxSpeed`, seat weapon ids exist, fuel and ammunition items exist, `immune_to` ids, `vehicles.vanilla-renderer-subset` as for mobs; eight templates.
- **Exit criteria:** plugin tests (lowering goldens for a car and a tank, one test per validator code); templates zero problems on both targets.

### B415 Exporters: vanilla packs and the eject (wave 2; Sonnet)

- **Owner files:** `packages/exporters/src/vanilla-packs/mod-only.ts` (vehicle item and entity ids), the eject's warning list in `packages/exporters/src/java-project/` (`export.not-in-eject` for the three kinds), the info codes `controls.needs-jar` and `vehicles.needs-jar` where vanilla pack infos are produced, tests.
- **Scope:** ADR 0088 D10, ADR 0090 D14.
- **Exit criteria:** exporter tests: a recipe making a vehicle item is left out of the vanilla data pack with `export.mod-only-reference`; the eject of a project with each kind warns once per element and builds.

### B416 Runtime: HUD (wave 3; Opus; after B411)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/hud/` (`HudServer`, `HudValues`, `HudSync`), `loader/HudParser.java`, `loader/HudDefinition.java`, `events/Action.java` and `events/Events.java` (the three HUD actions), `client/hud/` (`HudClient`, `MsmHudLayer`, `HudLayout`, `VehicleDashboard`), seams `engine-mod/src/mc/26.3/java/.../client/HudRegistration.java` and `src/mc/26.4/java/.../client/HudRegistration.java`, test definitions under `.../msm/msm_test/hud/` with sprites, `MsmHudGameTest`, the HUD half of `MsmControlsClientGameTest`, JUnit `HudParserTest`, `HudLayoutTest`.
- **Scope:** ADR 0089 D1–D6; the dashboard reads B412's synched data.
- **Exit criteria:** engine-mod rules; GameTests for every source, change detection, the five-tick update, actions, the hash mismatch path; the client GameTest finds a bar and a text at their anchors on both versions; log line `registered N HUD element(s)`.

### B417 Runtime: weapons and turret (wave 3; Opus; after B411, B412)

- **Owner files:** `registry/vehicle/VehicleWeapons.java`, `VehicleTurret.java` (replacing B412's stubs), new `registry/projectile/Projectiles.java`, `registry/mob/MobRanged.java` (moved onto `Projectiles`), `MsmVehicleWeaponGameTest`, weapon test definitions.
- **Scope:** ADR 0090 D6, D7 (server side; the client's local turret angle is B418's).
- **Exit criteria:** engine-mod rules; GameTests: cooldown, automatic fire, ammunition loading and use, projectile owner and start point, a throwable shell's `on_hit_block` with `explode`, seat weapon lists, turret limits and turn rate; the mob ranged GameTests unchanged and green.

### B418 Runtime: vehicle client (wave 3; Opus; after B411, B412)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/client/vehicle/` (`VehicleClient`, `MsmVehicleRenderer`, `VehicleRenderState`, `VehicleModel`, `EngineSound`, `VehicleExhaust`, `VehicleInput`, `LocalTurret`), the vehicle line in both `EntityRendererRegistration` seams, `MsmVehicleClientGameTest`.
- **Scope:** ADR 0090 D7 (local turret), D10; input sends the runtime keys through B411's `RuntimeKeys`.
- **Exit criteria:** engine-mod rules; the client GameTest (both versions, dedicated server): place, mount, hold forward, the server sees movement and turning; fire with the fire key and a projectile appears; screenshots of the vehicle and dashboard in the artefact; no client class loads on a dedicated server (`--forbid-line NoClassDefFoundError` in B426's server check).

### B419 App: Vehicle Studio (wave 3; Opus; after B414 and B407's route)

- **Owner files:** `app/src/renderer/src/studios/entities/vehicle/**`, the vehicle lines in `app/src/renderer/src/studios/entities/studios.tsx`, preview additions under `app/src/renderer/src/preview/geo/` limited to new files (`vehicle-pose.ts`), tests.
- **Scope:** ADR 0091 D1 for vehicles; the Rules section via `RulesSlot`.
- **Exit criteria:** app rules above; unit tests for the bone pickers and the pose (turret yaw from the mouse, wheel spin); size within B407's route.

### B420 App: Key bind and HUD Studios (wave 3; Opus; after B413 and B407's route)

- **Owner files:** `app/src/renderer/src/studios/controls/**` (its `studios.tsx` from B408), tests.
- **Scope:** ADR 0091 D1 for key binds and HUD; "Press a key" capture in the browser maps to `InputConstants` names through `TargetFacts.controls.keyNames`.
- **Exit criteria:** app rules; unit tests for key capture mapping and the HUD layout preview against the same anchor table as `HudLayout` (a shared JSON in `fixtures/hud-layout/golden.json` written by B416's JUnit test and read here).

### B421 Script API 1.5 (wave 4; Opus; after B416, B417)

- **Owner files:** `packages/plugins/scripting/api/script-api-v1.json`, the typings golden (`UPDATE_GOLDENS=1`), `engine-mod/src/main/java/dev/mcsupermods/runtime/scripting/` (`ScriptApi`, `ScriptEvents`, `ScriptEntity`, `ScriptPlayer`, new `ScriptVehicle`, `ScriptBridges`), `MsmScriptApi15GameTest`.
- **Scope:** ADR 0089 D8.
- **Exit criteria:** `ScriptApiContractTest` green; GameTests for each member and event; scripting plugin tests green.

### B422 Creator flows and the Very easy tile (wave 4; Opus; after B419)

- **Owner files:** `packages/plugins/library/src/starters/vehicle-car.ts`, `vehicle-tank.ts`, `vehicle-plane.ts`, `vehicle-boat.ts`, their lines in `starters/index.ts`, MSM-made models and textures under `packages/plugins/library/src/assets/vehicles/`; `app/src/renderer/src/components/home/tiles.ts` (one tile) and the kind picker it opens; tests; `examples/` goldens for the four starters.
- **Scope:** ADR 0091 D2, D4. Rebase on the "Surprise me" work first.
- **Exit criteria:** library tests (each flow with untouched defaults gives zero problems on both targets); app tests for the tile; `check-size` within budget.

### B423 Library examples (wave 4; Sonnet; after B413, B414)

- **Owner files:** `packages/plugins/library/src/examples/` (three examples of ADR 0091 D3 and their index lines), `examples/` goldens.
- **Exit criteria:** library tests; zero problems on both targets.

### B424 Rules: keys, HUD and vehicles (wave 5; Opus; after B421)

- **Owner files:** `packages/plugins/rules/src/catalogue/*`, `compile/*`, `templates/*` additions, goldens, `packages/schemas/mcdoc/msm/rules.mcdoc` (new trigger, step and value ids), the Rules plugin tests, the AI prompt pin list only if the catalogue test requires it (`app/test/ai-rules.test.ts` is B430's).
- **Scope:** ADR 0088 D6, ADR 0089 D7, ADR 0090 D11; the explosion step becomes the plain `explode` action; Very easy wording "When the player presses a key" with key capture and "Show a number on screen".
- **Exit criteria:** rules goldens for every new card; a book using each compiles to plain events where possible and to the script otherwise; `build-msm-mcdoc --check` green.

### B425 Sample vehicles fixture (wave 5; Opus; after B416–B418)

- **Owner files:** `fixtures/sample-vehicles/**` (project, goldens for both targets, README with the in-game checklist: each vehicle's handling, the turret, firing, fuel, repair, storage, paint, picking up, the dashboard, the keys in Controls, a HUD bar, multiplayer with two players on a dedicated server).
- **Exit criteria:** the fixture exports with zero problems on both targets; goldens checked by the exporters' test.

### B426 Parity and CI (wave 6; Opus; after B425)

- **Owner files:** `engine-mod/parity/src/.../SampleVehiclesParityTest.java`, `.github/workflows/ci.yml` (export, server check pinning the three log lines and forbidding `NoClassDefFoundError`, parity on both versions' content jars).
- **Exit criteria:** parity green on both versions locally; a negative run (wrong sample) fails; CI green on the branch.

### B427 e2e paths (wave 6; Opus; after B422, B424)

- **Owner files:** `app/e2e/vehicles-path.spec.ts`, `app/e2e/controls-path.spec.ts`.
- **Exit criteria:** both pass under `xvfb-run -a`; the Tank flow with defaults, the Very easy tile, the Key bind and HUD Studios and a Rules key trigger each covered; the full e2e run time reported.

### B428 Try it: vehicles (wave 6; Opus; after Try it slice 3)

- **Owner files:** new `packages/sim/src/vehicles/**` (physics twin read against `fixtures/vehicle-physics/golden.json`), new `app/src/renderer/src/tryit/vehicles/**`, the lines that register them in the Try it view (agreed with the Try it plan's owner at the time).
- **Exit criteria:** sim tests including the golden; app tests; `tryit-path` extended or a new spec step; size within budget.

### B429 Try it: keys and HUD (wave 6; Opus; after B428)

- **Owner files:** new `packages/sim/src/controls/**`, new `app/src/renderer/src/tryit/hud/**`.
- **Exit criteria:** sim and app tests; HUD anchors match `fixtures/hud-layout/golden.json`.

### B430 AI helper (wave 7; Opus)

- **Owner files:** `app/src/renderer/src/ai/schema-summary.ts` allowances, the system prompt paragraphs (where the Rules paragraph lives), `app/test/ai-rules.test.ts` pins, a scripted build scenario.
- **Exit criteria:** ADR 0091 D8; AI tests green.

### B431 Guide, changelog, status lines (wave 7; Sonnet)

- **Owner files:** `docs/guide/vehicles.md`, `docs/guide/keys-and-hud.md`, lines in `rules.md`, `very-easy.md`, `playing-and-testing.md`, `scripting.md`, `try-it.md`, `docs/site/.vitepress/config.ts`, `CHANGELOG.md` `[Unreleased]`, status lines in root and scoped `CLAUDE.md` files (within their line limits).
- **Exit criteria:** labels match the shipped UI (from the notes); every limit V1–V17 in plain words on the right page.

### B432 Close (wave 7; main session)

- ADRs 0088–0091 accepted with findings (S1–S12 and every "verify at implementation" answer), DESIGN §10, §11, §12 and §8 updated, coverage audit B15 split (closed parts, what remains: custom screens and block entity renderers, portal overlay, particle trails, scripts and client code in the eject, the other R10 triggers), ROADMAP ticks and milestone row with counts from the clean run, HANDOFF, DEVLOG; this plan deleted.

### B433 Reserve: server-moved vehicles (only on B406 no-go)

- **Owner files:** `registry/vehicle/VehicleMovement.java`, `MsmVehicle.java` tick, `client/vehicle/VehicleInput.java`.
- **Scope:** ADR 0090 D4's fallback: the server runs `VehiclePhysics` from `getLastClientInput()` and the runtime keys; clients interpolate; recorded as a limit.

## Very easy wording

- Home tile: **Make a vehicle** — "Cars, tanks, planes and boats you can drive." Then "What kind?" with Car, Tank, Plane, Boat; then "What is it called?"; then the made vehicle opens with "Try it" and "Play" offered.
- In the vehicle's page (Very easy shows a short form, not the full Studio): "How fast", "Needs fuel" (with "What fuel?"), "Has a cannon" (Tank), "How many seats", "Colour".
- Rules: "When the player presses a key" (then "Press the key you want"), "When the player lets go of a key", "While the player holds a key"; "Show a number on screen" (then "As a bar or as text?", "Where on screen?" with a picture of nine spots and "above the hotbar"); "When someone gets in <vehicle>", "gets out", "When <vehicle> fires", "When <vehicle> is destroyed".
- Things to fix, in plain words for each new code (B413, B414, B424 write them; B431 checks them).

## Notes from implementation

(Empty. The main session appends each executor's "Notes for the plan" here.)
- B407 (no commit; measurement at 53b79ee): renderer 15,825,327 bytes (15.1 MiB) of 16 MiB; Monaco about 11 MiB of it (all lazy); eager total about 3.45 MB; Studios already lazy and small (Particle Studio 16.9 kB, Portal section 9.2 kB). Estimate for the three new Studios about 0.1-0.12 MB, plus about 0.3-0.5 MB of parallel work (Try it grounds, AI pictures). Route (a) is not available (`check-size` sums every renderer file). **Chosen: route (b)**, the renderer budget raised to 18 MiB in `tools/check-size` (orchestrator, with its README and test). B419 and B420 may start when their wave comes.
- B406 (see the commit before these notes; spike code deleted, copy in `scratchpad/b406-out/spike-src/`): **go for ADR 0090 D4.** S1 yes on both versions: the driver's client moves a `VehicleEntity` subclass, the server accepts vanilla's move-vehicle packets (server physics ran 0 ticks while driven; client and server end positions equal). S2: no "moved wrongly" or "moved too quickly" at 0.5-5 blocks a tick; 8 and 9.5 b/t give occasional "moved too quickly" (a packet can carry two steps); 11 b/t is always rejected; a block the client cannot see gives "moved wrongly" and a 1-block snap-back (depends on disagreement, not speed). S3 the server has the seated player's yaw and pitch one tick later; the hull does not turn the look. S4 `ClientPreAttackCallback` returning true cancels the attack entirely (fires every tick while held). S5 the camera takes the larger of the player's and a living vehicle's `CAMERA_DISTANCE`; on a non-living vehicle only the player's counts; a transient modifier on the seated player works. S6 key mappings registered in a client entrypoint appear in Controls under `key.category.<ns>.<path>` of the registered category id, save to `options.txt`, respect edits, and `TestInput.holdKey` drives them. S7 the payload round trip works (server thread, render thread). S8 the HUD seam works on both versions (26.3 `HudElementRegistry` lambda; 26.4 `HudElement` with `update` and `extractRenderState`; 26.4 renderer registration takes `BuiltInClientRegistries.ENTITY_RENDERER`). S10 `HasCustomInventoryScreen` opens storage from the seat. S11 a malformed payload disconnects the sender in vanilla's decoder before any receiver runs. S12 about 55 fps riding in third person under Mesa. Key dumps committed in `docs/reference/vanilla-keys/` (62 vanilla controls; 26.3 `key.socialInteractions` became 26.4 `key.otherPlayers`). **Changes for later briefs:** B410: the second-weapon key must not default to G (vanilla `key.quickActions`); R and Left Alt are free, H only clashes with an F3 combination; pick an unused key (for example V, only an F3 combination) and pin it with the vanilla-keys test. B410/B420: keyboard codes are SDL/HID scancodes (code 4 is `a`), mouse codes start at 1; the browser's `KeyboardEvent.code` maps through `keyboardNamesByCode0to400`. ADR 0088 D3/B413: lowering writes the lang key `key.category.<ns>.<path>` of the category id it registers. ADR 0088 D7 rule 1/B411: malformed payloads disconnect the sender (vanilla); only decodable payloads can be counted and dropped. B411: send presses from `consumeClick()` as well as `isDown` edges (one-tick taps); tests use `holdKeyFor`. B411/B418 tests: a disconnect makes `TestDedicatedServerConnection.close()` throw; expect it; the client test window is 854x480. B412: the vehicle class shape in the B406 report (controlling passenger, `LinearInterpolationHandler.create(this, 3)`, client drives when `isLocalInstanceAuthoritative()`, server drives only without a player; implement `read/addAdditionalSaveData`); compare yaw modulo 360; `VehiclePhysics` uses only blocks both sides know. ADR 0090 D4 cap of 3 blocks a tick holds (double step 6). Camera values below 4 not measured.
- B408 (see the previous commit): `@msm/plugin-controls` scaffold (id `msm.controls`, registered in `built-in.ts`, a dependency of app and exporters); runtime init order `MsmNetworking.init()`, `MsmVehicles.register(report)`, `KeyBinds.init(report)`, `HudServer.init(report)`, then log lines `registered N vehicle type(s)`, `N key bind(s)`, `N HUD element(s)`; client `VehicleClient.init()`, `ControlsClient.init()`, `HudClient.init()` before `DevClient.register()`; scanner kinds `key_bind`, `hud`, `vehicle` (parsers `KeyBindParser`, `HudParser`, `VehicleParser` with `KIND` and `parseAll` returning `List.of()`); `LoadReport` gains `keyBinds`, `hudElements`, `vehicles` with `with...(ids, errors, warnings)`; GameTest stubs `MsmKeyBindGameTest`, `MsmHudGameTest`, `MsmVehicleGameTest`, `MsmVehicleWeaponGameTest`, `MsmScriptApi15GameTest`, client `MsmControlsClientGameTest`, `MsmVehicleClientGameTest`; parity stub `SampleVehiclesParityTest`; 510 GameTests per variant. **Decision (orchestrator): dev-mode overlays** (`EventOverlay.KINDS_WITH_EVENTS` / `KINDS_WITHOUT_EVENTS`): B411 adds `key_bind` (events reload), B412 adds `vehicle` and B416 adds `hud` as "needs a restart". **B411/B412/B416:** replace `parseAll`'s return with your definition records, keep `LoadReport -> LoadReport`, call `report.with...`, log errors yourselves, replace each placeholder. **B416/B418:** `HudRegistration` seam and the vehicle renderer line under `src/mc/26.3|26.4`. **B420:** fill `studios/controls/studios.tsx`.
- B410 (see the commit before the migrate test fix): plugin API 1.16.0: `TargetFacts.controls?: ControlFacts {keyNames (255), unboundKey 'key.keyboard.unknown', vanillaKeys (62, per target: 26.3 `key.socialInteractions`, 26.4 `key.otherPlayers`), vanillaCombinations (21 F3 combinations), keyboardNamesByCode (0..400, HID usage), mouseNamesByCode (0..10), runtimeKeys {fire R, second V, horn H, descend Left Alt}}` and `TargetFacts.vehicles?: {modes [ground, water, amphibious, air, hover], maxSpeed 3}`; data in `packages/targets/mc-26.{3,4}/src/controls.ts` generated from the B406 dumps; clash rule: a `key.debug.*` control other than F3 itself is a combination and does not clash. AI `target_facts` leaves out the two code tables. **B411:** mirror the four runtime key defaults in Java and pin them with a test against the names. **B413:** key name checks against `keyNames`, `unboundKey` = no default; vanilla clash when `vanillaKeys[c] === key`, `c` not in `vanillaCombinations`; warn when a project key equals a runtime key and the project has a vehicle; skip when `controls` is absent. **B414:** `max_speed <= vehicles.maxSpeed`, `mode` in `vehicles.modes`. **B420:** a fixed `KeyboardEvent.code` to HID usage table in the app, then `keyboardNamesByCode`; mouse buttons 0/1/2 map to codes 1/2/3; do not reverse-map names (codes 1-3 duplicate digit names). **B431:** keys R, V, H, Left Alt.
- B409 (see the previous commit): `controls.mcdoc` (`::msm::controls`: `KeyBindCommon`, `HudCommon`, `HudValue` by `source` data|score|vehicle|player|set) and `vehicle.mcdoc` (`::msm::vehicle`: `VehicleCommon`, `VehicleWeapon`, turret, parts, storage, item, engine, health, events); definitions and elements `KeyBind`, `Hud`, `Vehicle` (elements add `display_name`, `category_name` / `item_display_name`); actions `explode {power 0..10, fire false, breaks_blocks false, at self|other}`, `show_hud`, `hide_hud`, `set_hud {hud, value}`; schema refs `keyBind`, `hud`, `vehicle` and their `*Definition`; 415 mcdoc types; 120 new corpus cases; runtime `ConformanceCorpusTest.PENDING` lists `key-bind-`, `hud-`, `vehicle-`, `action-explode-`, `action-hud-`; the sim logs the four new actions as Only in Minecraft. Choices: unbound key is `key.keyboard.unknown` (not "none"); `category` is a category id path (default `keys`, lang key `key.category.<ns>.<category>`); `events` uses `{actions: [...]}`; `model.geometry`/`animations` plain strings; weapons at most 8, paints at most 16. Field lists and defaults for B411, B412, B416 and B417 are in the B409 DEVLOG entry (parsers remove their prefixes from `PENDING` and add `KINDS`). Defaults marked "(verify at implementation)" in `vehicle.mcdoc` for other modes' acceleration, braking, hover turn rate, `places_on`: B412 fills them. **B413/B414:** strip element-only fields in lowering; validators check category characters, `#rrggbb` colours, `icon` for `icons`. **B424:** Rules' `break_blocks` maps to the action's `breaks_blocks` (Rules default breaks; the action default does not).
- B413 (see the commits before these notes): `msm:key_bind` (folder `key_bind`, default `{format: 1, default_key: 'key.keyboard.j'}`, lowers to `msm/<ns>/key_bind/<path>.json` plus lang `key.<ns>.<path>` from `display_name` and `key.category.<ns>.<category>` from `category_name`, `/` written as `.`) and `msm:hud` (folder `hud`, default `{format: 1, type: 'bar', value: {source: 'set'}}`, no lang); 16 codes `CONTROLS_PROBLEM_CODES` over validators `msm.controls.key-binds`, `msm.controls.hud`, `msm.controls.hud-references`; templates (category "Controls and HUD") `msm_key_bind_dash` (Z), `msm_key_bind_ability` (K), `msm_hud_mana_bar`, `msm_hud_stamina_bar`, `msm_hud_coordinates`, `msm_hud_score_counter`; helpers `keyBindNameKey`, `keyCategoryKey`, `hudSpritePath`, `HUD_SPRITE_FIELDS`, `HUD_TYPE_FIELDS`, `KEY_BIND_ELEMENT_FIELDS`. New projects now list `msm.controls`. **B411:** the default name key rule `key.<ns>.<path>` with `/` as `.`, the same for categories. **B420:** use `hudSpritePath`, `HUD_TYPE_FIELDS`; keys sharing a category must share `category_name`. **B424:** "presses a key" needs a key bind with `msm:on_press`/`on_release`/`while_held`; Rules validators check HUD ids themselves; counters read as HUD `data` with `scope: player`. Follow-up: the HUD validator does not re-run when a function changes (the objective info can be stale).
- B414 (see the commits before these notes): `msm:vehicle` in the entities plugin (folder `vehicle`, registry `entity_type`, `previewKind: 'vehicle'`, default `{format: 1, model: {geometry: '', texture: ''}, movement: {mode: 'ground'}}`); lowering to `msm/<ns>/vehicle/<path>.json` plus lang `entity.<ns>.<path>` and `item.<ns>.<path>` and the item picture (`items/<path>.json`, plus `models/item/<path>.json` when only `item.texture` is set); 15 codes `VEHICLE_PROBLEM_CODES` (kept outside `ENTITIES_PROBLEM_CODES`); eight templates (category "Vehicles") `msm_vehicle_go_kart`, `car`, `tank`, `biplane`, `helicopter`, `motorboat`, `raft`, `hovercraft`; starter geometries `vehicleGeometry(shape, name)` (front is -z; offsets in blocks, z forwards). **B412:** item id equals the vehicle id; keep the default `item_model`; lang keys as above. **B419:** bone pickers for `turret.bone/pitch_bone`, `parts.*`, `weapons[].muzzle.bone`; "Make a starter model" from `vehicleGeometry`. **B422:** copy the starter shapes into `library/src/assets/vehicles/` (bone names in the B414 report). **App follow-ups (orchestrator, with B415):** plain words for the 15 vehicle codes and the 16 controls codes in `session/plain-problems.ts`; each vehicle id in the `item` registry of `session/schema-context.ts`.
- B415 (see the commit before these notes): eject warns `export.not-in-eject` once per key bind, HUD element and vehicle (`packages/exporters/src/problem-codes.ts`); vanilla exports get the infos `controls.needs-jar` and `vehicles.needs-jar` (made in `project-session.ts` by `withControlsNeedJar` / `withVehicleNeedsJar`); plain words for every vehicle and controls code are in `plain-problems.ts` (coverage enforced by its test); a vehicle's item id is in the `item` registry, so vanilla recipes making it are dropped with `export.mod-only-reference`; the AI system prompt names the three codes. **B422:** `library.test.ts` expects one per-kind example for every kind (96 of 97 today: add the vehicle, key bind and HUD examples).
- B423 (see the commit before these notes): per-kind examples `example_msm_vehicle` ("Vehicles: a tank battle", fires vanilla fire charges), `example_msm_key_bind` ("Controls: a dash ability", Z, 20-tick cooldown, `set_hud` empties a charge bar), `example_msm_hud` (mana bar and score line), behaviour example `example_vehicles_seaside` (`vehicleBehaviourExamples`); boxed geometries in `library/src/content/vehicle-models.ts`; `packages/exporters/test/library.test.ts` now registers `@msm/plugin-controls`, so every golden lists `msm.controls` (the "96 of 97" was only `msm:vehicle` missing). Library counts: 100 per-kind, 34 behaviour, 154 `libraryExamples`. A vehicle item with `item.texture` names a picture that is reported missing (`schema.unknown-id`) until the project has it; examples without a picture use `item.model`. **B424:** may add the cooldown-counter Rules book to the dash example. **B422:** reuse `vehicle-models.ts` where it fits.
