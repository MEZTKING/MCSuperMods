# Writes the live views parity fixture (ADR 0120 D9, plan brief B607): the MSM project `live_views` (msm.project.json
# and content/) and its lowered data pack (lowered/data/).
#
# Every file is MSM's own, written from the data format (the targets' vendored mcdoc and the B600 spike's findings) and
# never copied from vanilla: loot tables, predicates, item modifiers, tags, enchantments, advancements, dialogs,
# damage types, a chat type, a trial spawner, a block transformer and functions. A few files take vanilla ids on
# purpose, with content of the fixture's own: nine wool block loot tables (rolled by mining the block), item tags that
# merge into and replace vanilla tags, an enchantment tag merging into `minecraft:curse` and the `minecraft:load`
# function tag. The data pack format is the same on both targets (B600), so one project serves both.
#
# Run from the repository root:
#   python3 fixtures/live-views/make_fixture.py
# then rerun the GameTest with -PupdateLiveViewsParity on both versions (README.md).
import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
NS = 'live_views'
CREATED = '2026-11-22T00:00:00.000Z'
TARGET = 'mc-26.3'

FILES = []  # (kind, namespace, folder, path, data, notes)


def nid(path):
    return f'{NS}:{path}'


def add(kind, folder, ident, data, notes):
    ns, path = ident.split(':', 1)
    FILES.append((kind, ns, folder, path, data, notes))


# --- loot tables ------------------------------------------------------------------------------------------------------

def item(name, **kw):
    e = {'type': 'minecraft:item', 'name': name}
    e.update(kw)
    return e


def table(*pools, type_='minecraft:generic', **kw):
    t = {'type': type_, 'pools': list(pools)}
    t.update(kw)
    return t


def pool(*entries, rolls=1, **kw):
    p = {'rolls': rolls, 'entries': list(entries)}
    p.update(kw)
    return p


def uniform(a, b):
    return {'type': 'minecraft:uniform', 'min': a, 'max': b}


def chance(c):
    return {'type': 'minecraft:random_chance', 'chance': c}


def set_count(count, add_=False):
    f = {'type': 'minecraft:set_count', 'count': count}
    if add_:
        f['add'] = True
    return f


def loot(name, obj, notes):
    add('minecraft:loot_table', 'loot_table', nid(name), obj, notes)


loot('weights', table(pool(item('minecraft:stone', weight=1), item('minecraft:dirt', weight=2),
                           item('minecraft:sand', weight=3), item('minecraft:gravel', weight=4))),
     'Item entries picked by weight (1, 2, 3, 4).')
loot('rolls_uniform', table(pool(item('minecraft:apple'), rolls=uniform(1, 3))), 'Pool rolls from a uniform number.')
loot('count_uniform', table(pool(item('minecraft:apple', modifier=set_count(uniform(2, 5))))), 'set_count, uniform.')
loot('count_binomial', table(pool(item('minecraft:apple', modifier=set_count(
    {'type': 'minecraft:binomial', 'n': 5, 'p': 0.3})))), 'set_count, binomial.')
loot('count_add', table(pool(item('minecraft:apple', modifier=[set_count(2), set_count(uniform(0, 2), True)]))),
     'set_count, then set_count with add.')
loot('count_weighted', table(pool(item('minecraft:apple', modifier=set_count({
    'type': 'minecraft:weighted_list', 'distribution': [{'data': 1, 'weight': 3}, {'data': 5, 'weight': 1}]})))),
     'set_count from a weighted list.')
loot('count_dispatch', table(pool(item('minecraft:apple', modifier=set_count({
    'type': 'minecraft:number_dispatcher', 'cases': [{'condition': chance(0.5), 'value': 3}], 'default': 1})))),
     'set_count from a number dispatcher.')
loot('random_chance', table(pool(item('minecraft:apple', condition=chance(0.25)))), 'An entry with random_chance.')
loot('alternatives', table(pool({'type': 'minecraft:alternatives', 'children': [
    item('minecraft:stone', condition=chance(0.5)), item('minecraft:dirt')]})), 'alternatives: the first that passes.')
