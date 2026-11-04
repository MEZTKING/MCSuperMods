# packages/plugins — Built-in plugins

Phase 2 code complete: `@msm/plugin-resourcepack` (model, block definition, item definition, lang, sounds and dual-layer `pack.mcmeta`) and `@msm/plugin-datapack` (plugin id `msm.datapack`: recipe, loot table, advancement, predicate, item modifier, function, eight `minecraft:tag/<registry>` kinds, and ten schema-form kinds such as enchantment and dialog; ADR 0015), each with its element templates (14 and 52), and `@msm/plugin-library` (plugin id `msm.library`: 11 project starters, 56 examples, placeholder PNGs; no kinds; ADR 0020). Phase 3: `@msm/plugin-structures` (5 kinds, `.nbt`/`.schem` I/O, 9 templates) and `@msm/plugin-worldgen` (14 kinds, 21 templates; ADR 0021, 0022). Element ids are unique across kinds, so chained worldgen elements need distinct ids (`x` and `x_placed`). All declare `apiVersion: '^0.5.0'`. The others follow in Phases 4–6.

## Purpose

Built-in plugins contribute element kinds, lowering, commands and library content (templates, starters, examples); editors, Studio views and the pickers live in the app. Each subfolder is its own npm package `@msm/plugin-<name>` and uses exactly the same public API as a third-party plugin.

## Contents

| Subfolder | Package | Phase |
|---|---|---|
| `resourcepack/` | `@msm/plugin-resourcepack` | 1 |
| `datapack/` | `@msm/plugin-datapack` | 2 |
| `library/` | `@msm/plugin-library` | 2 add-on |
| `structures/` | `@msm/plugin-structures` | 3 |
| `worldgen/` | `@msm/plugin-worldgen` | 3 |
| `blocks-items/` | `@msm/plugin-blocks-items` | 4 |
| `entities/` | `@msm/plugin-entities` | 5 |
| `models-anim/` | `@msm/plugin-models-anim` | 5 |
| `scripting/` | `@msm/plugin-scripting` | 6 |

Layout per plugin (from `tools/new-plugin`): `src/index.ts` (`definePlugin`, `apiVersion: '^0.5.0'`), `src/kinds/`, `src/lowering/`, `src/templates/` (one module per category), `test/plugin.test.ts`, goldens under `test/fixtures/<target id>/expected/<kind folder>/`.

## Conventions

- Each plugin imports only `@msm/plugin-api` and `@msm/schemas`. Tests may also import `@msm/targets` (Biome forbids it, `@msm/target-*` and `@msm/core` in `src/`; ADR 0013).
- Kinds set `defaultData`, `hiddenPaths` and `previewKind`; outputs set `OutputFile.schema` for the validation gate (ADR 0009).
- Vanilla kinds get no custom editor unless a Studio view is justified; the mcdoc-driven form is the default.
- Lowering functions are pure (`lower(element, target) -> OutputFile[]`), take folder names from `target.folders.resource` or `target.folders.data` (datapack: `lowering/paths.ts`, `lowerJsonData`), and are golden-tested per target.
- Functions are stored as `{ lines }` (schema `msm:function`) and lower to `.mcfunction` with `language: 'mcfunction'` and no `schema`; tag kinds use schema `tag:<registry>` and folder `tags/<registry>`.
- Templates live in the plugin that owns the kind (`src/templates/`, `contributes.elementTemplates`), use only vanilla ids, ids derived from their own id or `<projectNamespace>:root`, and are validated per target in `test/templates.test.ts`. Starters and examples live in `library/` (self-contained bundles, PNGs only from `src/assets/png.ts`); their cross-plugin test is `packages/exporters/test/library.test.ts`, which also pins the `examples/` mirror.
- Create a new plugin with `tools/new-plugin`, never by hand.

## Do / Don't

- Do prefer mcdoc-driven forms over hand-built UI.
- Do ask the target for pack formats, registry ids and other version facts.
- Don't reach into `core` internals.
- Don't hardcode `pack_format` numbers or registry ids.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands

- `pnpm --filter @msm/plugin-<name> test`
- `node tools/new-plugin/index.ts <name>` (scaffold), then `pnpm install`

## Read next

- [DESIGN §7 Plugin System](../../docs/DESIGN.md#7-plugin-system)
- [DESIGN §8 Editors and UX](../../docs/DESIGN.md#8-editors-and-ux)
- [DESIGN §11 Behaviour Model (Components and Events)](../../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [ROADMAP, Phases 1–6](../../docs/ROADMAP.md)
