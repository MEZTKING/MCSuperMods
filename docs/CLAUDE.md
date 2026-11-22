# docs/ — design docs, roadmap, devlog, ADRs

Active since Phase 0; Phases 2 to 4 code complete, awaiting the in-game checks; launcher and templates and samples library add-ons done; Phase 3 (Structures & Worldgen) delivered as briefs B70–B83 (ADRs 0001–0023, all accepted; B84 in reserve); Phase 4 (Engine Mod + Blocks/Items) code complete, awaiting the in-game check (B90–B102; ADRs 0024–0027 accepted); Phase 5 (Entities, Models, Animation) code complete, awaiting the in-game check (B110–B122; ADRs 0028–0030 accepted); Phase 6 (Scripting & Eject) code complete, awaiting the in-game check (B130–B141; ADRs 0031–0034 accepted, ADR 0003 partly superseded by ADR 0031; B142–B144 in reserve); Phase 7 (1.0) code complete (B150–B162; ADRs 0035–0040 accepted; plan closed, follow-ups in ROADMAP), 1.0.0 released 2026-11-06; 1.1.0 (modpacks and ADRs 0046–0047), 1.2.0 (ADR 0048: pictures, screenshots and skins), 1.3.0 (ADRs 0049, 0050: song files, passthrough check, tool numbers, body defence) and 1.4.0 (ADRs 0055, 0056: custom status effects and throwables) are superseded by the 1.5.1 draft (built 2026-11-14 for the user's Windows test; it holds everything since 1.0.0, every batch below included); the runtime fixes batch (ADRs 0057–0059), the vanilla additions batch (ADRs 0060–0062) and the potions, data kinds and Script API 1.1 batch (ADRs 0063–0065) are done (accepted 2026-11-14, unreleased, awaiting the in-game checks); ADR 0066 (vanilla pack safety), the block types, crops, saplings and trees batch (ADRs 0067–0069) and the mob expansion (ADRs 0070–0073: mob bases, movement, ranged attacks, taming, breeding, riding, variants, boss bars, the built-in vanilla renderer, six mob flows), the containers and machines batch (ADRs 0074–0076: `msm:container`, `msm:machine`, one recipe type per machine, vanilla menus only, the Inventory section, Storage crate and Machine flows, Script API 1.2) and the custom portal blocks batch (ADRs 0077–0078: the `portal` block type, the `light_portal` action, our own level index, travel and exits, the Portal section and flow, `fixtures/sample-portals`) and the custom particles batch (ADRs 0080–0081: `msm:particle`, options objects, `motion` and `force`, `msm:ambient_particles`, the Particle Studio and flow, Script API 1.3, the headless client GameTest route, `fixtures/sample-particles`) are accepted (2026-11-14, unreleased, awaiting the in-game checks; plans deleted, findings in the ADRs); ADR 0079 (vendored target data compacted in the asar) accepted; Rules, Very easy mode and one-click Play (ADRs 0082–0084: `msm:rules` and project expanders, the Rule book Studio, Very easy mode, Play and Reload with the runtime's dev mode, Script API 1.4, plugin API 1.15.0, `fixtures/sample-rules`) accepted with findings at close (B384, 2026-11-14; plan deleted); Vehicles and the client side (ADRs 0088–0091: `msm:key_bind`, `msm:hud`, `msm:vehicle`, the runtime channel, Script API 1.5) accepted with findings at close (B432, 2026-11-15; plan deleted, fact table and limits in ADR 0090; unreleased, awaiting the in-game checks); vanilla parity 2 batch 1 (ADRs 0094–0097: the twenty block types, waterlogging, weathering, bags and bundles, commands, creative tabs, the first Mixins, Script API 1.6, vanilla's feature order; ADR 0101 for batch 1) accepted with findings at close (B468, 2026-11-15; unreleased, awaiting the in-game checks); vanilla parity 2 batch 2 (ADRs 0098–0100: traders, village jobs, mount storage, perching shoulder pets, fluids with the 26.4 entity Mixin, the Dimension Type Studio; ADR 0101 now in full, with the fact table F1–F36 and limits Q1–Q31) accepted with findings at close (B485, 2026-11-21; plan deleted; unreleased, awaiting the in-game checks); Try it (ADRs 0085 and 0087: the in-app preview over `@msm/sim`, its grounds, scripts in a worker, logic rule steps) and Surprise me (ADR 0086) accepted with findings at close B403 (2026-11-21; plan deleted, fact table T1–T16 and limits L1–L24 in ADR 0085; slices 1 and 2 in 1.5.1, the rest in the 1.5.2 draft built from 67cfedc for the user's test); ADR 0102 (world backups, rename warnings) accepted; Minecraft-style art (ADR 0092 option B: the generator with 80 recipes, the Draw dialog, Draw a skin, the drawn flows, AI helper and Try it terrain, guide page `pictures.md`; ADR 0093 D4 amended) accepted with findings at close (B502, 2026-11-22; plan deleted, fact table A1–A16 and limits A1–A8 in ADR 0092; unreleased, awaiting the user's look); the vanilla parity 3 plan (`PLAN-vanilla-parity-3.md`, B503–B546, ADRs 0103–0112 Proposed, 2026-11-22) is open; add-ons released as v0.7.0 (2026-11-06): AI helper, armour and custom tool materials, gear, weapons and consumables, the Creator, undoable asset writes (ADRs 0041–0045 accepted; their plans closed into DESIGN, ROADMAP and the ADRs); user guide in `guide/`, built as a site by `site/` (VitePress, ADR 0039). This file describes conventions.

## Purpose

Holds the project's design record: the authoritative design, the delivery plan, the session log and architecture decision records (ADRs).

## Contents

- `DESIGN.md`: the authoritative design document. Everything else links here.
- `ROADMAP.md`: phased plan with checklists and the milestone log. A phase's working plan may live in `PHASE<n>-PLAN.md` while the phase runs; it is deleted at phase close (history goes to `DEVLOG.md`).
- `DEVLOG.md`: append-only session log, newest entry at the bottom.
- `HANDOFF.md`: where the project stands and how the work is run, for the next main session; rewritten (not appended) at each handover.
- `adr/NNNN-title.md`: one file per architecture decision, sections Context / Decision / Consequences / Status.
- `guide/`: the user guide (`README.md` index, `first-mod.md`, `getting-started.md`, `structures.md`, `worldgen.md`, `templates-and-examples.md`, `blocks-and-items.md`, `block-types-and-plants.md`, `commands-and-tabs.md`, `containers-and-machines.md`, `portals.md`, `particles.md`, `pictures.md`, `villagers-and-traders.md`, `fluids.md`, `vehicles.md`, `keys-and-hud.md`, `rules.md`, `very-easy.md`, `playing-and-testing.md`, `creator.md`, `entities-and-models.md`, `mob-behaviours.md`, `scripting.md`, `eject.md`, `ai-helper.md`, `modpacks.md`, `effects-and-throwables.md`, `potions.md`, `adding-to-vanilla.md`, `plugins.md`, `targets.md`; each page also needs a sidebar entry in `site/.vitepress/config.ts`); task-oriented, matches shipped UI labels.

## Conventions

- DESIGN.md section headings 1–19 are frozen: never renumber or rename them; add new sections at the end.
- British English spelling; no emojis; present tense.
- State decisions as decisions ("We use X because Y"), not as options.
- Link, don't duplicate: point to `DESIGN.md#<anchor>` instead of restating content.
- Unverified version numbers are written with "(verify at implementation)".
- ADR numbers are sequential and never reused; superseded ADRs keep their file and change Status.
- Every session appends a DEVLOG entry: `## YYYY-MM-DD — <agent> — <topic>` then What / Decisions / Next.

## Do / Don't

- Do update DESIGN.md (and ROADMAP.md if scope moves) when an ADR is accepted.
- Do tick ROADMAP checkboxes and add a Milestone Log row when a phase milestone lands.
- Don't put version numbers in DESIGN.md without "(verify at implementation)" unless verified.
- Don't put tutorials in DESIGN or ADRs; they belong in `guide/`. Update the guide when a UI label, menu entry or template list changes.
- Don't edit past DEVLOG entries; correct them in a new entry.

## Commands

None. Docs are plain Markdown and not linted. Before finishing, check by hand: 19 H2 headings in DESIGN.md, every `DESIGN.md#<anchor>` link resolves, no emojis, root CLAUDE.md at most 70 lines and scoped ones at most 55.

## Read next

- [Goals and Non-Goals](DESIGN.md#1-goals-and-non-goals)
- [Open Questions](DESIGN.md#18-open-questions)
- [ROADMAP.md](ROADMAP.md), current phase
