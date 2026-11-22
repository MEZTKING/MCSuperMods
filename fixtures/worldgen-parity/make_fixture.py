# Writes the worldgen parity fixture (ADR 0119 D13, plan brief B579): the MSM project `worldgen_parity` once per
# target (`mc-26.3/`, `mc-26.4/`: msm.project.json and content/) and its lowered data pack (`<target>/lowered/data/`).
#
# Every file is MSM's own, written from the data format (the targets' vendored mcdoc) and never copied from vanilla:
# own noises, density functions, noise settings, rules, conditions, biomes, a biome tag, dimension types and
# dimensions. The project also defines the three vanilla noise ids the game's surface code reads by name
# (`minecraft:surface`, `minecraft:surface_secondary`, `minecraft:clay_bands_offset`) with values of its own, so no
# world of the fixture depends on a vanilla file.
#
# Each dimension isolates one group of types (README.md has the table). Run from the repository root:
#   python3 fixtures/worldgen-parity/make_fixture.py
# then rerun the GameTest with -PupdateWorldgenParity (README.md) when a dimension changed.
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NS = 'worldgen_parity'
CREATED = '2026-11-22T00:00:00.000Z'
TARGETS = ['mc-26.3', 'mc-26.4']


def nid(path):
    return f'{NS}:{path}'


# --- density function builders (26.3 field names: input, left/right, value) ---------------------------------------

def const(v):
    return {'type': 'minecraft:constant', 'value': v}


def grad(axis, c0, c1, v0, v1, tiling=None):
    out = {'type': 'minecraft:gradient', 'axis': axis, 'from_coordinate': c0, 'to_coordinate': c1,
           'from_value': v0, 'to_value': v1}
    if tiling:
        out['tiling'] = tiling
    return out


def ygrad(lo, hi, v0=1.0, v1=-1.0):
    return grad('y', lo, hi, v0, v1)


def noise(name, xz=1.0, y=0.0, **shift):
    out = {'type': 'minecraft:noise', 'noise': name, 'xz_scale': xz, 'y_scale': y}
    out.update(shift)
    return out


def two(kind, a, b):
    return {'type': f'minecraft:{kind}', 'left': a, 'right': b}


def add(a, b):
    return two('add', a, b)


def mul(a, b):
    return two('mul', a, b)


def one(kind, inp, **extra):
    out = {'type': f'minecraft:{kind}', 'input': inp}
    out.update(extra)
    return out


def total(*terms):
    out = terms[0]
    for t in terms[1:]:
        out = add(out, t)
    return out


# --- rule and condition builders ------------------------------------------------------------------------------------

def block(state, **props):
    if props:
        return {'type': 'minecraft:block', 'result_state': {'id': state, 'properties': props}}
    return {'type': 'minecraft:block', 'result_state': state}


def seq(*rules):
    return {'type': 'minecraft:sequence', 'sequence': list(rules)}


def cond(c, then):
    return {'type': 'minecraft:condition', 'if_true': c, 'then_run': then}


def stone_depth(surface='floor', offset=0, add_surface_depth=False, secondary=0):
    return {'type': 'minecraft:stone_depth', 'surface_type': surface, 'offset': offset,
            'add_surface_depth': add_surface_depth, 'secondary_depth_range': secondary}


def y_above(anchor, mult=0, add_stone_depth=False):
    return {'type': 'minecraft:y_above', 'anchor': anchor, 'surface_depth_multiplier': mult,
            'add_stone_depth': add_stone_depth}


def water(offset, mult=0, add_stone_depth=False):
    return {'type': 'minecraft:water', 'offset': offset, 'surface_depth_multiplier': mult,
            'add_stone_depth': add_stone_depth}


def not_(c):
    return {'type': 'minecraft:not', 'invert': c}


def simple(t):
    return {'type': f'minecraft:{t}'}


GRASS = block('minecraft:grass_block', snowy='false')
DIRT = block('minecraft:dirt')
STONE = block('minecraft:stone')

