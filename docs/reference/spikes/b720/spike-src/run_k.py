# B720 spike: runs K1 to K19 on one version's Fabric dedicated server with the spike mod and the `b720` pack.
# Usage: python3 run_k.py <26.3|26.4> [scenario ...]; writes results/server-<version>.json (raw console lines kept
# per scenario, noise dropped).
import json, os, re, sys, time
import srv

V = sys.argv[1]
ONLY = sys.argv[2:]
OUT = f'{srv.S}/results'
os.makedirs(OUT, exist_ok=True)
NOISE = re.compile(r"Saving chunks|Can't keep up|MARK\d+X|ThreadedAnvilChunkStorage|Saving the game|All dimensions are saved|Saved the game|logged in with entity id|^\s+at |StacklessClosedChannelException|Failed to deliver packet|B720SEE \w+ chat \w+ (joined|left) the game")
results = {'version': V, 'scenarios': {}}
s = None


def start(fresh=True):
    global s
    s = srv.Server(V, packs={'b720': f'{srv.S}/packs/{V}/b720'} if fresh else None, fresh=fresh)
    return s


def run(name, steps):
    """steps: commands; 'T<n>' runs n ticks; '#text' is a note kept in the record."""
    if ONLY and name.split('_')[0] not in ONLY:
        return
    i0 = len(s.lines)
    rec = []
    for st in steps:
        if st.startswith('#'):
            rec.append(st)
        elif re.fullmatch(r'T\d+', st):
            s.ticks(int(st[1:]))
            rec.append(st)
        else:
            s.cmd(st)
            rec.append('> ' + st)
    time.sleep(0.3)
    lines = [srv.strip(l) for l in s.lines[i0:] if not NOISE.search(l)]
    results['scenarios'][name] = {'steps': rec, 'console': lines}
    print(f'--- {name}: {len(lines)} lines', flush=True)


def save():
    name = f'server-{V}' + ('-' + '-'.join(ONLY) if ONLY else '')
    json.dump(results, open(f'{OUT}/{name}.json', 'w'), indent=1)


def players(names):
    return [f'b720 join {n}' for n in names]


start()
results['start_seconds'] = s.start_seconds
results['startup_errors'] = s.errors
base = ['gamerule spawn_monsters false', 'gamerule spawn_mobs false', 'kill @e[type=minecraft:slime]', 'gamerule show_death_messages true', 'difficulty normal', 'setblock 0 -50 0 minecraft:chest',
        'fill -10 -61 -10 110 -61 110 minecraft:grass_block replace minecraft:grass_block'] + players(['Ann', 'Bob', 'Cid']) + [
    'tp Ann 0 -60 0', 'tp Bob 2 -60 0', 'tp Cid 4 -60 0', 'T5']
run('setup', base)

run('K1_K3', [
    'team join red Ann', 'team join blue Bob', 'scoreboard players set #k1 b720.on 1', 'T3',
    '# Ann (red) kills Bob (blue) with a player attack', 'b720 hit Bob Ann 1000', 'T3',
    'b720 respawn Bob', 'T2',
    '# Ann kills a zombie (totalKillCount)', 'summon minecraft:zombie 6 -60 0 {Tags:["b720.z"],NoAI:1b}',
    'b720 hitentity b720.z Ann 1000', 'T2', 'execute as Ann run function b720:k1/dump',
    '# Ann kills Cid (no team)', 'b720 hit Cid Ann 1000', 'T2', 'b720 respawn Cid', 'T2',
    '# Cid dies by /kill (no killer)', 'kill Cid', 'T2', 'b720 respawn Cid', 'T2',
    '# Ann hits Bob once, then Bob dies in the void', 'b720 hit Bob Ann 1', 'T5', 'b720 void Bob', 'T2', 'b720 respawn Bob', 'T2',
    '# health criterion: hit Cid for 5 then read at once and after a tick', 'b720 hit Cid Ann 5',
    'execute as Cid run function b720:k1/dump', 'T1', 'execute as Cid run function b720:k1/dump',
    '# time_since_death over 20 ticks', 'execute as Ann run function b720:k1/dump', 'T20', 'execute as Ann run function b720:k1/dump',
    '# leave_game', 'b720 leave Cid', 'b720 join Cid', 'tp Cid 4 -60 0', 'T2', 'execute as Cid run function b720:k1/dump',
    'scoreboard players set #k1 b720.on 0', 'team leave Ann', 'team leave Bob', 'effect give @a minecraft:instant_health 1 10 true'])
save()

