# ADR 0040: Wizards as parameterised starters

## Context

The ROADMAP's Phase 7 line "Templates and wizards (custom ore, custom sword, custom mob)" is half delivered: the Custom ore and Custom mob starters exist ([ADR 0020](0020-templates-starters-examples.md), Phases 4 and 5) and the Scripted ore starter builds on the ore. A starter today is `build({ namespace, projectName })`, so every user gets the same ruby ore and the same Ruby Golem and then renames and recolours by hand. The custom sword starter does not exist. The New project dialog (`NewProjectDialog`) lists starters, takes a folder and creates the project in one step.

## Decision

**D1. A wizard is a starter with parameters.** No new contribution point: `ProjectStarter.parameters` ([ADR 0036](0036-plugin-api-1.0-and-compatibility-policy.md) D5) describes the questions and `build(context)` reads `context.values`. The host renders a starter without parameters as today and a starter with parameters as a multi-step dialog: step 1 "Choose a starter", step 2… one step per distinct `group` in declaration order (parameters without a group share the step "Options"), the last step "Choose folder and create". Every step validates its fields (pattern, min, max, non-empty) before "Next"; "Back" keeps values. The same dialog serves `File > New Project from Starter…` and the toolbar's "New from starter…".

**D2. The three wizards.**

- **Custom ore** (existing `custom-ore.ts`): `ore_name` (string, default `Ruby`), `colour` (colour, default the ruby red used today), `drop_min`/`drop_max` (numbers 1–9, defaults 1 and 1), `tool_tier` (choice: stone, iron, diamond; default iron), `make_block` (boolean, default true: the storage block, its recipes and advancement). Ids derive from `ore_name` (`ruby_ore`, `ruby`, `ruby_block` for `Ruby`).
- **Custom sword** (new `custom-sword.ts`, category `content`, layers resourcepack and msm, requires `msm:item`, `msm:mod`, `minecraft:recipe`, `minecraft:model`, `minecraft:lang`): an `msm:item` with the sword tool component, parameters `sword_name` (default `Ruby Sword`), `colour`, `attack_damage` (number 1–20, default 7), `attack_speed` (number 0.5–4, default 1.6), `durability` (number 1–5000, default 1561), `ingredient` (choice of vanilla ingots and gems; default `minecraft:emerald`); a placeholder handheld texture and model, a shaped recipe (ingredient, ingredient, stick), a language key and the `msm:mod` element. Notes explain that the sword reaches the game in the Fabric mod jar only.
- **Custom mob** (existing `custom-mob.ts`): `mob_name` (default `Ruby Golem`), `colour`, `health` (number 1–1000, default as today), `speed` (number 0.05–1, default as today), `behaviour` (choice: peaceful, neutral, hostile; default as today), `spawn_biomes` (choice of a few vanilla biome tags; default `#minecraft:is_forest`), `egg_colours` (two colours).

Every default reproduces today's output byte for byte, so the `examples/` mirror and the library goldens do not move except for the new sword starter folder.

**D3. Scope limits.** Parameters are flat (no lists), validated by the host from their declaration, and never reference project content. Wizards do not run after the project exists; changing a value later is ordinary editing in the Studios.

## Consequences

- The three ROADMAP wizards ship through the plugin API, so an external plugin can ship a wizard the same way.
- The New project dialog grows a step model; e2e covers one wizard end to end.
- The library test builds every starter with its defaults and, for starters with parameters, once more with every parameter at its minimum or an alternative choice, and expects zero problems both times.

## Status

**Accepted (2026-11-06, shipped in 0.7.0).** Implemented by B156 (the multi-step New project dialog, Custom ore, Custom mob and Custom sword parameters) and wired by B160 (target choice, `session.newProject({ starterId, targetId, values })`). Where byte-for-byte defaults and D2 differed, the defaults won: `drop_max` defaults to 2 (today's loot), the egg colours are two parameters (`egg_colour`, `egg_spot_colour`), and the sword asks for `tool_tier` instead of attack damage and speed (the MSM item derives them from the tier). ADR 0043 builds the Creator on the same starters (`creator` flag, `set` and `image` parameters).
