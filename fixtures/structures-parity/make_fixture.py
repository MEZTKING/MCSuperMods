# Writes the structures parity fixture (ADR 0122 D9, plan brief B639): the MSM project `structures_parity`
# (msm.project.json and content/), then runs lower.ts, which lowers it with MSM's own kinds into
# lowered/<target>/data/ for every built-in target (templates become .nbt with that target's DataVersion).
#
# Every file is MSM's own, written from the data format (the targets' vendored mcdoc) and the findings of the spike
# B634 (docs/reference/spikes/b634/README.md), never copied from vanilla: structure templates (jigsaw blocks and a
# processor sample), template pools, jigsaw structures, structure sets (one structure per set), processor lists, one
# feature and placed feature, and an empty biome tag. The templates rebuild the shapes of `@msm/terrain`'s in-memory
# test fixtures (packages/terrain/test/structures/fixtures.ts, namespace `fx` there) so that B641 can play the same
# files. Blocks are vanilla block ids (not files); the loot table named by `append_loot` is only an id.
#
# Run from the repository root:
#   python3 fixtures/structures-parity/make_fixture.py
# then rerun the GameTest with -PupdateStructuresParity on both versions (README.md).
import json
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
NS = 'structures_parity'
CREATED = '2026-11-23T00:00:00.000Z'
EMPTY = 'minecraft:empty'
# The processor sample's floor lies at this world y (its structures start at y + 1, J16).
PROC_FLOOR = 199

ELEMENTS = []  # (kind, folder, id, data, notes)


def nid(path):
    return f'{NS}:{path}'


# Ids are unique across kinds in an MSM project: templates take the bare name, every other kind a folder of its own.
def pid(name):
    return nid(f'pool/{name}')


def sid(name):
    return nid(f'structure/{name}')


def lid(name):
    return nid(f'processors/{name}')


def add(kind, folder, ident, data, notes):
    ELEMENTS.append((kind, folder, ident, data, notes))


# --- templates --------------------------------------------------------------------------------------------------------

def jig(pos, orientation, name=EMPTY, target=EMPTY, pool=EMPTY, joint='rollable', sp=0, pp=0,
        final_state='minecraft:air'):
    return {'pos': list(pos), 'orientation': orientation, 'name': name, 'target': target, 'pool': pool,
            'joint': joint, 'selection_priority': sp, 'placement_priority': pp, 'final_state': final_state}


def template(path, size, jigsaws, blocks=(), notes=''):
    """A template of jigsaw blocks (and any extra `(pos, state)` blocks); every other cell is structure void."""
    palette = []
    cells = []

    def index(state):
        if state not in palette:
            palette.append(state)
        return palette.index(state)

    for j in jigsaws:
        cells.append((tuple(j['pos']), index(f"minecraft:jigsaw[orientation={j['orientation']}]")))
    for pos, state in blocks:
        cells.append((tuple(pos), index(state)))
    cells.sort(key=lambda c: (c[0][1], c[0][2], c[0][0]))
    data = {'size': list(size), 'palette': palette, 'blocks': [[p[0], p[1], p[2], i] for p, i in cells]}
    if jigsaws:
        data['jigsaws'] = sorted(
            ({k: v for k, v in j.items() if k != 'orientation'} for j in jigsaws),
            key=lambda j: (j['pos'][1], j['pos'][2], j['pos'][0]))
    add('minecraft:structure_template', 'structure', nid(path), data,
        notes or f'Jigsaw template {path} ({size[0]} by {size[1]} by {size[2]}).')


H = {'name': nid('hub'), 'target': nid('arm'), 'pool': pid('arms')}


def hub(path, **o):
    opts = dict(H, **o)
    template(path, (7, 3, 7), [jig((3, 1, 0), 'north_up', **opts), jig((6, 1, 3), 'east_up', **opts),
                               jig((3, 1, 6), 'south_up', **opts), jig((0, 1, 3), 'west_up', **opts)],
             notes='A 7 by 3 by 7 hub with a jigsaw in the middle of each side.')


def arm(path, name=nid('arm'), target=nid('hub')):
    template(path, (5, 3, 3), [jig((0, 1, 1), 'west_up', name=name, target=target)])


SEG = nid('seg')
STREET_OUT = {'target': nid('street'), 'pool': pid('streets')}
HOUSE_OUT = {'target': nid('house'), 'pool': pid('houses')}

