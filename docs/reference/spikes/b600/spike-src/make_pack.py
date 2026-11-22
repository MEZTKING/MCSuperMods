"""B600 spike (throwaway): writes MSM's own fixture data pack (namespace msm_b600) and a few vanilla loot table
overrides (wool blocks, rolled with `/loot ... mine`) into the GameTest resources given as argv[1]."""
import json, os, sys

ROOT = sys.argv[1]
NS = "msm_b600"


def w(path, obj):
    p = os.path.join(ROOT, "data", path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(obj, f, indent=2, sort_keys=True)


def item(name, **kw):
    e = {"type": "minecraft:item", "name": name}
    e.update(kw)
    return e


def table(*pools, type_="minecraft:generic", **kw):
    t = {"type": type_, "pools": list(pools)}
    t.update(kw)
    return t


def pool(*entries, rolls=1, **kw):
    p = {"rolls": rolls, "entries": list(entries)}
    p.update(kw)
    return p


def lt(name, obj):
    w(f"{NS}/loot_table/{name}.json", obj)


U = lambda a, b: {"type": "minecraft:uniform", "min": a, "max": b}
chance = lambda c: {"type": "minecraft:random_chance", "chance": c}

# ---- loot source tables ------------------------------------------------------------------------------------------
lt("weights", table(pool(item("minecraft:stone", weight=1), item("minecraft:dirt", weight=2),
                         item("minecraft:sand", weight=3), item("minecraft:gravel", weight=4))))
lt("rolls_uniform", table(pool(item("minecraft:apple"), rolls=U(1, 3))))
lt("count_uniform", table(pool(item("minecraft:apple", modifier={"type": "minecraft:set_count", "count": U(2, 5)}))))
lt("count_binomial", table(pool(item("minecraft:apple", modifier={"type": "minecraft:set_count",
                                                                       "count": {"type": "minecraft:binomial", "n": 5, "p": 0.3}}))))
lt("count_add", table(pool(item("minecraft:apple", modifier=[{"type": "minecraft:set_count", "count": 2},
                                                              {"type": "minecraft:set_count", "count": U(0, 2), "add": True}]))))
lt("count_weighted", table(pool(item("minecraft:apple", modifier={"type": "minecraft:set_count", "count": {
    "type": "minecraft:weighted_list", "distribution": [{"data": 1, "weight": 3}, {"data": 5, "weight": 1}]}}))))
lt("count_dispatch", table(pool(item("minecraft:apple", modifier={"type": "minecraft:set_count", "count": {
    "type": "minecraft:number_dispatcher", "cases": [{"condition": chance(0.5), "value": 3}], "default": 1}}))))
lt("random_chance", table(pool(item("minecraft:apple", condition=chance(0.25)))))
lt("alternatives", table(pool({"type": "minecraft:alternatives", "children": [
    item("minecraft:stone", condition=chance(0.5)), item("minecraft:dirt")]})))
lt("group", table(pool({"type": "minecraft:group", "children": [item("minecraft:stone", condition=chance(0.5)),
                                                                  item("minecraft:dirt")]})))
lt("sequence", table(pool({"type": "minecraft:sequence", "children": [item("minecraft:stone", condition=chance(0.5)),
                                                                        item("minecraft:dirt")]})))
lt("nested", table(pool({"type": "minecraft:loot_table", "value": f"{NS}:weights", "weight": 1},
                        item("minecraft:apple", weight=1))))
lt("tag_expand", table(pool({"type": "minecraft:tag", "items": f"#{NS}:three", "expand": True})))
lt("tag_all", table(pool({"type": "minecraft:tag", "items": f"#{NS}:three", "expand": False})))
lt("limit", table(pool(item("minecraft:apple", modifier=[{"type": "minecraft:set_count", "count": U(1, 10)},
                                                          {"type": "minecraft:limit_count", "limit": {"min": 3, "max": 6}}]))))
lt("empty_weight", table(pool({"type": "minecraft:empty", "weight": 1}, item("minecraft:stone", weight=3))))
lt("luck", table(pool(item("minecraft:stone", weight=1, quality=0), item("minecraft:dirt", weight=1, quality=5),
                      rolls=1, bonus_rolls=1.0)))
lt("two_pools", table(pool(item("minecraft:stone")), pool(item("minecraft:dirt"), condition=chance(0.3))))
lt("table_modifier", table(pool(item("minecraft:apple"), modifier={"type": "minecraft:set_count", "count": 3}),
                           modifier={"type": "minecraft:set_count", "count": 1, "add": True}))
lt("enchant_levels_book", table(pool(item("minecraft:book", modifier={"type": "minecraft:enchant_with_levels", "levels": 30}))))
lt("enchant_levels_sword", table(pool(item("minecraft:diamond_sword", modifier={"type": "minecraft:enchant_with_levels",
                                                                                   "levels": U(5, 15)}))))
lt("enchant_randomly_book", table(pool(item("minecraft:book", modifier={"type": "minecraft:enchant_randomly"}))))
lt("set_damage", table(pool(item("minecraft:diamond_sword", modifier={"type": "minecraft:set_damage", "damage": U(0.2, 0.6)}))))
lt("chest_like", table(pool(item("minecraft:bread", weight=20, modifier={"type": "minecraft:set_count", "count": U(1, 3)}),
                            item("minecraft:iron_ingot", weight=10, modifier={"type": "minecraft:set_count", "count": U(1, 5)}),
                            item("minecraft:diamond", weight=3), {"type": "minecraft:empty", "weight": 5}, rolls=U(2, 4)),
                       type_="minecraft:chest"))
# Kill tables (DeathLootTable on a summoned mob), rolled with `/loot ... kill`.
lt("looting", table(pool(item("minecraft:rotten_flesh", modifier=[
    {"type": "minecraft:set_count", "count": U(0, 2)},
    {"type": "minecraft:enchanted_count_increase", "count": U(0.0, 1.0), "enchantment": "minecraft:looting"}])),
    pool(item("minecraft:bone", condition={"type": "minecraft:killed_by_player"})),
    pool(item("minecraft:emerald", condition={"type": "minecraft:random_chance_with_enchanted_bonus",
                                                "enchantment": "minecraft:looting", "unenchanted_chance": 0.1,
                                                "enchanted_chance": {"type": "minecraft:linear", "base": 0.2,
                                                                     "per_level_above_first": 0.1}})),
    type_="minecraft:entity"))
lt("looting_limit", table(pool(item("minecraft:rotten_flesh", modifier=[
    {"type": "minecraft:set_count", "count": 1},
    {"type": "minecraft:enchanted_count_increase", "count": U(0.0, 3.0), "enchantment": "minecraft:looting", "limit": 3}])),
    type_="minecraft:entity"))

# ---- block tables (vanilla wool overrides, rolled with /loot ... mine <pos> mainhand) ---------------------------------
def block(name, *pools, **kw):
    w(f"minecraft/loot_table/blocks/{name}.json", table(*pools, type_="minecraft:block", **kw))


block("white_wool", pool(item("minecraft:diamond", modifier={"type": "minecraft:apply_bonus", "enchantment": "minecraft:fortune",
                                                              "formula": "minecraft:ore_drops"})))
block("orange_wool", pool(item("minecraft:apple", modifier={"type": "minecraft:apply_bonus", "enchantment": "minecraft:fortune",
                                                             "formula": "minecraft:uniform_bonus_count",
                                                             "parameters": {"bonusMultiplier": 2}})))
block("magenta_wool", pool(item("minecraft:wheat_seeds", modifier={"type": "minecraft:apply_bonus", "enchantment": "minecraft:fortune",
                                                                    "formula": "minecraft:binomial_with_bonus_count",
                                                                    "parameters": {"extra": 3, "probability": 0.5714286}})))
block("light_blue_wool", pool(item("minecraft:apple", condition={"type": "minecraft:table_bonus", "enchantment": "minecraft:fortune",
                                                                  "chances": [0.1, 0.3, 0.6, 0.9]})))
block("yellow_wool", pool(item("minecraft:apple", condition={"type": "minecraft:random_chance_with_enchanted_bonus",
                                                              "enchantment": "minecraft:fortune", "unenchanted_chance": 0.1,
                                                              "enchanted_chance": {"type": "minecraft:linear", "base": 0.25,
                                                                                   "per_level_above_first": 0.25}})))
block("lime_wool", pool({"type": "minecraft:alternatives", "children": [
    item("minecraft:lime_wool", condition="minecraft:tool/can_silk_touch"), item("minecraft:stick")]}))
block("pink_wool", pool(item("minecraft:apple", modifier=[{"type": "minecraft:set_count", "count": 10},
                                                          {"type": "minecraft:explosion_decay"}])))
block("gray_wool", pool(item("minecraft:apple", condition={"type": "minecraft:survives_explosion"})))
block("light_gray_wool", pool(item("minecraft:apple", modifier=[{"type": "minecraft:set_count", "count": U(-6, 2)},
                                                                {"type": "minecraft:limit_count", "limit": {"min": 0}},
                                                                {"type": "minecraft:explosion_decay"}])),
      modifier={"type": "minecraft:explosion_decay"})

# ---- tags -------------------------------------------------------------------------------------------------------------
def tag(reg, name, values, replace=None, ns=NS):
    o = {"values": values}
    if replace is not None:
        o["replace"] = replace
    w(f"{ns}/tags/{reg}/{name}.json", o)


tag("item", "three", ["minecraft:stone", "minecraft:dirt", "minecraft:sand"])
tag("item", "plain", ["minecraft:stone", "minecraft:dirt"])
tag("item", "nested", [f"#{NS}:plain", "minecraft:sand", "#minecraft:logs"])
tag("item", "with_optional", ["minecraft:stone", {"id": f"{NS}:nope", "required": False}, {"id": f"#{NS}:nope_tag", "required": False}])
tag("item", "with_missing", ["minecraft:stone", f"{NS}:nope"])
tag("item", "names_missing", [f"#{NS}:with_missing", "minecraft:dirt"])
tag("item", "missing_tag", ["minecraft:stone", f"#{NS}:nope_tag"])
tag("item", "cycle_a", [f"#{NS}:cycle_b", "minecraft:stone"])
tag("item", "cycle_b", [f"#{NS}:cycle_a", "minecraft:dirt"])
tag("item", "dupes", ["minecraft:stone", "minecraft:stone", f"#{NS}:plain"])
tag("item", "logs", ["minecraft:stone"], ns="minecraft")                     # merges into vanilla's
tag("item", "wool", ["minecraft:stone"], replace=True, ns="minecraft")       # replaces vanilla's
tag("item", "spiky", ["minecraft:diamond_sword"])
tag("enchantment", "curse", [f"{NS}:spike_curse"], ns="minecraft")

# ---- predicates -------------------------------------------------------------------------------------------------------
def pred(name, obj):
    w(f"{NS}/predicate/{name}.json", obj)


pred("chance30", chance(0.3))
pred("raining", {"type": "minecraft:weather_check", "raining": True})
pred("day", {"type": "minecraft:time_check", "clock": "minecraft:overworld", "value": {"min": 0, "max": 12000}, "period": 24000})
pred("sneaking", {"type": "minecraft:entity_properties", "entity": "this", "predicate": {"minecraft:flags": {"is_sneaking": True}}})
pred("is_player", {"type": "minecraft:entity_properties", "entity": "this", "predicate": {"minecraft:entity_type": "minecraft:player"}})
pred("tool_any", {"type": "minecraft:match_tool", "predicate": {}})
pred("killed_by_player", {"type": "minecraft:killed_by_player"})
pred("survives_explosion", {"type": "minecraft:survives_explosion"})
pred("table_bonus", {"type": "minecraft:table_bonus", "enchantment": "minecraft:fortune", "chances": [1.0]})
pred("damage_fire", {"type": "minecraft:damage_source_properties", "predicate": {"tags": [{"id": "#minecraft:is_fire", "expected": True}]}})
pred("plains", {"type": "minecraft:location_check", "predicate": {"biomes": "minecraft:plains"}})
pred("high", {"type": "minecraft:location_check", "predicate": {"position": {"y": {"min": 100}}}})
pred("score5", {"type": "minecraft:entity_scores", "entity": "this", "scores": {"b600": {"min": 5}}})
pred("int_check", {"type": "minecraft:int_value_check", "value": 4, "test": {"min": 3, "max": 5}})
pred("inverted_zero", {"type": "minecraft:inverted", "term": chance(0.0)})
pred("all_any", {"type": "minecraft:all_of", "terms": [chance(1.0), {"type": "minecraft:any_of", "terms": [chance(0.0), chance(0.5)]}]})
# A predicate file that is a list or a bare id does not load (observed: "Not a JSON object"); inline lists and ids do.
pred("list_form", {"type": "minecraft:all_of", "terms": [chance(1.0), chance(0.5)]})
pred("ref", {"type": "minecraft:all_of", "terms": [f"{NS}:chance30"]})
pred("enchant_active", {"type": "minecraft:enchantment_active_check", "active": True})

# ---- item modifiers ---------------------------------------------------------------------------------------------------
def mod(name, obj):
    w(f"{NS}/item_modifier/{name}.json", obj)


mod("set_name", {"type": "minecraft:set_name", "name": {"text": "Spike Sword", "color": "gold"}, "target": "custom_name"})
mod("set_lore", {"type": "minecraft:set_lore", "lore": [{"text": "Line one"}, "Line two"], "mode": "append"})
mod("set_damage", {"type": "minecraft:set_damage", "damage": 0.5})
mod("set_enchantments", {"type": "minecraft:set_enchantments", "enchantments": {"minecraft:sharpness": 3, f"{NS}:spike": 2}})
mod("set_count", {"type": "minecraft:set_count", "count": 5})
mod("smelt", {"type": "minecraft:furnace_smelt"})
mod("rarity", {"type": "minecraft:set_components", "components": {"minecraft:rarity": "epic"}})
mod("list", {"type": "minecraft:sequence", "functions": [{"type": "minecraft:set_count", "count": 3}, {"type": "minecraft:set_name", "name": "Three", "target": "item_name"}]})
mod("conditional", {"type": "minecraft:set_count", "count": 9, "condition": chance(0.0)})
mod("ref", {"type": "minecraft:sequence", "functions": [f"{NS}:set_count"]})

# ---- enchantments -----------------------------------------------------------------------------------------------------
def ench(name, **kw):
    o = {"description": {"translate": f"enchantment.{NS}.{name}"}, "supported_items": f"#{NS}:spiky",
         "primary_items": f"#{NS}:spiky", "weight": 10, "max_level": 5, "min_cost": {"base": 5, "per_level_above_first": 8},
         "max_cost": {"base": 25, "per_level_above_first": 8}, "anvil_cost": 2, "slots": ["mainhand"]}
    o.update(kw)
    w(f"{NS}/enchantment/{name}.json", o)


ench("spike", effects={"minecraft:damage": [{"effect": {"type": "minecraft:add", "value": {
    "type": "minecraft:linear", "base": 1.0, "per_level_above_first": 0.5}}}]})
ench("spike_curse", max_level=1, description={"text": "Curse of Spikes"})
ench("spike_ten", max_level=12, min_cost={"base": 1, "per_level_above_first": 3}, max_cost={"base": 6, "per_level_above_first": 3})

# ---- damage types and chat types ----------------------------------------------------------------------------------------
for name, dmt in (("zap", "default"), ("zap_fall", "fall_variants"), ("zap_design", "intentional_game_design")):
    w(f"{NS}/damage_type/{name}.json", {"message_id": f"{NS}_{name}", "exhaustion": 0.1, "scaling": "never",
                                        "death_message_type": dmt})
w(f"{NS}/chat_type/shout.json", {
    "chat": {"translation_key": f"{NS}.shout", "parameters": ["sender", "target", "content"],
             "style": {"color": "red", "bold": True}},
    "narration": {"translation_key": f"{NS}.shout.narrate", "parameters": ["sender", "content"]}})

# ---- trial spawner and block transformer (load check only) -------------------------------------------------------------------
w(f"{NS}/trial_spawner/waves.json", {"spawn_range": 4, "total_mobs": 6.0, "total_mobs_added_per_player": 2.0,
                                    "simultaneous_mobs": 2.0, "simultaneous_mobs_added_per_player": 1.0, "ticks_between_spawn": 40,
                                    "spawn_potentials": [{"data": {"entity": {"id": "minecraft:zombie"}}, "weight": 3},
                                                         {"data": {"entity": {"id": "minecraft:skeleton"}}, "weight": 1}],
                                    "loot_tables_to_eject": [{"data": f"{NS}:weights", "weight": 1}],
                                    "items_to_drop_when_ominous": f"{NS}:weights"})
w(f"{NS}/block_transformer/brush.json", [{"block_state_provider": {"type": "minecraft:rule_based", "rules": [
    {"if_true": {"type": "minecraft:matching_blocks", "blocks": "minecraft:grass_block"}, "then": {"id": "minecraft:dirt"}}]},
                                          "particle": "scrape", "item_damage_per_use": 1}])

# ---- advancements -------------------------------------------------------------------------------------------------------
def adv(path, parent=None, frame="task", hidden=False, display=True, crit=1, **kw):
    o = {"criteria": {f"c{i}": {"trigger": "minecraft:impossible"} for i in range(crit)}}
    if parent:
        o["parent"] = f"{NS}:{parent}"
    if display:
        d = {"icon": {"id": "minecraft:stone"}, "title": {"text": path}, "description": {"text": "d"}, "frame": frame,
             "hidden": hidden, "show_toast": True, "announce_to_chat": False}
        if parent is None:
            d["background"] = "minecraft:block/stone"
        o["display"] = d
    o.update(kw)
    w(f"{NS}/advancement/{path}.json", o)


adv("tab/root")
adv("tab/a", "tab/root")
adv("tab/b", "tab/root", frame="goal")
adv("tab/c", "tab/root", frame="challenge")
adv("tab/a1", "tab/a")
adv("tab/a2", "tab/a")
adv("tab/a3", "tab/a")
adv("tab/a2x", "tab/a2", hidden=True)
adv("tab/a2y", "tab/a2")
adv("tab/b1", "tab/b", crit=2, requirements=[["c0", "c1"]])
adv("tab/c1", "tab/c")
adv("tab/c1a", "tab/c1")
adv("tab/c1b", "tab/c1")
adv("tab/c1c", "tab/c1")
adv("tab/nodisplay", "tab/c", display=False)
adv("tab/under_nodisplay", "tab/nodisplay")
adv("hidden_root/root", hidden=True)
adv("plain/root", display=False)
adv("plain/child", "plain/root")

# ---- dialogs ------------------------------------------------------------------------------------------------------------
body = [{"type": "minecraft:plain_message", "contents": "A plain message body of a few words.", "width": 200},
        {"type": "minecraft:item", "item": {"id": "minecraft:diamond", "count": 3}, "description": "Three diamonds",
         "show_decorations": True, "show_tooltip": True}]
inputs = [{"type": "minecraft:text", "key": "name", "label": "Name", "width": 200, "initial": "Ann", "max_length": 32},
          {"type": "minecraft:boolean", "key": "ok", "label": "Agree", "initial": True},
          {"type": "minecraft:single_option", "key": "pick", "label": "Pick", "options": ["one", {"id": "two", "display": "Two", "initial": True}]},
          {"type": "minecraft:number_range", "key": "n", "label": "How many", "start": 0, "end": 10, "step": 1, "initial": 5}]
btn = lambda label, w_=150: {"label": label, "width": w_, "action": {"type": "minecraft:run_command", "command": "say hi"}}
w(f"{NS}/dialog/notice.json", {"type": "minecraft:notice", "title": "Notice", "body": body, "inputs": inputs, "action": btn("OK")})
w(f"{NS}/dialog/confirmation.json", {"type": "minecraft:confirmation", "title": "Confirm", "body": body[0],
                                     "yes": btn("Yes"), "no": btn("No")})
w(f"{NS}/dialog/multi_action.json", {"type": "minecraft:multi_action", "title": "Many", "body": body[0], "columns": 2,
                                     "actions": [btn("One"), btn("Two"), btn("Three"), btn("Four", 100), btn("Five", 300)],
                                     "exit_action": {"label": "Back", "width": 200}})
w(f"{NS}/dialog/dialog_list.json", {"type": "minecraft:dialog_list", "title": "List", "dialogs": [f"{NS}:notice", f"{NS}:confirmation"],
                                    "columns": 1, "button_width": 200, "exit_action": {"label": "Back"}})
w(f"{NS}/dialog/server_links.json", {"type": "minecraft:server_links", "title": "Links", "columns": 2, "button_width": 150})
w(f"{NS}/dialog/plain.json", {"type": "minecraft:notice", "title": "Plain"})

# ---- functions (for the command share check: run on the server) ---------------------------------------------------------
os.makedirs(os.path.join(ROOT, "data", NS, "function"), exist_ok=True)
with open(os.path.join(ROOT, "data", NS, "function", "hello.mcfunction"), "w") as f:
    f.write("say hello\nscoreboard objectives add b600f dummy\nscoreboard players set @s b600f 3\n$say $(x)\n")
