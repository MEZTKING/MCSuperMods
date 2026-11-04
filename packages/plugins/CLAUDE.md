# packages/plugins — Built-in plugins

Phase 1 code complete: `@msm/plugin-resourcepack` (model, block definition, item definition, lang, sounds and `pack.mcmeta` kinds, golden lowering tests per target). The others follow in Phases 2–6.

## Purpose

Built-in plugins contribute element kinds, lowering and commands (editors and Studio views live in the app). Each subfolder is its own npm package `@msm/plugin-<name>` and uses exactly the same public API as a third-party plugin.

## Contents

| Subfolder | Package | Phase |
|---|---|---|
| `resourcepack/` | `@msm/plugin-resourcepack` | 1 |
| `datapack/` | `@msm/plugin-datapack` | 2 |
| `structures/` | `@msm/plugin-structures` | 3 |
| `worldgen/` | `@msm/plugin-worldgen` | 3 |
| `blocks-items/` | `@msm/plugin-blocks-items` | 4 |
| `entities/` | `@msm/plugin-entities` | 5 |
| `models-anim/` | `@msm/plugin-models-anim` | 5 |
| `scripting/` | `@msm/plugin-scripting` | 6 |

Layout per plugin (from `tools/new-plugin`): `src/index.ts` (`definePlugin`, `apiVersion: '^0.2.0'`), `src/kinds/`, `src/lowering/`, `test/plugin.test.ts`, goldens under `test/fixtures/<target id>/expected/<kind folder>/`.

## Conventions

- Each plugin imports only `@msm/plugin-api` and `@msm/schemas`. Tests may also import `@msm/targets` (Biome forbids it, `@msm/target-*` and `@msm/core` in `src/`; ADR 0013).
- Kinds set `defaultData`, `hiddenPaths` and `previewKind`; outputs set `OutputFile.schema` for the validation gate (ADR 0009).
- Vanilla kinds get no custom editor unless a Studio view is justified; the mcdoc-driven form is the default.
- Lowering functions are pure (`lower(element, target) -> OutputFile[]`), take folder names from `target.folders.resource`, and are golden-tested per target.
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