# match, back, weights (J1 to J3, J5 to J9)
hub('hub_match')
hub('hub_back', pool=pid('back_arms'))
hub('hub_w', pool=pid('wpool'))
arm('arm_ok')
arm('arm_name', nid('wrong'))
arm('arm_tgt', nid('arm'), nid('other'))
template('arm_vert', (5, 3, 3), [jig((0, 0, 1), 'down_north', name=nid('arm'))])
template('arm_two', (5, 3, 3), [jig((0, 1, 1), 'west_up', name=nid('arm')), jig((2, 1, 0), 'north_up', name=nid('arm'))])
template('arm_back', (8, 3, 3), [jig((3, 1, 1), 'west_up', name=nid('arm'))])
arm('arm_fb')
arm('arm_w3')
arm('arm_w1')
# chains (J11, J12)
template('cstart', (3, 3, 3), [jig((2, 1, 1), 'east_up', name=nid('cstart'), target=SEG, pool=pid('segs'))])
template('seg', (5, 3, 3), [jig((0, 1, 1), 'west_up', name=SEG),
                            jig((4, 1, 1), 'east_up', name=nid('seg_out'), target=SEG, pool=pid('segs'))])
template('cap', (2, 3, 3), [jig((0, 1, 1), 'west_up', name=SEG)])
template('cstart2', (3, 3, 3), [jig((2, 1, 1), 'east_up', target=SEG, pool=pid('segs2'))])
template('cstart4', (4, 3, 3), [jig((3, 1, 1), 'east_up', target=SEG, pool=pid('segs2'))])
template('seg2', (2, 3, 3), [jig((0, 1, 1), 'west_up', name=SEG), jig((1, 1, 1), 'east_up', target=SEG, pool=pid('segs2'))])
template('fbstart', (3, 3, 3), [jig((2, 1, 1), 'east_up', target=SEG, pool=pid('fblong'))])
template('long', (40, 3, 3), [jig((0, 1, 1), 'west_up', name=SEG)])
# vertical chains (J13)
template('vstart', (3, 3, 3), [jig((1, 2, 1), 'up_north', target=nid('vseg'), pool=pid('vsegs'))])
template('vstart4', (3, 4, 3), [jig((1, 3, 1), 'up_north', target=nid('vseg'), pool=pid('vsegs2'))])
template('vstart6', (3, 6, 3), [jig((1, 5, 1), 'up_north', target=nid('vseg'), pool=pid('vsegs2'))])
template('vseg', (3, 5, 3), [jig((1, 0, 1), 'down_north', name=nid('vseg')),
                             jig((1, 4, 1), 'up_north', target=nid('vseg'), pool=pid('vsegs'))])
template('vseg2', (3, 2, 3), [jig((1, 0, 1), 'down_north', name=nid('vseg')),
                              jig((1, 1, 1), 'up_north', target=nid('vseg'), pool=pid('vsegs2'))])
# inside the parent (J10)
for shell, inners in (('shell', 'inners'), ('shell_big', 'inners_big'), ('shell_tall', 'inners_tall')):
    template(shell, (9, 6, 9), [jig((4, 0, 4), 'up_north', target=nid('inner'), pool=pid(inners))])
template('inner', (3, 3, 3), [jig((1, 0, 1), 'down_north', name=nid('inner'))])
template('inner_big', (9, 3, 9), [jig((4, 0, 4), 'down_north', name=nid('inner'))])
template('inner_tall', (3, 6, 3), [jig((1, 0, 1), 'down_north', name=nid('inner'))])
# overlap and selection priority (J9, J14)
for path, left, right in (('whub', 0, 0), ('whub_spl', 1, 0), ('whub_spr', 0, 1)):
    template(path, (5, 3, 3), [jig((0, 1, 0), 'north_up', target=nid('w'), pool=pid('wides'), sp=left),
                               jig((4, 1, 0), 'north_up', target=nid('w'), pool=pid('wides'), sp=right)])
template('wide', (7, 3, 3), [jig((3, 1, 2), 'south_up', name=nid('w'))])
template('narrow', (1, 3, 3), [jig((0, 1, 2), 'south_up', name=nid('w'))])
# placement priority (J15)
for path, east, west, east_pool in (('phub_eq', 0, 0, 'parms'), ('phub_pe', 1, 0, 'parms'),
                                    ('phub_pw', 0, 1, 'parms'), ('phub_ce', 0, 0, 'parms_hi')):
    template(path, (3, 3, 3), [jig((2, 1, 1), 'east_up', target=nid('parm'), pool=pid(east_pool), pp=east),
                               jig((0, 1, 1), 'west_up', target=nid('parm'), pool=pid('parms'), pp=west)])
