# B547 spike: writes the data pack `b547` (and, with --dev, the folder pack `b547dev` for Y15) for one version.
# Usage: python3 make_pack.py <26.3|26.4> <out dir> [--variant NAME]
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nbtw

version, out = sys.argv[1], sys.argv[2]
variant = sys.argv[sys.argv.index('--variant') + 1] if '--variant' in sys.argv else 'main'
DATA_VERSION = {'26.3': 5023, '26.4': 5127}[version]
FORMAT = {'26.3': (121, 0), '26.4': (126, 0)}[version]
NS = 'b547dev' if variant == 'dev' else 'b547'


def w(rel, obj):
    p = os.path.join(out, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if isinstance(obj, str):
        open(p, 'w').write(obj if obj.endswith('\n') else obj + '\n')
    else:
        json.dump(obj, open(p, 'w'), indent=2, sort_keys=True)


w('pack.mcmeta', {'pack': {'description': 'B547 spike ' + variant, 'min_format': list(FORMAT), 'max_format': list(FORMAT),
                           'pack_format': FORMAT[0]}})

U = lambda n: {'type': 'minecraft:uniform', 'min_inclusive': n, 'max_inclusive': n}
SPAWNS = {
    'spawns_by_category': {
        'creature': [{'type': f'minecraft:{m}', 'count': U(4), 'weight': wt} for m, wt in
                     (('sheep', 12), ('pig', 10), ('chicken', 10), ('cow', 8))],
        'monster': [{'type': f'minecraft:{m}', 'count': U(4), 'weight': wt} for m, wt in
                    (('zombie', 95), ('skeleton', 100), ('spider', 100), ('creeper', 100))],
    },
    'spawn_costs': {},
}


def biome(features):
    return {'has_precipitation': True, 'temperature': 0.8, 'downfall': 0.4, 'effects': {'water_color': 4159204},
            'attributes': {'minecraft:gameplay/natural_mob_spawns': SPAWNS}, 'carvers': [], 'features': features}


def flat(biome_id, features=False, overrides=None, dim_type='minecraft:overworld', layers=None):
    settings = {'biome': biome_id, 'features': features, 'lakes': False, 'layers': layers or []}
    if overrides is not None:
        settings['structure_overrides'] = overrides
    return {'type': dim_type, 'generator': {'type': 'minecraft:flat', 'settings': settings}}


if variant == 'dev':
    # Y15: a world preset only in a folder pack placed in the world's datapacks/ before the world is made.
    w(f'data/{NS}/worldgen/biome/sky.json', biome([]))
    w(f'data/{NS}/worldgen/world_preset/void.json', {'dimensions': {
        'minecraft:overworld': flat(f'{NS}:sky'),
        'minecraft:the_nether': flat('minecraft:nether_wastes', dim_type='minecraft:the_nether'),
        'minecraft:the_end': flat('minecraft:the_end', dim_type='minecraft:the_end')}})
    w('data/minecraft/tags/worldgen/world_preset/normal.json', {'values': [f'{NS}:void']})
    w(f'data/{NS}/function/hello.mcfunction', f'say [{NS}] dev pack function ran\n')
    w('data/minecraft/tags/function/load.json', {'values': [f'{NS}:hello']})
    sys.exit(0)

if variant == 'fixed_empty':
    # Y8: fixed_placement with an empty positions list (26.4's mcdoc says at least one).
    w('data/b547/worldgen/feature/emerald.json', {'type': 'minecraft:simple_block', 'to_place': {'type': 'minecraft:simple', 'state': 'minecraft:emerald_block'}})
    w('data/b547/worldgen/placed_feature/fixed_empty.json', {'feature': 'b547:emerald', 'placement': [{'type': 'minecraft:fixed_placement', 'positions': []}]})
    sys.exit(0)

if variant.startswith('origin_'):
    # Y1 decode checks of the dimension_origin placement: origin_bare (type only), origin_extra (with unknown fields).
    extra = {} if variant == 'origin_bare' else {'salt': 1, 'frequency': 0.5, 'locate_offset': [1, 2, 3], 'nonsense': True}
    w('data/b547/worldgen/structure_set/probe.json', {'structures': [{'structure': 'minecraft:igloo', 'weight': 1}],
                                                     'placement': dict({'type': 'minecraft:dimension_origin'}, **extra)})
    sys.exit(0)

# ---- main pack ----
w('data/b547/worldgen/biome/sky.json', biome([]))
w('data/b547/worldgen/biome/sky_fixed10.json', biome([[], [], [], [], [], [], [], [], [], [], ['b547:fixed_block']]))
w('data/b547/worldgen/biome/sky_fixed0.json', biome([['b547:fixed_block']]))
w('data/b547/worldgen/biome/sky_fixed.json', biome([[], [], [], [], [], [], [], [], [], ['b547:fixed_block']]))
w('data/b547/worldgen/feature/emerald.json', {'type': 'minecraft:simple_block', 'to_place': {'type': 'minecraft:simple', 'state': 'minecraft:emerald_block'}})
# Y8: three positions, two in chunk 0 0 (x 3 z 3 at y 70 and 71) and one in chunk 2 -2.
w('data/b547/worldgen/placed_feature/fixed_block.json', {'feature': 'b547:emerald', 'placement': [
    {'type': 'minecraft:fixed_placement', 'positions': [[3, 70, 3], [3, 71, 3], [40, 70, -20]]}]})

# Y1: a jigsaw structure of one piece, start height absolute 64, placed by dimension_origin.
w('data/b547/worldgen/template_pool/island.json', {'fallback': 'minecraft:empty', 'elements': [{'weight': 1, 'element': {
    'element_type': 'minecraft:single_pool_element', 'location': 'b547:island', 'processors': 'minecraft:empty', 'projection': 'rigid'}}]})
w('data/b547/worldgen/structure/island.json', {
    'type': 'minecraft:jigsaw', 'biomes': ['b547:sky', 'minecraft:plains', 'minecraft:the_void'], 'step': 'surface_structures',
    'spawn_overrides': {}, 'terrain_adaptation': 'none', 'start_pool': 'b547:island', 'size': 1,
    'start_height': {'absolute': 64}, 'max_distance_from_center': 80, 'use_expansion_hack': False})
w('data/b547/worldgen/structure_set/origin_island.json', {'structures': [{'structure': 'b547:island', 'weight': 1}],
                                                        'placement': {'type': 'minecraft:dimension_origin'}})

# World presets: void (origin island listed), void_plain (no structure sets: the first-join route places the island).
VOID_NETHER = flat('minecraft:nether_wastes', dim_type='minecraft:the_nether', overrides=[])
VOID_END = flat('minecraft:the_end', dim_type='minecraft:the_end', overrides=[])
w('data/b547/worldgen/world_preset/void.json', {'dimensions': {
    'minecraft:overworld': flat('b547:sky', overrides=['b547:origin_island']), 'minecraft:the_nether': VOID_NETHER,
    'minecraft:the_end': VOID_END}})
w('data/b547/worldgen/world_preset/void_plain.json', {'dimensions': {
    'minecraft:overworld': flat('b547:sky', overrides=[]), 'minecraft:the_nether': VOID_NETHER, 'minecraft:the_end': VOID_END}})
w('data/minecraft/tags/worldgen/world_preset/normal.json', {'values': ['b547:void', 'b547:void_plain']})

# Extra dimensions in one world (Y1, Y6, Y8).
w('data/b547/dimension/listed.json', flat('b547:sky', overrides=['b547:origin_island']))
w('data/b547/dimension/listed_feat.json', flat('b547:sky', features=True, overrides=['b547:origin_island']))
w('data/b547/dimension/unlisted.json', flat('b547:sky', overrides=[]))
w('data/b547/dimension/absent.json', flat('b547:sky'))
w('data/b547/dimension/tv.json', flat('minecraft:the_void', features=True, overrides=[]))
w('data/b547/dimension/tv_off.json', flat('minecraft:the_void', features=False, overrides=[]))
w('data/b547/dimension/skyfeat.json', flat('b547:sky', features=True, overrides=[]))
w('data/b547/dimension/fixed.json', flat('b547:sky_fixed', features=True, overrides=[]))
w('data/b547/dimension/fixed10.json', flat('b547:sky_fixed10', features=True, overrides=[]))
w('data/b547/dimension/fixed0.json', flat('b547:sky_fixed0', features=True, overrides=[]))
w('data/b547/dimension/fixed_layers.json', flat('b547:sky_fixed', features=True, overrides=[], layers=[{'block': 'minecraft:glass', 'height': 1}]))
w('data/b547/dimension/fixed_air.json', flat('b547:sky_fixed', features=True, overrides=[], layers=[{'block': 'minecraft:air', 'height': 1}]))
w('data/b547/dimension/fixed_noise.json', {'type': 'minecraft:overworld', 'generator': {
    'type': 'minecraft:noise', 'settings': 'minecraft:floating_islands',
    'biome_source': {'type': 'minecraft:fixed', 'biome': 'b547:sky_fixed'}}})
w('data/b547/dimension/noise_origin.json', {'type': 'minecraft:overworld', 'generator': {
    'type': 'minecraft:noise', 'settings': 'minecraft:floating_islands',
    'biome_source': {'type': 'minecraft:fixed', 'biome': 'b547:sky'}}})

# Structure templates (Y1, Y3, Y12). island: 5 x 3 x 5, stone floor, grass, a chest with items and one with a loot table,
# a gold block marker on top at (2, 2, 2).
blocks, nbt = {}, {}
for x in range(5):
    for z in range(5):
        blocks[(x, 0, z)] = ('minecraft:stone', {})
        blocks[(x, 1, z)] = ('minecraft:grass_block', {'snowy': 'false'})
blocks[(1, 1, 1)] = ('minecraft:chest', {'facing': 'north', 'type': 'single', 'waterlogged': 'false'})
nbt[(1, 1, 1)] = nbtw.C(id=('string', 'minecraft:chest'), Items=('list', 'compound', [
    nbtw.C(Slot=('byte', 0), id=('string', 'minecraft:lava_bucket'), count=('int', 1)),
    nbtw.C(Slot=('byte', 1), id=('string', 'minecraft:ice'), count=('int', 2))]))
blocks[(3, 1, 3)] = ('minecraft:chest', {'facing': 'north', 'type': 'single', 'waterlogged': 'false'})
nbt[(3, 1, 3)] = nbtw.C(id=('string', 'minecraft:chest'), LootTable=('string', 'minecraft:chests/simple_dungeon'))
blocks[(2, 2, 2)] = ('minecraft:gold_block', {})
os.makedirs(os.path.join(out, 'data/b547/structure'), exist_ok=True)
nbtw.write(os.path.join(out, 'data/b547/structure/island.nbt'), nbtw.template(DATA_VERSION, (5, 3, 5), blocks, nbt))
# The palette form check: Name/Properties at the current DataVersion, and at 1.21.4's (4189) so the game upgrades it.
nbtw.write(os.path.join(out, 'data/b547/structure/island_name.nbt'), nbtw.template(DATA_VERSION, (5, 3, 5), blocks, nbt, form='Name'))
nbtw.write(os.path.join(out, 'data/b547/structure/island_name_old.nbt'), nbtw.template(4189, (5, 3, 5), blocks, nbt, form='Name'))
# arena48: a stone shell 48 x 48 x 48 (air inside, written); big64: 64 x 4 x 64 stone floor with glowstone corners.
shell = {}
for x in range(48):
    for y in range(48):
        for z in range(48):
            if x in (0, 47) or y in (0, 47) or z in (0, 47):
                shell[(x, y, z)] = ('minecraft:stone', {})
nbtw.write(os.path.join(out, 'data/b547/structure/arena48.nbt'), nbtw.template(DATA_VERSION, (48, 48, 48), shell))
big = {(x, 0, z): ('minecraft:stone', {}) for x in range(64) for z in range(64)}
for c in ((0, 0), (63, 0), (0, 63), (63, 63)):
    big[(c[0], 1, c[1])] = ('minecraft:glowstone', {})
nbtw.write(os.path.join(out, 'data/b547/structure/big64.nbt'), nbtw.template(DATA_VERSION, (64, 4, 64), big))

# ---- functions ----
F = {}
F['load'] = '''say [b547] load
scoreboard objectives add b547.c dummy
scoreboard players add #loads b547.c 1
function b547:start/try'''
# Y3: the load route. Same tick after forceload add, and a tick later, at x 96..112 (far from the origin island).
F['start/try'] = 'execute unless data storage b547:games {placed:1b} run function b547:start/place_now'
F['start/place_now'] = '''say [b547] start: placing (flag not set)
scoreboard players add #placings b547.c 1
forceload add 96 96 127 127
execute store success score #now_ok b547.c run place template b547:island 100 64 100
execute if block 102 66 102 minecraft:gold_block run say [b547] start: same tick PLACED
execute unless block 102 66 102 minecraft:gold_block run say [b547] start: same tick MISSING
schedule function b547:start/place_later 1t
data modify storage b547:games placed set value 1b'''
F['start/place_later'] = '''execute store success score #later_ok b547.c run place template b547:island 110 64 110
execute if block 112 66 112 minecraft:gold_block run say [b547] start: one tick later PLACED
execute unless block 112 66 112 minecraft:gold_block run say [b547] start: one tick later MISSING
execute if block 102 66 102 minecraft:gold_block run say [b547] start: same tick block present a tick later'''
F['report'] = '''tellraw @a ["[b547] loads ",{"score":{"name":"#loads","objective":"b547.c"}}," placings ",{"score":{"name":"#placings","objective":"b547.c"}}," now_ok ",{"score":{"name":"#now_ok","objective":"b547.c"}}," later_ok ",{"score":{"name":"#later_ok","objective":"b547.c"}}]
say [b547] report done'''

# Y4: first join, once per player (the advancement holds the "once"), with a kit.
F['first_join'] = '''say [b547] first join reward for @s
scoreboard objectives add b547.joins dummy
scoreboard objectives add b547.spawn dummy
execute store result score #x b547.spawn run data get entity @s Pos[0] 100
execute store result score #y b547.spawn run data get entity @s Pos[1] 100
execute store result score #z b547.spawn run data get entity @s Pos[2] 100
execute store result score #t b547.spawn run time query gametime
scoreboard players add @s b547.joins 1
execute store result score @s b547.c run data get entity @s Pos[1]
give @s minecraft:bread 3
execute unless data storage b547:games {start:1b} run function b547:start/first'''
F['start/first'] = '''say [b547] first-join start: placing the island
scoreboard players add #first_places b547.c 1
forceload add -16 -16 15 15
execute store success score #first_ok b547.c run place template b547:island -2 64 -2
setworldspawn -2 66 -2
gamerule respawn_radius 0
data modify storage b547:games start set value 1b
tp @s -1.5 66 -1.5'''
F['bridge'] = 'b547_signal hello'
F['bridge_server'] = 'b547_signal from_server'
F['bridge/heard'] = '''scoreboard objectives add b547.heard dummy
scoreboard players add #heard b547.c 1
scoreboard players add @s b547.heard 1'''
w('data/b547/advancement/first_join.json', {'criteria': {'tick': {'trigger': 'minecraft:tick'}}, 'rewards': {'function': 'b547:first_join'}})

# Y9: one block at 200 64 200 (glass under it from 198 63 198 to 202 63 202 catches the drops).
F['ob/setup'] = '''forceload add 192 192 207 207
fill 197 63 197 203 63 203 minecraft:glass
fill 197 64 197 203 66 203 minecraft:air
setblock 200 64 200 minecraft:air
scoreboard objectives add b547.ob dummy
scoreboard players set #breaks b547.ob 0
scoreboard players set #chests b547.ob 0
scoreboard players set #mobs b547.ob 0
say [b547] ob setup'''
F['ob/tick'] = '''execute if score #break b547.c matches 1.. run setblock 200 64 200 minecraft:air destroy
execute if score #on b547.c matches 1.. if block 200 64 200 minecraft:air run function b547:ob/next
execute if score #clear b547.c matches 1.. run kill @e[type=minecraft:item,x=196,y=60,z=196,dx=8,dy=10,dz=8]
execute if score #clear b547.c matches 1.. run kill @e[type=minecraft:chicken,x=196,y=60,z=196,dx=8,dy=10,dz=8]'''
F['ob/next'] = '''scoreboard players add #breaks b547.ob 1
execute store result score #r b547.ob run random value 1..100
execute if score #r b547.ob matches 1..70 run setblock 200 64 200 minecraft:dirt
execute if score #r b547.ob matches 71..90 run setblock 200 64 200 minecraft:oak_log
execute if score #r b547.ob matches 91..95 run scoreboard players add #chests b547.ob 1
execute if score #r b547.ob matches 91..95 run setblock 200 64 200 minecraft:chest{LootTable:"minecraft:chests/simple_dungeon"}
execute if score #r b547.ob matches 96..100 run setblock 200 64 200 minecraft:stone
execute if score #r b547.ob matches 99..100 run scoreboard players add #mobs b547.ob 1
execute if score #r b547.ob matches 99..100 run summon minecraft:chicken 200 65.5 200'''
F['ob/report'] = '''execute store result score #items b547.ob if entity @e[type=minecraft:item,x=196,y=60,z=196,dx=8,dy=10,dz=8]
execute store result score #chick b547.ob if entity @e[type=minecraft:chicken,x=196,y=60,z=196,dx=8,dy=10,dz=8]
tellraw @a ["[b547] ob breaks ",{"score":{"name":"#breaks","objective":"b547.ob"}}," chests ",{"score":{"name":"#chests","objective":"b547.ob"}}," mobs ",{"score":{"name":"#mobs","objective":"b547.ob"}}," item entities ",{"score":{"name":"#items","objective":"b547.ob"}}," chickens ",{"score":{"name":"#chick","objective":"b547.ob"}}]'''

# Y11: 64 areas of 8 x 8 x 8 in a row at x 300 + 16 i, y 64, z 300; markers tagged b547.p.
areas_pred, areas_sel = [], []
for i in range(64):
    x0 = 300 + 16 * i
    w(f'data/b547/predicate/area/a{i}.json', {'type': 'minecraft:location_check', 'predicate': {'position': {
        'x': {'min': x0, 'max': x0 + 8}, 'y': {'min': 64, 'max': 72}, 'z': {'min': 300, 'max': 308}}}})
    areas_pred.append(f'''tag @e[type=minecraft:marker,tag=b547.p] remove b547.now
execute as @e[type=minecraft:marker,tag=b547.p] at @s if predicate b547:area/a{i} run tag @s add b547.now
execute as @e[type=minecraft:marker,tag=b547.p,tag=b547.now,tag=!b547.in{i}] run function b547:area/entered
execute as @e[type=minecraft:marker,tag=b547.p,tag=b547.now,tag=!b547.in{i}] run tag @s add b547.in{i}
execute as @e[type=minecraft:marker,tag=b547.p,tag=!b547.now,tag=b547.in{i}] run function b547:area/left
execute as @e[type=minecraft:marker,tag=b547.p,tag=!b547.now,tag=b547.in{i}] run tag @s remove b547.in{i}''')
    areas_sel.append(f'''tag @e[type=minecraft:marker,tag=b547.p] remove b547.now
tag @e[type=minecraft:marker,tag=b547.p,x={x0},y=64,z=300,dx=8,dy=8,dz=8] add b547.now
execute as @e[type=minecraft:marker,tag=b547.p,tag=b547.now,tag=!b547.in{i}] run function b547:area/entered
execute as @e[type=minecraft:marker,tag=b547.p,tag=b547.now,tag=!b547.in{i}] run tag @s add b547.in{i}
execute as @e[type=minecraft:marker,tag=b547.p,tag=!b547.now,tag=b547.in{i}] run function b547:area/left
execute as @e[type=minecraft:marker,tag=b547.p,tag=!b547.now,tag=b547.in{i}] run tag @s remove b547.in{i}''')
F['area/tick_pred'] = '\n'.join(areas_pred)
F['area/tick_sel'] = '\n'.join(areas_sel)
F['area/entered'] = 'scoreboard players add #entered b547.c 1'
F['area/left'] = 'scoreboard players add #left b547.c 1'
F['area/tick'] = '''execute if score #areas b547.c matches 1 run function b547:area/tick_pred
execute if score #areas b547.c matches 2 run function b547:area/tick_sel'''
F['area/setup'] = '''forceload add 288 288 1328 319
kill @e[type=minecraft:marker,tag=b547.p]
''' + '\n'.join(f'summon minecraft:marker {300 + 16 * (i % 64) + (i % 3)}.5 65 {302 + (i % 5)}.5 {{Tags:["b547.p"]}}' for i in range(20)) + '''
scoreboard players set #entered b547.c 0
scoreboard players set #left b547.c 0
say [b547] area setup'''
F['area/report'] = '''execute store result score #markers b547.c if entity @e[type=minecraft:marker,tag=b547.p]
tellraw @a ["[b547] areas markers ",{"score":{"name":"#markers","objective":"b547.c"}}," entered ",{"score":{"name":"#entered","objective":"b547.c"}}," left ",{"score":{"name":"#left","objective":"b547.c"}}]'''
# Boundary probes for location_check (box x 300..308) and the dx selector (x=300, dx=8).
F['area/bounds'] = '''forceload add 288 288 319 319
kill @e[type=minecraft:marker,tag=b547.b]
''' + '\n'.join(f'summon minecraft:marker {x} 65 304 {{Tags:["b547.b"],CustomName:"x{x}"}}' for x in (299.99, 300.0, 307.5, 307.99, 308.0, 308.01, 308.5, 308.99, 309.0)) + '''
execute as @e[type=minecraft:marker,tag=b547.b] at @s if predicate b547:area/a0 run say [b547] bounds pred at-s IN
execute as @e[type=minecraft:marker,tag=b547.b] if predicate b547:area/a0 run say [b547] bounds pred no-at IN
execute as @e[type=minecraft:marker,tag=b547.b,x=300,y=64,z=300,dx=8,dy=8,dz=8] run say [b547] bounds dx IN
say [b547] bounds done'''

# Y12: area reset.
F['reset/setup'] = '''forceload add 384 384 463 463
place template b547:arena48 400 64 400
summon minecraft:zombie 420 70 420 {NoAI:1b,PersistenceRequired:1b,Tags:["b547.z"]}
summon minecraft:zombie 425 70 425 {NoAI:1b,PersistenceRequired:1b,Tags:["b547.z"]}
summon minecraft:item 420 70 421 {Item:{id:"minecraft:stone",count:1},Tags:["b547.z"]}
setblock 420 69 420 minecraft:dirt
say [b547] reset setup'''
F['reset/clear'] = 'kill @e[type=!minecraft:player,x=400,y=64,z=400,dx=47,dy=47,dz=47]'
F['reset/place'] = 'place template b547:arena48 400 64 400'
F['reset/check'] = '''execute store result score #ents b547.c if entity @e[type=!minecraft:player,x=400,y=64,z=400,dx=47,dy=47,dz=47]
tellraw @a ["[b547] reset entities in box ",{"score":{"name":"#ents","objective":"b547.c"}}]
execute if block 420 69 420 minecraft:air run say [b547] reset inside block cleared
execute if block 400 64 400 minecraft:stone run say [b547] reset shell present'''

# Y16: loot tables with can_break and can_place_on.
w('data/b547/loot_table/can_break_pick.json', {'type': 'minecraft:chest', 'pools': [{'rolls': 1, 'entries': [{
    'type': 'minecraft:item', 'name': 'minecraft:diamond_pickaxe', 'modifier': [{'type': 'minecraft:set_components',
    'components': {'minecraft:can_break': {'blocks': 'minecraft:stone'}}}]}]}]})
w('data/b547/loot_table/can_place_list.json', {'type': 'minecraft:chest', 'pools': [{'rolls': 1, 'entries': [{
    'type': 'minecraft:item', 'name': 'minecraft:oak_planks', 'modifier': [{'type': 'minecraft:set_components',
    'components': {'minecraft:can_place_on': [{'blocks': 'minecraft:grass_block'}, {'blocks': '#minecraft:logs'}]}}]}]}]})

# Y10 and the rest: one command form per function file, so a parse error names its own file.
FORMS = {
    'team_add': 'team add b547_red "Red"',
    'team_add_component': 'team add b547_blue {text:"Blue",color:"blue"}',
    'team_add_dotted': 'team add b547.dotted',
    'team_color': 'team modify b547_red color red',
    'team_friendly': 'team modify b547_red friendlyFire false',
    'team_see_inv': 'team modify b547_red seeFriendlyInvisibles true',
    'team_nametag': 'team modify b547_red nametagVisibility hideForOtherTeams',
    'team_collision': 'team modify b547_red collisionRule pushOwnTeam',
    'team_prefix': 'team modify b547_red prefix {text:"[R] ",color:"red"}',
    'team_suffix': 'team modify b547_red suffix " *"',
    'team_display': 'team modify b547_red displayName {text:"Red team"}',
    'team_death_msg': 'team modify b547_red deathMessageVisibility never',
    'team_join': 'team join b547_red #b547_holder',
    'team_leave': 'team leave #b547_holder',
    'obj_add_dummy': 'scoreboard objectives add b547.score dummy {text:"Score",color:"gold"}',
    'obj_add_kills': 'scoreboard objectives add b547.kills playerKillCount "Kills"',
    'obj_add_stat': 'scoreboard objectives add b547.mined minecraft.mined:minecraft.stone',
    'obj_add_health': 'scoreboard objectives add b547.hp health',
    'obj_display': 'scoreboard objectives setdisplay sidebar b547.score',
    'obj_display_team': 'scoreboard objectives setdisplay sidebar.team.red b547.score',
    'obj_display_below': 'scoreboard objectives setdisplay below_name b547.hp',
    'obj_display_list': 'scoreboard objectives setdisplay list b547.kills',
    'obj_render': 'scoreboard objectives modify b547.hp rendertype hearts',
    'obj_numfmt_styled': 'scoreboard objectives modify b547.score numberformat styled {color:"yellow",bold:true}',
    'obj_numfmt_fixed': 'scoreboard objectives modify b547.kills numberformat fixed {text:"-"}',
    'obj_numfmt_blank': 'scoreboard objectives modify b547.mined numberformat blank',
    'obj_displayname': 'scoreboard objectives modify b547.score displayname {text:"Points"}',
    'obj_autoupdate': 'scoreboard objectives modify b547.score displayautoupdate true',
    'score_set': 'scoreboard players set #b547_holder b547.score 5',
    'score_add': 'scoreboard players add #b547_holder b547.score 2',
    'score_player_fmt': 'scoreboard players display numberformat #b547_holder b547.score fixed {text:"seven"}',
    'score_player_name': 'scoreboard players display name #b547_holder b547.score {text:"Holder"}',
    'bossbar_add': 'bossbar add b547:timer {text:"Time left"}',
    'bossbar_max': 'bossbar set b547:timer max 60',
    'bossbar_value': 'bossbar set b547:timer value 42',
    'bossbar_color': 'bossbar set b547:timer color red',
    'bossbar_style': 'bossbar set b547:timer style notched_10',
    'bossbar_players': 'bossbar set b547:timer players @a',
    'bossbar_visible': 'bossbar set b547:timer visible true',
    'bossbar_name': 'bossbar set b547:timer name {text:"Round",color:"gold"}',
    'bossbar_remove': 'bossbar remove b547:timer',
    'store_bossbar': 'execute store result bossbar b547:timer value run scoreboard players get #b547_holder b547.score',
    'actionbar': 'title @a actionbar {text:"10 s"}',
    'worldborder_set': 'worldborder set 2000',
    'worldborder_set_time': 'worldborder set 2100 5',
    'worldborder_set_seconds': 'worldborder set 2200 5s',
    'worldborder_center': 'worldborder center 0 0',
    'worldborder_warn': 'worldborder warning distance 5',
    'forceload_add': 'forceload add 0 0 31 31',
    'forceload_remove': 'forceload remove 0 0 31 31',
    'forceload_query': 'forceload query 0 0',
    'place_template': 'place template b547:island 600 64 600',
    'place_template_far': 'place template b547:island 5000 64 5000',
    'place_template_name_form': 'place template b547:island_name 680 64 600',
    'place_template_rot': 'place template b547:island 620 64 600 clockwise_90 front_back 1.0 7',
    'place_jigsaw': 'place jigsaw b547:island b547:empty 1 640 64 600',
    'place_structure': 'place structure b547:island 660 64 600',
    'random_value': 'random value 1..6',
    'random_roll': 'random roll 1..20',
    'random_seq': 'random value 1..100 b547:ob',
    'loot_spawn': 'loot spawn 600 80 600 loot b547:can_break_pick',
    'loot_give': 'loot give @a loot minecraft:chests/simple_dungeon',
    'loot_insert': 'loot insert 601 64 601 loot minecraft:chests/simple_dungeon',
    'setworldspawn': 'setworldspawn 0 66 0',
    'setworldspawn_angle': 'setworldspawn 0 66 0 90 0',
    'spawnpoint': 'spawnpoint @a 0 66 0',
    'gamerule_radius': 'gamerule respawn_radius 0',
    'gamerule_keep': 'gamerule keep_inventory true',
    'gamerule_traders': 'gamerule spawn_wandering_traders true',
    'gamerule_limit': 'gamerule max_block_modifications 32768',
    'difficulty': 'difficulty normal',
    'defaultgamemode': 'defaultgamemode survival',
    'gamemode': 'gamemode adventure @a',
    'storage_flag': 'data modify storage b547:games flag set value 1b',
    'storage_test': 'execute if data storage b547:games {flag:1b} run say [b547] form storage flag set',
    'setblock_chest_loot': 'setblock 600 70 600 minecraft:chest{LootTable:"minecraft:chests/simple_dungeon",LootTableSeed:7L}',
    'setblock_chest_items': 'setblock 602 70 600 minecraft:chest{Items:[{Slot:0b,id:"minecraft:lava_bucket",count:1}]}',
    'give_can_break': 'give @a minecraft:diamond_pickaxe[minecraft:can_break={blocks:"minecraft:stone"}]',
    'give_can_break_list': 'give @a minecraft:diamond_pickaxe[can_break=[{blocks:"#minecraft:logs"},{blocks:"minecraft:stone"}]]',
    'give_can_place': 'give @a minecraft:oak_planks[can_place_on={blocks:"minecraft:grass_block"}]',
    'give_can_break_old': 'give @a minecraft:diamond_pickaxe[can_break={predicates:[{blocks:"minecraft:stone"}]}]',
    'tellraw_score': 'tellraw @a ["Score ",{score:{name:"#b547_holder",objective:"b547.score"}}]',
    'schedule': 'schedule function b547:report 20t',
    'clone_big': 'clone 400 64 400 447 111 447 400 200 400',
    'dialog_show': 'dialog show @a minecraft:server_links',
    'trigger_like': 'scoreboard players enable @a b547.score',
}
for name, cmd in FORMS.items():
    F[f'forms/{name}'] = cmd
F['empty'] = ''
F['sb/save'] = '''forceload add 688 688 719 719
setblock 700 64 700 minecraft:structure_block{mode:"SAVE",name:"b547:saved",posX:1,posY:0,posZ:0,sizeX:3,sizeY:3,sizeZ:3,author:"spike"}
fill 701 64 700 703 66 702 minecraft:gold_block
setblock 699 64 700 minecraft:redstone_block
say [b547] sb powered'''
w('data/b547/worldgen/template_pool/empty.json', {'fallback': 'minecraft:empty', 'elements': []})

for name, body in F.items():
    w(f'data/b547/function/{name}.mcfunction', body)
w('data/minecraft/tags/function/load.json', {'values': ['b547:load']})
w('data/minecraft/tags/function/tick.json', {'values': ['b547:ob/tick', 'b547:area/tick']})
json.dump(sorted(FORMS), open(os.path.join(out, 'forms.json'), 'w'))
print('written', out, len(F), 'functions')