run('K2', [
    'b720 info Ann', 'scoreboard players set Ann b720.hearts 7', 'execute as Ann run function b720:k2/apply', 'b720 info Ann',
    'T1', 'b720 info Ann',
    'scoreboard players set Ann b720.hearts 15', 'execute as Ann run function b720:k2/apply', 'b720 info Ann',
    'attribute Ann minecraft:max_health base get',
    '# death and respawn', 'b720 hit Ann Bob 1000', 'b720 respawn Ann', 'b720 info Ann', 'attribute Ann minecraft:max_health base get',
    '# leave and join', 'b720 leave Ann', 'b720 join Ann', 'tp Ann 0 -60 0', 'b720 info Ann', 'attribute Ann minecraft:max_health base get',
    '# lowest and highest values', 'attribute Ann minecraft:max_health base set 0', 'b720 info Ann',
    'attribute Ann minecraft:max_health base set 0.5', 'b720 info Ann', 'attribute Ann minecraft:max_health base set 1', 'b720 info Ann',
    'attribute Ann minecraft:max_health base set -1', 'attribute Ann minecraft:max_health base set 1024', 'b720 info Ann',
    'attribute Ann minecraft:max_health base set 2000', 'b720 info Ann',
    '# a macro fed 0 hearts', 'scoreboard players set Ann b720.hearts 0', 'execute as Ann run function b720:k2/apply', 'b720 info Ann',
    'scoreboard players set Ann b720.hearts 10', 'execute as Ann run function b720:k2/apply', 'b720 info Ann',
    'effect give Ann minecraft:instant_health 1 10 true', 'T1', 'b720 info Ann'])
save()

HEART_GIVE = 'minecraft:red_dye[minecraft:custom_name={text:"Heart",color:"red",italic:false},minecraft:item_model="minecraft:heart_of_the_sea",minecraft:custom_data={b720_heart:1b},minecraft:consumable={consume_seconds:1.0f,animation:"eat",has_consume_particles:false},minecraft:max_stack_size=16]'
run('K4', [
    '# crafted by a crafter (no player)', 'setblock 10 -60 10 minecraft:crafter[orientation=up_north]',
    *[f'item replace block 10 -60 10 container.{i} with minecraft:{it}' for i, it in enumerate(
        ['diamond_block', 'netherite_scrap', 'diamond_block', 'netherite_scrap', 'totem_of_undying', 'netherite_scrap',
         'diamond_block', 'netherite_scrap', 'diamond_block'])],
    'setblock 11 -60 10 minecraft:redstone_block', 'T10',
    'execute positioned 10 -59 10 as @e[type=minecraft:item,distance=..4] run data get entity @s Item',
    'recipe give Ann b720:heart', 'recipe give Ann b720:revive',
    '# eaten', 'scoreboard players set Ann b720.hearts 10', f'item replace entity Ann weapon.mainhand with {HEART_GIVE} 2',
    'b720 use Ann', 'T25', 'b720 info Ann', 'scoreboard players get Ann b720.hearts',
    '# again (the advancement was revoked by its reward)', 'b720 use Ann', 'T25', 'scoreboard players get Ann b720.hearts',
    'data get entity Ann SelectedItem',
    '# a plain red dye does nothing', 'item replace entity Ann weapon.mainhand with minecraft:red_dye', 'b720 use Ann', 'T25',
    'scoreboard players get Ann b720.hearts',
    '# a name into storage (for offline players) through a player head', 'execute as Bob run function b720:k4/name_of',
    'function b720:k4/mark_offline with storage b720:k4', 'scoreboard players get Bob b720.on',
    '# the revive item brings back the player out longest', 'gamemode spectator Bob', 'tag Bob add b720.out', 'scoreboard players set Bob b720.until 900',
    'gamemode spectator Cid', 'tag Cid add b720.out', 'scoreboard players set Cid b720.until 500',
    'item replace entity Ann weapon.mainhand with minecraft:beacon[minecraft:custom_data={b720_revive:1b},minecraft:consumable={consume_seconds:1.0f}]',
    'b720 use Ann', 'T25', 'b720 info Cid', 'b720 info Bob', 'gamemode survival Bob', 'tag Bob remove b720.out',
    'scoreboard players set Ann b720.hearts 10', 'execute as Ann run function b720:k2/apply', 'execute as Cid run function b720:k2/apply'])
save()

run('K5', [
    'scoreboard players set Ann b720.hearts 5', 'execute as Ann run function b720:k2/apply', 'clear Ann',
    '# not enabled', 'b720 as Ann trigger b720.withdraw', 'T1',
    'scoreboard players set #k5 b720.on 1', 'T2',
    'b720 as Ann trigger b720.withdraw', 'T2', 'scoreboard players get Ann b720.hearts', 'b720 info Ann',
    'b720 as Ann trigger b720.withdraw set 3', 'T2', 'b720 as Ann trigger b720.withdraw add 2', 'T2',
    'scoreboard players get Ann b720.hearts',
    'scoreboard players set Ann b720.hearts 1', 'b720 as Ann trigger b720.withdraw', 'T2', 'scoreboard players get Ann b720.hearts',
    'execute store result score #n b720.t run clear Ann minecraft:red_dye[minecraft:custom_data~{b720_heart:1b}] 0',
    'scoreboard players get #n b720.t',
    '# a second trigger in the same tick before the tick function runs', 'b720 as Ann trigger b720.withdraw', 'b720 as Ann trigger b720.withdraw',
    'scoreboard players set #k5 b720.on 0', 'scoreboard players set @a b720.withdraw 0', 'scoreboard players set Ann b720.hearts 10', 'execute as Ann run function b720:k2/apply'])