template('parm', (3, 3, 3), [jig((0, 1, 1), 'west_up', name=nid('parm')),
                             jig((1, 2, 1), 'up_north', target=nid('pbig'), pool=pid('pbigs'))])
template('parm_hi', (3, 3, 3), [jig((0, 1, 1), 'west_up', name=nid('parm'), pp=1),
                                jig((1, 2, 1), 'up_north', target=nid('pbig'), pool=pid('pbigs'))])
template('pbig', (31, 3, 31), [jig((15, 0, 15), 'down_north', name=nid('pbig'))])
# the joint (J4)
template('vhub', (9, 1, 9), [
    jig((1, 0, 1), 'up_north', target=nid('tower'), pool=pid('towers_a'), joint='aligned'),
    jig((7, 0, 1), 'up_north', target=nid('tower'), pool=pid('towers_r'), joint='aligned'),
    jig((1, 0, 7), 'up_north', target=nid('tower'), pool=pid('towers_a'), joint='rollable'),
    jig((7, 0, 7), 'up_north', target=nid('tower'), pool=pid('towers_r'), joint='rollable')])
template('tower_a', (1, 5, 1), [jig((0, 0, 0), 'down_north', name=nid('tower'), joint='aligned')])
template('tower_r', (1, 5, 1), [jig((0, 0, 0), 'down_north', name=nid('tower'), joint='rollable')])
# the lattices (spike 4S7: 113 and 841 pieces; the 3D lattice of B637's tests)
template('grid', (5, 3, 5), [jig(p, o, name=nid('grid'), target=nid('grid'), pool=pid('grids')) for p, o in (
    ((2, 1, 0), 'north_up'), ((4, 1, 2), 'east_up'), ((2, 1, 4), 'south_up'), ((0, 1, 2), 'west_up'))])
template('cube', (5, 5, 5), [jig(p, o, name=nid('cube'), target=nid('cube'), pool=pid('cubes')) for p, o in (
    ((2, 2, 0), 'north_up'), ((4, 2, 2), 'east_up'), ((2, 2, 4), 'south_up'), ((0, 2, 2), 'west_up'),
    ((2, 4, 2), 'up_north'), ((2, 0, 2), 'down_north'))])
# list and feature elements (J18)
template('mhub', (5, 3, 5), [jig((4, 1, 2), 'east_up', target=nid('l'), pool=pid('lists')),
                             jig((2, 2, 2), 'up_north', target='minecraft:bottom', pool=pid('feats'))])
template('l1', (3, 3, 3), [jig((0, 1, 1), 'west_up', name=nid('l'))])
template('l2', (2, 4, 2), [], blocks=[((1, 3, 1), 'minecraft:red_wool')],
         notes='The second template of the list element: no jigsaw, one marker block.')
# a small town of streets, houses and furniture: every rule at once over many seeds
template('plaza', (9, 1, 9), [jig((4, 0, 0), 'north_up', **STREET_OUT), jig((8, 0, 4), 'east_up', **STREET_OUT),
                              jig((4, 0, 8), 'south_up', **STREET_OUT), jig((0, 0, 4), 'west_up', **STREET_OUT)])
template('street', (3, 1, 9), [jig((1, 0, 0), 'north_up', name=nid('street')), jig((1, 0, 8), 'south_up', **STREET_OUT),
                               jig((0, 0, 4), 'west_up', **HOUSE_OUT), jig((2, 0, 4), 'east_up', **HOUSE_OUT)])
template('crossing', (3, 1, 3), [jig((1, 0, 0), 'north_up', name=nid('street')), jig((1, 0, 2), 'south_up', **STREET_OUT),
                                 jig((0, 0, 1), 'west_up', **STREET_OUT),
                                 jig((2, 0, 1), 'east_up', sp=1, pp=1, **STREET_OUT)])
template('street_end', (3, 1, 1), [jig((1, 0, 0), 'north_up', name=nid('street'))])
template('house_small', (5, 4, 5), [jig((2, 0, 0), 'north_up', name=nid('house')),
                                    jig((2, 0, 2), 'up_north', target=nid('decor'), pool=pid('decor'), joint='aligned')])
template('house_big', (9, 6, 7), [jig((4, 0, 0), 'north_up', name=nid('house')),
                                  jig((2, 0, 3), 'up_north', target=nid('decor'), pool=pid('decor')),
                                  jig((6, 0, 3), 'up_north', target=nid('decor'), pool=pid('decor'))])
