# packages/plugins — Built-in plugins

Phase 1 adds `@msm/plugin-resourcepack` (vanilla model, block and item definition, lang, sounds and `pack.mcmeta` kinds, with golden lowering tests); the others follow in Phases 2–6.

## Purpose

Built-in plugins contribute element kinds, editors, lowering and commands. Each subfolder is its own npm package `@msm/plugin-<name>` and uses exactly the same public API as a third-party plugin.

## Contents (planned)

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

Layout per plugin: `src/index.ts` (`definePlugin`), `src/kinds/`, `src/editors/`, `src/lowering/`, `test/`.

## Conventions

- Each plugin imports only `@msm/plugin-api` and `@msm/schemas`. Tests may also import `@msm/targets` (Biome forbids it in `src/`; ADR 0013).
- Vanilla kinds get no custom editor unless a Studio view is justified; the mcdoc-driven form is the default.
- Lowering functions are pure (`lower(element, target) -> OutputFile[]`) and golden-tested per target.
- Create a new plugin with `tools/new-plugin`, never by hand.

## Do / Don't

- Do prefer mcdoc-driven forms over hand-built UI.
- Do ask the target for pack formats, registry ids and other version facts.
- Don't reach into `core` internals.
- Don't hardcode `pack_format` numbers or registry ids.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands (planned)

Not yet wired (Phase 0).

- `pnpm --filter @msm/plugin-<name> test`
- `pnpm --filter @msm/plugin-<name> build`
- `tools/new-plugin <name>` (scaffold)

## Read next

- [DESIGN §7 Plugin System](../../docs/DESIGN.md#7-plugin-system)
- [DESIGN §8 Editors and UX](../../docs/DESIGN.md#8-editors-and-ux)
- [DESIGN §11 Behaviour Model (Components and Events)](../../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [ROADMAP, Phases 1–6](../../docs/ROADMAP.md)
