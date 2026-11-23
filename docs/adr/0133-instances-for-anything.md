# ADR 0133: Instances for anything

Drafted by the orchestrator (Fable) on 2026-11-23 in its plan; filed by the main session. The plan holds the briefs.

**ADR 0133: Instances and servers made from run recipes** (Proposed; the defaults are vetoable)

- *Context.* MSM makes one kind of instance: the Fabric test instance, in Prism only, one per Minecraft version, shared by Play, Test in Minecraft and modpack tests (ADRs 0026 and 0084). There is no instance without mods, none per modpack or map, nothing for MultiMC or CurseForge, and no local server. The user asked (2026-11-23) that MSM offer to make whatever instance is needed to run whatever is being made.
- *D1.* Every play, test or open action is described by a run recipe (purpose, owner, Minecraft version, loader, mods, packs, world, what to join), made by pure code in `@msm/interop`.
- *D2.* Managed instances are made per purpose from recipes: the existing test instance unchanged, a Plain instance without a loader, one instance per modpack, and one per further loader when its plan exists. The marker gains a second version.
- *D3.* MSM offers before it makes: a card says what will be made; the first time for each kind by default, then by itself.
- *D4.* Prism first, MultiMC and PolyMC by the same writer, CurseForge by its app's own import, the official launcher install-only.
- *D5.* MSM writes only inside folders that hold its marker and files it recorded; removal is by the user, into the recycle bin; tests prove foreign folders are untouched.
- *D6.* Games and maps that play without mods can be opened in the Plain instance on a world copied by the map export's code.
- *D7.* A local Fabric server under `<msmHome>/servers/`, started and stopped in sight, joined through the launcher; dev mode stays off on it.
- *D8.* The user accepts Minecraft's EULA for a server by their own tick; MSM never does it for them.
- *D9.* Java is found among what the launchers have; none is bundled or downloaded.
- *D10.* Downloads only from the Fabric Maven, Fabric's meta service and Modrinth; Mojang's files are fetched by the launcher and by Fabric's server launcher on the user's machine and never bundled.
- *Consequences.* Play's safety rule (ADR 0084 D9) now covers several marked folders. The recipe's loader and server kind are the seams a Paper server (ADR 0134) and a NeoForge instance plug into. Main gains a long-lived child process to look after.
- *Status.* Proposed.

**Spike answers (B760, 2026-11-23):** see `docs/PLAN-instances.md` "B760's answers" and `docs/reference/spikes/b760/README.md`; D2, D4, D6, D7, D9 to D11 amended there.