template('table', (1, 1, 1), [jig((0, 0, 0), 'down_north', name=nid('decor'))])
template('bed', (1, 1, 2), [jig((0, 0, 0), 'down_north', name=nid('decor'))])

# The processor sample (spike B634 4S5): 8 by 4 by 8. y 0: a floor of stone; y 1 and 2: a checkerboard of the 40
# candidate blocks among air; y 3: three corner markers, a jigsaw with a final state of its own, air at x 4 to 7 and
# structure void at x 0 to 3.
CANDIDATES = [
    'minecraft:andesite', 'minecraft:blackstone', 'minecraft:bricks', 'minecraft:chest[facing=north,type=single]',
    'minecraft:chiseled_stone_bricks', 'minecraft:cobbled_deepslate', 'minecraft:cobblestone',
    'minecraft:cobblestone_slab[type=bottom]', 'minecraft:cobblestone_stairs[facing=north,half=bottom,shape=straight]',
    'minecraft:cobblestone_wall', 'minecraft:cracked_deepslate_bricks', 'minecraft:cracked_stone_bricks',
    'minecraft:deepslate_bricks', 'minecraft:diamond_block', 'minecraft:dirt', 'minecraft:emerald_block',
    'minecraft:gold_block', 'minecraft:granite', 'minecraft:gravel', 'minecraft:iron_bars',
    'minecraft:mossy_cobblestone', 'minecraft:mossy_stone_bricks', 'minecraft:oak_log[axis=y]', 'minecraft:oak_planks',
    'minecraft:obsidian', 'minecraft:polished_andesite', 'minecraft:polished_blackstone_bricks', 'minecraft:sand',
    'minecraft:sandstone', 'minecraft:smooth_stone', 'minecraft:smooth_stone_slab[type=bottom]', 'minecraft:stone',
    'minecraft:stone_brick_slab[type=bottom]', 'minecraft:stone_brick_stairs[facing=north,half=bottom,shape=straight]',
    'minecraft:stone_brick_wall', 'minecraft:stone_bricks', 'minecraft:stone_button[face=floor,facing=north]',
    'minecraft:stone_pressure_plate', 'minecraft:stone_slab[type=bottom]',
    'minecraft:stone_stairs[facing=north,half=bottom,shape=straight]',
]
assert len(CANDIDATES) == 40


def sample_blocks():
    blocks = []
    n = 0
    for y in (1, 2):
        for z in range(8):
            for x in range(8):
                if (x + z) % 2 == 0:
                    blocks.append(((x, y, z), CANDIDATES[n % len(CANDIDATES)]))
                    n += 1
                else:
                    blocks.append(((x, y, z), 'minecraft:air'))
    for z in range(8):
        for x in range(8):
            blocks.append(((x, 0, z), 'minecraft:stone'))
    markers = {(0, 3, 0): 'minecraft:red_wool', (7, 3, 0): 'minecraft:blue_wool', (0, 3, 7): 'minecraft:yellow_wool'}
    for z in range(8):
        for x in range(8):
            pos = (x, 3, z)
            if pos in markers:
                blocks.append((pos, markers[pos]))
            elif pos == (6, 3, 6):
                continue  # the jigsaw
            elif x >= 4:
                blocks.append((pos, 'minecraft:air'))
    return blocks


template('sample', (8, 4, 8), [jig((6, 3, 6), 'up_north', final_state='minecraft:sea_lantern')], blocks=sample_blocks(),
         notes='The processor sample: a stone floor, the 40 candidate blocks on a checkerboard among air (y 1 and 2), '
               'three corner markers (red at 0 3 0, blue at 7 3 0, yellow at 0 3 7), a jigsaw whose final state is '
               'a sea lantern at 6 3 6, air at x 4 to 7 of the top layer and structure void at x 0 to 3.')

# --- pools ------------------------------------------------------------------------------------------------------------


def single(location, weight=1, processors=EMPTY, element_type='minecraft:single_pool_element'):
    return {'weight': weight, 'element': {'element_type': element_type, 'location': nid(location),
                                          'processors': processors, 'projection': 'rigid'}}


def empty_element(weight=1):
    return {'weight': weight, 'element': {'element_type': 'minecraft:empty_pool_element'}}


def pool(path, elements, fallback=EMPTY, notes=''):
    add('minecraft:worldgen/template_pool', 'worldgen/template_pool', pid(path),
        {'fallback': fallback, 'elements': elements}, notes or f'Template pool {path}.')


pool('start_match', [single('hub_match')])
pool('arms', [single(t) for t in ('arm_ok', 'arm_name', 'arm_tgt', 'arm_vert', 'arm_two')],
     notes='Five arms; only arm_ok, arm_tgt and arm_two can join a hub (J1, J3, J5).')