save()

run('K6', [
    'scoreboard players set #k6 b720.on 1', 'time query gametime', 'execute as Bob run function b720:k6/out', 'b720 info Bob',
    'b720 leave Bob', 'T250', 'b720 join Bob', 'b720 info Bob', 'T2', 'b720 info Bob', 'scoreboard players set #k6 b720.on 0'])
save()

hunters8 = [f'H{i}' for i in range(1, 9)]
TRACK = 'minecraft:compass[minecraft:custom_data={b720_tracker:1b}]'
run('K7', [
    *players(hunters8), *[f'tp {h} {10 + i} -60 10' for i, h in enumerate(hunters8)], 'T2',
    'tag Ann add b720.runner', 'tag Bob add b720.hunter', 'tag Cid add b720.hunter', *[f'tag {h} add b720.hunter' for h in hunters8],
    'clear Bob', 'clear Cid', f'item replace entity @a[tag=b720.hunter] weapon.mainhand with {TRACK}',
    'tp Ann 30 -60 -20', 'function b720:k7/refresh_every_tick', 'data get entity Bob Inventory[0]',
    '# offhand', 'item replace entity Cid weapon.mainhand with minecraft:stone', f'item replace entity Cid weapon.offhand with {TRACK}',
    'function b720:k7/refresh_every_tick', 'data get entity Cid equipment.offhand',
    '# wildcard slot forms', 'item modify entity Cid container.* b720:track', 'item modify entity Cid hotbar.* b720:track',
    'item modify entity Cid container.0 b720:track', 'execute as Cid run function b720:k7/set_wild with storage b720:k7',
    'execute if items entity Bob container.* minecraft:compass[minecraft:custom_data~{b720_tracker:1b}]',
    'execute if items entity Bob container.* minecraft:compass[minecraft:lodestone_tracker]',
    '# runner in the Nether', 'execute in minecraft:the_nether run tp Ann 10 70 10', 'function b720:k7/refresh_every_tick',
    'data get entity Bob Inventory[0].components', 'execute in minecraft:overworld run tp Ann 30 -60 -20',
    '# cost: 10 hunters, one refresh', 'b720 time 50 function b720:k7/refresh_every_tick', 'T1', 'b720 time 50 function b720:k7/refresh_once', 'T1', 'b720 time 50 execute as @a[tag=b720.runner,limit=1] run function b720:k7/read', 'T1'])
save()

run('K8', [
    'summon minecraft:ender_dragon 0 -40 60 {Tags:["b720.dragon"],NoAI:1b}', 'T2', 'b720 hitentity b720.dragon Ann 1000', 'T5',
    'b720 hitentity b720.dragon Ann 1000', 'T5',
    'execute if entity @a[name=Ann,advancements={minecraft:end/kill_dragon=true}]', 'execute if entity @a[name=Ann,advancements={b720:k8/dragon=true}]',
    'T220', 'execute if entity @e[tag=b720.dragon]',
    '# the runner dies', 'scoreboard players set Ann b720.deaths 0', 'function b720:k8/runner_dead', 'b720 hit Ann Bob 1000', 'function b720:k8/runner_dead', 'b720 respawn Ann', 'tp Ann 0 -60 0',
    'scoreboard players set Ann b720.deaths 0'])
save()

run('K9', [
    'execute as Bob run function b720:k9/hold_attr', 'attribute Bob minecraft:movement_speed get', 'attribute Bob minecraft:jump_strength get',
    'execute as Bob run function b720:k9/free_attr', 'attribute Bob minecraft:movement_speed get', 'attribute Bob minecraft:jump_strength get',
    'execute as Bob run function b720:k9/hold_effects', 'attribute Bob minecraft:movement_speed get', 'effect clear Bob',
    'tp Bob 40 -60 40', 'execute as Bob run function b720:k9/hold_box', 'execute if block 41 -60 40 minecraft:barrier',
    'execute if block 40 -60 40 minecraft:air', 'execute if block 40 -61 40 minecraft:barrier', 'execute as Bob run function b720:k9/free_box',
    'execute if block 40 -61 40 minecraft:air', 'fill 39 -61 39 41 -61 41 minecraft:grass_block', 'tp Bob 2 -60 0',
    '# costs for the 10 hunters', 'b720 time 1 execute as @a[tag=b720.hunter] run function b720:k9/hold_attr', 'T1',
    'b720 time 1 execute as @a[tag=b720.hunter] run function b720:k9/free_attr', 'T1',
    'b720 time 1 execute as @a[tag=b720.hunter] run function b720:k9/hold_effects', 'T1', 'b720 time 1 effect clear @a[tag=b720.hunter]', 'T1',
    'b720 time 1 execute as @a[tag=b720.hunter] run function b720:k9/hold_box', 'T1',
    'b720 time 1 execute as @a[tag=b720.hunter] run function b720:k9/free_box', 'T1', 'b720 time 50 function b720:k9tp/tick', 'T1',
    'b720 perf start', 'T200', 'b720 perf stop k9_off',
    'scoreboard players set #k9tp b720.on 1', 'b720 perf start', 'T200', 'b720 perf stop k9_tp_each_tick', 'scoreboard players set #k9tp b720.on 0',
    *[f'tp {h} {10 + i} -60 10' for i, h in enumerate(hunters8)], 'tp Bob 2 -60 0', 'tp Cid 4 -60 0'])