loot('group', table(pool({'type': 'minecraft:group', 'children': [
    item('minecraft:stone', condition=chance(0.5)), item('minecraft:dirt')]})), 'group: every child that passes.')
loot('sequence', table(pool({'type': 'minecraft:sequence', 'children': [
    item('minecraft:stone', condition=chance(0.5)), item('minecraft:dirt')]})), 'sequence: children until one fails.')
loot('nested', table(pool({'type': 'minecraft:loot_table', 'value': nid('weights'), 'weight': 1},
                          item('minecraft:apple', weight=1))), 'A loot_table entry naming another table.')
loot('tag_expand', table(pool({'type': 'minecraft:tag', 'items': f'#{NS}:three', 'expand': True})),
     'A tag entry, expanded: one of the tag.')
loot('tag_all', table(pool({'type': 'minecraft:tag', 'items': f'#{NS}:three', 'expand': False})),
     'A tag entry, not expanded: all of the tag.')
loot('limit', table(pool(item('minecraft:apple', modifier=[set_count(uniform(1, 10)),
                                                           {'type': 'minecraft:limit_count',
                                                            'limit': {'min': 3, 'max': 6}}]))), 'limit_count.')
loot('empty_weight', table(pool({'type': 'minecraft:empty', 'weight': 1}, item('minecraft:stone', weight=3))),
     'An empty entry with a weight.')
loot('two_pools', table(pool(item('minecraft:stone')), pool(item('minecraft:dirt'), condition=chance(0.3))),
     'Two pools, the second with a condition.')
loot('table_modifier', table(pool(item('minecraft:apple', modifier=set_count(3))), modifier=set_count(1, True)),
     'An entry modifier, then a table modifier.')
loot('enchant_levels_book', table(pool(item('minecraft:book', modifier={
    'type': 'minecraft:enchant_with_levels', 'levels': 30}))), 'enchant_with_levels on a book, every enchantment.')
loot('enchant_levels_sword', table(pool(item('minecraft:diamond_sword', modifier={
    'type': 'minecraft:enchant_with_levels', 'levels': uniform(5, 15)}))),
     'enchant_with_levels on a sword, every enchantment.')
loot('enchant_levels_own', table(pool(item('minecraft:diamond_sword', modifier={
    'type': 'minecraft:enchant_with_levels', 'levels': uniform(5, 30), 'options': f'#{NS}:own'}))),
     'enchant_with_levels limited to the fixture\'s own enchantments.')
loot('enchant_randomly_book', table(pool(item('minecraft:book', modifier={'type': 'minecraft:enchant_randomly'}))),
     'enchant_randomly on a book, every enchantment.')
loot('enchant_randomly_own', table(pool(item('minecraft:book', modifier={
    'type': 'minecraft:enchant_randomly', 'options': f'#{NS}:own'}))),
     'enchant_randomly limited to the fixture\'s own enchantments.')
loot('set_damage', table(pool(item('minecraft:diamond_sword', modifier={
    'type': 'minecraft:set_damage', 'damage': uniform(0.2, 0.6)}))), 'set_damage from a uniform float.')
loot('chest_like', table(pool(item('minecraft:bread', weight=20, modifier=set_count(uniform(1, 3))),
                              item('minecraft:iron_ingot', weight=10, modifier=set_count(uniform(1, 5))),
                              item('minecraft:diamond', weight=3), {'type': 'minecraft:empty', 'weight': 5},
                              rolls=uniform(2, 4)), type_='minecraft:chest'), 'A chest-like table.')
loot('set_item', table(pool(item('minecraft:stone', modifier=[set_count(2), {
    'type': 'minecraft:set_item', 'item': 'minecraft:emerald', 'condition': chance(0.5)}]))),
     'set_item under a condition.')
loot('discard', table(pool(item('minecraft:apple', modifier=[set_count(uniform(1, 4)), {
    'type': 'minecraft:discard', 'condition': chance(0.4)}]))), 'discard under a condition.')
