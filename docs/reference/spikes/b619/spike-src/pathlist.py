"""B619 spike (throwaway), 3S4: counts and sizes of the jar folders batch 3 needs (names and numbers only)."""
import json, re, sys, zipfile
TEX = ['entity/wolf/', 'entity/cat/', 'entity/pig/', 'entity/cow/', 'entity/chicken/', 'entity/frog/', 'entity/nautilus/',
       'entity/villager/', 'entity/sulfur_cube/', 'entity/banner/', 'entity/shield/', 'entity/decorated_pot/', 'entity/equipment/',
       'painting/', 'trims/', 'palettes/', 'mob_effect/', 'particle/', 'font/',
       'gui/sprites/hud/locator_bar_dot', 'gui/sprites/hud/effect_background', 'gui/sprites/container/inventory/effect_background',
       'gui/sprites/container/creative_inventory', 'gui/container/creative_inventory', 'gui/sprites/hud/locator_bar_']
ASSET_JSON = ['font', 'particles', 'waypoint_style', 'equipment', 'post_effect', 'shaders']
DATA = ['wolf_variant', 'cat_variant', 'pig_variant', 'cow_variant', 'chicken_variant', 'frog_variant', 'zombie_nautilus_variant',
        'wolf_sound_variant', 'cat_sound_variant', 'pig_sound_variant', 'cow_sound_variant', 'chicken_sound_variant',
        'sulfur_cube_archetype', 'painting_variant', 'banner_pattern', 'trim_pattern', 'trim_material', 'decorated_pot_pattern',
        'jukebox_song', 'instrument', 'timeline', 'world_clock', 'tags/painting_variant', 'tags/banner_pattern', 'tags/instrument',
        'block_sound_set']
out = {}
for v in ['26.3', '26.4-snapshot-7']:
    z = zipfile.ZipFile(f'/root/.gradle/caches/fabric-loom/{v}/minecraft-client.jar')
    names = [i for i in z.infolist() if not i.filename.endswith('/')]
    r = {'textures': {}, 'assetFiles': {}, 'data': {}}
    for t in TEX:
        sel = [i for i in names if i.filename.startswith('assets/minecraft/textures/' + t) and re.search(r'\.png(\.mcmeta)?$', i.filename)]
        r['textures'][t] = [len(sel), sum(i.file_size for i in sel)]
    for t in ASSET_JSON:
        sel = [i for i in names if i.filename.startswith(f'assets/minecraft/{t}/') and re.search(r'\.(json|vsh|fsh|glsl)$', i.filename)]
        r['assetFiles'][t] = [len(sel), sum(i.file_size for i in sel)]
    for t in DATA:
        sel = [i for i in names if i.filename.startswith(f'data/minecraft/{t}/') and i.filename.endswith('.json')]
        r['data'][t] = [len(sel), sum(i.file_size for i in sel)]
    for k in list(r):
        r[k + 'Total'] = [sum(x[0] for x in r[k].values()), sum(x[1] for x in r[k].values())]
    out[v] = r
json.dump(out, open(sys.argv[1], 'w'), indent=1)
for v, r in out.items():
    print(v, {k: r[k] for k in r if k.endswith('Total')})