save()

run('K10', [
    *[x for _ in range(4) for x in ('fill 64 -40 0 95 -40 31 minecraft:air', 'T1', 'b720 time 1 function b720:k10/rebuild_fill', 'T1',
                                    'fill 64 -40 0 95 -40 31 minecraft:air', 'T1', 'b720 time 1 function b720:k10/rebuild_template', 'T1')],
    'fill 64 -40 0 95 -40 31 minecraft:snow_block replace minecraft:air',
    '# half the floor broken (a real round end)', 'fill 64 -40 0 95 -40 15 minecraft:air', 'T1', 'b720 time 1 function b720:k10/rebuild_fill', 'T1',
    'fill 64 -40 0 95 -40 15 minecraft:air', 'T1', 'b720 time 1 function b720:k10/rebuild_template', 'T1',
    'b720 time 20 execute as @a at @s if predicate b720:below_floor run scoreboard players add #x b720.t 1', 'b720 time 20 execute as @a[y=-64,dy=22] run scoreboard players add #x b720.t 1', 'T1',
    'gamerule block_drops false', 'gamerule doTileDrops false',
    'tp Ann 70 -39 5', 'gamemode adventure Ann',
    'item replace entity Ann weapon.mainhand with minecraft:diamond_shovel[minecraft:can_break={blocks:"minecraft:snow_block"}]',
    'b720 break Ann 70 -40 6', 'T2', 'execute positioned 70 -40 6 if entity @e[type=minecraft:item,distance=..3]',
    'b720 break Ann 70 -40 4', 'b720 break Ann 71 -40 5',
    '# no can_break', 'item replace entity Ann weapon.mainhand with minecraft:diamond_shovel', 'b720 break Ann 69 -40 5',
    '# a wooden shovel with can_break (not instant)', 'item replace entity Ann weapon.mainhand with minecraft:wooden_shovel[minecraft:can_break={blocks:"minecraft:snow_block"}]',
    'b720 break Ann 69 -40 6',
    '# a snowball breaks nothing in adventure; drops on', 'gamerule block_drops true',
    'item replace entity Ann weapon.mainhand with minecraft:diamond_shovel[minecraft:can_break={blocks:"minecraft:snow_block"}]',
    'b720 break Ann 72 -40 6', 'T2', 'execute positioned 72 -40 6 if entity @e[type=minecraft:item,distance=..3]', 'gamerule block_drops false',
    '# falls', 'tag Ann add b720.spleef', 'scoreboard players set #k10 b720.on 1', 'tp Ann 70 -41 5', 'T2', 'b720 info Ann', 'gamemode adventure Ann',
    'tp Ann 70 -42.5 5', 'T2', 'b720 info Ann', 'scoreboard players set #k10 b720.on 0', 'gamemode adventure Ann', 'tp Ann 70 -50 5',
    'execute as Ann run function b720:k10/tick_selector', 'tag Ann remove b720.spleef', 'gamemode survival Ann', 'tp Ann 0 -60 0', 'clear Ann'])
save()

