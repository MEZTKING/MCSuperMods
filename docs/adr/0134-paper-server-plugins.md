# ADR 0134: Paper server plugins

Drafted by the orchestrator (Fable) on 2026-11-23 in its plan; filed by the main session. The plan holds the briefs.

**ADR 0134: Paper server plugins** (Proposed; the defaults are vetoable)

- *Context.* MSM exports for Fabric and as vanilla packs. The community's game modes run on Paper servers for players without mods; a data pack carries most of a game there but cannot keep a player out for a real time, protect blocks, show clicked menus, make a world per match or add commands. The user asked (2026-11-23) to add the loaders that are needed for what Fabric cannot do, slowly; the ROADMAP puts Paper first.
- *D1.* Paper is a second host of a target: `Target.paper?: PaperFacts` beside `Target.fabric` (plugin API 1.28.0). Measured: mc-26.3 `api` `26.3.build.259-stable`, `apiVersion` `'26.3'`, `minBuild` 259 (newest STABLE), Java 25; PaperMC builds no snapshots, so mc-26.4 has no Paper facts; Paper supports only the newest version.
- *D2.* The export is one self-contained plugin jar per mod, built by pure TypeScript from a prebuilt Paper runtime, the mod's data pack and a written `paper-plugin.yml`. Go (B780 P6): two jars with the same classes are kept apart. The plugin `name` is the mod id; the pack and every command a function names are registered in the bootstrapper only; no stray directories in the jar; command labels are the mod's own (a plain label shared by two plugins goes silently to the later one; `<mod id>:<label>` always works).
- *D3.* The Paper runtime (`engine-paper/`) uses Paper's published API only.
- *D4.* A mod with Fabric-only things is refused for Paper with the list; nothing is trimmed silently.
- *D5.* The Paper runtime carries the pack and the mod's commands first, the games extras second, Rules later.
- *D6.* It is tested headless in CI by a Gradle build and `tools/run-paper-server`, on the same parity checks as the vanilla data pack. Route chosen (B780 P7): a real Paper server with headless Node stand-in players, packet ids read at run time from the server's own report and never committed; MockBukkit for event logic only; about 6 CI minutes a run.
- *D7.* Play my game on Paper is the local server of ADR 0133 with the kind `paper`, joined by the Plain instance.
- *D8.* Paper and its descendants; not Spigot, not Folia. A Bukkit `plugin.yml` plugin cannot register a pack from its jar or a command a function names (P16), and a world per match uses what Folia replaces (P14).
- *D9.* Paper is fetched from PaperMC's own service on the user's machine and in CI, never bundled; the runtime is MSM's own MIT code; exported jars carry the notices. Paper is GPLv3 by inheritance and the API artefact is `compileOnly`, never shipped; the server jar is under Mojang's EULA and paperclip fetches Mojang's jar from `piston-data.mojang.com` itself; paperclip and MockBukkit are MIT; an exported jar carries MSM's MIT notice plus Rhino's MPL-2.0 if shaded (P17). Builds are pinned, never auto-updated; the cache is keyed by build SHA-256 (about 220 MB).
- *Consequences.* A second runtime to keep in step with the first, kept small by D3 and D5. A new download source. The coverage audit gains a column. The seam in `packages/targets` and the exporter list is the one NeoForge will use.
- *Status.* Proposed; the spike's answers P1 to P18 are folded in above.
- *Findings.* See `docs/reference/spikes/b780/README.md` (P1 to P18; D2 go; D4's 11 non-native argument types decided; D5 permission check on the signal command; Rules on Paper sized at one spike and two to three briefs).
