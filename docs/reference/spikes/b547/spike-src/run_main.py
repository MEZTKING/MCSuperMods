# B547 spike: the dedicated-server half (Y1, Y2 world spawn, Y3, Y5 server side, Y6, Y8, Y9, Y10, Y11, Y12, Y16 forms,
# structure block saves) for one version. Writes results/server-<version>.json.
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '<scratchpad>/wt-B547/docs/reference/vanilla-worldgen/tools')
import region
from srv import Server, B

version = sys.argv[1]
only = sys.argv[2:] or ['main', 'restart', 'nostruct']
R = {}
PACK = {'b547': f'{B}/packs/{version}/main'}
DIMS = ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'] + [f'b547:{d}' for d in (
    'listed', 'listed_feat', 'unlisted', 'absent', 'tv', 'tv_off', 'skyfeat', 'fixed', 'fixed0', 'fixed10', 'fixed_layers', 'fixed_air', 'fixed_noise', 'noise_origin')]
resfile = f'{B}/results/server-{version}.json'
if os.path.exists(resfile):
    R = json.load(open(resfile))


def save():
    json.dump(R, open(resfile, 'w'), indent=2, sort_keys=True)


def chat(lines):
    return [l for l in lines if 'Saving chunks' not in l and 'Saved the game' not in l and 'MARK' not in l]


def c(s, cmd, timeout=300):
    out, secs = s.cmd(cmd, timeout)
    return {'cmd': cmd, 'out': chat(out), 'seconds': secs}


def sprint(s, ticks):
    s.send(f'tick sprint {ticks}')
    lines = s.wait_for(lambda l: 'Sprint completed' in l, 900)
    return strip_last(lines)


def counts(s, fn, names, obj):
    s.cmd(fn)
    out = {}
    for n in names:
        lines, _ = s.cmd(f'scoreboard players get {n} {obj}')
        out[n] = chat(lines)[-1] if chat(lines) else None
    return out


def strip_last(lines):
    return [l[l.find(']: ') + 3:] for l in lines if 'Sprint completed' in l][-1]


def load_dims(s):
    for d in DIMS:
        s.send(f'execute in {d} run forceload add -32 -32 47 31')
    for d in DIMS:
        for x, z in ((-32, -32), (31, 31), (0, 0)):
            for _ in range(240):
                out, _ = s.cmd(f'execute in {d} if loaded {x} 0 {z}')
                if any('Test passed' in l for l in out):
                    break
                time.sleep(0.5)


def dump(world_dir, dims):
    """Non-air blocks and structure starts in chunks -2..1 of each dimension."""
    out = {}
    for d in dims:
        ns, path = d.split(':')
        rdir = os.path.join(world_dir, 'dimensions', ns, path, 'region')
        if not os.path.isdir(rdir):
            out[d] = 'no region folder'
            continue
        blocks, starts, statuses = {}, [], {}
        for cx, cz, root in region.chunks(rdir):
            if not (-2 <= cx <= 2 and -2 <= cz <= 1):
                continue
            statuses[f'{cx},{cz}'] = region.status(root)
            for sid, sv in ((root.get('structures') or {}).get('starts') or {}).items():
                if isinstance(sv, dict) and sv.get('id', 'INVALID') != 'INVALID':
                    starts.append({'chunk': [cx, cz], 'id': sid, 'children': [
                        {k: ch.get(k) for k in ('id', 'BB', 'template', 'pool_element') if k in ch} for ch in sv.get('Children', [])]})
            for x, y, z, name, props in region.blocks(root):
                blocks.setdefault(name, []).append([cx * 16 + x, y, cz * 16 + z])
        out[d] = {'statuses': sorted(set(statuses.values())), 'starts': starts,
                  'blocks': {k: (v if len(v) <= 12 else {'count': len(v), 'first': v[:6], 'min_y': min(p[1] for p in v),
                                                          'max_y': max(p[1] for p in v)}) for k, v in blocks.items()}}
    return out


