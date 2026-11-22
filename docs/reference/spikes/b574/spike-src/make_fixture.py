# MSM's own 26.4 fixture: one plain terrain and its domain_warp and upscale variants, to learn the new types by observation.
import json, os, sys
out = sys.argv[1]
H = {'type': 'minecraft:add',
     'left': {'type': 'minecraft:gradient', 'axis': 'y', 'from_coordinate': 0, 'from_value': 8.0, 'to_coordinate': 128, 'to_value': -8.0},
     'right': {'type': 'minecraft:mul', 'left': 3.0, 'right': {'type': 'minecraft:noise', 'noise': 'minecraft:surface', 'xz_scale': 1.0, 'y_scale': 0.0}}}
def axis(mode, n): return {'mode': mode, 'cell_size': n}
FD = {
  'twin': H,
  'warp_const': {'type': 'minecraft:domain_warp', 'input': H, 'offset_x': 16.0},
  'warp_fn': {'type': 'minecraft:domain_warp', 'input': H, 'offset_z': {'type': 'minecraft:mul', 'left': 24.0, 'right': {'type': 'minecraft:noise', 'noise': 'minecraft:surface_secondary', 'xz_scale': 1.0, 'y_scale': 0.0}}},
  'up_lin': {'type': 'minecraft:upscale', 'input': H, 'x': axis('interpolate_linear', 8), 'y': axis('interpolate_linear', 4), 'z': axis('interpolate_linear', 8)},
  'up_nn': {'type': 'minecraft:upscale', 'input': H, 'x': axis('nearest_neighbor', 8), 'y': axis('interpolate_linear', 1), 'z': axis('nearest_neighbor', 8)},
  'up_cos': {'type': 'minecraft:upscale', 'input': H, 'x': axis('interpolate_cosine', 8), 'y': axis('interpolate_linear', 1), 'z': axis('interpolate_cosine', 8)},
}
os.makedirs(f'{out}/data/b574/worldgen/noise_settings', exist_ok=True)
os.makedirs(f'{out}/data/b574/dimension', exist_ok=True)
for name, fd in FD.items():
  router = {k: 0.0 for k in ['chunk_surface_level', 'continents', 'depth', 'erosion', 'ridges', 'temperature', 'vegetation']}
  router['final_density'] = fd
  ns = {'noise': {'min_y': 0, 'height': 128}, 'default_fluid': 'minecraft:water', 'sea_level': 0, 'material_rule': {'type': 'minecraft:block', 'result_state': 'minecraft:stone'},
        'spawn_target': [], 'disable_mob_generation': True, 'legacy_random_source': False, 'debug_functions': [], 'noise_router': router}
  json.dump(ns, open(f'{out}/data/b574/worldgen/noise_settings/{name}.json', 'w'), indent=2, sort_keys=True)
  json.dump({'type': 'minecraft:overworld', 'generator': {'type': 'minecraft:noise', 'settings': f'b574:{name}', 'biome_source': {'type': 'minecraft:fixed', 'biome': 'minecraft:the_void'}}},
            open(f'{out}/data/b574/dimension/{name}.json', 'w'), indent=2, sort_keys=True)
json.dump({'pack': {'description': 'B574 fixture', 'min_format': [126, 0], 'max_format': [126, 0], 'pack_format': 126}}, open(f'{out}/pack.mcmeta', 'w'))
json.dump({'b574:' + n: [(0, 0), (2000, -800)] for n in FD}, open(f'{out}/spots.json', 'w'))