run('K11', [
    'setblock 20 -60 40 minecraft:red_bed[facing=north,part=foot]', 'setblock 20 -60 39 minecraft:red_bed[facing=north,part=head]',
    'function b720:k11/bed_check', 'gamerule immediate_respawn true', 'gamerule doImmediateRespawn true', 'gamerule immediate_respawn false',
    '# spawn point at the bed', 'spawnpoint Bob 20 -60 40', 'b720 hit Bob Ann 1000', 'b720 respawn Bob', 'b720 info Bob',
    '# spawn point beside it (not a bed)', 'spawnpoint Bob 22 -60 44', 'b720 hit Bob Ann 1000', 'b720 respawn Bob', 'b720 info Bob',
    '# the bed broken (one half)', 'spawnpoint Bob 20 -60 40', 'setblock 20 -60 39 minecraft:air destroy', 'function b720:k11/bed_check',
    'b720 hit Bob Ann 1000', 'b720 respawn Bob', 'b720 info Bob',
    '# the respawn wait and elimination', 'setblock 20 -60 40 minecraft:red_bed[facing=north,part=foot]',
    'setblock 20 -60 39 minecraft:red_bed[facing=north,part=head]', 'scoreboard players set #red_bed b720.t 1', 'team join red Bob',
    'scoreboard players set Bob b720.deaths 0', 'scoreboard players set #k11 b720.on 1',
    'b720 hit Bob Ann 1000', 'T2', 'b720 info Bob', 'b720 respawn Bob', 'b720 info Bob', 'T50', 'b720 info Bob', 'T60', 'b720 info Bob',
    'setblock 20 -60 39 minecraft:air destroy', 'T2', 'b720 hit Bob Ann 1000', 'T2', 'b720 respawn Bob', 'b720 info Bob',
    'scoreboard players set #k11 b720.on 0', 'team leave Bob', 'gamemode survival Bob', 'tag Bob remove b720.eliminated',
    '# a death in the void after a hit', 'scoreboard players get Ann b720.kills', 'b720 hit Bob Ann 1', 'T10', 'b720 void Bob',
    'scoreboard players get Ann b720.kills', 'b720 respawn Bob',
    '# the void after 400 ticks', 'b720 hit Bob Ann 1', 'T400', 'b720 void Bob', 'scoreboard players get Ann b720.kills', 'b720 respawn Bob',
    'tp Bob 2 -60 0', 'spawnpoint Bob 2 -60 0'])
save()

gens = [f'summon minecraft:marker {5 * i} -60 100 {{Tags:["b720.gen"]}}' for i in range(12)]
run('K12', [*gens, 'T2', 'b720 perf start', 'T400', 'b720 perf stop k12_off',
            'scoreboard players set #k12 b720.on 1', 'b720 perf start', 'T400', 'b720 perf stop k12_timer_each',
            'execute store result score #items b720.t if entity @e[type=minecraft:item,y=-62,dy=4,z=99,dz=3]', 'scoreboard players get #items b720.t',
            'execute positioned 0 -60 100 as @e[type=minecraft:item,distance=..1.5] run data get entity @s Item.count',
            'scoreboard players set #k12 b720.on 0', 'kill @e[type=minecraft:item]', 'b720 time 50 function b720:k12/tick', 'kill @e[type=minecraft:item]', 'T1',
            'scoreboard players set #k12g b720.on 1', 'b720 perf start', 'T400', 'b720 perf stop k12_shared_clock',
            'execute positioned 25 -60 100 as @e[type=minecraft:item,distance=..1.5] run data get entity @s Item.count',
            'scoreboard players set #k12g b720.on 0', 'kill @e[type=minecraft:item]'])
save()

run('K13', [
    'function b720:k13/summon', 'T2', 'data get entity @e[tag=b720.shop,limit=1] Offers.Recipes[0]',
    'b720 hitentity b720.shop Ann 5', 'tp Ann 29 -60 60', 'b720 attack Ann b720.shop', 'T2',
    'data get entity @e[tag=b720.shop,limit=1] Health', 'b720 interact Ann b720.shop', 'T2',
    'b720 hitentity b720.shop Ann 1000', 'execute if entity @e[tag=b720.shop]',
    '# a summoned armorer without offers (trade_set data)', 'function b720:k13/summon_plain', 'T2',
    'data get entity @e[tag=b720.plain,limit=1] Offers', 'tp Ann 33 -60 60', 'b720 interact Ann b720.plain', 'T2',
    'data get entity @e[tag=b720.plain,limit=1] Offers.Recipes[0]',
    '# the dialog route', 'execute as Ann run function b720:k13/dialog', 'T1', 'scoreboard players set #k13 b720.on 1', 'T1',
    'clear Ann', 'give Ann minecraft:iron_ingot 5', 'b720 as Ann trigger b720.shop set 1', 'T2',
    'execute if items entity Ann container.* minecraft:iron_sword', 'b720 as Ann trigger b720.shop set 1', 'T2',
    'scoreboard players set #k13 b720.on 0', 'clear Ann', 'tp Ann 0 -60 0'])
save()

run('K14', [
    'tag Ann add b720.ready', 'tag Bob add b720.ready', 'tag Cid add b720.ready', 'function b720:k14/start', 'scoreboard players set #k14 b720.on 1', 'T2', 'gamemode spectator Bob', 'T2', 'gamemode spectator Cid',
    'T2', 'gamemode survival Bob', 'gamemode survival Cid', 'scoreboard players set #k14 b720.on 0', 'tag @a remove b720.in',
    '# practice with one player', 'tag Ann add b720.in', 'scoreboard players set #started b720.t 1', 'scoreboard players set #k14 b720.on 1',
    'T2', 'gamemode spectator Ann', 'T2', 'gamemode survival Ann', 'scoreboard players set #k14 b720.on 0', 'tag @a remove b720.in',
    '# teams', 'team join red Ann', 'team join blue Bob', 'team join blue Cid', 'function b720:k14/start', 'scoreboard players set #k14 b720.on 1',
    'gamemode spectator Ann', 'T2', 'scoreboard players get #teams b720.t', 'gamemode survival Ann', 'scoreboard players set #k14 b720.on 0',
    'tag @a remove b720.in', 'tag @a remove b720.ready', 'team leave @a'])
