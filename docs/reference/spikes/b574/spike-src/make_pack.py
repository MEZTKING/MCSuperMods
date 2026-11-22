# MSM's own spike data pack: dimensions over vanilla's overworld noise settings with biome lists made here,
# one climate parameter at a time, so the climate sampler can be compared without vanilla's parameter list.
import json, os, random, sys
out = sys.argv[1]
pack_format = int(sys.argv[2])
PARAMS = ['temperature', 'humidity', 'continentalness', 'erosion', 'depth', 'weirdness']
BIOMES = ['plains', 'desert', 'forest', 'taiga', 'savanna', 'jungle', 'swamp', 'snowy_plains', 'badlands',
          'birch_forest', 'dark_forest', 'meadow', 'grove', 'beach', 'ocean', 'cold_ocean', 'river', 'mushroom_fields',
          'sunflower_plains', 'flower_forest', 'stony_shore', 'windswept_hills', 'cherry_grove', 'deep_ocean']
dims = {}
for p in PARAMS:
    pts = []
    for i, v in enumerate([-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0]):
        params = {q: 0.0 for q in PARAMS}; params[p] = v; params['offset'] = 0.0
        pts.append({'biome': 'minecraft:' + BIOMES[i], 'parameters': params})
    dims['clim_' + p] = {'type': 'minecraft:multi_noise', 'biomes': pts}
rnd = random.Random(574)
pts = []
for i in range(24):
    params = {}
    for q in PARAMS:
        a = round(rnd.uniform(-1, 1), 3); b = round(rnd.uniform(-1, 1), 3)
        params[q] = a if rnd.random() < 0.5 else [min(a, b), max(a, b)]
    params['offset'] = round(rnd.uniform(0, 0.2), 3)
    pts.append({'biome': 'minecraft:' + BIOMES[i], 'parameters': params})
dims['clim_mix'] = {'type': 'minecraft:multi_noise', 'biomes': pts}
dims['checker'] = {'type': 'minecraft:checkerboard', 'biomes': ['minecraft:plains', 'minecraft:desert', 'minecraft:taiga'], 'scale': 1}
os.makedirs(f'{out}/data/b574/dimension', exist_ok=True)
for name, src in dims.items():
    with open(f'{out}/data/b574/dimension/{name}.json', 'w') as f:
        json.dump({'type': 'minecraft:overworld', 'generator': {'type': 'minecraft:noise', 'settings': 'minecraft:overworld', 'biome_source': src}}, f, indent=2, sort_keys=True)
with open(f'{out}/pack.mcmeta', 'w') as f:
    json.dump({'pack': {'description': 'B574 spike', 'min_format': [pack_format, 0], 'max_format': [pack_format, 0], 'pack_format': pack_format}}, f)
print(list(dims))