# The surface most dimensions share: grass on the floor, dirt below it to the surface depth, stone elsewhere.
PLAIN_SURFACE = seq(cond(stone_depth(), GRASS), cond(stone_depth(add_surface_depth=True), DIRT), STONE)

# --- shared files -----------------------------------------------------------------------------------------------------

NOISES = {
    'hills': {'base_octave': -7, 'octave_count': 3},
    'detail': {'base_octave': -4, 'octave_count': 2, 'amplitude_modifiers': [1.0, 0.5]},
    'caves': {'base_octave': -5, 'octave_count': 2},
    'shift': {'base_octave': -3, 'octave_count': 4, 'base_amplitude': 4.0},
    'ridged': {'base_octave': -6, 'octave_count': 3, 'normalize': False},
    'patches': {'base_octave': -5, 'octave_count': 1},
    'ore': {'base_octave': -6, 'octave_count': 2},
    'ore_gap': {'base_octave': -5, 'octave_count': 1},
    'aquifer_barrier': {'base_octave': -3, 'octave_count': 1},
    'aquifer_floodedness': {'base_octave': -7, 'octave_count': 1},
    'aquifer_spread': {'base_octave': -5, 'octave_count': 1},
    'aquifer_lava': {'base_octave': -1, 'octave_count': 1},
    'climate_noise/temperature': {'base_octave': -9, 'octave_count': 3},
    'climate_noise/humidity': {'base_octave': -8, 'octave_count': 2},
    'climate_noise/continents': {'base_octave': -9, 'octave_count': 4},
    'climate_noise/erosion': {'base_octave': -8, 'octave_count': 3},
    'climate_noise/ridges': {'base_octave': -7, 'octave_count': 3},
}

# Vanilla ids the game's surface code reads by name, given values of the fixture's own.
VANILLA_ID_NOISES = {
    'surface': {'base_octave': -6, 'octave_count': 3, 'base_amplitude': 1.8},
    'surface_secondary': {'base_octave': -6, 'octave_count': 4, 'amplitude_modifiers': [1.0, 1.0, 0.0, 1.0]},
    'clay_bands_offset': {'base_octave': -8, 'octave_count': 1},
}

HILLS = nid('hills')
DETAIL = nid('detail')

DENSITY_FUNCTIONS = {
    # Land between about y 32 and y 96 of a 0..128 world, with some 3D roughness.
    'terrain/base': total(ygrad(0, 128), mul(const(0.5), noise(HILLS)), mul(const(0.12), noise(DETAIL, 1.0, 1.0))),
    # Taller, steeper land for the slope and temperature dimensions.
    'terrain/tall': total(ygrad(0, 128, 1.2, -1.2), mul(const(1.1), noise(HILLS, 2.0)),
                          mul(const(0.2), noise(DETAIL, 1.0, 1.0))),
    'climate/temperature': noise(nid('climate_noise/temperature'), 0.25),
    'climate/humidity': noise(nid('climate_noise/humidity'), 0.25),
    'climate/continents': noise(nid('climate_noise/continents'), 0.25),
    'climate/erosion': noise(nid('climate_noise/erosion'), 0.25),
    'climate/ridges': noise(nid('climate_noise/ridges'), 0.25),
    'climate/depth': add(ygrad(0, 128, 1.0, -1.0), mul(const(0.3), noise(nid('climate_noise/continents'), 0.25))),
}

BASE = nid('terrain/base')
TALL = nid('terrain/tall')

BIOMES = {
    'meadow': (0.8, 0.4, True),
    'dune': (2.0, 0.0, False),
    'tundra': (-0.5, 0.5, True),
    'marsh': (0.7, 0.9, True),
    'crag': (0.2, 0.3, True),
    'chill': (0.3, 0.6, True),
}


def biome(temperature, downfall, precipitation, colour):
    return {'carvers': [], 'downfall': downfall, 'effects': {'water_color': colour}, 'features': [],
            'has_precipitation': precipitation, 'temperature': temperature}


DIMENSION_TYPES = {
    'low': (0, 128),
    'deep': (-64, 192),
}


