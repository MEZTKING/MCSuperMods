/** The vehicle, key bind and HUD topic (moved from system-prompt.ts, B681; wording unchanged). */
import { list } from './core';

/**
 * The vehicle, key bind and HUD templates and the vehicle flows the prompt names (ADR 0091 D8).
 * `app/test/ai-rules.test.ts` checks them against the entities and controls plugins' templates
 * and the library's starters, so they cannot drift.
 */
export const VEHICLE_PROMPT_TEMPLATES = Object.freeze([
  'msm_vehicle_go_kart',
  'msm_vehicle_car',
  'msm_vehicle_tank',
  'msm_vehicle_biplane',
  'msm_vehicle_helicopter',
  'msm_vehicle_motorboat',
  'msm_vehicle_raft',
  'msm_vehicle_hovercraft',
]);

/** The key bind and HUD templates (category "Controls and HUD"). */
export const CONTROLS_PROMPT_TEMPLATES = Object.freeze([
  'msm_key_bind_dash',
  'msm_key_bind_ability',
  'msm_hud_mana_bar',
  'msm_hud_stamina_bar',
  'msm_hud_coordinates',
  'msm_hud_score_counter',
]);

export const VEHICLES = `- Vehicles: a vehicle players drive is an "msm:vehicle" element: model { geometry, texture, paints of { id, texture, dye } }; movement { mode "ground", "water", "amphibious", "air" or "hover", max_speed in blocks a tick (at most 3; 0.45 is 9 blocks a second), acceleration, braking, turn_rate, step_height, grip }; seats (1 to 8 offsets; the first seat drives); engine { fuel { items of { item, ticks }, capacity }, sound, start_sound, horn }; health { max, repair, explodes, immune_to }; weapons; turret { bone, pitch_bone, limits }; parts naming the model's wheels, steering, rotors and propellers bones; storage { rows }; exhaust; camera { distance }; ram_damage; and events named by on_place, on_mount, on_dismount, on_destroy and on_tick. Its item has the vehicle's id, so recipes and loot name that id. Prefer the flows, which also make the model, its texture in a colour and the item picture: "Car" (vehicle-car), "Tank" (vehicle-tank: a turret and a cannon), "Plane" (vehicle-plane) and "Boat" (vehicle-boat); run add_starter with the name parameter (car_name, tank_name, plane_name, boat_name; speed is in blocks a second; seats, needs_fuel, horn) and adjust the vehicle afterwards. The templates ${list(VEHICLE_PROMPT_TEMPLATES)} name a model, texture and item picture after the vehicle that stay missing until the user adds them, so use them only with a model. Drivers steer with the movement keys; the runtime's own keys are fire (R), second fire (V), horn (H) and descend (Left Alt), in target_facts under controls. A gun or cannon on a vehicle is a vehicle weapon (weapons of { id, key "fire" or "second", projectile item, speed, damage, cooldown_ticks, automatic, ammo { item, capacity }, muzzle { bone, offset }, on_fire }), never a key bind. Read kind_schema for "msm:vehicle" before writing one by hand.
- Key binds and the HUD: a key of the mod's own is an "msm:key_bind" element: default_key by vanilla's name ("key.keyboard.j", "key.keyboard.left.alt", "key.mouse.4"; target_facts controls lists the names and the keys vanilla uses; players rebind it in Controls), display_name, category and category_name (keys sharing a category share its name), when ("always", "on_foot", "in_vehicle" or "driving", with vehicle for one vehicle type), cooldown_ticks, and the components "msm:on_press", "msm:on_release" and "msm:while_held" (every hold_interval_ticks), each naming an event in its events, whose player is the one who pressed. A key bind is a button for every player, so give one that hands something out a cooldown; keys do nothing while a screen or the chat is open. A HUD element is an "msm:hud" element of type "text" (text with {value} and {max}, color), "bar" (size, fill_color and back_color, or sprite and back_sprite) or "icons" (icon required, half_icon, empty_icon, per_icon, as hearts), at an anchor ("top_left" to "bottom_right", "center", or the default "above_hotbar") with offset and order. Its value has a source: "player" (stat health, food, air, armor, level, x, y or z), "vehicle" (stat fuel, health, ammo, speed in blocks a second or reload, of the vehicle the viewer rides; nothing on foot), "score" (objective, holder), "data" (scope "player" or "world", namespace, key: script data, where a Rules counter lives under the key "rules.counter.<name>") or "set" (only the actions set it); max is a number (default 20) or another value; show is "always", "when_set" (the default), "in_vehicle" or "driving" (with vehicle); starts_hidden. The actions show_hud, hide_hud and set_hud ({ hud, value }) change it for the event's player. Show a changing value with a HUD element, not with show_action_bar or titles. Templates ${list(CONTROLS_PROMPT_TEMPLATES)}. Tell the user plainly: a new key bind, HUD element or vehicle needs a game restart (values, events and rules reload); vehicles carry players only, never run on rails, keep vanilla's camera apart from camera.distance, and hoppers do not reach their storage: call note_missing_feature when asked for those.`;

export const SCRIPT_API_15 = `- Script API 1.5 adds, for key binds, the HUD and vehicles: player.showHud(id), player.hideHud(id) and player.setHud(id, value) (a number or a text); Entity.vehicle, Entity.passengers, Entity.isVehicle and Entity.asVehicle(), which gives a Vehicle (an Entity) with fuel and setFuel, damageTaken and setDamageTaken (not damage, which is the Entity.damage method), ammo(weapon) and setAmmo, and driver. New events: key.pressed, key.released, vehicle.mounted, vehicle.dismounted, vehicle.fired and vehicle.destroyed. The runtime's vehicle keys (fire, second fire, horn, descend) are not reported to scripts; prefer a vehicle weapon or a key bind's events to a script. Read the script API tool for exact signatures.`;
