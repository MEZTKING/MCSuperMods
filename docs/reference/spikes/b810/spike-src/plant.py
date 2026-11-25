import json, os, sys
root = sys.argv[1]
c = os.path.join(root, 'content', 'msm_starter')
def el(rel, id_, kind, data):
    p = os.path.join(c, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump({"data": data, "formatVersion": 1, "id": id_, "kind": kind, "meta": {"createdAt": "2026-11-25T00:00:00.000Z", "notes": "B810 planted"}}, open(p, 'w'), indent=2, sort_keys=True)
# P1 function text: particle, entity type tag, sound event, SNBT inside a command
el('function/planted_fn.json', 'msm_starter:planted_fn', 'minecraft:function', {"lines": [
  "particle minecraft:item_snowball ~ ~ ~",
  "kill @e[type=#minecraft:freeze_immune_entity_types]",
  "playsound minecraft:intentionally_empty master @a",
  "summon minecraft:area_effect_cloud ~ ~ ~ {custom_particle:{type:\"minecraft:item_snowball\"}}",
]})
# P2 script text
el('script/planted_script.json', 'msm_starter:planted_script', 'msm:script', {"lines": [
  "import { msm } from \"msm:runtime\";",
  "msm.actions.define(\"msm_starter:planted_power\", (e) => {",
  "  e.world.spawnParticle(\"minecraft:item_snowball\", e.player!.pos, { count: 1 });",
  "});",
]})
# P3 model parent, a whole string in element data
el('model/block/planted.json', 'msm_starter:block/planted', 'minecraft:model', {"parent": "minecraft:block/cube_top", "textures": {"top": "minecraft:block/stone", "side": "minecraft:block/stone"}})
# P4 a feature whose type is the removed feature type (whole string, `type`)
el('worldgen/feature/planted_spike.json', 'msm_starter:planted_spike', 'minecraft:worldgen/feature', {
  "type": "minecraft:large_dripstone", "column_radius": 5,
  "height_scale": 1.0, "max_column_radius_to_cave_height_ratio": 0.33,
  "stalactite_bluntness": 0.5, "stalagmite_bluntness": 0.5,
  "wind_speed": 0.1, "min_radius_for_wind": 4, "min_bluntness_for_wind": 0.6,
  "floor_to_ceiling_search_range": 30, "replaceable_blocks": "#minecraft:base_stone_overworld"})
# P5 a tag listing a removed entity type tag (whole string with #)
p = os.path.join(root, 'content', 'minecraft', 'tags', 'entity_type', 'planted.json')
os.makedirs(os.path.dirname(p), exist_ok=True)
json.dump({"data": {"values": ["#minecraft:ignores_poison_and_regen", "minecraft:zombie"]}, "formatVersion": 1, "id": "minecraft:planted", "kind": "minecraft:tag/entity_type", "meta": {"createdAt": "2026-11-25T00:00:00.000Z"}}, open(p, 'w'), indent=2, sort_keys=True)
# P6 a density function of the removed type (whole string, `type`)
el('worldgen/density_function/planted_df.json', 'msm_starter:planted_df', 'minecraft:worldgen/density_function', {"type": "minecraft:interpolated", "input": 0.5, "cell_size_xz": 4, "cell_size_y": 8})
# P7 a predicate on a fluid that was removed (whole string inside a fluid predicate)
el('predicate/planted_pred.json', 'msm_starter:planted_pred', 'minecraft:predicate', {"type": "minecraft:location_check", "predicate": {"fluid": {"fluids": "minecraft:flowing_water"}}})
# P8 a text component inside a lang value (embedded text) naming a removed sound
el('lang/en_gb.json', 'msm_starter:en_gb', 'minecraft:lang', {"msm_starter.planted": "minecraft:intentionally_empty"})