pool('start_back', [single('hub_back')])
pool('back_arms', [single('arm_back')], pid('fb_arms'), notes='An arm that reaches back into its hub; its fallback.')
pool('fb_arms', [single('arm_fb')])
pool('start_w', [single('hub_w')])
pool('wpool', [single('arm_w3', 3), single('arm_w1', 1), empty_element(1)], notes='Weights 3, 1 and an empty element 1.')
pool('start_chain', [single('cstart')])
pool('segs', [single('seg')], pid('caps'))
pool('caps', [single('cap')])
pool('start_chain2', [single('cstart2')])
pool('start_chain4', [single('cstart4')])
pool('segs2', [single('seg2')])
pool('start_fb', [single('fbstart')])
pool('fblong', [single('long')], pid('segs'), notes='A piece too long for the distance; its fallback is the segments.')
pool('start_v', [single('vstart')])
pool('start_v4', [single('vstart4')])
pool('start_v6', [single('vstart6')])
pool('vsegs', [single('vseg')])
pool('vsegs2', [single('vseg2')])
for shell in ('shell', 'shell_big', 'shell_tall'):
    pool(f'start_{shell}', [single(shell)])
pool('inners', [single('inner')])
pool('inners_big', [single('inner_big')])
pool('inners_tall', [single('inner_tall')])
for whub in ('whub', 'whub_spl', 'whub_spr'):
    pool(f'start_{whub}', [single(whub)])
pool('wides', [single('wide')], pid('narrows'))
pool('narrows', [single('narrow')])
for k in ('eq', 'pe', 'pw', 'ce'):
    pool(f'start_phub_{k}', [single(f'phub_{k}')])
pool('parms', [single('parm')])
pool('parms_hi', [single('parm_hi')])
pool('pbigs', [single('pbig')])
pool('start_joint', [single('vhub')])
pool('towers_a', [single('tower_a')])
pool('towers_r', [single('tower_r')])
pool('start_grid', [single('grid')])
pool('grids', [single('grid')])
pool('start_cube', [single('cube')])
pool('cubes', [single('cube')])
pool('start_misc', [single('mhub')])
pool('lists', [{'weight': 1, 'element': {
    'element_type': 'minecraft:list_pool_element', 'projection': 'rigid',
    'elements': [single('l1')['element'], single('l2')['element']]}}], notes='One list element of l1 and l2.')
pool('feats', [{'weight': 1, 'element': {'element_type': 'minecraft:feature_pool_element', 'projection': 'rigid',
                                         'feature': nid('placed/marker')}}], notes='One feature element.')
pool('town', [single('plaza')])
pool('streets', [single('street', 4), single('crossing', 2)], pid('street_ends'))
pool('street_ends', [single('street_end')])
pool('houses', [single('house_small', 3), single('house_big', 1), empty_element(2)])
pool('decor', [single('table'), single('bed'), empty_element(1)])

# --- the feature of the feature element ------------------------------------------------------------------------------

add('minecraft:worldgen/feature', 'worldgen/feature', nid('feature/marker'),
    {'type': 'minecraft:simple_block', 'to_place': {'type': 'minecraft:simple', 'state': 'minecraft:gold_block'}},
    'A single gold block, the feature of the misc structure\'s feature element.')
add('minecraft:worldgen/placed_feature', 'worldgen/placed_feature', nid('placed/marker'),
    {'feature': nid('feature/marker'), 'placement': []}, 'The marker feature, placed as it is.')

# --- processor lists --------------------------------------------------------------------------------------------------


def state(block, **properties):
    return {'id': block, 'properties': properties} if properties else block


def rule(input_predicate, output, location=None, position=None, modifier=None):
    r = {'input_predicate': input_predicate,
         'location_predicate': location or {'predicate_type': 'minecraft:always_true'},
         'output_state': output}
    if position is not None:
        r['position_predicate'] = position
    if modifier is not None:
        r['block_entity_modifier'] = modifier
    return r


def match(block):
    return {'predicate_type': 'minecraft:block_match', 'block': block}


def rules(*rs):
    return {'processor_type': 'minecraft:rule', 'rules': list(rs)}


STAIRS = state('minecraft:stone_brick_stairs', facing='north', half='bottom', shape='straight', waterlogged='false')

