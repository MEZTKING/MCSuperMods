# B720 spike: writes the throwaway data pack `b720` for one version. Game logic is vanilla commands only; lines that
# start with `b720 ` are the spike mod's own instrumentation (a log line with the game time) and are left out of the
# offline form check. Usage: python3 make_pack.py <26.3|26.4> <out dir>
import json, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nbtw

version, out = sys.argv[1], sys.argv[2]
DATA_VERSION = {'26.3': 5023, '26.4': 5127}[version]
FORMAT = {'26.3': (121, 0), '26.4': (126, 0)}[version]
shutil.rmtree(out, ignore_errors=True)


def w(rel, obj):
    p = os.path.join(out, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if isinstance(obj, str):
        open(p, 'w').write(obj.strip('\n') + '\n')
    else:
        json.dump(obj, open(p, 'w'), indent=2, sort_keys=True)


def fn(path, body):
    w(f'data/b720/function/{path}.mcfunction', '\n'.join(l.strip() for l in body.strip('\n').split('\n') if l.strip()))


def adv(path, trigger, conditions, reward):
    w(f'data/b720/advancement/{path}.json', {'criteria': {'c': {'trigger': trigger, 'conditions': conditions}},
                                             'rewards': {'function': reward}})


w('pack.mcmeta', {'pack': {'description': 'B720 spike', 'min_format': list(FORMAT), 'max_format': list(FORMAT),
                           'pack_format': FORMAT[0]}})
w('data/minecraft/tags/function/load.json', {'values': ['b720:load']})
w('data/minecraft/tags/function/tick.json', {'values': ['b720:tick']})

OBJ = {
    'b720.deaths': 'deathCount', 'b720.kills': 'playerKillCount', 'b720.total': 'totalKillCount', 'b720.health': 'health',
    'b720.trig': 'trigger', 'b720.kbred': 'killedByTeam.red', 'b720.tkblue': 'teamkill.blue',
    'b720.sdeaths': 'minecraft.custom:minecraft.deaths', 'b720.spk': 'minecraft.custom:minecraft.player_kills',
    'b720.tsd': 'minecraft.custom:minecraft.time_since_death', 'b720.leave': 'minecraft.custom:minecraft.leave_game',
    'b720.hearts': 'dummy', 'b720.t': 'dummy', 'b720.on': 'dummy', 'b720.withdraw': 'trigger', 'b720.shop': 'trigger',
    'b720.until': 'dummy', 'b720.gt': 'dummy', 'b720.id': 'dummy', 'b720.round': 'dummy', 'b720.seen_d': 'dummy',
    'b720.seen_k': 'dummy', 'b720.ls_d': 'deathCount', 'b720.ls_k': 'playerKillCount',
}
fn('load', '\n'.join([f'scoreboard objectives add {k} {v}' for k, v in OBJ.items()] + [
    'team add red {text:"Red",color:"red"}', 'team modify red color red',
    'team add blue {text:"Blue",color:"blue"}', 'team modify blue color blue',
    'team add green', 'team modify green color green', 'team add yellow', 'team modify yellow color yellow',
    'team add hide', 'team modify hide nametagVisibility never',
    'forceload add -32 -32 127 127',
    'scoreboard players add #loads b720.t 1',
    'execute unless data storage b720:round {made:1b} run data modify storage b720:round made set value 1b',
    'b720 log [{"text":"LOAD loads="},{"score":{"name":"#loads","objective":"b720.t"}},{"text":" round="},{"nbt":"round","storage":"b720:round"}]',
]))

# The dispatcher: each question's tick runs only while its switch is on (set from the console).
TICKS = ['k1', 'k5', 'k13', 'k6', 'k7', 'k11', 'k12', 'k12g', 'k14', 'k15', 'k16', 'k18', 'k9tp', 'k10',
         'g_lifesteal', 'g_manhunt', 'g_bedwars', 'g_spleef']
fn('tick', '\n'.join(f'execute if score #{t} b720.on matches 1 run function b720:{t}/tick' for t in TICKS))

# K1: what the tick function sees after a kill; every criterion's value logged when the death or kill count changes.
fn('k1/tick', '''
scoreboard players add @a b720.deaths 0
scoreboard players add @a b720.kills 0
execute as @a unless score @s b720.deaths = @s b720.seen_d run function b720:k1/changed
execute as @a unless score @s b720.kills = @s b720.seen_k run function b720:k1/changed
''')
fn('k1/changed', '''
scoreboard players operation @s b720.seen_d = @s b720.deaths
scoreboard players operation @s b720.seen_k = @s b720.kills
function b720:k1/dump
''')
fn('k1/dump', 'b720 log [{"text":"K1 "},{"selector":"@s"}' + ''.join(
    f',{{"text":" {k[5:]}="}},{{"score":{{"name":"@s","objective":"{k}"}}}}' for k in
    ['b720.deaths', 'b720.kills', 'b720.total', 'b720.health', 'b720.kbred', 'b720.tkblue', 'b720.sdeaths', 'b720.spk',
     'b720.tsd', 'b720.leave']) + ']')

# K2: hearts score -> most health through a macro function.
fn('k2/apply', '''
execute store result storage b720:k2 hp int 2 run scoreboard players get @s b720.hearts
function b720:k2/set with storage b720:k2
''')
fn('k2/set', '$attribute @s minecraft:max_health base set $(hp)')

# K3: who killed whom, by advancements.
def is_type(t):
    return {'type': 'minecraft:entity_properties', 'entity': 'this', 'predicate': {'minecraft:entity_type': t}}


adv('k3/killed_player', 'minecraft:player_killed_entity', {'entity': is_type('minecraft:player')}, 'b720:k3/killer')
adv('k3/killed_by_player', 'minecraft:entity_killed_player', {'killing_entity': is_type('minecraft:player')}, 'b720:k3/victim')
fn('k3/killer', '''
advancement revoke @s only b720:k3/killed_player
b720 log [{"text":"K3 killer reward as "},{"selector":"@s"},{"text":" kills="},{"score":{"name":"@s","objective":"b720.kills"}},{"text":" seen_k="},{"score":{"name":"@s","objective":"b720.seen_k"}}]
''')
fn('k3/victim', '''
advancement revoke @s only b720:k3/killed_by_player
b720 log [{"text":"K3 victim reward as "},{"selector":"@s"},{"text":" deaths="},{"score":{"name":"@s","objective":"b720.deaths"}},{"text":" dead="},{"nbt":"Health","entity":"@s"}]
execute on attacker run b720 log [{"text":"K3 victim's attacker is "},{"selector":"@s"}]
''')

# K4: the Heart item: recipe with components, eaten, found by consume_item with a custom_data predicate.
HEART = {'minecraft:custom_name': {'text': 'Heart', 'color': 'red', 'italic': False},
         'minecraft:item_model': 'minecraft:heart_of_the_sea',
         'minecraft:custom_data': {'b720_heart': True},
         'minecraft:consumable': {'consume_seconds': 1.0, 'animation': 'eat', 'has_consume_particles': False},
         'minecraft:max_stack_size': 16}
w('data/b720/recipe/heart.json', {'type': 'minecraft:crafting_shaped', 'pattern': ['DND', 'NTN', 'DND'],
                                  'key': {'D': 'minecraft:diamond_block', 'N': 'minecraft:netherite_scrap',
                                          'T': 'minecraft:totem_of_undying'},
                                  'result': {'id': 'minecraft:red_dye', 'count': 1, 'components': HEART}})
w('data/b720/recipe/revive.json', {'type': 'minecraft:crafting_shaped', 'pattern': ['HHH', 'HBH', 'HHH'],
                                   'key': {'H': 'minecraft:diamond', 'B': 'minecraft:beacon'},
                                   'result': {'id': 'minecraft:beacon', 'count': 1,
                                              'components': {'minecraft:custom_data': {'b720_revive': True},
                                                             'minecraft:consumable': {'consume_seconds': 1.0},
                                                             'minecraft:custom_name': {'text': 'Revive beacon', 'italic': False}}}})
adv('k4/ate_heart', 'minecraft:consume_item',
    {'item': {'items': 'minecraft:red_dye', 'predicates': {'minecraft:custom_data': '{b720_heart:1b}'}}}, 'b720:k4/ate')
adv('k4/ate_revive', 'minecraft:consume_item',
    {'item': {'items': 'minecraft:beacon', 'predicates': {'minecraft:custom_data': {'b720_revive': True}}}}, 'b720:k4/revive')
fn('k4/ate', '''
advancement revoke @s only b720:k4/ate_heart
scoreboard players add @s b720.hearts 1
function b720:k2/apply
b720 log [{"text":"K4 ate a heart: "},{"selector":"@s"},{"text":" hearts="},{"score":{"name":"@s","objective":"b720.hearts"}}]
''')
# Revive: the player out longest (smallest out-since time) among those online; offline ones by name through a head.
fn('k4/revive', '''
advancement revoke @s only b720:k4/ate_revive
scoreboard players set #min b720.t 2147483647
scoreboard players operation #min b720.t < @a[tag=b720.out] b720.until
execute as @a[tag=b720.out] if score @s b720.until = #min b720.t run function b720:k4/bring_back
''')
fn('k4/bring_back', '''
tag @s remove b720.out
gamemode survival @s
scoreboard players set @s b720.hearts 3
function b720:k2/apply
b720 log [{"text":"K4 revived "},{"selector":"@s"}]
''')
fn('k4/name_of', '''
loot replace block 0 -50 0 container.0 loot b720:head_of_this
data modify storage b720:k4 name set from block 0 -50 0 Items[0].components."minecraft:profile".name
b720 log [{"text":"K4 name in storage: "},{"nbt":"name","storage":"b720:k4"}]
''')
w('data/b720/loot_table/head_of_this.json', {'type': 'minecraft:command', 'pools': [{'rolls': 1, 'entries': [
    {'type': 'minecraft:item', 'name': 'minecraft:player_head',
     'modifier': [{'type': 'minecraft:fill_player_head', 'entity': 'this'}]}]}]})
fn('k4/mark_offline', '$scoreboard players set $(name) b720.on 7')

# K5: /trigger withdraw.
fn('k5/tick', '''
scoreboard players enable @a b720.withdraw
execute as @a[scores={b720.withdraw=1..}] run function b720:k5/withdraw
''')
fn('k5/withdraw', '''
b720 log [{"text":"K5 "},{"selector":"@s"},{"text":" withdraw="},{"score":{"name":"@s","objective":"b720.withdraw"}}]
execute if score @s b720.hearts matches 2.. run function b720:k5/take
scoreboard players set @s b720.withdraw 0
''')
fn('k5/take', '''
scoreboard players remove @s b720.hearts 1
function b720:k2/apply
give @s minecraft:red_dye[minecraft:custom_name={text:"Heart",color:"red",italic:false},minecraft:item_model="minecraft:heart_of_the_sea",minecraft:custom_data={b720_heart:1b},minecraft:consumable={consume_seconds:1.0f,animation:"eat",has_consume_particles:false},minecraft:max_stack_size=16]
''')
fn('k5/enable_only', 'scoreboard players enable @a b720.withdraw')

# K6: kept out for a time by a game-time clock.
fn('k6/out', '''
gamemode spectator @s
tag @s add b720.out
execute store result score @s b720.until run time query gametime
scoreboard players add @s b720.until 200
b720 log [{"text":"K6 out "},{"selector":"@s"},{"text":" until="},{"score":{"name":"@s","objective":"b720.until"}}]
''')
fn('k6/tick', '''
execute store result score #now b720.t run time query gametime
execute as @a[tag=b720.out] if score @s b720.until <= #now b720.t run function b720:k6/back
''')
fn('k6/back', '''
tag @s remove b720.out
gamemode survival @s
scoreboard players set @s b720.hearts 3
function b720:k2/apply
tp @s 0 -60 0
b720 log [{"text":"K6 back "},{"selector":"@s"},{"text":" now="},{"score":{"name":"#now","objective":"b720.t"}}]
''')

# K7: the tracking compass.
fn('k7/tick', '''
scoreboard players add #k7 b720.t 1
execute if score #k7 b720.t matches 20.. run function b720:k7/refresh
''')
fn('k7/refresh', '''
scoreboard players set #k7 b720.t 0
execute as @a[tag=b720.runner,limit=1] run function b720:k7/read
execute as @a[tag=b720.hunter] run function b720:k7/set with storage b720:k7
''')
fn('k7/refresh_every_tick', '''
execute as @a[tag=b720.runner,limit=1] run function b720:k7/read
execute as @a[tag=b720.hunter] run function b720:k7/set with storage b720:k7
''')
fn('k7/refresh_once', '''
execute as @a[tag=b720.runner,limit=1] run function b720:k7/read
function b720:k7/set_all with storage b720:k7
''')
fn('k7/set_all', '$execute as @a[tag=b720.hunter] if items entity @s weapon.mainhand minecraft:compass[minecraft:custom_data~{b720_tracker:1b}] run item modify entity @s weapon.mainhand {type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"$(dim)",pos:[I;$(x),$(y),$(z)]},tracked:false}}}')
fn('k7/read_once', '''
data modify storage b720:k7 p set from entity @s Pos
data modify storage b720:k7 dim set from entity @s Dimension
execute store result storage b720:k7 x int 1 run data get storage b720:k7 p[0]
execute store result storage b720:k7 y int 1 run data get storage b720:k7 p[1]
execute store result storage b720:k7 z int 1 run data get storage b720:k7 p[2]
''')
fn('k7/read_marker', '''
execute at @s run tp @e[type=minecraft:marker,tag=b720.trk,limit=1] ~ ~ ~
execute as @e[type=minecraft:marker,tag=b720.trk,limit=1] run function b720:k7/read
''')
fn('k7/refresh_cheap', '''
execute as @a[tag=b720.runner,limit=1] run function b720:k7/read_once
function b720:k7/set_all with storage b720:k7
''')
fn('k7/read', '''
execute store result storage b720:k7 x int 1 run data get entity @s Pos[0]
execute store result storage b720:k7 y int 1 run data get entity @s Pos[1]
execute store result storage b720:k7 z int 1 run data get entity @s Pos[2]
data modify storage b720:k7 dim set from entity @s Dimension
''')
fn('k7/set', '$execute if items entity @s weapon.mainhand minecraft:compass[minecraft:custom_data~{b720_tracker:1b}] run item modify entity @s weapon.mainhand {type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"$(dim)",pos:[I;$(x),$(y),$(z)]},tracked:false}}}\n'
   '$execute if items entity @s weapon.offhand minecraft:compass[minecraft:custom_data~{b720_tracker:1b}] run item modify entity @s weapon.offhand {type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"$(dim)",pos:[I;$(x),$(y),$(z)]},tracked:false}}}')
w('data/b720/item_modifier/track.json', {'type': 'minecraft:set_components', 'components': {
    'minecraft:lodestone_tracker': {'target': {'dimension': 'minecraft:overworld', 'pos': [1, 2, 3]}, 'tracked': False}}})
fn('k7/set_wild', '$item modify entity @s container.* {type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"$(dim)",pos:[I;$(x),$(y),$(z)]},tracked:false}}}')

# K8: winning a hunt.
adv('k8/dragon', 'minecraft:player_killed_entity', {'entity': is_type('minecraft:ender_dragon')}, 'b720:k8/won')
fn('k8/won', 'b720 log [{"text":"K8 dragon killed by "},{"selector":"@s"},{"text":"; runners win"}]')
fn('k8/runner_dead', 'execute as @a[tag=b720.runner,scores={b720.deaths=1..}] run b720 log [{"text":"K8 runner died: hunters win"}]')

# K9: holding hunters.
fn('k9/hold_attr', '''
attribute @s minecraft:movement_speed modifier add b720:hold -1 add_multiplied_total
attribute @s minecraft:jump_strength modifier add b720:hold -1 add_multiplied_total
effect give @s minecraft:blindness 30 0 true
''')
fn('k9/free_attr', '''
attribute @s minecraft:movement_speed modifier remove b720:hold
attribute @s minecraft:jump_strength modifier remove b720:hold
effect clear @s minecraft:blindness
''')
fn('k9/hold_effects', '''
effect give @s minecraft:slowness 30 255 true
effect give @s minecraft:mining_fatigue 30 255 true
effect give @s minecraft:blindness 30 0 true
''')
fn('k9/hold_box', 'execute at @s run fill ~-1 ~-1 ~-1 ~1 ~2 ~1 minecraft:barrier hollow')
fn('k9/free_box', 'execute at @s run fill ~-1 ~-1 ~-1 ~1 ~2 ~1 minecraft:air replace minecraft:barrier')
fn('k9tp/tick', 'execute as @a[tag=b720.hunter] run tp @s 50 -60 50')

# K10: spleef.
os.makedirs(os.path.join(out, 'data/b720/structure'), exist_ok=True)
nbtw.write(os.path.join(out, 'data/b720/structure/floor32.nbt'),
           nbtw.template(DATA_VERSION, (32, 1, 32), {(x, 0, z): ('minecraft:snow_block', {}) for x in range(32) for z in range(32)}))
w('data/b720/predicate/below_floor.json', {'type': 'minecraft:location_check', 'predicate': {'position': {'y': {'max': -42}}}})
fn('k10/rebuild_fill', 'fill 64 -40 0 95 -40 31 minecraft:snow_block')
fn('k10/rebuild_template', 'place template b720:floor32 64 -40 0')
fn('k10/tick', '''
execute as @a[tag=b720.spleef,gamemode=adventure] at @s if predicate b720:below_floor run function b720:k10/fell
''')
fn('k10/fell', '''
gamemode spectator @s
b720 log [{"text":"K10 fell: "},{"selector":"@s"}]
''')
fn('k10/tick_selector', 'execute as @a[tag=b720.spleef,gamemode=adventure,y=-64,dy=22] run function b720:k10/fell')

# K11: beds and respawns.
fn('k11/bed_check', '''
execute if block 20 -60 40 #minecraft:beds[part=foot] if block 20 -60 39 #minecraft:beds[part=head] run b720 log {"text":"K11 red bed stands"}
execute unless block 20 -60 40 #minecraft:beds unless block 20 -60 39 #minecraft:beds run b720 log {"text":"K11 red bed gone (both halves)"}
execute if block 20 -60 40 #minecraft:beds unless block 20 -60 39 #minecraft:beds run b720 log {"text":"K11 red bed: foot only"}
''')
fn('k11/tick', '''
execute store result score #now b720.t run time query gametime
execute unless block 20 -60 40 #minecraft:beds run scoreboard players set #red_bed b720.t 0
execute as @a[team=red,scores={b720.deaths=1..}] run function b720:k11/died
execute as @a[tag=b720.waiting] if score @s b720.until <= #now b720.t run function b720:k11/back
''')
fn('k11/died', '''
scoreboard players set @s b720.deaths 0
execute if score #red_bed b720.t matches 1 run function b720:k11/wait
execute unless score #red_bed b720.t matches 1 run function b720:k11/eliminated
''')
fn('k11/wait', '''
gamemode spectator @s
tag @s add b720.waiting
execute store result score @s b720.until run time query gametime
scoreboard players add @s b720.until 100
b720 log [{"text":"K11 waits to respawn: "},{"selector":"@s"},{"text":" health="},{"nbt":"Health","entity":"@s"}]
''')
fn('k11/back', '''
tag @s remove b720.waiting
gamemode survival @s
tp @s 20 -60 41
b720 log [{"text":"K11 back at base: "},{"selector":"@s"}]
''')
fn('k11/eliminated', '''
gamemode spectator @s
tag @s add b720.eliminated
b720 log [{"text":"K11 eliminated (no bed): "},{"selector":"@s"}]
''')

# K12: generators (a timer per generator, the cap read from the stack count nearby).
fn('k12/tick', 'execute as @e[type=minecraft:marker,tag=b720.gen] at @s run function b720:k12/gen')
fn('k12/gen', '''
scoreboard players add @s b720.gt 1
execute if score @s b720.gt matches 20.. run function b720:k12/drop
''')
fn('k12/drop', '''
scoreboard players set @s b720.gt 0
scoreboard players set #c b720.t 0
execute as @e[type=minecraft:item,distance=..1.5,limit=1] store result score #c b720.t run data get entity @s Item.count
execute if score #c b720.t matches ..15 run summon minecraft:item ~ ~ ~ {Item:{id:"minecraft:iron_ingot",count:1},Motion:[0.0d,0.0d,0.0d]}
''')
# One shared clock for all generators.
fn('k12g/tick', '''
scoreboard players add #gclock b720.t 1
execute if score #gclock b720.t matches 20.. run function b720:k12g/all
''')
fn('k12g/all', '''
scoreboard players set #gclock b720.t 0
execute as @e[type=minecraft:marker,tag=b720.gen] at @s run function b720:k12/drop
''')

# K13: shops.
fn('k13/summon', '''
summon minecraft:villager 30 -60 60 {Tags:["b720.shop"],NoAI:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b,VillagerData:{profession:"minecraft:armorer",level:5,type:"minecraft:plains"},Offers:{Recipes:[{buy:{id:"minecraft:iron_ingot",count:4},sell:{id:"minecraft:iron_sword",count:1,components:{"minecraft:custom_name":{text:"Team sword",italic:false},"minecraft:unbreakable":{}}},maxUses:2147483647,rewardExp:0b,xp:0},{buy:{id:"minecraft:gold_ingot",count:2},buyB:{id:"minecraft:iron_ingot",count:1},sell:{id:"minecraft:white_wool",count:16},maxUses:2147483647,rewardExp:0b,xp:0}]}}
''')
fn('k13/summon_plain', 'summon minecraft:villager 34 -60 60 {Tags:["b720.plain"],NoAI:1b,Invulnerable:1b,VillagerData:{profession:"minecraft:armorer",level:1,type:"minecraft:plains"}}')
fn('k13/dialog', 'dialog show @s {type:"minecraft:multi_action",title:{text:"Shop"},actions:[{label:{text:"Iron sword (4 iron)"},action:{type:"minecraft:run_command",command:"trigger b720.shop set 1"}},{label:{text:"16 wool (2 gold)"},action:{type:"minecraft:run_command",command:"trigger b720.shop set 2"}}]}')
fn('k13/tick', '''
scoreboard players enable @a b720.shop
execute as @a[scores={b720.shop=1..}] run function b720:k13/buy
''')
fn('k13/buy', '''
execute if score @s b720.shop matches 1 store result score #have b720.t run clear @s minecraft:iron_ingot 0
execute if score @s b720.shop matches 1 if score #have b720.t matches 4.. run function b720:k13/buy_sword
execute if score @s b720.shop matches 1 unless score #have b720.t matches 4.. run b720 log [{"text":"K13 not enough iron: "},{"selector":"@s"}]
scoreboard players set @s b720.shop 0
''')
fn('k13/buy_sword', '''
clear @s minecraft:iron_ingot 4
give @s minecraft:iron_sword[minecraft:custom_name={text:"Team sword",italic:false}]
b720 log [{"text":"K13 bought a sword: "},{"selector":"@s"}]
''')

# K14: last one standing.
fn('k14/tick', '''
execute store result score #alive b720.t if entity @a[tag=b720.in,gamemode=!spectator]
scoreboard players set #teams b720.t 0
execute if entity @a[tag=b720.in,team=red,gamemode=!spectator] run scoreboard players add #teams b720.t 1
execute if entity @a[tag=b720.in,team=blue,gamemode=!spectator] run scoreboard players add #teams b720.t 1
execute if entity @a[tag=b720.in,team=green,gamemode=!spectator] run scoreboard players add #teams b720.t 1
execute if entity @a[tag=b720.in,team=yellow,gamemode=!spectator] run scoreboard players add #teams b720.t 1
execute if score #started b720.t matches 2.. if score #alive b720.t matches ..1 run function b720:k14/win
execute if score #started b720.t matches 1 if score #alive b720.t matches 0 run function b720:k14/practice_over
''')
fn('k14/win', '''
tellraw @a [{"selector":"@a[tag=b720.in,gamemode=!spectator]"},{"text":" wins the round!"}]
b720 log [{"text":"K14 winner: "},{"selector":"@a[tag=b720.in,gamemode=!spectator]"},{"text":" teams left="},{"score":{"name":"#teams","objective":"b720.t"}}]
scoreboard players set #started b720.t 0
''')
fn('k14/practice_over', '''
b720 log {"text":"K14 practice round over"}
scoreboard players set #started b720.t 0
''')
fn('k14/start', '''
tag @a[tag=b720.ready] add b720.in
execute store result score #started b720.t if entity @a[tag=b720.in]
b720 log [{"text":"K14 started with "},{"score":{"name":"#started","objective":"b720.t"}}]
''')

# K15: round state across /reload and a restart; joining mid-round.
fn('k15/begin', '''
data modify storage b720:round state set value "running"
scoreboard players add #round b720.round 1
execute as @a run scoreboard players operation @s b720.round = #round b720.round
''')
fn('k15/tick', 'execute as @a unless score @s b720.round = #round b720.round run function b720:k15/late')
fn('k15/late', '''
scoreboard players operation @s b720.round = #round b720.round
gamemode spectator @s
b720 log [{"text":"K15 joined mid-round, watching: "},{"selector":"@s"}]
''')

# K16: the lobby.
fn('k16/tick', '''
execute store result score #lobby b720.t if entity @a[tag=b720.lobby]
execute if score #lobby b720.t matches 4.. unless score #count b720.t matches 0.. run scoreboard players set #count b720.t 100
execute if score #lobby b720.t matches ..3 run scoreboard players reset #count b720.t
execute if score #count b720.t matches 1.. run scoreboard players remove #count b720.t 1
execute if score #count b720.t matches 0 run function b720:k16/start
''')
fn('k16/start', '''
scoreboard players reset #count b720.t
function b720:k16/split
b720 log [{"text":"K16 start: red="},{"selector":"@a[team=red]"},{"text":" blue="},{"selector":"@a[team=blue]"}]
''')
fn('k16/split', '''
team empty red
team empty blue
execute as @a[tag=b720.lobby,sort=random] run function b720:k16/pick
''')
fn('k16/pick', '''
execute store result score #r b720.t if entity @a[team=red]
execute store result score #b b720.t if entity @a[team=blue]
execute if score #r b720.t <= #b b720.t run team join red @s
execute unless entity @s[team=red] run team join blue @s
''')

# K18: hide and seek: a block display kept on each hider, an interaction to catch hits.
fn('k18/disguise', '''
scoreboard players add #ids b720.t 1
scoreboard players operation @s b720.id = #ids b720.t
effect give @s minecraft:invisibility infinite 0 true
team join hide @s
execute at @s run summon minecraft:block_display ~-0.5 ~ ~-0.5 {Tags:["b720.disguise","b720.new"],block_state:{id:"minecraft:oak_leaves"},teleport_duration:1}
execute at @s run summon minecraft:interaction ~ ~ ~ {Tags:["b720.catch","b720.new"],width:1.0f,height:1.0f,response:1b}
scoreboard players operation @e[tag=b720.new] b720.id = @s b720.id
tag @e[tag=b720.new] remove b720.new
''')
fn('k18/tick', 'execute as @a[team=hide] at @s run function b720:k18/follow')
fn('k18/follow', '''
scoreboard players operation #id b720.t = @s b720.id
execute as @e[type=minecraft:block_display,tag=b720.disguise] if score @s b720.id = #id b720.t positioned ~-0.5 ~ ~-0.5 run tp @s ~ ~ ~
execute as @e[type=minecraft:interaction,tag=b720.catch] if score @s b720.id = #id b720.t run tp @s ~ ~ ~
''')
fn('k18/follow_align', '''
scoreboard players operation #id b720.t = @s b720.id
execute align xyz as @e[type=minecraft:block_display,tag=b720.disguise] if score @s b720.id = #id b720.t run tp @s ~ ~ ~
''')
fn('k18/hits', '''
execute as @e[type=minecraft:interaction,tag=b720.catch] if data entity @s attack run function b720:k18/hit
''')
fn('k18/hit', '''
scoreboard players operation #id b720.t = @s b720.id
execute on attacker run b720 log [{"text":"K18 the seeker "},{"selector":"@s"},{"text":" found a hider"}]
execute as @a[team=hide] if score @s b720.id = #id b720.t run b720 log [{"text":"K18 found: "},{"selector":"@s"}]
data remove entity @s attack
''')

# K19: each game's tick as assembled from the pieces above.
fn('g_lifesteal/tick', '''
scoreboard players enable @a b720.withdraw
execute as @a[scores={b720.withdraw=1..}] run function b720:k5/withdraw
execute as @a[scores={b720.ls_k=1..}] run function b720:g_lifesteal/gain
execute as @a[scores={b720.ls_d=1..}] run function b720:g_lifesteal/lose
execute store result score #now b720.t run time query gametime
execute as @a[tag=b720.out] if score @s b720.until <= #now b720.t run function b720:k6/back
''')
fn('g_lifesteal/gain', '''
scoreboard players operation @s b720.hearts += @s b720.ls_k
scoreboard players set @s b720.ls_k 0
execute if score @s b720.hearts matches 21.. run scoreboard players set @s b720.hearts 20
function b720:k2/apply
''')
fn('g_lifesteal/lose', '''
scoreboard players operation @s b720.hearts -= @s b720.ls_d
scoreboard players set @s b720.ls_d 0
execute if score @s b720.hearts matches ..0 run function b720:k6/out
execute if score @s b720.hearts matches 1.. run function b720:k2/apply
''')
fn('g_manhunt/tick', '''
scoreboard players add #k7 b720.t 1
execute if score #k7 b720.t matches 20.. run function b720:k7/refresh
execute if entity @a[tag=b720.runner,scores={b720.deaths=1..}] run function b720:g_manhunt/hunters_win
''')
fn('g_manhunt/hunters_win', 'scoreboard players set @a[tag=b720.runner] b720.deaths 0')
fn('g_bedwars/tick', '''
execute store result score #now b720.t run time query gametime
execute unless block 20 -60 40 #minecraft:beds run scoreboard players set #red_bed b720.t 0
execute unless block 60 -60 40 #minecraft:beds run scoreboard players set #blue_bed b720.t 0
execute unless block 20 -60 80 #minecraft:beds run scoreboard players set #green_bed b720.t 0
execute unless block 60 -60 80 #minecraft:beds run scoreboard players set #yellow_bed b720.t 0
execute as @a[scores={b720.deaths=1..}] run function b720:k11/died
execute as @a[tag=b720.waiting] if score @s b720.until <= #now b720.t run function b720:k11/back
execute as @a[gamemode=!spectator,y=-128,dy=60] run kill @s
function b720:k12g/tick
function b720:k14/tick
''')
fn('g_spleef/tick', '''
execute as @a[tag=b720.spleef,gamemode=adventure] at @s if predicate b720:below_floor run function b720:k10/fell
function b720:k14/tick
''')
fn('noop', 'scoreboard players add #noop b720.t 1')
print('pack written to', out)
