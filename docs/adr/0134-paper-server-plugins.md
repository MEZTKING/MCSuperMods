# ADR 0134: Paper server plugins

Drafted by the orchestrator (Fable) on 2026-11-23 in its plan; filed by the main session. The plan holds the briefs.

**ADR 0134: Paper server plugins** (Proposed; the defaults are vetoable)

- *Context.* MSM exports for Fabric and as vanilla packs. The community's game modes run on Paper servers for players without mods; a data pack carries most of a game there but cannot keep a player out for a real time, protect blocks, show clicked menus, make a world per match or add commands. The user asked (2026-11-23) to add the loaders that are needed for what Fabric cannot do, slowly; the ROADMAP puts Paper first.
- *D1.* Paper is a second host of a target: `Target.paper?: PaperFacts` beside `Target.fabric` (plugin API 1.28.0).
- *D2.* The export is one self-contained plugin jar per mod, built by pure TypeScript from a prebuilt Paper runtime, the mod's data pack and a written `paper-plugin.yml`.
- *D3.* The Paper runtime (`engine-paper/`) uses Paper's published API only.
- *D4.* A mod with Fabric-only things is refused for Paper with the list; nothing is trimmed silently.
- *D5.* The Paper runtime carries the pack and the mod's commands first, the games extras second, Rules later.
- *D6.* It is tested headless in CI by a Gradle build and `tools/run-paper-server`, on the same parity checks as the vanilla data pack.
- *D7.* Play my game on Paper is the local server of ADR 0133 with the kind `paper`, joined by the Plain instance.
- *D8.* Paper and its descendants; not Spigot, not Folia.
- *D9.* Paper is fetched from PaperMC's own service on the user's machine and in CI, never bundled; the runtime is MSM's own MIT code; exported jars carry the notices.
- *Consequences.* A second runtime to keep in step with the first, kept small by D3 and D5. A new download source. The coverage audit gains a column. The seam in `packages/targets` and the exporter list is the one NeoForge will use.
- *Status.* Proposed; the spike's answers P1 to P18 join it before it is accepted.