save()

run('K15', [
    'function b720:k15/begin', 'scoreboard players set #k15 b720.on 1', 'T2', 'b720 join Dan', 'tp Dan 6 -60 0', 'T2', 'b720 info Dan',
    'b720 leave Bob', 'b720 join Bob', 'T2', 'b720 info Bob',
    'reload', 'T5', 'data get storage b720:round', 'scoreboard players get #loads b720.t', 'scoreboard players get #round b720.round',
    'scoreboard players set #k15 b720.on 0', 'gamemode survival Dan'])
save()

p12 = [f'P{i}' for i in range(1, 6)]
run('K16', [*players(p12), *[f'tp {p} {20 + i} -60 20' for i, p in enumerate(p12)], 'T2',
            'execute store result score #all b720.t if entity @a', 'scoreboard players get #all b720.t',
            'tag @a add b720.lobby', 'scoreboard players set #k16 b720.on 1', 'T50', 'scoreboard players get #count b720.t', 'T60',
            'execute store result score #r b720.t if entity @a[team=red]', 'execute store result score #b b720.t if entity @a[team=blue]',
            'scoreboard players get #r b720.t', 'scoreboard players get #b b720.t', 'scoreboard players set #k16 b720.on 0',
            'b720 time 20 function b720:k16/split', 'T1', 'team leave @a', 'tag @a remove b720.lobby'])
save()

# (item, how, the check that it worked: a block test or an entity type)
K17_ITEMS = [('water_bucket', 'useon', 'block 51 -60 51 minecraft:water'), ('lava_bucket', 'useon', 'block 51 -60 51 minecraft:lava'),
             ('flint_and_steel', 'useon', 'block 51 -60 51 minecraft:fire'), ('tnt', 'useon', 'block 51 -60 51 minecraft:tnt'),
             ('oak_boat', 'useon', 'entity @e[type=minecraft:oak_boat]'), ('armor_stand', 'useon', 'entity @e[type=minecraft:armor_stand]'),
             ('end_crystal', 'useon_obsidian', 'entity @e[type=minecraft:end_crystal]'), ('bone_meal', 'useon', 'block 51 -60 51 minecraft:air'),
             ('pig_spawn_egg', 'useon', 'entity @e[type=minecraft:pig]'), ('item_frame', 'useon_side', 'entity @e[type=minecraft:item_frame]'),
             ('painting', 'useon_side', 'entity @e[type=minecraft:painting]'), ('minecart', 'useon_rail', 'entity @e[type=minecraft:minecart]'),
             ('fire_charge', 'useon', 'block 51 -60 51 minecraft:fire'), ('ender_pearl', 'use', 'entity @e[type=minecraft:ender_pearl]'),
             ('snowball', 'use', 'entity @e[type=minecraft:snowball]'), ('egg', 'use', 'entity @e[type=minecraft:egg]'),
             ('splash_potion[minecraft:potion_contents={potion:"minecraft:harming"}]', 'use', 'entity @e[type=minecraft:splash_potion]'),
             ('wind_charge', 'use', 'entity @e[type=minecraft:wind_charge]'), ('bucket', 'useon_water', 'block 50 -61 53 minecraft:water'),
             ('oak_planks', 'useon', 'block 51 -60 51 minecraft:oak_planks'),
             ('oak_planks[minecraft:can_place_on={blocks:"minecraft:grass_block"}]', 'useon', 'block 51 -60 51 minecraft:oak_planks')]
k17 = ['gamemode adventure Ann', 'tp Ann 50 -60 50', 'setblock 52 -61 52 minecraft:obsidian', 'setblock 53 -60 50 minecraft:rail',
       'setblock 50 -61 53 minecraft:water', 'setblock 55 -60 55 minecraft:stone']
for item, how, check in K17_ITEMS:
    k17 += [f'# {item} (works when: {check})', f'item replace entity Ann weapon.mainhand with minecraft:{item}']
    k17 += [{'useon': 'b720 useon Ann 51 -61 51', 'useon_obsidian': 'b720 useon Ann 52 -61 52', 'useon_rail': 'b720 useon Ann 53 -60 50',
             'useon_side': 'b720 useon Ann 55 -60 55', 'useon_water': 'b720 useon Ann 50 -61 53', 'use': 'b720 use Ann'}[how]]
    k17 += ['T2', f'execute positioned 50 -60 50 if {check.replace("]", ",distance=..12]") if check.startswith("entity") else check}',
            'fill 49 -60 49 52 -59 52 minecraft:air', 'setblock 51 -61 51 minecraft:grass_block', 'setblock 50 -61 53 minecraft:water',
            'kill @e[type=!minecraft:player,x=40,y=-64,z=40,dx=24,dy=30,dz=24]', 'clear Ann']
