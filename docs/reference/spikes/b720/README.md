# B720 spike: community games on a data pack

Answers K1 to K21 of brief B720 in [`docs/PLAN-game-studio.md`](../../../PLAN-game-studio.md) (draft [ADR 0132](../../../adr/0132-game-and-map-studio.md)), measured on 2026-11-23 on this cloud machine (4 cores, 15 GB, shared with other builds: load average 7 to 11 during the runs, so every time below is an upper bound) for the targets 26.3 and 26.4-snapshot-7 (Fabric reports it as 26.4-alpha.7). Nothing here is built, linted or shipped; no code was left in `engine-mod/`.

Clean room: Mojang classes were read with `javap` signatures only (no `-c`, no method body). Behaviour was learned by observation: the spike's own data pack on a real dedicated server, with stand-in players acting through the game's own network handlers. No vanilla file was copied; the kept console lines are the game's command feedback and death messages for the spike's own players, as in B547.

**In short.** All four batch 1 types play as a plain data pack on both targets, and each game's tick function costs 0.004 to 0.1 ms with 16 players (the bar is 1.0 ms). Both targets answered every question the same way. Five things change the plan: (1) on 26.x an advancement's `entity` condition is **one** loot condition and an entity predicate is a **map of sub-predicates** (`{"minecraft:entity_type": "minecraft:player"}`), so the short `{"type": ...}` form and the list form both stop the server loading the pack; (2) "kept out for an hour" can only be an hour of the **server's running time** (game time stops while the server is off; vanilla has no clock); (3) `spawnpoint` keeps a team's respawn point after its bed is broken, so the game decides "no bed, out" itself; (4) the runtime's `entity.death` fires for players but names no killer for a knock into the void (vanilla credits one), so Rules need the kill credit; (5) Hide and seek plays without mods in a simpler form (a block that follows the hider, hits caught by an interaction entity), so its mark can follow the evidence.

## What was run