PROCESSORS = {
    'none': ([], 'No processor at all: the template as the game places it (the inputs of every other list).'),
    'nop': ([{'processor_type': 'minecraft:nop'}], 'nop.'),
    'ignore': ([{'processor_type': 'minecraft:block_ignore', 'blocks': ['minecraft:stone', 'minecraft:air']}],
               'block_ignore of stone and air.'),
    'rot50': ([{'processor_type': 'minecraft:block_rot', 'integrity': 0.5}], 'block_rot at integrity 0.5.'),
    'rot50_tag': ([{'processor_type': 'minecraft:block_rot', 'integrity': 0.5,
                    'rottable_blocks': '#minecraft:stone_bricks'}], 'block_rot at 0.5 of the stone bricks tag only.'),
    'rule_block': ([rules(rule(match('minecraft:stone'), 'minecraft:iron_block'))], 'rule: block_match.'),
    'rule_state': ([rules(rule({'predicate_type': 'minecraft:blockstate_match', 'block_state': STAIRS},
                               'minecraft:gold_block'))], 'rule: blockstate_match of one stair state.'),
    'rule_tag': ([rules(rule({'predicate_type': 'minecraft:tag_match', 'tag': 'minecraft:stone_bricks'},
                             'minecraft:diamond_block'))], 'rule: tag_match.'),
    'rule_two': ([rules(rule(match('minecraft:stone'), 'minecraft:iron_block'),
                        rule(match('minecraft:stone'), 'minecraft:gold_block'))],
                 'rule: two rules for the same block; the first wins.'),
    'two_lists': ([rules(rule(match('minecraft:stone'), 'minecraft:iron_block')),
                   rules(rule(match('minecraft:iron_block'), 'minecraft:gold_ore'))],
                  'Two rule processors in order: stone to iron block, then iron block to gold ore.'),
    'rule_rand': ([rules(rule({'predicate_type': 'minecraft:random_block_match', 'block': 'minecraft:stone',
                               'probability': 0.3}, 'minecraft:iron_block'))], 'rule: random_block_match at 0.3.'),
    'rule_rstate': ([rules(rule({'predicate_type': 'minecraft:random_blockstate_match', 'block_state': STAIRS,
                                 'probability': 0.5}, 'minecraft:gold_block'))],
                    'rule: random_blockstate_match at 0.5.'),
    'rule_allof': ([rules(rule({'predicate_type': 'minecraft:all_of', 'rules': [
        {'predicate_type': 'minecraft:tag_match', 'tag': 'minecraft:stone_bricks'},
        {'predicate_type': 'minecraft:not', 'rule': match('minecraft:stone_bricks')}]}, 'minecraft:emerald_block'))],
                   'rule: all_of a tag and not one of its blocks.'),
    'rule_anyof': ([rules(rule({'predicate_type': 'minecraft:any_of', 'rules': [
        match('minecraft:dirt'), match('minecraft:sand')]}, 'minecraft:obsidian'))], 'rule: any_of two blocks.'),
    'rule_height': ([rules(rule({'predicate_type': 'minecraft:height_match', 'min_inclusive': PROC_FLOOR,
                                 'max_inclusive': PROC_FLOOR}, 'minecraft:gold_block'))],
                    f'rule: height_match of world y {PROC_FLOOR} (the sample\'s floor).'),
    'rule_loc': ([rules(rule({'predicate_type': 'minecraft:always_true'}, 'minecraft:tnt',
                             location=match('minecraft:water')))],
                 'rule: a location predicate (the world\'s block); placed over water.'),
    'rule_pos': ([rules(rule(match('minecraft:stone'), 'minecraft:iron_block', position={
        'predicate_type': 'minecraft:axis_aligned_linear_pos', 'axis': 'x', 'min_dist': 0, 'max_dist': 7,
        'min_chance': 0.0, 'max_chance': 1.0}))], 'rule: axis_aligned_linear_pos along x, 0 to 7.'),
    'protected': ([{'processor_type': 'minecraft:protected_blocks', 'value': '#minecraft:features_cannot_replace'}],
                  'protected_blocks; placed over bedrock.'),
    'blackstone': ([{'processor_type': 'minecraft:blackstone_replace'}], 'blackstone_replace.'),
    'capped': ([{'processor_type': 'minecraft:capped', 'limit': 5,
                 'delegate': rules(rule(match('minecraft:stone'), 'minecraft:iron_block'))}],
               'capped at 5 over a rule of stone to iron block.'),
    'capped_u': ([{'processor_type': 'minecraft:capped',
                   'limit': {'type': 'minecraft:uniform', 'min_inclusive': 2, 'max_inclusive': 6},
                   'delegate': rules(rule(match('minecraft:stone'), 'minecraft:iron_block'))}],
                 'capped at a uniform 2 to 6 over the same rule.'),
    'age0': ([{'processor_type': 'minecraft:block_age', 'mossiness': 0.0}], 'block_age, mossiness 0.'),
    'age50': ([{'processor_type': 'minecraft:block_age', 'mossiness': 0.5}], 'block_age, mossiness 0.5.'),
    'age100': ([{'processor_type': 'minecraft:block_age', 'mossiness': 1.0}], 'block_age, mossiness 1.'),
    'lava': ([{'processor_type': 'minecraft:lava_submerged_block'}], 'lava_submerged_block; placed over lava.'),
    'jigsawrep': ([{'processor_type': 'minecraft:jigsaw_replacement'}], 'jigsaw_replacement.'),
    'loot': ([rules(rule(match('minecraft:chest'), 'minecraft:chest', modifier={
        'type': 'minecraft:append_loot', 'loot_table': 'minecraft:chests/simple_dungeon'}))],
             'rule with the append_loot block entity modifier on the chest (the table is only an id).'),
    'static': ([rules(rule(match('minecraft:chest'), 'minecraft:chest', modifier={
        'type': 'minecraft:append_static', 'data': {'CustomName': 'Parity'}}))],
               'rule with the append_static block entity modifier on the chest.'),
}
for name, (processors, notes) in PROCESSORS.items():
    add('minecraft:worldgen/processor_list', 'worldgen/processor_list', lid(name), {'processors': processors}, notes)