def level_spawn(world_dir):
    root = region.NBT(__import__('gzip').open(os.path.join(world_dir, 'level.dat')).read()).root()
    data = root.get('Data', root)
    keep = {k: data[k] for k in data if 'pawn' in k.lower() or k in ('GameType', 'Difficulty', 'DataPacks', 'WorldGenSettings')}
    return json.loads(json.dumps(keep, default=str))


world_main = f'{B}/srv/{version}/w_main'
if 'main' in only:
    s = Server(version, 'w_main', props={'level-type': 'b547:void', 'generate-structures': 'true'}, packs=PACK)
    r = {'start_seconds': s.start_seconds, 'startup_b547': [l for l in s.lines if 'b547' in l or 'ERROR' in l or 'Failed' in l][:60]}
    r['report'] = c(s, 'function b547:report')
    r['datapacks'] = c(s, 'datapack list')
    r['biome_at_origin'] = c(s, 'execute if biome 0 64 0 b547:sky')
    load_dims(s)
    s.cmd('tick sprint 100')
    time.sleep(3)
    r['locate'] = {d: c(s, f'execute in {d} run locate structure b547:island') for d in ('minecraft:overworld', 'b547:listed', 'b547:listed_feat', 'b547:unlisted', 'b547:absent', 'b547:noise_origin')}
    # Y9 one block.
    ob = {}
    ob['setup'] = c(s, 'function b547:ob/setup')
    for k, v in (('#on', 0), ('#break', 0), ('#clear', 0), ('#areas', 0)):
        s.cmd(f'scoreboard players set {k} b547.c {v}')
    ob['baseline_sprint_1000'] = sprint(s, 1000)
    ob['chest_place'] = c(s, 'setblock 200 64 200 minecraft:chest{LootTable:"minecraft:chests/simple_dungeon"}')
    ob['chest_data'] = c(s, 'data get block 200 64 200')
    ob['chest_break'] = c(s, 'setblock 200 64 200 minecraft:air destroy')
    s.cmd('tick sprint 5')
    time.sleep(1)
    ob['chest_drops'] = c(s, 'execute store result score #items b547.ob if entity @e[type=minecraft:item,x=196,y=60,z=196,dx=8,dy=10,dz=8]')
    ob['chest_drop_list'] = c(s, 'execute as @e[type=minecraft:item,x=196,y=60,z=196,dx=8,dy=10,dz=8] run data get entity @s Item.id')
    s.cmd('kill @e[type=minecraft:item]')
    s.cmd('scoreboard players set #breaks b547.ob 0')
    s.cmd('scoreboard players set #on b547.c 1')
    s.cmd('scoreboard players set #break b547.c 1')
    ob['loop_sprint_1000_drops_kept'] = sprint(s, 1000)
    ob['loop_report_drops_kept'] = counts(s, 'function b547:ob/report', ['#breaks', '#chests', '#mobs', '#items', '#chick'], 'b547.ob')
    s.cmd('kill @e[type=minecraft:item]')
    s.cmd('kill @e[type=minecraft:chicken]')
    s.cmd('scoreboard players set #clear b547.c 1')
    ob['loop_sprint_1000_drops_cleared'] = sprint(s, 1000)
    ob['loop_report_cleared'] = counts(s, 'function b547:ob/report', ['#breaks', '#chests', '#mobs', '#items', '#chick'], 'b547.ob')
    s.cmd('scoreboard players set #on b547.c 0')
    s.cmd('scoreboard players set #break b547.c 0')
    ob['baseline_2000_a'] = sprint(s, 2000)
    s.cmd('scoreboard players set #on b547.c 1')
    s.cmd('scoreboard players set #break b547.c 1')
    ob['loop_2000_cleared_a'] = sprint(s, 2000)
    s.cmd('scoreboard players set #on b547.c 0')
    s.cmd('scoreboard players set #break b547.c 0')
    ob['baseline_2000_b'] = sprint(s, 2000)
    s.cmd('scoreboard players set #on b547.c 1')
    s.cmd('scoreboard players set #break b547.c 1')
    ob['loop_2000_cleared_b'] = sprint(s, 2000)
    for k in ('#on', '#break', '#clear'):
        s.cmd(f'scoreboard players set {k} b547.c 0')
    ob['baseline_again'] = sprint(s, 1000)
    R.setdefault(version, {})
    r['one_block'] = ob
    # Y11 areas.
    ar = {}
    ar['setup'] = c(s, 'function b547:area/setup')
    s.cmd('tick sprint 2')
    ar['baseline_20_markers'] = sprint(s, 1000)
    s.cmd('scoreboard players set #areas b547.c 1')
    ar['predicate_64_areas_20_markers'] = sprint(s, 1000)
    ar['predicate_report'] = counts(s, 'function b547:area/report', ['#markers', '#entered', '#left'], 'b547.c')
    s.cmd('execute as @e[type=minecraft:marker,tag=b547.p] at @s run tp @s ~16 ~ ~')
    s.cmd('tick sprint 3')
    ar['predicate_after_move'] = counts(s, 'function b547:area/report', ['#markers', '#entered', '#left'], 'b547.c')
    s.cmd('scoreboard players set #areas b547.c 0')
    s.cmd('function b547:area/setup')
    s.cmd('scoreboard players set #areas b547.c 2')
    ar['selector_64_areas_20_markers'] = sprint(s, 1000)
    ar['selector_64_areas_20_markers_2000'] = sprint(s, 2000)
    s.cmd('scoreboard players set #areas b547.c 0')
    ar['baseline_2000'] = sprint(s, 2000)
    s.cmd('scoreboard players set #areas b547.c 1')
    ar['predicate_64_areas_20_markers_2000'] = sprint(s, 2000)
    s.cmd('scoreboard players set #areas b547.c 2')
    ar['selector_report'] = counts(s, 'function b547:area/report', ['#markers', '#entered', '#left'], 'b547.c')
    s.cmd('execute as @e[type=minecraft:marker,tag=b547.p] at @s run tp @s ~16 ~ ~')
    s.cmd('tick sprint 3')
    ar['selector_after_move'] = counts(s, 'function b547:area/report', ['#markers', '#entered', '#left'], 'b547.c')
    s.cmd('scoreboard players set #areas b547.c 0')
    ar['bounds'] = c(s, 'function b547:area/bounds')
    r['areas'] = ar
    # Y12 reset.
    rs = {}
    rs['setup'] = c(s, 'function b547:reset/setup', 600)
    rs['clear'] = c(s, 'function b547:reset/clear')
    rs['place_1'] = c(s, 'function b547:reset/place', 600)
    rs['place_2'] = c(s, 'function b547:reset/place', 600)
    rs['check'] = c(s, 'function b547:reset/check')
    rs['place_big64'] = c(s, 'execute in minecraft:overworld run forceload add 480 384 560 463')
    time.sleep(2)
    rs['place_big64'] = c(s, 'place template b547:big64 480 64 400', 600)
    rs['big64_corner'] = c(s, 'execute if block 543 65 463 minecraft:glowstone')
    rs['clone_big'] = c(s, 'function b547:forms/clone_big', 600)
    rs['clone_direct'] = c(s, 'clone 400 64 400 447 111 447 400 200 400')
    rs['clone_slice'] = c(s, 'clone 400 64 400 447 77 447 400 200 400')
    r['reset'] = rs
    # Y10, Y16 and the other forms.
    forms = {}
    names = json.load(open(f'{B}/packs/{version}/main/forms.json'))
    order = sorted(names, key=lambda n: (0 if n.startswith('team_add') else 1 if n.startswith('obj_add') else 2 if n.startswith('bossbar_add') else 4 if n == 'bossbar_remove' else 3, n))
    s.cmd('forceload add 576 576 703 639')
    time.sleep(2)
    for n in order:
        text = open(f'{B}/packs/{version}/main/data/b547/function/forms/{n}.mcfunction').read().strip()
        forms[n] = c(s, text, 600)
    r['forms'] = forms
    r['checks_after_forms'] = {k: c(s, v) for k, v in {
        'island_gold': 'execute if block 602 66 602 minecraft:gold_block',
        'island_rot_gold': 'execute if block 618 66 602 minecraft:gold_block',
        'name_form_gold': 'execute if block 682 66 602 minecraft:gold_block',
        'structure_gold_any': 'execute if blocks 655 60 655 665 70 665 655 60 655 masked',
    }.items()}
    r['give_items'] = c(s, 'execute positioned 600 80 600 run data get entity @e[type=minecraft:item,limit=1,sort=nearest] Item')
    r['loot_place_list'] = c(s, 'loot spawn 600 90 600 loot b547:can_place_list')
    r['loot_place_list_item'] = c(s, 'execute positioned 600 90 600 run data get entity @e[type=minecraft:item,limit=1,sort=nearest] Item')
    r['chest_items_form'] = c(s, 'data get block 602 70 600 Items')
    r['chest_loot_form'] = c(s, 'data get block 600 70 600')
    r['sidebar_list'] = c(s, 'scoreboard objectives list')
    r['team_list'] = c(s, 'team list b547_red')
    r['worldborder_get'] = c(s, 'worldborder get')
    # Structure block save path (ADR 0116 D3).
    r['sb'] = c(s, 'function b547:sb/save')
    s.cmd('tick sprint 5')
    time.sleep(1)
    r['sb_data'] = c(s, 'data get block 700 64 700')
    r['end_dragon'] = c(s, 'execute in minecraft:the_end if entity @e[type=minecraft:ender_dragon]')
    s.send('save-all flush')
    s.wait_for(lambda l: 'Saved the game' in l, 300)
    s.stop()
    r['errors'] = [l for l in s.lines if 'ERROR' in l or 'Failed to load function' in l or 'Unknown or incomplete' in l][:40]
    r['generated_files'] = sorted(os.path.relpath(os.path.join(dp, f), world_main) for dp, _, fs in os.walk(world_main) for f in fs if 'generated' in dp)
    r['dump'] = dump(world_main, DIMS)
    r['level_dat'] = level_spawn(world_main)
    R['main'] = r
    save()