k17 += ['# TNT already in the map, lit by flint and steel', 'setblock 51 -60 51 minecraft:tnt', 'item replace entity Ann weapon.mainhand with minecraft:flint_and_steel',
        'b720 useon Ann 51 -60 51', 'T2', 'execute if block 51 -60 51 minecraft:tnt', 'execute if entity @e[type=minecraft:tnt]', 'kill @e[type=minecraft:tnt]',
        'setblock 51 -60 51 minecraft:air',
        '# a lever, a door, a chest (use, empty hand)', 'clear Ann', 'setblock 51 -60 51 minecraft:lever[face=floor]', 'b720 useon Ann 51 -60 51', 'execute if block 51 -60 51 minecraft:lever[powered=true]',
        'setblock 51 -60 51 minecraft:chest', 'b720 useon Ann 51 -60 51', 'b720 menu Ann', 'setblock 51 -60 51 minecraft:oak_door', 'b720 useon Ann 51 -60 51', 'execute if block 51 -60 51 minecraft:oak_door[open=true]', 'setblock 51 -59 51 minecraft:air', 'setblock 51 -60 51 minecraft:stone_button[face=floor]', 'b720 useon Ann 51 -60 51', 'execute if block 51 -60 51 minecraft:stone_button[powered=true]', 'setblock 51 -60 51 minecraft:air',
        '# hitting entities placed by the map', 'summon minecraft:item_frame 55 -60 54 {Facing:2b,Tags:["b720.frame"]}', 'summon minecraft:armor_stand 47 -60 50 {Tags:["b720.stand"]}',
        'summon minecraft:painting 55 -59 56 {Facing:3b,variant:"minecraft:kebab",Tags:["b720.paint"]}', 'T2',
        'b720 attack Ann b720.frame', 'T2', 'execute if entity @e[tag=b720.frame]', 'b720 attack Ann b720.stand', 'b720 attack Ann b720.stand', 'T2',
        'execute if entity @e[tag=b720.stand]', 'b720 attack Ann b720.paint', 'T2', 'execute if entity @e[tag=b720.paint]',
        'summon minecraft:item_frame 55 -60 54 {Facing:2b,Tags:["b720.frame2"],Item:{id:"minecraft:diamond",count:1}}', 'T1', 'b720 interact Ann b720.frame2',
        'data get entity @e[tag=b720.frame2,limit=1] ItemRotation', 'b720 attack Ann b720.frame2', 'data get entity @e[tag=b720.frame2,limit=1] Item',
        'kill @e[type=!minecraft:player,x=40,y=-64,z=40,dx=24,dy=30,dz=24]', 'fill 45 -60 45 58 -55 58 minecraft:air', 'gamemode survival Ann', 'tp Ann 0 -60 0', 'clear Ann']
run('K17', k17)
save()

run('K18', [
    'tp Ann 60 -60 0', 'tp Bob 63 -60 0', 'execute as Ann run function b720:k18/disguise', 'T2',
    'ride @e[type=minecraft:block_display,tag=b720.disguise,limit=1] mount Ann', 'ride Ann mount @e[type=minecraft:block_display,tag=b720.disguise,limit=1]',
    'ride @e[type=minecraft:block_display,tag=b720.disguise,limit=1] dismount', 'ride Ann dismount',
    'scoreboard players set #k18 b720.on 1', 'tp Ann 60.3 -60 0.7', 'T1', 'data get entity @e[type=minecraft:block_display,limit=1] Pos',
    'data get entity @e[type=minecraft:interaction,limit=1] Pos', 'b720 attack Bob b720.catch', 'function b720:k18/hits',
    'attribute Ann minecraft:scale get', 'b720 info Ann', 'data get entity Ann active_effects',
    '# eight hiders: cost', *[f'execute as {h} run function b720:k18/disguise' for h in hunters8[:7]], 'T2',
    'b720 time 50 function b720:k18/tick', 'T1', 'b720 perf start', 'T200', 'b720 perf stop k18_8_hiders', 'scoreboard players set #k18 b720.on 0', 'b720 perf start', 'T200', 'b720 perf stop k18_off',
    'team leave @a', 'effect clear @a', 'kill @e[type=minecraft:block_display]', 'kill @e[type=minecraft:interaction]', 'tp Ann 0 -60 0', 'tp Bob 2 -60 0'])
save()

# K19: sixteen players; each game's tick against the same world with every game switched off.
all16 = ['Ann', 'Bob', 'Cid', 'Dan'] + hunters8 + [f'P{i}' for i in range(1, 5)]
k19 = ['b720 leave P5', 'execute store result score #all b720.t if entity @a', 'scoreboard players get #all b720.t',
       'tag @a remove b720.hunter', 'tag @a remove b720.runner', 'clear @a', 'gamemode survival @a',
       *[f'tp {p} {(i % 4) * 4} -60 {(i // 4) * 4 + 120}' for i, p in enumerate(all16)], 'T20',
       'b720 perf start', 'T400', 'b720 perf stop baseline_16', 'b720 time 100 function b720:noop', 'T1']