loot('modifier_ref', table(pool(item('minecraft:apple', modifier=nid('mod_count_uniform')))),
     'A modifier named by id (an item modifier file).')
loot('condition_ref', table(pool(item('minecraft:apple', condition=nid('chance30')))),
     'A condition named by id (a predicate file).')
loot('sequence_modifier', table(pool(item('minecraft:apple', modifier={
    'type': 'minecraft:sequence', 'functions': [set_count(2), nid('mod_count_uniform_add')]}))),
     'A sequence modifier with a modifier id inside.')

# Kill tables: on a summoned mob (DeathLootTable), rolled with `loot ... kill`.
loot('looting', table(
    pool(item('minecraft:rotten_flesh', modifier=[
        set_count(uniform(0, 2)),
        {'type': 'minecraft:enchanted_count_increase', 'count': uniform(0.0, 1.0),
         'enchantment': 'minecraft:looting'}])),
    pool(item('minecraft:bone', condition={'type': 'minecraft:killed_by_player'})),
    pool(item('minecraft:emerald', condition={
        'type': 'minecraft:random_chance_with_enchanted_bonus', 'enchantment': 'minecraft:looting',
        'unenchanted_chance': 0.1,
        'enchanted_chance': {'type': 'minecraft:linear', 'base': 0.2, 'per_level_above_first': 0.1}})),
    type_='minecraft:entity'), 'A mob table: Looting count increase, killed_by_player, an enchanted chance.')
loot('looting_limit', table(pool(item('minecraft:rotten_flesh', modifier=[
    set_count(1),
    {'type': 'minecraft:enchanted_count_increase', 'count': uniform(0.0, 3.0), 'enchantment': 'minecraft:looting',
     'limit': 3}])), type_='minecraft:entity'), 'enchanted_count_increase with a limit.')


# Block tables: vanilla wool ids with the fixture's own pools, rolled with `loot ... mine <pos> mainhand`.
def block_table(name, *pools, notes, **kw):
    add('minecraft:loot_table', 'loot_table', f'minecraft:blocks/{name}',
        table(*pools, type_='minecraft:block', **kw), notes)


def fortune_bonus(formula, **params):
    f = {'type': 'minecraft:apply_bonus', 'enchantment': 'minecraft:fortune', 'formula': formula}
    if params:
        f['parameters'] = params
    return f


block_table('white_wool', pool(item('minecraft:diamond', modifier=fortune_bonus('minecraft:ore_drops'))),
            notes='apply_bonus ore_drops (the fixture\'s own table for white wool).')
block_table('orange_wool', pool(item('minecraft:apple', modifier=fortune_bonus(
    'minecraft:uniform_bonus_count', bonusMultiplier=2))), notes='apply_bonus uniform_bonus_count.')
block_table('magenta_wool', pool(item('minecraft:wheat_seeds', modifier=fortune_bonus(
    'minecraft:binomial_with_bonus_count', extra=3, probability=0.5714286))),
            notes='apply_bonus binomial_with_bonus_count.')
block_table('light_blue_wool', pool(item('minecraft:apple', condition={
    'type': 'minecraft:table_bonus', 'enchantment': 'minecraft:fortune', 'chances': [0.1, 0.3, 0.6, 0.9]})),
            notes='table_bonus.')
block_table('yellow_wool', pool(item('minecraft:apple', condition={
    'type': 'minecraft:random_chance_with_enchanted_bonus', 'enchantment': 'minecraft:fortune',
    'unenchanted_chance': 0.1,
    'enchanted_chance': {'type': 'minecraft:linear', 'base': 0.25, 'per_level_above_first': 0.25}})),
            notes='random_chance_with_enchanted_bonus read from a tool (the attacker\'s, so never the tool\'s).')
block_table('lime_wool', pool({'type': 'minecraft:alternatives', 'children': [
    item('minecraft:lime_wool', condition={'type': 'minecraft:match_tool', 'predicate': {
        'predicates': {'minecraft:enchantments': [{'enchantments': 'minecraft:silk_touch',
                                                   'levels': {'min': 1}}]}}}),
    item('minecraft:stick')]}), notes='match_tool with Silk Touch, else a stick.')