- **A Fabric dedicated server per target** (the cached server jars, loader and Fabric API of `tools/run-fabric-server`, `~/.cache/msm-fabric-server`), flat world, one server at a time, driven over stdin by `spike-src/srv.py` and `spike-src/run_k.py`. One fresh world per target; 3 to 17 players; one stop and start of the same world at the end (K6, K15). A second short run per target (`results/server-*-K1-K7.json`) added the kill credit (K21), and `spike-src/probe_k7.py` the compass read variants (`results/probe-k7-*.json`).
- **The game logic is a plain data pack** (`spike-src/make_pack.py` writes `b720`: 87 functions, 5 advancements, 2 recipes, a loot table, a predicate, an item modifier, a structure template). Vanilla commands only. The only other lines are the spike mod's log lines (`b720 log <text component>`, which prints the resolved text with the game time); they sit on lines of their own and are left out of the offline check.
- **The stand-in players** (`spike-src/B720Spike.java`, a throwaway Fabric mod built with `javac` against the server jar and Fabric API, `spike-src/build_mod.sh`): each is a real `ServerPlayer` on a vanilla `Connection` inside a Netty `EmbeddedChannel`, made with the offline profile of its name and placed with `PlayerList.placeNewPlayer`; a returning name first gets its saved data (`PlayerList.loadPlayerData`, then `Entity.load`), as a login does. Every tick the network listener's own `tick()` runs for each, and the stand-in answers what a client answers at once: keep-alives, teleport confirmations (`handleAcceptTeleportPacket`) and the end of loading (`handleAcceptPlayerLoad`). Actions go through the handlers a client's packets reach: `handleAttack`, `handleUseItem`, `handleUseItemOn`, `handlePlayerAction` (start breaking), `handleInteract`, `handleClientCommand` (respawn), `onDisconnect` (leaving); commands run as the player at the player's own permission (`b720 as <name> <command>`). Kills by a player are `hurtServer` with `damageSources().playerAttack(killer)`, the damage source a melee hit uses. What each player is sent (chat, titles, the action bar, game mode changes, merchant offers, dialogs, the death screen) is printed as `B720SEE <name> ...`. Fabric's `ServerLivingEntityEvents.AFTER_DEATH`, the hook behind the runtime's `entity.death`, is logged for players with `getKillCredit()` (K21).
- **Costs:** `b720 time <n> <command>` runs a command n times at the end of a tick, outside any other command, output suppressed, and prints the first, median and least time; `b720 perf start|stop` records whole server ticks over `tick sprint`. The function times are the useful ones; whole-tick differences sit inside this machine's noise.
- **Offline forms:** every game-logic line through `@msm/schemas/mcfunction` on both targets (`spike-src/check_forms.ts`, run by Vitest from a scratch folder against the repository's source, read only): `results/spyglass-forms.json`.
- `results/server-26.3.json` and `results/server-26.4.json` hold every scenario's steps and console (a line every player was sent is kept once).

Both targets behaved the same in every answer below; the only differences seen were feedback wording (`Applied 1 effect(s)` on 26.4) and the vanilla advancement count.

## Answers

### K1 Scoreboard criteria and when they update

**Go, both targets.** Every criterion below was made with `scoreboard objectives add <name> <criterion>` and read back:

| Criterion | What moved it | When |
|---|---|---|
| `deathCount` | any death, `/kill` included | at the death, before that tick's tick function |
| `playerKillCount` | a kill credited to the player (a direct hit, or a knock into the void within the credit window) | at the death |
| `totalKillCount` | any kill: mobs and players | at the death |
| `health` | the player's health, an integer rounded up (16.5 reads 17) | at the next tick |
| `trigger` | see K5 | when the player runs `/trigger` |
| `killedByTeam.red` | the victim, when the killer is on team red (the victim's own team does not matter) | at the death |
| `teamkill.blue` | the killer, when the victim is on team blue | at the death |
| `minecraft.custom:minecraft.deaths` | as `deathCount` | at the death |
| `minecraft.custom:minecraft.player_kills` | as `playerKillCount` | at the death |
| `minecraft.custom:minecraft.time_since_death` | ticks since the last death or the first join; 0 at a death; kept while offline | each tick |
| `minecraft.custom:minecraft.leave_game` | +1 at each leaving; readable once the player is back | at the leaving |

A kill made by a player's attack arrives before the tick function of the same tick: the tick function's `execute as @a unless score @s deaths = @s seen run ...` saw the new values in the very tick of the kill (game time equal). Scores of unset holders read as unset: `scoreboard players add @a <obj> 0` once a tick (or at join) makes them 0 so `if score` comparisons work.

### K2 Most health from a score through a macro

**Go, both targets.** Form:

```mcfunction
# hearts/apply, run as the player
execute store result storage <ns>:hearts hp int 2 run scoreboard players get @s <ns>.hearts
function <ns>:hearts/set with storage <ns>:hearts
# hearts/set
$attribute @s minecraft:max_health base set $(hp)
```

- **Holds** through death and respawn (respawns with full health at the new most: 30 of 30), leaving and joining (saved with the player), and a server restart (the player file).
- **Current health:** lowering the most leaves the current health above it for the rest of the tick and clamps it at the next tick (20 of 14, then 14 of 14). Raising it never heals (14 of 30). A lifesteal heart therefore adds "room", not health; give `instant_health` if a heart should heal.
- **Range:** `base set 0`, `0.5` and `-1` are accepted and give a most of **1.0** (half a heart); above **1024** gives 1024. So the lowest that works is 1 point (half a heart), and a game's "1 heart" floor is `hp` 2. Zero hearts must be handled by the game (spectator, K6), never by the attribute.

### K3 Who killed whom, in one tick

**Go, both targets**, with the 26.x advancement form:

```json
{"criteria": {"c": {"trigger": "minecraft:player_killed_entity",
  "conditions": {"entity": {"type": "minecraft:entity_properties", "entity": "this",
                            "predicate": {"minecraft:entity_type": "minecraft:player"}}}}},
 "rewards": {"function": "<ns>:killer"}}
```

and `minecraft:entity_killed_player` with the same object under `killing_entity`. **No-go for the older forms:** `{"entity": {"type": "minecraft:player"}}` is read as a loot condition named `minecraft:player` and a list `[{...}]` is "Not a JSON object"; both stop the **whole server** loading (registry error), not just the advancement. Since 26.2 an entity predicate is a map keyed by sub-predicate type (`minecraft:entity_type`, `minecraft:team`, `minecraft:flags`, ...), not `{"type": ..., "team": ...}`.

Order, all in the tick of the kill: the **victim's** reward runs first, as the victim (its `deaths` already 1), and inside it `execute on attacker` is the killer; then the **killer's** reward runs as the killer (its `kills` already counted); then the tick function, which sees both scores. So a lifesteal pair is made in the victim's reward (`execute on attacker run ...`) or in the tick from the scores; no polling of advancements is needed. Each reward revokes its own advancement to arm it again (`advancement revoke @s only <id>`). A knock into the void within about 10 ticks of a hit counts for the hitter (kill score, both rewards, the death message "... didn't want to live in the same world as ..."); 400 ticks later it does not ("fell out of the world").

### K4 The Heart item and the revive item

**Go, both targets.** A crafting recipe's result carries components on 26.x:

```json
{"type": "minecraft:crafting_shaped", "pattern": ["DND", "NTN", "DND"],
 "key": {"D": "minecraft:diamond_block", "N": "minecraft:netherite_scrap", "T": "minecraft:totem_of_undying"},
 "result": {"id": "minecraft:red_dye", "count": 1, "components": {
   "minecraft:custom_name": {"text": "Heart", "color": "red", "italic": false},
   "minecraft:item_model": "minecraft:heart_of_the_sea",
   "minecraft:custom_data": {"b720_heart": true},
   "minecraft:consumable": {"consume_seconds": 1.0, "animation": "eat", "has_consume_particles": false},
   "minecraft:max_stack_size": 16}}}
```

A crafter crafted it with no player; the dropped item had every component (`custom_data` `{b720_heart: 1b}`). Eating it (`handleUseItem`, 1 s) fired

```json
{"trigger": "minecraft:consume_item", "conditions": {"item": {"items": "minecraft:red_dye",
  "predicates": {"minecraft:custom_data": "{b720_heart:1b}"}}}}
```

(the object form `{"b720_heart": true}` also loads) at the end of eating, as the eater; the reward revoked itself and the second Heart fired it again; a plain red dye did not. The same item by command: `give @s minecraft:red_dye[minecraft:custom_name={text:"Heart",color:"red",italic:false},minecraft:item_model="minecraft:heart_of_the_sea",minecraft:custom_data={b720_heart:1b},minecraft:consumable={consume_seconds:1.0f,animation:"eat",has_consume_particles:false},minecraft:max_stack_size=16]`.

**Revive:** a beacon with `custom_data` and `consumable` worked the same way. "The one out longest" works for players online: `scoreboard players operation #min <obj> < @a[tag=out] <out-since>` then `execute as @a[tag=out] if score @s <out-since> = #min <obj> run ...` brought back the right one. A player who is offline cannot be selected; a name can be put into storage through a player head (`loot replace block <chest> container.0 loot <ns>:head_of_this` with the loot `modifier` `{"type": "minecraft:fill_player_head", "entity": "this"}`, then `data modify storage ... name set from block ... Items[0].components."minecraft:profile".name`) and a macro then marks the offline name (`$scoreboard players set $(name) <obj> 1`), which the join check acts on. A pick through a dialog (one button per name, built by a macro) is possible with the same trick; not run.

### K5 `/trigger`

**Go, both targets.** `scoreboard objectives add <ns>.withdraw trigger`; the tick runs `scoreboard players enable @a <ns>.withdraw` and `execute as @a[scores={<ns>.withdraw=1..}] run function <ns>:withdraw`, which acts and sets the score back to 0. A player's `trigger <obj>` adds 1, `trigger <obj> set <n>` and `trigger <obj> add <n>` work; without `enable` the player is told "You cannot trigger this objective yet" and nothing changes; **one trigger per enable**: a second `trigger` in the same tick was refused, the next tick's enable armed it again. Cost: the whole Lifesteal tick with the enable for 16 players is 0.015 to 0.017 ms (K19). The withdraw (not below 1 heart) gave the Heart item and lowered the most health.

### K6 Kept out for a time

**Go with this change, both targets:** the time is **server running time**, not wall time. Form: at zero hearts `gamemode spectator @s`, `tag @s add <ns>.out`, `execute store result score @s <ns>.until run time query gametime`, `scoreboard players add @s <ns>.until <ticks>`; each tick `execute store result score #now <obj> run time query gametime` and `execute as @a[tag=<ns>.out] if score @s <ns>.until <= #now <obj> run function <ns>:back`.

- **Leaving and joining:** the player came back in spectator with the tag (saved with the player) and was returned on the first tick after joining once the time had passed while offline.
- **Restart:** game time carried on from where it stopped (6779 then 6780), the score and storage were kept, the load function ran again, the player came back in spectator and was returned at the due tick. Game time does **not** advance while the server is off, and vanilla commands have no wall clock, so "kept out for 1 hour" means 72,000 ticks of the server running. The Studio must say so; a real timed ban is the mod's or Paper's (D9 stands).

### K7 The tracking compass

**Go, both targets.** Form (one macro call for all hunters):

```mcfunction
# read, as the runner
execute store result storage <ns>:track x int 1 run data get entity @s Pos[0]
execute store result storage <ns>:track y int 1 run data get entity @s Pos[1]
execute store result storage <ns>:track z int 1 run data get entity @s Pos[2]
data modify storage <ns>:track dim set from entity @s Dimension
# set_all, run with storage <ns>:track
$execute as @a[tag=<ns>.hunter] if items entity @s weapon.mainhand minecraft:compass[minecraft:custom_data~{<ns>_tracker:1b}] run item modify entity @s weapon.mainhand {type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"$(dim)",pos:[I;$(x),$(y),$(z)]},tracked:false}}}
```

(and the same line for `weapon.offhand`). The tracker was written in the main hand and the off hand; `item modify entity <p> container.*` and `hotbar.*` are accepted (one slot modified) and `execute if items entity <p> container.* minecraft:compass[minecraft:custom_data~{...}]` finds a tracker anywhere; inline item modifiers take `type`, not `function`. When the runner was in the Nether the tracker's target became `{dimension: "minecraft:the_nether", pos: [I; 10, 70, 10]}`. **What a hunter in another dimension sees** is client drawing and was not measured (in-game check); the game should point at the runner's last portal in the hunter's dimension when they differ.

**Cost:** the position read is the expensive part, because each `data get entity @s Pos[n]` on a player serialises the whole player. Measured for 10 hunters (`probe-k7-*.json`, medians, 26.3 / 26.4): the four-read form above 0.5 to 1.0 / 1.4 ms; one read into storage (`data modify storage <ns>:track p set from entity @s Pos`, the `Dimension` likewise, then `execute store result storage <ns>:track x int 1 run data get storage <ns>:track p[0]` and so on) 0.63 / 0.84 ms; a marker teleported to the runner and read instead 0.64 / 0.56 ms. A whole refresh: one macro call per hunter 1.7 to 3.5 / 1.9 to 2.3 ms, one call for all (`set_all` above) 0.75 to 2.0 / 0.75 to 1.2 ms, one call after the single read 0.55 / 0.88 ms. Once a second that is about 0.03 to 0.05 ms a tick on average, as one spike. **Form for B725:** the single read into storage and one `set_all` call, once a second.

### K8 Winning a hunt

**Go, both targets.** A project advancement `minecraft:player_killed_entity` with `{"type": "minecraft:entity_properties", "entity": "this", "predicate": {"minecraft:entity_type": "minecraft:ender_dragon"}}` ran its reward as the killer **at the killing blow** (the dragon's death animation is not waited for); vanilla's own "Free the End" was granted in the same tick. The runner's death: `execute if entity @a[tag=<ns>.runner,scores={<ns>.deaths=1..}]` in the tick, the deaths score reset when the round starts. Also tested: `execute if entity @a[name=<p>,advancements={minecraft:end/kill_dragon=true}]` (the selector form; `<name>[...]` is not a selector).

### K9 Holding hunters for a head start

**Go: attribute modifiers are kindest and cheapest.**

| Way | Form | Cost for 10 hunters | Notes |
|---|---|---|---|
| Attributes (recommended) | `attribute @s minecraft:movement_speed modifier add <ns>:hold -1 add_multiplied_total`, the same for `minecraft:jump_strength`, optional `effect give @s minecraft:blindness <s> 0 true`; release `attribute @s ... modifier remove <ns>:hold` | 1.0 to 1.8 ms once, 0.8 to 1.2 ms to release; nothing per tick | speed 0.0 and jump 0.0 read back; the camera still turns; nothing to clean up if the round is stopped but the modifier (removed at the next round start) |
| Effects | `effect give @s minecraft:slowness <s> 255 true`, `mining_fatigue` | 2.3 to 3.1 ms once | speed 0.0 read back; needs a duration; jumping is not stopped by an effect |
| Barrier box | `execute at @s run fill ~-1 ~-1 ~-1 ~1 ~2 ~1 minecraft:barrier hollow`, then `... minecraft:air replace minecraft:barrier` | 5 to 6 ms to build, 3 to 10 ms to remove | changes the world (left behind if the round is aborted) |
| Teleport each tick | `execute as @a[tag=<ns>.hunter] run tp @s <x> <y> <z>` | 0.15 to 0.25 ms **every tick** | the client fights it (rubber-banding; in-game check) |

That movement really stops on the client was not measured (the stand-ins have no client); the attributes are synced to the client, so it should (in-game check).

### K10 Spleef

**Go, both targets.**

- `gamemode adventure`, `item replace entity @s weapon.mainhand with minecraft:diamond_shovel[minecraft:can_break={blocks:"minecraft:snow_block"}]`: one start-breaking packet removed the snow at once (a diamond shovel is fast enough); the same shovel without `can_break` broke nothing; a **wooden** shovel with `can_break` did not break at once (it needs the full dig time). Use a diamond or a netherite shovel, or Efficiency, for "at once".
- **Drops:** the game rule is **`block_drops`** on 26.x (`gamerule doTileDrops false` is refused: "Incorrect argument"). With it false no item dropped; with it true one.
- **Falling out:** the predicate `{"type": "minecraft:location_check", "predicate": {"position": {"y": {"max": -42}}}}` with `execute as @a[...] at @s if predicate ...` caught y -42.5 and not y -41 (0.16 to 0.27 ms median for 16 players), and the selector `@a[y=-64,dy=22]` does the same at a sixth to a thirteenth of the cost (0.02 to 0.04 ms). Use the selector (`y` = the world bottom, `dy` = floor - 2 - bottom).
- **Rebuilding 32 by 32:** `fill x1 y z1 x2 y z2 minecraft:snow_block` 1.6 to 23 ms and `place template <ns>:floor32 x y z` 4.5 to 50 ms for the whole floor (first runs slowest; 3 ms each for half the floor). Both are fine at a round's end; `fill` is simpler and needs no template file (it stops at 32,768 blocks, B547; a bigger floor needs `place template`).

### K11 Beds, respawns and the void

**Go with this change, both targets.**

- **A bed stands:** `execute if block <foot> #minecraft:beds[part=foot] if block <head> #minecraft:beds[part=head]`. Breaking one half with `setblock ... air destroy` removed both halves.
- **Respawn point:** `spawnpoint <team members> <bed foot>` respawned the player beside the bed (21.5, 40.5 for a foot at 20, 40). **After the bed was broken the player still respawned at that point** (the command's point does not need a bed), so the game itself decides "no bed: out" in the death handling, not the game's own bed rule.
- **Respawn at once:** the rule is **`immediate_respawn`** (`doImmediateRespawn` refused). It tells the client to skip the death screen; the respawn itself still comes from the client (the stand-ins pressed it), so it is an in-game check.
- **A respawn wait:** a dead player can be put into spectator **before** pressing respawn (the tick sees `deathCount` at once) and keeps spectator after respawning; returned to survival at the base after 100 ticks by the K6 clock. With the bed gone, the same handler marked the player out.
- **The void:** a knock into the void after a hit counts for the hitter (K3); `execute as @a[gamemode=!spectator,y=-128,dy=60] run kill @s` ends a fall early.

### K12 Generators

**Go, both targets.** A marker per generator and a clock: `scoreboard players add #clock <obj> 1`, every n ticks `execute as @e[type=minecraft:marker,tag=<ns>.gen] at @s run function <ns>:drop`, which reads the nearby stack's count and summons one more only below the cap:

```mcfunction
scoreboard players set #c <obj> 0
execute as @e[type=minecraft:item,distance=..1.5,limit=1] store result score #c <obj> run data get entity @s Item.count
execute if score #c <obj> matches ..15 run summon minecraft:item ~ ~ ~ {Item:{id:"minecraft:iron_ingot",count:1},Motion:[0.0d,0.0d,0.0d]}
```

Dropped items merge into one stack, so counting entities (`if entity @e[type=item]`) does not cap anything; the stack's `Item.count` does (it stopped at 16 to 17). **Cost of twelve:** 0.027 ms median for the whole generator function per tick; the lying stacks add about 0.1 to 0.3 ms a tick to the server (entity ticking), not the function. One shared clock is as good as a timer per generator.

### K13 Shops

**Go with Offers NBT; no-go for a game's own shop from `trade_set` data alone; go for the dialog route.**

- **A trader:** `summon minecraft:villager <x> <y> <z> {NoAI:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b,VillagerData:{profession:"minecraft:armorer",level:5,type:"minecraft:plains"},Offers:{Recipes:[{buy:{id:"minecraft:iron_ingot",count:4},sell:{id:"minecraft:iron_sword",count:1,components:{"minecraft:custom_name":{text:"Team sword",italic:false},"minecraft:unbreakable":{}}},maxUses:2147483647,rewardExp:0b,xp:0},{buy:{id:"minecraft:gold_ingot",count:2},buyB:{id:"minecraft:iron_ingot",count:1},sell:{id:"minecraft:white_wool",count:16},maxUses:2147483647,rewardExp:0b,xp:0}]}}`. Opening it (`handleInteract`) gave the player a merchant screen with both offers, components intact. A player's attack and a 1000-point player attack did nothing (health 20, still there). It stands still (`NoAI`).
- **`trade_set` without NBT:** a summoned armorer with no `Offers` drew vanilla's `minecraft:armorer` level 1 set when first opened (emeralds for iron boots). So data alone changes trades only by overriding a vanilla profession's trade set, which changes every villager of that job in the world: not a game's own shop. A shop by data needs a project profession (the mod, ADR 0098) or the NBT form above.
- **A dialog with buy buttons:** `dialog show @s {type:"minecraft:multi_action",title:{text:"Shop"},actions:[{label:{text:"Iron sword (4 iron)"},action:{type:"minecraft:run_command",command:"trigger <ns>.shop set 1"}}]}` reached the player (a multi-action dialog with the button and its command). The button's `trigger` (permission 0, the K5 enable) bought the sword: `execute store result score #have <obj> run clear @s minecraft:iron_ingot 0` (counts without taking), then `clear @s minecraft:iron_ingot 4` and `give`; with too little iron it said so and took nothing.

### K14 Last one standing

**Go, both targets.** `execute store result score #alive <obj> if entity @a[tag=<ns>.in,gamemode=!spectator]`; teams left: `scoreboard players set #teams <obj> 0` then one `execute if entity @a[tag=<ns>.in,team=<t>,gamemode=!spectator] run scoreboard players add #teams <obj> 1` per team; a win when the round started with 2 or more (`#started`, counted at the start) and `#alive` is 1 (or `#teams` is 1); the winner named with `tellraw @a [{"selector":"@a[tag=<ns>.in,gamemode=!spectator]"},{"text":" wins the round!"}]`. **Practice:** a round started with one player never wins by "last one standing"; it ends when that player is out (or by the timer), which the test showed ("practice round over").

### K15 The round across `/reload`, a restart and a late join

**Go, both targets.** Storage (`data modify storage <ns>:round state set value "running"`) and scores (`#round`) survived `/reload` (the load function ran again: its guard `execute unless data storage <ns>:round {made:1b} run ...` kept it from resetting) and a stop and start (K6). **A late joiner:** each player carries the round number (`scoreboard players operation @s <ns>.round = #round <ns>.round` at the start); the tick's `execute as @a unless score @s <ns>.round = #round <ns>.round run function <ns>:late` put a new player into spectator at once, while a player of this round who left and came back kept playing.

### K16 The lobby

**Go, both targets.** Countdown: `execute store result score #lobby <obj> if entity @a[tag=<ns>.lobby]`; at the minimum, set `#count` once (`unless score #count <obj> matches 0..`), count it down each tick, reset it when players drop below the minimum, start at 0. Even random split: `execute as @a[tag=<ns>.lobby,sort=random] run function <ns>:pick`, where `pick` counts each team (`execute store result score #r <obj> if entity @a[team=red]`) and joins the smaller (`execute if score #r <obj> <= #b <obj> run team join red @s`, else blue): 17 players went 9 and 8, differently each run. **Cost:** 0.5 to 1.0 ms median once, for 17 players and two teams.

### K17 Protection without cancelling

What a player in **adventure mode** could and could not do, through the real handlers, both targets the same:

| Could not | Could |
|---|---|
| Place any block without `can_place_on` (planks with `can_place_on={blocks:"minecraft:grass_block"}` placed); break any without `can_break`; empty a water or lava bucket; fill a bucket from water; start a fire with flint and steel or a fire charge; light TNT already in the map; place TNT, a boat, a minecart, an armour stand, an end crystal, an item frame or a painting; use a spawn egg; use bone meal on grass; break an item frame, armour stand or painting by hitting; take or turn an item in a frame | Throw ender pearls (leave an arena), snowballs, eggs, splash potions and wind charges; use levers, buttons, doors and chests |

Not measured and therefore limits until an in-game check: arrows and tridents hitting buttons, targets or TNT; wind charges opening doors or pressing buttons; projectiles hitting item frames or paintings; trampling farmland; mobs and explosions (`mob_griefing`, `tnt_explodes`); fire spreading from lava already in the map. Limit lines for ADR 0132: "Adventure mode keeps blocks and placed entities safe from players' hands, not from thrown things: ender pearls can leave an arena and wind charges push players; give no such items, or clear them."

### K18 Hide and seek

**Go without mods, in a simpler form. Verdict for the pill: "Plays without mods" (the mod's true disguise as the better form).**

- **A display cannot ride a player:** `ride <block_display> mount <player>` answers "Players can't be ridden" (a player can ride a display, which is no use). So the block follows by teleport each tick: `execute as @a[team=<hide>] at @s run function <ns>:follow`, matching display and player by an id score, `tp @s ~ ~ ~` from `positioned ~-0.5 ~ ~-0.5`, with `teleport_duration:1` on the display for smoothing (snapping to the grid with `align xyz` was written, `k18/follow_align`, but not run).
- **26.x display form:** `block_state:{id:"minecraft:oak_leaves"}` (or the string form); the old `{Name:...}` fails to decode and the display is not made.
- **Hiding the player:** `effect give @s minecraft:invisibility infinite 0 true` (no icon, no particles) and a team with `nametagVisibility never`. Armour and the held item still show: the game clears them (in-game check for anything else a seeker still sees, such as the shadow).
- **Being found:** an `interaction` entity (`width:1.0f,height:1.0f,response:1b`) kept on the hider caught a seeker's attack (`handleAttack`): the tick's `execute as @e[type=minecraft:interaction,tag=<catch>] if data entity @s attack` then `execute on attacker` named the seeker and the id named the hider; `data remove entity @s attack` re-arms it.
- **Cost for 8 hiders:** 0.25 to 0.4 ms median for the follow function per tick (two `as @e` scans per hider: keep displays and interactions in one small group, or use a per-hider tag, to cut it).
- **Lag and turning:** the display is one tick behind the player plus its interpolation, and does not turn with the player (a block need not). Not measured on a client (in-game check).

### K19 Cost of each game's tick, 16 players

Bar: 1.0 ms a tick for a whole game. Function time per tick (`b720 time 100`), median (least), 26.3 / 26.4; the empty function costs 0.003 to 0.004 ms:

| Game | Tick function | 26.3 | 26.4 | Whole tick, median (empty world with 16 players: 0.58 to 1.01 / 0.66 to 0.81) |
|---|---|---|---|---|
| Lifesteal | trigger enable, kills and deaths to hearts, most health by macro on change, the out clock | 0.017 (0.016) | 0.015 (0.014) | 0.86 / 0.53 |
| Manhunt | compass refresh every 20 ticks, the runner's death | 0.007 (0.005), mean 0.27 (the refresh spike, see K7) | 0.004 (0.004), mean 0.13 | 0.63 / 0.69 |
| Bed Wars-style | 4 bed tests, respawn waits, void kill, 12 generators on a shared clock, last team | 0.038 (0.031) | 0.035 (0.028) | 0.98 / 1.07 |
| Spleef | fall-out by predicate for 16, last one standing | 0.099 (0.049) | 0.063 (0.048) | 0.58 / 0.72 |

All four are 10 to 250 times under the bar. The whole-tick column moves with the machine's load more than with the game (the empty world measured 0.58 at the start and 1.01 at the end of the same 26.3 run). Things to keep out of every tick: reading a player's NBT (`data get entity @a ...`), predicates where a selector will do (K10), `@e` scans per player (K18).

### K20 Standing in two or more players in a GameTest

**Go: `ParityEars` (the parity mod's real `ServerPlayer` on an `EmbeddedChannel`) is enough for K1 and K3, with four additions this spike found necessary:**

1. **The end of loading.** On 26.x a new or respawned player is invulnerable until the client says it has loaded (`ServerGamePacketListenerImpl.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket())`, or the 60-tick timeout, which only runs in the listener's own tick). `SampleGameModesParityTest` waits 70 ticks; calling `handleAcceptPlayerLoad` after placing and after each respawn removes the wait.
2. **Teleports must be confirmed.** Every teleport (`tp`, a respawn, a change of dimension) waits for the client's confirmation; until `handleAcceptTeleportPacket(new ServerboundAcceptTeleportationPacket(id, x, y, z, yRot, xRot))` answers the `ClientboundPlayerPositionPacket`, using an item on a block is refused (the player is told "The height limit for building is 319") and after a change of dimension the player cannot be hurt at all. Answer it in the packet reader.
3. **Tick like a connection.** Run `player.connection.tick()` each tick (it does the player's `doTick`, the load timeout and the keep-alive) and answer `ClientboundKeepAlivePacket` with `handleKeepAlive(new ServerboundKeepAlivePacket(id))`, or the player is dropped after the keep-alive time.
4. **Leaving and coming back:** leave with `player.connection.onDisconnect(new DisconnectionDetails(...))` (counts `leave_game`, saves the player); come back with the same offline profile (`UUIDUtil.createOfflinePlayerUUID(name)`), `PlayerList.loadPlayerData(new NameAndId(profile))` and `player.load(TagValueInput.create(ProblemReporter.DISCARDING, registryAccess, tag))` before `placeNewPlayer`; without that the player comes back new (most health 20, survival, no tags).

Kills: `victim.hurtServer(level, level.damageSources().playerAttack(killer), 1000f)` gives the same scores, rewards and death message as a melee kill; `handleAttack(new ServerboundAttackPacket(id))` is the real swing (reach and attack strength apply). Respawn: `handleClientCommand(new ServerboundClientCommandPacket(Action.PERFORM_RESPAWN))`. A restart cannot happen inside a GameTest server; K6 and K15's restart answers came from this spike's dedicated server, and B736's parity tests should test restart-free behaviour only (state in storage and scores; a `/reload` is possible). A client GameTest adds nothing for K1 or K3 (one player only).

### K21 Rules: a player's death

**Go with this change.** The runtime's `entity.death` (`ScriptBridges.afterDeath`, from Fabric's `ServerLivingEntityEvents.AFTER_DEATH`) **fires for players** on both targets, after the death and in the same tick. Its `attacker` is `source.getEntity()`: the killer for a melee kill, none for `/kill`, and **none for a knock into the void** although vanilla credits the hitter (`getKillCredit()` returned the hitter in the same event; the kill score and the death message agree). The Rules compiler drops players today (`packages/plugins/rules/src/compile/script.ts`: `if (e.entity.isPlayer) return;` for `entity.hurt` and `entity.death`), so no Rules trigger fires on a player's death.

What a "player dies" trigger needs: (1) a trigger compiled to `entity.death` with `e.entity.isPlayer` and the player as subject; (2) a `killer` member on `EntityDeathEvent` from `LivingEntity.getKillCredit()` (Script API 1.8, runtime only, no Mixin); "the killer" in the trigger's actors reads it; (3) nothing else: the event already fires before respawn, so a step can set the game mode of the dead player (K11). Without the mod, a data pack does the same with the K3 advancements.

## Type, mechanic, form that worked, cost

Costs are function time per tick (or per use) on this loaded machine, both targets.

| Type | Mechanic | Form that worked | Cost |
|---|---|---|---|
| Lifesteal | `hearts` | `deathCount` and `playerKillCount` scores read in the tick; `attribute @s minecraft:max_health base set $(hp)` by macro (hp = hearts x 2, at least 2) | 0.015 to 0.017 ms a tick for 16 |
| Lifesteal | kill pairs | advancements `player_killed_entity` / `entity_killed_player` with the 26.x one-condition `entity` form; `execute on attacker` in the victim's reward | in the kill's tick, no polling |
| Lifesteal | Heart item | recipe result with `custom_name`, `item_model`, `custom_data`, `consumable`; `consume_item` advancement with a `custom_data` predicate, revoked by its reward | at use |
| Lifesteal | `/withdraw` | `trigger` objective, `enable @a` each tick, act and reset | in the tick figure |
| Lifesteal | at zero | `gamemode spectator`, out-until game time; the clock returns them | in the tick figure |
| Lifesteal | revive | `consume_item` on a custom beacon; least out-since score among online players; offline names through a player head into storage | at use |
| Manhunt | `tracker` | runner's `Pos` and `Dimension` read once into storage; one macro `item modify` with an inline `set_components` `lodestone_tracker` for all hunters | 0.55 to 0.9 ms once a second for 10 (the player NBT read); 0.004 to 0.007 ms other ticks |
| Manhunt | `head_start` | `movement_speed` and `jump_strength` modifiers `-1 add_multiplied_total`, blindness | about 1 ms once for 10 |
| Manhunt | `role_dies`, `advancement` | runner's `deathCount`; `player_killed_entity` on `minecraft:ender_dragon` | in the tick figure |
| Bed Wars-style | `team_base` | `#minecraft:beds[part=foot]` and `[part=head]` tests; `spawnpoint` at the bed; spectator wait by the clock; out when the bed is gone (the game's own decision) | in the 0.028 to 0.038 ms tick |
| Bed Wars-style | `generators` | marker per generator, shared clock, cap by the nearby stack's `Item.count` | 0.027 ms a tick for 12 (+0.1 to 0.3 ms for lying stacks) |
| Bed Wars-style | `shop` | villager with `NoAI`, `Invulnerable`, `Offers` NBT; or a multi-action dialog with `trigger` buttons and `clear ... 0` to count | at use |
| Bed Wars-style | `fall_out` (void) | `execute as @a[gamemode=!spectator,y=<bottom>,dy=<n>] run kill @s`; the hitter credited within the window | in the tick figure |
| Bed Wars-style | `last_standing` (teams) | count of teams with a living member | in the tick figure |
| Spleef | `floor` | adventure, `can_break` diamond shovel on snow, `block_drops false`; rebuild by `fill` (or `place template`) | rebuild 2 to 23 ms once a round |
| Spleef | `fall_out` | `@a[y=<bottom>,dy=<n>]` (or a `location_check` predicate at 6 times the cost) | 0.02 to 0.06 ms a tick for 16 |
| Spleef | `last_standing` | `#alive` from `if entity`, `#started` at least 2, practice ends when the one player is out | in the tick figure |
| All | lobby | countdown score; `sort=random` split joining the smaller team | split 0.5 to 1 ms once |
| All | late join | round number per player; spectator when it differs | in the tick figure |
| Hide and seek | disguise | block display teleported each tick (cannot ride), invisibility `infinite`, hidden name tag, interaction entity for hits | 0.25 to 0.4 ms a tick for 8 |

## Facts for B723

For `TargetFacts` (both targets the same unless marked):

- `scoreboard.criteria`: add `deathCount`, `totalKillCount`, `trigger`, `killedByTeam.<colour>`, `teamkill.<colour>` (measured with `red` and `blue`; the colour list is the team colours already in the facts); stat criteria measured: `minecraft.custom:minecraft.deaths`, `minecraft.custom:minecraft.player_kills`, `minecraft.custom:minecraft.time_since_death`, `minecraft.custom:minecraft.leave_game`. The `health` criterion is an integer rounded up and updates a tick later.
- `gameRules` already lists the 26.x names; the games use `block_drops`, `immediate_respawn`, `natural_health_regeneration`, `keep_inventory`, `show_death_messages`, `spawn_monsters`, `spawn_mobs`, `pvp`. The old camel-case names (`doTileDrops`, `doImmediateRespawn`) are refused by `gamerule`.
- `attributes`: `minecraft:max_health` base clamps to 1.0 to 1024.0 (0 and negatives are accepted and give 1.0); `movement_speed` and `jump_strength` with a `-1 add_multiplied_total` modifier read 0.
- **Advancement criteria on 26.x** (both): `entity`, `killing_entity` and the player condition take **one** loot condition (or a predicate id), not a list; an entity predicate is a map keyed by sub-predicate type: `{"minecraft:entity_type": "<id>"}`. A wrong form is a registry error that stops the server loading. `consume_item`'s item predicate: `{"items": "<id>", "predicates": {"minecraft:custom_data": "<snbt>"}}` (string or object).
- **Loot modifiers in loot tables:** `"modifier": [{"type": "minecraft:fill_player_head", "entity": "this"}]` (as B600 found for 26.3); inline item modifiers in `item modify` take `type`.
- **Entity data forms** for `summon`: block display `block_state:{id:"<block>"}` (not `Name`; or a string), `teleport_duration:<ticks>`; interaction `width`, `height`, `response`, and its `attack` record; villager `VillagerData:{profession,level,type}` and `Offers:{Recipes:[{buy,buyB,sell (with components),maxUses,rewardExp,xp}]}`.
- **Command forms** (each run and answered on both servers; add any the forms table lacks): `attribute <target> <attribute> base set <n>`, `attribute <target> <attribute> modifier add|remove <id> [<n> add_multiplied_total]`, `attribute <target> <attribute> get`; `scoreboard players enable <targets> <objective>`; `trigger <objective> [add|set <n>]` (as a player); `time query gametime`; `execute store result storage <id> <path> int <scale> run ...`; `function <id> with storage <id>`; `execute on attacker`; `execute if items entity <t> <slots> <item predicate>` with `container.*`, `weapon.mainhand`, `weapon.offhand`; `item modify entity <t> <slot> <inline modifier>`; `item replace entity|block ... with <item stack> [<count>]`; `clear <t> <item> 0` (count only); `dialog show <t> <inline dialog>`; `ride <target> mount|dismount`; `spawnpoint <t> <pos>`; `team empty <t>`; `@a[sort=random]`, `@a[y=..,dy=..]`, `@a[gamemode=!spectator]`, `@a[advancements={<id>=true}]`; `effect give <t> <effect> infinite <amp> true`; `loot replace block <pos> container.<n> loot <table>`; `fill ... hollow`, `fill ... replace <block>`; `place template <id> <pos>`.
- **Offline checker:** `@msm/schemas/mcfunction` passes all 261 game-logic lines of the spike on 26.3 once objectives and teams are declared, and all but one on 26.4 (`results/spyglass-forms.json`): on 26.4 it answers "Expected nothing" for `summon minecraft:block_display ~-0.5 ~ ~-0.5 {...,block_state:{id:"minecraft:oak_leaves"},teleport_duration:1}`, which the 26.4 server ran (the display was made and followed the hider): a checker gap for B723 to look at. On 26.3 it asked for `id` where the spike first wrote `Name` (the server agreed). Score holders (`#now`) no longer throw (B547's finding is fixed). Macro lines (`$...`) are not checked; B724 to B726 should check a macro line after substituting example values.

## Changes this asks of the plan

**Section 2** (the table):

- Lifesteal: "kept out by a clock score" is server running time (say "for 1 hour of play on the server"); the `/trigger withdraw` and revive rows are confirmed; the Heart item is a `consumable` item made by a recipe with components; add "a heart adds room, not health" to the Studio's help.
- Manhunt: "a tracking compass refreshed by a macro function" once a second, one macro call for all hunters; across dimensions it points to the runner's last position in the hunter's dimension (client drawing in-game check). Head start by attribute modifiers.
- Bed Wars-style: `team_base` needs the game to decide "no bed, out" (the `spawnpoint` point outlives the bed); `shop` is a villager with `Offers` NBT or a dialog; `trade_set` data alone cannot make a game's own shop.
- Spleef: the shovel must be fast enough to break at once (diamond or netherite, or Efficiency); `block_drops false`; fall-out by selector.
- Hide and seek: "Plays without mods" in a simpler form (a block that follows, an interaction entity to be found), the mod adds a true disguise; the mark changes on this evidence if the user agrees (question 1).
- A new limit line for every type: adventure mode does not stop thrown things (ender pearls, wind charges, potions).

**Section 3:**

- D2: the mechanic list stands; add a `kill_pair` helper (the K3 advancements) shared by `hearts` and kill scores, and say that `fall_out` lowers to a selector, not a predicate.
- D9: "kept out for a time" is game time; the Studio says "while the server runs".
- D10: B728's practice players and B736's parity tests use the K20 stand-ins (with the four additions).
- New: **forms from facts** (section 4's rule) needs B723 to carry the 26.x advancement condition form and the entity sub-predicate map; any lowering that writes an entity predicate must use them.
- New: Rules 4 (B729) adds the death trigger through `entity.death` with `isPlayer` and a `killer` from the kill credit (Script API 1.8).

**ADR 0132:**

- D5 gains: "Data pack forms are 26.x forms: advancement conditions are one loot condition; entity predicates are sub-predicate maps (B720 K3)."
- Consequences: "A 'kept out' time is server running time; a real timed ban needs the mod or Paper."
- Limits for the close of batch 1 (from K9, K11, K17, K18): movement freezes and immediate respawn are client behaviour (in-game checks); adventure mode does not stop thrown things; a lodestone compass across dimensions is client drawing; displays cannot ride players.
- The mark of Hide and seek follows K18 if the user agrees (the plan's question 1).

## Deviations from the brief

- **Not a GameTest.** The brief's method is "GameTests on a dedicated server". The spike ran a production Fabric dedicated server with a throwaway mod that stands in players from the console, because K2, K6 and K15 need leaving, joining and a restart of the same world, which a GameTest server cannot do; the stand-ins are the `ParityEars` technique with the K20 additions, so the answers carry over to B736's GameTests. The throwaway code was built in the scratchpad with `javac`, not under `engine-mod/src/gametest/`, so `engine-mod/` was never touched and no Gradle run was needed.
- **No client GameTest.** What a seeker, a held hunter or a hunter in another dimension sees, and immediate respawn, are client behaviour; they are listed as in-game checks instead.

## Files

- `spike-src/B720Spike.java`, `fabric.mod.json`, `build_mod.sh`: the stand-in players and the timing commands.
- `spike-src/srv.py`, `run_k.py`, `probe_k7.py`, `probe_useon.py`, `loadcheck.py`, `make_pack.py`, `nbtw.py` (B547's NBT writer), `summ.py`: the driver, the scenarios, the data pack.
- `spike-src/check_forms.ts`, `forms.test.ts`, `vitest.config.mjs`: the offline form check.
- `results/server-26.3.json`, `results/server-26.4.json`: every scenario; `results/server-*-K1-K7.json`: the kill credit and the one-call compass; `results/probe-k7-*.json`: the compass read variants; `results/spyglass-forms.json`.