# Lifesteal: everyone at 10 hearts, a kill now and then.
k19 += ['scoreboard players set @a b720.hearts 10', 'scoreboard players set @a b720.ls_d 0', 'scoreboard players set @a b720.ls_k 0',
        'b720 time 100 function b720:g_lifesteal/tick', 'T1', 'scoreboard players set #g_lifesteal b720.on 1', 'b720 perf start', 'T400', 'b720 perf stop lifesteal_16',
        'b720 hit P1 Ann 1000', 'T2', 'scoreboard players get Ann b720.hearts', 'scoreboard players get P1 b720.hearts', 'b720 respawn P1', 'b720 info Ann',
        'scoreboard players set #g_lifesteal b720.on 0']
# Manhunt: one runner, fifteen hunters with compasses.
k19 += ['tag Ann add b720.runner', 'tag @a[tag=!b720.runner] add b720.hunter', f'item replace entity @a[tag=b720.hunter] weapon.mainhand with {TRACK}',
        'b720 time 100 function b720:g_manhunt/tick', 'T1', 'scoreboard players set #g_manhunt b720.on 1', 'b720 perf start', 'T400', 'b720 perf stop manhunt_16',
        'scoreboard players set #g_manhunt b720.on 0', 'tag @a remove b720.hunter', 'tag @a remove b720.runner', 'clear @a']
# Bed Wars-style: four teams of four, four beds, twelve generators (already summoned in K12).
k19 += [*[f'setblock {x} -60 {z} minecraft:red_bed[facing=north,part=foot]' for x, z in ((20, 40), (60, 40), (20, 80), (60, 80))],
        *[f'setblock {x} -60 {z - 1} minecraft:red_bed[facing=north,part=head]' for x, z in ((20, 40), (60, 40), (20, 80), (60, 80))],
        *[f'team join {["red", "blue", "green", "yellow"][i % 4]} {p}' for i, p in enumerate(all16)],
        'scoreboard players set #red_bed b720.t 1', 'scoreboard players set @a b720.deaths 0', 'tag @a add b720.ready', 'function b720:k14/start',
        'b720 time 100 function b720:g_bedwars/tick', 'T1', 'scoreboard players set #g_bedwars b720.on 1', 'b720 perf start', 'T400', 'b720 perf stop bedwars_16',
        'scoreboard players set #g_bedwars b720.on 0', 'kill @e[type=minecraft:item]', 'team leave @a', 'tag @a remove b720.in']
# Spleef: everyone on the floor in adventure.
k19 += ['function b720:k10/rebuild_fill', *[f'tp {p} {66 + (i % 4) * 7} -39 {2 + (i // 4) * 7}' for i, p in enumerate(all16)],
        'gamemode adventure @a', 'tag @a add b720.spleef', 'tag @a add b720.ready', 'function b720:k14/start',
        'b720 time 100 function b720:g_spleef/tick', 'T1', 'scoreboard players set #g_spleef b720.on 1', 'b720 perf start', 'T400', 'b720 perf stop spleef_16',
        'scoreboard players set #g_spleef b720.on 0', 'gamemode survival @a', 'tag @a remove b720.spleef', 'tag @a remove b720.in',
        'b720 perf start', 'T400', 'b720 perf stop baseline_16_again']
run('K19', k19)
save()

# K6 and K15 across a restart: Cid out and offline when the server stops.
if not ONLY or 'K6R' in ONLY:
    i0 = len(s.lines)
    for c in ['scoreboard players set #k6 b720.on 1', 'scoreboard players set #k15 b720.on 1', 'execute as Cid run function b720:k6/out',
              'b720 leave Cid', 'time query gametime', 'data modify storage b720:round restart set value "before"']:
        s.cmd(c)
    first = [srv.strip(l) for l in s.lines[i0:] if not NOISE.search(l)]
    s.stop()
    start(fresh=False)
    i0 = len(s.lines)
    for c in ['time query gametime', 'data get storage b720:round', 'scoreboard players get #loads b720.t', 'scoreboard players get Cid b720.until',
              'scoreboard players get #k6 b720.on', 'b720 join Cid', 'b720 info Cid']:
        s.cmd(c)
    s.ticks(220)
    for c in ['b720 info Cid', 'time query gametime']:
        s.cmd(c)
    results['scenarios']['K6R_K15R'] = {'before': first, 'console': [srv.strip(l) for l in s.lines[i0:] if not NOISE.search(l)],
                                        'start': [srv.strip(l) for l in s.startup if 'B720' in l or 'ERROR' in l]}
    save()
s.stop()
save()
print('done', V)