block_table('brown_wool', pool(item('minecraft:apple', condition={
    'type': 'minecraft:match_block', 'blocks': 'minecraft:brown_wool'})),
            pool(item('minecraft:stick', condition={'type': 'minecraft:match_block', 'blocks': 'minecraft:stone'})),
            notes='match_block: the mined block, and another block.')
block_table('pink_wool', pool(item('minecraft:apple', modifier=[set_count(10), {'type': 'minecraft:explosion_decay'}])),
            notes='explosion_decay on ten apples.')
block_table('gray_wool', pool(item('minecraft:apple', condition={'type': 'minecraft:survives_explosion'})),
            notes='survives_explosion.')
block_table('light_gray_wool', pool(item('minecraft:apple', modifier=[
    set_count(uniform(-6, 2)), {'type': 'minecraft:limit_count', 'limit': {'min': 0}},
    {'type': 'minecraft:explosion_decay'}])), modifier={'type': 'minecraft:explosion_decay'},
            notes='A count that may be below zero, limited, with explosion_decay on the entry and the table.')


# --- tags -------------------------------------------------------------------------------------------------------------

def tag(registry, ident, values, notes, replace=None):
    o = {'values': values}
    if replace is not None:
        o['replace'] = replace
    add(f'minecraft:tag/{registry}', f'tags/{registry}', ident, o, notes)


tag('item', nid('three'), ['minecraft:stone', 'minecraft:dirt', 'minecraft:sand'], 'Three items.')
tag('item', nid('plain'), ['minecraft:stone', 'minecraft:dirt'], 'Two items.')
tag('item', nid('tags_inside'), [f'#{NS}:plain', 'minecraft:sand', '#minecraft:logs'], 'Tags inside a tag.')
tag('item', nid('with_optional'), ['minecraft:stone', {'id': f'{NS}:not_an_item', 'required': False},
                                   {'id': f'#{NS}:not_a_tag', 'required': False}],
    'Optional entries that do not exist.')
tag('item', nid('with_missing'), ['minecraft:stone', {'id': f'#{NS}:not_a_tag', 'required': True}],
    'A required tag that does not exist: the whole tag is dropped.')
tag('item', nid('names_missing'), [f'#{NS}:with_missing', 'minecraft:dirt'], 'Names a dropped tag.')
tag('item', nid('cycle_a'), [f'#{NS}:cycle_b', 'minecraft:stone'], 'Half of a cycle.')
tag('item', nid('cycle_b'), [f'#{NS}:cycle_a', 'minecraft:dirt'], 'The other half of a cycle.')
tag('item', nid('dupes'), ['minecraft:stone', 'minecraft:stone', f'#{NS}:plain'], 'Duplicates.')
tag('item', nid('spiky'), ['minecraft:diamond_sword', 'minecraft:iron_sword'],
    'What the fixture\'s enchantments go on.')
tag('item', 'minecraft:logs', ['minecraft:stone'], 'Merges into vanilla\'s tag.')
tag('item', 'minecraft:wool', ['minecraft:stone'], 'Replaces vanilla\'s tag.', replace=True)
tag('block', nid('soft'), ['minecraft:white_wool', 'minecraft:orange_wool', '#minecraft:wool'],
    'A block tag naming a vanilla block tag.')
tag('entity_type', nid('undead_pair'), ['minecraft:zombie', 'minecraft:skeleton'], 'An entity type tag.')
tag('enchantment', nid('own'), [nid('spike'), nid('spike_curse'), nid('spike_ten')],
    'The fixture\'s own enchantments.')
tag('enchantment', 'minecraft:curse', [nid('spike_curse')], 'Merges a curse into vanilla\'s tag.')
tag('function', 'minecraft:load', [nid('on_load')], 'Runs the fixture\'s load function.')


# --- predicates -------------------------------------------------------------------------------------------------------