def dimension_type(min_y, height):
    return {'ambient_light': 0.0, 'coordinate_scale': 1.0, 'has_ceiling': False, 'has_ender_dragon_fight': False,
            'has_skylight': True, 'height': height, 'infiniburn': '#minecraft:infiniburn_overworld',
            'logical_height': height, 'min_y': min_y, 'monster_spawn_block_light_limit': 0,
            'monster_spawn_light_level': 0}


NAMED_RULES = {
    'grass_on_floor': cond(stone_depth(), GRASS),
}
NAMED_CONDITIONS = {
    'below_surface_depth': stone_depth(add_surface_depth=True),
}

BIOME_TAGS = {
    'sandy': [nid('dune'), nid('crag')],
}

# --- the dimensions -------------------------------------------------------------------------------------------------


def settings(final, rule, sea=48, lo=0, height=128, router=None, aquifers=None, legacy=False,
             fluid='minecraft:water'):
    r = {'chunk_surface_level': 0, 'continents': 0, 'depth': 0, 'erosion': 0, 'ridges': 0, 'temperature': 0,
         'vegetation': 0}
    if router:
        r.update(router)
    r['final_density'] = final
    out = {'default_block': 'minecraft:stone', 'default_fluid': fluid, 'disable_mob_generation': True,
           'legacy_random_source': legacy, 'material_rule': rule, 'noise': {'height': height, 'min_y': lo},
           'noise_router': r, 'sea_level': sea, 'spawn_target': []}
    if aquifers:
        out['aquifers'] = aquifers
    return out


def fixed(b):
    return {'type': 'minecraft:fixed', 'biome': nid(b)}


def checker(biomes, scale):
    return {'type': 'minecraft:checkerboard', 'biomes': [nid(b) for b in biomes], 'scale': scale}


def noise_dim(settings_id, source, dim_type='low'):
    return {'generator': {'biome_source': source, 'settings': nid('settings/' + settings_id), 'type': 'minecraft:noise'},
            'type': nid(dim_type)}


def sample(scale, dx=0, dz=0):
    """The hills noise at another scale and offset, so terms of one function do not cancel."""
    shift = {}
    if dx:
        shift['shift_x'] = const(dx)
    if dz:
        shift['shift_z'] = const(dz)
    return noise(HILLS, scale, 0.0, **shift)


def interval_select():
    return {'type': 'minecraft:interval_select', 'input': sample(0.6, 300), 'thresholds': [-0.3, 0.0, 0.35],
            'functions': [const(-0.2), sample(1.1, 50), mul(const(0.5), sample(0.8, -90)), const(0.25)]}