# --- structures and sets ------------------------------------------------------------------------------------------------

STRUCTURES = []  # (name, start_pool, size, max_distance, start_y, notes)


def structure(name, start_pool, size, max_distance=128, start_y=0, notes=''):
    STRUCTURES.append(name)
    add('minecraft:worldgen/structure', 'worldgen/structure', sid(name), {
        'type': 'minecraft:jigsaw', 'biomes': f'#{nid("none")}', 'step': 'surface_structures',
        'spawn_overrides': {}, 'terrain_adaptation': 'none', 'start_pool': pid(start_pool), 'size': size,
        'start_height': {'absolute': start_y}, 'max_distance_from_center': max_distance,
        'use_expansion_hack': False}, notes or f'Jigsaw structure {name}.')


structure('match', 'start_match', 1, notes='J1, J3, J5, J6: which arms can join a hub.')
structure('back', 'start_back', 1, notes='J8, J9: an arm reaching back into its parent is refused; the fallback.')
structure('weights', 'start_w', 1, notes='J6, J7: weights 3, 1 and an empty element 1.')
structure('chain_s1', 'start_chain', 1, notes='J11: depth 1, then the fallback cap.')
structure('chain_s3', 'start_chain', 3, notes='J11: depth 3.')
structure('chain_s20', 'start_chain', 20, notes='J11: depth 20 (22 pieces).')
structure('chain_d16', 'start_chain', 20, 16, notes='J12: the horizontal limit, 16.')
structure('chain_d32', 'start_chain', 20, 32, notes='J12: the horizontal limit, 32.')
structure('chain2_d15', 'start_chain2', 20, 15, notes='J12: two-block segments, limit 15.')
structure('chain2_d16', 'start_chain2', 20, 16, notes='J12: two-block segments, limit 16.')
structure('chain4_d16', 'start_chain4', 20, 16, notes='J12: a 4-wide start (the centre truncates), limit 16.')
structure('chain4_d17', 'start_chain4', 20, 17, notes='J12: a 4-wide start, limit 17.')
structure('fb_s5', 'start_fb', 5, 32, notes='J8: the start pool\'s piece is too long; the fallback chain continues.')
structure('vchain_d16', 'start_v', 20, 16, notes='J13: the vertical limit (int form), 16.')
structure('vchain4_d15', 'start_v4', 20, 15, notes='J13: two-block segments over a 4-high start, 15.')
structure('vchain4_d16', 'start_v4', 20, 16, notes='J13: the same, 16.')
structure('vchain6_d16', 'start_v6', 20, 16, notes='J13: over a 6-high start, 16.')
structure('vchain6_d17', 'start_v6', 20, 17, notes='J13: over a 6-high start, 17.')
structure('vchain_v16', 'start_v', 20, {'horizontal': 116, 'vertical': 16}, notes='J13: vertical 16 of the object form.')
structure('vchain_h16', 'start_v', 20, {'horizontal': 16}, notes='J13: the object form without vertical.')
structure('shell', 'start_shell', 1, notes='J10: a child wholly inside its parent.')
structure('shell_big', 'start_shell_big', 1, notes='J10: a child as wide as its parent.')
structure('shell_tall', 'start_shell_tall', 1, notes='J10: a child partly outside its parent (refused).')
structure('whub', 'start_whub', 1, notes='J9, J14: two wide children that overlap; equal selection priority.')
structure('whub_spl', 'start_whub_spl', 1, notes='J14: the left jigsaw\'s selection priority 1.')
structure('whub_spr', 'start_whub_spr', 1, notes='J14: the right jigsaw\'s selection priority 1.')
structure('phub_eq', 'start_phub_eq', 2, notes='J15: equal placement priorities.')
structure('phub_pe', 'start_phub_pe', 2, notes='J15: the east jigsaw\'s placement priority 1.')
structure('phub_pw', 'start_phub_pw', 2, notes='J15: the west jigsaw\'s placement priority 1.')
structure('phub_ce', 'start_phub_ce', 2, notes='J15: the east child\'s own placement priority 1 (unused).')
structure('joint', 'start_joint', 1, notes='J4: aligned and rollable vertical joins.')
structure('grid_s7', 'start_grid', 7, 116, notes='The lattice of 113 pieces.')
structure('grid_s20', 'start_grid', 20, 116, notes='The lattice of 841 pieces.')
structure('cube_s6', 'start_cube', 6, {'horizontal': 24, 'vertical': 24}, notes='The 3D lattice of B637\'s tests.')
structure('misc', 'start_misc', 1, notes='J18: a list element and a feature element.')
structure('town', 'town', 6, 40, notes='Streets, houses and furniture: every rule at once.')
for name in PROCESSORS:
    pool(f'proc_{name}', [single('sample', processors=lid(name))], notes=f'The processor sample with list {name}.')
    structure(f'proc_{name}', f'proc_{name}', 1, start_y=PROC_FLOOR + 1,
              notes=f'The processor sample with list {name}, its floor at world y {PROC_FLOOR}.')