def pred(name, obj, notes):
    add('minecraft:predicate', 'predicate', nid(name), obj, notes)


pred('chance30', chance(0.3), 'random_chance 0.3.')
pred('raining', {'type': 'minecraft:weather_check', 'raining': True}, 'weather_check raining.')
pred('day', {'type': 'minecraft:time_check', 'clock': 'minecraft:overworld', 'value': {'min': 0, 'max': 12000},
             'period': 24000}, 'time_check over a day.')
pred('sneaking', {'type': 'minecraft:entity_properties', 'entity': 'this',
                  'predicate': {'minecraft:flags': {'is_sneaking': True}}}, 'entity_properties flags.')
pred('is_player', {'type': 'minecraft:entity_properties', 'entity': 'this',
                   'predicate': {'minecraft:entity_type': 'minecraft:player'}}, 'entity_properties type.')
pred('tool_any', {'type': 'minecraft:match_tool', 'predicate': {}}, 'match_tool with no test.')
pred('killed_by_player', {'type': 'minecraft:killed_by_player'}, 'killed_by_player.')
pred('survives_explosion', {'type': 'minecraft:survives_explosion'}, 'survives_explosion.')
pred('table_bonus', {'type': 'minecraft:table_bonus', 'enchantment': 'minecraft:fortune', 'chances': [1.0]},
     'table_bonus, always.')
pred('damage_fire', {'type': 'minecraft:damage_source_properties',
                     'predicate': {'tags': [{'id': '#minecraft:is_fire', 'expected': True}]}},
     'damage_source_properties with a damage tag.')
pred('plains', {'type': 'minecraft:location_check', 'predicate': {'biomes': 'minecraft:plains'}},
     'location_check biome.')
pred('high', {'type': 'minecraft:location_check', 'predicate': {'position': {'y': {'min': 100}}}},
     'location_check position.')
pred('score5', {'type': 'minecraft:entity_scores', 'entity': 'this', 'scores': {'lv_pred': {'min': 5}}},
     'entity_scores.')
pred('int_check', {'type': 'minecraft:int_value_check', 'value': 4, 'test': {'min': 3, 'max': 5}},
     'int_value_check.')
pred('inverted_zero', {'type': 'minecraft:inverted', 'term': chance(0.0)}, 'inverted.')
pred('all_any', {'type': 'minecraft:all_of', 'terms': [chance(1.0), {'type': 'minecraft:any_of', 'terms': [
    chance(0.0), chance(0.5)]}]}, 'all_of and any_of.')
pred('all_two', {'type': 'minecraft:all_of', 'terms': [chance(1.0), chance(0.5)]}, 'all_of of a list.')
pred('ref_chance', {'type': 'minecraft:all_of', 'terms': [nid('chance30')]}, 'A predicate named by id.')
pred('always', {'type': 'minecraft:inverted', 'term': chance(0.0)}, 'Always yes (used by a function).')


# --- item modifiers -----------------------------------------------------------------------------------------------------

def mod(name, obj, notes):
    add('minecraft:item_modifier', 'item_modifier', nid(name), obj, notes)


mod('mod_set_name', {'type': 'minecraft:set_name', 'name': {'text': 'Fixture Sword', 'color': 'gold'},
                     'target': 'custom_name'}, 'set_name as a custom name.')
mod('mod_set_lore', {'type': 'minecraft:set_lore', 'lore': [{'text': 'Line one'}, 'Line two'], 'mode': 'append'},
    'set_lore, appended.')
mod('mod_set_damage', {'type': 'minecraft:set_damage', 'damage': 0.5}, 'set_damage: half the durability left.')
mod('mod_set_enchantments', {'type': 'minecraft:set_enchantments',
                             'enchantments': {'minecraft:sharpness': 3, nid('spike'): 2}}, 'set_enchantments.')
mod('mod_set_count', {'type': 'minecraft:set_count', 'count': 5}, 'set_count 5.')
mod('mod_count_uniform', {'type': 'minecraft:set_count', 'count': uniform(1, 3)}, 'set_count 1 to 3.')
mod('mod_count_uniform_add', {'type': 'minecraft:set_count', 'count': uniform(0, 2), 'add': True},
    'set_count adding 0 to 2.')