def build(target):
    """Every dimension of `target`: name -> (noise settings or None, dimension JSON, what it isolates)."""
    newer = target == 'mc-26.4'
    dims = {}

    def add_dim(name, isolates, final=None, rule=PLAIN_SURFACE, source=None, dim_type='low', **kw):
        s = settings(final, rule, **kw) if final is not None else None
        dims[name] = (s, noise_dim(name, source or fixed('meadow'), dim_type), isolates)

    add_dim('plain', 'noise terrain: gradient, noise, add, mul, constant, a named function, sea level, default '
            'block and fluid; one fixed biome', final=BASE)
    add_dim('plain_legacy', 'the same land with legacy_random_source true', final=BASE, legacy=True)
    add_dim('functions_shape', 'abs, square, cube, half_negative, quarter_negative, squeeze, clamp, negate',
            final=total(ygrad(0, 128),
                        mul(const(0.3), one('abs', sample(1.0))),
                        mul(const(0.25), one('square', sample(0.7, 40))),
                        mul(const(0.2), one('cube', sample(1.3, -60))),
                        mul(const(0.3), one('half_negative', sample(0.9, 0, 80))),
                        mul(const(0.3), one('quarter_negative', sample(1.1, 0, -40))),
                        mul(const(0.3), one('squeeze', mul(const(1.5), sample(0.8, 120)))),
                        {'type': 'minecraft:clamp', 'input': sample(0.5, -130), 'min': -0.15, 'max': 0.2},
                        mul(const(0.15), one('negate', sample(1.7, 17, 33))),
                        const(-0.15)))
    add_dim('functions_choice', 'min, max, range_choice, interval_select (its last function too), lerp, sign',
            final=total(ygrad(0, 128),
                        mul(const(0.4), two('min', sample(1.0), sample(0.7, 40))),
                        mul(const(0.3), two('max', sample(0.9, -70), sample(1.4, 0, 30))),
                        {'type': 'minecraft:range_choice', 'input': sample(0.5, 0, -200), 'min_inclusive': -0.2,
                         'max_exclusive': 0.3, 'when_in_range': mul(const(0.3), sample(1.2, 15)),
                         'when_out_of_range': const(-0.1)},
                        interval_select(),
                        {'type': 'minecraft:lerp', 'alpha': {'type': 'minecraft:clamp', 'input': sample(0.4, 90),
                                                             'min': 0.0, 'max': 1.0},
                         'first': mul(const(0.3), sample(1.6, 5)), 'second': const(-0.1)},
                        mul(const(0.05), one('sign', sample(2.0, -15)))))
    add_dim('functions_rounding', 'floor, ceil, round, truncate (with and without multiple), sqrt, log, pow, div, '
            'reciprocal', final=total(
                ygrad(0, 128),
                mul(const(0.1), one('floor', mul(const(3.0), sample(1.0)))),
                mul(const(0.1), one('ceil', mul(const(3.0), sample(0.8, 40)))),
                one('round', mul(const(0.3), sample(0.9, -50)), multiple=const(0.1)),
                one('truncate', mul(const(0.3), sample(1.2, 0, 60)), multiple=const(0.15)),
                mul(const(0.2), one('sqrt', add(one('abs', sample(0.7, 25)), const(0.01)))),
                mul(const(0.1), one('log', add(one('abs', sample(0.6, -25)), const(0.5)))),
                mul(const(0.2), {'type': 'minecraft:pow', 'base': add(one('abs', sample(1.1, 70)), const(0.1)),
                                 'exponent': const(2.0)}),
                two('div', mul(const(0.3), sample(0.5, 0, -90)), add(one('abs', sample(1.3, 11)), const(1.0))),
                mul(const(0.1), one('reciprocal', add(one('abs', sample(0.9, 0, 45)), const(2.0)))),
                const(-0.15)))
    add_dim('functions_space', 'shift_a, shift_b, shift, noise shift fields, distance_to_point, gradient on x and '
            'z with tiling, slice', final=total(
                ygrad(0, 128),
                mul(const(0.35), noise(HILLS, 1.0, 0.0,
                                       shift_x={'type': 'minecraft:shift_a', 'noise': nid('shift')},
                                       shift_z={'type': 'minecraft:shift_b', 'noise': nid('shift')})),
                mul(const(0.05), {'type': 'minecraft:shift', 'noise': nid('shift')}),
                {'type': 'minecraft:clamp', 'min': -0.25, 'max': 0.3,
                 'input': add(const(0.3), mul(const(-0.01), {'type': 'minecraft:distance_to_point',
                                                             'point': [8, 64, 8], 'metric': 'euclidean'}))},
                const(0.1),
                grad('x', 0, 96, -0.1, 0.1, 'repeat'),
                grad('z', -40, 40, 0.1, -0.1, 'mirrored_repeat'),
                mul(const(0.2), {'type': 'minecraft:slice', 'axis': 'y', 'coordinate': 64,
                                 'input': noise(DETAIL, 1.0, 1.0)})))
    spline = {'type': 'minecraft:spline', 'spline': {
        'coordinate': nid('climate/continents'),
        'points': [
            {'location': -0.6, 'derivative': 0.0, 'value': -0.35},
            {'location': -0.1, 'derivative': 0.4, 'value': {
                'coordinate': nid('climate/erosion'),
                'points': [
                    {'location': -0.5, 'derivative': 0.0, 'value': 0.4},
                    {'location': 0.0, 'derivative': -0.6, 'value': 0.1},
                    {'location': 0.6, 'derivative': 0.2, 'value': -0.1},
                ]}},
            {'location': 0.5, 'derivative': 0.0, 'value': 0.3},
        ]}}
    add_dim('spline', 'spline with a nested spline, named functions as coordinates',
            final=total(ygrad(0, 128), spline, mul(const(0.1), noise(DETAIL, 1.0, 1.0))))
    cell = mul(const(0.5), one('cache', noise(HILLS, 1.0, 0.3)))
    markers_inner = total(ygrad(0, 128), cell, mul(const(0.2), noise(DETAIL, 1.0, 1.0)))
    if newer:
        axis = lambda mode, n: {'cell_size': n, 'mode': mode}  # noqa: E731
        interp = {'type': 'minecraft:upscale', 'input': markers_inner, 'x': axis('interpolate_linear', 4),
                  'y': axis('interpolate_linear', 8), 'z': axis('interpolate_linear', 4)}
        interp_name = 'upscale (linear, as interpolated)'
    else:
        interp = one('interpolated', markers_inner, cell_size_xz=4, cell_size_y=8)
        interp_name = 'interpolated'
    add_dim('markers', f'cache, {interp_name}, blend_alpha, blend_offset, blend_density, beardifier, '
            'old_blended_noise', final=total(
                mul(simple('blend_alpha'), one('blend_density', interp)),
                simple('blend_offset'),
                simple('beardifier'),
                mul(const(0.3), {'type': 'minecraft:old_blended_noise', 'xz_scale': 0.25, 'y_scale': 0.125,
                                 'xz_factor': 80.0, 'y_factor': 160.0, 'smear_scale_multiplier': 8.0})))
    cave = add(mul(const(3.0), one('abs', noise(nid('caves'), 2.0, 2.0))), const(-0.25))
    terrain_deep = total(ygrad(-64, 128, 1.2, -1.2), mul(const(0.4), noise(HILLS)))
    add_dim('aquifers', 'aquifers (barrier, floodedness, spread, lava, exclusion, surface level) in caves below '
            'sea level, a world from y -64', dim_type='deep',
            final=two('min', terrain_deep, cave), lo=-64, height=192, sea=40,
            aquifers={
                'barrier': noise(nid('aquifer_barrier'), 1.0, 0.5),
                'fluid_level_floodedness': noise(nid('aquifer_floodedness'), 1.0, 0.67),
                'fluid_level_spread': noise(nid('aquifer_spread'), 1.0, 0.7142857142857143),
                'lava': noise(nid('aquifer_lava'), 1.0, 1.0),
                'exclusion': const(0.0),
                'surface_level': {'type': 'minecraft:find_top_surface', 'density': terrain_deep,
                                  'upper_bound': const(128.0), 'lower_bound': -64, 'cell_height': 8},
            })
    add_dim('rules_depth', 'sequence, condition, block; stone_depth (floor, ceiling, offset, surface depth, '
            'secondary range), y_above (multiplier, add_stone_depth), water, not', final=total(
                ygrad(0, 128), mul(const(0.5), noise(HILLS)), mul(const(0.25), noise(DETAIL, 1.0, 1.5))),
            rule=seq(
                cond(y_above({'absolute': 84}, 1, True), cond(stone_depth(), block('minecraft:snow_block'))),
                cond(water(-1, 0, False), cond(stone_depth(), GRASS)),
                cond(water(-6, -1, True), cond(stone_depth(add_surface_depth=True), DIRT)),
                cond(stone_depth(add_surface_depth=True, secondary=6), block('minecraft:sand')),
                cond(stone_depth('ceiling', 0, False), block('minecraft:gravel')),
                cond(stone_depth('ceiling', 2, True), block('minecraft:andesite')),
                cond(not_(y_above({'above_bottom': 24}, 0, False)), block('minecraft:deepslate', axis='y')),
                STONE))
    add_dim('rules_noise', 'noise_threshold (2D and 3D), vertical_gradient, a y_above relative to sea level',
            final=BASE, rule=seq(
                cond({'type': 'minecraft:noise_threshold', 'noise': nid('patches'), 'min_threshold': 0.2,
                      'max_threshold': 1.0}, cond(stone_depth(), block('minecraft:podzol', snowy='false'))),
                cond({'type': 'minecraft:noise_threshold', 'noise': nid('patches'), 'min_threshold': -1.0,
                      'max_threshold': -0.3, 'is_3d': True}, block('minecraft:granite')),
                cond({'type': 'minecraft:vertical_gradient', 'random_name': nid('fade'),
                      'true_at_and_below': {'above_bottom': 20}, 'false_at_and_above': {'absolute': 44}},
                     block('minecraft:tuff')),
                cond(y_above({'relative_to_sea_level': 12}, 0, False), cond(stone_depth(), GRASS)),
                cond(stone_depth(), block('minecraft:coarse_dirt')),
                STONE))
    add_dim('rules_biome', 'the biome condition by list and by tag, a named rule and a named condition, over a '
            'checkerboard', final=BASE, source=checker(['meadow', 'dune', 'tundra', 'crag'], 1), rule=seq(
                cond({'type': 'minecraft:biome', 'biome_is': [nid('meadow')]}, nid('grass_on_floor')),
                cond({'type': 'minecraft:biome', 'biome_is': '#' + nid('sandy')},
                     cond(stone_depth(add_surface_depth=True), block('minecraft:sand'))),
                cond({'type': 'minecraft:biome', 'biome_is': [nid('tundra')]},
                     cond(nid('below_surface_depth'), block('minecraft:snow_block'))),
                STONE))
    add_dim('rules_preliminary', 'above_preliminary_surface over the router chunk_surface_level (find_top_surface)',
            final=total(ygrad(0, 128), mul(const(0.5), noise(HILLS)), mul(const(0.3), noise(DETAIL, 1.0, 1.0))),
            router={'chunk_surface_level': {'type': 'minecraft:find_top_surface', 'density': BASE,
                                            'upper_bound': const(120.0), 'lower_bound': 0, 'cell_height': 4}},
            rule=seq(
                cond(simple('above_preliminary_surface'), cond(stone_depth(), GRASS)),
                cond(simple('above_preliminary_surface'), block('minecraft:moss_block')),
                cond(stone_depth(), block('minecraft:mud')),
                STONE))
    add_dim('rule_bandlands', 'the bandlands rule', final=TALL, rule=seq(
        cond(stone_depth(), block('minecraft:red_sand')),
        cond(y_above({'absolute': 40}, 0, False), simple('bandlands')),
        STONE))
    add_dim('rule_ore_vein', 'the ore_vein rule underground', final=BASE, rule=seq(
        cond(stone_depth(), GRASS),
        cond(not_(y_above({'absolute': 60}, 0, False)), {
            'type': 'minecraft:ore_vein', 'ore_block': 'minecraft:copper_ore',
            'raw_ore_block': 'minecraft:raw_copper_block', 'filler_block': 'minecraft:granite',
            'raw_ore_chance': 0.05,
            'density': mul(const(1.5), noise(nid('ore'), 1.5, 1.5)),
            'richness': add(const(0.3), mul(const(0.3), noise(nid('ore'), 0.7, 0.7))),
            'filler_gap': noise(nid('ore_gap'), 1.0, 1.0)}),
        STONE))
    add_dim('condition_hole', 'the hole condition', final=BASE, rule=seq(
        cond(simple('hole'), block('minecraft:coarse_dirt')),
        cond(stone_depth(), GRASS),
        STONE))
    add_dim('condition_steep', 'the steep condition on tall, steep land', final=TALL, rule=seq(
        cond(simple('steep'), cond(stone_depth(add_surface_depth=True), block('minecraft:cobblestone'))),
        cond(stone_depth(), GRASS),
        STONE))
    add_dim('condition_temperature', 'the temperature condition over biomes near freezing on tall land',
            final=TALL, source=checker(['tundra', 'crag', 'chill', 'meadow'], 2), rule=seq(
                cond(simple('temperature'), cond(stone_depth(), block('minecraft:snow_block'))),
                cond(stone_depth(), GRASS),
                STONE))
    add_dim('source_checkerboard', 'a checkerboard biome source (scale 2, four biomes)', final=BASE,
            source=checker(['meadow', 'dune', 'tundra', 'marsh'], 2))
    climate = {'temperature': nid('climate/temperature'), 'vegetation': nid('climate/humidity'),
               'continents': nid('climate/continents'), 'erosion': nid('climate/erosion'),
               'depth': nid('climate/depth'), 'ridges': nid('climate/ridges')}

    def point(b, t, h, c, e, d, w, offset=0.0):
        return {'biome': nid(b), 'parameters': {'temperature': t, 'humidity': h, 'continentalness': c,
                                                'erosion': e, 'depth': d, 'weirdness': w, 'offset': offset}}

    multi = {'type': 'minecraft:multi_noise', 'biomes': [
        point('meadow', [-0.2, 0.3], 0.0, 0.1, 0.0, 0.0, 0.0),
        point('dune', 0.6, [-0.8, -0.2], 0.2, -0.1, 0.0, 0.1),
        point('tundra', -0.6, 0.1, [0.0, 0.5], 0.2, 0.0, -0.2),
        point('marsh', 0.2, 0.6, -0.2, [0.3, 0.8], 0.0, 0.0, 0.05),
        point('crag', 0.0, -0.2, 0.5, -0.5, [0.2, 1.0], 0.3),
        point('chill', -0.3, 0.4, 0.0, 0.0, -0.2, [-0.6, -0.1], 0.1),
    ]}
    add_dim('source_multi_noise', 'a multi_noise biome source with a list of its own over the router\'s climate '
            'functions (depth from height)', final=BASE, router=climate, source=multi)
    flat = {'generator': {'settings': {'biome': nid('meadow'), 'features': False, 'lakes': False, 'layers': [
        {'block': 'minecraft:bedrock', 'height': 1}, {'block': 'minecraft:stone', 'height': 30},
        {'block': 'minecraft:air', 'height': 4}, {'block': 'minecraft:dirt', 'height': 3},
        {'block': 'minecraft:grass_block', 'height': 1}]}, 'type': 'minecraft:flat'}, 'type': nid('low')}
    dims['flat'] = (None, flat, 'a flat generator: layers stacked from the bottom, an air layer, its biome')

    if newer:
        up_input = add(ygrad(0, 128, 4.0, -4.0), mul(const(2.0), noise(HILLS, 1.0, 0.5)))

        def upscale(x, y, z):
            ax = lambda m, n: {'cell_size': n, 'mode': m}  # noqa: E731
            return {'type': 'minecraft:upscale', 'input': up_input, 'x': ax(*x), 'y': ax(*y), 'z': ax(*z)}

        modes = {
            'upscale_linear': ('interpolate_linear', 'every axis interpolate_linear'),
            'upscale_nearest': ('nearest_neighbor', 'every axis nearest_neighbor'),
            'upscale_cosine': ('interpolate_cosine', 'every axis interpolate_cosine'),
            'upscale_cubic': ('interpolate_cubic', 'every axis interpolate_cubic'),
            'upscale_b_spline': ('b_spline_cubic', 'every axis b_spline_cubic'),
        }
        for name, (mode, what) in modes.items():
            add_dim(name, f'upscale, {what} (cells 8, 4, 8)', final=upscale((mode, 8), (mode, 4), (mode, 8)),
                    rule=STONE)
        add_dim('upscale_mixed', 'upscale with a mode and cell size of its own on each axis',
                final=upscale(('nearest_neighbor', 4), ('interpolate_cosine', 8), ('interpolate_linear', 16)),
                rule=STONE)
        add_dim('warp_constant', 'domain_warp with constant offsets', rule=STONE,
                final={'type': 'minecraft:domain_warp', 'input': up_input, 'offset_x': const(16.0),
                       'offset_y': const(3.0), 'offset_z': const(-8.0)})
        add_dim('warp_function', 'domain_warp with functions as offsets', rule=STONE,
                final={'type': 'minecraft:domain_warp', 'input': up_input,
                       'offset_x': mul(const(12.0), noise(DETAIL, 1.0, 0.0)),
                       'offset_z': mul(const(24.0), noise(nid('patches'), 1.0, 0.0))})
    return dims