if 'restart' in only:
    s = Server(version, 'w_main', props={'level-type': 'b547:void'}, fresh=False)
    r = {'startup_b547': [l[l.find(']: ') + 3:] for l in s.lines if '[b547]' in l]}
    r['report_after_restart'] = c(s, 'function b547:report')
    r['reload'] = c(s, 'reload', 300)
    time.sleep(3)
    r['report_after_reload'] = c(s, 'function b547:report')
    s.stop()
    r['lines_after_reload'] = [l[l.find(']: ') + 3:] for l in s.lines if '[b547]' in l]
    R['restart'] = r
    save()

if 'spawn' in only:
    r = {}
    for preset in ('b547:void', 'b547:void_plain'):
        name = 'w_spawn_' + preset.split(':')[1]
        s = Server(version, name, props={'level-type': preset}, packs=PACK)
        time.sleep(3)
        s.stop()
        r[preset] = {'level_dat': level_spawn(f'{B}/srv/{version}/{name}'),
                     'log': [l[l.find(']: ') + 3:] for l in s.lines if 'spawn' in l.lower() or 'Preparing' in l]}
    R['spawn'] = r
    save()

if 'nostruct' in only:
    s = Server(version, 'w_nostruct', props={'level-type': 'b547:void', 'generate-structures': 'false'}, packs=PACK)
    load_dims(s)
    s.cmd('tick sprint 60')
    r = {'locate': c(s, 'locate structure b547:island')}
    s.send('save-all flush')
    s.wait_for(lambda l: 'Saved the game' in l, 300)
    s.stop()
    r['dump'] = dump(f'{B}/srv/{version}/w_nostruct', ['minecraft:overworld', 'b547:listed'])
    r['level_dat'] = level_spawn(f'{B}/srv/{version}/w_nostruct')
    R['nostruct'] = r
    save()
print('done', version)