mod('mod_smelt', {'type': 'minecraft:furnace_smelt'}, 'furnace_smelt.')
mod('mod_rarity', {'type': 'minecraft:set_components', 'components': {'minecraft:rarity': 'epic'}},
    'set_components rarity.')
mod('mod_sequence', {'type': 'minecraft:sequence', 'functions': [
    set_count(3), {'type': 'minecraft:set_name', 'name': 'Three', 'target': 'item_name'}]},
    'A sequence of set_count and set_name.')
mod('mod_never', {'type': 'minecraft:set_count', 'count': 9, 'condition': chance(0.0)}, 'A condition that fails.')
mod('mod_ref', {'type': 'minecraft:sequence', 'functions': [nid('mod_set_count')]}, 'A modifier named by id.')


# --- enchantments -----------------------------------------------------------------------------------------------------

def ench(name, notes, **kw):
    o = {'description': {'translate': f'enchantment.{NS}.{name}'}, 'supported_items': f'#{NS}:spiky',
         'primary_items': f'#{NS}:spiky', 'weight': 10, 'max_level': 5,
         'min_cost': {'base': 5, 'per_level_above_first': 8}, 'max_cost': {'base': 25, 'per_level_above_first': 8},
         'anvil_cost': 2, 'slots': ['mainhand']}
    o.update(kw)
    add('minecraft:enchantment', 'enchantment', nid(name), o, notes)


ench('spike', 'Five levels with a damage effect.', effects={'minecraft:damage': [{'effect': {
    'type': 'minecraft:add', 'value': {'type': 'minecraft:linear', 'base': 1.0, 'per_level_above_first': 0.5}}}]})
ench('spike_curse', 'A one-level curse.', max_level=1, weight=2, description={'text': 'Curse of Spikes'})
ench('spike_ten', 'Twelve levels (names beyond ten).', max_level=12, weight=5,
     min_cost={'base': 1, 'per_level_above_first': 3}, max_cost={'base': 6, 'per_level_above_first': 3})

# --- damage types and a chat type -------------------------------------------------------------------------------------

for name, kind in (('zap', 'default'), ('zap_fall', 'fall_variants'), ('zap_design', 'intentional_game_design')):
    add('minecraft:damage_type', 'damage_type', nid(name),
        {'message_id': f'{NS}_{name}', 'exhaustion': 0.1, 'scaling': 'never', 'death_message_type': kind},
        f'A damage type with death_message_type {kind}.')
add('minecraft:chat_type', 'chat_type', nid('shout'), {
    'chat': {'translation_key': f'{NS}.shout', 'parameters': ['sender', 'target', 'content'],
             'style': {'color': 'red', 'bold': True}},
    'narration': {'translation_key': f'{NS}.shout.narrate', 'parameters': ['sender', 'content']}},
    'A chat type with three parameters and a style.')

# --- trial spawner and block transformer --------------------------------------------------------------------------------

add('minecraft:trial_spawner', 'trial_spawner', nid('waves'), {
    'spawn_range': 4, 'total_mobs': 6.0, 'total_mobs_added_per_player': 2.0, 'simultaneous_mobs': 2.0,
    'simultaneous_mobs_added_per_player': 1.0, 'ticks_between_spawn': 40,
    'spawn_potentials': [{'data': {'entity': {'id': 'minecraft:zombie'}}, 'weight': 3},
                         {'data': {'entity': {'id': 'minecraft:skeleton'}}, 'weight': 1}],
    'loot_tables_to_eject': [{'data': nid('weights'), 'weight': 1}],
    'items_to_drop_when_ominous': nid('weights')}, 'A trial spawner configuration.')