pool('proc_legacy', [single('sample', element_type='minecraft:legacy_single_pool_element')],
     notes='The processor sample as a legacy element (its air is not placed).')
structure('proc_legacy', 'proc_legacy', 1, start_y=PROC_FLOOR + 1, notes='The legacy element of the sample.')
pool('proc_inline', [{'weight': 1, 'element': {
    'element_type': 'minecraft:single_pool_element', 'location': nid('sample'), 'projection': 'rigid',
    'processors': {'processors': PROCESSORS['rule_block'][0]}}}],
     notes='The rule_block list written inline in the element.')
structure('proc_inline', 'proc_inline', 1, start_y=PROC_FLOOR + 1, notes='An inline processor list.')

# One structure per structure set (spike 4S3: a set's structure and start rotation come from one draw). The biome
# tag is empty, so no set ever starts a structure in a world; the parity test assembles them by name.
for salt, name in enumerate(STRUCTURES, start=63900):
    add('minecraft:worldgen/structure_set', 'worldgen/structure_set', nid(f'set/{name}'), {
        'structures': [{'structure': sid(name), 'weight': 1}],
        'placement': {'type': 'minecraft:random_spread', 'spacing': 2, 'separation': 1, 'salt': salt}},
        f'The set of {name} alone.')
add('minecraft:tag/worldgen/biome', 'tags/worldgen/biome', nid('none'), {'values': []},
    'An empty biome tag: the fixture\'s structures never start in a world by themselves.')

# --- writing ----------------------------------------------------------------------------------------------------------


def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write('\n')


def main():
    content = os.path.join(HERE, 'content')
    if os.path.isdir(content):
        shutil.rmtree(content)
    for kind, folder, ident, data, notes in ELEMENTS:
        ns, path = ident.split(':', 1)
        dump(os.path.join(content, ns, folder, path + '.json'), {
            'data': data, 'formatVersion': 1, 'id': ident, 'kind': kind,
            'meta': {'createdAt': CREATED, 'notes': notes}})
    dump(os.path.join(HERE, 'msm.project.json'), {
        'formatVersion': 1, 'name': 'Structures Parity', 'namespaces': [NS],
        'plugins': ['msm.datapack', 'msm.structures', 'msm.worldgen'], 'settings': {}, 'targets': ['mc-26.3']})
    subprocess.run(['node', os.path.join('fixtures', 'structures-parity', 'lower.ts')], cwd=ROOT, check=True)
    print(f'{len(ELEMENTS)} elements; {len(STRUCTURES)} structures')


if __name__ == '__main__':
    main()