# --- writing ----------------------------------------------------------------------------------------------------------

def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write('\n')


def for_target(target, data):
    """Noise settings shaped for the target: 26.4 noise settings have no default_block (the rules end in a block)."""
    if target == 'mc-26.4' and isinstance(data, dict) and 'default_block' in data:
        data = dict(data)
        del data['default_block']
    return data


def write_target(target):
    root = os.path.join(HERE, target)
    shutil.rmtree(root, ignore_errors=True)
    files = []  # (kind, namespace, folder, path, data, notes)
    for name, n in sorted(NOISES.items()):
        files.append(('minecraft:worldgen/noise', NS, 'worldgen/noise', name, n, 'A noise of the fixture.'))
    for name, n in sorted(VANILLA_ID_NOISES.items()):
        files.append(('minecraft:worldgen/noise', 'minecraft', 'worldgen/noise', name, n,
                      'The fixture\'s own values for a noise id the game\'s surface code reads by name, so no '
                      'fixture world depends on a vanilla file.'))
    for name, fn in sorted(DENSITY_FUNCTIONS.items()):
        files.append(('minecraft:worldgen/density_function', NS, 'worldgen/density_function', name, fn,
                      'A named density function of the fixture.'))
    for name, (t, d, p) in sorted(BIOMES.items()):
        colour = 4159204 + sorted(BIOMES).index(name) * 4096
        files.append(('minecraft:worldgen/biome', NS, 'worldgen/biome', name, biome(t, d, p, colour),
                      'A biome of the fixture: no carvers, no features.'))
    for name, values in sorted(BIOME_TAGS.items()):
        files.append(('minecraft:tag/worldgen/biome', NS, 'tags/worldgen/biome', name, {'values': values},
                      'A biome tag the rules_biome dimension tests by name.'))
    for name, (lo, h) in sorted(DIMENSION_TYPES.items()):
        files.append(('minecraft:dimension_type', NS, 'dimension_type', name, dimension_type(lo, h),
                      f'A dimension type of the fixture: y {lo} to {lo + h - 1}.'))
    for name, rule in sorted(NAMED_RULES.items()):
        files.append(('minecraft:worldgen/material_rule', NS, 'worldgen/material_rule', name, rule,
                      'A named rule the rules_biome dimension refers to by id.'))
    for name, c in sorted(NAMED_CONDITIONS.items()):
        files.append(('minecraft:worldgen/material_condition', NS, 'worldgen/material_condition', name, c,
                      'A named condition the rules_biome dimension refers to by id.'))
    dims = build(target)
    for name, (s, dim, isolates) in sorted(dims.items()):
        if s is not None:
            files.append(('minecraft:worldgen/noise_settings', NS, 'worldgen/noise_settings', 'settings/' + name,
                          for_target(target, s), f'The noise settings of the dimension {nid(name)}: {isolates}.'))
        files.append(('minecraft:dimension', NS, 'dimension', name, dim, f'Isolates {isolates}.'))
    for kind, ns, folder, path, data, notes in files:
        element = {'data': data, 'formatVersion': 1, 'id': f'{ns}:{path}', 'kind': kind,
                   'meta': {'createdAt': CREATED, 'notes': notes}}
        dump(os.path.join(root, 'content', ns, folder, path + '.json'), element)
        dump(os.path.join(root, 'lowered', 'data', ns, folder, path + '.json'), data)
    dump(os.path.join(root, 'msm.project.json'), {
        'formatVersion': 1, 'name': 'Worldgen Parity', 'namespaces': ['minecraft', NS],
        'plugins': ['msm.datapack', 'msm.worldgen'], 'settings': {}, 'targets': [target]})
    return dims


def main():
    table = {}
    for target in TARGETS:
        dims = write_target(target)
        for name, (_, _, isolates) in dims.items():
            table.setdefault(name, [isolates, []])[1].append(target)
    if '--table' in sys.argv:
        for name, (isolates, targets) in sorted(table.items()):
            print(f'| `{nid(name)}` | {isolates} | {", ".join(targets)} |')


if __name__ == '__main__':
    main()