add('minecraft:block_transformer', 'block_transformer', nid('brush'), [{
    'block_state_provider': {'type': 'minecraft:rule_based', 'rules': [{
        'if_true': {'type': 'minecraft:matching_blocks', 'blocks': 'minecraft:grass_block'},
        'then': {'id': 'minecraft:dirt'}}]},
    'particle': 'scrape', 'item_damage_per_use': 1}], 'A block transformer turning grass into dirt.')


# --- advancements -----------------------------------------------------------------------------------------------------

def adv(path, parent=None, frame='task', hidden=False, display=True, crit=1, **kw):
    o = {'criteria': {f'c{i}': {'trigger': 'minecraft:impossible'} for i in range(crit)}}
    if parent:
        o['parent'] = nid(parent)
    if display:
        d = {'icon': {'id': 'minecraft:stone'}, 'title': {'text': path}, 'description': {'text': 'A fixture step.'},
             'frame': frame, 'hidden': hidden, 'show_toast': True, 'announce_to_chat': False}
        if parent is None:
            d['background'] = 'minecraft:block/stone'
        o['display'] = d
    o.update(kw)
    add('minecraft:advancement', 'advancement', nid(path), o, f'An advancement of the fixture ({frame}).')


adv('tab/root')
adv('tab/a', 'tab/root')
adv('tab/b', 'tab/root', frame='goal')
adv('tab/c', 'tab/root', frame='challenge')
adv('tab/a1', 'tab/a')
adv('tab/a2', 'tab/a')
adv('tab/a3', 'tab/a')
adv('tab/a2x', 'tab/a2', hidden=True)
adv('tab/a2y', 'tab/a2')
adv('tab/b1', 'tab/b', crit=2, requirements=[['c0', 'c1']])
adv('tab/c1', 'tab/c')
adv('tab/c1a', 'tab/c1')
adv('tab/c1b', 'tab/c1')
adv('tab/c1c', 'tab/c1')
adv('tab/nodisplay', 'tab/c', display=False)
adv('tab/under_nodisplay', 'tab/nodisplay')
adv('hidden_root/root', hidden=True)
adv('plain/root', display=False)
adv('plain/child', 'plain/root')

# --- dialogs ----------------------------------------------------------------------------------------------------------

BODY = [{'type': 'minecraft:plain_message', 'contents': 'A plain message body of a few words.', 'width': 200},
        {'type': 'minecraft:item', 'item': {'id': 'minecraft:diamond', 'count': 3}, 'description': 'Three diamonds',
         'show_decorations': True, 'show_tooltip': True}]
INPUTS = [{'type': 'minecraft:text', 'key': 'name', 'label': 'Name', 'width': 200, 'initial': 'Ann', 'max_length': 32},
          {'type': 'minecraft:boolean', 'key': 'ok', 'label': 'Agree', 'initial': True},
          {'type': 'minecraft:single_option', 'key': 'pick', 'label': 'Pick',
           'options': ['one', {'id': 'two', 'display': 'Two', 'initial': True}]},
          {'type': 'minecraft:number_range', 'key': 'n', 'label': 'How many', 'start': 0, 'end': 10, 'step': 1,
           'initial': 5}]


def button(label, width=150):
    return {'label': label, 'width': width, 'action': {'type': 'minecraft:run_command', 'command': 'say hi'}}


def dialog(name, obj):
    add('minecraft:dialog', 'dialog', nid(name), obj, f'A {obj["type"].split(":")[1]} dialog.')


dialog('notice', {'type': 'minecraft:notice', 'title': 'Notice', 'body': BODY, 'inputs': INPUTS,
                  'action': button('OK')})
dialog('confirmation', {'type': 'minecraft:confirmation', 'title': 'Confirm', 'body': BODY[0],
                        'yes': button('Yes'), 'no': button('No')})
dialog('multi_action', {'type': 'minecraft:multi_action', 'title': 'Many', 'body': BODY[0], 'columns': 2,
                        'actions': [button('One'), button('Two'), button('Three'), button('Four', 100),
                                    button('Five', 300)], 'exit_action': {'label': 'Back', 'width': 200}})
