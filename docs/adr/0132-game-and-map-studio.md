# ADR 0132: The Game and map Studio, game types and the kinds behind them

Drafted by the orchestrator (Fable) on 2026-11-23 in its plan; filed by the main session. The plan holds the briefs.

**ADR 0132: The Game and map Studio, game types and the kinds behind them** (Proposed)

- *Context.* The games kinds (ADRs 0113 to 0117) are loose pieces: nothing holds a whole game, a flow's answers are lost once it is made, round logic is hand-written per flow, Rules need the jar, and Try it has one player. The user asked for a place to make the game modes the community plays, with timers, command blocks, maps, stories, modpacks and a redstone showroom, and approved the mock-up of 2026-11-23.
- *D1 (the user's choice).* One hub, the **Game and map Studio**, reached from Home's row **Games and maps**, the More menu's **Make a game or map…**, the palette, search and a game's row in the element list. Tabs: Game, Teams and players, Timers and scores, Areas, Command blocks, Map, Story, Lobby, Test and share. Its front page is a catalogue of 18 game types under community genre names, each a working game to start from, each marked "Plays without mods" or "Needs MSM's mod".
- *D2.* A game is one element of the new kind `msm:game`: type, round, lobby, roles and mechanics. It lowers to data pack files only. One per mod until batch 3.
- *D3.* A type is a set of mechanics with defaults; a mechanic is one lowering file, one validator and one Studio section. The catalogue is the library's starters carrying `ProjectStarter.game` (plugin API 1.27.0).
- *D4.* `msm:kit` is a kind; `msm:story` (batch 2) lowers to advancements, reward functions and dialogs.
- *D5.* Data pack first: a type marked "Plays without mods" passes its parity tests as a vanilla data pack on both targets. The mark is computed from the project, never typed. The mod's better forms and Paper's (ADR 0134) are named in the Studio.
- *D6.* Try it gains practice players and round scripts; the Game tab's live view plays a round on the real lowered files (amends ADR 0117 limit M14). Every mechanic has something drawn.
- *D7.* Command blocks are built and edited (a command builder in plain words, the blocks inside buildings, chains), and run in Try it as functions; functions are recommended.
- *D8.* The map maker is one checklist over what exists (ADR 0116). The Modpack Studio is the Modpacks dialog as a view with a Home row; modpacks stay files (ADR 0046). The redstone showroom follows a signal engine in `@msm/sim` and comes last.
- *D9.* No server's name, branding, map or art is used; genre names only.
- *Consequences.* Three new kinds (`msm:game`, `msm:kit`, later `msm:story`) with Studios and live views; the audits grow; the renderer gains a lazy hub chunk; game flows written as function text (Arena game, Race) can later be re-made as types. Rules gain a death trigger and health steps. The spike's answers K1 to K21 and the limits join this ADR at the close of batch 1.
- *Status.* Proposed. D1 and D9 are the user's; D2 to D8 are vetoable defaults.

**Spike answers (B720, 2026-11-23):** all four batch 1 types play as a plain data pack on both targets; see `docs/PLAN-game-studio.md` "B720's answers" and `docs/reference/spikes/b720/README.md`. D5 gains the 26.x data pack forms; Hide and seek is "Plays without mods" in a simpler form (D1 mark follows the evidence); limits: "kept out" is server running time, adventure mode does not stop thrown things, displays cannot ride players, movement freezes and cross-dimension compasses are in-game checks.

Finding (B723, 2026-11-23): data forms are 26.x forms: an advancement's `entity` condition is one loot condition, and an entity predicate is a sub-predicate map. The victim's `entity_killed_player` condition is unmeasured: the spike's `killing_entity` is not a field, so `kill_pair` needs a server check of the `entity` form with a mob killer, or the killer's advancement plus the death scores. B722: `msm:game` and `msm:kit` are `::msm::games::Game` and `::msm::games::Kit` with the dispatchers `msm:game_win` and `msm:game_mechanic`; the fall-out mechanic's field is `action`, not `then`.
