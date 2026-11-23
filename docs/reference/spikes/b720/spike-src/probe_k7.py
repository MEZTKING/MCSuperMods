# K7 follow-up: the cost of reading the runner's position three ways, and the cheapest whole refresh, 10 hunters.
import sys, json, srv
v = sys.argv[1]
s = srv.Server(v, packs={'b720': f'{srv.S}/packs/{v}/b720'})
out = []
TRACK = 'minecraft:compass[minecraft:custom_data={b720_tracker:1b}]'
cmds = ['gamerule spawn_monsters false', 'b720 join Ann', 'tp Ann 30 -60 -20', 'tag Ann add b720.runner'] + \
       [x for i in range(10) for x in (f'b720 join H{i}', f'tp H{i} {10 + i} -60 10', f'tag H{i} add b720.hunter')] + \
       [f'item replace entity @a[tag=b720.hunter] weapon.mainhand with {TRACK}', 'summon minecraft:marker 0 -60 0 {Tags:["b720.trk"]}', 'tick sprint 5'] + \
       ['b720 time 50 execute as @a[tag=b720.runner,limit=1] run function b720:k7/read', 'tick sprint 1',
        'b720 time 50 execute as @a[tag=b720.runner,limit=1] run function b720:k7/read_once', 'tick sprint 1',
        'b720 time 50 execute as @a[tag=b720.runner,limit=1] run function b720:k7/read_marker', 'tick sprint 1',
        'b720 time 50 function b720:k7/refresh_every_tick', 'tick sprint 1', 'b720 time 50 function b720:k7/refresh_once', 'tick sprint 1',
        'b720 time 50 function b720:k7/refresh_cheap', 'tick sprint 1', 'b720 time 50 function b720:k7/set_all with storage b720:k7', 'tick sprint 1',
        'data get entity H3 Inventory[0].components']
for c in cmds:
    out.append({'cmd': c, 'out': [l for l in s.cmd(c) if 'B720SEE' not in l and 'Saving' not in l]})
s.stop()
json.dump(out, open(f'{srv.S}/results/probe-k7-{v}.json', 'w'), indent=1)
for o in out:
    for l in o['out']:
        if 'time n=' in l or 'entity data' in l:
            print(l)