dialog('dialog_list', {'type': 'minecraft:dialog_list', 'title': 'List', 'dialogs': [nid('notice'), nid('confirmation')],
                       'columns': 1, 'button_width': 200, 'exit_action': {'label': 'Back'}})
dialog('server_links', {'type': 'minecraft:server_links', 'title': 'Links', 'columns': 2, 'button_width': 150})


# --- functions --------------------------------------------------------------------------------------------------------

def fn(name, lines, notes):
    add('minecraft:function', 'function', nid(name), {'lines': lines}, notes)


fn('scores', ['scoreboard objectives add lv_score dummy', 'scoreboard players set @s lv_score 3',
              'scoreboard players add @s lv_score 4', 'scoreboard players remove @s lv_score 2'],
   'Scores: set, add, remove.')
fn('blocks', ['setblock ~1 ~ ~ minecraft:stone', 'fill ~2 ~ ~ ~3 ~1 ~ minecraft:dirt',
              'clone ~1 ~ ~ ~1 ~ ~ ~4 ~ ~'], 'Blocks: setblock, fill, clone.')
fn('items', ['give @s minecraft:diamond 5', 'clear @s minecraft:diamond 2', 'give @s minecraft:apple'],
   'Items: give and clear.')
fn('effects', ['effect give @s minecraft:speed 30 1 true', 'effect give @s minecraft:jump_boost 10 0',
               'effect clear @s minecraft:jump_boost'], 'Effects: give and clear.')
fn('branch', ['scoreboard objectives add lv_branch dummy', 'scoreboard objectives add lv_success dummy',
              'scoreboard players set @s lv_branch 5',
              'execute if score @s lv_branch matches 5 run tag @s add lv_five',
              'execute unless score @s lv_branch matches 5 run tag @s add lv_not_five',
              'execute if block ~1 ~ ~ minecraft:air run tag @s add lv_air_beside',
              f'execute if predicate {NS}:always run tag @s add lv_predicate',
              f'execute store result score @s lv_branch run function {NS}:four',
              'execute store success score @s lv_success if score @s lv_branch matches 4'],
   'execute if and unless, store result and success, a predicate.')
fn('four', ['return 4'], 'Returns 4.')
fn('macro', ['scoreboard objectives add lv_macro dummy', '$scoreboard players set @s lv_macro $(n)',
             '$give @s minecraft:$(item) $(count)'], 'A macro function.')
fn('calls', [f'function {NS}:scores', f'function {NS}:items', 'tag @s add lv_nested'], 'Calls other functions.')
fn('on_load', ['scoreboard objectives add lv_load dummy', 'scoreboard players set #loaded lv_load 1'],
   'The load function (minecraft:load).')


# --- writing ----------------------------------------------------------------------------------------------------------

def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write('\n')


def main():
    ids = [f'{ns}:{path}' for _, ns, _, path, _, _ in FILES]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    assert not dupes, f'element ids must be unique across kinds: {dupes}'
    for sub in ('content', 'lowered'):
        shutil.rmtree(os.path.join(HERE, sub), ignore_errors=True)
    for kind, ns, folder, path, data, notes in FILES:
        element = {'data': data, 'formatVersion': 1, 'id': f'{ns}:{path}', 'kind': kind,
                   'meta': {'createdAt': CREATED, 'notes': notes}}
        dump(os.path.join(HERE, 'content', ns, folder, path + '.json'), element)
        if kind == 'minecraft:function':
            out = os.path.join(HERE, 'lowered', 'data', ns, folder, path + '.mcfunction')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, 'w', encoding='utf-8', newline='\n') as f:
                f.write('\n'.join(data['lines']) + '\n')
        else:
            dump(os.path.join(HERE, 'lowered', 'data', ns, folder, path + '.json'), data)
    dump(os.path.join(HERE, 'msm.project.json'), {
        'formatVersion': 1, 'name': 'Live Views Parity', 'namespaces': ['minecraft', NS],
        'plugins': ['msm.datapack'], 'settings': {}, 'targets': [TARGET]})
    print(f'{len(FILES)} elements')


if __name__ == '__main__':
    main()
