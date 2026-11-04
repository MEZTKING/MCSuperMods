# ADR 0002: Hybrid architecture: vanilla packs, a generic runtime mod and one-way eject

## Context

MSM must take users from a texture pack to animated custom mobs. Vanilla resource and data packs cover a large and growing share of content, need no mod loader and survive version updates well. Custom blocks, items and entities with behaviour cannot be expressed in packs. Generating bespoke Java per project (the MCreator model) ties every project to generated code and to one loader version.

## Decision

We use a hybrid architecture, described in [Architecture Overview](../DESIGN.md#3-architecture-overview):

- Everything vanilla can express is exported as plain resource and data packs.
- Everything beyond that is described as data under `msm/` and interpreted by one generic Fabric runtime mod, `msm_runtime`, which is nested inside each exported content jar ([Engine Mod](../DESIGN.md#10-engine-mod-runtime)).
- Behaviour is expressed as components and events ([Behaviour Model](../DESIGN.md#11-behaviour-model-components-and-events)), with TypeScript scripts (Tier 1) and a one-way eject to a standalone Fabric Java project (Tier 2) as escape hatches ([Scripting and Escape Hatches](../DESIGN.md#12-scripting-and-escape-hatches)).
- Every element lowers to files: `lower(element, target) -> OutputFile[]`.

## Consequences

- Pack-only projects need no mod at all; mod projects share one tested runtime instead of per-project generated code.
- The runtime mod must handle the registry freeze; Phase 4 opens with a spike to prove dynamic registration from `msm/` ([Risks](../DESIGN.md#17-risks-and-mitigations), risk 3).
- Eject is one-way: an ejected Java project is no longer edited through MSM.

## Status

Accepted (2026-11-03, recorded 2026-11-04).
